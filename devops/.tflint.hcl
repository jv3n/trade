plugin "terraform" {
  enabled = true
  preset  = "all"
}

plugin "google" {
  enabled = true
  version = "0.40.0"
  source  = "github.com/terraform-linters/tflint-ruleset-google"
}

# Roots without variables or outputs would need empty `variables.tf` / `outputs.tf` files.
rule "terraform_standard_module_structure" {
  enabled = false
}
