# Architecture

## Stack

| Couche | Technologie | Pourquoi |
|--------|-------------|----------|
| Frontend | Angular 21 + Angular Material | Standalone components, signals, framework robuste pour dashboards |
| Backend | Kotlin + Spring Boot | Typage fort, null-safety, excellent écosystème JVM |
| Build | Gradle (Kotlin DSL) | Standard Kotlin/Spring, scripts typés |
| IA (prod) | Claude API — Anthropic | Compréhension du langage naturel financier, JSON structuré fiable |
| IA (local) | Ollama + qwen2:1.5b | Développement sans clé API, fonctionne sur M1 |
| Base de données | PostgreSQL | Schéma relationnel, historique des recommandations, Flyway pour les migrations |
| Infra locale | Tilt + Docker Compose | Hot reload backend/frontend, reset BDD en un clic |
| CI | GitHub Actions | Workflows backend (Gradle + PostgreSQL) et frontend (Vitest) |

## Vue d'ensemble

```
┌─────────────────────────────────────────┐
│            Sources de données            │
│  Presse RSS · APIs marché · Macro · Crypto │
└──────────────────┬──────────────────────┘
                   │ ingestion toutes les 15 min
                   ▼
┌─────────────────────────────────────────┐
│         Backend  (Kotlin + Spring)       │
│                                          │
│  ingestion/     → collecte RSS/APIs      │
│  analysis/      → orchestration LLM,     │
│                   recommandations, jobs  │
│  portfolio/     → import CSV, snapshots  │
│  shared/        → utilitaires transverses│
└──────────────────┬──────────────────────┘
                   │ REST API
                   ▼
┌──────────────────────────────────────────┐
│         Frontend  (Angular 21)           │
│                                          │
│  dashboard/        → positions + IA      │
│  import/           → drag & drop CSV     │
│  suivi/            → timeline snapshots  │
│  recommendations/  → liste filtrable     │
│  history/          → historique IA       │
│  settings/         → back-office sources  │
│    sources/        → activer/désactiver  │
│    test-sources/   → tester un flux      │
└──────────────────────────────────────────┘
```

## Modules backend

### `ingestion/`

Collecte les flux RSS via la librairie Rome. Chaque source est configurée en base (`feed_source`) avec son URL, sa catégorie et son état activé/désactivé. Les articles sont dédupliqués par `guid`. Scheduler : toutes les 15 min en prod, 5 min en local.

### `analysis/`

Orchestration des appels LLM, persistance des recommandations et suivi des jobs asynchrones. Découpage en 7 beans, chacun avec une responsabilité claire :

