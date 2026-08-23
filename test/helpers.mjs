// Shared fakes. Everything here is in-memory: the suite never touches the network.

/// Stands in for `caches.default`. Ignores max-age — tests control time explicitly instead.
export function memoryCache() {
  const store = new Map();
  return {
    store,
    async match(req) {
      const hit = store.get(typeof req === 'string' ? req : req.url);
      return hit ? hit.clone() : undefined;
    },
    async put(req, res) {
      store.set(typeof req === 'string' ? req : req.url, res.clone());
    },
  };
}

/// A fetch that answers from a { url: body | {status, body} } table and records calls.
export function fakeFetch(table) {
  const calls = [];
  const impl = async (url) => {
    calls.push(url);
    const entry = table[url];
    if (entry === undefined) return new Response('not found', { status: 404 });
    if (typeof entry === 'string') return new Response(entry, { status: 200 });
    if (entry instanceof Error) throw entry;
    return new Response(entry.body ?? '', { status: entry.status ?? 200 });
  };
  impl.calls = calls;
  return impl;
}

export const rssFeed = (...titles) =>
  `<rss><channel>${titles.map((t, i) =>
    `<item><title>${t}</title><link>https://example.com/${encodeURIComponent(t)}</link>` +
    `<pubDate>${new Date(Date.UTC(2026, 0, 15, 10, i)).toUTCString()}</pubDate></item>`).join('')
  }</channel></rss>`;

export const item = (over = {}) => ({
  title: 'A headline', link: 'https://example.com/a', outlet: 'BBC',
  publisher: 'BBC', bias: 0, ts: 1000, ...over,
});

/// Minimal env for the worker's fetch handler.
export const fakeEnv = () => ({
  ASSETS: { fetch: async req => new Response(`asset:${new URL(req.url).pathname}`, { status: 200 }) },
});

export const fakeCtx = () => {
  const pending = [];
  return { waitUntil: p => pending.push(p), settle: () => Promise.allSettled(pending) };
};
