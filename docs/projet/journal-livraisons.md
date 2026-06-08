# Journal des livraisons — 1.0 journal de trading

Historique des livraisons depuis le **pivot** (juin 2026) vers le journal de trading. Format reverse-chronological (récent en haut). L'historique pré-pivot (phases 0 → 6 : ticker, narratif, observabilité, déploiement, radar) est archivé dans [`archive/journal-livraisons.md`](./archive/journal-livraisons.md).

---

## Pivot — module journal de trading (juin 2026)

> Bascule de l'app : d'un outil d'analyse de marché par ticker (narratif LLM) vers un **journal de trading**. L'unité atomique devient le **trade entry**.

### ✅ Livré — module `journal/` (MVP)

- **Backend `journal/`** (hexagonal) — `TradeEntry` (19 champs : exécution + checklist pré-trade + post-mortem + audit), 4 enums Postgres natifs (`trade_play` A/B, `trade_pattern` GUS/FRD, `trade_open_side` FRONT/BACK, `trade_exit_strategy` SWING_20/EOD), `TradeEntryService` (CRUD scopé `user_id`, **défaut de tri `tradeDate DESC, createdAt DESC` posé dans le service** ; P&L saisi par l'utilisateur, pas calculé), `TradeEntryRepository` + `TradeEntrySpecifications` (prédicats dynamiques des filtres), `TradeEntryController` (**7 endpoints** sous `/api/journal/trades`). Migration Flyway **V5** (`trade_entry` + enums + index `(user_id, trade_date DESC)` / `(ticker)` + trigger `set_updated_at`). Multi-tenant : ID étranger → 404.
- **Pagination + tri serveur** — `Page<TradeEntryDto>` + `Pageable` (`?page&size&sort=field,dir`) ; front controlled-component (`[matSortActive]` / `[matSortDirection]` bindés à un signal), tailles de page 10 / 25 / 50 / 100.
- **Export / import CSV** — RFC 4180, UTF-8 BOM, CRLF, 19 colonnes ; import **atomique** (toute erreur ligne → 0 persistée, diagnostics `{line, message}`) ; export → import **roundtrip-safe**. Page `features/journal-io/` (drag-drop + file picker).
- **Frontend `features/journal/`** — table des trades (Material), dialog add/edit (Signal Forms, 3 blocs exécution / sortie / checklist), drawer filtres (preset de période + date range custom + plays + patterns + statut + recherche ticker debounce 250 ms), snackbars CRUD succès (3 s) / erreur (5 s).
- **CSS / shell** — container `.page` global + portage du sidenav radar.

### ✅ Livré — module `stats/` (dataset global + import CSV admin)

- **Backend `stats/`** (hexagonal, livré 2026-06-07) — nouveau module distinct du `journal/`. `StatEntry` (table `stat_entry`) : contexte pré-trade (gap, float, % institutions, flags `>20% Inst?` / `<$1 stock?` / `SSR?` / `Entry after 11AM?`) + niveaux de prix (open/high/lod/eod) + **3 colonnes `%` dérivées à l'insertion** (`pushPercent` / `lodPercent` / `eodPercent`, encodage valeur ×100, 2 décimales, via la fonction pure `StatMetrics`). `StatEntryCsvDecoder` (RFC 4180, BOM, CRLF, **14 colonnes à en-têtes humains**, import **atomique**), `StatEntryService.importCsv`, `StatEntryController` (`POST /api/stats/import` multipart). Migrations Flyway **V6** (`stat_entry`) puis **V7** (drop `user_id`). CSV d'exemple versionné : `docs/data-input/stats-demo.csv`. Tests : `StatMetricsTest` (calcul pur), `StatEntryCsvDecoderTest` (parsing / erreurs), `StatsImportIntegrationTest` (aller-retour DB + % persistés + batch atomique).
- **Dataset global, write admin-only** — contrairement au `journal/`, les stats **ne sont pas multi-tenant** (pas de `user_id`) : un seul jeu partagé, lisible par tout utilisateur authentifié. Seuls les **ADMIN** peuvent l'alimenter — `POST /api/stats/**` gated `hasRole("ADMIN")` dans `SecurityConfig` (les futurs `GET` restent `authenticated`).
- **Export CSV table complète** (livré 2026-06-07) — `GET /api/stats/export` (`text/csv` attachment, `stats-export-YYYY-MM-DD.csv`), lisible par tout utilisateur authentifié (seul l'`import` est ADMIN-gated). `StatEntryCsvEncoder` réémet **exactement les 14 colonnes d'import** (mêmes en-têtes que `StatEntryCsvDecoder`, `%push` / `%LOD` / `%EOD` omises car recalculées à l'insert) → **roundtrip-safe : le fichier exporté se réimporte tel quel**. `StatEntryService.exportAllAsCsv` (tri `tradeDate` desc, `createdAt` desc). Côté front : `StatsRepository.exportCsv` (blob) + carte export sur `/settings/stats-import` (même trick blob-download que `journal-io`). Test `StatEntryCsvEncoderTest` (en-têtes = layout import, BOM/CRLF, quoting, note nulle).
- **Reste à faire** — listing + agrégats stats (lecture).

### Conservé en sommeil

Les modules pré-pivot (`market/`, `analysis/`, `portfolio/`, `news/`, `analyst/`, `earnings/`, `screener/`, `watchlist/`, `config/`) restent dans l'arbre, plus câblés à aucune route produit — providers conservés pour un éventuel enrichissement Phase 2. `auth/` (Phase 4) et l'infra de déploiement (Phase 5) restent **actifs** ; le journal dépend de `auth/` (FK `trade_entry.user_id`).

> Le détail des livraisons phases 0 → 6 (ticker, narratif, observabilité, déploiement, radar) est conservé dans [`archive/journal-livraisons.md`](./archive/journal-livraisons.md).
