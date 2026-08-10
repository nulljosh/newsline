// Minimal self-check: parseItems (RSS + Atom + CDATA + dates), latest sort, cluster, shape filters.
// Run: node test.mjs
import assert from 'node:assert';
import { parseItems, latest, cluster, shape } from './worker.js';

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

// Atom <entry> with multiple <link href> — take rel="alternate", not shorturl/related
const atom = `<feed><entry>
  <title>WorkOS: Connect Your Agents &amp; Your API</title>
  <link rel="alternate" type="text/html" href="https://example.com/post?a=1&amp;b=2" />
  <link rel="shorturl" type="text/html" href="http://df4.us/xgd" />
  <published>2026-08-09T23:54:18Z</published>
</entry></feed>`;
const [df] = parseItems(atom, 'Daring Fireball', 0);
assert.ok(df, 'parses Atom <entry>, not just RSS <item>');
assert.equal(df.link, 'https://example.com/post?a=1&b=2', 'takes rel=alternate href and decodes it');
assert.equal(df.title, 'WorkOS: Connect Your Agents & Your API', 'decodes entities in titles');
assert.ok(df.ts > 0, 'parses Atom <published>');

// numeric and hex character references
const ents = parseItems(
  `<rss><item><title>B.C.&#8217;s bread &#x2014; why</title><link>http://a</link></item></rss>`, 'X', 0);
assert.equal(ents[0].title, 'B.C.’s bread — why', 'decodes numeric + hex entities');

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

// shape(): the default must stay byte-compatible with what the web page and /news skill expect
const mixed = [
  { title: 'Fed raises interest rates today', link: 'a', outlet: 'CNN', bias: -1, ts: 3 },
  { title: 'Fed raises interest rates sharply', link: 'b', outlet: 'Fox News', bias: 2, ts: 2 },
  { title: 'Left-only budget scandal report', link: 'c', outlet: 'MSNBC', bias: -2, ts: 1 },
  { title: 'Left-only budget scandal fallout', link: 'd', outlet: 'NPR', bias: -1, ts: 1 },
  { title: 'Show HN: a tiny worker', link: 'e', outlet: 'Hacker News', bias: 0, ts: 4 },
];

assert.deepEqual(Object.keys(shape(mixed)).sort(), ['latest', 'stories', 'updated'],
  'default view=both keeps the current response shape');

// view narrows the payload
assert.ok(!('stories' in shape(mixed, { view: 'latest' })), 'view=latest omits clusters');
assert.ok(!('latest' in shape(mixed, { view: 'stories' })), 'view=stories omits the flat feed');

// outlet + bias filter the flat feed
const hn = shape(mixed, { view: 'latest', outlet: 'Hacker News' }).latest;
assert.equal(hn.length, 1, 'outlet filter narrows to one source');
assert.equal(hn[0].outlet, 'Hacker News');

const right = shape(mixed, { view: 'latest', bias: 'right' }).latest;
assert.ok(right.length && right.every(x => x.bias > 0), 'bias filter keeps only right-leaning outlets');

// q matches headline substrings, case-insensitively
assert.equal(shape(mixed, { view: 'latest', q: 'FED' }).latest.length, 2, 'q is case-insensitive');

// limit caps results
assert.equal(shape(mixed, { view: 'latest', limit: 2 }).latest.length, 2, 'limit caps the flat feed');

// filtering happens before latest()'s 120-item cap, so a low-volume outlet buried past
// the global top 120 is still findable
const flood = Array.from({ length: 200 }, (_, i) =>
  ({ title: `filler ${i}`, link: `f${i}`, outlet: 'CNN', bias: -1, ts: 1000 + i }));
const rare = { title: 'rare tech post', link: 'r', outlet: 'Daring Fireball', bias: 0, ts: 1 };
assert.equal(shape([...flood, rare], { view: 'latest', outlet: 'Daring Fireball' }).latest.length, 1,
  'low-volume outlet survives the 120-item cap');

// blindspot returns only one-sided clusters, and clusters survive a bias filter
// (filtering happens after clustering, so cross-outlet grouping is preserved)
const blind = shape(mixed, { view: 'stories', blindspot: true }).stories;
assert.ok(blind.length, 'finds the left-only story');
assert.ok(blind.every(s => s.blindspot), 'blindspot returns only flagged clusters');
assert.ok(blind.every(s => s.sources.length > 1), 'a blindspot needs more than one source');

const fedCluster = shape(mixed, { view: 'stories', bias: 'right' }).stories
  .find(s => s.title.startsWith('Fed raises'));
assert.equal(fedCluster.sources.length, 2,
  'bias filter selects clusters but keeps every source in them');

console.log('ok — all checks passed');
