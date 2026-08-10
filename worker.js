// newsline worker: fetch multi-outlet RSS, cluster same-story headlines, tag bias.
// Serves three surfaces off one cached feed pull: the web page, /api/stories, and an MCP server at /mcp.
// ponytail: naive O(n²) title-overlap clustering; upgrade to embeddings if quality matters.

const VERSION = '0.3.0';

const FEEDS = [
  // [outlet, bias(-2 left .. +2 right), url]
  ['CBC', -1, 'https://www.cbc.ca/webfeed/rss/rss-topstories'],
  ['The Guardian', -1, 'https://www.theguardian.com/world/rss'],
  ['CNN', -1, 'http://rss.cnn.com/rss/cnn_topstories.rss'],
  ['NPR', -1, 'https://feeds.npr.org/1001/rss.xml'],
  ['BBC', 0, 'https://feeds.bbci.co.uk/news/world/rss.xml'],
  // Dropped 2026-08-09, all silently contributing zero items: Reuters killed its public RSS
  // (feeds.reuters.com no longer resolves), AP never had one (the rsshub.app mirror now 403s),
  // MSNBC and CTV both 404, and the Washington Post feed 301s to a dead end. Every remaining
  // feed below was verified to return items. Re-add any of them if an official feed reappears.
  ['Global News', 0, 'https://globalnews.ca/feed/'],
  ['National Post', 1, 'https://nationalpost.com/feed'],
  ['Fox News', 2, 'https://moxie.foxnews.com/google-publisher/latest.xml'],
  ['NY Post', 2, 'https://nypost.com/feed/'],
  ['Daily Wire', 2, 'https://www.dailywire.com/feeds/rss.xml'],
  ['Hacker News', 0, 'https://hnrss.org/frontpage'], // tech, no political lean
  ['Daring Fireball', 0, 'https://daringfireball.net/feeds/main'], // tech commentary, no political lean
  ['NBC News', -1, 'https://feeds.nbcnews.com/nbcnews/public/news'],
  ['Wall Street Journal', 1, 'https://feeds.a.dj.com/rss/RSSWorldNews.xml'],
  ['New York Post Opinion', 2, 'https://nypost.com/opinion/feed/'],
  ['Vancouver Sun', 0, 'https://vancouversun.com/feed'],
  ['The Province', 0, 'https://theprovince.com/feed'],
];

const OUTLETS = FEEDS.map(([outlet]) => outlet);

const STOP = new Set('the a an of to in on for and or as at by is are was with after over from amid says say new'.split(' '));

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };

