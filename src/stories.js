// Clustering, bias tagging and the per-request shaping of the cached feed pull.
// ponytail: naive O(n²) title-overlap clustering; upgrade to embeddings if quality matters.

import { publisherOf } from './feeds.js';

const STOP = new Set(
  ('the a an of to in on for and or as at by is are was with after over from amid says say new ' +
   'this that it its his her their they we you but not has have had will would could should ' +
   'about into more than what when who how why been being were where which')
    .split(' '),
);

export const LATEST_CAP = 120;
export const STORY_CAP = 60;

/// A story counts as developing when several newsrooms pile onto it in a short window.
/// 90 minutes is long enough to survive one 2-minute feed cache miss, short enough that a
/// day-old story doesn't keep the badge.
export const DEVELOPING_WINDOW_MS = 90 * 60 * 1000;
const DEVELOPING_MIN_PUBLISHERS = 3;

export function keywords(title) {
  return new Set(
    title.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/)
      .filter(w => w.length > 2 && !STOP.has(w)),
  );
}

function overlap(a, b) {
  let n = 0;
  for (const w of a) if (b.has(w)) n++;
  return n / Math.min(a.size, b.size);
}

export function side(bias) {
  return bias < 0 ? 'left' : bias > 0 ? 'right' : 'center';
}

// flat reverse-chron reader across every source (dateless items sink to bottom)
export function latest(items, cap = LATEST_CAP) {
  return [...items].sort((a, b) => b.ts - a.ts).slice(0, cap);
}

const SOURCE_KEYS = ['title', 'link', 'outlet', 'publisher', 'bias', 'ts', 'firstSeen', 'summary', 'image'];

function toSource(item) {
  const out = {};
  for (const k of SOURCE_KEYS) if (item[k] !== undefined) out[k] = item[k];
  out.publisher = item.publisher || publisherOf(item.outlet);
  return out;
}

/// Which sides and how many *newsrooms* cover a story. Counting outlets instead of
/// newsrooms let one publisher's two feeds masquerade as corroboration.
export function coverage(sources) {
  const counts = { left: 0, center: 0, right: 0 };
  const seen = { left: new Set(), center: new Set(), right: new Set() };
  const publishers = new Set();
  for (const s of sources) {
    const k = side(s.bias);
    const pub = s.publisher || publisherOf(s.outlet);
    publishers.add(pub);
    if (!seen[k].has(pub)) {
      seen[k].add(pub);
      counts[k]++;
    }
  }
  const sides = Object.keys(counts).filter(k => counts[k] > 0);
  return { counts, sides, publishers: publishers.size };
}

/// Words one side uses that the others don't — the raw material for the compare view.
/// Purely lexical: it shows where the framing diverges, it does not claim to judge it.
export function distinctive(sources) {
  const bySide = { left: new Set(), center: new Set(), right: new Set() };
  for (const s of sources) for (const w of keywords(s.title)) bySide[side(s.bias)].add(w);
  const only = {};
  for (const k of Object.keys(bySide)) {
    const others = Object.keys(bySide).filter(o => o !== k);
    only[k] = [...bySide[k]]
      .filter(w => others.every(o => !bySide[o].has(w)))
      .sort();
  }
  return only;
}

/// Full side-by-side breakdown of one cluster: each side's headlines plus the words unique
/// to it. Computed on demand — it roughly doubles a story's payload size.
export function compare(story) {
  const only = distinctive(story.sources);
  const columns = ['left', 'center', 'right'].map(k => ({
    side: k,
    outlets: [...new Set(story.sources.filter(s => side(s.bias) === k).map(s => s.outlet))],
    headlines: story.sources.filter(s => side(s.bias) === k)
      .map(({ title, link, outlet, ts }) => ({ title, link, outlet, ...(ts ? { ts } : {}) })),
    only: only[k],
  }));
  return { title: story.title, blindspot: story.blindspot, columns };
}

export function cluster(items, now = Date.now()) {
  // Seed each cluster with the newest headline so the cluster's title is the current wording
  // rather than whichever outlet happens to sit first in FEEDS.
  const ordered = [...items].sort((a, b) => b.ts - a.ts);
  const clusters = [];
  for (const item of ordered) {
    const kw = keywords(item.title);
    if (!kw.size) continue; // an all-stopword headline would match everything
    // ponytail: unioning the matched keywords into the cluster makes matching progressively
    // greedier, so grouping depends on arrival order. Left as-is deliberately — it is the
    // shipped behaviour and the tests pin it; revisit together with the embeddings upgrade.
    const hit = clusters.find(c => overlap(kw, c.kw) >= 0.5);
    if (hit) {
      hit.items.push(item);
      for (const w of kw) hit.kw.add(w);
    } else {
      clusters.push({ kw, items: [item] });
    }
  }
  return clusters
    .sort((a, b) => b.items.length - a.items.length)
    .map(c => {
      const sources = c.items.map(toSource);
      const { counts, sides, publishers } = coverage(sources);
      const stamps = sources.map(s => s.firstSeen || s.ts).filter(Boolean);
      const firstSeen = stamps.length ? Math.min(...stamps) : 0;
      const recent = stamps.filter(t => now - t <= DEVELOPING_WINDOW_MS).length;
      return {
        title: c.items[0].title,
        sources,
        counts,
        publishers,
        ts: Math.max(0, ...sources.map(s => s.ts || 0)),
        ...(firstSeen ? { firstSeen } : {}),
        blindspot: sides.length === 1 && publishers > 1,
        developing: publishers >= DEVELOPING_MIN_PUBLISHERS && recent >= 2,
      };
    });
}

// Filter + shape the cached feed pull for one request. Runs per-request, outside the cache,
// so query params can never leak one caller's filtered response to another.
// Clusters are filtered *after* clustering — narrowing items first would destroy the
// cross-outlet grouping that makes the stories view worth anything.
export function shape(items, opts = {}) {
  const {
    view = 'both', outlet, bias, blindspot, developing, q, limit,
    compare: withCompare, updated = Date.now(), now = updated,
  } = opts;
  const needle = q ? q.toLowerCase() : '';
  const wantOutlet = outlet ? outlet.toLowerCase() : '';

  const sourceMatches = s =>
    (!wantOutlet || s.outlet.toLowerCase() === wantOutlet) && (!bias || side(s.bias) === bias);
  const matchesText = it =>
    !needle || it.title.toLowerCase().includes(needle) ||
    (it.summary ? it.summary.toLowerCase().includes(needle) : false);

  const out = { updated };

  if (view === 'stories' || view === 'both') {
    out.stories = cluster(items, now)
      .filter(s =>
        (!blindspot || s.blindspot) &&
        (!developing || s.developing) &&
        (!needle || matchesText(s) || s.sources.some(matchesText)) &&
        s.sources.some(sourceMatches))
      .slice(0, limit ?? STORY_CAP)
      .map(s => (withCompare ? { ...s, compare: compare(s) } : s));
  }
  if (view === 'latest' || view === 'both') {
    // Filter before latest(), not after — latest() caps at 120, and filtering a pre-truncated
    // list makes a low-volume outlet like Daring Fireball return nothing.
    out.latest = latest(items.filter(it => sourceMatches(it) && matchesText(it)))
      .slice(0, limit ?? LATEST_CAP)
      .map(toSource);
  }
  return out;
}
