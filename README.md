# PortfolioAI

**Personal trading tracker** for small-cap shorts (gap-up shorts, $1–$10).

| Module | Role |
|---|---|
| Today | The trading day step by step — morning reconciliation, candidates, stats, trades |
| Candidates | The premarket capture of a ticker |
| Stats | The stats sheet, completed after the 4 pm close |
| Journal | Each trade : executions, adjustable P&L, post-mortem, chart screenshot |
| Account | Broker balance — movements and the retained P&L coming from the journal |
| Lexicon | Bilingual glossary of the trading vocabulary |

> **Disclaimer** : a personal trade-tracking tool. Not licensed investment advice.

## CI & quality

<a href="https://github.com/jv3n/trade/actions/workflows/backend.yml" target="_blank" rel="noopener"><img src="https://github.com/jv3n/trade/actions/workflows/backend.yml/badge.svg" alt="Backend CI"></a>
<a href="https://github.com/jv3n/trade/actions/workflows/frontend.yml" target="_blank" rel="noopener"><img src="https://github.com/jv3n/trade/actions/workflows/frontend.yml/badge.svg" alt="Frontend CI"></a>
<a href="https://github.com/jv3n/trade/actions/workflows/codeql.yml" target="_blank" rel="noopener"><img src="https://github.com/jv3n/trade/actions/workflows/codeql.yml/badge.svg" alt="CodeQL"></a>

## Running it locally

`tilt up` at the root (PostgreSQL + Spring Boot backend + Angular frontend). Tilt UI : http://localhost:10350/.
