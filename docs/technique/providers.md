# Providers externes

Référence opérationnelle des services externes utilisés par PortfolioAI : où s'inscrire, où trouver sa clé, quotas, et comment ils sont câblés dans le code. Mis à jour à chaque ajout / changement de provider.

> **TL;DR pour onboarder rapidement** : tu as besoin d'une clé Twelve Data, d'une clé Finnhub, d'une clé Anthropic Claude (optionnel — Ollama local couvre offline). Toutes sont en free tier suffisant pour un usage perso. Liste complète et liens d'inscription ci-dessous.

---

## Twelve Data — données de marché

| | |
|---|---|
| **Site** | [https://twelvedata.com](https://twelvedata.com) |
| **Inscription** | [https://twelvedata.com/register](https://twelvedata.com/register) (email + mot de passe, pas de carte requise pour le free tier) |
| **Dashboard / clé** | [https://twelvedata.com/account/api-keys](https://twelvedata.com/account/api-keys) |
| **Free tier** | 800 credits/jour · 8 calls/min · couverture US, TSX (XTSE), grandes places EU et Asie |
| **Endpoints utilisés** | `/time_series` (OHLC), `/quote` (nom + 52w + close), `/symbol_search` (autocomplete watchlist v2). **Note** : `/profile` (sector GICS) n'est plus utilisé — paid-tier only, remplacé par Finnhub `/stock/profile2` côté `FinnhubSectorClassifier` |
| **Config** | `market.twelvedata.api-key` (env `TWELVEDATA_API_KEY`) |
| **Adapter** | `TwelveDataClient` + `TwelveDataSymbolSearchClient` (tous deux sélectionnés par `market.provider: twelvedata`) |
| **Cache** | Caffeine `market-chart` (chart), `symbol-search` (autocomplete). TTL 15 min partagé via `market.cache.ttl-minutes` |

**Quirks à connaître** : numériques retournés en string JSON (`"open": "180.00"`), erreurs en HTTP 200 avec `status: error` dans le body. Le client absorbe les deux. Voir [`architecture.md`](./architecture.md) section "Twelve Data — quirks à absorber".

---

## Finnhub — news par ticker + recommandations analystes + earnings

| | |
|---|---|
| **Site** | [https://finnhub.io](https://finnhub.io) |
| **Inscription** | [https://finnhub.io/register](https://finnhub.io/register) (email + mot de passe, pas de carte requise) |
| **Dashboard / clé** | [https://finnhub.io/dashboard](https://finnhub.io/dashboard) |
| **Free tier** | 60 calls/min · pas de cap quotidien · large agrégation de sources presse financière (Reuters, Bloomberg, CNBC…) + breakdown analystes monthly + earnings 4 derniers Q |
| **Endpoints utilisés** | `/company-news?symbol=...&from=...&to=...` (Phase 2 news), `/stock/recommendation?symbol=...` (Phase 2 analyst — breakdown monthly), `/stock/price-target?symbol=...` (Phase 2 analyst — price target 12 mois, fail-soft à `null` sur 401/403 paid tier), `/stock/earnings?symbol=...` (Phase 2 earnings — historique 4 derniers Q EPS estimate/actual/surprise), `/calendar/earnings?from=...&to=...&symbol=...` (Phase 2 earnings — prochaine annonce sur fenêtre 90 j, fail-soft à `null` sur 401/403 paid tier), `/stock/profile2?symbol=...` (Phase 2 benchmark v2 — `finnhubIndustry` → SPDR ETF mapping via `SpdrSectorEtfs`. Remplace Twelve Data `/profile` paid-tier) |
| **Config** | `news.provider: finnhub` (news) + `analyst.provider: finnhub` (recos analystes) + `earnings.provider: finnhub` (earnings) + `market.finnhub.api-key` (env `FINNHUB_API_KEY`) — clé partagée. Le sector benchmark utilise aussi Finnhub mais via le toggle `market.provider` (pas de `sector.provider` dédié) — détail caché derrière `RoutingSectorClassifier` |
| **Adapter** | `FinnhubClient` (sélectionné par `news.provider: finnhub`) + `FinnhubAnalystClient` (sélectionné par `analyst.provider: finnhub`) + `FinnhubEarningsClient` (sélectionné par `earnings.provider: finnhub`) + `FinnhubSectorClassifier` (sélectionné par `market.provider: twelvedata` — le routage sector route en réalité vers Finnhub car Twelve Data `/profile` est paid-tier only) |
| **Mock alternative** | `MockNewsClient` (sélectionné par `news.provider: mock`, défaut) — feed synthétique déterministe par symbole, ~10 % de tickers "quiet" qui retournent une liste vide pour exercer l'empty-state UI. `MockAnalystClient` (sélectionné par `analyst.provider: mock`, défaut) — breakdown synthétique déterministe (~50 % bullish / ~30 % mixed / ~20 % bearish, drift mois-sur-mois), symboles réservés `UNKNOWN` (404), `RATELIMIT` (503), `NOTARGET` (priceTarget=null). `MockEarningsClient` (sélectionné par `earnings.provider: mock`, défaut) — EPS bande $0.30–$3.50 + surprise ±15 % + next-date 1–60 j, symboles réservés `UNKNOWN` (404), `RATELIMIT` (503), `NOCALENDAR` (nextEarningsDate=null) |
| **Cache** | Caffeine `news-by-symbol` (TTL 15 min, key `{symbol}\|{limit}`) + `analyst-recommendations` (TTL 15 min, key `{symbol}`) + `earnings` (TTL 15 min, key `{symbol}`) + `sector-by-symbol` (TTL 15 min, key `{symbol}`) — TTL partagé via `market.cache.ttl-minutes` |

Pourquoi Finnhub plutôt que Twelve Data pour les news : Twelve Data n'expose pas d'endpoint news public (testé en live, retourne 404). Finnhub couvre ce besoin avec un free tier plus généreux que d'autres concurrents (Alpha Vantage 25/jour, Polygon 5/min EOD only). Idem côté analyst recommendations et earnings : `/stock/recommendation` et `/stock/earnings` sont en free tier sans paywall, ce qui n'est pas le cas chez la plupart des concurrents.

**Économiser les credits en itération** : les trois mocks sont le défaut sur `application.yml` justement pour qu'un onboarding clone tourne sans clé Finnhub, et que le développement quotidien ne fasse pas chauffer le compteur. Bascule sur `news.provider: finnhub`, `analyst.provider: finnhub` et/ou `earnings.provider: finnhub` dans `application-local.yml` (ou via `/settings/configuration`) quand tu veux tester un vrai feed — chacun se flippe indépendamment.

---

## Polygon / Massive — radar de marché (Phase 6)

| | |
|---|---|
| **Site** | [https://massive.com](https://massive.com) (ex-`polygon.io`, rebrand 2026 ; `polygon.io` redirige 301 vers `massive.com`) |
| **Inscription** | [https://massive.com/signup](https://massive.com/signup) (email + password, pas de carte requise sur le free Basic) |
| **Dashboard / clé** | [https://massive.com/dashboard/keys](https://massive.com/dashboard/keys) |
| **Free tier** | Stocks Basic : 5 req/min · pas de cap quotidien · **EOD only** (pas de snapshot real-time) · data adjusted pour splits |
| **Endpoints utilisés** | `/v2/aggs/grouped/locale/us/market/stocks/{date}?adjusted=true` (Phase 6 radar v0.2 — OHLCV pour tous les US stocks sur une date donnée. 2 calls par refresh : jour le plus récent + précédent, join in-memory par symbole), `/v3/reference/tickers?limit=1` (probe `testPolygon` — cheap ~200 bytes) |
| **Config** | `screener.provider: polygon` + `screener.polygon.api-key` (env `POLYGON_API_KEY`) — **les deux éditables au runtime** depuis `/settings/configuration > Providers de données` (carte « Provider du radar de marché » + carte « Polygon (Massive) — clé API » avec bouton Tester) |
| **Adapter** | `PolygonMarketScreenerClient` (sélectionné par `screener.provider: polygon` via `RoutingMarketScreenerClient @Primary`) — base URL `https://api.massive.com` (overridable via `screener.polygon.base-url`), calendar walk-back jusqu'à 6 jours pour absorber weekends + jours fériés |
| **Mock alternative** | `MockMarketScreenerClient` (sélectionné par `screener.provider: mock`, défaut) — snapshot synthétique 13 tickers (`RDDT`, `SOFI`, `AFRM`, `WBD`, `PARA`, `LCID`, `ROKU`, `PINS`, `Z`, `TWLO`, `CHWY`, `PLTR`, `F`) avec dispersion gap %/volume/cap/sector pour exercer tous les filtres |
| **Cache** | Aucun v0.2 — 2 calls par refresh (worst-case 12 sur long weekend). Cache adapter-level (TTL ~5-15 min, EOD ne change pas dans la journée) filed en follow-up Phase 6 (1ter) — particulièrement pertinent depuis le pivot grouped-daily |
| **Probe** | `POST /api/config/test/polygon` accepte une clé candidate non sauvée, round-trip `/v3/reference/tickers?limit=1` — utilisé par le bouton « Tester » de la card Settings |
| **Latence** | ~200-500 ms par call grouped-daily (~500 kB-1 MB selon le jour) |

### Pivot endpoint v0.1 → v0.2 (2026-05-27)

Cible initiale Phase 6 Sprint 2 : `GET /v2/snapshot/locale/us/markets/stocks/tickers` (1 call, real-time, `todaysChangePerc` pré-calculé). Testé live avec une clé Basic free → retour `403 Polygon plan does not allow this endpoint`. L'endpoint snapshot requiert **Polygon Stocks Starter (~$29/mo)** — n'est pas dans le free Basic.

Pivot même jour sur `GET /v2/aggs/grouped/locale/us/market/stocks/{date}` qui **est inclus dans le free Basic**. Algorithme adapter :
1. Walk-back depuis « today » (US/Eastern) jusqu'à 6 jours pour trouver le jour de trading le plus récent avec des bars non vides (`t1`).
2. Walk-back depuis `t1 - 1 jour` jusqu'à 6 jours pour le jour précédent (`t0`).
3. Join des deux payloads par `T` (symbole), compute `gapPct = (t1.c - t0.c) / t0.c * 100`, `volumeRatio = t1.v / t0.v`.
4. Skip les tickers absents de `t0` (IPO récents).

**Conséquence UX** : le radar surface « ce qui a beaucoup bougé hier » plutôt que « ce qui bouge live à l'open ». Pour un pump precursor qui fade dans la journée, c'est moins actionnable, mais c'est le signal honnête disponible en free tier. Upgrade Starter $29/mo unlock real-time snapshot — swap touche uniquement `PolygonMarketScreenerClient` (le port `MarketScreenerClient` reste stable).

**Dégradation enrichissement carry-over** : le grouped-daily endpoint (comme le snapshot) ne porte ni `name`, ni `exchange`, ni `sector`, ni `marketCapUsd`, ni `volumeAvg30d`. L'adapter fill avec sentinelles honnêtes (`name = T`, `exchange = ""`, `sector = null`, `marketCapUsd = 0L`, `volumeAvg30d = t0.v` proxy single-day). Conséquences UX : filtres cap-range et sector **no-op** côté Polygon ; `volumeRatio` répond « aujourd'hui vs hier » plutôt qu'« aujourd'hui vs moyenne 30j ». Enrichissement complet via cron nightly (`/v3/reference/tickers` pour name/exchange/sector/cap + `/v2/aggs/grouped` sur 30j pour la vraie moyenne) filed en follow-up Phase 6 (1bis).

**Pourquoi Polygon plutôt que Finnhub / FMP / Alpaca pour le radar** : seul Polygon expose un endpoint free-tier qui retourne des bars pour tous les US stocks en 1 call. Les 3 autres demandent une boucle per-ticker (Finnhub `/quote` × N, FMP `/v3/stock/{symbol}` × N, Alpaca `/v2/stocks/snapshots/{symbol}` × N) incompatible avec un radar à l'ouverture — un scan de 3500 tickers × 60 ms = 3.5 min par cycle, et le quota free tier vide en une session.

**Rebrand Polygon → Massive** : le slug `polygon` est gardé partout dans le code (config keys `screener.polygon.api-key`, classes `PolygonMarketScreenerClient`, beans `polygonRestClient`) pour rester grep-friendly. Seule la base URL est en `api.massive.com`.

---

## FMP (Financial Modeling Prep) — radar de marché (Phase 6 v0.3)

| | |
|---|---|
| **Site** | [https://site.financialmodelingprep.com](https://site.financialmodelingprep.com) |
| **Inscription** | [https://site.financialmodelingprep.com/register](https://site.financialmodelingprep.com/register) (email + password, pas de carte) |
| **Dashboard / clé** | [https://site.financialmodelingprep.com/developer/docs/dashboard](https://site.financialmodelingprep.com/developer/docs/dashboard) |
| **Free tier** | 250 req/jour · pas de cap par minute · données EOD-ish (refreshées par FMP côté serveur) · ~50 entries par appel gainers/losers |
| **Endpoints utilisés** | `/stable/biggest-gainers?apikey=…` + `/stable/biggest-losers?apikey=…` (Phase 6 radar v0.3 — 2 calls par refresh fusionnés ~100 movers). **Gotcha** : les paths legacy `/api/v3/stock_market/gainers` + `/losers` retournent un 403 « Legacy Endpoint » pour toute souscription post-août 2025 ; le namespace `/stable/*` est le replacement post-migration et sert exactement la même shape JSON |
| **Config** | `screener.provider: fmp` + `screener.fmp.api-key` (env `FMP_API_KEY`) — **les deux éditables au runtime** depuis `/settings/configuration > Providers de données` (carte « FMP — clé API ») |
| **Adapter** | `FmpMarketScreenerClient` (sélectionné par `screener.provider: fmp` via `RoutingMarketScreenerClient @Primary`) — base URL `https://financialmodelingprep.com` (overridable via `screener.fmp.base-url`) |
| **Cache** | Aucun v0.3 (filed en follow-up Phase 6 (1ter)) |
| **Probe** | `POST /api/config/test/fmp` accepte une clé candidate non sauvée, round-trip `/stable/biggest-gainers?apikey=…` — pas de cheap reference endpoint dédié chez FMP, on probe directement l'endpoint réel du radar (1 call sur le quota 250/jour par test) |
| **Latence** | ~150-300 ms par call gainers/losers (~5-10 kB de JSON) |

**Limites assumées** :
- **Pas de signal volume** sur les endpoints gainers/losers — l'adapter fill `volume = 0L`, `volumeAvg30d = 0L`, `volumeRatio = BigDecimal.ZERO`. Le filtre `volumeRatioMin` du radar devient **no-op** quand FMP est le provider actif ; un hint dans `screenerProvider.description` invite l'utilisateur à descendre le filtre à 0 dans le panneau.
- **Univers borné top 50 par direction** — un ticker qui gappe +5 % mais n'est pas dans le top 50 ne sera pas surfacé. Pas un blocker pour un radar « pump precursor » qui par construction cherche les extrêmes.
- **Pas de `marketCapUsd`, `sector`** — mêmes sentinels que pour Polygon (cap-range et sector filters no-op).

**Ce que FMP fait mieux que Polygon free** :
- `name` et `exchange` sont **populés natively** → pas besoin d'un call enrichment séparé pour afficher « NVIDIA Corporation · NASDAQ » dans la table radar.
- Free tier 250 req/jour sans paywall sur l'endpoint principal — Polygon free tier 2026 a verrouillé tous ses endpoints market data.

**Pourquoi FMP plutôt que Polygon free post-rebrand** : depuis le rebrand Polygon → Massive 2026, le free Basic tier de Polygon ne couvre plus que `/v3/reference/...` (le snapshot et le grouped-daily renvoient 403 « plan does not allow »). FMP free reste la seule option **à $0** qui retourne des données de mouvement de marché actionnable. L'adapter Polygon reste wired en code mais inactif tant que l'user n'upgrade pas en Stocks Basic+ payant.

---

## Anthropic Claude — narratif LLM

| | |
|---|---|
| **Site** | [https://www.anthropic.com](https://www.anthropic.com) |
| **Inscription** | [https://console.anthropic.com](https://console.anthropic.com) |
| **Dashboard / clé** | [https://console.anthropic.com/settings/keys](https://console.anthropic.com/settings/keys) |
| **Billing** | [https://console.anthropic.com/settings/billing](https://console.anthropic.com/settings/billing) — pay-as-you-go, ~5 € pour ~hundreds de narratifs |
| **Modèle utilisé** | `claude-opus-4-6` (default YAML), peut basculer sur `claude-sonnet-4-6` (~5× moins cher, qualité narrative très correcte) |
| **Config** | `anthropic.api.key` (env `ANTHROPIC_API_KEY`), `anthropic.api.model` — **les deux éditables au runtime** depuis `/settings/configuration > LLM` (clé masquée + bouton Tester depuis 2026-05-08, modèle en autocomplete libre) |
| **Client** | `ClaudeClient` (sélectionné par `llm.provider: claude`) — clé et modèle lus per-call via `AppConfigService`, rotation immédiate sans reboot |
| **Probe** | `POST /api/config/test/anthropic` accepte une clé candidate non sauvée, round-trip Claude avec le modèle courant et le prompt fixe « Reply with exactly the word OK. » — utilisé par le bouton « Tester » de la card Settings |
| **Latence** | 1-3 s par narratif sur Opus, légèrement moins sur Sonnet |

Si le bouton "Buy credits" est grisé : ajouter une carte au compte d'abord, et **vider le champ `Business tax ID`** (Anthropic essaie de valider un BN canadien et tape sur `$--` pour la tax si la valeur est invalide).

---

## Ollama — LLM local (offline / sans clé)

| | |
|---|---|
| **Site** | [https://ollama.com](https://ollama.com) |
| **Installation** | Lancée automatiquement par `tilt up` via `docker-compose.yml` |
| **Modèle par défaut** | `qwen2.5:3b` (~2 Go, ~5-10 s par narratif sur M1) — pull depuis `/settings/configuration > LLM > Pull…` (panneau État Ollama, suggestions hardcodées + tag libre) |
| **Modèles testés** | `qwen2.5:3b` ✅ (défaut), `qwen2.5:7b` (15-30 s, qualité +), `mistral` 7B ❌ (30-60 s, timeouts sur M1) |
| **Config** | `ollama.base-url`, `ollama.model` |
| **Client** | `OllamaClient` (sélectionné par `llm.provider: ollama`) |
| **API** | [http://localhost:11434](http://localhost:11434) (UI Tilt expose le link) |

Ollama tourne en local — **aucune clé, aucun crédit**, mais qualité narrative inférieure à Claude. Utile pour dev offline ou éviter de cramer des credits Anthropic en itération.

---

## Récapitulatif config locale

Depuis 2026-05-18, `application-local.yml` est **committé** mais doit **rester strictement secret-free** — il ne carrie que les overrides de comportement dev (`llm.provider`, `springdoc`, `flyway.repair-on-migrate`, etc.). Les clés API vivent dans deux slots distincts :

1. **`.env` à la racine du repo (gitignored)** — pour les credentials boot-time (OAuth, `APP_ADMIN_EMAILS`, `APP_FRONTEND_URL`). Lu par le `serve_cmd` Tilt qui les exporte au sous-process Gradle → Spring les pickè up via relaxed binding (`${ANTHROPIC_API_KEY:}`, `${TWELVEDATA_API_KEY:}`, `${FINNHUB_API_KEY:}`, `${POLYGON_API_KEY:}` dans `application.yml`). Cf. [`.env.example`](../../.env.example) pour la liste complète.
2. **`/settings/configuration` UI (runtime-editable, sans reboot)** — pour les clés API qu'on veut rotater ou activer sans toucher au filesystem. Backend persiste l'override dans la table `app_config` (clés `market.twelvedata.api-key`, `market.finnhub.api-key`, `screener.polygon.api-key`, `anthropic.api.key`). C'est la voie recommandée pour `anthropic.api.key` parce que la rotation est fréquente. Détails dans [`developpement.md > Alternative runtime — édition sans reboot`](./developpement.md).

Exemple `.env` minimal pour un dev qui veut Claude + Twelve Data + Finnhub + Polygon :

```bash
# OAuth (boot-time) — uniquement si BACKEND_AUTH_MODE=oauth, optionnel en mode no-auth
SPRING_SECURITY_OAUTH2_CLIENT_REGISTRATION_GOOGLE_CLIENT_ID=...
SPRING_SECURITY_OAUTH2_CLIENT_REGISTRATION_GOOGLE_CLIENT_SECRET=...
APP_ADMIN_EMAILS=ton.email@gmail.com

# API keys (boot-time alternative à l'UI runtime)
ANTHROPIC_API_KEY=sk-ant-api03-...        # https://console.anthropic.com/settings/keys
TWELVEDATA_API_KEY=...                    # https://twelvedata.com/account/api-keys
FINNHUB_API_KEY=...                       # https://finnhub.io/dashboard
POLYGON_API_KEY=...                       # https://massive.com/dashboard/keys (Stocks Basic+ required for the radar endpoint)
FMP_API_KEY=...                           # https://site.financialmodelingprep.com/developer/docs/dashboard (free tier 250 req/day)
```

Et `application-local.yml` ressemble à (voir le fichier réel sur disque) :

```yaml
llm:
  provider: claude               # ou `ollama` pour offline (défaut historique)

ollama:
  model: qwen2.5:3b              # pull depuis /settings/configuration > LLM > Pull…

# `market.provider`, `news.provider`, `analyst.provider`, `earnings.provider` restent en `mock`
# par défaut côté application.yml — basculer en `twelvedata` / `finnhub` via l'UI runtime,
# pas en YAML committé (la valeur committée serait visible dans `git log`).
```

**Sécurité** : ne jamais coller de clé API ni de credentials OAuth directement dans `application-local.yml` ni dans `application.yml` — les deux fichiers sont committés. Les `.env` (gitignored) + `app_config` runtime (BDD locale) sont les **seuls** dépôts de secrets en dev. En CI / fresh clone, les env vars restent vides et l'onboarding marche en mode mock sans clés — c'est volontaire.
