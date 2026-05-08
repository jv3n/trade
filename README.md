# PortfolioAI

Outil d'intelligence de marché par ticker, alimenté par l'IA. Pour chaque action / ETF / crypto suivie, le backend récupère les données via Twelve Data, calcule les indicateurs techniques côté serveur (RSI, MA, momentum, drawdown…), et le LLM rédige un court narratif factuel — il décrit les chiffres, il ne décide pas.

> **Disclaimer** : PortfolioAI est un outil d'aide à la décision. Il ne constitue pas un conseil en investissement agréé.

## Statut CI & qualité

[![Backend CI](https://github.com/jv3n/trade/actions/workflows/backend.yml/badge.svg)](https://github.com/jv3n/trade/actions/workflows/backend.yml)
[![Frontend CI](https://github.com/jv3n/trade/actions/workflows/frontend.yml/badge.svg)](https://github.com/jv3n/trade/actions/workflows/frontend.yml)
[![CodeQL](https://github.com/jv3n/trade/actions/workflows/codeql.yml/badge.svg)](https://github.com/jv3n/trade/actions/workflows/codeql.yml)
[![Deploy docs](https://github.com/jv3n/trade/actions/workflows/docs.yml/badge.svg)](https://github.com/jv3n/trade/actions/workflows/docs.yml)

[![Dependabot](https://img.shields.io/badge/Dependabot-enabled-025E8C?logo=dependabot&logoColor=white)](.github/dependabot.yml)
[![Detekt](https://img.shields.io/badge/Detekt-scanning-7F52FF?logo=kotlin&logoColor=white)](https://detekt.dev/)
[![Code Scanning](https://img.shields.io/badge/Code%20Scanning-CodeQL%20%2B%20Detekt-2EA44F?logo=github)](https://github.com/jv3n/trade/security/code-scanning)

## Documentation

Site complet : **[jv3n.github.io/trade](https://jv3n.github.io/trade/)**

| Rubrique | Pour qui / quand |
|---|---|
| [Onboarding développeur](docs/technique/developper.md) | Nouvel arrivant — install, premier test, troubleshooting |
| [Architecture](docs/technique/architecture.md) | Comprendre les modules, le schéma BDD et les décisions techniques |
| [DDD — bounded contexts](docs/technique/ddd.md) | Cartographie des bounded contexts et de leurs frontières (vocabulaire, ports, anti-corruption layers) |
| [Guide de développement](docs/technique/developpement.md) | Référence quotidienne : commandes, structure, configuration locale |
| [Providers externes](docs/technique/providers.md) | Twelve Data, Finnhub, Anthropic, Ollama — clés, quotas, dashboards |
| [Ops (CI / CD / tooling)](docs/technique/ops.md) | Workflows GitHub Actions, caching, Detekt, Dependabot, Code Scanning |
| [Commandes pratiques (devops)](docs/devops/commandes-pratiques.md) | Cheatsheet psql / Tilt / Ollama / cleanup jobs LLM bloqués |
| [Décision : déploiement Ollama](docs/devops/decision-ollama-deploiement.md) | ADR brouillon — Ollama natif Mac vs Compose vs statu quo |
| [Vision](docs/metier/vision.md) | Pourquoi le projet existe, ce qu'on essaie de prouver |
| [Fonctionnalités](docs/metier/fonctionnalites.md) | Découpage par phase, ce qui est livré / gelé / à venir |
| [Backlog](docs/projet/backlog.md) | Travail ouvert : ⏳/🚧/🧊/❌ + dette technique (le shipped est dans le journal) |
| [Journal des livraisons](docs/projet/journal-livraisons.md) | Historique reverse-chronologique des features livrées par phase |
| [Conventions de commit](docs/projet/commit-conventions.md) | Conventional Commits en anglais, exemples |
| [Changelog doc](docs/CHANGELOG.md) | Trace reverse-chronologique des modifications du doc set (post `/doc-maintainer`) |
