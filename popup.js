(function() {
    'use strict';
    const API_VERSION = '65.0';

    let allLogs = [];
    let filteredLogs = [];
    let sessionInfo = null;

    const statusEl = document.getElementById('status');
    const statusText = statusEl ? statusEl.querySelector('.status-text') : null;
    const fetchBtn = document.getElementById('fetch-btn');
    const exportBtn = document.getElementById('export-btn');
    const searchInput = document.getElementById('search-input');
    const categoryFilter = document.getElementById('category-filter');
    const logsContainer = document.getElementById('logs-container');
    const statsEl = document.getElementById('stats');

    // Platform Events UI elements
    const peRefreshBtn = document.getElementById('pe-refresh');
    const peListEl = document.getElementById('platform-events-list');
    const peLogEl = document.getElementById('platform-event-log');
    const cometdStatusEl = document.getElementById('cometd-status');
    const pePinBtn = document.getElementById('pe-pin');
    // New toolbar controls
    const peLogClearBtn = document.getElementById('pe-log-clear');
    const peLogPauseBtn = document.getElementById('pe-log-pause');
    const peLogAutoscrollBtn = document.getElementById('pe-log-autoscroll-btn');
    const peLogFilterSel = document.getElementById('pe-log-filter');

    // Platform Events state
    let platformEventsLoaded = false;
    const peSubscriptions = new Set(); // channel names like /event/MyEvent__e
    const pePendingOps = new Set(); // channels currently being (un)subscribed

    // LMS state
    let lmsChannels = [];
    let lmsLoaded = false;

    // Audit Trail state
    let auditFetched = false; // prevent repeated auto-fetch

    // CometD lightweight client state
    let cometdClientId = null;
    let cometdBaseUrl = null; // {instance}/cometd/{API_VERSION}
    let cometdState = 'disconnected'; // disconnected | handshaking | connected | connecting | stopped
    let cometdAdvice = { timeout: 110000, interval: 0 };
    let connectAbortController = null;
    let connectLoopActive = false;

    // Log view state
    let peLogPaused = false;
    let peLogAutoScrollEnabled = true;

    // Add state for new features
    let sobjectPrefixMap = null; // keyPrefix -> sObject API name
    let sobjectApiNames = []; // list of sObject API names for suggestions
    const sobjectFieldsCache = {}; // { [sObject]: string[] }
    const sobjectDescribeCache = {}; // { [sObject]: full describe }
    const relationshipTargetCache = {}; // { [sObject]: { [relName]: targetSObject } }

    // Keyword/function sets for highlight and suggestions
    const SOQL_KEYWORDS = ['SELECT','FROM','WHERE','GROUP BY','HAVING','ORDER BY','LIMIT','OFFSET','ASC','DESC','NULLS FIRST','NULLS LAST'];
    const SOQL_FUNCTIONS = ['COUNT','SUM','AVG','MIN','MAX'];

    // State for results grid
    const soqlViewState = {
        columns: [],
        rows: [],
        filteredRows: [],
        sort: { key: null, dir: 1 },
        filters: {}
    };

    init();

    async function init() {
        setupTabs();
        attachLmsHandlers();
        attachPlatformHandlers();
        attachPinHandlers();
        // New handlers
        attachSoqlHandlers();
        attachGraphqlHandlers();
        attachRecordHandlers();
        await checkSalesforceConnection();

        // Try to refresh sessionInfo from a real Salesforce tab safely
        try {
            const fresh = await sendMessageToSalesforceTab({ action: 'getSessionInfo' });
            if (fresh && fresh.success && fresh.isLoggedIn) {
                sessionInfo = fresh;
                const accessToken = getAccessToken();
                const instanceUrl = fresh.instanceUrl;
                if (accessToken && instanceUrl) {
                    try {
                        const orgName = await fetchOrgName(instanceUrl, accessToken);
                        updateStatus(true, orgName ? `Connected to ${orgName}` : 'Connected to Salesforce');
                    } catch {
                        updateStatus(true, 'Connected to Salesforce');
                    }
                }
            }
        } catch { /* ignore */ }

        if (fetchBtn) fetchBtn.addEventListener('click', handleFetch);
        if (exportBtn) exportBtn.addEventListener('click', handleExport);
        if (searchInput) searchInput.addEventListener('input', handleSearch);
        if (categoryFilter) categoryFilter.addEventListener('change', handleFilter);
    }

    function attachPinHandlers() {
        if (!pePinBtn) return;
        // Disable while loading initial state
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
        // Clean stroke-based pushpin icon
        return (
            '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">'
            + '<path d="M8 3h8"/>'
            + '<path d="M10 3v6l-3 3v1h10v-1l-3-3V3"/>'
            + '<path d="M12 13v8"/>'
            + '</svg>'
        );
    }
    function svgPinOff() {
        // Same pin with a slash to indicate unpin
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

    // Find an existing Salesforce tab (prefer active in current window)
    async function findSalesforceTab() {
        const matches = await chrome.tabs.query({ url: ['https://*.salesforce.com/*', 'https://*.force.com/*'] });
        if (!Array.isArray(matches) || matches.length === 0) return null;
        const current = await chrome.windows.getCurrent({ populate: true }).catch(() => null);
        const currentWindowId = current?.id;
        const activeInCurrent = matches.find(t => t.active && t.windowId === currentWindowId);
        return activeInCurrent || matches[0] || null;
    }

    // Safely send a message to a Salesforce tab where the content script is present
    async function sendMessageToSalesforceTab(message) {
        const tab = await findSalesforceTab();
        if (!tab?.id) return null;
        return await new Promise((resolve) => {
            try {
                chrome.tabs.sendMessage(tab.id, message, (resp) => {
                    if (chrome.runtime.lastError) {
                        resolve(null);
                        return;
                    }
                    resolve(resp || null);
                });
            } catch {
                resolve(null);
            }
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

    async function fetchOrgName(instanceUrl, accessToken) {
        if (!instanceUrl || !accessToken) {
            return null;
        }

        const soql = 'SELECT+Name+FROM+Organization+LIMIT+1';
        const url = `${instanceUrl}/services/data/v${API_VERSION}/query?q=${soql}`;

        try {
            const res = await fetch(url, {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${accessToken}`,
                    'Accept': 'application/json'
                }
            });
            if (!res.ok) throw new Error(`SF API ${res.status}: ${res.statusText}`);
            const data = await res.json();
            const name = data && data.records && data.records[0] && data.records[0].Name;
            return name || null;
        } catch (err) {
            // fallback to background fetch
            return await new Promise((resolve) => {
                chrome.runtime.sendMessage(
                    { action: 'FETCH_ORG_NAME', instanceUrl, accessToken },
                    (resp) => {
                        if (chrome.runtime.lastError) {
                            resolve(null);
                            return;
                        }
                        if (resp && resp.success) {
                            resolve(resp.orgName || null);
                        } else {
                            resolve(null);
                        }
                    }
                );
            });
        }
    }

    function setupTabs() {
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
            const label = {
                sf: 'Audit Trails',
                platform: 'Platform Events',
                lms: 'Lightning Message Service',
                soql: 'SOQL Builder',
                graphql: 'GraphQL',
                record: 'Current Record'
            }[name] || 'Audit Trails';
            if (headerTitle) headerTitle.textContent = label;

            // Lazy-loads
            if (name === 'platform' && !platformEventsLoaded) {
                loadPlatformEventsList();
            }
            if (name === 'sf' && !auditFetched) {
                // Auto-fetch audit logs first time
                autoFetchAuditIfPossible();
            }
            // Trigger LMS channels load when LMS tab is shown
            if (name === 'lms') {
                try { document.dispatchEvent(new CustomEvent('lms-load')); } catch {}
            }
            if (name === 'record') {
                // Try to auto-detect record Id when opening the tab if empty
                try {
                    const input = document.getElementById('record-id');
                    if (input && !String(input.value || '').trim()) {
                        autoDetectRecordIdToInput();
                    }
                } catch {}
            }
        }

        buttons.forEach(btn => {
            btn.addEventListener('click', () => showTab(btn.dataset.tab));
        });

        // Choose initial tab: prefer location hash if present
        const hash = (location.hash || '').toLowerCase();
        const initial = hash.includes('platform') ? 'platform' : hash.includes('lms') ? 'lms' : hash.includes('soql') ? 'soql' : hash.includes('graphql') ? 'graphql' : hash.includes('record') ? 'record' : (document.querySelector('.tab-button.active')?.dataset.tab || 'sf');
        showTab(initial);
    }

    async function autoFetchAuditIfPossible() {
        // Ensure we have a session and avoid duplicate triggers
        if (auditFetched) return;
        try {
            if (!sessionInfo || !sessionInfo.isLoggedIn) {
                const fresh = await sendMessageToSalesforceTab({ action: 'getSessionInfo' });
                if (fresh && fresh.success && fresh.isLoggedIn) {
                    sessionInfo = fresh;
                }
            }
        } catch {}
        if (sessionInfo && sessionInfo.isLoggedIn) {
            // Trigger fetch; handleFetch manages UI
            handleFetch();
        }
    }

    function attachLmsHandlers() {
        // Real handlers for LMS pane
        const lmsRefresh = document.getElementById('lms-refresh');
        const lmsLog = document.getElementById('lms-log');
        const lmsChannelSel = document.getElementById('lms-channel');
        const lmsPayloadTa = document.getElementById('lms-payload');
        const lmsPayloadCopy = document.getElementById('lms-payload-copy');

        function updateCopyEnabled() {
            if (!lmsPayloadCopy) return;
            const hasText = !!(lmsPayloadTa && String(lmsPayloadTa.value || '').trim());
            lmsPayloadCopy.disabled = !hasText;
            lmsPayloadCopy.title = hasText ? 'Copy sample payload' : 'Nothing to copy';
        }

        async function loadChannels(force = false) {
            try {
                if (!force && lmsLoaded && Array.isArray(lmsChannels) && lmsChannels.length) return;
                // Ensure session
                if (!sessionInfo || !sessionInfo.isLoggedIn) {
                    const fresh = await sendMessageToSalesforceTab({ action: 'getSessionInfo' });
                    if (fresh && fresh.success) sessionInfo = fresh;
                }
                if (!sessionInfo || !sessionInfo.isLoggedIn) {
                    appendLmsLog('Not connected to Salesforce. Open a Salesforce tab and log in.');
                    return;
                }
                const resp = await new Promise((resolve) => {
                    chrome.runtime.sendMessage({ action: 'LMS_FETCH_CHANNELS', instanceUrl: sessionInfo.instanceUrl }, (r) => resolve(r));
                });
                if (!resp || !resp.success) {
                    appendLmsLog('Failed to fetch LMS channels: ' + (resp?.error || 'Unknown error'));
                    return;
                }
                lmsChannels = Array.isArray(resp.channels) ? resp.channels : [];
                populateChannelSelect(lmsChannels);
                lmsLoaded = true;
                appendLmsLog(`Loaded ${lmsChannels.length} LMS channel(s).`);
            } catch (e) {
                appendLmsLog('Error loading channels: ' + String(e));
            }
        }

        function populateChannelSelect(channels) {
            if (!lmsChannelSel) return;
            const opts = ['<option value="">Select a message channel</option>'];
            for (let i = 0; i < channels.length; i++) {
                const c = channels[i];
                const label = `${escapeHtml(c.masterLabel || c.fullName || c.developerName)} (${escapeHtml(c.fullName || c.developerName)})`;
                opts.push(`<option value="${i}">${label}</option>`);
            }
            lmsChannelSel.innerHTML = opts.join('');
            lmsChannelSel.disabled = channels.length === 0;
            // Clear the sample area until a channel is selected
            if (lmsPayloadTa) lmsPayloadTa.value = '';
            updateCopyEnabled();
        }

        function appendLmsLog(message) {
            if (!lmsLog) return;
            const p = document.createElement('p');
            p.className = 'log-line';
            p.textContent = `[${new Date().toLocaleTimeString()}] ${message}`;
            // Remove placeholder note if present
            const ph = lmsLog.querySelector('.placeholder, .placeholder-note');
            if (ph) ph.remove();
            lmsLog.appendChild(p);
            lmsLog.scrollTop = lmsLog.scrollHeight;
        }

        // Generate a simple sample payload based on channel metadata
        function generateSamplePayload(channel) {
            try {
                const fields = Array.isArray(channel?.fields) ? channel.fields : [];
                if (!fields.length) {
                    return { text: 'Hello from LMS' };
                }
                const obj = {};
                for (const f of fields) {
                    const key = String(f.name || '').trim();
                    if (!key) continue;
                    if (/count|number|qty/i.test(key)) obj[key] = 1;
                    else if (/id$/i.test(key)) obj[key] = 'a0123456789ABCDE';
                    else if (/date/i.test(key)) obj[key] = new Date().toISOString();
                    else if (/url/i.test(key)) obj[key] = 'https://example.com';
                    else obj[key] = 'Sample';
                }
                return Object.keys(obj).length ? obj : { text: 'Hello from LMS' };
            } catch {
                return { text: 'Hello from LMS' };
            }
        }

        function handleChannelChange() {
            if (!lmsChannelSel || !lmsPayloadTa) return;
            const idx = parseInt(String(lmsChannelSel.value || '-1'), 10);
            if (!Number.isFinite(idx) || idx < 0 || idx >= lmsChannels.length) {
                lmsPayloadTa.value = '';
                updateCopyEnabled();
                return;
            }
            const channel = lmsChannels[idx];
            const sample = generateSamplePayload(channel);
            try {
                lmsPayloadTa.value = JSON.stringify(sample, null, 2);
                appendLmsLog(`Sample payload generated for ${channel.fullName || channel.developerName}`);
            } catch {
                lmsPayloadTa.value = '{ "text": "Hello from LMS" }';
            }
            updateCopyEnabled();
        }

        // Copy button behavior with tooltip/state feedback
        if (lmsPayloadCopy) {
            lmsPayloadCopy.addEventListener('click', async () => {
                if (!lmsPayloadTa) return;
                const text = String(lmsPayloadTa.value || '');
                if (!text.trim()) return;
                try {
                    await navigator.clipboard.writeText(text);
                    const prevTitle = lmsPayloadCopy.title;
                    lmsPayloadCopy.title = 'Copied!';
                    lmsPayloadCopy.classList.add('copied');
                    // brief visual feedback
                    setTimeout(() => {
                        lmsPayloadCopy.classList.remove('copied');
                        lmsPayloadCopy.title = prevTitle || 'Copy sample payload';
                    }, 900);
                } catch {
                    // Fallback: select and execCommand if clipboard API fails
                    try {
                        lmsPayloadTa.select();
                        document.execCommand('copy');
                        const prevTitle = lmsPayloadCopy.title;
                        lmsPayloadCopy.title = 'Copied!';
                        lmsPayloadCopy.classList.add('copied');
                        setTimeout(() => {
                            lmsPayloadCopy.classList.remove('copied');
                            lmsPayloadCopy.title = prevTitle || 'Copy sample payload';
                        }, 900);
                    } catch { /* ignore */ }
                }
            });
        }

        // Keep copy button enabled state in sync with manual edits
        if (lmsPayloadTa) {
            lmsPayloadTa.addEventListener('input', updateCopyEnabled);
        }

        if (lmsRefresh) {
            lmsRefresh.addEventListener('click', async () => {
                if (lmsRefresh.disabled) return;
                const orig = lmsRefresh.innerHTML; lmsRefresh.disabled = true; lmsRefresh.innerHTML = '<span aria-hidden="true">⏳</span>';
                try { await loadChannels(true); } finally { lmsRefresh.innerHTML = orig; lmsRefresh.disabled = false; }
            });
        }
        if (lmsChannelSel) {
            lmsChannelSel.addEventListener('change', handleChannelChange);
        }

        // Listen for tab switch requests to load LMS channels lazily
        try { document.addEventListener('lms-load', () => { loadChannels(false); }); } catch {}

        // Lazy load once when the LMS tab is first shown
        // If tab is already active, trigger load now
        if (document.querySelector('.tab-button.active')?.dataset.tab === 'lms') {
            loadChannels(false);
        }

        // Initialize copy state on load
        updateCopyEnabled();
    }

    // Inline SVG icons for crisp rendering
    function svgPlus() {
        return '<svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true"><path fill="currentColor" d="M11 11V5h2v6h6v2h-6v6h-2v-6H5v-2z"/></svg>';
    }
    function svgMinus() {
        return '<svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true"><path fill="currentColor" d="M5 11h14v2H5z"/></svg>';
    }

    function attachPlatformHandlers() {
        if (peRefreshBtn) {
            peRefreshBtn.addEventListener('click', async () => {
                if (peRefreshBtn.disabled) return;
                const originalHtml = peRefreshBtn.innerHTML;
                peRefreshBtn.disabled = true;
                peRefreshBtn.innerHTML = '<span class="btn-icon">⏳</span>';
                try {
                    await loadPlatformEventsList(true);
                } catch {
                    // ignore, errors are shown in the list area
                } finally {
                    peRefreshBtn.innerHTML = originalHtml;
                    peRefreshBtn.disabled = false;
                }
            });
        }
        if (peListEl) {
            peListEl.addEventListener('click', async (e) => {
                const target = e.target;
                if (!(target instanceof Element)) return;
                const toggleBtn = target.closest('.pe-toggle');
                const parentItem = target.closest('[data-event-api-name]');
                if (!parentItem) return;
                const apiName = parentItem.getAttribute('data-event-api-name');
                if (!apiName) return;
                const channel = `/event/${apiName}`;

                if (toggleBtn) {
                    // Ignore if an operation is already pending for this channel
                    if (pePendingOps.has(channel)) {
                        appendPeLog(`Action already in progress for ${channel}`);
                        return;
                    }
                    pePendingOps.add(channel);
                    try {
                        // decide based on current subscription state
                        if (peSubscriptions.has(channel)) {
                            await handleUnsubscribe(channel, parentItem, toggleBtn);
                        } else {
                            await handleSubscribe(channel, parentItem, toggleBtn);
                        }
                    } finally {
                        pePendingOps.delete(channel);
                    }
                }
            });
        }
        // Log toolbar controls
        if (peLogClearBtn) peLogClearBtn.addEventListener('click', clearPeLog);
        if (peLogPauseBtn) peLogPauseBtn.addEventListener('click', () => {
            peLogPaused = !peLogPaused;
            peLogEl?.classList.toggle('paused', peLogPaused);
            updatePauseUI();
        });
        if (peLogAutoscrollBtn) peLogAutoscrollBtn.addEventListener('click', () => {
            peLogAutoScrollEnabled = !peLogAutoScrollEnabled;
            updateAutoScrollUI();
        });
        if (peLogFilterSel) peLogFilterSel.addEventListener('change', applyPeLogFilter);
        if (peLogEl) peLogEl.addEventListener('click', async (e) => {
            const t = e.target;
            if (!(t instanceof Element)) return;
            if (t.classList.contains('copy-btn')) {
                const entry = t.closest('.log-entry');
                const pre = entry?.querySelector('.log-json');
                const text = pre ? pre.textContent || '' : entry?.querySelector('.log-message')?.textContent || '';
                try {
                    await navigator.clipboard.writeText(text);
                    const old = t.textContent;
                    t.textContent = 'Copied';
                    setTimeout(() => { t.textContent = old || 'Copy'; }, 800);
                } catch { /* ignore */ }
            }
        });
        // Initialize toolbar control visuals
        updateAutoScrollUI();
        updatePauseUI();
    }

    function updateAutoScrollUI() {
        if (!peLogAutoscrollBtn) return;
        peLogAutoscrollBtn.setAttribute('aria-pressed', peLogAutoScrollEnabled ? 'true' : 'false');
        peLogAutoscrollBtn.title = peLogAutoScrollEnabled ? 'Auto-scroll: on' : 'Auto-scroll: off';
        peLogAutoscrollBtn.classList.toggle('active', peLogAutoScrollEnabled);
    }

    function updatePauseUI() {
        if (!peLogPauseBtn) return;
        peLogPauseBtn.setAttribute('aria-pressed', peLogPaused ? 'true' : 'false');
        peLogPauseBtn.classList.toggle('active', peLogPaused);
        if (peLogPaused) {
            peLogPauseBtn.title = 'Resume logging';
            peLogPauseBtn.setAttribute('aria-label', 'Resume logging');
            peLogPauseBtn.innerHTML = '<span aria-hidden="true">▶</span>';
        } else {
            peLogPauseBtn.title = 'Pause logging';
            peLogPauseBtn.setAttribute('aria-label', 'Pause logging');
            peLogPauseBtn.innerHTML = '<span aria-hidden="true">⏸</span>';
        }
    }

    async function handleSubscribe(channel, itemEl, toggleBtn) {
        if (!ensureSession()) return;
        try {
            if (toggleBtn) {
                toggleBtn.disabled = true;
                var originalIcon = toggleBtn.innerHTML;
                toggleBtn.innerHTML = '<span class="btn-icon">⏳</span>';
            }
            await cometdEnsureConnected();
            const ok = await cometdSubscribe(channel);
            if (ok) {
                peSubscriptions.add(channel);
                setItemSubscribedState(itemEl, true);
                appendPeLog(`Subscribed to ${channel}`);
            } else {
                if (toggleBtn && typeof originalIcon === 'string') toggleBtn.innerHTML = originalIcon;
                appendPeLog(`Failed to subscribe ${channel}`);
            }
        } catch (e) {
            if (toggleBtn && typeof originalIcon === 'string') toggleBtn.innerHTML = originalIcon;
            appendPeLog(`Subscribe error: ${String(e)}`);
        } finally {
            if (toggleBtn) toggleBtn.disabled = false;
        }
    }

    async function handleUnsubscribe(channel, itemEl, toggleBtn) {
        try {
            if (toggleBtn) {
                toggleBtn.disabled = true;
                var originalIcon = toggleBtn.innerHTML;
                toggleBtn.innerHTML = '<span class="btn-icon">⏳</span>';
            }
            const ok = await cometdUnsubscribe(channel);
            if (ok) {
                peSubscriptions.delete(channel);
                setItemSubscribedState(itemEl, false);
                appendPeLog(`Unsubscribed from ${channel}`);
            } else {
                if (toggleBtn && typeof originalIcon === 'string') toggleBtn.innerHTML = originalIcon;
                appendPeLog(`Failed to unsubscribe ${channel}`);
            }
        } catch (e) {
            if (toggleBtn && typeof originalIcon === 'string') toggleBtn.innerHTML = originalIcon;
            appendPeLog(`Unsubscribe error: ${String(e)}`);
        } finally {
            if (toggleBtn) toggleBtn.disabled = false;
        }
    }

    function setItemSubscribedState(itemEl, subscribed) {
        if (!itemEl) return;
        itemEl.classList.toggle('subscribed', subscribed);
        // Update toggle button icon, label, and style
        const btn = itemEl.querySelector('.pe-toggle');
        if (btn) {
            btn.classList.toggle('btn-primary', !subscribed);
            btn.classList.toggle('btn-secondary', subscribed);
            btn.setAttribute('aria-label', subscribed ? 'Unsubscribe' : 'Subscribe');
            btn.setAttribute('title', subscribed ? 'Unsubscribe' : 'Subscribe');
            btn.innerHTML = subscribed ? svgMinus() : svgPlus();
        }
        // Remove any existing title badge for a cleaner list
        const titleEl = itemEl.querySelector('.item-title');
        if (titleEl) {
            const badge = titleEl.querySelector('.status-badge');
            if (badge) badge.remove();
        }
        // Indicator visibility is handled by CSS via the 'subscribed' class
    }

    async function loadPlatformEventsList(force = false) {
        if (!ensureSession()) return;
        if (platformEventsLoaded && !force) return;

        if (peListEl) {
            peListEl.innerHTML = '<div class="loading"><div class="loading-spinner"></div><p>Loading Platform Events...</p></div>';
        }

        try {
            const accessToken = getAccessToken();
            const base = sessionInfo.instanceUrl?.replace(/\/+$/, '');
            const url = `${base}/services/data/v${API_VERSION}/sobjects`;
            const res = await fetch(url, {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${accessToken}`,
                    'Accept': 'application/json'
                }
            });
            if (!res.ok) throw new Error(`SObjects list failed: ${res.status} ${res.statusText}`);
            const data = await res.json();
            const sobjects = Array.isArray(data?.sobjects) ? data.sobjects : [];

            // Heuristic: Platform Events end with __e or have eventType property
            const events = sobjects.filter(o => o?.name?.endsWith('__e') || typeof o?.eventType === 'string');
            renderPlatformEvents(events);
            platformEventsLoaded = true;
        } catch (e) {
            if (peListEl) peListEl.innerHTML = `<div class="error">${escapeHtml(String(e))}</div>`;
        }
    }

    function renderPlatformEvents(events) {
        if (!peListEl) return;
        if (!events || events.length === 0) {
            peListEl.innerHTML = '<div class="placeholder"><p>No Platform Events found</p></div>';
            return;
        }

        const html = events.map(ev => {
            const api = ev.name;
            const label = ev.label || api;
            const channel = `/event/${api}`;
            const isSub = peSubscriptions.has(channel);
            const btnClass = isSub ? 'btn btn-secondary btn-sm icon-btn pe-toggle' : 'btn btn-primary btn-sm icon-btn pe-toggle';
            const btnLabel = isSub ? 'Unsubscribe' : 'Subscribe';
            const icon = isSub ? svgMinus() : svgPlus();
            return `
                <div class="list-item${isSub ? ' subscribed' : ''}" data-event-api-name="${escapeHtml(api)}">
                    <div class="item-actions leading">
                        <button class="${btnClass}" aria-label="${btnLabel}" title="${btnLabel}">${icon}</button>
                        <span class="listening-indicator" aria-label="Listening" title="Listening" role="img">
                            <span class="bar"></span><span class="bar"></span><span class="bar"></span>
                        </span>
                    </div>
                    <div class="item-main">
                        <div class="item-title">${escapeHtml(label)} <span class="item-subtle">(${escapeHtml(api)})</span></div>
                    </div>
                </div>
            `;
        }).join('');

        peListEl.innerHTML = html;
    }

    function ensureSession() {
        if (!sessionInfo || !sessionInfo.isLoggedIn || !sessionInfo.instanceUrl) {
            appendPeLog('Not connected to Salesforce. Open a Salesforce tab and log in.');
            return false;
        }
        return true;
    }

    function updateCometdStatus(connected, text) {
        if (!cometdStatusEl) return;
        cometdStatusEl.classList.toggle('connected', !!connected);
        const t = cometdStatusEl.querySelector('.status-text');
        const msg = text || (connected ? 'Connected' : 'Disconnected');
        if (t) t.textContent = msg;
        // keep tooltip in sync when text is hidden for compact UI
        cometdStatusEl.setAttribute('title', msg);
    }

    // New structured logger for Platform Events
    function appendPeLog(message, data, typeOverride) {
        if (!peLogEl) return;
        const ts = new Date();
        const type = typeOverride || classifyPeLogType(message, data);

        // Remove placeholder if present
        const placeholder = peLogEl.querySelector('.placeholder, .placeholder-note');
        if (placeholder) placeholder.remove();

        const entry = document.createElement('div');
        entry.className = 'log-entry';
        entry.dataset.type = type;

        const header = document.createElement('div');
        header.className = 'log-header';

        const left = document.createElement('div');
        left.className = 'log-left';

        const badge = document.createElement('span');
        badge.className = `log-badge ${type}`;
        badge.textContent = type;

        const msgEl = document.createElement('div');
        msgEl.className = 'log-message';
        msgEl.textContent = `[${ts.toLocaleTimeString()}] ${message}`;

        left.appendChild(badge);
        left.appendChild(msgEl);

        const right = document.createElement('div');
        right.className = 'log-actions';

        if (data !== undefined) {
            const copyBtn = document.createElement('button');
            copyBtn.className = 'copy-btn';
            copyBtn.type = 'button';
            copyBtn.textContent = 'Copy';
            right.appendChild(copyBtn);
        }

        header.appendChild(left);
        header.appendChild(right);
        entry.appendChild(header);

        if (data !== undefined) {
            const detailsWrap = document.createElement('div');
            detailsWrap.className = 'log-details';
            const details = document.createElement('details');
            const summary = document.createElement('summary');
            summary.textContent = 'Details';
            const pre = document.createElement('pre');
            pre.className = 'log-json';
            try {
                pre.textContent = JSON.stringify(data, null, 2);
            } catch {
                pre.textContent = String(data);
            }
            details.appendChild(summary);
            details.appendChild(pre);
            detailsWrap.appendChild(details);
            entry.appendChild(detailsWrap);
        }

        peLogEl.appendChild(entry);

        // Apply current filter visibility
        applyPeLogFilter();

        // Auto-scroll if enabled and not paused
        if (peLogAutoScrollEnabled && !peLogPaused) {
            scrollLogToBottom();
        }
    }

    function classifyPeLogType(message, data) {
        const m = String(message || '').toLowerCase();
        // Errors first
        if (m.includes('error') || m.includes('failed') || m.includes('unsuccessful')) return 'error';
        // Explicit event messages
        if (m.startsWith('event on ') || m.includes(' event on ')) return 'event';
        // Subscribe/unsubscribe lifecycle (non-error)
        if (m.includes('subscribe') || m.includes('unsubscribe')) return 'subscribe';
        // Default system info
        return 'system';
    }

    function applyPeLogFilter() {
        if (!peLogEl) return;
        const filter = peLogFilterSel ? peLogFilterSel.value : 'all';
        const entries = peLogEl.querySelectorAll('.log-entry');
        entries.forEach((el) => {
            const type = el.getAttribute('data-type') || 'system';
            const visible = filter === 'all' || filter === type;
            el.style.display = visible ? '' : 'none';
        });
    }

    function clearPeLog() {
        if (!peLogEl) return;
        peLogEl.innerHTML = '<div class="placeholder-note">No messages yet</div>';
    }

    function scrollLogToBottom() {
        if (!peLogEl) return;
        peLogEl.scrollTop = peLogEl.scrollHeight;
    }

    function getCometdBase() {
        const base = sessionInfo?.instanceUrl?.replace(/\/+$/, '');
        return `${base}/cometd/${API_VERSION}`;
    }

    async function cometdEnsureConnected() {
        if (cometdState === 'connected' || cometdState === 'connecting') return;
        await cometdHandshake();
        startConnectLoop();
    }

    async function cometdHandshake() {
        if (!ensureSession()) return;
        cometdState = 'handshaking';
        updateCometdStatus(false, 'Handshaking...');
        cometdBaseUrl = getCometdBase();

        const token = getAccessToken();
        const body = [{
            channel: '/meta/handshake',
            version: '1.0',
            minimumVersion: '0.9',
            supportedConnectionTypes: ['long-polling'],
            advice: { timeout: 60000, interval: 0 }
        }];

        const res = await fetchWithTimeout(`${cometdBaseUrl}/handshake`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json;charset=UTF-8',
                'Accept': 'application/json',
                // Use Bearer token for broader compatibility
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify(body)
        });

        if (!res.ok) throw new Error(`Handshake failed: ${res.status} ${res.statusText}`);
        const arr = await res.json();
        const m = Array.isArray(arr) ? arr[0] : null;
        if (!m || !m.successful) throw new Error(`Handshake unsuccessful: ${JSON.stringify(m || {})}`);
        cometdClientId = m.clientId;
        cometdAdvice = m.advice || cometdAdvice;
        cometdState = 'connected';
        updateCometdStatus(true, 'Connected');
        appendPeLog('Handshake successful');
    }

    function startConnectLoop() {
        if (connectLoopActive) return;
        connectLoopActive = true;
        (async function loop() {
            while (connectLoopActive && cometdState !== 'stopped' && cometdClientId) {
                try {
                    cometdState = 'connecting';
                    updateCometdStatus(true, 'Listening...');
                    const msgs = await cometdConnectOnce();
                    handleCometdMessages(msgs);
                    // immediate next connect after server response (respect interval if provided)
                    const delay = Math.max(0, Number(cometdAdvice?.interval || 0));
                    if (delay) await sleep(delay);
                } catch (e) {
                    appendPeLog(`Connect error: ${String(e)}`);
                    updateCometdStatus(false, 'Reconnecting...');
                    await sleep(1000);
                    // try to re-handshake if clientId lost
                    if (!cometdClientId) {
                        try { await cometdHandshake(); } catch {}
                    }
                }
            }
        })();
    }

    async function cometdConnectOnce() {
        if (!cometdClientId) throw new Error('No clientId');
        connectAbortController = new AbortController();
        const res = await fetch(`${cometdBaseUrl}/connect`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json;charset=UTF-8',
                'Accept': 'application/json',
                'Authorization': `Bearer ${getAccessToken()}`
            },
            signal: connectAbortController.signal,
            body: JSON.stringify([
                {
                    channel: '/meta/connect',
                    clientId: cometdClientId,
                    connectionType: 'long-polling'
                }
            ])
        });
        if (!res.ok) throw new Error(`Connect failed: ${res.status} ${res.statusText}`);
        return await res.json();
    }

    async function cometdSubscribe(channel) {
        if (!cometdClientId) await cometdEnsureConnected();
        const res = await fetchWithTimeout(`${cometdBaseUrl}/subscribe`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json;charset=UTF-8',
                'Accept': 'application/json',
                'Authorization': `Bearer ${getAccessToken()}`
            },
            body: JSON.stringify([
                {
                    channel: '/meta/subscribe',
                    clientId: cometdClientId,
                    subscription: channel
                    // ext: { replay: true, replayId: -1 } // optional
                }
            ])
        });
        if (!res.ok) throw new Error(`Subscribe failed HTTP: ${res.status}`);
        const arr = await res.json();
        const m = Array.isArray(arr) ? arr[0] : null;
        if (!m || !m.successful) {
            appendPeLog(`Subscribe unsuccessful on ${channel}`, m);
            return false;
        }
        return true;
    }

    async function cometdUnsubscribe(channel) {
        if (!cometdClientId) return true; // treat as unsubscribed
        const res = await fetchWithTimeout(`${cometdBaseUrl}/unsubscribe`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json;charset=UTF-8',
                'Accept': 'application/json',
                'Authorization': `Bearer ${getAccessToken()}`
            },
            body: JSON.stringify([
                {
                    channel: '/meta/unsubscribe',
                    clientId: cometdClientId,
                    subscription: channel
                }
            ])
        });
        if (!res.ok) throw new Error(`Unsubscribe failed HTTP: ${res.status}`);
        const arr = await res.json();
        const m = Array.isArray(arr) ? arr[0] : null;
        return !!(m && m.successful);
    }

    function handleCometdMessages(arr) {
        if (!Array.isArray(arr)) return;
        for (const m of arr) {
            try {
                if (!m || typeof m !== 'object') continue;
                if (m.channel === '/meta/connect') {
                    // update advice/reconnect directives
                    cometdAdvice = m.advice || cometdAdvice;
                    if (m.successful === false) {
                        if (m.advice && m.advice.reconnect === 'handshake') {
                            // reset and re-handshake
                            cometdClientId = null;
                            cometdState = 'disconnected';
                            (async () => { try { await cometdHandshake(); } catch {} })();
                        }
                    }
                } else if (m.channel === '/meta/handshake') {
                    // ignore; handled earlier
                } else if (m.channel === '/meta/subscribe' || m.channel === '/meta/unsubscribe') {
                    // log results
                    const action = m.channel.endsWith('subscribe') ? 'Subscribe' : 'Unsubscribe';
                    appendPeLog(`${action} ack: ${m.successful ? 'ok' : 'failed'}`, m);
                } else if (typeof m.channel === 'string' && m.channel.startsWith('/event/')) {
                    const channel = m.channel;
                    const payload = m.data || {};
                    appendPeLog(`Event on ${channel}`, payload, 'event');
                }
            } catch (e) {
                appendPeLog('Message handling error', { error: String(e), raw: m });
            }
        }
    }

    function stopCometd() {
        connectLoopActive = false;
        cometdState = 'stopped';
        if (connectAbortController) try { connectAbortController.abort(); } catch {}
        updateCometdStatus(false, 'Disconnected');
    }

    function sleep(ms) {
        return new Promise((r) => setTimeout(r, ms));
    }

    // Small helper to avoid indefinite hangs on control-plane requests
    async function fetchWithTimeout(resource, options = {}, timeoutMs = 15000) {
        const controller = new AbortController();
        const id = setTimeout(() => controller.abort(), timeoutMs);
        try {
            const res = await fetch(resource, { ...options, signal: controller.signal });
            return res;
        } finally {
            clearTimeout(id);
        }
    }

    async function checkSalesforceConnection() {
        try {
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            if (!tab || !tab.url) {
                updateStatus(false, 'No active tab');
                return;
            }

            let isSalesforce = false;
            try {
                const url = new URL(tab.url);
                const hostname = url.hostname.toLowerCase();
                isSalesforce = hostname.endsWith('.salesforce.com') ||
                    hostname.endsWith('.force.com') ||
                    hostname === 'salesforce.com' ||
                    hostname === 'force.com';
            } catch {
                isSalesforce = false;
            }

            if (!isSalesforce) {
                updateStatus(false, 'Not on Salesforce');
                showError('Please navigate to a Salesforce page first');
                return;
            }

            // Await the content script response so init() can act on it reliably
            const response = await new Promise((resolve) => {
                chrome.tabs.sendMessage(tab.id, { action: 'getSessionInfo' }, (resp) => resolve(resp));
            });

            if (chrome.runtime.lastError) {
                updateStatus(false, 'Cannot access page');
                return;
            }

            if (response && response.success && response.isLoggedIn) {
                sessionInfo = response;
                updateStatus(true, 'Connected to Salesforce');
            } else {
                updateStatus(false, 'Not logged in');
                showError('Please log in to Salesforce first');
            }
        } catch (error) {
            updateStatus(false, 'Connection failed');
        }
    }

    function updateStatus(connected, message) {
        if (!statusEl || !statusText) return;
        if (connected) statusEl.classList.add('connected');
        else statusEl.classList.remove('connected');
        statusText.textContent = message;
    }

    async function handleFetch() {
        // Refresh session from a Salesforce tab safely
        try {
            const fresh = await sendMessageToSalesforceTab({ action: 'getSessionInfo' });
            if (fresh && fresh.success && fresh.isLoggedIn) {
                sessionInfo = fresh;
            }
        } catch { /* ignore */ }

        if (!sessionInfo || !sessionInfo.isLoggedIn) {
            showError('Please ensure you are logged in to Salesforce');
            return;
        }

        if (fetchBtn) {
            fetchBtn.disabled = true;
            fetchBtn.innerHTML = '<span class="btn-icon">⏳</span>';
        }
        if (logsContainer) logsContainer.innerHTML = '<div class="loading"><div class="loading-spinner"></div><p>Fetching audit trail data...</p></div>';

        try {
            chrome.runtime.sendMessage(
                {
                    action: 'FETCH_AUDIT_TRAIL',
                    url: sessionInfo.instanceUrl,
                    days: 180,
                    limit: 2000
                },
                (response) => {
                    if (chrome.runtime.lastError) {
                        showError('Failed to fetch data: ' + chrome.runtime.lastError.message);
                        resetFetchButton();
                        return;
                    }
                    if (response && response.success) {
                        processAuditData(response.data);
                        enableControls();
                        auditFetched = true;
                    } else {
                        showError(response?.error || 'Failed to fetch audit trail data');
                    }
                    resetFetchButton();
                }
            );
        } catch {
            showError('An error occurred while fetching data');
            resetFetchButton();
        }
    }

    function resetFetchButton() {
        if (fetchBtn) {
            fetchBtn.disabled = false;
            fetchBtn.innerHTML = '<span class="btn-icon">↻</span>';
        }
    }

    function processAuditData(records) {
        if (!records || records.length === 0) {
            showEmpty();
            return;
        }

        allLogs = records.map(record => {
            const category = categorizeAction(record.Section, record.Action);
            return {
                id: record.Id,
                action: record.Action || 'Unknown Action',
                section: record.Section || 'Unknown',
                date: record.CreatedDate,
                user: record.CreatedBy ? record.CreatedBy.Name : 'Unknown User',
                display: record.Display || '',
                delegateUser: record.DelegateUser || '',
                category: category
            };
        });

        filteredLogs = [...allLogs];
        updateStats();
        renderLogs();
    }

    function categorizeAction(section, action) {
        const userPatterns = ['User', 'Profile', 'Permission', 'Role', 'Group'];
        const securityPatterns = ['Security', 'Password', 'Login', 'Authentication', 'Certificate', 'Session'];
        const objectPatterns = ['Object', 'Field', 'Custom', 'Layout', 'Validation', 'Workflow', 'Trigger', 'Apex'];

        const searchText = (section + ' ' + action).toLowerCase();

        for (const pattern of userPatterns) {
            if (searchText.includes(pattern.toLowerCase())) return 'User Management';
        }
        for (const pattern of securityPatterns) {
            if (searchText.includes(pattern.toLowerCase())) return 'Security';
        }
        for (const pattern of objectPatterns) {
            if (searchText.includes(pattern.toLowerCase())) return 'Object Changes';
        }
        return 'Object Changes';
    }

    function updateStats() {
        const userCount = allLogs.filter(log => log.category === 'User Management').length;
        const securityCount = allLogs.filter(log => log.category === 'Security').length;
        const objectCount = allLogs.filter(log => log.category === 'Object Changes').length;

        const totalEl = document.getElementById('total-count');
        const userEl = document.getElementById('user-count');
        const secEl = document.getElementById('security-count');
        const objEl = document.getElementById('object-count');

        if (totalEl) totalEl.textContent = allLogs.length;
        if (userEl) userEl.textContent = userCount;
        if (secEl) secEl.textContent = securityCount;
        if (objEl) objEl.textContent = objectCount; // BUG? Keep original style? We'll fix below

        if (statsEl) statsEl.style.display = 'grid';
    }

    function renderLogs() {
        if (!logsContainer) return;

        if (filteredLogs.length === 0) {
            logsContainer.innerHTML = '<div class="empty-state"><p>No logs match your search criteria</p></div>';
            return;
        }

        const logsHTML = filteredLogs.map(log => {
            const categoryClass = log.category === 'User Management' ? 'user' :
                log.category === 'Security' ? 'security' : 'object';
            const date = new Date(log.date);
            const formattedDate = date.toLocaleString('en-US', {
                year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
            });

            return `
                <div class="log-item ${categoryClass}">
                    <div class="log-header">
                        <span class="log-category">${log.category}</span>
                        <span class="log-date">${formattedDate}</span>
                    </div>
                    <div class="log-body">
                        <div class="log-action">${escapeHtml(log.action)}</div>
                        <div class="log-section">${escapeHtml(log.section)}</div>
                        <div class="log-user">${escapeHtml(log.user)}</div>
                    </div>
                </div>
            `;
        }).join('');

        logsContainer.innerHTML = logsHTML;
    }

    function handleSearch() {
        const term = (searchInput && searchInput.value || '').toLowerCase();
        filteredLogs = allLogs.filter(log =>
            log.action.toLowerCase().includes(term) ||
            log.section.toLowerCase().includes(term) ||
            log.user.toLowerCase().includes(term)
        );
        renderLogs();
    }

    function handleFilter() {
        const category = categoryFilter ? categoryFilter.value : 'all';
        if (category === 'all') {
            filteredLogs = [...allLogs];
        } else {
            filteredLogs = allLogs.filter(log => log.category === category);
        }
        renderLogs();
    }

    function enableControls() {
        if (searchInput) searchInput.disabled = false;
        if (categoryFilter) categoryFilter.disabled = false;
        if (exportBtn) exportBtn.disabled = false;
    }

    function showEmpty() {
        if (!logsContainer) return;
        logsContainer.innerHTML = '<div class="empty-state"><p>No audit logs found</p></div>';
    }

    function showError(message) {
        if (!logsContainer) return;
        logsContainer.innerHTML = `<div class="error">${escapeHtml(message)}</div>`;
    }

    function escapeHtml(str) {
        return String(str || '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    // Export currently filtered logs to CSV
    function handleExport() {
        try {
            const rows = Array.isArray(filteredLogs) ? filteredLogs : [];
            if (!rows.length) {
                // No data to export; provide subtle feedback by disabling briefly
                if (exportBtn) {
                    const oldTitle = exportBtn.title;
                    exportBtn.title = 'No data to export';
                    exportBtn.disabled = true;
                    setTimeout(() => { exportBtn.disabled = false; exportBtn.title = oldTitle || 'Export CSV'; }, 800);
                }
                return;
            }

            const headers = [
                'Date',
                'User',
                'Section',
                'Action',
                'Category',
                'Display',
                'Delegate User',
                'Id'
            ];

            function toCsvValue(v) {
                const s = String(v == null ? '' : v);
                return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
            }

            const lines = [];
            lines.push(headers.join(','));
            for (const log of rows) {
                const d = new Date(log.date);
                const dateStr = isNaN(d.getTime()) ? String(log.date || '') : d.toISOString();
                lines.push([
                    toCsvValue(dateStr),
                    toCsvValue(log.user),
                    toCsvValue(log.section),
                    toCsvValue(log.action),
                    toCsvValue(log.category),
                    toCsvValue(log.display || ''),
                    toCsvValue(log.delegateUser || ''),
                    toCsvValue(log.id || '')
                ].join(','));
            }

            const csv = lines.join('\r\n');
            const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
            const url = URL.createObjectURL(blob);

            const now = new Date();
            const pad = (n) => String(n).padStart(2, '0');
            const fileName = `audit-trail-${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}.csv`;

            const a = document.createElement('a');
            a.href = url;
            a.download = fileName;
            // Append to ensure click works in all contexts
            document.body.appendChild(a);
            a.click();
            a.remove();
            setTimeout(() => URL.revokeObjectURL(url), 1000);
        } catch (e) {
            // Best-effort feedback without disrupting UI layout
            if (logsContainer) logsContainer.insertAdjacentHTML('afterbegin', `<div class="error">${escapeHtml('Export failed: ' + String(e))}</div>`);
        }
    }

    // SOQL Builder
    function attachSoqlHandlers() {
        const runBtn = document.getElementById('soql-run');
        const input = document.getElementById('soql-input');
        const results = document.getElementById('soql-results');
        const suggestBox = document.getElementById('soql-suggestions');
        const highlightEl = document.getElementById('soql-highlight');
        const limitEl = document.getElementById('soql-limit');
        const toolingEl = document.getElementById('soql-tooling');
        const exportJsonBtn = document.getElementById('soql-export-json');
        const exportXlsBtn = document.getElementById('soql-export-xls');
        const metricsEl = document.getElementById('soql-metrics');
        const schemaFieldsEl = document.getElementById('schema-fields');
        const schemaChildrenEl = document.getElementById('schema-children-list');
        const schemaObjectEl = document.getElementById('schema-object');
        const schemaFieldCountEl = document.getElementById('schema-field-count');
        const schemaSearchEl = document.getElementById('schema-search');
        const schemaTypeFilterEl = document.getElementById('schema-type-filter');
        const recentSel = document.getElementById('soql-recent-objects');
        const resizer = document.getElementById('soql-resizer');
        const split = document.querySelector('.soql-split');

        let currentBaseObject = '';
        let currentFields = [];
        let currentChildren = [];

        // If user focuses the editor and it is empty, start with SELECT
        if (input) {
            input.addEventListener('focus', () => {
                if (!String(input.value || '').trim()) {
                    input.value = 'SELECT ';
                    input.dispatchEvent(new Event('input', { bubbles: true }));
                }
            });
        }

        // Lightweight validation and Run button gating
        function validateSoql(q) {
            const txt = String(q || '');
            if (!/\bSELECT\b/i.test(txt)) return false;
            const mFrom = txt.match(/\bFROM\s+([A-Za-z0-9_]+)/i);
            return !!mFrom;
        }
        function updateRunState() {
            const q = String(input?.value || '');
            const valid = validateSoql(q);
            if (runBtn) {
                runBtn.disabled = !valid;
                runBtn.title = valid ? 'Run SOQL (Ctrl/Cmd+Enter)' : 'Complete your query: SELECT ... FROM <Object>';
            }
            if (metricsEl) {
                metricsEl.textContent = valid || !q.trim() ? '' : 'Incomplete query: add FROM <Object>';
            }
        }
        // Initialize Run state once
        updateRunState();
        // Keep Run state in sync as user types
        if (input) input.addEventListener('input', updateRunState);

        // Restore persisted settings
        (async () => {
            try {
                const { soqlSplitW, soqlRecent = [] } = await chrome.storage.local.get({ soqlSplitW: 320, soqlRecent: [] });
                if (split && Number.isFinite(soqlSplitW)) split.style.gridTemplateColumns = `${soqlSplitW}px 6px 1fr`;
                populateSelect(recentSel, soqlRecent, 'Recent objects');
            } catch {}
        })();

        // Prefill default query template on load when possible and place cursor before LIMIT for easy WHERE typing
        (async () => {
            try {
                if (!input) return;
                if (String(input.value || '').trim()) return;
                const baseObj = await detectSObjectFromActiveUrl();
                if (!baseObj) return; // no fallback: behave like before
                const lim = parseInt(String(limitEl?.value || '200'), 10) || 200;
                const limitStr = ` LIMIT ${lim}`;
                // Try to detect current record Id and prefill WHERE if available
                const rid = await detectRecordIdFromActiveTab();
                const whereStr = rid ? ` WHERE Id = '${rid}'` : '';
                const template = `SELECT Id FROM ${baseObj}${whereStr}${limitStr}`;
                input.value = template;
                // place cursor: if WHERE present, put caret just before LIMIT; otherwise before LIMIT
                const pos = template.indexOf(limitStr);
                const caret = pos >= 0 ? pos : template.length;
                input.setSelectionRange(caret, caret);
                input.dispatchEvent(new Event('input', { bubbles: true }));
            } catch { /* ignore prefill issues */ }
        })();

        // Editor: highlight/mirror
        if (input && highlightEl) {
            const syncHighlight = () => { highlightEl.innerHTML = highlightSoql(String(input.value || '')); highlightEl.scrollTop = input.scrollTop; highlightEl.scrollLeft = input.scrollLeft; };
            input.addEventListener('input', syncHighlight);
            input.addEventListener('scroll', () => { highlightEl.scrollTop = input.scrollTop; highlightEl.scrollLeft = input.scrollLeft; });
            // Activate overlay mode so text is visible via the highlighter
            const wrap = highlightEl.parentElement;
            if (wrap && wrap.classList && wrap.classList.contains('editor-wrap')) {
                wrap.classList.add('has-overlay');
            }
            // initial
            setTimeout(syncHighlight, 0);
        }

        // ===== Schema sidebar: fetch, render, filter =====
        function setSchemaHeader(name, count) {
            if (schemaObjectEl) schemaObjectEl.textContent = name ? `Object: ${name}` : 'Object: —';
            if (schemaFieldCountEl) schemaFieldCountEl.textContent = String(Number.isFinite(count) ? count : 0);
        }

        async function fetchSObjectDescribeCached(objName) {
            if (!objName) return null;
            if (sobjectDescribeCache[objName]) return sobjectDescribeCache[objName];
            if (!sessionInfo || !sessionInfo.instanceUrl) return null;
            try {
                const base = sessionInfo.instanceUrl.replace(/\/+$/, '');
                const url = `${base}/services/data/v${API_VERSION}/sobjects/${encodeURIComponent(objName)}/describe`;
                const res = await fetch(url, { headers: { 'Authorization': `Bearer ${getAccessToken()}`, 'Accept': 'application/json' } });
                if (!res.ok) return null;
                const data = await res.json();
                sobjectDescribeCache[objName] = data;
                // cache fields list
                if (Array.isArray(data?.fields)) sobjectFieldsCache[objName] = data.fields;
                // cache child relationship targets
                if (Array.isArray(data?.childRelationships)) {
                    const map = relationshipTargetCache[objName] || (relationshipTargetCache[objName] = {});
                    for (const cr of data.childRelationships) {
                        if (cr.relationshipName && cr.childSObject) map[cr.relationshipName] = cr.childSObject;
                    }
                }
                return data;
            } catch { return null; }
        }

        function renderSchemaFields(list, filterText, typeFilter) {
            if (!schemaFieldsEl) return;
            const term = String(filterText || '').toLowerCase();
            const typeSel = String(typeFilter || '').toLowerCase();
            const items = (Array.isArray(list) ? list : []).filter(f => {
                const matchesText = !term || (String(f.name || '').toLowerCase().includes(term) || String(f.label || '').toLowerCase().includes(term));
                const matchesType = !typeSel || String(f.type || '').toLowerCase() === typeSel;
                return matchesText && matchesType;
            });
            const html = items.map(f => {
                const type = String(f.type || '').toLowerCase();
                const label = escapeHtml(f.label || f.name);
                const isRef = type === 'reference';
                const relToken = isRef ? getRelationshipTokenFromField(f) : '';
                // Display name: for reference fields, show relationship token to guide users (Account. or Custom__r.)
                const displayName = isRef && relToken ? escapeHtml(relToken + '.') : escapeHtml(f.name || '');
                const dataVal = isRef && relToken ? `${relToken}.` : String(f.name || '');
                return `<button class="schema-field${isRef ? ' is-ref' : ''}" type="button" data-field="${escapeHtml(dataVal)}" data-type="${escapeHtml(type)}">
                    <span class="type">${escapeHtml(type)}</span>
                    <span class="name">${displayName}</span>
                    <span class="label">${label !== (f.name || '') ? label : ''}</span>
                </button>`;
            }).join('');
            schemaFieldsEl.innerHTML = html || '<div class="empty-state">No matching fields</div>';
            // clicks
            schemaFieldsEl.querySelectorAll('.schema-field').forEach(btn => {
                btn.addEventListener('click', () => {
                    const fld = btn.getAttribute('data-field') || '';
                    const q = String(input?.value || '');
                    const cur = input?.selectionStart || 0;
                    const ctx = parseSoqlContext(q, cur);
                    applySuggestionToQueryField(input, ctx, fld);
                });
            });
        }

        function renderSchemaChildren(list) {
            if (!schemaChildrenEl) return;
            const items = (Array.isArray(list) ? list : []).filter(cr => cr.relationshipName);
            if (!items.length) { schemaChildrenEl.innerHTML = ''; return; }
            const html = `<div class="section-title" style="margin:8px 0;">Child Relationships</div>` +
                items.map(cr => {
                    const rel = escapeHtml(cr.relationshipName);
                    const child = escapeHtml(cr.childSObject || '');
                    return `<button type="button" class="schema-field" data-rel="${rel}">
                        <span class="type">rel</span>
                        <span class="name">${rel}</span>
                        <span class="label">${child}</span>
                    </button>`;
                }).join('');
            schemaChildrenEl.innerHTML = html;
            schemaChildrenEl.querySelectorAll('.schema-field').forEach(btn => {
                btn.addEventListener('click', () => {
                    const rel = btn.getAttribute('data-rel');
                    const q = String(input?.value || '');
                    const cur = input?.selectionStart || 0;
                    const ctx = parseSoqlContext(q, cur);
                    insertSubqueryIntoSelect(input, ctx, rel);
                });
            });
        }

        function updateTypeFilterOptions(fields) {
            if (!schemaTypeFilterEl) return;
            const types = new Set();
            (Array.isArray(fields) ? fields : []).forEach(f => { if (f.type) types.add(String(f.type)); });
            const opts = ['<option value="">All types</option>'].concat(Array.from(types).sort().map(t => `<option value="${escapeHtml(t)}">${escapeHtml(t)}</option>`));
            schemaTypeFilterEl.innerHTML = opts.join('');
        }

        // Compute the relationship token for a reference field: standard => RelationshipName; custom => Custom__r
        function getRelationshipTokenFromField(field) {
            try {
                if (!field || String(field.type || '').toLowerCase() !== 'reference') return '';
                // Prefer relationshipName from describe. It is already correct (standard or Custom__r)
                if (field.relationshipName) return String(field.relationshipName);
                const name = String(field.name || '');
                const isCustom = !!field.custom;
                if (/Id$/i.test(name)) {
                    return name.replace(/Id$/i, '') + (isCustom && !/__r$/i.test(name) ? '' : '');
                }
                if (isCustom && /__c$/i.test(name)) {
                    return name.replace(/__c$/i, '__r');
                }
                // Fallback: return name without trailing Id
                return name.replace(/Id$/i, '');
            } catch { return ''; }
        }

        async function updateSchemaForBaseObject(objName) {
            currentBaseObject = objName || '';
            if (!currentBaseObject) {
                setSchemaHeader('', 0);
                if (schemaFieldsEl) schemaFieldsEl.innerHTML = '';
                if (schemaChildrenEl) schemaChildrenEl.innerHTML = '';
                return;
            }
            const desc = await fetchSObjectDescribeCached(currentBaseObject);
            const fields = Array.isArray(desc?.fields) ? desc.fields : [];
            const children = Array.isArray(desc?.childRelationships) ? desc.childRelationships : [];
            currentFields = fields;
            currentChildren = children;
            setSchemaHeader(currentBaseObject, fields.length);
            updateTypeFilterOptions(fields);
            renderSchemaFields(fields, schemaSearchEl?.value || '', schemaTypeFilterEl?.value || '');
            renderSchemaChildren(children);
        }

        if (schemaSearchEl) schemaSearchEl.addEventListener('input', () => {
            renderSchemaFields(currentFields, schemaSearchEl.value, schemaTypeFilterEl?.value || '');
        });
        if (schemaTypeFilterEl) schemaTypeFilterEl.addEventListener('change', () => {
            renderSchemaFields(currentFields, schemaSearchEl?.value || '', schemaTypeFilterEl.value);
        });

        // ===== Suggestions: context-aware (keywords, objects, fields) =====
        function getFromAreaInfo(q, cursor) {
            const text = String(q || '');
            const up = text.toUpperCase();
            const cur = Number.isFinite(cursor) ? cursor : text.length;
            const idxFrom = up.lastIndexOf('FROM', cur);
            if (idxFrom < 0 || idxFrom > cur) return { inFrom: false };
            const afterFrom = idxFrom + 4;
            // find next clause
            const rest = up.slice(afterFrom);
            const m = rest.match(/\b(USING\s+SCOPE|WHERE|WITH\s+SECURITY_ENFORCED|WITH\s+DATA\s+CATEGORY|GROUP\s+BY|HAVING|ORDER\s+BY|LIMIT|OFFSET|FOR\s+(VIEW|REFERENCE|UPDATE)|ALL\s+ROWS)\b/);
            const end = m ? (afterFrom + m.index) : text.length;
            const inFrom = cur >= afterFrom && cur <= end;
            return { inFrom, start: afterFrom, end };
        }

        function filterAndMap(items, needle, subFmt) {
            const n = String(needle || '').toLowerCase();
            const list = (Array.isArray(items) ? items : []).filter(v => String(v).toLowerCase().includes(n));
            return list.slice(0, 50).map(v => ({ label: String(v), value: String(v), sub: subFmt ? subFmt(v) : '' }));
        }

        async function updateSuggestions() {
            if (!input || !suggestBox) return;
            const q = String(input.value || '');
            const cur = input.selectionStart || 0;
            const ctx = parseSoqlContext(q, cur);
            const tokenObj = ctx.selectToken || ctx.generalToken;
            const token = tokenObj?.text || '';

            // Helper: dot-walk suggestions for reference relationships like Account.Name or Owner.Name
            async function suggestDotWalk(baseObject, dottedToken, onPick) {
                const parts = String(dottedToken || '').split('.');
                if (parts.length < 2) return false;
                const first = parts[0];
                const partial = parts.slice(1).join('.') || '';
                // resolve targets for first segment
                const targets = await resolveReferenceTargets(baseObject, first);
                if (!targets.length) return false;
                // gather suggestions from target object fields
                let items = [];
                for (const t of targets) {
                    const fieldsMeta = await getFieldsForObject(t.targetSObject);
                    const fieldNames = (fieldsMeta || []).map(f => f.name);
                    const filtered = fieldNames.filter(n => !partial || n.toLowerCase().includes(partial.toLowerCase()));
                    const mapped = filtered.map(n => ({ label: `${first}.${n}`, value: `${first}.${n}`, sub: t.targetSObject }));
                    items = items.concat(mapped);
                }
                if (!items.length) return false;
                // de-dupe by value and cap at 50
                const seen = new Set();
                const unique = [];
                for (const it of items) { if (!seen.has(it.value)) { seen.add(it.value); unique.push(it); } }
                renderSuggestions(suggestBox, unique.slice(0, 50), onPick);
                return true;
            }

            // FROM area: suggest objects
            const fromInfo = getFromAreaInfo(q, cur);
            if (fromInfo.inFrom) {
                const objs = await ensureSObjectList();
                const items = filterAndMap(objs, token);
                return renderSuggestions(suggestBox, items, (val) => applySuggestionToQuery(input, val));
            }
            // In SELECT without a base object yet: still suggest FIELDS(...) and functions
            if (ctx.inSelectArea && !ctx.baseObject) {
                const fn = SOQL_FUNCTIONS.map(f => f + '()');
                const apexFields = ['FIELDS(ALL)','FIELDS(STANDARD)','FIELDS(CUSTOM)'];
                const items = filterAndMap(apexFields, token, ()=> 'apex').concat(filterAndMap(fn, token, ()=> 'fn')).concat(filterAndMap(SOQL_KEYWORDS, token));
                return renderSuggestions(suggestBox, items, (val) => applySuggestionToQuery(input, val));
            }
            // In SELECT: suggest fields (with dot-walk for references)
            if (ctx.inSelectArea && ctx.baseObject) {
                // If token contains a dot, try dot-walk suggestions first
                if (token && token.includes('.')) {
                    const ok = await suggestDotWalk(ctx.baseObject, token, (val) => applySuggestionToQueryField(input, ctx, val));
                    if (ok) return; // dot suggestions rendered
                }
                if (!sobjectFieldsCache[ctx.baseObject]) await fetchSObjectDescribeCached(ctx.baseObject);
                const fieldMetas = (sobjectFieldsCache[ctx.baseObject] || []);
                const fields = fieldMetas.map(f => f.name);
                // Build relationship tokens for reference fields to show as Account. or Custom__r.
                const relationshipTokens = fieldMetas
                    .filter(f => String(f.type || '').toLowerCase() === 'reference')
                    .map(f => getRelationshipTokenFromField(f))
                    .filter(Boolean)
                    .map(r => r + '.');
                // Detect if cursor is immediately after a comma (ignoring spaces)
                let afterComma = false;
                if (tokenObj && typeof tokenObj.start === 'number') {
                    const before = q.slice(0, tokenObj.start).replace(/\s+$/,'');
                    const prevChar = before.slice(-1);
                    afterComma = prevChar === ',';
                }
                const relItems = filterAndMap(relationshipTokens, token, () => 'rel');
                if (afterComma) {
                    // After a comma inside SELECT, show relationship tokens first, then fields
                    const items = relItems.concat(filterAndMap(fields, token));
                    return renderSuggestions(suggestBox, items, (val) => applySuggestionToQueryField(input, ctx, val));
                } else {
                    // Otherwise include functions, FIELDS(...), relationship tokens, then fields
                    const fn = SOQL_FUNCTIONS.map(f => f + '()');
                    const apexFields = ['FIELDS(ALL)','FIELDS(STANDARD)','FIELDS(CUSTOM)'];
                    const items = filterAndMap(apexFields, token, ()=> 'apex')
                        .concat(filterAndMap(fn, token, () => 'fn'))
                        .concat(relItems)
                        .concat(filterAndMap(fields, token));
                    return renderSuggestions(suggestBox, items, (val) => applySuggestionToQueryField(input, ctx, val));
                }
            }
            // In WHERE: suggest fields (prioritize reference fields and support dot-walk)
            if (ctx.inWhereArea && ctx.baseObject) {
                // Dot-walk in WHERE (e.g., Account.Name)
                if (token && token.includes('.')) {
                    const ok = await suggestDotWalk(ctx.baseObject, token, (val) => applySuggestionToQueryWhereField(input, ctx, val));
                    if (ok) return;
                }
                if (!sobjectFieldsCache[ctx.baseObject]) await fetchSObjectDescribeCached(ctx.baseObject);
                const meta = (sobjectFieldsCache[ctx.baseObject] || []);
                const needle = String(token || '').toLowerCase();
                // Build items with sublabels and prioritize reference fields first, then custom, then others
                const allItems = meta
                    .filter(f => {
                        const nm = String(f.name || '').toLowerCase();
                        const lb = String(f.label || '').toLowerCase();
                        return !needle || nm.includes(needle) || lb.includes(needle);
                    })
                    .map(f => ({
                        label: String(f.name || ''),
                        value: String(f.name || ''),
                        sub: (String(f.type || '').toLowerCase() === 'reference') ? 'reference' : (f.custom ? 'custom' : String(f.type || ''))
                    }));
                const rank = (it) => it.sub === 'reference' ? 0 : (it.sub === 'custom' ? 1 : 2);
                allItems.sort((a, b) => {
                    const ra = rank(a), rb = rank(b);
                    if (ra !== rb) return ra - rb;
                    return a.label.localeCompare(b.label);
                });
                const items = allItems.slice(0, 50);
                return renderSuggestions(suggestBox, items, (val) => applySuggestionToQueryWhereField(input, ctx, val));
            }
            // Default: suggest keywords
            const kws = SOQL_KEYWORDS.slice();
            const items = filterAndMap(kws, token);
            return renderSuggestions(suggestBox, items, (val) => applySuggestionToQuery(input, val));
        }

        async function showWhereValueSuggestions(input) {
            const suggestBox = document.getElementById('soql-suggestions');
            if (!input || !suggestBox) return;
            const q = String(input.value || '');
            const cur = input.selectionStart || 0;
            const ctx = parseSoqlContext(q, cur);
            const baseObj = ctx.baseObject;
            const fieldToken = detectFieldNameBeforeCursor(q, cur);
            const operator = detectOperatorNearCursor(q, cur);
            if (!baseObj || !fieldToken || !operator) return;
            if (!sobjectFieldsCache[baseObj]) await fetchSObjectDescribeCached(baseObj);
            const meta = findFieldMeta(baseObj, fieldToken.split('.')[0]); // basic dotted notation support
            const type = String(meta?.type || '').toLowerCase();

            // Build suggestions
            let items = [];
            const push = (label, value, sub) => items.push({ label, value, sub: sub || '' });

            const isIn = operator === 'IN' || operator === 'NOT IN';
            const scaffoldIn = (vals) => `(${vals.join(', ')})`;

            if (type === 'boolean') {
                push('TRUE', 'TRUE', 'value');
                push('FALSE', 'FALSE', 'value');
            } else if (type === 'date' || type === 'datetime') {
                // Salesforce date literals
                push('TODAY', 'TODAY', 'literal');
                push('YESTERDAY', 'YESTERDAY', 'literal');
                push('LAST_N_DAYS:7', 'LAST_N_DAYS:7', 'literal');
                push('THIS_MONTH', 'THIS_MONTH', 'literal');
            } else if (type === 'int' || type === 'double' || type === 'currency' || type === 'percent') {
                push('0', '0', 'number');
                push('100', '100', 'number');
            } else if (type === 'reference' || type === 'id') {
                if (isIn) {
                    push("('001XXXXXXXXXXXX','001YYYYYYYYYYYY')", "('001XXXXXXXXXXXX','001YYYYYYYYYYYY')", 'Ids');
                    push("('a0123456789ABCDE','a01XXXXXXXXXXXX')", "('a0123456789ABCDE','a01XXXXXXXXXXXX')", 'Ids');
                } else {
                    push('001XXXXXXXXXXXX', '001XXXXXXXXXXXX', 'Id');
                    push('a0123456789ABCDE', 'a0123456789ABCDE', 'Id');
                }
            } else if (type === 'multipicklist') {
                // Operator likely INCLUDES/EXCLUDES
                const vals = Array.isArray(meta?.picklistValues) ? meta.picklistValues.filter(v=>v?.active && v?.value).slice(0, 10) : [];
                if (vals.length) {
                    vals.forEach(v => push(String(v.value), quoteIfNeeded(String(v.value)), 'value'));
                } else {
                    push('ValueA', quoteIfNeeded('ValueA'), 'value');
                    push('ValueB', quoteIfNeeded('ValueB'), 'value');
                }
            } else if (type === 'picklist') {
                const vals = Array.isArray(meta?.picklistValues) ? meta.picklistValues.filter(v=>v?.active && v?.value).slice(0, 15) : [];
                if (isIn) {
                    if (vals.length >= 2) {
                        const firstTwo = vals.slice(0, 2).map(v => quoteIfNeeded(String(v.value)));
                        push(`(${firstTwo.join(', ')})`, `(${firstTwo.join(', ')})`, 'values');
                    }
                    push("('A','B')", "('A','B')", 'values');
                } else {
                    if (vals.length) vals.forEach(v => push(String(v.value), quoteIfNeeded(String(v.value)), 'value'));
                    push('SomeValue', quoteIfNeeded('SomeValue'), 'value');
                }
            } else {
                // Strings and others
                if (operator === 'LIKE') {
                    push("'abc%'", "'abc%'", 'pattern');
                    push("'%abc%'", "'%abc%'", 'pattern');
                    push("'%abc'", "'%abc'", 'pattern');
                } else if (isIn) {
                    push("('A','B')", "('A','B')", 'values');
                } else {
                    push('Sample', quoteIfNeeded('Sample'), 'value');
                    if (type === 'email') push('user@example.com', quoteIfNeeded('user@example.com'), 'email');
                    if (type === 'url') push('https://example.com', quoteIfNeeded('https://example.com'), 'url');
                    if (type === 'phone') push('555-1234', quoteIfNeeded('555-1234'), 'phone');
                }
            }

            if (!items.length) return;
            renderSuggestions(suggestBox, items, (val) => applySuggestionToQueryWhereValue(input, val));
        }

        // ===== Missing helper implementations =====
        async function ensureSObjectList() {
            if (Array.isArray(sobjectApiNames) && sobjectApiNames.length) return sobjectApiNames;
            if (!sessionInfo || !sessionInfo.instanceUrl) return [];
            try {
                const base = sessionInfo.instanceUrl.replace(/\/+$/, '');
                const url = `${base}/services/data/v${API_VERSION}/sobjects`;
                const res = await fetch(url, { headers: { 'Authorization': `Bearer ${getAccessToken()}`, 'Accept': 'application/json' } });
                if (!res.ok) return [];
                const data = await res.json();
                const list = Array.isArray(data?.sobjects) ? data.sobjects.map(o => o.name).filter(Boolean) : [];
                sobjectApiNames = list.sort((a, b) => a.localeCompare(b));
                // also prime prefix map if available
                if (!sobjectPrefixMap) {
                    const map = {};
                    (Array.isArray(data?.sobjects) ? data.sobjects : []).forEach(o => {
                        if (o.keyPrefix && o.name) map[o.keyPrefix] = o.name;
                    });
                    sobjectPrefixMap = map;
                }
                return sobjectApiNames;
            } catch { return []; }
        }

        // New helpers: find field meta and resolve reference targets for dot-walk
        function findFieldMeta(sObj, fieldOrRel) {
            const obj = String(sObj || '');
            const key = String(fieldOrRel || '');
            const meta = sobjectFieldsCache[obj] || [];
            const lower = key.toLowerCase();
            // Try exact name, relationshipName, and name without trailing Id
            let f = meta.find(x => String(x.name || '').toLowerCase() === lower);
            if (f) return f;
            f = meta.find(x => String(x.relationshipName || '').toLowerCase() === lower);
            if (f) return f;
            f = meta.find(x => String(x.name || '').replace(/id$/i,'').toLowerCase() === lower);
            return f || null;
        }

        async function getFieldsForObject(objName) {
            if (!objName) return [];
            if (!sobjectFieldsCache[objName]) await fetchSObjectDescribeCached(objName);
            return sobjectFieldsCache[objName] || [];
        }

        async function resolveReferenceTargets(baseObject, relToken) {
            if (!baseObject || !relToken) return [];
            if (!sobjectFieldsCache[baseObject]) await fetchSObjectDescribeCached(baseObject);
            const meta = sobjectFieldsCache[baseObject] || [];
            const lower = String(relToken).toLowerCase();
            const matches = meta.filter(f => String(f.type || '').toLowerCase() === 'reference').filter(f => {
                const name = String(f.name || '');
                const rel = String(f.relationshipName || '');
                return rel.toLowerCase() === lower || name.replace(/id$/i,'').toLowerCase() === lower || lower === (rel ? String(rel) : '').toLowerCase() || lower === name.toLowerCase();
            });
            const out = [];
            for (const f of matches) {
                const targets = Array.isArray(f.referenceTo) ? f.referenceTo : [];
                for (const t of targets) out.push({ field: f.name, relationName: f.relationshipName || f.name.replace(/Id$/,''), targetSObject: t });
            }
            return out;
        }

        // ===== Additional missing utilities and wiring =====
        function parseSoqlContext(q, cursor) {
            const text = String(q || '');
            const up = text.toUpperCase();
            const cur = Number.isFinite(cursor) ? cursor : text.length;
            const idxSelect = up.indexOf('SELECT');
            const idxFrom = up.indexOf('FROM');
            const idxWhere = up.indexOf('WHERE');
            const clauseEndRegex = /\b(GROUP\s+BY|HAVING|ORDER\s+BY|LIMIT|OFFSET|FOR\s+(VIEW|REFERENCE|UPDATE)|WITH\b|ALL\s+ROWS|USING\s+SCOPE)\b/i;

            let baseObject = '';
            const mFrom = text.slice(idxFrom >= 0 ? idxFrom : 0).match(/\bFROM\s+([A-Za-z0-9_]+)/i);
            if (mFrom && mFrom[1]) baseObject = mFrom[1];

            const inSelectArea = idxSelect >= 0 && cur > idxSelect && (idxFrom < 0 || cur <= idxFrom);
            let whereEnd = text.length;
            const mEnd = clauseEndRegex.exec(text.slice(idxWhere >= 0 ? idxWhere : text.length));
            if (mEnd && idxWhere >= 0) whereEnd = idxWhere + (mEnd.index || 0);
            const inWhereArea = idxWhere >= 0 && cur >= idxWhere && cur <= whereEnd;

            const selectToken = inSelectArea ? tokenAt(text, cur) : null;
            const generalToken = !inSelectArea ? tokenAt(text, cur) : null;
            return { inSelectArea, inWhereArea, baseObject, selectToken, generalToken };
        }

        function tokenAt(text, pos) {
            const src = String(text || '');
            const i = Math.max(0, Math.min(pos, src.length));
            const isWord = (c) => /[A-Za-z0-9_.]/.test(c);
            let s = i, e = i;
            while (s > 0 && isWord(src[s - 1])) s--;
            while (e < src.length && isWord(src[e])) e++;
            const t = src.slice(s, e);
            return { start: s, end: e, text: t };
        }

        function renderSuggestions(container, items, onPick) {
            if (!container) return;
            const arr = Array.isArray(items) ? items : [];
            if (!arr.length) { container.innerHTML = ''; container.style.display = 'none'; container._items = []; container._onPick = null; return; }
            container.innerHTML = arr.map((it, idx) => `
                <div class="suggestion-item${idx===0?' selected':''}" role="option" data-index="${idx}" data-value="${escapeHtml(it.value)}">
                    <span class="label">${escapeHtml(it.label)}</span>
                    ${it.sub ? `<span class="sub">${escapeHtml(String(it.sub))}</span>` : ''}
                </div>
            `).join('');
            container.style.display = 'block';
            container._items = arr;
            container._onPick = typeof onPick === 'function' ? onPick : null;
            // Click handling
            container.querySelectorAll('.suggestion-item').forEach((el) => {
                el.addEventListener('mousedown', (e) => { // mousedown to avoid blur hiding before click
                    e.preventDefault();
                    const idx = parseInt(el.getAttribute('data-index') || '0', 10) || 0;
                    acceptSuggestionAt(container, idx);
                });
            });
        }

        function acceptSuggestionAt(container, idx) {
            try {
                const items = container?._items || [];
                const onPick = container?._onPick;
                const it = items[idx];
                if (!it) return hideSuggestions(container);
                if (typeof onPick === 'function') onPick(it.value);
            } finally {
                hideSuggestions(container);
            }
        }

        function hideSuggestions(container) {
            if (!container) return;
            container.innerHTML = '';
            container.style.display = 'none';
            container._items = [];
            container._onPick = null;
        }

        function moveSuggestionSelection(container, dir) {
            if (!container || container.style.display === 'none') return;
            const items = Array.from(container.querySelectorAll('.suggestion-item'));
            if (!items.length) return;
            let idx = items.findIndex(el => el.classList.contains('selected'));
            idx = (idx + dir + items.length) % items.length;
            items.forEach(el => el.classList.remove('selected'));
            items[idx].classList.add('selected');
            items[idx].scrollIntoView({ block: 'nearest' });
        }

        function pickSelectedSuggestion(container) {
            if (!container || container.style.display === 'none') return false;
            const items = Array.from(container.querySelectorAll('.suggestion-item'));
            const idx = items.findIndex(el => el.classList.contains('selected'));
            if (idx >= 0) {
                acceptSuggestionAt(container, idx);
                return true;
            }
            return false;
        }

        function applySuggestionToQuery(input, value) {
            const q = String(input.value || '');
            const cur = input.selectionStart || 0;
            const tok = tokenAt(q, cur);
            const head = q.slice(0, tok.start);
            const tail = q.slice(tok.end);
            const next = head + value + tail;
            const pos = (head + value).length;
            input.value = next;
            input.setSelectionRange(pos, pos);
            input.dispatchEvent(new Event('input', { bubbles: true }));
        }

        function applySuggestionToQueryField(input, ctx, value) {
            // Replace current token inside SELECT area
            applySuggestionToQuery(input, value);
        }

        function applySuggestionToQueryWhereField(input, ctx, value) {
            applySuggestionToQuery(input, value);
            // After inserting a field in WHERE, show operator/value suggestions next
            setTimeout(() => showWhereValueSuggestions(input), 0);
        }

        function applySuggestionToQueryWhereValue(input, value) {
            const q = String(input.value || '');
            const cur = input.selectionStart || 0;
            const head = q.slice(0, cur);
            const tail = q.slice(cur);
            const ins = String(value || '');
            const next = head + ins + tail;
            const pos = (head + ins).length;
            input.value = next;
            input.setSelectionRange(pos, pos);
            input.dispatchEvent(new Event('input', { bubbles: true }));
        }

        function detectFieldNameBeforeCursor(q, cur) {
            try {
                const text = String(q || '').slice(0, cur);
                const m = text.match(/([A-Za-z0-9_.]+)\s*(=|!=|<=|>=|<|>|LIKE|INCLUDES|EXCLUDES|NOT\s+IN|IN)\s*$/i);
                return m ? m[1] : '';
            } catch { return ''; }
        }

        function detectOperatorNearCursor(q, cur) {
            try {
                const text = String(q || '').slice(0, cur);
                const m = text.match(/(=|!=|<=|>=|<|>|LIKE|INCLUDES|EXCLUDES|NOT\s+IN|IN)\s*$/i);
                return m ? m[1].toUpperCase().replace(/\s+/g, ' ') : '';
            } catch { return ''; }
        }

        function quoteIfNeeded(val) {
            if (/^'.*'$/.test(val)) return val;
            if (/^[A-Za-z0-9_.-]+$/.test(val)) return `'${val}'`;
            return `'${String(val).replace(/'/g, "''")}'`;
        }

        // Wire editor events
        if (input) {
            input.addEventListener('input', async () => {
                // keep suggestions in sync
                updateSuggestions();
                // update schema panel when base object changes
                const q = String(input.value || '');
                const cur = input.selectionStart || 0;
                const ctx = parseSoqlContext(q, cur);
                if (ctx.baseObject && ctx.baseObject !== currentBaseObject) {
                    await updateSchemaForBaseObject(ctx.baseObject);
                    // persist recent objects
                    try {
                        const { soqlRecent = [] } = await chrome.storage.local.get({ soqlRecent: [] });
                        const list = Array.isArray(soqlRecent) ? soqlRecent.slice() : [];
                        const idx = list.indexOf(ctx.baseObject);
                        if (idx !== -1) list.splice(idx, 1);
                        list.unshift(ctx.baseObject);
                        while (list.length > 10) list.pop();
                        await chrome.storage.local.set({ soqlRecent: list });
                        populateSelect(recentSel, list, 'Recent objects');
                    } catch {}
                }
            });
            input.addEventListener('keydown', (e) => {
                if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                    e.preventDefault();
                    runSoqlQuery();
                    return;
                }
                if (!suggestBox || suggestBox.style.display === 'none') return;
                if (e.key === 'ArrowDown') { e.preventDefault(); moveSuggestionSelection(suggestBox, +1); }
                else if (e.key === 'ArrowUp') { e.preventDefault(); moveSuggestionSelection(suggestBox, -1); }
                else if (e.key === 'Enter' || e.key === 'Tab') {
                    if (pickSelectedSuggestion(suggestBox)) { e.preventDefault(); }
                } else if (e.key === 'Escape') { hideSuggestions(suggestBox); }
            });
            input.addEventListener('click', () => { updateSuggestions(); });
            input.addEventListener('blur', () => { setTimeout(() => hideSuggestions(suggestBox), 120); });
        }

        if (recentSel) {
            recentSel.addEventListener('change', async () => {
                const val = String(recentSel.value || '').trim();
                if (!val) return;
                await updateSchemaForBaseObject(val);
                const q = String(input?.value || '');
                if (!/\bFROM\b/i.test(q)) {
                    const tmpl = `SELECT Id FROM ${val} LIMIT ${parseInt(String(limitEl?.value || '200'), 10) || 200}`;
                    input.value = tmpl;
                    const pos = tmpl.length;
                    input.setSelectionRange(pos, pos);
                    input.dispatchEvent(new Event('input', { bubbles: true }));
                }
            });
        }

        // Run button
        if (runBtn) {
            runBtn.addEventListener('click', () => runSoqlQuery());
        }

        async function runSoqlQuery() {
            try {
                const qRaw = String(input?.value || '').trim();
                if (!qRaw) return;
                if (!sessionInfo || !sessionInfo.instanceUrl) { renderError(results, 'Not connected to Salesforce'); return; }
                const base = sessionInfo.instanceUrl.replace(/\/+$/, '');
                const tooling = !!toolingEl?.checked;
                // Ensure LIMIT if not present
                let qFinal = qRaw;
                if (!/\bLIMIT\b/i.test(qFinal)) {
                    const lim = parseInt(String(limitEl?.value || '200'), 10) || 200;
                    qFinal = qFinal + ` LIMIT ${lim}`;
                }
                const endpoint = tooling ? 'tooling/query' : 'query';
                results.innerHTML = '<div class="loading"><div class="loading-spinner"></div><p>Running SOQL...</p></div>';
                const t0 = performance.now();
                const res = await fetch(`${base}/services/data/v${API_VERSION}/${endpoint}?q=${encodeURIComponent(qFinal)}`, {
                    method: 'GET',
                    headers: { 'Authorization': `Bearer ${getAccessToken()}`, 'Accept': 'application/json' },
                    credentials: 'omit'
                });
                const text = await res.text();
                let data; try { data = JSON.parse(text); } catch { data = { error: text }; }
                const t1 = performance.now();
                if (!res.ok) {
                    const msg = data?.message || data?.[0]?.message || res.statusText || 'Query failed';
                    renderError(results, `${res.status} ${escapeHtml(String(msg))}`);
                    if (metricsEl) metricsEl.textContent = '';
                    return;
                }
                const records = Array.isArray(data?.records) ? data.records : [];
                renderSoqlResults(records);
                if (metricsEl) {
                    const t = Math.round(t1 - t0);
                    const total = Number.isFinite(data?.totalSize) ? data.totalSize : records.length;
                    metricsEl.textContent = `Rows: ${total} • Time: ${t} ms`;
                }
            } catch (e) {
                renderError(results, String(e));
            }
        }

        function renderSoqlResults(records) {
            if (!results) return;
            const rows = Array.isArray(records) ? records : [];
            if (!rows.length) { results.innerHTML = '<div class="placeholder-note">No rows</div>'; return; }
            // Determine columns from union of keys (skip attributes)
            const colsSet = new Set();
            rows.forEach(r => {
                Object.keys(r || {}).forEach(k => { if (k !== 'attributes') colsSet.add(k); });
            });
            const cols = Array.from(colsSet);
            const header = `<thead><tr>${cols.map(c => `<th>${escapeHtml(c)}</th>`).join('')}</tr></thead>`;
            const body = `<tbody>${rows.map(r => `<tr>${cols.map(c => `<td>${formatCell(r[c])}</td>`).join('')}</tr>`).join('')}</tbody>`;
            results.innerHTML = `<div class="table-wrap"><table class="data-table">${header}${body}</table></div>`;
            // Wire ID click handlers via delegation
            setupIdDelegation(results);
        }

        function isSalesforceId(str) {
            const s = String(str || '');
            if (!/^[A-Za-z0-9]{15}(?:[A-Za-z0-9]{3})?$/.test(s)) return false;
            // Optionally validate known key prefixes if available for extra confidence
            return true;
        }

        function setupIdDelegation(container) {
            if (!container || container._idDelegation) return;
            container._idDelegation = true;
            let openMenuCleanup = null;

            function hideMenu() {
                const m = document.querySelector('.id-menu');
                if (m) m.remove();
                if (openMenuCleanup) {
                    document.removeEventListener('click', openMenuCleanup, true);
                    document.removeEventListener('keydown', onKeyDown, true);
                    window.removeEventListener('resize', hideMenu, true);
                    window.removeEventListener('scroll', hideMenu, true);
                    openMenuCleanup = null;
                }
            }
            function onKeyDown(e) {
                if (e.key === 'Escape') hideMenu();
            }

            function showIdMenuForEl(el, event) {
                hideMenu();
                const id = el.getAttribute('data-id') || '';
                if (!id) return;
                const menu = document.createElement('div');
                menu.className = 'id-menu';
                menu.innerHTML = `
                    <button type="button" class="menu-item" data-action="open">Open record in new tab</button>
                    <div class="menu-sep"></div>
                    <button type="button" class="menu-item" data-action="copy">Copy Id</button>
                `;
                document.body.appendChild(menu);
                positionMenu(menu, event);
                // Action handlers
                menu.addEventListener('click', async (e) => {
                    const btn = e.target.closest('.menu-item');
                    if (!btn) return;
                    const action = btn.getAttribute('data-action');
                    if (action === 'open') {
                        await openRecordInNewTab(id);
                    } else if (action === 'copy') {
                        await copyText(id);
                        // brief feedback
                        btn.textContent = 'Copied!';
                        setTimeout(() => { try { btn.textContent = 'Copy Id'; } catch {} }, 800);
                    }
                    hideMenu();
                });
                // Dismiss on outside click, ESC, resize, scroll
                openMenuCleanup = (e) => { if (!menu.contains(e.target)) hideMenu(); };
                setTimeout(() => {
                    document.addEventListener('click', openMenuCleanup, true);
                    document.addEventListener('keydown', onKeyDown, true);
                    window.addEventListener('resize', hideMenu, true);
                    window.addEventListener('scroll', hideMenu, true);
                }, 0);
            }

            function positionMenu(menu, event) {
                const vw = window.innerWidth, vh = window.innerHeight;
                let x = 0, y = 0;
                if (event && typeof event.clientX === 'number') {
                    x = event.clientX; y = event.clientY;
                } else {
                    const rect = menu.getBoundingClientRect();
                    x = Math.min(20, vw - rect.width - 8);
                    y = Math.min(20, vh - rect.height - 8);
                }
                // place a bit offset from cursor
                x += 6; y += 6;
                // clamp after we know dimensions
                document.body.appendChild(menu);
                const rect = menu.getBoundingClientRect();
                if (x + rect.width > vw - 8) x = vw - rect.width - 8;
                if (y + rect.height > vh - 8) y = vh - rect.height - 8;
                menu.style.left = `${Math.max(8, x)}px`;
                menu.style.top = `${Math.max(8, y)}px`;
            }

            container.addEventListener('click', (e) => {
                const t = e.target;
                if (!(t instanceof Element)) return;
                const idEl = t.closest('.sf-id');
                if (idEl) {
                    e.preventDefault();
                    showIdMenuForEl(idEl, e);
                }
            });
            container.addEventListener('keydown', (e) => {
                const t = e.target;
                if (!(t instanceof Element)) return;
                if ((e.key === 'Enter' || e.key === ' ') && t.classList.contains('sf-id')) {
                    e.preventDefault();
                    showIdMenuForEl(t, null);
                }
            });
        }

        async function openRecordInNewTab(id) {
            try {
                let url = '';
                // Prefer Lightning record URL if we can resolve sObject
                const sobj = await sobjectNameFromId(id);
                const base = sessionInfo?.instanceUrl?.replace(/\/+$/, '') || '';
                if (sobj) url = `${base}/lightning/r/${encodeURIComponent(sobj)}/${encodeURIComponent(id)}/view`;
                else url = `${base}/${encodeURIComponent(id)}`;
                if (!url) return;
                try {
                    await chrome.tabs.create({ url });
                } catch {
                    // Fallback
                    window.open(url, '_blank');
                }
            } catch { /* ignore */ }
        }

        async function copyText(text) {
            const s = String(text || '');
            try { await navigator.clipboard.writeText(s); return true; }
            catch {
                try {
                    const ta = document.createElement('textarea');
                    ta.value = s; ta.style.position = 'fixed'; ta.style.opacity = '0'; ta.style.left = '-9999px';
                    document.body.appendChild(ta); ta.select(); document.execCommand('copy'); ta.remove();
                    return true;
                } catch { return false; }
            }
        }

        function formatCell(v) {
            if (v == null) return '';
            if (typeof v === 'object') {
                try { return `<pre class="cell-json">${escapeHtml(JSON.stringify(v))}</pre>`; } catch { return String(v); }
            }
            if (typeof v === 'string' && isSalesforceId(v)) {
                const id = escapeHtml(v);
                return `<span class="sf-id" data-id="${id}" role="button" tabindex="0" title="Open or copy">${id}</span>`;
            }
            if (typeof v === 'boolean') return v ? 'true' : 'false';
            return escapeHtml(String(v));
        }

    }

    function insertSubqueryIntoSelect(input, ctx, relationshipName) {
        if (!input || !relationshipName) return;
        const q = String(input.value || '');
        const up = q.toUpperCase();
        const idxSelect = up.indexOf('SELECT');
        const idxFrom = up.indexOf('FROM');
        if (idxSelect < 0) {
            input.value = `SELECT (SELECT Id FROM ${relationshipName})` + (q ? ' ' + q : '');
            input.dispatchEvent(new Event('input', { bubbles: true }));
            return;
        }
        const startSel = idxSelect + 6;
        const endSel = (idxFrom > idxSelect) ? idxFrom : q.length;
        const head = q.slice(0, startSel);
        const body = q.slice(startSel, endSel);
        const tail = q.slice(endSel);
        const sep = body.trim() ? ',' : ' ';
        const inserted = ` ${body.trim()}${sep} (SELECT Id FROM ${relationshipName}) `;
        input.value = head + inserted + tail;
        input.dispatchEvent(new Event('input', { bubbles: true }));
    }

    async function detectSObjectFromActiveUrl() {
        try {
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            const url = tab?.url || '';
            // Try record Id first
            const rec = await detectRecordIdFromActiveTab();
            if (rec) { const s = await sobjectNameFromId(rec); if (s) return s; }
            // Lightning URL patterns
            const m1 = url.match(/\/lightning\/(?:r|o)\/([A-Za-z0-9_]+)\//);
            if (m1 && m1[1]) return m1[1];
            return '';
        } catch { return ''; }
    }

    // Minimal GraphQL handlers (UI tab already present)
    function attachGraphqlHandlers() {
        const runBtn = document.getElementById('gql-run');
        const qEl = document.getElementById('gql-query');
        const vEl = document.getElementById('gql-variables');
        const out = document.getElementById('gql-results');
        if (!runBtn) return;
        runBtn.addEventListener('click', async () => {
            if (!sessionInfo || !sessionInfo.instanceUrl) { renderError(out, 'Not connected to Salesforce'); return; }
            const query = String(qEl?.value || '').trim();
            if (!query) { renderError(out, 'Enter a GraphQL query'); return; }
            let variables = null; const vtxt = String(vEl?.value || '').trim();
            if (vtxt) { try { variables = JSON.parse(vtxt); } catch { renderError(out, 'Variables must be valid JSON'); return; } }
            out.innerHTML = '<div class="loading"><div class="loading-spinner"></div><p>Running GraphQL...</p></div>';
            try {
                const base = sessionInfo.instanceUrl.replace(/\/+$/, '');
                const res = await fetch(`${base}/services/data/v${API_VERSION}/graphql`, {
                    method: 'POST', headers: { 'Authorization': `Bearer ${getAccessToken()}`, 'Accept': 'application/json', 'Content-Type': 'application/json' },
                    body: JSON.stringify({ query, variables })
                });
                const text = await res.text();
                let data; try { data = JSON.parse(text); } catch { throw new Error(text.slice(0,200)); }
                if (!res.ok) throw new Error(data?.errors?.[0]?.message || res.statusText);
                out.innerHTML = `<pre class="log-json">${escapeHtml(JSON.stringify(data, null, 2))}</pre>`;
            } catch (e) {
                renderError(out, String(e));
            }
        });
    }

    // Minimal Current Record handlers
    function attachRecordHandlers() {
        const detectBtn = document.getElementById('record-detect');
        const fetchBtn = document.getElementById('record-fetch');
        const idInput = document.getElementById('record-id');
        const out = document.getElementById('record-results');
        if (detectBtn) detectBtn.addEventListener('click', async () => { const id = await detectRecordIdFromActiveTab(); if (idInput && id) idInput.value = id; });
        if (fetchBtn) fetchBtn.addEventListener('click', async () => {
            const rid = String(idInput?.value || '').trim(); if (!rid) { renderError(out, 'Enter a record Id'); return; }
            if (!sessionInfo || !sessionInfo.instanceUrl) { renderError(out, 'Not connected to Salesforce'); return; }
            out.innerHTML = '<div class="loading"><div class="loading-spinner"></div><p>Fetching record...</p></div>';
            try {
                const sObj = await sobjectNameFromId(rid);
                if (!sObj) throw new Error('Unknown object for Id prefix');
                const base = sessionInfo.instanceUrl.replace(/\/+$/, '');
                const res = await fetch(`${base}/services/data/v${API_VERSION}/sobjects/${encodeURIComponent(sObj)}/${encodeURIComponent(rid)}`, { headers: { 'Authorization': `Bearer ${getAccessToken()}`, 'Accept': 'application/json' } });
                if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
                const data = await res.json();
                out.innerHTML = `<pre class="log-json">${escapeHtml(JSON.stringify(data, null, 2))}</pre>`;
            } catch (e) { renderError(out, String(e)); }
        });
    }

    async function detectRecordIdFromActiveTab() {
        try {
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            const url = tab?.url || '';
            const m = url.match(/\/([a-zA-Z0-9]{15,18})(?:[\/?#]|$)/);
            return m ? m[1] : '';
        } catch { return ''; }
    }

    // Populate the Record Id input from the active tab if available and currently empty
    function autoDetectRecordIdToInput() {
        try {
            const input = document.getElementById('record-id');
            if (!input) return;
            const cur = String(input.value || '').trim();
            if (cur) return;
            detectRecordIdFromActiveTab().then((id) => { if (id && !String(input.value || '').trim()) input.value = id; });
        } catch { /* ignore */ }
    }

    async function sobjectNameFromId(id) {
        if (!id) return null; const prefix = String(id).slice(0, 3);
        const map = await ensurePrefixMap();
        return map[prefix] || null;
    }

    // ===== SOQL Builder base helpers (autocomplete, context, error UI, metadata caches) =====
    // Note: Some advanced wrappers later in the file augment these base functions. Define them early so wrappers can extend.

    // Lightweight error renderer used by multiple tabs
    function renderError(container, message) {
        if (!container) return;
        container.innerHTML = `<div class="error">${escapeHtml(String(message || 'Error'))}</div>`;
    }

    // Produce minimal syntax-highlighted HTML for SOQL preview overlay
    function highlightSoql(text) {
        try {
            const src = String(text || '');
            const out = [];
            let i = 0;
            while (i < src.length) {
                const ch = src[i];
                if (ch === "'") {
                    // Capture SOQL single-quoted string, with '' as escaped quote
                    let j = i + 1;
                    while (j < src.length) {
                        if (src[j] === "'" && src[j + 1] === "'") { j += 2; continue; }
                        if (src[j] === "'") { j++; break; }
                        j++;
                    }
                    const strLit = src.slice(i, j);
                    out.push(`<span class="str">${escapeHtml(strLit)}</span>`);
                    i = j;
                    continue;
                }
                // Accumulate non-string chunk until next quote or end
                let k = i;
                while (k < src.length && src[k] !== "'") k++;
                let chunk = src.slice(i, k);
                // Escape first
                chunk = escapeHtml(chunk);
                // Functions: COUNT, SUM, AVG, MIN, MAX before keywords
                chunk = chunk.replace(/\b(COUNT|SUM|AVG|MIN|MAX)\s*(?=\()/gi, '<span class="fn">$1</span>');
                // Multi-word keywords
                chunk = chunk.replace(/\bGROUP\s+BY\b/gi, '<span class="kw">GROUP BY</span>');
                chunk = chunk.replace(/\bORDER\s+BY\b/gi, '<span class="kw">ORDER BY</span>');
                chunk = chunk.replace(/\bNULLS\s+FIRST\b/gi, '<span class="kw">NULLS FIRST</span>');
                chunk = chunk.replace(/\bNULLS\s+LAST\b/gi, '<span class="kw">NULLS LAST</span>');
                // Single-word keywords
                chunk = chunk.replace(/\b(SELECT|FROM|WHERE|HAVING|LIMIT|OFFSET|ASC|DESC|AND|OR|NOT|IN|LIKE|INCLUDES|EXCLUDES)\b/gi, '<span class="kw">$1</span>');
                // Numbers
                chunk = chunk.replace(/\b\d+(?:\.\d+)?\b/g, '<span class="num">$&</span>');
                out.push(chunk);
                i = k;
            }
            return out.join('');
        } catch { return escapeHtml(String(text || '')); }
    }

    // Build a keyPrefix->sObject map using the global sObjects list
    async function ensurePrefixMap() {
        if (sobjectPrefixMap && Object.keys(sobjectPrefixMap).length) return sobjectPrefixMap;
        if (!sessionInfo || !sessionInfo.instanceUrl) return {};
        try {
            const base = sessionInfo.instanceUrl.replace(/\/+$/, '');
            const url = `${base}/services/data/v${API_VERSION}/sobjects`;
            const res = await fetch(url, { headers: { 'Authorization': `Bearer ${getAccessToken()}`, 'Accept': 'application/json' } });
            if (!res.ok) return {};
            const data = await res.json();
            const map = {};
            (Array.isArray(data?.sobjects) ? data.sobjects : []).forEach(o => {
                if (o.keyPrefix && o.name) map[o.keyPrefix] = o.name;
            });
            sobjectPrefixMap = map;
            return map;
        } catch { return {}; }
    }

    // Populate a <select> with options
    function populateSelect(sel, items, placeholder) {
        try {
            if (!sel) return;
            const arr = Array.isArray(items) ? items.slice() : [];
            const opts = [`<option value="">${escapeHtml(String(placeholder || 'Select'))}</option>`];
            const seen = new Set();
            arr.forEach(v => {
                const s = String(v || '').trim();
                if (!s || seen.has(s)) return;
                seen.add(s);
                opts.push(`<option value="${escapeHtml(s)}">${escapeHtml(s)}</option>`);
            });
            sel.innerHTML = opts.join('');
        } catch { /* ignore */ }
    }
})();
