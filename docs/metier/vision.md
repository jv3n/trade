# Vision

## Le problème

Suivre l'actualité économique pour gérer un portefeuille demande du temps : lire des dizaines d'articles chaque jour, croiser les données macro avec ses positions, décider quoi ajuster. La plupart des investisseurs individuels n'ont pas ce temps — et finissent par prendre des décisions sans contexte.

## L'idée

PortfolioAI fait ce travail à ta place. L'application ingère en continu des flux économiques (presse financière, données de marché, indicateurs macro), les analyse en regard de ton portefeuille, et produit des recommandations concrètes.

Exemple de sortie :

> *"Compte tenu de la hausse des tensions géopolitiques et des données d'inflation publiées cette semaine, il serait opportun de réduire ta position sur VOO (actuellement 15% du portefeuille → cible 10%, soit -5 000 €) et d'augmenter l'exposition à BND."*

## Ce qui rend le projet différent

La plupart des outils IA donnent des conseils sans jamais mesurer leur pertinence. PortfolioAI est conçu dès le départ pour **mesurer la qualité de ses propres recommandations** dans le temps.

Chaque recommandation est horodatée, conservée, et comparée à ce qui s'est réellement passé sur les marchés. Ce feedback alimente l'amélioration continue des analyses.

```
Sources & données marché
        │
        ▼
   Analyse IA
        │
        ▼
  Recommandation  ──────────────────────┐
        │                               │
  Résultat réel du marché               │
        │                               │
   Observabilité                        │
   (suggestion vs réalité)              │
        │                               │
  Correction des prompts  ◄─────────────┘
        │
  Recommandations améliorées
```

## Disclaimer

PortfolioAI est un outil d'aide à la décision. Il ne constitue pas un conseil en investissement agréé. Les recommandations sont générées par un modèle IA et ne remplacent pas l'avis d'un professionnel financier.
