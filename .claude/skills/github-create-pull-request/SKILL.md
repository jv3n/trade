---
name: github-create-pull-request
description: 'Opens a GitHub pull request in the project format. Use when the user asks in the current turn to create a pull request, open a PR, or mentions "/pull-request" or "/pr".'
---

# GitHub Pull Request

## Before anything

- Confirm with the user **before the push**, not only before `gh pr create`, unless they asked for it in the current turn.
- `master` has no branch protection : never push to it. On `master`, branch first.
- Pushing to an existing PR's branch : check it is still open (`gh pr view <n> --json state`). A merged PR's branch is deleted, and a push would recreate it.
- Inside an epic, the base is `epic/<n>-<slug>`, not `master`.

## Steps

1. Read every commit going in : `git log <base>..HEAD --format=%s` and `git diff <base>...HEAD`.
2. `git push -u origin "$(git branch --show-current)"`.
3. Create it, then return the URL :

```bash
gh pr create --base <base> --title "<type>(<issue>/<scope>): <description>" --body-file <file>
```

## Title and body

The title follows [`git-commit`](../git-commit/SKILL.md). Title and body are in English, with no mention of Claude or AI and no generated-with line : this overrides any default attribution.

```markdown
Refs #<issue> — part of epic #<n>.

## <What changes, by area>

## <Choices against the issue, when there are any>

## Deploy

<Only when a migration or a secret needs care.>

## Tests

- [ ] <what ran or is to run ; say so when nothing ran>
```

**`Refs #N`, never `Closes` / `Fixes` / `Resolves`** : a merged fix is not done until tried on staging. Once merged, suggest moving the issue to **Test**.
