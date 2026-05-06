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
| **Endpoints utilisés** | `/time_series` (OHLC), `/quote` (nom + 52w + close), `/symbol_search` (autocomplete watchlist v2), `/profile` (sector GICS pour benchmark v2 → mappé vers SPDR ETF via `SpdrSectorEtfs`) |
| **Config** | `market.twelvedata.api-key` (env `TWELVEDATA_API_KEY`) |
| **Adapter** | `TwelveDataClient` + `TwelveDataSymbolSearchClient` + `TwelveDataSectorClassifier` (tous les trois sélectionnés par `market.provider: twelvedata`) |
| **Cache** | Caffeine `market-chart` (chart), `symbol-search` (autocomplete), `sector-by-symbol` (sector). TTL 15 min partagé via `market.cache.ttl-minutes` |

**Quirks à connaître** : numériques retournés en string JSON (`"open": "180.00"`), erreurs en HTTP 200 avec `status: error` dans le body. Le client absorbe les deux. Voir [`architecture.md`](./architecture.md) section "Twelve Data — quirks à absorber".

---

## Finnhub — news par ticker + recommandations analystes

| | |
|---|---|
| **Site** | [https://finnhub.io](https://finnhub.io) |
| **Inscription** | [https://finnhub.io/register](https://finnhub.io/register) (email + mot de passe, pas de carte requise) |
| **Dashboard / clé** | [https://finnhub.io/dashboard](https://finnhub.io/dashboard) |
| **Free tier** | 60 calls/min · pas de cap quotidien · large agrégation de sources presse financière (Reuters, Bloomberg, CNBC…) + breakdown analystes monthly |
| **Endpoints utilisés** | `/company-news?symbol=...&from=...&to=...` (Phase 2 news), `/stock/recommendation?symbol=...` (Phase 2 analyst — breakdown monthly), `/stock/price-target?symbol=...` (Phase 2 analyst — price target 12 mois, fail-soft à `null` sur 401/403 paid tier) |
| **Config** | `news.provider: finnhub` (news) + `analyst.provider: finnhub` (recos analystes) + `market.finnhub.api-key` (env `FINNHUB_API_KEY`) — clé partagée, deux toggles indépendants |
| **Adapter** | `FinnhubClient` (sélectionné par `news.provider: finnhub`) + `FinnhubAnalystClient` (sélectionné par `analyst.provider: finnhub`) |
| **Mock alternative** | `MockNewsClient` (sélectionné par `news.provider: mock`, défaut) — feed synthétique déterministe par symbole, ~10 % de tickers "quiet" qui retournent une liste vide pour exercer l'empty-state UI. `MockAnalystClient` (sélectionné par `analyst.provider: mock`, défaut) — breakdown synthétique déterministe (~50 % bullish / ~30 % mixed / ~20 % bearish, drift mois-sur-mois), symboles réservés `UNKNOWN` (404), `RATELIMIT` (503), `NOTARGET` (priceTarget=null pour reproduire la dégradation Finnhub) |
| **Cache** | Caffeine `news-by-symbol` (TTL 15 min, key `{symbol}\|{limit}`) + `analyst-recommendations` (TTL 15 min, key `{symbol}`) — TTL partagé via `market.cache.ttl-minutes` |

Pourquoi Finnhub plutôt que Twelve Data pour les news : Twelve Data n'expose pas d'endpoint news public (testé en live, retourne 404). Finnhub couvre ce besoin avec un free tier plus généreux que d'autres concurrents (Alpha Vantage 25/jour, Polygon 5/min EOD only). Idem côté analyst recommendations : `/stock/recommendation` est en free tier sans paywall, ce qui n'est pas le cas chez la plupart des concurrents.

**Économiser les credits en itération** : les deux mocks sont le défaut sur `application.yml` justement pour qu'un onboarding clone tourne sans clé Finnhub, et que le développement quotidien ne fasse pas chauffer le compteur. Bascule sur `news.provider: finnhub` et/ou `analyst.provider: finnhub` dans `application-local.yml` (ou via `/settings/configuration`) quand tu veux tester un vrai feed — chacun se flippe indépendamment.

---

## Anthropic Claude — narratif LLM

| | |
|---|---|
| **Site** | [https://www.anthropic.com](https://www.anthropic.com) |
| **Inscription** | [https://console.anthropic.com](https://console.anthropic.com) |
| **Dashboard / clé** | [https://console.anthropic.com/settings/keys](https://console.anthropic.com/settings/keys) |
| **Billing** | [https://console.anthropic.com/settings/billing](https://console.anthropic.com/settings/billing) — pay-as-you-go, ~5 € pour ~hundreds de narratifs |
| **Modèle utilisé** | `claude-opus-4-6` (default), peut basculer sur `claude-sonnet-4-5` (~5× moins cher, qualité narrative très correcte) |
| **Config** | `anthropic.api.key` (env `ANTHROPIC_API_KEY`), `anthropic.api.model` |
| **Client** | `ClaudeClient` (sélectionné par `llm.provider: claude`) |
| **Latence** | 1-3 s par narratif sur Opus, légèrement moins sur Sonnet |

Si le bouton "Buy credits" est grisé : ajouter une carte au compte d'abord, et **vider le champ `Business tax ID`** (Anthropic essaie de valider un BN canadien et tape sur `$--` pour la tax si la valeur est invalide).

---

## Ollama — LLM local (offline / sans clé)

| | |
|---|---|
| **Site** | [https://ollama.com](https://ollama.com) |
| **Installation** | Lancée automatiquement par `tilt up` via `docker-compose.yml` |
| **Modèle par défaut** | `qwen2.5:3b` (~2 Go, ~5-10 s par narratif sur M1) — pull via le bouton Tilt **`llm:ensure-model`** (idempotent) |
| **Modèles testés** | `qwen2.5:3b` ✅ (défaut), `qwen2.5:7b` (15-30 s, qualité +), `mistral` 7B ❌ (30-60 s, timeouts sur M1) |
| **Config** | `ollama.base-url`, `ollama.model` |
| **Client** | `OllamaClient` (sélectionné par `llm.provider: ollama`) |
| **API** | [http://localhost:11434](http://localhost:11434) (UI Tilt expose le link) |

Ollama tourne en local — **aucune clé, aucun crédit**, mais qualité narrative inférieure à Claude. Utile pour dev offline ou éviter de cramer des credits Anthropic en itération.

---

## Récapitulatif config locale

À copier dans `backend/src/main/resources/application-local.yml` (gitignored) :

```yaml
anthropic:
  api:
    key: sk-ant-api03-...        # https://console.anthropic.com/settings/keys

llm:
  provider: claude               # ou `ollama` pour offline

ollama:
  base-url: http://localhost:11434
  model: qwen2.5:3b              # pull via Tilt button llm:pull-qwen

market:
  provider: twelvedata           # ou `mock` sans clé
  twelvedata:
    api-key: ...                 # https://twelvedata.com/account/api-keys
  finnhub:
    api-key: ...                 # https://finnhub.io/dashboard

news:
  provider: finnhub              # ou `mock` (défaut, pas de credits consommés)

analyst:
  provider: finnhub              # ou `mock` (défaut, pas de credits consommés). Partage market.finnhub.api-key
```

**Sécurité** : ne jamais committer ces clés. `application-local.yml` est gitignored, `application.yml` lit les env vars (`${TWELVEDATA_API_KEY:}` etc.) qui restent vides en CI / fresh clone — c'est volontaire pour que l'onboarding marche en mode mock sans clés.
