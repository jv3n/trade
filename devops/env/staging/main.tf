locals {
  deploy_account = "github-deploy@trade-496613.iam.gserviceaccount.com"
}

module "environment" {
  source = "../../terraform/modules/environment"

  service              = "portfolioai-staging"
  secret_suffix        = "-staging"
  runtime_display_name = "PortfolioAI staging runtime"
  deploy_account_email = local.deploy_account
}
