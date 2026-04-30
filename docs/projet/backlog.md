# Backlog — PortfolioAI

Suivi des features par phase. Mis à jour à chaque session de développement.

**Statuts :** ✅ Fait · ⏳ À faire · 🚧 En cours

---

## Phase 1 — MVP

### Terminé

| Feature | Notes |
|---------|-------|
| Navigation (header) | `mat-toolbar` Material sticky, liens avec icônes, état actif |
| CI GitHub Actions | `backend.yml` (Gradle + PostgreSQL service), `frontend.yml` (Vitest) — déclenchés sur changements de chemin |
| Ingestion RSS | Module `ingestion/` — Rome, scheduler 15 min prod / 5 min local, déduplication par `guid`. `GET /api/ingestion/articles`, `POST /api/ingestion/fetch` |
| Appel LLM (Claude / Ollama) | `LlmClient` interface, `ClaudeClient` (prod), `OllamaClient` (local). `llm.provider: claude\|ollama` |
| Analyse IA async | `AnalysisService` → `AnalysisRunner` (`@Async` bean séparé). `AnalysisJobStore` (ConcurrentHashMap). API : POST → 202, polling job, GET recommendation |
| Affichage recommandations (dashboard) | Polling RxJS, spinner + timer, confidence badge, actions colorées. Montants : poids actuel %, valeur, cible, delta |
| Robustesse analyse IA | Timeout 120s, `format:json` + `num_predict` Ollama, system+user fusionnés, SYSTEM_PROMPT reécrit, `@JsonIgnoreProperties`, extracteur JSON robuste |
| Affichage recommandations (page Recommandations IA) | `GET /api/recommendations` global. Filtres portfolio + statut, cartes expandables |
| Persistance Settings | Migration V3 (slug, description, free, requires_api_key), 22 sources en base. `PATCH /api/ingestion/sources/{id}`. Frontend API-driven, update optimiste |
| Import CSV Wealthsimple | Parse export « Positions » WS (21 colonnes, accents NFD, délimiteur auto). Crée/met à jour un `Portfolio` par `Nom du compte`. Upsert assets. `POST /api/portfolios/import/csv` |
| Portefeuille read-only | Suppression du CRUD manuel (create/delete portfolio, add/remove asset). La vue reflète l'état réel du courtier. Seul le CSV peut mettre à jour. |
| Snapshots historiques | À chaque import CSV, création d'un `PortfolioSnapshot` + `SnapshotPosition` par compte (valeur comptable CAD, valeur marché, P&L). Migration V4. `GET /api/snapshots` |
| Devise et valeur de marché par actif | Migrations V5 (`currency`, `book_value_cad`) et V6 (`market_value`, `unrealized_gain`, `gain_currency`). Affichage P&L par position dans le Dashboard |
| Persistance des jobs d'analyse | Migration V7 (`analysis_job`). `AnalysisExecutor` séparé de `AnalysisRunner`. Déduplication des jobs concurrents (fenêtre alignée avec l'abort frontend, voir `DEDUP_WINDOW_SECONDS`). Timeouts explicites sur le client Claude. Frontend : polling 5 s, abort géré côté `AnalysisService` (`POLL_ABORT_SECONDS` = 180 s, élargi pour absorber la latence d'Ollama qwen2:1.5b sur prompt enrichi). |
| Prompt LLM basé sur la valeur de marché | `AnalysisExecutor.buildUserMessage` raisonne sur `market_value` (approx CAD via FX au moment de l'achat = `book_value_cad / cost_native`), affiche par position : valeur marché native + CAD, poids %, P&L non réalisé %. Total : book CAD, market CAD, P&L global. Bonus : description d'article (140 car) en plus du titre. SYSTEM_PROMPT précise que `targetWeight` somme à ~100. Plus de cost basis. |
| Filtrage des articles par pertinence | Nouveau `ArticleRelevanceScorer`. Fetch des 200 derniers articles, scoring par tickers du portefeuille (poids 10, word-boundary), mots significatifs des noms (5), mots-clés sectoriels par `AssetType` (2), mots-clés macro fixes (1). Top 25 passé au LLM, fallback recency si < 5 articles pertinents. |
| LLM hors transaction DB | Pipeline d'analyse éclaté : `AnalysisContextLoader` (`@Transactional readOnly`, lit + bâtit le prompt, renvoie un `AnalysisContext` détaché) → `AnalysisExecutor` (orchestration sans transaction, appelle le LLM) → `RecommendationPersister` (`@Transactional`, persiste). La connexion Hikari n'est plus tenue pendant 1-2 min d'appel LLM. Trois beans distincts pour respecter le proxy AOP Spring. |
| Bump timeouts à 300 s | `POLL_ABORT_SECONDS` (frontend), `DEDUP_WINDOW_SECONDS` (backend) à 300 s, pour absorber Mistral 7B + retry du validateur (2 × ~1 min 30). `OllamaClient.readTimeout` reste à 180 s par appel HTTP. Invariant : fenêtre serveur ≥ abort frontend ≥ 2 × read timeout. |
| Bascule LLM local qwen2:1.5b → Mistral 7B | qwen2:1.5b hallucinait sur le prompt enrichi (tickers absents, poids ne sommant pas à 100, action `SOLD OUT` inventée). Bascule sur `mistral` (7B Instruct Q4) — latence ~1-2 min sur M1 absorbée par les timeouts à 180 s. Tiltfile `llm:pull-mistral`, défaut documenté dans `developpement.md`. |
| Validation serveur du JSON LLM + auto-repair | Pipeline éclaté en `LlmResponseParser` (parse + extractJson) → `RecommendationValidator` (8 règles : tickers ⊆ portefeuille, pas de duplicate, pas d'extra, action ∈ enum, confidence 0-100, targetWeight 0-100 par item, Σ targetWeight ∈ [95,105], SELL ⇒ targetWeight ≤ 5) → `RecommendationPersister`. Si invalide, `AnalysisExecutor` re-prompte une fois en injectant les erreurs dans le user message. Au pire (2 attempts ratées), `withHoldFallback` strip les tickers hallucinés et ajoute des HOLD pour les manquants. SYSTEM_PROMPT mentionne explicitement le validateur, et les exemples de tickers sont des placeholders (`<one of the portfolio tickers>`) — Mistral recopiait `AAPL`/`NVDA` des exemples sinon. Évite de stocker du bruit comme `Σ = 175 %`, des tickers hallucinés, ou des actions absentes. |
| Page Import (onglet dédié) | Drag & drop CSV standalone sur `/import`. Redirige vers `/suivi` après import. |
| Page Suivi (historique positions) | `/suivi` — timeline groupée par batch d'import, expand par compte, détail positions avec valeur marché et P&L. |

### À faire

| Feature | Description |
|---------|-------------|
| ⏳ Notifications progression analyse | Suivi pas-à-pas en temps réel : "Récupération articles…", "Appel LLM…", "Parsing…". Via SSE ou champ `steps` sur le job, affiché comme fil dans l'UI |
| ⏳ Analyse non-bloquante (navigation) | L'analyse en cours doit survivre à la navigation. `AnalysisStateService` Angular global — le polling vit hors du composant `dashboard` |
| ⏳ Test manuel des sources (Settings) | Bouton "Tester" à côté de chaque source dans `/settings`. Appelle un nouvel endpoint `POST /api/ingestion/sources/{id}/test` qui fait un fetch immédiat (RSS ou autre selon la catégorie) et renvoie `{ok, articles, error}`. Permet à l'utilisateur de valider qu'une source répond avant de l'activer pour de bon. Pré-requis : ajouter les champs `last_fetched_at`, `last_success_at`, `last_error`, `last_article_count` sur `feed_source` (migration V8) pour que la page Settings affiche aussi la santé en continu — sinon le bouton "Tester" donne une info ponctuelle qui n'est pas reflétée par le scheduler. |
| ⏳ Fetchers MARKET / MACRO / CRYPTO | Aujourd'hui le scheduler filtre `category == RSS` — les 16 sources non-RSS de la migration V3 sont visibles dans `/settings` mais ne sont jamais fetchées. Soit cacher ces catégories dans l'UI tant qu'aucun fetcher n'existe, soit implémenter les clients (Yahoo Finance, FRED, BCE, CoinGecko…). Lié au test manuel ci-dessus : sans fetchers, le bouton "Tester" sur ces sources doit dire "non implémenté". |

### Qualité du contexte d'analyse (bloquant Phase 2)

Les items 🔴 (valeur de marché + filtrage articles + validation serveur du JSON) sont faits. Restent les consolidations 🟡 (thèse, snapshot du prompt) avant Phase 2.

| Feature | Description | Priorité |
|---------|-------------|----------|
| ⏳ Champ "thèse / objectif" sur le Portfolio | Texte libre optionnel sur `Portfolio` (horizon, tolérance au risque, contraintes). Injecté dans le prompt. Aujourd'hui chaque reco est context-free du *pourquoi* l'utilisateur tient ces positions. | 🟡 Moyenne |
| ⏳ Snapshot du prompt envoyé | Nouveau champ `prompt_snapshot` (text) sur `Recommendation`. Sinon Phase 2 ne pourra pas corréler qualité de reco ↔ qualité du contexte ; l'analyse post-mortem sera aveugle. | 🟡 Moyenne |
| ⏳ Simplifier l'enum d'action | `REDUCE` chevauche `SELL + targetWeight < currentWeight`. Garder uniquement `BUY / SELL / HOLD` + delta de poids. Migration + adaptation prompt + UI. | 🟢 Basse |
| ⏳ Score de confiance dérivé | Remplacer la `confidence` auto-déclarée du LLM (mal calibrée) par un score serveur : nombre d'articles pertinents, fraîcheur, diversité des sources, présence d'une thèse. La self-rating reste loggée pour comparaison. | 🟢 Basse — après Phase 2 |
| ⏳ Continuité entre analyses | Injecter dans le prompt la dernière reco générée pour ce portefeuille + delta de prix marché depuis. Détecte les LLM qui changent d'avis sans nouvelle info. | 🟢 Basse |

---

## Dette technique

Sujets identifiés en cours de session. Pas bloquants pour Phase 2 stricto sensu, mais valent un passage avant qu'ils ne s'accumulent.

| Sujet | Description | Priorité |
|-------|-------------|----------|
| ⏳ Tests sur le module `analysis/` | Aucun test sur le cœur métier. Avec le nouveau découpage en 6 beans (Loader / Parser / Validator / Executor / Persister / JobStore) c'est très simple à tester unitairement. Manquent `ArticleRelevanceScorerTest` (rank, word-boundary, fallback recency), `AnalysisContextLoaderTest` (contenu du prompt, FX edge cases), `LlmResponseParserTest` (extractJson, markdown fences), `RecommendationValidatorTest` (les 8 règles + cas limites), `AnalysisExecutorTest` (boucle de retry, HOLD fallback final), `AnalysisServiceTest` (dedup), `AnalysisJobStoreTest` (`@DataJpaTest` sur la query temporelle). | 🟡 Moyenne |

---

## Phase 2 — Traçabilité

> Les 🔴 bloquants sont faits (valeur de marché + filtrage articles + validation serveur du JSON). Les 🟡 restants ne sont pas strictement bloquants, mais le `prompt_snapshot` est très utile pour rendre les mesures de Phase 2 interprétables a posteriori.

| Feature | Description |
|---------|-------------|
| ⏳ Graphe d'évolution portefeuille | Courbe de valeur comptable (CAD) dans le temps depuis les snapshots. Par compte ou global. |
| ⏳ Prix réels post-recommandation | Récupérer les cours des actifs N jours après chaque recommandation (Yahoo Finance / Stooq) |
| ⏳ Score de pertinence | Comparer la direction recommandée vs mouvement réel. Calculer un score par recommandation |
| ⏳ Statut recommendation | Passer `status` de PENDING à APPLIED / IGNORED depuis l'UI |
| ⏳ Dashboard observabilité | Page dédiée : score moyen, taux de réussite par type d'actif, historique de performance |

---

## Phase 3 — Optimisation prompts

| Feature | Description |
|---------|-------------|
| ⏳ Scoring automatisé | Calcul automatique du score une fois les prix disponibles |
| ⏳ Analyse des biais | Détecter les patterns d'erreur récurrents (ex : toujours BUY sur tech) |
| ⏳ Ajustement prompts | Modifier le SYSTEM_PROMPT en fonction des patterns identifiés, versionner les prompts |
| ⏳ Rapport de performance | Vue synthétique hebdomadaire / mensuelle |

---

## Phase 4 — Vision long terme

| Feature | Description |
|---------|-------------|
| ⏳ Fine-tuning | Entraîner un modèle sur les données historiques personnelles |
| ⏳ Paper trading | Intégration courtiers, simulation d'exécution automatique |
| ⏳ Multi-portefeuilles avancé | Profils de risque différents, allocation automatique entre portefeuilles |
