# Roadmap — pivot v1.0 « journal de trading »

> Posée 2026-06-03 suite au pivot acté dans [`docs/TTD/changement direction`](../TTD/changement%20direction).
> **Révisée 2026-06-28** — le cœur du pivot est livré ; cette page reflète désormais l'état réel et pointe vers les [GitHub Issues](https://github.com/jv3n/trade/issues) pour le travail ouvert.

---

## Le pivot en une phrase

L'app cesse d'être un dossier d'analyse per-ticker avec narratif LLM → devient un **journal de trading** où l'utilisateur logue ses trades du jour. Les agrégats / charts / export Excel restent en phase 2.

---

## État au 2026-06-28 — le pivot est livré

Le MVP et plusieurs modules au-delà sont en production. Détail dans [`journal-livraisons.md`](./journal-livraisons.md).

| Module livré | Contenu |
|--------------|---------|
| **`journal/`** (MVP) | `trade_entry` (19 champs : exécution + checklist pré-trade + post-mortem), CRUD scopé `user_id`, **pagination + tri serveur**, **export / import CSV roundtrip-safe**. |
| **`account/`** | Compte broker : ledger de mouvements, **solde dérivé**, **sync auto du P&L journal via `TradeChangedEvent`**, graphe d'évolution (`StbAreaChart`). |
| **`stats/`** | Dataset partagé : import / export CSV, listing paginé, **CRUD éditable par propriétaire** (`IMPORT` admin / `RADAR` / `MANUAL`), 3 colonnes `%` dérivées à l'insert. |
| **`lexicon/`** | Glossaire **bilingue FR/EN** (~117 termes), lecture pour tous / CRUD admin. |
| **`candidates/`** | Cockpit de préparation d'un short : sizing au risque + suivi d'exécution + cover, calculettes GUS / borrow, création de stat depuis le candidat. |
| **`forex/`** | Toggle **USD / CAD** sur le solde compte (provider keyless Frankfurter, conversion présentationnelle). |
| Préférences UI | Thème + langue **persistés sur le user** (`/api/me/preferences`), plus en localStorage. |

> **Migrations** : les 9 migrations initiales ont été **squashées en un seul `V1__init`** (2026-06-10) ; les modules livrés depuis repartent de ce socle.

---

## Périmètre — In / Out (état réel)

### Décommissionné

| Module / Feature | Statut |
|------------------|--------|
| `portfolio/` (backend) + front `dashboard/`, `import/`, `suivi/` + repos `core/api/portfolio/` | **Supprimé** 2026-06-10. Repos front orphelins restants → [issue #104](https://github.com/jv3n/trade/issues/104). |

### Conservé en sommeil (encore atteignable, pas décommissionné)

| Module / Feature | Pourquoi |
|------------------|----------|
| `market/`, `news/`, `analyst/`, `earnings/`, `watchlist/` + narratif `analysis/` | Consommés par la page **`ticker`** (liée depuis journal / stats / nav). |
| `screener/` + front **`radar`** | **Fiabilisé** (filtre prix $1–$10 + gap ≥ +50 %) et **alimente `stats/`** via « Add stat ». Pas décommissionné. |
| `observability` (front), `settings/prompts`, slice observability d'`analysis/` | Conservés ; le drop de la slice observability reste à trancher → [issue #98](https://github.com/jv3n/trade/issues/98). |
| Providers (`MarketChartClient`, `MarketScreenerClient`, `SymbolSearchClient`, `SectorClassifier`) | Gardés pour l'enrichissement phase 2 (graphe d'un trade → [issue #97](https://github.com/jv3n/trade/issues/97)). |

### Socle actif

`auth/` (OAuth Google + `user_id` FK — le journal en dépend), `config/` (rotation des clés provider), `shared/`, infra Phase 5 (Cloud Run + Supabase + Cloudflare + WIF + Sentry). Inchangés par le pivot.

---

## Phase 2 — travail ouvert (→ GitHub Issues)

Le backlog vit dans les [Issues](https://github.com/jv3n/trade/issues) (migré 2026-06-28). Principaux chantiers phase 2 :

- **Stats du journal** — taux de réussite, P&L cumulé, perf par play / pattern / open side → [#94](https://github.com/jv3n/trade/issues/94) `prio:P1`
- **Charts** — equity curve, distributions, heatmap → [#95](https://github.com/jv3n/trade/issues/95)
- **Export Excel `.xlsx`** → [#96](https://github.com/jv3n/trade/issues/96)
- **Enrichissement chart d'un trade** (providers conservés) → [#97](https://github.com/jv3n/trade/issues/97)
- **Améliorer le journal** — page détail, positions multi-exécutions (entrées/sorties), screenshot, calculs auto → [#93](https://github.com/jv3n/trade/issues/93)

Dette technique & arbitrages : [`label:tech-debt`](https://github.com/jv3n/trade/issues?q=is%3Aissue+is%3Aopen+label%3Atech-debt) · [`label:question`](https://github.com/jv3n/trade/issues?q=is%3Aissue+is%3Aopen+label%3Aquestion).

---

## Questions de cadrage — bilan

| # | Question d'origine | Tranchée ? |
|---|--------------------|-----------|
| 1 / 7 | Ordre & portée de la refacto CSS | ✅ Résolu — nettoyage **incrémental** (container `.page` global + portage du sidenav radar), shell existant réutilisé, pas de design refresh complet. |
| 2 | Périmètre du trade entry | ✅ Résolu — **19 champs** (exécution + checklist pré-trade + post-mortem). Le screenshot reste à ajouter ([#93](https://github.com/jv3n/trade/issues/93)). |
| 3 | Lien avec les fiches TTD | 🟡 Partiel — enums `play` (A/B) / `pattern` (GUS/FRD), booléens red-flags côté stats, calculettes GUS du candidat. Pas de référence directe aux fiches `pattern.md` / `red_flags.md`. |
| 4 | Multi-user vs solo single-user | ⏳ **Ouvert** → [issue #99](https://github.com/jv3n/trade/issues/99). `auth/` reste actif en attendant. |
| 5 | LLM (zéro vs usage futur) | ⏳ Différé — **zéro LLM dans le chemin live** aujourd'hui ; piste « résumé de mes N derniers trades » gardée en tête pour phase 2. |
| 6 | Radar phase 6 | ✅ Résolu — radar **conservé en mode fiabilisé** et **branché sur le journal des stats** (pas décommissionné). |

---

## Impact docs — fait

`vision.md` réécrit (trade entry = unité atomique), `architecture.md` mis à jour (modules `journal/`, `account/`, `stats/`, `lexicon/`, `candidates/`), `CLAUDE.md` racine reformulé, `backlog.md` devenu pointeur vers les Issues. `journal-livraisons.md` reste le **log vivant** des livraisons depuis le pivot (et non une archive).

---

## Workflow

À chaque session : créer / mettre à jour les **issues** (labels `prio:` / `module:` / `type`), et à la livraison d'une feature → **clore l'issue** + ajouter l'entrée dans [`journal-livraisons.md`](./journal-livraisons.md). Cette roadmap reste la vue d'ensemble du pivot ; les détails vivent dans les issues et le journal des livraisons.
