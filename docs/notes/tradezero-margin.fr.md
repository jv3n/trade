# La marge short chez TradeZero — pourquoi un ordre revient refusé

> Sur un titre à bas prix, TradeZero ne prend pas la marge sur la valeur de la position : il prend
> un **montant fixe par action**. Sous ce plancher, le nombre d'actions qu'un short peut prendre
> **ne dépend plus du prix** — et moins le titre coûte cher, moins le compte peut être engagé.

*Dernière révision : 2026-09-29, d'après les pages de marge publiées par TradeZero (US,
International) et le guide rapide TradeZero Canada du 28 juillet 2026. Les règles de marge « peuvent
changer chaque jour et du jour au lendemain selon la volatilité, le float et les détentions
d'initiés » (TradeZero) — revoir les sources ci-dessous quand une taille semble fausse.*

---

## La règle

La marge d'une action shortée vaut **`max(prix, plancher)`**, pas son prix. L'exemple de TradeZero :
1 000 actions shortées à 1,50 $ → **5 000 $** de marge, pas 1 500 $.

Le plafond d'un short est donc `buying power ÷ max(prix, plancher)`, avec `buying power = solde ×
levier`. Avec 20 000 $ de buying power et un plancher à 2,50 $, le plafond est de **8 000 actions**
à 0,39 $, à 0,65 $ comme à 1,30 $ — seule la valeur de la position bouge. C'est le « parfois je ne
peux pas prendre ce que je veux », et ça mord le plus là où vit le GUS : les titres sous 1 $.

## Les grilles publiées

| Entité | Marge short sous le seuil | Sources |
|---|---|---|
| **TradeZero US** | **5,00 $ par action** sous 5,00 $ (depuis le 2 août 2024 ; avant, 2,50 $ par action sous 2,50 $ et 100 % de la valeur de 2,51 $ à 4,99 $) | [blog](https://tradezero.com/en-us/blog/short-margin-requirements-for-low-priced-stock) · [support](https://tradezero.com/en-us/support/questions/what-is-the-margin-requirement-when-shorting-a-stock-under-usd5-00-are-these-stocks-marginable) |
| **TradeZero International** | **2,50 $ par action** sous 2,50 $ ; 5,00 $ par action ou 6:1 de 2,50 $ à 5,00 $ ; 6:1 au-dessus. Long : 1x sous 2,00 $, 6x au-dessus. Pas plus de 2:1 à l'approche de la clôture de 16 h | [exigences de marge](https://tradezero.com/support/questions/what-are-your-margin-requirements-tradezero-international) · [shorter sous 1 $](https://tradezero.com/blog/new-to-tradezero-international-shorting-stocks-under-usd1) |
| **TradeZero Canada** | Jusqu'à 3:1 en intraday ; 500 $ de capital pour shorter ; rien de shortable sous 0,30 $ ; sous 2,00 $ pas de valeur de marge, cash seulement ; liquidation à 20 % de capital ou 99 $ — **la grille short par action n'est pas publiée** | [Quick Guide CA, 28 juillet 2026](https://portal.tradezero.com/manuals/tzc/Quick_Guide_TradeZero_CA.pdf) |

## Ce qu'utilisent les calculatrices

Les deux calculatrices de taille (« Taille maximale », « Taille de position ») modélisent cette
règle. Leurs **valeurs par défaut**, modifiables sous « Règles du broker » et gardées une fois
changées :

| Réglage | Par défaut | Face aux grilles ci-dessus |
|---|---|---|
| Levier | **2** | International monte à 6:1 au-dessus de 2,50 $, Canada à 3:1 en intraday ; 2:1 à la clôture |
| Plancher de marge par action | **2,50 $** | International ; US est à 5,00 $ ; Canada non publié |
| Lot | **100** actions | Les locates se vendent par centaine |
| Marge de sécurité | **5 %** du buying power | Garde la taille sous le mur si le plancher a bougé dans la nuit |

Si un chiffre publié change, mettre à jour le tableau plus haut **et** ces valeurs par défaut dans
le même changement.

## Reste à trancher

**Sur quelle grille est ce compte.** Le guide canadien ne publie pas la grille short par action, et
5,00 $ contre 2,50 $ par action, c'est la moitié de la position. Pour trancher :

1. demander au support TradeZero quelle marge short s'applique sous 2,50 $ / 5,00 $ sur ce compte ;
2. ou lire le buying power que la plateforme réserve sur un vrai ticket d'ordre avant de l'envoyer
   — le diviser par le nombre d'actions donne le plancher appliqué.

D'ici là, le plancher par défaut est 2,50 $ — les calculatrices sont un modèle de la règle du broker,
pas la règle elle-même.
