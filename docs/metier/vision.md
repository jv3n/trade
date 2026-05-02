# Vision

## Le problème

Suivre un portefeuille demande du temps : pour chaque titre détenu, lire la presse, regarder le graphe, comparer aux indicateurs techniques (RSI, moyennes mobiles), comprendre la dynamique récente. La plupart des investisseurs individuels n'ont pas ce temps — et finissent par décider sans contexte ou par réagir à des titres d'articles isolés.

## L'idée

PortfolioAI agrège pour chaque ticker (de ton portefeuille ou de ta watchlist) :

1. **Données de marché** issues de Yahoo Finance — prix, historique OHLC, volumes, fundamentals
2. **Indicateurs techniques calculés** côté serveur — RSI, MA50 / MA200, momentum, drawdown 52w, volume relatif
3. **Un narratif synthétique** produit par un LLM à partir des deux ci-dessus

Le résultat est un **dossier ticker** : la courbe, les indicateurs, et 2-3 paragraphes qui te racontent ce qui se passe. Tu lis, tu décides.

Exemple de sortie :

> *"AAPL est en uptrend depuis 3 mois (+18%), au-dessus de sa MA50 et de sa MA200. RSI à 68 — proche de la zone de surachat sans y être encore. Le volume des 10 dernières séances est ~30% au-dessus de la moyenne, ce qui confirme la force du mouvement. Vigilance court terme : un RSI > 70 et une distance à la MA50 > 8% historiquement coïncidaient avec des respirations de quelques semaines."*

## Le rôle de l'IA — explicite

> Le LLM est un **rédacteur**, pas un **décideur**.

Il **digère** des données déjà calculées (indicateurs, prix, fondamentaux) et les **synthétise** en langage naturel. Il **ne prédit pas** la direction du prix. Il **ne calcule pas** d'indicateurs (les vrais chiffres viennent du code, pas du modèle — sinon il hallucine).

Ce que le LLM apporte :

- une **lecture rapide** d'un état de marché ("uptrend / range / downtrend, avec/sans confirmation volume")
- un **contexte qualitatif** quand des fundamentals sont disponibles
- une **comparaison cross-tickers** ("AAPL et MSFT divergent sur le momentum 30j")

Ce qu'il n'apporte pas (et ne prétend pas apporter) :

- un signal d'achat/vente avec edge
- une prédiction de cours
- du conseil financier au sens réglementaire

## Observabilité honnête

Plutôt que de mesurer "est-ce que la reco IA a eu raison" (impossible à isoler du bruit du marché), on mesure **la qualité du narratif** :

- Chaque dossier consulté est snapshoté (prix + indicateurs + texte produit, à la date)
- A posteriori on peut regarder : *"ce que disait l'IA le 1er mars — vs ce qu'a fait le titre depuis"*
- Détection de biais récurrents (toujours bullish, toujours wait-and-see, etc.)

Ce feedback alimente l'itération sur le prompt — pas sur "fais-moi gagner de l'argent", mais sur "écris-moi un meilleur résumé".

```
Yahoo Finance API
        │
        ▼
  Indicateurs (Kotlin)
        │
        ▼
   LLM (Claude)
        │
        ▼
  Dossier ticker  ───────────────────────┐
        │                                │
   Snapshot persisté                     │
        │                                │
   Observabilité                         │
   (relecture a posteriori)              │
        │                                │
   Itération prompt  ◄───────────────────┘
        │
   Narratifs améliorés
```

## Disclaimer

PortfolioAI est un outil d'aide à la lecture des marchés. Il ne constitue pas un conseil en investissement agréé. Les narratifs sont générés par un modèle IA à partir de données publiques, et ne remplacent pas l'avis d'un professionnel financier. Les indicateurs techniques sont calculés à partir de données fournies par des tiers (Yahoo Finance) sans garantie de complétude ou d'exactitude.
