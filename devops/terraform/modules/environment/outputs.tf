output "runtime_account_email" {
  description = "The account the Cloud Run service runs as."
  value       = google_service_account.runtime.email
}

output "secret_ids" {
  description = "The environment's own secrets, keyed by their name without suffix."
  value       = { for name, secret in google_secret_manager_secret.own : name => secret.id }
}
