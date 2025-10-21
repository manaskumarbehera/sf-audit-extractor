# JavaScript Syntax Error Quick Reference

## Quick Diagnosis Commands

```bash
# Validate all files
npm run validate

# Check a single file
node -c filename.js

# View file end (check IIFE closure)
tail -10 filename.js
```

## Common Error Patterns

### 1. "Unexpected token ')'"

**Problem**: Extra closing parenthesis
```javascript
// ❌ WRONG
(function() {
    doSomething();
})(); )  // <-- Extra )

// ✅ CORRECT
(function() {
    doSomething();
})();
```

### 2. "Unexpected end of input"

**Problem**: Missing closing brace or parenthesis
```javascript
// ❌ WRONG
(function() {
    if (condition) {
        doSomething();
    }
// Missing } and )();

// ✅ CORRECT
(function() {
    if (condition) {
        doSomething();
    }
})();
```

### 3. "Unexpected token 'function'"

**Problem**: IIFE not properly wrapped
```javascript
// ❌ WRONG
function() {
    doSomething();
}();

// ✅ CORRECT
(function() {
    doSomething();
})();
```

### 4. Async IIFE Errors

**Problem**: Missing parentheses around async function
```javascript
// ❌ WRONG
async () => {
    await doSomething();
})();  // <-- Extra closing )

// ✅ CORRECT
(async () => {
    await doSomething();
})();
```

### 5. Arrow Function IIFE

**Problem**: Incorrect syntax
```javascript
// ❌ WRONG
(() => { doSomething(); }));  // <-- Extra )

// ✅ CORRECT
(() => { doSomething(); })();
```

## IIFE Patterns in This Extension

### Standard IIFE (popup.js, content.js)
```javascript
(function() {
    'use strict';
    // code here
})();
```

### Async IIFE (initialization)
```javascript
(async () => {
    await initialize();
})();
```

### Named Function IIFE (for recursion)
```javascript
(function loop() {
    // can call loop() recursively
})();
```

## Bracket Matching Tips

| Opening | Closing | Use Case |
|---------|---------|----------|
| `(`     | `)`     | Function calls, IIFE |
| `{`     | `}`     | Code blocks, objects |
| `[`     | `]`     | Arrays |

## Editor Settings

**VSCode**: Enable bracket pair colorization
```json
{
    "editor.bracketPairColorization.enabled": true
}
```

**Sublime**: Install BracketHighlighter package

**Vim**: Built-in `%` command jumps to matching bracket

## Common Fixes

1. **Count your brackets**: Every `(` needs a `)`, every `{` needs a `}`, every `[` needs a `]`
2. **Indent properly**: Indentation makes mismatches visible
3. **Use a linter**: ESLint catches these before runtime
4. **Check line numbers**: Error usually points to the line with the issue
5. **Look above**: Sometimes the error is lines before where it's reported

## Testing Your Fix

```bash
# After fixing, validate
npm run validate

# Reload extension in Chrome
# chrome://extensions/ → Click reload icon

# Check console
# F12 → Console (look for errors)
```

## File-Specific Tips

### background.js (Service Worker)
- No IIFE wrapper needed (it's already isolated)
- Check for unmatched braces in async functions
- Verify all arrow functions are closed

### content.js
- Wrapped in `(() => { ... })();`
- Check the final closure at end of file
- Ensure all event listeners have closing braces

### popup.js
- Wrapped in `(function() { ... })();`
- Largest file, most complex
- Use editor's bracket matching
- Check nested functions carefully

## When to Use IIFE

✅ **Use IIFE for:**
- Content scripts (avoid global pollution)
- UI scripts (encapsulate state)
- Utilities that need private scope

❌ **Don't use IIFE for:**
- Service workers (already isolated)
- ES6 modules (already scoped)
- Single-use initialization (just use a function call)

## Resources

- [MDN: IIFE](https://developer.mozilla.org/en-US/docs/Glossary/IIFE)
- [MDN: SyntaxError](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/SyntaxError)
- [Troubleshooting Guide](TROUBLESHOOTING_JS_ERRORS.md) (detailed)
