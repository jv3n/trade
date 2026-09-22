# Environments and releases

Two deployed environments, one image, one workflow (`.github/workflows/deploy.yml`). The **release
tag** picks where a build goes :

| Tag | Published as | Goes to | URL | GitHub environment |
|---|---|---|---|---|
| `vX.Y.Z-rcN` | pre-release | **staging** — Cloud Run `portfolioai-staging` | https://staging.tickerstory.org/ | `staging` — no reviewer, tags `v*-rc*` only |
| `vX.Y.Z` | release | **production** — Cloud Run `portfolioai` | https://tickerstory.org/ | `production` — required reviewer, tags `v*.*.*` only |

Both run the Spring profile `prod`. What differs is passed by the workflow : the service, the public
URL, the runtime service account, the database and admin-list secrets (`*-staging` for staging) and
the Sentry environment (`staging` / `prod`). The Google OAuth client and the Sentry project are
shared.

- [`prod/README.md`](prod/README.md) — what is wired for production.
- [`staging/README.md`](staging/README.md) — what staging adds, and how to set it up.
- [`local/README.md`](local/README.md) — the local stack (Tilt).

## How a request reaches the app

```
browser ──► Cloudflare ──────────────────► GCP Cloud Run ───────────► Supabase Postgres
            DNS + Worker (custom domain)   one service per env        one project per env
            rewrites the host to *.run.app reads its secrets from
                                           Secret Manager
```

- **Cloudflare** owns the domain `tickerstory.org`. Each environment has a Worker attached as a
  *custom domain* (the DNS record is the Worker itself, type `Worker`) : it forwards every request to
  the Cloud Run URL with the right `Host`, and passes the public host in `X-Forwarded-Host`. The
  Workers' code lives in Cloudflare only (*Workers & Pages*), not in this repository.
- **GCP** (project `trade-496613`, region `northamerica-northeast1`) runs the app : one Cloud Run
  service per environment, scale-to-zero, the image from Artifact Registry. Each service runs as its
  own runtime service account, which can read only its own secrets. GitHub Actions deploys through
  Workload Identity Federation — no service-account key exists anywhere.
- **Supabase** (region `ca-central-1`, free tier) holds the database : one project per environment,
  reached through the **session pooler** (the direct connection is IPv6-only, Cloud Run egress is
  IPv4). Flyway migrates the schema at boot. Production is dumped weekly to Cloudflare R2.
- **Google OAuth** — one client for both environments, with the redirect URI of each.
- **Sentry** — one project, errors tagged `prod` or `staging`.

| | Production | Staging |
|---|---|---|
| Public URL | https://tickerstory.org/ | https://staging.tickerstory.org/ |
| Cloudflare Worker | `tickerstory-proxy` | `tickerstory-staging` |
| Cloud Run service | `portfolioai` (0 → 3 instances) | `portfolioai-staging` (0 → 1) |
| Runtime account | `portfolioai-runtime@` | `portfolioai-staging-runtime@` |
| Supabase project | the production one | `trade-staging` |
| Own secrets | `supabase-db-url`, `app-admin-emails` | `supabase-db-url-staging`, `app-admin-emails-staging` |
| Shared secrets | `google-oauth-client-id`, `google-oauth-client-secret`, `sentry-dsn-backend` | same |
| Data | real, backed up weekly | test data, no backup |

Consoles : [Cloudflare](https://dash.cloudflare.com/) ·
[Cloud Run](https://console.cloud.google.com/run?project=trade-496613) ·
[Secret Manager](https://console.cloud.google.com/security/secret-manager?project=trade-496613) ·
[OAuth client](https://console.cloud.google.com/apis/credentials?project=trade-496613) ·
[Supabase](https://supabase.com/dashboard/projects) ·
[deploy runs](https://github.com/jv3n/trade/actions/workflows/deploy.yml).

## Releasing

1. **Candidate** — on GitHub, *Releases → Draft a new release*, tag `vX.Y.Z-rc1` on `master`, tick
   **Set as a pre-release**, publish. The workflow deploys it to staging, with no approval.
2. **Try it** on https://staging.tickerstory.org/. A problem : fix it on `master`, publish
   `vX.Y.Z-rc2`, try again.
3. **Release** — once a candidate is good, publish `vX.Y.Z` (same commit, pre-release box
   unticked). The workflow waits for the `production` approval, then deploys.

The workflow refuses a tag and a pre-release box that disagree (an `-rc` published as a release, or a
final version published as a pre-release), so a candidate can't reach production by mistake.

The final release rebuilds the image from the same commit rather than re-tagging the candidate's :
the version baked into the image (`/actuator/info`, Sentry) is then the final one.

## Versioning

SemVer on the product : **major** for a change that breaks the data or the flow (v2.0.0 reset the
database), **minor** for a feature, **patch** for fixes only.
