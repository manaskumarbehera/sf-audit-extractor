# Quick Start Guide

Get up and running with the Salesforce Audit Trail Extractor in under 5 minutes!

## Installation (2 minutes)

1. **Download or clone this repository**
   ```bash
   git clone https://github.com/manaskumarbehera/sf-audit-extractor.git
   ```

2. **Open Chrome Extensions page**
   - Navigate to `chrome://extensions/`
   - Or click the puzzle icon → "Manage Extensions"

3. **Enable Developer Mode**
   - Toggle the "Developer mode" switch in the top-right corner

4. **Load the extension**
   - Click "Load unpacked"
   - Select the `sf-audit-extractor` folder
   - The extension should now appear in your list

## Usage (30 seconds)

1. **Go to any Salesforce page**
   - Open your Salesforce org (sandbox or production)
   - Navigate to any page (home, object list, record detail, etc.)

2. **Click the blue floating button**
   - Look in the bottom-right corner
   - Click the circular button with the audit icon

3. **Wait for data to load**
   - The dashboard opens in a new tab
   - Audit records load automatically (5-30 seconds)

4. **Explore your audit trail!**
   - Use the search bar to find specific records
   - Click category chips to filter
   - Click "Export CSV" to download

## Quick Tips

- **No data showing?** 
  - Make sure you're logged into Salesforce
  - Check that your user has access to Setup Audit Trail
  - Verify audit records exist for the last 180 days

- **Button not appearing?**
  - Refresh the Salesforce page
  - Check you're on a `*.salesforce.com` domain
  - Look in the console for errors (F12)

- **Search not working?**
  - Clear any active category filters first
  - Try searching for partial text
  - Check spelling (search is case-insensitive)

- **CSV export empty?**
  - Make sure you have filtered records displayed
  - Try selecting "All" category first

## What's Next?

- Read the full [README.md](README.md) for detailed documentation
- Check [test-guide.md](test-guide.md) for comprehensive testing procedures
- Review [IMPLEMENTATION_SUMMARY.md](IMPLEMENTATION_SUMMARY.md) for technical details

## Support

Having issues? Check:
1. Chrome DevTools Console (F12) for error messages
2. Extension is enabled at `chrome://extensions/`
3. You're on a valid Salesforce domain
4. You have the necessary Salesforce permissions

## Requirements

- ✅ Chrome 88+ (or Edge 88+)
- ✅ Active Salesforce session
- ✅ Permission to view Setup Audit Trail

That's it! You're ready to explore your Salesforce audit trail. 🎉
