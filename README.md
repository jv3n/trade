# PortfolioAI

Optimiseur de portefeuille boursier intelligent alimenté par l'IA.

L'application ingère des flux économiques (RSS, APIs financières), génère des recommandations d'investissement via Claude API, et mesure la qualité de ses recommandations dans le temps.

> **Disclaimer** : PortfolioAI est un outil d'aide à la décision. Il ne constitue pas un conseil en investissement agréé.

## Stack

| Couche | Techno |
|--------|--------|
| Frontend | Angular 21 + Angular Material |
| Backend | Kotlin + Spring Boot |
| IA | Claude API (Anthropic) |
| BDD | PostgreSQL |
| Infra locale | Tilt + Docker Compose |

## Démarrage rapide

**Prérequis** : Docker, Java 21, Node 24, Tilt

```bash
tilt up
```

## Documentation

[https://jv3n.github.io/trade/metier/vision/](https://jv3n.github.io/trade/metier/vision/)
