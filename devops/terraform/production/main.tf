module "environment" {
  source = "../modules/environment"

  name          = "production"
  service       = "portfolioai"
  secret_suffix = ""
}
