# Sources de données — PortfolioAI

## Phase 1 — Source primaire : Yahoo Finance

À partir de la Phase 1 (pivot ticker), **Yahoo Finance est la source primaire** des dossiers ticker. Toute autre intégration de données passe au second plan.

### Yahoo Finance (API non officielle)

| Endpoint | Donnée | Cache |
|----------|--------|-------|
| `https://query1.finance.yahoo.com/v8/finance/chart/{symbol}` | OHLC + volumes (intraday à 5y) | 15 min |
| `https://query1.finance.yahoo.com/v7/finance/quote?symbols={symbol}` | Quote courante (prix, change, marketCap, P/E…) | 5 min |
| `https://query2.finance.yahoo.com/v10/finance/quoteSummary/{symbol}` | Fundamentals étendus (earnings, recommandations analystes…) | 1 h |

**Avantages** :
- Gratuit, pas de clé
- Couverture quasi-mondiale (US, EU, Asie, ETF, crypto, indices)
- Historique long (5y+ disponible sur la plupart des tickers)

**Limites à connaître** :
- API non documentée — peut casser sans préavis
- Pas de SLA, rate-limits informels (cache côté serveur impératif)
- Si Yahoo ferme cet accès, il faut un plan B (cf. fallback ci-dessous)

### Fallback / providers payants

Si Yahoo devient indisponible, candidats par ordre de préférence :

| Nom | Type | Gratuit | Notes |
|-----|------|---------|-------|
| [Stooq](https://stooq.com) | EOD historique | ✅ | Pas de quote temps réel, mais historique fiable |
| [Twelve Data](https://twelvedata.com) | Cours, indicateurs | ✅ (limité) | 8 req/min gratuit, clé API |
| [Polygon.io](https://polygon.io) | Cours, options, crypto | ⚠️ | Très complet, plan gratuit limité |
| [Alpha Vantage](https://www.alphavantage.co) | Cours, indicateurs | ✅ (limité) | 25 req/jour gratuit, clé API |
| [Finnhub](https://finnhub.io) | Cours, news, fundamentals | ✅ (limité) | 60 req/min gratuit, clé API |

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

### Données de marché (gelé en Phase 0, redémarrent en Phase 1 via Yahoo)

Listés ici pour référence ; aucun client backend n'a été codé en Phase 0 — Yahoo couvre le besoin Phase 1.

- Yahoo Finance (Phase 1 ✅), Stooq, Alpha Vantage, Finnhub, Polygon.io, Twelve Data, Open Exchange Rates

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

> Note : Yahoo Finance couvre les principaux cryptos (BTC-USD, ETH-USD…) en Phase 1. CoinGecko n'est utile que pour les altcoins absents de Yahoo.
