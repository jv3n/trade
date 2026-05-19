# Conventions de commit — PortfolioAI

Basé sur [Conventional Commits](https://www.conventionalcommits.org/) v1.0.0.

## Format

```
<type>(<scope>): <description courte>

[corps optionnel]

[footer optionnel]
```

- **type** : obligatoire
- **scope** : optionnel, entre parenthèses — précise le module concerné
- **description** : impératif, minuscule, sans point final, max ~72 caractères

## Types

| Type | Usage |
|------|-------|
| `feat` | Nouvelle fonctionnalité |
| `fix` | Correction de bug |
| `chore` | Tâche technique sans impact fonctionnel (config, dépendances, CI) |
| `refactor` | Réécriture sans changement de comportement |
| `docs` | Documentation uniquement |
| `test` | Ajout ou correction de tests |
| `perf` | Amélioration de performance |
| `audit` | Archive d'une revue de code dans `docs/projet/audits/` (rapport daté, observations brutes, **non actionnable directement** — c'est volontaire) |
| `revert` | Annulation d'un commit précédent |

## Scopes courants

| Scope | Périmètre |
|-------|-----------|
| `backend` | Backend Kotlin / Spring Boot (global) |
| `frontend` | Frontend Angular (global) |
| `market` | Module market (Twelve Data + mock + indicateurs) |
| `analysis` | Module d'appel LLM (Claude / Ollama, narratif ticker) |
| `portfolio` | Module portefeuille (CSV, snapshots) |
| `watchlist` | Module watchlist (Phase 2) |
| `news` | Module news (Finnhub + mock, Phase 2) |
| `analyst` | Module analyst (Finnhub + mock, recos analystes Phase 2) |
| `earnings` | Module earnings (Finnhub + mock, EPS trimestriels + next-date Phase 2) |
| `ticker` | Page Dossier ticker (frontend) |
| `dashboard` | Page Dashboard (frontend, sidebar incluse) |
| `settings` | Page Settings (back-office, configuration runtime, gestion des prompts) |
| `observability` | Module scoring / traçabilité (Phase 3) |
| `db` | Migrations Flyway |
| `ci` | GitHub Actions |
| `tilt` | Tiltfile / environnement local |
| `config` | Configuration applicative |

## Exemples

```
feat(market): add TwelveDataClient with quote and time_series endpoints

fix(frontend): add provideRouter to app.spec to resolve NG0201

chore(config): migrate application.properties to YAML

chore(ci): add backend and frontend GitHub Actions workflows

chore(tilt): add db:reset one-click resource

docs: add commit conventions

refactor(portfolio): extract asset mapper to dedicated class

test(ingestion): add integration test for RssFetcherService

audit: add 2026-05-02 global code review report
```

## Règles

- **Langue : anglais obligatoire** — type, scope, description et corps du commit en anglais
- Un commit = une intention claire
- Ne pas mélanger feat et fix dans le même commit
- Les migrations Flyway ont leur propre commit avec le scope `db`
- Le CLAUDE.md se met à jour dans le même commit que la feature concernée

## Versioning

Les commits ne portent pas de version — la version vit dans les **tags git** + **Releases GitHub** posés à la clôture d'une phase ou d'un patch. Format strict : `vMAJOR.MINOR.PATCH` ou `vMAJOR.MINOR.PATCH-rcN`. Règles complètes + rituel release-triggered : [`docs/devops/release-process.md > Versioning`](../devops/release-process.md#versioning).
