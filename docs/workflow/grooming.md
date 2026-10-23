# Grooming workflow

How an under-specified **Backlog** card becomes *ready* and moves to **To do**. Board bindings: [development.md → Bindings](development.md#bindings).

Driver: `/groom <card-url>` ([.claude/commands/groom.md](../../.claude/commands/groom.md)). Agent: [project-manager](../../.claude/agents/project-manager.md).

## Roles

- **Product owner** — owns product, content and SEO cards. The operator plays this role.
- **Tech lead** — owns `debt` and `infra` cards. The operator plays this role.
- **Project manager (agent)** — prepares the card, decides each design and implementation question, and records the decision on the card. Escalates only a choice that changes content, a public URL or cost.

## Ready

A card is ready when it has all of these:

- A one-line **user story**: `As a <visitor | editor | operator>, I want <…>, so that <…>.`
- **Acceptance criteria**: a short checklist. Each item is testable.
- **Labels** from the taxonomy below.
- No open decisions. Each decision is answered and recorded on the card.

## Steps

1. Read the card.
2. If the card is ready, say so. Stop.
3. Write the user story and the acceptance criteria. Use the [README](../../README.md), the code, and the live sites. Keep it minimal.
4. Propose labels.
5. Decide each open question yourself. Write the decision and the reason on the card. Escalate a question only when its answer changes content, a public URL or cost, and wait for that one answer.
6. Write the result to the card description. Add a summary comment.
7. Move the card to **To do** with a comment.
8. Start the pipeline: [development.md](development.md).

## Labels

| Label | Colour | Use | id |
|---|---|---|---|
| `feature` | green | New or changed visitor or editor capability. | `6acf67111cc66adaf0db8d92` |
| `bug` | red | Something does not work as before or as specified. | `6acf67111cc66adaf0db8d95` |
| `content` | blue | Text, images, news, pages. | `6acf67111cc66adaf0db8d94` |
| `seo` | purple | URLs, redirects, meta tags, sitemap, structured data. | `6acf67111cc66adaf0db8d91` |
| `infra` | yellow | Cloudflare, DNS, CMS setup, build, tooling. | `6acf67111cc66adaf0db8d93` |
| `debt` | orange | Clean-up with no visible change. | `6acf67111cc66adaf0db8d97` |

Add a label: `curl -s -X POST "$T/cards/<shortLink>/idLabels?value=<label-id>&$A"`.
