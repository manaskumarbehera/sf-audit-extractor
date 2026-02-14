// Detect Salesforce pages, notify background, and serve session info requests from the popup.
// Runs in all frames but only the top frame sends the ready event.

(() => {
    'use strict';

    const isSalesforceHost = (hostname) =>
        /(^|\.)salesforce\.com$/i.test(hostname) ||
        /(^|\.)force\.com$/i.test(hostname) ||
        /(^|\.)salesforce-setup\.com$/i.test(hostname) ||
        /(^|\.)visualforce\.com$/i.test(hostname);

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
            // CRITICAL: Verify this favicon update is for the current page's org
            // This prevents cross-org contamination when multiple orgs are open
            if (req.orgId) {
                // Helper to normalize org ID to 15 chars
                const normalizeId = (id) => id ? id.substring(0, 15) : null;

                // Get current org ID to compare
                getOrgIdFromPageFresh().then((currentOrgId) => {
                    // Use normalized comparison (15-char) to handle 15 vs 18 char IDs
                    const normalizedReq = normalizeId(req.orgId);
                    const normalizedCurrent = normalizeId(currentOrgId);

                    if (normalizedCurrent && normalizedReq && normalizedReq !== normalizedCurrent) {
                        // This update is for a different org - ignore it
                        console.log(`[TrackForcePro] Ignoring favicon update for different org: requested=${req.orgId}, current=${currentOrgId}`);
                        sendResponse({ success: false, reason: 'org_mismatch' });
                        return;
                    }
                    // Org matches or no current org detected - apply the favicon
                    console.log(`[TrackForcePro] Applying favicon update for org: ${req.orgId}`);
                    updateFavicon(req.color, req.label, req.shape);
                    sendResponse({ success: true });
                }).catch(() => {
                    // Could not detect current org - apply anyway for backwards compatibility
                    console.log(`[TrackForcePro] Could not detect org, applying favicon anyway`);
                    updateFavicon(req.color, req.label, req.shape);
                    sendResponse({ success: true });
                });
                return true; // async response
            }
            // No orgId in request - apply for backwards compatibility
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

        // Handle LMS publish request
        if (req && req.action === 'LMS_PUBLISH') {
            handleLmsPublish(req.channel, req.payload)
                .then((result) => sendResponse(result))
                .catch((err) => sendResponse({ success: false, error: String(err) }));
            return true; // async
        }

        // Handle LMS availability check
        if (req && req.action === 'LMS_CHECK_AVAILABILITY') {
            checkLmsAvailability()
                .then((result) => sendResponse(result))
                .catch((err) => sendResponse({ success: false, error: String(err) }));
            return true; // async
        }
    });

    // Notify background when ready (top frame only) so it can update state/UI.
    if (onSF && isTop) {
        if (document.readyState === 'complete' || document.readyState === 'interactive') {
            notifyReady();
            createBlinkerIndicator();
        } else {
            window.addEventListener('DOMContentLoaded', () => {
                notifyReady();
                createBlinkerIndicator();
            }, { once: true });
            window.addEventListener('load', () => {
                notifyReady();
                createBlinkerIndicator();
            }, { once: true });
        }
    }

    /**
     * Create a blinker/indicator in the top-right corner of Salesforce pages
     * Allows users to quickly open the extension
     */
    function createBlinkerIndicator() {
        // Only create in top frame and on Salesforce pages
        if (!isTop || !onSF) return;

        // Check if already created
        if (document.getElementById('trackforcepro-blinker')) return;

        // Create the blinker container
        const blinker = document.createElement('div');
        blinker.id = 'trackforcepro-blinker';

        // Inject styles
        const style = document.createElement('style');
        style.textContent = `
            #trackforcepro-blinker {
                position: fixed;
                top: 12px;
                right: 12px;
                z-index: 2147483647;
                display: flex;
                align-items: center;
                gap: 6px;
                padding: 6px 10px;
                background: linear-gradient(135deg, #0176d3 0%, #1b96ff 100%);
                border-radius: 20px;
                cursor: pointer;
                box-shadow: 0 2px 8px rgba(1, 118, 211, 0.4), 0 0 0 1px rgba(255,255,255,0.1) inset;
                transition: all 0.3s ease;
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                user-select: none;
                opacity: 0.9;
            }
            #trackforcepro-blinker:hover {
                transform: scale(1.05);
                box-shadow: 0 4px 16px rgba(1, 118, 211, 0.5), 0 0 0 1px rgba(255,255,255,0.2) inset;
                opacity: 1;
            }
            #trackforcepro-blinker:active {
                transform: scale(0.98);
            }
            #trackforcepro-blinker .tfp-icon {
                width: 18px;
                height: 18px;
                background: white;
                border-radius: 50%;
                display: flex;
                align-items: center;
                justify-content: center;
                font-size: 11px;
                font-weight: bold;
                color: #0176d3;
                animation: tfp-pulse 2s ease-in-out infinite;
            }
            #trackforcepro-blinker .tfp-label {
                color: white;
                font-size: 11px;
                font-weight: 600;
                letter-spacing: 0.3px;
            }
            #trackforcepro-blinker .tfp-close {
                width: 16px;
                height: 16px;
                display: flex;
                align-items: center;
                justify-content: center;
                color: rgba(255,255,255,0.7);
                font-size: 14px;
                border-radius: 50%;
                margin-left: 2px;
                transition: all 0.2s ease;
            }
            #trackforcepro-blinker .tfp-close:hover {
                background: rgba(255,255,255,0.2);
                color: white;
            }
            @keyframes tfp-pulse {
                0%, 100% { box-shadow: 0 0 0 0 rgba(1, 118, 211, 0.4); }
                50% { box-shadow: 0 0 0 4px rgba(1, 118, 211, 0); }
            }
            #trackforcepro-blinker.tfp-minimized {
                padding: 6px;
                border-radius: 50%;
            }
            #trackforcepro-blinker.tfp-minimized .tfp-label,
            #trackforcepro-blinker.tfp-minimized .tfp-close {
                display: none;
            }
            #trackforcepro-blinker.tfp-hidden {
                display: none !important;
            }
        `;
        document.head.appendChild(style);

        // Create icon
        const icon = document.createElement('span');
        icon.className = 'tfp-icon';
        icon.textContent = 'TF';

        // Create label
        const label = document.createElement('span');
        label.className = 'tfp-label';
        label.textContent = 'TrackForcePro';

        // Create close button
        const closeBtn = document.createElement('span');
        closeBtn.className = 'tfp-close';
        closeBtn.textContent = '×';
        closeBtn.title = 'Hide (will reappear on page reload)';

        blinker.appendChild(icon);
        blinker.appendChild(label);
        blinker.appendChild(closeBtn);

        // Click handler - open extension popup/tab
        blinker.addEventListener('click', (e) => {
            if (e.target === closeBtn || e.target.closest('.tfp-close')) {
                e.stopPropagation();
                // Hide the blinker
                blinker.classList.add('tfp-hidden');
                // Save preference for this session
                try {
                    sessionStorage.setItem('tfp-blinker-hidden', 'true');
                } catch {}
                return;
            }

            // Send message to background to open extension
            if (isExtensionContextValid()) {
                chrome.runtime.sendMessage({ action: 'openPopup' }, (response) => {
                    if (chrome.runtime.lastError) {
                        // Fallback: try to open as tab
                        chrome.runtime.sendMessage({ action: 'openAsTab' });
                    }
                });
            }
        });

        // Double-click to minimize/expand
        blinker.addEventListener('dblclick', (e) => {
            if (e.target === closeBtn || e.target.closest('.tfp-close')) return;
            blinker.classList.toggle('tfp-minimized');
            try {
                sessionStorage.setItem('tfp-blinker-minimized', blinker.classList.contains('tfp-minimized'));
            } catch {}
        });

        // Check if hidden in this session
        try {
            if (sessionStorage.getItem('tfp-blinker-hidden') === 'true') {
                blinker.classList.add('tfp-hidden');
            }
            if (sessionStorage.getItem('tfp-blinker-minimized') === 'true') {
                blinker.classList.add('tfp-minimized');
            }
        } catch {}

        // Append to body
        document.body.appendChild(blinker);
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

        try {
            // Create canvas for favicon
            const canvas = document.createElement('canvas');

            // Defensive check: ensure canvas is valid
            if (!canvas || typeof canvas.getContext !== 'function') {
                console.error('[TrackForcePro] Canvas creation failed or getContext not available');
                return;
            }

            canvas.width = 32;
            canvas.height = 32;
            const ctx = canvas.getContext('2d');

            if (!ctx) {
                console.error('[TrackForcePro] Could not get 2D context from canvas');
                return;
            }

            // Draw the favicon shape with the specified color
            drawFaviconShape(ctx, color || '#ff6b6b', label, shape || 'cloud');

            // Apply the new favicon
            applyFavicon(canvas.toDataURL('image/png'));
        } catch (e) {
            console.error('[TrackForcePro] Error in updateFavicon:', e);
        }
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
    let lastAppliedUrl = null;
    let lastAppliedOrgId = null;  // NEW: Track which org the favicon was applied for

    // CRITICAL: Reset favicon when URL changes (org switch or page navigation)
    if (onSF && isTop) {
        // Watch for URL changes (navigation within Salesforce)
        const originalPushState = history.pushState;
        const originalReplaceState = history.replaceState;

        history.pushState = function(...args) {
            const newUrl = args[2];
            if (lastAppliedUrl !== newUrl) {
                console.log('[TrackForcePro] URL changed, resetting favicon flag');
                faviconApplied = false;
                lastAppliedUrl = newUrl;
                lastAppliedOrgId = null;  // Clear org tracking
                cachedOrgId = null;  // Clear cached org ID
            }
            return originalPushState.apply(history, args);
        };

        history.replaceState = function(...args) {
            const newUrl = args[2];
            if (lastAppliedUrl !== newUrl) {
                console.log('[TrackForcePro] URL changed via replaceState, resetting favicon flag');
                faviconApplied = false;
                lastAppliedUrl = newUrl;
                lastAppliedOrgId = null;  // Clear org tracking
                cachedOrgId = null;  // Clear cached org ID
            }
            return originalReplaceState.apply(history, args);
        };

        // Also watch for popstate (back/forward navigation)
        window.addEventListener('popstate', () => {
            console.log('[TrackForcePro] Page navigation detected (popstate), resetting favicon flag');
            faviconApplied = false;
            lastAppliedOrgId = null;  // Clear org tracking
            cachedOrgId = null;
        });
    }

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

        // Skip if already applied FOR THIS EXACT URL
        if (faviconApplied && lastAppliedUrl === location.href) {
            console.log('[TrackForcePro] Already applied for this URL, skipping');
            return;
        }

        console.log('[TrackForcePro] Favicon status - Applied:', faviconApplied, 'Last URL:', lastAppliedUrl, 'Current URL:', location.href);

        // First, try an immediate attempt (0ms) in case we have cached data or quick detection
        // Then use increasing delays for subsequent attempts
        const attempts = [0, 500, 1500, 3000, 6000, 10000];

        for (let i = 0; i < attempts.length; i++) {
            // Check if already applied FOR THIS EXACT URL
            if (faviconApplied && lastAppliedUrl === location.href) {
                console.log('[TrackForcePro] Favicon already applied for this URL, exiting');
                return;
            }

            if (attempts[i] > 0) {
                await new Promise(resolve => setTimeout(resolve, attempts[i]));
            }

            console.log(`[TrackForcePro] Attempt ${i + 1}/${attempts.length}`);

            try {
                const applied = await tryApplyFavicon();
                if (applied) {
                    console.log('[TrackForcePro] Favicon applied successfully');
                    faviconApplied = true;
                    lastAppliedUrl = location.href;
                    // Get org ID for tracking
                    try {
                        const orgId = await getOrgIdFromPageFresh();
                        lastAppliedOrgId = orgId;
                    } catch (e) {
                        console.warn('[TrackForcePro] Could not track org ID:', e.message);
                    }
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
        console.log('[TrackForcePro] tryApplyFavicon() called for URL:', location.href);

        // First check if we have any saved favicons
        let result;
        try {
            result = await chrome.storage.local.get('orgFavicons');
            console.log('[TrackForcePro] Storage access OK');
        } catch (e) {
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
            return false;
        }

        // Log all saved favicons
        for (const [id, settings] of Object.entries(orgFavicons)) {
            console.log(`[TrackForcePro] Saved favicon: orgId=${id}, hostname=${settings.hostname}, color=${settings.color}`);
        }

        // Try to get org ID from the page (may fail, that's OK - we have fallbacks)
        let currentOrgId = null;
        try {
            currentOrgId = await getOrgIdFromPageFresh();
            console.log('[TrackForcePro] Fresh org ID detection:', currentOrgId);
        } catch (e) {
            console.warn('[TrackForcePro] Error detecting org ID:', e.message);
        }

        // Helper: Normalize org ID to 15 chars for comparison
        const normalizeOrgId = (id) => {
            if (!id) return null;
            // Convert 18-char ID to 15-char ID for comparison
            return id.substring(0, 15);
        };

        // Strategy 1: Direct org ID match (handle both 15 and 18 char IDs)
        if (currentOrgId) {
            const normalizedCurrentId = normalizeOrgId(currentOrgId);

            // First try exact match
            if (orgFavicons[currentOrgId]) {
                const { color, label, shape } = orgFavicons[currentOrgId];
                if (color || label) {
                    console.log('[TrackForcePro] Strategy 1a: Exact org ID match found for:', currentOrgId);
                    updateFavicon(color, label, shape);
                    return true;
                }
            }

            // Try normalized match (15 vs 18 char)
            for (const [savedOrgId, settings] of Object.entries(orgFavicons)) {
                if (normalizeOrgId(savedOrgId) === normalizedCurrentId) {
                    const { color, label, shape } = settings;
                    if (color || label) {
                        console.log('[TrackForcePro] Strategy 1b: Normalized org ID match found:', savedOrgId, '===', currentOrgId);
                        updateFavicon(color, label, shape);
                        return true;
                    }
                }
            }
        }

        // Strategy 2: Hostname-based fallback lookup
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
    /**
     * Get org ID from the current page WITHOUT using cache
     * This is critical for multi-org scenarios where cached org ID might be stale
     */
    async function getOrgIdFromPageFresh() {
        console.log('[TrackForcePro] getOrgIdFromPageFresh() - Fresh detection for URL:', location.href);

        // Method 1: Check for oid cookie value directly (most reliable method)
        try {
            const cookies = document.cookie.split(';');
            for (const cookie of cookies) {
                const [name, value] = cookie.trim().split('=');
                if (name === 'oid' && value && (value.length === 15 || value.length === 18)) {
                    console.log('[TrackForcePro] Fresh: Got org ID from oid cookie:', value);
                    return value;
                }
            }
        } catch (e) {}

        // Method 2: Check URL for oid parameter
        try {
            const urlParams = new URLSearchParams(location.search);
            const oidFromUrl = urlParams.get('oid') || urlParams.get('organizationId');
            if (oidFromUrl && (oidFromUrl.length === 15 || oidFromUrl.length === 18)) {
                console.log('[TrackForcePro] Fresh: Got org ID from URL parameter:', oidFromUrl);
                return oidFromUrl;
            }
        } catch (e) {}

        // Method 3: Look for org ID in page metadata
        try {
            const metaOrg = document.querySelector('meta[name="org-id"]');
            if (metaOrg && metaOrg.content) {
                console.log('[TrackForcePro] Fresh: Got org ID from meta tag:', metaOrg.content);
                return metaOrg.content;
            }
        } catch (e) {}

        // Method 4: Try to extract org ID from page HTML
        try {
            const scripts = document.querySelectorAll('script');
            for (const script of scripts) {
                if (script.textContent) {
                    const match = script.textContent.match(/(?:organizationId|orgId)['":\s]+(['"]?)([0-9a-zA-Z]{15,18})\1/i);
                    if (match && match[2] && match[2].startsWith('00D')) {
                        console.log('[TrackForcePro] Fresh: Got org ID from script content:', match[2]);
                        return match[2];
                    }
                }
            }
        } catch (e) {}

        // No org ID found
        console.log('[TrackForcePro] Fresh: Could not detect org ID from any method');
        return null;
    }

    async function getOrgIdFromPage() {
        // ...existing code...
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

    // =====================================================
    // LMS (Lightning Message Service) Publishing Support
    // =====================================================

    let lmsBridgeInjected = false;
    let lmsBridgeReady = false;
    const lmsPendingRequests = new Map();
    let lmsRequestIdCounter = 0;

    const LMS_MSG_PREFIX = 'TRACKFORCEPRO_LMS_';

    /**
     * Listen for responses from the injected LMS bridge script
     */
    window.addEventListener('message', (event) => {
        if (event.source !== window) return;
        const data = event.data;
        if (!data || typeof data.type !== 'string') return;
        if (!data.type.startsWith(LMS_MSG_PREFIX)) return;

        // Handle bridge ready signal
        if (data.type === LMS_MSG_PREFIX + 'BRIDGE_READY') {
            lmsBridgeReady = true;
            console.log('[TrackForcePro] LMS Bridge is ready');
            return;
        }

        // Only process response messages (those with _RESPONSE suffix)
        // Ignore outbound request messages that echo back
        if (!data.type.includes('_RESPONSE')) {
            return;
        }

        // Handle responses to pending requests
        const requestId = data.requestId;
        console.log('[TrackForcePro] LMS response received:', data.type, 'requestId:', requestId, 'success:', data.success);

        if (requestId && lmsPendingRequests.has(requestId)) {
            const { resolve, reject } = lmsPendingRequests.get(requestId);
            lmsPendingRequests.delete(requestId);

            if (data.success) {
                console.log('[TrackForcePro] LMS publish succeeded:', data.data);
                resolve(data.data || { success: true });
            } else {
                const errorMsg = data.error || 'Unknown error from bridge';
                console.error('[TrackForcePro] LMS publish failed:', errorMsg, 'Full response:', data);
                reject(new Error(errorMsg));
            }
        } else {
            console.log('[TrackForcePro] LMS response received but no pending request found for requestId:', requestId);
        }
    });

    /**
     * Inject the LMS bridge script into the page
     */
    async function injectLmsBridge() {
        if (lmsBridgeInjected) return;

        return new Promise((resolve, reject) => {
            try {
                const script = document.createElement('script');
                const scriptUrl = chrome.runtime.getURL('scripts/lms_injected.js');
                console.log('[TrackForcePro] Attempting to inject LMS bridge from:', scriptUrl);

                script.src = scriptUrl;
                script.onload = () => {
                    console.log('[TrackForcePro] LMS bridge script loaded successfully');
                    lmsBridgeInjected = true;
                    // Wait a moment for the bridge to initialize
                    setTimeout(() => {
                        lmsBridgeReady = true;
                        resolve();
                    }, 100);
                };
                script.onerror = (e) => {
                    const errorMsg = `Failed to load LMS bridge script from ${scriptUrl}. This may be due to: 1) Script not included in web_accessible_resources in manifest.json, 2) Network error, 3) Script syntax error. Check browser console for details.`;
                    console.error('[TrackForcePro]', errorMsg, e);
                    reject(new Error(errorMsg));
                };
                script.onabort = () => {
                    const errorMsg = `LMS bridge script load was aborted for ${scriptUrl}`;
                    console.warn('[TrackForcePro]', errorMsg);
                    reject(new Error(errorMsg));
                };
                (document.head || document.documentElement).appendChild(script);
            } catch (e) {
                console.error('[TrackForcePro] Exception while injecting LMS bridge:', e);
                reject(e);
            }
        });
    }

    /**
     * Send a message to the LMS bridge and wait for response
     */
    async function sendToLmsBridge(type, data, timeoutMs = 5000) {
        // Ensure bridge is injected
        if (!lmsBridgeInjected) {
            await injectLmsBridge();
        }

        return new Promise((resolve, reject) => {
            const requestId = ++lmsRequestIdCounter;
            const timeout = setTimeout(() => {
                lmsPendingRequests.delete(requestId);
                reject(new Error('LMS bridge request timed out'));
            }, timeoutMs);

            lmsPendingRequests.set(requestId, {
                resolve: (result) => {
                    clearTimeout(timeout);
                    resolve(result);
                },
                reject: (error) => {
                    clearTimeout(timeout);
                    reject(error);
                }
            });

            window.postMessage({
                type: LMS_MSG_PREFIX + type,
                requestId: requestId,
                ...data
            }, '*');
        });
    }

    /**
     * Check if LMS is available on the current page
     */
    async function checkLmsAvailability() {
        try {
            // Inject the bridge and ask it to check availability
            // The bridge runs in page context and can access window.$A
            const result = await sendToLmsBridge('CHECK_AVAILABILITY', {});
            return { success: true, ...result };
        } catch (e) {
            // Fallback: basic detection based on URL only
            // Note: We cannot check window.$A from content script (isolated world)
            const isLightning = window.location.pathname.includes('/lightning/') ||
                               window.location.hostname.includes('.lightning.force.com');
            return {
                success: true,
                isLightningPage: isLightning, // Assume true if URL looks like Lightning
                hasAura: isLightning, // We can't verify from content script, assume based on URL
                pageType: isLightning ? 'lightning' : 'other',
                note: 'Bridge check failed, using URL-based detection'
            };
        }
    }

    /**
     * Publish a message to an LMS channel
     */
    async function handleLmsPublish(channelApiName, payload) {
        if (!channelApiName) {
            return { success: false, error: 'Channel name is required' };
        }

        try {
            // Check if URL looks like a Lightning page
            // Note: Full Aura check happens in the injected bridge script which runs in page context
            const isLightningUrl = window.location.pathname.includes('/lightning/') ||
                                   window.location.hostname.includes('.lightning.force.com');

            if (!isLightningUrl) {
                return {
                    success: false,
                    error: 'LMS publishing requires a Lightning Experience page. Please navigate to a Lightning page and try again.',
                    pageUrl: window.location.href
                };
            }

            // Attempt to publish via the bridge (runs in page context with $A access)
            const result = await sendToLmsBridge('PUBLISH', {
                channel: channelApiName,
                payload: payload || {}
            }, 10000);

            return {
                success: true,
                message: result.message || 'Message published successfully',
                channel: channelApiName,
                note: result.note,
                response: result
            };
        } catch (e) {
            // If bridge fails, it might be because $A is not available
            return {
                success: false,
                error: e.message || 'Failed to publish LMS message. Make sure you are on a Lightning Experience page.',
                pageUrl: window.location.href
            };
        }
    }
})();
