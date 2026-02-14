# Audit Column Width Settings

## Overview
Added settings to configure the column width for the Org and Favicon sections in the Audit Trails tab.

## Changes Made

### 1. `settings_helper.js`
- **Added default settings retrieval** (lines 176-177):
  - `auditOrgColumnWidth`: 120 (default width in pixels)
  - `auditFaviconColumnWidth`: 40 (default width in pixels)

- **Added audit tab (sf) to sub-settings** (line 192):
  - Updated `hasSubSettings` to include `'sf'` tab
  - Added HTML form for column width configuration with number inputs

- **Added event listeners** (lines 307-320):
  - Change event listeners for both column width inputs
  - Saves values to Chrome storage on change
  - Dispatches 'audit-settings-changed' event when settings are modified

- **Added getter functions** (lines 551-562):
  - `getAuditOrgColumnWidth()`: Returns org column width (default 120px)
  - `getAuditFaviconColumnWidth()`: Returns favicon column width (default 40px)

- **Exported new functions** (lines 594-595):
  - Added `getAuditOrgColumnWidth` to `window.SettingsHelper`
  - Added `getAuditFaviconColumnWidth` to `window.SettingsHelper`

### 2. `popup.css`
- **Added number input styling** (lines 8181-8200):
  - `.sub-setting-item input[type="number"]`: Base styling for number inputs
  - Hover and focus states with primary color theme
  - Proper spacing and alignment (80px width)
  
- **Added label styling** (lines 8201-8203):
  - `.sub-setting-label`: Styled labels for settings with minimum width of 180px

## Usage

### In Settings Panel
Users can now access these settings in the **Settings** tab under the **Audit Trails** section:
1. Click the Settings tab (⚙️ icon)
2. Expand the "Audit Trails" accordion item
3. Adjust the sliders:
   - **Org Column Width (px)**: Range 20-300px, step 10px
   - **Favicon Column Width (px)**: Range 20-100px, step 5px

### Accessing Settings from Code
```javascript
// Get current audit org column width
const orgWidth = await SettingsHelper.getAuditOrgColumnWidth();

// Get current audit favicon column width  
const faviconWidth = await SettingsHelper.getAuditFaviconColumnWidth();
```

### Event Listening
Listen for settings changes:
```javascript
document.addEventListener('audit-settings-changed', () => {
  // Re-apply column widths or refresh UI
});
```

## Storage
Settings are stored in Chrome's `local` storage with keys:
- `auditOrgColumnWidth`: numeric value (pixels)
- `auditFaviconColumnWidth`: numeric value (pixels)

## Default Values
- **Org Column Width**: 120 pixels
- **Favicon Column Width**: 40 pixels

## CSS Variables Used
- `--primary`: #0176d3 (Salesforce blue for themed elements)
- `--border-color`: #e9ecef (borders)
- Various grayscale colors for backgrounds and text

## Integration Notes
To fully utilize these settings in the UI, the `audit_helper.js` or related rendering logic should:
1. Listen for the 'audit-settings-changed' event
2. Apply CSS variables or inline styles to configure column widths dynamically
3. Re-render the audit logs table with the new width values

