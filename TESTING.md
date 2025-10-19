# Testing Guide

This guide helps you test the Salesforce Audit Trail Extractor extension to ensure it's working correctly.

## Pre-Testing Checklist

Before testing, ensure:
- [ ] Chrome (v88+) is installed
- [ ] Extension is loaded in Chrome
- [ ] You have a Salesforce org with login credentials
- [ ] Your user has "View Setup and Configuration" permission
- [ ] API access is enabled for your profile

## Installation Testing

### Test 1: Extension Loads Successfully
1. Go to `chrome://extensions/`
2. Verify the extension appears in the list
3. Check that:
   - Extension name is "Salesforce Audit Trail Extractor"
   - Version is "1.0.0"
   - Status shows "Enabled"
   - Icon is displayed

**Expected Result**: Extension is visible and enabled without errors.

### Test 2: Extension Icon Appears
1. Look at Chrome toolbar
2. Click the puzzle icon if you don't see the extension icon
3. Pin the extension

**Expected Result**: Blue document icon appears in toolbar.

## Connection Testing

### Test 3: Not on Salesforce
1. Navigate to a non-Salesforce page (e.g., google.com)
2. Click the extension icon

**Expected Result**: 
- Status shows red dot
- Message: "Not on Salesforce"
- Error message in main area

### Test 4: On Salesforce Without Login
1. Navigate to Salesforce login page
2. DO NOT log in
3. Click the extension icon

**Expected Result**:
- Status shows red dot
- Message may show "Not logged in"

### Test 5: On Salesforce With Login
1. Log in to Salesforce
2. Navigate to any Salesforce page
3. Click the extension icon

**Expected Result**:
- Status shows green dot
- Message: "Connected to Salesforce"
- Fetch Data button is enabled

## Data Fetching Testing

### Test 6: Fetch Audit Trail Data
1. Ensure you're logged in to Salesforce
2. Click "Fetch Data" button
3. Wait for data to load

**Expected Result**:
- Button shows "Fetching..." with hourglass icon
- Loading spinner appears
- After a few seconds, data appears
- Statistics panel shows counts
- Log entries are displayed

### Test 7: No Data Available
1. Test with a brand new Developer Edition org
2. Click "Fetch Data"

**Expected Result**:
- Message: "No audit trail records found for the last 6 months"
- Or minimal data displayed

### Test 8: API Permission Error
1. Use an account without API access
2. Click "Fetch Data"

**Expected Result**:
- Error message displayed
- Indicates permission or API access issue

## Search & Filter Testing

### Test 9: Search Functionality
1. Fetch data successfully
2. Type "user" in search box
3. Observe filtered results

**Expected Result**:
- Results update in real-time
- Only logs matching "user" are shown
- Count updates correctly

### Test 10: Search Clear
1. With search applied, clear the search box
2. Observe results

**Expected Result**:
- All logs are shown again
- Count returns to total

### Test 11: Category Filter
1. Fetch data successfully
2. Select "User Management" from dropdown

**Expected Result**:
- Only User Management logs are shown
- Count updates
- Other categories are hidden

### Test 12: Combined Search and Filter
1. Enter search term (e.g., "profile")
2. Select category (e.g., "User Management")

**Expected Result**:
- Both filters apply
- Only logs matching both criteria are shown

### Test 13: No Results
1. Search for something unlikely (e.g., "zzzzzzzzz")

**Expected Result**:
- Message: "No logs match your search criteria"

## Statistics Testing

### Test 14: Statistics Accuracy
1. Fetch data
2. Count logs manually by category
3. Compare with statistics panel

**Expected Result**:
- Total count matches number of logs
- Category counts are accurate

### Test 15: Statistics Update with Filters
1. Apply a filter
2. Check statistics

**Expected Result**:
- Statistics remain showing total counts (not filtered counts)
- This is expected behavior

## Export Testing

### Test 16: CSV Export - All Data
1. Fetch data
2. Click "Export CSV"

**Expected Result**:
- File downloads immediately
- Filename: "salesforce-audit-trail.csv"
- File opens in Excel/Sheets
- All columns present
- Data is readable

### Test 17: CSV Export - Filtered Data
1. Apply search or filter
2. Click "Export CSV"

**Expected Result**:
- Only filtered data is exported
- CSV structure is correct

### Test 18: CSV Data Integrity
1. Export data
2. Open in text editor
3. Check for proper escaping

