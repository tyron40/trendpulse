import { readFile } from 'node:fs/promises';

const repository = process.env.CONTENT_REPOSITORY || 'tyron40/trendpulse';
const branch = process.env.CONTENT_BRANCH || 'main';
const files = { editorial: 'data/editorial.json', feed: 'data/feed.json' };
const cache = new Map();
export const writable = Boolean(process.env.GITHUB_CONTENT_TOKEN);

async function github(key, method = 'GET', body) {
  const url = new URL('https://api.github.com/repos/' + repository + '/contents/' + files[key]);
  if (method === 'GET') url.searchParams.set('ref', branch);
  const headers = { Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' };
  if (writable) headers.Authorization = 'Bearer ' + process.env.GITHUB_CONTENT_TOKEN;
  if (body) headers['Content-Type'] = 'application/json';
  return fetch(url, { method, headers, body: body && JSON.stringify(body), signal: AbortSignal.timeout(8000) });
}

function decode(file) {
  return JSON.parse(Buffer.from(file.content, 'base64').toString('utf8'));
}

export async function read(key) {
  const stored = cache.get(key);
  if (stored && stored.expires > Date.now()) return stored.value;
  if (process.env.CONTENT_REMOTE !== 'true' && !writable) {
    return JSON.parse(await readFile(new URL(files[key], import.meta.url), 'utf8'));
  }
  try {
    const response = await github(key);
    if (!response.ok) throw new Error('GitHub content read HTTP ' + response.status);
    const value = decode(await response.json());
    cache.set(key, { value, expires: Date.now() + 120000 });
    return value;
  } catch (error) {
    console.error(error.message);
    const value = stored?.value ?? JSON.parse(await readFile(new URL(files[key], import.meta.url), 'utf8'));
    cache.set(key, { value, expires: Date.now() + 15000 });
    return value;
  }
}

export async function edit(message, change) {
  if (!writable) throw new Error('Set GITHUB_CONTENT_TOKEN to enable publishing.');
  for (let attempt = 0; attempt < 4; attempt++) {
    const response = await github('editorial');
    if (!response.ok) throw new Error('GitHub content read HTTP ' + response.status);
    const file = await response.json();
    const content = decode(file);
    change(content);
    const result = await github('editorial', 'PUT', {
      message, branch, sha: file.sha,
      content: Buffer.from(JSON.stringify(content, null, 2) + '\n').toString('base64')
    });
    if (result.ok) {
      cache.set('editorial', { value: content, expires: Date.now() + 120000 });
      return;
    }
    if (result.status !== 409) throw new Error('GitHub content write HTTP ' + result.status);
  }
  throw new Error('The article store changed while saving. Retry your edit.');
}
