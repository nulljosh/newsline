// Exercises the worker's fetch handler end to end with an in-memory cache and a fake network.
// `node --test` runs each file in its own process, so patching the globals here is contained.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { memoryCache, fakeFetch, rssFeed, fakeEnv, fakeCtx } from './helpers.mjs';
import { FEEDS } from '../src/feeds.js';

const { default: worker, parseQuery } = await import('../worker.js');

const ORIGIN = 'https://news.test';
let cache;

const healthyNetwork = () => fakeFetch(Object.fromEntries(FEEDS.map(([outlet, , url]) =>
  [url, rssFeed(`${outlet} covers the budget vote`, `${outlet} covers the coastal quake`)])));

before(() => { globalThis.caches = { get default() { return cache; } }; });

const call = async (path, init) => {
  const ctx = fakeCtx();
  const res = await worker.fetch(new Request(ORIGIN + path, init), fakeEnv(), ctx);
  await ctx.settle();
  return res;
};

const fresh = (network = healthyNetwork()) => { cache = memoryCache(); globalThis.fetch = network; return network; };

test('parseQuery whitelists and clamps', () => {
  const q = s => parseQuery(new URL(ORIGIN + '/api/stories' + s));
  assert.equal(q('?view=nonsense').view, 'both', 'an unknown view falls back to the default');
  assert.equal(q('?view=latest').view, 'latest');
  assert.equal(q('?bias=purple').bias, undefined);
  assert.equal(q('?bias=left').bias, 'left');
  assert.equal(q('?limit=999').limit, 200, 'limit is clamped');
  assert.equal(q('?limit=-4').limit, undefined);
  assert.equal(q('?limit=abc').limit, undefined);
  assert.equal(q('?blindspot=true').blindspot, true);
  assert.equal(q('?blindspot=1').blindspot, true);
  assert.equal(q('?blindspot=yes').blindspot, false);
  assert.equal(q('?developing=true').developing, true);
  assert.equal(q('?compare=true').compare, true);
});

test('GET /api/stories returns both views with CORS and no-store', async () => {
  fresh();
  const res = await call('/api/stories');
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('access-control-allow-origin'), '*');
  assert.equal(res.headers.get('cache-control'), 'no-store');
  const body = await res.json();
  assert.ok(body.latest.length && body.stories.length);
  assert.ok(body.updated > 0);
});

test('/api/stories carries a health summary so clients can tell quiet from broken', async () => {
  fresh();
  const body = await (await call('/api/stories')).json();
  assert.equal(body.health.total, FEEDS.length);
  assert.equal(body.health.healthy, FEEDS.length);
  assert.equal(body.health.degraded, false);
  assert.ok(!('down' in body.health));
});

test('/api/stories names the feeds that are down', async () => {
  const network = healthyNetwork();
  fresh(fakeFetch(Object.fromEntries(FEEDS.map(([outlet, , url], i) =>
    [url, i < 2 ? { status: 500 } : rssFeed(`${outlet} headline about the vote`)]))));
  void network;
  const body = await (await call('/api/stories')).json();
  assert.equal(body.health.healthy, FEEDS.length - 2);
  assert.deepEqual(body.health.down, FEEDS.slice(0, 2).map(f => f[0]));
  assert.equal(body.health.degraded, false, 'two down out of sixteen is not degraded');
});

test('query params filter the response', async () => {
  fresh();
  const outlet = FEEDS[0][0];
  const body = await (await call(`/api/stories?view=latest&outlet=${encodeURIComponent(outlet)}`)).json();
  assert.ok(!('stories' in body));
  assert.ok(body.latest.every(x => x.outlet === outlet));
});

test('/api/health reports every feed and 503s when degraded', async () => {
  fresh();
  const good = await call('/api/health');
  assert.equal(good.status, 200);
  const body = await good.json();
  assert.equal(body.feeds.length, FEEDS.length);
  assert.ok(body.version);

  fresh(fakeFetch({}));
  const bad = await call('/api/health');
  assert.equal(bad.status, 503, 'a monitor should see a non-200 when half the feeds are gone');
  assert.equal((await bad.json()).degraded, true);
});

test('/api/sources lists the feed roster with derived counts', async () => {
  fresh();
  const body = await (await call('/api/sources')).json();
  assert.equal(body.count, FEEDS.length);
  assert.equal(body.sources.length, FEEDS.length);
  assert.ok(body.sources.every(s => ['left', 'center', 'right'].includes(s.side)));
  const opinion = body.sources.find(s => s.outlet === 'New York Post Opinion');
  assert.equal(opinion.publisher, 'NY Post');
});

test('a write method to /api gets 405 with an Allow header', async () => {
  fresh();
  const res = await call('/api/stories', { method: 'POST' });
  assert.equal(res.status, 405);
  assert.equal(res.headers.get('allow'), 'GET, HEAD, OPTIONS');
  assert.match((await res.json()).error, /POST not allowed/);
});

test('OPTIONS to /api preflights', async () => {
  fresh();
  const res = await call('/api/stories', { method: 'OPTIONS' });
  assert.equal(res.status, 204);
  assert.equal(res.headers.get('access-control-allow-methods'), 'GET, POST, OPTIONS');
});

test('an unknown /api path returns JSON, not the HTML asset handler', async () => {
  fresh();
  const res = await call('/api/stroies');
  assert.equal(res.status, 404);
  const body = await res.json();
  assert.match(body.error, /Unknown endpoint/);
  assert.ok(body.endpoints.includes('/api/stories'));
});

test('non-API paths fall through to static assets', async () => {
  fresh();
  const res = await call('/reader.html');
  assert.equal(await res.text(), 'asset:/reader.html');
});

test('security.txt is served from the worker', async () => {
  fresh();
  const res = await call('/.well-known/security.txt');
  assert.match(res.headers.get('content-type'), /text\/plain/);
  assert.match(await res.text(), /^Contact: mailto:/m);
});

test('a thrown error becomes a JSON 500 with CORS, not a Workers error page', async () => {
  fresh();
  const ctx = fakeCtx();
  const broken = { ASSETS: { fetch() { throw new Error('kaboom'); } } };
  const res = await worker.fetch(new Request(ORIGIN + '/api/stories'), broken, ctx);
  assert.equal(res.status, 200, 'the API path does not touch ASSETS');

  // Force the failure on a path that does.
  const htmlRes = await worker.fetch(new Request(ORIGIN + '/index.html'), broken, ctx);
  assert.equal(htmlRes.status, 500);
  assert.match(await htmlRes.text(), /Something went wrong/);
});

test('an API failure is reported as JSON with CORS headers', async () => {
  fresh();
  globalThis.caches = { get default() { throw new Error('cache exploded'); } };
  const res = await call('/api/health');
  globalThis.caches = { get default() { return cache; } };
  assert.equal(res.status, 500);
  assert.equal(res.headers.get('access-control-allow-origin'), '*');
  assert.equal((await res.json()).error, 'Internal error');
});
