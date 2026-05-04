# État actuel — Phase 2 multi-timeframe + watchlist + news livrés (2026-05-04)

Snapshot après les livrables Phase 2 multi-timeframe (chart + axes + crosshair), watchlist persistée + sidebar dashboard collapsable, et news par ticker via Finnhub. Pour reprendre proprement à la prochaine session.

## Branches / tags

- Branche : `master`
- Derniers tags :
  - `v0.1.0` — clôture **Phase 0** (recommandations RSS, gelée)
  - `v0.2.0` — clôture **Phase 1 — Pivot ticker** ✅
- Working tree : voir `git status`.

## Phase 1 — bilan

100 % livrée. Tout le critique 🔴, le médium 🟡 et le basse 🟢 listé dans `backlog.md` sont ✅. Prérequis Phase 2 (provider de marché alternatif) également ✅.

## Phase 2 — démarrée

- ✅ **Multi-timeframe + axes + crosshair** : toggle `1D / 5D / 1M / 3M / 1Y / 5Y` au-dessus du chart. Endpoint dédié `/chart?timeframe=` qui ne ramène que les bars (les indicateurs et le narratif restent sur la 1Y daily de référence). Enum `Timeframe` côté domain (intervals Yahoo-style pour aligner les clés Caffeine entre dossier et chart). Mock `MockMarketChartClient` honore `(range, interval)` avec un seed étendu pour produire une courbe différente par timeframe. Chart enrichi axes Y (prix) et X (dates), grille pointillée, crosshair de hover + tooltip date/prix exacts. 4 nouveaux tests slice MVC (`MarketControllerTest`) + spec adapter HTTP + 4 tests `ticker.spec` + 3 tests mock supplémentaires.
- ✅ **Watchlist persistée** : nouveau module backend `watchlist/` (entity `WatchlistEntry`, table `watchlist_entry` migration V3, service avec normalisation symbole + add idempotent + remove non-idempotent, controller 3 endpoints REST). Front : port `WatchlistRepository` + adapter HTTP, **input rapide dans la sidebar dashboard** (section dédiée avec icône poubelle pour retirer) + **bouton "Suivre / Suivi"** sur le header du Dossier ticker (icône `bookmark` filled/outlined, optimistic toggle avec rollback). Pas de gestion multi-user (table sans `user_id`). 14 tests : slice MVC controller (7), adapter HTTP (3), `dashboard.spec` watchlist (6), `ticker.spec` toggle (5).
- ✅ **Sidebar dashboard collapsable + scrollbar custom** : 3 sections indépendamment foldables (Portefeuilles / Tickers détenus / Watchlist) avec bouton header + chevron rotatif. Scrollbar 8px custom appliquée globalement via `styles.scss`, support Webkit + Firefox, adopte les tokens couleur du thème. Pas de persistance localStorage des états ouvert/fermé pour l'instant.
- ✅ **News par ticker** : nouveau module backend `news/` (`NewsClient` port). Deux adapters sélectionnés par `news.provider` : `FinnhubClient` (`finnhub`, /company-news 30j window) et `MockNewsClient` (`mock`, défaut — feed synthétique déterministe par symbole, ~10 % quiet, ~25 % sans summary). Cache `news-by-symbol` 15 min. Endpoint `GET /api/market/ticker/{symbol}/news?limit=10`. Front : port `NewsRepository` + adapter, section dédiée sur le Dossier ticker entre la plage 52w et le narratif IA, dates relatives localisées (`il y a 3 h` / `hier` / `15 avr 2026`), erreurs scopées. Twelve Data ne couvrant pas `/news` (testé live → 404), Finnhub est ajouté comme provider séparé. Mock par défaut en local pour économiser le quota Finnhub en itération. 17 tests.
- ✅ **Settings & config runtime** : nouvelle page `/settings/configuration` (4ᵉ onglet sidenav) qui édite en direct cinq clés sans reboot — clés API Twelve Data + Finnhub (avec bouton "Tester" qui sonde la clé candidate avant la sauve), TTL cache Caffeine 5–60 min, et toggles `market.provider` / `news.provider` mock ↔ live. Backend : nouveau module `config/` (`AppConfigService` + cache mémoire `ConcurrentHashMap` primé au boot + surcharge BDD au-dessus du défaut YAML + `ConfigChangedEvent`), migration V4 `app_config (key/value/updated_at)`. Routing per-call : `RoutingMarketChartClient` + `RoutingNewsClient` (`@Primary`) délèguent à l'adapter sélectionné par `appConfig.getString(...)` à chaque appel. TTL Caffeine dynamique via `CacheTtlListener` qui rebuild la spec sur event. UI Material avec `mat-button-toggle-group` pour les enums (save instantané) + slider pour le TTL + password inputs pour les secrets. ~30 tests (`AppConfigServiceTest`, `ConfigControllerTest`, `RoutingMarketChartClientTest`, `RoutingNewsClientTest`, `configuration.spec`, `config.http.spec`).
- ✅ **Cleanup des jobs orphelins au boot** : `OrphanedJobCleanupListener` (`@EventListener(ApplicationReadyEvent)`) sweep `ticker_narrative_job` + `analysis_job` au boot, flippe `PENDING → ERROR` avec un marqueur. JPQL `@Modifying` bulk update.
- ✅ **Linter ESLint côté frontend** : flat config `eslint.config.js` (Angular ESLint 21) via `ng add @angular-eslint/schematics`, `eslint-config-prettier` en dernier extends. Step CI `Lint` ajoutée à `frontend.yml` avant le build. Premier pass = 21 erreurs traitées dans le même commit (a11y `(keydown.enter)` + `role="button"` sur les divs cliquables, `prefer-inject` migré, labels mal-placés convertis en `<span class="filter-label">`, ternaires en statement transformés en `if/else`, imports non utilisés supprimés).
- ✅ **Doc-maintainer subagent** : `.claude/agents/doc-maintainer.md` (Read/Glob/Grep, no Edit, no Bash) + slash command `/doc-maintainer` qui spawne un audit en contexte isolé. Trois capacités : cross-check factuel, ton, cross-link. Rendu en punch-list HIGH/MED/LOW.

