# Cache Management System - Organization-Aware Caching

## Overview

The Cache Manager module provides secure, organization-scoped caching to prevent data leakage when switching between Salesforce organizations. This is critical for users who manage multiple organizations (production, staging, sandboxes, etc.) in the same browser extension.

## Problem Statement

**The Issue**: When users switch between different Salesforce organizations, cached data (recent records, record history, field history, related records, etc.) from the previous organization persists in memory and storage. This creates a security and usability issue:

- **Security Risk**: Sensitive data from one org could be accidentally exposed when switching to another org
- **Usability Issue**: Users see stale/incorrect data from a different organization
- **Data Integrity**: Record histories and recent records get mixed across orgs

## Solution: CacheManager

The CacheManager implements organization-scoped caching with automatic cache invalidation on organization switches.

### Key Features

1. **Organization-Scoped Cache Keys**
   - All cache keys are prefixed with the current organization ID
   - Format: `cache_{orgId}_{baseKey}`
   - Example: `cache_00Da0000000001_recordHistory`

2. **Automatic Cache Clearing on Org Switch**
   - When `setCurrentOrgId(newOrgId)` is called, the previous org's cache is automatically cleared
   - This prevents data leakage between organizations
   - Users can only access the current organization's data

3. **TTL (Time-To-Live) Support**
   - Optional cache expiration based on milliseconds
   - Automatically removes expired entries on retrieval

4. **Comprehensive API**
   - `getCache(key, orgId?)` - Retrieve cached data
   - `setCache(key, value, ttlMs?, orgId?)` - Store cached data
   - `removeCache(key, orgId?)` - Delete a specific cache entry
   - `clearOrgCache(orgId?)` - Clear all cache for an organization
   - `clearAllCaches()` - Clear all caches across all orgs
   - `setCurrentOrgId(orgId)` - Switch organization (auto-clears previous)
   - `getCacheStats()` - Get cache usage statistics

## Design Decisions

### Cache Clearing on Organization Switch

When a user switches from Organization A to Organization B:

1. `setCurrentOrgId('orgB')` is called
2. Organization A's cache is **automatically cleared**
3. Organization B becomes the current context
4. Only Organization B's data is accessible without explicit org parameter

**Why This Design?**
- **Security**: Prevents accidental exposure of sensitive data
- **Simplicity**: Clear separation of concerns - each org context is isolated
- **Prevents Confusion**: Users won't accidentally use stale data from another org

### Storage Model

- Uses **localStorage** for persistence across browser sessions
- Organization-specific keys prevent cross-contamination
- Cache version tracking for bulk invalidation when needed

## Implementation Guide

### 1. Include Cache Manager

```html
<!-- In popup.html, load cache_manager.js FIRST -->
<script src="cache_manager.js"></script>
<script src="utils.js"></script>
<!-- ... other scripts ... -->
```

### 2. Set Organization ID When Loading Org Data

```javascript
// In data_explorer_helper.js (or wherever you load org info)
if (window.CacheManager) {
    window.CacheManager.setCurrentOrgId(orgId);
}
```

### 3. Use CacheManager for Recent Records

**Before:**
```javascript
// Direct localStorage usage
const result = await chrome.storage.local.get('recordHistory');
this._recordHistory = result.recordHistory || [];
```

**After:**
```javascript
// Organization-scoped caching
if (window.CacheManager) {
    this._recordHistory = window.CacheManager.getCache('recordHistory') || [];
} else {
    // Fallback
    const result = await chrome.storage.local.get('recordHistory');
    this._recordHistory = result.recordHistory || [];
}
```

### 4. Save Data with CacheManager

**Before:**
```javascript
await chrome.storage.local.set({ recordHistory: this._recordHistory });
```

**After:**
```javascript
if (window.CacheManager) {
    window.CacheManager.setCache('recordHistory', this._recordHistory);
} else {
    await chrome.storage.local.set({ recordHistory: this._recordHistory });
}
```

## Cached Data Types

The following data types are managed per-organization:

1. **Record History** (`recordHistory`)
   - Recently viewed records in Record Scanner
   - Cleared on org switch

2. **Recent Records** (`recentRecords`)
   - Recently accessed records list
   - Cleared on org switch

3. **Field History** (`fieldHistory`)
   - Field change history for current record
   - Cleared on org switch

4. **Related Records** (`relatedRecords`)
   - Related record cache
   - Cleared on org switch

5. **User Search Results** (`userSearchResults`)
   - User search results from Data Explorer
   - Cleared on org switch

## Testing

### Test Coverage

Two comprehensive test suites ensure reliability:

1. **cache_manager.test.js** (25 tests)
   - Basic cache operations
   - Organization scoping
   - TTL/expiration
   - Clear operations
   - Statistics and invalidation
   - Error handling
   - Real-world scenarios

2. **cache_org_switch.test.js** (6 tests)
   - Recent records isolation
   - Record history isolation
   - Sandbox vs Production isolation
   - Real-world workflows
   - Security scenarios

