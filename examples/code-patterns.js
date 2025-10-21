/**
 * JavaScript Code Examples
 * 
 * This file demonstrates the correct JavaScript patterns used in this extension.
 * Use these as templates when adding new code.
 */

// ===================================================================
// EXAMPLE 1: Standard IIFE (Immediately-Invoked Function Expression)
// ===================================================================
// Used in: popup.js, content.js
//
// Purpose: Encapsulates code to avoid polluting global namespace
// ===================================================================

(function() {
    'use strict';
    
    // All your code here is private
    const privateVariable = 'This is scoped to the IIFE';
    
    function privateFunction() {
        console.log('This function is not accessible outside');
    }
    
    // Call functions within the IIFE
    privateFunction();
})();
// <-- Note: )(); at the end invokes the function immediately

// ===================================================================
// EXAMPLE 2: Async IIFE for Initialization
// ===================================================================
// Used in: popup.js (various initialization blocks)
//
// Purpose: Run async code immediately without creating a named function
// ===================================================================

(async () => {
    try {
        const data = await fetchSomeData();
        await processData(data);
        console.log('Initialization complete');
    } catch (error) {
        console.error('Initialization failed:', error);
    }
})();

// Placeholder for the example (won't actually run)
async function fetchSomeData() { return {}; }
async function processData(data) { }

// ===================================================================
// EXAMPLE 3: Named Function IIFE (for recursion)
// ===================================================================
// Used in: popup.js (startConnectLoop function)
//
// Purpose: Create a recursive async function that calls itself
// ===================================================================

(async function connectLoop() {
    let active = true;
    let retries = 0;
    
    while (active && retries < 5) {
        try {
            console.log('Attempting connection...');
            // await connect();
            retries = 0; // Reset on success
        } catch (error) {
            console.error('Connection failed:', error);
            retries++;
            await new Promise(r => setTimeout(r, 1000));
        }
    }
})();

// ===================================================================
// EXAMPLE 4: Arrow Function IIFE
// ===================================================================
// Alternative syntax, more concise
// ===================================================================

(() => {
    console.log('Arrow function IIFE');
})();

// ===================================================================
// EXAMPLE 5: Async Arrow Function IIFE with Error Handling
// ===================================================================

(async () => {
    try {
        // await someAsyncOperation();
    } catch (error) {
        console.error('Error:', error);
    }
})();

// ===================================================================
// EXAMPLE 6: Event Listener with Proper Closure
// ===================================================================
// Used throughout: popup.js
//
// Purpose: Attach event listeners with proper scoping
// ===================================================================

(function() {
    'use strict';
    
    // Get DOM elements
    const button = document.getElementById('myButton');
    const output = document.getElementById('output');
    
    // Add event listener
    if (button) {
        button.addEventListener('click', async () => {
            try {
                output.textContent = 'Loading...';
                // const result = await fetchData();
                // output.textContent = result;
            } catch (error) {
                output.textContent = 'Error: ' + error.message;
            }
        });
    }
})();

// ===================================================================
// EXAMPLE 7: Message Passing (Chrome Extension)
// ===================================================================
// Used in: background.js, content.js, popup.js
//
// Purpose: Send messages between different parts of the extension
// ===================================================================

// Sending a message
(async () => {
    try {
        const response = await new Promise((resolve) => {
            chrome.runtime.sendMessage(
                { action: 'getData' },
                (resp) => resolve(resp)
            );
        });
        console.log('Response:', response);
    } catch (error) {
        console.error('Message error:', error);
    }
})();

// Listening for messages
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    (async () => {
        try {
            if (message.action === 'getData') {
                // const data = await fetchData();
                sendResponse({ success: true, data: {} });
            }
        } catch (error) {
            sendResponse({ success: false, error: String(error) });
        }
    })();
    return true; // Keep channel open for async response
});

// ===================================================================
// EXAMPLE 8: Object Literal with Methods
// ===================================================================

const myModule = {
    init: function() {
        console.log('Module initialized');
    },
    
    async fetchData() {
        // Async method
        return {};
    },
    
    process(data) {
        // Regular method
        return data;
    }
};

// ===================================================================
// EXAMPLE 9: Class Definition (ES6)
// ===================================================================

class MyClass {
    constructor(name) {
        this.name = name;
    }
    
    greet() {
        console.log(`Hello, ${this.name}`);
    }
    
    async loadData() {
        // Async class method
        return {};
    }
}

// ===================================================================
// COMMON MISTAKES TO AVOID
// ===================================================================

// ❌ WRONG: Extra closing parenthesis
// (function() {
//     console.log('test');
// })(); )  // <-- Extra ) causes SyntaxError

// ❌ WRONG: Missing closing brace
// (function() {
//     console.log('test');
// )();  // <-- Missing }

// ❌ WRONG: Not wrapped in parentheses
// function() {
//     console.log('test');
// }();  // <-- SyntaxError: function statement requires a name

// ❌ WRONG: Async without parentheses
// async function() {
//     await something();
// }();  // <-- SyntaxError

// ✅ CORRECT: All variations
(function() { })();
(() => { })();
(async () => { })();
(async function() { })();

// ===================================================================
// BRACKET MATCHING CHECKLIST
// ===================================================================
// Every ( must have a matching )
// Every { must have a matching }
// Every [ must have a matching ]
// 
// Count brackets when in doubt:
// - Read line by line
// - Track opening brackets: +1
// - Track closing brackets: -1
// - Should end at 0
// ===================================================================

console.log('Examples file loaded successfully');
