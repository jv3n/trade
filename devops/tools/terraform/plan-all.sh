#!/usr/bin/env bash
# Plans the three Terraform roots read-only and writes a Markdown summary to the file in $1.
# Exit 0 : no root has changes ; 2 : at least one has ; 1 : a plan failed. Used by CI (#563).
set -uo pipefail

summary=$1
cd "$(dirname "${BASH_SOURCE[0]}")/../.." || exit 1

# A destroy or a replace here is never applied (devops/terraform/README.md) : called out on its own.
guarded=" terraform/project env/production "
# GitHub caps a comment at 65 536 characters ; three plans have to fit in one.
max_plan_chars=18000
status=0
work=$(mktemp -d)

: > "$summary"
for root in terraform/project env/production env/staging; do
  log="$work/${root//\//-}.log"
  plan_file="$work/${root//\//-}.tfplan"
  if ! terraform -chdir="$root" init -input=false -no-color > "$log" 2>&1; then
    printf '### `%s` — init failed\n\n```\n%s\n```\n\n' "$root" "$(tail -n 30 "$log")" >> "$summary"
    status=1
    continue
  fi

  terraform -chdir="$root" plan -lock=false -input=false -no-color -detailed-exitcode \
    -out="$plan_file" > "$log" 2>&1
  code=$?

  case $code in
    0)
      printf '### `%s` — no changes\n\n' "$root" >> "$summary"
      ;;
    2)
      [[ $status -eq 0 ]] && status=2
      totals=$(grep -m1 -E '^Plan:|^Changes to Outputs' "$log" || echo 'Changes')
      printf '### `%s` — %s\n\n' "$root" "$totals" >> "$summary"
      deletes=$(terraform -chdir="$root" show -json "$plan_file" |
        jq '[.resource_changes[]? | select(.change.actions | index("delete"))] | length')
      if [[ $deletes -gt 0 && $guarded == *" $root "* ]]; then
        printf '> [!CAUTION]\n> Destroys or replaces %s resource(s) — never applied on this root.\n\n' \
          "$deletes" >> "$summary"
      fi
      plan=$(terraform -chdir="$root" show -no-color "$plan_file")
      if [[ ${#plan} -gt $max_plan_chars ]]; then
        plan="${plan:0:$max_plan_chars}"$'\n… truncated, the full plan is in the job log.'
      fi
      printf '<details><summary>Plan</summary>\n\n```\n%s\n```\n\n</details>\n\n' "$plan" >> "$summary"
      ;;
    *)
      status=1
      printf '### `%s` — plan failed\n\n```\n%s\n```\n\n' "$root" "$(tail -n 30 "$log")" >> "$summary"
      ;;
  esac
  cat "$log"
done

exit "$status"
