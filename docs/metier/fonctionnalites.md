# Fonctionnalités

> **L'app a pivoté en juin 2026** d'un outil d'analyse de marché par ticker (narratif IA) vers un **journal de trading**. Les surfaces produit **live** sont le **compte broker**, le **journal**, les **stats** et le **lexique** ci-dessous. Tout le reste (dossiers ticker, narratifs LLM, radar, portefeuille) reste dans le code en **sommeil** — décrit en bas sous « Surface pré-pivot (dormante) ». L'infrastructure auth (Phase 4) et déploiement (Phase 5) reste active. Voir la [roadmap](../projet/roadmap.md) pour le périmètre in / out.

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

Module `journal/` (hexagonal) : `TradeEntry` (19 champs) + 4 enums Postgres natifs (`trade_play`, `trade_pattern`, `trade_open_side`, `trade_exit_strategy`), `TradeEntryService`, `TradeEntryRepository` (+ `TradeEntrySpecifications` pour les filtres dynamiques), `TradeEntryController`. **7 endpoints** sous `/api/journal/trades` (list paginée, get, create, update, delete, export, import). Multi-tenant : chaque opération est scopée au `user_id` courant (404 sur un ID étranger, jamais 403, pour ne pas leaker l'existence d'une ligne). Schéma : table `trade_entry` fondée dans `V1__init.sql` (champs optionnels relâchés en V4). Détail technique : [`architecture.md`](../technique/architecture.md).

---

## Compte broker — live

La valeur du compte broker, **saisie à la main** (aucune connexion au broker) — première entrée du sidenav. L'app est la source de vérité côté soft, réconciliée manuellement avec le broker.

### Solde & graphe

- **Hero solde courant** + **variation sur la période** (montant + %, sélecteur 1S / 1M / 3M / YTD / Tout).
- **Graphe d'évolution** de la balance (`StbAreaChart`, SVG maison, tooltip au survol) — série cumulée end-of-day, fenêtrage + variation calculés côté front.

### Mouvements

- **Registre groupé par date** avec **sous-total quotidien** ; ajout de **dépôts / retraits**, **correction de balance** (on saisit la valeur réelle du broker → un mouvement de correction enregistre l'écart : frais, financement, slippage non captés ailleurs).
- **Balance dérivée** : `dépôts − retraits + P&L trades ± corrections` (jamais stockée, somme du registre).
- **Trades du journal** : le P&L réalisé alimente le solde en mouvement `TRADE` **read-only** (poussé automatiquement à la clôture, ticker en chip + lien vers le journal). Édition / suppression réservées aux mouvements manuels.
- **Panneau résumé** : total déposé, total retiré, net injecté, P&L trades, corrections, **rendement** (`solde − net injecté`, en $ et en % du net injecté — dérivé côté front), nb de mouvements.

### Backend

Module `account/` (hexagonal) : `AccountMovement` + enum Postgres `account_movement_type`, `AccountService` (balance dérivée, correction = delta signé, série cumulée end-of-day), `AccountController` (`/api/account` : `movements` paginé, `summary`, `balance-series`, `corrections`, CRUD mouvements). Multi-tenant scopé `user_id` (404 sur ID étranger). Sync journal → compte par event (`TradeChangedEvent` → `TRADE` read-only, cascade DB sur suppression). Schéma : table `account_movement` (migration **V6**). Mono-compte, USD. Détail : [`architecture.md`](../technique/architecture.md).

---

## Candidats — live

Le **cockpit de préparation d'un short** : chaque matin, on prépare les tickers qu'on envisage de shorter avec leur plan de trade complet. Une page **upsert + dropdown** — on enregistre un candidat, un sélecteur liste ceux **du jour**, on en choisit un pour le ré-éditer. Absorbe les anciennes calculettes (GUS, borrow).

### Préparation & sizing

- **Paramètres** : capital total, % capital à risque (→ $ à risque dérivé), prix d'open, stop %.
- **Échelle d'entrée au risque** : par palier (% de l'open), prix, **shares max** (`$ risque / ((stop − palier) × open)`) et investissement — le max shortable pour qu'un stop coûte pile le budget risque.
- **Suivi d'exécution** (paliers fixes) : on saisit les shares remplies par palier → risque courant, **résidu** de budget, totaux. **Sizing uniquement** (la position moyenne est portée par les entrées réelles ci-dessous).
- **Entrées réelles** (saisie libre) : un leg par entrée (prix + shares saisis, non contraint aux paliers) → entrée %, risque $, risque %, investissement et la **position moyenne pondérée** — c'est elle qui alimente le cover.
- **Échelle de sortie / cover** : prix de sortie + shares couvertes → % et $ gain/perte vs position moyenne, TP moyen.
- **Données du jour** (saisies) : clôture veille, float, volume, push, coût borrow — avec les calculs **GUS %** et **frais borrow %** intégrés (le **% push** reste hors scope v1 : `morningPush` est saisi mais pas calculé).
- **Créer une stat** : un bouton ouvre l'`add-stat-dialog` pré-rempli (date, ticker, gap % issu du GUS, open) → enregistré dans le module **stats** (pas de promotion directe vers un trade du journal).

