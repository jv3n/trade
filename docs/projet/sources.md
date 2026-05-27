# Sources de données — PortfolioAI

## Phase 1 — Source primaire : Twelve Data

À partir de la Phase 1 (pivot ticker), **Twelve Data est la source primaire** des dossiers ticker. Toute autre intégration de données passe au second plan.

### Twelve Data (REST + apikey)

| Endpoint | Donnée | Cache |
|----------|--------|-------|
| `https://api.twelvedata.com/time_series?symbol={s}&interval=1day&outputsize=260&order=ASC` | OHLC + volumes (1y daily par défaut, plus si besoin) | 15 min (`market-chart`) |
| `https://api.twelvedata.com/quote?symbol={s}` | Quote courante + nom + 52w high/low | 15 min (mêmes clé/cache) |
| `https://api.twelvedata.com/symbol_search?symbol={q}` | Autocomplete watchlist (Phase 2 v2) — match prefix symbol + substring name | 15 min (`symbol-search`) |

**Avantages** :
- API REST documentée, format JSON stable
- Couverture US, TSX (XTSE — important pour Wealthsimple), grandes places EU et Asie, ETF, crypto, forex
- Free tier 800 credits/jour (suffisant avec cache 15 min pour un usage perso)
- Auth simple : un seul `apikey` en query param

**Limites à connaître** :
- Quota free tier (800 credits/jour, 8 req/min) à surveiller si on multiplie les tickers
- Plan payant nécessaire pour intraday haute fréquence
- Erreurs renvoyées en HTTP 200 avec `status: error` dans le body — le client doit les détecter

## Phase 2 — News par ticker, recommandations analystes et earnings : Finnhub

