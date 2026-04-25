# Backlog — PortfolioAI

Suivi des features par phase. Mis à jour à chaque session de développement.

**Statuts :** ✅ Fait · ⏳ À faire · 🚧 En cours

---

## Phase 1 — MVP

### Terminé

| Feature | Notes |
|---------|-------|
| Portfolio CRUD (backend) | Entités JPA (`Portfolio`, `Asset`), REST sous `/api/portfolios` |
| Portfolio CRUD (frontend) | `PortfolioService`, `Dashboard` avec liste + tableau actifs + formulaires inline |
| Navigation (header) | `mat-toolbar` Material sticky, liens avec icônes, état actif |
| CI GitHub Actions | `backend.yml` (Gradle + PostgreSQL service), `frontend.yml` (Vitest) — déclenchés sur changements de chemin |
| Ingestion RSS | Module `ingestion/` — Rome, scheduler 15 min prod / 5 min local, déduplication par `guid`. `GET /api/ingestion/articles`, `POST /api/ingestion/fetch` |
| Appel LLM (Claude / Ollama) | `LlmClient` interface, `ClaudeClient` (prod), `OllamaClient` (local). `llm.provider: claude\|ollama` |
| Analyse IA async | `AnalysisService` → `AnalysisRunner` (`@Async` bean séparé). `AnalysisJobStore` (ConcurrentHashMap). API : POST → 202, polling job, GET recommendation |
| Affichage recommandations (dashboard) | Polling RxJS, spinner + timer, confidence badge, actions colorées. Montants : poids actuel %, valeur €, cible €, delta ±€ |
| Seed data Tilt | `scripts/seed.sql` — portefeuille démo ~100k€ (VOO, QQQ, BND, AAPL, MSFT, NVDA, GOOGL, AMZN, BTC, ETH) |
| Robustesse analyse IA | Timeout 120s, `format:json` + `num_predict` Ollama, system+user fusionnés, SYSTEM_PROMPT reécrit, `@JsonIgnoreProperties`, extracteur JSON robuste |
| Affichage recommandations (page history) | `GET /api/recommendations` global. Composant `history/` : filtres portfolio + statut, cartes expandables |
| Persistance Settings | Migration V3 (slug, description, free, requires_api_key), 22 sources en base. `PATCH /api/ingestion/sources/{id}`. Frontend API-driven, update optimiste |

### À faire

| Feature | Description |
|---------|-------------|
| ⏳ Notifications progression analyse | Suivi pas-à-pas en temps réel : "Récupération articles…", "Appel LLM…", "Parsing…". Via SSE ou champ `steps` sur le job, affiché comme fil dans l'UI |
| ⏳ Analyse non-bloquante (navigation) | L'analyse en cours doit survivre à la navigation. `AnalysisStateService` Angular global — le polling vit hors du composant `dashboard` |

---

## Phase 2 — Traçabilité

| Feature | Description |
|---------|-------------|
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
