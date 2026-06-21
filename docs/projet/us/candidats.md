# US — Page « Candidats » (analyse & sizing d'un short avant trade)

> Statut : ⏳ À cadrer · Créée 2026-06-19 · Phase : v1.0 journal (nouvelle surface)
> Référence périmètre : [`roadmap.md`](../roadmap.md) · Backlog : [`backlog.md`](../backlog.md)

---

## Pitch

> **En tant que** trader short small-caps qui prépare sa séance,
> **je veux** une page où je rentre un ticker candidat avec ses données du jour (open, prev close, float, volume…) et qui me sort tout le plan de trade — échelle d'entrée au risque, suivi d'exécution, échelle de sortie, plus les calculs GUS / borrow / push,
> **afin de** décider chaque matin quoi shorter et à quelle taille, sans refaire les calculs à la main dans un tableur.

C'est le rapatriement, dans **une seule surface persistée**, du tableur « Trading Desk » que l'utilisateur tient aujourd'hui à la main. Les calculettes isolées (GUS, borrow fee, % push) — sorties puis **shelvées** — sont **absorbées** ici : un candidat est le contexte unique qui alimente tous les calculs.

---

## Contexte

- L'app est un **journal de trading** post-pivot (cf. [`vision.md`](../../metier/vision.md)) : focus short small-caps gap-up, range $1–$10. L'atomic unit livré est le `trade_entry`. Mais **rien ne couvre la phase amont** : la préparation du matin (quoi shorter, à quelle taille, quel stop).
- L'utilisateur travaille aujourd'hui dans un **tableur** (captures fournies) qui combine : sizing au risque sur une échelle de paliers, suivi des fills réels, échelle de cover, et trois petites calculettes (GUS %, borrow fee %, % push).
- Des **calculettes isolées** avaient été amorcées côté front (`gus-calculator`, `borrow-fee-calculator`) puis **shelvées** : la décision est de **ne pas les garder en pages séparées** mais de les **intégrer à la fiche candidat**, où elles ont leur contexte (open price, prev close, entry price…).
- **Pas de provider câblé en v1** : conformément à l'esprit post-pivot (saisie manuelle, cf. CLAUDE.md), les données de marché (float, volume, push) sont **saisies à la main**. Les clients dormants (TwelveData/FMP/Polygon/Finnhub) restent pour un enrichissement Phase 2, non câblés ici.

---

## Référence UX (captures `Screenshot 2026-06-19 *`)

Tableur « The Trading Desk » fourni comme **référence métier / de calcul**, pas d'UI (on reste sur le design-system `@portfolioai/ui` / M3, thème clair). Les blocs à reprendre :

| Bloc | Ce qu'on garde |
|------|----------------|
| **Paramètres** | Encadré : ticker, total capital, % capital at risk → $ at risk (dérivé), open price, stop % |
| **Données du jour** | Prev close, **float**, **gap up (GUS %)**, **volume**, morning push — contexte de décision |
| **Échelle d'entrée** | Tableau par palier (% vs open) : prix, max shares à shorter, investissement total |
| **Suivi d'exécution** | Saisie des shares réellement remplies par palier → risque courant, remaining, résidu, **position moyenne** |
| **Échelle de sortie / cover** | Prix de sortie, shares couvertes, % et $ gain/loss vs position moyenne, TP moyen |
| **Calculettes** | GUS %, borrow fee % — alimentées par les champs du candidat. *(% push : hors scope v1, reporté Phase 2.)* |

---

## Périmètre

### In

