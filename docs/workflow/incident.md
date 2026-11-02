# Incident response workflow

What to do when the site is down, broken, or shows an error. Bindings: [development.md → Bindings](development.md#bindings).

Driver: `/incident <alert>` ([.claude/commands/incident.md](../../.claude/commands/incident.md)). Agent: [incident-responder](../../.claude/agents/incident-responder.md).

## Steps

1. **Assess.** Find what is broken, the blast radius and the severity. Use read-only commands only.
2. **Remediate.** Use the safest reversible action first. Follow a known runbook if one matches. Else: contain, diagnose, fix forward or roll back.
3. **Approve.** The operator approves each outward action before it happens: rollback, push, deploy, DNS or Cloudflare setting change.
4. **Verify.** Run the [deploy check](development.md#deploy-check-shipping).
5. **Post-mortem.** Write a blameless COE to `docs/incidents/<YYYY-MM-DD>-<slug>.md`: timeline, impact, root cause (five whys), what went well, what went badly, action items. File each action item as a Backlog card with the label `bug` or `debt`.

## Severity

| Sev | Meaning |
|---|---|
| 1 | Site down, or all pages broken. |
| 2 | A key function broken: contact forms, news, project overlays, CMS. |
| 3 | A single page, image or link broken. SEO regression. |

## Signals

- Site: `curl -sI https://nellisarchitecture.com/` (and `https://landing.nellisarchitecture.workers.dev/`, the same Worker).
- Deploys and build logs: Cloudflare dashboard → Workers → landing → Deployments (versions) and Builds (build logs).
- CMS: `/admin/` loads and the editor can log in with GitHub (`/api/auth`, `/api/callback` on the Worker).
- Forms: Worker logs: Cloudflare dashboard → Workers → landing → Logs, or `npx wrangler tail landing` ([wrangler tail](https://developers.cloudflare.com/workers/wrangler/commands/#tail)).
- Recent changes: `git log origin/master` (includes CMS commits).

## Known runbooks

- **Bad deploy** (site broken after a push or CMS publish): `npx wrangler rollback` ([wrangler rollback](https://developers.cloudflare.com/workers/wrangler/commands/#rollback)) goes back to the previous version. Or Cloudflare dashboard → Workers → landing → Deployments → the menu of the last good version → **Rollback** ([rollbacks](https://developers.cloudflare.com/workers/configuration/versions-and-deployments/rollbacks/)). Then fix forward on a card.
- **Build fails** (`build-news.js` error, often bad front matter from the CMS): read the build log (Cloudflare dashboard → Workers → landing → Builds). Find the bad file in `content/news/`. Fix the file in a commit. The last good deploy stays live meanwhile.
- **CMS login fails**: check that the callback URL of the GitHub OAuth App is `<site>/api/callback`. Check that the Worker has the secrets `GITHUB_CLIENT_ID` and `GITHUB_CLIENT_SECRET` (a 503 on `/api/auth` means they are missing): set them and run `npm run infra`. Check that the editor has write access to the repo. See [CMS login](development.md#hosting--cloudflare-workers).
- **Forms do not arrive**: read the Worker logs (see Signals). A 503 means a missing binding or secret (see [Forms](development.md#hosting--cloudflare-workers)). Check the spam folder of hello@ and people@.
