# Development workflow

How a task goes from **To do** to shipped. Any person or agent can follow this spec. The concrete tools are in [Bindings](#bindings).

Driver: `/ticket <card-url>` ([.claude/commands/ticket.md](../../.claude/commands/ticket.md)).

## Roles

| Role | Does | Agent |
|---|---|---|
| Operator | Prioritises, answers open decisions, reviews, pushes, closes cards. | the person |
| Orchestrator | Reads the card state, starts the hat for that state, moves the card. | main session |
| Architect | Checks for duplicates, writes the design and the plan. No code. | [architect](../../.claude/agents/architect.md) |
| Bar-raiser | Reviews the design (Architect BR) and the code (Dev BR). PASS or BLOCK. | [bar-raiser](../../.claude/agents/bar-raiser.md) |
| Developer | Implements the signed-off plan with tests. Commits locally. | [dev](../../.claude/agents/dev.md) |
| QA | Checks the change against the acceptance criteria and the content and SEO rules. | [qa](../../.claude/agents/qa.md) |

## States

The board list of a card is its state.

```
Backlog → To do → Architect BR → In Progress → Test → Dev BR → Review → Shipping → Done
                                 Blocked / Closed (from any state)
```

| State | Hat | Work | Exit gate | Next |
|---|---|---|---|---|
| Backlog | — | Groom ([grooming.md](grooming.md)). | Operator prioritises. | To do |
| To do | architect | Duplicate check. Design (only if a decision is needed) and plan, written to the card. | Plan on the card. | Architect BR |
| Architect BR | bar-raiser | Design review. Skip it for a `bug` or `debt` card with no open decision. | PASS (or skipped). Operator sign-off only for a serious open decision or an unknown effort or outcome (AGENTS.md → Decisions). BLOCK → To do. | In Progress |
| In Progress | dev | Implement. Run checks. Local commit. | Green checkpoint commit. | Test |
| Test | orchestrator | Run checks. | Checks pass. Fail → In Progress. | Dev BR |
| Dev BR | bar-raiser | Code and test review. | PASS. BLOCK → In Progress. | Review |
| Review | qa | Acceptance criteria, content and SEO checks. [Review scenario](#review-scenario): write it, run it, attach the evidence. | PASS **and operator review**. BLOCK → In Progress. | Shipping |
| Shipping | orchestrator | Operator pushes. Verify the deploy. Run the pending scenario tests. | Deploy verified. | Done (operator) |
| Done | — | Terminal. Follow-ups go to Backlog. | — | — |
| Blocked | — | Report the blocker. Ask the operator. | — | previous state |
| Closed | — | Not done, not needed. Terminal. | — | — |

Human gates: Review sign-off, push, Done, Closed, and an Architect BR sign-off only when AGENTS.md → Decisions asks for one. Agents never pass these gates.

## Board conventions

- Every card move has a comment: `<from> → <to>: <reason>`. Add the evidence: plan summary, verdict, commit hash, or check output tail.
- Trello does not render Markdown tables. Write a list, or a preformatted ASCII table in a code block.
- A design or a decision goes on the card (description or comment). No separate decision files.
- A BLOCK comment lists each finding on one line: `location · what to change · why`.
- One card, one change. Split big cards in grooming.
- Tick the boxes. QA ticks each met acceptance criterion in the card description at Review. When a card moves to Done, tick its item in the epic checklist.

## Review scenario

At Review, write a review scenario on the card. The operator uses it to review the change.

1. Write the scenario as a list (Trello does not render Markdown tables, see [Board conventions](#board-conventions)). Each item is one test: what to do, where to check, and the expected result.
   - Where: local preview, <https://landing.nellisarchitecture.workers.dev> (after the push), the CMS, or the live site for comparison.
   - Cover each acceptance criterion. Include the failing and edge cases, not only the happy path.
2. Run each test that you can run before the push. Write the result for each test on the card.
3. Attach evidence:
   - A visual change: a screenshot. Show the new page next to the live page.
   - A change you cannot see: the command output, for example head tags, status codes or sitemap lines.
   - CMS behaviour: test on a temporary copy of the repo. Never change the real content.
4. Mark each test that needs the deploy or a CMS login as **pending**. Run the deploy tests in Shipping. The operator runs the CMS login tests.

Review also runs `npm run test:browser` and attaches the output to the card.

## Bindings

### Task board — Trello

- Board: **Website** — <https://trello.com/b/jaBEXApc/website> (board id `6acf67111cc66adaf0db8c8a`).
- API: [Trello REST API](https://developer.atlassian.com/cloud/trello/rest/) with `curl`. Credentials come from the environment: `TRELLO_KEY`, `TRELLO_TOKEN` (see [Trello setup on macOS](#trello-setup-on-macos)). Never print or commit them.
- MCP: [`.mcp.json`](../../.mcp.json) runs [@thadeu/trello-mcp](https://github.com/thadeu/trello-mcp) with the same credentials (`TRELLO_KEY` → `TRELLO_API_KEY`). The server can only use this board (`TRELLO_ALLOWED_BOARD_IDS`).
- A card URL `https://trello.com/c/<shortLink>/...` gives the card id `<shortLink>`.

| List | id |
|---|---|
| Backlog | `6acf67111cc66adaf0db8c81` |
| To do | `6acf67111cc66adaf0db8c7f` |
| Architect BR | `6acf67111cc66adaf0db8c89` |
| Blocked | `6acf67111cc66adaf0db8c80` |
| In Progress | `6acf67111cc66adaf0db8c82` |
| Test | `6acf67111cc66adaf0db8c83` |
| Dev BR | `6acf67111cc66adaf0db8c84` |
| Review | `6acf67111cc66adaf0db8c85` |
| Shipping | `6acf67111cc66adaf0db8c86` |
| Done | `6acf67111cc66adaf0db8c87` |
| Closed | `6acf67111cc66adaf0db8c88` |

Labels: see [grooming.md](grooming.md#labels).

```sh
A="key=$TRELLO_KEY&token=$TRELLO_TOKEN"; T=https://api.trello.com/1
# read a card (state = idList)
curl -s "$T/cards/<shortLink>?fields=name,desc,idList,labels,url&actions=commentCard&$A"
# comment
curl -s -X POST "$T/cards/<shortLink>/actions/comments?$A" --data-urlencode "text=To do → Architect BR: …"
# move
curl -s -X PUT "$T/cards/<shortLink>?idList=<list-id>&$A"
# list cards in a list
curl -s "$T/lists/<list-id>/cards?fields=name,shortUrl,labels&$A"
```

The shell is zsh: an unquoted `$var` does not split into words. Pass each argument separately.

#### Trello setup on macOS

One time, for each person or machine. The API and the MCP server use only the API key and the token. They do not use the API secret.

1. Open the [Power-Up admin](https://trello.com/power-ups/admin). Make a Power-Up in the workspace of the board. Open its **API key** tab and click **Generate a new API key**. Copy the API key.
2. Get a token. Open this URL with your API key, and click **Allow**:
   `https://trello.com/1/authorize?expiration=never&scope=read,write&response_type=token&name=nellis&key=<api-key>`
   ([Trello authorization](https://developer.atlassian.com/cloud/trello/guides/rest-api/authorization/)).
3. Add the two values to `~/.zshenv`. zsh reads this file for each shell, also for the shells that an agent starts.

   ```sh
   export TRELLO_KEY=<api-key>
   export TRELLO_TOKEN=<token>
   ```

4. An app that you start from the Dock or Finder (for example the Claude desktop app or an IDE) does not read `~/.zshenv`. Give the values to these apps in a new terminal, then restart the app. Do this step again after each login:

   ```sh
   launchctl setenv TRELLO_KEY "$TRELLO_KEY"
   launchctl setenv TRELLO_TOKEN "$TRELLO_TOKEN"
   ```

5. Check the credentials. The command prints your Trello user name:
   `curl -s "https://api.trello.com/1/members/me?fields=username&key=$TRELLO_KEY&token=$TRELLO_TOKEN"`
6. Start [Claude Code](https://code.claude.com/docs/en/mcp#project-scope) in the repo and approve the project server `trello` from `.mcp.json`. Then `claude mcp get trello` shows the server as connected.

### Repository

- GitHub: <https://github.com/nellis-architecture/nellisarchitecture-landing> (private). CLI: `gh`.
- **One branch: `master`.** Do all work on `master`. Do not create a branch for a card. The local checks and the operator's push decision protect the work. A branch does not. An unmerged branch deploys nothing: Workers Builds deploys only a push to `master`. A card that reports unmerged work as shipped is wrong.
- Report a stray branch that you find. If the person asks you to merge it, merge it into `master`. Then run the checks and report the merge. The operator deletes the remote branch after the push. Deleting a remote branch is a push, and an agent never pushes.
- Do not resolve a merge or a rebase conflict. Stop and report it.
- Decap CMS commits to the `backend.branch` of [admin/config.yml](../../admin/config.yml) on the remote (`master`). Before work: `git pull --rebase`.

### Commands

- Runtime: [Node.js](https://nodejs.org/) 20+ (pinned in `.nvmrc`). Package manager: npm.
- Install: `npm ci`.
- Build: `npm run build` (runs `node build-news.js`). It regenerates `news/index.html` (from `content/pages/news.json`), `news/*/index.html`, `projects/index.html` (from `content/pages/projects.json`), `projects/<category>/index.html` (from `content/pages/projects-<category>.json`), `projects/<category>/<slug>/index.html` (from `data/projects.json`), `data/news.json`, `sitemap.xml`, `feed.xml`, `robots.txt` (from `content/robots.json`), `index.html`, `studio/index.html`, `people/index.html`, `privacy/index.html`, `contact/index.html` (from `content/pages/contact.json`) and `_redirects`. It deletes `news/<dir>/` folders that no post owns, and `projects/` folders that no project owns (category folders stay).
- Images: `npm run images` ([sharp](https://www.npmjs.com/package/sharp), [build/make-images.js](../../build/make-images.js)). For each upload image that the pages and the content use, it writes AVIF variants (320, 640, 960, 1600, 2400 px wide) and JPEG variants (640, 1600, 2400 px; PNG for an image with transparency) to `wp-content/variants/`. It never makes a variant wider than the original. It writes `build/images.json` (size, widths, hash and a 16 px placeholder of each image). Run it after a new upload, then commit the variants and the manifest. The first run takes approximately 25 minutes. Then it makes only the new or changed images, and deletes the variants that no image uses. Last, it writes the `<picture>` markup of the upload images in `build/lib/partials/index-projects.html` and `data/filters/*.html`, and sets each `minImg` in `data/search.json` to the 640 px variant. A second run changes nothing. Run the build after it.
- Local preview: `npm run serve` ([serve](https://www.npmjs.com/package/serve)), then open <http://localhost:8000>.
- Live check (until the cutover): `npm run check:live` ([build/live-check.js](../../build/live-check.js)). It reads the sitemaps of the live WordPress site and requests each page and image URL on <https://landing.nellisarchitecture.workers.dev>. It lists each URL that does not answer 200, and the news posts whose title, meta description or og:title differ from live (a difference only in the trailing site name is counted, not listed). Exit code 1 when a URL is missing. Against the local preview: `npm run check:live -- --base http://localhost:8000` (with `npm run serve` running). The local preview does not apply `_redirects`, so there the old tag, category and author URLs answer 404; on workers.dev they redirect. Run it before the cutover, after the content freeze.
- Local CMS: also run `npm run cms` ([decap-server](https://www.npmjs.com/package/decap-server), port 8081), then open <http://localhost:8000/admin/> and click Login (no password). The CMS writes straight to the files in your working copy. There is no editorial workflow and no commit. Run the build and commit yourself. Decap uses the local backend only on `localhost` (`local_backend: true` in `admin/config.yml`).
- Lint: `npm run lint` ([ESLint](https://eslint.org/) with [eslint-config-airbnb-extended](https://www.npmjs.com/package/eslint-config-airbnb-extended), config in `eslint.config.mjs`). Fix style: `npm run format`.
- Unit tests: `npm test` ([node:test](https://nodejs.org/api/test.html), files in `test/`).
- Browser tests: `npm run test:browser` ([playwright-core](https://playwright.dev/), files in `browser/`). Local only, not CI. It starts `serve` on port 8000, launches the browser, runs `browser/` with `node --test`, then stops both. A failure saves a screenshot to `~/nellis-browser-tests/<run-id>/`.
  - The browser: `BROWSER=<value> npm run test:browser`. `<value>` is `brave`, `chrome`, `safari` (or `webkit`), or the absolute path of a Chromium browser binary. Unset (the default): the installed [Brave](https://brave.com/) or Google Chrome, driven as Chromium. `safari` drives the WebKit build that Playwright downloads, not Safari.app. Install that build once: `npx playwright-core install webkit`.
  - Headful: `HEADED=1 npm run test:browser`, or its alias `npm run test:browser-visible`, launches the browser visibly. The default is headless.
- **Checks** (Test state and before a push): `npm run lint && npm test && npm run build`, then `git status`. Only the expected files may change.
- Screenshots (review scenario): a headless Chromium browser, for example [Brave](https://brave.com/) or Chrome: `"<browser>" --headless=new --hide-scrollbars --window-size=1440,900 --virtual-time-budget=8000 --screenshot=<file>.png <url>`. Make the file small before you attach it: `sips -s format jpeg -s formatOptions 40 -Z 1000 <file>.png --out <file>.jpg` (macOS).
- Attach a file to a card: `POST /1/cards/<shortLink>/attachments` with `-F file=@<path>` ([Trello REST API](https://developer.atlassian.com/cloud/trello/rest/api-group-cards/#api-cards-id-attachments-post)).

### Hosting — Cloudflare Workers

Cloudflare Workers is the current binding, not a fixed choice. See [AGENTS.md → Portable hosting](../../AGENTS.md#principles). The host-specific parts and their replacements on other hosts (for example Netlify or AWS Amplify):

| Cloudflare binding | Where | Replace with |
|---|---|---|
| Build, headers, redirects, deny rules | [wrangler.jsonc](../../wrangler.jsonc), [_headers](../../_headers), generated `_redirects` (from [build/redirects.txt](../../build/redirects.txt) and `content/redirects.json`), [.assetsignore](../../.assetsignore) (deny: an ignored path answers 404) | The new host's config. Netlify and Cloudflare Pages read `_redirects` and `_headers`. |
| Build settings | [infra/cloudflare.js](../../infra/cloudflare.js) ([Workers Builds](https://developers.cloudflare.com/workers/ci-cd/builds/)) | The new host's build config |
| Forms | Worker `POST /api/message` ([worker/](../../worker/)) + [Cloudflare Email Service](https://developers.cloudflare.com/email-service/) | Any serverless function + an email API |
| Form files | [R2](https://developers.cloudflare.com/r2/) bucket ([worker/uploads.js](../../worker/uploads.js)) | Any S3-compatible bucket |
| Form spam check | [Cloudflare Turnstile](https://developers.cloudflare.com/turnstile/) ([js/forms.js](../../js/forms.js), [worker/turnstile.js](../../worker/turnstile.js)) | Any captcha + a server check |
| CMS login | Worker `GET /api/auth`, `GET /api/callback` ([worker/oauth.js](../../worker/oauth.js)) | Any serverless function that does the GitHub OAuth flow |

The production domain <https://nellisarchitecture.com> stays on WordPress until the DNS cutover (card 9).

- Worker: **landing** — <https://landing.nellisarchitecture.workers.dev>. It serves the repo root as [static assets](https://developers.cloudflare.com/workers/static-assets/).
- Config: [wrangler.jsonc](../../wrangler.jsonc). [.assetsignore](../../.assetsignore) lists the root entries that the Worker does not publish.
- Deploy: [Workers Builds](https://developers.cloudflare.com/workers/ci-cd/builds/) deploys a push to the branch `master`.
- Image fallback: on Workers Builds (`WORKERS_CI=1`), `npm run build` makes the variants of the uploads that `build/images.json` does not have (for example a CMS upload). It installs sharp into a temporary folder, and makes no more than 40 images or works no more than 8 minutes. It does not change `build/images.json`. On an error, it writes one log line and continues. Local builds never do this: run `npm run images`.
- Manual deploy: `npm run deploy` ([Wrangler](https://developers.cloudflare.com/workers/wrangler/), version pinned in `package.json`).
- File retention: `npm run deploy` first runs [infra/lifecycle.js](../../infra/lifecycle.js). It sets the [R2 lifecycle rules](https://developers.cloudflare.com/r2/buckets/object-lifecycles/) of the bucket in `wrangler.jsonc`: form files are deleted after `forms.file_days` days (`content/pages/site.json`, CMS: Shared → Forms; no value: 90), `pending/` objects after 1 day, incomplete multipart uploads after 7 days. A bad value (not a whole number from 1 to 365) stops the deploy. The Workers Builds API token needs Workers R2 Storage: Edit.
- Rollback: `npx wrangler rollback`. Operator only.
- Build settings: [infra/cloudflare.js](../../infra/cloudflare.js). See [Setup as code](#setup-as-code).
- Forms: the Worker ([worker/index.js](../../worker/index.js)) answers `POST /api/message`. `assets.run_worker_first: ["/api/*"]` sends `/api/*` to the Worker first. All other requests go to the static assets. Other `/api/*` paths get the 404 page.
- Email: the Worker sends each form with the `EMAIL` binding ([Cloudflare Email Service](https://developers.cloudflare.com/email-service/)). The sender is the `MAIL_FROM` variable in `wrangler.jsonc` (`noreply@`). The contact form goes to hello@, the brief (job) form to people@ ([worker/email.js](../../worker/email.js)). Card 8 adds the `send_email` binding, when the zone is on Cloudflare. Until then, the endpoint answers 503 `email not configured`.
- Spam check: each form gets a [Turnstile](https://developers.cloudflare.com/turnstile/) token. The Worker checks the token with the `TURNSTILE_SECRET` secret before it sends. No secret: the endpoint answers 503. `npm run infra` manages the widget and the secret.
- Brief form files: the form sends the message first. With files, the Worker keeps the message in `pending/<id>.json` and answers with one signed upload link per file (no more than 5 files, 5 MB each, the types in the file input). The page uploads each file to `PUT /api/upload/<key>`, then calls `POST /api/message/<id>/send`. The Worker then sends the email with one download link per file (`GET /api/file/<key>`). The files go to the [R2](https://developers.cloudflare.com/r2/) bucket `landing-forms` through the `FILES` binding in `wrangler.jsonc` ([worker/uploads.js](../../worker/uploads.js)). The upload and send links stop after 30 minutes. The download links stay until R2 deletes the file (see File retention).
- Link signatures: the Worker signs each link with HMAC-SHA-256 and the Worker secret `LINK_SECRET`. `npm run infra` sets it only when it is missing. **Never rotate `LINK_SECRET`**: a new value breaks the download links in all sent emails. No `FILES` binding or no secret: a brief with files answers 503.
- CMS login: [Decap CMS](https://decapcms.org/docs/github-backend/) uses the GitHub backend with `base_url` = the Worker and `auth_endpoint: api/auth` ([admin/config.yml](../../admin/config.yml)). `GET /api/auth?provider=github` sends the editor to the [GitHub OAuth App](https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/authorizing-oauth-apps) (scope `repo`). The Worker keeps a random state in the cookie `__Host-cms_oauth_state` (10 minutes). `GET /api/callback` checks the state, gets the token from GitHub and gives it to the CMS window on the same origin ([worker/oauth.js](../../worker/oauth.js)). The Worker secrets are `GITHUB_CLIENT_ID` and `GITHUB_CLIENT_SECRET`. No secrets: both routes answer 503. The CMS branch is `master`.
- Local test: put `TURNSTILE_SECRET=1x0000000000000000000000000000000AA` (a [Turnstile test secret](https://developers.cloudflare.com/turnstile/troubleshooting/testing/)) and `LINK_SECRET=<any text>` in `.dev.vars` (git ignores it). Run `npx wrangler dev`, then open <http://localhost:8787/>. On `localhost`, `js/forms.js` uses the test sitekey. The build writes `TURNSTILE_SITEKEY` into the `data-sitekey` attribute of the `js/forms.js` script tag. Without the variable (local builds), it writes the test sitekey.

#### Setup as code

`npm run infra` sets the [Workers Builds](https://developers.cloudflare.com/workers/ci-cd/builds/) settings of the Worker through the [Builds API](https://developers.cloudflare.com/workers/ci-cd/builds/api-reference/). It sets the production trigger (branch, build command, deploy command, root directory, build cache) and the build variables. It deletes all other triggers and build variables. It creates or updates the [Turnstile widget](https://developers.cloudflare.com/api/resources/turnstile/subresources/widgets/) `landing` (domains and mode), sets the Worker secret `TURNSTILE_SECRET` from the widget secret, and sets the build variable `TURNSTILE_SITEKEY` to the widget sitekey. You can run it again: it changes only what is different. It sets the secret on each run. It creates the R2 bucket of `wrangler.jsonc` when it is missing. It sets the Worker secret `LINK_SECRET` (32 random bytes) only when it is missing; it never changes it. It sets the Worker secrets `GITHUB_CLIENT_ID` and `GITHUB_CLIENT_SECRET` from your shell on each run. Without the two values, it keeps the secrets of the Worker; when the Worker does not have them, it shows a warning and continues (the CMS login answers 503). With only one of the two values, it stops.

Bootstrap (one time, operator):

1. Get a Cloudflare account. Write down the account ID.
2. Dashboard → Workers → Import a repository. Use the name `landing`. This step installs the Cloudflare GitHub App. The API can also do this step; the dashboard is the chosen bootstrap.
3. Create a **user** API token: My Profile → [API Tokens](https://dash.cloudflare.com/profile/api-tokens). Permissions: Workers Builds Configuration: Edit, Workers Scripts: Edit, Turnstile Sites: Write and Workers R2 Storage: Edit. Do not use an account token: the Builds API returns "Invalid token" for it. Put `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` in your shell profile.
4. Dashboard → R2 → enable R2 on the account (one time; the API cannot do it).
5. Create a [GitHub OAuth App](https://github.com/settings/applications/new). Homepage URL: <https://landing.nellisarchitecture.workers.dev>. Authorization callback URL: <https://landing.nellisarchitecture.workers.dev/api/callback>. Generate a client secret. Put `GITHUB_CLIENT_ID` and `GITHUB_CLIENT_SECRET` in your shell profile.
6. Run `npm run infra`. Operator only.

Rules:

- Run `npm run infra` only after the deployed branch has the `deploy` script in `package.json`.
- Do not change the build settings in the dashboard. Change `infra/cloudflare.js` or `wrangler.jsonc`, then run `npm run infra`.

### Cloudflare limits

The Worker uses the Free plan. See [Workers limits](https://developers.cloudflare.com/workers/platform/limits/) and [Workers Builds limits](https://developers.cloudflare.com/workers/ci-cd/builds/limits-and-pricing/).

Rules:

- Push to `master` in batches. One push is one build. Do not push for docs or test changes alone.
- CMS editors: one publish is one build. Publish changes together.

### Deploy check (Shipping)

- The [Workers Builds](https://developers.cloudflare.com/workers/ci-cd/builds/) build of the pushed `master` commit is green (Dashboard → Workers → landing → Deployments).
- Changed pages, `/`, `/news/<newest-slug>/` and `/sitemap.xml` return 200 on <https://landing.nellisarchitecture.workers.dev> (production after the cutover). Example: `curl -sI https://landing.nellisarchitecture.workers.dev/`.
- `/admin/` loads.
- The pending tests of the [review scenario](#review-scenario) pass. Write the results on the card.
