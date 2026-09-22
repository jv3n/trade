# Environments and releases

Two deployed environments, one image, one workflow (`.github/workflows/deploy.yml`). The **release
tag** picks where a build goes :

| Tag | Published as | Goes to | URL | GitHub environment |
|---|---|---|---|---|
| `vX.Y.Z-rcN` | pre-release | **staging** — Cloud Run `portfolioai-staging` | https://staging.tickerstory.org/ | `staging` (no reviewer) |
| `vX.Y.Z` | release | **production** — Cloud Run `portfolioai` | https://tickerstory.org/ | `production` (required reviewer) |

Both run the Spring profile `prod`. What differs is passed by the workflow : the service, the public
URL, the runtime service account, the database and admin-list secrets (`*-staging` for staging) and
the Sentry environment (`staging` / `prod`). The Google OAuth client and the Sentry project are
shared.

- [`prod/README.md`](prod/README.md) — what is wired for production.
- [`staging/README.md`](staging/README.md) — what staging adds, and how to set it up.
- [`local/README.md`](local/README.md) — the local stack (Tilt).

## Releasing

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
