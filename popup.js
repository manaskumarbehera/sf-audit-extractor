(function() {
    'use strict';

    // Global fallback: ensure a `findPopupEditor` identifier exists even if
    // the richer `soql_helper` module defers the popup-level fallback. This
    // prevents ReferenceError when other code dispatches `soql-load` or calls
    // helper functions before the local popup handler is initialized.
    try {
        if (typeof window !== 'undefined') {
            window.findPopupEditor = window.findPopupEditor || function() {
                try {
                    // Prefer explicit id
                    let el = document.getElementById('soql-editor');
                    if (el) return el;
                    // Common alternate selectors
                    el = document.querySelector('[data-soql-editor], textarea.soql-editor, .soql-editor, #soqlEditor');
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
        const xmlns = 'http://www.w3.org/2000/svg';
        const svg = document.createElementNS(xmlns, 'svg');
        svg.setAttribute('viewBox', '0 0 24 24');
        svg.setAttribute('aria-hidden', 'true');
        svg.setAttribute('fill', 'none');
        svg.setAttribute('stroke', 'currentColor');
        svg.setAttribute('stroke-width', '2');
        svg.setAttribute('stroke-linecap', 'round');
        svg.setAttribute('stroke-linejoin', 'round');
        const paths = ['M8 3h8', 'M10 3v6l-3 3v1h10v-1l-3-3V3', 'M12 13v8'];
        paths.forEach(d => {
            const p = document.createElementNS(xmlns, 'path');
            p.setAttribute('d', d);
            svg.appendChild(p);
        });
        return svg.outerHTML;
    }

    function svgPinOff() {
        const xmlns = 'http://www.w3.org/2000/svg';
        const svg = document.createElementNS(xmlns, 'svg');
        svg.setAttribute('viewBox', '0 0 24 24');
        svg.setAttribute('aria-hidden', 'true');
        svg.setAttribute('fill', 'none');
        svg.setAttribute('stroke', 'currentColor');
        svg.setAttribute('stroke-width', '2');
        svg.setAttribute('stroke-linecap', 'round');
        svg.setAttribute('stroke-linejoin', 'round');
        const paths = ['M8 3h8', 'M10 3v6l-3 3v1h10v-1l-3-3V3', 'M12 13v8', 'M4 4l16 16'];
        paths.forEach(d => {
            const p = document.createElementNS(xmlns, 'path');
            p.setAttribute('d', d);
            svg.appendChild(p);
        });
        return svg.outerHTML;
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

    // SOQL validation UI integration
    // - Dynamically import the validator module when the SOQL pane is shown
    // - Wire the editor to run validateSoql(query, describe) and render messages into #soql-errors
    (function setupSoqlValidationUI(){
        // If the richer soql_helper module is already loaded, it will own all editor wiring
        // and validation; skip the popup.js fallback to avoid duplicate listeners and conflicts.
        if (window.__soql_helper_loaded) {
            try { console.debug && console.debug('soql_helper present — skipping popup-level SOQL validation'); } catch(e) {}
            return;
        }
        // Additional guard: if the <script type="module" src="soql_helper.js"> tag is present
        // in the DOM (it will be, since popup.html loads the module after popup.js), then the
        // richer helper will initialize shortly. Avoid registering the popup-level fallback
        // listeners now to prevent duplicate suggestion listeners and double-apply behaviour.
        try {
            const helperScript = document.querySelector('script[type="module"][src$="soql_helper.js"], script[type="module"][src*="/soql_helper.js"], script[type="module"][src*="soql_helper.js"]');
            if (helperScript) {
                try { console.debug && console.debug('soql_helper module script tag present — deferring popup-level SOQL fallback'); } catch(e) {}
                return;
            }
        } catch(e) {}
        // If the full helper loads later, let it initialize the UI; listen for the event and call its init
        function onSoqlHelperLoaded() {
            try {
                // Let the real helper perform initialization
                if (window.__soql_helper_ensureInitOnce) window.__soql_helper_ensureInitOnce();
            } catch(e) {}
            try {
                // Cleanup popup fallback listeners/timers to avoid double-handling suggestions
                cleanupFallbackListeners();
            } catch(e) {}
            try { document.removeEventListener('soql-helper-loaded', onSoqlHelperLoaded); } catch(e) {}
        }
        try { document.addEventListener('soql-helper-loaded', onSoqlHelperLoaded); } catch(e) {}

        let initialized = false;
        let validatorModule = null;
        let debounceTimer = null;
        const DEBOUNCE_MS = 300;
        // Suggestion-related state
        let suggesterModule = null;
        let suggestionDebounce = null;
        const SUGGEST_DEBOUNCE_MS = 250;

        // Minimal Account describe used for client-side validation when Account is selected
        const demoAccountDescribe = {
            name: 'Account',
            __demo: true,
            fields: [
                { name: 'Id', type: 'reference' },
                { name: 'Name', type: 'string' },
                { name: 'Industry', type: 'string' },
                { name: 'CreatedDate', type: 'date' },
                { name: 'IsDeleted', type: 'boolean' },
                { name: 'LastModifiedDate', type: 'date' },
                { name: 'ShippingState', type: 'string' },
                { name: 'BillingCountry', type: 'string' },
                { name: 'NumberOfEmployees', type: 'number' },
                { name: 'Type', type: 'string' },
                { name: 'Active__c', type: 'boolean' },
                { name: 'RecordType.DeveloperName', type: 'string' },
                { name: 'Owner.UserType', type: 'string' }
            ]
        };

        async function loadValidator() {
            if (validatorModule) return validatorModule;
            try {
                // dynamic import of the ES module
                validatorModule = await import('./soql_semantic_validator.js');
                return validatorModule;
            } catch (e) {
                console.error('Failed to load SOQL validator module', e);
                validatorModule = null;
                return null;
            }
        }

        async function loadSuggester() {
            if (suggesterModule) return suggesterModule;
            try {
                // Import as module that exports suggestSoql
                const mod = await import('./soql_suggester.js');
                // Normalize to an object with a suggestSoql function, supporting default and named exports
                let fn = null;
                if (mod && typeof mod.suggestSoql === 'function') fn = mod.suggestSoql;
                else if (mod && typeof mod.default === 'function') fn = mod.default;
                else if (mod && mod.default && typeof mod.default.suggestSoql === 'function') fn = mod.default.suggestSoql;
                if (typeof fn === 'function') {
                    suggesterModule = { suggestSoql: fn };
                    return suggesterModule;
                }
                // fallback: expose whatever the module exported
                suggesterModule = mod || null;
                return suggesterModule;
            } catch (e) {
                console.warn('Failed to load SOQL suggester module', e);
                suggesterModule = null;
                return null;
            }
        }

        function renderMessages(messages) {
            const el = document.getElementById('soql-errors');
            if (!el) return;
            const editor = document.getElementById('soql-editor');
            const editorActive = (editor && document.activeElement === editor);
            if (!messages || messages.length === 0) {
                // If the SOQL editor has focus (cursor inside), avoid showing the 'No issues found.' text
                // to prevent confusing the user while they are still editing. Instead, clear the area.
                if (editorActive) {
                    el.innerHTML = '';
                    el.classList.remove('soql-error-list');
                    el.classList.remove('soql-valid');
                    return;
                }
                el.innerHTML = '<div class="soql-valid">No issues found.</div>';
                el.classList.remove('soql-error-list');
                el.classList.add('soql-valid');
                return;
            }
            el.classList.remove('soql-valid');
            el.classList.add('soql-error-list');
            const lis = messages.map(m => `<li>${escapeHtml(String(m))}</li>`).join('\n');
            el.innerHTML = `<ul class="soql-messages">${lis}</ul>`;
        }

        // Render validator messages into the top validator area (#soql-validator-top)
        function renderValidatorTop(messages) {
            const topEl = document.getElementById('soql-validator-top');
            if (!topEl) return;
            if (!messages || messages.length === 0) {
                topEl.innerHTML = '';
                topEl.classList.remove('soql-error-list');
                topEl.classList.remove('soql-valid');
                return;
            }
            topEl.classList.remove('soql-valid');
            topEl.classList.add('soql-error-list');
            const lis = messages.map(m => `<li>${escapeHtml(String(m))}</li>`).join('\n');
            topEl.innerHTML = `<ul class="soql-messages">${lis}</ul>`;
        }

        function escapeHtml(s) {
            return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
        }

        async function validateAndRender() {
            // Run semantic validator and render results into the top validator area.
            const editor = document.getElementById('soql-editor');
            const objSel = document.getElementById('soql-obj');
            if (!editor) return;
            const q = editor.value || '';
            const mod = await loadValidator();
            if (!mod || typeof mod.validateSoql !== 'function') {
                renderValidatorTop([`Failed to load validator module`]);
                return;
            }
            // Provide describe only when the selected object is Account (demo) AND the query FROM is Account
            let describe = null;
            try {
                const parts = (typeof mod.parseQueryParts === 'function') ? mod.parseQueryParts(q) : null;
                const obj = objSel && objSel.value ? String(objSel.value).trim() : '';
                if (parts && parts.objectName && obj && /account/i.test(obj) && parts.objectName.toLowerCase() === 'account') {
                    describe = demoAccountDescribe;
                }
            } catch {}

            try {
                const res = mod.validateSoql(q, describe);
                const rawMsgs = Array.isArray(res.messages) ? res.messages.slice() : [];
                const describeMsgRe = /^Failed to retrieve describe for\s+'?.+?'?$/i;
                const nonDescribeMsgs = rawMsgs.filter(m => !describeMsgRe.test(String(m || '')));
                // Remove the specific validator message 'SELECT list is empty' because it conflicts with suggester UX
                const filteredMsgs = nonDescribeMsgs.filter(m => !/^\s*SELECT list is empty\s*$/i.test(String(m || '')));
                 // Render any non-describe messages to the top validator area. If there are none, clear the top area.
                if (filteredMsgs.length === 0) renderValidatorTop([]);
                else renderValidatorTop(filteredMsgs);
            } catch (e) {
                renderValidatorTop([`Validator exception: ${String(e)}`]);
            }
        }

        // Popup-specific: attempt to find the editor element in a variety of DOM/host scenarios.
        function findPopupEditor() {
            try {
                // Preferred: explicit id
                let el = document.getElementById('soql-editor');
                if (el) return el;

                // Custom element tags
                let host = document.querySelector('soqleditor, soql-editor');
                if (host) return resolvePopupEditorHost(host);

                // Data-attribute/class/legacy ids
                host = document.querySelector('[data-soql-editor], textarea.soql-editor, .soql-editor, #soqlEditor');
                if (host) return resolvePopupEditorHost(host);

                // Last resort: visible textarea/input/contenteditable that looks like an editor
                const candidate = Array.from(document.querySelectorAll('textarea, input[type="text"], [contenteditable="true"]')).find(c => {
                    try {
                        const t = (c.value || c.textContent || '').toString();
                        return /\bselect\b|\bfrom\b/i.test(t) || t.trim().length === 0;
                    } catch { return false; }
                });
                if (candidate) return resolvePopupEditorHost(candidate);
            } catch (e) { /* ignore */ }
            return null;
        }

        function resolvePopupEditorHost(host) {
            try {
                if (!host) return null;
                if ('value' in host && (typeof host.value === 'string' || typeof host.value === 'number')) return host;
                if (host.editor && ('value' in host.editor)) return host.editor;
                if (host.input && ('value' in host.input)) return host.input;
                if (host.shadowRoot) {
                    const inner = host.shadowRoot.querySelector('textarea, input[type="text"], [contenteditable="true"]');
                    if (inner) return inner;
                }
                if (host.querySelector) {
                    const inner = host.querySelector('textarea, input[type="text"], [contenteditable="true"]');
                    if (inner) return inner;
                }
                return host;
            } catch (e) { return host; }
        }

        // Debounced wrapper to run validateAndRender without running on every keystroke
        function scheduleValidation() {
            try {
                if (debounceTimer) clearTimeout(debounceTimer);
                debounceTimer = setTimeout(() => { try { validateAndRender().catch(()=>{}); } catch(_){} }, DEBOUNCE_MS);
            } catch (e) { /* ignore */ }
        }

        // Cleanup function to remove popup-level fallback listeners and timers when the full helper loads
        function cleanupFallbackListeners() {
            try {
                // Cancel timers
                if (debounceTimer) { clearTimeout(debounceTimer); debounceTimer = null; }
                if (suggestionDebounce) { clearTimeout(suggestionDebounce); suggestionDebounce = null; }
                // Remove editor listeners if present
                const editor = findPopupEditor();
                if (editor) {
                    try { editor.removeEventListener('blur', scheduleValidation); } catch(e){}
                    try { editor.removeEventListener('input', scheduleSuggestionCompute); } catch(e){}
                    try { editor.removeEventListener('keyup', scheduleSuggestionCompute); } catch(e){}
                    try { editor.removeEventListener('focus', scheduleSuggestionCompute); } catch(e){}
                    try { editor.removeEventListener('click', scheduleSuggestionCompute); } catch(e){}
                }
                const runBtn = document.getElementById('soql-run');
                const objSel = document.getElementById('soql-obj');
                if (runBtn) {
                    try { runBtn.removeEventListener('click', scheduleValidation); } catch(e){}
                    try { runBtn.removeEventListener('click', scheduleSuggestionCompute); } catch(e){}
                }
                if (objSel) {
                    try { objSel.removeEventListener('change', scheduleValidation); } catch(e){}
                    try { objSel.removeEventListener('change', scheduleSuggestionCompute); } catch(e){}
                }
                // Clear any UI hints the fallback may have left
                try { const hintsEl = document.getElementById('soql-hints'); if (hintsEl) { hintsEl._latestSuggestions = null; hintsEl.innerHTML = ''; hintsEl.classList.add('hidden'); } } catch(e){}
                initialized = false; // mark fallback as not initialized
            } catch (e) { /* ignore cleanup errors */ }
        }

        async function computeAndRenderSuggestions() {
             // If the full helper is active, bail out and let it handle suggestions
             try {
                if (window && window.__soql_helper_loaded) {
                    try { if (typeof cleanupFallbackListeners === 'function') cleanupFallbackListeners(); } catch (e) {}
                    try { if (window.__soql_helper_ensureInitOnce) window.__soql_helper_ensureInitOnce(); } catch (e) {}
                    return;
                }
             } catch (e) { /* ignore */ }
             // Robust editor lookup: prefer id but accept custom elements
             const editor = findPopupEditor();
             const objSel = document.getElementById('soql-obj');
             if (!editor) return;
             const q = editor.value || '';
             const mod = await loadSuggester();
             if (!mod || typeof mod.suggestSoql !== 'function') {
                 renderSuggestions([]);
                 return;
             }
             let describe = null;
             try {
                 const validatorMod = await loadValidator();
                 const parts = (validatorMod && typeof validatorMod.parseQueryParts === 'function') ? validatorMod.parseQueryParts(q) : null;
                 const obj = objSel && objSel.value ? String(objSel.value).trim() : '';
                 if (parts && parts.objectName && obj && /account/i.test(obj) && parts.objectName.toLowerCase() === 'account') {
                     describe = demoAccountDescribe;
                 }
             } catch {}
             try {
                 const suggestions = await mod.suggestSoql(q, describe, 'soqlEditor') || [];
                 // normalize suggestions array
                 // Debug: surface suggestions in popup console to help diagnose missing hints
                 try { console.debug && console.debug('computeAndRenderSuggestions -> suggester returned', Array.isArray(suggestions) ? suggestions.length : typeof suggestions, suggestions); } catch (e) {}
                 renderSuggestions(suggestions.slice(0, 10));
                 // store latest suggestions on the element so apply can access them
                 const hintsEl = document.getElementById('soql-hints');
                 if (hintsEl) hintsEl._latestSuggestions = suggestions;
             } catch (e) {
                 renderSuggestions([]);
             }
        }

        function applySuggestionByIndex(idx) {
            const hintsEl = document.getElementById('soql-hints');
            if (!hintsEl) return;
            // avoid double-apply if another handler (soql_helper) is already applying a suggestion
            if (hintsEl._applying) return;
            const suggestions = hintsEl._latestSuggestions || [];
            const s = suggestions[idx];
            if (!s) return;
            const editor = findPopupEditor();
            if (!editor) return;
            try {
                // mark that we are applying to prevent other handlers from doing the same
                hintsEl._applying = true;
                 const cur = editor.value || '';
                 const app = s.apply || {};
                 let next = cur;
                 // helper clamp
                 const clamp = (n) => { if (typeof n !== 'number' || Number.isNaN(n)) return null; return Math.max(0, Math.min(cur.length, Math.floor(n))); };
                 if (app.type === 'append') {
                     next = cur + (app.text || '');
                 } else if (app.type === 'replace') {
                     const startRaw = (app.start == null) ? null : app.start;
                     const endRaw = (app.end == null) ? null : app.end;
                     const start = clamp(startRaw);
                     const end = clamp(endRaw);
                     if (start != null && end != null && start >= 0 && end >= start && end <= cur.length) {
                         next = cur.slice(0, start) + (app.text || '') + cur.slice(end);
                     } else if (app.text) {
                        // fallback: try simple heuristic replace of first '*' occurrence
                        const star = cur.indexOf('*');
                        if (star >= 0) next = cur.slice(0, star) + app.text + cur.slice(star+1);
                        else next = cur + app.text;
                     }
                 } else if (app.type === 'insert') {
                     const posRaw = app.pos;
                     const pos = clamp(posRaw);
                     if (pos != null && pos >= 0 && pos <= cur.length) {
                         next = cur.slice(0, pos) + (app.text || '') + cur.slice(pos);
                     } else {
                         next = cur + (app.text || '');
                     }
                 } else {
                    // unknown -> append
                    next = cur + (app.text || '');
                 }
                 editor.value = next;
                 // re-run validation and suggestions after applying
                 scheduleValidation();
                 scheduleSuggestionCompute();
                 // clear applying flag after scheduling recompute
                 hintsEl._applying = false;
             } catch (e) {
                 // ignore
                 try { hintsEl._applying = false; } catch(_){ }
             }
         }

        function renderSuggestions(items) {
            try {
                const ul = document.getElementById('soql-hints');
                if (!ul) return;
                ul.innerHTML = '';
                if (!items || items.length === 0) { ul.classList.add('hidden'); return; }
                const frag = document.createDocumentFragment();
                items.forEach((s, idx) => {
                    try {
                        const li = document.createElement('li');
                        li.className = 'soql-suggestion';
                        li.tabIndex = 0;
                        li.textContent = String(s.text || s.message || (s.apply && s.apply.text) || s.id || 'Suggestion');
                        li.addEventListener('click', (ev) => { try { ev.preventDefault(); applySuggestionByIndex(idx); } catch (e) { console.warn && console.warn('suggest click error', e); } });
                        li.addEventListener('keydown', (ev) => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); applySuggestionByIndex(idx); } });
                        frag.appendChild(li);
                    } catch (e) { /* ignore per-item errors */ }
                });
                ul.appendChild(frag);
                ul.classList.remove('hidden');
            } catch (e) { console.warn && console.warn('renderSuggestions (popup) error', e); }
        }

        // Debounced scheduling wrapper for computeAndRenderSuggestions (popup fallback)
        function scheduleSuggestionCompute() {
            try {
                if (suggestionDebounce) clearTimeout(suggestionDebounce);
                suggestionDebounce = setTimeout(() => { try { computeAndRenderSuggestions().catch(()=>{}); } catch(_){} }, SUGGEST_DEBOUNCE_MS);
            } catch (e) { /* ignore */ }
        }

        document.addEventListener('soql-load', async () => {
            if (initialized) return;
            initialized = true;
            try {
                // Do not eagerly validate on every keystroke; validator will run on blur/run/object change.
                // Initial load of modules: suggester and validator (best-effort)
                if (typeof loadSuggester === 'function') loadSuggester().catch(()=>{});
                if (typeof loadValidator === 'function') loadValidator().catch(()=>{});

                const editor = findPopupEditor();
                const runBtn = document.getElementById('soql-run');
                const objSel = document.getElementById('soql-obj');

                if (editor) {
                    // Validation: only run on blur (user finished typing) to avoid overriding suggester in-flight
                    editor.addEventListener('blur', scheduleValidation);
                    // Suggestions: still compute on input and focus to provide live hints
                    editor.addEventListener('input', scheduleSuggestionCompute);
                    editor.addEventListener('keyup', scheduleSuggestionCompute);
                    editor.addEventListener('focus', scheduleSuggestionCompute);
                    editor.addEventListener('click', scheduleSuggestionCompute);
                }
                if (objSel) objSel.addEventListener('change', scheduleValidation);
                if (runBtn) runBtn.addEventListener('click', scheduleValidation);
                if (objSel) objSel.addEventListener('change', scheduleSuggestionCompute);
                if (runBtn) runBtn.addEventListener('click', scheduleSuggestionCompute);
                // Do not run validation immediately; wait for blur or run to avoid overriding suggestions during edit
                // But compute suggestions initially so UI shows helpful hints
                scheduleSuggestionCompute();
            } catch (err) {
                try { console.error('soql-load handler error', err); } catch(e) { /* ignore */ }
            }
        });
    })();
})();