// Feeds double-escape freely; consumers should get real text, not &#8217; and &amp;.
export function decode(s) {
  return s.replace(/&(?:#(\d+)|#x([0-9a-f]+)|([a-z]+));/gi, (m, dec, hex, name) =>
    dec ? String.fromCodePoint(+dec)
      : hex ? String.fromCodePoint(parseInt(hex, 16))
        : ENTITIES[name.toLowerCase()] ?? m);
}

export function parseItems(xml, outlet, bias) {
  const items = [];
  // RSS uses <item> with a <link>text</link>; Atom uses <entry> with <link href="…"/>,
  // often several per entry (alternate / shorturl / related) — take the alternate.
  for (const m of xml.matchAll(/<(item|entry)\b[\s\S]*?<\/\1>/g)) {
    const block = m[0];
    const title = (block.match(/<title[^>]*>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/) || [])[1];
    const link = (
      block.match(/<link>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/link>/) ||
      block.match(/<link[^>]*\brel=["']alternate["'][^>]*\bhref=["']([^"']+)["']/) ||
      block.match(/<link[^>]*\bhref=["']([^"']+)["']/) || [])[1];
    const date = (block.match(/<(pubDate|dc:date|published|updated)>([\s\S]*?)<\/\1>/) || [])[2];
    const ts = date ? Date.parse(date.trim()) : NaN;
    if (title && link) {
      items.push({ title: decode(title.trim()), link: decode(link.trim()), outlet, bias, ts: isNaN(ts) ? 0 : ts });
    }
    if (items.length >= 25) break;
  }
  return items;
}

function keywords(title) {
  return new Set(title.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/)
    .filter(w => w.length > 2 && !STOP.has(w)));
}

function overlap(a, b) {
  let n = 0;
  for (const w of a) if (b.has(w)) n++;
  return n / Math.min(a.size, b.size);
}

export function side(bias) {
  return bias < 0 ? 'left' : bias > 0 ? 'right' : 'center';
}

// flat reverse-chron reader across every source (dateless items sink to bottom)
export function latest(items) {
  return [...items].sort((a, b) => b.ts - a.ts).slice(0, 120);
}

export function cluster(items) {
  const clusters = [];
  for (const item of items) {
    const kw = keywords(item.title);
    const hit = clusters.find(c => overlap(kw, c.kw) >= 0.5);
    if (hit) {
      hit.items.push(item);
      for (const w of kw) hit.kw.add(w);
    } else {
      clusters.push({ kw, items: [item] });
    }
  }
  return clusters
    .sort((a, b) => b.items.length - a.items.length)
    .map(c => {
      const sources = c.items.map(({ title, link, outlet, bias }) => ({ title, link, outlet, bias }));
      const sides = new Set(sources.map(s => side(s.bias)));
      return { title: c.items[0].title, sources, blindspot: sides.size === 1 && sources.length > 1 };
    });
}

// Filter + shape the cached feed pull for one request. Runs per-request, outside the cache,
// so query params can never leak one caller's filtered response to another.
// Clusters are filtered *after* clustering — narrowing items first would destroy the
// cross-outlet grouping that makes the stories view worth anything.
export function shape(items, opts = {}) {
  const { view = 'both', outlet, bias, blindspot, q, limit, updated = Date.now() } = opts;
  const needle = q ? q.toLowerCase() : '';
  const wantOutlet = outlet ? outlet.toLowerCase() : '';

  const sourceMatches = s =>
    (!wantOutlet || s.outlet.toLowerCase() === wantOutlet) && (!bias || side(s.bias) === bias);
  const titleMatches = t => !needle || t.toLowerCase().includes(needle);

  const out = { updated };

  if (view === 'stories' || view === 'both') {
    out.stories = cluster(items)
      .filter(s => (!blindspot || s.blindspot) && titleMatches(s.title) && s.sources.some(sourceMatches))
      .slice(0, limit ?? 60);
  }
  if (view === 'latest' || view === 'both') {
    // Filter before latest(), not after — latest() caps at 120, and filtering a pre-truncated
    // list makes a low-volume outlet like Daring Fireball return nothing.
    out.latest = latest(items.filter(it => sourceMatches(it) && titleMatches(it.title)))
      .slice(0, limit ?? 120);
  }
  return out;
}

function parseQuery(url) {
  const p = url.searchParams;
  const limit = parseInt(p.get('limit'), 10);
  return {
    view: ['latest', 'stories', 'both'].includes(p.get('view')) ? p.get('view') : 'both',
    outlet: p.get('outlet') || undefined,
    bias: ['left', 'center', 'right'].includes(p.get('bias')) ? p.get('bias') : undefined,
    blindspot: p.get('blindspot') === 'true',
    q: p.get('q') || undefined,
    limit: Number.isFinite(limit) && limit > 0 ? Math.min(limit, 200) : undefined,
  };
}

// One cached pull of every feed, shared by the page, the API and MCP. The cache key is
// deliberately constant (no query string) — filtering happens downstream in shape().
async function loadItems(url, ctx) {
  const cache = caches.default;
  const key = new Request(url.origin + '/items-v5'); // bump when the item shape changes
  let res = await cache.match(key);
  if (!res) {
    const results = await Promise.allSettled(FEEDS.map(async ([outlet, bias, feed]) => {
      const r = await fetch(feed, { headers: { 'user-agent': 'newsline/' + VERSION }, signal: AbortSignal.timeout(8000) });
      return parseItems(await r.text(), outlet, bias);
    }));
    const items = results.flatMap(r => r.status === 'fulfilled' ? r.value : []);
    res = new Response(JSON.stringify({ updated: Date.now(), items }), {
      headers: { 'content-type': 'application/json', 'cache-control': 'public, max-age=120' },
    });
    ctx.waitUntil(cache.put(key, res.clone()));
  }
  return res.json();
}

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'content-type, mcp-protocol-version',
  'access-control-allow-methods': 'GET, POST, OPTIONS',
};

const json = (body, init = {}) => new Response(JSON.stringify(body), {
  ...init,
  headers: { 'content-type': 'application/json', ...CORS, ...init.headers },
});

const BIAS_NOTE = 'Each source carries a bias score from -2 (left) to +2 (right); 0 is center or non-political.';

const TOOLS = [
  {
    name: 'get_news',
    description:
      'Current headlines from 22 news outlets across the political spectrum. ' + BIAS_NOTE +
      ' Use view=latest for a flat reverse-chronological feed, or view=stories to group the same event as covered by different outlets.',
    inputSchema: {
      type: 'object',
      properties: {
        view: { type: 'string', enum: ['latest', 'stories', 'both'], description: 'Flat feed, clustered by story, or both. Default both.' },
        outlet: { type: 'string', enum: OUTLETS, description: 'Restrict to a single outlet.' },
        bias: { type: 'string', enum: ['left', 'center', 'right'], description: 'Restrict to outlets of one political lean.' },
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
];

async function callTool(name, args, url, ctx) {
  const { updated, items } = await loadItems(url, ctx);
  const limit = Number.isFinite(args.limit) && args.limit > 0 ? Math.min(args.limit, 200) : undefined;
  if (name === 'get_news') return shape(items, { ...args, limit, updated });
  if (name === 'get_blindspots') return shape(items, { view: 'stories', blindspot: true, limit, updated });
  return null;
}

// Stateless MCP over HTTP: no sessions to keep, so the streamable transport reduces to
// JSON-RPC in, JSON-RPC out. ponytail: hand-rolled to avoid the agents SDK + a Durable Object.
async function mcp(req, url, ctx) {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (req.method !== 'POST') return json({ error: 'POST JSON-RPC to this endpoint' }, { status: 405 });

  let msg;
  try {
    msg = await req.json();
  } catch {
    return json({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } }, { status: 400 });
  }

  const { id = null, method, params = {} } = msg;
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
      const result = await callTool(params.name, params.arguments || {}, url, ctx);
      if (!result) {
        return json({ jsonrpc: '2.0', id, error: { code: -32602, message: `Unknown tool: ${params.name}` } });
      }
      return reply({ content: [{ type: 'text', text: JSON.stringify(result) }] });
    }
    default:
      return json({ jsonrpc: '2.0', id, error: { code: -32601, message: `Method not found: ${method}` } });
  }
}

// ponytail: served from the worker, not public/, because Workers Static Assets skips dot-directories.
const SECURITY_TXT = `Contact: mailto:trommatic@icloud.com
Expires: 2027-01-01T00:00:00.000Z
Preferred-Languages: en
Canonical: https://news.heyitsmejosh.com/.well-known/security.txt
`;

export default {
  async fetch(req, env, ctx) {
    const url = new URL(req.url);

    if (url.pathname === '/mcp') return mcp(req, url, ctx);

    if (url.pathname === '/.well-known/security.txt') {
      return new Response(SECURITY_TXT, { headers: { 'content-type': 'text/plain; charset=utf-8', ...CORS } });
    }

    if (url.pathname.startsWith('/api/stories')) {
      const { updated, items } = await loadItems(url, ctx);
      // ponytail: no-store is deliberate, not an oversight. The zone's CDN cache ignores the
      // query string, so letting it cache these would serve one caller's ?outlet= to everyone
      // (verified: the first request for any variant came back unfiltered). The expensive part
      // — pulling 22 feeds — is already cached inside the worker under items-v3, so nothing is
      // refetched; only the cheap per-request filtering runs again.
      return json(shape(items, { ...parseQuery(url), updated }), {
        headers: { 'cache-control': 'no-store' },
      });
    }

    return env.ASSETS.fetch(req);
  },
};
