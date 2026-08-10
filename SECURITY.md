# Security

## Reporting

Email **trommatic@icloud.com**. Please don't open a public issue for anything exploitable.

Expect a reply within a week. This is a solo MIT-licensed side project — there is no bug
bounty and no formal SLA.

## Supported versions

Only the deployed version at `news.heyitsmejosh.com` and the tip of `main` are supported.

## Scope

Newsline is a read-only edge worker. It has no accounts, no database, no user data, and
stores nothing — it fetches public RSS feeds and returns headlines with links back to the
publisher.

Worth reporting:

- Anything that lets a request affect what a *different* caller receives (cache poisoning
  is the realistic one — the response cache is deliberately keyed without the query string,
  and filtering happens per-request downstream of it).
- Injection through feed content into API consumers or the web page.
- A way to make the worker fetch arbitrary URLs.

Not in scope: the political bias scores are hand-assigned editorial judgement, not a
security issue. Disagreements about them belong in an issue, not a security report.

Machine-readable contact: [`/.well-known/security.txt`](https://news.heyitsmejosh.com/.well-known/security.txt)