### Cycle de vie

Piloté par la **date de séance** : la dropdown ne montre que les candidats du jour ; les antérieurs restent en base mais sortent du picker (pas de statut explicite).

### Backend

Module `candidates/` (hexagonal) : `Candidate` (paramètres + données + legs `fills`/`entries`/`exits` en JSONB), `CandidateService` (upsert, `listForDate`, validation in-service, legs (dé)sérialisés via `ObjectMapper`), `CandidateController` (`/api/candidates` : `GET ?date=`, `GET /{id}`, `POST`, `PUT`, `DELETE`). Multi-tenant scopé `user_id` (404 sur ID étranger). Toutes les valeurs dérivées sont recalculées **côté front** (`candidates.math.ts`, fonctions pures). Schéma : table `candidate` (migration **V7**). Détail : [`architecture.md`](../technique/architecture.md).

---

## Stats trades — live

Dataset **global, partagé** (pas multi-tenant) : le contexte de setup des shorts gap-up + les niveaux de prix du jour + les mouvements dérivés `%push` / `%LOD` / `%EOD`. Alimenté par un **import CSV admin**, lisible par tout utilisateur authentifié.

### Affichage (`/stats`)

- **Table read-only** des 17 colonnes (date, ticker, gap, float, % institutions, flags `>20% inst` / `<$1` / `SSR` / `entrée > 11h`, niveaux open/high/lod/eod, `%push`/`%LOD`/`%EOD`, notes). Flags booléens en icônes, `%` colorés par signe.
- **Tri + pagination serveur** (`Page<T>` Spring, tri par défaut date décroissante, tailles 10 / 25 / 50 / 100). Pas de CRUD ni filtres : le dataset est alimenté par l'import.

### Import / export CSV (admin)

