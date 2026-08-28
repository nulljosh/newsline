// The pooled feed pull. The bug this layer exists to prevent: a total upstream outage used to
// cache an empty result for the full TTL and report nothing wrong. These tests hold that shut.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadItems, mergeSeen, minHealthy, pullFeeds } from '../src/load.js';

const feed = (outlet, bias) => [outlet, bias, `https://feeds.example.com/${outlet}`];
const FEEDS = [feed('Alpha', -1), feed('Beta', 0), feed('Gamma', 2), feed('Delta', 1)];

const body = outlet =>
  `<rss><item><title>${outlet} covers the summit</title><link>https://e.com/${outlet}</link></item></rss>`;

/// A fetch stand-in. `plan` maps outlet name to 'ok' | 'http500' | 'empty' | 'throw' | 'hang'.
const fetcher = plan => async (url, opts) => {
  const outlet = url.split('/').pop();
  const mode = plan[outlet] || 'ok';
  if (mode === 'throw') throw new Error('connection refused');
  if (mode === 'hang') {
    // Honour the AbortSignal the caller passed so the timeout path is genuinely exercised.
    return new Promise((_, reject) =>
      opts.signal.addEventListener('abort', () => {
        const err = new Error('timed out');
        err.name = 'TimeoutError';
        reject(err);
      }));
  }
  if (mode === 'http500') return { ok: false, status: 500, text: async () => 'Server Error' };
  if (mode === 'empty') return { ok: true, status: 200, text: async () => '<rss></rss>' };
  return { ok: true, status: 200, text: async () => body(outlet) };
};

/// Minimal stand-in for the Workers Cache API, backed by a Map. `match` clones on the way out
/// because the real Cache API hands back a fresh Response every time — without that, one read
/// consumes the entry and every later read throws "Body has already been read".
const makeCache = () => {
  const store = new Map();
  return {
    store,
    async match(req) {
      const hit = store.get(req.url);
      return hit ? (typeof hit.clone === 'function' ? hit.clone() : hit) : undefined;
    },
    async put(req, res) { store.set(req.url, res); },
    async read(url) {
      const hit = store.get(url);
      return hit ? await hit.clone().json() : null;
    },
  };
};

const deps = (plan, cache, now = 1_000_000) => ({
  cache, fetchImpl: fetcher(plan), feeds: FEEDS, now, waitUntil: p => p,
});

test('minHealthy requires half the feeds, rounded up', () => {
  assert.equal(minHealthy(4), 2);
  assert.equal(minHealthy(5), 3);
  assert.equal(minHealthy(1), 1);
});

test('pullFeeds reports each feed individually', async () => {
  const { items, health } = await pullFeeds({
    fetchImpl: fetcher({ Beta: 'http500', Gamma: 'throw' }), feeds: FEEDS,
  });
  assert.equal(items.length, 2, 'only Alpha and Delta produced items');
  assert.equal(health.filter(h => h.ok).length, 2);
  assert.match(health.find(h => h.outlet === 'Beta').error, /HTTP 500/);
  assert.match(health.find(h => h.outlet === 'Gamma').error, /connection refused/);
});

test('a feed that answers 200 with no items counts as down', async () => {
  // The zombie-feed case: CNN served well-formed but frozen XML for months.
  const { health } = await pullFeeds({ fetchImpl: fetcher({ Alpha: 'empty' }), feeds: FEEDS });
  const alpha = health.find(h => h.outlet === 'Alpha');
  assert.equal(alpha.ok, false);
  assert.match(alpha.error, /no items/);
});

test('a hanging feed is aborted and reported as a timeout', async () => {
  const { health } = await pullFeeds({
    fetchImpl: fetcher({ Alpha: 'hang' }), feeds: FEEDS, timeout: 40,
  });
  assert.match(health.find(h => h.outlet === 'Alpha').error, /timeout after 40ms/);
});

