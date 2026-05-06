# Changelog — Documentation

Log reverse-chronologique des changements apportés au doc set PortfolioAI. Maintenu en fin de chaque session `/doc-maintainer` (cf. `.claude/skills/doc-maintainer/SKILL.md`) par le main thread, après application des patches.

Format inspiré de [Keep a Changelog](https://keepachangelog.com) en version allégée :
- une section par date (`## YYYY-MM-DD`)
- bullets groupés par area (`metier/`, `technique/`, `projet/`, racine)
- une ligne narrative par changement, mentionnant le fichier concerné

Le `.claude/` (CLAUDE.md, skills, agents) y figure aussi quand il est touché — c'est de la doc-adjacent au sens où il définit les conventions et l'outillage de la session.

> Le contenu d'un fichier ne reflète que son état actuel. Ce CHANGELOG est l'unique trace de **comment** on y est arrivés (ordre, motivation, version qui a sauté…). Quand un finding paraît bizarre dans une doc, regarde ici avant de la patcher — il y a peut-être une raison récente.

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
