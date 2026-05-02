# Backlog — PortfolioAI

Suivi des features par phase. Mis à jour à chaque session de développement.

**Statuts :** ✅ Fait · ⏳ À faire · 🚧 En cours · 🧊 Gelé

---

## Phase 0 — Fondation (terminé)

### ✅ Conservé et utilisé

| Feature | Notes |
|---------|-------|
| Navigation (header + sidenav settings) | `mat-toolbar` Material sticky, sidenav latérale dans `/settings`, theme toggle (sun/moon) |
| Theme dark/light | Tokens CSS sur `:root` + `[data-theme='light']`, Material dual-theme, default dark, toggle persistance localStorage, script anti-FOUC dans `index.html` |
| Frontend ports & adapters | `core/<name>.repository.ts` (port abstract class) + `core/adapters/<name>.http.ts` (adapter HTTP). 4 repositories : Portfolio, Analysis, Settings, Snapshot |
| Frontend `features/` | Toutes les pages UI sous `features/` (dashboard, history, import, recommendations, settings, suivi). Routes dans `app.routes.ts` |
| Import CSV Wealthsimple | Parse 21 colonnes FR (NFD, BOM, délimiteur auto), upsert par compte, multi-fichiers (drag & drop) avec extraction de date depuis le nom |
| Portefeuille read-only | Lecture seule depuis l'UI ; CSV = seule source de vérité |
| Snapshots historiques | `PortfolioSnapshot` + `SnapshotPosition` par compte, regroupés via `batch_id`. Page Suivi : timeline + expand par compte |
| Settings back-office | Sidenav `/settings` : sources (activer/désactiver), test-sources (RSS), prompt-preview (aperçu du prompt sans appel LLM) |
| Devise & valeur de marché par actif | Migrations V5/V6 (`currency`, `book_value_cad`, `market_value`, `unrealized_gain`, `gain_currency`). Affichage P&L par position |
| Persistance des jobs d'analyse | Table `analysis_job` (V7), dédup des jobs concurrents (`DEDUP_WINDOW_SECONDS`). Reste utile pour le polling Phase 1 |
| Infra Tilt + CI | Tilt + Docker Compose (postgres, ollama, backend, frontend). GitHub Actions backend (Gradle + postgres) / frontend (Vitest) / docs |
| `@Async` sur bean séparé | Pattern `Service → Runner (@Async) → Executor (@Transactional)` — réutilisé en Phase 1 |
| Adapter specs HTTP | 4 specs `core/adapters/*.http.spec.ts` (portfolio, analysis, settings, snapshot) |

### 🧊 Gelé — code conservé, plus dans le flow

| Feature | Notes |
|---------|-------|
| 🧊 Ingestion RSS | Module `ingestion/` complet (Rome, scheduler 15 min, déduplication par `guid`, parsing robuste DOCTYPE / `&` nus, 25 sources seedées). Conservé en place pour réutilisation potentielle Phase 4 |
| 🧊 Pipeline analyse portfolio LLM | `AnalysisExecutor`, `AnalysisContextLoader`, `ArticleRelevanceScorer` (top 25 par pertinence), `LlmResponseParser`, `RecommendationValidator` (8 règles), `RecommendationPersister`. Le code reste fonctionnel mais retiré du Dashboard |
| 🧊 Pages Recommendations / History | `features/recommendations/` et `features/history/` listent les recommandations Phase 0. Pas supprimées mais sans nouvelle reco générée en Phase 1 |
| 🧊 Bascule Mistral local + timeouts 400 s | `OllamaClient` configuré pour `mistral` (7B Instruct Q4), timeouts alignés sur 400 s. Reste activable via `llm.provider: ollama` mais Claude devient le défaut Phase 1 |

---

## Phase 1 — Pivot ticker (en cours)

### Backend — module `market/` (nouveau)

