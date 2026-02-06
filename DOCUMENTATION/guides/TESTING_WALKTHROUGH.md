# GraphQL UI Redesign - Quick Reference & Testing Guide

## What You'll See

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

**Last Updated:** February 6, 2026
**Status:** Ready for testing ✅

