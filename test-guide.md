# Testing Guide for Salesforce Audit Trail Extractor

## Prerequisites

1. Chrome browser (version 88 or higher)
2. Access to a Salesforce org (Sandbox or Production)
3. User permissions to view Setup Audit Trail

## Installation Steps

1. Open Chrome and navigate to `chrome://extensions/`
2. Enable "Developer mode" toggle (top-right corner)
3. Click "Load unpacked"
4. Select the `sf-audit-extractor` folder
5. Verify the extension appears in the list with a blue icon

## Test Cases

### Test 1: Floating Button Injection

**Objective**: Verify the floating button appears on Salesforce pages

**Steps**:
1. Navigate to any Salesforce page (e.g., `https://yourorg.lightning.force.com`)
2. Wait for the page to fully load
3. Look for a blue circular button in the bottom-right corner

**Expected Result**:
- ✓ Floating button appears with an audit/log icon
- ✓ Button has a blue gradient background
- ✓ Hover effect scales the button slightly
- ✓ Button has proper z-index and doesn't interfere with Salesforce UI

**Failure Cases**:
- Button doesn't appear → Check console for errors, verify Salesforce domain
- Button appears but no icon → Check content.js SVG rendering
- Button overlaps with Salesforce elements → Adjust z-index in content.css

### Test 2: Dashboard Opens in New Tab

**Objective**: Verify clicking the button opens the dashboard

**Steps**:
1. Click the floating blue button
2. Wait for new tab to open

**Expected Result**:
- ✓ New tab opens with the dashboard
- ✓ Dashboard shows loading spinner initially
- ✓ Tab title is "Salesforce Audit Trail Dashboard"

**Failure Cases**:
- New tab doesn't open → Check popup blockers
- Dashboard shows error → Check Chrome DevTools console
- Tab opens but blank → Verify dashboard.html loads correctly

### Test 3: Data Fetching

**Objective**: Verify audit trail data loads successfully

**Steps**:
1. Open the dashboard from a Salesforce tab
2. Wait for data to load (may take 5-30 seconds depending on records)
3. Observe the status section

**Expected Result**:
- ✓ Loading spinner appears initially
- ✓ Data loads and table populates with records
- ✓ At least one record appears (if audit data exists)
- ✓ All columns are populated: Date, User, Action, Section, Display, Delegate User, Category

**Failure Cases**:
- "No Salesforce tabs found" error → Open a Salesforce page first, then try again
- "Could not find session" error → Ensure you're logged into Salesforce
- HTTP 401/403 errors → Check user permissions for Setup Audit Trail
- No data appears → Check if audit trail has records in last 180 days

### Test 4: Search Functionality

**Objective**: Verify search filters records correctly

**Steps**:
1. Load dashboard with audit data
2. Type a search term in the search box (e.g., user name, action type)
3. Observe table filtering in real-time

**Expected Result**:
- ✓ Table filters as you type (no delay)
- ✓ Only matching rows remain visible
- ✓ Search is case-insensitive
- ✓ Search works across all columns
- ✓ Clearing search shows all records again

**Failure Cases**:
- Search doesn't filter → Check dashboard.js filterBySearch function
- Case sensitivity issues → Verify toLowerCase() is applied
- Performance issues → May occur with >5000 records

### Test 5: Category Filters

**Objective**: Verify category filtering works correctly

**Steps**:
1. Load dashboard with audit data
2. Observe category counts in chips
3. Click each category chip
4. Verify filtering

**Expected Result**:
- ✓ All categories show correct counts
- ✓ Clicking "User Management" shows only user-related records
- ✓ Clicking "Security" shows only security-related records
- ✓ Clicking "Object/Field" shows only object/field records
- ✓ Clicking "Email" shows only email-related records
- ✓ Clicking "Other" shows uncategorized records
- ✓ Clicking "All" shows all records
- ✓ Active chip is highlighted (blue background)

**Failure Cases**:
- Wrong categories → Check categoryPatterns regex in dashboard.js
- Counts don't match → Check updateCategoryCounts function
- Filtering doesn't work → Check filterByCategory function

### Test 6: Combined Filters

**Objective**: Verify search and category filters work together

**Steps**:
1. Load dashboard with audit data
2. Select a category (e.g., "User Management")
3. Type a search term
4. Verify both filters apply

**Expected Result**:
- ✓ Only records matching both filters appear
- ✓ Switching category updates filtered results
- ✓ Clearing search maintains category filter
- ✓ Selecting "All" removes category filter but keeps search

### Test 7: CSV Export

**Objective**: Verify CSV export functionality

**Steps**:
1. Load dashboard with audit data
2. Apply some filters (optional)
3. Click "Export CSV" button
4. Check downloaded file

**Expected Result**:
- ✓ CSV file downloads automatically
- ✓ Filename includes date (e.g., `salesforce_audit_trail_2025-10-19.csv`)
- ✓ CSV includes headers row
- ✓ CSV includes only filtered records (if filters applied)
- ✓ All columns are present and properly quoted
- ✓ Special characters are escaped correctly

**Failure Cases**:
- Export button disabled → Check if records exist
- Download doesn't start → Check browser download settings
- CSV malformed → Check exportToCsv function quoting logic

### Test 8: Pagination Handling

**Objective**: Verify large datasets are handled correctly

**Steps**:
1. Test in an org with >2000 audit records
2. Open dashboard and wait for all data to load

**Expected Result**:
- ✓ All records load (check total count)
- ✓ No pagination errors in console
- ✓ Table renders all records
- ✓ Performance remains acceptable (<5 seconds for 5000 records)

**Failure Cases**:
- Incomplete data → Check nextRecordsUrl handling
- Timeout errors → May need to increase batch size

### Test 9: Lightning Experience Compatibility

**Objective**: Verify extension works in Lightning Experience

**Steps**:
1. Navigate to Lightning Experience page
2. Verify floating button appears
3. Open dashboard and fetch data

**Expected Result**:
- ✓ All functionality works identically to Classic

### Test 10: Classic Experience Compatibility

**Objective**: Verify extension works in Salesforce Classic

**Steps**:
1. Navigate to Classic page
2. Verify floating button appears
3. Open dashboard and fetch data

**Expected Result**:
- ✓ All functionality works identically to Lightning

## Known Limitations

1. **Session Dependency**: Extension requires active Salesforce session
2. **API Version**: Hardcoded to v59.0 (may need updates for future Salesforce releases)
3. **Date Range**: Fixed to 180 days (no custom date range picker)
4. **Permissions**: User must have access to SetupAuditTrail object

## Console Debugging

If issues occur, check the Chrome DevTools console for:

- Content Script: Open DevTools on Salesforce page, check for errors
- Dashboard: Open DevTools on dashboard tab, check Network and Console tabs
- Service Worker: Go to `chrome://extensions/`, find extension, click "service worker" link

## Performance Benchmarks

- **< 100 records**: Instant loading (<1 second)
- **100-1000 records**: Fast loading (1-3 seconds)
- **1000-5000 records**: Moderate loading (3-10 seconds)
- **> 5000 records**: May experience delays (>10 seconds)

Search and filtering should be instant regardless of record count.
