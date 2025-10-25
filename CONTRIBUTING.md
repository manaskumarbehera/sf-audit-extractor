CONTRIBUTING
============

Thank you for contributing! A few short guidelines to keep tests and developer artifacts tidy.

Tests
-----
- Put automated tests under `__tests__/` (Jest-compatible). This repository runs Jest with `npm test`.
- Avoid adding runnable ad-hoc test scripts at the repository root; they were removed and archived to keep the project structure clean.
- If you need to add an ad-hoc script for local debugging, prefer adding it under `scripts/` and mark it clearly; automated CI should not rely on root-level test scripts.
- The test harness `__tests__/run_existing_scripts.test.js` will attempt to run legacy ad-hoc scripts if present. Missing legacy files are treated as "skipped". To see skipped script warnings during test runs set the environment variable:

```bash
SHOW_SKIPPED_SCRIPTS=1 npm test
```

Workflow & build
----------------
- Build a clean extension package (excludes tests and IDE metadata):

```bash
npm run build:ext
```

- Load the generated `dist/` into Chrome at `chrome://extensions` → "Load unpacked".

IDE metadata and backups
------------------------
- IDE metadata (for example `.idea/`) is not required for the extension runtime and is excluded from `dist/`. If you don't want to track IDE files in git, add them to `.gitignore` (this repo already ignores `.idea/`).
- Previously removed ad-hoc tests were archived at `backups/archived_top_level_tests.tar.gz`. If the archive was deleted and you need the old ad-hoc scripts restored, please open an issue or ask for restoration and we can reconstruct them from Git history.

Helpful tips
------------
- Run the full test suite locally before opening a PR:

```bash
npm test
```

- Keep tests focused and place them under `__tests__/` so CI and contributors run the same suite.

Thanks for helping keep this repo maintainable and testable!
