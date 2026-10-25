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
- **scan → staging** — the same, pushed to the staging API (`SCANNER_STAGING_URL`) : to try a scan
  on a deployed `trade` first.
- **scan → production** — the same, pushed to the production API (`SCANNER_PROD_URL`), after a
  confirmation : the stats land in the real sheet.

The scanner always **runs here** ; only where its stats land changes. A deployed target is checked
to answer before the scan, and its token is read from Secret Manager through your `gcloud` session
at the moment of the run — never kept on the machine.

### Opening a deployed environment to the scanner

Once per environment (#777) — `-staging` suffix and the `staging` GitHub environment for staging,
none and `production` for production. In this order : a deploy mounts the secret, so it fails while
the secret has no value.

1. **Terraform** — `terraform apply` in `devops/env/<env>/` creates `scanner-api-token[-staging]`,
   read by the environment's runtime account.
2. **Its value** — any long random string, kept nowhere else :

   ```bash
   openssl rand -hex 32 | tr -d '\n' | gcloud secrets versions add scanner-api-token-staging --data-file=-
   ```

   (`scanner-api-token`, without the suffix, for production.)

3. **The owner** — sign in to that `trade` once, read your `app_user.id` in its Supabase project
   (*SQL editor* : `SELECT id FROM app_user`), and set it as the `SCANNER_OWNER_USER_ID` variable of
   the GitHub environment.
4. **A deploy** — the next release (`-rc` for staging) mounts the token and the owner.
5. **Tilt** — `SCANNER_STAGING_URL=https://staging.tickerstory.org` (or
   `SCANNER_PROD_URL=https://tickerstory.org`) in `.env`, then the button.

What ts-scanner is given : `TRADE_URL` and `TRADE_API_TOKEN` in its environment, and `--from
<YYYY-MM-DD>` for a backfill — nothing for the previous trading day.
