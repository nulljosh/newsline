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

## Blocked from App Store submission — 2026-08-22
The iOS app is 398 lines excluding tests: one list view, one detail view, a bias bar
and one network service. That is the same thin-wrapper profile Apple rejected Nullfolio
for under Guideline 4.2 (minimum functionality), and this account is fresh off a 5.6
suspension. Do not submit it in this state.
- [ ] Decide what makes Newsline genuinely app-like rather than an RSS list: the bias comparison is the differentiator, so build it out — side-by-side coverage of the same story across outlets, saved/followed stories, offline reading, notifications for developing stories.
- [ ] Re-measure before submitting. Nimble cleared the bar at ~1,700 lines of real UI.

## Shelved 2026-08-23 — remainder of the web+iOS build-out

Worker, API and test layers landed (see commit). Not started, in priority order:

- [ ] **`public/reader.html` rewrite.** It has a live stored-XSS hole: `x.title`, `x.link` and
      `s.title` go into `innerHTML` unescaped (L107-108, 135, 143) and `decode()` actively turns
      `&lt;` back into `<`. Feed titles are third-party input. Build DOM nodes instead of strings.
      `safeLink()` in `src/parse.js` now blocks `javascript:` links at the source, which covers
      the href half, but the title half is still open. **Do this one first.**
- [ ] Extract the reader's inline JS to `public/reader.js` so it can be unit-tested in Node,
      then add `test/reader.test.mjs` (escaping, filter state, timeAgo).
- [ ] PWA layer: `manifest.webmanifest`, a service worker caching the shell + last payload,
      `apple-touch-icon`, `theme-color`. Cheapest path to offline parity with the native app.
- [ ] Reader UX: URL-encoded filter state (`?tab=&q=&outlet=`) for deep links and back-button,
      saved stories in localStorage, `role="tablist"`/`aria-selected`/`aria-live`, labels on the
      search and source inputs, loading skeletons, a retry button, local CSS token fallbacks so
      the page survives `heyitsmejosh.com/tokens.css` failing to load.
- [ ] Surface the new API fields in the reader: `health.down` (say when feeds are down instead
      of showing a thin feed), `developing`, `firstSeen`, `summary`, `image`.
- [ ] Web compare view backed by `?compare=true` / the `compare_coverage` MCP tool.
- [ ] **iOS/macOS depth** — the Guideline 4.2 blocker below is still open. Planned: a compare
      view (columns per side + the word-diff `distinctive()` already computes server-side),
      followed keywords/outlets, read state + history, persistence moved off `.cachesDirectory`
      to Application Support, a stable `Story.id` (title is fragile — a re-cluster loses saves),
      local notifications via `BGAppRefreshTask` (no APNs, keeps DATA_NOT_COLLECTED), a WidgetKit
      target behind an App Group, and a Settings pane. `NewsService` needs splitting first, and
      a protocol seam so `Newsline-Tests` can cover fetch/decode/error paths offline.
      No Swift toolchain in the web container — this needs a Mac or a macOS CI runner.
- [ ] CI: `.github/workflows/ci.yml` running `npm test` on push, a scheduled `npm run feeds`
      (it already exits non-zero on a stale feed), and a macOS job for `xcodegen && xcodebuild test`.
- [ ] Doc drift: `/app.html` links labelled "Reader" point at `/`, which has been the marketing
      page since 8af897b. README/llms.txt/openapi/server.json still say 17 outlets; `/api/sources`
      now serves the real number, so point them at it.
