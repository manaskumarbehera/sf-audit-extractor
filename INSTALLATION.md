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

You should see the Salesforce Audit Trail Extractor appear in your extensions list with:
- Extension name and version
- Blue document icon
- Status showing it's enabled

### Step 4: Use the Extension

1. **Log in to Salesforce**: Open any Salesforce org in Chrome and log in
2. **Click the extension icon**: Find the extension icon in your Chrome toolbar (you may need to click the puzzle icon to pin it)
3. **Fetch data**: Click the "Fetch Data" button
4. **Wait for data**: The extension will retrieve the last 6 months of audit trail data
5. **Explore and filter**: Use the search box and category filter to find specific entries
6. **Export if needed**: Click "Export CSV" to download the data

## Visual Walkthrough

### Extension Icon Location
The extension icon appears in your Chrome toolbar. If you don't see it:
- Click the puzzle piece icon (Extensions)
- Find "Salesforce Audit Trail Extractor"
- Click the pin icon to keep it visible

### Popup Interface
When you click the icon, you'll see:
- **Status indicator**: Shows if you're connected to Salesforce
- **Fetch Data button**: Retrieves audit trail data
- **Export CSV button**: Downloads filtered data (enabled after fetching)
- **Search box**: Filter by keywords
- **Category dropdown**: Filter by category
- **Statistics panel**: Shows counts by category
- **Logs list**: Displays all matching audit entries

## Troubleshooting

### Extension Not Loading
- Make sure Developer mode is enabled
- Check that you selected the correct folder (containing manifest.json)
- Try removing and re-adding the extension

### "Not on Salesforce" Error
- Navigate to a Salesforce page (*.salesforce.com or *.force.com)
- Make sure you're on an actual Salesforce tab when clicking the icon

### "Not logged in" Error
- Log in to your Salesforce org first
- Refresh the page after logging in
- Try closing and reopening the popup

### No Data Returned
- Verify you have "View Setup and Configuration" permission
- Check that your profile allows API access
- Some orgs may have API restrictions

### API Errors
- The extension uses the Tooling API which requires API Enabled permission
- Contact your Salesforce administrator if you don't have access
- Try refreshing your Salesforce session by logging out and back in

## Permissions Explained

The extension requests these permissions:
- **activeTab**: To detect when you're on a Salesforce page
- **cookies**: To access your Salesforce session (read-only)
- **storage**: To cache preferences (optional, not currently used)
- **host_permissions**: To communicate with Salesforce APIs

## Privacy & Security

- All data processing happens locally in your browser
- No data is sent to external servers
- Session tokens are used only for API calls to Salesforce
- The extension only reads data; it doesn't modify anything
- All API calls are made directly to your Salesforce instance

## System Requirements

- Google Chrome 88+ (or Chromium-based browsers like Edge, Brave)
- Active internet connection
- Salesforce login credentials
- Salesforce permissions to view Setup Audit Trail

## Support

If you encounter issues:
1. Check this troubleshooting guide
2. Verify your Salesforce permissions
3. Check the browser console for errors (F12 > Console)
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
2. Find "Salesforce Audit Trail Extractor"
3. Click "Remove"
4. Confirm the removal

All local data will be deleted automatically.
