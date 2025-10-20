# Installation Guide

## Quick Start

Follow these steps to install and use the Salesforce Audit Trail Extractor:

### Step 1: Download the Extension

1. Download this repository as a ZIP file or clone it:
   ```bash
   git clone https://github.com/manaskumarbehera/sf-audit-extractor.git
   ```
2. If downloaded as ZIP, extract it to a folder on your computer

### Step 2: Load in Chrome

1. Open Google Chrome
2. Navigate to `chrome://extensions/`
3. Enable **Developer mode** using the toggle in the top-right corner
4. Click the **Load unpacked** button
5. Select the `sf-audit-extractor` folder (the one containing `manifest.json`)

### Step 3: Verify Installation

You should see the extension appear in your extensions list with:
- Name and version (from the manifest)
- Blue document icon
- Status showing it's enabled

### Step 4: Use the Extension

1. Log in to Salesforce in a browser tab
2. Click the extension icon in the toolbar (pin it if needed via the puzzle icon)
3. In the Audit Trails tab, click the refresh icon to fetch data (auto-fetch on first open when connected)
4. Use search and category filters; export CSV as needed
5. Explore other tabs: Platform Events, LMS, SOQL Builder, GraphQL, Current Record

## Visual Walkthrough

### Extension Icon Location
If you don't see the icon:
- Click the puzzle piece icon (Extensions)
- Find the extension
- Click the pin icon to keep it visible

### Popup Interface
When you click the icon, you'll see tabs for:
- **Audit Trails**: Status, refresh, export, search, category filter, statistics, logs
- **Platform Events**: List events, subscribe/unsubscribe, event log with controls
- **LMS**: Load channels, sample payload + copy
- **SOQL Builder**: Editor, LIMIT, Tooling, exports, schema sidebar
- **GraphQL**: Query + variables editors, results
- **Current Record**: Detect from URL, fetch by Id

## Troubleshooting

### Extension Not Loading
- Make sure Developer mode is enabled
- Check that you selected the correct folder (containing manifest.json)
- Try removing and re-adding the extension

### "Not connected" Status
- Navigate to a Salesforce page (*.salesforce.com or *.force.com)
- Ensure you're on a Salesforce tab when opening the popup

### No Audit Data Returned
- Verify you have "View Setup and Configuration" permission
- Check that your profile allows API access

### API Errors
- The extension uses REST/Tooling APIs that require API Enabled permission
- Refresh your Salesforce session (log out/in)
- Inspect the background service worker console for details

## Permissions Explained

The extension requests these permissions (as defined in `manifest.json`):
- **tabs**: To query/find a Salesforce tab for messaging
- **cookies**: To read your Salesforce session cookie (read-only) from the background
- **storage**: To persist small preferences (e.g., pin state)
- **declarativeContent**: To show the action when matching Salesforce pages
- **host_permissions**: `https://*.salesforce.com/*`, `https://*.force.com/*` for API access

## Privacy & Security

- All data processing happens locally in your browser
- No data is sent to external servers
- Session tokens are used only for API calls to Salesforce
- The extension performs read-only operations

## System Requirements

- Google Chrome 88+ (or Chromium-based browsers like Edge, Brave)
- Active internet connection
- Salesforce login credentials
- Salesforce permissions to view Setup Audit Trail

## Support

If you encounter issues:
1. Check this troubleshooting guide
2. Verify your Salesforce permissions
3. Check the browser console for errors (F12 > Console) and the service worker console
4. Open an issue on GitHub with error details

## Updates

To update the extension:
1. Download the latest version
2. Go to `chrome://extensions/`
3. Click the refresh icon on the extension card
   OR
4. Remove the old version and load the new one

## Uninstallation

To remove the extension:
1. Go to `chrome://extensions/`
2. Find the extension
3. Click "Remove"
4. Confirm the removal

All local data will be deleted automatically.
