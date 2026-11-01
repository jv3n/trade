---
name: git-commit
description: 'Writes and runs a git commit in the project format (issue-prefixed Conventional Commit, title only). Use when the user asks in the current turn to commit, or mentions "/commit".'
license: MIT
---

# Git Commit

The rules live in [`CLAUDE.md > Commits`](../../CLAUDE.md#commits) : title only, English, an issue in the scope, no attribution, and **a commit only when the user asks in the current turn**. This skill adds what that section leaves out.

## Format

```
<type>(<issue>/<scope>): <description>
```

- **Type** — `feat`, `fix`, `refactor`, `chore`, `docs`, `test` in practice.
- **Scope** — the area the log uses : `stats`, `journal`, `account`, `today`, `reports`, `scanner`, `lexicon`, `auth`, `config`, `ui`, `ops`, `tilt`, `deps`, `mockup`, `claude`, `ci`, `e2e`.
- **Description** — imperative, under 72 characters. A waived issue keeps a plain scope (`chore(mockup): …`).
- **Breaking change** — `!` after the scope (`feat(93/journal)!: remove the endpoint`), never a footer.

## Steps

1. Read `git status` and the diff ; ask which issue if none is known.
2. On `master`, branch first.
3. Stage named paths, never secrets (`.env`, credentials).
4. `git commit -m "<title>"` — one `-m`, no heredoc body.

## The pre-commit hook

`.githooks/pre-commit` runs `spotlessApply` on staged Kotlin and Prettier on staged `.ts` / `.html` / `.scss` under `apps/web` and `libs/ui`, then re-stages them. It is active once `npm install` in `projects/frontend` has set `core.hooksPath`.

- Don't bypass it with `--no-verify`.
- **No partial staging** : it re-stages whole files, so `git add -p` hunks would be pulled in anyway.
- i18n JSON is not formatted by it.
- A commit the hook refused did not happen : fix and commit again, `--amend` would rewrite the previous commit.