### Backend

- Module `market/` : port `MarketChartClient` qui retourne un `MarketChart` (types domaine `TickerQuote` + `List<OhlcBar>`). Deux adapters :
  - `TwelveDataClient` (REST + apikey, défaut prod) — deux endpoints `/time_series` + `/quote`, cache Caffeine 15 min, parser tolérant aux quirks (numériques en strings, erreurs HTTP 200 avec `status: error`), timeouts connect 5 s + read 10 s.
  - `MockMarketChartClient` (synthétique déterministe par symbole, défaut sans clé pour CI / onboarding). Symboles réservés `UNKNOWN` (404) et `RATELIMIT` (503).
- `IndicatorCalculator` Kotlin pur, 20+ tests.
- Pipeline narratif LLM async : `Service → Runner @Async → Executor (parse + validate + 1 retry) → Persister`. Cache snapshot 30 min, dedup job 5 min. Validateur strict : 3-5 keyPoints, ≤15 mots, summary 2-3 phrases, sentiment ∈ enum.
- Module `watchlist/` (Phase 2) : entity `WatchlistEntry`, service avec normalisation + add idempotent + remove 404 si absent, controller 3 endpoints REST.
- Module `config/` (Phase 2) : `AppConfigService` (read layered YAML/BDD, write-through + `ConfigChangedEvent`), `ConfigController` (CRUD + endpoints `/test/{provider}` qui sondent une clé candidate sans la sauver), `ConfigTestClient` (RestClient dédié), `RoutingMarketChartClient` + `RoutingNewsClient` (`@Primary`) délèguent par appel, `CacheTtlListener` rebuild la spec Caffeine sur event TTL.
- Listener `OrphanedJobCleanupListener` (au boot, `ApplicationReadyEvent`) : flip tous les `PENDING` en `ERROR` sur `ticker_narrative_job` + `analysis_job`.
- Migrations Flyway : V1 init, V2 ticker_narrative, V3 watchlist_entry, V4 app_config.
- Endpoints : `GET /api/market/ticker/{symbol}` (dossier complet), `GET .../chart?timeframe=` (bars only multi-timeframe), `POST/GET /narrative/...` (kick + poll + latest), `GET /narrative/preview` (preview prompt), `GET /api/portfolios/owned-tickers`, `GET POST DELETE /api/watchlist[/symbol]`.

### Frontend

- Page Dossier ticker : graphe SVG inline avec **toggle multi-timeframe** (`1D / 5D / 1M / 3M / 1Y / 5Y`), **axes prix + dates** + grille pointillée, **crosshair au survol** + tooltip date/prix, 10 chips d'indicateurs avec color-coding (RSI/MA/perf/drawdown), **bouton "Suivre / Suivi"** (watchlist toggle), narratif IA (sentiment chip BULLISH/NEUTRAL/BEARISH coloré, summary, bullets, footer modèle+date), bouton Régénérer avec polling.
- Dashboard : sidebar **3 sections collapsables** (Portefeuilles / Tickers détenus / Watchlist) avec total agrégé tous portefeuilles, liste cliquable des tickers détenus (`owned-tickers` agrégé serveur, pas de N+1), **input watchlist** + liste cliquable + icône poubelle. Scrollbar custom 8px.
- Settings adaptés Phase 1 : `prompt-preview` par ticker (input libre + suggestions), `test-sources` étendu avec test ticker.
- **i18n FR/EN** via `ngx-translate` (TranslatePipe) + `LanguageService` signal-based. Drapeaux unicode dans le header.
- **Zoneless explicite** (`provideZonelessChangeDetection()` dans `app.config.ts`).

