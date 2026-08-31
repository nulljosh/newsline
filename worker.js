// sidewise worker: fetch multi-outlet RSS, cluster same-story headlines, tag bias.
// Serves four surfaces off one pooled feed pull: the web reader, /api/*, /mcp, and the
// static site. The interesting logic lives in src/ so it can be tested without a Worker.

import { FEEDS, OUTLETS, PUBLISHERS, PUBLISHER_COUNT, publisherOf } from './src/feeds.js';
import { decode, parseItems, safeLink, stripTags } from './src/parse.js';
import {
  cluster, compare, coverage, distinctive, keywords, latest, shape, side,
} from './src/stories.js';
import { loadItems, minHealthy, mergeSeen, pullFeeds, VERSION } from './src/load.js';
import { CORS, callTool, json, mcp, TOOLS } from './src/mcp.js';

// Re-exported so test.mjs and check-feeds.mjs keep importing from one place.
export {
  FEEDS, OUTLETS, PUBLISHERS, PUBLISHER_COUNT, publisherOf,
  decode, parseItems, safeLink, stripTags,
  cluster, compare, coverage, distinctive, keywords, latest, shape, side,
  loadItems, minHealthy, mergeSeen, pullFeeds,
  CORS, callTool, mcp, TOOLS, VERSION,
};

export function parseQuery(url) {
  const p = url.searchParams;
  const limit = parseInt(p.get('limit'), 10);
  const flag = name => p.get(name) === 'true' || p.get(name) === '1';
  return {
    view: ['latest', 'stories', 'both'].includes(p.get('view')) ? p.get('view') : 'both',
    outlet: p.get('outlet') || undefined,
    bias: ['left', 'center', 'right'].includes(p.get('bias')) ? p.get('bias') : undefined,
    blindspot: flag('blindspot'),
    developing: flag('developing'),
    compare: flag('compare'),
    q: p.get('q') || undefined,
    limit: Number.isFinite(limit) && limit > 0 ? Math.min(limit, 200) : undefined,
  };
}

// ponytail: served from the worker, not public/, because Workers Static Assets skips dot-directories.
const SECURITY_TXT = `Contact: mailto:trommatic@icloud.com
Expires: 2027-01-01T00:00:00.000Z
Preferred-Languages: en
Canonical: https://sidewise.heyitsmejosh.com/.well-known/security.txt
`;

/// Health summary shipped alongside every /api/stories response. Clients that used to have
/// no way of telling "quiet news day" from "nine feeds are down" can now tell.
const healthSummary = ({ health = [], degraded, stale }) => ({
  healthy: health.filter(h => h.ok).length,
  total: health.length,
  degraded: !!degraded,
  stale: !!stale,
  ...(health.some(h => !h.ok) ? { down: health.filter(h => !h.ok).map(h => h.outlet) } : {}),
});

async function route(req, url, env, ctx) {
  if (url.pathname === '/mcp') {
    return mcp(req, () => loadItems(url.origin, ctx));
  }

  if (url.pathname === '/.well-known/security.txt') {
    return new Response(SECURITY_TXT, {
      headers: { 'content-type': 'text/plain; charset=utf-8', ...CORS },
    });
  }

  if (url.pathname.startsWith('/api/')) {
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      return json({ error: `${req.method} not allowed`, allow: 'GET, HEAD, OPTIONS' },
        { status: 405, headers: { allow: 'GET, HEAD, OPTIONS' } });
    }

    if (url.pathname.startsWith('/api/stories')) {
      const pull = await loadItems(url.origin, ctx);
      // ponytail: no-store is deliberate, not an oversight. The zone's CDN cache ignores the
      // query string, so letting it cache these would serve one caller's ?outlet= to everyone
      // (verified: the first request for any variant came back unfiltered). The expensive part
      // — pulling every feed — is already cached inside the worker, so nothing is refetched;
      // only the cheap per-request filtering runs again.
      const body = {
        ...shape(pull.items, { ...parseQuery(url), updated: pull.updated }),
        health: healthSummary(pull),
      };
      return json(body, { headers: { 'cache-control': 'no-store' } });
    }

    if (url.pathname === '/api/health') {
      const pull = await loadItems(url.origin, ctx);
      const summary = healthSummary(pull);
      return json({
        version: VERSION,
        updated: pull.updated,
        items: pull.items.length,
        ...summary,
        feeds: pull.health,
      }, {
        // A monitor should see a non-200 when half the feeds are gone.
        status: summary.degraded ? 503 : 200,
        headers: { 'cache-control': 'no-store' },
      });
    }

    if (url.pathname === '/api/sources') {
      return json({
        count: FEEDS.length,
        publishers: PUBLISHER_COUNT,
        sources: FEEDS.map(([outlet, bias, feed, publisher]) => ({
          outlet, bias, side: side(bias), publisher: publisher || outlet, feed,
        })),
      }, { headers: { 'cache-control': 'public, max-age=3600' } });
    }

    // Previously an /api typo fell through to the static-asset handler and came back as HTML,
    // which is a confusing thing to hand a JSON client.
    return json({ error: `Unknown endpoint: ${url.pathname}`,
      endpoints: ['/api/stories', '/api/health', '/api/sources', '/mcp'] }, { status: 404 });
  }

  return env.ASSETS.fetch(req);
}

export default {
  async fetch(req, env, ctx) {
    const url = new URL(req.url);
    // Old domain, kept alive only to forward links published before the sidewise rename.
    if (url.hostname === 'news.heyitsmejosh.com') {
      url.hostname = 'sidewise.heyitsmejosh.com';
      return Response.redirect(url.toString(), 301);
    }
    try {
      return await route(req, url, env, ctx);
    } catch (err) {
      // Without this a throw anywhere in the pipeline returns a Workers 1101 page: HTML, no
      // CORS headers, opaque to every client we have.
      console.error('sidewise route error', url.pathname, err?.stack || err);
      const body = { error: 'Internal error', path: url.pathname };
      return url.pathname.startsWith('/api/') || url.pathname === '/mcp'
        ? json(body, { status: 500, headers: { 'cache-control': 'no-store' } })
        : new Response('Something went wrong.', { status: 500, headers: { 'content-type': 'text/plain' } });
    }
  },
};