| Feature | Description | Priorité |
|---------|-------------|----------|
| ⏳ `YahooClient` | Fetch par ticker : quote courante, OHLC 1y, fundamentals basiques (P/E, market cap), 52w high/low, volume. API non officielle Yahoo, sans clé. Cache court 5-15 min selon endpoint | 🔴 Critique |
| ⏳ `IndicatorCalculator` | Kotlin pur, sans Spring : RSI(14), MA50, MA200, momentum 30j/90j, perf 1m/3m/1y/YTD, drawdown 52w, volume relatif, position vs MA. Tests unitaires en priorité (la valeur du module est dans la justesse des chiffres) | 🔴 Critique |
| ⏳ Endpoints REST `market/` | `GET /api/market/ticker/{symbol}` (données + indicateurs), `GET /api/market/ticker/{symbol}/history` (OHLC pour le graphe) | 🔴 Critique |
| ⏳ Migration Flyway V2 | Table `ticker_narrative_snapshot` (id, ticker, snapshot_at, price, indicators_json, narrative, sentiment, prompt_version) | 🔴 Critique |

### Backend — pipeline narratif

| Feature | Description | Priorité |
|---------|-------------|----------|
| ⏳ Nouveau prompt par ticker | Court, structuré : input `{ticker, price, indicators, fundamentals, recentChange}`, output JSON `{summary, sentiment, keyPoints[]}`. Pas de targetWeight, pas de BUY/SELL | 🔴 Critique |
| ⏳ `TickerNarrativeService` + `Runner` | Pattern `@Async` sur bean séparé. Service HTTP → Runner async → Executor (sans transaction) → persistance du snapshot | 🔴 Critique |
| ⏳ `LlmNarrativeParser` | Parse `{summary, sentiment, keyPoints[]}`, tolérant aux fences markdown. Validation simple (sentiment ∈ enum, summary non vide) | 🔴 Critique |
| ⏳ Bascule Claude par défaut | `llm.provider: claude` dans `application.yml` (le défaut). Mistral disponible via `application-local.yml` pour offline | 🔴 Critique |
| ⏳ Endpoint REST `narrative/` | `POST /api/market/ticker/{symbol}/narrative` (lance le narratif, async), `GET /api/market/ticker/{symbol}/narrative/jobs/{id}` (polling) | 🔴 Critique |

### Frontend — page Dossier ticker