- Page **admin-only** `/settings/stats-import` (drag-drop ou file picker). **Batch atomique** ; export → import **roundtrip-safe** (14 colonnes, les `%` recalculées à l'insertion sont omises). Le CSV source est produit hors-app par l'outil Go `scripts/stats`.

### Backend

Module `stats/` (hexagonal, distinct de `journal/`) : `StatEntry` (table `stat_entry`, **sans `user_id`**), `StatMetrics` (calcul pur des 3 `%`), `StatEntryService` (`importCsv` atomique + `findAllPaged` + `exportAllAsCsv`), `StatEntryController` (`GET /api/stats` lecture pour tous, `POST /api/stats/import` ADMIN-only, `GET /api/stats/export`). Schéma : table `stat_entry` fondée dans `V1__init.sql` (étendue en V2 / V3 / V5). Détail technique : [`architecture.md`](../technique/architecture.md).

---

## Lexique — live

Glossaire **partagé** des termes de trading (label EN + définition **FR et EN**, les deux obligatoires). Dataset global (pas multi-tenant) : **lecture pour tous, édition réservée à l'admin**. **Pas d'import/export.**

### Consultation (`/lexicon`, tous)

- Accessible depuis le **bas de la sidenav** (icône `menu_book`, séparée de la navigation principale).
- **Table en lecture seule** (terme / définition **dans la langue de l'utilisateur**) avec **recherche client-side sur le terme + les deux définitions** : le glossaire est chargé d'un coup et filtré en direct, sans round-trip backend.

### Gestion (`/settings/lexicon`, admin)

- Même table en **mode CRUD** : ajout / édition via dialog (2 champs), suppression confirmée, snackbars de feedback. Terme **unique** (insensible à la casse).

### Backend

Module `lexicon/` (hexagonal, distinct) : `LexiconEntry` (table `lexicon_entry`, `definition_fr` + `definition_en`, **sans `user_id`**), `LexiconEntryService` (`findAll` non paginé trié + CRUD, unicité casse-insensible → 409, champs vides → 400), `LexiconEntryController` (`/api/lexicon` : `GET` lecture pour tous, `POST` / `PUT` / `DELETE` **ADMIN-only**). Schéma : table `lexicon_entry` (bilingue) fondée dans `V1__init.sql`, avec le seed FR/EN des 117 termes. Détail technique : [`architecture.md`](../technique/architecture.md).

---

## Authentification & multi-tenant — toujours actif (Phase 4)

OAuth2 Google OIDC + Spring Security, rôles ADMIN / USER via whitelist email, profile dev `local-no-auth` (bypass Spring Security + ADMIN fake `dev@local.test`). **Le journal en dépend** : `trade_entry.user_id` est une FK vers `app_user`. Toggle `BACKEND_AUTH_MODE` (no-auth ↔ oauth) dans `.env` + boutons Tilt. Détail : [`developpement.md > Modes d'authentification`](../technique/developpement.md#modes-dauthentification-phase-4).

## Déploiement — toujours actif (Phase 5)

Cloud Run + Supabase Postgres (région Montréal `ca-central-1`), pipeline GitOps release-triggered (Workload Identity Federation, zéro clé JSON), 5 secrets runtime via GCP Secret Manager, backup hebdo `pg_dump → R2` (rétention 30 j), domaine Cloudflare, Sentry errors-only. Détail : [`docs/devops/`](../devops/deploiement.md).

---

## Surface pré-pivot (dormante)

> Le code ci-dessous **existe toujours dans l'arbre**, conservé pour un éventuel enrichissement Phase 2 (les clients providers notamment — graphe du symbole au moment d'un trade). Nuance : une partie reste **routée et atteignable** — les pages `ticker` (liens depuis le journal / stats / nav) et `radar` tirent sur `market` / `news` / `analyst` / `earnings` / `watchlist` / `screener` + le narratif d'`analysis`. Le module **`portfolio/` a été décommissionné** (2026-06-10). L'historique détaillé des livraisons phases 0 → 6 vit dans [`archive/journal-livraisons.md`](../projet/archive/journal-livraisons.md).

- **Phase 1 — dossier ticker** : `market/` (Twelve Data + mock, `IndicatorCalculator` : RSI / MA / momentum / drawdown), `analysis/` (narratif LLM par ticker + snapshots persistés), page `ticker/`. Ports `MarketChartClient` / `SymbolSearchClient` / `SectorClassifier` conservés.
- **Phase 2 / 2.5 — profondeur ticker** : `news/`, `analyst/`, `earnings/` (Finnhub + mock), `watchlist/`, chart multi-timeframe + overlays + annotations, config runtime (`config/`), streaming SSE du pipeline narratif.
- **Phase 3 — observabilité narrative** : prompt management + scoring, timeline reverse-chronologique, score de cohérence cross-runs, détection de biais corpus-wide.
- **Phase 6 — radar d'anomalies** : `screener/` (Polygon + FMP + mock), détection gap + volume sur les mid-caps NASDAQ. Providers conservés.
- **Portefeuille** : `portfolio/` (import CSV Wealthsimple, snapshots) — **décommissionné le 2026-06-10** (module backend + features front `dashboard` / `import` / `suivi` + 4 tables supprimés ; hors scope d'un journal de trade actif).

Le module `config/` (rotation des clés provider à chaud, sans reboot) reste utile le jour où la Phase 2 réveille un provider pour enrichir les trades.
