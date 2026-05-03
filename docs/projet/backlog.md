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

## Phase 1 — Pivot ticker (terminé, tag `v0.2.0` du 2026-05-02)

### Backend — module `market/` (nouveau)

| Feature | Description | Priorité |
|---------|-------------|----------|
| ✅ `MarketChartClient` (port) + `MockMarketChartClient` | Fetch par ticker : quote, OHLC 1y, 52w high/low. Mock déterministe par symbole pour itérer sans clé / réseau. Cache Caffeine 15 min, 503 propre sur erreurs upstream. Sélection via `market.provider`. Initialement implémenté avec `YahooClient` (cookie+crumb) — supprimé en cleanup post-Phase-1 (Yahoo bannit les IPs résidentielles, validation live impossible). Code Yahoo consultable dans l'historique git (commit `b993440`) | 🔴 Critique |
| ✅ `IndicatorCalculator` | Kotlin pur, sans Spring : RSI(14), MA50, MA200, momentum 30j/90j, perf 1m/3m/1y, drawdown 52w, volume relatif, distance vs MA. 20+ tests unitaires | 🔴 Critique |
| ✅ Endpoint REST `market/` | `GET /api/market/ticker/{symbol}` retourne quote + indicateurs + bars OHLC (pour le graphe inline). Pas de `/history` séparé — un seul payload sert le dossier | 🔴 Critique |
| ✅ Migration Flyway V2 | Tables `ticker_narrative_snapshot` (output LLM + indicateurs JSONB + provenance modèle) et `ticker_narrative_job` (état async) | 🔴 Critique |

### Backend — pipeline narratif

| Feature | Description | Priorité |
|---------|-------------|----------|
| ✅ Nouveau prompt par ticker | System prompt strict + user message construit depuis indicateurs (skip silently les nuls). Output `{summary, sentiment: BULLISH\|NEUTRAL\|BEARISH, keyPoints: string[3..5]}`. Pas de targetWeight, pas de BUY/SELL | 🔴 Critique |
| ✅ `TickerNarrativeService` + `Runner` + `Executor` | `@Async` sur bean séparé. Service → Runner async → Executor (parse + validate + 1 retry) → Persister. Cache snapshot 30 min, dedup job 5 min | 🔴 Critique |
| ✅ `TickerNarrativeParser` + `TickerNarrativeValidator` | Parse JSON tolérant aux fences markdown / prose alentour / sentiment mixed-case. Valide 3-5 keyPoints, ≤15 mots/bullet, summary 2-3 phrases | 🔴 Critique |
| ✅ Bascule Claude par défaut | `llm.provider: claude` dans `application.yml`. Mistral activable via `application-local.yml` pour offline. `LlmClient.modelId()` tracé sur chaque snapshot pour comparer plus tard | 🔴 Critique |
| ✅ Endpoint REST `narrative/` | `POST /api/market/ticker/{symbol}/narrative` (kick async), `GET .../jobs/{id}` (poll), `GET .../latest` (snapshot le plus récent) | 🔴 Critique |

### Frontend — page Dossier ticker

| Feature | Description | Priorité |
|---------|-------------|----------|
| ✅ Route `features/ticker/:symbol` | Page dossier ticker. En-tête : symbole, nom, prix, plage 52w, sentiment via badge ajouté avec le narratif | 🔴 Critique |
| ✅ Graphique des prix | SVG inline (pas de dep ajoutée), 1y daily. Pas de toggle ni d'overlay MA pour l'instant — suffisant pour le MVP | 🔴 Critique |
| ✅ Indicateurs en chips | 10 chips avec color-coding (RSI > 70 warning, drawdown profond rouge, etc.) | 🔴 Critique |
| ✅ Narratif LLM | Section dédiée : sentiment chip (BULLISH/NEUTRAL/BEARISH coloré), summary, bullets keyPoints, footer modèle+date. Bouton Générer/Régénérer avec spinner, polling 3 s, abort 300 s. Cache hit DONE direct (snapshot < 30 min) sans polling. 7 tests (init avec snapshot, init vierge, cache hit, kick fresh, error, poll abort, sentiment class) | 🔴 Critique |
| ✅ Lien Dashboard → Dossier ticker | Ticker cliquable dans la table du dashboard → `/ticker/:symbol` | 🟡 Moyenne |
| ✅ Liste des tickers détenus | Section "Tickers détenus" dans la sidebar du dashboard sous la liste des portefeuilles. Endpoint dédié `GET /api/portfolios/owned-tickers` avec agrégation JPQL (distinct ticker + portfolioCount) — pas de N+1. Chips cliquables → `/ticker/:symbol`. Best-effort : échec backend → liste vide sans banner | 🟡 Moyenne |

