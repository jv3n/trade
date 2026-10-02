module "environment" {
  source = "../modules/environment"

  name          = "staging"
  service       = "portfolioai-staging"
  secret_suffix = "-staging"
}
