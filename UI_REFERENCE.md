# UI Reference Guide

This document describes the visual appearance and user interface of the Salesforce Audit Trail Extractor.

## 1. Floating Button (Content Script)

### Location
- **Position**: Fixed bottom-right corner
- **Coordinates**: 24px from bottom, 24px from right
- **Z-index**: 999999 (always on top)

### Appearance
```
┌─────────────────────────────────┐
│                                 │
│    Salesforce Page Content     │
│                                 │
│                                 │
│                          ┌────┐ │
│                          │ 📋 │ │ ← Blue circular button
│                          └────┘ │
└─────────────────────────────────┘
```

### Style Details
- **Size**: 56px × 56px (circular)
- **Color**: Gradient blue (#0176d3 to #0b5cab)
- **Icon**: White SVG audit/log icon (28px × 28px)
- **Shadow**: Soft shadow with blue glow
- **Hover Effect**: Scales to 110%, enhanced shadow
- **Active Effect**: Scales to 95%

### Icon SVG
The button contains a document/clipboard icon representing audit logs:
```
┌─────┐
│ ═══ │  ← Represents lines of audit entries
│ ═══ │
│ ═══ │
└─────┘
```

## 2. Dashboard Page (New Tab)

### Layout Overview
```
┌──────────────────────────────────────────────────────────────┐
│ 📋 Setup Audit Trail Dashboard              [Export CSV ↓]  │ ← Header (white bg)
├──────────────────────────────────────────────────────────────┤
│ 🔍 [Search across all columns...]                           │ ← Search bar
│                                                              │
│ Categories: [All (123)] [User Mgmt (45)] [Security (23)]   │ ← Filter chips
│             [Object/Field (32)] [Email (8)] [Other (15)]    │
├──────────────────────────────────────────────────────────────┤
│ Date          │ User      │ Action │ Section │ Display      │ ← Table header
├───────────────┼───────────┼────────┼─────────┼──────────────┤
│ Oct 19, 10:30 │ John Doe  │ Update │ Users   │ Changed...   │
│ Oct 19, 09:15 │ Jane Smith│ Create │ Profiles│ Created...   │
│ Oct 18, 16:45 │ Bob Wilson│ Delete │ Objects │ Removed...   │
│ ...           │ ...       │ ...    │ ...     │ ...          │
└──────────────────────────────────────────────────────────────┘
```

### Color Scheme

**Primary Colors**:
- Salesforce Blue: `#0176d3`
- Dark Blue: `#0b5cab`
- Background: `#f3f4f6` (light gray)
- White: `#ffffff`

**Text Colors**:
- Primary: `#1f2937` (dark gray)
- Secondary: `#6b7280` (medium gray)
- Headers: `#0176d3` (blue)

**Category Badge Colors**:
- User Management: Light blue (`#dbeafe` bg, `#1e40af` text)
- Security: Light yellow (`#fef3c7` bg, `#92400e` text)
- Object/Field: Light green (`#d1fae5` bg, `#065f46` text)
- Email: Light purple (`#e0e7ff` bg, `#3730a3` text)
- Other: Light gray (`#f3f4f6` bg, `#4b5563` text)

### Component Details

#### Header Section
```
┌────────────────────────────────────────────────────┐
│ 📋 Setup Audit Trail Dashboard                    │
│                                  [📥 Export CSV]   │
└────────────────────────────────────────────────────┘
```
- Background: White with subtle shadow
- Border radius: 12px
- Padding: 20px 24px
- Title: 24px, bold, blue (#0176d3)

#### Search Bar
```
┌────────────────────────────────────────────────────┐
│ 🔍 Search across all columns...                   │
└────────────────────────────────────────────────────┘
```
- Border: 2px solid light gray
- Border radius: 8px
- Padding: 12px 16px
- Focus: Blue border (#0176d3)

#### Filter Chips
```
┌─────────┐ ┌────────────────┐ ┌────────────┐
│ All (45)│ │User Mgmt (12) │ │Security (8)│  ...
└─────────┘ └────────────────┘ └────────────┘
  Active       Inactive           Inactive
 (blue bg)   (white bg)         (white bg)
```
- Border radius: 20px (pill shape)
- Padding: 8px 16px
- Border: 2px solid
- Active state: Blue background, white text
- Inactive state: White background, gray border
- Hover: Light blue background

#### Table
```
┌─────────────┬──────────┬─────────┬─────────┬──────────┬───────────┬──────────┐
│ Date        │ User     │ Action  │ Section │ Display  │ Delegate  │ Category │
├─────────────┼──────────┼─────────┼─────────┼──────────┼───────────┼──────────┤
│ Oct 19 10:30│ John Doe │ Update  │ Users   │ Changed..│ -         │ USER MGMT│
│ Oct 19 09:15│ Jane S.  │ Create  │ Profile │ Created..│ -         │ USER MGMT│
│ Oct 18 16:45│ Bob W.   │ Delete  │ Objects │ Removed..│ -         │ OBJ/FIELD│
└─────────────┴──────────┴─────────┴─────────┴──────────┴───────────┴──────────┘
```
- Header: Light gray background (#f9fafb)
- Header text: Uppercase, medium gray
- Rows: White background
- Hover: Light gray background
- Border: Light gray (1px)
- Category badges: Colored pills (see color scheme above)

### Loading State
```
┌────────────────────────────────────┐
│                                    │
│             ⟳ (spinning)           │
│    Loading audit trail data...    │
│                                    │
└────────────────────────────────────┘
```
- Centered spinner (blue)
- Gray text below
- White background with shadow

### Error State
```
┌────────────────────────────────────────────┐
│ ⚠️ Error: Could not load audit trail data │
│ Make sure you're logged into Salesforce   │
│ and have permission to view audit trail.  │
└────────────────────────────────────────────┘
```
- Light red background (#fef2f2)
- Dark red text (#991b1b)
- Red border (#fecaca)

### Empty State
```
┌────────────────────────────────────┐
│  No records match your filters    │
└────────────────────────────────────┘
```
- Gray text, centered in table
- Shows when search/filters return no results

## 3. Responsive Behavior

### Desktop (> 1024px)
- Full width up to 1400px max
- All columns visible
- Chips on single row

### Tablet (768px - 1024px)
- Slightly reduced margins
- Table scrolls horizontally if needed
- Chips may wrap to multiple rows

### Mobile (< 768px)
- Not optimized (extension targets desktop Chrome)
- Table requires horizontal scroll
- Stacked controls

## 4. Interactions

### Hover Effects
1. **Floating Button**: Scale up + enhanced shadow
2. **Export Button**: Darker blue + slight lift
3. **Filter Chips**: Light blue background
4. **Table Rows**: Light gray background

### Click Effects
1. **Floating Button**: Opens new tab
2. **Export Button**: Downloads CSV file
3. **Filter Chips**: Toggle active state
4. **Search**: Real-time filtering

### Focus States
- **Search Input**: Blue border (#0176d3)
- **Buttons**: Subtle outline

## 5. Animations

### Smooth Transitions
- Button hover: 0.3s ease
- Chip state: 0.2s ease
- Table row hover: 0.2s ease

### Loading Spinner
- Continuous rotation (1s per rotation)
- Blue border on top
- Gray border on other sides

## 6. Accessibility

### Screen Readers
- Semantic HTML (header, main, table)
- Proper ARIA labels on interactive elements
- Alt text for icons

### Keyboard Navigation
- Tab through interactive elements
- Enter to activate buttons
- Escape (future enhancement)

## 7. Browser Compatibility

### Tested On
- Chrome 88+ ✅
- Edge 88+ ✅ (Chromium-based)

### Not Supported
- Firefox ❌ (requires Manifest V2 modifications)
- Safari ❌ (different extension system)

---

**Note**: This is a text-based reference. For actual screenshots, load the extension in Chrome and use the provided test guide to explore the UI.
