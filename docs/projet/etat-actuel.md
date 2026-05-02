# État actuel — fin Phase 1 (2026-05-02)

Snapshot de la session de clôture Phase 1. Pour reprendre proprement à la prochaine session.

## Branches / tags

- Branche : `master`
- Derniers tags :
  - `v0.1.0` — clôture **Phase 0** (recommandations RSS, gelée)
  - **`v0.2.0`** — clôture **Phase 1 — Pivot ticker** ✅ (ce tag vient d'être poussé)
- Working tree : **clean** post-tag.

## Phase 1 — bilan

100 % livrée. Tout le critique 🔴, le médium 🟡 et le basse 🟢 listé dans `backlog.md` sont ✅.

### Backend

- Module `market/` : `MarketChartClient` (port) + `YahooClient` (real HTTP, **cookie+crumb auth via `YahooSession`**, JDK 11+ `HttpClient`) + `MockMarketChartClient` (déterministe par symbole). `IndicatorCalculator` Kotlin pur, 20+ tests.
- Pipeline narratif LLM async : `Service → Runner @Async → Executor (parse + validate + 1 retry) → Persister`. Cache snapshot 30 min, dedup job 5 min. Validateur strict : 3-5 keyPoints, ≤15 mots, summary 2-3 phrases, sentiment ∈ enum.
- Migration Flyway V2 : `ticker_narrative_snapshot` + `ticker_narrative_job`.
- Endpoints : `GET /api/market/ticker/{symbol}` (dossier complet), `POST/GET /narrative/...` (kick + poll + latest), `GET /narrative/preview` (preview prompt), `GET /api/portfolios/owned-tickers`.

### Frontend

- Page Dossier ticker : graphe SVG inline, 10 chips d'indicateurs avec color-coding (RSI/MA/perf/drawdown), narratif IA (sentiment chip BULLISH/NEUTRAL/BEARISH coloré, summary, bullets, footer modèle+date), bouton Régénérer avec polling.
- Dashboard : total agrégé tous portefeuilles dans la sidebar, liste cliquable des tickers détenus (`owned-tickers` agrégé serveur, pas de N+1).
- Settings adaptés Phase 1 : `prompt-preview` par ticker (input libre + suggestions), `test-sources` étendu avec test ticker Yahoo.
- **i18n FR/EN** via `ngx-translate` (TranslatePipe) + `LanguageService` signal-based. Drapeaux unicode dans le header.
- **Zoneless explicite** (`provideZonelessChangeDetection()` dans `app.config.ts`).

### Tests

- Backend : `IndicatorCalculatorTest` (20+), `YahooMappersTest` (6 fixtures), `MockMarketChartClientTest` (6), `YahooClientTest` (9 — happy + 401 retry + erreurs + headers via MockWebServer), `TickerNarrativeServiceTest` (8 — 3 branches dedup/cache/kick + normalisation), `TickerNarrativePrompt/Parser/Validator` (17), `TickerNarrativePreviewControllerTest` (2), `PortfolioControllerTest` enrichi (owned-tickers).
- Frontend : 84 tests (14 fichiers). Adapters HTTP, ticker page, dashboard (incl. owned tickers), suivi, csv-import, narrative flow complet.

### Decisions techniques notables

- `JdkClientHttpRequestFactory` au lieu de `SimpleClientHttpRequestFactory` — le second n'a pas de cookie-handling et strip silencieusement `Origin` + `Sec-Fetch-*`.
- Cookie+crumb `YahooSession` (modèle `yfinance`) — découvert nécessaire après diag Yahoo.
- `mockwebserver` (test) pour valider toutes les branches HTTP du `YahooClient`.
- `mockito-kotlin` ajouté pour des matchers null-safe sur les services.

## Validation live Yahoo — toujours en suspens

Le code cookie+crumb est correct (validé par 9 tests + cohérent avec les bibliothèques de référence) **mais aucune IP testée aujourd'hui n'a permis de valider l'API Yahoo en live** :

- IP résidentielle EBOX → 429
- NordVPN (datacenter Datacamp) → 429
- Cellulaire Videotron Mobile → 429

Yahoo bloque l'API gateway `query1.finance.yahoo.com` au niveau IP, indépendamment des cookies. Le HTML `finance.yahoo.com` répond lui en 200, donc ce n'est pas un ban global. À retester quand le score IP retombe (24-48h sans tape).

→ Validation à faire à la prochaine session via : tethering 4G d'un autre opérateur, attente, ou bascule **Twelve Data** (ajouté en dette technique).

## Reprise possible — par ordre d'utilité

### Dette technique (cf. `backlog.md`)

A. **Twelve Data ou Finnhub provider** 🟡 — plan B si Yahoo continue à rate-limiter. ~1h, branchable comme un nouveau `MarketChartClient`.

B. **Cleanup des jobs orphelins au boot** 🟡 — listener `ApplicationReadyEvent` qui passe les `PENDING` en `ERROR`. ~15 min.

C. **Items de l'audit 2026-05-02 non fixés** : contrat preview CSV cassé (front lit `bookValue`, back envoie `bookValueCad`), `@EnableAsync` sans `ThreadPoolTaskExecutor`, N+1 sur la timeline snapshots.

### Phase 2 — ouverte

Quand on attaque (cf. `metier/fonctionnalites.md`) : multi-timeframe sur le graphe, news Yahoo par ticker, comparaison vs benchmark, watchlist persistée, recommandations analystes / earnings.
