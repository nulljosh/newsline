# Launch drafts

Not published. Post whenever — best window for HN is Tue–Thu, 8–10am ET.

The hook is **blindspots**, not "news API." Ground News charges a subscription for the
"which side isn't covering this" view; this gives it away and makes it agent-callable.
Lead with that or the post dies.

---

## Show HN

**Title** (80 char limit, keep it under that):

> Show HN: Free news API that flags stories only one side of the media is covering

Alternates:
- `Show HN: Sidewise – news API with political bias tags and blindspot detection`
- `Show HN: An MCP server that tells you what your side isn't reporting`

**Body:**

I built a small news API that pulls 16 outlets across the political spectrum and does two
things with them.

The first is a flat feed. The second is the interesting one: it clusters headlines that are
covering the same event, tags each source left/center/right, and flags a story as a
"blindspot" when every outlet covering it sits on one side. That's the "here's what your
side isn't telling you" view — the thing Ground News charges a subscription for. This is
free and unauthenticated.

    curl 'https://sidewise.heyitsmejosh.com/api/stories?view=stories&blindspot=true'

It's also an MCP server, so you can hand it to an agent directly:

    claude mcp add --transport http sidewise https://sidewise.heyitsmejosh.com/mcp

Two tools: `get_news` (filter by outlet, bias, keyword) and `get_blindspots`.

Implementation is one Cloudflare Worker, about 250 lines. Feeds are pulled at most every
two minutes and cached at the edge; filtering happens per-request downstream of the cache.
Clustering is a naive title-keyword overlap — good enough that same-event headlines group
correctly most of the time, and bad enough that it occasionally clusters an outlet with
itself. Embeddings are the obvious upgrade and I haven't needed them yet.

Honest caveats: the bias scores are mine, hand-assigned per outlet, not a third-party
rating — treat them as a rough lean rather than a measurement. It's US/Canada heavy. And
"blindspot" only means one side's outlets in my list covered it, which is a much weaker
claim than the label suggests.

Source: https://github.com/nulljosh/sidewise

---

## r/mcp (shorter)

**Title:** `Sidewise – MCP server for news with political bias tags and blindspot detection`

I put an MCP server in front of 17 news RSS feeds.

    claude mcp add --transport http sidewise https://sidewise.heyitsmejosh.com/mcp

Two tools. `get_news` filters current headlines by outlet, political lean, or keyword.
`get_blindspots` returns stories where every outlet covering them is on the same side of
the spectrum — useful for asking an agent "what is my side not reporting today."

Free, no auth, no rate limit. Remote streamable-HTTP, so there's nothing to install.
It's listed in the official registry as `io.github.nulljosh/sidewise`.

Bias scores are hand-assigned by me, not a third-party rating. Source is MIT:
https://github.com/nulljosh/sidewise

---

## Notes for whoever posts this

- Be around for the first two hours to answer comments. An unanswered Show HN sinks.
- The predictable objection is "your bias ratings are wrong / who are you to rate bias."
  Don't argue it — the caveat is already in the post, the feed list is one array at the top
  of `worker.js`, and PRs are welcome. Say that and move on.
- The second objection is "this is just Ground News." Correct answer: yes, the one feature
  of it, free, and callable by an agent rather than a webapp you have to look at.
