# État actuel — 2026-05-01

Snapshot de la session pour reprendre proprement la prochaine fois. Le détail long vit dans `backlog.md` ; ce fichier ne note **que ce qui est en l'air maintenant**.

## Branche / tag

- Branche : `master`
- Dernier tag : `v0.1.0` — clôture de la **Phase 0**
- Dernier commit : `feat(market): add Yahoo client, indicator calculator and ticker dossier endpoint`

## Phase en cours

**Phase 1 — Pivot ticker** (cf. `metier/fonctionnalites.md`).

LLM = rédacteur, pas décideur. Yahoo Finance + indicateurs calculés serveur, narratif LLM par ticker.

## Ce qui marche (commit `feat(market)`)

Backend `market/` :
- `IndicatorCalculator` (Kotlin pur) — RSI(14), MA50, MA200, momentum 30j/90j, perf 1m/3m/1y, drawdown 52w, volume relatif, distance vs MA. 20+ tests unit.
- `YahooClient` + `YahooMappers` — fetch chart endpoint, parsing OHLC + quote. 6 tests sur les mappers (fixtures JSON inline).
- `TickerService` orchestre Yahoo + Calculator → `TickerSnapshot`.
- `MarketController` expose `GET /api/market/ticker/{symbol}`.

## Ce qui est en working tree (uncommitted)

À grouper en 1 ou 2 commits à la reprise.

### Backend (cache + erreur propre 429)

- `build.gradle.kts` : ajout `spring-boot-starter-cache` + `caffeine`
- `market/MarketConfig.kt` : `@EnableCaching`, Caffeine 15 min / 500 entrées max, cache `yahoo-chart`
- `market/infrastructure/market/YahooClient.kt` : `@Cacheable` sur `fetchChart` + try/catch HttpClientError → `MarketUnavailableException` (sauf 404 → `NoSuchElementException`)
- `market/domain/MarketUnavailableException.kt` (nouveau)
- `shared/GlobalExceptionHandler.kt` : handler `MarketUnavailableException` → HTTP 503

### Backend (fix test)

- `market/application/IndicatorCalculator.kt` : `drawdownFromHigh` requiert `size >= 2` (sinon retournait 0 avec 1 bar, le test "single bar leaves indicators null" échouait)
- `market/application/IndicatorCalculatorTest.kt` : `kotlin.random.Random` au lieu de `java.util.Random` (la signature de `List.shuffled` n'accepte que la version Kotlin)

### Frontend (page Dossier ticker)

- `core/market.repository.ts` (port abstract class + types TS)
- `core/adapters/market.http.ts` + `.spec.ts` (HttpMarketRepository + 2 tests)
- `app.config.ts` : provider `MarketRepository`
- `app.routes.ts` : route `ticker/:symbol`
- `features/ticker/ticker.{ts,html,scss}` : page dossier — header, courbe SVG inline (pas de dep ajoutée), 10 chips d'indicateurs avec color-coding, plage 52w, gestion 404/503/autre dans `errorMessage()`
- `features/ticker/ticker.spec.ts` : 4 tests
- `features/dashboard/dashboard.{ts,html,scss,spec.ts}` : ticker dans la table devient `routerLink="/ticker/:symbol"`, ajout `provideRouter([])` au TestBed

## Problème ouvert

**Yahoo IP rate-limit (429)** — l'environnement local est actuellement banni par Yahoo. Le cache et le path d'erreur fonctionnent (le 503 remonte propre côté UI), mais la première requête échoue tant que Yahoo n'a pas levé (typiquement 5-15 min, parfois plus).

Le bug se manifeste par `MarketUnavailableException: rate-limited` dans les logs backend.

## Reprise possible — par ordre d'utilité

### Court terme (déblocage Yahoo)

A. **Headers plus convaincants** (5 min) : `Accept-Language`, `Sec-Fetch-*`, `Referer: https://finance.yahoo.com/`, UA Chrome plus récent. Réduit la fréquence des bans.

B. **Profil mock pour le dev** (15 min) : `application-local.yml` avec `llm.provider: ollama` ET `yahoo.provider: mock` (à introduire), `YahooClient` chargé depuis une fixture JSON quand mock. Permet d'itérer sur l'UI sans dépendre de Yahoo.

### Phase 1 reste à faire

C. **Pipeline narratif LLM par ticker** : `TickerNarrativeService` + nouveau prompt court (input `{ticker, price, indicators, fundamentals}`, output `{summary, sentiment, keyPoints[]}`), migration Flyway V2 `ticker_narrative_snapshot`, endpoint `POST /api/market/ticker/{symbol}/narrative` async + polling. **C'est le cœur de la valeur Phase 1.**

D. **Plan B Yahoo** : si les 429 persistent, basculer sur Twelve Data ou Finnhub (clé API gratuite, beaucoup plus stable).

## À faire avant de commit en sortie de session

1. Vérifier que `IndicatorCalculatorTest` passe en local (les fixes de cette session : `Random` import + `drawdownFromHigh` size < 2)
2. Décider du découpage des commits :
   - Option simple : 1 commit `feat(market): cache Yahoo responses and surface clean 503 on rate-limit` qui regroupe le cache + l'erreur + le fix tests
   - Option propre : 3 commits — `fix(indicators): require >= 2 bars for drawdown`, `feat(market): cache Yahoo via Caffeine`, `feat(market): surface 503 on Yahoo rate-limit`, puis `feat(ticker): add dossier page with chart and indicator chips`
