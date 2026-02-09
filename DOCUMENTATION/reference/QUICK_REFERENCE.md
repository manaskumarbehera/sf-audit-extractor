# TrackForcePro - Visual Quick Reference Card

## GraphQL Builder

### Screen 1: Object Selection
```
┌─────────────────────────────────────────┐
│ Select an Object                        │
├─────────────────────────────────────────┤
│ 🔍 [Search objects...]                  │
│                                         │
│ ┌──────────┐ ┌──────────┐ ┌──────────┐ │
│ │📦Account │ │📦Contact │ │📦 Lead   │ │
│ └──────────┘ └──────────┘ └──────────┘ │
│                                         │
│ [⟳ Refresh] [Advanced]                  │
└─────────────────────────────────────────┘
```

**Action:** Click object → Builder enables

---

## Screen 2: Query Builder
```
HEADER:
← GraphQL: Account    [✓] Builder   Ready

LEFT PANEL              RIGHT PANEL (Tabs)
───────────────────     ──────────────────
FIELDS                  [Query][Variables][Endpoint]
  ☐ Id                  
  ☑ Name                query {
  + Add                   uiapi {
                            query {
FILTERS                       Account(first: 50) {
  + Filter                      edges {
                                  node {
ORDER BY                          Id
  Field, Desc                     Name
                                }
PAGINATION                      }
  Limit: 50                   }
  Offset: 0               }

[Run Query] [Clear]
```

**Actions:** 
- Add fields → Query auto-updates
- Click tabs → Switch views
- Toggle builder → Hide left panel

---

## Screen 3: Results
```
← Results: Account     [🗑]
─────────────────────────────────
endCursor: abc... hasNextPage: true
[Use endCursor] [Clear Cursor]

┌─────────────────────────────┐
│ ▼ Account #1: Acme Corp    │
│   Id: 001...               │
│   Name: Acme Corp          │
└─────────────────────────────┘

[← Previous] [Page 1 of 3] [Next →]
[Edit Query] [Reset]
```

**Actions:**
- Click result → Expand/collapse
- Click Edit → Back to builder
- Click Reset → Back to objects

---

## Tab Details

### Tab 1: Query
```
[Query] [Variables] [Endpoint]
────────────────────────────────
GraphQL query (auto-generated or manual)

query {
  uiapi {
    query {
      Account(first: 50) {
        edges { node { Id Name } }
      }
    }
  }
}
```

### Tab 2: Variables
```
[Query] [Variables] [Endpoint]
────────────────────────────────
{}

(Edit JSON for variables)
```

### Tab 3: Endpoint
```
[Query] [Variables] [Endpoint]
────────────────────────────────
Endpoint:     /services/data/v63.0/graphql
Method:       POST
Content-Type: application/json
Body Size:    245 bytes
Object:       Account
```

---

## State Diagram

```
             Open GraphQL
                  ↓
          [Object Selection] ← [Toggle Reset]
              ↓ (click)            ↑
         [Auto-Enable]        [Click Reset]
              ↓                    ↑
        [Query Builder] ←────────────
            ↓ (Run)
         [Results]
            ↓ (Edit)
       Back to Builder
```

---

## Feature Toggle Reference

| Control | Default | State | Result |
|---------|---------|-------|--------|
| Builder Toggle | ✗ OFF | Click → ON | Left panel shows |
| Builder Toggle | ✓ ON | Click → OFF | Left panel hides |
| Object Select | - | Click card | Builder ON, Id added |
| Field Chip | - | Click ✕ | Field removed, query updates |
| Add Filter | - | Click + | Filter row added |
| Tab Button | Query | Click | Content switches |

---

## Hot Keys & Shortcuts

| Action | Windows | Mac |
|--------|---------|-----|
| Copy | Ctrl+C | Cmd+C |
| Paste | Ctrl+V | Cmd+V |
| Select All | Ctrl+A | Cmd+A |
| Search | Ctrl+F | Cmd+F |

---

## Time-to-Value

```
Task                          Time
─────────────────────────────────
Open GraphQL Tab             0s
Load Objects                 1s
Select Object                2s
Builder Enables              0s
Add Field                    3s
Check Query                  4s
Run Query                    5s
View Results                 6s
```

**Total: ~6 seconds from start to results**

---

## Performance Metrics

| Metric | Before | After | Improvement |
|--------|--------|-------|-------------|
| Initial Load | 10-30s | 1-2s | **95% faster** |
| Cache Size | 5+ MB | ~1 MB | **80% less** |
| Per-Object | N/A | 100 KB | **Efficient** |
| Cache TTL | 6 hours | 5 min | **Fresh data** |

