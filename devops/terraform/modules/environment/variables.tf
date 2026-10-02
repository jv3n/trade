variable "name" {
  description = "Environment name : `production` or `staging`."
  type        = string
}

variable "service" {
  description = "Cloud Run service name ; its runtime account is `<service>-runtime`."
  type        = string
}

variable "secret_suffix" {
  description = "Suffix of the environment's own secrets : empty for production, `-staging` for staging."
  type        = string
}

variable "runtime_display_name" {
  description = "Display name of the runtime account, as it exists."
  type        = string
}

variable "runtime_description" {
  description = "Description of the runtime account, as it exists (staging's has none)."
  type        = string
  default     = null
}

variable "deploy_account_email" {
  description = "The deploy account, which runs the Cloud Run service as the runtime account."
  type        = string
}
