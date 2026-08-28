// One pooled pull of every feed, shared by the page, the API and MCP.
//
// The old version dropped failures on the floor: no `r.ok` check, rejected feeds silently
// flatMapped to [], and the resulting `{items: []}` was written to the cache — so a total
// upstream outage served an empty feed for the full TTL and told nobody. Every one of those
// is fixed here: feeds report status, a degraded pull falls back to the last good one, and a
// degraded pull is never allowed to overwrite it.

import { FEEDS } from './feeds.js';
import { parseItems } from './parse.js';

export const VERSION = '0.4.0';
export const CACHE_VERSION = 'v6';

const FEED_TIMEOUT_MS = 8000;
const FEED_TTL_S = 120;            // how long one pooled pull is reused
const RETRY_TTL_S = 20;            // a degraded pull with no fallback: retry soon, not in 2 min
const LAST_GOOD_TTL_S = 3600;      // how long a healthy pull stays available as a fallback
const SEEN_TTL_MS = 48 * 3600 * 1000;
const SEEN_MAX = 4000;             // bound the first-seen map so the cache entry can't grow forever

/// A pull is "degraded" when fewer than half the feeds answered. Below that the flat feed is
/// visibly missing whole sides of the spectrum, which is worse than serving something stale.
export const minHealthy = (total = FEEDS.length) => Math.ceil(total / 2);

/// Fetch every feed in parallel and report on each one individually.
export async function pullFeeds({ fetchImpl = fetch, feeds = FEEDS, timeout = FEED_TIMEOUT_MS } = {}) {
  const settled = await Promise.allSettled(feeds.map(async ([outlet, bias, url, publisher]) => {
    const started = Date.now();
    const res = await fetchImpl(url, {
      headers: { 'user-agent': 'newsline/' + VERSION, accept: 'application/rss+xml, application/xml, text/xml, */*' },
      signal: AbortSignal.timeout(timeout),
    });
    // A 403/404/500 HTML error page parses to zero items and is otherwise indistinguishable
    // from a healthy but quiet feed. check-feeds.mjs has always checked this; the worker didn't.
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const items = parseItems(await res.text(), outlet, bias, publisher || outlet);
    if (!items.length) throw new Error('no items');
    return { outlet, items, ms: Date.now() - started };
  }));

  const items = [];
  const health = settled.map((r, i) => {
    const outlet = feeds[i][0];
    if (r.status === 'fulfilled') {
      items.push(...r.value.items);
      return { outlet, ok: true, items: r.value.items.length, ms: r.value.ms };
    }
    const err = r.reason;
    const message = err?.name === 'TimeoutError' || err?.name === 'AbortError'
      ? `timeout after ${timeout}ms`
      : String(err?.message || err);
    return { outlet, ok: false, items: 0, error: message };
  });

  return { items, health };
}

/// Carry first-seen stamps forward across pulls so "developing" and "new since you looked"
/// mean something. Best-effort: the Cache API is per-colo and evictable, so a miss simply
/// means everything looks new this once, never an error.
export function mergeSeen(items, previous = {}, now = Date.now()) {
  const seen = {};
  for (const item of items) {
    const first = previous[item.link] || now;
    item.firstSeen = first;
    seen[item.link] = first;
  }
  const carry = Object.entries(previous)
    .filter(([link, t]) => !(link in seen) && now - t < SEEN_TTL_MS)
    .sort((a, b) => b[1] - a[1])
    .slice(0, Math.max(0, SEEN_MAX - Object.keys(seen).length));
  for (const [link, t] of carry) seen[link] = t;
  return seen;
}

const jsonResponse = (body, maxAge) => new Response(JSON.stringify(body), {
  headers: { 'content-type': 'application/json', 'cache-control': `public, max-age=${maxAge}` },
});

const readJSON = async (cache, key) => {
  if (!cache) return null;
  try {
    const hit = await cache.match(key);
    return hit ? await hit.json() : null;
  } catch {
    return null; // a corrupt cache entry must not take the request down with it
  }
};

/**
 * Returns { updated, items, health, degraded, stale }.
 * `degraded` means this pull lost more than half its feeds; `stale` means we are serving a
 * previous good pull because of it.
 */
export async function loadItems(origin, ctx, deps = {}) {
  const {
    // `caches` only exists inside the Workers runtime. Outside it (tests, a Node harness) the
    // pull should still work, just uncached, instead of throwing a ReferenceError.
    cache = typeof caches !== 'undefined' ? caches.default : null,
    fetchImpl = fetch,
    now = Date.now(),
    feeds = FEEDS,
    waitUntil = p => ctx?.waitUntil?.(p),
  } = deps;

  const key = name => new Request(`${origin}/__cache/${name}-${CACHE_VERSION}`);

  const cached = cache ? await readJSON(cache, key('items')) : null;
  if (cached) return cached;

  const { items, health } = await pullFeeds({ fetchImpl, feeds });
  const healthy = health.filter(h => h.ok).length;
  const degraded = healthy < minHealthy(health.length);

  const previous = (await readJSON(cache, key('seen')))?.seen || {};
  const seen = mergeSeen(items, previous, now);

  let payload = { updated: now, items, health, degraded, stale: false };

  if (degraded) {
    const lastGood = await readJSON(cache, key('last-good'));
    if (lastGood) {
      // Serve the last good pull rather than a half-empty one, but report today's health so
      // clients (and /api/health) can still see exactly which feeds are down.
      payload = { updated: lastGood.updated, items: lastGood.items, health, degraded: true, stale: true };
    }
    if (cache) waitUntil(cache.put(key('items'), jsonResponse(payload, RETRY_TTL_S)));
  } else if (cache) {
    waitUntil(cache.put(key('items'), jsonResponse(payload, FEED_TTL_S)));
    waitUntil(cache.put(key('last-good'), jsonResponse(payload, LAST_GOOD_TTL_S)));
  }
  if (cache) waitUntil(cache.put(key('seen'), jsonResponse({ seen }, SEEN_TTL_MS / 1000)));

  return payload;
}
