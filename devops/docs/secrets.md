# Secrets

Every credential the project holds, and where. A new one gets its row here in the PR that
introduces it ; one no longer read is deleted at its source and here. A Secret Manager secret and
its readers are declared in Terraform ([`../terraform/`](../terraform/README.md), `../env/<env>/`) ; its value is added by hand.

| Name | Lives in | Read by | For | Secret ? |
|---|---|---|---|---|
| `supabase-db-url` | GCP Secret Manager | `portfolioai-runtime@`, `github-deploy@` | production JDBC URL, user inside, **no password** ; the monthly backup | no — host and user only |
| `supabase-db-password` | GCP Secret Manager | `portfolioai-runtime@`, `github-deploy@` | production database password ; the monthly backup | **yes** |
| `supabase-db-url-staging` | GCP Secret Manager | `portfolioai-staging-runtime@` | staging JDBC URL, no password | no — host and user only |
| `supabase-db-password-staging` | GCP Secret Manager | `portfolioai-staging-runtime@` | staging database password | **yes** |
| `google-oauth-client-secret` | GCP Secret Manager | both runtimes | Google login | **yes** |
| `google-oauth-client-id` | GCP Secret Manager | both runtimes | Google login | no — shown in the login URL |
| `app-admin-emails` / `-staging` | GCP Secret Manager | its runtime | ADMIN role at first login | no — personal data |
| `sentry-dsn-backend` | GCP Secret Manager | both runtimes | backend → GlitchTip | no — a DSN only ingests |
| `GLITCHTIP_AUTH_TOKEN` | GitHub, repo secret | `deploy.yml` (image build) | frontend source-map upload | **yes** |
| `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY` | GitHub, repo secret | `backup-postgres.yml` | write to the R2 backup bucket | **yes** |
| `R2_ACCOUNT_ID` | GitHub, repo secret | `backup-postgres.yml` | R2 endpoint | no |
| `GRADLE_ENCRYPTION_KEY` | GitHub — **not set** | `backend.yml` | encrypts the Gradle configuration cache | **yes** |
| wrangler session | your machine (`wrangler login`) | `devops/cloudflare` deploys | Cloudflare Workers | **yes** |
| `.env` | your machine | Tilt | local Google OAuth client, admin emails | **yes** |

No long-lived GCP key exists : GitHub reaches GCP through Workload Identity Federation, Cloud Run
reads Secret Manager as its runtime account. The GitHub *variables* (`GCP_*`, `GLITCHTIP_ORG`) hold
identifiers, not secrets.

**Rotating** — Secret Manager : `gcloud secrets versions add <name> --data-file=-`, then a deploy
(revisions read `:latest` at start). GitHub : `gh secret set <NAME> --repo jv3n/trade`, read at the
next run.
