# US — Page « Compte » (valeur du compte broker)

> Statut : ⏳ À cadrer · Créée 2026-06-15 · Phase : v1.0 journal (nouvelle surface)
> Référence périmètre : [`roadmap.md`](../roadmap.md) · Backlog : [`backlog.md`](../backlog.md)

---

## Pitch

> **En tant que** trader qui logue ses journées,
> **je veux** une page qui affiche la valeur courante de mon compte broker et l'historique de mes mouvements d'argent (dépôts / retraits),
> **afin de** suivre le capital réellement disponible sans avoir à me connecter au broker.

Pas de connexion API au broker : la valeur est **saisie et entretenue à la main**. La page est la source de vérité côté app, le broker reste la source de vérité réelle — l'utilisateur réconcilie les deux manuellement.

---

## Contexte

- L'app est un **journal de trading** (cf. [`vision.md`](../../metier/vision.md)). Aujourd'hui l'atomic unit est le `trade_entry`. Le P&L des trades vit dans le journal, mais **la valeur du compte n'est tracée nulle part**.
- Le broker applique des frais (commissions, frais de financement overnight short, conversion FX…) et le P&L réalisé bouge le solde en continu. Reconstituer la balance uniquement à partir des dépôts/retraits serait faux.
- D'où le besoin : un **registre de mouvements** (entrées/sorties de cash) **+ une correction manuelle** qui permet de caler la balance affichée sur la valeur réelle lue chez le broker.

---

## Référence UX (capture `ex.png`)

L'utilisateur a fourni une vue de compte (style Wealthsimple) comme **référence d'UX, pas d'UI** (le thème sombre n'est pas la cible — on reste sur le design-system `@portfolioai/ui` / M3). Les patterns à reprendre :

| Zone | Ce qu'on garde |
|------|----------------|
| **Hero balance** | Balance courante en gros + **variation sur la période** (montant + %, fléché ↑/↓) + libellé « variation 1 mois » |
| **Sélecteur de période** | Dropdown (`1 semaine`, `1 mois`, `3 mois`, `YTD`, `tout`) qui pilote le hero **et** le graphe |
| **Graphe d'évolution** | Courbe/aire de la balance dans le temps, avec **tooltip au survol** (date + balance ce jour-là) |
| **Liste transactions** | Mouvements **groupés par date**, **sous-total quotidien** aligné à droite, action **« Ajouter »** proéminente |
| **Panneau résumé** | Colonne latérale « Résumé » : métriques clés + institution (broker) |
| **Fil d'ariane** | `Comptes > <nom du compte>` — sous-entend du **multi-comptes** (cf. question ouverte n°3) |

> On adapte la sémantique au domaine : ce n'est pas une carte de crédit (utilisation/limite), mais un **compte de trading cash** → le résumé porte total déposé / total retiré / net injecté / corrections cumulées / P&L estimé.

---

## Périmètre

### In

1. **Nouvelle page « Compte »**, accessible depuis le sidenav, **placée en premier** (avant Journal).
2. **Hero balance** : valeur courante du compte en évidence + **variation sur la période sélectionnée** (montant + %).
3. **Sélecteur de période** pilotant le hero et le graphe.
4. **Graphe d'évolution de la balance** dans le temps avec tooltip au survol (dérivé du cumul des mouvements).
5. **Ajout de transactions** de cash :
   - **IN** — dépôt (alimentation du compte).
   - **OUT** — retrait.
6. **Correction manuelle de la balance** : saisir la valeur réelle lue chez le broker pour absorber les frais / P&L / écarts non tracés.
7. **Historique des mouvements groupé par date** (dépôts / retraits / **trades** / corrections) avec **sous-total quotidien**.
8. **Intégration des trades du journal** : le P&L réalisé des `trade_entry` apparaît comme mouvement `TRADE` (read-only, ticker en chip, lien vers le journal).
9. **Panneau résumé** : institution (broker), total déposé, total retiré, net injecté, **P&L trades**, corrections cumulées, nb de mouvements.

### Out (hors scope de cette US)

- Aucune connexion / sync automatique avec un broker.
- Pas de devises multiples / conversion FX (compte mono-devise USD — décision n°4).
- Multi-comptes : le fil d'ariane le suggère mais la v1 est **mono-compte** (décision n°3) ; le multi-comptes est une évolution future.

---

## Modèle proposé (à valider)

**Approche recommandée — registre (ledger) + balance dérivée.**

Plutôt que de stocker un nombre « balance » qu'on écrase, on tient un **journal de mouvements** et la balance courante est la **somme cumulée**. Chaque ligne a un type :

| Type | Sens | Origine |
|------|------|---------|
| `DEPOSIT` | + | L'utilisateur ajoute du cash (IN) |
| `WITHDRAWAL` | − | L'utilisateur retire du cash (OUT) |
| `TRADE` | ± | **P&L réalisé d'un `trade_entry`** — alimenté automatiquement depuis le journal, lié par FK (pas de double saisie) |
| `ADJUSTMENT` | ± | Correction manuelle : delta signé pour caler la balance app sur la valeur réelle du broker (absorbe frais, financement, slippage non journalisé) |

