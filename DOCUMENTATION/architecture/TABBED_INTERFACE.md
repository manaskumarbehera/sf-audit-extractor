# GraphQL UI - Feature 3: Tabbed Interface (Query/Variables/Endpoint)

## Overview

The **Tabbed Interface** provides three tabs for managing your GraphQL request, similar to SOQL query builder. Each tab shows different aspects of your query.

## Three Tabs

### Tab 1: Query

**Purpose:** View and edit the GraphQL query

**What You See:**
```
[Query] [Variables] [Endpoint]
────────────────────────────────
GraphQL Query

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

**How to Use:**

**View Auto-Generated Query:**
1. Select object in builder
2. Add fields and options
3. Click "Query" tab (or it's default view)
4. See the generated GraphQL
5. It updates in real-time as you change fields

**Manual Edit:**
1. Click in textarea
2. Edit the query directly
3. Your changes are preserved
4. Can paste existing queries

**Copy Query:**
1. Select all text (Ctrl+A / Cmd+A)
2. Copy (Ctrl+C / Cmd+C)
3. Use elsewhere

---

### Tab 2: Variables

**Purpose:** Provide JSON variables for your query

**What You See:**
```
[Query] [Variables] [Endpoint]
────────────────────────────────
Variables (JSON)

{}
```

**How to Use:**

**Default (Empty):**
- Starts empty: `{}`
- Ready for you to add variables

**Add Variables:**
1. Click in textarea
2. Type JSON variables
3. Example: `{"limit": 100}`
4. Variables sent with query when running

**Variable Format:**
```json
{
  "limit": 100,
  "offset": 0,
  "searchTerm": "Acme",
  "ids": ["001", "002", "003"]
}
```

**Validation:**
- Syntax validated on blur (when you click away)
- Invalid JSON shows error message
- Valid JSON gets pretty-printed automatically

**When Used:**
- Variables sent to Salesforce when clicking "Run Query"
- Can be empty `{}` if not using variables

---

### Tab 3: Endpoint

**Purpose:** Show GraphQL endpoint details and metadata

**What You See:**
```
[Query] [Variables] [Endpoint]
────────────────────────────────
Endpoint & Details

Endpoint:     /services/data/v63.0/graphql
Method:       POST
Content-Type: application/json
Body Size:    245 bytes
Object:       Account
```

**Information Displayed:**

| Item | Details | Example |
|------|---------|---------|
| **Endpoint** | GraphQL API path | `/services/data/v63.0/graphql` |
| **Method** | HTTP method | `POST` |
| **Content-Type** | Request content type | `application/json` |
| **Body Size** | Calculated request size | `245 bytes` |
| **Object** | Selected SObject name | `Account` |

**How to Use:**

**Understanding Endpoint:**
- Shows exactly where your query will be sent
- Version changes based on your settings
- Always POST method for GraphQL

**Monitoring Body Size:**
- Real-time calculation
- Updates as you add fields/filters
- Helpful for large queries

**Tracking Selected Object:**
- Always shows current object
- Changes when you select different object
- Useful for verification

**When It Updates:**
- When you select an object
- When you add/remove fields
- When you add/remove filters
- When variables change

---

## Tab Switching

### How to Switch Tabs

**Click Tab Button:**
```
[Query]      [Variables]      [Endpoint]
  ↑ Click any to switch
```

**Visual Feedback:**
- Active tab has blue underline
- Active tab background is white
- Inactive tabs are gray
- Content changes instantly

### Default Tab

- First load: **Query** tab active
- Usually shows auto-generated query

---

## Content Management

### Query Tab Auto-Updates

When builder is **enabled** and you:
- ✓ Add field → Query updates
- ✓ Remove field → Query updates
- ✓ Add filter → Query updates
- ✓ Change pagination → Query updates

### Variables Tab Static

- Only updates when you manually edit
- Not auto-populated from builder
- Separate from query

### Endpoint Tab Real-Time

Updates automatically for:
- Object selection changes
- Body size calculations
- Version changes (if you change API version)

---

## Working with Tabs

### Typical Workflow

```
1. Select object
   ↓
2. Add fields/filters (Query tab updates)
   ↓
3. Optionally add variables (Variables tab)
   ↓
4. Check endpoint details (Endpoint tab)
   ↓
5. Click "Run Query"
```

### Manual Query Mode

```
1. Disable builder (toggle OFF)
   ↓
2. Click Query tab
   ↓
3. Paste or write GraphQL manually
   ↓
4. Add variables if needed (Variables tab)
   ↓
5. Check endpoint (Endpoint tab)
   ↓
6. Click "Run Query"
```

---

## Tab Content Behavior

### Query Tab
- **Auto-generated:** When builder enabled
- **Manual editable:** Always
- **Validates syntax:** Shows issues

### Variables Tab
- **Always editable:** Even if builder disabled
- **Validates JSON:** On blur
- **Optional:** Can be empty

### Endpoint Tab
- **Read-only:** For reference only
- **Auto-updated:** Always reflects current state
- **Information only:** Cannot edit here

---

## Examples

### Example 1: Simple Account Query

**Scenario:** Get Account names

**Tab: Query**
```graphql
query {
  uiapi {
    query {
      Account(first: 50) {
        edges {
          node {
            Id
            Name { value }
          }
        }
      }
    }
  }
}
```

**Tab: Variables**
```json
{}
```

**Tab: Endpoint**
```
Endpoint:     /services/data/v63.0/graphql
Method:       POST
Content-Type: application/json
Body Size:    189 bytes
Object:       Account
```

---

### Example 2: Query with Filters and Variables

**Scenario:** Find Accounts with sales amount > threshold

**Tab: Query**
```graphql
query {
  uiapi {
    query {
      Account(first: 50, where: { AnnualRevenue: { gt: {value} } }) {
        edges {
          node {
            Id
            Name { value }
            Industry { value }
            AnnualRevenue { value }
          }
        }
      }
    }
  }
}
```

**Tab: Variables**
```json
{
  "minRevenue": 1000000
}
```

**Tab: Endpoint**
```
Endpoint:     /services/data/v63.0/graphql
Method:       POST
Content-Type: application/json
Body Size:    328 bytes
Object:       Account
```

---

## Tips & Tricks

**Quick Copy:** Select all Query tab content and copy with Ctrl+C

**Validate Before Run:** Check Variables tab for valid JSON before running

**Compare:** Switch between tabs to understand full request

**Monitor Size:** Keep eye on body size in Endpoint tab

**Version Check:** Verify correct API version in Endpoint tab

---

## Troubleshooting

**Query not updating?**
- Check if builder is enabled
- Try toggling builder OFF/ON
- Manual edits override auto-generation

**Variables not valid?**
- Check JSON syntax (use online JSON validator)
- Common issues: missing comma, trailing comma, single quotes

**Endpoint not showing?**
- Make sure object is selected
- Try selecting different object
- Refresh page

**Can't switch tabs?**
- Try clicking tab button again
- Check for JavaScript errors in console
- Refresh page

---

## Related Features

See also:
- [Progressive Disclosure](01-PROGRESSIVE_DISCLOSURE.md)
- [Builder Toggle](02-BUILDER_TOGGLE.md)
- [On-Demand Schema Loading](04-ON_DEMAND_SCHEMA.md)