---

## Status Messages

| Message | Meaning | Action |
|---------|---------|--------|
| "Builder disabled..." | Builder OFF | Click toggle to enable |
| "Builder ready" | Builder ON | Compose query |
| "Loading fields..." | Fetching object | Wait 1-2 sec |
| "Schema: on-demand" | Using cache | System ready |
| "Run a GraphQL query..." | No results yet | Click Run Query |

---

## Keyboard Flows

### Flow 1: Quick Search & Select
```
1. Open GraphQL Tab
2. Type object name (search)
3. Enter → Select first match
4. Start building
```

### Flow 2: Manual Query
```
1. Select any object
2. Toggle Builder OFF
3. Click Query tab
4. Paste query
5. Click Run Query
```

### Flow 3: Add Variables
```
1. Build query
2. Click Variables tab
3. Type JSON vars
4. Run Query (vars sent)
```

---

## Common Patterns

### Pattern 1: Find & Filter
```
1. Search "Account"
2. Select Account
3. Add "Name" field
4. Add filter: Name = "Acme"
5. Run → See filtered results
```

### Pattern 2: Pagination
```
1. Run first query
2. See "endCursor" in results
3. Click "Use endCursor"
4. Run again → Next batch
5. Repeat until done
```

### Pattern 3: Manual Override
```
1. Builder creates query
2. Need to modify
3. Disable builder
4. Edit query directly
5. Run modified query
```

---

## Error Reference

| Error | Cause | Fix |
|-------|-------|-----|
| Objects not loading | Salesforce not logged in | Login to Salesforce |
| Fields empty | Object not selected | Select object |
| Invalid JSON | Variables syntax error | Check JSON syntax |
| Query error | Missing field | Check object fields |
| No results | Query returns empty | Verify where clause |

---

## Storage & Caching

```
Cache Types:
├── Objects List (1 MB, 5 min)
│   └─ Used: On tab open
│
├── Account Fields (100 KB, 5 min)
│   └─ Used: When Account selected
│
├── Contact Fields (100 KB, 5 min)
│   └─ Used: When Contact selected
│
└─ (Total: ~1 MB, refreshes automatically)
```

---

## Browser Support

- ✅ Chrome/Chromium (latest)
- ✅ Firefox (latest)
- ✅ Safari (latest)
- ✅ Edge (latest)
- ✅ Mobile browsers

---

## Tips & Tricks

**💡 Tip 1:** Fields cached 5 min, auto-refresh on change
**⚡ Tip 2:** Use filters to reduce data, faster queries
**📋 Tip 3:** Copy Query tab with Ctrl+A, Ctrl+C
**🔄 Tip 4:** Pagination with endCursor for large datasets
**🎯 Tip 5:** Toggle builder to hide composition panel
**✏️ Tip 6:** Disable builder to manually edit queries

---

## Documentation Index

| Guide | Pages | Focus | Audience |
|-------|-------|-------|----------|
| 01-Progressive Disclosure | 5 | Screens & navigation | Beginners |
| 02-Builder Toggle | 5 | Enable/disable | Intermediate |
| 03-Tabbed Interface | 6 | Query/Vars/Endpoint | Intermediate |
| 04-On-Demand Schema | 7 | Performance | Advanced |
| README | 3 | Overview | Everyone |

**Total:** 26 pages of comprehensive documentation

---

## Data Explorer Quick Reference

### Sandbox & Favicon Manager
```
┌─────────────────────────────────────────┐
│ Organization Info                       │
├─────────────────────────────────────────┤
│ Name: My Dev Sandbox                    │
│ ID: 00D5g0000012345AAA                 │
│ Type: Developer Edition [SANDBOX]       │
│ Instance: CS42                          │
└─────────────────────────────────────────┘

┌─────────────────────────────────────────┐
│ Custom Favicon                          │
├─────────────────────────────────────────┤
│ Color: [🟢] [Preset: Green (Dev) ▼]    │
│ Label: [DEV___]  (max 3 chars)         │
│ Preview: [☁️ DEV]                       │
│                                         │
│ [Apply Favicon] [Reset]                │
│ ✓ Editing existing favicon             │
└─────────────────────────────────────────┘

┌─────────────────────────────────────────┐
│ Saved Favicons                          │
├─────────────────────────────────────────┤
│ [☁️DEV] Dev Sandbox      [CURRENT] [🗑]│
│ [☁️UAT] UAT Sandbox               [🗑] │
│ [☁️PRD] Production                [🗑] │
└─────────────────────────────────────────┘
```

