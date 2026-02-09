# CacheManager Quick Start Guide

## 5-Minute Setup

### 1. Understand the Problem
When users switch between Salesforce organizations in the extension, cached data from the previous org persists, causing:
- Stale/incorrect recent records
- Mixed audit trail data
- Confused record scanner history
- Security concerns with sensitive data

### 2. The Solution
CacheManager automatically:
- Isolates cache by organization
- Clears previous org's data when switching
- Prevents data leakage
- Works transparently with existing code

### 3. How It's Already Integrated

**In `popup.html`:**
```html
<script src="cache_manager.js"></script>  <!-- Loaded FIRST -->
<script src="utils.js"></script>
<!-- ... other scripts ... -->
```

**In `data_explorer_helper.js`:**
```javascript
// When org info loads, set current org ID
loadOrgInfo: async function() {
    // ... load org data ...
    if (org && org.Id) {
        window.CacheManager.setCurrentOrgId(org.Id);
    }
}

// Save record history with CacheManager
addToRecordHistory: async function(record) {
    // ... add record to history ...
    if (window.CacheManager) {
        window.CacheManager.setCache('recordHistory', this._recordHistory);
    }
}
```

### 4. For Developers Adding New Caches

If you want to cache new data, follow this pattern:

**Step 1: Load data (with fallback)**
```javascript
// Load from cache
let data;
if (window.CacheManager) {
    data = window.CacheManager.getCache('myDataKey');
}

// Fallback to direct storage if CacheManager not available
if (!data) {
    const result = await chrome.storage.local.get('myDataKey');
    data = result.myDataKey;
}
```

**Step 2: Save data (with fallback)**
```javascript
if (window.CacheManager) {
    window.CacheManager.setCache('myDataKey', myData);
} else {
    await chrome.storage.local.set({ myDataKey: myData });
}
```

**Step 3: Clear data (with fallback)**
```javascript
if (window.CacheManager) {
    window.CacheManager.removeCache('myDataKey');
} else {
    await chrome.storage.local.remove('myDataKey');
}
```

### 5. Testing

Run the comprehensive test suite:
```bash
# All cache tests
npm test -- tests/cache_manager.test.js tests/cache_org_switch.test.js

# Specific test
npm test -- tests/cache_manager.test.js --testNamePattern="should isolate cache"
```

Expected result:
```
Test Suites: 2 passed
Tests:       31 passed
```

### 6. Verifying It Works

In browser console (when extension is open):
```javascript
// Check current org
window.CacheManager.getCurrentOrgId()

// Get cache statistics
window.CacheManager.getCacheStats()

// Manually test switching orgs
window.CacheManager.setCurrentOrgId('org-id-1')
window.CacheManager.setCache('test', { data: 'org1' })
window.CacheManager.setCurrentOrgId('org-id-2')  // Clears org1 cache
window.CacheManager.setCurrentOrgId('org-id-1')
window.CacheManager.getCache('test')  // Returns null (was cleared)
```

## Common Tasks

### Add a New Cacheable Data Type

If you have a new data type that needs to be organization-scoped:

1. **Identify the data**: e.g., "userSearchResults"
2. **Find the load function**: e.g., `searchUsers()`
3. **Update loading code**:
   ```javascript
   if (window.CacheManager) {
       this._searchResults = window.CacheManager.getCache('userSearchResults') || [];
   }
   ```
4. **Update saving code**:
   ```javascript
   if (window.CacheManager) {
       window.CacheManager.setCache('userSearchResults', this._searchResults);
   }
   ```
5. **Update clearing code**:
   ```javascript
   if (window.CacheManager) {
       window.CacheManager.removeCache('userSearchResults');
   }
   ```

### Debug Cache Issues

```javascript
// Get everything
const stats = window.CacheManager.getCacheStats();
console.log('Total items:', stats.itemCount);
console.log('By org:', stats.byOrg);
console.log('Current org:', stats.currentOrgId);

// Check specific item
const item = window.CacheManager.getCache('recordHistory');
console.log('Record history:', item);

// Clear everything
window.CacheManager.clearAllCaches();

// View raw storage
for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key.startsWith('cache_')) {
        console.log(key, localStorage.getItem(key));
    }
}
```

### Monitor Cache in Production

Add to your monitoring code:
```javascript
// Every hour, check cache health
setInterval(() => {
    const stats = window.CacheManager.getCacheStats();
    if (stats.itemCount > 1000) {
        console.warn('Cache growing large:', stats.itemCount);
    }
    console.log('Cache stats:', stats);
}, 60 * 60 * 1000);
```

## API Reference (Quick)

| Function | Purpose | Example |
|----------|---------|---------|
| `setCurrentOrgId(id)` | Switch organization (clears previous) | `setCurrentOrgId('00Da0...')` |
| `setCache(key, value, ttl?, org?)` | Store data | `setCache('records', data)` |
| `getCache(key, org?)` | Retrieve data | `getCache('records')` |
| `removeCache(key, org?)` | Delete data | `removeCache('records')` |
| `clearOrgCache(org?)` | Clear all of one org | `clearOrgCache()` |
| `clearAllCaches()` | Clear everything | `clearAllCaches()` |
| `getCacheStats()` | Get usage info | `getCacheStats()` |
| `getCurrentOrgId()` | Get current org | `getCurrentOrgId()` |
| `invalidateAllCaches()` | Nuke all caches | `invalidateAllCaches()` |

## Troubleshooting

### "CacheManager is undefined"
- Make sure `cache_manager.js` is loaded FIRST in popup.html
- Check browser console for script loading errors

### Cache not persisting
- Check if `setCurrentOrgId()` is called when org loads
- Verify localStorage is not disabled in browser
- Look at browser DevTools → Application → Local Storage

### Org data from different org showing
- Call `setCurrentOrgId()` when org changes
- Check if you're using correct cache keys
- Run `window.CacheManager.getCacheStats()` to see what's cached

### Performance is slow
- This should not happen - cache is very fast
- Check browser console for errors
- Disable cache and see if issue persists

## Key Points to Remember

1. ✅ **Automatic isolation**: Each org has separate cache
2. ✅ **Automatic clearing**: Previous org clears on switch
3. ✅ **Always has fallback**: Works even if CacheManager broken
4. ✅ **Zero configuration**: Just call `setCurrentOrgId()`
5. ✅ **Thoroughly tested**: 31 tests, 100% passing

## Questions?

- See `/DOCUMENTATION/CACHE_MANAGER.md` for full documentation
- Check `tests/cache_manager.test.js` for usage examples
- Look at `data_explorer_helper.js` for real usage patterns

---

**Quick Links:**
- Full Docs: [CACHE_MANAGER.md](../DOCUMENTATION/CACHE_MANAGER.md)
- Main Module: [cache_manager.js](../cache_manager.js)
- Unit Tests: [cache_manager.test.js](../tests/cache_manager.test.js)
- Integration Tests: [cache_org_switch.test.js](../tests/cache_org_switch.test.js)

