# Staging — PortfolioAI

The « recette » : where a release candidate (`vX.Y.Z-rcN`) is tried on a real deployment before it
reaches production (#297). Same image and Spring profile as production ; its own Cloud Run service,
database, runtime account and admin list — nothing else is shared but the Google OAuth client and
the GlitchTip projects, where staging reports under its own environment (#462).

| | Production | Staging |
|---|---|---|
| Cloud Run service | `portfolioai` | `portfolioai-staging` |
| URL | https://tickerstory.org/ | https://staging.tickerstory.org/ |
| Runtime account | `portfolioai-runtime@` | `portfolioai-staging-runtime@` |
| Database | its Supabase project | Supabase project `trade-staging`, demo data |
| Secrets | `supabase-db-url`, `app-admin-emails` | `supabase-db-url-staging`, `app-admin-emails-staging` |
| Shared secrets | `google-oauth-client-id`, `google-oauth-client-secret`, `sentry-dsn-backend` | same |
| Instances | 0 → 3 | 0 → 1 |
| Error tracking | GlitchTip (`sentry-dsn-backend`) | same projects, same secret |
| Environment name (`SENTRY_ENVIRONMENT`) | `prod` | `staging` — splits GlitchTip's dashboard and feeds the settings page's chip |
| GitHub environment | `production`, required reviewer | `staging`, none |

## One-time setup

To do once, in this order, before the first `-rc` release. Project `trade-496613`, region
`northamerica-northeast1`.

### 1. Supabase — the staging database

1. Create a new project `trade-staging`, region `ca-central-1` (free tier).
2. *Project settings → Database → Connection string → JDBC*, **Session pooler**. Keep it for step 2
   **without the password** (`user=…&sslmode=require`), and the password apart — the same shape as
   production's (#659).

Flyway creates the schema at the first boot ; nothing to run by hand.

### 2. GCP — Terraform, then the secret values

The runtime account, the staging secrets, who reads them and the Cloud Run service are this
folder's Terraform root. On an empty project, follow steps 2 and 3 of *Adding an environment* in
[`../../terraform/`](../../terraform/README.md) — `plan` adds, `apply` creates :

- the runtime account `portfolioai-staging-runtime@`, which `github-deploy@` may act as ;
- the containers `supabase-db-url-staging`, `supabase-db-password-staging` and
  `app-admin-emails-staging`, read by the staging account alongside the shared ones — never the
  production database ;
- the service `portfolioai-staging`, public, on Google's `hello` image until the first deploy.

Then the values Terraform never holds :

```bash
printf '%s' 'jdbc:postgresql://…pooler.supabase.com:5432/postgres?user=…&sslmode=require' \
  | gcloud secrets versions add supabase-db-url-staging --data-file=-
printf '%s' '…' | gcloud secrets versions add supabase-db-password-staging --data-file=-
printf '%s' 'you@example.com' | gcloud secrets versions add app-admin-emails-staging --data-file=-
```

### 3. GitHub — the `staging` environment

*Settings → Environments → New environment* `staging` :

- no required reviewer ;
- *Deployment branches and tags* → **Selected branches and tags**, add the tag rule `v*-rc*` ;
- the three variables of the `production` environment, same values : `GCP_PROJECT`,
  `GCP_WIF_PROVIDER`, `GCP_SA_EMAIL`.

### 4. First deploy

Publish a pre-release `vX.Y.Z-rc1` (see [`../../docs/releasing.md`](../../docs/releasing.md)). The workflow
deploys the app on the `portfolioai-staging` service and prints its `*.run.app` URL in the run
summary — keep it for step 5.

### 5. Cloudflare — `staging.tickerstory.org`

Same set-up as production, pointed at the staging service :

- **Worker** — `tickerstory-staging`, attached to `staging.tickerstory.org` as a custom domain (the
  DNS record is the Worker itself). Set `ORIGIN_HOST` in
  [`../../cloudflare/wrangler.toml`](../../cloudflare/wrangler.toml) to the staging `*.run.app` URL, then
  `npm run deploy:staging` there. The app doesn't read the forwarded host (Cloud Run strips it) :
  its public URL comes from `APP_FRONTEND_URL`, which the workflow sets.

### 6. Google OAuth — the redirect URI

*Google Cloud console → APIs & Services → Credentials*, the existing OAuth client :

- *Authorized JavaScript origins* : add `https://staging.tickerstory.org`
- *Authorized redirect URIs* : add `https://staging.tickerstory.org/login/oauth2/code/google`

### 7. Demo data (optional)

To start from the mockup data rather than an empty sheet, log in once on
https://staging.tickerstory.org/ (it creates your user), then :

```bash
psql "postgresql://…pooler.supabase.com:5432/postgres?sslmode=require" \
  -v ON_ERROR_STOP=1 -f devops/env/local/seed-demo.sql
```

The script refuses to run on a user that already has data.

## Checking a deploy

The run summary of `deploy.yml` names the environment it hit. The health check answers on
https://staging.tickerstory.org/actuator/health. Staging reports no errors anywhere : read the Cloud
Run logs of `portfolioai-staging` and the browser console.
