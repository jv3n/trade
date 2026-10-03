module "environment" {
  source = "../modules/environment"

  name                 = "production"
  service              = "portfolioai"
  secret_suffix        = ""
  runtime_display_name = "PortfolioAI Runtime"
  runtime_description  = "Identity used by the Cloud Run service at runtime to access Secret Manager"
  deploy_account_email = "github-deploy@trade-496613.iam.gserviceaccount.com"
}

# The monthly backup (`backup-postgres.yml`) dumps the production database from GitHub Actions.
resource "google_secret_manager_secret_iam_member" "deploy_reads_db_url" {
  secret_id = module.environment.secret_ids["supabase-db-url"]
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:github-deploy@trade-496613.iam.gserviceaccount.com"
}
