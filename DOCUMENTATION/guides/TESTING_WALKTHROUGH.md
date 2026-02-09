# TrackForcePro - Testing Walkthrough

This guide provides step-by-step testing instructions for all major features of the TrackForcePro extension.

## GraphQL Builder Testing

### What You'll See

### Screen 1: Object Selection (Initial Load)
```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  Select an Object
  Choose a Salesforce object to query with GraphQL
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  🔍 [Search objects...]

  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐
  │    📦       │  │    📦       │  │    📦       │
  │  Account    │  │  Contact    │  │  Opportunity│
  └─────────────┘  └─────────────┘  └─────────────┘
  
  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐
  │    📦       │  │    📦       │  │    📦       │
  │    Lead     │  │    Case     │  │    Task     │
  └─────────────┘  └─────────────┘  └─────────────┘

  [⟳ Refresh Objects] [Advanced Mode]
```

**What You Can Do:**
- Type in the search box to filter objects
- Click any object card to select it
- Click "Refresh Objects" to reload the list
- Click "Advanced Mode" to skip to manual query mode

---

### Screen 2: Query Builder (After Selecting Object)
```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  ← GraphQL: Account                    Ready
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

LEFT PANEL                  │  RIGHT PANEL
(Composition)               │  (Preview & Actions)
────────────────────────────┼─────────────────────────
FIELDS                      │  QUERY PREVIEW
  ☐ Id                      │  query {
  ☑ Name                    │    uiapi {
  ☑ Industry                │      query {
  ☐ BillingCity             │        Account(first:50) {
  + Add                      │          edges {
                             │            node {
FILTERS                     │              Id
  ☐ Name = "Acme"           │              Name
  + Filter                  │              Industry
                             │            }
ORDER BY                    │          }
  Field: Industry           │        }
  Dir: DESC                 │      }
  ☑ Apply                   │    }
                             │  }
PAGINATION                  │
  Limit: 50                 │  [▶ Run Query]
  Offset: 0                 │  [✎ Manual Edit]
                             │
[Builder Status]            │
Ready to query              │
```

**What You Can Do:**
- **Left Panel:**
  - Toggle fields with checkboxes
  - Add filters with operators (=, !=, >, <, LIKE, IN)
  - Set sort order and direction
  - Configure pagination (limit, offset, cursor)
  
- **Right Panel:**
  - See live query preview updating in real-time
  - Enter JSON variables if needed
  - Click "Run Query" to execute
  - Click "Manual Edit" to write query yourself

- **Top:**
  - Click back arrow to go back to object selection
  - See object name in header

---

### Screen 3: Results (After Running Query)
```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  ← Results: Account                    🗑
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

endCursor: abc123xyz...   hasNextPage: true
[Use endCursor]  [Clear cursor]

┌─────────────────────────────────────────────────┐
│ ▼ Account #1: Acme Corp                         │
│   Id: 0011h00000sKvFAAV                         │
│   Name: Acme Corp                               │
│   Industry: Technology                          │
├─────────────────────────────────────────────────┤
│ ▼ Account #2: Global Tech Inc                   │
│   Id: 0011h00000sKvGBBV                         │
│   Name: Global Tech Inc                         │
│   Industry: Finance                             │
└─────────────────────────────────────────────────┘

[← Previous]  [Page 1 of 3]  [Next →]
[Edit Query]  [Reset]
```

**What You Can Do:**
- Click result items to expand/collapse details
- Use pagination buttons to navigate
- Use "endCursor" for cursor-based pagination
- Click "Edit Query" to go back to builder
- Click "Reset" to go back to object selection
- Click trash icon to clear results

---

## Key Differences from SOQL Builder

| Feature | SOQL | GraphQL |
|---------|------|---------|
| Object Selection | Dropdown | Searchable card grid |
| Interface | All controls visible | Progressive screens |
| Query Building | Tabular form | Split-panel composer |
| Query Preview | Small inline text | Large dark-themed preview |
| Results | Inline table | Dedicated results screen |
| Navigation | Single page | Multi-screen flow |
| Mobile UX | Cramped | Responsive stacking |

---

## Testing Checklist

### Test 1: Object Selection
```
1. Open GraphQL tab → See object selection screen
2. Type "account" in search → Filters to Account cards
3. Click Account card → Navigates to builder
4. Should see "GraphQL: Account" header
```

### Test 2: Query Builder - Fields
```
1. In builder, check "Name" field
2. Live preview should show "Name { value }"
3. Add "Industry" field
4. Preview should include both
5. Uncheck a field → Preview updates
```

### Test 3: Query Builder - Filters
```
1. Click "+ Filter" button
2. Enter field, operator, value
3. Preview updates with where clause
4. Add second filter
5. Multiple filters combined with AND
```

### Test 4: Query Builder - Pagination
```
1. Change Limit to 100
2. Set Offset to 50
3. Preview updates with first:100, offset:50
4. Try adding After cursor
```

