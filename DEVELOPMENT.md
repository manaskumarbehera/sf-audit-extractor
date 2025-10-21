# Development Guide

This guide is for developers who want to understand, modify, or contribute to the Salesforce Audit Trail Extractor.

## Architecture

Chrome Extension Manifest V3 with three main components:

### 1. Content Script (`content.js`)
- Runs on Salesforce pages
- Signals readiness and helps bridge messages
- Delegates session retrieval to the background (reads cookies)
- Does NOT modify page content

### 2. Background Service Worker (`background.js`)
- Detects Salesforce tabs and manages extension action visibility
- Reads Salesforce session cookies (read-only)
- Performs REST/Tooling API calls that require cookies/host permissions
- Manages Platform Events pinned window lifecycle

### 3. Popup UI (`popup.html`, `popup.js`, `popup.css`)
- Multi-tab UI: Audit Trails, Platform Events, LMS, SOQL Builder, GraphQL, Current Record
- Handles user interactions (search, filter, export, subscribe, run queries)
- Implements a lightweight CometD client for Platform Events
- Renders results with sorting/filters and export options

## Key Features Implementation

### Session Detection
- Content script notifies the background when a Salesforce page is ready
- Background validates the URL and reads the `sid` cookie for the instance origin
- Popup requests session info via message passing

### Audit Trail Data Fetching
Uses Salesforce REST API:
```http
GET /services/data/v65.0/query?q=SELECT+Id,Action,Section,CreatedDate,CreatedById,CreatedBy.Name+FROM+SetupAuditTrail+WHERE+CreatedDate=LAST_N_DAYS:180+ORDER+BY+CreatedDate+DESC
```
- Pagination handled via `nextRecordsUrl`
- Client-side filtering and categorization in the popup

### Platform Events (Streaming)
- Lightweight Bayeux/CometD client implemented in `popup.js`
- Subscribe/Unsubscribe per `/event/<ApiName>` channel
- Structured log with types (system/subscribe/event/error), pause/clear/filter controls, auto-scroll
- Pin button opens a dedicated popup window (managed by background)

### Lightning Message Service (LMS)
- Channels loaded via Tooling API in the background
- Per-channel metadata fetched to generate a sample payload (copyable)
- No publishing (read-only utility)

### SOQL Builder
- Editor with overlay highlight and basic suggestions
- LIMIT control and Tooling API toggle
- Results grid with export to CSV/JSON/Excel

### GraphQL Runner
- Simple query and variables editors
- Executes GraphQL endpoint (e.g., UI API) and renders results

### Current Record Utility
- Detects a record Id from the active Salesforce tab URL
- Fetches and displays record details

# Development Guide

This guide is for developers who want to contribute to or modify the Salesforce Audit Trail Extractor extension.

## Quick Start for Developers

1. Clone the repository
2. Run `npm run validate` to check for syntax errors
3. Make your changes
4. Test using the steps in [TESTING.md](TESTING.md)
5. Submit a pull request

## JavaScript Syntax Validation

Before committing changes, always run:

```bash
npm run validate
```

This validates all JavaScript files for syntax errors and helps catch common issues like:
- Unmatched parentheses, braces, or brackets
- Incorrect IIFE patterns
- Missing semicolons or commas
- Other parse errors

If you encounter syntax errors, see [TROUBLESHOOTING_JS_ERRORS.md](TROUBLESHOOTING_JS_ERRORS.md) for help.

## Project Structure

```
sf-audit-extractor/
├── manifest.json           # MV3 config and permissions
├── popup.html              # Multi-tab UI
├── popup.css               # Styling
├── popup.js                # App logic (Audit, PE, LMS, SOQL, GraphQL, Record)
├── content.js              # Signals readiness, session bridge
├── background.js           # Session, REST/Tooling calls, pin window
├── icons/                  # Icons
└── README.md
```

## Making Changes

### UI/Behavior
- `popup.html` - Structure and tabs
- `popup.css` - Styling and layout
- `popup.js` - Handlers, CometD, API calls from UI

After changes:
1. Go to `chrome://extensions/`
2. Click the refresh icon on the extension (service worker) and reload the popup

### Data/API
- `background.js` for REST/Tooling calls (e.g., LMS metadata, session reading)
- `popup.js` for UI-initiated fetches (Audit Trails, SOQL/GraphQL execution)

### Adding New Tabs/Tools
1. Add a tab button and pane in `popup.html`
2. Implement handlers in `popup.js`
3. Style components in `popup.css`
4. Adjust permissions/host permissions in `manifest.json` only if needed

## Debugging

- Popup: Right-click popup → Inspect → Console
- Background: `chrome://extensions/` → Details → Service worker console
- Content: Open a Salesforce page → F12 → Console
- Network calls: Inspect fetch requests (popup or service worker)
- Platform Events: Watch CometD status indicator and structured log

## Testing

Manual scenarios: see `TESTING.md` (Audit Trails + new tabs). Focus on:
- Session detection across Classic/Lightning/My Domain
- REST/Tooling API calls and pagination
- Platform Events subscribe/unsubscribe and log controls
- LMS channels metadata and sample payload generation
- SOQL/GraphQL queries and exports

## API Reference

### REST API (v65.0)
- Query endpoint: `/services/data/v65.0/query`
- Used for SetupAuditTrail and general SOQL

### Tooling API (v65.0)
- Query endpoint: `/services/data/v65.0/tooling/query`
- SObject endpoint: `/services/data/v65.0/tooling/sobjects/LightningMessageChannel/{Id}`
- Used for LMS channel metadata and Tooling queries

### Streaming
- Bayeux/CometD protocol over `/cometd/v65.0`
- Client implemented in `popup.js`

## Chrome Extension APIs Used
- `chrome.tabs` - Query Salesforce tabs and send messages
- `chrome.runtime` - Message passing
- `chrome.action` - Badge and popup behavior
- `chrome.cookies` - Read Salesforce session cookie
- `chrome.declarativeContent` - Show action on Salesforce pages
- `chrome.windows` - Open/close pinned Platform Events window
- `chrome.storage` - Persist pin state

## Security Considerations

- Minimal permissions: tabs, cookies, storage, declarativeContent, host_permissions
- All processing is local; no external servers
- Never log sensitive values (e.g., sessionId)
- Validate URLs and handle errors gracefully

## Contributing

- ES6+ JavaScript, keep code readable and commented
- Follow existing style conventions
- Add tests where practical; include repro steps/screens for UI changes

## Future Enhancements
- Date range picker for Audit Trails
- Advanced filters and saved searches
- Dark mode
- Additional exports and visualizations

## Resources
- Chrome Extensions: https://developer.chrome.com/docs/extensions/
- Salesforce APIs: https://developer.salesforce.com/docs/apis
- Tooling API: https://developer.salesforce.com/docs/atlas.en-us.api_tooling.meta/api_tooling/
