# Changelog — Documentation

Log reverse-chronologique des changements apportés au doc set PortfolioAI. Maintenu en fin de chaque session `/doc-maintainer` (cf. `.claude/skills/doc-maintainer/SKILL.md`) par le main thread, après application des patches.

Format inspiré de [Keep a Changelog](https://keepachangelog.com) en version allégée :
- une section par date (`## YYYY-MM-DD`)
- bullets groupés par area (`metier/`, `technique/`, `projet/`, racine)
- une ligne narrative par changement, mentionnant le fichier concerné

Le `.claude/` (CLAUDE.md, skills, agents) y figure aussi quand il est touché — c'est de la doc-adjacent au sens où il définit les conventions et l'outillage de la session.

> Le contenu d'un fichier ne reflète que son état actuel. Ce CHANGELOG est l'unique trace de **comment** on y est arrivés (ordre, motivation, version qui a sauté…). Quand un finding paraît bizarre dans une doc, regarde ici avant de la patcher — il y a peut-être une raison récente.

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
