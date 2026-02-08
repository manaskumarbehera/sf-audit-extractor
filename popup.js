(function() {
    'use strict';
    try {
        if (typeof window !== 'undefined') {
            window.findPopupEditor = window.findPopupEditor || function() {
                try {
                    // Prefer common explicit ids
                    let el = document.getElementById('editor') || document.getElementById('main-editor');
                    if (el) return el;
                    // Common alternate selectors (generic)
                    el = document.querySelector('[data-editor], textarea.editor, .editor, textarea, input[type="text"], [contenteditable="true"]');
                    if (el) return el;
                    // Last-resort: first textarea/input/contenteditable
                    const candidate = document.querySelector('textarea, input[type="text"], [contenteditable="true"]');
                    return candidate || null;
                } catch (e) { return null; }
            };
            // Minimal process shim for browser popup: some modules check `process.env.SUGGEST_DEBUG`.
            // Defining a tiny `process` object prevents ReferenceError while keeping behavior inert.
            if (typeof window.process === 'undefined') {
                try { window.process = { env: {} }; } catch (e) { /* ignore */ }
            }
        }
    } catch (e) { /* ignore */ }

    let sessionInfo = null;
    const statusEl = document.getElementById('status');
    const statusText = statusEl ? statusEl.querySelector('.status-text') : null;

    const appPopBtn = document.getElementById('app-pop');
    const apiVersionSel = document.getElementById('api-version');

    let auditFetched = false;

    // Loader for settings helper so popup.js doesn't contain tab settings logic directly
    async function loadSettingsHelper() {
        if (window.SettingsHelper) return;
        await new Promise((resolve) => {
            try {
                const s = document.createElement('script');
                s.src = 'settings_helper.js';
                s.async = false;
                s.onload = () => resolve();
                s.onerror = () => resolve();
                document.head.appendChild(s);
            } catch { resolve(); }
        });
    }

    function ensureSettingsPanelMarkupExists() {
        const pane = document.querySelector('.tab-pane[data-tab="settings"]');
        if (!pane) return;
        if (!pane.querySelector('#tab-settings-list')) {
            pane.innerHTML = `
                <div class="settings-group">
                    <h4>Tab visibility</h4>
                    <div class="settings-list" id="tab-settings-list"></div>
                </div>
            `;
        }
    }

    // init() is called at the end of this IIFE to ensure all functions are defined first

    async function init() {
        // Load Settings helper and inject flex CSS early to enable stretchable layout
        await loadSettingsHelper();
        try { window.SettingsHelper && window.SettingsHelper.injectFlexCss && window.SettingsHelper.injectFlexCss(); } catch {}

        // IMPORTANT: Clear instance URL cache to ensure we get fresh data for THIS window's SF tab
        // This prevents stale data from other browser windows being displayed
        try { Utils.setInstanceUrlCache && Utils.setInstanceUrlCache(null); } catch {}

        const apiVersion = await loadAndBindApiVersion();

        // If we are a popped-out standalone window, try to load a transferred session from storage
        try {
            const stored = await new Promise((resolve) => {
                try { chrome.storage.local.get({ appSession: null }, (r) => resolve(r || {})); } catch { resolve({ appSession: null }); }
            });
            if (stored && stored.appSession) {
                sessionInfo = stored.appSession;
                try { Utils.setInstanceUrlCache && Utils.setInstanceUrlCache(sessionInfo.instanceUrl || null); } catch {}
                // reflect connected status in UI if possible
                if (sessionInfo && sessionInfo.isLoggedIn) {
                    updateStatus(true, 'Connected to Salesforce (transferred session)');
                    // Fetch org name for title update in standalone mode
                    if (window.location.hash.includes('standalone')) {
                        const accessToken = getAccessToken();
                        const instanceUrl = sessionInfo.instanceUrl;
                        if (accessToken && instanceUrl) {
                            fetchOrgName(instanceUrl, accessToken, apiVersion)
                                .then(name => {
                                    if (name) {
                                        updateStatus(true, `Connected to ${name}`);
                                        document.title = `${name} - TrackForcePro`;
                                    }
                                })
                                .catch(() => {});
                        }
                    }
                }
                // clear consumed session so it doesn't linger across future launches
                try { chrome.storage.local.remove('appSession'); } catch {}
            }
        } catch {}

        await checkSalesforceConnection();

        // Theme application removed - keeping favicon functionality only

        try {
            const fresh = await sendMessageToSalesforceTab({ action: 'getSessionInfo' });
            if (fresh && fresh.success && fresh.isLoggedIn) {
                sessionInfo = fresh;
                try { Utils.setInstanceUrlCache && Utils.setInstanceUrlCache(fresh.instanceUrl || null); } catch {}
                const accessToken = getAccessToken();
                const instanceUrl = fresh.instanceUrl;
                if (accessToken && instanceUrl) {
                    try {
                        const orgName = await fetchOrgName(instanceUrl, accessToken, apiVersion);
                        updateStatus(true, orgName ? `Connected to ${orgName}` : 'Connected to Salesforce');
                        if (orgName && window.location.hash.includes('standalone')) {
                            document.title = `${orgName} : TrackForcePro`;
                        }
                    } catch {
                        updateStatus(true, 'Connected to Salesforce');
                    }
                }
            }
        } catch { /* ignore */ }

        initLmsHelper();
        initPlatformHelper(apiVersion);
        initAuditHelper();

        await setupTabs();

        attachAppPopHandlers();
    }

    async function loadAndBindApiVersion() {
        let selected = '66.0';
        try {
            const res = await chrome.storage?.local?.get?.({ apiVersion: '66.0' });
            if (res && res.apiVersion) selected = String(res.apiVersion);
        } catch { /* default */ }
        // Normalize and persist normalized API version
        try {
            const norm = (window.Utils && Utils.normalizeApiVersion) ? Utils.normalizeApiVersion(selected) : String(selected);
            if (norm) {
                if (norm !== selected) { try { await chrome.storage?.local?.set?.({ apiVersion: norm }); } catch {} }
                selected = norm;
            }
        } catch {}
        if (apiVersionSel) {
            const opts = Array.from(apiVersionSel.options).map(o => o.value);
            apiVersionSel.value = opts.includes(selected) ? selected : '66.0';
            apiVersionSel.addEventListener('change', async () => {
                const raw = apiVersionSel.value || '66.0';
                const v = (window.Utils && Utils.normalizeApiVersion) ? (Utils.normalizeApiVersion(raw) || '66.0') : raw;
                try { await chrome.storage?.local?.set?.({ apiVersion: v }); } catch {}
                // reflect normalized value in UI
                apiVersionSel.value = v;
                try { window.PlatformHelper && window.PlatformHelper.updateApiVersion && window.PlatformHelper.updateApiVersion(v); } catch {}
            });
        }
        return selected;
    }

    function initPlatformHelper(apiVersion) {
        if (!window.PlatformHelper) return;
        try {
            const norm = (window.Utils && Utils.normalizeApiVersion) ? (Utils.normalizeApiVersion(apiVersion || (apiVersionSel?.value || '66.0')) || '66.0') : (apiVersion || '66.0');
            const getSess = () => sessionInfo;
            window.PlatformHelper.init({
                apiVersion: norm,
                getSession: getSess,
                setSession: (s) => { sessionInfo = s; },
                refreshSessionFromTab: async () => {
                    const before = getSess();
                    try {
                        const fresh = await sendMessageToSalesforceTab({ action: 'getSessionInfo' });
                        if (fresh && fresh.success && fresh.isLoggedIn) {
                            sessionInfo = fresh;
                            try {
                                const prevUrl = before?.instanceUrl || null;
                                const nextUrl = fresh.instanceUrl || null;
                                if (prevUrl && nextUrl && prevUrl !== nextUrl) {
                                    // Org changed; clear instance URL cache to force refetch
                                    Utils.setInstanceUrlCache && Utils.setInstanceUrlCache(null);
                                } else if (nextUrl) {
                                    // Keep cache fresh
                                    Utils.setInstanceUrlCache && Utils.setInstanceUrlCache(nextUrl);
                                }
                            } catch {}
                            return fresh;
                        }
                    } catch {}
                    return null;
                }
            });
        } catch { /* no-op */ }
    }

    function initLmsHelper() {
        if (!window.LmsHelper) return;
        try { window.LmsHelper.init({ getSession: () => sessionInfo }); } catch { /* no-op */ }
    }

    function initAuditHelper() {
        if (!window.AuditHelper) return;
        try {
            window.AuditHelper.init({
                getSession: () => sessionInfo,
                refreshSessionFromTab: async () => {
                    const before = sessionInfo;
                    try {
                        const fresh = await sendMessageToSalesforceTab({ action: 'getSessionInfo' });
                        if (fresh && fresh.success && fresh.isLoggedIn) {
                            sessionInfo = fresh;
                            try {
                                const prevUrl = before?.instanceUrl || null;
                                const nextUrl = fresh.instanceUrl || null;
                                if (prevUrl && nextUrl && prevUrl !== nextUrl) {
                                    Utils.setInstanceUrlCache && Utils.setInstanceUrlCache(null);
                                } else if (nextUrl) {
                                    Utils.setInstanceUrlCache && Utils.setInstanceUrlCache(nextUrl);
                                }
                            } catch {}
                            return fresh;
                        }
                    } catch {}
                    return null;
                }
            });
        } catch { /* no-op */ }
    }

    function attachAppPopHandlers() {
        if (!appPopBtn) return;

        const isStandalone = window.location.hash.includes('standalone');

        appPopBtn.disabled = true;
        // Track current popped state locally so we can include session when popping out
        let appPoppedState = false;

        chrome.runtime.sendMessage({ action: 'APP_POP_GET' }, (resp) => {
            if (chrome.runtime.lastError) {
                updateAppPopButton(false, isStandalone);
                appPopBtn.disabled = false;
                return;
            }
            appPoppedState = resp && resp.success ? !!resp.popped : false;
            updateAppPopButton(appPoppedState, isStandalone);
            appPopBtn.disabled = false;
        });

        appPopBtn.addEventListener('click', () => {
            if (appPopBtn.disabled) return;
            appPopBtn.disabled = true;

            // If we're in standalone window, clicking "pop in" should close this window
            if (isStandalone) {
                // Pop in: close standalone window and reset state
                chrome.runtime.sendMessage({ action: 'APP_POP_SET', popped: false }, (resp) => {
                    if (!chrome.runtime.lastError && resp && resp.success) {
                        // Close the standalone window
                        window.close();
                    }
                    appPopBtn.disabled = false;
                });
                return;
            }

            // If we're in popup, clicking "pop out" should open standalone and close popup
            const next = !appPoppedState;
            const payload = { action: 'APP_POP_SET', popped: next };
            // When popping out, include current session if available to transfer it
            if (next && sessionInfo) payload.session = sessionInfo;

            chrome.runtime.sendMessage(payload, (resp) => {
                if (!chrome.runtime.lastError && resp && resp.success) {
                    appPoppedState = !!resp.popped;
                    updateAppPopButton(appPoppedState, isStandalone);
                    // Close the popup window when successfully popping out
                    if (next && appPoppedState) {
                        // Use a small timeout to ensure the message completes
                        setTimeout(() => {
                            try { window.close(); } catch (e) { /* ignore */ }
                        }, 100);
                    }
                }
                appPopBtn.disabled = false;
            });
        });
    }

    function svgPopOut() {
        const xmlns = 'http://www.w3.org/2000/svg';
        const svg = document.createElementNS(xmlns, 'svg');
        svg.setAttribute('viewBox', '0 0 24 24');
        svg.setAttribute('aria-hidden', 'true');
        svg.setAttribute('fill', 'none');
        svg.setAttribute('stroke', 'currentColor');
        svg.setAttribute('stroke-width', '2');
        svg.setAttribute('stroke-linecap', 'round');
        svg.setAttribute('stroke-linejoin', 'round');
        const pathWin = document.createElementNS(xmlns, 'path');
        pathWin.setAttribute('d', 'M18 13v6a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6');
        const poly = document.createElementNS(xmlns, 'polyline');
        poly.setAttribute('points', '15 3 21 3 21 9');
        const line = document.createElementNS(xmlns, 'line');
        line.setAttribute('x1', '10'); line.setAttribute('y1', '14');
        line.setAttribute('x2', '21'); line.setAttribute('y2', '3');
        svg.appendChild(pathWin); svg.appendChild(poly); svg.appendChild(line);
        return svg.outerHTML;
    }

    function svgPopIn() {
        const xmlns = 'http://www.w3.org/2000/svg';
        const svg = document.createElementNS(xmlns, 'svg');
        svg.setAttribute('viewBox', '0 0 24 24');
        svg.setAttribute('aria-hidden', 'true');
        svg.setAttribute('fill', 'none');
        svg.setAttribute('stroke', 'currentColor');
        svg.setAttribute('stroke-width', '2');
        svg.setAttribute('stroke-linecap', 'round');
        svg.setAttribute('stroke-linejoin', 'round');
        const pathWin = document.createElementNS(xmlns, 'path');
        pathWin.setAttribute('d', 'M19 7v9a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h5');
        const line = document.createElementNS(xmlns, 'line');
        line.setAttribute('x1', '16'); line.setAttribute('y1', '8');
        line.setAttribute('x2', '8');  line.setAttribute('y2', '16');
        const poly = document.createElementNS(xmlns, 'polyline');
        poly.setAttribute('points', '16 16 8 16 8 8');
        svg.appendChild(pathWin); svg.appendChild(line); svg.appendChild(poly);
        return svg.outerHTML;
    }

    function updateAppPopButton(popped, isStandalone = false) {
        if (!appPopBtn) return;
        // In standalone mode, always show "pop in" button
        const showPopIn = isStandalone || popped;
        appPopBtn.classList.toggle('active', showPopIn);
        appPopBtn.setAttribute('aria-pressed', showPopIn ? 'true' : 'false');
        appPopBtn.title = showPopIn ? 'Pop in (return to popup)' : 'Pop out to window';
        appPopBtn.setAttribute('aria-label', appPopBtn.title);
        appPopBtn.innerHTML = showPopIn ? svgPopIn() : svgPopOut();
    }

    async function findSalesforceTab() {
        try { return await Utils.findSalesforceTab(); } catch { return null; }
    }

    async function sendMessageToSalesforceTab(message) {
        try { return await Utils.sendMessageToSalesforceTab(message); } catch { return null; }
    }

    function getAccessToken() {
        try { return Utils.getAccessToken(sessionInfo); } catch { return null; }
    }

    async function fetchOrgName(instanceUrl, accessToken, apiVersion) {
        if (!instanceUrl || !accessToken) return null;
        const raw = String(apiVersion || apiVersionSel?.value || '66.0');
        const v = (window.Utils && Utils.normalizeApiVersion) ? (Utils.normalizeApiVersion(raw) || '66.0') : raw;
        // Query organization name (encoded). Kept minimal and not part of any removed feature.
        const orgQuery = encodeURIComponent(['SELECT', 'Name', 'FROM', 'Organization', 'LIMIT', '1'].join(' '));
        const url = `${instanceUrl}/services/data/v${v}/query?q=${orgQuery}`;
        const res = await fetch(url, { method: 'GET', headers: { 'Authorization': `Bearer ${accessToken}`, 'Accept': 'application/json' } });
        if (!res.ok) throw new Error(`SF API ${res.status}: ${res.statusText}`);
        const data = await res.json();
        const name = data?.records?.[0]?.Name;
        return name || null;
    }

    // Apply saved tab order from storage by physically re-ordering the tab buttons under the container
    async function applySavedTabOrder(container) {
        if (!container) return;
        let saved = [];
        try {
            const res = await chrome.storage?.local?.get?.({ tabOrder: [] });
            if (res && Array.isArray(res.tabOrder)) saved = res.tabOrder;
        } catch { /* ignore */ }
        if (!saved || saved.length === 0) return;
        const buttons = Array.from(container.querySelectorAll('.tab-button'));
        if (!buttons.length) return;
        const map = new Map(buttons.map(b => [b.dataset.tab, b]));
        const frag = document.createDocumentFragment();
        saved.forEach(name => {
            const el = map.get(name);
            if (el) { frag.appendChild(el); map.delete(name); }
        });
        // Append any new/unknown tabs that were not in saved order
        map.forEach(el => frag.appendChild(el));
        container.appendChild(frag);
    }

    // Enable drag-and-drop reordering of tabs and persist the new order
    function enableTabDragAndDrop(container, onOrderChanged) {
        if (!container) return;
        const buttons = () => Array.from(container.querySelectorAll('.tab-button'));
        let dragged = null;

        function clearDropHints() { buttons().forEach(b => b.classList.remove('drop-before', 'drop-after')); }
        function setDropHint(btn, where) { clearDropHints(); btn.classList.add(where === 'before' ? 'drop-before' : 'drop-after'); }
        function saveOrder() {
            const order = buttons().map(b => b.dataset.tab);
            try { chrome.storage?.local?.set?.({ tabOrder: order }); } catch {}
            if (typeof onOrderChanged === 'function') { try { onOrderChanged(order); } catch {} }
        }

        // Attach DnD handlers to each button
        buttons().forEach(btn => {
            btn.setAttribute('draggable', 'true');
            // Make it clear you can drag
            if (!btn.title || btn.title.indexOf('Drag to reorder') === -1) {
                btn.title = (btn.title ? btn.title + ' — ' : '') + 'Drag to reorder';
            }
            btn.addEventListener('dragstart', (e) => {
                dragged = btn;
                btn.classList.add('dragging');
                try {
                    e.dataTransfer.effectAllowed = 'move';
                    e.dataTransfer.setData('text/plain', btn.dataset.tab || '');
                } catch {}
            });
            btn.addEventListener('dragend', () => {
                if (dragged) dragged.classList.remove('dragging');
                dragged = null;
                clearDropHints();
                saveOrder();
            });
            btn.addEventListener('dragover', (e) => {
                e.preventDefault(); // allow drop
                if (!dragged || dragged === btn) return;
                const rect = btn.getBoundingClientRect();
                const before = (e.clientX - rect.left) < rect.width / 2;
                setDropHint(btn, before ? 'before' : 'after');
            });
            btn.addEventListener('dragleave', () => {
                btn.classList.remove('drop-before', 'drop-after');
            });
            btn.addEventListener('drop', (e) => {
                e.preventDefault();
                clearDropHints();
                if (!dragged || dragged === btn) return;
                const rect = btn.getBoundingClientRect();
                const before = (e.clientX - rect.left) < rect.width / 2;
                if (before) container.insertBefore(dragged, btn); else container.insertBefore(dragged, btn.nextSibling);
                saveOrder();
            });
        });
    }

    async function setupTabs() {
        const H = window.SettingsHelper;

        if (H) {
            H.ensureSettingsTabExists();
            ensureSettingsPanelMarkupExists();

            const tabsContainer = document.querySelector('.tabs');
            await applySavedTabOrder(tabsContainer);

            const buttons = document.querySelectorAll('.tab-button');
            const panes = document.querySelectorAll('.tab-pane');
            const headerTitle = document.getElementById('header-title');

            let currentVisibility = await H.applyTabVisibilityFromStorage(buttons, panes);
            await H.buildSettingsPanel(async (updatedVis) => {
                currentVisibility = updatedVis;
                await H.applyTabVisibilityFromStorage(document.querySelectorAll('.tab-button'), document.querySelectorAll('.tab-pane'));
                const active = document.querySelector('.tab-pane.active');
                if (!active || active.hasAttribute('hidden')) {
                    const first = H.firstVisibleTabName();
                    if (first) showTab(first);
                }
            });

            function showTab(name) {
                const activated = H.showTab(name, currentVisibility, {
                    headerTitle, panes, buttons,
                    onActivated: (tabName) => {
                        if (tabName === 'platform') {
                            try { document.dispatchEvent(new CustomEvent('platform-load')); } catch {}
                        }
                        if (tabName === 'sf' && !auditFetched) {
                            auditFetched = true;
                            try { window.AuditHelper?.fetchNow?.(); } catch {}
                        }
                        if (tabName === 'lms') {
                            try { document.dispatchEvent(new CustomEvent('lms-load')); } catch {}
                        }
                        if (tabName === 'data') {
                            try { window.DataExplorerHelper?.init?.(); } catch {}
                        }
                    }
                });
                try { history.replaceState(null, '', `#${activated}`); } catch {}
            }

            document.querySelectorAll('.tab-button').forEach(btn => {
                btn.addEventListener('click', () => showTab(btn.dataset.tab));
            });

            enableTabDragAndDrop(tabsContainer, () => {});

            const allNames = Array.from(document.querySelectorAll('.tab-button')).map(b => b.dataset.tab);
            const rawHash = (location.hash || '').replace('#', '').toLowerCase();

            (async () => {
                let initial = null;
                try {
                    const saved = await chrome.storage?.local?.get?.({ lastTab: '' });
                    if (saved?.lastTab && allNames.includes(saved.lastTab) && currentVisibility?.[saved.lastTab]) {
                        initial = saved.lastTab;
                    }
                } catch {}
                if (!initial) {
                    initial = (allNames.includes(rawHash) && currentVisibility?.[rawHash]) ? rawHash : (H.firstVisibleTabName() || 'sf');
                }
                showTab(initial);
            })();

            window.addEventListener('hashchange', () => {
                const h = (location.hash || '').replace('#','').toLowerCase();
                if (allNames.includes(h)) showTab(h);
            });

            return;
        }

        // Fallback to original behavior if helper failed to load
        const tabsContainer = document.querySelector('.tabs');
        await applySavedTabOrder(tabsContainer);

        const buttons = document.querySelectorAll('.tab-button');
        const panes = document.querySelectorAll('.tab-pane');
        const headerTitle = document.getElementById('header-title');

        function showTabSimple(name) {
            panes.forEach(p => {
                const isActive = p.dataset.tab === name;
                p.classList.toggle('active', isActive);
                if (isActive) {
                    p.removeAttribute('hidden');
                } else {
                    p.setAttribute('hidden', '');
                }
            });
            buttons.forEach(b => {
                const active = b.dataset.tab === name;
                b.classList.toggle('active', active);
                b.setAttribute('aria-selected', active ? 'true' : 'false');
            });
            const activeBtn = Array.from(buttons).find(b => b.dataset.tab === name);
            if (headerTitle) headerTitle.textContent = (activeBtn?.textContent || 'Audit Trails').trim();

            // persist selection
            try { chrome.storage?.local?.set?.({ lastTab: name }); } catch {}

            if (name === 'platform') {
                try { document.dispatchEvent(new CustomEvent('platform-load')); } catch {}
            }
            if (name === 'sf' && !auditFetched) {
                auditFetched = true;
                try { window.AuditHelper && window.AuditHelper.fetchNow && window.AuditHelper.fetchNow(); } catch {}
            }
            if (name === 'lms') {
                try { document.dispatchEvent(new CustomEvent('lms-load')); } catch {}
            }
            if (name === 'data') {
                try { window.DataExplorerHelper && window.DataExplorerHelper.init && window.DataExplorerHelper.init(); } catch {}
            }
        }

        buttons.forEach(btn => {
            btn.addEventListener('click', () => {
                const name = btn.dataset.tab;
                showTabSimple(name);
                try { history.replaceState(null, '', `#${name}`); } catch {}
            });
        });

        // Enable drag-and-drop tab reordering after listeners are attached
        enableTabDragAndDrop(tabsContainer, /* onOrderChanged */ () => {});

        const allNames = Array.from(buttons).map(b => b.dataset.tab);
        const rawHash = (location.hash || '').replace('#','').toLowerCase();

        // restore last tab or default to first available
        (async () => {
            let initial = null;
            try {
                const saved = await chrome.storage?.local?.get?.({ lastTab: '' });
                if (saved && saved.lastTab && allNames.includes(saved.lastTab)) initial = saved.lastTab;
            } catch {}
            if (!initial) initial = allNames.includes(rawHash) ? rawHash : (document.querySelector('.tab-button.active')?.dataset.tab || (allNames[0] || 'sf'));
            showTabSimple(initial);
        })();

        window.addEventListener('hashchange', () => {
            const h = (location.hash || '').replace('#','').toLowerCase();
            if (allNames.includes(h)) showTabSimple(h);
        });
    }

    async function checkSalesforceConnection() {
        try {
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            if (!tab || !tab.url) { updateStatus(false, 'No active tab'); return; }

            let isSalesforce;
            try {
                const url = new URL(tab.url);
                const hostname = url.hostname.toLowerCase();
                isSalesforce = hostname.endsWith('.salesforce.com') || hostname.endsWith('.force.com') || hostname === 'salesforce.com' || hostname === 'force.com';
            } catch { isSalesforce = false; }

            if (!isSalesforce) { updateStatus(false, 'Not on Salesforce'); return; }

            const response = await new Promise((resolve) => {
                try {
                    chrome.tabs.sendMessage(tab.id, { action: 'getSessionInfo' }, (resp) => {
                        if (chrome.runtime.lastError) {
                            console.warn('Tab message error:', chrome.runtime.lastError.message);
                            resolve(null);
                            return;
                        }
                        resolve(resp);
                    });
                } catch (e) {
                    console.warn('Tab sendMessage exception:', e);
                    resolve(null);
                }
            });
            if (!response) { updateStatus(false, 'Cannot access page'); return; }

            if (response && response.success && response.isLoggedIn) {
                sessionInfo = response;
                try { Utils.setInstanceUrlCache && Utils.setInstanceUrlCache(response.instanceUrl || null); } catch {}
                updateStatus(true, 'Connected to Salesforce');
            } else {
                updateStatus(false, 'Not logged in');
            }
        } catch {
            updateStatus(false, 'Connection failed');
        }
    }

    function updateStatus(connected, message) {
        if (!statusEl || !statusText) return;
        if (connected) statusEl.classList.add('connected'); else statusEl.classList.remove('connected');
        statusText.textContent = message;
    }


    // Initialize the popup - wait for DOM to be ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        // DOM already loaded
        init();
    }
})();
