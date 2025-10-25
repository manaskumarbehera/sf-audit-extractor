# SF Audit Extractor — Developer Notes

This repository contains a Chrome extension (SOQL suggestion/validator helpers) and a test suite.

Test locations
- Canonical Jest tests live under `__tests__/` (preferred). Add new tests there.
- Legacy ad-hoc test scripts that used to sit at the project root were removed in favor of `__tests__/`.

If you need the removed ad-hoc test scripts they are archived in:
- `backups/archived_top_level_tests.tar.gz`

To restore them:
```bash
# restore to project root
tar -xzf backups/archived_top_level_tests.tar.gz -C .
```

Build & Load extension (clean dist/)
```bash
npm run build:ext
# then load dist/ in chrome://extensions -> Load unpacked
```

Running tests
```bash
npm test
```

Notes
- The build script excludes test files and IDE metadata like `.idea/` to keep the extension package clean.
- If you want to re-enable ad-hoc scripts, restore from the backup, but prefer adding automated tests to `__tests__/` for CI compatibility.

