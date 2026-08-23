// The source list. One row per feed: [outlet, bias(-2 left .. +2 right), url, publisher?].
//
// `publisher` is optional and defaults to `outlet`. It exists so two feeds from the same
// newsroom (NY Post and NY Post Opinion) don't get counted as two independent outlets when
// weighing how many voices cover a story — that inflated the right side of every bias bar
// and could suppress a blindspot flag by making a one-newsroom story look corroborated.

export const FEEDS = [
  ['CBC', -1, 'https://www.cbc.ca/webfeed/rss/rss-topstories'],
  ['The Guardian', -1, 'https://www.theguardian.com/world/rss'],
  ['NPR', -1, 'https://feeds.npr.org/1001/rss.xml'],
  ['BBC', 0, 'https://feeds.bbci.co.uk/news/world/rss.xml'],
  // Dropped 2026-08-09, all silently contributing zero items: Reuters killed its public RSS
  // (feeds.reuters.com no longer resolves), AP never had one (the rsshub.app mirror now 403s),
  // MSNBC and CTV both 404, and the Washington Post feed 301s to a dead end.
  //
  // Dropped 2026-08-13 — CNN. A different and nastier failure than the ones above: every
  // rss.cnn.com path still answers 200 with a well-formed feed, so a "does it return items?"
  // check passes, but the newest item is from 2023-04 (topstories/us), 2024-04 (edition) or
  // 2024-08 (latest). CNN discontinued RSS and left the endpoints serving a frozen snapshot.
  // Zombie feeds like this are invisible to item-count checks — run `npm run feeds` (which
  // checks recency, not just item count) before trusting any feed here.
  ['Global News', 0, 'https://globalnews.ca/feed/'],
  ['National Post', 1, 'https://nationalpost.com/feed'],
  ['Fox News', 2, 'https://moxie.foxnews.com/google-publisher/latest.xml'],
  ['NY Post', 2, 'https://nypost.com/feed/'],
  ['Daily Wire', 2, 'https://www.dailywire.com/feeds/rss.xml'],
  ['Hacker News', 0, 'https://hnrss.org/frontpage'], // tech, no political lean
  ['Daring Fireball', 0, 'https://daringfireball.net/feeds/main'], // tech commentary, no political lean
  ['NBC News', -1, 'https://feeds.nbcnews.com/nbcnews/public/news'],
  // feeds.a.dj.com froze 2025-01-27 (same zombie pattern as CNN); dowjones.io is the live host.
  ['Wall Street Journal', 1, 'https://feeds.content.dowjones.io/public/rss/RSSWorldNews'],
  ['New York Post Opinion', 2, 'https://nypost.com/opinion/feed/', 'NY Post'],
  ['Vancouver Sun', 0, 'https://vancouversun.com/feed', 'Postmedia BC'],
  ['The Province', 0, 'https://theprovince.com/feed', 'Postmedia BC'],
];

export const OUTLETS = FEEDS.map(([outlet]) => outlet);

/// Newsroom behind an outlet. Feeds that share one are one voice, not several.
export const PUBLISHERS = Object.fromEntries(
  FEEDS.map(([outlet, , , publisher]) => [outlet, publisher || outlet]),
);

export const publisherOf = outlet => PUBLISHERS[outlet] || outlet;

/// Distinct newsrooms, which is the honest answer to "how many sources is this?".
export const PUBLISHER_COUNT = new Set(Object.values(PUBLISHERS)).size;