1. **Nouvelle page « Candidats »**, accessible depuis le sidenav.
2. **Création / édition d'un candidat (upsert)** : un formulaire unique qui saisit ticker + paramètres + données du jour.
3. **Sélecteur (dropdown) de candidat** : liste les candidats **du jour** ; en sélectionner un **remplit la fiche** ; on peut **ré-enregistrer** (upsert) — pas de tableau-liste, c'est une fiche pilotée par un picker.
4. **Scope par date de séance** : la dropdown ne montre que les candidats dont la date = aujourd'hui. Les candidats d'une date antérieure sont **implicitement clos** (conservés en base, **sortis du picker**).
5. **Échelle d'entrée au risque** (calcul automatique, paliers fixes en % de l'open).
6. **Suivi d'exécution** : saisie des `shares in play` par palier (paliers fixes) → risque courant, shares restantes, résidu de budget risque, totaux. **Sizing uniquement** depuis 2026-06-21.
7. **Entrées réelles (saisie libre)** : tableau symétrique du cover où le trader saisit le **prix d'entrée réel + shares** par leg (non contraint aux paliers) → entrée %, risque $, risque %, investissement, et la **position moyenne pondérée** qui alimente le cover. *(Ajouté 2026-06-21.)*
8. **Échelle de sortie / cover** : saisie des sorties → % / $ gain-loss vs position moyenne, TP moyen, totaux.
9. **Calculettes intégrées** : GUS %, borrow fee %, alimentées par les champs du candidat (absorption des calculettes shelvées). *(Le % push est **hors scope v1** — cf. Décisions de cadrage.)*
10. **Création d'une stat depuis le candidat** : depuis un candidat, ouvrir l'`add-stat-dialog` **pré-rempli** (date, ticker, gap % issu du GUS, open) → enregistré dans le module stats. *(Révisé 2026-06-19 : à l'origine « promotion → trade_entry ».)*
11. Toutes chaînes via `ngx-translate` (FR + EN), données scopées `userId`.

### Out (hors scope de cette US)

- Aucune connexion / fetch automatique de données marché (float/volume/gap saisis main).
- Pas de re-trading des candidats clos depuis l'UI v1 (ils restent en base ; un écran d'historique/archive est une évolution future).
- Pas de multi-comptes ni de devise multiple (mono-USD, cohérent avec [`compte-broker`](./compte-broker.md)).
- Pas de graphes (distribution, heatmap) — Phase 2.

---

## Modèle proposé (à valider)

### Entité `candidate`

Un enregistrement par ticker préparé, scopé `userId` + daté.

