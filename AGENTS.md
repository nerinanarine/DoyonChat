## 0. Ask First, Never Assume

If a requirement is unclear, ambiguous, or open to multiple interpretations, **stop and ask the user** before proceeding.  
Do not fill in gaps with your own assumptions or make decisions on the user's behalf.  
When in doubt, always confirm with the user rather than guessing.

## 1. Leverage Available Agents

**Use specialized agents and skill tools proactively when they fit the task.**

- Delegate to `planner` for breaking down complex user requests into structured tasks.
- Delegate to `coder` for code generation, test writing, and patch application.
- Delegate to `reviewer` for code review, static analysis, and auto-fixes.
- Use domain-specific skills (docx, xlsx, pdf, pptx, web design, etc.) when the deliverable matches their scope.

Don't default to manual execution when a dedicated agent or tool can do the job better.

Before implementing:
- State your assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them - don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name what's confusing. Ask.
- Identify the applicable backlog item under `specs/000_backlog/items/` and implement it according to the corresponding feature `specs/*/plan.md`. If the backlog item has no plan, or the requested work conflicts with the plan, stop and clarify before coding.
- Keep the implementation, tests, and verification steps aligned with that `plan.md`; update the plan or backlog status only when the user requests or the task requires it.

## 2. Simplicity First

**Minimum code that solves the problem. Nothing speculative.**

- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- No error handling for impossible scenarios.
- If you write 200 lines and it could be 50, rewrite it.

Ask yourself: "Would a senior engineer say this is overcomplicated?" If yes, simplify.

## 3. Surgical Changes

**Touch only what you must. Clean up only your own mess.**

When editing existing code:
- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor things that aren't broken.
- Match existing style, even if you'd do it differently.
- If you notice unrelated dead code, mention it - don't delete it.

When your changes create orphans:
- Remove imports/variables/functions that YOUR changes made unused.
- Don't remove pre-existing dead code unless asked.

The test: Every changed line should trace directly to the user's request.

## 4. Goal-Driven Execution

**Define success criteria. Loop until verified.**

Transform tasks into verifiable goals:
- "Add validation" → "Write tests for invalid inputs, then make them pass"
- "Fix the bug" → "Write a test that reproduces it, then make it pass"
- "Refactor X" → "Ensure tests pass before and after"

For multi-step tasks, state a brief plan:
```
1. [Step] → verify: [check]
2. [Step] → verify: [check]
3. [Step] → verify: [check]
```

Strong success criteria let you loop independently. Weak criteria ("make it work") require constant clarification.

---

## 5. Language Guidelines

- **User communication:** Japanese (日本語).
- **Documentation and code comments:** Preserve the existing language; do not translate them.

---

## 6. Version Control Discipline

**Keep all code changes under Git so they can be rolled back.**

- Before starting edits, check `git status`. If the working tree is dirty, commit or stash existing changes first.
- Make atomic commits: one logical change per commit with a clear message.
- After completing a task, commit the changes so the state can be reverted if needed.
- For large or risky refactors, create a feature branch instead of working directly on the main branch.
- Never leave the repository in a dirty state when finishing a session.
- **You must ask the user for explicit permission before running any `git commit` or `git push` command.** Do not commit or push without approval.

---

**These guidelines are working if:** fewer unnecessary changes in diffs, fewer rewrites due to overcomplication, and clarifying questions come before implementation rather than after mistakes.