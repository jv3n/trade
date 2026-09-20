# Production deployment — PortfolioAI

Google Cloud Run + Supabase Postgres, deployed from `.github/workflows/deploy.yml` when a GitHub
Release is published. The Spring config lives with its siblings in
`projects/backend/src/main/resources/application-prod.yml` — committed, secret-free, loaded when
Cloud Run sets `SPRING_PROFILES_ACTIVE=prod`.

## Files

| File | Status | Purpose |
|---|---|---|
| `Dockerfile` | Functional | Multi-stage build (Node frontend → Temurin JDK backend → JRE runtime, ~200 MB final image). Non-root `spring` user, `-XX:MaxRAMPercentage=75`. |
| `service.yaml` | Stub | Cloud Run service descriptor, kept as documentation of the full shape. The deploy is imperative (`gcloud run deploy` in the workflow), so **the workflow is the source of truth**. |

## What is wired, GCP side (`trade-496613`)

- Billing account linked, and the `run`, `artifactregistry`, `secretmanager`, `iam`,
  `iamcredentials`, `sts` APIs enabled.
- Two service accounts, deploy and runtime kept separate :
  - `github-deploy@` — `run.admin` + `artifactregistry.writer` on the project,
    `iam.serviceAccountUser` on the runtime account ;
  - `portfolioai-runtime@` — `secretmanager.secretAccessor`, per secret.
- Workload Identity Federation : pool + provider `github`, with an attribute condition on the
  repository owner. No long-lived service-account key exists anywhere.
- Artifact Registry repository `northamerica-northeast1-docker.pkg.dev/trade-496613/backend`.
- Secret Manager holds `google-oauth-client-id`, `google-oauth-client-secret`, `app-admin-emails`,
  `supabase-db-url` (JDBC URL of the Supabase session pooler, credentials inline, `sslmode=require`)
  and `sentry-dsn-backend`.

## What is wired, GitHub side (`jv3n/trade`)

- A `production` environment with a required reviewer and a `master`-only branch policy.
- Three non-secret environment variables : `GCP_PROJECT`, `GCP_WIF_PROVIDER`, `GCP_SA_EMAIL`.
- Secret scanning, push protection and Dependabot alerts on.

## Database

Supabase, region `ca-central-1` (free tier). The schema is owned by Flyway : the backend migrates it
at boot. `.github/workflows/backup-postgres.yml` dumps it weekly to Cloudflare R2 and keeps the last
thirty — an archive independent of Supabase's own snapshot format.
