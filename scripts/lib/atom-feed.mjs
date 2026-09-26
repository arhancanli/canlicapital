// The site's Atom feed: every research paper and engineering note, newest first. Feed readers,
// aggregators such as Quantocracy, and search engines (which accept a feed as a sitemap) read it
// to learn about new and changed pages. Each entry's date is the page's own sitemap lastmod, so
// the feed and the sitemap cannot disagree, and an undated page is left out rather than dated.
const esc = (value) => String(value)
  .replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");

// Sitemap dates are calendar days; Atom needs a full RFC 3339 timestamp.
export const atomDate = (day) => {
  if (!/^\d{4}-\d{2}-\d{2}/.test(day ?? "")) throw new Error(`not a date: ${day}`);
  return day.length === 10 ? `${day}T00:00:00Z` : new Date(day).toISOString().replace(/\.\d{3}Z$/, "Z");
};

export function renderAtomFeed(entries, { origin, title, subtitle, author, authorUri, alternate }) {
  const dated = entries.filter((entry) => entry.updated);
  if (!dated.length) throw new Error("a feed needs at least one dated entry");
  const ordered = [...dated].sort((a, b) => b.updated.localeCompare(a.updated) || a.title.localeCompare(b.title));
  const updated = atomDate(ordered[0].updated);
  const self = `${origin}/feed.xml`;
  const body = ordered.map((entry) => [
    "  <entry>",
    `    <title>${esc(entry.title)}</title>`,
    `    <link rel="alternate" type="text/html" href="${esc(entry.url)}"/>`,
    `    <id>${esc(entry.url)}</id>`,
    `    <updated>${atomDate(entry.updated)}</updated>`,
    ...(entry.category ? [`    <category term="${esc(entry.category)}"/>`] : []),
    `    <summary>${esc(entry.summary)}</summary>`,
    "  </entry>",
  ].join("\n")).join("\n");
  return `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>${esc(title)}</title>
  <subtitle>${esc(subtitle)}</subtitle>
  <link rel="self" type="application/atom+xml" href="${self}"/>
  <link rel="alternate" type="text/html" href="${esc(alternate)}"/>
  <id>${self}</id>
  <updated>${updated}</updated>
  <author><name>${esc(author)}</name><uri>${esc(authorUri)}</uri></author>
${body}
</feed>
`;
}
