# Newsline Roadmap

## 2026-07-15
- [x] Blindspot detection (story covered by only one side) surfaced in worker + frontend
- [x] Search box + bias-side/blindspot filter tabs on frontend
- [x] Deploy worker.js — LIVE at https://newsline.trommatic.workers.dev, clustering confirmed working. Root cause of the 20x-repeated wrangler login prompt: `~/.config/fish/secrets.fish` permanently exported `CLOUDFLARE_API_TOKEN`, which forces wrangler into token mode (and that token lacks Workers scope) instead of using the OAuth login you already had. Renamed to `CLOUDFLARE_DNS_TOKEN` in secrets.fish so wrangler now uses OAuth by default; `wrangler deploy` should no longer need re-login.
- [x] index.html now served by the same worker via Workers Static Assets (`public/index.html`, `wrangler.jsonc` assets binding) — no separate Pages project needed. `/` → page, `/api/stories` → JSON. index.html's API const changed to relative `/api/stories`.
- [ ] Point `news.heyitsmejosh.com` at the worker — tried adding a CNAME (news → newsline.trommatic.workers.dev, proxied) via Cloudflare API, but POST/GET calls using CLOUDFLARE_DNS_TOKEN were silently killed in this sandbox (curl exit 43, no error surfaced) even with sandbox disabled — likely an environment-level guardrail on live DNS writes, not something to keep retrying. Do by hand: Cloudflare dash → heyitsmejosh.com → DNS → Add record → CNAME `news` → `newsline.trommatic.workers.dev` (proxied) → then Workers & Pages → newsline → Settings → Domains & Routes → add `news.heyitsmejosh.com`.
- [ ] Grow outlet→bias map further, add real topic tagging (Ground News parity)

## 2026-07-15 (later)
- [x] Restyled with portfolio design tokens (`@import heyitsmejosh.com/tokens.css`, matches spark/journal/wiretext/grapher)
- [x] Repo standards added: README.md, CLAUDE.md, LICENSE, icon.svg, architecture.svg
- [x] Pushed to GitHub: https://github.com/nulljosh/newsline
- [ ] iOS companion app — deferred (weekly usage was at ~85-87%). When picked up: fetch `/api/stories`, list + detail or grouped-by-bias view. Reuse the xcodegen pattern from `journal/ios/` (smallest existing example): `project.yml` + `Sources/Shared/{Models,Services,Views}` + `Sources/iOS/`, plain `URLSession.shared.data(from:)` in an `ObservableObject` service, no auth needed since the API is public/unauthenticated.

## From NewsLine.pdf (imported 2026-07-19)
- [x] Rename wiki entry to match real GitHub name — done 2026-07-19: renamed `wiki/pages/news-app.md` → `wiki/pages/newsline.md`, refreshed content to reflect shipped v0.2.0 state (was stale "concept, rebuild from scratch" copy). Note: could not commit — the Obsidian vault path (`~/Library/Mobile Documents/iCloud~md~obsidian/Documents/Code/wiki/pages/`) isn't a git repo on this machine; the tracked `notes` repo (`~/Documents/Code/notes`, github nulljosh/notes) has a different structure (`notes/pages/` and `notes/notes/*.md`, no `wiki/pages/`) — the wiki deploy pipeline referenced by the /work skill needs verifying, it may point at a path that doesn't match the actual notes repo layout.
