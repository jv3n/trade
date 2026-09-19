---
name: git-commit
description: 'Execute git commit with conventional commit message analysis, intelligent staging, and message generation. Use when user asks to commit changes, create a git commit, or mentions "/commit". Supports: (1) Auto-detecting type and scope from changes, (2) Generating conventional commit messages from diff, (3) Interactive commit with optional type/scope/description overrides, (4) Intelligent file staging for logical grouping'
license: MIT
---

# Git Commit with Conventional Commits

## Overview

Create standardized, semantic git commits using the Conventional Commits specification. Analyze the actual diff to determine appropriate type, scope, and message.

## Conventional Commit Format

```
<type>(<issue>/<scope>): <description>
```

- **Title only** — no body, no footer, no `Co-Authored-By` trailer, no mention of Claude / AI.
- **Every commit is linked to a GitHub issue** — the issue number prefixes the scope (`feat(93/journal): …`). If no issue exists for the work, ask the user which one to use before committing — unless they waived it (large foundation commits), in which case use a plain scope (`chore(mockup): …`).

## Commit Types

| Type       | Purpose                        |
| ---------- | ------------------------------ |
| `feat`     | New feature                    |
| `fix`      | Bug fix                        |
| `docs`     | Documentation only             |
| `style`    | Formatting/style (no logic)    |
| `refactor` | Code refactor (no feature/fix) |
| `perf`     | Performance improvement        |
| `test`     | Add/update tests               |
| `build`    | Build system/dependencies      |
| `ci`       | CI/config changes              |
| `chore`    | Maintenance/misc               |
| `revert`   | Revert commit                  |

## Breaking Changes

Flag a breaking change with `!` after the scope — never with a `BREAKING CHANGE:` footer (no footers allowed):

```
feat(93/journal)!: remove deprecated endpoint
```

## Workflow

### 1. Analyze Diff

```bash
# If files are staged, use staged diff
git diff --staged

# If nothing staged, use working tree diff
git diff

# Also check status
git status --porcelain
```

### 2. Stage Files (if needed)

If nothing is staged or you want to group changes differently:

```bash
# Stage specific files
git add path/to/file1 path/to/file2

# Stage by pattern
git add *.test.*
git add src/components/*

# Interactive staging
git add -p
```

**Never commit secrets** (.env, credentials.json, private keys).

### 3. Generate Commit Message

Analyze the diff to determine:

- **Type**: What kind of change is this?
- **Issue**: Which GitHub issue does this work belong to? (required — ask the user if unknown)
- **Scope**: What module / area is affected?
  - Domain: `account`, `candidates`, `journal`, `stats`, `lexicon`, `auth`, `config`
  - Cross-cutting: `core`, `ui`, `claude`, `docs`, `mockup`, `ci`, `infra`
- **Description**: One-line summary of what changed (present tense, imperative mood, < 72 chars, **English**)

### 4. Execute Commit

```bash
git commit -m "<type>(<issue>/<scope>): <description>"
```

A single `-m` with the title only — never a second `-m`, a heredoc body, or an attribution trailer.

The repo's pre-commit hook runs Spotless (ktfmt) on Kotlin and Prettier on the frontend. Let it format your changes — do not bypass with `--no-verify`.

## Best Practices

- One logical change per commit
- Present tense: "add" not "added"
- Imperative mood: "fix bug" not "fixes bug"
- Keep description under 72 characters

## Git Safety Protocol

- NEVER update git config
- NEVER run destructive commands (--force, hard reset) without explicit request
- NEVER skip hooks (--no-verify) unless user asks
- NEVER force push to main/master
- If commit fails due to hooks, fix and create NEW commit (don't amend)
