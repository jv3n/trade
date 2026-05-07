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

Ports & adapters léger sous `core/` (Phase 0 : 4 repositories — Portfolio, Analysis, Settings, Snapshot) + UI dans `features/`. *Phases 1+ ont enrichi à 8 repositories — voir `docs/technique/architecture.md` pour la liste à jour.*

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
- **Graphique** des prix en SVG inline (pas de dépendance ajoutée). Phase 1 : courbe simple 1Y daily. Phase 2 : toggle multi-timeframe (1D / 5D / 1M / 3M / 1Y / 5Y), chart enrichi (axes + grille + crosshair), overlays multi-select (MA50 / MA200 / Bollinger / 52w hi-lo), zoom drag-select avec brush mini-chart navigator, annotations user persistées localStorage et mesure tools delta % / delta time.
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
- **Settings & config runtime** : nouvelle page `/settings/configuration` (4e onglet sidenav, icône `tune`) qui édite en direct **sept clés** sans reboot. Couvre les deux clés API (Twelve Data + Finnhub avec bouton "Tester" qui sonde la clé candidate avant de la sauver), le TTL cache Caffeine 5–60 min (slider), et les **quatre toggles provider** mock ↔ live (`market.provider` / `news.provider` / `analyst.provider` / `earnings.provider`) — chacun bascule à chaque clic, le prochain dossier ouvert hit le nouveau adapter. Hint conditionnel sur la card Twelve Data quand la clé Finnhub est absente : signale que le Sector benchmark utilise Finnhub même en mode market `twelvedata` (correctif post-audit Phase 2 finding #4). Persistance dans une nouvelle table `app_config` (V4) qui surcharge le défaut YAML ; bouton "Réinitialiser au défaut" par clé. Note sécu : clés API stockées en clair en BDD locale — acceptable projet perso.
- **Comparaison vs benchmark (v1)** : overlay opt-in d'un indice (SPY / QQQ / IWM) sur le chart du dossier ticker. `mat-button-toggle-group` Off / SPY / QQQ / IWM dans la chart-toolbar, défaut Off → zéro consommation Twelve Data tant qu'aucun click. Quand un benchmark est sélectionné, le Y-axis flippe instantanément du prix absolu vers le % return signé depuis la première bar (sinon SPY à 500 $ écraserait visuellement un small-cap à 15 $). La 2ᵉ ligne dashed semi-transparente apparaît dès que le fetch résout, le tooltip enrichi compare les deux séries au même index (swatch + symbol + valeur). Tooltip + `aria-label` sur les boutons SPY/QQQ/IWM expliquent l'indice complet ("S&P 500 (SPY)"). Front-only, zéro changement back : réutilise `GET /api/market/ticker/{symbol}/chart?timeframe=` qui partage son cache Caffeine sur la clé `(symbol, range, interval)`. Refetch des deux séries en parallèle au changement de timeframe.
- **Comparaison vs benchmark (v2 — Sector + Custom)** : étend l'overlay v1 avec deux nouveaux modes. **Sector** auto-détecte le SPDR sector ETF qui couvre le secteur GICS du ticker (AAPL → XLK Technology, JPM → XLF Financials) ; **Custom** laisse l'utilisateur taper n'importe quel ticker via un `mat-autocomplete` sidecar dans la toolbar (réutilise `searchSymbols` du provider de marché actif). Backend : nouveau port `SectorClassifier` avec deux adapters sélectionnés par `market.provider` — `TwelveDataSectorClassifier` (REST `/profile`, 1 credit/call, lit `sector` + route via `SpdrSectorEtfs`) et `MockSectorClassifier` (~25 tickers seedés US/TSX). `RoutingSectorClassifier` (`@Primary`). Mapping hardcodé `SpdrSectorEtfs` (11 GICS sectors → XLK/XLF/XLV/XLE/XLY/XLP/XLC/XLI/XLB/XLRE/XLU + table de synonymes pour les variations provider type "Information Technology" / "Health Care" / "Consumer Cyclical"). `SectorClassifierService` avec `@Cacheable("sector-by-symbol")`. Endpoint `GET /api/market/ticker/{symbol}/sector-benchmark`. UI : toggle 5-buttons (Off/SPY/QQQ/IWM/Sector) + autocomplete sidecar "or pick…". Sector hors SPDR → 404 → message inline distinct (`sectorNotMapped`) du fetch error generic.
- **Chart : analyse + sélection (v1+v2+v3)** : extension du chart Dossier ticker avec trois couches d'outils interactifs. **v1 zoom drag-select** : `pointerdown` → drag horizontal → `pointerup` au-delà de 10 px commit un zoom (slice symétrique des séries ticker + benchmark dans `chartGeometry`), reset via bouton toolbar visible quand zoomé ou double-clic. **v2 overlays multi-select** : `mat-button-toggle-group` MA50 / MA200 / Bollinger (BB) / 52w hi / 52w lo, calculé front-side depuis la série complète (pour rester sémantiquement "MA50 de la série complète" même sous zoom), désactivé en mode benchmark (Y axis en % return space, MA en prix space — pas le même système). **v3 brush mini-chart** : SVG 52 px de haut sous le main, mirroir de la full series avec rectangle draggable indiquant la zone zoomée — trois modes selon la zone du grab (`pan` / `resize-left` / `resize-right`, hit-zone 8 px), reset si click hors rectangle. **v3 annotations** : nouveau port `AnnotationRepository` côté front + adapter `LocalStorageAnnotationRepository` (key `ticker-annotations:{SYMBOL}`, `crypto.randomUUID` avec fallback, `defer()` pour convertir un throw quota-exceeded en error notification). Bouton toolbar "+ Annotation" arme le mode ; le prochain click sub-threshold pose une h-line au prix cliqué (inverse-yAt via `geom.yMin` + `yRange`). Out-of-range → clamp top/bottom + suffixe ↑/↓. Click sur le handle `×` → optimistic remove avec rollback. Délégation à un futur backend-backed adapter sans rewrite UI. **v3 measure tools** : un click sub-threshold (sans annotation mode) pose un anchor au bar le plus proche, hover montre delta % et delta time (`formatDeltaTime` adaptatif min/h/j) dans une ligne distincte du tooltip. Anchor recovered par timestamp à chaque geometry pass — robuste au zoom qui shift les indices. Désactivé en benchmark mode (le % axis fait déjà ce travail). Click vs drag distinguishment partagé (threshold 10 px) entre les 3 features.
- **Recommandations analystes** : sous-bloc « Recommandations analystes » de la nouvelle section « Fondamentaux » sur le Dossier ticker, entre les chips d'indicateurs et la section News. Affiche le consensus monthly (chip BUY/HOLD/SELL/MIXED — seuils 60 % bullish/bearish, 50 % hold, MIXED sinon), un breakdown segmented bar 5 buckets (strongBuy / buy / hold / sell / strongSell) avec tooltip par segment, une légende chips, le price target consensus 12 mois (high / low / mean, masqué si indisponible) et une trend arrow up/down/flat sur les 6 derniers mois (delta bullish-minus-bearish / total). **Backend** — nouveau module `analyst/` avec port `AnalystRecommendationClient`, deux adapters : `FinnhubAnalystClient` (`/stock/recommendation` requis + `/stock/price-target` optionnel, fail-soft à `null` sur 401/403/5xx parce que le price-target est derrière un paid tier sur certains comptes Finnhub) et `MockAnalystClient` (synthétique déterministe par symbole, ~50 % bullish / ~30 % mixed / ~20 % bearish, drift mois-sur-mois pour une trend non plate, symboles réservés `UNKNOWN` / `RATELIMIT` / `NOTARGET`). `RoutingAnalystClient` (`@Primary`), `AnalystRecommendationService` avec `@Cacheable("analyst-recommendations")` 15 min (Finnhub stamp les snapshots mensuellement → staleness invisible). Endpoint `GET /api/market/ticker/{symbol}/analyst-recommendations`. Nouvelle clé runtime `analyst.provider` (`mock` ↔ `finnhub`, séparée de `news.provider` pour pouvoir flipper indépendamment). Cache `analyst-recommendations` ajouté à `MarketConfig`, partage le TTL `market.cache.ttl-minutes`. **Frontend** — nouveau port `AnalystRepository` + adapter HTTP, signaux `analyst / analystLoading / analystNotCovered / analystError` scopés à la panel (404 = no coverage = empty state distinct du 503 = inline error). Helper `analystBucketPct` pour la segmented bar, `computed analystTrend` (epsilon 5 %, defaut flat). i18n FR + EN (chip consensus, bucket labels, tooltips, trend tooltips, target labels).
- **Earnings dates et derniers résultats** : 2ᵉ sous-bloc « Résultats » de la section « Fondamentaux » sur le Dossier ticker, sous le sous-bloc analyste. Affiche la prochaine date attendue avec countdown ("dans N jours" ou "aujourd'hui" / "demain"), un badge horaire BMO/AMC quand connu, et un tableau des 4 derniers trimestres (période / EPS estimé / EPS réel / surprise % colorée beat/miss/inline). Pin de couleur warning quand la date est ≤ 7 jours pour signaler une publication imminente sans bloquer le reste. **Backend** — nouveau module `earnings/` avec port `EarningsClient`, deux adapters : `FinnhubEarningsClient` (`/stock/earnings` requis + `/calendar/earnings` optionnel, fail-soft à `null` sur 401/403/5xx — fenêtre 90 j en avant pour capturer la prochaine annonce sans burn de quota sur du long terme) et `MockEarningsClient` (synthétique déterministe par symbole, EPS dans la bande $0.30–$3.50, surprise ±15 % autour de l'estimé, next-date 1–60 j en avant, symboles réservés `UNKNOWN` / `RATELIMIT` / `NOCALENDAR`). `RoutingEarningsClient` (`@Primary`), `EarningsService` avec `@Cacheable("earnings")` 15 min. Endpoint `GET /api/market/ticker/{symbol}/earnings`. Nouvelle clé runtime `earnings.provider` (`mock` ↔ `finnhub`, séparée de `news.provider` et `analyst.provider`). Cache `earnings` ajouté à `MarketConfig` (6e cache, partage le TTL). Domain helper pur `computeSurprisePercent` (gère null + zero estimate + estimate négatif via `abs()` au dénominateur pour qu'un beat sur loss-making reste positif). **Frontend** — nouveau port `EarningsRepository` + adapter HTTP, signaux `earnings / earningsLoading / earningsNotCovered / earningsError` scopés à la panel (mêmes règles d'isolation que la news / analyst). Helper `earningsCountdownDays` (computed, anchored UTC pour éviter le drift timezone), `earningsSurpriseSign(report)` (beat/miss/inline). i18n FR + EN (col headers, time labels BMO/AMC, today/tomorrow/inDays/daysAgo).
- **News inline (v1 minimaliste)** : chaque headline du panneau News du Dossier ticker est désormais un accordéon — clic sur la row toggle un body qui surface le `summary` Finnhub + un lien `Lire l'article complet →` explicite vers la `url` (target=`_blank`). Le default action « row click » garde l'utilisateur sur le dossier ; le lien sortant n'est plus la première chose qui se déclenche. Choix v1 explicite : on n'introduit ni scraping (ToS Reuters/Bloomberg fragiles, paywalls, sites JS-heavy) ni LLM-as-summarizer (hallucination + ~10 calls Claude par dossier ouvert) — on affiche ce que Finnhub fournit déjà dans le payload. Honnête (zéro contenu inventé), zéro nouvelle dépendance. Multiple items ouvrables simultanément pour comparer deux dépêches. Backlog v2 LLM-as-summarizer filed en Phase 2.5 dette si à l'usage le résumé Finnhub se révèle trop court.

> **Phase 2 clôturée 2026-05-06** — tous les items « ticker » de profondeur sont livrés. Les sujets restants (config runtime LLM, sidebar modulaire, Swagger, scinder backlog…) vivent en **Phase 2.5 Stabilisation et outils** ; l'observabilité narrative ouvre la **Phase 3**.

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

---

## Phase 5 — Déploiement

> Phase orthogonale aux features métier — sortir l'app du localhost. Reste filed côté `backlog.md` (analyse hébergement OVH/Hetzner/Scaleway/AWS + OAuth2 multi-user comme prérequis), pas reflétée ici parce qu'elle n'apporte pas de capacités nouvelles à l'utilisateur — c'est de l'infra/sécurité qui rend les capacités existantes accessibles depuis n'importe où. Détails dans `docs/projet/backlog.md` section Phase 5.
