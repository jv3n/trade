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
