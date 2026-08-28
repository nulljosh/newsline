// Clustering and bias tagging. The blindspot and developing flags drive what the app claims
// about coverage, so the rules behind them are pinned here rather than left to inspection.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  cluster, compare, coverage, distinctive, keywords, latest, shape, side,
  DEVELOPING_WINDOW_MS, LATEST_CAP,
} from '../src/stories.js';

const NOW = Date.UTC(2026, 7, 28, 12, 0, 0);
const item = (title, outlet, bias, over = {}) =>
  ({ title, link: `https://e.com/${encodeURIComponent(title)}-${outlet}`, outlet, bias, ts: NOW, ...over });

test('side maps the bias scale onto three buckets', () => {
  assert.equal(side(-2), 'left');
  assert.equal(side(-1), 'left');
  assert.equal(side(0), 'center');
  assert.equal(side(2), 'right');
});

test('keywords drops stopwords and short tokens', () => {
  const kw = keywords('The Senate is voting on a new bill');
  assert.ok(kw.has('senate') && kw.has('voting') && kw.has('bill'));
  for (const stop of ['the', 'is', 'on', 'a', 'new']) assert.ok(!kw.has(stop));
});

test('keywords tolerates non-string input', () => {
  assert.equal(keywords(undefined).size, 0);
  assert.equal(keywords(null).size, 0);
});

test('cluster groups headlines about the same event', () => {
  const [top] = cluster([
    item('Senate passes climate bill after long debate', 'NPR', -1),
    item('Senate passes climate bill in late vote', 'Fox News', 2),
    item('Unrelated story about hockey playoffs', 'CBC', -1),
  ], NOW);
  assert.equal(top.sources.length, 2);
  assert.deepEqual(top.sources.map(s => s.outlet).sort(), ['Fox News', 'NPR']);
});

test('cluster skips all-stopword headlines instead of matching everything', () => {
  const out = cluster([item('The and of to in', 'NPR', -1), item('Real story about budget cuts', 'BBC', 0)], NOW);
  assert.equal(out.length, 1);
  assert.equal(out[0].title, 'Real story about budget cuts');
});

test('blindspot flags one-sided coverage from multiple newsrooms', () => {
  const [story] = cluster([
    item('Tax proposal draws sharp criticism', 'Fox News', 2),
    item('Tax proposal draws heavy criticism', 'NY Post', 2),
  ], NOW);
  assert.equal(story.blindspot, true);
  assert.deepEqual(story.counts, { left: 0, center: 0, right: 2 });
});

test('a single newsroom is not a blindspot, however many feeds it has', () => {
  // Two NY Post feeds are one voice. Counting them as two would fake corroboration.
  const [story] = cluster([
    item('Tax proposal draws sharp criticism', 'NY Post', 2, { publisher: 'NY Post' }),
    item('Tax proposal draws heavy criticism', 'New York Post Opinion', 2, { publisher: 'NY Post' }),
  ], NOW);
  assert.equal(story.publishers, 1);
  assert.equal(story.blindspot, false);
});

test('coverage counts newsrooms, not feeds', () => {
  const c = coverage([
    { outlet: 'NY Post', publisher: 'NY Post', bias: 2 },
    { outlet: 'New York Post Opinion', publisher: 'NY Post', bias: 2 },
    { outlet: 'NPR', publisher: 'NPR', bias: -1 },
  ]);
  assert.equal(c.counts.right, 1);
  assert.equal(c.counts.left, 1);
  assert.equal(c.publishers, 2);
  assert.deepEqual(c.sides.sort(), ['left', 'right']);
});

test('coverage of nothing is empty, not a crash', () => {
  assert.deepEqual(coverage().counts, { left: 0, center: 0, right: 0 });
});

