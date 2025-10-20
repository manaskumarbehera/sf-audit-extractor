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
   - Extension name is "SF Audit Extractor"
   - Version matches `manifest.json` (e.g., "1.0.1")
   - Status shows "Enabled"
   - Icon is displayed

Expected Result: Extension is visible and enabled without errors.

### Test 2: Extension Icon Appears
1. Look at Chrome toolbar
2. Click the puzzle icon if you don't see the extension icon
3. Pin the extension

Expected Result: Blue document icon appears in toolbar.

## Connection Testing

### Test 3: Not on Salesforce
1. Navigate to a non-Salesforce page (e.g., google.com)
2. Click the extension icon

Expected Result:
- Status shows red dot
- Message: "Not on Salesforce"

### Test 4: On Salesforce Without Login
1. Navigate to a Salesforce login page
2. DO NOT log in
3. Click the extension icon

Expected Result:
- Status shows red dot
- Message: "Not logged in"

### Test 5: On Salesforce With Login
1. Log in to Salesforce
2. Navigate to any Salesforce page
3. Click the extension icon

Expected Result:
- Status shows green dot
- Message: "Connected to Salesforce" (or "Connected to <Org Name>")
- Audit Trails controls become enabled

## Audit Trails - Data Fetching

### Test 6: Fetch Audit Trail Data
1. Ensure you're logged in to Salesforce
2. In the Audit Trails tab, click the refresh icon
3. Wait for data to load

Expected Result:
- Button shows a loading state (spinner)
- After a few seconds, data appears
- Statistics panel shows counts
- Log entries are displayed
- Export CSV becomes enabled

### Test 7: No Data Available
1. Test with a brand new Developer Edition org
2. Click refresh

Expected Result:
- Message: "No audit trail records found for the last 6 months" (or minimal data displayed)

### Test 8: API Permission Error
1. Use an account without API access
2. Click refresh

Expected Result:
- Error message displayed
- Indicates permission or API access issue

## Audit Trails - Search & Filter

### Test 9: Search Functionality
1. Fetch data successfully
2. Type "user" in search box
3. Observe filtered results

Expected Result:
- Results update in real-time
- Only logs matching "user" are shown
- Count updates correctly

### Test 10: Search Clear
1. With search applied, clear the search box
2. Observe results

Expected Result:
- All logs are shown again
- Count returns to total

### Test 11: Category Filter
1. Fetch data successfully
2. Select "User Management" from dropdown

Expected Result:
- Only User Management logs are shown
- Count updates

### Test 12: Combined Search and Filter
1. Enter search term (e.g., "profile")
2. Select category (e.g., "User Management")

Expected Result:
- Both filters apply
- Only logs matching both criteria are shown

### Test 13: No Results
1. Search for something unlikely (e.g., "zzzzzzzzz")

Expected Result:
- Message: "No logs match your search criteria"

## Audit Trails - Statistics

### Test 14: Statistics Accuracy
1. Fetch data
2. Count logs manually by category
3. Compare with statistics panel

Expected Result:
- Total count matches number of logs
- Category counts are accurate

### Test 15: Statistics Behavior with Filters
1. Apply a filter
2. Check statistics

Expected Result:
- Statistics reflect totals (not filtered counts) unless explicitly stated

## Platform Events (Streaming)

### Test 16: Load Platform Events
1. Open the Platform Events tab
2. Click the refresh icon

Expected Result:
- List of Platform Events is displayed (objects ending with `__e`)
- Each item has a Subscribe/Unsubscribe button

### Test 17: Subscribe/Unsubscribe
1. Click Subscribe on an event
2. Verify state changes to Subscribed
3. Click Unsubscribe

Expected Result:
- Subscribe button toggles (icon changes + styling)
- "Subscribed" indicator appears when active
- Structured log shows subscribe/unsubscribe entries

### Test 18: Event Log Controls
1. In the Platform Events log toolbar, test:
   - Pause/Resume
   - Clear
   - Filter (All/Events/System/Subscribe/Errors)
   - Auto-scroll toggle

Expected Result:
- Pause stops new entries from auto-scrolling
- Clear removes log entries
- Filter shows only selected types
- Auto-scroll toggles behavior and button state

### Test 19: Connection Status
1. Check the Platform Events status pill

Expected Result:
- Shows "Connected" when streaming active, "Disconnected" otherwise
- Tooltip reflects status

### Test 20: Pin Window
1. Click the pin button in the header

