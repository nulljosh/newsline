// Parsing is the layer that touches untrusted third-party bytes, so most of these cases are
// drawn from feeds that actually broke it: double-escaped summaries, CDATA titles, Atom
// entries with three <link> elements, and a `javascript:` href.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decode, parseItems, safeLink, stripTags } from '../src/parse.js';

test('decode resolves named, decimal and hex entities', () => {
  assert.equal(decode('AT&amp;T'), 'AT&T');
  assert.equal(decode('&#8217;'), '’');
  assert.equal(decode('&#x2019;'), '’');
  assert.equal(decode('&nbsp;'), ' ');
});

test('decode leaves unknown and out-of-range entities alone', () => {
  assert.equal(decode('&bogus;'), '&bogus;');
  assert.equal(decode('&#0;'), '&#0;');
  assert.equal(decode('&#99999999;'), '&#99999999;');
});

test('decode tolerates non-string input', () => {
  for (const bad of [undefined, null, 42, {}]) assert.equal(decode(bad), '');
});

test('stripTags removes markup and drops script bodies entirely', () => {
  assert.equal(stripTags('<p>Hello <b>world</b></p>'), 'Hello world');
  assert.equal(stripTags('<script>evil()</script>safe'), 'safe');
  assert.equal(stripTags('<style>a{}</style>text'), 'text');
});

test('stripTags survives double-escaped markup', () => {
  // The single-pass version let &lt;p&gt; through, which then rendered as real markup.
  const out = stripTags('&lt;p&gt;Escaped &lt;b&gt;bold&lt;/b&gt;&lt;/p&gt;');
  assert.equal(out, 'Escaped bold');
  assert.ok(!out.includes('<') && !out.includes('>'));
});

test('stripTags truncates with an ellipsis and respects the cap', () => {
  const out = stripTags('x'.repeat(400));
  assert.equal(out.length, 280);
  assert.ok(out.endsWith('…'));
  assert.equal(stripTags('abcdef', 4), 'abc…');
});

test('safeLink accepts http(s) and rejects script-bearing schemes', () => {
  assert.equal(safeLink('https://example.com/a'), 'https://example.com/a');
  assert.equal(safeLink('http://example.com/a'), 'http://example.com/a');
  for (const bad of ['javascript:alert(1)', 'data:text/html,<h1>x', 'not a url', '', null]) {
    assert.equal(safeLink(bad), undefined);
  }
});

const rss = `<rss><channel>
  <item>
    <title><![CDATA[First & Only]]></title>
    <link>https://example.com/1</link>
    <pubDate>Wed, 27 Aug 2026 12:00:00 GMT</pubDate>
    <description>&lt;p&gt;Body text&lt;/p&gt;</description>
    <enclosure type="image/jpeg" url="https://cdn.example.com/a.jpg"/>
  </item>
  <item><title>No link here</title></item>
  <item><title>Bad scheme</title><link>javascript:alert(1)</link></item>
</channel></rss>`;

test('parseItems extracts title, link, date, summary and image', () => {
  const [item, ...rest] = parseItems(rss, 'Example', 1, 'Example Media');
  assert.equal(item.title, 'First & Only');
  assert.equal(item.link, 'https://example.com/1');
  assert.equal(item.outlet, 'Example');
  assert.equal(item.publisher, 'Example Media');
  assert.equal(item.bias, 1);
  assert.equal(item.summary, 'Body text');
  assert.equal(item.image, 'https://cdn.example.com/a.jpg');
  assert.ok(item.ts > 0);
  // The linkless item and the javascript: item must both be dropped.
  assert.equal(rest.length, 0);
});

test('parseItems reads Atom entries and picks the alternate link', () => {
  const atom = `<feed><entry>
    <title>Atom story</title>
    <link rel="related" href="https://example.com/related"/>
    <link rel="alternate" href="https://example.com/story"/>
    <published>2026-08-27T12:00:00Z</published>
  </entry></feed>`;
  const [item] = parseItems(atom, 'Atom', 0);
  assert.equal(item.link, 'https://example.com/story');
  assert.equal(item.publisher, 'Atom', 'publisher defaults to outlet');
});

test('parseItems defaults a missing or unparseable date to 0 rather than NaN', () => {
  const [item] = parseItems(
    '<rss><item><title>T</title><link>https://e.com/x</link><pubDate>not a date</pubDate></item></rss>', 'E', 0);
  assert.equal(item.ts, 0);
});

test('parseItems drops http-only and relative images but keeps the item', () => {
  const [item] = parseItems(
    '<rss><item><title>T</title><link>https://e.com/x</link>' +
    '<media:thumbnail url="http://insecure.example.com/a.jpg"/></item></rss>', 'E', 0);
  assert.equal(item.image, undefined, 'an http image would break the page TLS');
  assert.equal(item.title, 'T');
});

test('parseItems omits a summary that merely repeats the title', () => {
  const [item] = parseItems(
    '<rss><item><title>Same</title><link>https://e.com/x</link><description>Same</description></item></rss>', 'E', 0);
  assert.equal(item.summary, undefined);
});

test('parseItems caps at 25 items per feed', () => {
  const many = '<rss>' + Array.from({ length: 40 }, (_, i) =>
    `<item><title>Story ${i}</title><link>https://e.com/${i}</link></item>`).join('') + '</rss>';
  assert.equal(parseItems(many, 'E', 0).length, 25);
});

test('parseItems returns [] for junk rather than throwing', () => {
  for (const bad of [undefined, null, '', 42, '<html>not a feed</html>']) {
    assert.deepEqual(parseItems(bad, 'E', 0), []);
  }
});
