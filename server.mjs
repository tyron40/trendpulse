import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import express from 'express';
import helmet from 'helmet';
import { rateLimit } from 'express-rate-limit';
import { read, edit, writable } from './data.mjs';
import { publish, socialConfigured } from './social.mjs';
import { admin, article, categories, formats, home, login, page } from './views.mjs';

const app = express();
const port = Number(process.env.PORT || 3000);
const origin = new URL(process.env.SITE_URL || process.env.RENDER_EXTERNAL_URL || 'http://localhost:' + port).origin;
const secure = origin.startsWith('https:');
const username = process.env.ADMIN_USERNAME || '';
const password = process.env.ADMIN_PASSWORD || '';
const sessionKey = process.env.SESSION_SECRET || '';
const configured = Boolean(username && password.length >= 16 && sessionKey.length >= 32);
const cookieName = secure ? '__Secure-trendpulse' : 'trendpulse';
const cookieOptions = { httpOnly: true, secure, sameSite: 'strict', path: '/admin' };
const duration = 4 * 60 * 60 * 1000;
const autoSocial = socialConfigured && process.env.BLUESKY_AUTO_PUBLISH === 'true';
const tags = {
  onclick: process.env.MONETAG_ONCLICK_TAG,
  push: process.env.MONETAG_PUSH_TAG,
  vignette: process.env.MONETAG_VIGNETTE_TAG
};
const counts = { home: 0, articles: 0, byArticle: new Map() };

if (process.env.RENDER === 'true') app.set('trust proxy', 1);
app.disable('x-powered-by');
app.use(helmet({ contentSecurityPolicy: false, strictTransportSecurity: secure, crossOriginOpenerPolicy: { policy: 'same-origin-allow-popups' } }));
const restrict = helmet.contentSecurityPolicy({
  directives: {
    defaultSrc: ["'none'"], styleSrc: ["'self'"], imgSrc: ["'self'"],
    formAction: ["'self'"], frameAncestors: ["'none'"], baseUri: ["'none'"],
    upgradeInsecureRequests: secure ? [] : null
  }
});

function sign(value) {
  return createHmac('sha256', sessionKey).update(value).digest('base64url');
}
function equal(first, second) {
  const digest = value => createHash('sha256').update(value).digest();
  return timingSafeEqual(digest(first), digest(second));
}
function session(req) {
  if (!configured) return null;
  const value = req.headers.cookie?.split(/;\s*/).find(pair => pair.startsWith(cookieName + '='))?.slice(cookieName.length + 1);
  const match = value?.match(/^(\d{13})\.([\w-]{32})\.([\w-]{43})$/);
  if (!match || Number(match[1]) <= Date.now()) return null;
  const data = match[1] + '.' + match[2];
  return equal(match[3], sign(data)) ? match[2] : null;
}
function requireEditor(req, res, next) {
  req.csrf = session(req);
  if (!req.csrf) return res.redirect(303, '/admin');
  if (req.method === 'POST' && (typeof req.body?.csrf !== 'string' || !equal(req.body.csrf, req.csrf))) return res.sendStatus(403);
  next();
}

function publicPage(req, res, content, options, editorial) {
  const ads = Object.entries(tags).filter(([key, tag]) => tag && editorial?.ads?.[key]).map(([, tag]) => tag).join('\n');
  if (ads) return page(res, content, { ...options, ads });
  return restrict(req, res, () => page(res, content, options));
}
function track(req, slug) {
  if (req.method !== 'GET' || /bot|crawler|spider|preview/i.test(req.get('user-agent') || '')) return;
  if (!slug) { counts.home++; return; }
  counts.articles++;
  counts.byArticle.set(slug, (counts.byArticle.get(slug) || 0) + 1);
  if (counts.byArticle.size > 1000) counts.byArticle.delete(counts.byArticle.keys().next().value);
}
const urlFor = slug => origin + '/article/' + slug;
const text = (body, key) => typeof body?.[key] === 'string' ? body[key].trim() : '';
const messages = {
  saved: 'Article saved.',
  posted: 'Posted to Bluesky.',
  partial: 'Article saved. Bluesky publishing failed. Use Post to Bluesky to retry.',
  ads: 'Ad settings saved.',
  invalid: 'Complete the article fields and choose a topic.',
  missing: 'The article could not be found.'
};
const redirect = (res, status) => res.redirect(303, '/admin?status=' + status);

app.use(express.static(fileURLToPath(new URL('./public', import.meta.url))));
app.get('/health', (req, res) => res.json({ status: 'ok' }));
app.use('/admin', restrict, (req, res, next) => {
  res.set('Cache-Control', 'no-store');
  if (req.method === 'POST' && req.get('origin') !== origin) return res.sendStatus(403);
  next();
}, express.urlencoded({ extended: false, limit: '64kb', parameterLimit: 10 }));

