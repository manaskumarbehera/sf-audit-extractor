# Quick Start Guide

Get up and running with the Salesforce Audit Trail Extractor in 5 minutes!

## 📦 Installation (2 minutes)

1. **Download the extension**
   ```bash
   git clone https://github.com/manaskumarbehera/sf-audit-extractor.git
   ```
   Or download as ZIP and extract

2. **Load in Chrome**
   - Open Chrome and go to `chrome://extensions/`
   - Toggle ON "Developer mode" (top right)
   - Click "Load unpacked"
   - Select the `sf-audit-extractor` folder

3. **Pin the extension**
   - Click the puzzle icon in Chrome toolbar
   - Find the extension
   - Click the pin icon to keep it visible

✅ Installation complete! You should see a blue document icon in your toolbar.

## 🚀 First Use (3 minutes)

1. **Log in to Salesforce**
   - Open any Salesforce org and log in

2. **Open the extension**
   - Click the blue icon in your toolbar
   - Status should change to "Connected to Salesforce" with a green dot when a Salesforce tab is available

3. **Fetch audit data**
   - Click the refresh icon in the Audit Trails tab
   - Wait a few seconds for data to load
   - See audit logs appear with stats

4. **Try core features**
   - **Search**: Type in the search box (e.g., "user", "profile", "field")
   - **Filter**: Select a category from the dropdown
   - **Export**: Click the download icon to export CSV

🎉 You're done! Start exploring your audit trail data.

## 🎛 Explore More Tools

- **Platform Events**: Refresh to discover events, then Subscribe/Unsubscribe; watch the structured event log; use pause/clear/filter/auto-scroll; pin the window if you like
- **LMS**: Refresh channels, choose one to see an auto-generated sample payload you can copy
- **SOQL Builder**: Write SOQL and Run (Cmd/Ctrl+Enter), set LIMIT, toggle Tooling, export results to CSV/JSON/Excel
- **GraphQL**: Paste a GraphQL query (and optional variables) and Run to view results
- **Current Record**: Detect the record Id from the current URL or paste one, then fetch details

## 🎯 Common Tasks

### Find who changed a specific setting
1. Fetch data in Audit Trails
2. Search for the setting name (e.g., "password policy")
3. Review results

### Export last 6 months of user changes
1. Fetch data in Audit Trails
2. Select "User Management" category
3. Export CSV

### Review recent security changes
1. Fetch data in Audit Trails
2. Select "Security" category
3. Browse or search results

### Track custom object modifications
1. Fetch data in Audit Trails
2. Select "Object Changes" category
3. Search for the object name

## ⚡ Pro Tips

- Click the refresh icon anytime to reload
- Clear the search box to see all results
- Combine search + category filters
- Use the pin button to pop out the Platform Events window
- Works across Salesforce tabs in the same browser profile

## ❓ Troubleshooting

| Problem | Solution |
|---------|----------|
| "Not connected" | Open a Salesforce tab and log in |
| No data returned | Verify "View Setup and Configuration" permission |
| API error | Ensure API access is enabled for your profile |

## 📚 Learn More

- [Full README](README.md) - Complete documentation
- [Installation Guide](INSTALLATION.md) - Detailed setup steps
- [Features](FEATURES.md) - All features explained
- [Testing Guide](TESTING.md) - Comprehensive testing
- [Development](DEVELOPMENT.md) - For contributors

## ⚙️ Requirements

- Chrome 88+ (or Edge, Brave)
- Salesforce login
- "View Setup and Configuration" permission
- API access enabled

## 🔐 Security

- All processing is local (no external servers)
- Uses your active Salesforce session
- Read-only operations
- No data collection

---

Ready to start? Click the blue icon and explore your data 🚀
