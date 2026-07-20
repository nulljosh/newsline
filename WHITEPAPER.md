# Newsline Technical Whitepaper

**v0.2.0** | July 2026

Newsline is an RSS news reader across 15 sources with a Ground News-style bias
view: same-story headlines clustered together, tagged left/center/right, with
blindspot detection for stories only one side covers. Live at
[news.heyitsmejosh.com](https://news.heyitsmejosh.com).

This paper leads with the clustering algorithm. Everything else is supporting
detail.

## Story Clustering Algorithm

The core bet is that same-story detection doesn't need embeddings or an LLM —
title-keyword overlap is enough at headline scale.

1. **Normalize** — each headline is lowercased, stripped of punctuation and
   stopwords, and reduced to a keyword set.
2. **Cluster** — headlines are compared pairwise by keyword-set overlap. Two
   headlines sharing enough keywords join the same cluster; clusters merge
   transitively. One pass over the feed is enough at ~15 sources.
3. **Bias tag** — every source carries a static left/center/right label
   (declared in the `FEEDS` table at the top of `worker.js`). A cluster's
   coverage profile is just the set of bias labels of its members.
4. **Blindspot** — a cluster covered by only one side of the spectrum is
   flagged as a blindspot story.

## Feed Pipeline

A single Cloudflare Worker (`worker.js`) polls the 15 RSS/Atom feeds in
parallel and serves one `/api/stories` response with two views:

- **`latest`** — flat reverse-chronological feed of every headline (dateless
  items sink to the bottom). The default reader view.
- **`stories`** — the bias-clustered view above.

Each feed has its own error boundary; a dead source returns nothing instead of
blocking the rest. The parser handles both RSS 2.0 and Atom. Adding a source
is one line: `[outlet, bias, url]` appended to `FEEDS`.

## Sources

CBC · The Guardian · CNN · NPR · MSNBC · BBC · Reuters · AP · CTV ·
Global News · National Post · Fox News · NY Post · Daily Wire · Hacker News

## Frontend

`public/index.html`, served by the same Worker via Workers Static Assets — one
deploy ships page and API together. Latest reader with a per-source picker and
search, plus tabs into the bias view. No framework, no build step.

## Testing and Deploy

`node test.mjs` covers the parser, latest-feed sort, and clustering.
`npm run deploy` runs `wrangler deploy`.

## License

MIT 2026, Joshua Trommel
