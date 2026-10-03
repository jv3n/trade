# DevOps

Two deployed environments, **staging** and **production**, plus the local stack. One image, one
deploy workflow (`.github/workflows/deploy.yml`), the GCP side described in Terraform.

| Folder | Holds |
|---|---|
| [`env/local/`](env/local/README.md) | the local stack (Tilt) : demo data, Postgres and JDK upgrades |
| [`env/staging/`](env/staging/README.md) | staging : what it adds over production, its set-up, its Terraform root |
| [`env/production/`](env/production/README.md) | production : what is wired, its Terraform root, `service.yaml` |
| [`terraform/`](terraform/README.md) | what both environments share (`project/` root) and the `environment` module ; how to change the infrastructure, add an environment |
| [`cloudflare/`](cloudflare/README.md) | both Workers, deployed with wrangler |
| `docker/` | the `Dockerfile` of the one image both environments run |
| `tools/tilt/` | the scripts behind Tilt's buttons |

| Doc | |
|---|---|
| [`docs/architecture.md`](docs/architecture.md) | how a request reaches the app ; who owns what (Terraform, `deploy.yml`, wrangler, by hand) |
| [`docs/secrets.md`](docs/secrets.md) | every credential, where it lives, who reads it ; rotating |
| [`docs/releasing.md`](docs/releasing.md) | tags → environments, publishing a release, versioning |
