terraform {
  required_version = "= 1.16.4"

  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 8.5"
    }
  }

  backend "gcs" {
    bucket = "trade-496613-tfstate"
    prefix = "project"
  }
}

provider "google" {
  project = "trade-496613"
  region  = "northamerica-northeast1"
}
