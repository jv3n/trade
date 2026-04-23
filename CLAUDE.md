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

## Structure cible

```
trade/
├── frontend/          # Angular 21
├── backend/           # Kotlin + Spring Boot
│   └── build.gradle.kts
├── docs/              # Documentation projet
├── .github/workflows/ # CI GitHub Actions (backend + frontend)
├── SOURCES.md         # Référence des sources de données ingérées
├── README.md
└── docker-compose.yml
```

## Modules backend

- `ingestion/` — collecte des flux RSS et APIs financières
- `analysis/` — orchestration des appels Claude API
- `portfolio/` — gestion du portefeuille utilisateur
- `recommendations/` — stockage et scoring des suggestions
- `observability/` — comparaison suggestion vs réalité marché

## Modules frontend

- `dashboard/` — vue principale du portefeuille
- `recommendations/` — affichage des conseils IA
- `history/` — historique et observabilité
- `settings/` — configuration des sources

## Phases de développement

- **Phase 1 (MVP)** — recommandation IA de bout en bout
- **Phase 2** — traçabilité et scoring des recommandations
- **Phase 3** — optimisation continue des prompts
- **Phase 4** — fine-tuning, paper trading, multi-portefeuilles

## Contraintes importantes

- Disclaimer financier obligatoire dans l'UI (pas un conseiller agréé)
- Sécurité des données portefeuille dès le départ
- Qualité des recommandations dépend de la qualité des sources ingérées

## Développement local

L'environnement local tourne avec **Tilt** (`tilt up`). Pas de `docker compose up` ni de `./gradlew bootRun` à la main.

| Commande | Usage |
|----------|-------|
| `tilt up` | Lance tout (PostgreSQL, backend, frontend) |
| `tilt up -- --host=<ip>` | Override l'hôte réseau (ex: accès LAN) |

URLs exposées :
- Frontend : `http://localhost:4200`
- Backend : `http://localhost:8080`
- Health : `http://localhost:8080/actuator/health`

Le backend démarre avec le profil `local` (`application-local.yml`).

## Conventions

- Kotlin idiomatique (data classes, sealed classes, extension functions)
- Spring Boot avec Kotlin DSL Gradle — config en **YAML** (`application.yml` / `application-local.yml`)
- Angular avec standalone components (Angular 21)
- Angular Material pour tous les composants UI (thème configuré dans `styles.scss`)
- Material Icons chargées via npm (`material-icons`) déclaré dans `angular.json` styles
- Tests d'intégration sur vrai PostgreSQL (pas de mocks BDD)
- Frontend testé avec **Vitest** (pas Karma) — `--browsers=ChromeHeadless` ne s'applique pas
- `@Async` Spring : ne jamais appeler une méthode `@Async` depuis `this` (auto-invocation bypass le proxy AOP). Toujours mettre le code async dans un bean séparé.
- LLM local : Ollama + `qwen2:1.5b` dans Docker (`ollama/ollama:latest`, port 11434, volume `ollama_data`). Modèle tiré via `tilt up` (resource `llm:pull-qwen2`). Mistral 7B et phi3:mini trop lents sur M1 pour un usage interactif.
- `application-local.yml` est gitignore — contient les clés API et config sensible. Ne jamais committer de clés dans le repo.

## Instructions pour Claude

- **Mettre à jour ce fichier** au fil de chaque feature implémentée : ajouter la feature dans le suivi ci-dessous, marquer son statut, et noter toute décision technique importante prise en cours de route.

- **Ce principe de mise à jour continue est le cœur de métier de l'application elle-même.** PortfolioAI est conçu pour mesurer la qualité de ses propres recommandations dans le temps et s'améliorer en conséquence. Ce CLAUDE.md doit refléter exactement cet esprit : chaque écart entre ce qu'on pensait savoir faire et ce qu'on a réellement implémenté doit être tracé ici immédiatement. Ne jamais laisser ce fichier dériver par rapport à la réalité du code.

- **Concrètement** : dès qu'une décision technique est prise (choix d'une lib, abandon d'une approche, correction d'un bug d'architecture), l'inscrire dans le suivi ou dans les conventions. Ce fichier est la mémoire vivante du projet — comme le module `observability/` le sera pour les recommandations IA.

## Suivi des features

### Phase 1 — MVP