Expected Result:
- Separate Platform Events window opens
- Reopen maintains pinned state

## Lightning Message Service (LMS)

### Test 21: Load Channels
1. Open the LMS tab
2. Click refresh

Expected Result:
- Channels list loads in the dropdown

### Test 22: Sample Payload
1. Select a channel

Expected Result:
- Sample payload appears in the text area
- Copy button copies payload and shows brief feedback

## SOQL Builder

### Test 23: Run Query
1. Open the SOQL Builder tab
2. Enter: `SELECT Id, Name FROM Account LIMIT 5`
3. Click Run (or press Cmd/Ctrl+Enter)

Expected Result:
- Results grid appears with rows and columns
- LIMIT is honored

### Test 24: Tooling Toggle and LIMIT
1. Toggle Tooling
2. Set a different LIMIT value
3. Run a query valid for Tooling (e.g., on a Tooling object)

Expected Result:
- Query runs against Tooling endpoint when toggled
- LIMIT input is applied

### Test 25: Export Results
1. Run a query
2. Export CSV, JSON, and Excel

Expected Result:
- Files download and open correctly
- Data is properly formatted/escaped

## GraphQL Runner

### Test 26: Run GraphQL Query
1. Open the GraphQL tab
2. Paste a simple UI API query and click Run

Expected Result:
- Results appear in the output area
- Errors (if any) are shown clearly

## Current Record Utility

### Test 27: Detect Record Id
1. Open a record page in Salesforce
2. Open the Current Record tab and click Detect

Expected Result:
- Record Id from the URL appears in the input

### Test 28: Fetch Record
1. With a valid Id in input, click Fetch

Expected Result:
- Record details are displayed; invalid Ids show a clear error

## Error Handling

### Test 29: Session Expiry
1. Let the Salesforce session expire (or log out)
2. Try any operation that requires API

Expected Result:
- Appropriate error message
- Suggests logging in again

### Test 30: Network Error
1. Disconnect from internet
2. Try to fetch data (any tab)

Expected Result:
- Error message about network/API failure

### Test 31: Malformed Response
(Manual/Mock testing)

Expected Result:
- UI handles errors gracefully
- No crashes

## Performance

### Test 32: Large Dataset (Audit Trails)
1. Use an org with 1000+ audit records
2. Fetch data

Expected Result:
- UI remains responsive
- Search/filter performance remains acceptable

### Test 33: Rapid Searches
1. Type quickly in search box and change frequently

Expected Result:
- No lag or freezing
- Results update smoothly

## Cross-Browser

### Test 34: Microsoft Edge
1. Load extension in Edge
2. Repeat basic tests

Expected Result: Works similarly to Chrome.

### Test 35: Brave Browser
1. Load extension in Brave
2. Repeat basic tests

Expected Result: Works similarly to Chrome.

## Salesforce Org Variations

### Test 36: Developer Edition
Expected Result: Works normally.

### Test 37: Production Org
Expected Result: Works normally.

### Test 38: Sandbox
Expected Result: Works normally.

### Test 39: My Domain Enabled
Expected Result: Session detection works.

### Test 40: Lightning Experience
Expected Result: Works normally.

### Test 41: Classic Experience
Expected Result: Works normally.

## Security

### Test 42: Session Token Handling
1. Use browser dev tools
2. Check console and network tab

Expected Result: No sensitive data is logged; only direct calls to Salesforce are made.

## Regression Checklist

When updating the extension, test:
- [ ] All connection scenarios
- [ ] Audit Trails fetching and filters
- [ ] Platform Events subscribe/log controls
- [ ] LMS channels and payload copy
- [ ] SOQL queries and exports
- [ ] GraphQL queries
- [ ] Current Record detection/fetching
- [ ] UI appearance and responsiveness
- [ ] Error handling paths

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
- Integration tests for API calls (mocked)
- UI automation tests
- Performance benchmarks

## Test Results Template

```
Test Date: _______________
Chrome Version: _______________
Salesforce Org Type: _______________
Tester: _______________

Connection Tests: PASS / FAIL
Audit Trails: PASS / FAIL
Platform Events: PASS / FAIL
LMS: PASS / FAIL
SOQL Builder: PASS / FAIL
GraphQL: PASS / FAIL
Current Record: PASS / FAIL
Error Handling: PASS / FAIL

Notes:
_________________________________
_________________________________
```

## Known Issues

Document any known issues here:
- None currently reported
