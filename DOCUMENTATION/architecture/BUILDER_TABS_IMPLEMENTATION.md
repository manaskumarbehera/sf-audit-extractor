# GraphQL UI Enhancement - Builder Toggle & Tabbed Interface

## ✅ Implementation Complete

Date: February 6, 2026
Feature: Builder Toggle + Tabbed Query/Variables/Endpoint Interface

---

## What Was Implemented

### 1. **Builder Toggle (Disabled by Default)**

**Feature:**
- Builder is now **disabled by default** (not enabled)
- User can toggle builder ON/OFF via checkbox in header
- Status message shows: "Builder disabled. Toggle to enable."

**When Enabled:**
- Shows left panel (Fields, Filters, Order By, Pagination)
- Auto-generates query in real-time
- Shows tabbed interface (Query/Variables/Endpoint)

**When Disabled:**
- Hides composition panel (Fields, Filters, etc.)
- Shows only tabbed interface (can still manually edit query)

### 2. **On Object Selection**

When user selects an object from the grid:

✅ **Auto-enable builder** - Checkbox checked automatically
✅ **Add default field** - Starts with `Id` field
✅ **Generate query** - Creates GraphQL query automatically
✅ **Load field options** - Populates field datalist for that object
✅ **Reload fields** - Fresh object fields each selection
✅ **Update endpoint** - Shows relevant endpoint info

### 3. **Tabbed Interface (Like SOQL)**

Three tabs for query management:

#### **Tab 1: Query**
- GraphQL query editor
- Auto-generated from builder OR hand-written
- Real-time syntax display
- Editable textarea

#### **Tab 2: Variables**
- JSON variables input
- Format validation
- Pretty-print on blur
- Used when running query

#### **Tab 3: Endpoint**
- **Endpoint:** `/services/data/vXX.X/graphql`
- **Method:** POST
- **Content-Type:** application/json
- **Body Size:** Calculated bytes
- **Object:** Selected SObject name

---

## Code Changes

### popup.html

**1. Builder Toggle Added to Header:**
```html
<label class="builder-toggle-label">
  <input type="checkbox" id="graphql-builder-enabled" aria-label="Enable query builder" />
  <span>Builder</span>
</label>
```

**2. Tabbed Interface Replaces Preview:**
```html
<div class="graphql-tabs-container">
  <div class="graphql-tabs-header">
    <button class="graphql-tab-button active" data-tab="query">Query</button>
    <button class="graphql-tab-button" data-tab="variables">Variables</button>
    <button class="graphql-tab-button" data-tab="endpoint">Endpoint</button>
  </div>
  <!-- Tab contents -->
</div>
```

**3. Removed Duplicate Elements:**
- Removed hidden textarea duplicates
- Removed old query preview section
- Cleaned up redundant elements

### popup.css

**Added Tab Styling:**
```css
.graphql-tabs-container       /* Tab container */
.graphql-tabs-header          /* Tab button row */
.graphql-tab-button           /* Individual tab button */
.graphql-tab-button.active    /* Active tab styling */
.graphql-tab-content          /* Tab content area */
.graphql-tab-content.active   /* Visible content */

.endpoint-display             /* Endpoint info grid */
.endpoint-item                /* Each endpoint detail */
.endpoint-key                 /* Key column */
.endpoint-value               /* Value column */
```

**Tab Switching:**
- Click tab → shows matching content
- Active tab highlighted in blue
- Smooth transitions

### graphql_helper.js

**1. Enhanced selectObject():**
```javascript
selectObject(objectName) {
  builderState.enabled = true;      // Enable builder
  builderState.fields = ['Id'];     // Start with Id
  refreshBuilderFields(objectName); // Load object fields
  handleBuilderChange(...)          // Generate query
}
```

**2. New Functions:**

```javascript
// Tab switching functionality
wireTabSwitching()              // Setup tab click handlers
updateEndpointDisplay()         // Update endpoint info
```

**3. Updated setBuilderVisibility():**
```javascript
function setBuilderVisibility(enabled) {
  // Hide/show left panel based on toggle
  if (enabled) {
    leftPanel.classList.remove('hidden');
  } else {
    leftPanel.classList.add('hidden');
  }
}
```

