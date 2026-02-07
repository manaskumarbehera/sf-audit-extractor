# TrackForcePro - Documentation

Welcome to the documentation for the TrackForcePro Chrome Extension. This library contains comprehensive guides for users, developers, and testers.

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

### 🔖 [Reference](reference/)
Quick lookup materials.
- **[Quick Reference](reference/QUICK_REFERENCE.md)**: Visual diagrams, keyboard shortcuts, status messages, Data Explorer reference, and tips.

### 📊 [Reports](reports/)
Historical implementation records and summaries.
- **[Implementation Summary](reports/IMPLEMENTATION_SUMMARY.md)**: Details of the development process.
- **[Checklists](reports/IMPLEMENTATION_CHECKLIST.md)**: Tracked progress of features.

---

## 🚀 Quick Start for Users

1.  **Install the Extension**: Load the unpacked extension in Chrome Developer Mode.
2.  **Navigate to Salesforce**: Open any Salesforce tab and log in.
3.  **Open Extension**: Click the extension icon in your browser toolbar.
4.  **Choose Tool**:
    - **Audit**: Extract field metadata from Object Manager
    - **GraphQL/SOQL**: Build and execute queries
    - **Explore**: Manage favicons, search users, identify records
    - **Platform**: Monitor Platform Events and LMS

For detailed instructions, see the **[User Guide](guides/USER_GUIDE.md)**.

## 🛠️ Quick Start for Developers

1.  **Clone the Repo**: `git clone ...`
2.  **Install Dependencies**: `npm install` (for testing framework).
3.  **Run Tests**: `npm test` (runs all test suites).

For detailed setup, see the **[Developer Guide](guides/DEVELOPER_GUIDE.md)**.

---

## ✨ Key Features

### Query Builders
- **GraphQL Builder**: Visual query composition with progressive disclosure UI
- **SOQL Builder**: Field selection, filters, ordering, and execution

### Data Explorer
- **Sandbox & Favicon Manager**: Customize browser tab icons to identify different orgs
- **User Manager**: View current user, search users, update profiles/roles/languages
- **Current Record**: Auto-detect and display record details from URL
- **Record Search**: Look up any Salesforce ID to identify object type and details

### Platform Tools
- **Platform Events**: Monitor and subscribe to Platform Events
- **Lightning Message Service**: Audit, publish, and subscribe to message channels

### Productivity
- **Popout Window**: Open extension in standalone window with dynamic org name in title
- **Settings**: Show/hide features to customize your interface

