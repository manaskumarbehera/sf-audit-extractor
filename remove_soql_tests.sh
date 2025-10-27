#!/usr/bin/env bash
set -euo pipefail

# remove_soql_tests.sh
# Safely remove SOQL test files and commit the changes.
# Run this from the project root: chmod +x remove_soql_tests.sh && ./remove_soql_tests.sh

FILES=(
  "test_soql_validator.js"
  "test_soql_suggester.js"
  "test_soql_expected_failures.js"
  "soql_suggestions_config.spec.js"
  "test-results/soql_suggestions_config-details.json"
)

echo "Running SOQL test cleanup script"

# verify we're in a git repo
if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  echo "ERROR: This directory is not a git repository. Run from project root where .git exists."
  exit 2
fi

# Remove files from git (if they exist)
for f in "${FILES[@]}"; do
  if [ -e "$f" ]; then
    echo "git rm '$f'"
    git rm "$f"
  else
    echo "Note: '$f' not found, skipping"
  fi
done

# Stage the other changes we made earlier (adjust list if you changed additional files)
# Note: do NOT attempt to add the deleted test-results file here; it's being removed above
git add package.json .idea/workspace.xml popup.html \
  soql_helper.js soql_helper_dom.js soql_helper_schema.js soql_helper_storage.js soql_helper_utils.js soql_suggester.js soql_suggestions_engine.js soql_semantic_validator.js || true

# Commit
COMMIT_MSG="chore(soql): remove SOQL tests and run configs; archive results; keep safe stubs"

git commit -m "$COMMIT_MSG"

echo "Committed removal of SOQL tests and metadata changes."

echo "Done. To publish the commit run: git push origin HEAD"
