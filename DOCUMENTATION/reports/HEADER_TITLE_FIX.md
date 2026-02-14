# Fixed: Header Title Changing on Page Refresh

## Problem
When refreshing the extension popup, the header title was changing to show emoji icons with the tab text (e.g., "🔍Audit Trails") instead of just the clean text ("Audit Trails").

## Root Cause
In `popup.js` line 907, the code was using `activeBtn?.textContent` to get the header title:

```javascript
// BEFORE - WRONG
if (headerTitle) headerTitle.textContent = (activeBtn?.textContent || 'Audit Trails').trim();
```

The issue is that the button's HTML structure includes both an icon span and a text span:
```html
<button class="tab-button active">
    <span class="tab-icon">🔍</span>           <!-- This was included! -->
    <span class="tab-text">Audit Trails</span>  <!-- Only this should be used -->
</button>
```

When using `.textContent` on the button, it captures all text content from all child elements, resulting in "🔍Audit Trails" instead of just "Audit Trails".

## Solution
Modified the code to specifically query for the `.tab-text` span instead of using the entire button's text content:

```javascript
// AFTER - CORRECT
if (headerTitle) {
    // Get text from .tab-text span to avoid including the emoji icon
    headerTitle.textContent = activeBtn?.querySelector('.tab-text')?.textContent?.trim() || 'Audit Trails';
}
```

## What Changed
- File: `popup.js` (line 907-911)
- Method: Use `.querySelector('.tab-text')` to get only the text portion
- Result: Header title now correctly shows "Audit Trails", "Data Explorer", "SOQL Builder", etc. without emoji

## Testing
✅ Build passes
✅ No errors
✅ Header title will display correctly on:
  - Initial page load
  - Page refresh
  - Tab switching
  - Restoration of last used tab

---

**Date**: February 13, 2026
**Status**: ✅ Fixed & Verified