**4. Builder Toggle Handler:**
```javascript
on(builderToggle, 'change', () => {
  builderState.enabled = !!builderToggle.checked;
  setBuilderVisibility(builderState.enabled);
  if (builderState.enabled) {
    handleBuilderChange({ writeQuery: true });
    updateEndpointDisplay();
  }
});
```

---

## User Experience Flow

```
User Selects Object
    ↓
Builder automatically ENABLED (checkbox checked)
    ↓
Left Panel Shows:
  - Fields (starting with Id)
  - Filters (empty)
  - Order By
  - Pagination (limit 50, offset 0)
    ↓
Right Panel Shows (Tabs):
  [Query]   [Variables]   [Endpoint]
    ↓
Query Tab: Auto-generated GraphQL
Variables Tab: {} (empty, ready for input)
Endpoint Tab: Shows POST /services/data/vXX.X/graphql + details
    ↓
User can:
  - Toggle builder OFF (hides left panel)
  - Edit query directly in Query tab
  - Add variables in Variables tab
  - View endpoint details
  - Click Run Query button
```

---

## New Features Summary

| Feature | Behavior | Default |
|---------|----------|---------|
| **Builder Toggle** | Show/hide composition panel | Disabled |
| **On Object Select** | Auto-enable builder | Yes |
| **Default Fields** | Start with which field(s) | Id |
| **Query Tab** | Auto-generated or manual | Auto-generated |
| **Variables Tab** | JSON editor | Empty |
| **Endpoint Tab** | Shows POST URL & details | Always visible |
| **Reload on Change** | Refresh object fields | Yes |

---

## Key Differences from Previous

| Before | After |
|--------|-------|
| Builder toggle in old location | Toggle in header near object name |
| Query preview in separate section | Query in first tab |
| Variables in separate section | Variables in second tab |
| No endpoint visibility | Full endpoint details tab |
| Manual only mode | Guided or manual mode |

---

## Event Handlers

```javascript
graphqlBuilderToggle.change
  → setBuilderVisibility()
  → handleBuilderChange()
  → updateEndpointDisplay()

Tab click events
  → Remove active from all tabs
  → Add active to clicked tab
  → Show/hide tab content

Object selection
  → Enable builder
  → Load fields
  → Generate query
  → Update endpoint
```

---

## CSS Classes Added

```css
.graphql-tabs-container         /* Main tab container */
.graphql-tabs-header            /* Header row with tabs */
.graphql-tab-button             /* Tab button styling */
.graphql-tab-button.active      /* Selected tab (blue underline) */
.graphql-tab-content            /* Content area */
.graphql-tab-content.active     /* Visible content */
.tab-label                      /* "Query", "Variables", etc. */

.endpoint-display               /* Endpoint info grid */
.endpoint-item                  /* Grid row */
.endpoint-key                   /* Left column (labels) */
.endpoint-value                 /* Right column (values) */
.endpoint-value code            /* Code formatting */
```

---

## Files Modified

| File | Changes | Key Areas |
|------|---------|-----------|
| **popup.html** | Restructured right panel | Builder header toggle + Tab interface |
| **popup.css** | ~100 lines | Tab styling + Endpoint display |
| **graphql_helper.js** | ~50 lines | Toggle handling + Tab wiring + Endpoint updates |

---

## Testing Checklist

- [x] Builder toggle works (ON/OFF)
- [x] On object select → builder auto-enabled
- [x] Fields auto-populated with Id
- [x] Query auto-generated
- [x] Tab switching works (Query/Variables/Endpoint)
- [x] Query tab shows generated query
- [x] Variables tab empty and editable
- [x] Endpoint tab shows correct info
- [x] Endpoint updates on object change
- [x] Toggling builder OFF hides left panel
- [x] Toggling builder ON shows left panel
- [x] No duplicate IDs

---

## Ready for Use ✅

The GraphQL builder now has:
- ✅ Builder toggle control
- ✅ Auto-enable on object select
- ✅ Tabbed interface (Query/Variables/Endpoint)
- ✅ Same tab UX as SOQL builder
- ✅ Endpoint visibility
- ✅ Object reload on change

**Status:** Implementation complete and tested

