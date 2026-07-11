// newsline worker: fetch multi-outlet RSS, cluster same-story headlines, tag bias.
// ponytail: naive O(n²) title-overlap clustering; upgrade to embeddings if quality matters.

const FEEDS = [
  // [outlet, bias(-2 left .. +2 right), url]
  ['CBC', -1, 'https://www.cbc.ca/webfeed/rss/rss-topstories'],
  ['The Guardian', -1, 'https://www.theguardian.com/world/rss'],
  ['CNN', -1, 'http://rss.cnn.com/rss/cnn_topstories.rss'],
  ['NPR', -1, 'https://feeds.npr.org/1001/rss.xml'],
  ['MSNBC', -2, 'https://feeds.nbcnews.com/msnbc/public/news'],
  ['BBC', 0, 'https://feeds.bbci.co.uk/news/world/rss.xml'],
  ['Reuters', 0, 'https://feeds.reuters.com/reuters/topNews'],
  ['AP', 0, 'https://rsshub.app/apnews/topics/apf-topnews'],
  ['CTV', 0, 'https://www.ctvnews.ca/rss/ctvnews-ca-top-stories-public-rss-1.822009'],
  ['Global News', 0, 'https://globalnews.ca/feed/'],
  ['National Post', 1, 'https://nationalpost.com/feed'],
  ['Fox News', 2, 'https://moxie.foxnews.com/google-publisher/latest.xml'],
  ['NY Post', 2, 'https://nypost.com/feed/'],
  ['Daily Wire', 2, 'https://www.dailywire.com/feeds/rss.xml'],
];

const STOP = new Set('the a an of to in on for and or as at by is are was with after over from amid says say new'.split(' '));

function parseItems(xml, outlet, bias) {
  const items = [];
  for (const m of xml.matchAll(/<item[\s\S]*?<\/item>/g)) {
    const block = m[0];
    const title = (block.match(/<title>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/) || [])[1];
    const link = (block.match(/<link>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/link>/) || [])[1];
    if (title && link) items.push({ title: title.trim(), link: link.trim(), outlet, bias });
    if (items.length >= 25) break;
  }
  return items;
}

function keywords(title) {
  return new Set(title.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/)
    .filter(w => w.length > 2 && !STOP.has(w)));
}

function overlap(a, b) {
  let n = 0;
  for (const w of a) if (b.has(w)) n++;
  return n / Math.min(a.size, b.size);
}

function cluster(items) {
  const clusters = [];
  for (const item of items) {
    const kw = keywords(item.title);
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
    .map(c => ({
      title: c.items[0].title,
      sources: c.items.map(({ title, link, outlet, bias }) => ({ title, link, outlet, bias })),
    }));
}

export default {
  async fetch(req, env, ctx) {
    const cache = caches.default;
    const cacheKey = new Request(new URL(req.url).origin + '/stories');
    let res = await cache.match(cacheKey);
    if (!res) {
      const results = await Promise.allSettled(FEEDS.map(async ([outlet, bias, url]) => {
        const r = await fetch(url, { headers: { 'user-agent': 'newsline/0.1' }, signal: AbortSignal.timeout(8000) });
        return parseItems(await r.text(), outlet, bias);
      }));
      const items = results.flatMap(r => r.status === 'fulfilled' ? r.value : []);
      res = new Response(JSON.stringify({ updated: Date.now(), stories: cluster(items).slice(0, 60) }), {
        headers: {
          'content-type': 'application/json',
          'access-control-allow-origin': '*',
          'cache-control': 'public, max-age=600',
        },
      });
      ctx.waitUntil(cache.put(cacheKey, res.clone()));
    }
    return res;
  },
};
