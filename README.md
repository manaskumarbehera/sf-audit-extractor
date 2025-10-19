# Salesforce Audit Trail Extractor

A Chrome extension that provides a one-click floating button on Salesforce pages to open an interactive audit trail dashboard. Quickly inspect, filter, search, and export Setup Audit Trail changes without navigating through Salesforce Setup.

## Features

- **Floating Action Button**: Persistent circular button on all Salesforce pages (bottom-right corner)
- **Interactive Dashboard**: Opens in a new tab with a clean, responsive interface
- **Automated Data Fetch**: Retrieves last 180 days of Setup Audit Trail records via SOQL
- **Real-time Search**: Filter records across all columns instantly
- **Smart Categories**: Automatically categorizes changes into:
  - User Management (Users, Profiles, Permissions, Roles, Login)
  - Security (Sessions, Passwords, MFA, SAML, SSO, Certificates)
  - Object/Field (Fields, Objects, Validations, Flows, Triggers, Layouts)
  - Email (Email settings, Templates, Letterheads)
  - Other (Everything else)
- **CSV Export**: Download filtered audit records with one click
- **Pagination Support**: Handles large datasets automatically

## Installation

### From Source (Developer Mode)

1. Clone this repository:
   ```bash
   git clone https://github.com/manaskumarbehera/sf-audit-extractor.git
   cd sf-audit-extractor
   ```

2. Open Chrome and navigate to `chrome://extensions/`

3. Enable "Developer mode" (toggle in top-right corner)

4. Click "Load unpacked" and select the repository folder

5. The extension icon should appear in your Chrome toolbar

## Usage

1. **Navigate to any Salesforce page** (works on `*.salesforce.com`, `*.lightning.force.com`, `*.my.salesforce.com`)

2. **Look for the floating blue button** with an audit icon in the bottom-right corner

3. **Click the button** to open the Audit Trail Dashboard in a new tab

4. **Wait for data to load** - the dashboard will automatically fetch audit records from your Salesforce org

5. **Use the search bar** to filter records across all columns

6. **Click category chips** to filter by specific categories (User Management, Security, etc.)

7. **Click "Export CSV"** to download the currently filtered view

## Technical Details

### Architecture

- **Manifest V3**: Modern Chrome extension format
- **Content Script**: Injects the floating button on Salesforce pages
- **Dashboard**: Standalone HTML page with vanilla JavaScript
- **SOQL Execution**: Runs queries in the Salesforce page context to reuse session authentication

### Files Structure

```
sf-audit-extractor/
├── manifest.json           # Extension configuration
├── content.js              # Floating button injection
├── content.css             # Floating button styles
├── dashboard.html          # Dashboard UI
├── dashboard.js            # Dashboard logic and SOQL execution
├── dashboard.css           # Dashboard styles
├── service_worker.js       # Background service worker
├── icons/                  # Extension icons
│   ├── icon16.png
│   ├── icon48.png
│   └── icon128.png
└── README.md
```

### SOQL Query

The extension executes the following query:

```sql
SELECT Action, CreatedBy.Name, CreatedDate, Section, Display, DelegateUser
FROM SetupAuditTrail
WHERE CreatedDate = LAST_180_DAYS
ORDER BY CreatedDate DESC
```

**API Version**: Currently uses Salesforce REST API v59.0. To update to a newer version, modify the `apiVersion` constant in `dashboard.js`.

### Security Considerations

- **Session Access**: The extension uses Chrome's `scripting` API with `MAIN` world injection to access Salesforce session cookies. This is necessary for authenticating REST API calls but is restricted to validated Salesforce domains only.
- **URL Validation**: All API requests are validated to ensure they originate from the same Salesforce instance domain.
- **No Data Storage**: The extension does not store any Salesforce data persistently; all data is processed in-memory during the session.
- **Minimal Permissions**: Only requests permissions necessary for core functionality.

### Browser Compatibility

- **Chrome**: Fully supported (Manifest V3)
- **Edge**: Should work (Chromium-based, supports Manifest V3)
- **Firefox**: Not supported (requires Manifest V2 modifications)

## Requirements

- Chrome browser (version 88+)
- Active Salesforce session (logged in)
- Salesforce org with SetupAuditTrail object access

## Permissions

The extension requires the following permissions:

- `activeTab`: To interact with the current Salesforce tab
- `scripting`: To execute SOQL queries in the Salesforce context
- `tabs`: To open the dashboard in a new tab
- Host permissions for Salesforce domains

## Troubleshooting

### No data appears in dashboard
- Ensure you're logged into Salesforce
- Verify you have access to Setup Audit Trail in your org
- Check that audit records exist for the last 180 days

### Floating button doesn't appear
- Verify you're on a valid Salesforce domain
- Refresh the page
- Check the browser console for errors

### Export doesn't work
- Ensure you have filtered records displayed
- Check popup blockers (some browsers may block downloads)

## Development

### Building and Testing

This is a vanilla JavaScript extension with no build step required. Simply load the unpacked extension in Chrome developer mode.

### Adding Features

- **Content Script** (`content.js`): Modify to change floating button behavior
- **Dashboard Logic** (`dashboard.js`): Update to add new filters or data processing
- **Styles** (`dashboard.css`): Customize the look and feel

## License

MIT License - See LICENSE file for details

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## Support

For issues or questions, please open an issue on GitHub.
