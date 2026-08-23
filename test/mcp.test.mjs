import { test } from 'node:test';
import assert from 'node:assert/strict';
import { callTool, mcp, TOOLS } from '../src/mcp.js';
import { item } from './helpers.mjs';

const pull = {
  updated: 1_000_000_000,
  items: [
    item({ title: 'Migrant surge overwhelms border town', link: 'a', outlet: 'Fox News', publisher: 'Fox News', bias: 2, ts: 9, firstSeen: 999_999_000 }),
    item({ title: 'Migrant arrivals rise in border town', link: 'b', outlet: 'NPR', publisher: 'NPR', bias: -1, ts: 8, firstSeen: 999_999_500 }),
    item({ title: 'Migrant numbers climb at border town', link: 'c', outlet: 'BBC', publisher: 'BBC', bias: 0, ts: 7, firstSeen: 999_999_800 }),
    item({ title: 'Left-only budget scandal report', link: 'd', outlet: 'NPR', publisher: 'NPR', bias: -1, ts: 6 }),
    item({ title: 'Left-only budget scandal fallout', link: 'e', outlet: 'CBC', publisher: 'CBC', bias: -1, ts: 5 }),
  ],
  health: [{ outlet: 'BBC', ok: true, items: 3 }, { outlet: 'Fox News', ok: false, items: 0, error: 'HTTP 500' }],
  degraded: false,
  stale: false,
};
const load = async () => pull;

const rpc = (method, params, id = 1) =>
  mcp(new Request('https://news.test/mcp', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id, method, params }),
  }), load);

test('every tool declares a name, description and object schema', () => {
  for (const t of TOOLS) {
    assert.ok(t.name && t.description, t.name);
    assert.equal(t.inputSchema.type, 'object', t.name);
  }
  assert.deepEqual(TOOLS.map(t => t.name).sort(),
    ['compare_coverage', 'get_blindspots', 'get_feed_health', 'get_news']);
});

test('the tool description derives its scale from FEEDS instead of hardcoding it', async () => {
  const { FEEDS, PUBLISHER_COUNT } = await import('../src/feeds.js');
  const news = TOOLS.find(t => t.name === 'get_news');
  assert.match(news.description, new RegExp(`${FEEDS.length} feeds from ${PUBLISHER_COUNT} newsrooms`));
});

test('initialize answers with the requested protocol version', async () => {
  const body = await (await rpc('initialize', { protocolVersion: '2025-06-18' })).json();
  assert.equal(body.result.protocolVersion, '2025-06-18');
  assert.equal(body.result.serverInfo.name, 'newsline');
  assert.ok(body.result.capabilities.tools);
});

test('notifications/initialized is acknowledged with 202 and no body', async () => {
  const res = await rpc('notifications/initialized', {});
  assert.equal(res.status, 202);
});

test('ping and tools/list work', async () => {
  assert.deepEqual((await (await rpc('ping', {})).json()).result, {});
  const list = await (await rpc('tools/list', {})).json();
  assert.equal(list.result.tools.length, TOOLS.length);
});

test('tools/call returns both text and structured content', async () => {
  const body = await (await rpc('tools/call', { name: 'get_news', arguments: { view: 'latest' } })).json();
  assert.equal(body.result.content[0].type, 'text');
  assert.ok(body.result.structuredContent.latest.length);
  assert.deepEqual(JSON.parse(body.result.content[0].text), body.result.structuredContent);
});

test('an unknown tool is a JSON-RPC invalid-params error', async () => {
  const body = await (await rpc('tools/call', { name: 'get_horoscope', arguments: {} })).json();
  assert.equal(body.error.code, -32602);
  assert.match(body.error.message, /Unknown tool/);
});

test('an unknown method is a JSON-RPC method-not-found error', async () => {
  const body = await (await rpc('resources/list', {})).json();
  assert.equal(body.error.code, -32601);
});

test('malformed JSON is a parse error, not a crash', async () => {
  const res = await mcp(new Request('https://news.test/mcp', { method: 'POST', body: '{nope' }), load);
  assert.equal(res.status, 400);
  assert.equal((await res.json()).error.code, -32700);
});

test('a JSON array body is an invalid request', async () => {
  const res = await mcp(new Request('https://news.test/mcp', { method: 'POST', body: '[]' }), load);
  assert.equal((await res.json()).error.code, -32600);
});

test('GET is rejected and OPTIONS preflights', async () => {
  const get = await mcp(new Request('https://news.test/mcp'), load);
  assert.equal(get.status, 405);
  const opt = await mcp(new Request('https://news.test/mcp', { method: 'OPTIONS' }), load);
  assert.equal(opt.status, 204);
  assert.equal(opt.headers.get('access-control-allow-origin'), '*');
});

test('a tool that throws is reported as an error result, not a dead transport', async () => {
  const explode = async () => { throw new Error('upstream on fire'); };
  const res = await mcp(new Request('https://news.test/mcp', {
    method: 'POST', body: JSON.stringify({ jsonrpc: '2.0', id: 7, method: 'tools/call', params: { name: 'get_news' } }),
  }), explode);
  const body = await res.json();
  assert.equal(body.result.isError, true);
  assert.match(body.result.content[0].text, /upstream on fire/);
  assert.equal(body.id, 7, 'the client can still match the response to its request');
});

test('get_blindspots returns only one-sided stories', async () => {
  const out = await callTool('get_blindspots', {}, load);
  assert.ok(out.stories.length);
  assert.ok(out.stories.every(s => s.blindspot));
});

test('limits are clamped and floored', async () => {
  assert.equal((await callTool('get_news', { view: 'latest', limit: 9999 }, load)).latest.length <= 200, true);
  assert.equal((await callTool('get_news', { view: 'latest', limit: 2.9 }, load)).latest.length, 2);
  assert.ok((await callTool('get_news', { view: 'latest', limit: -1 }, load)).latest.length > 0);
});

test('compare_coverage finds a story and splits it by side', async () => {
  const out = await callTool('compare_coverage', { q: 'migrant border' }, load);
  assert.equal(out.matches.length, 1);
  const [match] = out.matches;
  assert.deepEqual(match.columns.map(c => c.side), ['left', 'center', 'right']);
  assert.ok(match.columns.find(c => c.side === 'right').only.includes('surge'),
    'the word only the right-leaning headline uses');
  assert.ok(match.columns.find(c => c.side === 'left').headlines.length);
});

test('compare_coverage requires a query and reports a miss politely', async () => {
  assert.match((await callTool('compare_coverage', {}, load)).error, /needs a `q`/);
  assert.match((await callTool('compare_coverage', { q: '   ' }, load)).error, /needs a `q`/);
  const miss = await callTool('compare_coverage', { q: 'zeppelin regatta' }, load);
  assert.deepEqual(miss.matches, []);
  assert.ok(miss.note);
});

test('get_feed_health surfaces which feeds answered', async () => {
  const out = await callTool('get_feed_health', {}, load);
  assert.equal(out.total, 2);
  assert.equal(out.healthy, 1);
  assert.equal(out.feeds.find(f => !f.ok).error, 'HTTP 500');
});
