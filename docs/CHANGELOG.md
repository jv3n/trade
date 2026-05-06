# Changelog — Documentation

Log reverse-chronologique des changements apportés au doc set PortfolioAI. Maintenu en fin de chaque session `/doc-maintainer` (cf. `.claude/skills/doc-maintainer/SKILL.md`) par le main thread, après application des patches.

Format inspiré de [Keep a Changelog](https://keepachangelog.com) en version allégée :
- une section par date (`## YYYY-MM-DD`)
- bullets groupés par area (`metier/`, `technique/`, `projet/`, racine)
- une ligne narrative par changement, mentionnant le fichier concerné

Le `.claude/` (CLAUDE.md, skills, agents) y figure aussi quand il est touché — c'est de la doc-adjacent au sens où il définit les conventions et l'outillage de la session.

> Le contenu d'un fichier ne reflète que son état actuel. Ce CHANGELOG est l'unique trace de **comment** on y est arrivés (ordre, motivation, version qui a sauté…). Quand un finding paraît bizarre dans une doc, regarde ici avant de la patcher — il y a peut-être une raison récente.

---

## 2026-05-06 (suite 8 — patch /doc-maintainer + nouvelle convention de tri du backlog)

Sortie d'audit `/doc-maintainer` traitée intégralement (2 HIGH, 3 MED, 4 LOW, 7 findings). Drift concentrée sur la nav MkDocs (rapport audit fin Phase 2 absent), sur la liste des dispatchers `@Primary` (4 → 6 listés) et sur le claim « 5 toggles éditables » qui était devenu faux depuis l'ajout d'analyst+earnings côté backend. En passant : titre `etat-actuel.md` rafraîchi pour la fin Phase 2, mention Phase 5 ajoutée à `fonctionnalites.md`, schéma ASCII `architecture.md` aligné sur l'ordre de présentation des ports.

**Nouvelle convention introduite** : `CLAUDE.md > Backlog` gagne une « Ordering convention » — quand on touche `backlog.md`, réordonner la section éditée par priorité descendante (🔴 → 🟡 → 🟢) en haut, ✅ Livré au bas. Appliquée comme exemple sur la section **Dette technique** : 17 entrées ⏳ (5 🟡 puis 12 🟢) suivies de 6 ✅ (newest-first dans l'ordre).

### `metier/`
- `fonctionnalites.md` : (1) Phase 2 « Settings & config runtime » — `« édite en direct cinq clés »` reformulé en « cinq clés UI / sept backend, `analyst.provider` et `earnings.provider` non encore exposés UI, cf. ticket Critique du backlog ». Drift contrat doc ↔ code fermé. (2) Nouvelle section **Phase 5 — Déploiement** ajoutée en queue avec note explicative (phase orthogonale infra/sécurité, détails dans `backlog.md`).

### `technique/`
- `architecture.md` : (1) Section « Switch provider à chaud » — passe de 4 dispatchers `@Primary` à 6 listés explicitement (`RoutingMarketChartClient`, `RoutingSymbolSearchClient`, `RoutingSectorClassifier` dans `market/`, plus `RoutingNewsClient`, `RoutingAnalystClient`, `RoutingEarningsClient`). Note ajoutée sur le routage Sector → Finnhub. (2) Phrase d'intro module `market/` — `« chacun avec un adapter TwelveData* et un adapter Mock* »` assouplie pour refléter que `SectorClassifier` dévie côté live vers `FinnhubSectorClassifier`. (3) Schéma ASCII vue d'ensemble — ordre des ports `chart + sector + symb.search` → `chart + symb.search + sector` pour matcher l'ordre de présentation détaillée plus bas dans le même fichier.

### `projet/`
- `backlog.md` : (1) Phase 2 ✅ Livré « Comparaison vs benchmark v2 » — entrée historique enrichie d'une note « **remplacé 2026-05-06 par `FinnhubSectorClassifier` qui hit `/stock/profile2` free tier**, cf. CHANGELOG suite 4 » pour ne plus mentir aux lecteurs récents. (2) **Section Dette technique réordonnée** en application de la nouvelle convention : ⏳ 🟡 Moyenne (5 entrées : Coutures analyst, Stratégie de cache, Agent code-reviewer, Onboarding doc, Centraliser gestion d'erreur) → ⏳ 🟢 Basse (12 entrées) → ✅ Livré (6 entrées). Note d'intro ajoutée pointant vers la convention CLAUDE.md.
- `etat-actuel.md` : titre + paragraphe complètement refresh — `"Phase 2 chart analyse v1+v2+v3 livré + Phase 2.5 amorcée (2026-05-06)"` → `"Phase 2 clôturée (2026-05-06)"`. Le paragraphe liste les nouveaux livrables Phase 2 post-snapshot (analyst, earnings, sector swap, instrumentType, sidenav outils chart, news inline accordion), mentionne l'audit 2026-05-06 + 7 findings ingérés, et marque l'ouverture de la Phase 5 Déploiement au backlog.

### Racine
- `mkdocs.yml` : nav Audits — entrée `2026-05-06 — Revue globale fin Phase 2` ajoutée en tête (avant le 2026-05-02). Le rapport est désormais servi sur le site déployé.

### `.claude/`
- `CLAUDE.md > Backlog` : nouvelle sous-section **« Ordering convention »** documentant le tri à appliquer chaque fois qu'on touche `backlog.md` (⏳ par priorité descendante 🔴 → 🟡 → 🟢, puis 🚧, puis ✅ en bas). Précise que le tri est par-section, pas global ; et que les entrées non-touchées dans la même session restent à leur place.

---

## 2026-05-06 (suite 7 — audit fin Phase 2 + ingestion backlog)

Lancement de la 2ᵉ revue de code globale (1ʳᵉ datait du 2026-05-02 fin Phase 1). Subagent `general-purpose` qui a examiné le scope Phase 2 (modules `analyst/` / `earnings/` / `news/`, swap sector Twelve Data → Finnhub, `instrumentType` end-to-end, sidenav outils chart, accordion sections, news inline, chart analyse v1+v2+v3) et remonté **24 findings** : 1 Critique + 6 Important + 6 Modérée + 7 Mineure + 4 Documentation. Rapport archivé dans `docs/projet/audits/2026-05-06-fin-phase-2.md`. Le user a décidé d'ingérer les 7 findings Critique + Important dans le backlog.

### `projet/`
- `audits/2026-05-06-fin-phase-2.md` (nouveau) : rapport complet au format `2026-05-02-revue-globale.md` (résumé exécutif + findings par sévérité avec ref `fichier:ligne` + reco de priorisation).
- `audits/index.md` : entrée 2026-05-06 ajoutée en tête de l'historique.
- `backlog.md` : (1) **finding #1 (Critique)** — l'entrée existante « `/settings/configuration` : exposer `analyst.provider` et `earnings.provider` côté UI » bumpée de 🟡 → 🔴 avec reference audit en intro ; (2) **finding #4 (Important)** — nouvelle entrée Phase 2.5 ⏳ « Sector benchmark : signaler la dépendance Finnhub key même en mode `market.provider=twelvedata` » 🟡 ; (3) **finding #5 (Important)** — nouvelle entrée Phase 2.5 ⏳ « `CacheTtlListener` : passer en `@TransactionalEventListener(AFTER_COMMIT)` » 🟡 ; (4) **finding #2 (Important)** — l'entrée existante « Coutures post-livraison analyst » bumpée de 🟢 → 🟡 avec note expliquant que le sous-finding #1 (FinnhubAnalystClient MockWebServer test) est promu Important suite à audit ; (5) **finding #3, #6, #7 (Important)** — 3 nouvelles entrées Dette technique (cache strategy à trancher, watchlist fail-open à tester + DTO flag, front 404/503 paths à pin sur analyst+earnings).

> Findings Modérée + Mineure + Documentation **non ingérés** automatiquement — restent dans le rapport d'audit comme observations. Per `CLAUDE.md` (Documentation > audits/), c'est le user qui décide ce qui devient action ; les findings de basse sévérité non promus restent référencés dans l'audit pour la prochaine revue.

---

## 2026-05-06 (suite 6 — News inline v1 minimaliste, **Phase 2 clôturée**)

Dernier item Phase 2 livré : le panneau News du Dossier ticker passe en accordéon — chaque headline cliquable expand un body inline qui affiche le `summary` Finnhub + un lien explicite vers la source. Le user reste sur le dossier par défaut, sort uniquement quand il veut le contenu intégral. **Choix v1 minimaliste explicite** : pas de scraping (ToS Reuters/Bloomberg, paywalls, JS-heavy sites trop fragiles pour un personal project) ; pas de LLM-as-summarizer (hallucination + ~10 calls Claude par dossier ouvert). On affiche ce que Finnhub fournit déjà dans le payload `summary`, point. Si à l'usage les ~150-200 chars se révèlent trop courts, **v2 LLM-as-summarizer** filed en Phase 2.5 dette pour bascule sur Claude Haiku avec cache 24 h+. Avec cette livraison, **Phase 2 est clôturée** — tous les items « ticker » de profondeur sont livrés (multi-timeframe + axes + crosshair, watchlist v1+v2, sidebar collapsable, news, settings & config runtime, benchmark v1+v2, chart analyse v1+v2+v3, recommandations analystes, earnings, news inline). Les sujets restants vivent en Phase 2.5 (stabilisation, outillage, dette) et Phase 3 (observabilité narrative).

### `metier/`
- `fonctionnalites.md` : Phase 2 — promotion **News inline (v1 minimaliste)** dans `### ✅ Livré` avec narratif court (accordéon, summary Finnhub, lien externe explicite, multi-open). Note de clôture de phase ajoutée pointant vers Phase 2.5 et Phase 3 pour ce qui reste.

### `projet/`
- `backlog.md` : (1) Phase 2 « ⏳ À faire — items ticker restants » — la note d'intro passe à « **Phase 2 clôturée 2026-05-06** ». L'ancien tableau « ⏳ À faire » est vidé (l'item news inline migré). (2) Section ✅ Livré — nouvelle entrée détaillée « News inline : accordéon de contenu sans navigation externe (v1 minimaliste) » avec design rationale (pourquoi pas scraping / pourquoi pas LLM v1) + détails techniques (signaux, helpers, HTML, SCSS, i18n, tests). (3) Section Dette technique — nouvelle entrée « News inline v2 — LLM-as-summarizer pour étendre le résumé Finnhub » 🟢 Basse, à attaquer si v1 se révèle trop court à l'usage et idéalement groupé avec Phase 3 (observabilité narrative + prompt management).

---

## 2026-05-06 (suite 5 — instrumentType end-to-end pour gater la Sector benchmark)

Suite logique du swap Twelve Data → Finnhub côté sector : pour les ETFs (VOO, SPY…) la feature « Sector benchmark » n'a pas de sens (un ETF *est* une exposition à un sector ou au marché). Plutôt que de laisser l'utilisateur cliquer et découvrir via un 404 inline, on surface le **type d'instrument** end-to-end pour cacher le toggle Sector quand le ticker n'est pas une action individuelle. Champ ajouté côté domain (`InstrumentType { STOCK, ETF, INDEX, OTHER }`), populé depuis Twelve Data `/quote.type` côté live et tagué dans la table seedée du mock pour les ~17 ETFs courants (SPY/QQQ/IWM/VOO/VTI/DIA + 11 SPDR sectors). Front : `benchmarkChoicesForCurrentTicker` computed filtre `'sector'` quand `instrumentType !== 'STOCK'`. Quand le provider ne surface pas le type (`null`), on **dégrade ouvert** (toggle visible) — préfère afficher une option légitime qu'over-hider sur des stocks dont la métadonnée a été perdue.

### `technique/`
- `architecture.md` : Section `market/` Quote — mention du nouveau champ `TickerQuote.instrumentType` et de l'enum `InstrumentType`. Twelve Data mapper note la consommation du champ `type` du `/quote` jusqu'ici ignoré.
- `developpement.md` (si nécessaire) — non touché, le détail vit dans architecture.

### `.claude/`
- `CLAUDE.md` : description ticker enrichie pour mentionner le filtre conditionnel des benchmark options selon le type d'instrument.

---

## 2026-05-06 (suite 4 — sector classifier swap Twelve Data → Finnhub)

Constat live cassant : Twelve Data `/profile` est **paid-tier only** sur les comptes free, ce qui rendait la feature « Sector benchmark » (overlay Phase 2 v2) inutilisable — chaque clic sur le toggle Sector renvoyait `auth-failed` → 503 → bandeau d'erreur côté front. Plutôt que de patcher autour (fallback automatique sur la table mock — solution proposée puis abandonnée), on remplace l'adapter par `FinnhubSectorClassifier` qui hit `/stock/profile2` (free tier 60 calls/min, déjà câblé pour news / analyst / earnings). Le `RoutingSectorClassifier` route le mode live vers Finnhub plutôt que Twelve Data — détail caché derrière le routing, pas de nouveau runtime key (toggle `market.provider` reste binaire mock/live). `TwelveDataSectorClassifier` + `TwelveDataProfileModels` supprimés du repo (récupérables via git history si besoin un jour).

### `technique/`
- `architecture.md` : Section `market/` Sector — `TwelveDataSectorClassifier` remplacé par `FinnhubSectorClassifier` (mention explicite « Remplace `TwelveDataSectorClassifier` depuis 2026-05-06 — Twelve Data `/profile` est paid-tier only »). Description de `RoutingSectorClassifier` enrichie pour pin la décision de routage live → Finnhub (le toggle `market.provider` reste, le détail Finnhub est interne).
- `ddd.md` : Couche `infrastructure/market/` Sector classification — adapter Twelve Data → Finnhub, mention des sub-industries Finnhub (Banks → Financials, Pharmaceuticals → Healthcare, Retail → Consumer Discretionary…) absorbées par les synonymes étendus.
- `providers.md` : Tableau Twelve Data — `/profile` retiré de la colonne Endpoints (avec note explicative), `TwelveDataSectorClassifier` retiré de la colonne Adapter, `sector-by-symbol` retiré de Cache (passe côté Finnhub). Tableau Finnhub — `/stock/profile2` ajouté avec note de remplacement, `FinnhubSectorClassifier` ajouté à la colonne Adapter, `sector-by-symbol` ajouté à Cache.

### `projet/`
- `sources.md` : Tableau Twelve Data — ligne `/profile` supprimée. Tableau Finnhub — ligne `/stock/profile2` ajoutée avec note `Remplace /profile Twelve Data qui est paid-tier only`.
- `backlog.md` : Item dette technique `⏳ Sector benchmark : fallback sur la table mock` (filed plus tôt aujourd'hui en suite 3) supprimé — le swap Finnhub résout la cause sous-jacente (paid-tier hard-block) plutôt que de contourner.

---

## 2026-05-06 (suite 3 — sidenav outils chart livrée)

Refonte de la chart-toolbar du Dossier ticker : les contrôles (timeframe / benchmark + autocomplete custom / overlays / outils annotation+measure+reset zoom) sont déportés dans une **sidenav gauche persistante façon Amazon**, foldable via chevron, état persisté global en localStorage. La sidenav embarque aussi une section « Annotations posées » avec liste explicite + bouton supprimer par item, qui devient le chemin discoverable pour supprimer une annotation (le handle `×` inline reste fonctionnel mais n'est plus le seul moyen). Cette livraison clôt en passant le ticket Phase 2 « Chart analyse v3 — fiabiliser la suppression d'annotations ». Drift doc mise en cohérence dans le même tour : `architecture.md`, `CLAUDE.md`, `backlog.md` (deux tickets promus en ✅, intro Phase 2 et Phase 2.5 mises à jour).

### `technique/`
- `architecture.md` : Section `Modules frontend` — description du module `ticker/` enrichie pour refléter le passage en layout 2-col avec la sidenav outils chart à gauche (Amazon-style, foldable, sticky, état localStorage `ticker-sidenav-open`) qui héberge timeframe / benchmark / overlays / outils / liste annotations posées. Ajout de la mention « section Fondamentaux (analyst + earnings) » qui manquait dans la liste des sections de la colonne droite.

### `projet/`
- `backlog.md` : (1) Phase 2 « ⏳ À faire » — retrait du ticket `⏳ Chart analyse v3 — fiabiliser la suppression d'annotations` (livré en passant via la sidenav), ajout d'une note explicative pointant vers Phase 2.5 ✅ Livré pour l'historique. Compteur Phase 2 « 2 items restants » → « l'item ci-dessous ». (2) Phase 2.5 « Stabilisation et outils » — création d'une section `### ✅ Livré` avec la première entrée **Sidenav outils chart (Dossier ticker)** détaillée (sections, persistance, sticky, responsive, embarquement de la fiabilisation annotation, tests). Retrait du ticket `⏳ Chart Dossier ticker : déporter filtres + actions` (devenu cette livraison). Intro de Phase 2.5 « refonte chart-toolbar » retirée de la liste des items déplacés (n'est plus à faire).

### `.claude/`
- `CLAUDE.md` : Description du module `ticker/` dans `## Frontend modules` enrichie pour refléter le layout 2-col + le contenu de la sidenav (timeframe / benchmark / overlays / tools / annotations-posées list). Le bloc « **Fondamentaux** section » + les indicateurs et le narratif sont désormais explicitement situés en colonne droite.

---

## 2026-05-06 (suite 2 — earnings module livré)

Livraison v1 large du module **earnings** sur le Dossier ticker, 2ᵉ sous-bloc « Résultats » de la section « Fondamentaux » sous le sous-bloc analyste. Pattern hexagonal calqué sur `analyst/` : nouveau module backend `earnings/` (port `EarningsClient` + `FinnhubEarningsClient` + `MockEarningsClient` + `RoutingEarningsClient` `@Primary` + `EarningsService` cache-bearing + `EarningsController`), nouvelle clé runtime `earnings.provider`, nouveau cache Caffeine `earnings`, deux nouveaux endpoints Finnhub (`/stock/earnings` requis pour les 4 derniers Q + `/calendar/earnings` optionnel fail-soft pour la prochaine date), nouveau repository frontend `EarningsRepository` (11ᵉ port) + adapter HTTP, sous-bloc UI avec next-date + countdown + BMO/AMC tag + tableau 4 lignes EPS estimate/actual/surprise %. Drift doc mise en cohérence dans le même tour : `architecture.md`, `ddd.md`, `developpement.md`, `developper.md`, `providers.md`, `sources.md`, `CLAUDE.md`, `commit-conventions.md`, `fonctionnalites.md`, `backlog.md` (entrée déplacée vers ✅ Livré, compteur Phase 2 « 2 items » → « 1 item »).

### `metier/`
- `fonctionnalites.md` : Phase 2 — promotion **Earnings dates et derniers résultats** dans `### ✅ Livré` avec résumé technique du livrable (port + adapters + fail-soft `/calendar/earnings`, mock symboles réservés, helper `computeSurprisePercent`, signaux scopés à la panel, helpers `earningsCountdownDays` + `earningsSurpriseSign`). « ⏳ Fundamentals avancés » conservé mais reformulé sur ce qui reste réellement à faire (guidance forward-looking, breakdown revenue par segment).

### `technique/`
- `architecture.md` : (1) Schéma ASCII vue d'ensemble — ajout du module `earnings/` à la liste backend. (2) Section `Caches Caffeine` — passe de 5 caches à 6 avec `earnings` ajouté. (3) Nouvelle section `### earnings/ — nouveau, Phase 2` modelée sur la section `analyst/` voisine — port + adapters + routing + service + endpoint + erreurs, narratif (pas bullets secs) pour rester cohérent avec la voix du fichier. (4) Section `config/` — `six clés` → `sept clés` avec `earnings.provider` ajouté à l'énumération. (5) Décision technique « Switch provider à chaud » — mention de `RoutingEarningsClient` à côté des trois routings existants. (6) Section `Modules frontend` — `10 repositories` → `11` avec `Earnings` ajouté à la liste nominale.
- `ddd.md` : (1) Tableau Bounded Contexts — nouvelle ligne `earnings | Earnings trimestriels par ticker (4 derniers Q EPS estimate/actual/surprise % + prochaine date d'annonce, Finnhub + mock), cache court | ✅ Phase 2`. (2) Tableau structure `{context}/` — ligne `earnings/` ajoutée sous `analyst/` avec triplet adapters + routing. (3) Nouvelle section `### infrastructure/earnings/ (earnings uniquement, Phase 2)` en prose (pattern voisin de `news/` et `analyst/`) qui décrit le triplet, le partage du `RestClient` Finnhub via `@Qualifier`, le placement du cache au niveau service et l'isolation des mappers purs.
- `developpement.md` : (1) Arbre projet backend — module `earnings/` ajouté entre `analyst/` et `config/`. (2) Compteur frontend `10 repositories` → `11` avec `Earnings` ajouté à l'énumération nominale. (3) Bloc « Alternative runtime » — `six clés` → `sept clés` avec mention du toggle `earnings.provider`.
- `developper.md` : (1) Section « Switcher les providers » — `quatre providers configurables` → `cinq`, ajout d'une nouvelle sous-section `### Earnings — earnings.provider` avec tableau mock/finnhub aligné sur le pattern news/analyst, mention explicite que le toggle est séparé de `news.provider` et `analyst.provider`. (2) Liste des chemins de modification — mention de `earnings.provider` dans le toggle de la page `/settings/configuration`.
- `providers.md` : Tableau Finnhub — titre `news par ticker + recommandations analystes` → `news par ticker + recommandations analystes + earnings`. Colonne **Endpoints utilisés** étendue à `/stock/earnings` + `/calendar/earnings` (avec note fail-soft sur le calendrier paid tier). **Adapter** liste les trois clients (`FinnhubClient` + `FinnhubAnalystClient` + `FinnhubEarningsClient`). **Mock alternative** documente `MockEarningsClient` avec ses trois symboles réservés. **Cache** liste les trois caches (`news-by-symbol` + `analyst-recommendations` + `earnings`). Bloc YAML « Récapitulatif config locale » enrichi du toggle `earnings.provider`.

### `projet/`
- `backlog.md` : (1) Phase 2 « ⏳ À faire — items ticker restants » — ligne `⏳ Earnings dates et derniers résultats` déplacée vers le bloc « ✅ Livré » avec notes d'implémentation détaillées (modules, ports, adapters, fail-soft `/calendar/earnings`, mock symboles réservés, cache, clé runtime, endpoint, helpers front, tests 26 backend + 7 frontend). Compteur intro `2 items ci-dessous` → `l'item ci-dessous` (plus que news inline). (2) Phase 2.5 « refonte chart-toolbar » — référence `2 items ticker restants (earnings, news inline)` → `l'item ticker restant (news inline)`.
- `sources.md` : Section Finnhub — titre `News par ticker et recommandations analystes` → `News par ticker, recommandations analystes et earnings`, intro élargie pour expliquer le partage de la clé `market.finnhub.api-key` entre `news.provider`, `analyst.provider` et `earnings.provider`. Tableau étendu aux deux nouveaux endpoints (`/stock/earnings` + `/calendar/earnings` avec note fail-soft). Note « Switch runtime » ajoute `earnings.provider` à la liste des toggles disponibles depuis `/settings/configuration`.
- `commit-conventions.md` : Tableau « Scopes courants » — nouvelle ligne `earnings` sous `analyst` (cohérence de forme avec les autres modules backend `market`, `watchlist`, `news`, `analyst`, etc.).

### `.claude/`
- `CLAUDE.md` : (1) Repository structure — module backend `earnings/` ajouté à l'arbre sous `analyst/`. (2) Backend modules — paragraphe dédié `earnings/` ajouté sous `analyst/` (port + adapters + fail-soft + mock symboles réservés + routing + cache + endpoint + mention du domain helper `computeSurprisePercent`), modèle de la voix de la section voisine. (3) Section config — mention de `RoutingEarningsClient` à côté des trois routings existants, `analyst.provider` → `analyst.provider / earnings.provider`. (4) Frontend modules — `10 repositories` → `11` avec `Earnings` ajouté à la liste, description du module `ticker/` enrichie de l'earnings sub-block (next-date countdown avec BMO/AMC tag, tableau 4 trimestres EPS estimate vs actual + surprise %).

---

## 2026-05-06 (suite — patch /doc-maintainer)

Sortie d'audit `/doc-maintainer` traitée intégralement (5 HIGH, 6 MED, 3 LOW). Drift concentrée sur le livrable de la session courante : **PR #31 « feat: recommendation analyst »** — nouveau module backend `analyst/` (port `AnalystRecommendationClient` + `FinnhubAnalystClient` + `MockAnalystClient` + `RoutingAnalystClient` `@Primary` + `AnalystRecommendationService` cache-bearing + `AnalystController`), nouvelle clé runtime `analyst.provider` (mock ↔ finnhub), nouveau cache Caffeine `analyst-recommendations`, deux nouveaux endpoints Finnhub (`/stock/recommendation` + `/stock/price-target`), nouveau repository frontend `AnalystRepository` + adapter HTTP (10ᵉ port), nouvelle section « Fondamentaux > Recommandations analystes » sur le Dossier ticker. Le module était entièrement absent des docs avant ce passage.

### `metier/`
- `fonctionnalites.md` : Phase 2 — promotion **Recommandations analystes** de `### ⏳ À venir` vers `### ✅ Livré` avec résumé technique du livrable (port `AnalystRecommendationClient`, deux adapters via `analyst.provider`, fail-soft sur `/price-target`, cache `analyst-recommendations`, helper `deriveConsensus` 60/50 %, helper `analystBucketPct`, computed `analystTrend`, signaux scopés à la panel). La ligne `⏳ Recommandations analystes` correspondante retirée du À venir.

### `technique/`
- `architecture.md` : (1) Schéma ASCII vue d'ensemble — titre `Vue d'ensemble (Phase 1)` → `Vue d'ensemble` (le schéma couvre déjà la Phase 2 entière), ajout du module `analyst/` à la liste backend et de Finnhub aux sources de données. (2) Section `Caches Caffeine` — passe de 4 caches à 5 avec `analyst-recommendations` ajouté, formulation `Tous partagent le TTL` validée (le code partage bien `market.cache.ttl-minutes`). (3) Nouvelle section `### analyst/ — nouveau, Phase 2` modelée sur la section `news/` voisine — port + adapters + routing + service + endpoint + erreurs, narratif (pas bullets secs) pour rester cohérent avec la voix du fichier. (4) Section `config/` — `cinq clés` → `six clés` avec `analyst.provider` ajouté à l'énumération. (5) Décision technique « Switch provider à chaud » — mention de `RoutingAnalystClient` à côté des deux routings existants. (6) Section `Modules frontend` — `9 repositories` → `10` avec `Analyst` ajouté à la liste nominale.
- `ddd.md` : (1) Tableau Bounded Contexts — nouvelle ligne `analyst | Recommandations d'analystes par ticker (consensus monthly + price target 12 mois, Finnhub + mock), cache court | ✅ Phase 2`. (2) Tableau structure `{context}/` — ligne `analyst/` ajoutée sous `news/` avec triplet adapters + routing. (3) Nouvelle section `### infrastructure/analyst/ (analyst uniquement, Phase 2)` en prose (pattern voisin de `news/` et `market/`) qui décrit le triplet, le partage du `RestClient` Finnhub via `@Qualifier`, le placement du cache au niveau service et l'isolation des mappers purs.
- `developpement.md` : (1) Arbre projet backend — module `analyst/` ajouté entre `news/` et `config/`. (2) Compteur frontend `9 repositories` → `10` avec `Analyst` ajouté à l'énumération nominale + ajout des ports `Annotation, Analyst` à la ligne descriptive. (3) Bloc « Alternative runtime » — `cinq clés` → `six clés` avec mention du toggle `analyst.provider`.
- `developper.md` : (1) Section « Switcher les providers » — `trois providers configurables` → `quatre`, ajout d'une nouvelle sous-section `### Recommandations analystes — analyst.provider` avec tableau mock/finnhub aligné sur le pattern news/market, mention explicite que le toggle est séparé de `news.provider` pour permettre les combinaisons live news + mock recos pendant l'itération. (2) Liste des chemins de modification — mention de `analyst.provider` dans le toggle de la page `/settings/configuration`.
- `providers.md` : Tableau Finnhub — titre `news par ticker` → `news par ticker + recommandations analystes`. Colonne **Endpoints utilisés** étendue à `/stock/recommendation` + `/stock/price-target` (avec note fail-soft sur le price-target paid tier). **Adapter** liste les deux clients (`FinnhubClient` + `FinnhubAnalystClient`). **Mock alternative** documente `MockAnalystClient` avec ses trois symboles réservés. **Cache** liste les deux caches (`news-by-symbol` + `analyst-recommendations`). Bloc YAML « Récapitulatif config locale » enrichi du toggle `analyst.provider`.

### `projet/`
- `backlog.md` : (1) Phase 2 « ⏳ À faire — items ticker restants » — ligne `⏳ Recommandations analystes` déplacée vers le bloc « ✅ Livré » (juste avant l'entrée v2 benchmark) avec notes d'implémentation détaillées (modules, ports, adapters, fail-soft `/price-target`, mock symboles réservés, cache, clé runtime, endpoint, helpers front, tests 31 backend + 8 frontend, cinq coutures post-livraison filed en dette). Compteur intro `3 items ci-dessous` → `2 items`. (2) Phase 2.5 « refonte chart-toolbar » — référence `3 items ticker restants (recos analystes, earnings, news inline)` → `2 items ticker restants (earnings, news inline)`. (3) Item « Earnings dates » légèrement reformulé pour cross-référencer la section Fondamentaux désormais existante.
- `sources.md` : Section Finnhub — titre `News par ticker` → `News par ticker et recommandations analystes`, intro élargie pour expliquer le partage de la clé `market.finnhub.api-key` entre `news.provider` et `analyst.provider`. Tableau étendu aux deux nouveaux endpoints (`/stock/recommendation` + `/stock/price-target` avec note fail-soft). Bullets « Avantages » + « Limites à connaître » mis à jour pour mentionner les recos en free tier et le quirk du price-target. Note « Switch runtime » ajoute `analyst.provider` à la liste des toggles disponibles depuis `/settings/configuration`.
- `commit-conventions.md` : Tableau « Scopes courants » — nouvelle ligne `analyst` sous `news` (cohérence de forme avec les autres modules backend `market`, `watchlist`, `news`, etc.).

### `.claude/`
- `CLAUDE.md` : (1) Repository structure — module backend `analyst/` ajouté à l'arbre sous `news/`. (2) Backend modules — paragraphe dédié `analyst/` ajouté sous `news/` (port + adapters + fail-soft + mock symboles réservés + routing + cache + endpoint), modèle de la voix de la section voisine. (3) Section config — mention de `RoutingAnalystClient` à côté des deux routings existants, `news.provider` → `news.provider / analyst.provider`. (4) Frontend modules — `9 repositories` → `10` avec `Analyst` ajouté à la liste, description du module `ticker/` enrichie de la section **Fondamentaux** avec sous-bloc analyste (consensus chip, segmented breakdown bar, price target, trend arrow).

---

## 2026-05-06 (patch /doc-maintainer)

Sortie d'audit `/doc-maintainer` traitée intégralement (3 HIGH, 5 MED, 2 LOW). Drift concentrée sur le livrable de la session courante : **chart : analyse + sélection v1+v2+v3** (zoom drag-select + brush mini-chart + multi-select overlays MA / Bollinger / 52w + annotations user persistées localStorage + measure tools), avec en particulier l'arrivée d'un **9ᵉ port frontend `AnnotationRepository`** (premier port avec un adapter non-HTTP — `LocalStorageAnnotationRepository` côté client). En passant : module backend `config/` (Phase 2) qui n'avait jamais été listé dans `CLAUDE.md`, `ddd.md` sans point d'entrée dans le README, et `developper.md` qui pointait sur `npx ng test` (Karma) alors que le projet tourne sur Vitest.

### `metier/`
- `fonctionnalites.md` : Phase 1 — phrase "Overlays MA50 / MA200 et zoom drag-select restent en backlog Phase 2" supprimée (désormais livrés). Description du graphique reformulée en deux temps (Phase 1 = courbe simple 1Y, Phase 2 = liste complète des outils interactifs livrés). Phase 2 — promotion **Chart : analyse + sélection (v1+v2+v3)** en `### ✅ Livré` avec résumé technique du livrable (zoom + brush + overlays MA/BB/52w + annotations localStorage + measure tools), retrait de la ligne `⏳ À venir` correspondante.

### `technique/`
- `architecture.md` : Section "Modules frontend" — passage de "8 repositories" à **9** avec `AnnotationRepository` ajouté à la liste nominale, mention du nouveau pattern d'adapter `adapters/*.local.ts` (client-only) en complément du `*.http.ts` historique. Description du module `ticker/` enrichie pour refléter la livraison de la session : ajout de la couche **chart analyse interactive** (zoom drag-select, brush mini-chart, overlays multi-select MA/Bollinger/52w, annotations localStorage, measure tools) à côté du benchmark overlay déjà documenté. Picker benchmark étendu de `SPY/QQQ/IWM` à `SPY/QQQ/IWM/Sector/Custom` pour cohérence avec le livrable v2 du jour précédent.
- `developpement.md` : Arbre du projet — passage de "8 repositories" à **9** + ajout `Annotation` à la liste des ports + ajout de la ligne `adapters/*.local.ts # localStorage impls (annotation v3)` sous la ligne HTTP existante. Section "Lint et formatage" — `import …\.\*` (artefact d'escape Markdown) reformulé en `package.*` lisible en source.
- `developper.md` : Section troubleshooting "Les tests Vitest ne reconnaissent pas `describe`" — recommandation `npx ng test` / `npx ng test --watch=false` (Karma builder Angular) corrigée en `npm run test` / `npx vitest run src/path/to/file.spec.ts`. Le projet utilise Vitest et `ng test` rate la config — un nouveau dev qui suivait littéralement aurait été coincé.

### `projet/`
- `etat-actuel.md` : Refresh du titre — `"Phase 2 benchmark v2 (sector + custom) livré + Phase 2.5 amorcée (2026-05-05)"` → `"Phase 2 chart analyse v1+v2+v3 livré + Phase 2.5 amorcée (2026-05-06)"`. Ajout du livrable **chart analyse + sélection v1+v2+v3** dans la section "Phase 2 démarrée" (résumé technique : zoom drag-select avec slice symétrique, brush mini-chart 52 px navigator, overlays multi-select calculés sur la **série complète puis sliced** à l'affichage, port `AnnotationRepository` 9ᵉ + adapter localStorage avec `defer()` pour quota-safety, measure tools recovered par timestamp). Section "Frontend" — picker benchmark étendu en `Off/SPY/QQQ/IWM/Sector/Custom`, ajout du bloc "chart analyse interactive" à la description du Dossier ticker. Section "Phase 2 — restant à attaquer" — ligne "Chart : analyse interactive" supprimée (livrée), passage de 4 à 3 items restants dans le compteur d'intro. Section "Dette technique" — compteur `provideRepositories()` mis à jour de 8 lignes répétitives à 9.

### `.claude/`
- `CLAUDE.md` : Repository structure — ajout module backend `config/` (Phase 2 runtime-editable settings) dans l'arbre + section Backend modules avec un paragraphe dédié décrivant `AppConfigService` / `ConfigController` / `RoutingMarketChartClient` + `RoutingNewsClient` (`@Primary`) / `CacheTtlListener`. Frontend modules — passage de 8 à 9 repositories avec `Annotation` ajouté, mention du pattern `adapters/*.local.ts` (client-only) à côté du `*.http.ts`. Description du module `ticker/` enrichie de la couche chart analyse interactive (zoom + brush + overlays + annotations + measure). Pattern `adapters/*.http.ts` assoupli à `adapters/*.http.ts (default)` + `adapters/*.local.ts (client-only)` pour ne plus mentir sur l'adapter localStorage.

### Racine
- `README.md` : Tableau Documentation — ajout d'une ligne **DDD — bounded contexts** pointant vers `docs/technique/ddd.md` qui n'avait pas de point d'entrée depuis le README (référencé par `architecture.md` et le doc-set MkDocs uniquement, manquant de la table d'orientation principale).

---

## 2026-05-05 (suite — patch /doc-maintainer)

Sortie d'audit `/doc-maintainer` traitée intégralement (3 HIGH, 5 MED, 3 LOW). Drift concentrée sur deux changements structurants livrés dans la session courante : (1) **comparaison vs benchmark v2** (nouveau port `SectorClassifier` + 3 adapters + `SpdrSectorEtfs` + `SectorClassifierService` + endpoint `/sector-benchmark`, totalement absent des docs techniques), et (2) **outillage no-wildcard imports** (Spotless custom step + `.editorconfig` racine + désactivation de la rule Detekt redondante). L'audit a aussi remonté que la Phase 2 watchlist v2 avait déjà laissé du résidu non documenté côté `SymbolSearchClient` — patché en passant.

### `metier/`
- `fonctionnalites.md` : Promotion **Comparaison vs benchmark (v2 — Sector + Custom)** en `### ✅ Livré` avec résumé technique du livrable (port `SectorClassifier`, 2 adapters via `market.provider`, mapping `SpdrSectorEtfs` 11 sectors GICS, endpoint `/sector-benchmark`, UI 5-buttons + autocomplete sidecar). Suppression de la note "v2 reportée" qui traînait en queue de l'item v1.

### `technique/`
- `architecture.md` : Réécriture complète de la section `market/` — passe de "1 port + indicateurs + 2 endpoints" à **3 ports (chart / symbol-search / sector) + 2 services applicatifs (`SymbolSearchService`, `SectorClassifierService`) + `SpdrSectorEtfs` domain helper + 4 endpoints + 4 caches Caffeine**. Schéma ASCII Phase 1 mis à jour (ligne `market/`) pour refléter le scope élargi sur deux lignes. Nouvelle décision technique notable **"Pas de wildcard imports en Kotlin"** (Phase 2.5 outillage) qui documente le choix custom Spotless + `.editorconfig` plutôt que ktlint, avec mention explicite du faux départ (152 fichiers consolidés en `*` parce que ktlint applique la sémantique IntelliJ de `ij_kotlin_packages_to_use_import_on_demand` = "force"). Tone — entrée "Tracking du modèle LLM par snapshot" reformulée : retrait du backtick-dans-gras (`` **`LlmClient.modelId()` tracé sur chaque snapshot** ``), titre en gras pur cohérent avec les autres décisions, mention de `LlmClient.modelId()` déplacée dans le corps du paragraphe.
- `ops.md` : Section "Detekt — analyse statique Kotlin" — retrait du bullet "WildcardImport autorise jakarta.persistence.* etc." (faux depuis le commit Spotless+ktlint) et remplacement par un paragraphe narratif qui explique pourquoi la rule est désactivée et où vit l'enforcement (custom step Spotless qui casse le build au lieu de juste rapporter, allowlist de 14 packages dans `build.gradle.kts`).
- `ddd.md` : Section `infrastructure/market/` — passage d'une liste de 3 lignes (TwelveData/Mock/Routing chart) à un découpage par famille de port (Chart Phase 1 / Symbol Search Phase 2 v2 / Sector Classification Phase 2 v2). Chaque famille suit le même triplet `TwelveData* + Mock* + Routing*`. Mention de `SpdrSectorEtfs` comme `internal object` colocalisé. Tableau structure `{context}/` aligné sur la nouvelle réalité.
- `providers.md` : Tableau Twelve Data — colonne **Endpoints utilisés** étendue à `/symbol_search` (autocomplete v2) + `/profile` (sector v2). **Adapter** liste les 3 clients (`TwelveDataClient` + `TwelveDataSymbolSearchClient` + `TwelveDataSectorClassifier`). **Cache** liste les 3 caches Caffeine (`market-chart` + `symbol-search` + `sector-by-symbol`).
- `developpement.md` : Section "Lint et formatage" — ajout de la mention du custom step Spotless `no-wildcard-imports` et du `.editorconfig` racine comme couche de prévention IntelliJ.

### `projet/`
- `sources.md` : Tableau Twelve Data — ajout de deux endpoints jusqu'ici non documentés (`/symbol_search` Phase 2 v2, `/profile` Phase 2 v2 → SPDR via `SpdrSectorEtfs`). Cache nommé explicitement par endpoint dans la 3ᵉ colonne (`market-chart` / `symbol-search` / `sector-by-symbol`).
- `etat-actuel.md` : Refresh du titre — `"Phase 2 watchlist v2 + lifecycle + benchmark v1 livrés (2026-05-05)"` → `"Phase 2 benchmark v2 (sector + custom) livré + Phase 2.5 amorcée (2026-05-05)"`. Ajout de deux nouveaux livrables manquants à la section "Phase 2 démarrée" : (1) **comparaison vs benchmark v2** Sector + Custom (port + 2 adapters + Routing `@Primary` + `SpdrSectorEtfs` + endpoint + UI 5-buttons + autocomplete), (2) **outillage no-wildcard imports** (`.editorconfig` + Spotless custom step + désactivation Detekt + faux départ ktlint documenté). Refonte complète de la section "Phase 2 — restant à attaquer" en 4 items strictement ticker (chart analyse, recos analystes, earnings, news inline) avec note de clôture de phase. Nouvelle section "Phase 2.5 — Stabilisation et outils" qui liste les 3 items déplacés (config runtime v2 LLM, drag-drop portfolios, sidebar modulaire). Section "Dette ouverte saillante" enrichie avec les 4 entrées du jour (shrink allowlist no-wildcard, sweep `::ng-deep`, coutures benchmark v2, agent code-reviewer pré-commit).

---

## 2026-05-05 (patch /doc-maintainer)

Sortie d'audit `/doc-maintainer` traitée intégralement (2 HIGH, 3 MED, 2 LOW). Drift causée par le livrable du jour (comparaison vs benchmark v1) qui n'avait pas encore été reflété, et résidu de renommage Tilt sur `providers.md`.

### `metier/`
- `fonctionnalites.md` : Phase 2 — "Comparaison vs benchmark" déplacée de `### ⏳ À venir` vers `### ✅ Livré` avec résumé technique du livrable (overlay opt-in SPY/QQQ/IWM, Y-axis bi-mode price/%, 2ᵉ polyline dashed, tooltip enrichi, `MatTooltipModule`, front-only zéro changement back, v2 reportée pour sector ETF + custom).

### `technique/`
- `architecture.md` : Liste des features `frontend/features/` enrichie pour le module `ticker/` — mention de l'overlay benchmark opt-in (Y-axis bi-mode, polyline dashed, `MatTooltipModule`) à côté du graphe multi-timeframe + axes + crosshair existants.
- `providers.md` : Tableau Ollama — bouton Tilt **`llm:pull-qwen`** → **`llm:ensure-model`** (alignement avec `developpement.md` et `developper.md` patchés au CHANGELOG 2026-05-04 suite 4 ; `providers.md` était la dernière doc à porter l'ancien nom). Mention "(idempotent)" ajoutée pour cohérence avec la justification du renommage.

### `projet/`
- `etat-actuel.md` : Refresh complet — en-tête "Phase 2 multi-timeframe + watchlist + news livrés (2026-05-04)" → "Phase 2 watchlist v2 + lifecycle + benchmark v1 livrés (2026-05-05)". Ajout de trois nouveaux livrables manquants à la section "Phase 2 démarrée" : (1) **lifecycle de position OPEN/CLOSED** (V5, fix CSV upsert), (2) **watchlist v2** (autocomplete `mat-autocomplete` + validation backend `/symbol_search`), (3) **comparaison vs benchmark v1** (overlay opt-in front-only). Section "Phase 2 — restant à attaquer" actualisée : retrait de "comparaison vs benchmark" (livré) et "watchlist v2" (livré), ajout de "comparaison vs benchmark v2" et "config runtime v2 LLM". Sous-section "Frontend" enrichie pour mentionner overlay benchmark sur le Dossier ticker, autocomplete watchlist sur le Dashboard, et section news. Liste des endpoints actualisée avec `/symbols/search`, `/news`, `/api/config`. Glyphe `4ᵉ` (exposant unicode) → `4e` ligne 23 — cohérence avec `fonctionnalites.md` post-patch CHANGELOG 2026-05-04 suite 4.

---

## 2026-05-04 (suite 4 — patch /doc-maintainer)

Sortie d'audit `/doc-maintainer` traitée. Drift concentrée sur les changements faits dans la session courante (réorganisation Tilt, Dependabot daily America/Toronto, ktfmt 0.62, retrait du cache Angular CI). Findings 8 (`architecture.md:205`) et 11 (`architecture.md:207+`) écartés après vérification — faux positifs : claim factuellement correct pour le premier, section déjà au format narratif pour le second.

### `metier/`
- `fonctionnalites.md` : Exposant unicode `4ᵉ` → `4e` (cohérence de glyphe avec le reste du doc set qui n'emploie pas d'exposants).

### `technique/`
- `developpement.md` : Tableau "Commandes Tilt utiles" mis à jour pour refléter la réorganisation Tiltfile — `db:reset` (ressource standalone) → bouton **Purge** attaché au panel `postgres` via `cmd_button`, et `llm:pull-qwen` → `llm:ensure-model` (renommage pour rendre l'idempotence explicite).
- `developper.md` : Section "Configurer le LLM" — référence `llm:pull-qwen` → `llm:ensure-model`, mention de l'idempotence ajoutée.
- `ops.md` : Trois drift corrigés. (1) `gradle/actions/setup-gradle@v4` → `@v6` (4 occurrences) suite au bump Dependabot déjà mergé sur master. (2) Section "Frontend" simplifiée — un seul cache npm au lieu de deux, mention explicite du retrait du step `Cache Angular build` (jamais alimenté car `.angular/cache` non créé en mode prod, `Path Validation Error` au post-step). (3) Dependabot — "Scan hebdo lundi 06:00 Europe/Paris" → "Scan quotidien 06:00 America/Toronto" suite au passage `weekly` → `daily` et au switch de timezone vers le fuseau de l'utilisateur.

### `projet/`
- `etat-actuel.md` : Décisions techniques notables — `gradle/actions/setup-gradle@v4` → `@v6`, mention du retrait du cache `.angular/cache` côté frontend (le tente initial est explicitement consigné comme abandonné).

### Racine
- `backend/build.gradle.kts` : Commentaire au-dessus de `mockwebserver` mentionnait `YahooClientTest` (classe supprimée au moment du switch Yahoo → Twelve Data en Phase 1) → corrigé pour citer les deux consommateurs actuels `TwelveDataClientTest` + `FinnhubClientTest` (vérifié `grep`).

---

## 2026-05-04 (suite 3 — patch /doc-maintainer)

Sortie d'audit `/doc-maintainer` traitée en intégralité (3 HIGH, 4 MED, 4 LOW).

### `metier/`
- `fonctionnalites.md` : Phase 0 "Architecture frontend" précise que "4 repositories" est un bilan figé Phase 0 (les phases suivantes ont enrichi à 8). Évite la confusion pour qui lit Phase 0 sans poursuivre.

### `technique/`
- `architecture.md` : Schéma ASCII de la vue d'ensemble enrichi avec le module `config/` (Phase 2) qui manquait à la carte de navigation, malgré sa documentation détaillée plus bas dans le fichier. Sous-titre des décisions techniques `### Frontend` renommé en `### Phase 1+ — frontend` pour aligner sur le pattern `### Phase 1 — pivot ticker` voisin.
- `ddd.md` : Bounded context `portfolio` aligné sur le pattern emoji des autres lignes (`Actif` → `✅ Phase 0+`). Description de `infrastructure/llm/` clarifiée — `@ConditionalOnProperty` est un pattern Phase 1 conservé en attendant l'item backlog "Config runtime v2 LLM" qui basculera sur un `RoutingLlmClient` (lève l'asymétrie avec market/news déjà en routing per-call).
- `developpement.md` : Table des types Conventional Commits réalignée sur la source de vérité `commit-conventions.md` — ajout de `docs`, `perf`, `audit`, `revert` qui manquaient.
- `ops.md` : Section "Roadmap CI / ops" nettoyée — "ESLint frontend" et "Settings runtime" retirés (livrés Phase 2), ajout d'une entrée "Cache Vitest en CI" (à mesurer avant code) reflétant la dette technique encore ouverte. Liens vers `detekt.yml`, `eslint.config.js` et `dependabot.yml` convertis en URLs GitHub absolues — ces fichiers vivent hors du `docs_dir` MkDocs et les liens relatifs `../../` cassaient sur le site déployé.

### `projet/`
- `backlog.md` : Phase 0 — entrées "Devise & valeur de marché" et "Persistance des jobs d'analyse" mises à jour. Les anciens numéros V5/V6/V7 étaient caducs après la consolidation du schéma — V1 contient désormais les colonnes `currency` / `book_value_cad` / `market_value` / `unrealized_gain` / `gain_currency` ainsi que la table `analysis_job` (vérifié sur disque). Dette technique — entrée FOUC du toggle thème : ⏳ retiré du sujet (incohérence ⏳ + ✅ Fait dans la même ligne).
- `etat-actuel.md` : Liste des migrations Flyway complétée avec V5 `asset_lifecycle` qui manquait au bilan, alors qu'elle est le sujet d'un livrable Phase 2 documenté plus haut dans le même fichier.

### Racine
- `README.md` : Tableau Documentation enrichi de deux entrées qui manquaient — "État actuel" (`docs/projet/etat-actuel.md`, cible du lien "Pour aller plus loin" de `developper.md`) et "Changelog doc" (`docs/CHANGELOG.md`, source de vérité de l'évolution du doc set). Tous deux étaient présents dans `mkdocs.yml` nav mais invisibles à qui lit le README en local.

---

## 2026-05-04 (suite 2 — idées backlog Phase 2)

### `projet/`
- `backlog.md` : Deux nouvelles entrées Phase 2 ⏳ ajoutées par le user :
  - **Réordonner les portfolios par drag-drop dans la sidebar** 🟢 Basse — drag handle CDK + persistance localStorage `portfolio-order`. Sous-ensemble de l'entrée "Sidebar modulaire" déjà existante mais livrable indépendamment.
  - **Config runtime v2 : LLM provider + model éditable depuis l'UI** 🟡 Moyenne — extension naturelle de `/settings/configuration` Phase 2 v1. Trois clés à ajouter (`llm.provider`, `ollama.model`, `anthropic.api.model`), nouveau `RoutingLlmClient` `@Primary`, retrait des `@ConditionalOnProperty` sur Claude/Ollama clients. Bouton "Tester" qui mesure latence + parse correctness sur un mini prompt fixe. Motivation : fluidifier les tests A/B model quand on bascule sur une machine plus puissante (au-delà de qwen-3B / Mistral-7B testés en Phase 1).

---

## 2026-05-04 (suite — fix lifecycle position CSV)

### `projet/`
- `backlog.md` : Nouvelle entrée Phase 2 livrée — lifecycle de position OPEN/CLOSED dans l'import CSV (V5). Notes d'implémentation détaillées : justification observabilité (vs hard delete), comportement import, queries OPEN-only, UI counters.

> Ce drift n'avait pas été remonté par l'agent doc-maintainer parce que c'était un **bug fonctionnel** (CSV import upsert sans cleanup) plutôt qu'un drift doc → code. Le code fix entraîne ensuite des updates doc en cascade — ils sont consignés ici.

---

## 2026-05-04

### `metier/`
- `fonctionnalites.md` : Phase 2 "Settings & config runtime" basculée en ✅ Livré, scope élargi à 5 clés (Twelve Data + Finnhub + cache TTL + switch providers `market.provider` / `news.provider`).

### `technique/`
- `architecture.md` : Nouveau module backend `config/` documenté (`AppConfigService`, `ConfigController`, `ConfigTestClient`). Décisions techniques notables enrichies : "Configuration runtime éditable" et "Switch provider à chaud". "Trois clés" → "cinq clés" (intro module config). Settings tabs frontend listent désormais `configuration`. "7 repositories" → "8" côté frontend (ajout `Config`). V4 ajoutée au tableau des migrations Flyway.
- `developpement.md` : Prérequis Java 21 mentionne le pin JVM via `backend/gradle/gradle-daemon-jvm.properties`. Section configuration locale renvoie vers la page runtime `/settings/configuration` comme alternative à l'édition `application-local.yml`. Nouvelle section "Lint et formatage" couvrant Spotless+Detekt côté back et ESLint+Prettier côté front. Arbre projet enrichi avec `config/` côté backend et `Config` repository côté frontend.
- `developper.md` : Section "Switcher les providers" promeut la page runtime comme alternative à l'édition YAML. Nouvelle entrée troubleshooting `npm run lint` (patterns récurrents : `prefer-inject`, a11y `click-events-have-key-events`, `label-has-associated-control`).
- `ddd.md` : Nouveau bounded context `config` ajouté au tableau (Phase 2). Couche `infrastructure/` enrichie avec `RoutingMarketChartClient` / `RoutingNewsClient` (`@Primary`, dispatch per-call). Nouvelle section "`config/` *(Phase 2)*" qui documente la structure du module et le pattern event-driven (`CacheTtlListener` cross-context).
- `ops.md` : Pipeline Frontend CI documenté avec `npm run lint` avant le build. Nouvelle section "ESLint — analyse statique TypeScript / Angular" en pendant de la section Detekt (extends, ruleset, commandes locales).
- `providers.md` : Correction typo modèle Claude — `claude-sonnet-4-6` (n'existe pas) → `claude-sonnet-4-5`.

### `projet/`
- `backlog.md` : 4 entrées Phase 2 / dette technique livrées (Settings runtime, Cleanup jobs orphelins au boot, Linter ESLint frontend, Agent Claude spécialiste doc). 1 nouvelle entrée dette technique ajoutée : `provideRepositories()` côté frontend (extraction des 8 lignes répétitives de `app.config.ts`).
- `etat-actuel.md` : Section Phase 2 enrichie de 4 nouveaux livrables (settings runtime, jobs orphelins, ESLint, doc-maintainer). V4 ajoutée au compte des migrations. "Restant à attaquer" nettoyé (settings runtime retiré, items vraiment ouverts conservés).
- `sources.md` : Note "Switch runtime" sous le tableau Finnhub — depuis Phase 2, `market.provider` et `news.provider` sont éditables en direct depuis `/settings/configuration` sans reboot backend.

### `.claude/`
- `CLAUDE.md` : Compteur frontend "7 repositories" → "8". `npm run lint` ajouté aux Frontend Commands. Nouvelle convention ESLint flat config + `eslint-config-prettier` + non-recommandation de `recommended-type-checked`. Ligne ajoutée au tableau "Documentation" pour `docs/CHANGELOG.md` (à updater en fin de chaque `/doc-maintainer` patch session).
- `agents/doc-maintainer.md` (nouveau) : Subagent read-only (`Read, Glob, Grep` ; pas de Bash, pas d'Edit) qui audite le doc set. 3 capacités : cross-check factuel, ton, cross-link integrity. Sortie = punch-list HIGH/MED/LOW. `docs/CHANGELOG.md` ajouté au tableau des docs sous responsabilité (cross-link checked, mais jamais écrit par l'agent).
- `skills/doc-maintainer/SKILL.md` (nouveau) : Slash command `/doc-maintainer` qui spawne l'audit en contexte isolé. Section "After patches are applied — update the CHANGELOG" ajoutée pour codifier la discipline post-patch (le main thread écrit l'entrée, format Keep-a-Changelog allégé groupé par area).

### Racine
- `mkdocs.yml` : Nav enrichie avec `technique/ddd.md` et `projet/etat-actuel.md` qui étaient orphelins (présents en repo mais pas servis sur le site). `docs/CHANGELOG.md` ajouté en première section "Accueil" de la nav.
- `docs/CHANGELOG.md` (nouveau) : **Création de ce fichier**. Log doc reverse-chronologique maintenu en fin de chaque session `/doc-maintainer` par le main thread. Le subagent reste read-only et ne touche pas ce fichier.
