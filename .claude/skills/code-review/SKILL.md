---
name: code-review
description: Read-only pre-commit code review of the current diff against PortfolioAI conventions, technical invariants, and regression blind spots. Use when the user types `/code-review`, asks to "review the diff", "check my changes", or "do a code pass before commit", or after wrapping up a non-trivial feature. Spawns a subagent that runs in isolation and returns a prioritised punch-list — never edits the code itself.
license: MIT
---

# Code review

Spawn the **`code-reviewer`** subagent (defined in `.claude/agents/code-reviewer.md`) to perform a read-only review of the current diff.

## When to invoke

- User types `/code-review` (or `/code-reviewer`).
- User asks for a code check / review / pass before commit, or after wrapping up a feature.
- After a non-trivial change has been written on the current branch — new module, refactor of a port/adapter, new migration, new test suite. The agent's value is highest right before commit because the main thread is in writer-mode and benefits from a fresh reader's eye.

## How to invoke

Use the **`Agent` tool** with:

- `subagent_type: "code-reviewer"` — picks up the agent definition from `.claude/agents/code-reviewer.md`, including the tool whitelist (`Read, Glob, Grep, Bash`) with Bash restricted to git read-only commands in the agent's system prompt.
- `description: "Pre-commit code review"` (or similar 3–5 words).
- `prompt`: a self-contained brief explaining what to review. Always include:
  - The scope (uncommitted diff by default, or branch vs master).
  - Expected output shape (punch-list, prioritised, verdict, no patches applied).
  - Any user-supplied focus area (e.g. "focus on Angular skill consistency") if relevant.

### Default prompt template

```
Review the code in the current diff on the current branch (main = `master`).

Scope:
- Uncommitted (staged + unstaged) on the current branch (`git diff HEAD`).
- If the branch isn't `master`, extend to `git diff master..HEAD` to also cover commits already on the branch.
- All touched files, not a sample.

Three capabilities to apply (see your system prompt for details):
1. Project consistency — `.claude/CLAUDE.md` + `docs/technique/architecture.md` + `docs/technique/ddd.md` + skills under `.claude/skills/` (kotlin-idioms, spring-boot, hexagonal-ddd, folders-structure-backend, angular-component, angular-di, angular-signals, angular-testing, folders-structure-frontend).
2. Cross-cutting technical invariants — security (API keys), Spring AOP (separate `@Async` bean), no wildcard imports in Kotlin, no DB mocks on integration tests, SpEL cache keys in Java, mandatory i18n keys, Flyway numbering.
3. Regression and blind spots — missing tests on new code paths, uncovered error paths, new TODOs / `@Suppress` / `@Deprecated`, cross-bounded-context diff, backlog sync.

Output: structured punch-list `Bloquants` / `À discuter` / `Mineurs` with a cited diff snippet + concrete suggestion. Overall verdict `mergeable | needs-fix | reject`. No edits, no patches applied.
```

## What NOT to do from this skill

- **Don't review yourself in the main thread.** Same rationale as `doc-maintainer` — the whole point of the subagent is to keep the main conversation context clean and bring a fresh reader's eye. Reading every changed file in main wastes tokens AND you'd be judging code you (likely) just wrote.
- **Don't auto-apply the punch-list.** Return it to the user verbatim. They decide what to patch.
- **Don't run `git commit` / `git push` / `gh pr create` based on the review verdict.** Per CLAUDE.md "Commits" section, git write operations are user-driven, even after a green review. Suggest, don't execute.
- **Don't promote findings to the backlog automatically.** Per CLAUDE.md ("Documentation > audits/"), the user decides which findings become future tickets.

## After the review returns

Relay the agent's punch-list to the user as-is (or with very light formatting). Then wait for direction:

- "Patch the Bloquants" → apply the blocking fixes in the main thread.
- "Patch everything" → apply all findings.
- "Ignore [n]" → skip a specific finding.
- "OK I'll commit" / silence → do nothing further, the review was informational.

If the verdict is `needs-fix` or `reject` and the user pushes for commit anyway, flag the verdict explicitly but defer to their judgment — they may have context the agent missed (fixing in a follow-up PR is a deliberate choice, the agent doesn't know).

## Difference with `/ultrareview`

`/ultrareview` is a **paid multi-agent cloud review**, user-triggered on a PR or the whole branch — high cost and depth. `/code-review` is a **local free review** on the uncommitted diff, for a quick sanity check before `git commit`. The two are complementary: `/code-review` for everyday use, `/ultrareview` at milestones (phase close, large refactor).
