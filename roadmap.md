# Newsline Roadmap

## 2026-08-11 — v1.0.0 apps + landing page

- `ios/` — SwiftUI app, one shared source tree for iPhone/iPad (`Newsline-iOS`) and Mac
  (`Newsline-macOS`), bundle ID `com.nulljosh.newsline` for both (Universal Purchase).
  NavigationSplitView with three panes: clustered **Stories** (bias bar, blindspot tag,
  left/center/right filter), flat **Latest**, and **Saved**. Feed and saved stories cache to
  Caches as JSON, so the app opens offline. No account, no analytics, no third-party SDKs.
- `public/app.html` (`/app`) — landing page for the apps. `public/privacy.html` (`/privacy`) —
  privacy policy, required for the App Store listing. Both linked from the reader footer.
- Both targets build clean; `Newsline-Tests` covers bias-side mapping, filtering, search and
  API decoding.

### App Store — NOT submitted, deliberately
The account-wide submission freeze runs to **2026-08-18** (Guideline 5.6, see
`~/Documents/Code/CLAUDE.md`). Nothing was submitted and no ASC record was created.

Before submitting, in order:
- [ ] Create the ASC app record (name "Newsline" needs availability-checking first via
      `asc-name-creator`) and register `com.nulljosh.newsline` for iOS + macOS.
- [ ] Screenshots (iPhone 6.5"/6.7", iPad 12.9", Mac) — see `appstore-screenshots` skill.
- [ ] Metadata + App Privacy (answer DATA_NOT_COLLECTED), privacy URL
      `https://news.heyitsmejosh.com/privacy`, marketing URL `https://news.heyitsmejosh.com/app`.
- [ ] Review notes must describe the app-only functionality (offline cache, saved stories,
      bias filtering) — this is a native client over an owned API, not a web wrapper, and the
      5.6 letter requires spelling that out.
- [ ] Add the App Store badge + link to `/app` once live.

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
- [ ] Re-check the 6 dropped feeds occasionally (Reuters, AP, MSNBC, CTV, Washington Post, CNN);
      re-add any that publish an official feed again. `npm run feeds` covers the live ones.
- [ ] iOS companion app — deferred. When picked up: fetch `/api/stories`, list + detail or grouped-by-bias view. Reuse the xcodegen pattern from `journal/ios/` (smallest existing example): `project.yml` + `Sources/Shared/{Models,Services,Views}` + `Sources/iOS/`, plain `URLSession.shared.data(from:)` in an `ObservableObject` service, no auth needed since the API is public/unauthenticated.

## awesome-mcp-servers PR #11830 (2026-08-09)
github-actions bot requires, before merge:
1. List newsline on Glama — https://glama.ai/mcp/servers (GitHub OAuth, browser-only; no public submit API). Remote hosted endpoint, so use the connectors path https://glama.ai/mcp/connectors, not the Dockerfile flow.
2. Then add badge to the PR body:
   [![nulljosh/newsline MCP server](https://glama.ai/mcp/servers/nulljosh/newsline/badges/score.svg)](https://glama.ai/mcp/servers/nulljosh/newsline)
Verified 2026-08-09: Glama API + badge URL both 404, not listed yet.

## Ingested 2026-08-22
- [ ] Build out the iOS and macOS apps. (Memory records Newsline iOS/macOS apps as built 2026-08-11 but never submitted due to the 5.6 freeze — that freeze lifted 2026-08-18, so verify what exists before rebuilding, then submit.)
