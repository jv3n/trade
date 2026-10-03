# Releasing

Two deployed environments, one image, one workflow (`.github/workflows/deploy.yml`). The **release
tag** picks where a build goes :

| Tag | Published as | Goes to | URL | GitHub environment |
|---|---|---|---|---|
| `vX.Y.Z-rcN` | pre-release | **staging** — Cloud Run `portfolioai-staging` | https://staging.tickerstory.org/ | `staging` — no reviewer, tags `v*-rc*` only |
| `vX.Y.Z` | release | **production** — Cloud Run `portfolioai` | https://tickerstory.org/ | `production` — required reviewer, tags `v*.*.*` only |

Both run the Spring profile `prod`. What differs is passed by the workflow : the service, the public
URL, the runtime service account, the database and admin-list secrets (`*-staging` for staging) and
the environment name (`staging` / `prod`, the settings page's chip). The Google OAuth client is
shared. Both environments report to the same GlitchTip projects, under their own environment (#462).

## Publishing a release

1. **Candidate** — on GitHub, *Releases → Draft a new release*, tag `vX.Y.Z-rc1` on `master`, tick
   **Set as a pre-release**, publish. The workflow deploys it to staging, with no approval.
2. **Try it** on https://staging.tickerstory.org/. A problem : fix it on `master`, publish
   `vX.Y.Z-rc2`, try again.
3. **Release** — once a candidate is good, publish `vX.Y.Z` (same commit, pre-release box
   unticked). The workflow waits for the `production` approval, then deploys.

The workflow refuses a tag and a pre-release box that disagree (an `-rc` published as a release, or a
final version published as a pre-release), so a candidate can't reach production by mistake.

The final release rebuilds the image from the same commit rather than re-tagging the candidate's :
the version baked into the image (`/actuator/info`, Sentry) is then the final one.

## Versioning

SemVer on the product : **major** for a change that breaks the data or the flow (v2.0.0 reset the
database), **minor** for a feature, **patch** for fixes only.
