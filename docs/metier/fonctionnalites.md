# Fonctionnalités

## Phase 0 — Fondation (terminé)

Tout ce qui constitue l'ossature de l'app aujourd'hui. **Une partie est conservée et utilisée**, **une partie est gelée** (le code reste en l'état mais n'est plus dans le flow utilisateur principal — voir plus bas).

### Conservé

#### Portefeuille (lecture seule, CSV-driven)

Le portefeuille reflète l'état réel du courtier Wealthsimple. L'import d'un export CSV (« Positions ») crée ou met à jour automatiquement un portefeuille par compte. La vue Dashboard affiche les positions en lecture seule.

#### Import CSV

Page **Import** : drag & drop d'un export Wealthsimple (multi-fichiers supporté). Prévisualisation, confirmation, upsert des positions, création d'un snapshot par compte.

#### Historique des positions (Suivi)

Page **Suivi** : timeline des imports groupés par `batch_id`, expand par compte, détail des positions avec valeur de marché et P&L.

#### Settings (back-office)

Page **Settings** avec sidenav :
- **Sources de données** : activer/désactiver les flux (RSS / market / macro / crypto). Conservé pour la Phase 1 — Yahoo Finance va devenir la source primaire.
- **Tester une source** : RSS uniquement (parse + liste articles). Sera étendu pour tester un fetch ticker Yahoo en Phase 1.
- **Aperçu du prompt** : visualisation du prompt qui serait envoyé au LLM (à adapter pour le prompt par-ticker en Phase 1).

#### Thème clair / sombre

Toggle dans le header (sombre par défaut). Tokens CSS, persistance localStorage, transitions fluides.

#### Architecture frontend

Ports & adapters léger sous `core/` (4 repositories : Portfolio, Analysis, Settings, Snapshot) + UI dans `features/`.

#### Infra et qualité

Tilt + Docker Compose, CI GitHub Actions (backend Gradle + Postgres / frontend Vitest), Flyway, ports/adapters Spring, `@Async` sur bean séparé, tests d'intégration sur vrai PostgreSQL.

### Gelé (en mode module désactivé)

#### Ingestion RSS

Module `ingestion/` complet — scheduler Rome, déduplication, 25 sources seedées, parsing robuste (DOCTYPE, `&` nus, détection HTML). **Conservé en place** mais n'alimente plus le flow principal en Phase 1.

#### Analyse portefeuille (LLM rebalancing)

Pipeline `AnalysisExecutor` complet : `AnalysisContextLoader`, `LlmResponseParser`, `RecommendationValidator` (8 règles), `RecommendationPersister`, `AnalysisJobStore`. **Conservé en place**, plus accessible depuis le Dashboard. Sera réactivé/repensé éventuellement en Phase 4 quand le portefeuille servira à donner du contexte aux dossiers ticker.

> **Pourquoi gelé et pas supprimé** : c'est un module au sens propre — découpé proprement, testable, avec ses propres entités. Le supprimer ne nettoierait pas grand-chose et brûlerait l'investissement. On le rallume plus tard si on en a besoin.

---

## Phase 1 — Pivot ticker (terminé, tag `v0.2.0`)

### Données de marché (Yahoo)

Module `market/` côté backend :

- **`YahooClient`** : fetch par ticker — quote actuelle, historique OHLC (1d/5d/1mo/3mo/1y), volumes, fundamentals basiques (P/E, market cap, dividendes), 52w high/low.
- **Caching court** côté serveur (5-15 min selon endpoint) pour éviter de rate-limiter Yahoo.
- **Endpoint REST** : `GET /api/market/ticker/{symbol}`.

### Indicateurs calculés serveur

`IndicatorCalculator` — Kotlin pur, testable unit, **aucun appel LLM** :

- RSI (14)
- MA50, MA200 et croisements
- Momentum 30j / 90j
- Performance 1m / 3m / 1y / YTD
- Drawdown depuis 52w high
- Volume relatif (vs moyenne 30j)
- Position vs MA50, MA200 (en %)

### Narratif LLM par ticker

Nouveau prompt **par ticker** (pas portfolio-wide) :

- **Input** : `{ticker, currentPrice, indicators, fundamentals, recentChange}`
- **Output JSON** : `{summary, sentiment: 'bullish'|'bearish'|'neutral', keyPoints: string[]}`
- **Provider par défaut** : Claude API (Mistral local conservé en backup pour dev offline).
- **Pas de targetWeight, pas de BUY/SELL** — l'IA décrit, elle ne décide pas.

### Dossier ticker (UI)

Nouvelle page `features/ticker/` :

- En-tête : symbole, nom, prix courant, variation jour, sentiment badge
- **Graphique** des prix (Chart.js ou recharts) — toggle 1m / 3m / 1y, MA50 / MA200 overlay
- **Indicateurs en chips** : RSI, drawdown, perf 1y, distance à la MA50
- **Narratif LLM** : summary + keyPoints en bullets
- **Snapshot persistant** : chaque consultation génère un `TickerNarrativeSnapshot` (prix + indicateurs + texte LLM + horodatage)

### Watchlist / liste de tickers

Le portefeuille reste la source initiale (les tickers détenus apparaissent automatiquement). Une **watchlist manuelle** (ajout d'un ticker à surveiller sans qu'il soit en portefeuille) sera nice-to-have.

---

## Phase 2 — Profondeur ticker

- **Multi-timeframe** : intraday (1d, 5d granulaire) + long terme (5y, 10y)
- **News Yahoo par ticker** — replace/complete le RSS macro pour l'analyse contextuelle
- **Comparaison vs benchmark** : SPY, QQQ, ou ETF sectoriel automatique
- **Recommandations analystes** Yahoo si disponibles (consensus, target prices)
- **Fundamentals avancés** : earnings dates, derniers résultats, guidance
- **Watchlist persistée** en base, pas seulement à partir du portefeuille

---

## Phase 3 — Observabilité narrative

- **Dashboard d'observabilité** : sur N consultations passées d'un ticker, afficher le narratif vs ce qu'a fait le prix depuis
- **Détection de biais récurrents** : "le LLM est bullish 80% du temps", "ne mentionne jamais la volatilité"
- **Score de cohérence narrative** : le LLM dit-il la même chose à 2 jours d'écart si rien n'a bougé ?
- **A/B prompts** : deux versions du prompt en parallèle, comparer la qualité narrative

---

## Phase 4 — Vision long terme

- **Croisement portefeuille × insights ticker** : sur le Dashboard, afficher pour chaque position le sentiment ticker + alerte si RSI extrême ou drawdown important
- **Watchlist alertes** : seuils déclencheurs (RSI > 70, MA50 cassée, drawdown > 20%)
- **Réintégration de la Phase 0 gelée** : les recommandations portefeuille reviennent, mais en agrégeant les insights ticker plutôt qu'en les recalculant
- **Paper trading** : simulation d'exécution
- **Multi-broker** : ne plus dépendre exclusivement du CSV Wealthsimple
