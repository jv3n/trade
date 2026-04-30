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
| Persistance des jobs d'analyse | Migration V7 (`analysis_job`). `AnalysisExecutor` séparé de `AnalysisRunner`. Déduplication des jobs concurrents sur 90 s. Timeouts explicites sur le client Claude. Frontend : polling 5 s + abandon après 90 s |
| Page Import (onglet dédié) | Drag & drop CSV standalone sur `/import`. Redirige vers `/suivi` après import. |
| Page Suivi (historique positions) | `/suivi` — timeline groupée par batch d'import, expand par compte, détail positions avec valeur marché et P&L. |

### À faire

| Feature | Description |
|---------|-------------|
| ⏳ Notifications progression analyse | Suivi pas-à-pas en temps réel : "Récupération articles…", "Appel LLM…", "Parsing…". Via SSE ou champ `steps` sur le job, affiché comme fil dans l'UI |
| ⏳ Analyse non-bloquante (navigation) | L'analyse en cours doit survivre à la navigation. `AnalysisStateService` Angular global — le polling vit hors du composant `dashboard` |

### Qualité du contexte d'analyse (bloquant Phase 2)

Phase 2 mesure la qualité des recommandations, mais aujourd'hui l'entrée du LLM est trop pauvre pour produire des recos signifiantes : on lui envoie le **prix de revient** (pas la valeur de marché) et **10 titres d'articles** sans filtrage de pertinence. Ces items rendent les mesures de Phase 2 réellement informatives.

| Feature | Description | Priorité |
|---------|-------------|----------|
| ⏳ Brancher la valeur de marché dans le prompt | `Total value` actuel = Σ `quantity × avgBuyPrice` (cost basis). Utiliser `market_value` (V6) à la place. Calculer le poids actuel = `market_value / total_market_value` et l'injecter par position. Le LLM raisonne aujourd'hui sur un portefeuille à la date d'achat. | 🔴 Haute |
| ⏳ Filtrage des articles par pertinence | Aujourd'hui : `findTop50ByOrderByPublishedAtDesc().take(10)`. Filtrer côté requête : titre OU description mentionne un ticker du portefeuille, un secteur lié, ou des mots-clés macro pertinents. Élargir à 20-30 articles filtrés. | 🔴 Haute |
| ⏳ Champ "thèse / objectif" sur le Portfolio | Texte libre optionnel sur `Portfolio` (horizon, tolérance au risque, contraintes). Injecté dans le prompt. Aujourd'hui chaque reco est context-free du *pourquoi* l'utilisateur tient ces positions. | 🟡 Moyenne |
| ⏳ Validation serveur du JSON LLM | Vérifier `Σ targetWeight ≈ 100`, ticker ∈ portefeuille, `action ∈ enum`. Si invalide → relancer le LLM avec le message d'erreur (auto-repair max 1 retry) plutôt que sauvegarder du bruit. | 🟡 Moyenne |
| ⏳ Snapshot du prompt envoyé | Nouveau champ `prompt_snapshot` (text) sur `Recommendation`. Sinon Phase 2 ne pourra pas corréler qualité de reco ↔ qualité du contexte ; l'analyse post-mortem sera aveugle. | 🟡 Moyenne |
| ⏳ Simplifier l'enum d'action | `REDUCE` chevauche `SELL + targetWeight < currentWeight`. Garder uniquement `BUY / SELL / HOLD` + delta de poids. Migration + adaptation prompt + UI. | 🟢 Basse |
| ⏳ Score de confiance dérivé | Remplacer la `confidence` auto-déclarée du LLM (mal calibrée) par un score serveur : nombre d'articles pertinents, fraîcheur, diversité des sources, présence d'une thèse. La self-rating reste loggée pour comparaison. | 🟢 Basse — après Phase 2 |
| ⏳ Continuité entre analyses | Injecter dans le prompt la dernière reco générée pour ce portefeuille + delta de prix marché depuis. Détecte les LLM qui changent d'avis sans nouvelle info. | 🟢 Basse |

---

## Phase 2 — Traçabilité

> ⚠️ **Pré-requis** : valider les items 🔴 ci-dessus (valeur de marché + filtrage articles) avant de commencer Phase 2. Mesurer la qualité de recos basées sur 10 titres random et le cost basis revient à mesurer du bruit.

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
