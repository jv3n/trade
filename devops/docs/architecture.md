# Architecture

## How a request reaches the app

```
browser ──► Cloudflare ──────────────────► GCP Cloud Run ───────────► Supabase Postgres
            DNS + Worker (custom domain)   one service per env        one project per env
            rewrites the host to *.run.app reads its secrets from
                                           Secret Manager
```

- **Cloudflare** owns the domain `tickerstory.org`. Each environment has a Worker attached as a
  *custom domain* (the DNS record is the Worker itself, type `Worker`) : it forwards every request to
  the Cloud Run URL with the right `Host`, and passes the public host in `X-Forwarded-Host`. Their
  code and config live in [`cloudflare/`](../cloudflare/README.md), deployed with wrangler (#494).
- **GCP** (project `trade-496613`, region `northamerica-northeast1`) runs the app : one Cloud Run
  service per environment, scale-to-zero, the image from Artifact Registry. Each service runs as its
  own runtime service account, which can read only its own secrets. GitHub Actions deploys through
  Workload Identity Federation — no service-account key exists anywhere.
- **Supabase** (region `ca-central-1`, free tier) holds the database : one project per environment,
  reached through the **session pooler** (the direct connection is IPv6-only, Cloud Run egress is
  IPv4). Flyway migrates the schema at boot. Production is dumped monthly to Cloudflare R2, 12 kept.
- **Google OAuth** — one client for both environments, with the redirect URI of each.
- **GlitchTip** (Sentry-compatible) — production and staging, one project for the backend and one
  for the frontend, split by environment (`prod` / `staging`). The frontend picks it from the host ;
  the backend reads `SENTRY_ENVIRONMENT` and sends one INFO event at every boot, so a mute DSN shows
  on the next deploy (#462) — never resolve nor ignore that « Backend started » issue, it is the
  proof the pipe works. Local sends nothing.
  Every image build uploads the frontend source maps under the release tag (#463), then drops them
  from the bundle. The deploy needs a GlitchTip auth token (scope `project:releases`) in the
  `GLITCHTIP_AUTH_TOKEN` secret and the organisation slug in the `GLITCHTIP_ORG` variable.

| | Production | Staging |
|---|---|---|
| Public URL | https://tickerstory.org/ | https://staging.tickerstory.org/ |
| Cloudflare Worker | `tickerstory-proxy` | `tickerstory-staging` |
| Cloud Run service | `portfolioai` (0 → 3 instances) | `portfolioai-staging` (0 → 1) |
| Runtime account | `portfolioai-runtime@` | `portfolioai-staging-runtime@` |
| Supabase project | the production one | `trade-staging` |
| Own secrets | `supabase-db-url`, `app-admin-emails` | `supabase-db-url-staging`, `app-admin-emails-staging` |
| Shared secrets | `google-oauth-client-id`, `google-oauth-client-secret`, `sentry-dsn-backend` | same |
| Error tracking | GlitchTip, `sentry-dsn-backend`, `environment: prod` | same, `environment: staging` |
| Data | real, backed up monthly | test data, no backup |

Consoles : [Cloudflare](https://dash.cloudflare.com/) ·
[Cloud Run](https://console.cloud.google.com/run?project=trade-496613) ·
[Secret Manager](https://console.cloud.google.com/security/secret-manager?project=trade-496613) ·
[OAuth client](https://console.cloud.google.com/apis/credentials?project=trade-496613) ·
[Supabase](https://supabase.com/dashboard/projects) ·
[deploy runs](https://github.com/jv3n/trade/actions/workflows/deploy.yml).

## Who owns what

| Owner | Holds | Changed by |
|---|---|---|
| **Terraform** — [`terraform/`](../terraform/README.md), `env/<env>/` | the deploy and runtime accounts, Workload Identity Federation, the secret containers and who reads them, Artifact Registry, the Cloud Run services and their public access | a PR with the `plan`, `apply` by hand after merge |
| **`deploy.yml`** | every Cloud Run revision : image, env vars, mounted secrets, scaling, memory, runtime account | a release ([`releasing.md`](releasing.md)) |
| **wrangler** — [`cloudflare/`](../cloudflare/README.md) | both Workers and their custom domains | `npm run deploy:<env>` there |
| **by hand** | secret values, the Supabase projects, the Terraform state bucket, the enabled GCP APIs, the GitHub environments, the OAuth client | their console, or `gcloud secrets versions add` |

Terraform ignores the services' `template`, so a release never shows up as a drift. To change the
infrastructure or add an environment, see [`terraform/README.md`](../terraform/README.md).
