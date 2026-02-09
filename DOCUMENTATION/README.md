# TrackForcePro - Documentation

**Current Version: 1.1.2** | **Release Date: February 9, 2026**

[![Chrome Web Store](https://img.shields.io/badge/Chrome%20Web%20Store-Install-green?logo=google-chrome)](https://chromewebstore.google.com/detail/trackforcepro/eombeiphccjbnndbabnkimdlkpaooipk)

Welcome to the documentation for the TrackForcePro Chrome Extension. This library contains comprehensive guides for users, developers, and testers.

## 🛒 Install TrackForcePro

**[Install from Chrome Web Store](https://chromewebstore.google.com/detail/trackforcepro/eombeiphccjbnndbabnkimdlkpaooipk)** - One-click installation, automatic updates.

## 📋 Version History

| Version | Date | Highlights |
|---------|------|------------|
| [v1.1.2](CHANGELOG.md#v112---february-9-2026) | Feb 9, 2026 | Record Scanner, Field History, Related Records, Page Blinker |
| [v1.1.1](CHANGELOG.md#v111---february-8-2026) | Feb 8, 2026 | Unified Record Lookup, Dev Tools Panel |
| [v1.1.0](CHANGELOG.md#v110---february-7-2026) | Feb 7, 2026 | Popout Window, User Manager, Favicon Manager |
| [v1.0.9](CHANGELOG.md#v109---february-6-2026) | Feb 6, 2026 | Enhanced SOQL/GraphQL Builders |

👉 **[View Full Changelog](CHANGELOG.md)**

## ⚡ Quick Start

**New to TrackForcePro?** Open the **[Quick Start Guide (HTML)](html/QUICK_START_GUIDE.html)** for a visual walkthrough with screenshot placeholders.

## 📂 Documentation Structure

The documentation is organized into the following directories:

### 📘 [Guides](guides/)
Practical guides for using and testing the extension.
- **[Chrome Extension User Guide](guides/CHROME_EXTENSION_USER_GUIDE.md)**: **📌 START HERE** - Complete end-user manual with installation instructions, feature walkthroughs, and screenshots placeholders.
- **[User Guide](guides/USER_GUIDE.md)**: Technical reference for all features including Data Explorer, Query Builders, and Platform Tools.
- **[Developer Guide](guides/DEVELOPER_GUIDE.md)**: Setup, architecture overview, and contribution guidelines.
- **[Testing Strategy](guides/TESTING_STRATEGY.md)**: Overview of automated tests and testing strategy.
- **[Testing Walkthrough](guides/TESTING_WALKTHROUGH.md)**: Step-by-step manual testing guide for the UI.
- **[Build and Publish](guides/BUILD_AND_PUBLISH.md)**: Instructions for packaging and publishing the extension.

### 🏗️ [Architecture](architecture/)
Deep descriptions of specific technical implementations.
- **[Progressive Disclosure](architecture/PROGRESSIVE_DISCLOSURE.md)**: Explanation of the 3-screen UI pattern.
- **[Builder Toggle](architecture/BUILDER_TOGGLE.md)**: How the builder enable/disable logic works.
- **[Tabbed Interface](architecture/TABBED_INTERFACE.md)**: Logic behind the Query/Variables/Endpoint tabs.
- **[On-Demand Schema](architecture/ON_DEMAND_SCHEMA.md)**: Details on the performance optimization for schema loading.
- **[Tab Mode Feature](architecture/TAB_MODE_FEATURE.md)**: How the tab/window pop-out modes work (single-click for tab, Shift+click for window).

### 🔖 [Reference](reference/)
Quick lookup materials.
- **[Quick Reference](reference/QUICK_REFERENCE.md)**: Visual diagrams, keyboard shortcuts, status messages, Data Explorer reference, and tips.

### 📊 [Reports](reports/)
Historical implementation records and summaries.
- **[Implementation Summary](reports/IMPLEMENTATION_SUMMARY.md)**: Details of the development process.
- **[Checklists](reports/IMPLEMENTATION_CHECKLIST.md)**: Tracked progress of features.

### 📦 Publishing & Setup
- **[Chrome Web Store Submission](CHROME_WEBSTORE_SUBMISSION.md)**: Store listing details, descriptions, and submission requirements.
- **[GitHub Setup Guide](GITHUB_SETUP_GUIDE.md)**: Instructions for setting up the GitHub repository.

### 🌐 [HTML Pages](html/)
Standalone HTML documentation and legal pages.
- **[Quick Start Guide](html/QUICK_START_GUIDE.html)**: Visual walkthrough with screenshot placeholders for getting started.
- **[Privacy Policy](html/privacy-policy.html)**: Privacy policy for Chrome Web Store submission.

### 🔗 Public URLs (GitHub Pages)
Once GitHub Pages is enabled and changes are pushed, the documentation will be available at:
- **Documentation Home**: https://manaskumarbehera.github.io/sf-audit-extractor/
- **Quick Start Guide**: https://manaskumarbehera.github.io/sf-audit-extractor/QUICK_START_GUIDE.html
- **Privacy Policy**: https://manaskumarbehera.github.io/sf-audit-extractor/privacy-policy.html

**To deploy to GitHub Pages:**

1. **Commit and push changes:**
   ```bash
   git add .
   git commit -m "Add documentation and GitHub Pages"
   git push origin main
   ```

2. **Enable GitHub Pages:**
   - Go to repository **Settings** → **Pages**
   - Under "Source", select **Deploy from a branch**
   - Select **main** branch and **/docs** folder
   - Click **Save**

3. **Wait for deployment** (usually 1-2 minutes)

---

## ⚡ Quick Start for Users

1.  **Install the Extension**: Load the unpacked extension in Chrome Developer Mode.
2.  **Navigate to Salesforce**: Open any Salesforce tab and log in.
3.  **Open Extension**: Click the extension icon in your browser toolbar.
4.  **Choose Tool**:
    - **🔍 Audit**: Extract field metadata from Object Manager
    - **🔗 GraphQL / 📊 SOQL**: Build and execute queries
    - **💾 Explore**: Manage favicons, search users, identify records
    - **📡 Platform / 📢 LMS**: Monitor Platform Events and Lightning Message Service

For detailed instructions, see the **[User Guide](guides/USER_GUIDE.md)**.

## 🛠️ Quick Start for Developers

1.  **Clone the Repo**: `git clone ...`
2.  **Install Dependencies**: `npm install` (for testing framework).
3.  **Run Tests**: `npm test` (runs all test suites).

For detailed setup, see the **[Developer Guide](guides/DEVELOPER_GUIDE.md)**.

---

## ✨ Key Features

### Query Builders
- **🔗 GraphQL Builder**: Visual query composition with progressive disclosure UI
- **📊 SOQL Builder**: Field selection, filters, ordering, and execution

### Data Explorer
- **Sandbox & Favicon Manager**: Customize browser tab icons to identify different orgs
- **User Manager**: View current user, search users, update profiles/roles/languages
- **Record Scanner**: Scan records with field history, related records explorer, and recent history

### Platform Tools
- **Platform Events**: Monitor and subscribe to Platform Events
- **Lightning Message Service**: Audit, publish, and subscribe to message channels

### Productivity
- **Open as Tab**: Single-click the pop button to open TrackForcePro in a browser tab (adjacent to current tab)
- **Popout Window**: Shift+click to open extension in standalone window with dynamic org name in title
- **Pop-in to Tab**: From standalone window, pop-in opens as a tab instead of just closing
- **Settings**: Show/hide features to customize your interface

