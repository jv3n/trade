# Architecture

## Stack

| Couche | Technologie | Pourquoi |
|--------|-------------|----------|
| Frontend | Angular 21 + Angular Material | Standalone components, signals, framework robuste pour dashboards |
| Backend | Kotlin + Spring Boot | Typage fort, null-safety, excellent écosystème JVM |
| Build | Gradle (Kotlin DSL) | Standard Kotlin/Spring, scripts typés |
| IA (défaut) | Claude API — Anthropic | Compréhension du langage naturel financier, JSON structuré fiable, raisonnement nettement supérieur à un 7B local |
| IA (backup local) | Ollama + `mistral` (7B Instruct) | Développement offline / sans clé API. Pas le défaut depuis la Phase 1 |
| Data marché | Yahoo Finance (API non officielle) | Gratuit, complet, pas de clé. Source primaire des dossiers ticker |
| Base de données | PostgreSQL | Schéma relationnel, snapshots historiques, Flyway pour les migrations |
| Infra locale | Tilt + Docker Compose | Hot reload backend/frontend, reset BDD en un clic |
| CI | GitHub Actions | Workflows backend (Gradle + PostgreSQL) et frontend (Vitest) |

## Vue d'ensemble (Phase 1)

```
┌────────────────────────────────────────────┐
│         Sources de données                  │
│  Yahoo Finance API (par ticker)             │
│  ┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ │
│  RSS / macro / crypto      [gelé Phase 0]   │
└──────────────────┬─────────────────────────┘
                   │
                   ▼
┌────────────────────────────────────────────┐
│         Backend  (Kotlin + Spring)          │
│                                             │
│  market/      → YahooClient + indicators    │
│  analysis/    → narratif LLM par ticker     │
│  portfolio/   → import CSV, snapshots       │
│  shared/      → utilitaires transverses     │
│  ┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ │
│  ingestion/   → RSS scheduler  [gelé]       │
│  analysis/ (legacy) → reco portfolio [gelé] │
└──────────────────┬─────────────────────────┘
                   │ REST API
                   ▼
┌────────────────────────────────────────────┐
│         Frontend  (Angular 21)              │
│                                             │
│  features/                                  │
│    dashboard/    → portefeuille + lien      │
│                    vers dossiers ticker     │
│    ticker/       → dossier par symbole      │
│    import/       → drag & drop CSV          │
│    suivi/        → timeline snapshots       │
│    settings/     → sources, test, prompt    │
│  core/                                      │
│    *.repository.ts (ports)                  │
│    adapters/*.http.ts                       │
└────────────────────────────────────────────┘
```

## Modules backend

### `market/` — nouveau, Phase 1

Source primaire des données ticker.

- **`YahooClient`** — récupère par ticker : quote courante, historique OHLC (1d à 1y), volumes, fundamentals basiques, 52w high/low. Caching court (5-15 min selon endpoint) pour éviter de rate-limiter Yahoo.
- **`IndicatorCalculator`** — Kotlin pur, sans dépendance Spring. Calcule RSI(14), MA50/MA200, momentum 30j/90j, perf 1m/3m/1y/YTD, drawdown 52w, volume relatif, position vs MA. Testable unit, sans BDD.
- **Endpoints REST** : `GET /api/market/ticker/{symbol}` (données + indicateurs), `GET /api/market/ticker/{symbol}/history` (OHLC pour le graphe).

### `analysis/` — Phase 1 réécrite

Le pipeline d'analyse en Phase 1 produit un **narratif LLM par ticker**, pas une recommandation portefeuille.

- `TickerNarrativeService` — point d'entrée : dedup d'un job pending sur le même symbole, réutilisation d'un snapshot frais (< 30 min), sinon kick async.
- `TickerNarrativeRunner` (`@Async` séparé pour respecter le proxy Spring) — exécute hors thread HTTP.
- `TickerNarrativeExecutor` — orchestrate : `MarketChartClient.fetchChart` → `IndicatorCalculator` → `buildNarrativeUserMessage` → `LlmClient.complete` → `TickerNarrativeParser` → `TickerNarrativeValidator` → `TickerNarrativePersister`. Parse + validate + 1 retry avec les erreurs en feedback.
- `TickerNarrativeParser` — parse `{summary, sentiment, keyPoints[]}` tolérant aux fences markdown, prose alentour, sentiment mixed-case.
- `TickerNarrativeValidator` — règles strictes : 3-5 keyPoints, ≤15 mots/bullet, summary 2-3 phrases, sentiment ∈ enum.
- Persistance dans `TickerNarrativeSnapshot` : `{symbol, generatedAt, price, indicatorsJson, summary, sentiment, keyPointsJson, modelUsed, promptVersion}` — append-only, permet la relecture a posteriori (Phase 3 observabilité).
- Job tracking dans `TickerNarrativeJob` (status PENDING/DONE/ERROR) pour le polling front.

