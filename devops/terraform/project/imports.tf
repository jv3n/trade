import {
  to = google_service_account.github_deploy
  id = "projects/trade-496613/serviceAccounts/github-deploy@trade-496613.iam.gserviceaccount.com"
}

import {
  for_each = toset(["roles/run.admin", "roles/artifactregistry.writer"])
  to       = google_project_iam_member.github_deploy[each.value]
  id       = "trade-496613 ${each.value} serviceAccount:github-deploy@trade-496613.iam.gserviceaccount.com"
}

import {
  to = google_iam_workload_identity_pool.github
  id = "projects/trade-496613/locations/global/workloadIdentityPools/github"
}

import {
  to = google_iam_workload_identity_pool_provider.github
  id = "projects/trade-496613/locations/global/workloadIdentityPools/github/providers/github"
}

import {
  to = google_service_account_iam_member.github_deploy_wif
  id = "projects/trade-496613/serviceAccounts/github-deploy@trade-496613.iam.gserviceaccount.com roles/iam.workloadIdentityUser principalSet://iam.googleapis.com/projects/912181505110/locations/global/workloadIdentityPools/github/attribute.repository/jv3n/trade"
}
