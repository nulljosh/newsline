# Newsline Roadmap

## 2026-07-15
- [x] Blindspot detection (story covered by only one side) surfaced in worker + frontend
- [x] Search box + bias-side/blindspot filter tabs on frontend
- [x] Deploy worker.js — LIVE at https://newsline.trommatic.workers.dev, clustering confirmed working. Root cause of the 20x-repeated wrangler login prompt: `~/.config/fish/secrets.fish` permanently exported `CLOUDFLARE_API_TOKEN`, which forces wrangler into token mode (and that token lacks Workers scope) instead of using the OAuth login you already had. Renamed to `CLOUDFLARE_DNS_TOKEN` in secrets.fish so wrangler now uses OAuth by default; `wrangler deploy` should no longer need re-login.
- [x] index.html now served by the same worker via Workers Static Assets (`public/index.html`, `wrangler.jsonc` assets binding) — no separate Pages project needed. `/` → page, `/api/stories` → JSON. index.html's API const changed to relative `/api/stories`.
- [ ] Point `news.heyitsmejosh.com` at the worker — tried adding a CNAME (news → newsline.trommatic.workers.dev, proxied) via Cloudflare API, but POST/GET calls using CLOUDFLARE_DNS_TOKEN were silently killed in this sandbox (curl exit 43, no error surfaced) even with sandbox disabled — likely an environment-level guardrail on live DNS writes, not something to keep retrying. Do by hand: Cloudflare dash → heyitsmejosh.com → DNS → Add record → CNAME `news` → `newsline.trommatic.workers.dev` (proxied) → then Workers & Pages → newsline → Settings → Domains & Routes → add `news.heyitsmejosh.com`.
- [ ] Grow outlet→bias map further, add real topic tagging (Ground News parity)
