# Sidewise Roadmap

## 2026-08-11 — v1.0.0 apps + landing page

- `ios/` — SwiftUI app, one shared source tree for iPhone/iPad (`Sidewise-iOS`) and Mac
  (`Sidewise-macOS`), bundle ID `com.nulljosh.newsline` for both (Universal Purchase).
  NavigationSplitView with three panes: clustered **Stories** (bias bar, blindspot tag,
  left/center/right filter), flat **Latest**, and **Saved**. Feed and saved stories cache to
  Caches as JSON, so the app opens offline. No account, no analytics, no third-party SDKs.
- `public/app.html` (`/app`) — landing page for the apps. `public/privacy.html` (`/privacy`) —
  privacy policy, required for the App Store listing. Both linked from the reader footer.
- Both targets build clean; `Sidewise-Tests` covers bias-side mapping, filtering, search and
  API decoding.

### App Store — NOT submitted
The 5.6 freeze that blocked this **lifted 2026-08-18**. Nothing blocks submission now; it
just hasn't been started. Still no ASC record and no registered bundle ID.

Name check 2026-08-27: **"Sidewise" is TAKEN.** Also taken: Blindspot, Newsprism, Crosswire,
Newsarc. Available: **Sidewise** (pick), Wirebrief, Newsgrain, Presswise, Biaslens, Newsfold,
Newsband, Slantwise, Pressfold, Newsvane, Headwire.

Before submitting, in order:
- [ ] Create the ASC app record as **Sidewise** and register `com.nulljosh.newsline` for
      iOS + macOS (Universal Purchase). Record creation is web-UI only (`asc-app-create-ui`)
      and ASC records cannot be deleted without Apple Support — confirm the name first.
