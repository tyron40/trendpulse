import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import Parser from 'rss-parser';

const feeds = [
  ['World', 'https://feeds.bbci.co.uk/news/world/rss.xml'],
  ['Technology', 'https://feeds.bbci.co.uk/news/technology/rss.xml'],
  ['Business', 'https://feeds.bbci.co.uk/news/business/rss.xml'],
  ['Science', 'https://feeds.bbci.co.uk/news/science_and_environment/rss.xml'],
  ['Culture', 'https://feeds.bbci.co.uk/news/entertainment_and_arts/rss.xml'],
  ['Sports', 'https://feeds.bbci.co.uk/sport/rss.xml']
];
const target = new URL('../data/feed.json', import.meta.url);
const previous = JSON.parse(await readFile(target, 'utf8'));
const parser = new Parser({ timeout: 12000, maxRedirects: 3 });
const results = await Promise.allSettled(feeds.map(async ([category, url]) => {
  const feed = await parser.parseURL(url);
  return (feed.items || []).slice(0, 25).flatMap(item => {
    const publishedAt = new Date(item.isoDate || item.pubDate || '');
    const link = item.link;
    if (!item.title || !URL.canParse(link) || new URL(link).protocol !== 'https:' || !Number.isFinite(+publishedAt)) return [];
    return [{
      slug: 'news-' + createHash('sha256').update(link).digest('hex').slice(0, 20),
      title: item.title.slice(0, 180),
      summary: (item.contentSnippet || '').replace(/\s+/g, ' ').trim().slice(0, 420),
      link,
      category,
      source: category === 'Sports' ? 'BBC Sport' : 'BBC News',
      publishedAt: publishedAt.toISOString()
    }];
  });
}));
if (!results.some(result => result.status === 'fulfilled' && result.value.length)) {
  throw new Error('No stories retrieved. Existing feed was preserved.');
}
results.forEach((result, index) => {
  if (result.status === 'rejected') console.error(feeds[index][0], result.reason.message);
});
const unique = new Map(previous.map(story => [story.slug, story]));
for (const result of results) {
  if (result.status === 'fulfilled') {
    for (const story of result.value) unique.set(story.slug, story);
  }
}
const sorted = [...unique.values()].sort((a, b) => b.publishedAt.localeCompare(a.publishedAt) || a.slug.localeCompare(b.slug));
await writeFile(target, JSON.stringify(sorted.slice(0, 250), null, 2) + '\n');
console.log('Stored', Math.min(sorted.length, 250), 'stories');
