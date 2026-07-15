# Newsline Roadmap

## 2026-07-15
- [x] Blindspot detection (story covered by only one side) surfaced in worker + frontend
- [x] Search box + bias-side/blindspot filter tabs on frontend
- [x] Deploy worker.js — LIVE at https://newsline.trommatic.workers.dev, clustering confirmed working. Root cause of the 20x-repeated wrangler login prompt: `~/.config/fish/secrets.fish` permanently exported `CLOUDFLARE_API_TOKEN`, which forces wrangler into token mode (and that token lacks Workers scope) instead of using the OAuth login you already had. Renamed to `CLOUDFLARE_DNS_TOKEN` in secrets.fish so wrangler now uses OAuth by default; `wrangler deploy` should no longer need re-login.
- [ ] Point `news.heyitsmejosh.com` at the worker — tried adding a CNAME (news → newsline.trommatic.workers.dev, proxied) via Cloudflare API, but POST/GET calls using CLOUDFLARE_DNS_TOKEN were silently killed in this sandbox (curl exit 43, no error surfaced). Needs a session without that restriction, or do it by hand: Cloudflare dash → heyitsmejosh.com → DNS → Add record → CNAME `news` → `newsline.trommatic.workers.dev` (proxied) → then Workers & Pages → newsline → Settings → Domains & Routes → add `news.heyitsmejosh.com`. Also update `API` const in index.html if you front it with a custom domain.
- [ ] index.html still needs a Pages/static host deploy (currently only worker.js is live) — create GitHub repo + Pages, or serve index.html from the same worker
- [ ] Grow outlet→bias map further, add real topic tagging (Ground News parity)
