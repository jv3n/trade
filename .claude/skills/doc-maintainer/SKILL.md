---
name: doc-maintainer
description: Audit the PortfolioAI doc set for factual drift, tone inconsistencies, and broken cross-links. Use when the user types `/doc-maintainer`, asks to "check docs", "audit docs", "do a doc pass", or after a structurally significant change (new module, migration, new provider, refactored config). Spawns a subagent that runs in isolation and returns a prioritised punch-list — never edits the docs itself.
license: MIT
---

# Doc-maintainer audit

Spawn the **`doc-maintainer`** subagent (defined in `.claude/agents/doc-maintainer.md`) to perform a full read-only audit of the doc set.

## When to invoke

- User types `/doc-maintainer`.
- User asks for a doc check, doc pass, doc audit, doc review.
- After a structurally significant change has been merged on the current branch — new backend module, new Flyway migration, new external provider, new frontend repository, refactored config, new CI workflow. The agent's value is highest right after these because the main thread already moved on but the doc set hasn't caught up yet.

## How to invoke

Use the **`Agent` tool** with :

- `subagent_type: "doc-maintainer"` — picks up the agent definition from `.claude/agents/doc-maintainer.md`, including the read-only tool whitelist (`Read, Glob, Grep`).
- `description: "Doc-set audit"` (or similar 3-5 word).
- `prompt`: a self-contained brief explaining what to audit. Always include :
  - The doc set scope (full audit by default — see below).
  - Expected output shape (punch-list, prioritised, no patches applied).
  - Any user-supplied focus area (e.g. "concentre-toi sur Phase 2") if relevant.

### Default prompt template

```
Audit le doc set PortfolioAI complet. Fichiers sous responsabilité (voir le tableau dans ton system prompt) :
docs/metier/*, docs/technique/*, docs/projet/* (sauf data-input/ et data-input-local/).

Trois capacités à appliquer :
1. Cross-check factuel — confronte les claims des docs à la réalité du repo (modules backend, repositories frontend, providers, workflows CI, migrations Flyway, commandes, statut des phases).
2. Ton — vérifie cohérence titres bas-de-casse, tirets cadratin, narratif > bullets pour les arguments.
3. Cross-link — vérifie que chaque lien relatif résout, et que toute doc nouvellement créée est référencée depuis un point d'entrée.

Sortie : punch-list structurée par capacité, priorités HIGH/MED/LOW, verdict global. Pas d'edit, pas de patch appliqué.
```

## What NOT to do from this skill

- **Don't audit yourself in the main thread.** The whole point of the subagent is to keep the main conversation context clean. If you read `architecture.md` + `ops.md` + 8 other docs in main, you waste tokens that the user needs for the actual work.
- **Don't auto-apply the punch-list.** Return it to the user verbatim. They decide what to patch, and patching happens back in the main thread (where they have the code context).
- **Don't promote findings to the backlog automatically.** Per CLAUDE.md ("Documentation > audits/"), the user decides which findings become actions.

## After the audit returns

Relay the agent's punch-list to the user as-is (or with very light formatting). Then wait for their direction :
- "Patch les HIGH" → apply the HIGH-priority fixes in the main thread.
- "Patch tout" → apply everything.
- "Ignore [n]" → skip a specific finding (note pourquoi si non-évident).
- Silence ou "OK noté" → do nothing further, the audit was informational.

## After patches are applied — update the CHANGELOG

**This step is mandatory** as soon as one or more patches have been written to disk. Skip it only when the user said "OK noté" / "ignore tout" — i.e. no doc file was modified.

Append a new dated section to `docs/CHANGELOG.md` (or extend today's section if it already exists). Format :
- One section per date `## YYYY-MM-DD` (reverse-chronological — today's section goes at the **top**, just under the introduction header).
- Bullets grouped by area : `### metier/`, `### technique/`, `### projet/`, `### .claude/`, `### Racine` (only the areas actually touched today).
- One bullet per file modified, narrative one-liner that explains **what changed and why** — not just the file path. Example : `` `architecture.md` : "trois clés" → "cinq clés" suite à l'extension Phase 2 du scope config (ajout des toggles `market.provider` / `news.provider`). ``

Why : the CHANGELOG is the only trace of *how* the doc set evolved (order, motivation, drift that was fixed). When a future audit flags something weird, the CHANGELOG is where you check whether it's a known recent change vs a real regression.

The agent itself never writes the CHANGELOG — it stays read-only by design. The main thread (you, in this conversation) writes the entry as the final step of the patch session, before declaring done.
