# API

Sidewise exposes one set of data — current headlines, clustered by story, tagged with
political bias — through three surfaces that all answer the same four questions:

| Operation | REST | MCP (`POST /mcp`) tool | WebMCP tool (`public/webmcp.js`) |
|---|---|---|---|
| Headlines, flat or clustered | `GET /api/stories` | `get_news` | `get_news` |
| One-sided stories | `GET /api/stories?blindspot=true` | `get_blindspots` | `get_blindspots` |
| Cross-outlet wording comparison | — (MCP/WebMCP only) | `compare_coverage` | `compare_coverage` |
| Feed/data-freshness status | `GET /api/health` | `get_feed_health` | `get_feed_health` |

The tool names and input schemas are defined once, in `src/mcp.js`, and everything else
either reuses them directly (`POST /mcp`) or is kept identical to them by hand with a test
enforcing it (`public/webmcp.js`, checked against `src/mcp.js` by
`test/webmcp.test.mjs`). If you're an agent picking a transport: it does not matter which
one you use, the tool names, parameters and results are the same.

For full parameter/response detail, see the two existing reference docs rather than
duplicating them here:

- [`openapi.yaml`](../public/openapi.yaml) — formal OpenAPI 3.1 spec for the REST routes.
- [`llms.txt`](../public/llms.txt) — plain-English orientation for an agent landing on the
  site cold, written to the [llms.txt convention](https://llmstxt.org/).

This page is the map across all three surfaces; those two are the spec for one of them
(REST).

## 1. REST — `GET /api/*`

Base: `https://sidewise.heyitsmejosh.com`. No API key, no rate limit, CORS open to all origins.

- `GET /api/stories` — headlines. Query params: `view` (`latest`/`stories`/`both`),
  `outlet`, `bias` (`left`/`center`/`right`), `blindspot`, `developing`, `q`, `limit`.
  Full schema in `openapi.yaml`.
- `GET /api/health` — feed health summary; **503** when more than half the underlying
  feeds are down (`degraded: true`), in which case the response also carries `stale: true`
  and the payload is the last good pull rather than an empty one.
- `GET /api/sources` — the outlet list with bias scores, `Cache-Control: public,
  max-age=3600`.
- `GET /.well-known/security.txt`.

`compare_coverage` has no REST equivalent — it only exists via `/mcp` and WebMCP, both of
which happen to share one implementation (`callTool` in `src/mcp.js`).

## 2. MCP — `POST /mcp` (JSON-RPC over HTTP)

Stateless streamable-HTTP MCP server, implemented in `src/mcp.js`. Supports `initialize`,
`notifications/initialized`, `ping`, `tools/list`, `tools/call`.

```
claude mcp add --transport http sidewise https://sidewise.heyitsmejosh.com/mcp
```

Tool list (`TOOLS` in `src/mcp.js`) and dispatch (`callTool`) are the canonical source for
names and input schemas — every other surface either imports or mirrors these:

- **`get_news`** — `{ view, outlet, bias, developing, q, limit }`. Current headlines, flat
  or clustered by story.
- **`get_blindspots`** — `{ limit }`. Stories covered by only one political side.
- **`compare_coverage`** — `{ q (required), limit }`. Side-by-side headline wording for the
  best-matching story, plus words unique to each side.
- **`get_feed_health`** — `{}`. Which feeds answered on the last pull, and whether the
  response is live or a stale fallback.

A tool error comes back as an MCP tool result with `isError: true`, not a transport-level
failure, so a client can show the message and retry instead of losing the connection.

## 3. WebMCP — in-page tools on `public/reader.html`

`public/webmcp.js` registers the same four tools with `document.modelContext` (the
[WebMCP](https://github.com/webmachinelearning/webmcp) in-page tool API) for an agent
driving the browser directly, rather than speaking JSON-RPC to `/mcp`. It:

- Bails out silently if `document.modelContext` isn't present (no WebMCP-capable agent in
  the tab).
- Reuses the exact tool names and `inputSchema`s from `src/mcp.js` — hand-copied (a Worker
  module with `feeds.js`/`stories.js`/`load.js` imports can't be pulled into a plain
  browser `<script>`), but pinned to that file by a comment and by
  `test/webmcp.test.mjs`, which fails the test suite if the two drift.
- Implements `get_news`, `get_blindspots` and `get_feed_health` as thin `fetch()` calls
  against `/api/stories` / `/api/health` — the same requests the reader page itself
  already makes.
- Implements `compare_coverage` by calling `POST /mcp` (`tools/call`), since that
  computation has no REST route — one call site, so the WebMCP and MCP answers for it are
  always identical.
- Needs no `requiresConfirmation` on any tool: every operation is a read against a GET-only
  API.

Registered on `public/reader.html` (the actual app — search, filter, browse). **Not**
registered on `public/index.html`, which is a static marketing/landing page with a
JS-rendered headline wall but no interactive reading surface for an agent to act on; an
agent that wants the tools can just open `/reader.html`.

## Keeping the three in sync

`src/mcp.js` is the contract. If you add a parameter, rename a tool, or change a schema:

1. Edit `TOOLS` / `callTool` in `src/mcp.js` — this updates REST-adjacent behavior and the
   `POST /mcp` server together, since `worker.js` calls straight into it.
2. Update `public/webmcp.js`'s hand-copied `TOOLS` array to match.
3. Run `npm test` — `test/webmcp.test.mjs` asserts the two tool lists and schemas are
   `deepEqual`; it fails loudly if you forget step 2.
4. Update `openapi.yaml` / `llms.txt` if the change touches a REST-facing param.
