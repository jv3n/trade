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

1. **`.env` à la racine du repo (gitignored)** — pour les credentials boot-time (OAuth, `APP_ADMIN_EMAILS`, `APP_FRONTEND_URL`). Lu par le `serve_cmd` Tilt qui les exporte au sous-process Gradle → Spring les pickè up via relaxed binding (`${ANTHROPIC_API_KEY:}`, `${TWELVEDATA_API_KEY:}`, `${FINNHUB_API_KEY:}` dans `application.yml`). Cf. [`.env.example`](../../.env.example) pour la liste complète.
2. **`/settings/configuration` UI (runtime-editable, sans reboot)** — pour les clés API qu'on veut rotater ou activer sans toucher au filesystem. Backend persiste l'override dans la table `app_config` (clés `market.twelvedata.api-key`, `market.finnhub.api-key`, `anthropic.api.key`). C'est la voie recommandée pour `anthropic.api.key` parce que la rotation est fréquente. Détails dans [`developpement.md > Alternative runtime — édition sans reboot`](./developpement.md).

Exemple `.env` minimal pour un dev qui veut Claude + Twelve Data + Finnhub :

```bash
# OAuth (boot-time) — uniquement si BACKEND_AUTH_MODE=oauth, optionnel en mode no-auth
SPRING_SECURITY_OAUTH2_CLIENT_REGISTRATION_GOOGLE_CLIENT_ID=...
SPRING_SECURITY_OAUTH2_CLIENT_REGISTRATION_GOOGLE_CLIENT_SECRET=...
APP_ADMIN_EMAILS=ton.email@gmail.com

# API keys (boot-time alternative à l'UI runtime)
ANTHROPIC_API_KEY=sk-ant-api03-...        # https://console.anthropic.com/settings/keys
TWELVEDATA_API_KEY=...                    # https://twelvedata.com/account/api-keys
FINNHUB_API_KEY=...                       # https://finnhub.io/dashboard
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