- `AnalysisService` — point d'entrée HTTP : valide le portefeuille, crée (ou réutilise) un job, déclenche l'exécution
- `AnalysisRunner` — bean `@Async` séparé (jamais `this.method()`, sinon le proxy AOP Spring est bypassé). Délègue à `AnalysisExecutor`
- `AnalysisExecutor` — orchestre une exécution unitaire **sans transaction** : `loader → llm → parser → validator → (retry si invalide) → persister`
- `AnalysisContextLoader` — `@Transactional(readOnly = true)` : lit le portefeuille, classe les articles via `ArticleRelevanceScorer`, construit le prompt, renvoie un `AnalysisContext` détaché (pas d'entité JPA managée)
- `LlmResponseParser` — parse le JSON brut du LLM (tolérant aux fences markdown / prose autour) en `ParsedLlmRecommendation`. Pas de validation
- `RecommendationValidator` — vérifie 8 règles : tickers ⊆ portefeuille, pas de duplicate / extra, action ∈ enum, confidence 0-100, targetWeight 0-100 par item, Σ ∈ [95,105], SELL ⇒ targetWeight ≤ 5. Renvoie un `ValidationResult` sealed (`Valid` | `Invalid(errors)`)
- `RecommendationPersister` — `@Transactional` : recharge le portefeuille, persiste la `Recommendation` et ses actions à partir d'un `ParsedLlmRecommendation` déjà validé
- `AnalysisJobStore` — persiste les `AnalysisJob` en base (table `analysis_job`). Permet de reprendre un job pendant après redémarrage et de dédupliquer deux requêtes simultanées sur le même portefeuille

Deux implémentations de `LlmClient` :

- `ClaudeClient` — production, activé avec `llm.provider: claude`. Timeouts explicites (10 s connect / 60 s read)
- `OllamaClient` — local, activé avec `llm.provider: ollama`. Fusionne system + user en un seul message (qwen2:1.5b ignore le role `system`), utilise `format: json` et `num_predict` pour contraindre la sortie

### `portfolio/`

Le portefeuille est **read-only depuis l'UI** — il reflète l'état réel du courtier Wealthsimple. Pas de CRUD manuel.

**Import CSV** (`CsvImportService`) : parse l'export « Positions » Wealthsimple (21 colonnes, français, délimiteur auto-détecté, BOM UTF-8). Pour chaque `Nom du compte` du CSV, crée ou met à jour un `Portfolio` et upsert les positions (`Asset`). Colonnes utilisées : `Symbole`, `Nom`, `Type`, `Quantité`, `Valeur comptable (CAD)`, `Valeur comptable (Marché)`, `Valeur marchande`, `Rendements non réalisés du marché`.

**Snapshots** : à chaque import, un `PortfolioSnapshot` est créé par compte (avec un `batch_id` commun pour grouper les snapshots d'un même import). Chaque `SnapshotPosition` stocke la valeur comptable en CAD, la valeur de marché en devise native, et le P&L non réalisé. Permet le suivi historique de l'évolution du portefeuille.

### `shared/`

Utilitaires transverses : pour l'instant `GlobalExceptionHandler` (mapping uniforme des erreurs en JSON).

> **Note** : les recommandations ne sont pas un module séparé — elles vivent dans `analysis/` (entités `Recommendation`, `RecommendationActionItem`, repository et controller d'historique inclus).

## Schéma de base de données

Une seule migration Flyway : `backend/src/main/resources/db/migration/V1__init.sql`

Schéma complet en une passe (jamais déployé en prod avant consolidation) :

| Section | Tables |
|---------|--------|
| Portefeuille & actifs | `portfolio`, `asset` (inclut currency, book_value_cad, market_value, unrealized_gain) |
| Recommandations IA | `recommendation`, `recommendation_action`, `recommendation_score` |
| Jobs d'analyse | `analysis_job` |
| Snapshots historiques | `portfolio_snapshot`, `snapshot_position` |
| Sources d'ingestion | `feed_source` (slug, category, enabled, free, requires_api_key), `feed_article` |

Le seed des 25 sources est inclus directement dans V1 (RSS, MARKET, MACRO, CRYPTO).

## Décisions techniques notables

**`@Async` sur bean séparé** — Spring AOP ne proxifie pas les appels internes (`this.method()`). `AnalysisService` (HTTP) délègue à `AnalysisRunner` (`@Async`), qui délègue à son tour à `AnalysisExecutor` (`@Transactional`). Cette chaîne garantit que les proxies async ET transactionnel s'appliquent.

**Persistance des jobs d'analyse en base** — l'ancien `ConcurrentHashMap` perdait l'historique au redémarrage. La table `analysis_job` (V7) stocke chaque job avec son `created_at`. `AnalysisService` consulte cette table avant de lancer un nouveau job : si un job pendant existe pour le même portefeuille dans la fenêtre des 90 dernières secondes, il est réutilisé — évite les doubles lancements depuis l'UI.

**Prompt basé sur la valeur de marché, pas le cost basis** — `AnalysisExecutor` injecte `market_value` (V6) plutôt que `quantity × avgBuyPrice`. Le portefeuille étant multi-devises (USD, CAD…) et l'app n'ayant pas encore de service FX live, on dérive un FX implicite au moment de l'achat (`book_value_cad / (quantity × avg_buy_price)`) pour approximer `market_value_cad`. Imparfait — l'approximation utilise le FX d'achat — mais largement supérieur au cost basis pour le LLM. Un service FX live remplacera cette approximation plus tard.

**Filtrage des articles par pertinence** — `ArticleRelevanceScorer` classe les 200 derniers articles selon un score keyword-based : tickers du portefeuille (poids 10, match avec word-boundary pour éviter qu'un ticker court comme `T` matche tout), mots significatifs des noms d'actifs (5), mots-clés sectoriels dérivés des `AssetType` (2), mots-clés macro fixes — Fed, ECB, taux, CPI… (1). Le LLM voit les 25 plus pertinents, fallback sur la recency si moins de 5 articles ont un score > 0. Embeddings / similarité sémantique → plus tard si nécessaire.

**Fenêtres de timeout alignées (300 s)** — `POLL_ABORT_SECONDS` côté frontend (`analysis.service.ts`) et `DEDUP_WINDOW_SECONDS` côté backend (`AnalysisJobStore`) valent tous les deux 300 s. **Invariant** : la fenêtre serveur doit être ≥ l'abort frontend, sinon un retry pendant que le LLM mouline crée un nouveau job au lieu de réutiliser l'ancien. La valeur 300 s couvre le pire cas Mistral 7B local : 2 × ~1 min 30 (call initial + retry du validateur). Claude est nettement plus rapide ; 300 s reste large mais évite les fausses alertes "trop long" légitimes en cas de retry.

**LLM call hors transaction** — l'appel `llmClient.complete()` (1-2 min sur Ollama) ne doit pas tenir de connexion Hikari. Le pipeline d'analyse est éclaté en plusieurs beans pour ça (voir module `analysis/` ci-dessus). Spring AOP impose des beans distincts pour que les `@Transactional` s'appliquent (le proxy ne fonctionne pas sur appels intra-bean).

**Validation + auto-repair des réponses LLM** — même Mistral 7B sort régulièrement du JSON invalide (poids ne sommant pas à 100, tickers hallucinés repris des exemples du SYSTEM_PROMPT, actions absentes pour certains tickers). `RecommendationValidator` applique 8 règles strictes ; si la réponse est invalide, `AnalysisExecutor` re-prompte une fois le LLM en injectant les erreurs dans le user message ("YOUR PREVIOUS RESPONSE WAS REJECTED — Errors: …"). Au pire (2 attempts ratées), on persiste avec `withHoldFallback` qui **strip les tickers hallucinés** ET **ajoute des HOLD pour les tickers manquants** — mieux qu'un job en ERROR. Cette boucle évite de stocker du bruit en BDD et rend Phase 2 (mesure de qualité) honnête : on mesure des recos *valides*, pas du n'importe quoi.

Conséquence sur le SYSTEM_PROMPT : les exemples de tickers (`AAPL`, `NVDA`) ont été remplacés par des placeholders (`<one of the portfolio tickers>`) — Mistral avait tendance à recopier les exemples comme si c'étaient de vrais tickers du portefeuille.

**LLM local avec Mistral 7B Instruct** — initialement on était sur `qwen2:1.5b` pour la latence (~60 s), mais le prompt enrichi (25 articles + descriptions + valeurs marché + poids) a révélé que le modèle est trop petit : sorties incohérentes, tickers hallucinés, poids ne sommant pas à 100. Bascule sur `mistral` (7B Instruct, quantization Q4) pour la cohérence ; latence ~1-2 min sur M1, absorbée par les timeouts à 180 s. Le role `system` reste fusionné avec `user` (pratique conservée pour rester compatible avec les modèles qui l'ignorent).

**Robustesse du parsing RSS** — les flux RSS publics sont souvent mal formés. `RssFetcherService.fetchFeed()` pré-traite le contenu avant de le passer à ROME : (1) User-Agent + Accept header pour éviter les blocages serveur, (2) détection HTML (DOCTYPE / `<html>`) pour signaler explicitement une URL morte ou bloquée, (3) correction des `&` nus non échappés via regex (fréquent sur BFM-style). `isAllowDoctypes = true` sur `SyndFeedInput` pour les flux avec déclaration DOCTYPE. Le scheduler `fetchAll()` et l'endpoint de test passent tous deux par le même helper — la robustesse s'applique aux deux chemins.

**Validation du schéma** — `ddl-auto: validate`. Hibernate valide le schéma au démarrage contre les entités. Toute modification des entités nécessite une migration Flyway.

**Tests d'intégration sur vrai PostgreSQL** — pas de mocks BDD ni H2. Le CI démarre un service PostgreSQL.

**Portefeuille CSV-driven, pas de CRUD manuel** — le portefeuille reflète la réalité du courtier. L'import CSV Wealthsimple est la seule source de vérité des positions. Ce choix simplifie l'UI, élimine les désynchronisations, et rend l'historique automatique (chaque import = snapshot).

**Snapshot avec `batch_id`** — un import CSV peut couvrir plusieurs comptes (CELI, REER, Broker…). Le `batch_id` UUID commun regroupe tous les snapshots d'un même import pour l'affichage en timeline. Pas de table `CsvImportBatch` séparée — le batch_id suffit.

**Normalisation des headers CSV** — les headers Wealthsimple contiennent des accents (`Quantité`, `Marché`…). Normalisation NFD + suppression diacritiques + lowercase pour des lookups robustes indépendants de l'encodage.
