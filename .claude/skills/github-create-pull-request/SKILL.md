---
name: github-create-pull-request
description: 'Create a GitHub pull request with conventional commit message analysis and PR body generation. Use when the user asks to create a pull request, open a PR, or mentions "/pull-request" or "/pr".'
---

# GitHub Create Pull Request

## Overview

Create Pull Requests on GitHub with standardized content. Analyze the actual diff against `master` to determine appropriate type, scope, title and description.

PortfolioAI is hosted on GitHub (`https://github.com/jv3n/trade`). The default branch is `master`.

## Workflow

### 1. Analyze Branch Name

```bash
git branch --show-current
```

There is no enforced ticket-prefix convention on this project — derive context from the branch name and the diff itself.

### 2. Analyze Diff

Inspect every commit going to `master`, not just the latest one:

```bash
# Subjects of all commits not yet on master
git --no-pager log master..HEAD --reverse --format="%s"

# Full diff that the PR will contain
git diff master...HEAD

# Status of staged/unstaged changes
git status
```

### 3. Push the branch

If the current branch has no upstream, push it first:

```bash
git push -u origin "$(git branch --show-current)"
```

### 4. Create the Pull Request

Use the GitHub CLI (`gh`). PR title and body are written in **English**, following Conventional Commits for the title.

ALWAYS confirm with the user before running the command.

```bash
gh pr create \
  --base master \
  --title "<type>(<scope>): <description>" \
  --body "$(cat <<'EOF'
## Summary

- <bullet 1>
- <bullet 2>

## Test plan

- [ ] <how to validate locally>
- [ ] <regression check>

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

After creation, return the PR URL so the user can open it.

## Title rules

- One-line, < 72 characters
- Conventional Commits format: `<type>(<scope>): <description>`
- Types: `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `build`, `ci`, `chore`, `revert`
- Common scopes for this repo: `analysis`, `ingestion`, `portfolio`, `dashboard`, `import`, `history`, `settings`, `core`, `claude`, `docs`, `ci`

## Safety

- NEVER force-push to `master`
- NEVER skip hooks (`--no-verify`) unless explicitly asked
- Confirm with the user before opening the PR
