# Backup & restore process — PortfolioAI

> **Discipline d'exit propre** indépendante de Supabase. On garde notre propre archive `pg_dump` standard, restorable sur n'importe quel Postgres (Neon, Fly Postgres, VPS, RDS…) sans dépendre du format proprio des snapshots managés Supabase. **Cadence weekly** + **rétention 30 backups** (~7 mois d'historique). Supabase free tier fait déjà des snapshots quotidiens 7j en parallèle → notre backup R2 est le filet long-terme, pas le rolling court. Workflow source : [`.github/workflows/backup-postgres.yml`](../../.github/workflows/backup-postgres.yml).

## Quick links

| Quoi | Où |
|------|----|
| **Bucket R2 `portfolioai-backups`** (UI) | `https://dash.cloudflare.com/8f2780696b5e520f85b5fc80413c4c3f/r2/default/buckets/portfolioai-backups` |
| **R2 dashboard global** | [dash.cloudflare.com/.../r2/buckets](https://dash.cloudflare.com/?to=/:account/r2/overview) |
| **R2 API tokens** (rotation) | [dash.cloudflare.com/.../r2/api-tokens](https://dash.cloudflare.com/?to=/:account/r2/api-tokens) |
| **Workflow Actions** (history + manual trigger) | [github.com/jv3n/trade/actions/workflows/backup-postgres.yml](https://github.com/jv3n/trade/actions/workflows/backup-postgres.yml) |
| **Workflow source** | [`.github/workflows/backup-postgres.yml`](../../.github/workflows/backup-postgres.yml) |
| **Secret Manager `supabase-db-url`** (source de la DB URL) | [console.cloud.google.com/.../supabase-db-url](https://console.cloud.google.com/security/secret-manager/secret/supabase-db-url/versions?project=trade-496613) |
| **Snapshots Supabase natifs** (rétention 7j, format proprio) | [supabase.com/.../database/backups](https://supabase.com/dashboard/project/flbnnnakobutaxvshcez/database/backups) |
| **Trigger manuel via CLI** | `gh workflow run backup-postgres.yml` puis `gh run watch` |
| **Lister les backups en CLI** | `aws s3 ls s3://portfolioai-backups/ --endpoint-url https://8f2780696b5e520f85b5fc80413c4c3f.r2.cloudflarestorage.com` |

> `8f2780696b5e520f85b5fc80413c4c3f` = ton Cloudflare Account ID (visible dans l'URL du dashboard R2 ou dans le GitHub Secret `R2_ACCOUNT_ID`). À substituer manuellement la 1re fois, ou bookmark direct dans le navigateur après le 1er accès UI.

## Le rituel automatique

- **Cron** : `0 4 * * 0` (chaque dimanche 4 AM UTC, ≈ samedi soir minuit Eastern, creux d'activité)
- **Pipeline** : WIF auth → install `postgresql-client-16` → fetch `supabase-db-url` depuis Secret Manager → `pg_dump | gzip > backup-<ISO-timestamp-UTC>.sql.gz` → `aws s3 cp` vers R2 → prune les objets au-delà des 30 derniers
- **Échec** : workflow run failed → GitHub envoie une notif mail au committer du workflow. Re-déclenchable manuellement via `workflow_dispatch`.
- **Manual spot backup** : avant une opération risquée (migration schema, fix SQL manuel) ou un restore drill, déclencher à la main via UI Actions ou `gh workflow run backup-postgres.yml`. Recommandé aussi si tu sais que tu as fait du contenu critique pendant la semaine et que tu ne veux pas attendre dimanche.

## Setup pré-requis (one-shot)

À faire avant que le workflow tourne pour la 1re fois. Tous les inputs sont **stables** ensuite.

### 1. Cloudflare R2 (bucket + API token)

1. **Compte Cloudflare** : créer un compte gratuit sur `cloudflare.com` si pas déjà fait.
2. **Activer R2** : Dashboard Cloudflare → R2 → « Get Started ». Free tier auto-actif (10 GB storage + 10 M Class A operations + 1 M Class B / mois).
3. **Créer le bucket** :
   ```bash
   wrangler r2 bucket create portfolioai-backups
   # OU via UI : R2 → Create bucket → name = portfolioai-backups → Standard → Create
   ```
4. **Générer un API token Object Read & Write** :
   - R2 → Manage R2 API Tokens → Create API token
   - Permissions : **Object Read & Write** (pas Admin Read & Write — principe du moindre privilège)
   - Specify bucket : `portfolioai-backups` uniquement
   - TTL : laisser permanent (rotation manuelle si compromis)
   - Cliquer Create → **noter les 3 valeurs** (visibles une seule fois) :
     - `Access Key ID`
     - `Secret Access Key`
     - `Account ID` (visible dans l'URL du dashboard R2, format `<hash>.r2.cloudflarestorage.com`)

### 2. GitHub Secrets + Variables (5 valeurs)

**3 secrets R2** comme repository secrets (pas environment secrets — le workflow backup n'est pas gated par un environnement) :

```bash
gh secret set R2_ACCOUNT_ID --body "<account-id>"
gh secret set R2_ACCESS_KEY_ID --body "<access-key-id>"
gh secret set R2_SECRET_ACCESS_KEY --body "<secret-access-key>"
```

**3 variables GCP** comme repository variables (pas environment-scoped) :

```bash
gh variable set GCP_PROJECT --body "trade-496613"
gh variable set GCP_WIF_PROVIDER --body "projects/912181505110/locations/global/workloadIdentityPools/github/providers/github"
gh variable set GCP_SA_EMAIL --body "github-deploy@trade-496613.iam.gserviceaccount.com"
```

**Pourquoi repo-level pour les vars GCP plutôt que ré-utiliser le scope `production`** : le scope `production` a un `required reviewer` (légitime pour `deploy.yml` = acte conscient) ; un cron nightly de backup qui pause à 4h du matin en attendant qu'on clique « Approve » ne tient pas. Les 3 identifiers GCP sont publics (pas des secrets, juste des pointeurs), donc no-risk à les exposer au repo level. Les jobs qui déclarent `environment: production` (comme `deploy.yml`) continuent de lire en priorité la version env-scoped, les jobs sans environment (comme `backup-postgres.yml`) lisent la repo-level. Coexistence propre.

Vérifier : `gh secret list` et `gh variable list` doivent montrer respectivement les 3 secrets et les 3 vars.

### 3. Grant `secretmanager.secretAccessor` au SA de deploy

Le SA `github-deploy@` (utilisé par WIF) a `run.admin` + `artifactregistry.writer` mais **pas** d'accès aux secrets — seul `portfolioai-runtime@` les a. Octroyer un accès en lecture sur `supabase-db-url` au deploy SA :

```bash
gcloud secrets add-iam-policy-binding supabase-db-url \
  --member="serviceAccount:github-deploy@trade-496613.iam.gserviceaccount.com" \
  --role="roles/secretmanager.secretAccessor" \
  --project=trade-496613
```

Vérification :

```bash
gcloud secrets get-iam-policy supabase-db-url --project=trade-496613
# doit lister les 2 SAs : portfolioai-runtime + github-deploy
```

> Principe du moindre privilège respecté : le binding est **per-secret**, pas project-level. `github-deploy@` n'a accès qu'à `supabase-db-url`, pas aux 3 autres secrets (`google-oauth-client-id`, `google-oauth-client-secret`, `app-admin-emails`) qui restent réservés au runtime SA.

### 4. Smoke test

```bash
gh workflow run backup-postgres.yml
gh run watch
```

Attendu : run vert en ~1-2 min. Vérifier côté R2 :

```bash
aws s3 ls s3://portfolioai-backups/ \
  --endpoint-url "https://8f2780696b5e520f85b5fc80413c4c3f.r2.cloudflarestorage.com" \
  --profile portfolioai-r2
# doit lister 1 fichier backup-2026-MM-DDTHH-MM-SSZ.sql.gz
```

(Le profile `portfolioai-r2` peut être configuré localement via `aws configure --profile portfolioai-r2` avec les mêmes creds R2 — pratique pour les restore drills.)

## Restore drill (trimestriel)

Un backup non-testé est un backup qui n'existe pas. Tous les 3 mois, valider que la chaîne `pg_dump → R2 → pg_restore` tient end-to-end.

1. **Récupérer le dernier backup** depuis R2 :
   ```bash
   LATEST=$(aws s3 ls s3://portfolioai-backups/ --endpoint-url ... | sort | tail -1 | awk '{print $4}')
   aws s3 cp "s3://portfolioai-backups/$LATEST" "./$LATEST" --endpoint-url ...
   gunzip "$LATEST"
   ```
2. **Provisionner une instance Postgres vide** ailleurs :
   - Neon free tier : `neon.tech` → New project → région East US → noter `DATABASE_URL`
   - OU local : `docker run --rm -d -p 5433:5432 -e POSTGRES_PASSWORD=restore -e POSTGRES_DB=portfolioai_restore postgres:16`
3. **Restore** :
   ```bash
   psql "<RESTORE_DATABASE_URL>" < backup-2026-MM-DDTHH-MM-SSZ.sql
   ```
4. **Sanity check** : ouvrir un psql sur la cible et vérifier que les tables connues existent et contiennent des rows :
   ```sql
   \dt                            -- liste les tables
   SELECT count(*) FROM app_user; -- ≥ 1 (ton compte au moins)
   SELECT count(*) FROM ticker_narrative_snapshot;
   SELECT email, role FROM app_user;
   ```
5. **Teardown** : drop la base Neon (free tier) ou stop le container Docker — pas besoin de garder le clone.
6. **Noter** : date du drill + outcome dans une nouvelle entrée [`docs/projet/journal-livraisons.md`](../projet/journal-livraisons.md) — `Restore drill <date>` → ✅ ou ❌ avec diagnostic.

## Follow-ups (hors v1)

| Item | Pourquoi | Effort |
|------|----------|--------|
| **Alert si dernier dump > 36h** | Si le runner cron casse silencieusement (e.g. cron syntax invalidé après un edit), on ne le sait pas avant le prochain restore drill. Un 2e workflow scheduled checke `aws s3 ls --query 'reverse(sort_by(Contents,&LastModified))[0]'` et `gh issue create` si trop vieux. | ~30 min |
| **Encryption client-side** | R2 chiffre at-rest par défaut. Mais si on ouvre un jour le repo public, les R2 creds dans GitHub Secrets restent privés, donc rien ne change. Sauf si on veut zero-trust côté Cloudflare : on `gpg --encrypt` le dump avec une passphrase qui ne touche jamais le runner. Overkill v1. | ~1 h |
| **Cross-region replication** | R2 a built-in availability multi-PoP, donc le bucket survit à une panne régionale Cloudflare. Mais si Cloudflare entier disparaît : copier le dernier dump nightly vers un 2e provider (e.g. Backblaze B2). Overkill v1. | ~1 h |
| **Restore drill automatisé** | Au lieu d'un drill manuel trimestriel, un workflow scheduled mensuel qui spin up un Neon temporaire, restore le dernier dump, run quelques `SELECT count(*)` sanity, teardown. Plus rigoureux mais demande une API Neon stable + creds. | ~3-4 h |
| **Backup `app_config` runtime separately** | La table `app_config` (Phase 2.5) contient les clés API runtime-editable (Anthropic, Twelve Data, Finnhub). Elles sortent dans le `pg_dump` standard, donc OK pour le restore — mais ce sont des secrets qui se retrouvent dans le backup. À garder en tête le jour où on ouvre le restore process à un tiers (e.g. infra-as-code shared). | — |

## Pièges rencontrés au 1er setup (2026-05-18)

Notés pour épargner du debug à l'avenir si on rejoue le setup (nouveau projet, rotation full creds, etc.).

1. **Cloudflare R2 affiche 4 champs après la création du token, et 3 d'entre eux ne servent pas à l'auth S3** :
   - `Token value` (~40 chars) → API Cloudflare directe, **pas** S3 — ne PAS l'utiliser
   - `Access Key ID` (32 chars hex) → **c'est celui-là** pour `R2_ACCESS_KEY_ID`
   - `Secret Access Key` (64 chars hex) → **c'est celui-là** pour `R2_SECRET_ACCESS_KEY`
   - `Endpoint URL` → l'Account ID = le sous-domaine, déjà capturé dans `R2_ACCOUNT_ID`

   Le symptôme d'un mauvais paste : le step `Upload to Cloudflare R2` fail avec `InvalidArgument: Credential access key has length N, should be 32` côté `aws s3 cp`. Re-roll le token dans Cloudflare R2 si tu as paumé les valeurs, c'est gratuit.

2. **Les vars `${{ vars.GCP_* }}` sont vides au runtime si le job ne déclare pas `environment: production`** — elles vivent dans le scope `production` historiquement, pas au repo level. Le symptôme : `google-github-actions/auth failed with: the GitHub Action workflow must specify exactly one of "workload_identity_provider" or "credentials_json"`. Fix : `gh variable set GCP_PROJECT/GCP_WIF_PROVIDER/GCP_SA_EMAIL --body "..."` au repo level (voir section 2 du Setup). Pas de risque sécu, ce sont des identifiers publics.

## Liens

- Workflow source : [`.github/workflows/backup-postgres.yml`](../../.github/workflows/backup-postgres.yml)
- Release process (complément côté deploy) : [`release-process.md`](./release-process.md)
- Plan de déploiement complet : [`deploiement.md`](./deploiement.md)
- Plan de migration sortie : [`deploiement.md > §7`](./deploiement.md#7-plan-de-migration--sortir-de-cloud-run--supabase-si-besoin)
