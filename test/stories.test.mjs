import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  cluster, compare, coverage, distinctive, keywords, latest, shape, side, DEVELOPING_WINDOW_MS,
} from '../src/stories.js';
import { item } from './helpers.mjs';

test('side maps the bias scale to three buckets', () => {
  assert.equal(side(-2), 'left');
  assert.equal(side(-1), 'left');
  assert.equal(side(0), 'center');
  assert.equal(side(1), 'right');
  assert.equal(side(2), 'right');
});

test('keywords drops stopwords and short tokens', () => {
  assert.deepEqual([...keywords('The Fed is to raise a rate')].sort(), ['fed', 'raise', 'rate']);
  assert.equal(keywords('the a of to').size, 0);
});

test('latest sorts reverse-chron and sinks dateless items', () => {
  const flat = latest([item({ ts: 5 }), item({ ts: 0, title: 'no date' }), item({ ts: 9 })]);
  assert.equal(flat[0].ts, 9);
  assert.equal(flat.at(-1).title, 'no date');
});

test('latest caps the flat feed', () => {
  const many = Array.from({ length: 300 }, (_, i) => item({ ts: i, link: `https://a/${i}` }));
  assert.equal(latest(many).length, 120);
  assert.equal(latest(many, 5).length, 5);
});

test('cluster groups the same story across outlets', () => {
  const c = cluster([
    item({ title: 'Fed raises interest rates today', outlet: 'CBC', bias: -1, link: 'a' }),
    item({ title: 'Fed raises interest rates sharply', outlet: 'Fox News', bias: 2, link: 'b' }),
  ]);
  assert.equal(c[0].sources.length, 2);
  assert.equal(c[0].blindspot, false, 'a two-sided story is not a blindspot');
  assert.deepEqual(c[0].counts, { left: 1, center: 0, right: 1 });
});

test('cluster titles the group with the newest headline', () => {
  const c = cluster([
    item({ title: 'Fed raises interest rates yesterday', ts: 1, link: 'a' }),
    item({ title: 'Fed raises interest rates today', ts: 99, link: 'b', outlet: 'Fox News', bias: 2 }),
  ]);
  assert.equal(c[0].title, 'Fed raises interest rates today');
});

test('cluster skips headlines that are entirely stopwords', () => {
  // An empty keyword set has overlap 0/0 = NaN against everything; letting it through
  // would seed a cluster nothing can ever match.
  const c = cluster([item({ title: 'the a of to', link: 'a' }), item({ title: 'Real news here', link: 'b' })]);
  assert.deepEqual(c.map(x => x.title), ['Real news here']);
});

test('cluster reports the newest source timestamp', () => {
  const c = cluster([
    item({ title: 'Budget vote passes senate', ts: 10, link: 'a' }),
    item({ title: 'Budget vote passes house', ts: 40, link: 'b', outlet: 'Fox News', bias: 2 }),
  ]);
  assert.equal(c[0].ts, 40);
});

test('coverage counts newsrooms, not feeds', () => {
  const both = [
    { outlet: 'NY Post', publisher: 'NY Post', bias: 2 },
    { outlet: 'New York Post Opinion', publisher: 'NY Post', bias: 2 },
  ];
  const cov = coverage(both);
  assert.equal(cov.counts.right, 1, 'one newsroom publishing twice is one voice');
  assert.equal(cov.publishers, 1);
});

test('a single newsroom on both its feeds is not a blindspot', () => {
  // The old outlet-based count made this look like two right-leaning outlets corroborating
  // each other, which both inflated the bias bar and flagged a false blindspot.
  const [story] = cluster([
    item({ title: 'Mayor resigns over contract', outlet: 'NY Post', publisher: 'NY Post', bias: 2, link: 'a' }),
    item({ title: 'Mayor resigns over contract scandal', outlet: 'New York Post Opinion', publisher: 'NY Post', bias: 2, link: 'b' }),
  ]);
  assert.equal(story.publishers, 1);
  assert.equal(story.blindspot, false);
});

