export const socialConfigured = Boolean(process.env.BLUESKY_HANDLE && process.env.BLUESKY_APP_PASSWORD);
const service = 'https://bsky.social/xrpc/';
export const caption = article => [...article.title].slice(0, 175).join('') + ' | TrendPulse';

async function call(method, data, token) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = 'Bearer ' + token;
  const response = await fetch(service + method, {
    method: 'POST', headers, body: JSON.stringify(data), signal: AbortSignal.timeout(10000)
  });
  if (!response.ok) throw new Error('Bluesky returned HTTP ' + response.status);
  return response.json();
}

export async function publish(article, url) {
  if (!socialConfigured) throw new Error('Bluesky requires a handle and app password.');
  const session = await call('com.atproto.server.createSession', {
    identifier: process.env.BLUESKY_HANDLE,
    password: process.env.BLUESKY_APP_PASSWORD
  });
  await call('com.atproto.repo.putRecord', {
    repo: session.did,
    collection: 'app.bsky.feed.post',
    rkey: 'trendpulse-' + article.slug,
    record: {
      $type: 'app.bsky.feed.post',
      text: caption(article),
      createdAt: article.publishedAt,
      embed: {
        $type: 'app.bsky.embed.external',
        external: { uri: url, title: article.title, description: article.summary }
      }
    }
  }, session.accessJwt);
}
