// The JSON-RPC surface. Agents are the least forgiving clients we have: a malformed frame
// must come back as a JSON-RPC error object, never as a dead connection or an HTML page.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { callTool, mcp, TOOLS } from '../src/mcp.js';

const NOW = Date.UTC(2026, 7, 28, 12, 0, 0);
const item = (title, outlet, bias) =>
  ({ title, link: `https://e.com/${encodeURIComponent(title)}-${outlet}`, outlet, publisher: outlet, bias, ts: NOW, firstSeen: NOW });

const ITEMS = [
  item('Senate passes the climate bill', 'NPR', -1),
  item('Senate passes climate bill tonight', 'Fox News', 2),
  item('Local hockey team wins final', 'CBC', -1),
  item('Local hockey team wins the final', 'Global News', 0),
];

const load = async () => ({
  updated: NOW,
  items: ITEMS,
  health: [{ outlet: 'NPR', ok: true, items: 1 }, { outlet: 'Beta', ok: false, items: 0, error: 'HTTP 500' }],
  degraded: false,
  stale: false,
});

const rpc = (body, method = 'POST') =>
  mcp(new Request('https://news.test/mcp', {
    method,
    headers: { 'content-type': 'application/json' },
    body: method === 'POST' ? JSON.stringify(body) : undefined,
  }), load);

test('every advertised tool has a name, description and schema', () => {
  assert.equal(TOOLS.length, 4);
  for (const t of TOOLS) {
    assert.ok(t.name && t.description, `${t.name} is described`);
    assert.equal(t.inputSchema.type, 'object');
  }
});

test('initialize reports the protocol version and server identity', async () => {
  const { result } = await (await rpc({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {} })).json();
  assert.equal(result.serverInfo.name, 'sidewise');
  assert.ok(result.capabilities.tools);
});

test('initialize survives an explicit null params', async () => {
  // Valid JSON-RPC, and it used to throw before reaching the handler.
  const res = await rpc({ jsonrpc: '2.0', id: 1, method: 'initialize', params: null });
  const { result } = await res.json();
  assert.equal(res.status, 200);
  assert.equal(result.protocolVersion, '2025-06-18');
});

test('tools/list returns the catalogue', async () => {
  const { result } = await (await rpc({ jsonrpc: '2.0', id: 2, method: 'tools/list' })).json();
  assert.deepEqual(result.tools.map(t => t.name).sort(),
    ['compare_coverage', 'get_blindspots', 'get_feed_health', 'get_news']);
});

test('malformed JSON is a parse error, not a crash', async () => {
  const res = await mcp(new Request('https://news.test/mcp', { method: 'POST', body: 'not json' }), load);
  assert.equal(res.status, 400);
  assert.equal((await res.json()).error.code, -32700);
});

test('a JSON array body is an invalid request', async () => {
  const res = await rpc([1, 2, 3]);
  assert.equal(res.status, 400);
  assert.equal((await res.json()).error.code, -32600);
});

test('an unknown method returns method-not-found', async () => {
  const { error } = await (await rpc({ jsonrpc: '2.0', id: 3, method: 'nope' })).json();
  assert.equal(error.code, -32601);
});

test('an unknown tool returns invalid-params', async () => {
  const { error } = await (await rpc({
    jsonrpc: '2.0', id: 4, method: 'tools/call', params: { name: 'no_such_tool', arguments: {} },
  })).json();
  assert.equal(error.code, -32602);
});

test('a tool that throws is reported as a tool error, not a dead transport', async () => {
  const res = await mcp(new Request('https://news.test/mcp', {
    method: 'POST',
    body: JSON.stringify({ jsonrpc: '2.0', id: 5, method: 'tools/call', params: { name: 'get_news', arguments: {} } }),
  }), async () => { throw new Error('feeds unreachable'); });
  const { result } = await res.json();
  assert.equal(result.isError, true);
  assert.match(result.content[0].text, /feeds unreachable/);
});

test('GET is refused with a usable message', async () => {
  const res = await rpc(null, 'GET');
  assert.equal(res.status, 405);
  assert.match((await res.json()).error, /POST JSON-RPC/);
});

test('OPTIONS preflight is allowed', async () => {
  const res = await rpc(null, 'OPTIONS');
  assert.equal(res.status, 204);
  assert.equal(res.headers.get('access-control-allow-origin'), '*');
});

test('notifications/initialized is accepted with no body', async () => {
  const res = await rpc({ jsonrpc: '2.0', method: 'notifications/initialized' });
  assert.equal(res.status, 202);
});

test('get_news returns both views and echoes the update stamp', async () => {
  const out = await callTool('get_news', {}, load);
  assert.equal(out.updated, NOW);
  assert.ok(out.stories.length && out.latest.length);
});

test('get_news honours null arguments', async () => {
  const out = await callTool('get_news', null, load);
  assert.ok(out.latest.length, 'a null arguments object must not throw');
});

test('get_blindspots returns only one-sided stories', async () => {
  const out = await callTool('get_blindspots', {}, load);
  assert.ok(out.stories.every(s => s.blindspot));
  assert.equal(out.latest, undefined, 'stories view only');
});

test('compare_coverage requires a query', async () => {
  assert.match((await callTool('compare_coverage', {}, load)).error, /needs a `q`/);
  assert.match((await callTool('compare_coverage', { q: '   ' }, load)).error, /needs a `q`/);
});

test('compare_coverage finds a story and breaks it down by side', async () => {
  const out = await callTool('compare_coverage', { q: 'climate bill' }, load);
  assert.equal(out.matches.length, 1);
  assert.deepEqual(out.matches[0].columns.map(c => c.side), ['left', 'center', 'right']);
});

test('compare_coverage says so plainly when nothing matches', async () => {
  const out = await callTool('compare_coverage', { q: 'zeppelin regulations' }, load);
  assert.deepEqual(out.matches, []);
  assert.match(out.note, /No current story/);
});

test('get_feed_health surfaces the down feeds', async () => {
  const out = await callTool('get_feed_health', {}, load);
  assert.equal(out.healthy, 1);
  assert.equal(out.total, 2);
  assert.equal(out.degraded, false);
});

test('limits are clamped rather than trusted', async () => {
  assert.ok((await callTool('get_news', { limit: 9999 }, load)).latest.length <= 200);
  for (const bad of [-1, 0, 'abc', null]) {
    assert.ok((await callTool('get_news', { limit: bad }, load)).latest.length > 0, `limit=${bad} falls back`);
  }
});

test('an unknown tool name resolves to null so the caller can 32602 it', async () => {
  assert.equal(await callTool('nope', {}, load), null);
});
