# TrendPulse

React-rendered news pages and an Express editor dashboard. Article links render on the server so social previews and articles work without JavaScript. RSS stories show attribution and link to the original publisher.

## Start

```sh
npm ci
npm start
```

For Render, use a free Node web service with build command `npm ci`, start command `npm start`, and HTTP health endpoint `/health`. The app uses Render's public URL automatically. Set `SITE_URL` to the HTTPS origin if you use a custom domain.

## Render environment

| Variable | Purpose |
| --- | --- |
| `CONTENT_REMOTE=true` | Read the current JSON from GitHub. Without a token, the repository must be public. |
| `GITHUB_CONTENT_TOKEN` | Fine-grained GitHub token restricted to this repository with Contents read/write. Enables persistent editor writes and private-repository reads. |
| `ADMIN_USERNAME` | Editor username. |
| `ADMIN_PASSWORD` | Editor password, 16 characters or more. |
| `SESSION_SECRET` | Separate random secret, 32 characters or more. |
| `MONETAG_ONCLICK_TAG`, `MONETAG_PUSH_TAG`, `MONETAG_VIGNETTE_TAG` | Full website tags issued by Monetag for this domain. Each stays disabled until enabled in the editor dashboard. |
| `BLUESKY_HANDLE`, `BLUESKY_APP_PASSWORD` | Authorized Bluesky account and app password for posting. |
| `BLUESKY_AUTO_PUBLISH=true` | Post new editor articles to Bluesky at publish time. RSS imports are excluded. |

Open `/admin` after configuring the editor. Keep all credentials in Render environment variables. If you make the repo private, grant Render's GitHub integration access before redeploying and configure the runtime token before switching visibility.

GitHub Actions refreshes `data/feed.json` every four hours and can also be run manually. The public pages read the latest version directly, so a Render rebuild is optional for feed-only changes. The feed retains up to 250 stories. Editor stories and the ad settings persist in `data/editorial.json`. Basic aggregate page views reset when the process restarts.

Add the website domain in Monetag and obtain the individual tags. If Monetag provides an HTML verification meta tag, put the value of its `content` attribute in `MONETAG_VERIFICATION`. Only configure publisher-issued tags. Ads are placed on public pages and independently controlled in the dashboard.
