---
name: code-review
description: Read-only pre-commit review of the current diff against the project's conventions, invariants and regression blind spots. Use when the user types `/code-review`, or asks to "review the diff", "check my changes" or "do a code pass before commit". Spawns a subagent that returns a prioritised punch-list and never edits the code.
license: MIT
---

# Code review

Spawn the **`code-reviewer`** subagent (`.claude/agents/code-reviewer.md`). Don't review in the main thread : the point is a fresh reader, and the main thread likely wrote the code.

Use the `Agent` tool with `subagent_type: "code-reviewer"`, and this prompt plus any focus the user gave :

```
Review the current diff, main branch `master`.

Scope:
- Uncommitted changes : `git diff HEAD`.
- Off `master`, also the branch : `git diff master...HEAD`.
- All touched files, not a sample.

Output: punch-list `Bloquants` / `À discuter` / `Mineurs`, each with a cited snippet and a concrete
suggestion, then a verdict `mergeable | needs-fix | reject`. No edits.
```

## After the review

Relay the punch-list as it is, then wait for the user. Don't apply it, don't commit on a green verdict, don't turn findings into issues. If they go ahead despite `needs-fix` or `reject`, state the verdict once and defer : a follow-up PR can be a deliberate choice.

## Difference with `/code-review ultra`

`/code-review ultra` (formerly `/ultrareview`) is a **billed multi-agent cloud review** that only the user can launch, on the branch or a PR. This skill is the **local** review, for day-to-day use before a commit.
