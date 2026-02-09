# TrackForcePro - Developer Guide

## 🛠️ Development Setup

### Prerequisities
- **Node.js**: Required for running tests (v14+ is recommended).
- **Chrome**: For loading the extension.

### Initial Setup
1.  Clone the repository.
2.  Install dependencies:
    ```bash
    npm install
    ```
    *(Note: Dependencies are primarily for the testing framework and dev tools)*

### Project Structure (Key Files)
```
sf-audit-extractor/
├── manifest.json          # Chrome extension configuration (V3)
├── popup.html             # The main UI of the extension
├── popup.js               # Main UI logic/orchestration
├── background.js          # Service worker (handles network requests)
├── content.js             # Content script (interactions with page DOM, favicon injection)
├── *_helper.js            # Modularized logic (features split into specific files)
│   ├── graphql_helper.js      # GraphQL Builder logic
│   ├── soql_helper.js         # SOQL Builder logic
│   ├── audit_helper.js        # Field extraction logic
│   ├── data_explorer_helper.js # Data Explorer (Favicon, User, Record tools)
│   ├── platform_helper.js     # Salesforce API abstraction
│   ├── lms_helper.js          # Lightning Message Service
│   └── url_helper.js          # URL parsing utilities
├── rules/                 # Configuration JSONs for suggestions/guidance
├── tests/                 # Jest test files
│   ├── data_explorer.test.js  # Tests for Favicon, User Manager, Record tools
│   ├── graphql_builder.test.js
│   ├── soql_builder.test.js
│   ├── popup_popout.test.js   # Tests for popup/window modes
│   ├── popup_tab_mode.test.js # Tests for tab mode feature
│   └── ...
└── DOCUMENTATION/         # This documentation
```

---

## 🏗️ Architecture Overview

The extension strictly follows **Manifest V3** guidelines.

### Communication Pattern
- **Popup → Content Script**: Used to request page details (e.g., getting session ID from cookies or DOM).
- **Popup → Background**: Used for long-running tasks or cross-origin requests (though most API calls happen in Popup context when possible).
- **Runtime Messages**: `chrome.runtime.sendMessage` is the primary bus.

### State Management
The UI state is generally ephemeral (lives as long as the popup is open), but some critical state (like recently used objects) might be persisted in `chrome.storage.local`.

### Modular Helpers
To avoid a massive `popup.js`, logic is separated:
- **`platform_helper.js`**: Abstractions for Salesforce API calls (session, SOQL queries, REST API).
- **`graphql_helper.js`**: Handles the UI rendering and query generation for the GraphQL tab.
- **`soql_helper.js`**: Handles the SOQL Builder UI and query execution.
- **`data_explorer_helper.js`**: Manages Data Explorer sub-tabs:
  - Sandbox & Favicon Manager (org info, custom favicons)
  - User Manager (current user, search, profile/role/language updates)
  - Record Lookup (auto-detect from URL, search by ID, recent history)
- **`lms_helper.js`**: Lightning Message Service monitoring and publishing.
- **`url_helper.js`**: URL parsing and Salesforce URL detection utilities.

---

## 🧪 Testing

We use automated tests for logic files and manual testing for UI interactions.

### Running Automated Tests
```bash
npm test
```
*Runs all tests in the `tests/` directory.*

Specific test suites:
- `npm test graphql` - Runs GraphQL builder logic tests.
- `npm test soql` - Runs SOQL builder logic tests.

### Adding New Features
1.  **Create/Update Helper**: Add logic to a specific `*_helper.js` file.
2.  **Update UI**: Add elements to `popup.html` and handlers in `popup.js` / helper files.
3.  **Add Tests**: specific logic should have unit tests in `tests/`.
4.  **Document**: Update `DOCUMENTATION/` if architecture changes.

---

## 📦 Building/Packaging

Since this is a Chrome extension, "building" mostly means ensuring all files are valid.
- Use **Zip** to package the root folder (excluding `node_modules`, `.git`, `tests`).
- `manifest.json` is the entry point.

