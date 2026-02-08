# Build and Publish Guide

This document describes how to create a distribution package for the TrackForcePro Chrome extension for uploading to the Chrome Web Store.

## Quick Command

Run this command from the project root directory to create a zip file for Chrome Web Store submission:

```bash
zip -r TrackForcePro-v1.1.1.zip manifest.json background.js content.js popup.html popup.js popup.css audit_helper.js constants.js data_explorer_helper.js graphql_helper.js lms_helper.js oauth_helper.js platform_helper.js settings_helper.js soql_helper.js url_helper.js utils.js icons/ rules/ scripts/
```

> **Note:** Update the version number in the filename (e.g., `TrackForcePro-v1.0.2.zip`) when releasing a new version. The version should match the `version` field in `manifest.json`.

## Files Included in the Package

The following files are required for the Chrome extension to function:

### Core Extension Files
| File | Description |
|------|-------------|
| `manifest.json` | Extension manifest (required by Chrome) |
| `background.js` | Service worker for background tasks |
| `content.js` | Content script injected into Salesforce pages |

### Popup UI
| File | Description |
|------|-------------|
| `popup.html` | Main popup HTML structure |
| `popup.js` | Popup functionality and logic |
| `popup.css` | Popup styling |

### Helper Modules
| File | Description |
|------|-------------|
| `audit_helper.js` | Audit extraction functionality |
| `constants.js` | Shared constants |
| `data_explorer_helper.js` | Data Explorer functionality |
| `graphql_helper.js` | GraphQL query builder |
| `lms_helper.js` | LMS integration |
| `oauth_helper.js` | OAuth authentication |
| `platform_helper.js` | Platform utilities |
| `settings_helper.js` | Settings management |
| `soql_helper.js` | SOQL query builder |
| `url_helper.js` | URL utilities |
| `utils.js` | General utilities |

### Assets and Configuration
| Directory | Description |
|-----------|-------------|
| `icons/` | Extension icons (16, 32, 48, 128 px) |
| `rules/` | SOQL guidance configuration files |
| `scripts/` | Additional scripts (SOQL guidance engine) |

## Files Excluded from the Package

The following files/directories are intentionally excluded as they are not needed for the published extension:

| File/Directory | Reason |
|----------------|--------|
| `tests/` | Test files (development only) |
| `DOCUMENTATION/` | Documentation (development only) |
| `node_modules/` | NPM dependencies (development only) |
| `.git/`, `.gitignore` | Git version control |
| `.idea/`, `.ai/` | IDE configuration |
| `package.json`, `package-lock.json` | NPM configuration |
| `output*.txt`, `839` | Temporary/debug files |
| `test_format.js` | Test utilities |
| `helper/` | IDE helper configuration |
| `screenshots/` | Marketing screenshots |

## Pre-Publish Checklist

Before creating the distribution package:

1. **Update Version Number**
   - Update `version` in `manifest.json`
   - Update filename in the zip command to match

2. **Test the Extension**
   ```bash
   npm test
   ```

3. **Verify All Files**
   - Ensure no debug/console.log statements remain
   - Check that all required permissions are listed in manifest.json

4. **Create the Package**
   ```bash
   zip -r TrackForcePro-v<VERSION>.zip manifest.json background.js content.js popup.html popup.js popup.css audit_helper.js constants.js data_explorer_helper.js graphql_helper.js lms_helper.js oauth_helper.js platform_helper.js settings_helper.js soql_helper.js url_helper.js utils.js icons/ rules/ scripts/
   ```

5. **Verify Package Contents**
   ```bash
   unzip -l TrackForcePro-v<VERSION>.zip
   ```

## Uploading to Chrome Web Store

1. Go to [Chrome Web Store Developer Dashboard](https://chrome.google.com/webstore/devconsole)
2. Sign in with your developer account
3. Click "New Item" or select existing item to update
4. Upload the zip file
5. Fill in/update the store listing details
6. Submit for review

## Automated Build Script (Optional)

For convenience, you can add this script to your `package.json`:

```json
{
  "scripts": {
    "package": "zip -r TrackForcePro-v$(node -p \"require('./manifest.json').version\").zip manifest.json background.js content.js popup.html popup.js popup.css audit_helper.js constants.js data_explorer_helper.js graphql_helper.js lms_helper.js oauth_helper.js platform_helper.js settings_helper.js soql_helper.js url_helper.js utils.js icons/ rules/ scripts/"
  }
}
```

Then run:
```bash
npm run package
```

This will automatically use the version from `manifest.json` in the filename.

