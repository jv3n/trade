# PortfolioAI

**Journal de trading** pour short small-caps (gap-up shorts, $1–$10). L'utilisateur logue chaque trade — exécution (ticker, play A/B, pattern GUS/FRD, taille, prix, P&L) + checklist pré-trade + post-mortem. La table est l'unité atomique ; l'export / import CSV est roundtrip-safe. Stats, charts et export Excel arrivent en Phase 2. Aucun LLM dans le chemin live.

> L'app a pivoté en juin 2026 depuis un outil d'analyse de marché par ticker à narratif IA. L'ancienne surface (dossiers ticker, narratifs LLM, radar, portefeuille) reste dans le code en sommeil — voir la [roadmap](https://jv3n.github.io/trade/projet/roadmap/).

> **Disclaimer** : PortfolioAI est un outil personnel de journalisation de trades. Il ne constitue pas un conseil en investissement agréé.

## Statut CI & qualité

<a href="https://github.com/jv3n/trade/actions/workflows/backend.yml" target="_blank" rel="noopener"><img src="https://github.com/jv3n/trade/actions/workflows/backend.yml/badge.svg" alt="Backend CI"></a>
<a href="https://github.com/jv3n/trade/actions/workflows/frontend.yml" target="_blank" rel="noopener"><img src="https://github.com/jv3n/trade/actions/workflows/frontend.yml/badge.svg" alt="Frontend CI"></a>
<a href="https://github.com/jv3n/trade/actions/workflows/codeql.yml" target="_blank" rel="noopener"><img src="https://github.com/jv3n/trade/actions/workflows/codeql.yml/badge.svg" alt="CodeQL"></a>
<a href="https://github.com/jv3n/trade/actions/workflows/docs.yml" target="_blank" rel="noopener"><img src="https://github.com/jv3n/trade/actions/workflows/docs.yml/badge.svg" alt="Deploy docs"></a>

<a href=".github/dependabot.yml" target="_blank" rel="noopener"><img src="https://img.shields.io/badge/Dependabot-enabled-025E8C?logo=dependabot&logoColor=white" alt="Dependabot"></a>
<a href="https://detekt.dev/" target="_blank" rel="noopener"><img src="https://img.shields.io/badge/Detekt-scanning-7F52FF?logo=kotlin&logoColor=white" alt="Detekt"></a>
<a href="https://github.com/jv3n/trade/security/code-scanning" target="_blank" rel="noopener"><img src="https://img.shields.io/badge/Code%20Scanning-CodeQL%20%2B%20Detekt-2EA44F?logo=github" alt="Code Scanning"></a>

## Documentation

Site complet : **<a href="https://jv3n.github.io/trade/CHANGELOG/" target="_blank" rel="noopener">portfolioAI</a>**

