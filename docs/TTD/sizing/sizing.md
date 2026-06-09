# Sizing — fiche de révision

> **Combien de *shares* trader sur un setup ?** La taille n'est **pas** dimensionnée par le capital disponible — elle est dimensionnée par le **risque accepté**. Un short small-cap bouge vite : la position doit tenir un mouvement adverse de quelques cents par *share* sans casser la journée.

---

## Les trois quotas

| #   | Quota                       | Règle                                                                       |
|-----|-----------------------------|-----------------------------------------------------------------------------|
| 1   | **Backup**                  | 50 % du portefeuille — jamais touché. Marge contre les *blow-ups*.          |
| 2   | **Tradable**                | 50 % du portefeuille — la seule poche qui peut être exposée sur la journée. |
| 3   | **Perte max quotidienne**   | 5 % de la poche tradable. Atteinte → **on arrête la journée**.              |

---

## La formule

```
perte par trade  = (perte max jour) ÷ (nombre de trades prévus)
taille position  = (perte par trade) ÷ (mouvement adverse attendu par share)
```

Deux paramètres en entrée :

- **Nombre de trades prévus** — décidé en début de séance, pas révisé en cours de route.
- **Mouvement adverse attendu par share** — fonction de la volatilité du titre ; small-cap à $1–$10 = quelques cents par mouvement.

---

## Exemple chiffré

Portefeuille : **$20 000**

| Étape                              | Calcul              | Résultat            |
|------------------------------------|---------------------|---------------------|
| Backup (intouchable)               | 50 % × $20 000      | $10 000             |
| Poche tradable                     | 50 % × $20 000      | $10 000             |
| Perte max quotidienne              | 5 % × $10 000       | $500                |
| Perte par trade (2 trades prévus)  | $500 ÷ 2            | $250                |
| Mouvement adverse attendu          | small-cap volatile  | ~$0.10/sh           |
| **Taille position**                | $250 ÷ $0.10        | **2 500 *shares***  |

> Si le titre cote $5, la position vaut $12 500 — soit **plus que la poche tradable**. C'est OK pour un short (on emprunte les *shares*) mais ça rappelle que la taille en dollars n'est pas le bon repère : seul le risque l'est.

---

## Mémo de poche

```
PORTEFEUILLE     $X
  ├─ 50 % backup    → intouchable
  └─ 50 % tradable  → T

PERTE JOUR       5 % × T
PER TRADE        perte jour ÷ n trades
SHARES           per trade ÷ mouvement adverse par share
DAILY STOP       perte jour atteinte → on coupe et on s'arrête
```

**La taille suit le risque, pas le capital.**

---

## À creuser

- **Calibrage du mouvement adverse** selon la volatilité du titre — les ~10 ¢ tiennent pour une small-cap à $1–$10 ; sur un titre à $20 c'est différent.
- **Gestion des gains** — réinvestir dans la poche tradable, sécuriser dans le backup, ou prélever ?
- **Nombre max de trades par jour** pour rester dans le sizing sans diluer la qualité d'analyse.
- **Re-sizing intra-journée** si un trade est gagnant — peut-on augmenter le budget des suivants, ou règle stricte « 1 plan = 1 sizing » ?
