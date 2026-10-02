module "environment" {
  source = "../modules/environment"

  name                 = "production"
  service              = "portfolioai"
  secret_suffix        = ""
  runtime_display_name = "PortfolioAI Runtime"
  runtime_description  = "Identity used by the Cloud Run service at runtime to access Secret Manager"
  deploy_account_email = "github-deploy@trade-496613.iam.gserviceaccount.com"
}
