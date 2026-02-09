# Testing Strategy

## Overview
Quality assurance for TrackForcePro involves a mix of **Automated Unit Tests** and **Manual UI Testing**. Given the nature of Chrome Extensions (interacting with browser APIs and external DOM), a significant portion of testing is manual or integration-based.

## 🤖 Automated Testing

We use **Jest** for unit testing pure JavaScript logic.

### Scope
- **Query Generation Logic**: Ensuring `graphql_helper.js` and `soql_helper.js` produce valid query strings from state objects.
- **Parsing Logic**: Ensuring response parsing works correctly.
- **Utilities**: Testing `url_helper.js` and `utils.js`.
- **Data Explorer**: Testing favicon storage, user search, record ID extraction, and session handling.

### Running Tests
Execute the test suite via npm:
```bash
npm test
```

### Key Test Files
- `tests/graphql_builder.test.js`: Verifies that UI selections (fields, filters) convert to correct GraphQL syntax.
- `tests/soql_builder.test.js`: Verifies SOQL generation.
- `tests/url_helper.test.js`: Verifies Salesforce URL parsing.
- `tests/data_explorer.test.js`: Comprehensive tests for Data Explorer features:
  - Favicon storage (multi-org, CRUD operations)
  - Organization ID validation (15/18 character)
  - Salesforce URL detection
  - Record ID extraction from URLs
  - User search query building
  - Session state handling
  - Extension page filtering
  - Edit mode behavior

---

## 🖐️ Manual Testing (UI)

Since the extension relies heavily on the Salesforce UI context (e.g., authentication cookies, DOM structure of Setup pages), manual testing is required.

### Testing Environments
- **Dev Org**: Always test in a Salesforce Developer Edition org first.
- **Production**: Verify read-only operations (Audit/Query) in Production only after Dev verification.

### Core Manual Test Cases
1.  **Installation**: Load unpacked extension, verify icon appears.
2.  **Authentication**: Ensure extension picks up session from active Salesforce tab.
3.  **Audit Flow**: Go to Object Manager > Account > Fields. Click "Audit". Verify CSV download.
4.  **GraphQL Flow**:
    - Open Extension > GraphQL Tab.
    - Select "Account".
    - Check "Name".
    - Run Query.
    - Verify results.
5.  **SOQL Flow**: Similar to GraphQL.
6.  **Data Explorer - Favicon Manager**:
    - Open Extension > Explore > Sandbox Manager.
    - Verify org info displays correctly.
    - Select a color and enter a label.
    - Click "Apply Favicon" - verify browser tab icon changes.
    - Refresh page - verify favicon persists.
    - Navigate to different org - verify different favicon can be set.
    - Return to first org - verify edit mode loads existing settings.
7.  **Data Explorer - User Manager**:
    - Verify current user displays correctly.
    - Search for a user by name/email.
    - Select a user and verify form enables.
8.  **Data Explorer - Record Tools**:
    - Navigate to a record page (e.g., Account).
    - Open Record Lookup tab - verify auto-detection, search, and history.
    - Copy a Record ID and use Record Search - verify lookup works.

*For a detailed step-by-step walkthrough, see [Testing Walkthrough](TESTING_WALKTHROUGH.md).*

---

## 🐛 Bug Reporting

When reporting bugs, include:
1.  **Console Logs**: Right-click popup > Inspect to see console errors.
2.  **Salesforce Page**: Which page were you on? (e.g., Lightning App Page, Setup, Classic).
3.  **Browser Version**: Chrome version.
4.  **Extension Version**: Check manifest.json for version number.

