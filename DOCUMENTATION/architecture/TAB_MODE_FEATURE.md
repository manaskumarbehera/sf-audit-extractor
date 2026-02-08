# Tab Mode Feature - Architecture Documentation

## Overview

The Tab Mode feature provides a flexible way for users to open TrackForcePro in different modes:
- **Popup Mode**: Default extension popup (small window attached to toolbar)
- **Tab Mode**: Full browser tab with all features (single-click behavior)
- **Window Mode**: Standalone popup window (Shift+click behavior)

This feature was introduced in version 1.1.0 to improve workflow flexibility, especially for users who prefer working in browser tabs rather than separate windows.

## Technical Architecture

### Hash-Based Mode Detection

The extension uses URL hash fragments to determine the current operating mode:

| Hash | Mode | Description |
|------|------|-------------|
| (none) | Popup | Default extension popup |
| `#tab` | Tab | Running as a browser tab |
| `#standalone` | Window | Running as a standalone popup window |

```javascript
// Mode detection in popup.js
const isStandalone = window.location.hash.includes('standalone');
const isTab = window.location.hash.includes('tab');
```

### Message Actions

The feature introduces a new Chrome runtime message action:

#### `APP_TAB_OPEN`
Opens TrackForcePro as a new browser tab.

**Request Payload:**
```javascript
{
    action: 'APP_TAB_OPEN',
    session: { instanceUrl, accessToken, ... },  // Optional
    builderState: { endpoint, query, ... }       // Optional
}
```

**Response:**
```javascript
{
    success: true,
    tabId: 99  // The ID of the created tab
}
```

**Implementation (background.js):**
```javascript
if (is('APP_TAB_OPEN')) {
    // Store session and builder state if provided
    if (msg.session) {
        await chrome.storage.local.set({ appSession: msg.session });
    }
    
    // Get active tab to determine insertion index
    const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const insertIndex = activeTab ? activeTab.index + 1 : undefined;
    
    // Create tab adjacent to current tab
    const url = chrome.runtime.getURL('popup.html#tab');
    const newTab = await chrome.tabs.create({ url, active: true, index: insertIndex });
    
    return { success: true, tabId: newTab.id };
}
```

### Click Behavior Matrix

| Current Mode | Click Type | Action | Result |
|--------------|------------|--------|--------|
| Popup | Single-click | `APP_TAB_OPEN` | Opens new tab, closes popup |
| Popup | Shift+click | `APP_POP_SET` | Opens standalone window, closes popup |
| Tab | Single-click | Close tab | Tab removed |
| Standalone | Single-click | `APP_TAB_OPEN` + `APP_POP_SET` | Opens new tab, closes window |

### Button State & Tooltips

The pop button dynamically updates based on the current mode:

| Mode | Icon | Tooltip |
|------|------|---------|
| Popup (not popped) | Pop-out icon | "Open as tab (Shift+click for window)" |
| Popup (popped) | Pop-in icon | "Pop in (return to popup)" |
| Tab | Pop-in icon | "Close tab" |
| Standalone | Pop-in icon | "Pop in (open as tab)" |

### State Transfer

When opening a new tab or window, the extension preserves:

1. **Session Information**: `instanceUrl`, `accessToken`, `isLoggedIn`
2. **Builder State**: Current query, variables, selected object

State is stored in `chrome.storage.local` with instance-specific keys:
```javascript
// Default key (backward compatible)
appSession: { ... }

// Instance-specific key (for multi-org support)
appSession_<base64(instanceUrl)>: { ... }
```

## Flow Diagrams

### Single-Click (Popup → Tab)
```
┌─────────────┐     ┌─────────────────┐     ┌─────────────┐
│   Popup     │────▶│  APP_TAB_OPEN   │────▶│  New Tab    │
│  (click)    │     │  (background)   │     │  #tab mode  │
└─────────────┘     └─────────────────┘     └─────────────┘
                            │
                            ▼
                    ┌─────────────────┐
                    │ Store session   │
                    │ in storage      │
                    └─────────────────┘
```

### Shift+Click (Popup → Window)
```
┌─────────────┐     ┌─────────────────┐     ┌─────────────┐
│   Popup     │────▶│  APP_POP_SET    │────▶│  New Window │
│ (Shift+clk) │     │  popped: true   │     │ #standalone │
└─────────────┘     └─────────────────┘     └─────────────┘
```

### Pop-In (Standalone → Tab)
```
┌─────────────┐     ┌─────────────────┐     ┌─────────────┐
│ Standalone  │────▶│  APP_TAB_OPEN   │────▶│  New Tab    │
│   Window    │     │                 │     │  #tab mode  │
└─────────────┘     └─────────────────┘     └─────────────┘
       │
       ▼
┌─────────────────┐
│  APP_POP_SET    │
│  popped: false  │
└─────────────────┘
       │
       ▼
┌─────────────────┐
│  window.close() │
└─────────────────┘
```

## File Changes

### Modified Files

1. **background.js**
   - Added `APP_TAB_OPEN` message handler
   - Tab creation with adjacent index positioning

2. **popup.js**
   - Updated `attachAppPopHandlers()` with click type detection
   - Updated `updateAppPopButton()` with tab mode support
   - Added `isTab` detection from hash

### New Test File

- **tests/popup_tab_mode.test.js**: Comprehensive tests for:
  - Tab mode detection
  - `APP_TAB_OPEN` message handling
  - Single-click vs Shift+click behavior
  - Tab creation positioning
  - Pop-in from standalone to tab
  - Tab mode close behavior
  - Button state updates
  - Session and state transfer
  - Error handling

## Browser Compatibility

| Feature | Chrome | Edge | Firefox |
|---------|--------|------|---------|
| Tab creation | ✅ | ✅ | ✅ |
| Tab index positioning | ✅ | ✅ | ✅ |
| Window creation | ✅ | ✅ | ✅ |
| Shift key detection | ✅ | ✅ | ✅ |

## Performance Considerations

- Tab creation is faster than window creation
- State transfer via storage is synchronous and lightweight
- Tab index positioning is O(1) operation

## Future Enhancements

1. **Keyboard Shortcut**: Global shortcut to open as tab (Ctrl+Shift+T)
2. **Remember Preference**: Option to default to tab or window mode
3. **Context Menu**: Right-click menu for mode selection
4. **Tab Pinning**: Option to pin the tab automatically

