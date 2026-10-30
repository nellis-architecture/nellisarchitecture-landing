# Nellis Architecture — Static Site

A 1:1 static rebuild of nellisarchitecture.com. No WordPress, no PHP, no database —
nothing for attackers to exploit. All original functionality (project overlays,
category filters, live search, news switching) is reproduced client-side from
static JSON snapshots.

## Process & docs

How this project is run — start here:

- **Conventions and working agreements:** [AGENTS.md](AGENTS.md) — principles, code style, content and SEO rules, testing.
- **How we work (workflows):** [development](docs/workflow/development.md) · [grooming](docs/workflow/grooming.md) · [incident response](docs/workflow/incident.md). Driven by `/ticket`, `/groom` and `/incident` in [Claude Code](https://code.claude.com/docs). Tool bindings (Trello, Cloudflare, commands) are in [development.md → Bindings](docs/workflow/development.md#bindings).
- **Tasks, requirements, decisions and status:** the **Website** board on Trello — <https://trello.com/b/jaBEXApc/website>.
- **Hosting:** [Cloudflare Workers static assets](https://developers.cloudflare.com/workers/static-assets/) — <https://landing.nellisarchitecture.workers.dev>. The domain nellisarchitecture.com stays on WordPress until the DNS cutover.

## Structure

```
index.html, {studio,people,privacy,contact}/index.html             # pages (generated)
news/index.html                                                    # news index: all articles, newest first (generated)
news/<slug>/index.html                                             # 58 articles (generated)
news/category/<slug>/index.html                                    # 5 news category pages (generated)
projects/index.html                                                # projects hub: all projects + category links (generated)
projects/<category>/index.html                                     # 4 category pages (generated)
projects/<category>/<slug>/index.html                              # 32 project pages (generated from data/projects.json)
wp-content/                                                        # theme assets + images
data/                 # static "backend": projects, search index, filters, news JSON
js/static-backend.js  # intercepts the theme's old AJAX calls, serves data/ instead
js/project-switch.js  # project pages: switch the open project in place
content/news/*.md     # news source of truth (edited via the CMS)
content/pages/*.json  # page content source of truth (edited via the CMS)
content/pages/*.md    # text pages (privacy): front matter + markdown, first "# " line = title
content/redirects.json # CMS redirects (301), source of truth (edited via the CMS)
_redirects            # redirects (generated from build/redirects.txt + content/redirects.json + news slugs)
build/redirects.txt   # fixed redirects (200 and 301, hand-kept)
_headers              # security + cache headers (hand-kept)
build/news-template.html
build/lib/            # page generator: helpers, page modules, partials/*.html
build-news.js         # regenerates news pages, generated pages, sitemap + feed.xml
feed.xml              # RSS feed, served at /feed/ (generated)
robots.txt            # crawl rules (generated from content/robots.json, edited in the CMS)
admin/                # Decap CMS (news and page editing UI)
wrangler.jsonc        # Cloudflare Worker config (static assets)
.assetsignore         # files the Cloudflare Worker does not publish (they answer 404)
infra/cloudflare.js   # Cloudflare build settings as code (npm run infra)
eslint.config.mjs     # lint rules (npm run lint)
test/                 # unit tests (npm test)
```

## Deploy (Cloudflare Workers, Free plan)

1. Do the one-time [Cloudflare bootstrap](docs/workflow/development.md#setup-as-code). It links the repo, sets the build settings, the forms and the CMS login.
2. A push to `master` builds and deploys the site. See
   [Hosting — Cloudflare Workers](docs/workflow/development.md#hosting--cloudflare-workers).

## Updating news (SEO team)

1. Open `<site>/admin/` and click **Login with GitHub**. Before the cutover, `<site>` is <https://landing.nellisarchitecture.workers.dev>.
   Each editor needs a [GitHub](https://github.com/) account with write access to the repo `nellis-architecture/nellisarchitecture-landing` (decision D5).
   The operator adds each editor as a [collaborator](https://docs.github.com/en/account-and-profile/setting-up-and-managing-your-personal-account-on-github/managing-access-to-your-personal-repositories/inviting-collaborators-to-a-personal-repository) of the repo.
   On a shared computer, log out after you work: the login gives access to the full repo (`repo` scope).
2. News → New article. Fill title, date, meta description, hero image, body.
   Each upload must be smaller than 25 MB.
   Upload through the image field or the body. The top **Media** page has no size limit.
3. Publish → the site rebuilds automatically in ~1 minute:
   new article page, refreshed sidebar on all 58 articles, the /news/ list,
   sitemap.xml, the RSS feed (feed.xml), and the in-page switcher data.
4. To hide an article from Google, turn on **Hide from search (noindex)**. The sitemap drops it; the site and the news list keep it.

To edit page texts (Home, Studio, People, Privacy, the News index, shared affiliations and forms), open **Pages** in `/admin`.

### Manual alternative (no CMS)

```bash
# edit or add a file in content/news/, then:
node build-news.js
# commit + push (Cloudflare rebuilds), or test locally:
npm run serve
```

To use the CMS on your computer, see [Local CMS](docs/workflow/development.md#commands).

## Notes

- Form spam protection uses [Cloudflare Turnstile](https://developers.cloudflare.com/turnstile/); the old PHP captcha is gone.
- All absolute URLs (canonical, Open Graph, schema.org) intentionally keep the
  production domain — correct after DNS cutover.
- Google Analytics (G-5D57DNBBLX) is unchanged.
