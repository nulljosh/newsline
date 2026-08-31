<img src="icon.svg" width="80" style="border-radius:18px">

# Sidewise

![version](https://img.shields.io/badge/version-v0.4.0-blue) ![license](https://img.shields.io/badge/license-MIT-green) [![GitHub](https://img.shields.io/badge/GitHub-nulljosh%2Fsidewise-black?logo=github)](https://github.com/nulljosh/sidewise)

Headlines from 16 feeds across 14 newsrooms, spanning the political spectrum, with
left/center/right bias tags and **blindspot** detection: stories covered by only one side.
Free, unauthenticated, no rate limit, no account.

Two feeds from the same newsroom count as one voice, so a single publisher running an opinion
section alongside its main feed cannot fake corroboration or bury a blindspot.

Four ways in: a [web reader](https://sidewise.heyitsmejosh.com), native [iPhone/iPad/Mac apps](https://sidewise.heyitsmejosh.com/app), a JSON API, and an MCP server.

## Apps

SwiftUI, one codebase for iOS and macOS, in `ios/`. Reads the same public API — no account, no
tracking, saved stories and the feed cache stay on device.

```
cd ios && xcodegen generate
xcodebuild -scheme Sidewise-iOS -destination 'generic/platform=iOS Simulator' build
```

## MCP

```
claude mcp add --transport http sidewise https://sidewise.heyitsmejosh.com/mcp
```

| Tool | Params | Returns |
|---|---|---|
| `get_news` | `view`, `outlet`, `bias`, `developing`, `q`, `limit` | Current headlines, flat or clustered by story |
| `get_blindspots` | `limit` | Only stories covered by a single political side |
| `compare_coverage` | `q` (required), `limit` | One story as each side headlines it, plus the words unique to each |
| `get_feed_health` | — | Which feeds answered, and whether the data served is complete or a stale fallback |

`get_feed_health` is worth calling before you treat an empty or one-sided result as real: an
outage and a quiet news day look identical otherwise.

Stateless streamable HTTP, no auth. Works with any MCP client — Claude Desktop, Claude Code, Cursor.

## API

`GET https://sidewise.heyitsmejosh.com/api/stories` — every parameter is optional.

| Param | Values | Default |
|---|---|---|
| `view` | `latest`, `stories`, `both` | `both` |
| `outlet` | any outlet name, e.g. `Hacker News` | all |
| `bias` | `left`, `center`, `right` | all |
| `blindspot` | `true` | off |
| `developing` | `true` — three or more newsrooms in the last 90 minutes | off |
| `compare` | `true` — attach the side-by-side breakdown to each story | off |
| `q` | substring match on headline and summary text | none |
| `limit` | 1–200 | 60 clusters / 120 headlines |

Two more endpoints sit alongside it. `GET /api/health` reports every feed's status and answers
**503** when more than half are down, so it can be pointed at a monitor as-is. `GET /api/sources`
lists each feed with its bias, resolved side and parent newsroom.

```bash
curl 'https://sidewise.heyitsmejosh.com/api/stories?view=stories&blindspot=true'
curl 'https://sidewise.heyitsmejosh.com/api/stories?view=latest&outlet=Hacker%20News&limit=10'
```

```json
{
  "updated": 1754700000000,
  "stories": [
    {
      "title": "Fed holds rates steady",
      "blindspot": false,
      "sources": [
        { "title": "Fed holds rates steady", "link": "https://…", "outlet": "NPR", "bias": -1 },
        { "title": "Fed refuses to cut rates", "link": "https://…", "outlet": "Fox News", "bias": 2 }
      ]
    }
  ],
  "latest": [
    { "title": "Fed holds rates steady", "link": "https://…", "outlet": "NPR", "bias": -1, "ts": 1754699000000 }
  ]
}
```

CORS open to all origins. Feeds are re-pulled at most every 2 minutes; responses themselves are `no-store` (see below). `ts` is epoch ms, or `0` when the feed published no date (those sort to the bottom). Full spec: [`openapi.yaml`](https://sidewise.heyitsmejosh.com/openapi.yaml) · orientation for agents: [`llms.txt`](https://sidewise.heyitsmejosh.com/llms.txt).

## How it works

One Cloudflare Worker (`worker.js`) polls every RSS feed in `src/feeds.js` and serves the page,
the API and MCP off a single pooled pull:

- **`latest`** — flat reverse-chronological feed across all sources.
- **`stories`** — headlines clustered by title-keyword overlap, each source tagged left/center/right, one-sided clusters flagged `blindspot`.

Only the feed pull is cached, under a constant key. Filtering happens per-request in `shape()` downstream of it, and responses go out `no-store` — the zone's CDN cache ignores query strings, so caching them would serve one caller's `?outlet=` to everyone. Nothing is refetched either way; only the cheap filtering runs again.

Clusters are filtered *after* clustering, and the flat feed *before* its 120-item cap. Both orderings matter: narrowing the input first would destroy the cross-outlet comparison, and filtering after the cap would hide low-volume outlets.

![architecture](architecture.svg)

## Bias scores

Each source carries a score from `-2` (left) to `+2` (right); `0` is center, or non-political for tech outlets like Hacker News and Daring Fireball. These are hand-assigned in `FEEDS`, not a third-party rating — treat them as a rough lean.

CBC · The Guardian · NPR · BBC · Global News · National Post · Fox News · NY Post · Daily Wire · Hacker News · Daring Fireball · NBC News · Wall Street Journal · NY Post Opinion · Vancouver Sun · The Province

Add one by appending `[outlet, bias, url]` to `FEEDS` at the top of `worker.js`. Any RSS 2.0 or Atom feed works.

## Develop

```
npm test         # 95 checks, no network
npm run feeds    # check every feed for freshness, not just a 200
npm run deploy   # wrangler deploy
```

`npm run feeds` is the one to run after touching `FEEDS`. It checks **recency**, which is the
only way to catch a zombie feed: an endpoint that still answers 200 with well-formed XML whose
newest item is two years old. CNN did exactly that for three years, and an item-count check
never noticed.

Cloudflare Workers + Workers Static Assets — one deploy serves the page, `/api/stories`, and `/mcp`.

### Tests

`test/` covers the four modules in `src/` with no network and no Worker runtime:

| File | What it holds down |
|---|---|
| `parse.test.mjs` | Entity decoding, double-escaped summaries, CDATA and Atom shapes, and the rejection of `javascript:` and `data:` links |
| `stories.test.mjs` | Clustering, the newsroom-not-feed counting rule behind blindspots, the developing window, and filter-after-cluster ordering |
| `load.test.mjs` | Feed failure reporting, timeouts, the degraded/stale fallback, and the rule that a bad pull never overwrites the last good one |
| `worker.test.mjs` | Query parsing and clamping, and that everything under `/api/` answers JSON with CORS, including 404s, 405s and 500s |
| `mcp.test.mjs` | JSON-RPC framing, malformed input, and each tool's contract |

Security: see [SECURITY.md](SECURITY.md).

## License

MIT 2026, Joshua Trommel. Headlines and links belong to their publishers — Sidewise stores nothing and links out to the original article.

## Whitepaper

[Technical whitepaper](WHITEPAPER.md)

## API and agent tools

REST (`/api/*`), the `POST /mcp` JSON-RPC server, and in-page WebMCP tools on the reader
(`public/webmcp.js`) all expose the same four operations, kept in sync and tested against
each other. See [`docs/API.md`](docs/API.md).
