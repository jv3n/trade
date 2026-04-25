# PortfolioAI — CLAUDE.md

## Projet

Optimiseur de portefeuille boursier intelligent alimenté par l'IA. L'application ingère des flux économiques (RSS, APIs financières), génère des recommandations d'investissement via Claude API, et mesure la qualité de ses recommandations dans le temps.

## Stack technique

| Couche | Techno |
|--------|--------|
| Frontend | Angular 21 + Angular Material |
| Backend | Kotlin + Spring Boot |
| Build | Gradle (Kotlin DSL) |
| IA | Claude API (Anthropic) |
| BDD | PostgreSQL |
| Infra locale | Tilt + Docker Compose |
| CI | GitHub Actions |

## Structure du projet

```
trade/
├── frontend/          # Angular 21
├── backend/           # Kotlin + Spring Boot
├── docs/
│   ├── metier/        # vision.md, fonctionnalites.md
│   ├── technique/     # architecture.md, developpement.md
│   └── projet/        # backlog.md, sources.md, commit-conventions.md
├── .github/workflows/ # CI : backend, frontend, docs
├── docs/backlog.md    # Suivi des features (source de vérité)
├── README.md
└── docker-compose.yml
```

## Modules backend

- `ingestion/` — collecte des flux RSS et APIs financières
- `analysis/` — orchestration des appels LLM (`LlmClient`, `AnalysisRunner`, `AnalysisJobStore`)
- `portfolio/` — gestion du portefeuille utilisateur
- `recommendations/` — stockage et scoring des suggestions
- `observability/` — comparaison suggestion vs réalité marché (Phase 2)

## Modules frontend

- `dashboard/` — portefeuille + analyse IA
- `history/` — historique des recommandations
- `settings/` — configuration des sources
- `core/` — services partagés (`PortfolioService`, `AnalysisService`, `SettingsService`)

## Développement local

Voir `docs/technique/developpement.md` pour le détail complet.

```bash
tilt up   # démarre tout : PostgreSQL, Ollama, backend, frontend
```

Le backend démarre avec le profil `local` (`application-local.yml`, gitignore).

## Conventions

- Kotlin idiomatique (data classes, sealed classes, extension functions)
- Spring Boot avec Kotlin DSL Gradle — config en **YAML** (`application.yml` / `application-local.yml`)
- Angular avec standalone components (Angular 21)
- Angular Material pour tous les composants UI
- Tests d'intégration sur vrai PostgreSQL (pas de mocks BDD)
- Frontend testé avec **Vitest** (pas Karma)
- `@Async` Spring : toujours sur un bean séparé — jamais `this.asyncMethod()` (bypass AOP)
- LLM local : Ollama + `qwen2:1.5b`. Mistral 7B / phi3:mini trop lents sur M1
- Commits en **anglais**, Conventional Commits. Voir `docs/projet/commit-conventions.md`
- Ne jamais committer de clés API. `application-local.yml` est gitignore

## Instructions pour Claude

### Backlog

Le fichier **`docs/projet/backlog.md`** est la source de vérité pour le suivi des features. À chaque feature implémentée :
1. Déplacer la ligne de "À faire" vers "Terminé" dans `docs/projet/backlog.md`
2. Ajouter les notes techniques concises dans la colonne Notes

### Documentation

Les fichiers dans `docs/` décrivent l'état réel du projet. Les tenir à jour quand le code évolue :

| Fichier | Mettre à jour quand… |
|---------|----------------------|
| `docs/metier/fonctionnalites.md` | Une feature MVP change de statut, une phase avance |
| `docs/technique/architecture.md` | Un nouveau module, une décision technique importante, un pattern ajouté |
| `docs/technique/developpement.md` | La config locale change, une commande Tilt est ajoutée |
| `docs/projet/sources.md` | Une source est ajoutée ou retirée |

### Décisions techniques

Dès qu'une décision technique est prise (choix d'une lib, abandon d'une approche, bug d'architecture corrigé), l'inscrire dans `docs/technique/architecture.md` sous "Décisions techniques notables". Ce fichier est la mémoire du *pourquoi*, pas seulement du *quoi*.