### Test 5: Run Query
```
1. Click [Run Query] button
2. Should show loading state
3. Navigate to results screen
4. See results displayed
```

### Test 6: Results Navigation
```
1. In results, click [Edit Query]
2. Return to builder screen
3. Click back in header → Returns to object selection
4. Builder state preserved? (Check if fields/filters still there)
```

### Test 7: Mobile Responsive
```
1. Open DevTools → Mobile view
2. Object grid should stack to 1 column
3. Builder panels should stack vertically
4. All buttons should be touchable (48px+)
5. Scroll should work smoothly
```

### Test 8: Search Objects
```
1. Type "acc" in search
2. Filters to show only Account, Accountcontactrel, etc.
3. Clear search → Shows all objects again
4. Search is case-insensitive
```

---

## Console Output to Expect

```javascript
// On GraphQL tab load
[GraphQL] Using on-demand object introspection (only object-specific metadata cached)

// When selecting object
[GraphQL] Object introspection for Account (loading)...
[GraphQL] Cached 63 fields for Account

// When running query
// (Standard GraphQL success/error messages)
```

---

## Known Limitations & Future Work

### Current Limitations
- Object icons are generic (🗂 emoji) - could be customized per object
- Advanced mode not yet wired up
- Manual edit mode still shows hidden textarea
- Schema search feature hidden (can be restored if needed)

### Future Enhancements
1. **Object Icons** - Map names to better emojis
2. **Advanced Mode** - Show all controls at once
3. **Query History** - Recently used queries
4. **Favorites** - Star favorite objects/queries
5. **Keyboard Shortcuts** - Power user features

---

## Troubleshooting

### "Objects loading..." still showing?
- Check browser console for errors
- Verify Salesforce login
- Refresh the page
- Try "Refresh Objects" button

### Query preview not updating?
- Check browser dev tools
- Verify `graphqlQueryPreview` element exists
- Look for JavaScript errors

### Can't navigate between screens?
- Check that DOM elements are loading (F12 → Elements)
- Verify `renderScreens()` is being called
- Clear browser cache and reload

### Objects not showing in grid?
- Might be loading - give it a moment
- Check network tab for DESCRIBE_GLOBAL call
- Verify you're logged into Salesforce

---

## Code References

### Screen Navigation
```javascript
// Go to object selection
graphqlUIState.goToObjectSelection()

// Select an object
graphqlUIState.selectObject('Account')

// Show results
graphqlUIState.runQueryAndShowResults(response)

// Go back to builder
graphqlUIState.backToBuilder()

// Render current screen
renderScreens()
```

### State Access
```javascript
// Current screen
graphqlUIState.currentScreen // 'objects' | 'builder' | 'results'

// Selected object
graphqlUIState.selectedObject // 'Account' | null

// Current results
graphqlUIState.currentResults // response object or null
```

---

## Files Modified

1. **popup.html** - New 3-screen HTML structure
2. **popup.css** - Screen styling & layout (250+ lines added)
3. **graphql_helper.js** - Screen state management & navigation

---

## Quick Commands (Browser Console)

```javascript
// Check current screen
console.log(graphqlUIState.currentScreen)

// Manually navigate
graphqlUIState.selectObject('Contact')

// See if element exists
document.getElementById('graphql-objects-grid')

// Check screen visibility
document.getElementById('graphql-screen-builder').classList
```

---

**Last Updated:** February 7, 2026
**Status:** Ready for testing ✅

---

## Data Explorer Testing Walkthrough

### Test 9: Sandbox & Favicon Manager

#### Test 9.1: Organization Info Display
```
1. Navigate to a Salesforce org
2. Open Extension → Explore tab → Sandbox Manager
3. Verify organization info displays:
   - Name, ID, Type (Sandbox/Production badge)
   - Instance, Language, Locale, Timezone
   - Created date
4. If sandbox, should show yellow "SANDBOX" badge
5. If production, should show green "PRODUCTION" badge
```

#### Test 9.2: Custom Favicon - Create
```
1. Select a color from presets or color picker
2. Enter a label (max 3 characters): "DEV"
3. Verify preview updates with color and label
4. Click "Apply Favicon"
5. Status should show "Favicon saved & applied!"
6. Browser tab should show custom favicon
7. Favicon should appear in "Saved Favicons" list
```

#### Test 9.3: Custom Favicon - Edit Mode
```
1. Apply a favicon to an org (e.g., DEV - Green)
2. Navigate away, then return to same org
3. Open Sandbox Manager tab
4. Verify:
   - Color picker shows saved color
   - Label field shows saved label
   - "✓ Editing existing favicon" indicator visible
5. Change color to Red, label to "PRD"
6. Click Apply
7. Verify update replaces (not duplicates) the entry
```

#### Test 9.4: Multi-Org Favicon Storage
```
1. Create favicon for Org A (DEV - Green)
2. Switch to Org B in another tab
3. Create favicon for Org B (UAT - Blue)
4. Switch to Org C
5. Create favicon for Org C (PRD - Red)
6. Open Saved Favicons list
7. Verify all 3 favicons are listed
8. Current org should show "CURRENT" badge
9. Delete Org B favicon
10. Verify Org A and C still exist
```