- [ ] Accept the Paid Apps Agreement if still unaccepted (silently blocks all submits).
- [ ] Screenshots (iPhone 6.5"/6.7", iPad 12.9", Mac) — see `appstore-screenshots` skill.
- [ ] Metadata + App Privacy (answer DATA_NOT_COLLECTED), privacy URL
      `https://sidewise.heyitsmejosh.com/privacy`, marketing URL `https://sidewise.heyitsmejosh.com/app`.
- [ ] Review notes must describe the app-only functionality (offline cache, saved stories,
      bias filtering) — this is a native client over an owned API, not a web wrapper, and the
      5.6 letter requires spelling that out.
- [ ] Add the App Store badge + link to `/app` once live.

## 2026-08-27 — App Store: shipped as **Sidewise**, ASC `6806028670`

"Sidewise" is **taken** on the App Store (so are Blindspot, Newsprism, Crosswire, Newsarc).
The app ships as **Sidewise**; the repo, Worker, API, MCP server and sidewise.heyitsmejosh.com
keep the sidewise name — same split as spine/Bookrank and echo/Voxprint.

The 5.6 freeze this was waiting on lifted 2026-08-18. It was never the blocker after that
date; the work just wasn't picked back up.

Done:
- Bundle ID `com.nulljosh.newsline` registered UNIVERSAL (`G2U98QG4V3`).
- ASC record `6806028670`, en-CA, one Universal Purchase record with **IOS 1.0 + MAC_OS 1.0**
  (`asc versions create --platform MAC_OS` on the same record — Quotestreak proves the path).
- Display name -> Sidewise both platforms; `LSApplicationCategoryType` added to the macOS
  plist (its absence is the real ITMS-90242 cause); MARKETING_VERSION 1.0.0 -> 1.0.
- Profiles `Sidewise AppStore` / `Sidewise Mac AppStore` created **and installed locally** —
  export fails with "no profiles installed" until `asc profiles local install` is run.
- `metadata/` in canonical asc layout, **en-CA** (matching the record's primary locale — with
  en-US filenames the plan tries to DELETE the primary localization). Applied to both.
- Category NEWS, free pricing, content rights, copyright, review notes (both platforms).
- **iOS build uploaded and VALID**, attached to the version. Verified via
  `asc builds uploads list`, not the upload's own success line.
- Landing page carries the real App Store link, deployed and returning 200.

**2026-08-27 later:** review detail fixed (`demoAccountRequired` was true; the app has no
login — that was the "review detail field is missing" error). macOS archived, exported and
**uploaded**, build `202608271411`, PROCESSING at wrap time. Note the pkg upload requires
`--version` AND `--build-number`, and they must match the pkg's real CFBundleVersion or the
upload fails 90345 after committing.

### SUBMITTED 2026-08-28 17:02 UTC

Both platforms 0 errors, 0 blocking. Submitted at Joshua's explicit direction despite active 4.3(a) wave with appeals pending.

**iOS 1.0** — submission `561d82ed-410d-4feb-9f32-6a2c6c576bd0`, WAITING_FOR_REVIEW
**macOS 1.0** — submission `00f546b4-5b50-4867-b215-8cc6693fd45b`, WAITING_FOR_REVIEW

Build **`202608280953`** on both platforms — rebuilt after code fix to ship the CFBundleName correction. Prior builds would have shown "Sidewise-macOS" in menu bar.

Completed status:
- Age rating: INFREQUENT_OR_MILD across violence, mature/suggestive, alcohol/tobacco/drug references
- App availability: 174 territories, China excluded (publishing license required)
- Screenshots: iOS 6.5"/6.7", iPad 12.9", Mac 1440x900
- Test suite: 95 checks (parse, stories, load, MCP); JSON-RPC null params bug fixed
- Metadata, privacy, category (NEWS), review notes all set

Note: App entered review mid-wave (seven apps rejected, appeals pending); outcome will inform how verdicts are interpreted — whether Apple reconsiders whole wave or answers each independently.

App Store link: https://apps.apple.com/app/id6806028670

## 2026-08-09 — v0.3.0: API + MCP server

Turned sidewise from a website into something other people's code can depend on. Shipped:

- Query params on `/api/stories` (`view`, `outlet`, `bias`, `blindspot`, `q`, `limit`).
- MCP server at `/mcp` — `get_news`, `get_blindspots`. Hand-rolled stateless JSON-RPC, no SDK, no Durable Object.
- `llms.txt`, `openapi.yaml`, `.well-known/security.txt`, `SECURITY.md`, README rewritten for API/MCP consumers.

Three bugs found and fixed while verifying against production:

- **Zone CDN ignores query strings.** Filtered responses were being cached and served to the wrong callers — the first request for any variant came back unfiltered. Responses now go out `no-store`; the feed pull stays cached inside the worker under `items-v5`, so nothing is refetched.
- **Filtering ran after `latest()`'s 120-item cap**, so low-volume outlets (Daring Fireball, CNN, WSJ) returned empty. Now filters first.
- **`parseItems` only matched RSS `<item>`**, never Atom `<entry>` — Daring Fireball had been contributing zero items since it was added. Also added entity decoding, so titles no longer leak `&#8217;` / `&amp;` to consumers.

Dropped 5 dead feeds (all silently returning nothing): Reuters (public RSS discontinued), AP (rsshub mirror 403s), MSNBC and CTV (404), Washington Post (301 to a dead end). 17 outlets remain, each verified to return items.

**Deliberately not done:** pricing/metering/API keys (no external users yet — free and unauthenticated *is* the distribution), and generated SDKs (three packages wrapping one GET request). This closes the "sidewise Stripe gate" follow-up in `~/Documents/Code/CLAUDE.md` as declined rather than pending.

## Next

- [ ] Post to Show HN and r/mcp. Drafts ready in LAUNCH.md, waiting on posting.
- [ ] Re-check the 6 dropped feeds occasionally (Reuters, AP, MSNBC, CTV, Washington Post, CNN);
      re-add any that publish an official feed again. `npm run feeds` covers the live ones.
- [ ] iOS companion app — deferred. When picked up: fetch `/api/stories`, list + detail or grouped-by-bias view. Reuse the xcodegen pattern from `journal/ios/` (smallest existing example): `project.yml` + `Sources/Shared/{Models,Services,Views}` + `Sources/iOS/`, plain `URLSession.shared.data(from:)` in an `ObservableObject` service, no auth needed since the API is public/unauthenticated.

## awesome-mcp-servers PR #11830 (2026-08-09)
github-actions bot requires, before merge:
1. List sidewise on Glama — https://glama.ai/mcp/servers (GitHub OAuth, browser-only; no public submit API). Remote hosted endpoint, so use the connectors path https://glama.ai/mcp/connectors, not the Dockerfile flow.
2. Then add badge to the PR body:
   [![nulljosh/sidewise MCP server](https://glama.ai/mcp/servers/nulljosh/sidewise/badges/score.svg)](https://glama.ai/mcp/servers/nulljosh/sidewise)
Verified 2026-08-09: Glama API + badge URL both 404, not listed yet.

## Ingested 2026-08-22
- **DECIDED 2026-08-25 — do NOT submit these, and do not "verify whether to".** The iOS/macOS apps exist in `ios/` and the 5.6 freeze did lift, but the reason not to submit was never the freeze: at ~398 lines with one list view, one detail view and a bias bar, this is the exact thin reader profile that got Nullfolio rejected under Guideline 4.2. Instead of fattening it, the curated feed list was folded into **Inkpress**, which is a shipping app — see the note above about mirroring feed changes. Sidewise stays a Worker plus MCP server. Was:

## Blocked from App Store submission — 2026-08-22
The iOS app is 398 lines excluding tests: one list view, one detail view, a bias bar
and one network service. That is the same thin-wrapper profile Apple rejected Nullfolio
for under Guideline 4.2 (minimum functionality), and this account is fresh off a 5.6
suspension. Do not submit it in this state.
- [ ] Decide what makes Sidewise genuinely app-like rather than an RSS list: the bias comparison is the differentiator, so build it out — side-by-side coverage of the same story across outlets, saved/followed stories, offline reading, notifications for developing stories.
- [ ] Re-measure before submitting. Nimble cleared the bar at ~1,700 lines of real UI.

## Shelved 2026-08-23 — remainder of the web+iOS build-out

Worker, API and test layers landed (see commit). Not started, in priority order:

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
      a protocol seam so `Sidewise-Tests` can cover fetch/decode/error paths offline.
      No Swift toolchain in the web container — this needs a Mac or a macOS CI runner.
- [ ] Doc drift: `/app.html` links labelled "Reader" point at `/`, which has been the marketing
      page since 8af897b. README/llms.txt/openapi/server.json still say 17 outlets; `/api/sources`
      now serves the real number, so point them at it.

## Ingested 2026-08-24

- [ ] **Hero animation pass** (Notes 2026-08-24). Reference: bookrank's hero animation — same style/vibe. Subject: **news headlines, thumbnails, and hero images scraped from the source**.

## Feed list also seeds Inkpress (2026-08-25)

The curated `FEEDS` list in `src/feeds.js` is now duplicated as `FeedStore.seedFeeds` in
inkpress (`ios/Sources/Shared/Models/Feed.swift`), where it is the first-launch subscription
set. Deliberately a copy, not an import: inkpress is a Swift app with no build step that could
read this JS, and pointing it at the Worker would add an outage surface to replace RSS parsing
that already works locally. **If you add, drop or fix a feed here, mirror it there.**

## WebMCP + REST API rollout -- shipped 2026-08-27

Done. 4 tools reusing the exact names and schemas of the existing `POST /mcp` server so the two surfaces cannot drift: `get_news`, `get_blindspots`, `compare_coverage`, `get_feed_health`. A schema-parity test enforces it, and caught a stale outlet list in `llms.txt` on its first run.

See `docs/API.md` for the full tool table, linked from the README.

## From Notes (imported 2026-08-27)
- [ ] Sidewise 1.0 is still not shipping: both the iOS and macOS 1.0 version records sit at PREPARE_FOR_SUBMISSION, never submitted. Builds `202608271443` (iOS + macOS) are VALID and APP_STORE_ELIGIBLE, so the binaries are ready — what's missing is the submission itself plus whatever metadata `asc validate` still flags.

## Cold-pull latency (measured 2026-08-31)
`/api/stories` cold = 2.75s, warm = 0.10s. The 120s Cache-API TTL means one caller per colo
per 2 min eats the full 16-feed fan-out. A cron warm only fixes the colo the cron lands in
(caches.default is per-datacenter), so the real fix is KV- or DO-backed pooling, not a trigger.
Not worth it at current traffic — revisit if the reader gets real users.
