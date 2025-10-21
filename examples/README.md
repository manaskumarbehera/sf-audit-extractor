# Code Examples

This directory contains example code patterns used in the Salesforce Audit Trail Extractor extension.

## Files

### code-patterns.js

Demonstrates correct JavaScript patterns including:
- Standard IIFE (Immediately-Invoked Function Expression)
- Async IIFE for initialization
- Named function IIFE for recursion
- Arrow function IIFE variations
- Event listeners with proper closure
- Chrome extension message passing
- Common mistakes to avoid

## Usage

These examples are for reference only. Use them as templates when:
- Adding new features
- Refactoring existing code
- Learning the project's coding patterns
- Debugging syntax errors

## Validation

Before committing any new code, always run:

```bash
npm run validate
```

This ensures all JavaScript files are free from syntax errors.

## Related Documentation

- [TROUBLESHOOTING_JS_ERRORS.md](../TROUBLESHOOTING_JS_ERRORS.md) - Detailed troubleshooting guide
- [SYNTAX_ERROR_QUICK_REF.md](../SYNTAX_ERROR_QUICK_REF.md) - Quick reference for common errors
- [DEVELOPMENT.md](../DEVELOPMENT.md) - Development guide
- [TESTING.md](../TESTING.md) - Testing procedures

## Common Patterns in This Extension

### 1. IIFE Wrapper (content.js, popup.js)

```javascript
(function() {
    'use strict';
    // Extension code here
})();
```

**Why**: Prevents global namespace pollution and provides scope isolation.

### 2. Async Initialization

```javascript
(async () => {
    try {
        await initialize();
    } catch (error) {
        console.error('Init error:', error);
    }
})();
```

**Why**: Allows top-level await behavior in older JavaScript environments.

### 3. Message Listeners

```javascript
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    (async () => {
        try {
            const result = await processMessage(msg);
            sendResponse({ success: true, data: result });
        } catch (error) {
            sendResponse({ success: false, error: String(error) });
        }
    })();
    return true; // Keep channel open for async response
});
```

**Why**: Chrome extension message passing with async/await support.

## Best Practices

1. **Always use 'use strict'** in IIFEs
2. **Handle errors** with try/catch in async code
3. **Return true** from message listeners with async handlers
4. **Validate input** before processing
5. **Use const/let** instead of var
6. **Document complex logic** with comments

## Anti-Patterns to Avoid

1. ❌ Global variables (use IIFE or modules)
2. ❌ Callback hell (use async/await)
3. ❌ Ignoring errors (always handle)
4. ❌ Blocking code (use async for I/O)
5. ❌ Mixed spacing/indentation (use consistent style)

## Need Help?

If you encounter JavaScript syntax errors:

1. Run `npm run validate` to check all files
2. Check [SYNTAX_ERROR_QUICK_REF.md](../SYNTAX_ERROR_QUICK_REF.md) for quick solutions
3. Read [TROUBLESHOOTING_JS_ERRORS.md](../TROUBLESHOOTING_JS_ERRORS.md) for detailed help
4. Review code examples in this directory
5. Check browser console for error details