> Le LLM **digère** des indicateurs déjà calculés. Il **ne calcule jamais** RSI, MA, etc. — sinon il hallucine les chiffres.

### `analysis/` (legacy) — gelé Phase 0

Pipeline historique de recommandations portefeuille — `AnalysisExecutor`, `AnalysisContextLoader`, `LlmResponseParser`, `RecommendationValidator` (8 règles : tickers ⊆ portefeuille, action ∈ enum, Σ targetWeight ∈ [95,105], etc.), `RecommendationPersister`, `AnalysisJobStore`. Le code reste en place et fonctionnel mais n'est plus exposé dans le flow utilisateur. Sera réactivé / repensé en Phase 4.

### `portfolio/`

Inchangé. Le portefeuille est **read-only depuis l'UI** — il reflète l'état réel du courtier Wealthsimple.

- **Import CSV** (`CsvImportService`) : parse l'export Wealthsimple (21 colonnes, FR, NFD, BOM UTF-8), upsert des positions par compte.
- **Snapshots** : `PortfolioSnapshot` + `SnapshotPosition` créés à chaque import, groupés par `batch_id`.

Sa nouvelle utilité Phase 1 : fournir la **liste des tickers détenus** au `market/` pour pré-charger les dossiers ticker pertinents.

### `ingestion/` — gelé Phase 0

Module RSS complet (Rome, scheduler 15 min, déduplication par `guid`, parsing robuste DOCTYPE / `&` nus / détection HTML, 25 sources seedées). Conservé en place mais retiré du flow principal — Yahoo Finance remplit ce rôle en Phase 1.

Réutilisable plus tard pour de la macro non couverte par Yahoo (Fed, BCE, indicateurs économiques) si besoin.

### `shared/`

Utilitaires transverses : `GlobalExceptionHandler` (mapping uniforme des erreurs en JSON).

## Modules frontend

Hexagonal léger sous `frontend/src/app/` :

- **`core/`** — ports + HTTP adapters
  - `*.repository.ts` (abstract class — port)
  - `adapters/*.http.ts` (HttpXxxRepository — adapter)
  - Wiring : `app.config.ts` `{ provide: XxxRepository, useClass: HttpXxxRepository }`
  - `theme.service.ts` (signal + persist localStorage)
- **`features/`** — *primary adapters*
  - `dashboard/` — portefeuille + lien vers les dossiers ticker
  - `ticker/` — dossier par symbole (Phase 1, à venir)
  - `import/` — drag & drop CSV
  - `suivi/` — timeline snapshots
  - `settings/` — sources / test / prompt-preview
  - `recommendations/`, `history/` — *gelé Phase 0* (recommandations portefeuille)

## Schéma de base de données

Deux migrations Flyway aujourd'hui : `V1__init.sql` (schéma Phase 0) et `V2__ticker_narrative.sql` (Phase 1 narratif).

| Section | Tables | Statut |
|---------|--------|--------|
| Portefeuille & actifs | `portfolio`, `asset` | Actif |
| Snapshots historiques | `portfolio_snapshot`, `snapshot_position` | Actif |
| Recommandations IA (legacy) | `recommendation`, `recommendation_action`, `recommendation_score` | Gelé |
| Jobs d'analyse (legacy) | `analysis_job` | Gelé (utilisé pour le polling Phase 0) |
| Sources d'ingestion | `feed_source`, `feed_article` | Gelé en pratique (table conservée pour les Settings UI) |
| Narratifs ticker | `ticker_narrative_snapshot`, `ticker_narrative_job` | Actif Phase 1 |

## Décisions techniques notables

### Phase 1 — pivot ticker

**LLM = rédacteur, pas décideur** — le LLM digère des indicateurs **déjà calculés** (RSI, MA, momentum) et écrit un narratif. Il ne calcule jamais d'indicateurs (il les hallucine systématiquement) et ne produit pas de signal d'achat/vente. Cette séparation rend l'output testable (le code des indicateurs l'est) et l'IA productive sur ce qu'elle sait faire (écrire).

**Yahoo en source primaire** — gratuit, sans clé, couverture mondiale, fundamentals corrects pour un MVP. La librairie officielle Python `yfinance` ne s'utilise pas côté JVM ; on parle directement à l'API publique en HTTP. Si Yahoo ferme un jour ou rate-limite, on bascule sur Stooq (EOD seulement) ou sur un provider payant (Alpha Vantage, Twelve Data, Polygon).