### Favicon Color Presets

| Color | Hex | Suggested Use |
|-------|-----|---------------|
| 🔴 Red | #ff6b6b | Production |
| 🟢 Green | #51cf66 | Development |
| 🔵 Blue | #339af0 | UAT |
| 🟡 Yellow | #fcc419 | QA |
| 🟣 Purple | #9775fa | Staging |
| 🟠 Orange | #ff922b | Hotfix |

### User Manager
```
┌─────────────────────────────────────────┐
│ Current User                            │
├─────────────────────────────────────────┤
│ Name: John Smith [Active]               │
│ Email: john.smith@example.com           │
│ Profile: System Administrator           │
│ Role: CEO                               │
│ Language: English (US)                  │
│ Last Login: 2/8/2026                   │
└─────────────────────────────────────────┘

┌─────────────────────────────────────────┐
│ Search & Update Users                   │
├─────────────────────────────────────────┤
│ Search: [john_________] [Search]        │
│                                         │
│ Results:                                │
│ ✓ John Smith (john@example.com) [Select]│
│ ✓ Johnny Doe (johnny@example.com)[Select]│
│                                         │
│ Selected: John Smith                    │
│ Profile:  [System Administrator ▼]      │
│ Role:     [CEO ▼]                       │
│ Language: [English (US) ▼]              │
│ [Update User] [Clear]                   │
└─────────────────────────────────────────┘
```

### Record Scanner (Unified)
```
┌─────────────────────────────────────────────────────────────────────────────┐
│ [Search ID...🔍] [⟲ Detect]                                                │
├──────────────┬──────────────────────────────────────────────┬───────────────┤
│ 🕐 Recent    │ 📄 Record Details                            │ 🛠️ Dev Tools │
│ ─────────── │ ┌────────────────────────────────────────────┐│ ────────────│
│ Acc: Acme 2m│ │ [Account] Acme Corporation                 ││ ⚙️ Setup    │
│ Con: Jane 5m│ │ ID: 0015g00000ABC 📋                       ││ 🖥️ Console  │
│ Lead: John  │ │ Created: Admin | Modified: 2/9/26          ││ 📦 Objects  │
│ [✕ Clear]   │ │ [🔗 Open] [📋 Link] [📋 ID]                ││ 📋 Logs     │
│             │ └────────────────────────────────────────────┘│ ────────────│
│             │ 📜 Field History ▼                            │ Record Tools│
│             │ ┌────────────────────────────────────────────┐│ 📦 Obj Setup│
│             │ │ Status: Open → Closed                      ││ 🔍 SOQL     │
│             │ │   👤 Admin | 📅 2/9/26 10:30              ││ 📋 Copy     │
│             │ │ Priority: Medium → High                    ││ {} API      │
│             │ │   👤 Admin | 📅 2/8/26 15:22              ││ ────────────│
│             │ └────────────────────────────────────────────┘│ History     │
│             │ 🔗 Related Records ▼                          │ ⟲ Refresh   │
│             │ ┌────────────────────────────────────────────┐│ 📥 Export   │
│             │ │ ▶ Contacts (3)                             ││             │
│             │ │ ▶ Opportunities (5)                        ││ ID Prefixes │
│             │ │ ▶ Cases (2)                                ││ 001=Acc     │
│             │ └────────────────────────────────────────────┘│ 003=Con     │
└──────────────┴──────────────────────────────────────────────┴───────────────┘
```

### ID Validation Rules

| Length | Format | Valid |
|--------|--------|-------|
| 15 chars | Alphanumeric | ✓ |
| 18 chars | Alphanumeric | ✓ |
| < 15 chars | Any | ✗ |
| > 18 chars | Any | ✗ |
| Special chars | Any | ✗ |

### Status Messages Reference

| Message | Type | Meaning |
|---------|------|---------|
| "Favicon saved & applied!" | Success | Favicon saved and visible |
| "Favicon saved. Refresh Salesforce page..." | Success | Saved but needs page refresh |
| "Favicon saved! Will apply when you visit this org." | Success | Saved for later |
| "Favicon removed for [Org]" | Success | Deletion complete |
| "Not Connected" | Info | Navigate to Salesforce org |
| "Could not determine current org" | Error | Session issue |
| "No Record ID detected" | Info | Not on a record page |
| "Invalid ID length" | Error | ID must be 15 or 18 chars |

---

**Version:** 1.1.1 | **Date:** Feb 8, 2026 | **Status:** ✅ Complete

