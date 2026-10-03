# Terraform

The GCP infrastructure of both environments (#330). Three roots, one state each in the GCS bucket
`trade-496613-tfstate` :

| Root | Holds |
|---|---|
| `terraform/project/` | what both environments share : the deploy and plan accounts, Workload Identity Federation, Artifact Registry, the shared secrets |
| [`env/production/`](../env/production/README.md), [`env/staging/`](../env/staging/README.md) | one environment each, through `terraform/modules/environment` : its runtime account, its own secrets, its Cloud Run service |

This folder holds what is common ; each environment's root lives with its README.

**Not here** : app versions (`deploy.yml` owns every Cloud Run revision — Terraform ignores the
service's `template`), the Cloudflare Workers (wrangler, [`../cloudflare/`](../cloudflare/README.md)),
Supabase, and every secret **value** (`gcloud secrets versions add`, never in the state).

## Set-up

Terraform `1.16.4` (`devops/.terraform-version`, read by `tfenv` and by CI ; a bump also changes the
three `required_version`) :

```bash
gcloud auth application-default login     # once : the providers use these credentials
cd devops/terraform/project               # or devops/env/<env>
terraform init
```

The state bucket is the one resource created by hand — it holds the state, so Terraform can't
create it first :

```bash
gcloud storage buckets create gs://trade-496613-tfstate --project=trade-496613 \
  --location=northamerica-northeast1 --uniform-bucket-level-access --public-access-prevention
gcloud storage buckets update gs://trade-496613-tfstate --versioning
```

## Changing the infrastructure

```bash
terraform plan -out=change.tfplan          # CI posts the same plan on the PR
terraform apply change.tfplan              # by hand, after the merge
```

**Never `apply` a plan that destroys or replaces anything in `env/production/` or `project/`.** An
existing resource is brought in with an `import` block, and its PR's plan reads `0 to add, 0 to
change, 0 to destroy` ; the block is deleted once applied — it would fail on an empty project.

CI runs `terraform fmt -check`, `tflint` (`devops/.tflint.hcl` : every Terraform rule, the Google
ruleset) and `terraform validate` on every root, without credentials. Locally, from `devops/` :

```bash
tflint --init --config="$PWD/.tflint.hcl" && tflint --recursive --config="$PWD/.tflint.hcl"
```

`tflint` (`tflint_version` in `terraform.yml`) and the Google ruleset (`version` in `.tflint.hcl`)
are pinned and nothing bumps them — Dependabot only moves `setup-tflint`. A stale pin fails
silently (CI stays green, no new rules), so bump both by hand once a year. Keep them pinned : with
`preset = "all"`, a floating ruleset would one day fail CI on code nobody touched.

## Plan in CI, drift every week

Both run `devops/tools/terraform/plan-all.sh` on the three roots as **`terraform-plan`**, a
read-only account of the `project` root — one viewer role per kind of resource the roots hold,
`roles/iam.securityReviewer` for their IAM policies, object read on the state bucket only —
reached through Workload Identity Federation. `-lock=false` : it never writes the
state either.

- **On a PR touching Terraform** (`terraform.yml > Plan every root`) — the three plans land in one
  PR comment, rewritten on every push. A destroy or replace on `project` or `production` is called
  out. Changes don't fail the job ; a plan that can't run does.
- **Every Monday** (`terraform-drift.yml`, also by hand from the Actions tab) — fails when a root is
  not « No changes ». A change made in the console, or by `deploy.yml` on a field Terraform manages,
  shows up here : revert it, or bring it into the code. The plans are in the run's summary.

Set up once — both jobs skip while `GCP_TF_PLAN_SA` is unset :

```bash
cd devops/terraform/project && terraform apply      # creates terraform-plan and its grants
gh variable set GCP_TF_PLAN_SA --repo jv3n/trade \
  --body terraform-plan@trade-496613.iam.gserviceaccount.com
```

It holds read roles only — this lists the six of `main.tf` (`run.viewer`, `iam.serviceAccountViewer`,
`iam.workloadIdentityPoolViewer`, `secretmanager.viewer`, `artifactregistry.reader`,
`iam.securityReviewer`), nothing else :

```bash
gcloud projects get-iam-policy trade-496613 --flatten=bindings \
  --filter=bindings.members:terraform-plan@ --format='value(bindings.role)'
```

## Adding an environment

1. Copy the `*.tf` of `env/staging/` to `env/<env>/` and give it a README. In `versions.tf`, set
   the backend `prefix` to `<env>` ; in `main.tf`, the module's `service`, `secret_suffix` and
   `runtime_display_name`.
2. `terraform init`, then `terraform plan -out=create.tfplan` : it only adds — the runtime account,
   its two secrets, their read access and the shared ones', the Cloud Run service and its public
   access. The PR carries that plan ; `apply` it after the merge.
3. Add the secret values — Terraform created empty containers :

   ```bash
   printf '%s' '<value>' | gcloud secrets versions add <name><suffix> --data-file=-
   ```

The service starts on Google's `hello` image ; the first deploy of `deploy.yml` replaces it. A new
environment also needs its route in `deploy.yml` (tag → service, secret suffix) and its GitHub
environment.
