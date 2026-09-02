# Sidewise Technical Whitepaper

**v0.4.0** | August 2026

What is the other side reading?

Sidewise pulls headlines from newsrooms across the spectrum, clusters the same story
together, tags each source left, center or right, and flags the blindspots: stories
only one side is covering. Live at
[sidewise.heyitsmejosh.com](https://sidewise.heyitsmejosh.com).

This paper leads with the clustering algorithm. Everything else is supporting
detail.

## Story Clustering Algorithm

The core bet is that same-story detection doesn't need embeddings or an LLM , 
title-keyword overlap is enough at headline scale.

1. **Normalize**: each headline is lowercased, stripped of punctuation and
   stopwords, and reduced to a keyword set.
2. **Cluster**: headlines are compared pairwise by keyword-set overlap. Two
   headlines sharing enough keywords join the same cluster; clusters merge
   transitively. One pass over the feed is enough at ~15 sources.
3. **Bias tag**: every source carries a static left/center/right label
   (declared in the `FEEDS` table at the top of `worker.js`). A cluster's
   coverage profile is just the set of bias labels of its members.
4. **Blindspot**: a cluster covered by only one side of the spectrum is
   flagged as a blindspot story.

## Feed Pipeline

A single Cloudflare Worker (`worker.js`) polls the 15 RSS/Atom feeds in
parallel and serves one `/api/stories` response with two views:

- **`latest`**: flat reverse-chronological feed of every headline (dateless
  items sink to the bottom). The default reader view.
- **`stories`**: the bias-clustered view above.

Each feed has its own error boundary; a dead source returns nothing instead of
blocking the rest. The parser handles both RSS 2.0 and Atom. Adding a source
is one line: `[outlet, bias, url]` appended to `FEEDS`.

## Sources

CBC · The Guardian · CNN · NPR · MSNBC · BBC · Reuters · AP · CTV ·
Global News · National Post · Fox News · NY Post · Daily Wire · Hacker News

## Frontend

`public/index.html`, served by the same Worker via Workers Static Assets, one
deploy ships page and API together. Latest reader with a per-source picker and
search, plus tabs into the bias view. No framework, no build step.

## Testing and Deploy

`node test.mjs` covers the parser, latest-feed sort, and clustering.
`npm run deploy` runs `wrangler deploy`.

## Native apps

SwiftUI iOS and macOS readers hit the same `/api/stories` endpoint. Built
2026-08-11, not yet submitted to the App Store. The same feed API also backs
Inkpress's seeded subscription list and the `/news` briefing skill.

## Planned: Inverted-Index Clustering

The greedy pass described above compares each incoming headline against every
cluster built so far. With one merge threshold and no index that is O(n·k)
Jaccard computations per refresh, and, more importantly, the result depends
on arrival order, because a cluster's keyword set grows as it absorbs items and
therefore matches progressively more loosely.

Two changes address both at once. First, an inverted index from keyword to
cluster ids: a headline only gets compared against clusters that share at least
one keyword with it, which is a small fraction of the total and removes the
scan. Second, treat the pass as connected components rather than as first-match
assignment, score every candidate pair, keep the edges above threshold, and
run union-find over them. Components do not depend on the order the edges are
discovered, so the same set of headlines produces the same clusters regardless
of which outlet published first.

Cluster titles stay chosen the way they are now (newest headline in the
component wins). Beyond that sits the embeddings upgrade, where keyword overlap
is replaced by cosine similarity over sentence vectors and the same union-find
step runs unchanged on top.

## License

MIT 2026, Joshua Trommel
