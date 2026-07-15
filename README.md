<img src="icon.svg" width="80" style="border-radius:18px">

# Newsline

![version](https://img.shields.io/badge/version-v0.1.0-blue) ![license](https://img.shields.io/badge/license-MIT-green) [![GitHub](https://img.shields.io/badge/GitHub-nulljosh%2Fnewsline-black?logo=github)](https://github.com/nulljosh/newsline)

Multi-outlet news aggregator that clusters same-story headlines across 14 RSS feeds, tags each outlet's political bias, and flags "blindspot" stories only one side covers.

[Live](https://news.heyitsmejosh.com)

## How it works

A Cloudflare Worker (`worker.js`) polls 14 RSS feeds, clusters headlines covering the same story by title-keyword overlap, and tags each source left/center/right. The frontend (`public/index.html`) renders a bias bar per story plus search and filter tabs (all / left-covered / center-covered / right-covered / blindspots).

## Stack

Cloudflare Workers + Workers Static Assets — single deploy serves both the page and `/api/stories`.

```
wrangler deploy
```

## License

MIT 2026, Joshua Trommel