**Expected Result**:
- Commas in data are handled correctly
- Quotes are escaped
- No data corruption

## UI/UX Testing

### Test 19: Button States
1. Before fetch: Export button is disabled
2. After fetch: Export button is enabled
3. During fetch: Fetch button shows loading state

**Expected Result**: All button states work correctly.

### Test 20: Responsive Behavior
1. Resize popup (if possible)
2. Check scrolling behavior

**Expected Result**:
- Layout remains intact
- Scrollbar appears when needed
- No content is cut off

### Test 21: Visual Categories
1. Fetch data with multiple categories
2. Verify color coding:
   - User Management: Blue badge
   - Security: Yellow badge
   - Object Changes: Green badge

**Expected Result**: Categories are visually distinct.

### Test 22: Date Formatting
1. Check dates in log entries

**Expected Result**:
- Dates are readable (e.g., "Oct 15, 2025, 10:30 AM")
- Timezone is correct

## Error Handling Testing

### Test 23: Session Expiry
1. Log in to Salesforce
2. Open extension popup
3. Let session expire (or log out in another tab)
4. Try to fetch data

**Expected Result**:
- Appropriate error message
- Suggests logging in again

### Test 24: Network Error
1. Disconnect from internet
2. Try to fetch data

**Expected Result**:
- Error message about network/API failure

### Test 25: Malformed Response
(This requires manual API testing)

**Expected Result**:
- Extension handles errors gracefully
- No crashes

## Performance Testing

### Test 26: Large Dataset
1. Test with an org that has 1000+ audit records
2. Fetch data

**Expected Result**:
- Extension handles large datasets
- UI remains responsive
- Search still works quickly

### Test 27: Rapid Searches
1. Type quickly in search box
2. Change text frequently

**Expected Result**:
- No lag or freezing
- Results update smoothly

## Cross-Browser Testing

### Test 28: Microsoft Edge
1. Load extension in Edge
2. Repeat basic tests

**Expected Result**: Works identically to Chrome.

### Test 29: Brave Browser
1. Load extension in Brave
2. Repeat basic tests

**Expected Result**: Works identically to Chrome.

## Salesforce Org Variations

### Test 30: Developer Edition
Test with a Developer Edition org.

**Expected Result**: Works normally.

### Test 31: Production Org
Test with a Production org.

**Expected Result**: Works normally.

### Test 32: Sandbox
Test with a Sandbox org.

**Expected Result**: Works normally.

### Test 33: My Domain Enabled
Test with an org that has My Domain configured.

**Expected Result**: Session detection works.

### Test 34: Lightning Experience
Test while in Lightning Experience.

**Expected Result**: Works normally.

### Test 35: Classic Experience
Test while in Salesforce Classic.

**Expected Result**: Works normally.

## Security Testing

### Test 36: Session Token Handling
1. Use browser dev tools
2. Check console and network tab
3. Verify session tokens aren't logged

**Expected Result**: No sensitive data in console.

### Test 37: External Requests
1. Monitor network requests
2. Verify all requests go to Salesforce

**Expected Result**: No external API calls.

## Regression Testing Checklist

When updating the extension, test:
- [ ] All connection scenarios
- [ ] Data fetching with different orgs
- [ ] Search functionality
- [ ] Category filtering
- [ ] CSV export
- [ ] UI appearance
- [ ] Error handling

## Bug Reporting

If you find issues, report with:
- Chrome version
- Salesforce edition
- Steps to reproduce
- Expected vs actual behavior
- Screenshots
- Console errors (F12 → Console)

## Automated Testing (Future)

Consider adding:
- Unit tests for JavaScript functions
- Integration tests for API calls
- UI automation tests
- Performance benchmarks

## Test Results Template

```
Test Date: _______________
Chrome Version: _______________
Salesforce Org Type: _______________
Tester: _______________

Connection Tests: PASS / FAIL
Data Fetching: PASS / FAIL
Search & Filter: PASS / FAIL
Export: PASS / FAIL
UI/UX: PASS / FAIL
Error Handling: PASS / FAIL

Notes:
_________________________________
_________________________________
```

## Known Issues

Document any known issues here:
- None currently reported

## Test Automation

For developers who want to add automated tests, consider:
- Jest for unit testing
- Puppeteer for browser automation
- Chrome Extension Testing Framework
- API mocking for offline tests
