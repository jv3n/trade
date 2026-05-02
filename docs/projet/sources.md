# Sources de données — PortfolioAI

Référence des sources d'ingestion. **22 sources sont actuellement seedées en base** (migration V3) et activables/désactivables depuis la page **Settings** de l'application. Ce document garde aussi la liste élargie des sources candidates pour les phases suivantes.

---

## Presse & Flux RSS

| Nom | URL RSS | Langue | Gratuit | Notes |
|-----|---------|--------|---------|-------|
| Reuters Business | `https://feeds.reuters.com/reuters/businessNews` | EN | ✅ | ⚠️ URL morte — feeds.reuters.com abandonné en 2020 |
| Reuters Markets | `https://feeds.reuters.com/reuters/marketsNews` | EN | ✅ | ⚠️ URL morte — feeds.reuters.com abandonné en 2020 |
| Financial Times | `https://www.ft.com/rss/home` | EN | ⚠️ | Payant (certains articles libres) |
| Les Echos | `https://www.lesechos.fr/rss/rss_finance.xml` | FR | ⚠️ | Certains articles payants |
| Le Monde Économie | `https://www.lemonde.fr/economie/rss_full.xml` | FR | ✅ | Bonne couverture macro |
| BFM Bourse | `https://bfmbusiness.bfmtv.com/rss/info/flux-rss/flux-toutes-les-actualites/` | FR | ✅ | Actualité bourse FR |
| Investir / Journal des Finances | `https://investir.lesechos.fr/rss.xml` | FR | ⚠️ | Analyse actions |
| Seeking Alpha | `https://seekingalpha.com/feed.xml` | EN | ⚠️ | Analyse approfondie, payant |
| MarketWatch | `https://feeds.content.dowjones.io/public/rss/mw_realtimeheadlines` | EN | ✅ | Temps réel US |
| CNBC Markets | `https://search.cnbc.com/rs/search/combinedcms/view.xml?partnerId=wrss01&id=20910258` | EN | ✅ | Actualité marchés US |
| Bloomberg (Wealth) | `https://feeds.bloomberg.com/wealth/news.rss` | EN | ⚠️ | Payant |
| The Economist | `https://www.economist.com/finance-and-economics/rss.xml` | EN | ⚠️ | Payant |

---

## APIs Financières — Données de Marché

| Nom | Type | Gratuit | Limites | Notes |
|-----|------|---------|---------|-------|
| [Yahoo Finance (yfinance)](https://finance.yahoo.com) | Cours, historique, fondamentaux | ✅ | Non officiel | Très complet, pas de clé API |
| [Alpha Vantage](https://www.alphavantage.co) | Cours, indicateurs techniques | ✅ (limité) | 25 req/jour gratuit | Clé API requise |
| [Finnhub](https://finnhub.io) | Cours temps réel, news, fondamentaux | ✅ (limité) | 60 req/min gratuit | Clé API requise |
| [Polygon.io](https://polygon.io) | Cours, options, crypto | ✅ (limité) | Plan gratuit limité | Très complet, clé API |
| [Twelve Data](https://twelvedata.com) | Cours, ETF, indicateurs | ✅ (limité) | 8 req/min gratuit | Clé API requise |
| [Open Exchange Rates](https://openexchangerates.org) | Taux de change | ✅ (limité) | 1000 req/mois gratuit | Pour portefeuilles multi-devises |
| [Stooq](https://stooq.com) | Cours historiques | ✅ | Pas de clé API | Données EOD, couverture mondiale |

---

## Indicateurs Macro-Économiques

| Nom | Type | Gratuit | Notes |
|-----|------|---------|-------|
| [FRED (Federal Reserve)](https://fred.stlouisfed.org/docs/api/fred/) | Indicateurs US (PIB, inflation, taux...) | ✅ | Clé API requise (gratuite) |
| [BCE (Banque Centrale Européenne)](https://data.ecb.europa.eu/help/api/overview) | Indicateurs zone euro | ✅ | API REST publique |
| [Banque Mondiale](https://datahelpdesk.worldbank.org/knowledgebase/articles/889386) | Indicateurs mondiaux | ✅ | API REST publique |
| [INSEE](https://api.insee.fr/catalogue/) | Indicateurs France | ✅ | Clé API requise (gratuite) |
| [OCDE](https://data.oecd.org/api/) | Statistiques pays OCDE | ✅ | API REST publique |
| [PBOC](https://www.pbc.gov.cn) | Indicateurs Chine (taux, réserves, masse monétaire) | ✅ | API publique |
| [BOJ](https://www.stat-search.boj.or.jp) | Indicateurs Japon (taux, inflation, balance des paiements) | ✅ | API publique |
| [MAS](https://eservices.mas.gov.sg/apimg) | Indicateurs Singapour (taux de change, inflation) | ✅ | API publique |

---

## Crypto

| Nom | Type | Gratuit | Notes |
|-----|------|---------|-------|
| [CoinGecko](https://www.coingecko.com/api/documentation) | Cours, market cap, volumes | ✅ (limité) | 30 req/min gratuit, pas de clé |
| [CoinMarketCap](https://coinmarketcap.com/api/) | Cours, market cap | ✅ (limité) | Clé API requise |
| [Binance Public API](https://binance-docs.github.io/apidocs/) | Cours temps réel | ✅ | Pas de clé pour données publiques |

---

## Priorités MVP

Pour la Phase 1, les sources recommandées (gratuites, stables, sans clé ou clé gratuite) :

1. **RSS** : CNBC Markets + MarketWatch + Le Monde Économie (Reuters, BFM Bourse et Les Echos désactivés — URLs mortes, bloquées ou payantes)
2. **Marché** : Yahoo Finance (yfinance) + Stooq pour l'historique
3. **Macro** : FRED + BCE
4. **Crypto** : CoinGecko

## État actuel

22 sources sont seedées par la migration `V3__feed_source_metadata.sql`. Activation/désactivation depuis `/settings` (endpoint `PATCH /api/ingestion/sources/{id}`). Les sources actives sont collectées toutes les 15 min en prod (5 min en local) par le scheduler du module `ingestion/`.
