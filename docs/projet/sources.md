# Sources de données — PortfolioAI

## Phase 1 — Source primaire : Twelve Data

À partir de la Phase 1 (pivot ticker), **Twelve Data est la source primaire** des dossiers ticker. Toute autre intégration de données passe au second plan.

### Twelve Data (REST + apikey)

| Endpoint | Donnée | Cache |
|----------|--------|-------|
| `https://api.twelvedata.com/time_series?symbol={s}&interval=1day&outputsize=260&order=ASC` | OHLC + volumes (1y daily par défaut, plus si besoin) | 15 min |
| `https://api.twelvedata.com/quote?symbol={s}` | Quote courante + nom + 52w high/low | 15 min (mêmes clé/cache) |

**Avantages** :
- API REST documentée, format JSON stable
- Couverture US, TSX (XTSE — important pour Wealthsimple), grandes places EU et Asie, ETF, crypto, forex
- Free tier 800 credits/jour (suffisant avec cache 15 min pour un usage perso)
- Auth simple : un seul `apikey` en query param

**Limites à connaître** :
- Quota free tier (800 credits/jour, 8 req/min) à surveiller si on multiplie les tickers
- Plan payant nécessaire pour intraday haute fréquence
- Erreurs renvoyées en HTTP 200 avec `status: error` dans le body — le client doit les détecter

### Bascule alternative

Si Twelve Data devient indisponible ou trop limitant, candidats par ordre de préférence :

| Nom | Type | Gratuit | Notes |
|-----|------|---------|-------|
| [Stooq](https://stooq.com) | EOD historique | ✅ | Pas de quote temps réel, mais historique fiable |
| [Polygon.io](https://polygon.io) | Cours, options, crypto | ⚠️ | Très complet, plan gratuit très limité (5 req/min EOD) |
| [Alpha Vantage](https://www.alphavantage.co) | Cours, indicateurs | ✅ (limité) | 25 req/jour gratuit — trop juste |
| [Finnhub](https://finnhub.io) | Cours, news, fundamentals | ✅ (limité) | 60 req/min gratuit, US-centric |

> Yahoo Finance avait été tenté en Phase 1 (cookie+crumb dance complet) mais Yahoo bannit les IPs résidentielles trop agressivement pour qu'un projet perso à IP unique en dépende. Voir `docs/technique/architecture.md` (section "Décisions techniques notables") et l'historique git (commit `b993440`) si besoin de rejouer ce code.

---

## 🧊 Phase 0 — sources gelées

Les sources ci-dessous étaient utilisées par le pipeline d'ingestion RSS et l'analyse portefeuille de la Phase 0. **Elles restent seedées en base** (table `feed_source`, migration V1) et configurables depuis `/settings`, mais ne sont plus consommées en Phase 1.

### Presse & flux RSS (gelé)

| Nom | Statut Phase 0 | Notes |
|-----|----------------|-------|
| Le Monde Économie | ✅ Actif | Bonne couverture macro FR |
| CNBC Markets | ✅ Actif | Actualité marchés US |
| MarketWatch | ✅ Actif | Temps réel US |
| Reuters Business / Markets | ❌ Désactivé | URLs `feeds.reuters.com` mortes depuis 2020 |
| BFM Bourse | ❌ Désactivé | Accès bloqué |
| Les Echos / Investir | ❌ Désactivé | Payant |
| Seeking Alpha | ❌ Désactivé | Payant |
| Financial Times, Bloomberg, The Economist | ❌ Désactivé | Payant |

### Indicateurs macro (gelé)

Listés en Phase 0 sans client implémenté. Pourraient être réutilisés en Phase 4 si un module macro est rallumé.

| Nom | Type |
|-----|------|
| FRED (Federal Reserve) | Indicateurs US |
| BCE | Indicateurs zone euro |
| Banque Mondiale, OCDE, INSEE | Indicateurs internationaux |
| PBOC, BOJ, MAS | Indicateurs Chine, Japon, Singapour |

### Crypto (gelé)

| Nom | Type | Notes |
|-----|------|-------|
| CoinGecko | Cours, market cap | 30 req/min gratuit, sans clé |
| CoinMarketCap, Binance Public | Cours, volumes | Gratuit, clé API selon endpoint |

> Note : Twelve Data couvre les principaux cryptos (BTC/USD, ETH/USD…) en Phase 1. CoinGecko n'est utile que pour les altcoins absents.
