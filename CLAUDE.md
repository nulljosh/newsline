# Newsline

RSS news reader across 15 sources (incl. Hacker News, CNN, Fox, BBC…). Flat **Latest** feed + Ground News-style bias view. `news.heyitsmejosh.com`.

## Architecture

Single Cloudflare Worker (`worker.js`) does everything:
- Fetches 15 RSS feeds (`FEEDS` = `[outlet, bias, url]` at top of `worker.js`; add a source by appending a row — RSS 2.0 or Atom).
- `parseItems` pulls title/link + a timestamp (`pubDate`/`dc:date`/`published`/`updated`, `ts=0` when absent).
- Returns two views in one `/api/stories` JSON payload:
  - `latest` — flat reverse-chron across all sources (dateless sinks to bottom), the default reader view.
  - `stories` — `cluster()` groups same-story headlines by title-keyword overlap (naive O(n²), see `ponytail:` comment — upgrade to embeddings if quality matters), tags bias, flags blindspots (covered by one side only).
- Serves the static page (`public/index.html`, via Workers Static Assets) from the same deploy — no separate Pages project. Frontend defaults to Latest with a source picker + search; tabs switch to the bias view.
- Response cached 10 min via Cache API; the cache key ignores query strings, so a fresh deploy still serves stale JSON until the TTL expires (~10 min) — don't panic if new fields are missing right after deploy.

## Develop

```
npm test        # node test.mjs — parseItems / latest / cluster self-check
npm run deploy   # wrangler deploy
```

**Gotcha:** `~/.config/fish/secrets.fish` used to export `CLOUDFLARE_API_TOKEN` globally, which forces wrangler off OAuth into token mode — and that token lacks Workers scope, so every `wrangler login`/`deploy` failed. Fixed 2026-07-15: renamed to `CLOUDFLARE_DNS_TOKEN`. Don't re-add `CLOUDFLARE_API_TOKEN` to fish config.

## Roadmap

See `roadmap.md`.