app.get('/', async (req, res) => {
  const [editorial, feed] = await Promise.all([read('editorial'), read('feed')]);
  const topic = categories.includes(req.query.topic) ? req.query.topic : null;
  const stories = [...editorial.articles, ...feed]
    .filter(story => !topic || story.category === topic)
    .sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
  track(req);
  publicPage(req, res, home(stories.slice(0, 31), topic), {
    title: topic || undefined, description: 'Latest headlines from TrendPulse, BBC News and BBC Sport.'
  }, editorial);
});

app.get('/article/:slug', async (req, res) => {
  const [editorial, feed] = await Promise.all([read('editorial'), read('feed')]);
  const story = editorial.articles.find(item => item.slug === req.params.slug) || feed.find(item => item.slug === req.params.slug);
  if (!story) return publicPage(req, res, 'Article not found.', { title: 'Article not found', status: 404 });
  track(req, story.slug);
  const url = urlFor(story.slug);
  publicPage(req, res, article(story, url), { title: story.title, description: story.summary, url }, editorial);
});

app.get('/admin', async (req, res) => {
  const csrf = session(req);
  if (!csrf) return page(res, login(configured, req.query.failed === '1' ? 'Sign-in failed.' : ''), { title: 'Editor sign-in' });
  const content = await read('editorial');
  const selected = content.articles.find(item => item.slug === req.query.edit);
  const top = [...counts.byArticle].sort((a, b) => b[1] - a[1]).slice(0, 8);
  const message = typeof req.query.status === 'string' && Object.hasOwn(messages, req.query.status) ? messages[req.query.status] : '';
  page(res, admin({ content, csrf, selected, ads: tags, writable, socialConfigured, autoSocial, counts: { ...counts, top }, message }), { title: 'Editor dashboard' });
});
app.post('/admin/login', rateLimit({ windowMs: 15 * 60 * 1000, limit: 8, standardHeaders: 'draft-8' }), (req, res) => {
  if (!configured) return res.sendStatus(503);
  const userMatches = equal(text(req.body, 'username'), username);
  const passwordMatches = equal(typeof req.body?.password === 'string' ? req.body.password : '', password);
  if (!userMatches || !passwordMatches) return res.redirect(303, '/admin?failed=1');
  const token = (Date.now() + duration) + '.' + randomBytes(24).toString('base64url');
  res.cookie(cookieName, token + '.' + sign(token), { ...cookieOptions, maxAge: duration }).redirect(303, '/admin');
});
app.post('/admin/logout', requireEditor, (req, res) =>
  res.clearCookie(cookieName, cookieOptions).redirect(303, '/admin'));

app.post('/admin/article', requireEditor, async (req, res) => {
  const existing = text(req.body, 'slug');
  const title = text(req.body, 'title');
  const summary = text(req.body, 'summary');
  const body = text(req.body, 'body');
  const category = text(req.body, 'category');
  if (!title || title.length > 180 || !summary || summary.length > 420 || !body || body.length > 12000 || !categories.includes(category)) return redirect(res, 'invalid');
  const slug = existing || ((title.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 36).replace(/^-|-$/g, '') || 'story') + '-' + randomBytes(5).toString('hex'));
  const story = { slug, title, summary, body, category, publishedAt: new Date().toISOString() };
  await edit(existing ? 'Update editorial article' : 'Publish editorial article', content => {
    const index = content.articles.findIndex(item => item.slug === slug);
    if (existing && index < 0) throw new Error('The article could not be found.');
    if (index < 0) content.articles.unshift(story);
    else content.articles[index] = { ...story, publishedAt: content.articles[index].publishedAt };
  });
  if (!existing && autoSocial) {
    try {
      await publish(story, urlFor(slug));
      return redirect(res, 'posted');
    } catch (error) {
      console.error(error.message);
      return redirect(res, 'partial');
    }
  }
  return redirect(res, 'saved');
});
app.post('/admin/ads', requireEditor, async (req, res) => {
  await edit('Update ad settings', content => {
    for (const key of Object.keys(formats)) content.ads[key] = Boolean(tags[key] && req.body[key] === 'on');
  });
  redirect(res, 'ads');
});
app.post('/admin/social', requireEditor, async (req, res) => {
  const content = await read('editorial');
  const story = content.articles.find(item => item.slug === text(req.body, 'slug'));
  if (!story) return redirect(res, 'missing');
  await publish(story, urlFor(story.slug));
  redirect(res, 'posted');
});
app.use((req, res) => restrict(req, res, () => page(res, 'Page not found.', { title: 'Page not found', status: 404 })));
app.use((error, req, res, next) => {
  if (res.headersSent) return next(error);
  console.error(error.message);
  const status = error.status >= 400 && error.status < 500 ? error.status : 503;
  restrict(req, res, () => page(res, 'The request could not be completed. Please try again.', { status, title: 'Request unavailable' }));
});
app.listen(port, '0.0.0.0', () => console.log('TrendPulse listening on port ' + port));
