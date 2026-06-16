# Backlog — PortfolioAI (1.0 journal de trading)

Suivi du travail ouvert depuis le pivot vers le journal de trading. Mis à jour à chaque session.

**Statuts :** ⏳ À faire · 🚧 En cours · 🧊 Gelé · ❌ Décommissionné — les `✅ Fait` vivent dans [`journal-livraisons.md`](./journal-livraisons.md).

> Le backlog **pré-pivot** (phases 0 → 7 : ticker, narratif, observabilité, radar, vision long terme) est archivé dans [`archive/backlog-pre-pivot.md`](./archive/backlog-pre-pivot.md). La [roadmap](./roadmap.md) tient le périmètre in / out du pivot.

---

## MVP journal — livré

Le cœur du produit (table des trades + saisie + filtres + export/import CSV roundtrip + pagination/tri serveur) est livré. Détail dans [`journal-livraisons.md`](./journal-livraisons.md).

---

## Phase 2 — stats & analytics

| Item | Description | Priorité |
|------|-------------|----------|
| ⏳ **Stats du journal** | Taux de réussite, P&L cumulé, perf par play / pattern / open side, séries gagnantes-perdantes. Agrégats côté serveur sur `trade_entry`. | 🔴 Haute |
| ⏳ **Charts** | Courbe d'equity, distribution des gains, heatmap par jour / setup. | 🟡 Moyenne |
| ⏳ **Export Excel** | Au-delà du CSV brut : classeur `.xlsx` avec mise en forme / formules. | 🟡 Moyenne |
| ⏳ **Enrichissement chart d'un trade** | Rattacher le graphe du symbole au moment du trade via les providers conservés (`MarketChartClient`). | 🟢 Basse |

## Décommissionnement

> Premier passage livré 2026-06-10 — `portfolio/` supprimé (détail dans [`journal-livraisons.md`](./journal-livraisons.md)). `ticker` / `radar` et leurs modules backing (`market`, `news`, `analyst`, `earnings`, `screener`, `watchlist`, narratif `analysis`) **conservés** car encore routés (liens journal / stats / nav). `settings/prompts` et `observability` (front) conservés pour l'instant. Restent à trancher :

| Item | Description | Statut |
|------|-------------|--------|
| 🧊 **Slice observability d'`analysis/`** | `NarrativeObservabilityController` / `NarrativeBiasService` ne servent que la feature front `observability` (gardée). Seul candidat de drop restant, mais délicat (vit dans `analysis/`, gardé pour le narratif ticker). | À trancher |
| 🧊 **Décision auth** | Garder l'OAuth multi-user ou simplifier en solo single-user ? (cf. roadmap question 4). Le journal dépend de `trade_entry.user_id`. | À trancher |

## Questions ouvertes

Les arbitrages de cadrage (ordre des passes, périmètre exact du trade entry, lien aux fiches TTD, multi-user, LLM futur, sort du radar) vivent dans la [roadmap](./roadmap.md).

## Dette technique

| Item | Description |
|------|-------------|
| ⏳ Hot-reload WSL cassé (edits Windows → outils WSL sur `/mnt/c`) | **Symptôme** : éditer un fichier depuis Windows ne déclenche ni le reload `ng serve` (front :4201) ni la redétection `bootRun` / Tilt (back) → il faut `touch` le fichier côté WSL ou relancer le resource. **Cause** : sur `/mnt/c` (DrvFs/9p), le noyau WSL2 n'émet **aucun event `inotify`** pour les écritures d'origine Windows (cf. [microsoft/WSL #4739](https://github.com/microsoft/WSL/issues/4739)) — indépendant de `fs.inotify.max_user_watches`. Concerne aussi le « hot-restart » Kotlin du back, qui exige *en plus* Spring DevTools + une compilation continue. **Pistes (robustesse décroissante)** : (1) déplacer le repo dans le FS ext4 de WSL (`~/dev/…`) → `inotify` natif front+back + I/O plus rapide (c'est l'approche JetBrains : watcher du même côté que les fichiers, jamais à travers la frontière) ; (2) polling côté front (`ng serve --poll=2000` ou `CHOKIDAR_USEPOLLING=true`) ; (3) relay Windows→WSL (poll Windows + `touch` Linux) ; (4) DevTools + build Gradle continu pour le vrai hot-restart back. Réf : microsoft/WSL #4739, projet `int128/idea-fsnotifier-wsl`. |
| ⏳ Validation des écritures live + mapping 409 | Backend chemin write live : (1) ajouter une validation (Bean Validation `@field:NotBlank` / `@Size` / `@Positive` + `@Valid`, ou manuelle façon `lexicon/`) sur `TradeEntryRequest` / `StatEntryFormRequest` — aujourd'hui un `ticker` blanc se stocke en chaîne vide ; (2) restreindre le 409 de `GlobalExceptionHandler` aux seules violations d'unicité — les violations de CHECK (`size > 0`, `open_price > 0`) remontent un « Conflit : ressource déjà existante » faux ; ajouter un handler `MethodArgumentNotValidException` → 400. Bundle cohérent (la validation amont règle l'essentiel du mapping). Cf. [`audits/2026-06-15-revue-globale.md`](./audits/2026-06-15-revue-globale.md) Importants 1+2. |
| ⏳ `WildcardImport.excludeImports` allowlist | Shrinker progressivement, ne pas ajouter de nouvelle entrée (cf. CLAUDE.md). |
| ⏳ Parcours onboarding `developper.md` | Réécrire le walkthrough autour du journal — il décrit encore le flow ticker pré-pivot dormant (import Wealthsimple → dossier ticker → narratif LLM). |
| ⏳ Repos front portfolio orphelins | `core/api/portfolio/` (`PortfolioRepository`, `SnapshotRepository`) + bindings `providers.ts` + i18n `dashboard` / `import` / `suivi` morts depuis le drop backend portfolio (2026-06-10) — nettoyage de code mort en cascade. |