test('developing needs three newsrooms and two recent stamps', () => {
  const recent = { firstSeen: NOW - 10 * 60 * 1000 };
  const old = { firstSeen: NOW - DEVELOPING_WINDOW_MS - 60 * 1000 };
  const [hot] = cluster([
    item('Storm makes landfall near coast', 'NPR', -1, recent),
    item('Storm makes landfall on coast', 'BBC', 0, recent),
    item('Storm makes landfall along coast', 'Fox News', 2, old),
  ], NOW);
  assert.equal(hot.developing, true);

  const [cold] = cluster([
    item('Storm makes landfall near coast', 'NPR', -1, old),
    item('Storm makes landfall on coast', 'BBC', 0, old),
    item('Storm makes landfall along coast', 'Fox News', 2, old),
  ], NOW);
  assert.equal(cold.developing, false, 'nothing recent means not developing');
});

test('distinctive reports only words unique to one side', () => {
  const only = distinctive([
    { title: 'Migrants arrive at border', outlet: 'NPR', bias: -1 },
    { title: 'Illegals surge at border', outlet: 'Fox News', bias: 2 },
  ]);
  assert.ok(only.left.includes('migrants'));
  assert.ok(only.right.includes('illegals'));
  for (const k of ['left', 'right']) assert.ok(!only[k].includes('border'), 'shared words are not distinctive');
});

test('compare returns one column per side with its headlines', () => {
  const [story] = cluster([
    item('Budget deal reached in Congress', 'NPR', -1),
    item('Budget deal reached by Congress', 'Fox News', 2),
  ], NOW);
  const c = compare(story);
  assert.deepEqual(c.columns.map(col => col.side), ['left', 'center', 'right']);
  assert.equal(c.columns.find(col => col.side === 'center').headlines.length, 0);
  assert.equal(c.columns.find(col => col.side === 'left').outlets[0], 'NPR');
});

test('latest sorts newest first and sinks dateless items', () => {
  const out = latest([
    item('Old', 'A', 0, { ts: NOW - 5000 }),
    item('Undated', 'B', 0, { ts: 0 }),
    item('New', 'C', 0, { ts: NOW }),
  ]);
  assert.deepEqual(out.map(i => i.title), ['New', 'Old', 'Undated']);
});

test('latest caps its output', () => {
  const many = Array.from({ length: LATEST_CAP + 30 }, (_, i) => item(`Story ${i}`, 'A', 0));
  assert.equal(latest(many).length, LATEST_CAP);
});

const mixed = [
  item('Election results come in from three states', 'NPR', -1),
  item('Election results arrive from three states', 'Fox News', 2),
  item('Hockey team wins the championship final', 'CBC', -1),
];

test('shape filters by outlet without destroying cross-outlet clustering', () => {
  const out = shape(mixed, { outlet: 'NPR', updated: NOW, now: NOW });
  // The election cluster survives and still carries the Fox source: filtering happens after
  // clustering, so asking for NPR does not hide who else covered the same story.
  const election = out.stories.find(s => s.title.startsWith('Election'));
  assert.ok(election);
  assert.ok(election.sources.some(s => s.outlet === 'Fox News'));
  // The flat feed, by contrast, is genuinely narrowed.
  assert.ok(out.latest.every(i => i.outlet === 'NPR'));
});

test('shape honours view, q and limit', () => {
  assert.equal(shape(mixed, { view: 'latest', updated: NOW }).stories, undefined);
  assert.equal(shape(mixed, { view: 'stories', updated: NOW }).latest, undefined);
  const hockey = shape(mixed, { q: 'hockey', view: 'latest', updated: NOW });
  assert.equal(hockey.latest.length, 1);
  assert.equal(shape(mixed, { view: 'latest', limit: 1, updated: NOW }).latest.length, 1);
});

test('shape matching is case-insensitive and searches summaries', () => {
  const withSummary = [item('Opaque headline', 'A', 0, { summary: 'mentions the budget deal' })];
  assert.equal(shape(withSummary, { q: 'BUDGET', view: 'latest', updated: NOW }).latest.length, 1);
});

test('shape survives a missing item list', () => {
  const out = shape(undefined, { updated: NOW });
  assert.deepEqual(out.stories, []);
  assert.deepEqual(out.latest, []);
  assert.equal(out.updated, NOW);
});