test('a real one-sided story across newsrooms is a blindspot', () => {
  const [story] = cluster([
    item({ title: 'Budget scandal report lands', outlet: 'NPR', publisher: 'NPR', bias: -1, link: 'a' }),
    item({ title: 'Budget scandal report fallout', outlet: 'CBC', publisher: 'CBC', bias: -1, link: 'b' }),
  ]);
  assert.equal(story.blindspot, true);
  assert.equal(story.publishers, 2);
});

test('developing needs several newsrooms arriving inside the window', () => {
  const now = 1_000_000_000;
  const fresh = t => ({ firstSeen: t, ts: t });
  const hot = cluster([
    item({ title: 'Quake strikes coastal region', outlet: 'BBC', publisher: 'BBC', link: 'a', ...fresh(now - 60_000) }),
    item({ title: 'Quake strikes coastal region hard', outlet: 'NPR', publisher: 'NPR', bias: -1, link: 'b', ...fresh(now - 30_000) }),
    item({ title: 'Quake strikes coastal region overnight', outlet: 'Fox News', publisher: 'Fox News', bias: 2, link: 'c', ...fresh(now - 10_000) }),
  ], now);
  assert.equal(hot[0].developing, true);
  assert.equal(hot[0].firstSeen, now - 60_000, 'firstSeen is the earliest sighting');

  const old = now - DEVELOPING_WINDOW_MS - 1;
  const cold = cluster([
    item({ title: 'Quake strikes coastal region', outlet: 'BBC', publisher: 'BBC', link: 'a', ...fresh(old) }),
    item({ title: 'Quake strikes coastal region hard', outlet: 'NPR', publisher: 'NPR', bias: -1, link: 'b', ...fresh(old) }),
    item({ title: 'Quake strikes coastal region overnight', outlet: 'Fox News', publisher: 'Fox News', bias: 2, link: 'c', ...fresh(old) }),
  ], now);
  assert.equal(cold[0].developing, false, 'a day-old story keeps no badge');
});

test('developing needs three newsrooms, not three feeds', () => {
  const now = 1_000_000_000;
  const two = cluster([
    item({ title: 'Quake strikes coastal region', outlet: 'NY Post', publisher: 'NY Post', bias: 2, link: 'a', firstSeen: now, ts: now }),
    item({ title: 'Quake strikes coastal region hard', outlet: 'New York Post Opinion', publisher: 'NY Post', bias: 2, link: 'b', firstSeen: now, ts: now }),
    item({ title: 'Quake strikes coastal region overnight', outlet: 'BBC', publisher: 'BBC', link: 'c', firstSeen: now, ts: now }),
  ], now);
  assert.equal(two[0].publishers, 2);
  assert.equal(two[0].developing, false);
});

test('distinctive finds the words one side uses and the others do not', () => {
  const only = distinctive([
    { title: 'Migrant surge overwhelms border town', bias: 2 },
    { title: 'Asylum seekers arrive at border town', bias: -1 },
  ]);
  assert.ok(only.right.includes('migrant') && only.right.includes('surge'));
  assert.ok(only.left.includes('asylum') && only.left.includes('seekers'));
  assert.ok(!only.right.includes('border'), 'shared framing is not distinctive');
});

test('compare lays a story out as three columns', () => {
  const [story] = cluster([
    item({ title: 'Migrant surge overwhelms border town', outlet: 'Fox News', publisher: 'Fox News', bias: 2, link: 'a' }),
    item({ title: 'Migrant arrivals rise in border town', outlet: 'NPR', publisher: 'NPR', bias: -1, link: 'b' }),
  ]);
  const cmp = compare(story);
  assert.deepEqual(cmp.columns.map(c => c.side), ['left', 'center', 'right']);
  assert.deepEqual(cmp.columns.find(c => c.side === 'center').headlines, [], 'an empty side stays present');
  assert.equal(cmp.columns.find(c => c.side === 'right').outlets[0], 'Fox News');
  assert.ok(cmp.columns.find(c => c.side === 'right').only.includes('surge'));
});

// ---- shape() : the response contract the web reader, the apps and /mcp all depend on ----

