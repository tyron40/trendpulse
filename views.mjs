import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { caption } from './social.mjs';

const h = React.createElement;
export const categories = ['World', 'Technology', 'Business', 'Science', 'Culture', 'Sports'];
export const formats = { onclick: 'OnClick', push: 'In-Page Push', vignette: 'Vignette' };
const articlePath = story => '/article/' + story.slug;
const date = value => new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeZone: 'UTC' }).format(new Date(value));
const link = (href, label, props = {}) => h('a', { href, ...props }, label);

export function page(res, content, { title, description, url, ads = '', status = 200 } = {}) {
  const document = h('html', { lang: 'en' },
    h('head', null,
      h('meta', { charSet: 'utf-8' }),
      h('meta', { name: 'viewport', content: 'width=device-width, initial-scale=1' }),
      h('title', null, title ? title + ' | TrendPulse' : 'TrendPulse | The latest headlines'),
      description && h('meta', { name: 'description', content: description }),
      title && h('meta', { property: 'og:title', content: title }),
      description && h('meta', { property: 'og:description', content: description }),
      url && h(React.Fragment, null,
        h('meta', { property: 'og:url', content: url }),
        h('meta', { property: 'og:type', content: 'article' }),
        h('link', { rel: 'canonical', href: url })),
      process.env.MONETAG_VERIFICATION && h('meta', { name: 'monetag', content: process.env.MONETAG_VERIFICATION }),
      h('link', { rel: 'stylesheet', href: '/style.css' })),
    h('body', null,
      h('header', { className: 'masthead' },
        link('/', h(React.Fragment, null, 'Trend', h('span', null, 'Pulse')), { className: 'brand' }),
        h('nav', { 'aria-label': 'Topics' }, categories.map(category =>
          link('/?topic=' + category, category, { key: category })))),
      h('main', { id: 'content' }, content),
      h('footer', null, link('/', 'TrendPulse'), link('/admin', 'Editor sign-in'))));
  const markup = renderToStaticMarkup(document);
  const headEnd = markup.indexOf('</head>');
  res.status(status).type('html').send('<!doctype html>' + markup.slice(0, headEnd) + ads + markup.slice(headEnd));
}

function storyMeta(story) {
  return h('p', { className: 'meta' },
    h('span', null, story.category), ' · ', story.source || 'TrendPulse', ' · ', date(story.publishedAt));
}

export function home(stories, topic) {
  const [lead, ...rest] = stories;
  return h(React.Fragment, null,
    h('section', { className: 'hero' },
      h('div', { className: 'hero-inner' },
        h('p', { className: 'eyebrow' }, topic ? 'Latest in' : 'News digest'),
        h('h1', null, topic || 'The latest headlines'),
        lead && h('div', { className: 'lead' },
          storyMeta(lead),
          h('h2', null, link(articlePath(lead), lead.title)),
          lead.summary && h('p', { className: 'summary' }, lead.summary),
          link(articlePath(lead), 'Read story →', { className: 'story-link' })))),
    h('div', { className: 'wrap' },
      rest.length > 0 && h('section', null,
        h('h2', { className: 'section-title' }, 'More stories'),
        h('div', { className: 'grid' }, rest.map(story =>
          h('article', { className: 'card', key: story.slug },
            storyMeta(story), h('h3', null, link(articlePath(story), story.title)),
            story.summary && h('p', { className: 'summary' }, story.summary))))),
      !lead && h('p', { className: 'section-title' }, 'No stories are available yet.')));
}

export function article(story, url) {
  const encoded = encodeURIComponent(url);
  return h('article', { className: 'wrap reading' },
    link('/', '← Latest headlines', { className: 'story-link' }),
    storyMeta(story), h('h1', null, story.title),
    story.summary && h('p', { className: 'deck' }, story.summary),
    story.body && h('div', { className: 'article-body' }, story.body),
    story.link && link(story.link, 'Read the full story at ' + story.source + ' ↗', { className: 'button', rel: 'noopener noreferrer' }),
    h('section', { className: 'share', 'aria-label': 'Share article' },
      h('h2', null, 'Share this story'),
      h('input', { 'aria-label': 'Article link', readOnly: true, defaultValue: url }),
      h('div', { className: 'links' },
        link('https://www.facebook.com/sharer/sharer.php?u=' + encoded, 'Facebook'),
        link('https://bsky.app/intent/compose?text=' + encodeURIComponent(caption(story) + '\n' + url), 'Bluesky'),
        link('mailto:?subject=' + encodeURIComponent(caption(story)) + '&body=' + encoded, 'Email'))));
}

