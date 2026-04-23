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
| `revert` | Annulation d'un commit précédent |

## Scopes courants

| Scope | Périmètre |
|-------|-----------|
| `backend` | Backend Kotlin / Spring Boot (global) |
| `frontend` | Frontend Angular (global) |
| `ingestion` | Module d'ingestion des flux |
| `analysis` | Module d'appel Claude API |
| `portfolio` | Module portefeuille |
| `recommendations` | Module recommandations |
| `observability` | Module scoring / traçabilité |
| `db` | Migrations Flyway |
| `ci` | GitHub Actions |
| `tilt` | Tiltfile / environnement local |
| `config` | Configuration applicative |

## Exemples

```
feat(ingestion): add RSS fetcher with Rome and deduplication by guid

fix(frontend): add provideRouter to app.spec to resolve NG0201

chore(config): migrate application.properties to YAML

chore(ci): add backend and frontend GitHub Actions workflows

chore(tilt): add db:reset one-click resource

docs: add commit conventions

refactor(portfolio): extract asset mapper to dedicated class

test(ingestion): add integration test for RssFetcherService
```

## Règles

- Un commit = une intention claire
- Ne pas mélanger feat et fix dans le même commit
- Les migrations Flyway ont leur propre commit avec le scope `db`
- Le CLAUDE.md se met à jour dans le même commit que la feature concernée
