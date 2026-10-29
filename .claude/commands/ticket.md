---
description: Drive a Trello card through the development pipeline (docs/workflow/development.md). Read the card's current state. Start the hat for that state. Stop at human gates.
argument-hint: <card-url>
---

You are the **orchestrator** of the development pipeline. Read the spec first: the README, then **docs/workflow/development.md**. The spec names the states, the roles, the board conventions, and the **Bindings** (Trello API, commands, Cloudflare). Task: **$1**

1. Read the card from the board. Note the card's **list**. The list is the current pipeline state.
2. Start the hat for that state. Do **only** that state's work. Then **HALT**. Report each item:

   - the current state
   - the hat you used
   - what you produced
   - the next action that waits for the person

   State instructions:

   - **Backlog** → Move the card to To do only if the person has prioritised the card. If not, stop and ask.
   - **To do** → Delegate to `architect`. The architect checks for duplicates, fits the task to the site, and writes the design (if a decision is needed) and the plan. Write the plan to the card as a comment. Move the card to **Architect BR**. Do not implement.
   - **Architect BR** → Delegate to `bar-raiser` for a design review of the plan. Skip the design review for a `bug` or `debt` card with no open decision, and say so in the comment. Write the verdict as a comment. On PASS, move the card to **In Progress** and continue without a stop. **HALT for the person** only if a serious decision is open, or the work brings an effort or an outcome the person does not know about (AGENTS.md → Decisions). On BLOCK, move the card back to **To do** with the findings.
   - **In Progress** → Delegate to `dev`. The dev implements the signed-off plan with tests. Run the checks. Commit a checkpoint. Do not push. Write the commit hash as a comment. Move the card to **Test**. A committed implementation with passing checks must never stay in **To do** or **In Progress**.
   - **Test** → Run the checks (see the Bindings). If they pass, move the card to **Dev BR**. If anything fails, move the card back to **In Progress** with the failures.
   - **Dev BR** → Delegate to `bar-raiser` for a code and test review. Write the verdict as a comment. PASS → move the card to **Review**. BLOCK → move the card back to **In Progress** with the findings.
   - **Review** → Delegate to `qa`. QA writes and runs the review scenario (docs/workflow/development.md → "Review scenario"). Write the scenario and the results to the card. Attach the screenshots. On PASS, **HALT for the person to review, sign off, and push.** On BLOCK, move the card back to **In Progress** with the list.
   - **Shipping** → The person has pushed. Run the deploy check and the pending scenario tests (see the Bindings). Write the results to the card. Report. **HALT for the person to confirm complete → Done.**
   - **Done** → Nothing to do. Report. Follow-ups go to Backlog.
   - **Blocked** → Report the blocker comment. Ask the person how to proceed.
   - **Closed** → Nothing to do. Report.

3. **Every card move MUST include the comment its state requires.** See docs/workflow/development.md → "Board conventions".
4. **Never** move a card to Done or Closed yourself. **Never** `git push`. These are the person's tasks. **Never** create a branch or a merge commit. All work goes on `master`. Rebase a stray branch onto `master` only when the person asks (docs/workflow/development.md → Repository).
5. Read the card's list again just before each move. The person may move cards at any time. If the card is already past the target state, do not move it. Write the comment only.
