/**
 * favicon-init.js
 * Initialize favicon URLs for Chrome extension context
 * This is loaded early to ensure favicons work properly
 */
(function() {
    if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.getURL) {
        const icons = {
            'favicon-128': 'icons/Icon-128.png',
            'favicon-64': 'icons/Icon-64.png',
            'favicon-32': 'icons/Icon-32.png',
            'favicon-16': 'icons/Icon-16.png',
            'favicon-shortcut': 'icons/Icon-32.png',
            'favicon-apple': 'icons/Icon-128.png'
        };
        for (const [id, path] of Object.entries(icons)) {
            const link = document.getElementById(id);
            if (link) link.href = chrome.runtime.getURL(path);
        }
    }
})();