### Settings — adaptation Phase 1

| Feature | Description | Priorité |
|---------|-------------|----------|
| ✅ Test source ticker | Section "Tester un ticker" ajoutée à `/settings/test-sources` (séparée par border-top du test RSS). Input ticker libre + suggestions cliquables depuis owned tickers. Réutilise `MarketRepository.getTicker(symbol)` donc respecte le `market.provider` configuré. Result block : prix, bars OHLC, RSI(14), MA200, drawdown 52w. Erreurs 404 / 503 surfacées via i18n | 🟢 Basse |
| ✅ Aperçu du prompt par ticker | `/settings/prompt-preview` adaptée Phase 1 narratif. Input ticker libre + suggestions cliquables depuis les owned tickers. Endpoint back `GET /api/market/ticker/{symbol}/narrative/preview` réutilise `NARRATIVE_SYSTEM_PROMPT` + `buildNarrativeUserMessage` sans appel LLM. 2 tests slice MVC + 1 test adapter HTTP | 🟢 Basse |

### Tests prioritaires Phase 1

| Sujet | Description | Priorité |
|-------|-------------|----------|
| ✅ `IndicatorCalculatorTest` | 20+ tests unitaires Kotlin purs : RSI sur série monotone, MA sur fenêtre, drawdown, volumes, edge cases (1 bar, séries trop courtes) | 🔴 Critique |
| ✅ `MockMarketChartClientTest` | Mock provider validé : forme, déterminisme, divergence inter-symbole, 52w cohérent avec la série, paths réservés `UNKNOWN`/`RATELIMIT` (6 tests) | 🟡 Moyenne |
| ✅ `TickerNarrativeParserTest` + `TickerNarrativeValidatorTest` + `TickerNarrativePromptTest` | 17 tests : JSON valide / fences / prose / sentiment mixed-case / unknown sentiment, validation 3-5 keyPoints + longueur, prompt skip silently nulls | 🟡 Moyenne |
| ✅ `TickerNarrativeServiceTest` | 8 tests Mockito-Kotlin sur la décision tree : pending dedup → reuse / fresh snapshot ≤ 30 min → cache hit avec job DONE synchrone / stale ou absent → kick runner. Plus normalisation casse symbole et délégation `latestSnapshot`. Le test borderline 30 min est volontairement à 29 min — le cas exact dépend d'un Clock injectable | 🟡 Moyenne |
| ✅ `TwelveDataClientTest` + `TwelveDataMappersTest` (HTTP) | 14 tests avec `okhttp3.mockwebserver:4.12.0` : happy path `/time_series` + `/quote` mergés, request URL avec apikey/outputsize/order=ASC, fallback bar-derived 52w, mappings d'erreur (200 avec status=error code=404/429/401, HTTP 429/500), blank API key détecté avant l'appel. Mappers : halted bars (empty strings), DESC→ASC re-sort, intraday datetime, parseTimestamp edge cases | 🟢 Basse |

---

## Phase 2 — Profondeur ticker

### ✅ Prérequis — provider de marché alternatif

