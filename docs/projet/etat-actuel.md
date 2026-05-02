# État actuel — 2026-05-02

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

Mock provider de marché — à grouper en 1 commit à la reprise.

### Backend

- `market/infrastructure/market/MarketChartClient.kt` (nouveau) — interface port, méthode `fetchChart`
- `market/infrastructure/market/YahooClient.kt` — implémente `MarketChartClient`, gardé par `@ConditionalOnProperty(name="yahoo.provider", havingValue="yahoo", matchIfMissing=true)`
- `market/infrastructure/market/MockMarketChartClient.kt` (nouveau) — génère 260 bars OHLC déterministes par symbole (seed = `symbol.hashCode()`), random walk avec drift + vol propres au symbole. 260 et pas 252 pour donner le headroom aux indicateurs lookback=252 (perf1y) qui exigent strictement `size > lookback`. Symboles réservés `UNKNOWN` (404) et `RATELIMIT` (503) pour exercer les paths d'erreur. Activé par `yahoo.provider: mock`.
- `market/application/TickerService.kt` — dépend maintenant de l'interface `MarketChartClient`.
- `application.yml` — ajout `yahoo.provider: yahoo` (défaut prod).
- `application-local.yml` — ajout `yahoo.provider: mock` (dev local).
- `MockMarketChartClientTest.kt` (nouveau) — 6 tests : forme du payload, déterminisme, divergence inter-symboles, cohérence meta vs série, paths réservés.

### Docs

- `docs/technique/architecture.md` — décision technique "Provider de marché abstrait + mock local" ajoutée.
- `docs/projet/etat-actuel.md` — ce fichier.

## Reprise possible — par ordre d'utilité

### Phase 1 reste à faire

A. **Pipeline narratif LLM par ticker** : `TickerNarrativeService` + nouveau prompt court (input `{ticker, price, indicators, fundamentals}`, output `{summary, sentiment, keyPoints[]}`), migration Flyway V2 `ticker_narrative_snapshot`, endpoint `POST /api/market/ticker/{symbol}/narrative` async + polling. **Cœur de valeur Phase 1.** Le mock débloque l'itération sans dépendre de Yahoo.

B. **Page dossier — narratif** : afficher la sortie du pipeline (sentiment + bullets + résumé), gérer l'état "en cours de génération" (polling).

C. **Plan B Yahoo (si on relance Yahoo en prod)** : headers plus convaincants (`Accept-Language`, `Sec-Fetch-*`, `Referer`) ou bascule Twelve Data / Finnhub.

## À faire avant de commit en sortie de session

1. Vérifier que `MockMarketChartClientTest` passe en local.
2. Commit unique proposé : `feat(market): add mock chart provider for local dev` (interface + impls + config + test).
