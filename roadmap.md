# Newsline Roadmap

## 2026-07-15
- [x] Blindspot detection (story covered by only one side) surfaced in worker + frontend
- [x] Search box + bias-side/blindspot filter tabs on frontend
- [ ] Deploy worker.js — still blocked: `CLOUDFLARE_API_TOKEN` set in shell env prevents `wrangler login` OAuth, and the token itself lacks account/workers scope. Fix: unset the env token to OAuth login, or mint a new scoped token, then `npx wrangler deploy`
- [ ] After deploy: confirm API const in index.html points at the live worker URL, verify clustering output, create GitHub repo + Pages deploy
- [ ] Grow outlet→bias map further, add real topic tagging (Ground News parity)
