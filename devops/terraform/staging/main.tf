module "environment" {
  source = "../modules/environment"

  name                 = "staging"
  service              = "portfolioai-staging"
  secret_suffix        = "-staging"
  runtime_display_name = "PortfolioAI staging runtime"
  deploy_account_email = "github-deploy@trade-496613.iam.gserviceaccount.com"
}