const field = (name, label, attributes) => h('label', null, label, h('input', { name, ...attributes }));
const hidden = (name, value) => h('input', { type: 'hidden', name, value });
const submit = label => h('button', { type: 'submit' }, label);
const notice = message => message && h('p', { className: 'notice', role: 'status' }, message);

export function login(configured, message) {
  return h('section', { className: 'wrap reading' }, h('h1', null, 'Editor sign-in'),
    notice(message), configured ? h('form', { method: 'post', action: '/admin/login' },
      field('username', 'Username', { autoComplete: 'username', required: true }),
      field('password', 'Password', { type: 'password', autoComplete: 'current-password', required: true }),
      submit('Sign in')) : h('p', null, 'Editor sign-in is awaiting server configuration.'));
}

export function admin({ content, csrf, selected, ads, writable, socialConfigured, autoSocial, counts, message }) {
  const story = selected || {};
  const form = (action, ...children) => h('form', { method: 'post', action }, hidden('csrf', csrf), ...children);
  return h('div', { className: 'wrap admin' },
    h('h1', null, 'Editor dashboard'),
    form('/admin/logout', submit('Sign out')),
    notice(message),
    !writable && notice('Set GITHUB_CONTENT_TOKEN to enable article and ad settings changes.'),
    h('section', null,
      h('h2', null, selected ? 'Edit article' : 'Create article'),
      form('/admin/article', hidden('slug', story.slug || ''),
        field('title', 'Headline', { defaultValue: story.title, required: true, maxLength: 180 }),
        field('summary', 'Summary', { defaultValue: story.summary, required: true, maxLength: 420 }),
        h('label', null, 'Topic', h('select', { name: 'category', defaultValue: story.category || categories[0] },
          categories.map(category => h('option', { key: category }, category)))),
        h('label', null, 'Article text', h('textarea', { name: 'body', rows: 9, defaultValue: story.body, required: true, maxLength: 12000 })),
        h('button', { disabled: !writable }, selected ? 'Save changes' : 'Publish article')),
      selected && link('/admin', 'Create a new article')),
    h('section', null, h('h2', null, 'Published articles'),
      content.articles.length === 0 && h('p', null, 'No editor articles yet.'),
      h('ul', { className: 'editor-list' }, content.articles.map(item =>
        h('li', { key: item.slug }, link(articlePath(item), item.title), ' ',
          link('/admin?edit=' + item.slug, 'Edit'),
          socialConfigured && form('/admin/social', hidden('slug', item.slug), submit('Post to Bluesky'))))),
      h('p', null, socialConfigured
        ? (autoSocial ? 'New editor articles automatically post to Bluesky.' : 'Use Post to Bluesky to publish a caption and link.')
        : 'Set a Bluesky handle and app password to enable publishing.')),
    h('section', null, h('h2', null, 'Monetag'),
      form('/admin/ads',
        Object.entries(formats).map(([key, label]) =>
          h('label', { key, className: 'check' },
            h('input', { name: key, type: 'checkbox', disabled: !ads[key], defaultChecked: Boolean(content.ads[key] && ads[key]) }),
            label + (ads[key] ? '' : ' (tag required)'))),
        h('button', { disabled: !writable }, 'Save ad settings'))),
    h('section', null, h('h2', null, 'Page views'),
      h('p', null, 'Counts since this server started.'),
      h('p', null, counts.home + ' homepage views · ' + counts.articles + ' article views'),
      h('ul', null, counts.top.map(([slug, count]) =>
        h('li', { key: slug }, link('/article/' + slug, slug), ' · ', count)))));
}
