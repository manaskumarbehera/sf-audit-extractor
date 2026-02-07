// Detect Salesforce pages, notify background, and serve session info requests from the popup.
// Runs in all frames but only the top frame sends the ready event.

(() => {
    'use strict';

    const isSalesforceHost = (hostname) =>
        /(^|\.)salesforce\.com$/i.test(hostname) || /(^|\.)force\.com$/i.test(hostname) || /(^|\.)salesforce-setup\.com$/i.test(hostname);

    const isTop = window === window.top;
    const host = location.hostname;
    const onSF = isSalesforceHost(host);

    // Store original favicon for reset
    let originalFavicon = null;

    /**
     * Check if the extension context is still valid
     * Returns false if the extension was reloaded/updated
     */
    function isExtensionContextValid() {
        try {
            // Accessing chrome.runtime.id will throw if context is invalidated
            return !!chrome.runtime?.id;
        } catch {
            return false;
        }
    }

    // Message handler from popup: return session info (delegates to background to read cookies).
    chrome.runtime.onMessage.addListener((req, _sender, sendResponse) => {
        if (req && req.action === 'getSessionInfo') {
            getSessionInfoFromBackground().then(sendResponse).catch((e) => {
                sendResponse({ success: false, error: String(e), isLoggedIn: false });
            });
            return true; // async
        }

        // Handle getOrgId request from popup for theming
        if (req && req.action === 'getOrgId') {
            getOrgIdFromPage().then((orgId) => {
                sendResponse({ success: true, orgId: orgId || null });
            }).catch(() => {
                sendResponse({ success: false, orgId: null });
            });
            return true; // async
        }

        // Handle favicon update
        if (req && req.action === 'updateFavicon') {
            updateFavicon(req.color, req.label, req.shape);
            sendResponse({ success: true });
            return false;
        }

        // Handle favicon reset
        if (req && req.action === 'resetFavicon') {
            resetFavicon();
            sendResponse({ success: true });
            return false;
        }
    });

    // Notify background when ready (top frame only) so it can update state/UI.
    if (onSF && isTop) {
        if (document.readyState === 'complete' || document.readyState === 'interactive') {
            notifyReady();
        } else {
            window.addEventListener('DOMContentLoaded', notifyReady, { once: true });
            window.addEventListener('load', notifyReady, { once: true });
        }
    }

    function notifyReady() {
        getSessionInfoFromBackground()
            .then((sessionInfo) => {
                chrome.runtime.sendMessage({
                    action: 'contentReady',
                    url: location.href,
                    sessionInfo
                });
            })
            .catch(() => {
                chrome.runtime.sendMessage({
                    action: 'contentReady',
                    url: location.href,
                    sessionInfo: {
                        success: true,
                        isSalesforce: onSF,
                        isLoggedIn: false,
                        instanceUrl: getInstanceOrigin(),
                        sessionId: null
                    }
                });
            });
    }

    function getInstanceOrigin() {
        try {
            return location.origin;
        } catch {
            const m = String(location.href).match(/^(https:\/\/[^/]+)/i);
            return m ? m[1] : null;
        }
    }

    // Ask background to read cookies and assemble session info.
    function getSessionInfoFromBackground() {
        const instanceUrl = getInstanceOrigin();
        return new Promise((resolve) => {
            chrome.runtime.sendMessage(
                {
                    action: 'GET_SESSION_INFO',
                    url: instanceUrl,
                    hostname: host
                },
                (resp) => {
                    if (chrome.runtime.lastError) {
                        resolve({
                            success: true,
                            isSalesforce: onSF,
                            isLoggedIn: false,
                            instanceUrl,
                            sessionId: null,
                            warning: chrome.runtime.lastError.message
                        });
                        return;
                    }
                    if (!resp) {
                        resolve({
                            success: true,
                            isSalesforce: onSF,
                            isLoggedIn: false,
                            instanceUrl,
                            sessionId: null
                        });
                        return;
                    }
                    resolve(resp);
                }
            );
        });
    }

    /**
     * Update the page favicon with a colored icon in the specified shape.
     * Creates a canvas and draws the shape with the specified color.
     * @param {string} color - The fill color for the favicon
     * @param {string} label - Short text label to display on the favicon
     * @param {string} shape - The shape type: 'cloud', 'circle', 'square', 'rounded', 'diamond', 'hexagon'
     */
    function updateFavicon(color, label, shape) {
        if (!isTop) return; // Only update in top frame

        // Store original favicon if not already stored
        if (!originalFavicon) {
            const existingLink = document.querySelector('link[rel*="icon"]');
            if (existingLink) {
                originalFavicon = existingLink.href;
            }
        }

        // Create canvas for favicon
        const canvas = document.createElement('canvas');
        canvas.width = 32;
        canvas.height = 32;
        const ctx = canvas.getContext('2d');

        // Draw the favicon shape with the specified color
        drawFaviconShape(ctx, color || '#ff6b6b', label, shape || 'cloud');

        // Apply the new favicon
        applyFavicon(canvas.toDataURL('image/png'));
    }

    /**
     * Draw the favicon in the specified shape
     */
    function drawFaviconShape(ctx, color, label, shape) {
        // Clear canvas
        ctx.clearRect(0, 0, 32, 32);
        ctx.fillStyle = color;

        switch (shape) {
            case 'circle':
                ctx.beginPath();
                ctx.arc(16, 16, 14, 0, Math.PI * 2);
                ctx.fill();
                break;

            case 'square':
                ctx.fillRect(2, 2, 28, 28);
                break;

            case 'rounded':
                ctx.beginPath();
                ctx.moveTo(8, 2);
                ctx.lineTo(24, 2);
                ctx.quadraticCurveTo(30, 2, 30, 8);
                ctx.lineTo(30, 24);
                ctx.quadraticCurveTo(30, 30, 24, 30);
                ctx.lineTo(8, 30);
                ctx.quadraticCurveTo(2, 30, 2, 24);
                ctx.lineTo(2, 8);
                ctx.quadraticCurveTo(2, 2, 8, 2);
                ctx.closePath();
                ctx.fill();
                break;

            case 'diamond':
                ctx.beginPath();
                ctx.moveTo(16, 1);
                ctx.lineTo(30, 16);
                ctx.lineTo(16, 31);
                ctx.lineTo(2, 16);
                ctx.closePath();
                ctx.fill();
                break;

            case 'hexagon':
                ctx.beginPath();
                for (let i = 0; i < 6; i++) {
                    const angle = (Math.PI / 3) * i - Math.PI / 2;
                    const x = 16 + 14 * Math.cos(angle);
                    const y = 16 + 14 * Math.sin(angle);
                    if (i === 0) ctx.moveTo(x, y);
                    else ctx.lineTo(x, y);
                }
                ctx.closePath();
                ctx.fill();
                break;

            case 'cloud':
            default:
                // Draw Salesforce-style cloud shape
                ctx.beginPath();
                ctx.arc(16, 18, 10, Math.PI * 0.5, Math.PI * 1.5);
                ctx.arc(10, 12, 6, Math.PI, Math.PI * 1.5);
                ctx.arc(16, 8, 7, Math.PI * 1.2, Math.PI * 1.8);
                ctx.arc(22, 10, 6, Math.PI * 1.5, Math.PI * 0.3);
                ctx.arc(24, 18, 6, Math.PI * 1.5, Math.PI * 0.5);
                ctx.closePath();
                ctx.fill();
                break;
        }

        // Draw label text if provided
        if (label) {
            ctx.fillStyle = '#ffffff';
            ctx.font = 'bold 10px Arial, sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(label.substring(0, 3).toUpperCase(), 16, 16);
        }
    }

    // Legacy function for backwards compatibility
    function drawSalesforceCloud(ctx, color, label) {
        drawFaviconShape(ctx, color, label, 'cloud');
    }


    function applyFavicon(dataUrl) {
        // Remove existing favicon links
        const existingLinks = document.querySelectorAll('link[rel*="icon"]');
        existingLinks.forEach(link => link.remove());

        // Create new favicon link
        const link = document.createElement('link');
        link.rel = 'icon';
        link.type = 'image/png';
        link.href = dataUrl;
        document.head.appendChild(link);
    }

    function resetFavicon() {
        if (!isTop) return;

        // Remove custom favicon
        const existingLinks = document.querySelectorAll('link[rel*="icon"]');
        existingLinks.forEach(link => link.remove());

        // Restore original if we have it
        if (originalFavicon) {
            const link = document.createElement('link');
            link.rel = 'icon';
            link.href = originalFavicon;
            document.head.appendChild(link);
        }

        originalFavicon = null;
    }

    // Cache for org ID detection - declare before use
    let cachedOrgId = null;
    let faviconApplied = false;

    // Check for saved favicon settings on load - look up by org ID
    if (onSF && isTop) {
        // Wait for document to be ready before trying to apply favicon
        if (document.readyState === 'complete') {
            // Page already loaded, apply immediately
            applyFaviconOnLoad();
        } else if (document.readyState === 'interactive') {
            // DOM ready, start applying with a small delay
            setTimeout(() => applyFaviconOnLoad(), 100);
        } else {
            // Wait for DOM content loaded
            window.addEventListener('DOMContentLoaded', () => {
                setTimeout(() => applyFaviconOnLoad(), 100);
            }, { once: true });
        }

        // Also listen for full page load as a backup
        window.addEventListener('load', () => {
            // Try again after full page load in case earlier attempts failed
            setTimeout(() => applyFaviconOnLoad(), 500);
        }, { once: true });

        // Set up MutationObserver to detect when Salesforce framework loads
        setupSalesforceFrameworkObserver();
    }


    /**
     * Watch for Salesforce framework to be ready using MutationObserver
     * This helps detect when $A or other SF globals become available
     */
    function setupSalesforceFrameworkObserver() {
        const observer = new MutationObserver((mutations, obs) => {
            // Check if we've already applied favicon
            if (faviconApplied) {
                obs.disconnect();
                return;
            }

            // Look for signs that SF framework is loaded
            const sfReady = document.querySelector('aura-component') ||
                           document.querySelector('[data-aura-rendered-by]') ||
                           document.querySelector('.slds-page-header') ||
                           document.querySelector('.desktop.container');

            if (sfReady) {
                console.log('[TrackForcePro] Salesforce framework detected, attempting favicon apply');
                applyFaviconOnLoad();
            }
        });

        observer.observe(document.documentElement, {
            childList: true,
            subtree: true
        });

        // Disconnect after 30 seconds to avoid memory leaks
        setTimeout(() => observer.disconnect(), 30000);
    }

    async function applyFaviconOnLoad() {
        console.log('[TrackForcePro] applyFaviconOnLoad() starting for', location.hostname);

        // Skip if already applied
        if (faviconApplied) {
            console.log('[TrackForcePro] Already applied, skipping');
            return;
        }

        // First, try an immediate attempt (0ms) in case we have cached data or quick detection
        // Then use increasing delays for subsequent attempts
        const attempts = [0, 500, 1500, 3000, 6000, 10000];

        for (let i = 0; i < attempts.length; i++) {
            if (faviconApplied) return; // Exit if applied by another call

            if (attempts[i] > 0) {
                await new Promise(resolve => setTimeout(resolve, attempts[i]));
            }

            console.log(`[TrackForcePro] Attempt ${i + 1}/${attempts.length}`);

            try {
                const applied = await tryApplyFavicon();
                if (applied) {
                    console.log('[TrackForcePro] Favicon applied successfully');
                    faviconApplied = true;
                    return;
                }
            } catch (e) {
                // Don't spam console with context invalidation errors
                if (!String(e).includes('Extension context invalidated')) {
                    console.warn('[TrackForcePro] Favicon apply attempt failed:', e.message);
                }
            }
        }

        console.log('[TrackForcePro] Could not apply favicon after all attempts');
    }

    async function tryApplyFavicon() {
        console.log('[TrackForcePro] tryApplyFavicon() called');

        // First check if we have any saved favicons
        // Don't check isExtensionContextValid() upfront - let storage call fail naturally
        let result;
        try {
            result = await chrome.storage.local.get('orgFavicons');
            console.log('[TrackForcePro] Storage access OK');
        } catch (e) {
            // Storage access failed - likely context invalidated
            console.log('[TrackForcePro] Storage access FAILED:', e.message);
            return false;
        }

        let orgFavicons = {};

        if (result && result.orgFavicons && typeof result.orgFavicons === 'object') {
            orgFavicons = result.orgFavicons;
        }

        const faviconCount = Object.keys(orgFavicons).length;
        console.log('[TrackForcePro] Saved favicons count:', faviconCount);

        if (faviconCount === 0) {
            console.log('[TrackForcePro] No saved favicons found');
            return false; // No saved favicons
        }

        // Log all saved favicons for debugging
        for (const [id, settings] of Object.entries(orgFavicons)) {
            console.log(`[TrackForcePro] Saved favicon: orgId=${id}, hostname=${settings.hostname}, color=${settings.color}`);
        }

        // Try to get org ID from the page
        const orgId = await getOrgIdFromPage();
        console.log('[TrackForcePro] Detected org ID:', orgId);

        // Strategy 1: Direct org ID match
        if (orgId && orgFavicons[orgId]) {
            const { color, label, shape } = orgFavicons[orgId];
            if (color || label) {
                console.log('[TrackForcePro] Strategy 1: Org ID match found');
                updateFavicon(color, label, shape);
                return true;
            }
        }

        // Strategy 2: Hostname-based fallback lookup
        // This handles cases where org ID detection fails
        const currentHostname = location.hostname;
        console.log('[TrackForcePro] Current hostname:', currentHostname);

        for (const [_savedOrgId, settings] of Object.entries(orgFavicons)) {
            console.log(`[TrackForcePro] Comparing: saved=${settings.hostname} vs current=${currentHostname}`);
            if (settings.hostname === currentHostname) {
                const { color, label, shape } = settings;
                if (color || label) {
                    console.log('[TrackForcePro] Strategy 2: Hostname match found');
                    updateFavicon(color, label, shape);
                    return true;
                }
            }
        }

        // Strategy 3: Partial hostname match (handle sandbox variations)
        const baseOrg = extractBaseOrg(currentHostname);
        console.log('[TrackForcePro] Base org:', baseOrg);

        if (baseOrg) {
            for (const [_savedOrgId, settings] of Object.entries(orgFavicons)) {
                const savedBaseOrg = settings.hostname ? extractBaseOrg(settings.hostname) : null;
                console.log(`[TrackForcePro] Comparing base orgs: saved=${savedBaseOrg} vs current=${baseOrg}`);
                if (savedBaseOrg && savedBaseOrg === baseOrg) {
                    const { color, label, shape } = settings;
                    if (color || label) {
                        console.log('[TrackForcePro] Strategy 3: Base org match found');
                        updateFavicon(color, label, shape);
                        return true;
                    }
                }
            }
        }

        console.log('[TrackForcePro] No matching favicon found');
        return false;
    }

    // Extract base org identifier from hostname
    function extractBaseOrg(hostname) {
        if (!hostname) return null;
        const match = hostname.match(/^([^.]+)/);
        return match ? match[1].toLowerCase() : null;
    }

    // Try to extract org ID from various sources on the page
    async function getOrgIdFromPage() {
        // Return cached value if available
        if (cachedOrgId) {
            return cachedOrgId;
        }


        // Method 1: Check for oid cookie value directly (most reliable method)
        try {
            const cookies = document.cookie.split(';');
            for (const cookie of cookies) {
                const [name, value] = cookie.trim().split('=');
                if (name === 'oid' && value && (value.length === 15 || value.length === 18)) {
                    console.log('[TrackForcePro] Got org ID from oid cookie');
                    cachedOrgId = value;
                    return value;
                }
            }
        } catch (e) {}

        // Method 2: Check URL for oid parameter
        try {
            const urlParams = new URLSearchParams(location.search);
            const oidFromUrl = urlParams.get('oid') || urlParams.get('organizationId');
            if (oidFromUrl && (oidFromUrl.length === 15 || oidFromUrl.length === 18)) {
                console.log('[TrackForcePro] Got org ID from URL parameter');
                cachedOrgId = oidFromUrl;
                return oidFromUrl;
            }
        } catch (e) {}

        // Method 3: Look for org ID in page metadata
        try {
            const metaOrg = document.querySelector('meta[name="org-id"]');
            if (metaOrg && metaOrg.content) {
                console.log('[TrackForcePro] Got org ID from meta tag');
                cachedOrgId = metaOrg.content;
                return metaOrg.content;
            }
        } catch (e) {}

        // Method 4: Try to extract org ID from page HTML (setup pages often have it)
        try {
            // Look for org ID pattern in script tags or data attributes
            const scripts = document.querySelectorAll('script');
            for (const script of scripts) {
                if (script.textContent) {
                    // Look for patterns like organizationId:"00D..." or "orgId":"00D..."
                    const match = script.textContent.match(/(?:organizationId|orgId)['":\s]+(['"]?)([0-9a-zA-Z]{15,18})\1/i);
                    if (match && match[2] && match[2].startsWith('00D')) {
                        console.log('[TrackForcePro] Got org ID from script content');
                        cachedOrgId = match[2];
                        return match[2];
                    }
                }
            }
        } catch (e) {}

        // Method 5: Look for org ID in data attributes
        try {
            const elemWithOrgId = document.querySelector('[data-org-id], [data-organization-id]');
            if (elemWithOrgId) {
                const oid = elemWithOrgId.getAttribute('data-org-id') || elemWithOrgId.getAttribute('data-organization-id');
                if (oid && (oid.length === 15 || oid.length === 18)) {
                    console.log('[TrackForcePro] Got org ID from data attribute');
                    cachedOrgId = oid;
                    return oid;
                }
            }
        } catch (e) {}

        // Method 6: Ask background script to help identify via API
        // Skip if extension context is invalid
        if (!isExtensionContextValid()) {
            return null;
        }

        try {
            const response = await new Promise((resolve, reject) => {
                const timeout = setTimeout(() => reject(new Error('Timeout')), 8000);

                // Double-check context before sending message
                if (!isExtensionContextValid()) {
                    clearTimeout(timeout);
                    reject(new Error('Extension context invalidated'));
                    return;
                }

                chrome.runtime.sendMessage({ action: 'GET_ORG_ID' }, (resp) => {
                    clearTimeout(timeout);
                    if (chrome.runtime.lastError) {
                        reject(new Error(chrome.runtime.lastError.message));
                    } else {
                        resolve(resp);
                    }
                });
            });
            if (response && response.success && response.orgId) {
                console.log('[TrackForcePro] Got org ID from background API');
                cachedOrgId = response.orgId;
                return response.orgId;
            }
        } catch (e) {
            // Don't log Extension context invalidated errors
            if (!String(e).includes('Extension context invalidated')) {
                console.warn('[TrackForcePro] Background API org ID lookup failed:', e.message);
            }
        }

        return null;
    }
})();