const mixed = [
  item({ title: 'Fed raises interest rates today', link: 'a', outlet: 'CBC', publisher: 'CBC', bias: -1, ts: 3 }),
  item({ title: 'Fed raises interest rates sharply', link: 'b', outlet: 'Fox News', publisher: 'Fox News', bias: 2, ts: 2 }),
  item({ title: 'Left-only budget scandal report', link: 'c', outlet: 'NPR', publisher: 'NPR', bias: -2, ts: 1 }),
  item({ title: 'Left-only budget scandal fallout', link: 'd', outlet: 'CBC', publisher: 'CBC', bias: -1, ts: 1 }),
  item({ title: 'Show HN: a tiny worker', link: 'e', outlet: 'Hacker News', publisher: 'Hacker News', bias: 0, ts: 4 }),
];

test('shape defaults to both views', () => {
  assert.deepEqual(Object.keys(shape(mixed)).sort(), ['latest', 'stories', 'updated']);
});

test('view narrows the payload', () => {
  assert.ok(!('stories' in shape(mixed, { view: 'latest' })));
  assert.ok(!('latest' in shape(mixed, { view: 'stories' })));
});

test('outlet and bias filter the flat feed', () => {
  const hn = shape(mixed, { view: 'latest', outlet: 'Hacker News' }).latest;
  assert.equal(hn.length, 1);
  assert.equal(hn[0].outlet, 'Hacker News');
  const right = shape(mixed, { view: 'latest', bias: 'right' }).latest;
  assert.ok(right.length && right.every(x => x.bias > 0));
});

test('q is case-insensitive and also searches summaries', () => {
  assert.equal(shape(mixed, { view: 'latest', q: 'FED' }).latest.length, 2);
  const withSummary = [item({ title: 'Opaque headline', link: 'z', summary: 'Really about the budget' })];
  assert.equal(shape(withSummary, { view: 'latest', q: 'budget' }).latest.length, 1);
});

test('limit caps both views', () => {
  assert.equal(shape(mixed, { view: 'latest', limit: 2 }).latest.length, 2);
  assert.equal(shape(mixed, { view: 'stories', limit: 1 }).stories.length, 1);
});

test('filtering happens before the 120-item cap', () => {
  const flood = Array.from({ length: 200 }, (_, i) =>
    item({ title: `filler ${i}`, link: `f${i}`, outlet: 'CBC', publisher: 'CBC', bias: -1, ts: 1000 + i }));
  const rare = item({ title: 'rare tech post', link: 'r', outlet: 'Daring Fireball', publisher: 'Daring Fireball', ts: 1 });
  assert.equal(shape([...flood, rare], { view: 'latest', outlet: 'Daring Fireball' }).latest.length, 1);
});

test('blindspot returns only one-sided multi-newsroom clusters', () => {
  const blind = shape(mixed, { view: 'stories', blindspot: true }).stories;
  assert.ok(blind.length);
  assert.ok(blind.every(s => s.blindspot && s.publishers > 1));
});

test('a bias filter selects clusters but keeps every source in them', () => {
  const fed = shape(mixed, { view: 'stories', bias: 'right' }).stories
    .find(s => s.title.startsWith('Fed raises'));
  assert.equal(fed.sources.length, 2, 'filtering after clustering preserves cross-outlet grouping');
});

test('developing filters clusters', () => {
  const now = 1_000_000_000;
  const hot = ['BBC', 'NPR', 'Fox News'].map((o, i) => item({
    title: `Quake hits the coastal region ${i}`, link: `q${i}`, outlet: o, publisher: o,
    bias: i === 1 ? -1 : i === 2 ? 2 : 0, ts: now, firstSeen: now - i * 1000,
  }));
  const out = shape([...mixed, ...hot], { view: 'stories', developing: true, updated: now });
  assert.ok(out.stories.length);
  assert.ok(out.stories.every(s => s.developing));
});

test('compare is opt-in because it roughly doubles the payload', () => {
  assert.ok(!('compare' in shape(mixed, { view: 'stories' }).stories[0]));
  assert.ok('compare' in shape(mixed, { view: 'stories', compare: true }).stories[0]);
});

test('shape tolerates an empty item list', () => {
  const out = shape([]);
  assert.deepEqual(out.stories, []);
  assert.deepEqual(out.latest, []);
});
