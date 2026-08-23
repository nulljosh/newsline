import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decode, parseItems, safeLink, stripTags } from '../src/parse.js';

test('decode resolves named, decimal and hex entities', () => {
  assert.equal(decode('B.C.&#8217;s bread &#x2014; why'), 'B.C.’s bread — why');
  assert.equal(decode('a &amp; b &lt;c&gt; &quot;d&quot; &apos;e&apos;'), 'a & b <c> "d" \'e\'');
});

test('decode leaves unresolvable references alone rather than throwing', () => {
  // String.fromCodePoint throws on these; an unknown entity is not worth a 500.
  assert.equal(decode('&#0;'), '&#0;');
  assert.equal(decode('&#1114112;'), '&#1114112;');
  assert.equal(decode('&#xZZ;'), '&#xZZ;');
  assert.equal(decode('&notarealentity;'), '&notarealentity;');
});

test('parseItems reads RSS items, CDATA and pubDate', () => {
  const items = parseItems(
    `<rss><channel>
      <item><title>Fed raises rates</title><link>http://a/1</link><pubDate>Wed, 15 Jan 2026 10:00:00 GMT</pubDate></item>
      <item><title><![CDATA[Ask HN: best editor]]></title><link>http://hn/2</link><pubDate>Wed, 15 Jan 2026 12:00:00 GMT</pubDate></item>
    </channel></rss>`, 'CBC', -1);
  assert.equal(items.length, 2);
  assert.equal(items[1].title, 'Ask HN: best editor', 'strips CDATA');
  assert.ok(items[0].ts > 0, 'parses pubDate');
  assert.equal(items[0].outlet, 'CBC');
  assert.equal(items[0].bias, -1);
});

test('parseItems reads the dc:date variant', () => {
  const [it] = parseItems(
    `<rss><item><title>T</title><link>http://a</link><dc:date>2026-01-15T10:00:00Z</dc:date></item></rss>`, 'X', 0);
  assert.ok(it.ts > 0);
});

test('parseItems reads Atom entries and prefers rel=alternate', () => {
  const [df] = parseItems(`<feed><entry>
    <title>WorkOS: Connect Your Agents &amp; Your API</title>
    <link rel="alternate" type="text/html" href="https://example.com/post?a=1&amp;b=2" />
    <link rel="shorturl" type="text/html" href="http://df4.us/xgd" />
    <published>2026-08-09T23:54:18Z</published>
  </entry></feed>`, 'Daring Fireball', 0);
  assert.ok(df, 'parses Atom <entry>, not just RSS <item>');
  assert.equal(df.link, 'https://example.com/post?a=1&b=2');
  assert.equal(df.title, 'WorkOS: Connect Your Agents & Your API');
  assert.ok(df.ts > 0);
});

test('parseItems defaults publisher to outlet and honours an explicit one', () => {
  const rss = `<rss><item><title>T</title><link>https://a</link></item></rss>`;
  assert.equal(parseItems(rss, 'NY Post', 2)[0].publisher, 'NY Post');
  assert.equal(parseItems(rss, 'New York Post Opinion', 2, 'NY Post')[0].publisher, 'NY Post');
});

test('parseItems gives dateless items ts 0 rather than NaN', () => {
  const [it] = parseItems(`<rss><item><title>T</title><link>https://a</link></item></rss>`, 'X', 0);
  assert.equal(it.ts, 0);
});

test('parseItems drops items missing a title or a link', () => {
  const items = parseItems(`<rss>
    <item><title>Has both</title><link>https://a</link></item>
    <item><title>No link</title></item>
    <item><link>https://b</link></item>
    <item><title>   </title><link>https://c</link></item>
  </rss>`, 'X', 0);
  assert.deepEqual(items.map(i => i.title), ['Has both']);
});

test('parseItems refuses non-http links', () => {
  const items = parseItems(`<rss>
    <item><title>Evil</title><link>javascript:alert(1)</link></item>
    <item><title>Also evil</title><link>data:text/html,&lt;script&gt;</link></item>
    <item><title>Fine</title><link>https://ok.example/x</link></item>
  </rss>`, 'X', 0);
  assert.deepEqual(items.map(i => i.title), ['Fine'],
    'a feed is third-party input; javascript: in a headline link is a real vector');
});

test('parseItems caps each feed at 25 items', () => {
  const many = Array.from({ length: 60 }, (_, i) =>
    `<item><title>T${i}</title><link>https://a/${i}</link></item>`).join('');
  assert.equal(parseItems(`<rss>${many}</rss>`, 'X', 0).length, 25);
});

test('parseItems survives malformed and empty input', () => {
  for (const bad of ['', '<rss>', 'not xml at all', '<html><body>403 Forbidden</body></html>',
                     '<rss><item><title>unclosed</title>']) {
    assert.deepEqual(parseItems(bad, 'X', 0), [], `no items from: ${bad.slice(0, 20)}`);
  }
});

test('parseItems extracts a plain-text summary from double-escaped HTML', () => {
  const [it] = parseItems(`<rss><item><title>T</title><link>https://a</link>
    <description>&lt;p&gt;Body with &amp;#8217;s&lt;/p&gt;</description></item></rss>`, 'X', 0);
  assert.equal(it.summary, 'Body with ’s');
});

test('stripTags removes markup even when it is escaped twice over', () => {
  assert.equal(stripTags('&amp;lt;script&amp;gt;alert(1)&amp;lt;/script&amp;gt;'), '',
    'decode-then-strip must run twice or escaped markup reappears as real markup');
  assert.equal(stripTags('<p>Real <i>markup</i></p>'), 'Real markup');
  assert.ok(!stripTags('<b>a</b> &lt;b&gt;b&lt;/b&gt;').includes('<'));
});

test('stripTags truncates long summaries on a character budget', () => {
  const out = stripTags('x '.repeat(400), 50);
  assert.ok(out.length <= 50);
  assert.ok(out.endsWith('…'));
});

test('parseItems only accepts https images', () => {
  const withImg = t => parseItems(
    `<rss><item><title>T</title><link>https://a</link>${t}</item></rss>`, 'X', 0)[0];
  assert.equal(withImg('<media:thumbnail url="https://img/x.jpg"/>').image, 'https://img/x.jpg');
  assert.equal(withImg('<media:thumbnail url="http://img/x.jpg"/>').image, undefined,
    'an http image would break the page TLS');
  assert.equal(withImg('').image, undefined);
});

test('safeLink allows http(s) and rejects everything else', () => {
  assert.equal(safeLink('https://a/b?c=1'), 'https://a/b?c=1');
  assert.equal(safeLink('http://a'), 'http://a/');
  for (const bad of ['javascript:alert(1)', 'data:text/html,x', 'file:///etc/passwd', 'not a url', '']) {
    assert.equal(safeLink(bad), undefined, bad);
  }
});
