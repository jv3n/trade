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

Site complet : **[portfolioAI](https://jv3n.github.io/trade/CHANGELOG/)**

| Rubrique | Pour qui / quand |
|---|---|
| [Onboarding développeur](https://jv3n.github.io/trade/technique/developper/) | Nouvel arrivant — install, premier test, troubleshooting |
| [Architecture](https://jv3n.github.io/trade/technique/architecture/) | Comprendre les modules, le schéma BDD et les décisions techniques |
| [DDD — bounded contexts](https://jv3n.github.io/trade/technique/ddd/) | Cartographie des bounded contexts et de leurs frontières (vocabulaire, ports, anti-corruption layers) |
| [Guide de développement](https://jv3n.github.io/trade/technique/developpement/) | Référence quotidienne : commandes, structure, configuration locale |
| [Providers externes](https://jv3n.github.io/trade/technique/providers/) | Twelve Data, Finnhub, Anthropic, Ollama — clés, quotas, dashboards |
| [Ops (CI / CD / tooling)](https://jv3n.github.io/trade/technique/ops/) | Workflows GitHub Actions, caching, Detekt, Dependabot, Code Scanning |
| [Commandes pratiques (devops)](https://jv3n.github.io/trade/devops/commandes-pratiques/) | Cheatsheet psql / Tilt / Ollama / cleanup jobs LLM bloqués |
| [Décision : déploiement Ollama](https://jv3n.github.io/trade/devops/decision-ollama-deploiement/) | ADR brouillon — Ollama natif Mac vs Compose vs statu quo |
| [Vision](https://jv3n.github.io/trade/metier/vision/) | Pourquoi le projet existe, ce qu'on essaie de prouver |
| [Fonctionnalités](https://jv3n.github.io/trade/metier/fonctionnalites/) | Découpage par phase, ce qui est livré / gelé / à venir |
| [Backlog](https://jv3n.github.io/trade/projet/backlog/) | Travail ouvert : ⏳/🚧/🧊/❌ + dette technique (le shipped est dans le journal) |
| [Journal des livraisons](https://jv3n.github.io/trade/projet/journal-livraisons/) | Historique reverse-chronologique des features livrées par phase |
| [Conventions de commit](https://jv3n.github.io/trade/projet/commit-conventions/) | Conventional Commits en anglais, exemples |
| [Changelog doc](https://jv3n.github.io/trade/CHANGELOG/) | Trace reverse-chronologique des modifications du doc set (post `/doc-maintainer`) |
