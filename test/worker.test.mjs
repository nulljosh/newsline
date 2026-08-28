// HTTP surface: query parsing, routing, method handling and the catch-all error path.
// The rule these pin down is that anything under /api/ answers JSON with CORS, always —
// including 404s, 405s and internal errors, which used to come back as HTML.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import worker, { parseQuery } from '../worker.js';

const q = search => parseQuery(new URL(`https://news.test/api/stories${search}`));

test('parseQuery defaults to the both view with nothing else set', () => {
  assert.deepEqual(q(''), {
    view: 'both', outlet: undefined, bias: undefined,
    blindspot: false, developing: false, compare: false, q: undefined, limit: undefined,
  });
});

test('parseQuery rejects unknown view and bias values', () => {
  assert.equal(q('?view=nonsense').view, 'both');
  assert.equal(q('?bias=purple').bias, undefined);
  assert.equal(q('?view=stories&bias=left').view, 'stories');
});

test('parseQuery accepts both true and 1 for flags', () => {
  assert.equal(q('?blindspot=true').blindspot, true);
  assert.equal(q('?developing=1').developing, true);
  assert.equal(q('?compare=yes').compare, false, 'only true and 1 count');
});

test('parseQuery clamps limit and ignores nonsense', () => {
  assert.equal(q('?limit=10').limit, 10);
  assert.equal(q('?limit=9999').limit, 200, 'capped');
  for (const bad of ['0', '-5', 'abc', '']) assert.equal(q(`?limit=${bad}`).limit, undefined);
});

// A worker env whose static-asset binding is obvious in assertions.
const ASSETS = { fetch: async () => new Response('<html>static</html>', { headers: { 'content-type': 'text/html' } }) };
const ctx = { waitUntil() {} };
const call = (path, init) => worker.fetch(new Request(`https://news.test${path}`, init), { ASSETS }, ctx);

test('an unknown /api path answers JSON, not the static site', async () => {
  const res = await call('/api/nope');
  assert.equal(res.status, 404);
  assert.equal(res.headers.get('content-type'), 'application/json');
  const body = await res.json();
  assert.match(body.error, /Unknown endpoint/);
  assert.ok(body.endpoints.includes('/api/stories'));
});

test('/api rejects write methods with 405 and an Allow header', async () => {
  const res = await call('/api/stories', { method: 'POST' });
  assert.equal(res.status, 405);
  assert.equal(res.headers.get('allow'), 'GET, HEAD, OPTIONS');
  assert.match((await res.json()).error, /POST not allowed/);
});

test('/api preflight returns 204 with CORS', async () => {
  const res = await call('/api/stories', { method: 'OPTIONS' });
  assert.equal(res.status, 204);
  assert.equal(res.headers.get('access-control-allow-origin'), '*');
});

test('/api/sources lists every feed with a resolved side', async () => {
  const res = await call('/api/sources');
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.sources.length, body.count);
  assert.ok(body.publishers <= body.count, 'shared newsrooms collapse');
  for (const s of body.sources) {
    assert.ok(['left', 'center', 'right'].includes(s.side));
    assert.ok(s.publisher, 'publisher always resolves, defaulting to the outlet');
  }
});

test('security.txt is served as plain text', async () => {
  const res = await call('/.well-known/security.txt');
  assert.equal(res.status, 200);
  assert.match(res.headers.get('content-type'), /text\/plain/);
  assert.match(await res.text(), /^Contact: mailto:/m);
});

test('a non-api path falls through to static assets', async () => {
  assert.equal(await (await call('/index.html')).text(), '<html>static</html>');
});

test('a thrown error under /api becomes JSON 500, not a Workers HTML page', async () => {
  // Blow up inside the feed pull the way a runtime fault would, before any handler can catch it.
  const original = Object.getOwnPropertyDescriptor(globalThis, 'caches');
  Object.defineProperty(globalThis, 'caches', {
    configurable: true,
    get() { throw new Error('kaboom'); },
  });
  let res;
  try {
    res = await worker.fetch(new Request('https://news.test/api/stories'), { ASSETS }, ctx);
  } finally {
    if (original) Object.defineProperty(globalThis, 'caches', original);
    else delete globalThis.caches;
  }
  assert.equal(res.status, 500);
  assert.equal(res.headers.get('content-type'), 'application/json');
  assert.equal(res.headers.get('access-control-allow-origin'), '*', 'clients still need CORS on failure');
  assert.equal((await res.json()).error, 'Internal error');
});

test('a thrown error on a page path stays plain text', async () => {
  const boom = { ASSETS: { fetch() { throw new Error('kaboom'); } } };
  const res = await worker.fetch(new Request('https://news.test/'), boom, ctx);
  assert.equal(res.status, 500);
  assert.match(res.headers.get('content-type'), /text\/plain/);
});
