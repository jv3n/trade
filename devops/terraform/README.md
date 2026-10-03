# Terraform

The GCP infrastructure of both environments (#330). Three roots, one state each in the GCS bucket
`trade-496613-tfstate` :

| Root | Holds |
|---|---|
| `project/` | what both environments share : the deploy account, Workload Identity Federation, Artifact Registry, the shared secrets |
| `production/`, `staging/` | one environment each, through `modules/environment` : its runtime account, its own secrets, its Cloud Run service |

**Not here** : app versions (`deploy.yml` owns every Cloud Run revision — Terraform ignores the
service's `template`), the Cloudflare Workers (wrangler, [`../cloudflare/`](../cloudflare/README.md)),
Supabase, and every secret **value** (`gcloud secrets versions add`, never in the state).

## Set-up

Terraform `1.16.4` (`.terraform-version`, read by `tfenv`) :

```bash
gcloud auth application-default login     # once : the providers use these credentials
cd devops/terraform/<root>
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
terraform plan -out=change.tfplan          # in the PR description
terraform apply change.tfplan              # by hand, after the merge
```

**Never `apply` a plan that destroys or replaces anything in `production/` or `project/`.** An
existing resource is brought in with an `import` block, and its PR's plan reads `0 to add, 0 to
change, 0 to destroy`.

CI runs `terraform fmt -check` and `terraform validate` on every root — no credentials, no plan.

## Adding an environment

1. Copy `staging/` to `<env>/`, without its `imports.tf` (nothing exists yet to import). In
   `versions.tf`, set the backend `prefix` to `<env>` ; in `main.tf`, the module's `name`, `service`,
   `secret_suffix` and `runtime_display_name`.
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
