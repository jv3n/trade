# Release process — PortfolioAI

> **Modèle release-triggered, pas push-triggered** (décision 2026-05-18). Chaque deploy en prod est un acte conscient : on tague une release dans GitHub, on clique « Publish », le workflow [`deploy.yml`](../../.github/workflows/deploy.yml) prend le relais. Les pushes sur `master` continuent de faire tourner la CI (backend/frontend/CodeQL/docs) mais **ne touchent pas à Cloud Run**.

## Versioning

Règles strictes posées 2026-05-19. Le workflow [`deploy.yml`](../../.github/workflows/deploy.yml) fail-fast si un tag publié ne matche pas la regex `^v[0-9]+\.[0-9]+\.[0-9]+(-rc[0-9]+)?$`.

### Format des tags

| Format | Usage | Exemple |
|--------|-------|---------|
| `vMAJOR.MINOR.PATCH` | Release stable — clôture d'une phase, ou patch sur une phase déjà clôturée | `v0.7.0`, `v0.7.1` |
| `vMAJOR.MINOR.PATCH-rcN` | Release candidate — valider une PR à risque (migration de schéma, refacto OAuth, bump majeur lib) sur un deploy réel avant le tag final. Coché « Set as a pre-release » au Publish | `v0.7.0-rc1` |

**Pas d'autre format autorisé.** Un tag `git` qui n'a pas la forme ci-dessus n'a pas vocation à devenir une Release GitHub — il ne déclenchera pas de deploy et n'aura pas de blob image associé.

### Historique des phases

| Phase | Tag(s) |
|-------|--------|
| Phase 0 — Fondation | `v0.1.0` |
| Phase 1 — Pivot ticker | `v0.2.0` |
| Phase 2 — Profondeur ticker | `v0.3.0` |
| Phase 2.5 — Stabilisation et outils | `v0.4.0`, `v0.4.1` |
| Phase 3 — Observabilité narrative | `v0.5.0`, `v0.5.1` |
| Phase 4 — Authentification | `v0.6.0` |
| Phase 5a — Déploiement Cloud Run + Supabase | `v0.7.0` (à venir), précédé du smoke `v0.7.0-rc1` |

### Convention dev local Docker

**Ne jamais pousser de tag à préfixe SemVer dans Artifact Registry depuis un build local.** Cloud Run est exclusivement nourri par le workflow GitHub Actions release-triggered, jamais par un `docker push` manuel.

- Builds locaux pendant un bring-up restent dans le Docker daemon de l'user, jamais push AR.
- Si vraiment besoin d'une itération dev manuelle sur Cloud Run (debug d'un crash boot prod-only, par exemple), utiliser un préfixe **non-SemVer** : `dev-<short-sha>` ou `dev-YYYYMMDD-N` (e.g. `dev-20260519-1`). Garde le namespace `vX.Y.Z*` clean pour les releases.

> Contexte : le 1er bootstrap manuel Phase 5a a poussé `v0.7.0-dev1..dev4` dans AR avant que cette discipline ne soit posée. Ces blobs sont à cleanup une fois `v0.7.0` (stable) en service — l'historique narratif vit déjà dans [`journal-livraisons.md`](../projet/journal-livraisons.md#phase-5--déploiement-en-cours).

## Le rituel

1. **Clôturer une phase ou un milestone** sur `master` — tous les commits relevants sont mergés, la CI est verte, [`journal-livraisons.md`](../projet/journal-livraisons.md) est à jour, le `backlog.md` reflète les tickets ouverts/clôturés.
2. **Tag annoté** (format strict, cf. [Versioning](#versioning)) :
   ```bash
   git tag -a v0.7.0 -m "Phase 5a — production ready"
   git push --tags
   ```
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

## Failure modes connus

Patterns d'échec récurrents côté CI/CD avec remediation standard. À consulter en first response avant de plonger dans le debug profond.

### Transient — `auth failed: could not read Username for 'https://github.com'`

**Symptôme** : un workflow CI (`deploy.yml`, `docs.yml`, `backup-postgres.yml`, ou tout autre qui utilise `actions/checkout@v4`) fail au step `actions/checkout` ou au `git push` (`mkdocs gh-deploy`), avec un message du genre :

```
fatal: could not read Username for 'https://github.com': terminal prompts disabled
# ou
fatal: could not read Username for 'https://github.com': No such device or address
```

**Cause** : transient infrastructure GitHub Actions — le `GITHUB_TOKEN` n'est pas injecté à temps dans le runner avant que `actions/checkout` ne tente le fetch (ou avant que `mkdocs gh-deploy` ne pousse sur `gh-pages`). Le token finit par arriver mais trop tard pour cette step. **Pas un bug de config workflow** — le rendre explicit (`with: token: ${{ secrets.GITHUB_TOKEN }}`) ne fix pas, c'est identique au default behavior de `actions/checkout@v4`.

**Remediation** : **re-run la job failed** depuis l'UI Actions (`Re-run failed jobs`). C'est résolu à la 2e tentative dans 95% des cas. ~30 s.

**Si persiste sur plusieurs re-runs** :
- Check [https://www.githubstatus.com/](https://www.githubstatus.com/) — incident infrastructure ongoing ?
- Check `Settings → Actions → General → Workflow permissions` — doit être sur **« Read and write permissions »** (ou au minimum lecture)
- Workaround temporaire : ajouter explicitement `token: ${{ secrets.GITHUB_TOKEN }}` sur le step `actions/checkout@v4` du workflow concerné — pas une fix mais parfois débloque les race conditions

**Vécu 2026-05-23** : deux failures de ce type dans la même session (`deploy.yml` puis `docs.yml`), tous deux résolus par re-run. Pas modifié les workflows.

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
| **GCP** | 5 secrets Secret Manager | `google-oauth-client-id`, `google-oauth-client-secret`, `app-admin-emails`, `supabase-db-url`, `sentry-dsn-backend` |

Setup détaillé et historique dans [`prod/README.md`](../../devops/prod/README.md) et [`deploiement.md`](./deploiement.md).

## Liens

- Plan de déploiement complet : [`deploiement.md`](./deploiement.md)
- Check-list infra : [`prod/README.md`](../../devops/prod/README.md)
- Workflow source : [`.github/workflows/deploy.yml`](../../.github/workflows/deploy.yml)
- Smoke test WIF (auth standalone, déclenchable à la main) : [`.github/workflows/smoke-wif.yml`](../../.github/workflows/smoke-wif.yml)
