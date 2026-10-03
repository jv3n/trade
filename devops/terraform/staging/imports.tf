import {
  to = module.environment.google_service_account.runtime
  id = "projects/trade-496613/serviceAccounts/portfolioai-staging-runtime@trade-496613.iam.gserviceaccount.com"
}

import {
  to = module.environment.google_service_account_iam_member.deploy_acts_as_runtime
  id = "projects/trade-496613/serviceAccounts/portfolioai-staging-runtime@trade-496613.iam.gserviceaccount.com roles/iam.serviceAccountUser serviceAccount:github-deploy@trade-496613.iam.gserviceaccount.com"
}

import {
  for_each = toset(["supabase-db-url", "app-admin-emails"])
  to       = module.environment.google_secret_manager_secret.own[each.value]
  id       = "projects/trade-496613/secrets/${each.value}-staging"
}

import {
  for_each = toset(["supabase-db-url", "app-admin-emails"])
  to       = module.environment.google_secret_manager_secret_iam_member.runtime_reads_own[each.value]
  id       = "projects/trade-496613/secrets/${each.value}-staging roles/secretmanager.secretAccessor serviceAccount:portfolioai-staging-runtime@trade-496613.iam.gserviceaccount.com"
}

import {
  for_each = toset(["google-oauth-client-id", "google-oauth-client-secret", "sentry-dsn-backend"])
  to       = module.environment.google_secret_manager_secret_iam_member.runtime_reads_shared[each.value]
  id       = "projects/trade-496613/secrets/${each.value} roles/secretmanager.secretAccessor serviceAccount:portfolioai-staging-runtime@trade-496613.iam.gserviceaccount.com"
}
