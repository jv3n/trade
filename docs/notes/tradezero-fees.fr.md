# Les frais TradeZero — ce qu'un short coûte en plus du P&L

> Un short GUS paie jusqu'à cinq choses en plus du mouvement de prix : le **locate**, la
> **commission** d'un ordre marketable, les **frais réglementaires** sur la vente, l'**emprunt de
> nuit** s'il est gardé après la clôture, et les coûts fixes **plateforme / compte**. Seul le locate
> est connu avant le trade.

*Dernière révision : 2026-09-26, d'après la grille tarifaire publiée par TradeZero (TradeZero
International) et ses pages de support. À confronter à un vrai relevé — voir la dernière section.*

---

## Les frais

| Frais | Quand il est prélevé | Combien | Connu d'avance ? |
|---|---|---|---|
| **Locate** | À l'**acceptation** de la cotation — avant le short, qu'il serve ou non | Un prix **par action**, variable dans la journée (offre / demande) ; 0,01–0,08 $ sur un GUS habituel | Oui — la cotation |
| **Commission** | Sur chaque ordre **payant** (le short et le cover comptent chacun) | 0,005 $ / action, 0,49 $ minimum ; sous 1 $ : 7,95 $ max jusqu'à 250 000 actions | À peu près |
| **Réglementaires** (SEC, FINRA TAF, CAT) | Côté **vente** — l'entrée short d'un GUS | Quelques cents par trade, refacturés | Non — minimes |
| **Emprunt de nuit** | Seulement si le short est **encore ouvert après la clôture** | Taux annualisé × valeur de la position, par nuit ; lots impairs arrondis à 100 actions ; le jeudi compte 3 nuits | Non — taux fixé à T+1, connu à T+2 |
| **Plateforme / données** | Mensuel | ZeroPro 59 $ (offert au-delà de 100K actions par mois ou d'un compte de 30K $) ; OTC Level 1 / 2 : 8 $ / 20 $ | Oui |
| **Compte** | À l'événement | Virement sortant 15 $, reverse split 35 $, trade passé par le courtier 30 $, intérêts de marge 9 % | Oui |

### Quels ordres sont gratuits

Les **limites non marketables** sur des actions NYSE / NASDAQ / AMEX **au-dessus de 1 $** : aucune
commission, short compris. Tout le reste paie le tarif par action : ordres au marché, **limites
marketables** (le short qui tape le bid sur un fade), tout ce qui est **sous 1 $**, l'OTC. Une entrée
GUS dans un premarket qui s'essouffle est souvent marketable — compter la commission.

### Le locate, en détail

- **Standard** : permet de shorter et racheter le même ticker plusieurs fois dans la journée.
- **Usage unique** : un short + un cover par séance, moins cher, servi en premier sur les titres
  « threshold ». Recrédité seulement si **aucune action** n'en a été shortée.
- **Pre-borrow** : obligatoire sur les titres Reg SHO threshold, plus cher, celui qui permet de
  garder la nuit.
- Les **locates inutilisés** peuvent être remis en vente : si un autre trader les prend, une partie
  du prix revient.
- Les comptes au-delà de 30K $ / 100K $ ont 7,5 % / 10 % de remise sur les locates.
- Un locate se paie **par action localisée, pas par action shortée** : localiser 2 000 et en shorter
  1 000 coûte quand même 2 000 × le prix. Et un locate payé sur une action jamais shortée est une
  perte sèche.

---

## Ce que ça change pour le tracker

- Le ratio **locate / prix** des candidats et des stats est la bonne jauge avant le trade : c'est le
  seul frais connu avant d'entrer, et sur une action à 2 $ un locate à 0,08 $ pèse déjà 4 % du prix.
- Le **P&L réel** saisi sur un trade vient du relevé et absorbe ce que le courtier impute au trade
  lui-même (commissions, frais réglementaires). Le locate est prélevé à l'acceptation, à part des
  exécutions — **très probablement hors du P&L du trade**, donc il n'arrive aujourd'hui dans le
  compte que via une correction de rapprochement.
- L'emprunt de nuit ne concerne pas le GUS (à plat à la clôture), mais concernerait un short gardé.

## Reste à vérifier

Sur un vrai relevé TradeZero :

1. Le locate est-il une **ligne de cash à part** (et sous quel libellé), ou fondu dans le trade ?
2. Commissions et frais réglementaires sont-ils dans le P&L réalisé du trade, ou des lignes à part
   aussi ?
3. Un locate recrédité apparaît-il comme sa propre ligne ?

Les réponses décident comment le compte les enregistre — un mouvement « frais » saisi, ou rien de
plus que le P&L ajusté d'aujourd'hui.
