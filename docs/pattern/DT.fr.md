# Double Top — fiche pattern

> **Shorter** un titre qui a fortement monté en intraday, s'est fait rejeter, et revient tester son
> high. Le pari : le deuxième test échoue, parce que le rejet a convaincu le marché que le top est fait.

*Dernière révision : 2026-10-27 (le Sink est le bas de la première chute ; ce que propose le scanner, #776) ; 2026-10-13 (les points nommés BARES, #716) ; 2026-10-12 (la chute mesurée, #706) ; 2026-09-25, d'après la séance du Trading Desk du 14 septembre, « Les Patterns ».*

---

## Les points — BARES

Cinq points, les mêmes mots en français et en anglais, nommés d'après ce qu'ils sont :

| | Point | Ce que c'est |
|---|-------|--------------|
| **B** | **Base** | Le bas d'où part la poussée — l'open par défaut |
| **A** | **Apex** | Le haut de la première poussée |
| **R** | **Rejection** | Le bas du rejet depuis l'Apex |
| **E** | **Echo** | Le second test, l'écho de l'Apex — le trade |
| **S** | **Sink** | Le bas de la première chute après l'Echo — ce que le pattern a payé. Pas le plus bas du jour : après un rebond, le prix peut descendre plus bas (ZTG 16/10 : 0,75, puis 0,58). La chute finit au premier vrai rebond depuis son bas — **10 %** tel que le lit le scanner ; sans ce rebond, le plus bas jusqu'à la clôture. |

Les jambes se nomment du point qu'elles atteignent : **A** l'extension (Base → Apex), **R** le rejet
(Apex → Rejection), **E** l'echo (Rejection → Echo), **S** le sink, la première chute (Echo → Sink). **Sink** est aussi
le dernier point du GUS (Open · Push · Sink) : la chute finale porte le même nom dans chaque pattern.

---

## Checklist d'entrée

| # | Critère | Valeur | Pourquoi |
|---|---------|--------|----------|
| 1 | **Extension (A)** | ≥ +50 % | Base → Apex, en intraday, depuis l'open. En comptant le gap, c'est à juger — la feuille de stats sépare « extension depuis l'open » et « extension avec gap » pour cette raison. |
| 2 | **Rejet (R)** | 17-20 % sous l'Apex | En dessous, c'est une respiration normale (section suivante). |
| 3 | **Echo (E)** | Retour vers l'Apex | Le deuxième test, c'est le trade. Il frôle souvent l'Apex sans le prendre. |
| 4 | **Un risque ailleurs** | Niveau daily ou premarket près de l'Apex | Pas obligatoire, mais ça aide nettement. |

---

## Pourquoi 17-20 % et pas 10 %

Un repli de 10 % est une **respiration normale** : les titres en font tout le temps, puis vont
chercher le palier suivant. Exemple de la séance — BMGL a fait son top à 8,36 ; 8,36 + 10 % = 9,19 ;
le titre a tourné à 9,22. Une fois qu'on le sait, on voit des respirations de 10 % partout, et un rejet
de 10 % ne prouve rien.

À **17-20 %**, les gens commencent à croire que le top est fait. Les longs qui ont raté leur sortie, et
ceux qui perdent de l'argent maintenant, décident de vendre la prochaine fois qu'il revient — c'est
cette croyance qui crée la vente sur l'Echo (voir les [quatre vendeurs](../notes/four-sellers.fr.md)).

---

## Ce que propose le scanner

[`ts-scanner`](https://github.com/jv3n/ts-scanner) relit la séance précédente sur les barres 1 min
et propose des double tops à relire sur la page stats. Ses bandes sont **les siennes, pas la
checklist d'entrée** : larges exprès, car un faux positif coûte un « Rejeter » alors qu'un faux
négatif ne se voit jamais. Chaque jambe est une cible ± une tolérance, dans son temps :

| Jambe | Bande | Temps |
|-------|-------|-------|
| **A** — Base → Apex | 40–200 % | ≤ 60 min |
| **R** — sous l'Apex | 15–32 % | ≤ 30 min |
| **E** — Rejection → Echo | 15–40 % | ≤ 60 min |

L'Echo peut dépasser l'Apex de **6 %** au plus — la fausse sortie du dernier top ; au-delà, il a
cassé et ce n'est pas un double top. La séance seulement, Base comprise : aucun double top ne se
prend hors séance.

---

## Entrée et sortie

**Probabilité** — entrer à **−5 % du top** : un top à 3,00 $ → entrée à 2,85 $. Lui laisser ~10 %
d'air au-dessus du top → stop vers 3,30 $ → risquer ~15 % pour aller chercher 10-15 %. Un bon R / R avec
un bon win rate, tant que le double top remplit les critères ci-dessus.

Les 10-15 % viennent de l'expérience. La page Stats les mesure désormais (#706) : la **chute après
le retest**, lue depuis cette entrée à −5 %, et combien de chutes atteignent 10 % — après quelques
mois de données, cette ligne devra citer le chiffre mesuré.

**Attendre la cassure** du high initial donne plus de confirmation sur sa réaction, et de meilleures
entrées — mais en fait rater beaucoup : un double top **frôle souvent le high initial sans le prendre**.
Entrer quelques pourcents sous le high est le compromis habituel.

Une variante du groupe : entrer sur le fake-out du dernier top, stop ~6 % au-dessus.

Quand l'Echo n'atteint jamais l'Apex, un niveau de rebond qui casse et échoue peut quand même
donner l'entrée — un [penny break](penny-break.fr.md).

---

## Le stop

Le stop calculé plus haut mérite un coup d'œil autour avant d'être placé — la règle que partagent
tous les patterns, la [règle du stop](../notes/stop-rule.fr.md).
