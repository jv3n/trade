# Release process — PortfolioAI

> **Modèle release-triggered, pas push-triggered** (décision 2026-05-18). Chaque deploy en prod est un acte conscient : on tague une release dans GitHub, on clique « Publish », le workflow [`deploy.yml`](../../.github/workflows/deploy.yml) prend le relais. Les pushes sur `master` continuent de faire tourner la CI (backend/frontend/CodeQL/docs) mais **ne touchent pas à Cloud Run**.

## Le rituel

1. **Clôturer une phase ou un milestone** sur `master` — tous les commits relevants sont mergés, la CI est verte, [`journal-livraisons.md`](../projet/journal-livraisons.md) est à jour, le `backlog.md` reflète les tickets ouverts/clôturés.
2. **Tag annoté** :
   ```bash
   git tag -a v0.7.0 -m "Phase 5a — production ready"
   git push --tags
   ```
   Convention SemVer :
   - `v0.7.0` — clôture Phase 5a (deploy + workflow Releases stables)
   - `v0.7.1` — patch sur la prod actuelle
   - `v0.8.0` — clôture Phase 5b (Cloudflare + custom domain)
   - `v0.7.0-rc1` — release candidate pour valider une PR à risque sur un deploy réel avant le tag final
3. **Draft a new release** dans l'UI GitHub :
   - Bouton « Releases » dans la sidebar du repo → « Draft a new release »
   - Sélectionner le tag créé à l'étape 2
   - Cliquer « Generate release notes » (auto-agrège les PRs depuis la release précédente)
   - Cliquer « Publish release » — ou cocher « Set as a pre-release » + Publish pour un `-rcN`
4. **Le workflow [`deploy.yml`](../../.github/workflows/deploy.yml) se déclenche** automatiquement sur l'événement `release: published`. Il enchaîne :
   - Authentification GCP via Workload Identity Federation (pas de SA key)
   - Build Docker `linux/amd64` natif sur runner ubuntu-latest (pas de QEMU émulation, gain ~5-10× vs build Mac M1)
   - Push vers Artifact Registry avec le tag de la release
   - `gcloud run deploy` avec les flags validés (4 secrets mountés depuis Secret Manager, profil `prod`)
   - Smoke `/actuator/health` post-deploy + résumé dans le summary du run Actions
5. **Approuver le deploy** : l'Environment `production` a un required reviewer (l'user solo s'auto-approve) — le run se met en `Waiting for review` jusqu'au click « Approve and deploy ». Audit trail naturel : qui a approuvé quel deploy quand, sans extra tooling.
6. **Smoke browser** : ouvrir l'URL Cloud Run (visible dans le summary du workflow), confirmer login Google + ouverture d'un dossier ticker en mode `mock` pour valider que la révision tient.

## Cas particuliers

- **Hotfix en prod** — tag `vX.Y.(Z+1)` directement sur `master`, draft + publish release, deploy auto. Pas besoin de PR si le commit fix est déjà sur `master`.
- **Rollback** — deux paths :
  - **Rapide (1 click)** : Cloud Run garde N révisions précédentes accessibles. Console GCP Cloud Run → service `portfolioai` → onglet `Revisions` → reroute le trafic vers la révision N-1.
  - **Propre (rebuild)** : créer une nouvelle Release pointant sur l'ancien tag (`gh release create v0.7.0 --target <ancien-commit>` ou via UI). Le workflow rebuild + redeploy le même code. Plus lent mais l'image courante reste tracable côté Artifact Registry.
- **Release supprimée** — si on `gh release delete`, le tag git reste mais le workflow ne re-déclenche pas. Pour redéployer un tag existant, re-créer la Release dans l'UI (le workflow distingue les events, pas les tags).
- **Failed deploy** — Cloud Run rejette une révision dont la `startupProbe` `/actuator/health` échoue (container crashe au boot, Spring config invalide, secret manquant…). Le step `gcloud run deploy` du workflow remonte l'échec → le run Actions fail. **Pas de routage trafic vers une révision cassée** : la précédente reste en service. Bug-bash via `gcloud run revisions logs read` ou Cloud Logging.

## Pre-releases et release candidates

Les tags `vX.Y.Z-rcN` (e.g. `v0.7.0-rc1`) sont des pre-releases. Côté GitHub, cocher « Set as a pre-release » au moment du Publish ; côté workflow, **rien à câbler** — `release: published` fire pour les deux types. Use case : valider une PR à risque (schema migration, refacto OAuth, bump majeur lib) sur un déploiement réel avant le tag final.

## Inputs déjà câblés

| Côté | Quoi | Détail |
|------|------|--------|
| **GitHub** | Environment `production` | required reviewer (`jv3n` self-approve) + deployment branch policy `master` only |
| **GitHub** | 3 Environment variables | `GCP_PROJECT`, `GCP_WIF_PROVIDER`, `GCP_SA_EMAIL` (non-secrets — identifiants publics) |
| **GCP** | Workload Identity Pool `github` | attribute condition `assertion.repository_owner == 'jv3n'` + binding sur `principalSet://.../attribute.repository/jv3n/trade` |
| **GCP** | Service account `github-deploy@` | `roles/run.admin` + `roles/artifactregistry.writer` au projet + `iam.serviceAccountUser` sur le runtime SA |
| **GCP** | Service account `portfolioai-runtime@` | `roles/secretmanager.secretAccessor` per-secret (4 secrets) |
| **GCP** | Artifact Registry `backend` | région `northamerica-northeast1`, image `portfolioai:<tag>` |
| **GCP** | 4 secrets Secret Manager | `google-oauth-client-id`, `google-oauth-client-secret`, `app-admin-emails`, `supabase-db-url` |

Setup détaillé et historique dans [`prod/README.md`](./prod/README.md) et [`deploiement.md`](./deploiement.md).

## Liens

- Plan de déploiement complet : [`deploiement.md`](./deploiement.md)
- Check-list infra : [`prod/README.md`](./prod/README.md)
- Workflow source : [`.github/workflows/deploy.yml`](../../.github/workflows/deploy.yml)
- Smoke test WIF (auth standalone, déclenchable à la main) : [`.github/workflows/smoke-wif.yml`](../../.github/workflows/smoke-wif.yml)
