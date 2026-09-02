<img src="icon.svg" width="80" style="border-radius:18px">

# Sidewise

![version](https://img.shields.io/badge/version-v0.4.0-blue) ![license](https://img.shields.io/badge/license-MIT-green) [![GitHub](https://img.shields.io/badge/GitHub-nulljosh%2Fsidewise-black?logo=github)](https://github.com/nulljosh/sidewise)

What is the other side reading?

Sidewise pulls 16 feeds from 14 newsrooms across the spectrum, tags each left, center or right,
and flags the **blindspots**: stories only one side is covering. Free. No account, no key, no limit.

Two feeds from one newsroom count as one voice. A publisher can't run an opinion section next
to its main feed and call that two sources.

Four ways in: a [web reader](https://sidewise.heyitsmejosh.com), native [iPhone, iPad and Mac apps](https://sidewise.heyitsmejosh.com/app), a JSON API, and an MCP server.

## Apps

SwiftUI, one codebase for iOS and macOS, in `ios/`. It reads the same public API. No account,
no tracking. Saved stories and the feed cache stay on the device.

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

Call `get_feed_health` before you trust an empty or one-sided result. An outage and a quiet
news day look the same otherwise.

Stateless streamable HTTP, no auth. Works with any MCP client: Claude Desktop, Claude Code, Cursor.

## API

`GET https://sidewise.heyitsmejosh.com/api/stories`. Every parameter is optional.

| Param | Values | Default |
|---|---|---|
| `view` | `latest`, `stories`, `both` | `both` |
| `outlet` | any outlet name, e.g. `Hacker News` | all |
| `bias` | `left`, `center`, `right` | all |
| `blindspot` | `true` | off |
| `developing` | `true`: three or more newsrooms in the last 90 minutes | off |
| `compare` | `true`: attach the side-by-side breakdown to each story | off |
| `q` | substring match on headline and summary text | none |
| `limit` | 1–200 | 60 clusters / 120 headlines |

Two more endpoints. `GET /api/health` reports every feed and answers **503** when more than
half are down, so you can point a monitor at it as is. `GET /api/sources` lists each feed with
its bias, its side and its parent newsroom.

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

CORS is open. Feeds are re-pulled at most every 2 minutes. Responses are `no-store` (see below). `ts` is epoch ms, or `0` when the feed gave no date. Those sort to the bottom. Full spec: [`openapi.yaml`](https://sidewise.heyitsmejosh.com/openapi.yaml) · orientation for agents: [`llms.txt`](https://sidewise.heyitsmejosh.com/llms.txt).

## How it works

One Cloudflare Worker (`worker.js`) polls every feed in `src/feeds.js` and serves the page,
the API and MCP from one pooled pull:

- **`latest`**: every headline, newest first.
- **`stories`**: headlines clustered by title-keyword overlap. Each source tagged left, center or right. One-sided clusters flagged `blindspot`.

Only the feed pull is cached, under one constant key. Filtering happens per request in `shape()`, after it, and responses go out `no-store`. The zone's CDN cache ignores query strings, so caching them would hand one caller's `?outlet=` to everyone. Nothing is refetched either way. Only the cheap filtering runs again.

Clusters are filtered *after* clustering. The flat feed is filtered *before* its 120-item cap. Both orders matter. Narrow the input first and you lose the cross-outlet comparison. Filter after the cap and small outlets vanish.

![architecture](architecture.svg)

## Bias scores

Each source has a score from `-2` (left) to `+2` (right). `0` is center, or non-political for tech outlets like Hacker News and Daring Fireball. I assigned these by hand in `FEEDS`. They are a rough lean, not a rating.

CBC · The Guardian · NPR · BBC · Global News · National Post · Fox News · NY Post · Daily Wire · Hacker News · Daring Fireball · NBC News · Wall Street Journal · NY Post Opinion · Vancouver Sun · The Province

Add one by appending `[outlet, bias, url]` to `FEEDS` at the top of `worker.js`. Any RSS 2.0 or Atom feed works.

## Develop

```
npm test         # 95 checks, no network
npm run feeds    # check every feed for freshness, not just a 200
npm run deploy   # wrangler deploy
```

Run `npm run feeds` after touching `FEEDS`. It checks **recency**, the only way to catch a
zombie: a feed that still answers 200 with clean XML whose newest item is two years old. CNN
did that for three years. An item count never noticed.

Cloudflare Workers plus Static Assets. One deploy serves the page, `/api/stories` and `/mcp`.

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

MIT 2026, Joshua Trommel. Headlines and links belong to their publishers. Sidewise stores nothing and links out to the original.

## Whitepaper

[Technical whitepaper](WHITEPAPER.md)

## API and agent tools

REST (`/api/*`), the `POST /mcp` server, and the reader's in-page WebMCP tools
(`public/webmcp.js`) expose the same four operations. They are tested against each other so
they can't drift. See [`docs/API.md`](docs/API.md).
