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
- **Sources de données** : activer/désactiver les flux (RSS / market / macro / crypto). Conservé pour la Phase 1 — Twelve Data sert de source primaire.
- **Tester une source** : RSS uniquement (parse + liste articles). Étendu en Phase 1 pour tester un fetch ticker via le provider configuré.
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

### Données de marché

Module `market/` côté backend, port `MarketChartClient` derrière la clé `market.provider` :

- **Twelve Data (défaut prod)** : REST documenté, free tier 800 credits/jour, TSX natif. Deux endpoints (`/time_series` + `/quote`).
- **Mock (défaut sans clé)** : série OHLC déterministe par symbole — onboarding sans clé, CI sans réseau.
- **Caching court** Caffeine 15 min.
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
- **Provider par défaut** : Claude API (Ollama + `qwen2.5:3b` conservé en backup pour dev offline ; Mistral 7B retiré, trop lent sur M1).
- **Pas de targetWeight, pas de BUY/SELL** — l'IA décrit, elle ne décide pas.

### Dossier ticker (UI)

Nouvelle page `features/ticker/` :

- En-tête : symbole, nom, prix courant, variation jour, sentiment badge
- **Graphique** des prix en SVG inline (pas de dépendance ajoutée). Phase 1 : courbe simple 1Y daily. Toggle multi-timeframe (1D / 5D / 1M / 3M / 1Y / 5Y) et chart enrichi (axes + grille + crosshair) livrés en Phase 2. Overlays MA50 / MA200 et zoom drag-select restent en backlog Phase 2.
- **Indicateurs en chips** : RSI, drawdown, perf 1y, distance à la MA50
- **Narratif LLM** : summary + keyPoints en bullets
- **Snapshot persistant** : chaque consultation génère un `TickerNarrativeSnapshot` (prix + indicateurs + texte LLM + horodatage)

### Watchlist / liste de tickers

Deux sources visibles côté UI :
- **Tickers détenus** (portfolio CSV Wealthsimple) — automatique, lecture seule, agrégé sur tous les portefeuilles.
- **Watchlist persistée** — saisie manuelle de tickers à surveiller hors portefeuille (cf. Phase 2 livré).

---

## Phase 2 — Profondeur ticker

### ✅ Livré

- **Multi-timeframe sur le graphe** : toggle `1D / 5D / 1M / 3M / 1Y / 5Y` au-dessus du chart. Le dossier (indicateurs + narratif) reste ancré sur `1Y daily` ; seul le graphe se reconfigure au clic. Endpoint dédié `GET /api/market/ticker/{symbol}/chart?timeframe=`.
- **Chart enrichi** : axes Y (prix) et X (dates), grille pointillée, crosshair au survol avec tooltip date + prix exacts.
- **Watchlist persistée** : module backend `watchlist/` + table `watchlist_entry` (V3). Ajouter / retirer un ticker via la sidebar dashboard (input + liste avec poubelle) ou via le bouton **"Suivre / Suivi"** sur le header du Dossier ticker. Add idempotent côté serveur, optimistic UI côté front avec rollback sur erreur.
- **Sidebar dashboard collapsable** : trois sections indépendamment foldables (Portefeuilles, Tickers détenus, Watchlist) + scrollbar custom 8px globale.
- **News par ticker** : section dédiée sur le Dossier ticker entre la plage 52w et le narratif IA. Liste 10 headlines (Reuters / Bloomberg / CNBC agrégés via Finnhub), source + date relative, clic ouvre l'article dans un nouvel onglet. Provider Finnhub séparé (clé dédiée) car Twelve Data ne couvre pas les news. Mock synthétique disponible (`news.provider: mock`, défaut sans clé) pour itérer sans consommer le quota.

### ⏳ À venir

- **Chart : analyse interactive** — zoom drag-select, overlays MA50 / MA200, annotations user
- **Comparaison vs benchmark** : SPY, QQQ, ou ETF sectoriel automatique
- **Recommandations analystes** si disponibles (consensus, target prices)
- **Fundamentals avancés** : earnings dates, derniers résultats, guidance
- **Settings & config runtime** : éditer clé API Twelve Data + TTL cache depuis l'UI sans reboot

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