| Champ | Type | Note |
|------|------|------|
| `id`, `userId` | | scope multi-user |
| `tradingDate` | DATE | date de séance — pilote la visibilité dans la dropdown |
| `ticker` | TEXT | rendu en chip (`stbChip="ticker"`) partout |
| `totalCapital` | DECIMAL | capital total |
| `pctCapitalAtRisk` | DECIMAL | ex. 5.00 (%) |
| `openPrice` | DECIMAL | |
| `prevClose` | DECIMAL | pour le GUS % |
| `stopPct` | DECIMAL | ex. 40.00 (% au-dessus de l'open) |
| `float`, `volume` | DECIMAL / BIGINT | données du jour (saisies) |
| `morningPush` | DECIMAL | **saisi et stocké**, mais aucun calcul `% push` en v1 (reporté Phase 2) |
| `borrowCostPerShare` | DECIMAL | pour le borrow fee % |
| `fills` | JSON (`jsonb`) | shares in play par palier fixe (suivi d'exécution — sizing) |
| `entries` | JSON (`jsonb`) | legs d'entrée en saisie libre (prix + shares) → position moyenne |
| `exits` | JSON (`jsonb`) | échelle de cover saisie |
| `createdAt`, `updatedAt` | | |

> **Tranché (implémenté)** : `fills` / `entries` / `exits` sont des colonnes **`jsonb`** sur `candidate` (marshalling typé dans le service, Hibernate les voit comme `String` via `@JdbcTypeCode(JSON)`), pas de tables filles — le candidat est un agrégat éphémère (durée de vie = la séance), pas de requêtage relationnel sur les legs.

### Dérivés (jamais persistés — recalculés)

- `dollarAtRisk = totalCapital × pctCapitalAtRisk / 100`

### Cycle de vie = piloté par la date

Pas de machine à états explicite : le statut **dérive de `tradingDate`**.

- `tradingDate = aujourd'hui` → **actif**, visible dans la dropdown, éditable.
- `tradingDate < aujourd'hui` → **clos**, hors dropdown (conservé en base).

*Pourquoi : zéro saisie de statut, ça colle au geste réel (« les candidats du jour ») et ça garde l'historique sans le polluer l'écran de travail.*

---

## Calculs (source de vérité métier)

`p` = palier en fraction de l'open (ex. +0.35) ; paliers fixes : `+0.40 (= stop), +0.35, +0.30, +0.25, +0.20, +0.15, +0.10, +0.07, +0.05, 0, −0.10 … −0.40`.

### Échelle d'entrée (paliers entre 0 et le stop)

| Colonne affichée | Formule | Vérif. screen (open 12.04, stop 0.40, $risk 365) |
|--------|---------|---------|
| `price` | `openPrice × (1 + p)` | p=0.35 → 16.25 ✓ |
| `maxShares` | `round(dollarAtRisk / riskPerShare)`, avec `riskPerShare = (stopPct − p) × openPrice` (intermédiaire de calcul, **non affiché**) | p=0.35 → 365 / (0.05 × 12.04) = 365 / 0.602 = **606** ✓ ; p=0.30 → **303** ✓ |
| `totalInvestment` | `maxShares × price` | |

> Le `riskPerShare` reste calculé dans `candidates.math.ts` (il alimente `maxShares` ici et `currentRisk` dans le suivi d'exécution) mais n'est **plus une colonne** du tableau — décision UX 2026-06-21 : la colonne « Risque / action » alourdissait la lecture sans guider la décision de sizing (c'est `maxShares` qui pilote).

Les paliers négatifs (−10 → −40 %) sont la **zone de profit** : affichés (prix cible) mais sans sizing.

### Suivi d'exécution (par palier, `sharesInPlay` saisis)

Colonnes affichées : **Entrée · Risque $ · Shares en jeu · Risque courant · Restant · Investissement**.

| Sortie | Formule |
|--------|---------|
| `Risque $` (`riskPerShare`) | `prix du stop − prix du palier` = `(stopPct − p) × openPrice` — risque par share jusqu'au stop |
| `currentRisk` | `sharesInPlay × riskPerShare` |
| `remaining` | `maxShares − sharesInPlay` (`maxShares` reste calculé en interne, non affiché dans ce tableau) |
| `investment` | `sharesInPlay × price` |
| `Σ totaux` | sommes des colonnes |
| `residual` | `dollarAtRisk − Σ currentRisk` (négatif = au-dessus du budget risque) |

> **Tri par défaut** : du palier le plus bas au plus haut (**+5 % d'abord**, puis 7/10/15/20/25/30/35), à l'inverse de l'échelle d'entrée (stop → profit). On saisit l'exécution dans l'ordre où le short se construit (petit gap d'abord). Décision UX 2026-06-21 : ici on affiche **Risque $** (= `riskPerShare`, soit `prix du stop − prix du palier`) plutôt que `maxShares`, déjà donné par l'échelle d'entrée.
>
> **Sizing uniquement (2026-06-21)** : la **position moyenne** n'est plus calculée ni affichée ici — elle est portée par le tableau **Entrées réelles** ci-dessous (saisie libre), source unique de la moyenne qui alimente le cover. Ce tableau ne sert plus qu'au dimensionnement (risque par palier + résidu).

### Entrées réelles (saisie libre — `entries` saisis)

Tableau symétrique du cover : un leg par entrée réelle, prix + shares **saisis** (non contraint aux paliers). Colonnes affichées : **Prix d'entrée · Entrée % · Shares en jeu · Risque courant · Risque % · Investissement · ⌫**.

| Sortie | Formule | Vérif. screen (open 5.00, stop 40 % → stop 7.00 ; leg 200 @ 3.21) |
|--------|---------|---------|
| `entryPct` | `(entryPrice − openPrice) / openPrice` | (3.21 − 5)/5 = **−35.80 %** ✓ |
| `riskPerShare` | `stopPrice − entryPrice` = `openPrice × (1 + stopPct) − entryPrice` | 7.00 − 3.21 = 3.79 |
| `currentRisk` | `sharesInPlay × riskPerShare` | 200 × 3.79 = **$758** ✓ |
| `riskPct` | `riskPerShare / entryPrice` | 3.79 / 3.21 = **118.07 %** ✓ |
| `investment` | `sharesInPlay × entryPrice` | 200 × 3.21 = **$642** ✓ |
| `averagePosition` | `Σ(entryPrice × shares) / Σ shares` | prix de short moyen pondéré (→ cover) |
| `averagePct` | `(averagePosition − openPrice) / openPrice` | distance moyenne à l'open |
| `averageRiskPct` | `(stopPrice − averagePosition) / averagePosition` | risque % sur la position moyenne |

> La **position moyenne** de ce tableau est l'**unique** entrée du cover (le suivi à paliers ne la calcule plus). Toutes les sorties dérivées restent `null` (jamais `NaN`) tant qu'open / stop manquent.

### Échelle de sortie / cover (position short → on rachète)

Colonnes affichées : **Prix de sortie · % G/P · $ G/P · Shares couvertes · ⌫** (la saisie `sharesCovered` est placée **après** le bloc gain/perte — décision UX 2026-06-21).

| Sortie | Formule | Vérif. screen (avg ≈ 3.78) |
|--------|---------|---------|
| `pctGainLoss` | `(averagePosition − exitPrice) / averagePosition` | exit 3.00 → 20.6 % ✓ (gain quand exit < entrée) |
| `dollarGainLoss` | `(averagePosition − exitPrice) × sharesCovered` | (3.78−3.00)×200 ≈ 155 ✓ |
| `averageTP` | `Σ(exitPrice × sharesCovered) / Σ sharesCovered` | |
| totaux | `Σ sharesCovered`, `Σ dollarGainLoss` | |

> `averagePosition` = la position moyenne du tableau **Entrées réelles** (plus celle du suivi à paliers, depuis 2026-06-21).

### Calculettes intégrées

| Calcul | Formule | Vérif. screen |
|--------|---------|---------|
| **GUS %** | `(openPrice − prevClose) / prevClose` | (12.04 − 3.9)/3.9 = **208.7 %** ✓ |
| **Borrow fee %** | `borrowCostPerShare / openPrice` | 0.10 / 12.04 ≈ **0.83 %** ✓ |

> **% Push : hors scope v1.** `morningPush` est saisi et persisté mais aucune calculette ne le consomme — la formule n'a jamais été tranchée (le code shelvé reste la référence). Reporté Phase 2 (cf. Décisions de cadrage).

---

## Critères d'acceptation

- [ ] Une entrée **« Candidats »** apparaît dans le sidenav (libellé i18n `nav.candidates`, FR + EN, icône, tooltip collapsed comme les autres items).
- [ ] La page affiche un **dropdown de sélection** listant uniquement les candidats **du jour** (date = aujourd'hui) ; sélectionner un candidat **remplit la fiche**.
- [ ] Un **formulaire upsert** permet de créer un nouveau candidat ou de **ré-enregistrer** le candidat affiché (ticker, capital, % risque, open, prev close, stop %, float, volume, push, borrow cost/share).
- [ ] `$ at risk` est **recalculé** et affiché (capital × %), jamais saisi.
- [ ] L'**échelle d'entrée** se calcule automatiquement (prix / max shares / investissement par palier) dès que open + stop + $ risque sont renseignés.
- [ ] Le **suivi d'exécution** permet de saisir les shares in play par palier et affiche risque courant, remaining, **résidu** et totaux (sizing — plus de position moyenne ici).
- [ ] Les **entrées réelles (saisie libre)** permettent d'ajouter des legs (prix + shares) et affichent entrée %, risque courant, risque %, investissement + **position moyenne** / moyenne % / risque moyen % ; cette position moyenne alimente le cover.
- [ ] L'**échelle de sortie** permet de saisir les sorties et affiche % / $ gain-loss vs position moyenne + TP moyen + totaux.
- [ ] Les **calculettes GUS % / borrow fee %** s'affichent, alimentées par les champs du candidat. *(% push : hors scope v1.)*
- [ ] Le **ticker est rendu en chip** (`<mat-chip stbChip="ticker">`, cf. CLAUDE.md) là où il apparaît.
- [ ] Un bouton **« Créer une stat »** ouvre l'`add-stat-dialog` **pré-rempli** (date, ticker, gap % issu du GUS, open) et l'enregistre via le module stats.
- [ ] Les candidats d'une **date antérieure** ne figurent **plus** dans la dropdown (mais restent en base).
- [ ] Feedback CRUD via snackbar (`stb-snack-bar--success` / `--error`, cf. CLAUDE.md).
- [ ] Toutes les chaînes via `ngx-translate` (FR + EN), aucune en dur. Données scopées `userId`, jamais de PII en log.

---

## Impact technique (esquisse)

### Backend — nouveau module `candidates/`

Calqué sur `journal/` (hexagonal + DDD léger) :

- `domain/` : `Candidate` (agrégat), value objects pour fills / entries / exits (legs JSON `jsonb`).
- `application/` : `CandidateService` (upsert, lecture des candidats du jour, suppression), DTOs. **Les calculs dérivés (échelle, totaux) peuvent vivre côté front** (pas de persistance) — le backend ne stocke que les saisies.
- `infrastructure/http/` : `CandidateController` (`POST/PUT /candidates` upsert, `GET /candidates?date=today`, `DELETE`).
- `infrastructure/persistence/` : `CandidateRepository` + migration Flyway `candidate` (`V7` — FK `user_id`, `trading_date` indexé, colonnes JSON `fills` / `entries` / `exits`).

### Frontend — nouvelle feature `features/candidates/`

- `candidates-page.{ts,html,scss,spec}` + formulaire upsert.
- **Lib de math `candidates.math.ts`** (fonctions pures : échelle d'entrée, suivi à paliers, **entrées réelles (`entrySummary`)**, cover, GUS/borrow/push) + spec — **récupère la math des calculettes shelvées** au lieu de la jeter.
- Port + adapter `core/api/candidates/candidates.repository.ts` (+ binding `providers.ts`).
- Route `/candidates` (`canActivate: [authGuard]`) dans `app.routes.ts` + item sidenav dans `app.html`.
- Dropdown via `StbSelectModule` ; chips ticker via `StbChipsModule`.
- i18n `nav.candidates` + clés de page dans `public/i18n/{fr,en}.json`.
- **Création d'une stat** : réutilise le dialog `add-stat-dialog` du module stats avec des valeurs pré-remplies (seed).

---

## Décisions de cadrage

Tranchées avec l'utilisateur (chaque point garde le *pourquoi*).

1. **Surface unique, calculettes absorbées — code shelvé non re-commité.** Les calculettes `gus-calculator` / `borrow-fee-calculator` / `% push` shelvées **ne reviennent pas en pages/routes séparées et ne sont pas re-commitées telles quelles** : on **récupère uniquement leur logique de calcul** (migrée dans `candidates.math.ts`) et elles deviennent des sous-blocs de la fiche candidat. *Pourquoi : elles n'ont de sens qu'avec un contexte (open, prev close, entry) que le candidat porte déjà ; une page isolée duplique la saisie. Le candidat est désormais le seul propriétaire de ces calculs.*
2. **Persistance = upsert + dropdown, pas de tableau-liste.** Une fiche éditable unique pilotée par un sélecteur. *Pourquoi : le geste du matin est « je choisis/édite le candidat sur lequel je bosse », pas « je parcours une grille ».*
3. **Cycle de vie piloté par la date.** Le statut dérive de `tradingDate` : seuls les candidats du jour sont dans la dropdown ; les antérieurs sont clos et masqués (conservés en base). *Pourquoi : zéro saisie de statut, colle au geste réel, garde l'historique sans encombrer l'écran.*
4. **Données marché saisies à la main (v1).** Float / volume / gap / push renseignés par l'utilisateur ; le GUS % est calculé (prev close + open). **Pas de provider câblé.** *Pourquoi : cohérent avec l'esprit post-pivot (manuel) ; le câblage provider est un chantier Phase 2 (enrichment) sans valeur bloquante ici.*
5. **Création d'une stat depuis le candidat** (révisé 2026-06-19 ; à l'origine « promotion → trade »). Le bouton « Créer une stat » ouvre l'`add-stat-dialog` pré-rempli (date, ticker, gap GUS, open) et l'enregistre dans le module stats. *Pourquoi : le candidat préparé le matin alimente d'abord le dataset stats (le suivi du setup), pas directement le journal d'exécution ; on évite la double saisie côté stats.*
6. **% push hors scope v1** (tranché 2026-06-21). Seules **GUS %** et **borrow fee %** sont livrées comme calculettes. `morningPush` reste un champ saisi/persisté mais aucun calcul ne le consomme. *Pourquoi : la formule exacte du « % push » n'a jamais été reconfirmée sur le code shelvé ; on ne livre pas une calculette dont la sémantique n'est pas tranchée. Le câblage est un chantier Phase 2, sans valeur bloquante pour le sizing du matin.*

### Questions ouvertes

- **Stockage des fills/exits** : JSON sur `candidate` (recommandé v1) vs tables filles — à confirmer.
- **Formule exacte du % push** : *tranché — hors scope v1* (cf. Décisions de cadrage #6). `morningPush` reste saisi/stocké pour Phase 2.
- **Sens des paliers positifs** : le tableur ajoute au short quand ça monte (pyramidage contre soi) ; confirmer que les paliers fixes (`40/35/30/25/20/15/10/7/5`) sont figés ou paramétrables.

---

## Definition of Done

- Module backend `candidates/` + migration Flyway `candidate` + tests d'intégration (Testcontainers, vrai PostgreSQL).
- Feature front `features/candidates/` + `candidates.math.ts` (fonctions pures testées Vitest) + tests page/form.
- Création d'une stat depuis le candidat fonctionnelle (`add-stat-dialog` pré-rempli → `StatsRepository`).
- i18n FR + EN complets.
- Docs mises à jour : `fonctionnalites.md` (nouvelle feature), `architecture.md` (module `candidates/` + table + absorption des calculettes), entrée `journal-livraisons.md`, ligne backlog.