| Feature | Statut | Notes |
|---------|--------|-------|
| Portfolio CRUD (backend) | ✅ Fait | Entités JPA (`Portfolio`, `Asset`), Repositories, `PortfolioService`, `PortfolioController` — REST sous `/api/portfolios` |
| Portfolio CRUD (frontend) | ✅ Fait | `PortfolioService` (HttpClient), `Dashboard` avec liste portefeuilles + tableau actifs + formulaires inline |
| Proxy dev Angular | ✅ Fait | `proxy.conf.json` + `angular.json` — redirige `/api` → `http://localhost:8080` |
| Navigation (header) | ✅ Fait | `mat-toolbar` Material sticky, liens avec icônes, état actif, Settings en icône à droite |
| Catalogue des sources | ✅ Fait | `SOURCES.md` — référence de 22 sources (RSS, marché, macro, crypto) avec métadonnées |
| Page Settings — sources | ✅ Fait | Toggles par catégorie (état local), tags Clé API / Payant, compteur actives/total — persistance backend à venir |
| CI GitHub Actions | ✅ Fait | `.github/workflows/backend.yml` (Gradle + PostgreSQL service) et `frontend.yml` (Vitest, pas Karma) — déclenchés sur changements de chemin uniquement |
| Ingestion RSS (backend) | ✅ Fait | Module `ingestion/` — `FeedSource`, `FeedArticle`, `RssFetcherService` (Rome), scheduler 15 min prod / 5 min local, déduplication par `guid`, `GET /api/ingestion/articles`, `POST /api/ingestion/fetch` |
| Reset BDD Tilt | ✅ Fait | Bouton `db:reset` dans Tilt — drop schema + touch `application.yml` pour redémarrage géré par Tilt (Flyway rejoue les migrations) |
| Config YAML | ✅ Fait | Migration `application.properties` → `application.yml` / `application-local.yml` |
| README + docs | ✅ Fait | `README.md` sommaire + `docs/commit-conventions.md` (Conventional Commits) |
| Appel LLM (Claude / Ollama) | ✅ Fait | Module `analysis/` — `LlmClient` interface, `ClaudeClient` (prod, `@ConditionalOnProperty`), `OllamaClient` (local, Mistral 7B dans Docker). `llm.provider: claude\|ollama` dans `application.yml` |
| Analyse IA async | ✅ Fait | `AnalysisService.startAsync()` → crée un job → `AnalysisRunner.run()` (`@Async @Transactional`). `AnalysisJobStore` (ConcurrentHashMap). API : `POST /api/portfolios/{id}/recommendations` → 202, `GET .../jobs/{jobId}`, `GET .../recommendations/{recId}`. Fix bug self-invocation Spring AOP : `@Async` sur bean séparé (`AnalysisRunner`), pas sur `this`. Dépendance circulaire résolue : toute la logique métier dans `AnalysisRunner`, `AnalysisService` ne fait que créer le job et déléguer. |
| Affichage recommandations (dashboard) | ✅ Fait | Polling RxJS (`interval + switchMap + takeWhile`), bouton "Analyser avec l'IA" avec spinner CSS + timer elapsed, section recommandation avec confidence badge, actions BUY/SELL/HOLD/REDUCE colorées |
| Seed data Tilt | ✅ Fait | `scripts/seed.sql` — portefeuille démo ~100k€ (VOO, QQQ, BND, AAPL, MSFT, NVDA, GOOGL, AMZN, BTC, ETH). Bouton `db:seed` dans Tilt. |
| Robustesse analyse IA | ✅ Fait | Timeout HTTP 45s sur OllamaClient, lecture réponse en bytes bruts (contourne `application/octet-stream`), extracteur JSON robuste (strip markdown), `@Transactional(readOnly=true)` sur controller pour fix `LazyInitializationException`, `GlobalExceptionHandler` → 404 sur `NoSuchElementException`, gestion 404 dans le polling frontend. |
| Affichage recommandations (page history) | ⏳ À faire | Component `recommendations/` — historique complet |
| Persistance Settings | ⏳ À faire | Sauvegarder les toggles sources en base |

### Phase 2 — Traçabilité
_À venir_

### Phase 3 — Optimisation prompts
_À venir_

### Phase 4 — Vision long terme
_À venir_