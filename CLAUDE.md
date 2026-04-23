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
| Infra locale | Docker Compose |

## Structure cible

```
trade/
├── frontend/          # Angular 21
├── backend/           # Kotlin + Spring Boot
│   └── build.gradle.kts
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

Le backend démarre avec le profil `local` (`application-local.properties`).

## Conventions

- Kotlin idiomatique (data classes, sealed classes, extension functions)
- Spring Boot avec Kotlin DSL Gradle
- Angular avec standalone components (Angular 21)
- Angular Material pour tous les composants UI (thème configuré dans `styles.scss`)
- Material Icons chargées via npm (`material-icons`) déclaré dans `angular.json` styles
- Tests d'intégration sur vrai PostgreSQL (pas de mocks BDD)

## Instructions pour Claude

- **Mettre à jour ce fichier** au fil de chaque feature implémentée : ajouter la feature dans le suivi ci-dessous, marquer son statut, et noter toute décision technique importante prise en cours de route.

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
| Ingestion flux économiques | ⏳ À faire | RSS + APIs financières — sources définies dans `SOURCES.md` |
| Appel Claude API | ⏳ À faire | Module `analysis/` |
| Affichage recommandations | ⏳ À faire | Component `recommendations/` |

### Phase 2 — Traçabilité
_À venir_

### Phase 3 — Optimisation prompts
_À venir_

### Phase 4 — Vision long terme
_À venir_