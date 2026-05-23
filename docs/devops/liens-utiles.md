# Liens utiles — consoles & dashboards

Bookmarks pour l'admin courant. Tous les liens sont scopés sur les projets actuels (GCP `trade-496613` + Supabase `portfolioai-prod` + GitHub `jv3n/trade`). Garde cette page ouverte dans un onglet pendant les sessions ops.

## Production

- **App prod** : [https://tickerstory.org](https://tickerstory.org) — domaine custom (Cloudflare Worker proxy → Cloud Run Montréal)
- **App prod (URL Cloud Run directe)** : [https://portfolioai-vybmfauwxq-nn.a.run.app](https://portfolioai-vybmfauwxq-nn.a.run.app) — fallback de debug, contourne Cloudflare

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

### Secret Manager (5 secrets runtime)
- [Tous les secrets](https://console.cloud.google.com/security/secret-manager?project=trade-496613)
- [`google-oauth-client-id`](https://console.cloud.google.com/security/secret-manager/secret/google-oauth-client-id/versions?project=trade-496613)
- [`google-oauth-client-secret`](https://console.cloud.google.com/security/secret-manager/secret/google-oauth-client-secret/versions?project=trade-496613)
- [`app-admin-emails`](https://console.cloud.google.com/security/secret-manager/secret/app-admin-emails/versions?project=trade-496613)
- [`supabase-db-url`](https://console.cloud.google.com/security/secret-manager/secret/supabase-db-url/versions?project=trade-496613)
- [`sentry-dsn-backend`](https://console.cloud.google.com/security/secret-manager/secret/sentry-dsn-backend/versions?project=trade-496613) — DSN GlitchTip backend (cf. section Observability ci-dessous). Le DSN frontend n'est PAS un secret (public par design), il est hardcodé dans `frontend/src/main.ts`.

### IAM & Service Accounts
- [Service accounts](https://console.cloud.google.com/iam-admin/serviceaccounts?project=trade-496613)
  - `github-deploy@trade-496613.iam.gserviceaccount.com` (deploy SA — `run.admin` + `artifactregistry.writer`)
  - `portfolioai-runtime@trade-496613.iam.gserviceaccount.com` (runtime SA — `secretmanager.secretAccessor` per-secret)
- [IAM policy projet](https://console.cloud.google.com/iam-admin/iam?project=trade-496613) — bindings au project level
- [Workload Identity Pools](https://console.cloud.google.com/iam-admin/workload-identity-pools?project=trade-496613) — pool `github` + provider `github` (federation GitHub OIDC ↔ GCP)

### OAuth 2.0 (Google Sign-In Phase 4)
- [APIs & Services → Credentials](https://console.cloud.google.com/apis/credentials?project=trade-496613) — OAuth 2.0 Client IDs
- [Consent Screen](https://console.cloud.google.com/apis/credentials/consent?project=trade-496613) — branding + scopes + test users
- ✅ **Redirect URIs configurées 2026-05-22** : `http://localhost:8081/login/oauth2/code/google` (dev local), `https://portfolioai-vybmfauwxq-nn.a.run.app/login/oauth2/code/google` (Cloud Run direct, fallback debug), `https://tickerstory.org/login/oauth2/code/google` (prod custom domain). Authorized JavaScript origin : `https://tickerstory.org`. **À noter** : Spring n'honore pas `X-Forwarded-Host` que le Worker envoie (Cloud Run le strip) — `spring.security.oauth2.client.registration.google.redirect-uri` est forcée à la valeur littérale `https://tickerstory.org/...` via env var `SPRING_SECURITY_OAUTH2_CLIENT_REGISTRATION_GOOGLE_REDIRECT_URI` posée dans `deploy.yml`, idem pour `app.frontend-url` via `APP_FRONTEND_URL=https://tickerstory.org/` (sinon le redirect post-login fallback sur `*.run.app`).

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
  - [Workflow `Backup Supabase Postgres`](https://github.com/jv3n/trade/actions/workflows/backup-postgres.yml) — cron `0 4 * * 0` (dimanche 4 AM UTC, weekly) + `workflow_dispatch` manuel
  - [Workflow `WIF Smoke Test`](https://github.com/jv3n/trade/actions/workflows/smoke-wif.yml) — re-trigger pour valider le pipeline WIF après un changement IAM
- [Environments](https://github.com/jv3n/trade/settings/environments) — `production` avec required reviewer + branch policy `master`
- [Environment variables `production`](https://github.com/jv3n/trade/settings/environments) → click `production` (les 3 vars `GCP_*` sont là)
- [Code Security](https://github.com/jv3n/trade/settings/security_analysis) — Secret Scanning + Push Protection + Dependabot
- [Releases](https://github.com/jv3n/trade/releases) — _à utiliser pour le 1er deploy via `on: release: published`_
- [Issues](https://github.com/jv3n/trade/issues) — _peu utilisé, le backlog vit dans le repo (`docs/projet/backlog.md`)_

## Observability — GlitchTip + UptimeRobot

> Wiring livré `v0.8.0-rc1` (2026-05-23). GlitchTip = serveur d'ingestion Sentry-API-compatible (on utilise les SDK officiels Sentry, le DSN dirige vers GlitchTip plutôt que vers Sentry SaaS). UptimeRobot = HTTP polling externe sur `/actuator/health`. Détail wiring + pivots dans [`journal-livraisons.md > Phase 5`](../projet/journal-livraisons.md#phase-5--déploiement-en-cours) et [`architecture.md > Décisions Phase 5`](../technique/architecture.md#phase-5--déploiement).

### GlitchTip (error tracking)
- [Organization `portfolioai`](https://app.glitchtip.com/portfolioai) — overview, billing, members
- [Projet `portfolioai-backend`](https://app.glitchtip.com/portfolioai/issues/?project=portfolioai-backend) — events Spring Boot, tag `release: v<X.Y.Z>` propagé via env var `SENTRY_RELEASE` au deploy
- [Projet `portfolioai-frontend`](https://app.glitchtip.com/portfolioai/issues/?project=portfolioai-frontend) — events browser Angular, pas de tag `release` v1
- **Alert rules** : email immédiat sur new issue + burst alert >10 events/h, configurées via UI **Settings → Alerts** sur chacun des 2 projets
- **Quota free tier** : 5K events/mo combiné (réinitialisé chaque mois calendaire) — surveiller le total côté Org settings

### UptimeRobot (uptime monitor)
- [Dashboard](https://uptimerobot.com/dashboard) — liste des monitors actifs
- **Monitor actif** : `PortfolioAI prod` sur `https://tickerstory.org/actuator/health`, interval 5 min, alert email
- Free tier 50 monitors — on en utilise 1

### Wiring & secrets
- DSN backend dans Secret Manager : [`sentry-dsn-backend`](https://console.cloud.google.com/security/secret-manager/secret/sentry-dsn-backend/versions?project=trade-496613). Mounté au runtime Cloud Run via `--update-secrets=SENTRY_DSN=sentry-dsn-backend:latest` dans `deploy.yml`. Rotation = nouvelle version du secret + redeploy (~3 min).
- DSN frontend hardcodé dans `frontend/src/main.ts` (public par design, commit safe — c'est le modèle Sentry/GlitchTip standard).
- Release tagging backend : `SENTRY_RELEASE=${{ github.event.release.tag_name }}` propagé via `--set-env-vars` dans `deploy.yml`, lu par `application-prod.yml` → `sentry.release` SDK config. Permet le filtrage "errors introduced in v0.8.0" dans le dashboard.

## Providers externes (clés API runtime-editable via UI)

- [Anthropic Console](https://console.anthropic.com/) — usage Claude API, billing, rotation clé
- [Twelve Data dashboard](https://twelvedata.com/account/api-keys) — clé + usage credits (free tier 800/jour)
- [Finnhub dashboard](https://finnhub.io/dashboard) — clé + rate limit
- _Toutes ces clés vivent en BDD (`app_config`) en runtime, settable via `/settings/configuration` UI quand l'app sera deployée_

## Cloudflare

> **Compte étendu au fil de Phase 5 :** R2 bucket backups (Phase 5a), registrar (`tickerstory.org` acheté 2026-05-22), **Worker `tickerstory-proxy`** déployé 2026-05-22 comme proxy custom-domain → Cloud Run (Cloud Run domain mappings indispo à Montréal + Origin Rules Host rewrite Enterprise-only → pivot Worker, cf. journal Phase 5).

### Registrar — domaines
- [Domaines enregistrés](https://dash.cloudflare.com/8f2780696b5e520f85b5fc80413c4c3f/domains/registrations) — liste des domaines achetés via Cloudflare Registrar (`tickerstory.org` depuis 2026-05-22, ~$7.50/an at-cost, auto-renew on)
- Choix du domaine documenté dans [`dns-analyse.md`](./dns-analyse.md) — historique des 2 pivots de reco (`.app` pris → `.us` écarté nexus → `.org` retenu)

### Workers — `tickerstory-proxy`
- [Worker overview](https://dash.cloudflare.com/8f2780696b5e520f85b5fc80413c4c3f/workers/services/view/tickerstory-proxy/production) — code + deployments + observability + custom domain bindings
- [Edit code](https://dash.cloudflare.com/8f2780696b5e520f85b5fc80413c4c3f/workers/services/view/tickerstory-proxy/production?showActionMenu=open-quick-edit) — éditeur inline + preview pane
- **Rôle** : intercepte toute requête `tickerstory.org/*`, forge un `fetch()` vers `portfolioai-vybmfauwxq-nn.a.run.app` avec Host header réécrit (sinon Cloud Run rejette avec 404)
- **Custom Domain** attaché : `tickerstory.org` (DNS auto-managed par Cloudflare quand on attache un domaine à un Worker — l'ancien CNAME manuel a été supprimé pour permettre l'attache)

### Cache Rules — `tickerstory.org`
- [Cache Rules dashboard](https://dash.cloudflare.com/8f2780696b5e520f85b5fc80413c4c3f/tickerstory.org/caching/cache-rules) — UI Caching → Cache Rules pour la zone
- **Rule 1 — `Bypass cache for API`** (ordre 1) : `URI Path starts with /api/` → **Bypass cache**. Préserve le streaming SSE narratif (zéro bufferisation Cloudflare), zéro stale sur les responses JSON live, zéro risque de cache leak cross-user.
- **Rule 2 — `Cache static assets aggressively`** (ordre 2) : `URI File Extension is in {js, css, woff, woff2, ttf, eot, svg, png, jpg, jpeg, gif, ico, webp}` → **Eligible for cache**, Edge TTL 1 year, Browser TTL 1 year. Wirefilter raw : `(http.request.uri.path.extension in {"js" "css" "woff" "woff2" "ttf" "eot" "svg" "png" "jpg" "jpeg" "gif" "ico" "webp"})`. Les assets Angular sont hash-named → cache éternel safe. Bypass partiel du quota egress Cloud Run free (1 GB/mo N. America).
- **Note** : `matches regex` est Enterprise-only sur Cloudflare ; `URI File Extension is in {…}` couvre 95 % des cas. Vérifier le header `cf-cache-status` (`BYPASS`/`DYNAMIC` sur `/api/`, `MISS` puis `HIT` sur les assets).

### R2 — bucket `portfolioai-backups`
- [Cloudflare dashboard](https://dash.cloudflare.com/) — home, après login
- R2 buckets overview : `https://dash.cloudflare.com/8f2780696b5e520f85b5fc80413c4c3f/r2/default/buckets` — _remplacer `8f2780696b5e520f85b5fc80413c4c3f` par le tien (visible dans l'URL une fois loggué, ou dans `R2_ACCOUNT_ID` GitHub Secret)_
- Bucket `portfolioai-backups` : `https://dash.cloudflare.com/8f2780696b5e520f85b5fc80413c4c3f/r2/default/buckets/portfolioai-backups` — liste les `backup-*.sql.gz` triés par date, download/delete via UI
- [API Tokens R2](https://dash.cloudflare.com/?to=/:account/r2/api-tokens) — rotation token si compromis, audit des tokens actifs

### CLI alternative (`aws s3` pointé sur R2)
```bash
# Lister les backups en CLI
aws s3 ls s3://portfolioai-backups/ \
  --endpoint-url "https://8f2780696b5e520f85b5fc80413c4c3f.r2.cloudflarestorage.com" \
  --profile portfolioai-r2
```
Configurer une fois : `aws configure --profile portfolioai-r2` avec les mêmes 3 creds que les GitHub Secrets.

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
