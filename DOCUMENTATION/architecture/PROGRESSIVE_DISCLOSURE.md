# GraphQL UI - Feature 1: Progressive Disclosure (3-Screen UI)

## Overview

The GraphQL query builder uses a **progressive disclosure pattern** showing only relevant controls at each step. This reduces cognitive load and makes the interface intuitive.

## Three Screens

### Screen 1: Object Selection
**Purpose:** Choose which Salesforce object to query

**What You See:**
```
┌────────────────────────────────────────┐
│  Select an Object                      │
│  Choose a Salesforce object to query   │
├────────────────────────────────────────┤
│  🔍 [Search objects...]                │
│                                        │
│  ┌─────────┐  ┌─────────┐  ┌────────┐ │
│  │   📦    │  │   📦    │  │  📦    │ │
│  │ Account │  │ Contact │  │  Lead  │ │
│  └─────────┘  └─────────┘  └────────┘ │
│                                        │
│  [⟳ Refresh Objects] [Advanced Mode]  │
└────────────────────────────────────────┘
```

**How to Use:**
1. Type in the search box to find objects
2. Click any object card to select it
3. Automatically navigates to Query Builder

**What Happens:**
- Objects loaded from `DESCRIBE_GLOBAL`
- Search is case-insensitive
- Filters in real-time as you type

---

### Screen 2: Query Builder
**Purpose:** Compose a GraphQL query with fields, filters, and options

**What You See:**
```
LEFT PANEL              │  RIGHT PANEL (Tabs)
(Builder - Composition) │  (Query/Vars/Endpoint)
────────────────────────┼─────────────────────
FIELDS                  │  [Query] [Variables] [Endpoint]
  ☐ Id                  │  ├─ Auto-generated GraphQL
  ☑ Name                │  ├─ {} (JSON)
  + Add                 │  └─ Endpoint info
                        │
FILTERS                 │  [▶ Run Query]
  + Filter              │  [Clear Results]
                        │
ORDER BY                │
  Field, Direction      │
                        │
PAGINATION              │
  Limit, Offset, After  │
```

**How to Use:**

**Adding Fields:**
1. Type field name or select from autocomplete
2. Click "+ Add" button (or press Enter)
3. Field appears as chip with ✕ to remove

**Adding Filters:**
1. Click "+ Filter" button
2. Enter: Field name, Operator (=, !=, >, <, LIKE, IN), Value
3. Multiple filters combined with AND

**Order By:**
1. Select field from autocomplete
2. Choose ASC or DESC
3. Click ✕ to clear ordering

**Pagination:**
- **Limit:** Number of results (default 50)
- **Offset:** Skip first N results
- **After:** Cursor for cursor-based pagination

**What Happens:**
- Query auto-generates in Query tab
- Updates as you make changes
- Body size calculated in Endpoint tab
- Ready to Run

---

### Screen 3: Results
**Purpose:** View and navigate query results

**What You See:**
```
← Results: Account     [🗑 Clear]
────────────────────────────────
endCursor: abc123... hasNextPage: true
[Use endCursor] [Clear cursor]

┌──────────────────────────────┐
│ ▼ Account #1: Acme Corp     │
│   Id: 001...                │
│   Name: Acme Corp           │
│   Industry: Technology      │
└──────────────────────────────┘

[← Previous] [Page 1 of 3] [Next →]
[Edit Query] [Reset]
```

**How to Use:**

**Viewing Results:**
1. Results auto-expand on load
2. Click item to collapse/expand details

**Pagination:**
- Click [Next →] to fetch next page
- Click [← Previous] to go back
- Use endCursor for cursor-based pagination:
  1. Click [Use endCursor]
  2. Returns to builder with cursor set
  3. Run query again for next batch

**Editing:**
1. Click [Edit Query] → Back to builder
2. Click [Reset] → Back to object selection

---

## Navigation

### Moving Between Screens

```
Objects
  ↓ (click object card)
Builder
  ↓ (click Run Query)
Results
  ↓ (click Edit/Reset)
  Back to Builder or Objects
```

### Back Buttons
- **In Builder:** ← Back to Objects (left side of header)
- **In Results:** ← Back to Builder (left side of header)

---

## Key Benefits

✅ **One Step at a Time** - Focus on current task
✅ **Less Overwhelming** - Only show what's needed
✅ **Clear Navigation** - Always know where you are
✅ **Mobile Friendly** - Works great on small screens
✅ **Fast** - No complex multi-section layout

---

## Tips & Tricks

**Quick Search:** Type in object search, don't need to click dropdown

**Field Autocomplete:** Start typing field name, suggestions appear

**Multiple Filters:** Add multiple filters, they're combined with AND

**Cursor Pagination:** Use "After" for efficient pagination of large datasets

**Reset Anytime:** Click back buttons to reset and start over

---

## Troubleshooting

**Objects not loading?**
- Check Salesforce login
- Click "Refresh Objects" button
- Wait a moment for DESCRIBE_GLOBAL call

**Can't see field names?**
- Make sure object is selected
- Field list loads after object selection

**Query not generating?**
- Check builder is enabled (toggle)
- At least one field must be selected
- Object must be selected

---

## Related Features

See also:
- [Builder Toggle & Auto-Enable](02-BUILDER_TOGGLE.md)
- [Tabbed Interface](03-TABBED_INTERFACE.md)
- [On-Demand Schema Loading](04-ON_DEMAND_SCHEMA.md)

