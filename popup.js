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

    // SOQL validation / suggestion UI integration (popup-level fallback)
    // Simplified: validator removed — only suggestion fallback remains. If the full `soql_helper` module
    // loads it will replace these handlers via the `soql-load` event.
    (function setupSoqlSuggestionFallback(){
        if (window.__soql_helper_loaded) return; // real helper will handle everything

        let initialized = false;
        let suggestionDebounce = null;
        const SUGGEST_DEBOUNCE_MS = 250;
        let suggesterModule = null;

        async function loadSuggester() {
            if (suggesterModule) return suggesterModule;
            try {
                const mod = await import('./soql_suggester.js');
                let fn = null;
                if (mod && typeof mod.suggestSoql === 'function') fn = mod.suggestSoql;
                else if (mod && typeof mod.default === 'function') fn = mod.default;
                else if (mod && mod.default && typeof mod.default.suggestSoql === 'function') fn = mod.default.suggestSoql;
                if (typeof fn === 'function') {
                    suggesterModule = { suggestSoql: fn };
                    return suggesterModule;
                }
                suggesterModule = mod || null;
                return suggesterModule;
            } catch (e) {
                console.warn('Failed to load SOQL suggester module', e);
                suggesterModule = null;
                return null;
            }
        }

        function findPopupEditor() {
            try {
                let el = document.getElementById('soql-editor');
                if (el) return el;
                const host = document.querySelector('[data-soql-editor], textarea.soql-editor, .soql-editor, #soqlEditor');
                if (host) return resolvePopupEditorHost(host);
                const candidate = Array.from(document.querySelectorAll('textarea, input[type="text"], [contenteditable="true"]')).find(c => {
                    try { const t = (c.value || c.textContent || '').toString(); return /\bselect\b|\bfrom\b/i.test(t) || t.trim().length === 0; } catch { return false; }
                });
                if (candidate) return resolvePopupEditorHost(candidate);
            } catch (e) {}
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

        async function computeAndRenderSuggestions() {
            try {
                if (window && window.__soql_helper_loaded) return; // let real helper take over
                const editor = findPopupEditor();
                const objSel = document.getElementById('soql-obj');
                if (!editor) return;
                const q = editor.value || '';
                const mod = await loadSuggester();
                if (!mod || typeof mod.suggestSoql !== 'function') { renderSuggestions([]); return; }

                // Heuristic describe: only provide a tiny Account describe if selected
                let describe = null;
                try {
                    const obj = objSel && objSel.value ? String(objSel.value).trim() : '';
                    const fromMatch = (String(q || '').match(/\bfrom\s+([A-Za-z0-9_\.]+)/i) || []);
                    const fromObj = fromMatch[1] ? fromMatch[1].replace(/\[|\]|`/g,'') : '';
                    if (obj && /account/i.test(obj) && fromObj && fromObj.toLowerCase() === 'account') {
                        describe = {
                            name: 'Account', __demo: true, fields: [ {name:'Id',type:'reference'}, {name:'Name',type:'string'} ]
                        };
                    }
                } catch {}

                let suggestions = [];
                if (typeof mod.suggestSoqlAll === 'function') {
                    try { suggestions = await mod.suggestSoqlAll(q, describe, 'soqlEditor') || []; } catch (e) { suggestions = []; }
                    if ((!Array.isArray(suggestions) || suggestions.length === 0) && typeof mod.suggestSoql === 'function') {
                        try { const top = await mod.suggestSoql(q, describe, 'soqlEditor'); suggestions = Array.isArray(top) ? top : (top ? [top] : []); } catch (e) { suggestions = []; }
                    }
                } else {
                    try { const s = await mod.suggestSoql(q, describe, 'soqlEditor'); suggestions = Array.isArray(s) ? s : (s ? [s] : []); } catch (e) { suggestions = []; }
                }

                try { console.debug && console.debug('popup fallback suggester ->', Array.isArray(suggestions) ? suggestions.length : typeof suggestions); } catch (e) {}
                renderSuggestions(suggestions.slice(0, 10));
                const hintsEl = document.getElementById('soql-hints'); if (hintsEl) hintsEl._latestSuggestions = suggestions;
            } catch (e) { renderSuggestions([]); }
        }

        function renderSuggestions(items) {
            try {
                const ul = document.getElementById('soql-hints');
                if (!ul) return;
                if (!items || items.length === 0) { ul.innerHTML = ''; ul.classList.add('hidden'); return; }
                ul.innerHTML = '';
                const frag = document.createDocumentFragment();
                items.forEach((s, idx) => {
                    try {
                        const li = document.createElement('li');
                        li.className = 'soql-suggestion'; li.tabIndex = 0;
                        li.textContent = String(s.text || s.message || (s.apply && s.apply.text) || s.id || 'Suggestion');
                        li.addEventListener('click', (ev) => { try { ev.preventDefault(); applySuggestionByIndex(idx); } catch (e) {} });
                        li.addEventListener('keydown', (ev) => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); applySuggestionByIndex(idx); } });
                        frag.appendChild(li);
                    } catch (e) {}
                });
                ul.appendChild(frag); ul.classList.remove('hidden');
            } catch (e) { console.warn && console.warn('renderSuggestions error', e); }
        }

        function applySuggestionByIndex(idx) {
            try {
                const hintsEl = document.getElementById('soql-hints'); if (!hintsEl) return;
                const suggestions = hintsEl._latestSuggestions || [];
                const s = suggestions[idx]; if (!s) return;
                const editor = findPopupEditor(); if (!editor) return;
                const cur = editor.value || '';
                const app = s.apply || {};
                let next = cur;
                const clamp = (n) => { if (typeof n !== 'number' || Number.isNaN(n)) return null; return Math.max(0, Math.min(cur.length, Math.floor(n))); };
                if (app.type === 'append') next = cur + (app.text || '');
                else if (app.type === 'replace') {
                    const startRaw = (app.start == null) ? null : app.start;
                    const endRaw = (app.end == null) ? null : app.end;
                    const start = clamp(startRaw); const end = clamp(endRaw);
                    if (start != null && end != null && start >= 0 && end >= start && end <= cur.length) next = cur.slice(0, start) + (app.text || '') + cur.slice(end);
                    else if (app.text) { const star = cur.indexOf('*'); if (star >= 0) next = cur.slice(0, star) + app.text + cur.slice(star+1); else next = cur + app.text; }
                } else if (app.type === 'insert') {
                    const posRaw = app.pos; const pos = clamp(posRaw);
                    if (pos != null && pos >= 0 && pos <= cur.length) next = cur.slice(0, pos) + (app.text || '') + cur.slice(pos);
                    else next = cur + (app.text || '');
                } else next = cur + (app.text || '');

                editor.value = next; try { editor.focus(); } catch {} try { editor.setSelectionRange(editor.value.length, editor.value.length); } catch {}
                try { hintsHide(); } catch (e) {}
                // re-run suggestions shortly after applying
                setTimeout(() => { try { computeAndRenderSuggestions().catch(()=>{}); } catch(e){} }, 80);
            } catch (e) { console.warn && console.warn('applySuggestionByIndex error', e); }
        }

        function hintsHide(){ try { const ul = document.getElementById('soql-hints'); if (ul) { ul.innerHTML = ''; ul.classList.add('hidden'); } } catch(e){} }

        function scheduleSuggestionCompute() {
            try { if (suggestionDebounce) clearTimeout(suggestionDebounce); suggestionDebounce = setTimeout(() => { try { computeAndRenderSuggestions().catch(()=>{}); } catch(_){} }, SUGGEST_DEBOUNCE_MS); } catch (e) {}
        }

        function onKeyDown(ev){ try { if ((ev.ctrlKey || ev.metaKey) && (ev.code === 'Space' || ev.key === ' ')) { try { ev.preventDefault(); computeAndRenderSuggestions().catch(()=>{}); } catch(e){} return; } if ((ev.ctrlKey || ev.metaKey) && ev.key === 'Enter') { ev.preventDefault(); const runBtn = document.getElementById('soql-run'); if (runBtn) runBtn.click(); return; } if (ev.key === 'Escape') { hintsHide(); } } catch (e) { console.warn && console.warn('onKeyDown error', e); } }

        document.addEventListener('soql-load', async () => {
            if (initialized) return; initialized = true;
            try {
                const editor = findPopupEditor();
                const runBtn = document.getElementById('soql-run');
                const objSel = document.getElementById('soql-obj');
                if (editor) {
                    editor.addEventListener('input', scheduleSuggestionCompute);
                    editor.addEventListener('keyup', scheduleSuggestionCompute);
                    editor.addEventListener('focus', scheduleSuggestionCompute);
                    editor.addEventListener('click', scheduleSuggestionCompute);
                    editor.addEventListener('keydown', onKeyDown);
                    editor.addEventListener('blur', () => { /* no validator to run — just hide hints after blur */ setTimeout(() => { try { hintsHide(); } catch(e){} }, 200); });
                }
                if (objSel) objSel.addEventListener('change', scheduleSuggestionCompute);
                if (runBtn) runBtn.addEventListener('click', scheduleSuggestionCompute);
                // Preload suggester
                loadSuggester().catch(()=>{});
                // Initial compute
                scheduleSuggestionCompute();
            } catch (e) { console.error('soql-load fallback error', e); }
        });

    })();
})();
