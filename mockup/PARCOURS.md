# Parcours utilisateur — suivi de trading

Document de travail pour redéfinir l'app. On décrit la journée de trading telle qu'elle se passe vraiment, étape par étape, et pour chaque étape ce que l'app doit capter. Les maquettes (`index.html`) suivent ce document.

Légende : ✅ défini · 🟡 en cours · ❓ à définir

---

## Contexte

- **Stratégie : le GUS** (*Gap Up Short*) pour l'instant — shorter une small-cap US qui a gap up en premarket sans fondamental, en pariant sur le retour du cours. Référence dans [`docs/pattern/GUS.md`](../docs/pattern/GUS.md) (prix 1–10 $, gap ≥ +50 %, float 3–50 M, chart flat/downtrend, société faible, volume PM modéré, pas de reverse split).
- **Courtier : TradeZero.**
- **Repérage : le radar** (outil externe) sert à trouver les tickers du jour. L'app ne remplace pas le radar, elle enregistre ce qui en sort.

### Pattern

Le **candidat**, la **stat** et le **trade** portent chacun un **pattern** (saisi sur le candidat, hérité par la stat puis par le trade). On ne fait que du GUS au début, mais la liste est prévue dès maintenant — et elle **va évoluer dans le temps** (DT et d'autres patterns viendront) :

| Valeur | Libellé | Description |
|--------|---------|-------------|
| `GUS` | Gap Up Short | Short d'un gap up premarket sans fondamental. **Défaut.** |
| `DT` | Double Top | Short sur double sommet. |
| `DISCRETIONARY` | Discrétionnaire | Trade sans pattern pré-établi. |

### Le cycle de vie : candidat → stat → trade

```
Candidat (matin) ──[ action : « → Stat » ]──▶ Stat ──[ action : « → Trade » ]──▶ Trade (journal)
```

- Chaque passage est une **action manuelle** : c'est moi qui choisis.
- En pratique, **presque tous les candidats deviennent des stats** (d'où un bouton « Tout passer en stats »). Seule une partie des stats devient un trade.
- Un candidat non promu reste dans l'historique du jour.

---

## La journée type

| # | Moment | Ce que je fais | Ce que l'app capte | Statut |
|---|--------|----------------|--------------------|--------|
| 1 | Matin, premarket | Connexion TradeZero, analyse au radar, choix des tickers | Les **candidats** du jour | ✅ |
| 2 | Matin | Je retiens les candidats à suivre | Candidat → **stat** (bouton) | ✅ |
| 3 | Séance | Je prends (ou non) des trades sur TradeZero | Rien — l'app ne sert pas pendant la séance | ✅ |
| 4 | Après la séance | Je fais le bilan de mes trades | Stat → **trade** (bouton) : exécutions, post-mortem, capture | ✅ |
| 5 | Clôture, 16h | Je note comment les tickers du jour ont évolué | La **feuille de stats** complétée | ✅ |
| 6 | Chaque matin + au fil de l'eau | Rapprochement du solde avec TradeZero, dépôts, retraits | Le **compte** | ✅ |

---

## Accueil — « Aujourd'hui » ✅

La page d'accueil suit la journée type : chaque étape avec son état (**faite** / **en cours** / **à faire**), l'heure à laquelle elle a été faite, et un bouton vers l'écran concerné. L'état se déduit des données : rapprochement validé ce matin, candidats saisis, stats encore à compléter, etc. À côté : solde (rapproché ou non), P&L du jour / de la semaine / du mois, candidats du jour, trades de la semaine.

**Ordre du menu** : Aujourd'hui · Candidats · Stats · Journal · Compte · (en bas, à part) Lexique. Candidats → Stats → Journal suit le cycle de vie d'un ticker (chaque bouton « → Stat » / « → Trade » mène à l'onglet suivant) ; Compte est un registre consulté ponctuellement, pas une étape ; Lexique est une référence. Le futur onglet monitoring / graphes ira entre Journal et Compte.

**Le rapprochement du matin se fait directement dans l'étape 1** : solde app, solde TradeZero saisi, écart calculé en direct, bouton « Valider » (ou « Créer la correction » s'il y a un écart). Plus besoin d'ouvrir Compte le matin.

**Écran** : [`aujourdhui.html`](aujourdhui.html). La maquette a une bascule « 8h00 / 16h15 » pour voir la page à deux moments de la journée.

---

## Étape 1 — Capture des candidats (matin) ✅

**Quand** : en premarket, juste après l'analyse au radar, avant l'ouverture.

**Ce que je saisis** (tout ce que je connais à ce moment-là) :

| Donnée | Exemple | Source / précision |
|--------|---------|--------------------|
| Pattern | GUS | Défaut GUS (cf. enum ci-dessus) |
| Ticker | `KTTA` | |
| Clôture de la veille | 2,65 | Bougie daily |
| Open premarket | 4,05 | Premier prix du premarket, **4h00** |
| High premarket | 4,65 | |
| Float | 8,2 M | |
| Volume | 3,1 M | TradeZero, **au moment de la saisie** — donne l'idée globale du volume pour valider le pattern |
| Locate | 0,03 $ / action | Coût pour emprunter l'action à shorter |
| Note | « Résistance 4,65 » | Libre, optionnelle |

**Ce que l'app calcule** (rien à saisir) :

- **Gap %** = (open PM − clôture veille) ÷ clôture veille → ici +52,8 %.
- **Push %** = (high PM − open PM) ÷ open PM → ici +14,8 %.
- **Locate / prix** = locate ÷ open PM → poids du coût d'emprunt *(proposition, à garder ou non)*.

**Décidé** :

- Pas de cases à cocher pour les critères qualitatifs du GUS (chart, société, reverse split).
- Rien sur le sizing (capital, risque, stop, échelle d'entrée, fills, covers) : ce n'est pas connu au moment de la capture.
- Un seul candidat par jour et par ticker : une deuxième saisie du même ticker le même jour est refusée.
- Clôture veille, open PM et high PM sont obligatoires (high PM ≥ open PM) ; float, volume, locate et note sont facultatifs.
- Locate / prix en ambre au-delà de 5 % (coût d'emprunt lourd).
- Les jours passés sont en lecture seule (historique).

**Écran** : [`candidat.html`](candidat.html) — saisie rapide en haut (aperçu gap / push en direct), liste des candidats du jour triée par gap, bouton « → Stat » par ligne et « Tout passer en stats », navigation jour par jour.

---

## Étape 2 — Candidat → stat ✅

- **Uniquement par un bouton d'action** : « → Stat » sur une ligne de candidat, ou « Tout passer en stats ». Aucune création automatique.
- La stat **reprend toutes les données du candidat** (pattern, ticker, clôture veille, open / high PM, gap, push PM, float, volume, locate, note).
- La stat est créée « à compléter » : les données de séance arrivent à l'étape 5.

**Décidé** :

- Un candidat déjà passé en stat affiche « En stats » et ne peut pas l'être deux fois (refus).
- « Tout passer en stats » ne traite que les candidats absents de la feuille ; ceux qui y sont déjà sont laissés de côté, sans faire échouer le lot. L'action est donc rejouable sans risque.
- La stat garde un lien vers le candidat d'origine. Supprimer le candidat ensuite ne supprime pas la stat : le lien est simplement vidé.

---

## Étape 3 — Séance ✅

**L'app ne sert pas pendant la séance.** Tout se passe sur TradeZero ; l'app intervient avant (candidats, le matin) et après (stats à 16h, trades au journal). Conséquence : aucun écran « temps réel », pas de suivi de position en direct.

---

## Étape 4 — Stat → trade (journal) ✅

- **Uniquement par un bouton d'action** « → Trade » sur une ligne de stat. Pas de création de trade « à vide » depuis le journal.
- Le trade **hérite du pattern de la stat** et affiche son contexte (premarket + séance) en lecture seule.

**Ce que je saisis sur le trade** :

| Bloc | Contenu |
|------|---------|
| Exécutions | Heure, type (short / cover), nombre d'actions, prix — une ligne par fill TradeZero |
| Post-mortem | « Ce qui s'est passé » + « Erreur / à améliorer » |
| Capture du chart | Une image (PNG / JPEG / WebP, 5 Mo max) |

**Ce que l'app calcule** : position, entrée / sortie moyennes (et leur écart vs l'open), P&L $ et %, durée du trade.

**P&L ajustable** : le P&L est calculé à partir des exécutions, mais je peux saisir le **P&L réel** du relevé TradeZero pour absorber les frais et les arrondis du broker (quelques centimes à quelques dollars — je ne connais pas les frais exacts à l'avance). L'app affiche le calculé, le réel et l'écart. Le **P&L retenu** (le réel s'il est saisi, sinon le calculé) est celui qui remonte au compte.

**Retiré** : checklist pré-trade, bloc « exécution » (front / back side, short sur résistance, stratégie de sortie), play A / B, indicateurs de risque (budget, R multiple).

**Écrans** : [`journal.html`](journal.html) (liste + KPIs, filtre par pattern) et [`trade.html`](trade.html) (fiche du trade).

---

## Étape 5 — Compléter la stat (clôture, 16h) ✅

**Quand** : après la fermeture du marché, à 16h.

**Ce que je saisis** (en $, valeurs de l'action) :

| Donnée | Exemple | Remarque |
|--------|---------|----------|
| Open | 4,20 | Prix d'ouverture de la séance — base de tous les % |
| Push à l'open | 4,62 | **Nouveau** — le prix atteint par le push qui suit l'ouverture |
| HOD | 4,62 | High of Day |
| LOD | 3,41 | Low of Day |
| EOD | 3,52 | Clôture |
| SSR | oui / non | |
| Prix < 1 $ | oui / non | |
| Entrée après 11h | oui / non | Gardé même si en théorie je ne devrais pas le faire |

**Ce que l'app calcule** : push à l'open %, HOD %, LOD %, EOD %, tous **vs l'open** — ex. push à l'open (4,62 − 4,20) ÷ 4,20 = +10,0 %.

**Retiré** de l'ancienne feuille : institutionnels % et « > 20 % institutionnels ». C'est une condition du GUS filtrée en amont : un ticker à forte détention institutionnelle ne devient jamais candidat, donc la donnée n'apporte rien dans la stat. Retiré aussi : l'origine RADAR / MANUEL / IMPORT et le jeu de stats partagé entre utilisateurs — une stat appartient toujours à son utilisateur.

**Décidé** :

- Une seule stat par jour et par ticker (comme les candidats) ; une deuxième est refusée.
- La stat est « à compléter » tant que les cinq prix de séance ne sont pas tous saisis ; les flags valent non par défaut.
- Aucun pourcentage n'est stocké : tout se recalcule à partir des prix.
- Les KPI du haut (complétées, push à l'open moyen, LOD moyen, fade) portent sur **tout le filtre**, pas sur la page affichée.
- Pas d'import CSV pour les stats : une stat naît d'un candidat. Il reste un **export** CSV (bloc premarket, bloc séance, flags), avec les prix de séance vides pour une stat à compléter.
- Filtre « tradées / non tradées » : reporté avec le lien vers le trade (#193).

**Écran** : [`stats.html`](stats.html) — encart « Compléter la séance » pour les stats en attente (aperçu des % en direct), tableau avec les données premarket (reprises du candidat) et de séance, flags, bouton « → Trade » ou lien vers le trade existant.

---

## Référence — Lexique ✅

Hors du flux quotidien : le glossaire du vocabulaire trading (GUS, DT, float, locate, SSR, LOD, squeeze…), consultable à tout moment.

- **Affichage en cards** (une card par terme : terme, abréviation développée, définition), triées par ordre alphabétique — validé tel quel.
- **Bascule FR / EN** pour la définition.
- **Recherche** par terme + index alphabétique.
- Lecture seule : l'ajout, la modification et la suppression se font dans Paramètres › Lexique (admin).
- Les termes suivent l'enum pattern : FRD retiré, DT ajouté.

**Écran** : [`lexique.html`](lexique.html).

---

## Paramètres ✅

Accessible depuis le bas du menu (sous Lexique). Un menu secondaire à gauche, quatre sections :

| Section | Pour qui | Contenu |
|---------|----------|---------|
| Préférences | Tout le monde | Profil + déconnexion, **thème** (système / clair / sombre), langue (FR / EN), devise d'affichage du solde (USD / CAD) |
| Accès | Admin | Emails autorisés à se connecter (liste modifiable) ; administrateurs (lecture seule, définis au déploiement) |
| Données | Admin | Export / import CSV du journal, export CSV des stats |
| Lexique | Admin | Tableau des termes (terme, définition FR, définition EN) : ajouter, modifier, supprimer (avec confirmation) |
| Liens ops | Admin | Consoles et tableaux de bord (facturation, production, base, supervision, GitHub) |

- **Le thème ne se choisit que dans Préférences** — plus de bouton de thème dans le menu. « Système » (défaut) suit le réglage clair / sombre de l'ordinateur, en direct.
- **Le lexique ne se modifie que par l'admin, ici.** La page Lexique est en lecture seule pour tout le monde (cards + recherche + FR / EN).

**Écran** : [`parametres.html`](parametres.html).

---

## Principes d'interface ✅

- **Confirmation dans une modale** pour toute action qui crée ou supprime quelque chose : « → Stat », « Tout passer en stats », « → Trade », suppression d'un candidat ou d'un trade. La modale dit ce qui va se passer (ce qui est repris, ce qui disparaît — ex. le mouvement du compte quand on supprime un trade). Les suppressions ont un bouton rouge. Pas de modale pour « Modifier » ni pour les saisies.
- **Saisie du matin** : validée telle quelle (formulaire en ligne + aperçu gap / push en direct).
- **Tableau des stats** : on garde toutes les colonnes, le défilement horizontal ne gêne pas.
- **Couleurs** : vert / rouge réservés aux résultats (P&L, montants, écarts) ; ambre pour les alertes (SSR, < 1 $, locate cher, à compléter) ; indigo pour les statuts et catégories (pattern, « En stats ») ; le reste neutre, y compris les variations de prix et les tickers.
- **Icônes** : Material Symbols Rounded — correspondance dans `README.md`.
- **Alignement** : contenu aligné à gauche (juste après le menu), pas centré — plus simple à lire. Largeur maximale conservée pour ne pas étirer les lignes.
- **Formulaires denses** : champs Material à 40 px (densité -4) et pas d'espace réservé sous un champ tant qu'il n'y a pas de message d'erreur.

---

## Plus tard — Monitoring & graphes

Une fois les stats alimentées sur la durée : tableaux de bord et graphes pour voir **ce qui marche le mieux** (par pattern, par tranche de gap / float / push, taux de fade, résultats des trades vs stats…). **Pas maintenant** : on refait d'abord les écrans existants.

---

## Étape 6 — Compte ✅

Le solde est **dérivé des mouvements** :

| Mouvement | Origine |
|-----------|---------|
| Trade | **Automatique** — chaque trade du journal remonte avec son P&L retenu (non éditable depuis le compte) |
| Dépôt / retrait | Saisi à la main |
| Correction | Créée par le **rapprochement du matin** |

**Rapprochement du matin** (tous les matins) : je saisis le solde affiché par TradeZero, l'app le compare au solde calculé. Pas d'écart → le rapprochement est simplement horodaté. Écart → une ligne « Correction » cale le solde sur TradeZero. Ça rattrape tout ce que les P&L ajustés n'auraient pas couvert (frais d'emprunt, arrondis…).

**Écran** : [`compte.html`](compte.html) — solde USD / CAD, encart « Rapprochement du matin » (écart calculé en direct), historique des derniers rapprochements, courbe du solde, liste des mouvements.

---

## Mise en œuvre

Le recodage est découpé en issues GitHub **#184 à #205** (enum pattern, modale de confirmation, candidats, stats, journal, compte, page Aujourd'hui, navigation, paramètres, icônes, couleurs…). Chaque issue décrit le périmètre, les critères d'acceptation, les maquettes de référence et ses dépendances. Décisions de mise en œuvre : pattern en **enum** dans le code, **base repartie à vide** (pas de migration de données).
