#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"

# Files and patterns to remove (ignore missing)
rm_list=(
  "soql_helper.js"
  "soql_helper_dom.js"
  "soql_helper_schema.js"
  "soql_helper_storage.js"
  "soql_helper_utils.js"
  "soql_semantic_validator.js"
  "soql_suggester.js"
  "soql_suggestions_engine.js"
  "soql_suggestions_config.spec.js"
  "soql_suggestions_config.json"
  "soql_builder_tips.json"
  "test_soql_validator.js"
  "test_soql_suggester.js"
  "test_soql_expected_failures.js"
  "test-results/soql_suggestions_config-details.json"
  "soql_suggestions_config.spec.js"
)

echo "Removing SOQL artifact files (if present)..."
for f in "${rm_list[@]}"; do
  git rm --ignore-unmatch -- "$f" || true
done

# Stage updated IDE metadata and popup changes
git add .idea/workspace.xml popup.html popup.js rules/soql_suggestions_config.json rules/soql_builder_tips.json || true

# Commit
if git diff --cached --quiet; then
  echo "No staged changes to commit."
else
  git commit -m "chore(soql): remove SOQL artifacts, tests, and workspace refs"
  echo "Committed removal of SOQL artifacts."
fi

# Show remaining tracked files matching 'soql' (should be none)
echo "Remaining tracked files with 'soql' in name:"
git ls-files | grep -i soql || true

echo "Done. Review and push changes if everything looks correct."

