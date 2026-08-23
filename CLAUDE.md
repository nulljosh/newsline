# Newsline

RSS news reader across 16 sources (incl. Hacker News, Fox, BBC, WSJ…). Flat **Latest** feed + Ground News-style bias view. `news.heyitsmejosh.com`.

## Architecture

Single Cloudflare Worker does everything. `worker.js` is routing + error handling only; the
logic lives in `src/` (`feeds` `parse` `stories` `load` `mcp`) so it can be tested without a
Worker runtime. `worker.js` re-exports all of it, so `check-feeds.mjs` and tests import one path.
- Fetches 16 RSS feeds (`FEEDS` = `[outlet, bias, url, publisher?]` in `src/feeds.js`; add a source by appending a row — RSS 2.0 or Atom). `publisher` defaults to `outlet` and exists so one newsroom's two feeds (NY Post + NY Post Opinion) count as one voice, not two — counting outlets inflated bias bars and produced false blindspots. Run `npm run feeds` after adding one: it checks **recency**, not just item count, which is the only way to catch a "zombie" feed that still serves 200 OK from a frozen snapshot (CNN did exactly this for 3 years).
- `parseItems` pulls title/link + a timestamp (`pubDate`/`dc:date`/`published`/`updated`, `ts=0` when absent).
- Returns two views in one `/api/stories` JSON payload:
  - `latest` — flat reverse-chron across all sources (dateless sinks to bottom), the default reader view.
  - `stories` — `cluster()` groups same-story headlines by title-keyword overlap (naive O(n²), see `ponytail:` comment — upgrade to embeddings if quality matters), tags bias, flags blindspots (covered by one side only).
- Serves the static site (via Workers Static Assets). `public/index.html` is the marketing page; **`public/reader.html` is the actual web app**. from the same deploy — no separate Pages project. Frontend defaults to Latest with a source picker + search; tabs switch to the bias view.
- The *feed pull* (not the response) is cached ~2 min via the Cache API under a constant key; responses go out `no-store` because the zone CDN ignores query strings. A fresh deploy still serves the previous pull until that TTL expires — don't panic if new fields are missing for a couple of minutes.
- Failure handling: each feed reports `{ok, items, error}`; a pull that loses more than half its feeds is `degraded` and falls back to the last good pull (`stale: true`) rather than serving a half-empty feed, and never overwrites it. `/api/health` 503s when degraded.

## Endpoints

`/api/stories` (query: `view` `outlet` `bias` `blindspot` `developing` `q` `limit` `compare`) ·
`/api/health` · `/api/sources` · `/mcp` (`get_news`, `get_blindspots`, `compare_coverage`, `get_feed_health`).
Never hardcode the outlet count in prose — it has drifted to 22/17/16 across five files. Derive it from `FEEDS.length`.

## Develop

```
npm test         # node --test test/*.test.mjs — 87 checks, no network
npm run deploy   # wrangler deploy
```

**Gotcha:** `~/.config/fish/secrets.fish` used to export `CLOUDFLARE_API_TOKEN` globally, which forces wrangler off OAuth into token mode — and that token lacks Workers scope, so every `wrangler login`/`deploy` failed. Fixed 2026-07-15: renamed to `CLOUDFLARE_DNS_TOKEN`. Don't re-add `CLOUDFLARE_API_TOKEN` to fish config.

## Roadmap

See `roadmap.md`.
