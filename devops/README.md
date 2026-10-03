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

## Logs

The backend writes one JSON line per event on staging and production (`GcpStructuredLogFormatter`,
`prod` profile only — local and the tests keep the plain console). Cloud Run ships them to
[Logs Explorer](https://console.cloud.google.com/logs/query?project=trade-496613), on GCP's own
allowance, not GlitchTip's quota.

- **Pick the environment** : `resource.labels.service_name` — one Cloud Run service per environment,
  [staging](https://console.cloud.google.com/logs/query;query=resource.type%3D%22cloud_run_revision%22%0Aresource.labels.service_name%3D%22portfolioai-staging%22?project=trade-496613)
  (`portfolioai-staging`) and
  [production](https://console.cloud.google.com/logs/query;query=resource.type%3D%22cloud_run_revision%22%0Aresource.labels.service_name%3D%22portfolioai%22?project=trade-496613)
  (`portfolioai`). Each service's **Logs** tab in Cloud Run shows the same lines, with fewer filters.
- **Filter by severity** : `severity >= WARNING`.
- **One request's lines** : expand its request log — the app's lines fold under it, joined on the
  `X-Cloud-Trace-Context` trace id.
- **One user** : `jsonPayload.userId = "<uuid>"` — never an email.
- **From a GlitchTip issue** : copy its `trace_id` tag, then
  `trace = "projects/trade-496613/traces/<trace_id>"`.
