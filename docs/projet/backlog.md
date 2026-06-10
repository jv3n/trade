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

> Premier passage fait (2026-06-10) : `portfolio/` supprimé. `ticker` / `radar` — et leurs modules backing (`market`, `news`, `analyst`, `earnings`, `screener`, `watchlist`, narratif `analysis`) — **conservés** car encore routés (liens depuis le journal / stats / nav). `settings/prompts` et `observability` (front) conservés pour l'instant.

| Item | Description | Statut |
|------|-------------|--------|
| ❌ **`portfolio/` décommissionné** | Backend `portfolio/` (entités + controllers + repos + 2 tests) + features front `dashboard` / `import` / `suivi` + 4 tables (`portfolio`, `asset`, `portfolio_snapshot`, `snapshot_position`) supprimés. Détail : [`journal-livraisons.md`](./journal-livraisons.md). | Fait 2026-06-10 |
| 🧊 **Slice observability d'`analysis/`** | `NarrativeObservabilityController` / `NarrativeBiasService` ne servent que la feature front `observability` (gardée). Seul candidat de drop restant, mais délicat (vit dans `analysis/`, gardé pour le narratif ticker). | À trancher |
| 🧊 **Repos front portfolio orphelins** | `core/api/portfolio/` (`PortfolioRepository`, `SnapshotRepository`) + bindings `providers.ts` + i18n `dashboard`/`import`/`suivi` morts depuis le drop backend — nettoyage de cascade. | À trancher |
| 🧊 **Décision auth** | Garder l'OAuth multi-user ou simplifier en solo single-user ? (cf. roadmap question 4). Le journal dépend de `trade_entry.user_id`. | À trancher |

## Questions ouvertes

Les arbitrages de cadrage (ordre des passes, périmètre exact du trade entry, lien aux fiches TTD, multi-user, LLM futur, sort du radar) vivent dans la [roadmap](./roadmap.md).

## Dette technique

| Item | Description |
|------|-------------|
| ⏳ `WildcardImport.excludeImports` allowlist | Shrinker progressivement, ne pas ajouter de nouvelle entrée (cf. CLAUDE.md). |
| ⏳ Parcours onboarding `developper.md` | Réécrire le walkthrough autour du journal — il décrit encore le flow ticker pré-pivot dormant (import Wealthsimple → dossier ticker → narratif LLM). |
