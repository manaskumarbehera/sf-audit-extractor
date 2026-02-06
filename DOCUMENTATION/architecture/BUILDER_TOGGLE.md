# GraphQL UI - Feature 2: Builder Toggle & Auto-Enable

## Overview

The **Builder Toggle** controls whether the query composition panel is visible. It's **disabled by default** and **auto-enabled** when you select an object.

## Feature Behavior

### Default State (Off)

**On Initial Load:**
- Builder toggle is **unchecked** (OFF)
- Left panel (Fields, Filters, etc.) is **hidden**
- Message: "Builder disabled. Toggle to enable."
- Only object selection visible

```
Object Selection
  ↓
Builder OFF ✗ (toggle unchecked)
  ↓
Only tabs visible: [Query] [Variables] [Endpoint]
```

### Auto-Enable on Object Select

**When You Select an Object:**
1. Builder automatically **ENABLED** (checkbox checks)
2. Left panel **appears** with:
   - Fields (with `Id` pre-selected)
   - Filters (empty, ready to add)
   - Order By
   - Pagination
3. Query **auto-generated**
4. Message: "Builder ready"

```
Click Object Card
  ↓
Builder ENABLED ✓ (checkbox auto-checked)
  ↓
Left Panel Shows:
  - Fields
  - Filters
  - Order By
  - Pagination
  ↓
Right Panel Shows (Tabs):
  - Query (auto-generated)
  - Variables
  - Endpoint
```

---

## How to Use

### Enabling Builder Manually

**If you want to enable builder without selecting object:**

1. Look at header: `[✓] Builder  Ready`
2. Click the checkbox to enable
3. Left panel appears

### Disabling Builder

**To hide the composition panel:**

1. Click the builder toggle (header)
2. Left panel disappears
3. Right panel stays visible (Query/Variables/Endpoint tabs)
4. Message changes to: "Builder disabled. Toggle to enable."

### Why Disable Builder?

Use manual mode when:
- You have complex GraphQL you want to hand-write
- You're copying/pasting existing queries
- You want to see more of the tabs

---

## Auto-Added Fields

### Initial Field: `Id`

When you select an object:
- **`Id` field automatically selected**
- This is the minimum required field
- All GraphQL queries need at least `Id`

**Example:**
```
Select Account
  ↓
Fields automatically populated:
  ✓ Id (checked)
  ☐ Name
  ☐ Industry
  ☐ BillingCity
  ...
```

### Add More Fields

After object selection, you can:
1. Click field name in list below "Fields"
2. Or type field name and click "+ Add"
3. Each field shows as a **chip** with ✕ to remove

```
Fields
  ✓ Id
  ✓ Name (added after selection)
  ✓ Industry (added after selection)
```

---

## On Object Change

### What Happens

When you **select a different object**:

✅ Builder remains **ENABLED**
✅ Fields **reload for new object**
✅ Previous filters **cleared** (new object might not have same fields)
✅ Previous order by **cleared**
✅ Pagination **reset** to defaults
✅ Query **regenerated**
✅ Endpoint **updated** with new object name

### Example Flow

```
Selected: Account (Account fields loaded)
  ↓
Select Contact instead
  ↓
✓ Builder stays ON
✓ Fields reload (Contact fields now available)
✓ Filters cleared (Account filters don't apply)
✓ Query regenerated for Contact
✓ Endpoint updates: "Object: Contact"
```

---

## Toggle Location

### In Header

```
← GraphQL: Account    [✓] Builder   Ready
```

**Toggle Button:**
- Type: Checkbox input
- Label: "Builder"
- Location: Right side of header
- Status text: "Ready" or "disabled. Toggle to enable."

---

## Status Messages

### Builder Enabled
```
✓ Builder enabled
"Builder ready"
```

### Builder Disabled
```
✗ Builder disabled
"Builder disabled. Toggle to enable."
```

### Waiting for Input
```
⟳ Loading fields...
"Select fields to build query"
```

---

## Query Generation

### Auto-Generated Query

Once builder is enabled and you have:
- ✓ Object selected
- ✓ At least one field
- ✓ Optional: filters, order by, pagination

A GraphQL query is **automatically generated** in the Query tab.

**Example:**
```
Builder State:
  Object: Account
  Fields: Id, Name, Industry
  Limit: 50
  
Generated Query:
  query {
    uiapi {
      query {
        Account(first: 50) {
          edges {
            node {
              Id
              Name { value }
              Industry { value }
            }
          }
          pageInfo {
            endCursor
            hasNextPage
          }
        }
      }
    }
  }
```

---

## Editing Behavior

### With Builder Enabled

All changes update query in real-time:
- Add field → Query updates
- Remove field → Query updates
- Add filter → Query updates
- Change limit → Query updates

### With Builder Disabled

Query tab editable but:
- Changes don't auto-generate
- You're manually editing
- Can paste existing queries

---

## Tips & Tricks

**Quick Start:** Just select an object, builder auto-enables with Id field, ready to add more fields

**Manual Mode:** Disable builder to paste existing GraphQL queries

**Reset:** Toggle OFF then ON to reset builder state

**Check Status:** Look at message next to toggle to see if builder is ready

---

## Troubleshooting

**Builder not auto-enabling?**
- Try clicking object card again
- Refresh the page
- Check browser console for errors

**Fields not loading?**
- Builder might be disabled
- Click toggle to enable
- Object might not have fields (try different object)

**Checkbox not visible?**
- Check header area
- Might be hidden on very small screens

---

## Related Features

See also:
- [Progressive Disclosure](01-PROGRESSIVE_DISCLOSURE.md)
- [Tabbed Interface](03-TABBED_INTERFACE.md)
- [Default Fields](02-BUILDER_TOGGLE.md#auto-added-fields)

