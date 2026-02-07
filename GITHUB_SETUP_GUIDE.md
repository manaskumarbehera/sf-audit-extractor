# GitHub Repository Setup Guide

This guide explains how to set up two separate GitHub repositories:
1. **Private Repository** (`sf-audit-extractor`) - Contains source code
2. **Public Repository** (`trackforcepro-docs`) - Contains documentation only

## Step 1: Create the Public Documentation Repository

### On GitHub:
1. Go to https://github.com/new
2. Repository name: `trackforcepro-docs`
3. Description: `Documentation and support for TrackForcePro Chrome Extension`
4. **Select: Public** ✅
5. Do NOT initialize with README (we already have one)
6. Click "Create repository"

### Push local docs to GitHub:
```bash
cd /Users/manas/IdeaProjects/trackforcepro-docs
git remote add origin https://github.com/manaskumarbehera/trackforcepro-docs.git
git push -u origin main
```

## Step 2: Enable GitHub Pages for Privacy Policy

1. Go to: https://github.com/manaskumarbehera/trackforcepro-docs/settings/pages
2. Under "Source", select:
   - Branch: `main`
   - Folder: `/ (root)`
3. Click "Save"
4. Wait 2-3 minutes for deployment
5. Your privacy policy will be available at:
   - https://manaskumarbehera.github.io/trackforcepro-docs/privacy-policy.html

## Step 3: Make Source Code Repository Private

### If repository already exists on GitHub:
1. Go to: https://github.com/manaskumarbehera/sf-audit-extractor/settings
2. Scroll down to "Danger Zone"
3. Click "Change repository visibility"
4. Select "Make private"
5. Confirm by typing the repository name

### If creating new private repo:
1. Go to https://github.com/new
2. Repository name: `sf-audit-extractor`
3. **Select: Private** 🔒
4. Create and push your code

## Step 4: Verify Links Work

After setup, verify these public URLs work:

| URL | Should Be Accessible |
|-----|---------------------|
| https://github.com/manaskumarbehera/trackforcepro-docs | ✅ Yes |
| https://github.com/manaskumarbehera/trackforcepro-docs/issues | ✅ Yes |
| https://manaskumarbehera.github.io/trackforcepro-docs/privacy-policy.html | ✅ Yes |
| https://github.com/manaskumarbehera/trackforcepro-docs/blob/main/USER_GUIDE.md | ✅ Yes |

## Summary of Changes Made

### Files Updated in Source Code (`sf-audit-extractor`):

1. **popup.html** - All GitHub links now point to `trackforcepro-docs`:
   - User Guide → `trackforcepro-docs/blob/main/USER_GUIDE.md`
   - Developer Guide → `trackforcepro-docs/blob/main/DEVELOPER_GUIDE.md`
   - Quick Reference → `trackforcepro-docs/blob/main/QUICK_REFERENCE.md`
   - Architecture Docs → `trackforcepro-docs/tree/main/architecture`
   - Documentation & Support → `trackforcepro-docs`
   - Report Issues → `trackforcepro-docs/issues`

2. **CHROME_WEBSTORE_SUBMISSION.md** - Updated:
   - Website URL → `trackforcepro-docs`
   - Support URL → `trackforcepro-docs/issues`
   - Privacy Policy URL → `trackforcepro-docs/privacy-policy.html`

### Public Docs Repository Structure (`trackforcepro-docs`):

```
trackforcepro-docs/
├── README.md                    # Product overview with feature list
├── privacy-policy.html          # Privacy policy for Chrome Web Store
├── USER_GUIDE.md               # End-user documentation
├── DEVELOPER_GUIDE.md          # Developer documentation
├── QUICK_REFERENCE.md          # Quick reference guide
├── TESTING_WALKTHROUGH.md      # Testing guide
├── architecture/
│   ├── BUILDER_TABS_IMPLEMENTATION.md
│   ├── BUILDER_TOGGLE.md
│   ├── ON_DEMAND_SCHEMA.md
│   ├── OPTIMIZATION_GUIDE.md
│   ├── PROGRESSIVE_DISCLOSURE.md
│   └── TABBED_INTERFACE.md
└── screenshots/
    └── mockup-ui.png
```

## Chrome Web Store Submission URLs

Use these URLs when submitting to Chrome Web Store:

| Field | URL |
|-------|-----|
| **Website** | https://github.com/manaskumarbehera/trackforcepro-docs |
| **Support URL** | https://github.com/manaskumarbehera/trackforcepro-docs/issues |
| **Privacy Policy** | https://manaskumarbehera.github.io/trackforcepro-docs/privacy-policy.html |

---

*Generated: February 2026*

