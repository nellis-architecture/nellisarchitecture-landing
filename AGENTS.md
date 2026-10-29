## Overall

Be brief. No prose.

## Purpose

We migrate the website [nellisarchitecture.com](https://nellisarchitecture.com) from WordPress to a static site. The site is hosted on [Cloudflare Workers static assets](https://developers.cloudflare.com/workers/static-assets/) (<https://landing.nellisarchitecture.workers.dev>). The domain stays on WordPress until the DNS switch. The news section is edited in Decap CMS. See [README.md](README.md).

## Principles

Durable working agreements. Hold to these agreements regardless of tools.

- **Single entry point:** [README.md](README.md) is the only front door. A person or any agent onboards from the README. Everything else hangs off the README.
- **One source per concern:** document each thing once. Everywhere else, link to the source. Pipeline → [docs/workflow/development.md](docs/workflow/development.md). Requirements, decisions, tasks and status → the Trello board. Never duplicate.
- **Abstract the design, concretise the execution:** specs are tool-neutral and vendor-neutral. A person or any agent can follow a spec. *Bindings* (the harness, the board, the exact commands) are named and concrete, in one place. Do not genericise the bindings.
- **Name bindings, do not wrap them:** when a choice is tool-specific (Claude Code, Trello, Cloudflare, npm), state the tool as the current binding. Do not build an abstraction layer for tools we do not use.
- **Abstraction, not at the cost of performance:** refuse indirection and adapters added for hypothetical futures (YAGNI). The shortest path wins.
- **Minimal by default:** this is a very simple site. Take the shortest path that meets the acceptance criteria of the card. Do not add a property, a field, an option, a flag, a setting, a helper or an abstraction that the card does not ask for. Do not build for a future card. Reuse or delete what exists before you add something new. When two designs both meet the criteria, ship the smaller one and write the reason on the card.
- **Portable hosting:** the site MUST stay portable between static hosts. Cloudflare Workers is the current host, not a fixed choice; Netlify, Cloudflare Pages or AWS Amplify can replace it. Use broadly available technologies and open standards: plain HTML, CSS and JS, HTTP caching, standard image formats and `<img>`/`<picture>` attributes. Do not add a feature that only one host offers (for example Cloudflare Images, KV or Durable Objects). Keep each host-specific binding we already use (`wrangler.jsonc`, `_redirects`, `_headers`, `.assetsignore`, the Worker routes for the forms and the CMS login, R2 for the form files, Turnstile for the spam check) in one place, with a known replacement on the other hosts (see [Hosting — Cloudflare Workers](docs/workflow/development.md#hosting--cloudflare-workers)). Choose the industry-standard option before a CDN or a vendor service.
- **Infrastructure as code:** keep all infrastructure in code in this repo, so that a person or an agent can make an environment again with few steps. Only bootstrap steps may stay manual: for example the move of the DNS nameservers, the link from GitHub to the host, an account or an API token. Write each bootstrap step in one place. After the bootstrap, code makes and changes everything: the host config, the build settings and variables, storage buckets, spam protection, DNS records and email routing. A dashboard change is not a final state.
- **Simple site, consistent site:** this is a simple static site. Consistency and performance come first. SEO drives the content; agents keep everything consistent. Do not add scope, options or follow-up ideas. Choose the simplest option that matches the existing patterns and continue. Ask the operator only when a choice changes content, a public URL or cost.

## Decisions

Decide every design and implementation question yourself. Record each decision on its Trello card (description or comment). Do not create separate decision files.
The operator (human stakeholder) does not sign off each design. After a bar-raiser PASS at **Architect BR**, move the card on to **In Progress** and continue to **Review** without a stop. Ask the operator only when a choice changes content, a public URL or cost, or when the work brings an effort or an outcome that the operator does not know about. Do not ask the operator to confirm a card, a plan or a design.

## Task execution

Always plan before implementing. Describe what will be done. Then do.
Be brief when describing. No need to explain unless asked.
Do not ask the operator what to do next. Choose the most minimal option that meets the acceptance criteria (see [Minimal by default](#principles)), write the choice on the card, and continue.
Before planning a big feature or phase, decompose it into cards on the Trello board (see [docs/workflow/grooming.md](docs/workflow/grooming.md)).

**How we work — workflows** (tool-neutral specs; each spec names its own tool bindings):

- **Development** — [docs/workflow/development.md](docs/workflow/development.md), driven by `/ticket <card-url>` (a task from To do to shipped).
- **Grooming** — [docs/workflow/grooming.md](docs/workflow/grooming.md), driven by `/groom <card-url>` (make an under-specified backlog ticket *ready* → To do).
- **Incident response** — [docs/workflow/incident.md](docs/workflow/incident.md), driven by `/incident <alert>` (outage/error → remediation → blameless post-mortem).

Task status lives on the Trello board.

When driving a card via `/ticket`, read the card's current list. Follow the state machine in [docs/workflow/development.md](docs/workflow/development.md). Invoke the hat for that state only. Move the card (with the required comment) when the state's exit gate is met. An implemented task must never be left in **To do** or **In Progress** after a green checkpoint commit.

## Requirements

- Requirements live on the Trello card: a user story and acceptance criteria. See [docs/workflow/grooming.md](docs/workflow/grooming.md).
- Every change must trace back to a card. No speculative "just in case" modules.
- Defer tech decisions until a card actually forces the decision.

## Content & SEO

The site replaces a live WordPress site. Search ranking must survive the migration.

- `content/news/*.md` is the source of truth for news. `content/pages/*.json` is the source of truth for the generated pages (`news.json`: the `/news/` index; `contact.json`: the `/contact/` page; `projects.json`: the `/projects/` hub; `projects-<category>.json`: the category pages; the project list comes from `data/projects.json`). The 5 news category pages (`/news/category/<slug>/`) get their name, intro and SEO text from the `NEWS_CATEGORIES` table in `build/lib/pages/news.js`, not from `content/pages/*.json`. Each post sets its `category` (a slug of that table) in the front matter; the select in `admin/config.yml` repeats the slugs and names. `content/redirects.json` is the source of truth for redirects. `content/robots.json` is the source of truth for `robots.txt` (the build adds the Sitemap line). `data/projects.json` is the source of truth for the project pages. `content/pages/site.json` `forms.file_days` is the source of truth for the retention of uploaded form files (default 90 days). The CMS and people edit only these files (and uploads).
- Never edit generated files by hand: `news/index.html`, `news/<slug>/index.html`, `news/category/<slug>/index.html`, `projects/index.html`, `projects/<category>/index.html`, `projects/<category>/<slug>/index.html`, `data/news.json`, `sitemap.xml`, `feed.xml`, `robots.txt`, `index.html`, `studio/index.html`, `people/index.html`, `privacy/index.html`, `contact/index.html`, `_redirects`, `admin/preview.js`, `wp-content/variants/` and `build/images.json`. Change `build-news.js`, `build/news-template.html` or `build/lib/`, then run the build.
- `data/filters/*.html` are hand-kept, not generated. Each project item in them carries a link to its project page.
- `npm run images` owns the `<img>`/`<picture>` markup of the upload images in `build/lib/partials/index-projects.html` and `data/filters/*.html`, and the `minImg` values in `data/search.json`. Do not edit this markup by hand. Add or change the plain `<img src="/wp-content/uploads/...">` (or `minImg`), then run `npm run images`.
- To change the project grid on Home and on the project pages, edit `build/lib/partials/index-projects.html`. To change the open project panel of a project page, edit `build/lib/partials/current-project.html`.
- Keep every public URL of the old site. If a URL must change, add a 301 redirect in `content/redirects.json` (or in `build/redirects.txt` for a wildcard or fixed rule).
- CMS redirects → `content/redirects.json`. Wildcard or fixed rules → `build/redirects.txt` (never status 404). Deny rules (404) → `.assetsignore` (an ignored path answers 404).
- Keep titles, meta descriptions, canonical URLs, Open Graph tags and schema.org data correct. Absolute URLs use the production domain `https://nellisarchitecture.com`.
- Never delete or rename files in `wp-content/uploads/`. Pages and external sites link to them.
- A hero video needs a `<name>-poster.jpg` next to the `<name>.mp4`. Make it from frame 0 with [FFmpeg](https://ffmpeg.org/): `ffmpeg -i <name>.mp4 -frames:v 1 -q:v 2 <name>-poster.jpg`. Then run `npm run images`. Without the poster, the build shows the video without a poster.
- Run `npm run images` after a new upload, then commit the variants (`wp-content/variants/` and `build/images.json`).
- The Worker publishes the repo root. A new internal root file or folder needs a line in `.assetsignore`. A new public root file or folder needs an entry in the `SITE` allow-list in `test/assets-deny.test.js`. Root `*.html` pages need neither.
- Decap CMS commits to the `backend.branch` of `admin/config.yml` on the remote (`master`). Pull before you work. Rebase local commits before a push.

## Change the site

Change the source file, then run the commands. Never edit a generated file by hand (see [Content & SEO](#content--seo)). The commands are in [development.md → Commands](docs/workflow/development.md#commands).

### Behaviour

| Change | Edit | Then run |
|---|---|---|
| The filter and news shim (the WordPress AJAX calls) | `js/static-backend.js` | `npm run lint && npm test && npm run test:browser` |
| The project switch on a project page | `js/project-switch.js` | `npm run lint && npm test && npm run test:browser` |
| The contact and the brief form in the browser | `js/forms.js` | `npm run lint && npm test && npm run test:browser` |
| The form endpoints, the uploads, the CMS login | `worker/*.js` | `npm run lint && npm test`, then `npx wrangler dev` to test the endpoints locally ([development.md → Hosting](docs/workflow/development.md#hosting--cloudflare-workers)) |
| The CMS preview pane, the CMS fixes for Decap bugs | `build/lib/preview.js` | `npm run build && npm run lint && npm test` |
| A theme script (burger, modal, swiper, fancybox) | `wp-content/themes/nellis/assets/JS/` | `npm run test:browser` (theme code is not linted) |

### Look

| Change | Edit | Then run |
|---|---|---|
| A style | `wp-content/themes/nellis/assets/scss/main.css` (plain CSS; there is no SCSS build, the folder name is historical) | `npm run test:browser` |
| The markup of a generated page | `build/lib/partials/*.html`, `build/lib/pages/*.js`, `build/news-template.html` | `npm run build`, check the generated diff, then `npm run test:browser` |
| The markup of a filter list | `data/filters/*.html` (hand-kept) | `npm run test:browser` |
| An image | the plain `<img>` or the `minImg` value | `npm run images`, then `npm run build` |

### Check the change in a browser

`npm run test:browser` runs the visitor flows. `npm run test:browser-visible` shows the browser. The bindings are in [development.md → Commands](docs/workflow/development.md#commands). See [Testing](#testing).

Each test file owns a flow:

- `browser/home.js` — the Home grid, the sidebar filters, the remembered filter, the old `/#proj=<Name>` and `/#<category>` URLs.
- `browser/projects.js` — a project page: the thumbnail column, the open project, the sidebar filter.
- `browser/pages.js` — the `/projects/` hub, the category pages, the menu links, and the sweep of every page for JS errors and horizontal overflow.
- `browser/news.js` — the `/news/` index, a post, the switcher, the sidebar.
- `browser/forms.js` — the contact form and the brief: the submit, the honeypot, the 5 MB guard, the file slots.

A change to a flow changes its test in the same commit. A new flow gets a new test.

## Code style

The code style is important for this project. We decide what style to use, then we stick to the style. Create eslint rules to enforce the style.
Let's use a solid base (for example Airbnb) and adjust the base to our needs.

Scope: our own code (`build-news.js`, `build/lib/`, `js/static-backend.js`, future scripts). Do not lint or reformat the original WordPress theme files in `wp-content/` or the page HTML.

### Individual rules

// List the individual new code style rules below - this is good for better visibility than eslint

- Plain JavaScript. No TypeScript. No framework.
- Build scripts run on Node with zero runtime dependencies. Add a dependency only when a card needs it. Dev tools go in `devDependencies`.
- Browser code runs without a bundler. Keep the existing theme scripts working.
- Base: Airbnb via `eslint-config-airbnb-extended` (`eslint.config.mjs`). Linted files: `build-news.js`, `build/make-images.js`, `build/lib/**/*.js`, `infra/**/*.js`, `js/static-backend.js`, `js/project-switch.js`, `js/forms.js`, `worker/**`, `test/`, `browser/**`, `eslint.config.mjs`. Add new own files to the config.
- Build scripts: synchronous `fs` calls and `console` output are allowed (`n/no-sync`, `no-console` off).
- Browser scripts: `'use strict'` inside the IIFE (`strict: function`). Underscore fields are allowed for shim internals (`no-underscore-dangle` off).
- Build scripts export their pure functions and run only when called directly (`require.main === module`), so tests can import them.
- Worker (`worker/`): ES modules, no npm dependencies. Export the pure functions, so tests can import them (`await import()`).
- Page generator: static markup (with the WordPress tabs and spaces) stays in `build/lib/partials/*.html` with `{{TOKEN}}`s. JS fills the tokens with `fill()`. Escape CMS text with `escText` (text) or `escAttr` (attributes).
- Content images (upload images on Home, the project, category, studio, people and news pages, and in the news markdown): `picture()` of `build/lib/images.js`, with a slot of its `SLOTS` table. The build sets the one priority image of each page; never write `loading="eager"` in a partial. Chrome images (logo, partner logos) keep the theme `lazyload` markup. The `picture` CSS is in `build/lib/partials/images-css.html` (`#nellis-images-css`); `head.html` and `build/news-template.html` get it through the `{{IMAGES_CSS}}` token.
- Cloudflare build settings change only in `infra/cloudflare.js` or `wrangler.jsonc`. Never change them in the dashboard.

### Generic rules

- No code spaghetti. Create files and include the files to make the code modular.
- No trivial comments. We all know what things do in the code.
- No need to reinvent the wheel. Use libraries that do common things.
- Do not over-engineer.
- When we agree on a new convention or pattern, add the convention here as a rule (keep this list current).
- After each task, create a checkpoint (git commit). Run the project's checks (see [Bindings](docs/workflow/development.md#bindings)). Move the card to the next pipeline state (usually **Dev BR** after Test). Then stop for the bar-raiser or human review. Do not leave an implemented change in **To do** or **In Progress**.
- Work on the current branch or on any local branch, and keep the history linear: no merge commits. Push only to `origin/master`, never another branch. Rebase a stray branch onto `master` only when the person asks (see [Repository](docs/workflow/development.md#repository)).
- Commit locally as checkpoints. Push to `origin/master` only after an operator signs off the card at Review: rebase onto `origin/master`, run the checks, push (see [Repository](docs/workflow/development.md#repository)). A push to `master` deploys to Cloudflare (workers.dev) through Workers Builds (see [Cloudflare limits](docs/workflow/development.md#cloudflare-limits)).

## Writing style

The controlled writing standard ASD-STE100 Simplified Technical English is the preferred language of this project.

Key rules:
- Use approved words only. Use the word list specified by the standard. Each word has one meaning. Do not use words on the blacklist of the standard.
- Use one word for one idea. Do not use two words for the same thing.
- Write short sentences. Use 20 words or less for instructions.
- Use active voice. Write "Turn the switch", not "The switch must be turned".
- Write short paragraphs. Keep one topic in each paragraph.

The goal is easy reading. Many readers are not native English speakers. Clear text helps them do the work in a safe and correct way.

## Testing

- Cover our own code with unit tests.
- Every bug fix must include a unit test that reproduces the failing case. The test must fail without the fix and pass with the fix. Cover the failing and edge cases, not just the happy path.
- After a change to the build or the templates, run the build and check the generated diff. Only the expected files may change.
- Browser tests (`browser/`): `npm run test:browser`. Local only, not CI. See [development.md → Commands](docs/workflow/development.md#commands).

## Documentation

- Always add links to all doc references. When a doc mentions an external resource (library, tool, spec, standard) or another internal doc, link the resource. Verify the link and any claim the link backs (for example a license) before stating the claim.
