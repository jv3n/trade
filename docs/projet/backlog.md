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
| Snapshots historiques | À chaque import CSV, création d'un `PortfolioSnapshot` + `SnapshotPosition` par compte (valeur comptable CAD, valeur marché, P&L). Tables V6. `GET /api/snapshots` |
| Page Import (onglet dédié) | Drag & drop CSV standalone sur `/import`. Redirige vers `/suivi` après import. |
| Page Suivi (historique positions) | `/suivi` — timeline groupée par batch d'import, expand par compte, détail positions avec valeur marché et P&L. |

### À faire

| Feature | Description |
|---------|-------------|
| ⏳ Notifications progression analyse | Suivi pas-à-pas en temps réel : "Récupération articles…", "Appel LLM…", "Parsing…". Via SSE ou champ `steps` sur le job, affiché comme fil dans l'UI |
| ⏳ Analyse non-bloquante (navigation) | L'analyse en cours doit survivre à la navigation. `AnalysisStateService` Angular global — le polling vit hors du composant `dashboard` |

---

## Phase 2 — Traçabilité

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
