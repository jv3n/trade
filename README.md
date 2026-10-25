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

## The scanner

[`ts-scanner`](https://github.com/jv3n/ts-scanner) reads the previous session's GUS and double tops
and pushes them here as stats **to review** (epic #760). It is not deployed : it runs from this Tilt,
on demand, from a checkout next to this one.

1. Clone `jv3n/ts-scanner` beside `trade` (or point `SCANNER_CHECKOUT` at it in `.env`) and fill its
   own `.env` — the Massive API key.
2. In `trade`'s `.env` : `SCANNER_API_TOKEN` (any long random string — the backend and the scanner
   share it) and `SCANNER_OWNER_USER_ID` (your `app_user.id`, `SELECT id FROM app_user`). Restart the
   `backend` resource : it reads them at boot.
3. Tilt → **`ts-scanner 📡`** → trigger : it scans the previous trading day into the local stack.
   The stats show up under « À relire » on the stats page, and Today's step 1 counts them.

The resource's buttons :

- **backfill (local)** — every trading day since a date ; one month back by default, for the first
  run. Re-running a day is harmless : the push skips what exists and remembers rejections.
- **scan → production** — the same, pushed to the production API, after a confirmation. It takes
  `SCANNER_PROD_URL` (the API's base URL) from `.env` and checks it answers before scanning ; the
  token is read from Secret Manager (`scanner-api-token`) through your `gcloud` session at the
  moment of the run, never kept on the machine. Production's backend reads the same secret as
  `SCANNER_API_TOKEN`, and needs `SCANNER_OWNER_USER_ID` too (see
  [`devops/docs/secrets.md`](devops/docs/secrets.md)) ; without them its door stays shut and the
  push gets a 401.

What ts-scanner is given : `TRADE_URL` and `TRADE_API_TOKEN` in its environment, and `--from
<YYYY-MM-DD>` for a backfill — nothing for the previous trading day.
