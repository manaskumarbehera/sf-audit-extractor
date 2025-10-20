(function() {
    'use strict';
    const API_VERSION = '56.0';

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

    init();

    async function init() {
        setupTabs();
        attachLmsHandlers();
        attachPlatformHandlers();
        attachPinHandlers();
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
                lms: 'Lightning Message Service'
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
        }

        buttons.forEach(btn => {
            btn.addEventListener('click', () => showTab(btn.dataset.tab));
        });

        // Choose initial tab: prefer location hash if present
        const hash = (location.hash || '').toLowerCase();
        const initial = hash.includes('platform') ? 'platform' : (document.querySelector('.tab-button.active')?.dataset.tab || 'sf');
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
        // Simple UI-only handlers for LMS pane; real publish/subscribe requires content/background integration
        const lmsRefresh = document.getElementById('lms-refresh');
        const lmsPublish = document.getElementById('lms-test-publish');
        const lmsLog = document.getElementById('lms-log');

        if (lmsRefresh) {
            lmsRefresh.addEventListener('click', () => {
                if (lmsLog) lmsLog.innerHTML = '<div class="loading"><p>Refreshing LMS activity...</p></div>';
                setTimeout(() => {
                    if (lmsLog) lmsLog.innerHTML = '<div class="placeholder-note">No LMS activity detected (UI-only)</div>';
                }, 800);
            });
        }

        if (lmsPublish) {
            lmsPublish.addEventListener('click', async () => {
                if (lmsLog) lmsLog.innerHTML = '<div class="loading"><p>Publishing test message (UI-only)...</p></div>';
                setTimeout(() => {
                    if (lmsLog) lmsLog.innerHTML = '<div class="placeholder-note">Published test message (UI-only)</div>';
                }, 600);
            });
        }
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
        <div class="log-item">
          <div class="log-header">
            <div class="log-action">${escapeHtml(log.action)}</div>
            <span class="log-category ${categoryClass}">${log.category}</span>
          </div>
          <div class="log-details">
            <span class="log-detail-label">Section:</span>
            <span>${escapeHtml(log.section)}</span>
            <span class="log-detail-label">User:</span>
            <span>${escapeHtml(log.user)}</span>
            ${log.display ? `
              <span class="log-detail-label">Details:</span>
              <span>${escapeHtml(log.display)}</span>
            ` : ''}
            ${log.delegateUser ? `
              <span class="log-detail-label">Delegate:</span>
              <span>${escapeHtml(log.delegateUser)}</span>
            ` : ''}
          </div>
          <div class="log-date">${formattedDate}</div>
        </div>
      `;
        }).join('');

        logsContainer.innerHTML = logsHTML;
    }

    function handleSearch(e) {
        const term = String(e?.target?.value || '').trim().toLowerCase();
        applyFilters(term, categoryFilter ? categoryFilter.value : 'all');
    }

    function handleFilter(e) {
        const category = String(e?.target?.value || 'all');
        const term = searchInput ? String(searchInput.value || '').trim().toLowerCase() : '';
        applyFilters(term, category);
    }

    function applyFilters(searchTerm, category) {
        const tokens = String(searchTerm || '').split(/\s+/).filter(Boolean);

        filteredLogs = allLogs.filter(log => {
            const action = String(log.action || '').toLowerCase();
            const section = String(log.section || '').toLowerCase();
            const user = String(log.user || '').toLowerCase();
            const display = String(log.display || '').toLowerCase();

            if (category && category !== 'all' && String(log.category) !== String(category)) return false;

            if (tokens.length === 0) return true;

            const haystack = `${action} ${section} ${user} ${display}`;

            return tokens.every(t => haystack.includes(t));
        });

        renderLogs();
    }

    function handleExport() {
        if (allLogs.length === 0) return;
        const csv = convertToCSV(filteredLogs);
        downloadCSV(csv, 'salesforce-audit-trail.csv');
    }

    function convertToCSV(logs) {
        const headers = ['Date', 'Action', 'Section', 'Category', 'User', 'Details', 'Delegate User'];
        const rows = logs.map(log => {
            const date = new Date(log.date).toISOString();
            return [date, log.action, log.section, log.category, log.user, log.display, log.delegateUser];
        });

        const csvContent = [
            headers.join(','),
            ...rows.map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
        ].join('\n');

        return csvContent;
    }

    function downloadCSV(csvContent, filename) {
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        const url = URL.createObjectURL(blob);
        link.setAttribute('href', url);
        link.setAttribute('download', filename);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }

    function enableControls() {
        if (searchInput) searchInput.disabled = false;
        if (categoryFilter) categoryFilter.disabled = false;
        if (exportBtn) exportBtn.disabled = false;
    }

    function showError(message) {
        if (logsContainer) logsContainer.innerHTML = `<div class="error">${escapeHtml(message)}</div>`;
    }

    function showEmpty() {
        if (logsContainer) logsContainer.innerHTML = '<div class="empty-state"><p>No audit trail records found for the last 6 months</p></div>';
    }

    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
})();
