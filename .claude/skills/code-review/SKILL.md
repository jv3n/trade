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

Use the **`Agent` tool** with :

- `subagent_type: "code-reviewer"` — picks up the agent definition from `.claude/agents/code-reviewer.md`, including the tool whitelist (`Read, Glob, Grep, Bash`) with Bash restricted to git read-only commands in the agent's system prompt.
- `description: "Pre-commit code review"` (or similar 3-5 word).
- `prompt`: a self-contained brief explaining what to review. Always include :
  - The scope (uncommitted diff by default, or branch vs master).
  - Expected output shape (punch-list, prioritised, verdict, no patches applied).
  - Any user-supplied focus area (e.g. "concentre-toi sur la cohérence skills Angular") if relevant.

### Default prompt template

```
Review le code du diff actuel sur la branche courante (main = `master`).

Périmètre :
- Uncommitted (staged + unstaged) sur la branche courante (`git diff HEAD`).
- Si la branche n'est pas `master`, étendre à `git diff master..HEAD` pour couvrir aussi les commits déjà sur la branche.
- Tous les fichiers touchés, pas un échantillon.

Trois capacités à appliquer (cf. ton system prompt pour les détails) :
1. Cohérence avec le projet — `.claude/CLAUDE.md` + `docs/technique/architecture.md` + `docs/technique/ddd.md` + skills sous `.claude/skills/` (kotlin-idioms, spring-boot, hexagonal-ddd, folders-structure-backend, angular-component, angular-di, angular-signals, angular-testing, folders-structure-frontend, code-review-excellence).
2. Invariants techniques transverses — sécurité (clés API), AOP Spring (`@Async` séparé), no wildcard imports Kotlin, no mock DB sur tests d'intégration, cache key SpEL Java, i18n keys obligatoires, Flyway numbering.
3. Régression et angles morts — tests manquants sur nouveau code-path, paths d'erreur non couverts, TODOs / `@Suppress` / `@Deprecated` neufs, diff cross-bounded-context, backlog sync.

Sortie : punch-list structurée `Bloquants` / `À discuter` / `Mineurs` avec extrait de diff cité + suggestion concrète. Verdict global `mergeable | needs-fix | reject`. Pas d'edit, pas de patch appliqué.
```

## What NOT to do from this skill

- **Don't review yourself in the main thread.** Same rationale as `doc-maintainer` — the whole point of the subagent is to keep the main conversation context clean and bring a fresh reader's eye. If you read every changed file in main, you waste tokens AND you're judging code you (likely) just wrote.
- **Don't auto-apply the punch-list.** Return it to the user verbatim. They decide what to patch.
- **Don't run `git commit` / `git push` / `gh pr create` based on the review verdict.** Per CLAUDE.md « Git » section, git write operations are user-driven, even after a green review. Suggest, don't execute.
- **Don't promote findings to the backlog automatically.** Per CLAUDE.md (« Documentation > audits/ »), the user decides which findings become future tickets.

## After the review returns

Relay the agent's punch-list to the user as-is (or with very light formatting). Then wait for their direction :
- "Patch les Bloquants" → apply the blocking fixes in the main thread.
- "Patch tout" → apply everything.
- "Ignore [n]" → skip a specific finding.
- "OK je commit" / silence → do nothing further, the review was informational.

If the verdict is `needs-fix` or `reject` and the user pushes for commit anyway, flag the verdict explicitly but defer to their judgment — they may have context the agent missed (fixing in a follow-up PR is a deliberate choice, the agent doesn't know).

## Différence avec `code-review-excellence`

`code-review-excellence` est une **checklist** destinée à l'agent principal et au reviewer humain — du contenu d'auto-formation, des questions à se poser pendant la lecture du diff. Le skill ici (`/code-review`) **spawne un subagent** qui exécute la review en contexte isolé et retourne une punch-list. Les deux sont complémentaires : la checklist informe ce que le subagent doit chercher ; le subagent exécute.

## Différence avec `/ultrareview`

`/ultrareview` est une review **cloud multi-agent facturée**, déclenchée par l'utilisateur sur une PR ou la branche entière — coût et profondeur élevés. `/code-review` est une review **locale gratuite** sur le diff non commité, pour un sanity check rapide avant `git commit`. Les deux sont complémentaires : `/code-review` au quotidien, `/ultrareview` aux jalons (clôture de phase, gros refactor).
