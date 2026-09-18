# PortfolioAI

**Suivi de trading** pour short small-caps (gap-up shorts, $1–$10).

| Module | Rôle |
|---|---|
| Compte | Solde du compte courtier — mouvements + P&L réalisé du journal |
| Journal | Chaque trade : exécution, checklist pré-trade, post-mortem ; import / export CSV |
| Stats | Feuille de stats des setups gap-up |
| Candidats | Fiche candidat |
| Lexique | Glossaire bilingue du vocabulaire trading |

> **Disclaimer** : outil personnel de suivi de trades. Ne constitue pas un conseil en investissement agréé.

## Statut CI & qualité

<a href="https://github.com/jv3n/trade/actions/workflows/backend.yml" target="_blank" rel="noopener"><img src="https://github.com/jv3n/trade/actions/workflows/backend.yml/badge.svg" alt="Backend CI"></a>
<a href="https://github.com/jv3n/trade/actions/workflows/frontend.yml" target="_blank" rel="noopener"><img src="https://github.com/jv3n/trade/actions/workflows/frontend.yml/badge.svg" alt="Frontend CI"></a>
<a href="https://github.com/jv3n/trade/actions/workflows/codeql.yml" target="_blank" rel="noopener"><img src="https://github.com/jv3n/trade/actions/workflows/codeql.yml/badge.svg" alt="CodeQL"></a>

## Démarrage local

`tilt up` à la racine (PostgreSQL + backend Spring Boot + frontend Angular). UI Tilt : http://localhost:10350/.
