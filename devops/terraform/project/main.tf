# What both environments share, kept out of the environment module so that neither root owns it :
# the deploy account and Workload Identity Federation, the Artifact Registry repository, the
# shared secrets.

locals {
  project_number = "912181505110"
  # The one repository allowed to act as the CI accounts below.
  repository           = "jv3n/trade"
  repository_principal = "principalSet://iam.googleapis.com/projects/${local.project_number}/locations/global/workloadIdentityPools/github/attribute.repository/${local.repository}"
}

resource "google_service_account" "github_deploy" {
  account_id   = "github-deploy"
  display_name = "GitHub Actions Deployer"
  description  = "Used by GitHub Actions via Workload Identity Federation to deploy PortfolioAI to Cloud Run"

  lifecycle {
    prevent_destroy = true
  }
}

resource "google_project_iam_member" "github_deploy" {
  for_each = toset(["roles/run.admin", "roles/artifactregistry.writer"])

  project = "trade-496613"
  role    = each.value
  member  = google_service_account.github_deploy.member
}

resource "google_iam_workload_identity_pool" "github" {
  workload_identity_pool_id = "github"
  display_name              = "GitHub Actions Pool"
  description               = "Identity pool for GitHub Actions OIDC federation"

  lifecycle {
    prevent_destroy = true
  }
}

resource "google_iam_workload_identity_pool_provider" "github" {
  workload_identity_pool_id          = google_iam_workload_identity_pool.github.workload_identity_pool_id
  workload_identity_pool_provider_id = "github"
  display_name                       = "GitHub OIDC Provider"

  # Any repository of the owner may authenticate ; only `local.repository` may then act as an
  # account (the bindings below).
  attribute_condition = "assertion.repository_owner == 'jv3n'"
  attribute_mapping = {
    "google.subject"             = "assertion.sub"
    "attribute.ref"              = "assertion.ref"
    "attribute.repository"       = "assertion.repository"
    "attribute.repository_owner" = "assertion.repository_owner"
  }

  oidc {
    issuer_uri = "https://token.actions.githubusercontent.com"
  }

  lifecycle {
    prevent_destroy = true
  }
}

resource "google_service_account_iam_member" "github_deploy_wif" {
  service_account_id = google_service_account.github_deploy.name
  role               = "roles/iam.workloadIdentityUser"
  member             = local.repository_principal
}

# CI's `terraform plan` (PRs and the weekly drift run) : reads every resource and IAM policy the
# three roots hold, and the state with `-lock=false` — writes nothing, anywhere (#563).
resource "google_service_account" "terraform_plan" {
  account_id   = "terraform-plan"
  display_name = "Terraform plan (CI, read-only)"
  description  = "Used by GitHub Actions via Workload Identity Federation to run terraform plan"

  lifecycle {
    prevent_destroy = true
  }
}

resource "google_project_iam_member" "terraform_plan" {
  for_each = toset(["roles/viewer", "roles/iam.securityReviewer"])

  project = "trade-496613"
  role    = each.value
  member  = google_service_account.terraform_plan.member
}

# `roles/viewer` reads no object : the state needs its own grant, on the bucket only.
resource "google_storage_bucket_iam_member" "terraform_plan_reads_state" {
  bucket = "trade-496613-tfstate"
  role   = "roles/storage.objectViewer"
  member = google_service_account.terraform_plan.member
}

resource "google_service_account_iam_member" "terraform_plan_wif" {
  service_account_id = google_service_account.terraform_plan.name
  role               = "roles/iam.workloadIdentityUser"
  member             = local.repository_principal
}

# Containers only : values are added by hand (`gcloud secrets versions add`) and never reach the state.
# Who reads them is granted by each environment.
resource "google_secret_manager_secret" "shared" {
  for_each = toset(["google-oauth-client-id", "google-oauth-client-secret", "sentry-dsn-backend"])

  secret_id = each.value

  replication {
    auto {}
  }

  lifecycle {
    prevent_destroy = true
  }
}

resource "google_artifact_registry_repository" "backend" {
  repository_id = "backend"
  location      = "northamerica-northeast1"
  format        = "DOCKER"
  description   = "PortfolioAI Docker images (backend + future workers)"

  lifecycle {
    prevent_destroy = true
  }
}
