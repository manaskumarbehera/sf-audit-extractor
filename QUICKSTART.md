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
   - Find "Salesforce Audit Trail Extractor"
   - Click the pin icon to keep it visible

✅ **Installation complete!** You should see a blue document icon in your toolbar.

## 🚀 First Use (3 minutes)

1. **Log in to Salesforce**
   - Open any Salesforce org
   - Log in with your credentials
   - Navigate to any page (Setup, Home, etc.)

2. **Open the extension**
   - Click the blue icon in your toolbar
   - Check status: Should show "Connected to Salesforce" with green dot

3. **Fetch data**
   - Click the "Fetch Data" button
   - Wait 3-10 seconds for data to load
   - See audit trail logs appear!

4. **Try features**
   - **Search**: Type in the search box (try "user", "profile", "field")
   - **Filter**: Select a category from the dropdown
   - **Export**: Click "Export CSV" to download data

🎉 **You're done!** Start exploring your audit trail data.

## 🎯 Common Tasks

### Find who changed a specific setting
1. Fetch data
2. Search for the setting name (e.g., "password policy")
3. View the results

### Export last 6 months of user changes
1. Fetch data
2. Select "User Management" category
3. Click "Export CSV"

### Review recent security changes
1. Fetch data
2. Select "Security" category
3. Browse or search results

### Track custom object modifications
1. Fetch data
2. Select "Object Changes" category
3. Search for object name

## ⚡ Pro Tips

- **Refresh data**: Click "Fetch Data" again anytime
- **Clear search**: Delete text in search box to see all results
- **Combine filters**: Use search + category together for precise results
- **Keep it open**: Popup stays open while you work
- **Multiple tabs**: Works in any Salesforce tab

## ❓ Troubleshooting

| Problem | Solution |
|---------|----------|
| "Not on Salesforce" | Navigate to a Salesforce page first |
| "Not logged in" | Log in to Salesforce and refresh |
| No data returned | Check you have "View Setup and Configuration" permission |
| API error | Verify API access is enabled for your profile |

## 📚 Learn More

- [Full README](README.md) - Complete documentation
- [Installation Guide](INSTALLATION.md) - Detailed setup steps
- [Features](FEATURES.md) - All features explained
- [Testing Guide](TESTING.md) - Comprehensive testing
- [Development](DEVELOPMENT.md) - For contributors

## 🆘 Need Help?

1. Check [INSTALLATION.md](INSTALLATION.md) for detailed troubleshooting
2. Review [TESTING.md](TESTING.md) for validation steps
3. Open an issue on GitHub with:
   - Chrome version
   - Salesforce org type
   - Error message/screenshot
   - Steps to reproduce

## 🎨 What You'll See

The extension shows:
- **Header**: Connection status
- **Buttons**: Fetch Data, Export CSV
- **Search**: Real-time filtering
- **Categories**: User Management, Security, Object Changes
- **Stats**: Counts by category
- **Logs**: Detailed audit entries with:
  - What changed
  - Who changed it
  - When it changed
  - Additional details

## ⚙️ Requirements

- ✅ Chrome 88+ (or Edge, Brave)
- ✅ Salesforce login
- ✅ "View Setup and Configuration" permission
- ✅ API access enabled

## 🔒 Security

- All processing is local (nothing sent externally)
- Uses your active Salesforce session
- Read-only operations
- No data collection

## 📖 Example Workflow

**Scenario**: Find out who created a custom field last week

1. Open Salesforce and log in
2. Click extension icon
3. Click "Fetch Data"
4. Search for "created" or "custom field"
5. Look at the dates to find last week's changes
6. Review user and details

**Time**: ~30 seconds ⚡

---

**Ready to start?** Click that blue icon and explore your audit trail! 🚀
