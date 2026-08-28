// Feed health check: every source must return items AND be recently updated.
// Run: npm run feeds
//
// Item count alone is not enough. CNN (dropped 2026-08-13) served 200 OK with 69 well-formed
// items whose newest entry was from April 2023 — a frozen snapshot that passes every
// "does it return items?" check while contributing nothing to the feed. Recency is the check
// that catches that. Imports FEEDS from worker.js so the URL list can't drift out of sync.
import { FEEDS, parseItems, VERSION } from './worker.js';

const STALE_DAYS = Number(process.env.STALE_DAYS ?? 7);
const staleMs = STALE_DAYS * 864e5;
const now = Date.now();

const rows = await Promise.all(FEEDS.map(async ([outlet, bias, url]) => {
  try {
    // Same UA the worker sends — Postmedia (National Post, Vancouver Sun, The Province) 403s
    // a bare fetch, which would report three healthy feeds as down.
    const res = await fetch(url, {
      headers: { 'user-agent': 'sidewise/' + VERSION },
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) return { outlet, url, status: `HTTP ${res.status}`, bad: true };
    const items = parseItems(await res.text(), outlet, bias);
    if (!items.length) return { outlet, url, status: 'no items', bad: true };
    // ts=0 means the feed omits dates entirely (Daring Fireball-style); can't judge recency,
    // so only flag it when nothing in the feed is dated.
    const newest = Math.max(...items.map(i => i.ts || 0));
    if (!newest) return { outlet, url, status: `${items.length} items, undated`, bad: false };
    const age = now - newest;
    return {
      outlet, url, bad: age > staleMs,
      status: `${items.length} items, newest ${new Date(newest).toISOString().slice(0, 10)}`
        + (age > staleMs ? ` — STALE ${Math.floor(age / 864e5)}d` : ''),
    };
  } catch (e) {
    return { outlet, url, status: `fetch failed: ${e.message}`, bad: true };
  }
}));

for (const r of rows) console.log(`${r.bad ? 'FAIL' : 'ok  '}  ${r.outlet.padEnd(24)} ${r.status}`);

const bad = rows.filter(r => r.bad);
console.log(`\n${rows.length - bad.length}/${rows.length} healthy (stale threshold ${STALE_DAYS}d)`);
if (bad.length) {
  console.log(`Unhealthy: ${bad.map(r => r.outlet).join(', ')}`);
  process.exit(1);
}
