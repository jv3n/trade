# Fonctionnalités

> **L'app a pivoté en juin 2026** d'un outil d'analyse de marché par ticker (narratif IA) vers un **journal de trading**. La seule surface produit **live** est le module journal ci-dessous. Tout le reste (dossiers ticker, narratifs LLM, radar, portefeuille) reste dans le code en **sommeil** — décrit en bas sous « Surface pré-pivot (dormante) ». L'infrastructure auth (Phase 4) et déploiement (Phase 5) reste active. Voir la [roadmap](../projet/roadmap.md) pour le périmètre in / out.

## Journal de trading — live

Le cœur du produit. L'utilisateur logue chaque trade ; la table est l'unité atomique.

### Saisie d'un trade

Dialog « Add trade » (création / édition) structuré en trois blocs :

- **Exécution** (requis) — date, ticker (≤ 20 car., majuscule), *play* (A / B), *pattern* (GUS / FRD), taille (> 0), prix d'entrée (> 0).
- **Sortie** (optionnel) — prix de sortie, P&L en dollars, gain % — **fournis par l'utilisateur** ; le backend ne calcule pas le P&L, il stocke ce qui est saisi.
- **Checklist pré-trade & post-mortem** (optionnel) — fenêtre 9h35–10h, gap up ≥ 50 %, prix $1–$10, float 3–50M, attente du push, *open side* (front / back), short sur résistance, *exit strategy* (swing +20 % / EOD), note, note d'erreur.

Formulaire en Signal Forms ; validation inline ; les champs optionnels laissés vides deviennent `null`.

### Table & relecture

- **Colonnes** : date, ticker, play, pattern, taille, prix entrée, prix sortie, P&L $, gain %, actions (éditer / supprimer).
- **Tri serveur** sur chaque colonne (pattern controlled-component `[matSortActive]` / `[matSortDirection]`) ; défaut `tradeDate DESC, createdAt DESC`.
- **Pagination serveur** (`Page<T>` Spring) — tailles de page 10 / 25 / 50 / 100.
- **Filtres** (drawer) : preset de période (ce mois / mois dernier / trimestre / année…), date range custom, plays (multi), patterns (multi), statut (ouvert / clos / gagnant / perdant), recherche ticker (debounce 250 ms).
- **CRUD** avec snackbars de feedback succès (3 s) / erreur (5 s) ; suppression confirmée.

### Export / import CSV

Page dédiée (`journal-io`) :

- **Export** — télécharge tout le journal en CSV (`journal-export-YYYY-MM-DD.csv`), UTF-8 BOM, CRLF, RFC 4180, 19 colonnes.
- **Import** — drag-drop ou file picker ; **batch atomique** : si une ligne échoue, **rien** n'est persisté, et les erreurs sont rendues ligne par ligne (`{line, message}`). Export → import est **roundtrip-safe**.

### Backend

Module `journal/` (hexagonal) : `TradeEntry` (19 champs) + 4 enums Postgres natifs (`trade_play`, `trade_pattern`, `trade_open_side`, `trade_exit_strategy`), `TradeEntryService`, `TradeEntryRepository` (+ `TradeEntrySpecifications` pour les filtres dynamiques), `TradeEntryController`. **7 endpoints** sous `/api/journal/trades` (list paginée, get, create, update, delete, export, import). Multi-tenant : chaque opération est scopée au `user_id` courant (404 sur un ID étranger, jamais 403, pour ne pas leaker l'existence d'une ligne). Schéma : migration Flyway **V5** (`trade_entry`). Détail technique : [`architecture.md`](../technique/architecture.md).

---

## Stats trades — live

Dataset **global, partagé** (pas multi-tenant) : le contexte de setup des shorts gap-up + les niveaux de prix du jour + les mouvements dérivés `%push` / `%LOD` / `%EOD`. Alimenté par un **import CSV admin**, lisible par tout utilisateur authentifié.

### Affichage (`/stats`)

