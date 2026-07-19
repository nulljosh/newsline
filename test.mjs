// Minimal self-check: parseItems (RSS + Atom + CDATA + dates), latest sort, cluster.
// Run: node test.mjs
import assert from 'node:assert';
import { parseItems, latest, cluster } from './worker.js';

const rss = `<rss><channel>
  <item><title>Fed raises rates</title><link>http://a/1</link><pubDate>Wed, 15 Jan 2026 10:00:00 GMT</pubDate></item>
  <item><title><![CDATA[Ask HN: best editor]]></title><link>http://hn/2</link><pubDate>Wed, 15 Jan 2026 12:00:00 GMT</pubDate></item>
</channel></rss>`;

const items = [
  ...parseItems(rss, 'CNN', -1),
  ...parseItems(rss.replace(/pubDate/g, 'dc:date'), 'HN', 0), // dc:date variant
];

// parse: title, link, outlet, bias, ts all captured; CDATA stripped
assert.equal(items.length, 4, 'parses all items');
assert.equal(items[1].title, 'Ask HN: best editor', 'strips CDATA');
assert.ok(items[0].ts > 0, 'parses pubDate to ts');
assert.ok(items[2].ts > 0, 'parses dc:date to ts');
assert.equal(items[0].outlet, 'CNN');

// dateless items sink to bottom
const withDateless = [...items, { title: 'no date', link: 'x', outlet: 'X', bias: 0, ts: 0 }];
const flat = latest(withDateless);
assert.equal(flat[flat.length - 1].title, 'no date', 'dateless sinks to bottom');
assert.ok(flat[0].ts >= flat[1].ts, 'reverse-chron order');

// cluster groups same-story headlines across outlets
const same = [
  { title: 'Fed raises interest rates today', link: 'a', outlet: 'CNN', bias: -1, ts: 1 },
  { title: 'Fed raises interest rates sharply', link: 'b', outlet: 'Fox', bias: 2, ts: 1 },
];
const clustered = cluster(same);
assert.equal(clustered[0].sources.length, 2, 'clusters same story across outlets');
assert.equal(clustered[0].blindspot, false, 'multi-side story is not a blindspot');

console.log('ok — all checks passed');