test('mergeSeen keeps the original first-seen stamp across pulls', () => {
  const items = [{ link: 'https://e.com/a' }, { link: 'https://e.com/b' }];
  const seen = mergeSeen(items, { 'https://e.com/a': 500 }, 1000);
  assert.equal(items[0].firstSeen, 500, 'an item we have seen keeps its original stamp');
  assert.equal(items[1].firstSeen, 1000, 'a new item is stamped now');
  assert.equal(seen['https://e.com/a'], 500);
});

test('mergeSeen carries recent absentees forward and drops expired ones', () => {
  const now = 100 * 3600 * 1000;
  const seen = mergeSeen([], {
    'https://e.com/recent': now - 3600 * 1000,
    'https://e.com/ancient': now - 72 * 3600 * 1000,
  }, now);
  assert.ok('https://e.com/recent' in seen);
  assert.ok(!('https://e.com/ancient' in seen), 'past the 48h window');
});

test('a healthy pull returns items and caches a last-good copy', async () => {
  const cache = makeCache();
  const out = await loadItems('https://news.test', null, deps({}, cache));
  assert.equal(out.degraded, false);
  assert.equal(out.stale, false);
  assert.equal(out.items.length, 4);
  assert.ok([...cache.store.keys()].some(k => k.includes('last-good')));
});

test('a degraded pull serves the last good one and says so', async () => {
  const cache = makeCache();
  await loadItems('https://news.test', null, deps({}, cache));
  cache.store.delete('https://news.test/__cache/items-v6'); // expire the short-lived pull

  const plan = { Alpha: 'throw', Beta: 'throw', Gamma: 'throw' }; // 1 of 4 healthy
  const out = await loadItems('https://news.test', null, deps(plan, cache, 2_000_000));

  assert.equal(out.degraded, true);
  assert.equal(out.stale, true);
  assert.equal(out.items.length, 4, 'serves the previous full pull, not the crippled one');
  assert.equal(out.health.filter(h => h.ok).length, 1, 'but reports today real health');
});

test('a degraded pull never overwrites the last-good copy', async () => {
  const cache = makeCache();
  await loadItems('https://news.test', null, deps({}, cache));
  const before = await cache.read('https://news.test/__cache/last-good-v6');
  cache.store.delete('https://news.test/__cache/items-v6');

  await loadItems('https://news.test', null,
    deps({ Alpha: 'throw', Beta: 'throw', Gamma: 'throw' }, cache, 2_000_000));

  const after = await cache.read('https://news.test/__cache/last-good-v6');
  assert.deepEqual(after.items, before.items, 'the good fallback must survive a bad pull');
});

test('a total outage with no fallback reports degraded rather than a silent empty feed', async () => {
  const plan = Object.fromEntries(FEEDS.map(([o]) => [o, 'throw']));
  const out = await loadItems('https://news.test', null, deps(plan, makeCache()));
  assert.equal(out.degraded, true);
  assert.equal(out.stale, false, 'nothing to fall back to');
  assert.equal(out.items.length, 0);
  assert.equal(out.health.every(h => !h.ok), true);
});

test('a cached pull is reused without refetching', async () => {
  const cache = makeCache();
  await loadItems('https://news.test', null, deps({}, cache));
  let calls = 0;
  const counting = { ...deps({}, cache), fetchImpl: async (...a) => { calls++; return fetcher({})(...a); } };
  await loadItems('https://news.test', null, counting);
  assert.equal(calls, 0);
});

test('a corrupt cache entry falls through to a live pull', async () => {
  const cache = makeCache();
  cache.store.set('https://news.test/__cache/items-v6', { json: async () => { throw new Error('bad json'); } });
  const out = await loadItems('https://news.test', null, deps({}, cache));
  assert.equal(out.items.length, 4);
});

test('loadItems works with no cache at all', async () => {
  // `caches` does not exist outside the Workers runtime; that must not be fatal.
  const out = await loadItems('https://news.test', null, { ...deps({}, null), cache: null });
  assert.equal(out.items.length, 4);
  assert.equal(out.degraded, false);
});