- **Modifier la balance « à la main »** = saisir une valeur cible → l'app crée un `ADJUSTMENT` de montant `cible − balance_courante`. La balance reste auditable (on voit *pourquoi* elle a bougé), au lieu d'un écrasement opaque.
- `balance_courante = Σ(dépôts) − Σ(retraits) + Σ(P&L trades) + Σ(corrections)`.

### Lien avec le journal (`trade_entry`)

C'est le point neuf de cette itération : **les trades du journal apparaissent dans le compte**.

- Chaque `trade_entry` clôturé avec un **P&L réalisé** produit un mouvement `TRADE` (montant = P&L, signe selon gain/perte), **dérivé du journal** — le `trade_entry` reste la source de vérité du montant. Le mouvement `TRADE` est **read-only** dans le compte (créé / mis à jour / supprimé en cascade avec le trade).
- Dans la liste, une ligne `TRADE` affiche le **ticker via le chip directive** (`<mat-chip stbChip="ticker">`, cf. CLAUDE.md) et **lie vers le trade** dans le journal.
- Conséquence : `ADJUSTMENT` ne sert plus qu'au **résiduel** (frais broker, financement overnight short, écarts FX) que le journal ne porte pas. C'est ce qui réconcilie le solde calculé avec la valeur réelle du broker.

**Décisions (design clé) :**