| Rubrique | Pour qui / quand |
|---|---|
| <a href="https://jv3n.github.io/trade/technique/developper/" target="_blank" rel="noopener">Onboarding développeur</a> | Nouvel arrivant — install, premier test, troubleshooting |
| <a href="https://jv3n.github.io/trade/technique/architecture/" target="_blank" rel="noopener">Architecture</a> | Comprendre les modules, le schéma BDD et les décisions techniques |
| <a href="https://jv3n.github.io/trade/technique/ddd/" target="_blank" rel="noopener">DDD — bounded contexts</a> | Cartographie des bounded contexts et de leurs frontières (vocabulaire, ports, anti-corruption layers) |
| <a href="https://jv3n.github.io/trade/technique/developpement/" target="_blank" rel="noopener">Guide de développement</a> | Référence quotidienne : commandes, structure, configuration locale |
| <a href="https://jv3n.github.io/trade/technique/providers/" target="_blank" rel="noopener">Providers externes</a> | Twelve Data, Finnhub, Anthropic, Ollama — clés, quotas, dashboards |
| <a href="https://jv3n.github.io/trade/technique/ops/" target="_blank" rel="noopener">Ops (CI / CD / tooling)</a> | Workflows GitHub Actions, caching, Detekt, Dependabot, Code Scanning |
| <a href="https://jv3n.github.io/trade/devops/commandes-pratiques/" target="_blank" rel="noopener">Commandes pratiques (devops)</a> | Cheatsheet psql / Tilt / Ollama / cleanup jobs LLM bloqués |
| <a href="https://jv3n.github.io/trade/devops/liens-utiles/" target="_blank" rel="noopener">Liens utiles (consoles & dashboards)</a> | Bookmarks GCP / Supabase / GitHub / Cloudflare R2 pour les sessions ops |
| <a href="https://jv3n.github.io/trade/devops/deploiement/" target="_blank" rel="noopener">Déploiement (analyse Phase 5)</a> | Choix Cloud Run + Supabase, plan phasé, pipeline WIF, plan de migration sortie |
| <a href="https://jv3n.github.io/trade/devops/release-process/" target="_blank" rel="noopener">Release process</a> | Rituel deploy : tag → Draft Release → Publish → workflow Cloud Run |
| <a href="https://jv3n.github.io/trade/devops/backup-process/" target="_blank" rel="noopener">Backup & restore process</a> | Backup weekly Postgres → Cloudflare R2 + setup + restore drill |
| <a href="https://jv3n.github.io/trade/devops/secret-rotation/" target="_blank" rel="noopener">Rotation des secrets prod</a> | Procédure step-by-step par secret (OAuth, Anthropic, R2, Sentry, Supabase) + smoke après deploy |
| <a href="https://jv3n.github.io/trade/devops/dns-analyse/" target="_blank" rel="noopener">Analyse DNS (nom de domaine)</a> | Choix `tickerstory.org` — comparaison registrars, tarif renouvellement, Cloudflare DNS |
| <a href="https://jv3n.github.io/trade/devops/decision-ollama-deploiement/" target="_blank" rel="noopener">Décision : déploiement Ollama</a> | ADR brouillon — Ollama natif Mac vs Compose vs statu quo |
| <a href="https://jv3n.github.io/trade/metier/vision/" target="_blank" rel="noopener">Vision</a> | Le pivot journal de trading — pourquoi le trade entry est l'unité atomique |
| <a href="https://jv3n.github.io/trade/metier/fonctionnalites/" target="_blank" rel="noopener">Fonctionnalités</a> | Le module journal live + les phases pré-pivot dormantes |
| <a href="https://jv3n.github.io/trade/projet/roadmap/" target="_blank" rel="noopener">Roadmap (pivot v1.0)</a> | Le périmètre in / out du pivot — ce qui est gardé, dormant, ou décommissionné |
| <a href="https://jv3n.github.io/trade/projet/testeur/" target="_blank" rel="noopener">Onboarding testeur</a> | Pour qui veut juste cliquer dans l'app — Docker Desktop + Java + Node + Tilt, tout en mock par défaut |
| <a href="https://jv3n.github.io/trade/projet/backlog/" target="_blank" rel="noopener">Backlog</a> | Travail ouvert : ⏳/🚧/🧊/❌ + dette technique (le shipped est dans le journal) |
| <a href="https://jv3n.github.io/trade/projet/journal-livraisons/" target="_blank" rel="noopener">Journal des livraisons</a> | Historique reverse-chronologique des livraisons (1.0 journal ; les phases 1-6 pré-pivot sont archivées) |
| <a href="https://jv3n.github.io/trade/projet/sources/" target="_blank" rel="noopener">Sources de données</a> | Twelve Data, Finnhub — endpoints, quotas, mocks |
| <a href="https://jv3n.github.io/trade/projet/commit-conventions/" target="_blank" rel="noopener">Conventions de commit</a> | Conventional Commits en anglais, exemples |
| <a href="https://jv3n.github.io/trade/CHANGELOG/" target="_blank" rel="noopener">Changelog doc</a> | Trace reverse-chronologique des modifications du doc set (post `/doc-maintainer`) |
