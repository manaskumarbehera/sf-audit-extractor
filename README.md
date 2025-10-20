# Salesforce Audit Trail Extractor

A Chrome extension that extracts and analyzes Salesforce Setup Audit Trail data directly from your browser.

![Extension UI](screenshots/mockup-ui.png)

## Features

- **Quick Access**: Extract audit trail data directly from a toolbar popup without opening Salesforce Setup
- **6 Month History**: Automatically fetches the last 6 months of audit trail changes
- **Smart Categorization**: Groups logs by category:
  - User Management (users, profiles, permissions, roles)
  - Security (passwords, login settings, certificates)
  - Object Changes (custom objects, fields, workflows, triggers)
- **Fast Search**: Quickly search through audit logs by action, section, user, or details
- **Category Filtering**: Filter logs by specific categories
- **CSV Export**: Export filtered data to CSV for further analysis
- **Simple UI**: Clean, intuitive interface with real-time statistics
- **No OAuth Required**: Uses your active Salesforce session
- **Platform Events Viewer**: Discover Platform Events and subscribe/unsubscribe with a built-in CometD client, structured event log, pause/clear, filter and auto-scroll controls, plus a pin-able window
- **Lightning Message Service (LMS)**: Browse LMS channels and auto-generate a sample payload you can copy
- **SOQL Builder**: Run SOQL (with Tooling toggle), set LIMIT, and export results to CSV/JSON/Excel; schema sidebar and basic suggestions
- **GraphQL Runner**: Execute GraphQL queries (e.g., UI API) and view results
- **Current Record Utility**: Detect record Id from the current tab URL and fetch details

## Quick Start

**New users**: See the [Quick Start Guide](QUICKSTART.md) for a 5-minute setup!

## Installation

1. Download or clone this repository
2. Open Chrome and navigate to `chrome://extensions/`
3. Enable "Developer mode" (toggle in top right)
4. Click "Load unpacked"
5. Select the `sf-audit-extractor` directory

For detailed instructions, see [INSTALLATION.md](INSTALLATION.md)

## Usage

- Audit Trails tab:
  1. Log in to any Salesforce org and open the extension
  2. Use the refresh icon to fetch audit trail logs (auto-fetch on first open when connected)
  3. Search and filter by category; export CSV if needed
- Platform Events tab:
  - Click refresh to list events, then Subscribe/Unsubscribe per event; watch the structured event log; use pause/clear/filter/auto-scroll; optionally pin this view into a separate window
- LMS tab:
  - Refresh to load channels; select one to see a generated sample payload you can copy
- SOQL Builder tab:
  - Enter a query and Run (Cmd/Ctrl+Enter); set LIMIT; toggle Tooling; export results to CSV/JSON/Excel
- GraphQL tab:
  - Paste a GraphQL query (and optional variables) and Run to view results
- Current Record tab:
  - Detect record Id from the current Salesforce URL or paste an Id, then fetch details

## How It Works

The extension:
1. Detects when you're on a Salesforce page and reads your active session (via cookies) in the background
2. Uses Salesforce REST API for queries and Tooling API where required (e.g., LMS metadata)
3. Provides specialized tools for audit trails, Platform Events (CometD), SOQL, GraphQL, and record utilities
4. Processes and displays results in a clean, multi-tab interface

## Technical Details

- **Manifest Version**: 3
- **APIs Used**:
  - Salesforce REST API v65.0 for general queries
  - Salesforce Tooling API v65.0 for LMS metadata and Tooling queries
  - Bayeux/CometD protocol for Platform Events streaming
- **Permissions**: tabs, cookies, storage, declarativeContent
- **Host Permissions**: `https://*.salesforce.com/*`, `https://*.force.com/*`

## Files Structure

```
sf-audit-extractor/
├── manifest.json       # Extension configuration
├── popup.html          # Main UI (multi-tab)
├── popup.css           # Styles
├── popup.js            # Main logic (Audit Trails, Platform Events, LMS, SOQL, GraphQL, Record)
├── content.js          # Content script for signaling & session info bridge
├── background.js       # Service worker (API access, session cookies, pin window)
├── icons/              # Extension icons
│   ├── icon16.png
│   ├── icon32.png
│   ├── icon48.png
│   └── icon128.png
└── README.md
```

## Security

- No data is stored or transmitted to external servers
- Uses read-only API calls to Salesforce
- Session tokens are only used within the browser context
- All processing happens locally in your browser

## Requirements

- Google Chrome (or Chromium-based browser)
- Active Salesforce session
- Appropriate permissions to view Setup Audit Trail in Salesforce
- API access enabled (for REST/Tooling queries)

## Troubleshooting

- "Not on Salesforce" error: Make sure you're on a Salesforce page before using the extension.
- "Not logged in" error: Ensure you're logged into your Salesforce org.
- No data returned: Check that you have permission to view Setup Audit Trail in Salesforce.
- API errors: Ensure API access is enabled on your profile; check the background/service worker console.

## License

MIT License - See LICENSE file for details

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.
