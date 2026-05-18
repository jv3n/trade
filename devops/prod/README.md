# Production deployment manifests — PortfolioAI

Ce dossier contient les **manifests de production** pour le déploiement sur Google Cloud Run + Supabase Postgres. À l'amorce de la Phase 5, c'est un **skeleton** : `Dockerfile` fonctionnel + `service.yaml` shape posés, mais **aucun deploy n'a encore été fait**. La config Spring `application-prod.yml` vit avec ses cousins à `backend/src/main/resources/` (committée, sans secrets — convention Spring native, pas de gymnastics `--spring.config.additional-location`). Le ticket `Provisionner v1 Cloud Run + Supabase` (backlog Phase 5 🔴) attend.

## Plan d'analyse complet

→ [`../deploiement.md`](../deploiement.md) — 10 sections couvrant contexte, short-list, tableau comparatif, recommandation Cloud Run + Supabase, plan phasé 5a/5b/5c, pipeline GitOps Workload Identity Federation, plan de migration sortie, risques assumés, tickets dépendants, résumé décisions.

## État côté GCP (`trade-496613`) — déjà câblé

Livré dans le ticket `GitHub Secrets + Environments vault` (clôturé 2026-05-18, cf. `docs/projet/journal-livraisons.md > Phase 5`) :

- ✅ Billing account lié au projet
- ✅ 6 APIs activées : `run`, `artifactregistry`, `secretmanager`, `iam`, `iamcredentials`, `sts`
- ✅ 2 service accounts créés (pattern deploy-vs-runtime separation) :
  - `github-deploy@trade-496613.iam.gserviceaccount.com` (project: `run.admin` + `artifactregistry.writer` ; per-SA: `iam.serviceAccountUser` sur runtime)
  - `portfolioai-runtime@trade-496613.iam.gserviceaccount.com` (per-secret: `secretmanager.secretAccessor` sur les 4 secrets)
- ✅ Workload Identity Pool `github` + Provider `github` avec attribute condition `assertion.repository_owner == 'jv3n'` + binding `principalSet://.../attribute.repository/jv3n/trade`
- ✅ Repo Artifact Registry `northamerica-northeast1-docker.pkg.dev/trade-496613/backend`
- ✅ 4 secrets dans Secret Manager : `google-oauth-client-id`, `google-oauth-client-secret`, `app-admin-emails`, `supabase-db-url` (URL JDBC session pooler Supabase `ca-central-1` avec creds inline + `sslmode=require`)
- ✅ Smoke test WIF validé end-to-end via `.github/workflows/smoke-wif.yml` (run #1 vert)

## État côté GitHub (`jv3n/trade`) — déjà câblé

- ✅ Environment `production` créé avec required reviewer (`jv3n`) + deployment branch policy `master` only
- ✅ 3 Environment **variables** non-secrètes : `GCP_PROJECT`, `GCP_WIF_PROVIDER`, `GCP_SA_EMAIL`
- ✅ Aucun secret long-lived stocké (Workload Identity Federation rend les service account JSON keys obsolètes)
- ✅ Secret Scanning + Push Protection + Dependabot alerts activés

## État côté Supabase (`portfolioai-prod`) — projet créé, schema vide

- ✅ Projet créé en région Toronto `ca-central-1` (free tier)
- ✅ Database password généré + stocké dans GCP Secret Manager comme partie du `supabase-db-url`
- ⏳ Schema vide — sera créé au 1er boot Spring Boot via Flyway `V1__init.sql` (squash Phase 4)

## Reste à faire (ticket `Provisionner v1`)

| Étape | Effort | Détail |
|---|---|---|
| 1. Premier build local de l'image Docker | ~5-10 min | `docker build -f devops/prod/Dockerfile -t portfolioai-backend:dev .` depuis la racine. Tester que le multi-stage marche (frontend Angular embarqué dans `static/`, backend jar dans le runtime image). |
| 2. Premier push manuel vers Artifact Registry | ~5 min | `gcloud auth configure-docker northamerica-northeast1-docker.pkg.dev` (1 fois), puis `docker tag` + `docker push` du jar build avec une tag `dev-001`. |
| 3. Premier `gcloud run deploy` manuel | ~10 min | `gcloud run deploy portfolioai --image ... --service-account=portfolioai-runtime@... --update-secrets ANTHROPIC_API_KEY=... etc.` (la liste complète dans `deploiement.md > §6.2`). |
| 4. Smoke test end-to-end | ~10 min | Ouvrir l'URL `*.run.app` retournée par Cloud Run → enregistrer la redirect URI dans Google Cloud Console OAuth client → login Google → ouvrir un dossier ticker en mode `mock`. Confirmer que l'app boote, qu'elle se connecte à Supabase (Flyway a migré V1), que l'auth marche. |
| 5. Câbler le workflow GitHub Actions deploy | ~1 h | Créer `.github/workflows/deploy.yml` qui se déclenche `on: release: published` (cf. squelette dans `deploiement.md > §6.2`). Tester via une release candidate (ex: `v0.7.0-rc1`). |

## Files

| File | Status | Purpose |
|---|---|---|
| `Dockerfile` | ✅ Functional | Multi-stage build (Node 24 frontend → Eclipse Temurin 21 JDK backend → JRE 21 runtime, ~200 MB final image). Non-root user `spring`, JVM tuning `-XX:MaxRAMPercentage=75`. |
| `service.yaml` | ⏳ Stub | Cloud Run service descriptor — documente le shape complet (annotations scaling, healthchecks, env vars, secretKeyRef). À utiliser quand on passera à un deploy déclaratif `gcloud run services replace --file service.yaml`. Pour le 1er deploy on reste sur le pattern imperatif `gcloud run deploy` côté workflow. Tags `TODO_TAG` et `TODO_URL` à remplir. |
| `README.md` | This file | Check-list of state + remaining steps. |

> **Côté Spring config** : `application-prod.yml` ne vit pas ici — il vit à `backend/src/main/resources/application-prod.yml` (committé, sans secrets, chargé automatiquement par Spring quand `SPRING_PROFILES_ACTIVE=prod` est posé par Cloud Run via `service.yaml > env`). Convention Spring native respectée, pas de `--spring.config.additional-location` à câbler.