Twelve Data ne couvre ni les news (testé live → 404 sur `/news`), ni les recommandations analystes, ni les earnings en free tier exploitable. Finnhub a été ajouté comme **provider séparé** pour ces trois familles de données, avec trois clés runtime distinctes (`news.provider`, `analyst.provider`, `earnings.provider`) qui partagent la même API key (`market.finnhub.api-key`) — chacune peut être flippée indépendamment (ex. : live news + mock analyst recos + mock earnings pendant l'itération).

### Finnhub (REST + apikey)

| Endpoint | Donnée | Cache |
|----------|--------|-------|
| `https://finnhub.io/api/v1/company-news?symbol={s}&from={d}&to={d}&token={k}` | Headlines + summary + url + image (fenêtre roulante 30 j) | 15 min (clé `(symbol, limit)`) |
| `https://finnhub.io/api/v1/stock/recommendation?symbol={s}&token={k}` | Breakdown analystes monthly (strongBuy/buy/hold/sell/strongSell), array newest-first (re-trié défensivement côté code) | 15 min (clé `symbol`) |
| `https://finnhub.io/api/v1/stock/price-target?symbol={s}&token={k}` | Price target consensus 12 mois (high/low/mean/median + numberOfAnalysts). Fail-soft à `null` côté code sur 401/403/5xx (paid tier sur certains comptes), shell tout-zéro → `null` | 15 min (mêmes clé/cache que recommendations) |
| `https://finnhub.io/api/v1/stock/earnings?symbol={s}&token={k}` | Historique 4 derniers trimestres : `{period, estimate, actual, surprise, surprisePercent}` (surprise % recalculé côté code, Finnhub round inconsistemment sur small caps) | 15 min (clé `symbol`, cache `earnings`) |
| `https://finnhub.io/api/v1/calendar/earnings?from={d}&to={d}&symbol={s}&token={k}` | Prochaine annonce attendue (`{date, hour bmo/amc/dmh, epsActual, epsEstimate}`) sur fenêtre 90 j en avant. Fail-soft à `null` côté code sur 401/403/5xx (paid tier sur certains comptes) | 15 min (mêmes clé/cache que earnings) |
| `https://finnhub.io/api/v1/stock/profile2?symbol={s}&token={k}` | Profil entreprise — on lit uniquement `finnhubIndustry` pour la classification sector (Phase 2 benchmark v2). Remplace `/profile` Twelve Data qui est paid-tier only | 15 min (`sector-by-symbol`) |

**Avantages** :
- Free tier 60 req/min sans cap quotidien
- Agrégation Reuters / Bloomberg / CNBC / MarketWatch / FT (pour les sources US-centric)
- Auth simple : un seul `token` en query param
- Recommendations (breakdown monthly) en free tier sans paywall — couvre tickers US large/mid cap, plus pauvre sur small caps et TSX
- Mocks disponibles côté news (`news.provider: mock`, défaut) et analyst (`analyst.provider: mock`, défaut) : feeds synthétiques déterministes par symbole, symboles réservés pour exercer les chemins UI (empty / rate-limit / null target)

**Limites à connaître** :
- US-centric — couverture EU et Canada plus pauvre (news + recos)
- `/stock/price-target` peut renvoyer 401/403 sur certains comptes / symboles malgré son statut « free tier » documenté → swallow à `null` côté code, le snapshot reste utile sans target
- Pas de fundamentals avancés en free tier (earnings dates partiel sur `/stock/earnings`, à creuser pour la Phase 2 backlog earnings)
- Erreurs 401/403/429/5xx mappées sur `UpstreamUnavailableException` partagée avec Twelve Data → 503 unifié sur l'API publique

Voir [`technique/providers.md`](../technique/providers.md) pour le détail (URLs d'inscription, dashboard, points d'intégration code).

> **Switch runtime** : depuis la Phase 2, `market.provider`, `news.provider`, `analyst.provider` et `earnings.provider` sont éditables en direct depuis `/settings/configuration` (toggles mock ↔ live). Le bascule s'applique au prochain dossier ouvert sans redémarrer le backend, et la valeur surcharge le défaut YAML jusqu'au prochain "Réinitialiser au défaut" sur la même page.

## Phase 6 — Radar de marché : Polygon (rebrand Massive)

Le module `screener/` (Phase 6) introduit une 6e source : **Polygon.io**, rebrandé en **Massive** courant 2026. Choisi parmi 4 candidats (Polygon, Finnhub, FMP, Alpaca) comme seul provider à exposer un endpoint free-tier qui retourne des bars pour tous les US stocks en 1 call HTTP — les 3 autres demandent une boucle per-ticker incompatible avec un radar à l'ouverture. Clé API runtime sous `screener.polygon.api-key`, switch `screener.provider mock ↔ polygon` éditable en direct dans `/settings/configuration`.

**Pivot endpoint v0.1 → v0.2** (2026-05-27, même jour) : la cible initiale `/v2/snapshot/locale/us/markets/stocks/tickers` (snapshot all-tickers live) est sortie payante au test (`403 Polygon plan does not allow this endpoint`, requiert Stocks Starter ~$29/mo). Bascule sur `/v2/aggs/grouped/locale/us/market/stocks/{date}` qui est inclus dans le free Basic mais **EOD only** — le radar surface « ce qui a beaucoup bougé hier » plutôt que « ce qui bouge live à l'open ».

### Polygon / Massive (REST + apiKey)

| Endpoint | Donnée | Cache |
|----------|--------|-------|
| `https://api.massive.com/v2/aggs/grouped/locale/us/market/stocks/{date}?adjusted=true&apiKey={k}` | OHLCV pour tous les US stocks sur une date donnée. 2 calls par refresh (jour le plus récent + précédent), join in-memory par symbole côté adapter pour compute `gapPct` et `volumeRatio`. Calendar walk-back jusqu'à 6 jours absorbe weekends + jours fériés | Aucun v0.2 (cache adapter-level TTL 5-15 min filed en follow-up Phase 6 (1ter), pertinent depuis le pivot grouped-daily car l'EOD ne change pas dans la journée) |
| `https://api.massive.com/v3/reference/tickers?limit=1&apiKey={k}` | Probe « clé valide ? » utilisée par `ConfigTestClient.testPolygon` (cheap ~200 bytes, ne consomme pas le quota snapshot) | — (one-shot probe) |

**Avantages** :
- Endpoint qui retourne tous les US stocks en 1 call (vs N per-ticker pour Finnhub / FMP / Alpaca) — radical pour un screener
- Free tier 5 req/min, pas de cap quotidien — 2 calls par refresh laissent une marge correcte
- Doc OpenAPI publique + MCP officiel + llms.txt pour les LLM agents (`https://massive.com/docs/rest/llms.txt`)
- Trigger d'upgrade simple : passer en Polygon Stocks Starter $29/mo unlock le snapshot real-time sans toucher le port `MarketScreenerClient`

