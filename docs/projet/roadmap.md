# Roadmap — pivot v1.0 « journal de trading »

> Posée 2026-06-03 suite au pivot acté dans [`docs/TTD/changement direction`](../TTD/changement%20direction). Sert de référence aux prochaines sessions — chaque session pourra cocher / amender les sections concernées.

---

## Le pivot en une phrase

L'app cesse d'être un dossier d'analyse per-ticker avec narratif LLM → devient un **journal de trading** où l'utilisateur logue ses trades du jour. Stats / charts / export Excel = phase 2.

---

## Roadmap haut niveau

1. **Refacto CSS** — passe de nettoyage avant tout (ordre à confirmer, cf. questions ouvertes).
2. **Décommissionnement** des modules qui ne servent plus.
3. **Conservation des providers** — réutilisés à terme pour enrichir les trades du journal en chart data.
4. **Backlog 1.0** — nouveau backlog construit ici à neuf, l'ancien `backlog.md` + `journal-livraisons.md` restent en archive.

---

## Périmètre — In / Out

### Sort (décommissionnement probable, à confirmer ticket par ticket)

| Module / Feature | Note |
|------------------|------|
| `analysis/` (pipeline narratif LLM, prompts, observabilité, bias) | Toute la Phase 1 + Phase 3 |
| `portfolio/` (imports CSV Wealthsimple, snapshots, dashboard portefeuille) | Le portefeuille était read-only, hors scope d'un journal de trade actif |
| `news/`, `analyst/`, `earnings/` (sections fondamentaux du dossier ticker) | Phase 2 — plus de dossier per-ticker |
| `screener/` côté UI + service | Phase 6 — à confirmer (cf. question 6) |
| Front : `features/dashboard/`, `ticker/`, `suivi/`, `observability/`, `settings/prompts/`, `radar/`, `import/` | Surface produit Phase 1 → 6 |
| BDD : `ticker_narrative_snapshot/job`, `prompt_template/score`, `screener_snapshot_day`, `portfolio_snapshot/snapshot_position`, `asset`, `portfolio` | Migrations à lister proprement avant suppression |

### Reste

| Module / Feature | Pourquoi on garde |
|------------------|-------------------|
| `MarketChartClient` + adapters TwelveData / mock | Réutilisé pour enrichir un trade du journal (graphe du symbol au moment du trade) |
| `MarketScreenerClient` + adapters FMP / Polygon / mock | Providers conservés même si la UI radar dégage |
| `SymbolSearchClient`, `SectorClassifier` | Réutilisés pour le formulaire trade (autocomplete symbole, tag secteur) |
| `auth/` (OAuth Google + multi-tenant `user_id` FK) | À confirmer (cf. question 4) |
| `config/` (runtime config UI + `AppConfigService`) | Rotation des clés provider sans reboot |
| `shared/` (GlobalExceptionHandler, UpstreamUnavailable) | Cross-cutting, neutre au pivot |
| Infra Phase 5 (Cloud Run + Supabase + Cloudflare + WIF + Sentry) | Le déploiement ne change pas |

### Nouveau à construire

| Artefact | Description |
|----------|-------------|
| Table BDD `trade_entry` | symbol, date, side long/short, entry price, exit price, qty, P&L, notes (champs exacts à définir cf. question 2) |
| Module backend `journal/` | domain + service + repository + controller (`POST /add`, `GET /list`, `PATCH /update`, `DELETE`) |
| Front `features/journal/` | Table principale + bouton « Add » + formulaire trade (inline ou modal à trancher) |
| Migration Flyway V5 | Création `trade_entry`, drop des tables décommissionnées dans une migration suivante (V6) après validation |

---

## Impact docs (rédactionnel)

| Fichier | Action |
|---------|--------|
| `docs/metier/vision.md` | **Réécriture complète** — l'atomic unit devient le trade entry, plus le dossier ticker |
| `docs/metier/fonctionnalites.md` | Garde header + Phase 4 + Phase 5. Phases 1/2/2.5/3/6 marquées DEPRECATED ou déplacées en archive |
| `docs/technique/architecture.md` | Surgery sur sections « Modules backend », « Modules frontend », « Schéma de base de données ». Ajout module `journal/` |
| `docs/projet/backlog.md` | Nouveau backlog 1.0 trading journal ; l'ancien contenu archivé à part |
| `docs/projet/journal-livraisons.md` | Reste tel quel — historique des phases 1 → 6 |
| `CLAUDE.md` racine | Intro « per-ticker dossier = atomic unit » à reformuler en « trade entry = atomic unit » |

---

## Questions ouvertes (à trancher en début de prochaine session)

1. **Ordre de la passe** — refacto CSS d'abord (sur l'app actuelle qui va beaucoup changer) ou décommissionnement d'abord puis CSS sur le périmètre cible restreint ? La 2e voie évite de styler ce qui dégagera.
2. **Périmètre v1.0 trade entry** — champs minimums (symbole, side, prix, qty, P&L, date) ou aussi : screenshots du chart, tags (`gap-up short`, `breakout`), check des red flags / pattern matchés depuis les fiches TTD ?
3. **Lien avec les fiches TTD** — le journal référence-t-il `pattern.md` / `red_flags.md` (case « pattern joué » + « red flags présents au moment du trade ») ? Boucle l'apprentissage avec l'outil.
4. **Multi-user** — on garde la couche auth Phase 4 (OAuth + `user_id` FK) ou solo single-user (et on retire toute la complexité OAuth) ?
5. **LLM** — vraiment zéro LLM ou usage futur genre « écris-moi un résumé de mes 50 derniers trades » à garder en tête ?
6. **Radar Phase 6** — décommissionnement complet (UI + service + BDD `screener_snapshot_day`) ou garder un mode dégradé qui alimenterait le journal (« voici les setups du jour, clique pour journaliser ton entrée ») ?
7. **Refacto CSS — portée** — design refresh complet (nouvelle DA, palette, typo) ou juste nettoyage des résidus ? Partir d'un layout neuf pour le journal ou réutiliser le shell existant (toolbar / sidenav settings) ?

---

## Workflow conseillé

1. Trancher **question 7 (ordre)** en début de prochaine session.
2. Trancher **question 2 (périmètre trade entry)** pour pouvoir poser la table `trade_entry` et le module `journal/`.
3. Les autres questions peuvent se débloquer en route au fur et à mesure des sessions.
4. À chaque session, **mettre à jour cette roadmap** : cocher ce qui est fait, déplacer en archive ce qui est tranché, ajouter des questions qui émergent.
