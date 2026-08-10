# Newsline Roadmap

## 2026-08-09 — v0.3.0: API + MCP server

Turned newsline from a website into something other people's code can depend on. Shipped:

- Query params on `/api/stories` (`view`, `outlet`, `bias`, `blindspot`, `q`, `limit`).
- MCP server at `/mcp` — `get_news`, `get_blindspots`. Hand-rolled stateless JSON-RPC, no SDK, no Durable Object.
- `llms.txt`, `openapi.yaml`, `.well-known/security.txt`, `SECURITY.md`, README rewritten for API/MCP consumers.

Three bugs found and fixed while verifying against production:

- **Zone CDN ignores query strings.** Filtered responses were being cached and served to the wrong callers — the first request for any variant came back unfiltered. Responses now go out `no-store`; the feed pull stays cached inside the worker under `items-v5`, so nothing is refetched.
- **Filtering ran after `latest()`'s 120-item cap**, so low-volume outlets (Daring Fireball, CNN, WSJ) returned empty. Now filters first.
- **`parseItems` only matched RSS `<item>`**, never Atom `<entry>` — Daring Fireball had been contributing zero items since it was added. Also added entity decoding, so titles no longer leak `&#8217;` / `&amp;` to consumers.

Dropped 5 dead feeds (all silently returning nothing): Reuters (public RSS discontinued), AP (rsshub mirror 403s), MSNBC and CTV (404), Washington Post (301 to a dead end). 17 outlets remain, each verified to return items.

**Deliberately not done:** pricing/metering/API keys (no external users yet — free and unauthenticated *is* the distribution), and generated SDKs (three packages wrapping one GET request). This closes the "newsline Stripe gate" follow-up in `~/Documents/Code/CLAUDE.md` as declined rather than pending.

## Next

- [ ] Post to Show HN and r/mcp. Drafts ready in LAUNCH.md, waiting on posting.
- [ ] Re-check the 5 dropped feeds occasionally; re-add any that publish an official feed again.
- [ ] iOS companion app — deferred. When picked up: fetch `/api/stories`, list + detail or grouped-by-bias view. Reuse the xcodegen pattern from `journal/ios/` (smallest existing example): `project.yml` + `Sources/Shared/{Models,Services,Views}` + `Sources/iOS/`, plain `URLSession.shared.data(from:)` in an `ObservableObject` service, no auth needed since the API is public/unauthenticated.

## awesome-mcp-servers PR #11830 (2026-08-09)
github-actions bot requires, before merge:
1. List newsline on Glama — https://glama.ai/mcp/servers (GitHub OAuth, browser-only; no public submit API). Remote hosted endpoint, so use the connectors path https://glama.ai/mcp/connectors, not the Dockerfile flow.
2. Then add badge to the PR body:
   [![nulljosh/newsline MCP server](https://glama.ai/mcp/servers/nulljosh/newsline/badges/score.svg)](https://glama.ai/mcp/servers/nulljosh/newsline)
Verified 2026-08-09: Glama API + badge URL both 404, not listed yet.
