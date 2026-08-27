// WebMCP tool registration for the in-page agent (document.modelContext), so an agent
// driving the browser gets the same four tools as one that speaks JSON-RPC to POST /mcp.
//
// ponytail: schemas are hand-copied from src/mcp.js rather than imported, because src/mcp.js
// is a Worker module (imports feeds.js/stories.js/load.js) with no browser-safe bundle to
// pull into a plain <script>. src/mcp.js stays the source of truth — TOOLS there and TOOLS
// here must be kept in lockstep by hand, and test/webmcp.test.mjs fails the moment they drift.
// All four tools are read-only GETs, so none needs requiresConfirmation.
(function () {
  const mc = document.modelContext;
  if (!mc?.registerTool) return;

  // Kept in sync with FEEDS in src/feeds.js (source of truth); test/webmcp.test.mjs checks
  // this whole schema against src/mcp.js's TOOLS, whose `enum` here is derived from OUTLETS.
  const OUTLETS = [
    'CBC', 'The Guardian', 'NPR', 'BBC', 'Global News', 'National Post', 'Fox News',
    'NY Post', 'Daily Wire', 'Hacker News', 'Daring Fireball', 'NBC News', 'Wall Street Journal',
    'New York Post Opinion', 'Vancouver Sun', 'The Province',
  ];

  const BIAS_NOTE = 'Each source carries a bias score from -2 (left) to +2 (right); 0 is center or non-political.';

  async function getJSON(path) {
    const res = await fetch(path);
    return res.json();
  }

  const TOOLS = [
    {
      name: 'get_news',
      description:
        'Current headlines from newsline\'s feeds across the political spectrum. ' + BIAS_NOTE +
        ' Use view=latest for a flat reverse-chronological feed, or view=stories to group the same event as covered by different outlets.',
      inputSchema: {
        type: 'object',
        properties: {
          view: { type: 'string', enum: ['latest', 'stories', 'both'], description: 'Flat feed, clustered by story, or both. Default both.' },
          outlet: { type: 'string', enum: OUTLETS, description: 'Restrict to a single outlet.' },
          bias: { type: 'string', enum: ['left', 'center', 'right'], description: 'Restrict to outlets of one political lean.' },
          developing: { type: 'boolean', description: 'Only stories several newsrooms picked up in the last 90 minutes.' },
          q: { type: 'string', description: 'Case-insensitive substring match on headline text.' },
          limit: { type: 'integer', description: 'Max results, up to 200.' },
        },
      },
      async execute(args) {
        const p = new URLSearchParams();
        for (const k of ['view', 'outlet', 'bias', 'developing', 'q', 'limit']) {
          if (args?.[k] != null) p.set(k, args[k]);
        }
        const qs = p.toString();
        return getJSON(`/api/stories${qs ? `?${qs}` : ''}`);
      },
    },
    {
      name: 'get_blindspots',
      description:
        'Stories covered by only one side of the political spectrum — reported by left-leaning outlets but not right-leaning, or vice versa. ' +
        BIAS_NOTE + ' Useful for finding what a given audience is not being told.',
      inputSchema: {
        type: 'object',
        properties: { limit: { type: 'integer', description: 'Max stories, up to 200.' } },
      },
      async execute(args) {
        const p = new URLSearchParams({ view: 'stories', blindspot: 'true' });
        if (args?.limit != null) p.set('limit', args.limit);
        return getJSON(`/api/stories?${p.toString()}`);
      },
    },
    {
      name: 'compare_coverage',
      description:
        'Side-by-side wording of one story as left, center and right outlets headline it, plus the words each side uses that the others do not. ' +
        'Give a topic in `q` and the best-covered matching story is compared. ' + BIAS_NOTE,
      inputSchema: {
        type: 'object',
        properties: {
          q: { type: 'string', description: 'Topic or headline words to find the story by.' },
          limit: { type: 'integer', description: 'How many matching stories to compare. Default 1, max 10.' },
        },
        required: ['q'],
      },
      // No server route computes this client-side yet, so we route it through the MCP
      // JSON-RPC endpoint newsline already runs, keeping the response identical either way.
      async execute(args) {
        const res = await fetch('/mcp', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            jsonrpc: '2.0', id: 1, method: 'tools/call',
            params: { name: 'compare_coverage', arguments: args || {} },
          }),
        });
        const { result } = await res.json();
        return result?.structuredContent ?? result;
      },
    },
    {
      name: 'get_feed_health',
      description:
        'Which of the underlying news feeds answered on the last pull, and whether the data currently being served is complete or a stale fallback. ' +
        'Check this before treating an empty or one-sided result as real.',
      inputSchema: { type: 'object', properties: {} },
      async execute() {
        return getJSON('/api/health');
      },
    },
  ];

  for (const tool of TOOLS) {
    try {
      mc.registerTool(tool);
    } catch (err) {
      console.warn(`webmcp: failed to register ${tool.name}`, err);
    }
  }
})();
