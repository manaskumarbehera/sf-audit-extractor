# Development Guide

This guide is for developers who want to understand, modify, or contribute to the Salesforce Audit Trail Extractor.

## Architecture

The extension follows Chrome Extension Manifest V3 architecture with three main components:

### 1. Content Script (`content.js`)
- Runs in the context of Salesforce pages
- Extracts session information from the active page
- Communicates session data to the popup and background script
- Does NOT modify page content

### 2. Background Service Worker (`background.js`)
- Handles API requests to Salesforce
- Manages long-lived connections and data fetching
- Acts as a bridge between the popup and Salesforce APIs
- Uses the Tooling API to query SetupAuditTrail records

### 3. Popup UI (`popup.html`, `popup.js`, `popup.css`)
- Main user interface displayed when clicking the extension icon
- Handles user interactions (search, filter, export)
- Processes and displays audit trail data
- Implements local filtering and categorization

## Key Features Implementation

### Session Detection
The content script attempts to extract the Salesforce session ID through:
1. Global JavaScript variables (`window.__sfdcSessionId`)
2. Embedded script content parsing
3. Meta tags

### Data Fetching
Uses Salesforce Tooling API:
```javascript
GET /services/data/v58.0/tooling/query?q=SELECT Id, Action, Section, CreatedDate, CreatedBy.Name, Display, DelegateUser FROM SetupAuditTrail WHERE CreatedDate >= {6_months_ago}
```

### Categorization Logic
Logs are categorized based on Section and Action fields:
- **User Management**: User, Profile, Permission, Role, Group
- **Security**: Security, Password, Login, Authentication, Certificate, Session
- **Object Changes**: Object, Field, Custom, Layout, Validation, Workflow, Trigger, Apex

### Search & Filter
- Real-time client-side filtering
- Searches across action, section, user, and display fields
- Category filter works independently or combined with search

### CSV Export
- Converts filtered data to CSV format
- Properly escapes quotes and special characters
- Downloads directly in the browser

## Project Structure

```
sf-audit-extractor/
├── manifest.json           # Extension configuration and permissions
├── popup.html              # Main UI structure
├── popup.css              # Styling for the popup
├── popup.js               # Main application logic
├── content.js             # Content script for session extraction
├── background.js          # Service worker for API calls
├── icons/                 # Extension icons
│   ├── icon16.png         # 16x16 toolbar icon
│   ├── icon32.png         # 32x32 icon
│   ├── icon48.png         # 48x48 extension management icon
│   └── icon128.png        # 128x128 Chrome Web Store icon
├── README.md              # User documentation
├── INSTALLATION.md        # Installation instructions
├── DEVELOPMENT.md         # This file
├── LICENSE                # MIT License
└── .gitignore            # Git ignore patterns
```

## Making Changes

### Modifying the UI
Edit these files:
- `popup.html` - Structure
- `popup.css` - Styling
- `popup.js` - Behavior and interactions

After changes:
1. Go to `chrome://extensions/`
2. Click the refresh icon on the extension

### Changing API Queries
Edit `background.js`:
- Modify the SOQL query in `fetchAuditTrailData()`
- Update field mappings in `popup.js` `processAuditData()`

### Adding New Categories
Edit `popup.js`:
1. Update `categorizeAction()` function
2. Add patterns to the appropriate array
3. Update the category filter dropdown in `popup.html`
4. Add corresponding CSS classes in `popup.css`

### Updating Icons
Replace PNG files in the `icons/` directory. Ensure:
- Sizes: 16x16, 32x32, 48x48, 128x128 pixels
- Format: PNG with transparency
- Update `manifest.json` if changing paths

## Debugging

### Console Logs
- **Popup Console**: Right-click popup → Inspect → Console
- **Background Script**: `chrome://extensions/` → Details → Inspect views: service worker
- **Content Script**: Open any Salesforce page → F12 → Console

### Common Issues

**Session not detected**:
- Check content script console for errors
- Verify the page has fully loaded
- Check if Salesforce has changed their page structure

**API errors**:
- Verify the Tooling API endpoint is correct
- Check if the user has API access
- Ensure the session token is valid

**No data returned**:
- Check the SOQL query syntax
- Verify field names haven't changed in newer Salesforce versions
- Check API version compatibility

## Testing

### Manual Testing Checklist
- [ ] Extension loads without errors
- [ ] Icon appears in toolbar
- [ ] Status shows "Not on Salesforce" when not on SF page
- [ ] Status updates when navigating to Salesforce
- [ ] Fetch button works and retrieves data
- [ ] Search filters results correctly
- [ ] Category filter works
- [ ] Combined search + category filter works
- [ ] Statistics update correctly
- [ ] CSV export downloads properly
- [ ] CSV contains correct data
- [ ] UI is responsive and user-friendly

### Test with Different Salesforce Orgs
- Developer Edition
- Production
- Sandbox
- My Domain enabled/disabled

## API Reference

### Salesforce Tooling API
Documentation: https://developer.salesforce.com/docs/atlas.en-us.api_tooling.meta/api_tooling/

**SetupAuditTrail Object**:
- `Id`: Unique identifier
- `Action`: What was done
- `Section`: Where it was done
- `CreatedDate`: When
- `CreatedBy`: User who made the change
- `Display`: Additional details
- `DelegateUser`: User on whose behalf action was taken

### Chrome Extension APIs Used
- `chrome.tabs` - Query and message active tabs
- `chrome.runtime` - Message passing between components
- `chrome.action` - Set extension icon and popup

## Security Considerations

### Permissions
The extension requests minimal permissions:
- `activeTab`: Only access to the current tab when popup is opened
- `cookies`: Read Salesforce session cookies
- `storage`: For future features (optional)

### Data Handling
- All data processing is client-side
- No external servers or analytics
- Session tokens never leave the browser
- API calls go directly to Salesforce

### Best Practices
- Never log sensitive data
- Don't store session tokens permanently
- Use HTTPS for all API calls
- Validate and sanitize all user inputs

## Contributing

### Code Style
- Use ES6+ JavaScript features
- Follow existing formatting patterns
- Comment complex logic
- Use meaningful variable names

### Pull Requests
1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a PR with:
   - Clear description of changes
   - Screenshots for UI changes
   - Testing notes

### Reporting Issues
Include:
- Chrome version
- Salesforce edition
- Steps to reproduce
- Console errors
- Screenshots if relevant

## Future Enhancements

Potential features to add:
- [ ] Date range picker
- [ ] More granular category filtering
- [ ] Export to JSON/Excel
- [ ] Saved search filters
- [ ] Dark mode
- [ ] Real-time updates
- [ ] Integration with Salesforce CLI
- [ ] Bulk operations analysis
- [ ] Trend visualization

## Resources

- [Chrome Extension Documentation](https://developer.chrome.com/docs/extensions/)
- [Salesforce API Reference](https://developer.salesforce.com/docs/apis)
- [Manifest V3 Migration Guide](https://developer.chrome.com/docs/extensions/mv3/intro/)

## License

MIT License - See LICENSE file for details.