### Tests

- Backend : `IndicatorCalculatorTest` (20+), `MockMarketChartClientTest` (9, ajouts intraday/weekly/seed), `TwelveDataClientTest` (9), `TwelveDataMappersTest` (5), `MarketControllerTest` (5, slice MVC chart endpoint), `TickerNarrativeServiceTest` (8), `TickerNarrativePrompt/Parser/Validator` (17), `TickerNarrativePreviewControllerTest` (2), `PortfolioControllerTest` enrichi (owned-tickers), `WatchlistControllerTest` (7).
- Frontend : adapters HTTP (incl. `watchlist.http.spec`), ticker page (incl. timeframe toggle + watchlist), dashboard (incl. owned tickers + watchlist add/remove/rollback), suivi, csv-import, narrative flow complet.

### Décisions techniques notables (consolidées)

- **Provider primaire = Twelve Data**. Yahoo a été tenté (cookie+crumb dance complet) puis supprimé : ban IP résidentielles + VPN + cellulaire, pas viable pour un projet perso à IP unique. Code Yahoo consultable dans l'historique git (commit `b993440`) si besoin de rejouer.
- **Twelve Data quirks** absorbés par le client : numériques en strings JSON (toBigDecimalOrNull tolère ""/NaN), erreurs en HTTP 200 avec `status: error` (parser inspecte le body), code 404/429/401 mappés respectivement vers `NoSuchElementException` / `MarketUnavailableException("rate-limited")` / `auth-failed`. Clé API absente → exception explicite avant l'appel HTTP.
- **Port en types domaine** (`MarketChart` au lieu de la forme upstream brute) — un provider supplémentaire = un nouvel adapter, zero churn ailleurs.
- **HTTP timeouts** sur `TwelveDataHttpConfig` (connect 5 s, read 10 s) via `JdkClientHttpRequestFactory` pour éviter de hanger un thread Tomcat sur DNS / TLS lent.
- **CI cache 3-tier via `gradle/actions/setup-gradle@v4`** (backend.yml + codeql.yml) : dependency / build / configuration caches gérés par l'action officielle Gradle, mode `cache-read-only` sur les PRs pour éviter le thrash, build cache partagé entre `backend.yml` et `codeql.yml` sur master. Frontend cache l'incrémental Angular (`.angular/cache`) avec key bicéphale `package-lock + angular.json`. CodeQL active `trap-caching: true` (cache la BDD extraite par langage, ~2 min cold → 30 s incrémental).
- **Detekt tuning pragmatique** (217 → 26 findings) — exclusions ciblées sur `LongParameterList` pour `@Entity` / `@Embeddable`, `MagicNumber` whitelist HTTP / percent / timeouts + excludes Mock + IndicatorCalculator, `WildcardImport` autorise jakarta/spring/junit, `TooGenericExceptionCaught` exclut adapters HTTP. `ignoreFailures = true` pour l'instant — bascule à `false` quand on aura un baseline propre. Workaround Kotlin 2.1 : `resolutionStrategy` pin la classpath Detekt sur Kotlin 2.0.10 (Detekt 1.23.7 compilé contre 2.0.10).
- **Doc ops centralisée** (`docs/technique/ops.md`) — workflows GitHub Actions, stratégie de cache, permissions GITHUB_TOKEN minimales par workflow, Code Scanning (CodeQL + Detekt SARIF), Dependabot, troubleshooting. Cross-référencée depuis `architecture.md`, `developper.md`, `developpement.md` et ajoutée à la nav mkdocs avec `providers.md`.

## Reprise possible — par ordre d'utilité

### Dette technique (cf. `backlog.md`)

A. **Items de l'audit 2026-05-02 non fixés** : contrat preview CSV cassé (front lit `bookValue`, back envoie `bookValueCad`), `@EnableAsync` sans `ThreadPoolTaskExecutor`, N+1 sur la timeline snapshots.

B. **`provideRepositories()` côté frontend** 🟢 — extraire les 8 lignes répétitives `{ provide: XxxRepository, useClass: HttpXxxRepository }` de `app.config.ts` dans `core/providers.ts` via `makeEnvironmentProviders([...])`. ~15 min.

### Phase 2 — restant à attaquer

Multi-timeframe, watchlist, news, settings runtime, jobs orphelins, ESLint et doc-maintainer livrés. Prochains items (cf. `metier/fonctionnalites.md` et `backlog.md`) : **chart : analyse interactive** (zoom drag-select, overlays MA, annotations), **comparaison vs benchmark**, **recommandations analystes / earnings**, **watchlist v2** (autocomplete + validation).
