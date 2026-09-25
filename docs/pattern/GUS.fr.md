# Gap Up Short — fiche pattern

> **Shorter** une small-cap américaine qui a gappé en premarket sans fondamental derrière. Le pari :
> le prix retombe pendant la séance, parce que le pump est artificiel.

*Dernière révision : 2026-09-25, d'après la séance du Trading Desk du 14 septembre, « Les Patterns ».*

---

## Checklist d'entrée

Tous les critères doivent tenir **en même temps**. Un KO → pas de trade.

| # | Critère | Valeur | Pourquoi |
|---|---------|--------|----------|
| 1 | **Prix** | ~0,30 $ – 10 $ | La zone de volatilité extrême, où jouent les pumps. Le broker autorisait les shorts à partir de 1 $, puis 0,50 $, maintenant 0,30 $ ; sous 1 $, c'est le buying power qui limite en pratique. |
| 2 | **Gap up** | ≥ +45 % | Open premarket (4 h) vs la clôture de la veille. En dessous, c'est du bruit ; au-dessus, c'est un vrai décrochage qui attend d'être corrigé. |
| 3 | **Float** | ≥ 1,5 M | En dessous, ça squeeze. Le plancher est passé de 3 M à 2 M puis 1,5 M au fil des stats. |
| 4 | **Daily** | Plat ou baissier | Le pump devient un pic dans une tendance baissière → retour à la moyenne. Le seul critère qui demande du jugement — section à part plus bas. |
| 5 | **Entreprise** | Faible | Pas de revenus, pas de catalyseur → rien pour tenir le prix. |
| 6 | **Volume premarket** | Présent mais modéré | Trop peu et personne ne joue. Trop et le squeeze est réel, donc dangereux. |
| 7 | **Institutions** | < 20 % | Une forte détention institutionnelle soutient le prix → le ticker ne devient jamais candidat. |
| 8 | **Pas de reverse split** | — | Le piège classique → section à part plus bas. |

Les seuils suivent les statistiques : elles sont refaites tous les quelques mois, et la fiche les suit,
pas l'inverse.

---

## Le daily — là où se joue le jugement

Toutes les autres lignes sont noir sur blanc. C'est sur le daily qu'un ticker qui coche tous les
chiffres se fait quand même refuser, ou qu'un autre à qui il manque un peu est quand même pris. Ce
qu'il doit montrer : le gap sort le prix **de son range normal** — une extension à shorter, idéalement
dans un niveau dont le marché se souvient.

Deux cas de la séance, à garder comme repères :

- **NCT** — gap up d'environ 70 %, tous les critères chiffrés remplis. Mais le titre était tombé d'une
  falaise cinq jours plus tôt et restait en bas depuis : le « gap » le ramenait seulement dans son range
  des dernières semaines. Pas d'extension à shorter → **disqualifié comme GUS**. (Il s'est quand même
  tradé, en V pattern — un autre setup.)
- **BMGL** — un daily propre : tendance baissière, pas à ce prix depuis juillet, des résistances vers
  8,40 et 9,40. **Qualifié sur le graphique.** Mais un float de 0,7 M et un niveau de halt juste sur
  l'entrée : **refusé sur le risque**. Il a été pris plus tard, en penny break (voir
  [`penny-break.fr.md`](penny-break.fr.md)).

Les captures d'écran aident plus que n'importe quelle règle : l'intraday **et** le daily de chaque
candidat, pris ou non, revus chaque semaine. Le cerveau apprend à quoi ressemble un daily « pas idéal
mais ça a marché ».

---

## Les statistiques — pourquoi on l'apprend en premier

- **Win rate ~75-80 %**, mesuré sur neuf ans.
- **Risk / reward en général ~1 : 1** — risquer 15-20 % pour aller chercher 15-20 %. Parfois 25-30 %,
  rarement 50 %.

La rentabilité vient du **win rate**, pas du R / R. C'est pour ça que des entrées approximatives
fonctionnent quand même sur ce setup, et que c'est celui à maîtriser avant tous les autres : un
débutant un peu brouillon sur ses entrées et ses sorties peut quand même y être rentable.

**La règle qui en découle** : plus le setup est beau, moins il faut être difficile. Un GUS propre qui
pousse dans un niveau de risque (premarket, VWAP, daily) vaut la peine d'être pris **frontside**, sans
attendre de confirmation — statistiquement, il finit la journée dans le rouge. Un setup auquel il
manque quelque chose (NCT, BMGL), c'est là qu'on attend plutôt un signe de faiblesse.

---

## Deux façons de le prendre

Les deux sont valables ; beaucoup de traders mélangent.

| | Probabilité | Discrétionnaire |
|---|---|---|
| **Entrée** | Une limite 3 / 5 / 10 % au-dessus de l'open, d'après les moyennes de push de la feuille de stats | À un niveau de risque (résistance premarket, VWAP, daily), sur un rejet, un [double top](DT.fr.md) ou un [penny break](penny-break.fr.md) |
| **Stop** | 15-20 % — il faut lui laisser de l'air, c'est basé sur des moyennes | 3-5 %, collé au niveau de risque |
| **Taille** | Plus petite, pour payer le stop large | Plus grosse, pour le même argent risqué |
| **Pour** | Plus d'entrées, moins d'erreurs humaines — le trader comme un robot et accepter le résultat | Meilleur R / R, plus de pourcentage quand il pousse de 20 % |
| **Contre** | Rend l'avantage quand il pousse au-delà de l'entrée | Rate les trades qui poussent de 5 % et lâchent sans confirmation |

En probabilité, le stop mérite quand même un coup d'œil autour : voir
[`stop-rule.fr.md`](../notes/stop-rule.fr.md).

Après 11 h, un trade en difficulté vaut rarement la peine qu'on le laisse courir.

---

## Des patterns dans le pattern

Un GUS peut contenir un **double top** ou un **penny break** — pas les classiques, en plus petit : un
push de 5-15 %, un rejet de 5-15 %, un retest. Ce sont les trades « licorne » : le win rate du GUS,
avec le risk / reward d'une entrée discrétionnaire serrée. Voir
[`execution-signals.fr.md`](../notes/execution-signals.fr.md) et [`penny-break.fr.md`](penny-break.fr.md).

---

## Le piège du reverse split

Quand une entreprise cote **sous 1 $ trop longtemps**, le Nasdaq / NYSE menace de la radier. Pour
l'éviter, l'entreprise regroupe ses actions → le prix monte mécaniquement, sans vrai mouvement derrière.

**Exemple** — un reverse split de 1 pour 10 sur un titre à 0,50 $ :

- Avant : 1000 actions à 0,50 $ = 500 $
- Après : 100 actions à 5 $ = 500 $ (même valeur)

Le titre apparaît parmi les gainers avec un gap up `×10` alors qu'**aucune valeur n'a bougé**. Le
shorter, et le « gap » n'a aucune raison de se refermer → perte.

**Comment le repérer** : les dépôts SEC, ou un saut de prix sans volume correspondant sur le graphique
historique.