| Feature | Description | Priorité |
|---------|-------------|----------|
| ⏳ Route `features/ticker/:symbol` | Page dossier ticker. En-tête : symbole, nom, prix, variation jour, sentiment badge | 🔴 Critique |
| ⏳ Graphique des prix | Chart.js ou recharts. Toggle 1m / 3m / 1y. Overlay MA50, MA200. Pas de bibliothèque lourde — un wrapper léger Angular suffit | 🔴 Critique |
| ⏳ Indicateurs en chips | RSI, drawdown 52w, perf 1y, distance à la MA50 — chips colorés selon zones (RSI > 70 = warning, etc.) | 🔴 Critique |
| ⏳ Narratif LLM | Summary + bullets keyPoints. Spinner pendant la génération (polling du job) | 🔴 Critique |
| ⏳ Lien Dashboard → Dossier ticker | Sur chaque position du dashboard, clic → `/ticker/:symbol` | 🟡 Moyenne |
| ⏳ Liste des tickers détenus | Sur le dashboard, exposer la liste cliquable des tickers du portefeuille (raccourci d'accès aux dossiers) | 🟡 Moyenne |

### Settings — adaptation Phase 1

| Feature | Description | Priorité |
|---------|-------------|----------|
| ⏳ Test source ticker (Yahoo) | Étendre `/settings/test-sources` pour tester un fetch Yahoo par ticker (vérifier que l'API répond, que les indicateurs se calculent) | 🟢 Basse |
| ⏳ Aperçu du prompt par ticker | Adapter `/settings/prompt-preview` au nouveau prompt (entrée : un ticker au lieu d'un portefeuille) | 🟢 Basse |

### Tests prioritaires Phase 1

| Sujet | Description | Priorité |
|-------|-------------|----------|
| ⏳ `IndicatorCalculatorTest` | Tests unit Kotlin purs sur cas connus : RSI sur série de prix monotone (RSI = 100 ou 0), MA sur fenêtre fixe, drawdown depuis high. La valeur du module est dans la justesse, sans test on n'a aucune confiance | 🔴 Critique |
| ⏳ `YahooClientTest` | Mock HTTP de Yahoo (réponses figées en fixture), test du parsing de la quote et de l'historique | 🟡 Moyenne |
| ⏳ `LlmNarrativeParserTest` | Cas : JSON valide, JSON dans markdown fences, JSON malformé, sentiment hors enum | 🟡 Moyenne |
| ⏳ `TickerNarrativeServiceTest` | Test du pipeline complet avec Yahoo et LLM mockés | 🟡 Moyenne |

---

## Phase 2 — Profondeur ticker

| Feature | Description |
|---------|-------------|
| ⏳ Multi-timeframe | Intraday (1d, 5d granulaire) + long terme (5y, 10y) — toggle sur le graphe |
| ⏳ News Yahoo par ticker | Headlines Yahoo Finance par ticker — remplace le RSS macro pour le contexte |
| ⏳ Comparaison vs benchmark | SPY, QQQ ou ETF sectoriel (déduit de l'asset type) overlay sur le graphe |
| ⏳ Recommandations analystes | Consensus, target prices Yahoo si disponibles |
| ⏳ Earnings dates et derniers résultats | Encart fundamentals enrichi |
| ⏳ Watchlist persistée | Table `watchlist_ticker` — ajouter un ticker à surveiller sans qu'il soit en portefeuille |

---

## Phase 3 — Observabilité narrative

| Feature | Description |
|---------|-------------|
| ⏳ Page observabilité narrative | Sur les snapshots passés, afficher narratif vs ce qu'a fait le prix depuis (1j, 1 sem, 1 mois) |
| ⏳ Détection de biais | "Le LLM est bullish 80 % du temps", "ne mentionne jamais la volatilité", etc. |
| ⏳ Score de cohérence | À 2 jours d'écart, le narratif change-t-il de manière injustifiée ? |
| ⏳ A/B prompts | Versionner les prompts, comparer la qualité narrative entre versions |

---

## Phase 4 — Vision long terme

| Feature | Description |
|---------|-------------|
| ⏳ Croisement portfolio × insights ticker | Sur le Dashboard, afficher pour chaque position le sentiment + alerte si RSI extrême ou drawdown important |
| ⏳ Watchlist alertes | Seuils déclencheurs (RSI > 70, MA50 cassée, drawdown > 20 %) |
| ⏳ Réintégration Phase 0 (legacy) | Recommandations portefeuille reviennent, en agrégeant les insights ticker plutôt qu'en les recalculant |
| ⏳ Paper trading | Simulation d'exécution |
| ⏳ Multi-broker | Ne plus dépendre du seul CSV Wealthsimple |
| ⏳ Fine-tuning | Entraîner un modèle sur les snapshots narratifs personnels |

---

## Dette technique

Sujets identifiés en cours de session, pas bloquants pour la Phase 1 mais à traiter quand l'occasion se présente.

| Sujet | Description | Priorité |
|-------|-------------|----------|
| ⏳ Cleanup des jobs orphelins au démarrage | À chaque hot-reload Tilt (ou crash backend), un job `PENDING` reste `PENDING` à jamais en BDD. `ApplicationReadyEvent` listener qui passe tous les `PENDING` en `ERROR` au boot. ~15 min | 🟡 Moyenne |
| ⏳ Doublon `recommendations/` vs `history/` | Avec la Phase 1, ces pages deviennent legacy. Décision : garder en l'état pour le legacy, ou simplifier en une seule page à terme | 🟢 Basse |
| ⏳ Tests sur le module `analysis/` (legacy) | Aucun test sur le legacy. Si on rallume Phase 4, on en aura besoin. Pas urgent tant que le code dort | 🟢 Basse |
| ⏳ `document.documentElement` SSR-safe dans `ThemeService` | Wrap avec `isPlatformBrowser` si on bascule un jour SSR | 🟢 Basse |
| ⏳ FOUC du toggle thème — résolu | Script inline dans `index.html` lit `localStorage` avant le bootstrap Angular et pose `data-theme`. Voir `developpement.md` | ✅ Fait |
