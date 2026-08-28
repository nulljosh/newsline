// Stateless MCP over HTTP: no sessions to keep, so the streamable transport reduces to
// JSON-RPC in, JSON-RPC out. ponytail: hand-rolled to avoid the agents SDK + a Durable Object.

import { FEEDS, OUTLETS, PUBLISHER_COUNT } from './feeds.js';
import { shape, compare, keywords } from './stories.js';
import { VERSION } from './load.js';

export const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'content-type, mcp-protocol-version',
  'access-control-allow-methods': 'GET, POST, OPTIONS',
};

export const json = (body, init = {}) => new Response(JSON.stringify(body), {
  ...init,
  headers: { 'content-type': 'application/json', ...CORS, ...init.headers },
});

const BIAS_NOTE = 'Each source carries a bias score from -2 (left) to +2 (right); 0 is center or non-political.';
// Derived, not hardcoded. The outlet count used to be written out by hand in five places and
// was wrong in all five (22 / 17 / 16) — every one of them drifted from FEEDS.
const SCALE = `${FEEDS.length} feeds from ${PUBLISHER_COUNT} newsrooms`;

export const TOOLS = [
  {
    name: 'get_news',
    description:
      `Current headlines from ${SCALE} across the political spectrum. ` + BIAS_NOTE +
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
  },
  {
    name: 'get_feed_health',
    description:
      'Which of the underlying news feeds answered on the last pull, and whether the data currently being served is complete or a stale fallback. ' +
      'Check this before treating an empty or one-sided result as real.',
    inputSchema: { type: 'object', properties: {} },
  },
];

const clampLimit = (v, max = 200) =>
  (Number.isFinite(v) && v > 0 ? Math.min(Math.floor(v), max) : undefined);

export async function callTool(name, rawArgs, load) {
  // A JSON-RPC client may legitimately send `"arguments": null`; a destructure on that throws.
  const args = rawArgs && typeof rawArgs === 'object' ? rawArgs : {};
  const { updated, items, health, degraded, stale } = await load();
  const limit = clampLimit(args.limit);

  switch (name) {
    case 'get_news':
      return shape(items, { ...args, limit, updated });
    case 'get_blindspots':
      return shape(items, { view: 'stories', blindspot: true, limit, updated });
    case 'compare_coverage': {
      const q = typeof args.q === 'string' ? args.q.trim() : '';
      if (!q) return { error: 'compare_coverage needs a `q` describing the story.' };
      const n = clampLimit(args.limit, 10) ?? 1;
      // Rank by how much of the query the cluster actually accounts for, then by how many
      // newsrooms are in it — a two-outlet exact match is less useful than a ten-outlet one.
      const wanted = keywords(q);
      const scored = shape(items, { view: 'stories', limit: 200, updated }).stories
        .map(s => {
          const kw = keywords(s.title);
          let hits = 0;
          for (const w of wanted) if (kw.has(w)) hits++;
          return { s, score: wanted.size ? hits / wanted.size : 0 };
        })
        .filter(x => x.score > 0)
        .sort((a, b) => b.score - a.score || b.s.publishers - a.s.publishers)
        .slice(0, n);
      if (!scored.length) return { updated, query: q, matches: [], note: 'No current story matches that.' };
      return { updated, query: q, matches: scored.map(({ s }) => compare(s)) };
    }
    case 'get_feed_health':
      return {
        updated,
        healthy: health.filter(h => h.ok).length,
        total: health.length,
        degraded: !!degraded,
        stale: !!stale,
        feeds: health,
      };
    default:
      return null;
  }
}

export async function mcp(req, load) {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (req.method !== 'POST') return json({ error: 'POST JSON-RPC to this endpoint' }, { status: 405 });

  let msg;
  try {
    msg = await req.json();
  } catch {
    return json({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } }, { status: 400 });
  }
  if (!msg || typeof msg !== 'object' || Array.isArray(msg)) {
    return json({ jsonrpc: '2.0', id: null, error: { code: -32600, message: 'Invalid Request' } }, { status: 400 });
  }

  // `params = {}` only defaults on undefined, so an explicit `"params": null` — which is
  // valid JSON-RPC — used to reach `params.protocolVersion` and throw a 500 at the client.
  const { id = null, method } = msg;
  const params = msg.params && typeof msg.params === 'object' ? msg.params : {};
  const reply = result => json({ jsonrpc: '2.0', id, result });

  switch (method) {
    case 'initialize':
      return reply({
        protocolVersion: params.protocolVersion || '2025-06-18',
        capabilities: { tools: {} },
        serverInfo: { name: 'newsline', version: VERSION },
      });
    case 'notifications/initialized':
      return new Response(null, { status: 202, headers: CORS });
    case 'ping':
      return reply({});
    case 'tools/list':
      return reply({ tools: TOOLS });
    case 'tools/call': {
      let result;
      try {
        result = await callTool(params.name, params.arguments || {}, load);
      } catch (err) {
        // A tool blowing up is a tool result, not a transport error — an MCP client should
        // see the message and be able to retry, not get a dead connection.
        return reply({ content: [{ type: 'text', text: `newsline: ${err.message}` }], isError: true });
      }
      if (!result) {
        return json({ jsonrpc: '2.0', id, error: { code: -32602, message: `Unknown tool: ${params.name}` } });
      }
      return reply({ content: [{ type: 'text', text: JSON.stringify(result) }], structuredContent: result });
    }
    default:
      return json({ jsonrpc: '2.0', id, error: { code: -32601, message: `Method not found: ${method}` } });
  }
}
