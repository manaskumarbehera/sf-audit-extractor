# GraphQL Schema Optimization: On-Demand Object Introspection

## Overview

This document explains the optimization implementation that loads only object-specific introspection data instead of the entire GraphQL schema.

## Problem Statement

Previously, the system would:
1. Load the **entire GraphQL schema** (~5+ MB) on initialization
2. Cache it for 6 hours
3. Use significant storage quota for full schema storage

## Solution Implemented

The optimization enables **on-demand object introspection** where only object-specific metadata is loaded and cached when needed.

### Key Changes

#### 1. Modified `loadSchema()` Function (Line 284)

Added `skipFullSchema` option (defaults to `true`):

```javascript
async function loadSchema(opts = {}) {
  const force = !!opts.force;
  const skipFullSchema = opts.skipFullSchema !== false; // Default: true
  
  // If skipFullSchema is true, only load object metadata on-demand (optimized)
  if (skipFullSchema) {
    setSchemaStatus('Schema: on-demand loading enabled', 'ok');
    console.log('[GraphQL] Using on-demand object introspection...');
    return null;
  }
  // ... rest of full schema loading code (for backwards compatibility)
}
```

#### 2. Updated Initialization (Line 875)

Changed from loading full schema to on-demand:

```javascript
// Use on-demand object introspection by default (skipFullSchema: true)
// This loads only object-specific metadata into cache, not the entire schema
loadSchema({ skipFullSchema: true }).catch(() => {});
```

#### 3. Added Object Introspection Cache (Line 384)

```javascript
// Enhanced object introspection cache: stores field metadata for selected objects only
const objectIntrospectionCache = new Map(); // Maps object name -> { fields, ts }
const OBJECT_INTROSPECTION_TTL_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Load and cache introspection data for a specific object.
 * This is the optimized approach - only load what's needed.
 */
async function loadObjectIntrospection(objectName) {
  // Returns cached fields if fresh, otherwise loads via DESCRIBE_SOBJECT
}
```

#### 4. Schema Refresh Button (Line 994)

```javascript
if (schemaRefreshBtn) {
  on(schemaRefreshBtn, 'click', () => {
    // Continues to use on-demand approach
    return loadSchema({ force: true, skipFullSchema: true });
  });
}
```

## How It Works

### Current Flow

1. **Initialization**: Calls `loadSchema({ skipFullSchema: true })`
   - Sets status to "on-demand loading enabled"
   - Returns immediately without fetching full schema

2. **Object Selection**: When user selects an object
   - Calls `refreshBuilderFields(objectName)`
   - Calls `getSobjectDescribeCached(objectName)` 
   - Loads ONLY that object's field metadata
   - Caches in `objectIntrospectionCache` (5-minute TTL)

3. **Subsequent Accesses**: Same object
   - Returns from cache if fresh (< 5 minutes)
   - No additional API calls

### Data Flow Diagram

```
User Opens Page
    ↓
loadSchema({ skipFullSchema: true })
    ↓
Status: "on-demand loading enabled"
    ↓
getDescribeCached() 
    ↓
Populate object selector with queryable objects
    ↓
User Selects Object
    ↓
refreshBuilderFields(objectName)
    ↓
getSobjectDescribeCached(objectName)
    ↓
Load & Cache Object Fields (5-min TTL)
    ↓
Ready to Build Query
```

## Benefits

| Benefit | Before | After |
|---------|--------|-------|
| **Initial Load Time** | Full schema (~5+ MB) | Object list only (< 1 MB) |
| **Storage Used** | 5+ MB per org/version | ~1 MB per selected object |
| **Quota Impact** | High (full schema cached) | Low (only objects loaded) |
| **Cache Complexity** | Single large entry | Multiple small entries |
| **Load Responsiveness** | Wait for full introspection | Instant, fetch fields on select |

## Backward Compatibility

To force full schema load (if needed), use:

```javascript
loadSchema({ skipFullSchema: false, force: true })
```

This can be integrated with the schema refresh button via Shift+Click or a settings toggle if needed.

## Caching Strategy

### Before (Full Schema)
- **Key**: Instance URL + API Version
- **Size**: 5+ MB per entry
- **TTL**: 6 hours
- **Limit**: Keep 1 most recent to prevent quota exceeded

### After (Object Introspection)
- **Key**: Object name
- **Size**: 10-100 KB per object
- **TTL**: 5 minutes
- **Limit**: No size limit per object, no quota cleanup needed

## Configuration

### Enable Full Schema Loading (Optional)

If you want to optionally load full schema:

```javascript
// In init() function
const useFullSchema = false; // Change to true if needed
await loadSchema({ skipFullSchema: !useFullSchema });
```

### Adjust Object Cache TTL

```javascript
// At the top of the file
const OBJECT_INTROSPECTION_TTL_MS = 10 * 60 * 1000; // Change from 5 to 10 minutes
```

## Testing

### Verify On-Demand Loading

1. Open Developer Console
2. Look for message: `[GraphQL] Using on-demand object introspection...`
3. Check Network tab - no large GraphQL introspection request on page load
4. Select an object - DESCRIBE_SOBJECT request appears
5. Select same object again - cached response (no network request)

### Check Cache Status

```javascript
// In console
window.__GraphqlTestHooks // Check loaded test hooks
objectIntrospectionCache // View cached objects
```

## Future Enhancements

1. **Persistent Cache**: Store object introspection in chrome.storage.local
2. **Batch Loading**: Load multiple objects in one request
3. **Smart Prefetch**: Prefetch popular objects on idle time
4. **User Settings**: Let users choose between on-demand vs. full schema
5. **Hybrid Mode**: Load schema only when explicitly requested via button

## Monitoring

The implementation includes console logs for debugging:

```javascript
console.log('[GraphQL] Using on-demand object introspection...');
console.log(`[GraphQL] Object introspection for ${obj} (cached)`);
console.log(`[GraphQL] Loading object introspection for ${obj}...`);
console.log(`[GraphQL] Cached ${fields.length} fields for ${obj}`);
```

## References

- **Full Schema Cache**: Lines 203-256 (readSchemaCache, writeSchemaCache)
- **Object Introspection**: Lines 384-421 (loadObjectIntrospection)
- **Object Selection Handler**: Lines 819-826 (objectSelect 'change' event)
- **Field Refresh**: Lines 775-779 (refreshBuilderFields)