**Limites à connaître** :
- **EOD only sur free Basic** : le snapshot real-time (`/v2/snapshot/...`) est paid-tier (Stocks Starter $29/mo). Le radar v0.2 répond « hier vs avant-hier » plutôt que « live à l'open » — toujours utile pour repérer un mouvement anormal a posteriori, moins actionnable pour un pump precursor.
- **Payload pauvre en metadata** : ni `name`, ni `exchange`, ni `sector`, ni `marketCapUsd`, ni `volumeAvg30d` dans le grouped-daily (ni dans le snapshot d'ailleurs). L'adapter fill avec sentinelles honnêtes (`name=T, exchange="", sector=null, marketCapUsd=0L, volumeAvg30d=t0.v` comme proxy single-day). Conséquences UX : filtres cap-range et sector no-op côté Polygon ; `volumeRatio` répond « aujourd'hui vs hier » plutôt qu'« aujourd'hui vs moyenne 30j ». Enrichissement complet via cron nightly `/v3/reference/tickers` + agrégats 30j filed en follow-up Phase 6 (1bis).
- **5 req/min free tier** — 2 calls par refresh, 12 worst-case sur long weekend (walk-back). Sans cache adapter v0.2, un spam panneau filtre peut hit 429 → 503 explicite. Cache court (TTL 5-15 min) à activer si l'usage l'exige.
- **Rebrand Polygon → Massive** : le slug `polygon` est gardé partout dans le code (config keys, classes, beans) pour rester grep-friendly. Seule la base URL est en `api.massive.com`. Trigger de re-évaluation si l'API stabilise un nouveau slug `massive` côté SDK officiel.

### FMP (REST + apikey) — fallback radar Phase 6 v0.3

Le rebrand Polygon → Massive 2026 a verrouillé le free tier sur `/v3/reference/...` uniquement (snapshot et grouped-daily 403 sur Basic free). **FMP free** devient le provider live recommandé à $0 pour le radar.

| Endpoint | Donnée | Cache |
|----------|--------|-------|
| `https://financialmodelingprep.com/stable/biggest-gainers?apikey={k}` | Top 50 gainers (symbol, name, change, price, changesPercentage, exchange) | Aucun v0.3 (filed en follow-up) |
| `https://financialmodelingprep.com/stable/biggest-losers?apikey={k}` | Top 50 losers (même shape) | Aucun v0.3 |

**Gotcha endpoint legacy** : `/api/v3/stock_market/gainers` + `/losers` retournent un `403 "Legacy Endpoint"` pour toute souscription FMP post-août 2025. Le namespace `/stable/*` est le replacement post-migration et sert exactement la même shape JSON.

**Avantages** :
- Free tier 250 req/jour sans carte de crédit
- `name` et `exchange` populés natively (pas besoin de call enrichment séparé contrairement à Polygon free)
- Setup zero-friction : sign-up email + clé immédiate

**Limites à connaître** :
- **Pas de signal volume** sur gainers/losers → `volumeRatio = 0` sentinel côté domain ; le filtre radar `volumeRatioMin` devient no-op quand FMP est actif (hint UI dans la card Settings)
- Univers borné top 50 par direction (~100 movers max par refresh)
- Pas de `marketCapUsd` ni `sector` (mêmes sentinels que Polygon)

### Bascule alternative (market data)

Si Twelve Data devient indisponible ou trop limitant, candidats par ordre de préférence :

| Nom | Type | Gratuit | Notes |
|-----|------|---------|-------|
| [Stooq](https://stooq.com) | EOD historique | ✅ | Pas de quote temps réel, mais historique fiable |
| [Polygon / Massive](https://massive.com) | Cours, options, crypto, snapshot all-tickers | ⚠️ | Déjà câblé côté `screener/` Phase 6 — gratuit limité (5 req/min, delayed 15 min) |
| [Alpha Vantage](https://www.alphavantage.co) | Cours, indicateurs | ✅ (limité) | 25 req/jour gratuit — trop juste |

> Yahoo Finance avait été tenté en Phase 1 (cookie+crumb dance complet) mais Yahoo bannit les IPs résidentielles trop agressivement pour qu'un projet perso à IP unique en dépende. Voir `docs/technique/architecture.md` (section "Décisions techniques notables") et l'historique git (commit `b993440`) si besoin de rejouer ce code.

---

## Phase 0 — sources décommissionnées

Le pipeline d'ingestion RSS et l'analyse portefeuille de la Phase 0 ont été supprimés en Phase 2.5 (table `feed_source`, module `ingestion/`, pages `/recommendations` et `/history` — voir `docs/CHANGELOG.md`). Les sources qui étaient seedées en V1 (Le Monde Économie, CNBC Markets, MarketWatch, FRED, BCE, CoinGecko, etc.) ne sont plus présentes en base.

Si la Phase 7 « Réintégration Phase 0 » ressuscite un besoin de sources macro ou crypto, repartir d'un greenfield basé sur les snapshots Phase 1+2 (déjà couverts par Twelve Data + Finnhub) — l'historique des seeds Phase 0 est dans `git log` (commit du V1 d'origine + V6 du drop).