1. **Push automatique depuis le journal** — pas de saisie manuelle des trades dans le compte. Le `trade_entry` reste l'unique source de vérité du montant ; le mouvement `TRADE` est créé / mis à jour / supprimé **en cascade** (read-only côté compte). *Pourquoi : zéro double saisie, aucune dérive possible entre journal et compte.*
2. **Granularité = 1 mouvement par trade** (pas d'agrégat journalier). *Pourquoi : traçabilité 1-pour-1, lien direct vers le trade, et le groupement par date de la liste reconstitue déjà le total du jour via le sous-total.*
3. **Trades clôturés uniquement** — seul le **P&L réalisé** (trade avec prix de sortie) alimente le solde. Le **P&L latent** des positions ouvertes est **exclu**. *Pourquoi : le solde reflète du cash réellement matérialisé, cohérent avec la valeur broker hors positions mark-to-market ; éviter un solde qui bouge sans transaction.*

Champs d'un mouvement (esquisse) :

- `id`, `userId`
- `type` (`DEPOSIT` | `WITHDRAWAL` | `ADJUSTMENT`)
- `amount` (DECIMAL, > 0 ; le signe est porté par le `type`)
- `date` (date de valeur)
- `note` (optionnel — « frais broker mai », « dépôt virement »…)
- `createdAt`

> **Alternative plus simple** (à arbitrer) : une seule valeur `balance` éditable + une table de transactions IN/OUT, la correction manuelle écrasant directement `balance`. Moins d'audit, moins de code. Le ledger est recommandé car il rejoint l'esprit roundtrip/auditable du journal (export CSV à terme) pour un surcoût faible.

---

## Critères d'acceptation

- [ ] Une entrée **« Compte »** apparaît dans le sidenav, **en première position**, avec une icône (`account_balance_wallet`), libellé i18n (`nav.account`, FR + EN), tooltip en mode collapsed comme les autres items.
- [ ] La route par défaut (`''`) **reste `/journal`** *ou* bascule sur `/account` — **à trancher** (cf. questions ouvertes). Par défaut on garde `/journal` comme landing.
- [ ] La page affiche le **hero balance** : balance courante formatée (devise + séparateurs, via `DecimalPipe`/`CurrencyPipe`) + variation sur la période (montant + %, ↑/↓).
- [ ] Un **sélecteur de période** (semaine / mois / 3 mois / YTD / tout) recalcule hero + graphe.
- [ ] Un **graphe d'évolution de la balance** s'affiche avec tooltip au survol (date + balance), série = cumul des mouvements.
- [ ] Le **panneau résumé** affiche : institution, total déposé, total retiré, net injecté, **P&L trades**, corrections cumulées, nb de mouvements.
- [ ] Les trades du journal apparaissent comme mouvements `TRADE` (read-only), **ticker rendu en chip** (`stbChip="ticker"`) et **lien vers le trade** dans le journal.
- [ ] Un bouton **« Ajouter un mouvement »** ouvre un formulaire (dialog, cohérent avec `add-trade-dialog`) permettant de saisir : type (IN / OUT), montant, date, note.
- [ ] Un bouton **« Corriger la balance »** permet de saisir la valeur réelle ; l'app enregistre l'écart et met à jour l'affichage.
- [ ] L'**historique des mouvements** est **groupé par date** (sous-total quotidien à droite), trié date décroissante, avec type, montant signé, note.
- [ ] Montant **toujours > 0** ; validations côté form + côté backend.
- [ ] Feedback CRUD via snackbar (`stb-snack-bar--success` / `--error`, cf. CLAUDE.md).
- [ ] Toutes les chaînes passent par `ngx-translate` (FR + EN), aucune chaîne en dur.
- [ ] Données scoping `userId` (multi-user actuel), jamais de PII en log.

---

## Impact technique (esquisse)

### Backend — nouveau module `account/`

Calqué sur `journal/` (hexagonal + DDD léger) :

- `domain/` : `AccountMovement`, enum `MovementType`.
- `application/` : `AccountService` (ajout mouvement, correction = calcul du delta, calcul de la balance courante), DTOs.
- `infrastructure/http/` : `AccountController` (`POST /account/movements`, `GET /account/movements` paginé, `GET /account/balance`, `PATCH`/`DELETE` mouvement, endpoint correction).
- `infrastructure/persistence/` : `AccountMovementRepository`.
- **Migration Flyway** : nouvelle table `account_movement` (FK `user_id`).

### Frontend — nouvelle feature `features/account/`

- `account-page.{ts,html,scss,spec}` + dialog d'ajout / correction (pattern `add-trade-dialog`).
- Port + adapter `core/api/account/account.repository.ts` (+ binding `providers.ts`).
- Route `/account` (`canActivate: [authGuard]`) dans `app.routes.ts`.
- Item sidenav **en tête** dans `app.html`.
- Composant graphe **`StbAreaChart` dans `libs/ui`** (SVG maison, zoneless-safe — décision n°7) consommé par la page.
- i18n `nav.account` + clés de la page dans `public/i18n/{fr,en}.json`.

---

## Décisions de cadrage

Toutes tranchées. Chaque point garde le *pourquoi* — c'est la mémoire de l'arbitrage.

1. **Landing par défaut → reste `/journal`.** L'item Compte passe **en premier dans le nav** (visibilité), mais la route `''` continue de rediriger vers `/journal`. *Pourquoi : le workflow quotidien reste la saisie des trades ; le compte est un tableau de bord qu'on consulte, pas le point d'entrée de la journée.*
2. **Modèle → ledger auditable** (registre de mouvements + balance dérivée), pas de balance écrasable. *Pourquoi : on garde le « pourquoi » de chaque variation, ça rejoint l'esprit roundtrip/auditable du journal et ça donne le graphe d'évolution gratuitement (cumul). Cf. section Modèle.*
3. **Mono-compte en v1.** Un seul compte par utilisateur — `account_movement` scopé par `user_id`, **pas d'entité `account` ni de FK `account_id`**. Le fil d'ariane `Comptes › …` reste cosmétique (un seul compte). *Pourquoi : pas de besoin multi-comptes formulé ; on évite la complexité prématurée. Multi-comptes = évolution future (ajout d'une table `account` + `account_id` via migration), non pré-construite.*
4. **Devise → mono-devise USD.** Montants en `DECIMAL`, affichage `$ US`, **pas de FX**. *Pourquoi : focus small-caps US, le broker de référence est en USD ; le multi-devises + conversion serait un chantier à part sans valeur v1.*
5. **Intégration des trades** — push automatique depuis le journal, 1 mouvement par trade, trades clôturés uniquement (P&L latent exclu). *Cf. section « Lien avec le journal » pour le détail et le pourquoi.*
6. **Édition / suppression → autorisées pour les mouvements manuels** (`DEPOSIT` / `WITHDRAWAL` / `ADJUSTMENT`), avec recalcul de balance (trivial : la balance est dérivée). Les mouvements `TRADE` sont **read-only** (gérés via le journal, en cascade). *Pourquoi : registre non append-only côté manuel = on corrige une faute de frappe sans empiler des ajustements ; mais on protège l'intégrité journal ↔ compte en interdisant l'édition directe des trades.*
7. **Lib de charts → composant SVG maison léger dans `libs/ui`** (type `StbAreaChart`), **pas de dépendance externe** en v1. *Pourquoi : le graphe d'évolution est une simple courbe d'aire ; un composant SVG ~maison est zoneless-safe et sans coût de dépendance. On réévaluera une vraie lib (ngx-charts / ECharts) en Phase 2 quand les stats demanderont distributions / heatmaps — décision à mutualiser à ce moment-là.*

---

## Definition of Done

- Module backend `account/` + migration Flyway + tests d'intégration (Testcontainers, vrai PostgreSQL).
- Feature front `features/account/` + tests Vitest (page + dialog).
- i18n FR + EN complets.
- Docs mises à jour : `fonctionnalites.md` (nouvelle feature), `architecture.md` (module `account/` + table), entrée `journal-livraisons.md`, ligne retirée du `backlog.md`.
