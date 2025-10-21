# Troubleshooting JavaScript Syntax Errors

This guide helps developers diagnose and fix common JavaScript syntax errors in the Salesforce Audit Trail Extractor extension.

## Common "Uncaught SyntaxError: Unexpected token ')'" Issues

This error typically occurs with IIFE (Immediately-Invoked Function Expression) patterns when there are mismatched parentheses, braces, or brackets.

### Typical Causes

1. **Extra Closing Parenthesis Before IIFE Ending**
   ```javascript
   // ❌ WRONG: Extra closing parenthesis
   (function() {
       // code here
   })(); )  // <-- Extra ')' causes error
   
   // ✅ CORRECT
   (function() {
       // code here
   })();
   ```

2. **Missing Opening Parenthesis or Brace**
   ```javascript
   // ❌ WRONG: Missing opening brace
   function myFunction() {
       if (condition) 
           doSomething();
       }  // <-- Unmatched closing brace
   }
   
   // ✅ CORRECT
   function myFunction() {
       if (condition) {
           doSomething();
       }
   }
   ```

3. **Concatenation or Minification Errors**
   ```javascript
   // ❌ WRONG: Files concatenated without proper separation
   })();(function() {  // <-- Missing semicolon or newline
   
   // ✅ CORRECT
   })();
   (function() {
   ```

4. **Async Function Expression Errors**
   ```javascript
   // ❌ WRONG: Missing 'function' keyword
   (async () => {
       await somePromise();
   }));  // <-- Extra closing parenthesis
   
   // ✅ CORRECT
   (async () => {
       await somePromise();
   })();
   ```

### IIFE Patterns Used in This Extension

This extension uses several IIFE patterns:

1. **Standard IIFE (popup.js, content.js)**:
   ```javascript
   (function() {
       'use strict';
       // Main extension logic
   })();
   ```

2. **Async IIFE for initialization**:
   ```javascript
   (async () => {
       try {
           await initializeFeature();
       } catch (e) {
           console.error(e);
       }
   })();
   ```

3. **Named function IIFE for recursion**:
   ```javascript
   (async function loop() {
       while (condition) {
           await doWork();
       }
   })();
   ```

## Diagnostic Steps

### Step 1: Check for Unmatched Brackets

Run the validation script:
```bash
node scripts/validate-syntax.js
```

### Step 2: Use Node.js Syntax Check

Check individual files:
```bash
node -c background.js
node -c content.js
node -c popup.js
```

### Step 3: Check Browser Console

1. Load the extension in Chrome
2. Open Developer Tools (F12)
3. Check the Console tab for errors
4. Look at the Service Worker console for background.js errors

### Step 4: Inspect the Error Stack Trace

The error message usually indicates:
- The file where the error occurred
- The line number
- The specific token that caused the issue

Example:
```
Uncaught SyntaxError: Unexpected token ')'
    at popup.js:2587
```

### Step 5: Check Surrounding Code

Look at 10-20 lines before and after the error line:
- Count opening and closing parentheses
- Count opening and closing braces
- Check for incomplete function calls
- Look for missing commas in object literals or arrays

## Prevention Tips

1. **Use a Linter**: Install ESLint to catch syntax errors before runtime
   ```bash
   npm install --save-dev eslint
   ```

2. **Enable Editor Bracket Matching**: Most modern editors highlight matching brackets

3. **Use Consistent Formatting**: Tools like Prettier help maintain consistent code structure

4. **Write Tests**: Automated tests can catch syntax errors early

5. **Code Review**: Have another developer review changes before committing

## Files in This Extension

### background.js
- Service worker (Manifest V3)
- Handles API calls, session management, and Platform Events window pinning
- No IIFE wrapper (service workers don't need it)

### content.js
- Content script injected into Salesforce pages
- Wrapped in IIFE to avoid global namespace pollution
- Pattern: `(() => { ... })();`

### popup.js
- Main UI logic for the extension popup
- Wrapped in IIFE to encapsulate variables
- Pattern: `(function() { 'use strict'; ... })();`

## Quick Fixes

If you encounter a syntax error:

1. **Locate the error line** in the browser console
2. **Check for unmatched brackets** using your editor's bracket matching
3. **Temporarily comment out code** to isolate the problem
4. **Use git diff** to see what changed recently
5. **Revert to last working version** if needed

## Testing Your Fix

After fixing a syntax error:

1. Reload the extension in Chrome:
   - Go to `chrome://extensions/`
   - Click the reload icon for this extension

2. Open the extension popup and verify it loads without errors

3. Check the Console for any runtime errors

4. Test the feature that was affected

## Getting Help

If you're stuck:

1. Check the browser console for the complete error message
2. Review this troubleshooting guide
3. Search for the error message online
4. Create an issue with:
   - The complete error message
   - The surrounding code (10-20 lines before/after)
   - Steps to reproduce
   - Browser version and OS

## Additional Resources

- [MDN: SyntaxError](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/SyntaxError)
- [JavaScript IIFE Pattern](https://developer.mozilla.org/en-US/docs/Glossary/IIFE)
- [Chrome Extension Documentation](https://developer.chrome.com/docs/extensions/mv3/)
- [ESLint Documentation](https://eslint.org/docs/user-guide/getting-started)
