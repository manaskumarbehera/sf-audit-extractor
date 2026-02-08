# GitHub Repository Protection Guide

This guide explains how to keep your repository **PUBLIC** while protecting your code from unauthorized modifications using GitHub Rulesets and Branch Protection.

## Repository Structure

**Single Public Repository:** `sf-audit-extractor`
- Source code is visible (open source)
- Documentation accessible to users
- Code changes protected by rulesets
- Only you can merge changes

---

## Step 1: Enable Branch Protection Rules

Go to: **Settings → Branches → Add branch protection rule**

### Main Branch Protection:
1. **Branch name pattern:** `main`
2. ✅ **Require a pull request before merging**
   - ✅ Require approvals: `1`
   - ✅ Dismiss stale pull request approvals when new commits are pushed
   - ✅ Require review from Code Owners
3. ✅ **Require status checks to pass before merging**
4. ✅ **Require conversation resolution before merging**
5. ✅ **Do not allow bypassing the above settings**
6. ✅ **Restrict who can push to matching branches**
   - Add yourself: `manaskumarbehera`
7. Click **Create**

---

## Step 2: Set Up GitHub Rulesets (Recommended)

Go to: **Settings → Rules → Rulesets → New ruleset → New branch ruleset**

### ⚠️ IMPORTANT: Add Bypass FIRST!

Before enabling any rules, add yourself to the bypass list so YOU can still push directly:

1. Under **"Bypass list"** section, click **"Add bypass"**
2. Select **"Repository admin"** 
3. Set to **"Always"** (allows you to bypass without PR)
4. Click **Add**

### Create Ruleset:
```
Name: Protect Main Branch
Enforcement status: Active
Target branches: Include default branch
```

### Rules to enable:
- ✅ **Restrict deletions**
- ✅ **Require linear history**
- ✅ **Require a pull request before merging**
  - Required approvals: 1
  - ✅ Require review from Code Owners
  - ✅ Require approval of the most recent reviewable push
- ✅ **Block force pushes**

> ✅ The bypass list should already include you from the step above.

---

## Troubleshooting: "Push declined due to repository rule violations"

If you see this error when pushing:
```
! [remote rejected] main -> main (push declined due to repository rule violations)
```

**Fix:**
1. Go to: **Settings → Rules → Rulesets**
2. Click on your ruleset
3. Under **"Bypass list"**, add **"Repository admin"** with **"Always"** permission
4. Save and try pushing again

**Alternative:** Temporarily disable the ruleset, push, then re-enable.

---

## Step 3: CODEOWNERS File (Already Created)

File: `.github/CODEOWNERS`
```
# All files require approval from repository owner
* @manaskumarbehera
```

This ensures:
- Any PR touching any file requires YOUR approval
- External contributors cannot merge without your review

---

## Step 4: Disable Forking (Optional - More Restrictive)

Go to: **Settings → General → Features**
- ❌ Uncheck "Allow forking"

> ⚠️ Note: This prevents forks but also limits contribution. Consider keeping it enabled if you want community contributions.

---

## Step 5: Enable GitHub Pages for Privacy Policy

1. Go to: **Settings → Pages**
2. Source: **Deploy from a branch**
3. Branch: `main` / `/ (root)`
4. Click **Save**

Your privacy policy will be at:
```
https://manaskumarbehera.github.io/sf-audit-extractor/privacy-policy.html
```

---

## What This Protection Achieves

| Protection | What it does |
|------------|--------------|
| **Branch Protection** | Prevents direct pushes to main |
| **Required Reviews** | All changes need your approval |
| **CODEOWNERS** | You're required reviewer for all files |
| **Rulesets** | Prevents force pushes and deletions |
| **Status Checks** | Tests must pass before merge |

---

## How External Contributions Work

1. Contributor forks your repo (if allowed)
2. Contributor creates a branch and makes changes
3. Contributor opens a Pull Request
4. **You review the code**
5. **You approve or reject**
6. Only after YOUR approval can it be merged

---

## Important: Code Visibility

⚠️ **Note:** With a PUBLIC repository, your source code IS visible to everyone. The protection rules only prevent:
- Unauthorized modifications
- Direct pushes without review
- Merging without your approval

If you want code to be **completely hidden**, you must make the repository **PRIVATE**.

---

## Quick Links

| Purpose | URL |
|---------|-----|
| Repository | https://github.com/manaskumarbehera/sf-audit-extractor |
| Issues | https://github.com/manaskumarbehera/sf-audit-extractor/issues |
| Privacy Policy | https://manaskumarbehera.github.io/sf-audit-extractor/privacy-policy.html |
| Documentation | https://github.com/manaskumarbehera/sf-audit-extractor/tree/main/DOCUMENTATION |

---

*Updated: February 2026*

