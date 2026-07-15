# Newsline

Multi-outlet news aggregator, Ground News-style bias bars + blindspot detection. `news.heyitsmejosh.com`.

## Architecture

Single Cloudflare Worker (`worker.js`) does everything:
- Fetches 14 RSS feeds (outlet → bias map at top of `worker.js`), clusters same-story headlines by title-keyword overlap (naive O(n²), see `ponytail:` comment — upgrade to embeddings if quality matters), tags bias, flags blindspot stories (covered by only one side).
- Serves `/api/stories` (JSON, cached 10 min via Cache API) and the static page (`public/index.html`, via Workers Static Assets) from the same deploy — no separate Pages project.

## Deploy

```
wrangler deploy
```

**Gotcha:** `~/.config/fish/secrets.fish` used to export `CLOUDFLARE_API_TOKEN` globally, which forces wrangler off OAuth and into token mode — and that token lacks Workers scope, so every `wrangler login`/`deploy` failed. Fixed 2026-07-15: renamed that var to `CLOUDFLARE_DNS_TOKEN` (still used for direct Cloudflare API/DNS calls). Wrangler now stays logged in via OAuth across sessions — don't re-add `CLOUDFLARE_API_TOKEN` to fish config.

## Roadmap

See `roadmap.md`.
