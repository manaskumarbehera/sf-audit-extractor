# SF Audit Extractor - Documentation

Welcome to the documentation for the SF Audit Extractor Chrome Extension. This library contains comprehensive guides for users, developers, and testers.

## 📂 Documentation Structure

The documentation is organized into the following directories:

### 📘 [Guides](guides/)
Practical guides for using and testing the extension.
- **[User Guide](guides/USER_GUIDE.md)**: Complete manual for end-users. Learn how to use SOQL and GraphQL builders.
- **[Developer Guide](guides/DEVELOPER_GUIDE.md)**: Setup, architecture overview, and contribution guidelines.
- **[Testing Strategy](guides/TESTING_STRATEGY.md)**: Overview of automated tests and testing strategy.
- **[Testing Walkthrough](guides/TESTING_WALKTHROUGH.md)**: Step-by-step manual testing guide for the UI.

### 🏗️ [Architecture](architecture/)
Deep descriptions of specific technical implementations.
- **[Progressive Disclosure](architecture/PROGRESSIVE_DISCLOSURE.md)**: Explanation of the 3-screen UI pattern.
- **[Builder Toggle](architecture/BUILDER_TOGGLE.md)**: How the builder enable/disable logic works.
- **[Tabbed Interface](architecture/TABBED_INTERFACE.md)**: Logic behind the Query/Variables/Endpoint tabs.
- **[On-Demand Schema](architecture/ON_DEMAND_SCHEMA.md)**: Details on the performance optimization for schema loading.

### 🔖 [Reference](reference/)
Quick lookup materials.
- **[Quick Reference](reference/QUICK_REFERENCE.md)**: Keyboard shortcuts, status messages, and tips.

### 📊 [Reports](reports/)
Historical implementation records and summaries.
- **[Implementation Summary](reports/IMPLEMENTATION_SUMMARY.md)**: Details of the development process.
- **[Checklists](reports/IMPLEMENTATION_CHECKLIST.md)**: Tracked progress of features.

---

## 🚀 Quick Start for Users

1.  **Install the Extension**: Load the unpacked extension in Chrome Developer Mode.
2.  **Navigate to Salesforce**: Open any Salesforce tab.
3.  **Open Extension**: Click the extension icon.
4.  **Choose Tool**: Select **Audit** for field extraction or **GraphQL** / **SOQL** for querying.

For detailed instructions, see the **[User Guide](guides/USER_GUIDE.md)**.

## 🛠️ Quick Start for Developers

1.  **Clone the Repo**: `git clone ...`
2.  **Install Dependencies**: `npm install` (if applicable for test scripts).
3.  **Run Tests**: `npm test` (or specific test command).

For detailed setup, see the **[Developer Guide](guides/DEVELOPER_GUIDE.md)**.

