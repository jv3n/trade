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
- Erreurs 401/403/429/5xx mappées sur `MarketUnavailableException` partagée avec Twelve Data → 503 unifié sur l'API publique

Voir [`technique/providers.md`](../technique/providers.md) pour le détail (URLs d'inscription, dashboard, points d'intégration code).

> **Switch runtime** : depuis la Phase 2, `market.provider`, `news.provider`, `analyst.provider` et `earnings.provider` sont éditables en direct depuis `/settings/configuration` (toggles mock ↔ live). Le bascule s'applique au prochain dossier ouvert sans redémarrer le backend, et la valeur surcharge le défaut YAML jusqu'au prochain "Réinitialiser au défaut" sur la même page.

### Bascule alternative (market data)

Si Twelve Data devient indisponible ou trop limitant, candidats par ordre de préférence :

| Nom | Type | Gratuit | Notes |
|-----|------|---------|-------|
| [Stooq](https://stooq.com) | EOD historique | ✅ | Pas de quote temps réel, mais historique fiable |
| [Polygon.io](https://polygon.io) | Cours, options, crypto | ⚠️ | Très complet, plan gratuit très limité (5 req/min EOD) |
| [Alpha Vantage](https://www.alphavantage.co) | Cours, indicateurs | ✅ (limité) | 25 req/jour gratuit — trop juste |

> Yahoo Finance avait été tenté en Phase 1 (cookie+crumb dance complet) mais Yahoo bannit les IPs résidentielles trop agressivement pour qu'un projet perso à IP unique en dépende. Voir `docs/technique/architecture.md` (section "Décisions techniques notables") et l'historique git (commit `b993440`) si besoin de rejouer ce code.

---

## Phase 0 — sources décommissionnées

Le pipeline d'ingestion RSS et l'analyse portefeuille de la Phase 0 ont été supprimés en Phase 2.5 (table `feed_source`, module `ingestion/`, pages `/recommendations` et `/history` — voir `docs/CHANGELOG.md`). Les sources qui étaient seedées en V1 (Le Monde Économie, CNBC Markets, MarketWatch, FRED, BCE, CoinGecko, etc.) ne sont plus présentes en base.

Si la Phase 4 « Réintégration Phase 0 » ressuscite un besoin de sources macro ou crypto, repartir d'un greenfield basé sur les snapshots Phase 1+2 (déjà couverts par Twelve Data + Finnhub) — l'historique des seeds Phase 0 est dans `git log` (commit du V1 d'origine + V6 du drop).
