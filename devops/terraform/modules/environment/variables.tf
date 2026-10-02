variable "name" {
  description = "Environment name : `production` or `staging`."
  type        = string
}

variable "service" {
  description = "Cloud Run service name."
  type        = string
}

variable "secret_suffix" {
  description = "Suffix of the environment's own secrets : empty for production, `-staging` for staging."
  type        = string
}