- **Table read-only** des 17 colonnes (date, ticker, gap, float, % institutions, flags `>20% inst` / `<$1` / `SSR` / `entrée > 11h`, niveaux open/high/lod/eod, `%push`/`%LOD`/`%EOD`, notes). Flags booléens en icônes, `%` colorés par signe.
- **Tri + pagination serveur** (`Page<T>` Spring, tri par défaut date décroissante, tailles 10 / 25 / 50 / 100). Pas de CRUD ni filtres : le dataset est alimenté par l'import.

### Import / export CSV (admin)

- Page **admin-only** `/settings/stats-import` (drag-drop ou file picker). **Batch atomique** ; export → import **roundtrip-safe** (14 colonnes, les `%` recalculées à l'insertion sont omises). Le CSV source est produit hors-app par l'outil Go `scripts/stats`.

### Backend

Module `stats/` (hexagonal, distinct de `journal/`) : `StatEntry` (table `stat_entry`, **sans `user_id`**), `StatMetrics` (calcul pur des 3 `%`), `StatEntryService` (`importCsv` atomique + `findAllPaged` + `exportAllAsCsv`), `StatEntryController` (`GET /api/stats` lecture pour tous, `POST /api/stats/import` ADMIN-only, `GET /api/stats/export`). Schéma : migrations Flyway **V6** / **V7**. Détail technique : [`architecture.md`](../technique/architecture.md).

---

## Authentification & multi-tenant — toujours actif (Phase 4)

OAuth2 Google OIDC + Spring Security, rôles ADMIN / USER via whitelist email, profile dev `local-no-auth` (bypass Spring Security + ADMIN fake `dev@local.test`). **Le journal en dépend** : `trade_entry.user_id` est une FK vers `app_user`. Toggle `BACKEND_AUTH_MODE` (no-auth ↔ oauth) dans `.env` + boutons Tilt. Détail : [`developpement.md > Modes d'authentification`](../technique/developpement.md#modes-dauthentification-phase-4).

## Déploiement — toujours actif (Phase 5)

Cloud Run + Supabase Postgres (région Montréal `ca-central-1`), pipeline GitOps release-triggered (Workload Identity Federation, zéro clé JSON), 5 secrets runtime via GCP Secret Manager, backup hebdo `pg_dump → R2` (rétention 30 j), domaine Cloudflare, Sentry errors-only. Détail : [`docs/devops/`](../devops/deploiement.md).

---

## Surface pré-pivot (dormante)

> Le code ci-dessous **existe toujours dans l'arbre** mais n'est **plus câblé à aucune route produit**. Conservé pour un éventuel enrichissement Phase 2 (les clients providers notamment — graphe du symbole au moment d'un trade). L'historique détaillé des livraisons phases 0 → 6 vit dans [`archive/journal-livraisons.md`](../projet/archive/journal-livraisons.md).

- **Phase 1 — dossier ticker** : `market/` (Twelve Data + mock, `IndicatorCalculator` : RSI / MA / momentum / drawdown), `analysis/` (narratif LLM par ticker + snapshots persistés), page `ticker/`. Ports `MarketChartClient` / `SymbolSearchClient` / `SectorClassifier` conservés.
- **Phase 2 / 2.5 — profondeur ticker** : `news/`, `analyst/`, `earnings/` (Finnhub + mock), `watchlist/`, chart multi-timeframe + overlays + annotations, config runtime (`config/`), streaming SSE du pipeline narratif.
- **Phase 3 — observabilité narrative** : prompt management + scoring, timeline reverse-chronologique, score de cohérence cross-runs, détection de biais corpus-wide.
- **Phase 6 — radar d'anomalies** : `screener/` (Polygon + FMP + mock), détection gap + volume sur les mid-caps NASDAQ. Providers conservés.
- **Portefeuille** : `portfolio/` (import CSV Wealthsimple, snapshots) — hors scope d'un journal de trade actif.

Le module `config/` (rotation des clés provider à chaud, sans reboot) reste utile le jour où la Phase 2 réveille un provider pour enrichir les trades.