**Caching côté serveur** — un dossier ticker peut être consulté plusieurs fois par jour. On cache les fetchs Yahoo (5 min pour la quote, 15 min pour l'historique, 1 h pour les fundamentals) en mémoire. Pas besoin de Redis à cette échelle.

**Provider de marché abstrait + mock local** — `MarketChartClient` est une interface ; deux implémentations cohabitent, sélectionnées par `yahoo.provider` (`yahoo` par défaut, `mock` en local via `application-local.yml`). Le `MockMarketChartClient` génère une série OHLC déterministe par symbole (seed = hash). Yahoo rate-limite régulièrement les IPs résidentielles dev (429 prolongés) ; le mock permet d'itérer sur l'UI dossier et le pipeline LLM sans dépendre de Yahoo. Symboles réservés `UNKNOWN` (404) et `RATELIMIT` (503) pour exercer les chemins d'erreur.

**Claude API par défaut** — la Phase 0 a montré que Mistral 7B sortait des justifications grammaticalement correctes mais financièrement creuses ("vendre pour un profit de 0.4%"). Le saut de qualité Claude est largement supérieur au coût (~quelques cents par dossier). Mistral reste activable pour le dev offline (`llm.provider: ollama`).

**Snapshot du narratif systématique** — chaque consultation d'un ticker persiste `{prix_du_jour, indicateurs, narrative}`. Sans ça, l'observabilité Phase 3 (relire ce que disait l'IA il y a 1 mois) est aveugle.

**Cache snapshot 30 min + dedup job 5 min** — un re-clic sur un dossier ticker ne doit ni rappeler le LLM (cher en Claude, lent en Ollama) ni créer de jobs concurrents. Le service réutilise le snapshot existant si âge < 30 min, sinon réutilise le job pending si âge < 5 min, sinon kick un nouveau job. Front toujours uniforme : POST puis poll.

**`LlmClient.modelId()` tracé sur chaque snapshot** — le snapshot stocke `ollama:mistral` ou `claude:claude-opus-4-6` au moment de la génération. Indispensable Phase 3 pour comparer la qualité narrative entre versions de modèle ou entre providers, et pour filtrer après coup les snapshots produits par un modèle plus faible sans relire le contenu.

### Conservé depuis Phase 0

**`@Async` sur bean séparé** — Spring AOP ne proxifie pas les appels internes (`this.method()`). Le pattern `Service → Runner (@Async) → Executor (@Transactional)` reste valide et est repris pour `TickerNarrativeService → TickerNarrativeRunner`.

**LLM call hors transaction** — l'appel LLM (1-15 s en Claude, plus long en Ollama) ne doit pas tenir de connexion Hikari. Le pipeline est éclaté pour respecter ça.

**Validation de schéma** — `ddl-auto: validate`. Hibernate valide le schéma au démarrage. Toute modification d'entité = migration Flyway.

**Tests d'intégration sur vrai PostgreSQL** — pas de mocks BDD, pas de H2. Le CI démarre un service PostgreSQL.

**Portefeuille CSV-driven, pas de CRUD manuel** — le portefeuille reflète la réalité du courtier. L'import CSV Wealthsimple reste la seule source de vérité des positions.

**Snapshot avec `batch_id`** — un import CSV peut couvrir plusieurs comptes. Le `batch_id` UUID commun regroupe tous les snapshots d'un même import pour l'affichage en timeline.

### Frontend

**Ports & adapters léger** — `core/<name>.repository.ts` (port = abstract class) + `core/adapters/<name>.http.ts` (adapter HTTP). Composants injectent l'abstraction. Tests : on mock le port, l'adapter a son propre spec HTTP.

**Tokens de thème** — variables CSS sur `:root`, override sur `[data-theme='light']`. Material 3 wired en dual-theme. Default = sombre. Toggle dans le header, persistance localStorage, anti-FOUC via script inline dans `index.html`.

### Gelé Phase 0 (référence)

Les décisions ci-dessous concernent du code **gelé** mais conservé. À relire si on réactive le pipeline portefeuille en Phase 4.

**Validation + auto-repair des réponses LLM (legacy)** — `RecommendationValidator` applique 8 règles strictes ; en cas d'invalide, re-prompt avec les erreurs. Au pire, `withHoldFallback` strip les hallucinations.

**Filtrage des articles par pertinence (legacy)** — `ArticleRelevanceScorer` classe les 200 derniers articles par score keyword (tickers, noms d'actifs, secteurs, mots-clés macro). Top 25 passé au LLM.

**Robustesse du parsing RSS (legacy)** — pré-traitement Rome (User-Agent, détection HTML, correction `&` nus, `isAllowDoctypes = true`).

**Fenêtres de timeout alignées (legacy, 400 s)** — invariant : `POLL_ABORT_SECONDS` (frontend) ≥ `DEDUP_WINDOW_SECONDS` (backend) ≥ 2 × `OllamaClient.readTimeout` + marge. Probablement à revoir en Phase 1 — Claude est nettement plus rapide, on pourra resserrer.