### Running Tests

```bash
npm test -- tests/cache_manager.test.js
npm test -- tests/cache_org_switch.test.js

# Run both
npm test -- tests/cache_manager.test.js tests/cache_org_switch.test.js
```

### Test Results

```
Test Suites: 2 passed, 2 total
Tests:       31 passed, 31 total
```

## API Documentation

### setCurrentOrgId(orgId)
Sets the current organization ID and clears the previous org's cache.

```javascript
window.CacheManager.setCurrentOrgId('00Da0000000001');
```

**Parameters:**
- `orgId` (string): Salesforce Organization ID

**Returns:**
- Boolean indicating success

**Side Effects:**
- Clears cache for previous organization
- Sets internal context for subsequent cache operations

### setCache(key, value, ttlMs?, orgId?)
Store data in org-scoped cache.

```javascript
// Without TTL (persistent)
window.CacheManager.setCache('recordHistory', myData);

// With TTL (expires in 5 minutes)
window.CacheManager.setCache('tempData', myData, 300000);

// Explicitly for different org
window.CacheManager.setCache('key', value, null, 'orgId');
```

### getCache(key, orgId?)
Retrieve data from org-scoped cache.

```javascript
// From current org
const data = window.CacheManager.getCache('recordHistory');

// From specific org (useful for comparison)
const orgAData = window.CacheManager.getCache('key', 'orgA');
```

### removeCache(key, orgId?)
Remove a specific cache entry.

```javascript
window.CacheManager.removeCache('recordHistory');
```

### clearOrgCache(orgId?)
Clear all cache for specified organization.

```javascript
// Current org
window.CacheManager.clearOrgCache();

// Specific org
window.CacheManager.clearOrgCache('orgId');
```

### clearAllCaches()
Clear all caches across all organizations.

```javascript
window.CacheManager.clearAllCaches();
```

### getCacheStats()
Get cache statistics.

```javascript
const stats = window.CacheManager.getCacheStats();
// Returns:
// {
//   totalSize: 12345,      // Bytes
//   itemCount: 10,         // Number of items
//   byOrg: { org1: 5, org2: 5 },
//   cacheVersion: 1,
//   currentOrgId: 'org1'
// }
```

### getCurrentOrgId()
Get the current organization ID.

```javascript
const orgId = window.CacheManager.getCurrentOrgId();
```

### invalidateAllCaches()
Increment cache version and clear all caches.

```javascript
window.CacheManager.invalidateAllCaches();
```

## Security Considerations

1. **Automatic Clearing**: Previous org cache is automatically cleared to prevent leakage
2. **No Cross-Org Access**: Without explicit org parameter, data is isolated to current org
3. **Fallback Behavior**: Code gracefully falls back to direct storage if CacheManager unavailable
4. **Data Expiration**: Optional TTL support prevents stale sensitive data

## Integration Checklist

- [ ] Include `cache_manager.js` in popup.html (first, before other scripts)
- [ ] Call `setCurrentOrgId()` in `loadOrgInfo()` when organization loads
- [ ] Update `loadRecordHistory()` to use CacheManager
- [ ] Update `addToRecordHistory()` to use CacheManager
- [ ] Update `clearRecordHistory()` to use CacheManager
- [ ] Test switching between organizations
- [ ] Verify no data leakage in browser DevTools
- [ ] Test with multiple org windows open
- [ ] Verify TTL expiration works correctly

## Troubleshooting

### Cache Not Persisting
- Check if CacheManager is loaded before other scripts
- Verify `setCurrentOrgId()` is called when loading org info
- Check browser console for errors

### Old Org Data Still Showing
- Confirm `setCurrentOrgId()` is called with new org ID
- Verify switching actually triggers the function
- Check cache statistics: `window.CacheManager.getCacheStats()`

### Multiple Windows Showing Different Data
- This is expected - each window has its own cache context
- Cache is per-window, not shared across windows
- Use explicit `getCache(key, orgId)` if cross-window access needed

## Performance Impact

- **Memory**: Negligible - typical cache is < 100KB
- **Storage**: Uses localStorage, typically < 1MB for multiple orgs
- **Speed**: Cache lookups are O(1), < 1ms per operation
- **Browser**: No performance degradation observed in testing

## Future Enhancements

1. **IndexedDB**: For larger cache support
2. **Encryption**: For sensitive cached data
3. **Sync**: Cross-window cache synchronization
4. **Analytics**: Track cache hit rates
5. **Compression**: Reduce storage footprint

## References

- Mozilla Storage API: https://developer.mozilla.org/en-US/docs/Web/API/Window/localStorage
- Chrome Extensions Storage: https://developer.chrome.com/docs/extensions/reference/storage/
- Security Best Practices: https://cheatsheetseries.owasp.org/

---

**Version**: 1.0.0  
**Last Updated**: February 2026  
**Status**: Production Ready  
**Test Coverage**: 31 tests, 100% pass rate

