# One environment : its runtime account, its own secrets, its Cloud Run service.

resource "google_service_account" "runtime" {
  account_id   = "${var.service}-runtime"
  display_name = var.runtime_display_name
  description  = var.runtime_description

  lifecycle {
    prevent_destroy = true
  }
}

# `gcloud run deploy --service-account` needs the deploy account to act as the runtime one.
resource "google_service_account_iam_member" "deploy_acts_as_runtime" {
  service_account_id = google_service_account.runtime.name
  role               = "roles/iam.serviceAccountUser"
  member             = "serviceAccount:${var.deploy_account_email}"
}

# Containers only : values are added by hand (`gcloud secrets versions add`) and never reach the state.
resource "google_secret_manager_secret" "own" {
  for_each = toset(["supabase-db-url", "app-admin-emails"])

  secret_id = "${each.value}${var.secret_suffix}"

  replication {
    auto {}
  }

  lifecycle {
    prevent_destroy = true
  }
}

resource "google_secret_manager_secret_iam_member" "runtime_reads_own" {
  for_each = google_secret_manager_secret.own

  secret_id = each.value.id
  role      = "roles/secretmanager.secretAccessor"
  member    = google_service_account.runtime.member
}

# The shared secrets belong to the `project` root ; each environment only grants itself read access.
data "google_secret_manager_secret" "shared" {
  for_each = toset(["google-oauth-client-id", "google-oauth-client-secret", "sentry-dsn-backend"])

  secret_id = each.value
}

resource "google_secret_manager_secret_iam_member" "runtime_reads_shared" {
  for_each = data.google_secret_manager_secret.shared

  secret_id = each.value.id
  role      = "roles/secretmanager.secretAccessor"
  member    = google_service_account.runtime.member
}

# Terraform owns the service ; `deploy.yml` owns every revision (image, env, secrets, scaling, account).
resource "google_cloud_run_v2_service" "app" {
  name     = var.service
  location = "northamerica-northeast1"
  ingress  = "INGRESS_TRAFFIC_ALL"

  # Only used when the service is created : the backend repository has no untagged image to start from.
  template {
    containers {
      image = "us-docker.pkg.dev/cloudrun/container/hello"
    }
  }

  lifecycle {
    prevent_destroy = true
    ignore_changes  = [template, client, client_version]
  }
}

resource "google_cloud_run_v2_service_iam_member" "public" {
  name     = google_cloud_run_v2_service.app.name
  location = google_cloud_run_v2_service.app.location
  role     = "roles/run.invoker"
  member   = "allUsers"
}
