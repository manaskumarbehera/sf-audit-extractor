# Documentation Version Update Automation

This guide explains how to use the automated documentation version update system for TrackForcePro.

## Overview

When releasing a new version of TrackForcePro, multiple HTML documentation files need to be updated with:
- New version numbers
- Updated dates
- Changelog entries
- Version selector dropdowns

The `update-docs-version.js` script automates this process.

## Quick Start

### 1. Update manifest.json version first

```json
{
  "version": "1.2.0"
}
```

### 2. Run the update script

```bash
# Basic usage - updates all docs with version from manifest.json
npm run update-docs

# With changelog entries (comma-separated)
npm run update-docs:changelog "New Cache Manager, Fixed login bug, Improved performance"

# Or directly with node
node scripts/update-docs-version.js
node scripts/update-docs-version.js --changelog "Feature A, Feature B, Bug fix C"
```

### 3. Build the extension

```bash
npm run zip
# or
./build.sh
```

The build script automatically runs the documentation update.

## What Gets Updated

| File | Updates Applied |
|------|-----------------|
| `docs/index.html` | Version selector, features title, recent changes section |
| `docs/documentation.html` | Version selector, version badges |
| `docs/help.html` | Version badge, last updated date |
| `docs/quick-start-guide.html` | Version badge, footer version |
| `docs/privacy-policy.html` | Last updated date |
| `popup.html` | About section version |
| `build/popup.html` | About section version |

## Patterns Updated

The script recognizes and updates these patterns:

### Version Badges
```html
<span class="version-badge">Version 1.1.14</span>
<span class="version-badge">v1.1.14</span>
```

### Last Updated Dates
```html
Last updated: February 14, 2026
<p class="last-updated">Last updated: February 14, 2026</p>
```

### Footer Versions
```html
TrackForcePro v1.1.14
Version 1.1.14 | February 2026
```

### Features Title
```html
Key Features (v1.1.14)
```

### Version Selectors
```html
<select id="version-select">
    <option value="1.1.14" selected>v1.1.14 (Latest)</option>
    <option value="1.1.13">v1.1.13</option>
    ...
</select>
```

## Manual Steps Still Required

After running the script, you may still need to manually:

1. **Add new version content section** in `documentation.html` if there are significant new features
2. **Update detailed changelog** in `documentation.html` with bullet points
3. **Add screenshots** if new features have UI changes
4. **Review and verify** all changes before committing

## File Naming Conventions

All documentation files follow these conventions:
- **Lowercase** file names
- **Hyphens** for word separation (not underscores)
- **`.html`** extension

Examples:
- ✅ `quick-start-guide.html`
- ✅ `privacy-policy.html`
- ❌ `QUICK_START_GUIDE.html`
- ❌ `privacy_policy.html`

## Adding New Documentation Files

If you add a new documentation HTML file:

1. Name it following the conventions above
2. Add it to the `filesToUpdate` array in `scripts/update-docs-version.js`:

```javascript
const filesToUpdate = [
    path.join(DOCS_DIR, 'index.html'),
    path.join(DOCS_DIR, 'documentation.html'),
    path.join(DOCS_DIR, 'help.html'),
    path.join(DOCS_DIR, 'quick-start-guide.html'),
    path.join(DOCS_DIR, 'privacy-policy.html'),
    path.join(DOCS_DIR, 'your-new-file.html'),  // Add here
    // ...
];
```

3. Add appropriate version patterns to your new file

## Troubleshooting

### Script says "No changes" for a file

This means the file's version patterns are already up to date, or the patterns don't match the expected format. Check that your HTML uses the standard patterns listed above.

### Version selector not updating

Make sure the `<select>` element has `id="version-select"`. The script looks for this specific ID.

### Changelog not appearing

- Make sure you're passing the `--changelog` flag with entries
- Entries should be comma-separated
- Only `docs/index.html` receives changelog updates

## Integration with CI/CD

You can add this to your GitHub Actions workflow:

```yaml
- name: Update documentation versions
  run: node scripts/update-docs-version.js

- name: Build extension
  run: ./build.sh
```

## Script Location

```
sf-audit-extractor/
├── scripts/
│   └── update-docs-version.js  ← The automation script
├── docs/
│   ├── index.html
│   ├── documentation.html
│   ├── help.html
│   ├── quick-start-guide.html
│   └── privacy-policy.html
└── build.sh                     ← Calls the script automatically
```

