# État actuel — Phase 2 entamée, multi-timeframe livré (2026-05-03)

Snapshot après le premier livrable Phase 2 (multi-timeframe + axes/crosshair). Pour reprendre proprement à la prochaine session.

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

### Backend

- Module `market/` : port `MarketChartClient` qui retourne un `MarketChart` (types domaine `TickerQuote` + `List<OhlcBar>`). Deux adapters :
  - `TwelveDataClient` (REST + apikey, défaut prod) — deux endpoints `/time_series` + `/quote`, cache Caffeine 15 min, parser tolérant aux quirks (numériques en strings, erreurs HTTP 200 avec `status: error`), timeouts connect 5 s + read 10 s.
  - `MockMarketChartClient` (synthétique déterministe par symbole, défaut sans clé pour CI / onboarding). Symboles réservés `UNKNOWN` (404) et `RATELIMIT` (503).
- `IndicatorCalculator` Kotlin pur, 20+ tests.
- Pipeline narratif LLM async : `Service → Runner @Async → Executor (parse + validate + 1 retry) → Persister`. Cache snapshot 30 min, dedup job 5 min. Validateur strict : 3-5 keyPoints, ≤15 mots, summary 2-3 phrases, sentiment ∈ enum.
- Migration Flyway V2 : `ticker_narrative_snapshot` + `ticker_narrative_job`.
- Endpoints : `GET /api/market/ticker/{symbol}` (dossier complet), `POST/GET /narrative/...` (kick + poll + latest), `GET /narrative/preview` (preview prompt), `GET /api/portfolios/owned-tickers`.

### Frontend

- Page Dossier ticker : graphe SVG inline avec **toggle multi-timeframe** (`1D / 5D / 1M / 3M / 1Y / 5Y`), **axes prix + dates** + grille pointillée, **crosshair au survol** + tooltip date/prix, 10 chips d'indicateurs avec color-coding (RSI/MA/perf/drawdown), narratif IA (sentiment chip BULLISH/NEUTRAL/BEARISH coloré, summary, bullets, footer modèle+date), bouton Régénérer avec polling.
- Dashboard : total agrégé tous portefeuilles dans la sidebar, liste cliquable des tickers détenus (`owned-tickers` agrégé serveur, pas de N+1).
- Settings adaptés Phase 1 : `prompt-preview` par ticker (input libre + suggestions), `test-sources` étendu avec test ticker.
- **i18n FR/EN** via `ngx-translate` (TranslatePipe) + `LanguageService` signal-based. Drapeaux unicode dans le header.
- **Zoneless explicite** (`provideZonelessChangeDetection()` dans `app.config.ts`).

### Tests

- Backend : `IndicatorCalculatorTest` (20+), `MockMarketChartClientTest` (6), `TwelveDataClientTest` (9 — happy + URL + fallback 52w + mappings d'erreur 200/HTTP + blank API key), `TwelveDataMappersTest` (5 — halted, DESC→ASC, intraday, parseTimestamp), `TickerNarrativeServiceTest` (8 — 3 branches dedup/cache/kick + normalisation), `TickerNarrativePrompt/Parser/Validator` (17), `TickerNarrativePreviewControllerTest` (2), `PortfolioControllerTest` enrichi (owned-tickers).
- Frontend : 84 tests (14 fichiers). Adapters HTTP, ticker page, dashboard (incl. owned tickers), suivi, csv-import, narrative flow complet.

### Décisions techniques notables (consolidées)

- **Provider primaire = Twelve Data**. Yahoo a été tenté (cookie+crumb dance complet) puis supprimé : ban IP résidentielles + VPN + cellulaire, pas viable pour un projet perso à IP unique. Code Yahoo consultable dans l'historique git (commit `b993440`) si besoin de rejouer.
- **Twelve Data quirks** absorbés par le client : numériques en strings JSON (toBigDecimalOrNull tolère ""/NaN), erreurs en HTTP 200 avec `status: error` (parser inspecte le body), code 404/429/401 mappés respectivement vers `NoSuchElementException` / `MarketUnavailableException("rate-limited")` / `auth-failed`. Clé API absente → exception explicite avant l'appel HTTP.
- **Port en types domaine** (`MarketChart` au lieu de la forme upstream brute) — un provider supplémentaire = un nouvel adapter, zero churn ailleurs.
- **HTTP timeouts** sur `TwelveDataHttpConfig` (connect 5 s, read 10 s) via `JdkClientHttpRequestFactory` pour éviter de hanger un thread Tomcat sur DNS / TLS lent.

## Reprise possible — par ordre d'utilité

### Dette technique (cf. `backlog.md`)

A. **Cleanup des jobs orphelins au boot** 🟡 — listener `ApplicationReadyEvent` qui passe les `PENDING` en `ERROR`. ~15 min.

B. **Items de l'audit 2026-05-02 non fixés** : contrat preview CSV cassé (front lit `bookValue`, back envoie `bookValueCad`), `@EnableAsync` sans `ThreadPoolTaskExecutor`, N+1 sur la timeline snapshots.

### Phase 2 — restant à attaquer

Multi-timeframe livré. Prochains items (cf. `metier/fonctionnalites.md` et `backlog.md`) : **chart : analyse interactive** (zoom drag-select, overlays MA, annotations), **news par ticker**, **comparaison vs benchmark**, **watchlist persistée**, **recommandations analystes / earnings**, **settings & config runtime** (clé API + TTL cache éditables depuis l'UI).
