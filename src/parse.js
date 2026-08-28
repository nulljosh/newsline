// RSS/Atom parsing. Regex-based on purpose: Workers have no DOMParser, and pulling in a real
// XML parser costs more bundle than the malformed-feed cases it would buy us.

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };

// Feeds double-escape freely; consumers should get real text, not &#8217; and &amp;.
export function decode(s) {
  if (typeof s !== 'string') return '';
  return s.replace(/&(?:#(\d+)|#x([0-9a-f]+)|([a-z]+));/gi, (m, dec, hex, name) => {
    if (dec) {
      const n = +dec;
      return n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : m;
    }
    if (hex) {
      const n = parseInt(hex, 16);
      return n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : m;
    }
    return ENTITIES[name.toLowerCase()] ?? m;
  });
}

/// Feed summaries are HTML, and usually *double*-escaped HTML. Decode-then-strip has to run
/// twice or `&lt;p&gt;` survives the strip and reappears as real markup after the decode —
/// which is how escaped markup leaks into a plain-text field. Two passes, then drop any
/// stray angle brackets: this field is plain text, so it has no legitimate use for them.
export function stripTags(html, max = 280) {
  if (typeof html !== 'string') return '';
  let text = html;
  for (let pass = 0; pass < 2; pass++) {
    text = decode(text)
      .replace(/<(script|style)\b[\s\S]*?<\/\1>/gi, '')
      .replace(/<[^>]*>/g, ' ');
  }
  text = text.replace(/[<>]/g, '').replace(/\s+/g, ' ').trim();
  return text.length > max ? text.slice(0, max - 1).trimEnd() + '…' : text;
}

const tag = (block, name) =>
  (block.match(new RegExp(`<${name}[^>]*>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?</${name}>`)) || [])[1];

/// The first plausible article image, if the feed offers one. Feeds disagree wildly about
/// where it lives, so try the four common spellings and accept nothing if none match.
function image(block) {
  const m =
    block.match(/<media:(?:thumbnail|content)[^>]*\burl=["']([^"']+)["']/i) ||
    block.match(/<enclosure[^>]*\btype=["']image\/[^"']*["'][^>]*\burl=["']([^"']+)["']/i) ||
    block.match(/<enclosure[^>]*\burl=["']([^"']+\.(?:jpe?g|png|webp|avif))["']/i) ||
    block.match(/<itunes:image[^>]*\bhref=["']([^"']+)["']/i);
  if (!m) return undefined;
  const url = decode(m[1].trim());
  return /^https:\/\//i.test(url) ? url : undefined; // http images would break the page's TLS
}

/// Only ever hand clients a link a browser can safely open. A feed is third-party input;
/// `javascript:` and `data:` in a headline link are a real vector, not a hypothetical one.
export function safeLink(link) {
  if (typeof link !== 'string') return undefined;
  try {
    const u = new URL(link);
    return u.protocol === 'https:' || u.protocol === 'http:' ? u.href : undefined;
  } catch {
    return undefined;
  }
}

export function parseItems(xml, outlet, bias, publisher = outlet) {
  const items = [];
  // A feed that answered with a non-string body (or nothing) is a dead feed, not a crash.
  if (typeof xml !== 'string' || !xml) return items;
  // RSS uses <item> with a <link>text</link>; Atom uses <entry> with <link href="…"/>,
  // often several per entry (alternate / shorturl / related) — take the alternate.
  for (const m of xml.matchAll(/<(item|entry)\b[\s\S]*?<\/\1>/g)) {
    const block = m[0];
    const title = tag(block, 'title');
    const rawLink = (
      block.match(/<link>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/link>/) ||
      block.match(/<link[^>]*\brel=["']alternate["'][^>]*\bhref=["']([^"']+)["']/) ||
      block.match(/<link[^>]*\bhref=["']([^"']+)["']/) || [])[1];
    const date = (block.match(/<(pubDate|dc:date|published|updated)>([\s\S]*?)<\/\1>/) || [])[2];
    const ts = date ? Date.parse(date.trim()) : NaN;
    const link = rawLink && safeLink(decode(rawLink.trim()));
    const summaryRaw = tag(block, 'description') || tag(block, 'summary');
    if (title && link) {
      const clean = decode(title.trim()).replace(/\s+/g, ' ').trim();
      if (!clean) continue;
      const summary = summaryRaw ? stripTags(summaryRaw) : '';
      const img = image(block);
      items.push({
        title: clean,
        link,
        outlet,
        publisher,
        bias,
        ts: isNaN(ts) ? 0 : ts,
        ...(summary && summary !== clean ? { summary } : {}),
        ...(img ? { image: img } : {}),
      });
    }
    if (items.length >= 25) break;
  }
  return items;
}
