(function() {
    'use strict';

    let sessionInfo = null;
    const statusEl = document.getElementById('status');
    const statusText = statusEl ? statusEl.querySelector('.status-text') : null;

    const pePinBtn = document.getElementById('pe-pin');
    const apiVersionSel = document.getElementById('api-version');

    let auditFetched = false;

    init();

    async function init() {
        const apiVersion = await loadAndBindApiVersion();

        await checkSalesforceConnection();
        try {
            const fresh = await sendMessageToSalesforceTab({ action: 'getSessionInfo' });
            if (fresh && fresh.success && fresh.isLoggedIn) {
                sessionInfo = fresh;
                const accessToken = getAccessToken();
                const instanceUrl = fresh.instanceUrl;
                if (accessToken && instanceUrl) {
                    try {
                        const orgName = await fetchOrgName(instanceUrl, accessToken, apiVersion);
                        updateStatus(true, orgName ? `Connected to ${orgName}` : 'Connected to Salesforce');
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

        attachPinHandlers();
    }

    async function loadAndBindApiVersion() {
        let selected = '65.0';
        try {
            const res = await chrome.storage?.local?.get?.({ apiVersion: '65.0' });
            if (res && res.apiVersion) selected = String(res.apiVersion);
        } catch { /* default */ }
        if (apiVersionSel) {
            const opts = Array.from(apiVersionSel.options).map(o => o.value);
            apiVersionSel.value = opts.includes(selected) ? selected : '65.0';
            apiVersionSel.addEventListener('change', async () => {
                const v = apiVersionSel.value || '65.0';
                try { await chrome.storage?.local?.set?.({ apiVersion: v }); } catch {}
                try { window.PlatformHelper && window.PlatformHelper.updateApiVersion && window.PlatformHelper.updateApiVersion(v); } catch {}
            });
        }
        return selected;
    }

    function initPlatformHelper(apiVersion) {
        if (!window.PlatformHelper) return;
        try {
            window.PlatformHelper.init({
                apiVersion: apiVersion || (apiVersionSel?.value || '65.0'),
                getSession: () => sessionInfo,
                setSession: (s) => { sessionInfo = s; },
                refreshSessionFromTab: async () => {
                    try {
                        const fresh = await sendMessageToSalesforceTab({ action: 'getSessionInfo' });
                        if (fresh && fresh.success && fresh.isLoggedIn) { sessionInfo = fresh; return fresh; }
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
                    try {
                        const fresh = await sendMessageToSalesforceTab({ action: 'getSessionInfo' });
                        if (fresh && fresh.success && fresh.isLoggedIn) { sessionInfo = fresh; return fresh; }
                    } catch {}
                    return null;
                }
            });
        } catch { /* no-op */ }
    }

    function attachPinHandlers() {
        if (!pePinBtn) return;
        pePinBtn.disabled = true;
        chrome.runtime.sendMessage({ action: 'PLATFORM_PIN_GET' }, (resp) => {
            if (chrome.runtime.lastError) {
                updatePinButton(false);
                pePinBtn.disabled = false;
                return;
            }
            updatePinButton(resp && resp.success ? resp.pinned : false);
            pePinBtn.disabled = false;
        });
        pePinBtn.addEventListener('click', () => {
            if (pePinBtn.disabled) return;
            pePinBtn.disabled = true;
            chrome.runtime.sendMessage({ action: 'PLATFORM_PIN_TOGGLE' }, (resp) => {
                if (!chrome.runtime.lastError && resp && resp.success) {
                    updatePinButton(resp.pinned);
                }
                pePinBtn.disabled = false;
            });
        });
    }

    function svgPin() {
        return (
            '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">'
            + '<path d="M8 3h8"/>'
            + '<path d="M10 3v6l-3 3v1h10v-1l-3-3V3"/>'
            + '<path d="M12 13v8"/>'
            + '</svg>'
        );
    }

    function svgPinOff() {
        return (
            '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">'
            + '<path d="M8 3h8"/>'
            + '<path d="M10 3v6l-3 3v1h10v-1l-3-3V3"/>'
            + '<path d="M12 13v8"/>'
            + '<path d="M4 4l16 16"/>'
            + '</svg>'
        );
    }

    function updatePinButton(pinned) {
        if (!pePinBtn) return;
        pePinBtn.classList.toggle('active', !!pinned);
        pePinBtn.setAttribute('aria-pressed', pinned ? 'true' : 'false');
        pePinBtn.title = pinned ? 'Unpin Platform Events window' : 'Pin Platform Events window';
        pePinBtn.setAttribute('aria-label', pePinBtn.title);
        pePinBtn.innerHTML = pinned ? svgPinOff() : svgPin();
    }

    async function findSalesforceTab() {
        const matches = await chrome.tabs.query({ url: ['https://*.salesforce.com/*', 'https://*.force.com/*'] });
        if (!Array.isArray(matches) || matches.length === 0) return null;
        const current = await chrome.windows.getCurrent({ populate: true }).catch(() => null);
        const currentWindowId = current?.id;
        const activeInCurrent = matches.find(t => t.active && t.windowId === currentWindowId);
        return activeInCurrent || matches[0] || null;
    }

    async function sendMessageToSalesforceTab(message) {
        const tab = await findSalesforceTab();
        if (!tab?.id) return null;
        return await new Promise((resolve) => {
            try {
                chrome.tabs.sendMessage(tab.id, message, (resp) => {
                    if (chrome.runtime.lastError) { resolve(null); return; }
                    resolve(resp || null);
                });
            } catch { resolve(null); }
        });
    }

    function getAccessToken() {
        return (
            sessionInfo?.accessToken ||
            sessionInfo?.sessionId ||
            sessionInfo?.sid ||
            sessionInfo?.sessionToken ||
            sessionInfo?.session_token ||
            null
        );
    }

    async function fetchOrgName(instanceUrl, accessToken, apiVersion) {
        if (!instanceUrl || !accessToken) return null;
        const v = String(apiVersion || apiVersionSel?.value || '65.0');
        const soql = 'SELECT+Name+FROM+Organization+LIMIT+1';
        const url = `${instanceUrl}/services/data/v${v}/query?q=${soql}`;
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
        const tabsContainer = document.querySelector('.tabs');
        await applySavedTabOrder(tabsContainer);

        const buttons = document.querySelectorAll('.tab-button');
        const panes = document.querySelectorAll('.tab-pane');
        const headerTitle = document.getElementById('header-title');

        function showTab(name) {
            panes.forEach(p => (p.style.display = p.dataset.tab === name ? 'block' : 'none'));
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
            if (name === 'soql') {
                try { document.dispatchEvent(new CustomEvent('soql-load')); } catch {}
            }
        }

        buttons.forEach(btn => {
            btn.addEventListener('click', () => {
                const name = btn.dataset.tab;
                showTab(name);
                try { history.replaceState(null, '', `#${name}`); } catch {}
            });
        });

        // Enable drag-and-drop tab reordering after listeners are attached
        enableTabDragAndDrop(tabsContainer, /* onOrderChanged */ () => {});

        const allNames = Array.from(buttons).map(b => b.dataset.tab);
        const rawHash = (location.hash || '').replace('#','').toLowerCase();

        // restore last tab or default to 'soql' if available
        (async () => {
            let initial = null;
            try {
                const saved = await chrome.storage?.local?.get?.({ lastTab: '' });
                if (saved && saved.lastTab && allNames.includes(saved.lastTab)) initial = saved.lastTab;
            } catch {}
            if (!initial) initial = allNames.includes(rawHash)
                ? rawHash
                : (document.querySelector('.tab-button.active')?.dataset.tab || (allNames.includes('soql') ? 'soql' : (allNames[0] || 'sf')));
            showTab(initial);
        })();

        window.addEventListener('hashchange', () => {
            const h = (location.hash || '').replace('#','').toLowerCase();
            if (allNames.includes(h)) showTab(h);
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
                chrome.tabs.sendMessage(tab.id, { action: 'getSessionInfo' }, (resp) => resolve(resp));
            });
            if (chrome.runtime.lastError) { updateStatus(false, 'Cannot access page'); return; }

            if (response && response.success && response.isLoggedIn) {
                sessionInfo = response;
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

})();