| Feature | Notes | Priorité |
|---------|-------|----------|
| ✅ `TwelveDataClient` (nouveau provider primaire) | Yahoo rate-limitait agressivement les IPs résidentielles (ban observé sur résidentiel + VPN + cellulaire) — validation live impossible. Twelve Data prend le relais : REST documenté, free tier 800 credits/jour, TSX natif (XTSE), JSON simple. Deux endpoints (`/time_series` + `/quote`), parser tolérant aux quirks (numériques en strings, erreurs en HTTP 200 avec `status: error`). Refactor du port `MarketChartClient` au passage : retour en types domaine (`MarketChart` = `TickerQuote` + `List<OhlcBar>`). Clé de config `market.provider` (`mock` \| `twelvedata`). Défaut `application.yml` = `mock` (pas de clé requise pour l'onboarding et la CI), `application-local.yml` bascule sur `twelvedata` avec clé via `TWELVEDATA_API_KEY`. Code Yahoo supprimé en suivant (jamais opérationnel pour le user) — historique git si besoin | 🔴 Critique |

### ⏳ Settings & config runtime

| Feature | Description | Priorité |
|---------|-------------|----------|
| ⏳ Section Configuration dans `/settings` | Nouvelle page back-office pour éditer en runtime ce qui vit aujourd'hui en dur dans `application-local.yml` (et donc nécessite redémarrage backend). Items v1 : clé API Twelve Data (input password mask + bouton "tester"), TTL du cache Caffeine `market-chart` (défaut 15 min, slider 5–60 min). Items v2+ : modèle Claude actif, langue par défaut, autres clés à venir. Persistance dans une nouvelle table `app_config` (key/value/updated_at), chargée au boot dans un `AppConfigService` (signal-style côté back). Gotcha implémentation : les champs `@Value`-injectés sur `TwelveDataClient` et le builder Caffeine de `MarketConfig` sont figés à la construction du bean — il faudra basculer sur lecture via `AppConfigService.get(...)` à chaque appel pour la clé API, et exposer une méthode `cacheManager.rebuild()` pour appliquer un nouveau TTL sans reboot. UI Material : liste de clés avec édition inline, validation, "Réinitialiser au défaut", indicateur de valeur effective vs défaut. Note sécu : clé API stockée en clair en BDD locale — acceptable pour projet perso, à chiffrer si on déploie un jour | 🟡 Moyenne |

### ⏳ À faire

| Feature | Description |
|---------|-------------|
| ⏳ Multi-timeframe | Intraday (1d, 5d granulaire) + long terme (5y, 10y) — toggle sur le graphe |
| ⏳ News par ticker | Headlines par ticker — remplace le RSS macro pour le contexte |
| ⏳ Comparaison vs benchmark | SPY, QQQ ou ETF sectoriel (déduit de l'asset type) overlay sur le graphe |
| ⏳ Recommandations analystes | Consensus, target prices si disponibles |
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
| ⏳ Documenter les choix techniques par fiche | Créer `docs/technique/stack/` (ou `decisions/`) avec une fiche par technologie / choix structurant : pourquoi on l'a retenue, alternatives écartées, comment la brancher / configurer, pièges connus. Format léger (style ADR mais avec une section "configuration" en plus). `architecture.md` garde l'overview modules + schéma global et linke vers chaque fiche. **Candidats v1** : Caffeine (TTL, cache key, rebuild dynamique), Twelve Data (quirks API, mapping erreurs, quotas), `JdkClientHttpRequestFactory` (vs `SimpleClientHttpRequestFactory`, cookies, headers strippés), zoneless Angular (signaux + change detection), `ngx-translate` (vs Angular i18n, choix runtime), Spotless ktfmt, MockWebServer, mockito-kotlin, Flyway (`repair-on-migrate` en dev), Tilt + Docker Compose (Tiltfile). Bénéfice : éviter qu'`architecture.md` enfle à chaque ajout, et capturer le *pourquoi* + le *comment opérer* au même endroit | 🟢 Basse |
| ✅ Provider de marché alternatif (Twelve Data) | Implémenté en prérequis Phase 2 — voir section dédiée plus haut. `TwelveDataClient` actif via `market.provider: twelvedata`, clé via `TWELVEDATA_API_KEY` | 🔴 Critique |
| ⏳ Doublon `recommendations/` vs `history/` | Avec la Phase 1, ces pages deviennent legacy. Décision : garder en l'état pour le legacy, ou simplifier en une seule page à terme | 🟢 Basse |
| ⏳ Tests sur le module `analysis/` (legacy) | Aucun test sur le legacy. Si on rallume Phase 4, on en aura besoin. Pas urgent tant que le code dort | 🟢 Basse |
| ✅ Refacto "tests as documentation" sur les tests existants | Pass d'audit appliqué : docstrings de classe + commentaires motivationnels sur `IndicatorCalculatorTest`, `MockMarketChartClientTest`, `CsvImportServiceTest`, `PortfolioControllerTest` côté back, et `ticker.spec`, `dashboard.spec`, `suivi.spec`, `csv-import.spec`, `analysis.http.spec` + 4 HTTP adapter specs côté front. Stub-only specs (`should create` seul) laissés tels quels. Les tests narratif Phase 1 ont servi de modèle | 🟢 Basse |
| ⏳ `document.documentElement` SSR-safe dans `ThemeService` | Wrap avec `isPlatformBrowser` si on bascule un jour SSR | 🟢 Basse |
| ⏳ FOUC du toggle thème — résolu | Script inline dans `index.html` lit `localStorage` avant le bootstrap Angular et pose `data-theme`. Voir `developpement.md` | ✅ Fait |
