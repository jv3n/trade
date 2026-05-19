# Liens utiles — consoles & dashboards

Bookmarks pour l'admin courant. Tous les liens sont scopés sur les projets actuels (GCP `trade-496613` + Supabase `portfolioai-prod` + GitHub `jv3n/trade`). Garde cette page ouverte dans un onglet pendant les sessions ops.

## Google Cloud Platform — projet `trade-496613`

### Vue d'ensemble
- [Dashboard projet](https://console.cloud.google.com/home/dashboard?project=trade-496613) — overview compute / storage / billing
- [Activité récente](https://console.cloud.google.com/home/activity?project=trade-496613) — audit log des changements

### Cloud Run (compute)
- [Services Cloud Run](https://console.cloud.google.com/run?project=trade-496613) — liste + métriques + logs
- [Service `portfolioai`](https://console.cloud.google.com/run/detail/northamerica-northeast1/portfolioai/metrics?project=trade-496613) — _pas encore déployé, lien anticipé_
- [Logs Cloud Run](https://console.cloud.google.com/logs/query;query=resource.type%3D%22cloud_run_revision%22?project=trade-496613) — query Cloud Logging filtrée Cloud Run

### Artifact Registry (Docker images)
- [Repos Artifact Registry](https://console.cloud.google.com/artifacts?project=trade-496613)
- [Repo `backend` (northamerica-northeast1)](https://console.cloud.google.com/artifacts/docker/trade-496613/northamerica-northeast1/backend?project=trade-496613) — images poussées + tags
- Path complet des images : `northamerica-northeast1-docker.pkg.dev/trade-496613/backend/portfolioai:<tag>`

### Secret Manager (4 secrets runtime)
- [Tous les secrets](https://console.cloud.google.com/security/secret-manager?project=trade-496613)
- [`google-oauth-client-id`](https://console.cloud.google.com/security/secret-manager/secret/google-oauth-client-id/versions?project=trade-496613)
- [`google-oauth-client-secret`](https://console.cloud.google.com/security/secret-manager/secret/google-oauth-client-secret/versions?project=trade-496613)
- [`app-admin-emails`](https://console.cloud.google.com/security/secret-manager/secret/app-admin-emails/versions?project=trade-496613)
- [`supabase-db-url`](https://console.cloud.google.com/security/secret-manager/secret/supabase-db-url/versions?project=trade-496613)

### IAM & Service Accounts
- [Service accounts](https://console.cloud.google.com/iam-admin/serviceaccounts?project=trade-496613)
  - `github-deploy@trade-496613.iam.gserviceaccount.com` (deploy SA — `run.admin` + `artifactregistry.writer`)
  - `portfolioai-runtime@trade-496613.iam.gserviceaccount.com` (runtime SA — `secretmanager.secretAccessor` per-secret)
- [IAM policy projet](https://console.cloud.google.com/iam-admin/iam?project=trade-496613) — bindings au project level
- [Workload Identity Pools](https://console.cloud.google.com/iam-admin/workload-identity-pools?project=trade-496613) — pool `github` + provider `github` (federation GitHub OIDC ↔ GCP)

### OAuth 2.0 (Google Sign-In Phase 4)
- [APIs & Services → Credentials](https://console.cloud.google.com/apis/credentials?project=trade-496613) — OAuth 2.0 Client IDs
- [Consent Screen](https://console.cloud.google.com/apis/credentials/consent?project=trade-496613) — branding + scopes + test users
- ⚠️ **Au 1er deploy prod** : ajouter la redirect URI `https://<cloud-run-url>/login/oauth2/code/google` puis (plus tard) `https://<custom-domain>/login/oauth2/code/google`

### Billing
- [Billing account `0159AE-56FF40-037FC8`](https://console.cloud.google.com/billing/0159AE-56FF40-037FC8?project=trade-496613) — facturation, alertes budget
- [Cost breakdown du projet](https://console.cloud.google.com/billing/0159AE-56FF40-037FC8/reports;projects=trade-496613) — coût par service

### APIs
- [APIs activées](https://console.cloud.google.com/apis/dashboard?project=trade-496613) — vue d'ensemble des 6 APIs câblées (`run`, `artifactregistry`, `secretmanager`, `iam`, `iamcredentials`, `sts`)
- [Quotas](https://console.cloud.google.com/iam-admin/quotas?project=trade-496613) — surveille avant de hit un free tier limit

## Supabase — projet `portfolioai-prod` (`flbnnnakobutaxvshcez`)

- [Dashboard du projet](https://supabase.com/dashboard/project/flbnnnakobutaxvshcez)
- [Table Editor](https://supabase.com/dashboard/project/flbnnnakobutaxvshcez/editor) — UI tabulaire pour lire/modifier les rows
- [SQL Editor](https://supabase.com/dashboard/project/flbnnnakobutaxvshcez/sql/new) — pour les requêtes ad-hoc (debug, admin)
- [Database settings](https://supabase.com/dashboard/project/flbnnnakobutaxvshcez/settings/database) — connection strings (Direct / Session pooler / Transaction pooler) + reset password
- [Logs](https://supabase.com/dashboard/project/flbnnnakobutaxvshcez/logs/explorer) — Postgres slow query, errors
- [API settings](https://supabase.com/dashboard/project/flbnnnakobutaxvshcez/settings/api) — anon key, service_role key (non utilisé v1, on est en JDBC direct)
- [Authentification](https://supabase.com/dashboard/project/flbnnnakobutaxvshcez/auth/users) — _désactivé v1, on a notre propre auth Spring Security + Google OIDC_
- [Backups](https://supabase.com/dashboard/project/flbnnnakobutaxvshcez/database/backups) — snapshots Supabase quotidiens 7j (free tier). **Notre backup nocturne `pg_dump` → R2 est indépendant**, voir ticket Phase 5.

**Région** : `ca-central-1` (Toronto)
**Connection mode utilisée** : Session pooler `aws-1-ca-central-1.pooler.supabase.com:5432` (IPv4-compatible Cloud Run + supporte Flyway advisory locks)

## GitHub — repo `jv3n/trade`

- [Repo home](https://github.com/jv3n/trade)
- [Actions](https://github.com/jv3n/trade/actions) — runs de tous les workflows
  - [Workflow `Deploy to Cloud Run`](https://github.com/jv3n/trade/actions/workflows/deploy.yml) — déclenche sur `release: published`, trigger manuel impossible (volontaire)
  - [Workflow `Backup Supabase Postgres`](https://github.com/jv3n/trade/actions/workflows/backup-postgres.yml) — cron `0 4 * * *` UTC + `workflow_dispatch` manuel
  - [Workflow `WIF Smoke Test`](https://github.com/jv3n/trade/actions/workflows/smoke-wif.yml) — re-trigger pour valider le pipeline WIF après un changement IAM
- [Environments](https://github.com/jv3n/trade/settings/environments) — `production` avec required reviewer + branch policy `master`
- [Environment variables `production`](https://github.com/jv3n/trade/settings/environments) → click `production` (les 3 vars `GCP_*` sont là)
- [Code Security](https://github.com/jv3n/trade/settings/security_analysis) — Secret Scanning + Push Protection + Dependabot
- [Releases](https://github.com/jv3n/trade/releases) — _à utiliser pour le 1er deploy via `on: release: published`_
- [Issues](https://github.com/jv3n/trade/issues) — _peu utilisé, le backlog vit dans le repo (`docs/projet/backlog.md`)_

## Providers externes (clés API runtime-editable via UI)

- [Anthropic Console](https://console.anthropic.com/) — usage Claude API, billing, rotation clé
- [Twelve Data dashboard](https://twelvedata.com/account/api-keys) — clé + usage credits (free tier 800/jour)
- [Finnhub dashboard](https://finnhub.io/dashboard) — clé + rate limit
- _Toutes ces clés vivent en BDD (`app_config`) en runtime, settable via `/settings/configuration` UI quand l'app sera deployée_

## Cloudflare

> **Compte créé pour le bucket R2 backups Phase 5a.** Le DNS / cache devant Cloud Run reste à câbler (ticket Phase 5 🟡 « Cloudflare devant Cloud Run »).

### R2 — bucket `portfolioai-backups`
- [Cloudflare dashboard](https://dash.cloudflare.com/) — home, après login
- R2 buckets overview : `https://dash.cloudflare.com/<ACCOUNT_ID>/r2/default/buckets` — _remplacer `<ACCOUNT_ID>` par le tien (visible dans l'URL une fois loggué, ou dans `R2_ACCOUNT_ID` GitHub Secret)_
- Bucket `portfolioai-backups` : `https://dash.cloudflare.com/<ACCOUNT_ID>/r2/default/buckets/portfolioai-backups` — liste les `backup-*.sql.gz` triés par date, download/delete via UI
- [API Tokens R2](https://dash.cloudflare.com/?to=/:account/r2/api-tokens) — rotation token si compromis, audit des tokens actifs

### CLI alternative (`aws s3` pointé sur R2)
```bash
# Lister les backups en CLI
aws s3 ls s3://portfolioai-backups/ \
  --endpoint-url "https://<ACCOUNT_ID>.r2.cloudflarestorage.com" \
  --profile portfolioai-r2
```
Configurer une fois : `aws configure --profile portfolioai-r2` avec les mêmes 3 creds que les GitHub Secrets.

### DNS / proxy (à venir)
- À câbler quand on attaque le ticket « Cloudflare devant Cloud Run » : DNS pour custom domain + cache devant Cloud Run pour bypass egress quota 1 GB/mo

## Documentation officielle (références ops fréquentes)

- [Cloud Run pricing](https://cloud.google.com/run/pricing) — vérifier free tier limits
- [Cloud Run docs — Secrets](https://cloud.google.com/run/docs/configuring/services/secrets) — pattern `--update-secrets`
- [Workload Identity Federation — GitHub](https://github.com/google-github-actions/auth#setting-up-workload-identity-federation) — re-setup ou tightening de la WIF
- [`google-github-actions/auth` releases](https://github.com/google-github-actions/auth/releases) — surveiller la `@v3` qui basculera sur Node 24 (cf. dette technique 🟢 backlog)
- [Supabase free tier limits](https://supabase.com/pricing) — surveiller DB size + MAU
- [Fly.io pricing](https://fly.io/docs/about/pricing/) — _fallback documenté, pas activé v1_

## Référence projet

- [`deploiement.md`](./deploiement.md) — plan d'analyse + recommandation + plan phasé Phase 5
- [`release-process.md`](./release-process.md) — rituel deploy (tag → Draft Release → Publish → workflow)
- [`backup-process.md`](./backup-process.md) — backup nocturne pg_dump → R2 + restore drill
- [`commandes-pratiques.md`](./commandes-pratiques.md) — commandes Docker / Tilt / Postgres / Ollama au quotidien
- [`decision-ollama-deploiement.md`](./decision-ollama-deploiement.md) — pourquoi Ollama reste en CPU dégradé sur Mac
- [`docs/projet/backlog.md > Phase 5`](../projet/backlog.md) — tickets ⏳ restants
- [`docs/projet/journal-livraisons.md > Phase 5`](../projet/journal-livraisons.md) — livré + notes d'implémentation