#### Test 9.5: Favicon Persistence
```
1. Create a favicon for an org
2. Close browser completely
3. Reopen browser and navigate to same org
4. Open extension → Sandbox Manager
5. Favicon should auto-apply to tab
6. Saved Favicons list should show the entry
```

### Test 10: User Manager

#### Test 10.1: Current User Display
```
1. Open Extension → Explore → User Manager
2. Verify current user info displays:
   - Name with Active/Inactive status
   - Email address
   - Profile name
   - Role name (or "None")
   - Language locale
   - Last Login date
3. Click Refresh - info should reload
```

#### Test 10.2: User Search
```
1. Enter search term in search box (e.g., "john")
2. Click Search (or press Enter)
3. Results should show matching users:
   - ✓ for active, ✗ for inactive
   - Name and email displayed
4. Search by username - verify results
5. Search by email - verify results
6. Clear search, enter new term
```

#### Test 10.3: User Selection
```
1. Search for a user
2. Click "Select" button on a result
3. Verify:
   - Selected user name appears in form
   - Profile dropdown enables and shows current profile
   - Role dropdown enables
   - Language dropdown enables
4. Click "Clear" button
5. Verify form resets and disables
```

#### Test 10.4: User Update (Admin Only)
```
1. Search and select a test user
2. Change Profile dropdown to different profile
3. Click "Update User"
4. Status should show "User updated successfully!"
5. Verify change in Salesforce
```

### Test 11: Record Lookup - Auto Detection

#### Test 11.1: Lightning Record Page
```
1. Navigate to Lightning record page:
   https://[org].lightning.force.com/lightning/r/Account/001xxx/view
2. Open Extension → Explore → Record Lookup
3. Verify Current Page panel shows:
   - Object badge: Account
   - Record ID with copy button
   - Name field
   - Created By, Last Modified
   - Open Record & Copy Link buttons
```

#### Test 11.2: Classic URL with ID Parameter
```
1. Navigate to URL with ?id= parameter:
   https://[org].salesforce.com/apex/MyPage?id=001xxx
2. Open Extension → Record Lookup
3. Verify Record ID extracted in Current Page panel
```

#### Test 11.3: No Record Context
```
1. Navigate to home page (no record ID)
2. Open Extension → Record Lookup
3. Current Page panel should show: "No Record ID detected in the current URL"
```

### Test 12: Record Lookup - Manual Search

#### Test 12.1: Valid 18-Character ID
```
1. Open Extension → Explore → Record Lookup
2. In Search by ID panel, enter valid 18-char ID: 0015g00000ABCDEFGH
3. Click Search button
4. Verify result shows:
   - Object type badge
   - Record ID with copy button
   - Name/identifier
   - Action buttons
```

#### Test 12.2: Valid 15-Character ID
```
1. Enter valid 15-char ID: 0015g00000ABCDE
2. Click Search
3. Verify result shows correctly
```

#### Test 12.3: Invalid ID Length
```
1. Enter 14-char ID: 0015g0000ABCD
2. Click Search
3. Should show error: "Invalid ID length"
```

#### Test 12.4: Non-existent ID
```
1. Enter valid format but non-existent ID
2. Click Search
3. Should show message about record not found or permissions
```

### Test 13: Record Lookup - History

#### Test 13.1: History Population
```
1. Search for a record in Search by ID panel
2. Verify record appears in Recent Records panel
3. Search for another record
4. Verify both records appear (newest first)
```

#### Test 13.2: History Click
```
1. Click on a record in Recent Records panel
2. Verify ID populates Search input
3. Verify search is executed automatically
```

#### Test 13.3: Clear History
```
1. Click X button on Recent Records panel header
2. Verify history is cleared
3. Should show "No recent records"
```

### Test 14: Connection Handling

#### Test 14.1: Not Connected State
```
1. Close all Salesforce tabs
2. Open Extension → Explore → Sandbox Manager
3. Should show "Not Connected" message
4. Saved Favicons list should still load and display
```

#### Test 13.2: Session Expired
```
1. Let Salesforce session expire
2. Open Extension → Explore
3. Should show appropriate error message
4. Navigate to SF, log in again
5. Refresh extension - should work
```

---

## Console Output to Expect (Data Explorer)

```javascript
// On Favicon save
[TrackForcePro] Got hostname from SF tab: myorg.lightning.force.com
Before save - existing favicons: ["00D5g0000012345"]
After save - favicon data: {"color":"#51cf66","label":"DEV","orgName":"Dev Sandbox"...}
Verified saved favicons: ["00D5g0000012345"]

// On loading saved favicons
Loading saved favicons, count: 3

// On favicon deletion
Before delete - existing favicons: ["00D5g0000012345", "00D5g0000067890"]
After delete - remaining favicons: ["00D5g0000012345"]
```

