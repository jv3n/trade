# Staging — PortfolioAI

The « recette » : where a release candidate (`vX.Y.Z-rcN`) is tried on a real deployment before it
reaches production (#297). Same image and Spring profile as production ; its own Cloud Run service,
database, runtime account and admin list — nothing else is shared but the Google OAuth client and
the Sentry project.

| | Production | Staging |
|---|---|---|
| Cloud Run service | `portfolioai` | `portfolioai-staging` |
| URL | https://tickerstory.org/ | https://staging.tickerstory.org/ |
| Runtime account | `portfolioai-runtime@` | `portfolioai-staging-runtime@` |
| Database | its Supabase project | Supabase project `trade-staging`, demo data |
| Secrets | `supabase-db-url`, `app-admin-emails` | `supabase-db-url-staging`, `app-admin-emails-staging` |
| Shared secrets | `google-oauth-client-id`, `google-oauth-client-secret`, `sentry-dsn-backend` | same |
| Instances | 0 → 3 | 0 → 1 |
| Sentry environment | `prod` | `staging` |
| GitHub environment | `production`, required reviewer | `staging`, none |

## One-time setup

To do once, in this order, before the first `-rc` release. Project `trade-496613`, region
`northamerica-northeast1`.

### 1. Supabase — the staging database

1. Create a new project `trade-staging`, region `ca-central-1` (free tier).
2. *Project settings → Database → Connection string → JDBC*, **Session pooler**. Keep it for step 2,
   with the password inline and `sslmode=require` — the same shape as production's.

Flyway creates the schema at the first boot ; nothing to run by hand.

### 2. GCP — runtime account and secrets

```bash
gcloud config set project trade-496613

# Runtime account of the staging service
gcloud iam service-accounts create portfolioai-staging-runtime \
  --display-name="PortfolioAI staging runtime"

# Staging-only secrets
printf '%s' 'jdbc:postgresql://…pooler.supabase.com:5432/postgres?user=…&password=…&sslmode=require' \
  | gcloud secrets create supabase-db-url-staging --data-file=-
printf '%s' 'you@example.com' | gcloud secrets create app-admin-emails-staging --data-file=-

# Read access, secret by secret — the staging account never sees the production database
SA=portfolioai-staging-runtime@trade-496613.iam.gserviceaccount.com
for s in supabase-db-url-staging app-admin-emails-staging \
         google-oauth-client-id google-oauth-client-secret sentry-dsn-backend; do
  gcloud secrets add-iam-policy-binding "$s" \
    --member="serviceAccount:$SA" --role=roles/secretmanager.secretAccessor
done

# The deploy account may run the service as that account
gcloud iam service-accounts add-iam-policy-binding "$SA" \
  --member=serviceAccount:github-deploy@trade-496613.iam.gserviceaccount.com \
  --role=roles/iam.serviceAccountUser
```

### 3. GitHub — the `staging` environment

*Settings → Environments → New environment* `staging` :

- no required reviewer ;
- *Deployment branches and tags* → **Selected branches and tags**, add the tag rule `v*-rc*` ;
- the three variables of the `production` environment, same values : `GCP_PROJECT`,
  `GCP_WIF_PROVIDER`, `GCP_SA_EMAIL`.

### 4. First deploy

Publish a pre-release `vX.Y.Z-rc1` (see [`../README.md`](../README.md) > Releasing). The workflow
creates the `portfolioai-staging` service and prints its `*.run.app` URL in the run summary — keep
it for step 5.

### 5. Cloudflare — `staging.tickerstory.org`

Same set-up as production, pointed at the staging service :

- **DNS** — a proxied record `staging` on `tickerstory.org`.
- **Worker** — the route `staging.tickerstory.org/*`, proxying to the staging `*.run.app` URL the
  way production's route proxies to its own. The app doesn't read the forwarded host (Cloud Run
  strips it) : its public URL comes from `APP_FRONTEND_URL`, which the workflow sets.

### 6. Google OAuth — the redirect URI

*Google Cloud console → APIs & Services → Credentials*, the existing OAuth client :

- *Authorized JavaScript origins* : add `https://staging.tickerstory.org`
- *Authorized redirect URIs* : add `https://staging.tickerstory.org/login/oauth2/code/google`

### 7. Demo data (optional)

To start from the mockup data rather than an empty sheet, log in once on
https://staging.tickerstory.org/ (it creates your user), then :

```bash
psql "postgresql://…pooler.supabase.com:5432/postgres?sslmode=require" \
  -v ON_ERROR_STOP=1 -f devops/local/seed-demo.sql
```

The script refuses to run on a user that already has data.

## Checking a deploy

The run summary of `deploy.yml` names the environment it hit. The health check answers on
https://staging.tickerstory.org/actuator/health ; errors show up in Sentry under the `staging`
environment.
