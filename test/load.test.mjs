import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadItems, mergeSeen, minHealthy, pullFeeds } from '../src/load.js';
import { memoryCache, fakeFetch, rssFeed } from './helpers.mjs';

const feeds = [
  ['Alpha', -1, 'https://alpha.test/rss'],
  ['Beta', 0, 'https://beta.test/rss'],
  ['Gamma', 2, 'https://gamma.test/rss'],
  ['Delta', 1, 'https://delta.test/rss', 'Gamma Group'],
];
const ok = url => ({ [url]: rssFeed('One headline here', 'Another headline here') });
const allGood = Object.assign({}, ...feeds.map(f => ok(f[2])));

test('pullFeeds reports every feed individually', async () => {
  const { items, health } = await pullFeeds({ feeds, fetchImpl: fakeFetch(allGood) });
  assert.equal(items.length, 8);
  assert.ok(health.every(h => h.ok && h.items === 2));
  assert.deepEqual(health.map(h => h.outlet), ['Alpha', 'Beta', 'Gamma', 'Delta']);
});

test('pullFeeds treats a non-2xx as a failure instead of parsing the error page', async () => {
  // A 403 HTML page parses to zero items and used to be indistinguishable from a quiet feed.
  const { items, health } = await pullFeeds({
    feeds,
    fetchImpl: fakeFetch({ ...allGood, 'https://beta.test/rss': { status: 403, body: '<html>Forbidden</html>' } }),
  });
  assert.equal(items.length, 6);
  const beta = health.find(h => h.outlet === 'Beta');
  assert.equal(beta.ok, false);
  assert.equal(beta.error, 'HTTP 403');
});

test('pullFeeds flags a 200 that contains no items', async () => {
  const { health } = await pullFeeds({
    feeds, fetchImpl: fakeFetch({ ...allGood, 'https://gamma.test/rss': '<rss><channel></channel></rss>' }),
  });
  assert.equal(health.find(h => h.outlet === 'Gamma').error, 'no items');
});

test('pullFeeds records a thrown network error without failing the pull', async () => {
  const boom = Object.assign({}, allGood, { 'https://delta.test/rss': new Error('connect ECONNREFUSED') });
  const { items, health } = await pullFeeds({ feeds, fetchImpl: fakeFetch(boom) });
  assert.equal(items.length, 6);
  assert.match(health.find(h => h.outlet === 'Delta').error, /ECONNREFUSED/);
});

test('pullFeeds carries the publisher override onto every item', async () => {
  const { items } = await pullFeeds({ feeds, fetchImpl: fakeFetch(allGood) });
  assert.ok(items.filter(i => i.outlet === 'Delta').every(i => i.publisher === 'Gamma Group'));
  assert.ok(items.filter(i => i.outlet === 'Alpha').every(i => i.publisher === 'Alpha'));
});

test('minHealthy is half the feed list, rounded up', () => {
  assert.equal(minHealthy(4), 2);
  assert.equal(minHealthy(16), 8);
  assert.equal(minHealthy(3), 2);
});

test('mergeSeen keeps the earliest sighting of a link', () => {
  const items = [{ link: 'a' }, { link: 'b' }];
  const seen = mergeSeen(items, { a: 100 }, 500);
  assert.equal(items[0].firstSeen, 100, 'a link we have seen before keeps its original stamp');
  assert.equal(items[1].firstSeen, 500, 'a new link is first seen now');
  assert.deepEqual(seen, { a: 100, b: 500 });
});

test('mergeSeen carries recent absent links forward but drops ancient ones', () => {
  const now = 100 * 3600 * 1000;
  const seen = mergeSeen([{ link: 'new' }], { recent: now - 3600_000, ancient: now - 72 * 3600 * 1000 }, now);
  assert.ok('recent' in seen, 'a story that briefly drops out must not look new when it returns');
  assert.ok(!('ancient' in seen));
});

// ---- loadItems: caching, degradation and the stale-if-error fallback ----

const deps = (fetchImpl, cache, now = 1_000, list = feeds) =>
  ({ cache, fetchImpl, now, feeds: list, waitUntil: () => {} });

test('loadItems pulls once and serves the pooled result afterwards', async () => {
  const cache = memoryCache();
  const fetchImpl = fakeFetch(allGood);
  const first = await loadItems('https://x.test', null, deps(fetchImpl, cache));
  assert.equal(first.degraded, false);
  assert.equal(first.stale, false);
  const calls = fetchImpl.calls.length;
  const second = await loadItems('https://x.test', null, deps(fetchImpl, cache));
  assert.equal(fetchImpl.calls.length, calls, 'the second request refetches nothing');
  assert.equal(second.items.length, first.items.length);
});

test('loadItems marks a pull degraded when most feeds are down', async () => {
  const cache = memoryCache();
  const mostlyDown = { 'https://alpha.test/rss': rssFeed('Only survivor headline') };
  const pull = await loadItems('https://x.test', null, deps(fakeFetch(mostlyDown), cache));
  assert.equal(pull.degraded, true);
  assert.equal(pull.stale, false, 'nothing good cached yet, so there is nothing to fall back to');
  assert.equal(pull.health.filter(h => !h.ok).length, 3);
});

test('a degraded pull falls back to the last good one and says so', async () => {
  const cache = memoryCache();
  const healthy = Object.fromEntries(feeds.map(([, , url]) => [url, rssFeed('Healthy headline one', 'Healthy headline two')]));
  const good = await loadItems('https://x.test', null, deps(fakeFetch(healthy), cache, 1000));
  assert.equal(good.degraded, false);
  assert.ok(good.items.length > 0);

  // Expire only the pooled entry; last-good survives, as it does in production with its longer TTL.
  cache.store.delete('https://x.test/__cache/items-v6');
  const outage = await loadItems('https://x.test', null, deps(fakeFetch({}), cache, 2000));
  assert.equal(outage.degraded, true);
  assert.equal(outage.stale, true, 'serve yesterday rather than a half-empty feed');
  assert.equal(outage.items.length, good.items.length);
  assert.equal(outage.updated, good.updated, 'the timestamp is the stale one, not now');
  assert.ok(outage.health.every(h => !h.ok), 'health still reports today, not the fallback');
});

test('a degraded pull never overwrites the last good one', async () => {
  const cache = memoryCache();
  const healthy = Object.fromEntries(feeds.map(([, , url]) => [url, rssFeed('Healthy headline one')]));
  await loadItems('https://x.test', null, deps(fakeFetch(healthy), cache, 1000));
  const lastGoodBefore = await (await cache.match('https://x.test/__cache/last-good-v6')).json();

  cache.store.delete('https://x.test/__cache/items-v6');
  await loadItems('https://x.test', null, deps(fakeFetch({}), cache, 2000));
  const lastGoodAfter = await (await cache.match('https://x.test/__cache/last-good-v6')).json();
  assert.deepEqual(lastGoodAfter.items.length, lastGoodBefore.items.length);
});

test('loadItems survives a corrupt cache entry rather than throwing', async () => {
  const cache = memoryCache();
  await cache.put('https://x.test/__cache/items-v6', new Response('{{{not json'));
  const pull = await loadItems('https://x.test', null, deps(fakeFetch(allGood), cache));
  assert.ok(Array.isArray(pull.items));
});

test('loadItems stamps firstSeen onto every item', async () => {
  const cache = memoryCache();
  const pull = await loadItems('https://x.test', null, deps(fakeFetch(allGood), cache, 4242));
  assert.ok(pull.items.length);
  assert.ok(pull.items.every(i => i.firstSeen === 4242));
});
