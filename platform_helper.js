(function(){
  'use strict';

  const state = {
    apiVersion: '66.0',
    platformEventsLoaded: false,
    peSubscriptions: new Set(),
    pePendingOps: new Set(),
    cometdClientId: null,
    cometdBaseUrl: null,
    cometdState: 'disconnected',
    cometdAdvice: { timeout: 110000, interval: 0 },
    connectAbortController: null,
    connectLoopActive: false,
    peLogPaused: false,
    peLogAutoScrollEnabled: true,
    // Publish modal state
    publishModalEventName: null,
    publishModalFields: [],
  };

  let opts = {
    getSession: () => null,
    setSession: () => {},
    refreshSessionFromTab: async () => null,
    apiVersion: '66.0'
  };

  let dom = {};

  function getAccessToken() {
    try { return Utils.getAccessToken(opts.getSession()); } catch { return null; }
  }

  function getCometdBase() {
    const base = opts.getSession()?.instanceUrl?.replace(/\/+$/, '') || '';
    return `${base}/cometd/${state.apiVersion}`;
  }

  function updateCometdStatus(connected, text) {
    if (!dom.cometdStatusEl) return;
    dom.cometdStatusEl.classList.toggle('connected', !!connected);
    const t = dom.cometdStatusEl.querySelector('.status-text');
    const msg = text || (connected ? 'Connected' : 'Disconnected');
    if (t) t.textContent = msg;
    dom.cometdStatusEl.setAttribute('title', msg);
  }

  function ensureSession() {
    const s = opts.getSession();
    if (!s || !s.isLoggedIn || !s.instanceUrl) {
      appendPeLog('Not connected to Salesforce. Open a Salesforce tab and log in.');
      return false;
    }
    return true;
  }

  function appendPeLog(message, data, typeOverride) {
    if (!dom.peLogEl) return;
    const ts = new Date();
    const type = typeOverride || classifyPeLogType(message, data);

    const placeholder = dom.peLogEl.querySelector('.placeholder, .placeholder-note');
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
      try { pre.textContent = JSON.stringify(data, null, 2); } catch { pre.textContent = String(data); }
      details.appendChild(summary);
      details.appendChild(pre);
      detailsWrap.appendChild(details);
      entry.appendChild(detailsWrap);
    }

    dom.peLogEl.appendChild(entry);
    applyPeLogFilter();
    if (state.peLogAutoScrollEnabled && !state.peLogPaused) {
      scrollLogToBottom();
    }
  }

  function classifyPeLogType(message, data) {
    const m = String(message || '').toLowerCase();
    if (m.includes('error') || m.includes('failed') || m.includes('unsuccessful')) return 'error';
    if (m.startsWith('event on ') || m.includes(' event on ')) return 'event';
    if (m.includes('unsubscribe')) return 'unsubscribe';
    if (m.includes('subscribe')) return 'subscribe';
    return 'system';
  }

  function applyPeLogFilter() {
    if (!dom.peLogEl) return;
    const filter = dom.peLogFilterSel ? dom.peLogFilterSel.value : 'all';
    const entries = dom.peLogEl.querySelectorAll('.log-entry');
    entries.forEach(el => {
      const type = el.getAttribute('data-type') || 'system';
      const visible = filter === 'all' || filter === type;
      el.style.display = visible ? '' : 'none';
    });
  }

  function clearPeLog() {
    if (!dom.peLogEl) return;
    dom.peLogEl.innerHTML = '<div class="placeholder-note">No messages yet</div>';
  }

  function scrollLogToBottom() {
    if (!dom.peLogEl) return;
    dom.peLogEl.scrollTop = dom.peLogEl.scrollHeight;
  }

  async function cometdEnsureConnected() {
    if (state.cometdState === 'connected' || state.cometdState === 'connecting') return;

    // Refresh session before handshake to ensure we have valid credentials
    try {
      await opts.refreshSessionFromTab();
      state.cometdBaseUrl = getCometdBase();
    } catch {}

    await cometdHandshake();
    startConnectLoop();
  }

  async function withAuthRetry(fn, label) {
    try {
      let res = await fn();
      // Handle 400/401/403 as potentially auth-related issues
      if (res && (res.status === 400 || res.status === 401 || res.status === 403)) {
        appendPeLog(`${label} failed (${res.status}). Refreshing session and retrying...`, { status: res.status });
        try { Utils.setInstanceUrlCache && Utils.setInstanceUrlCache(null); } catch {}
        try { await opts.refreshSessionFromTab(); } catch {}
        state.cometdBaseUrl = getCometdBase();
        res = await fn();
      }
      return res;
    } catch (e) {
      appendPeLog(`${label} error: ${String(e)}. Retrying...`);
      try { Utils.setInstanceUrlCache && Utils.setInstanceUrlCache(null); } catch {}
      try { await opts.refreshSessionFromTab(); } catch {}
      state.cometdBaseUrl = getCometdBase();
      return await fn();
    }
  }

  async function cometdHandshake() {
    if (!ensureSession()) return;
    state.cometdState = 'handshaking';
    updateCometdStatus(false, 'Handshaking...');
    const norm = Utils.normalizeApiVersion ? Utils.normalizeApiVersion(opts.apiVersion || state.apiVersion) : (opts.apiVersion || state.apiVersion);
    state.apiVersion = String(norm || '66.0');
    state.cometdBaseUrl = getCometdBase();

    const body = [{
      channel: '/meta/handshake',
      version: '1.0',
      minimumVersion: '0.9',
      supportedConnectionTypes: ['long-polling'],
      advice: { timeout: 60000, interval: 0 }
    }];

    appendPeLog(`Attempting handshake to ${state.cometdBaseUrl}...`);

    // Get token inside the retry function so it's refreshed on retry
    const res = await withAuthRetry(() => {
      const token = getAccessToken();
      if (!token) {
        throw new Error('No access token available. Please log in to Salesforce.');
      }
      return Utils.fetchWithTimeout(`${state.cometdBaseUrl}/handshake`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json;charset=UTF-8',
          'Accept': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(body)
      });
    }, 'Handshake');

    if (!res.ok) {
      // Try to get response body for better error info
      let errorDetail = '';
      let parsedMsg = '';
      try {
        const errorBody = await res.text();
        errorDetail = errorBody ? ` - ${errorBody.substring(0, 200)}` : '';
        try {
          const parsed = JSON.parse(errorBody);
          const first = Array.isArray(parsed) ? parsed[0] : null;
          if (first && typeof first.error === 'string') parsedMsg = first.error;
        } catch {}
      } catch {}
      state.cometdState = 'disconnected';
      updateCometdStatus(false, 'Handshake failed');
      const msg = parsedMsg || `${res.status} ${res.statusText}${errorDetail}`;
      appendPeLog(`Handshake failed: ${msg}`, null, 'error');
      throw new Error(`Handshake failed: ${msg}`);
    }
    const arr = await res.json();
    const m = Array.isArray(arr) ? arr[0] : null;
    if (!m || !m.successful) throw new Error(`Handshake unsuccessful: ${JSON.stringify(m || {})}`);
    state.cometdClientId = m.clientId;
    state.cometdAdvice = m.advice || state.cometdAdvice;
    state.cometdState = 'connected';
    updateCometdStatus(true, 'Connected');
    appendPeLog('Handshake successful');
  }

  function startConnectLoop() {
    if (state.connectLoopActive) return;
    state.connectLoopActive = true;
    (async function loop(){
      while (state.connectLoopActive && state.cometdState !== 'stopped' && state.cometdClientId) {
        try {
          state.cometdState = 'connecting';
          updateCometdStatus(true, 'Listening...');
          const msgs = await cometdConnectOnce();
          handleCometdMessages(msgs);
          const delay = Math.max(0, Number(state.cometdAdvice?.interval || 0));
          if (delay) await Utils.sleep(delay);
        } catch (e) {
          appendPeLog(`Connect error: ${String(e)}`);
          updateCometdStatus(false, 'Reconnecting...');
          await Utils.sleep(1000);
          if (!state.cometdClientId) {
            try { await cometdHandshake(); } catch {}
          }
        }
      }
    })();
  }

  async function cometdConnectOnce() {
    if (!state.cometdClientId) throw new Error('No clientId');
    state.connectAbortController = new AbortController();
    const res = await withAuthRetry(() => fetch(`${state.cometdBaseUrl}/connect`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json;charset=UTF-8',
        'Accept': 'application/json',
        'Authorization': `Bearer ${getAccessToken()}`
      },
      signal: state.connectAbortController.signal,
      body: JSON.stringify([{ channel: '/meta/connect', clientId: state.cometdClientId, connectionType: 'long-polling' }])
    }), 'Connect');
    if (!res.ok) throw new Error(`Connect failed: ${res.status} ${res.statusText}`);
    return await res.json();
  }

  async function cometdSubscribe(channel) {
    if (!state.cometdClientId) await cometdEnsureConnected();
    const res = await withAuthRetry(() => Utils.fetchWithTimeout(`${state.cometdBaseUrl}/subscribe`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json;charset=UTF-8',
        'Accept': 'application/json',
        'Authorization': `Bearer ${getAccessToken()}`
      },
      body: JSON.stringify([{ channel: '/meta/subscribe', clientId: state.cometdClientId, subscription: channel }])
    }), 'Subscribe');
    if (!res.ok) throw new Error(`Subscribe failed HTTP: ${res.status}`);
    const arr = await res.json();
    const m = Array.isArray(arr) ? arr[0] : null;
    if (!m || !m.successful) { appendPeLog(`Subscribe unsuccessful on ${channel}`, m); return false; }
    return true;
  }

  async function cometdUnsubscribe(channel) {
    if (!state.cometdClientId) return true;
    const res = await withAuthRetry(() => Utils.fetchWithTimeout(`${state.cometdBaseUrl}/unsubscribe`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json;charset=UTF-8',
        'Accept': 'application/json',
        'Authorization': `Bearer ${getAccessToken()}`
      },
      body: JSON.stringify([{ channel: '/meta/unsubscribe', clientId: state.cometdClientId, subscription: channel }])
    }), 'Unsubscribe');
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
          state.cometdAdvice = m.advice || state.cometdAdvice;
          if (m.successful === false) {
            if (m.advice && m.advice.reconnect === 'handshake') {
              state.cometdClientId = null;
              state.cometdState = 'disconnected';
              (async () => { try { await cometdHandshake(); } catch {} })();
            }
          }
        } else if (m.channel === '/meta/subscribe' || m.channel === '/meta/unsubscribe') {
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

  function setItemSubscribedState(itemEl, subscribed) {
    if (!itemEl) return;
    itemEl.classList.toggle('subscribed', subscribed);
    const btn = itemEl.querySelector('.pe-toggle');
    if (btn) {
      btn.classList.toggle('btn-primary', !subscribed);
      btn.classList.toggle('btn-secondary', subscribed);
      btn.setAttribute('aria-label', subscribed ? 'Unsubscribe' : 'Subscribe');
      btn.setAttribute('title', subscribed ? 'Unsubscribe' : 'Subscribe');
      btn.innerHTML = subscribed ? Utils.svgMinus() : Utils.svgPlus();
    }
    const triggerBtn = itemEl.querySelector('.pe-trigger-btn');
    if (triggerBtn) {
      triggerBtn.disabled = !subscribed;
      triggerBtn.setAttribute('aria-disabled', subscribed ? 'false' : 'true');
      triggerBtn.setAttribute('title', subscribed ? 'Publish Event' : 'Subscribe to enable publishing');
      triggerBtn.setAttribute('aria-label', subscribed ? 'Publish Event' : 'Subscribe to enable publishing');
    }
  }

  async function loadPlatformEventsList(force = false) {
    if (!ensureSession()) return;
    if (state.platformEventsLoaded && !force) return;
    if (dom.peListEl) {
      dom.peListEl.innerHTML = '<div class="loading"><div class="loading-spinner"></div><p>Loading Platform Events...</p></div>';
    }
    try {
      // Refresh session first to ensure we have valid credentials and instance URL
      try {
        await opts.refreshSessionFromTab();
      } catch {}

      // Use background describeGlobal (centralized session handling) with retries.
      let base = opts.getSession()?.instanceUrl?.replace(/\/+$/, '') || '';

      // If no instance URL from session, try to resolve it
      if (!base) {
        try {
          const resolved = await Utils.getInstanceUrl();
          if (resolved) base = String(resolved).replace(/\/+$/, '');
        } catch {}
      }

      if (!base) {
        throw new Error('Could not determine Salesforce instance URL. Please ensure you are logged in to Salesforce.');
      }

      appendPeLog(`Loading Platform Events from ${base}...`);

      let resp = null;
      let attempts = 0;
      const maxAttempts = 3;

      while (attempts < maxAttempts) {
        attempts++;
        // Ask background to describe global SObjects for the instance
        resp = await new Promise((resolve) => {
          try {
            chrome.runtime.sendMessage({ action: 'DESCRIBE_GLOBAL', instanceUrl: base, useTooling: false }, (r) => {
              if (chrome.runtime.lastError) return resolve({ success: false, error: chrome.runtime.lastError.message });
              resolve(r || { success: false, error: 'no-response' });
            });
          } catch (e) { resolve({ success: false, error: String(e) }); }
        });

        if (resp && resp.success) break;

        const errText = String(resp?.error || '').toLowerCase();
        appendPeLog(`Attempt ${attempts}/${maxAttempts} failed: ${resp?.error || 'unknown'}`, null, 'error');

        // If unauthorized, try refreshing session and retry
        if (errText.includes('401') || errText.includes('403') || errText.includes('unauthor')) {
          appendPeLog(`Refreshing session due to authorization error...`);
          try { Utils.setInstanceUrlCache && Utils.setInstanceUrlCache(null); } catch {}
          try { await opts.refreshSessionFromTab(); } catch {}
          const newBase = opts.getSession()?.instanceUrl?.replace(/\/+$/, '') || '';
          if (newBase) base = newBase;
          continue;
        }

        // If not found / 404, attempt to re-resolve instance URL from foreground or cookies and retry
        if (errText.includes('404') || errText.includes('not found')) {
          appendPeLog(`Got 404 for ${base}. Trying to re-resolve instance URL...`);
          try { Utils.setInstanceUrlCache && Utils.setInstanceUrlCache(null); } catch {}
          try { await opts.refreshSessionFromTab(); } catch {}
          const newBase = opts.getSession()?.instanceUrl?.replace(/\/+$/, '') || '';
          if (newBase && newBase !== base) {
            base = newBase;
            appendPeLog(`Resolved new instance URL: ${base}`);
            continue;
          }
          // Also try Utils.getInstanceUrl as fallback
          try {
            const resolved = await Utils.getInstanceUrl();
            if (resolved && resolved !== base) {
              base = String(resolved).replace(/\/+$/, '');
              appendPeLog(`Resolved instance URL via fallback: ${base}`);
              continue;
            }
          } catch {}
        }

        // For other errors, no point retrying multiple times
        break;
      }

      if (!resp || !resp.success) {
        throw new Error(`SObjects list failed: ${String(resp?.error || 'unknown')}`);
      }

      const sobjects = Array.isArray(resp.objects) ? resp.objects : [];
      const events = sobjects.filter(o => o?.name?.endsWith('__e') || typeof o?.eventType === 'string');
      renderPlatformEvents(events);
      state.platformEventsLoaded = true;
    } catch (e) {
      if (dom.peListEl) dom.peListEl.innerHTML = `<div class="error">${Utils.escapeHtml(String(e))}</div>`;
    }
  }

  function renderPlatformEvents(events) {
    if (!dom.peListEl) return;
    if (!events || events.length === 0) {
      dom.peListEl.innerHTML = '<div class="placeholder"><p>No Platform Events found</p></div>';
      return;
    }
    const html = events.map(ev => {
      const api = ev.name;
      const label = ev.label || api;
      const channel = `/event/${api}`;
      const isSub = state.peSubscriptions.has(channel);
      const btnClass = isSub ? 'btn btn-secondary btn-sm icon-btn pe-toggle' : 'btn btn-primary btn-sm icon-btn pe-toggle';
      const btnLabel = isSub ? 'Unsubscribe' : 'Subscribe';
      const icon = isSub ? Utils.svgMinus() : Utils.svgPlus();
      const publishTitle = isSub ? 'Publish Event' : 'Subscribe to enable publishing';
      const publishDisabledAttr = isSub ? '' : ' disabled aria-disabled="true"';
      return `
        <div class="list-item${isSub ? ' subscribed' : ''}" data-event-api-name="${Utils.escapeHtml(api)}">
          <div class="item-actions leading">
            <button class="${btnClass}" aria-label="${btnLabel}" title="${btnLabel}">${icon}</button>
            <button class="pe-trigger-btn" aria-label="${publishTitle}" title="${publishTitle}"${publishDisabledAttr}>
              <svg viewBox="0 0 24 24" width="12" height="12" aria-hidden="true"><path fill="currentColor" d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg>
            </button>
            <span class="listening-indicator" aria-label="Listening" title="Listening" role="img">
              <span class="bar"></span><span class="bar"></span><span class="bar"></span>
            </span>
          </div>
          <div class="item-main">
            <div class="item-title">${Utils.escapeHtml(label)} <span class="item-subtle">(${Utils.escapeHtml(api)})</span></div>
          </div>
        </div>`;
    }).join('');
    dom.peListEl.innerHTML = html;
  }

  async function handleSubscribe(channel, itemEl, toggleBtn) {
    if (!ensureSession()) return;
    try {
      if (toggleBtn) { toggleBtn.disabled = true; var originalIcon = toggleBtn.innerHTML; toggleBtn.innerHTML = '<span class="btn-icon">⏳</span>'; }
      await cometdEnsureConnected();
      const ok = await cometdSubscribe(channel);
      if (ok) { state.peSubscriptions.add(channel); setItemSubscribedState(itemEl, true); appendPeLog(`Subscribed to ${channel}`); }
      else { if (toggleBtn && typeof originalIcon === 'string') toggleBtn.innerHTML = originalIcon; appendPeLog(`Failed to subscribe ${channel}`); }
    } catch (e) {
      if (toggleBtn && typeof originalIcon === 'string') toggleBtn.innerHTML = originalIcon;
      appendPeLog(`Subscribe error: ${String(e)}`);
    } finally { if (toggleBtn) toggleBtn.disabled = false; }
  }

  async function handleUnsubscribe(channel, itemEl, toggleBtn) {
    try {
      if (toggleBtn) { toggleBtn.disabled = true; var originalIcon = toggleBtn.innerHTML; toggleBtn.innerHTML = '<span class="btn-icon">⏳</span>'; }
      const ok = await cometdUnsubscribe(channel);
      if (ok) { state.peSubscriptions.delete(channel); setItemSubscribedState(itemEl, false); appendPeLog(`Unsubscribed from ${channel}`); }
      else { if (toggleBtn && typeof originalIcon === 'string') toggleBtn.innerHTML = originalIcon; appendPeLog(`Failed to unsubscribe ${channel}`); }
    } catch (e) {
      if (toggleBtn && typeof originalIcon === 'string') toggleBtn.innerHTML = originalIcon;
      appendPeLog(`Unsubscribe error: ${String(e)}`);
    } finally { if (toggleBtn) toggleBtn.disabled = false; }
  }

  function updateAutoScrollUI() {
    if (!dom.peLogAutoscrollBtn) return;
    dom.peLogAutoscrollBtn.setAttribute('aria-pressed', state.peLogAutoScrollEnabled ? 'true' : 'false');
    dom.peLogAutoscrollBtn.title = state.peLogAutoScrollEnabled ? 'Auto-scroll: on' : 'Auto-scroll: off';
    dom.peLogAutoscrollBtn.classList.toggle('active', state.peLogAutoScrollEnabled);
  }

  function updatePauseUI() {
    if (!dom.peLogPauseBtn) return;
    dom.peLogPauseBtn.setAttribute('aria-pressed', state.peLogPaused ? 'true' : 'false');
    dom.peLogPauseBtn.classList.toggle('active', state.peLogPaused);
    if (state.peLogPaused) {
      dom.peLogPauseBtn.title = 'Resume logging';
      dom.peLogPauseBtn.setAttribute('aria-label', 'Resume logging');
      dom.peLogPauseBtn.innerHTML = '<span aria-hidden="true">▶</span>';
    } else {
      dom.peLogPauseBtn.title = 'Pause logging';
      dom.peLogPauseBtn.setAttribute('aria-label', 'Pause logging');
      dom.peLogPauseBtn.innerHTML = '<span aria-hidden="true">⏸</span>';
    }
  }

  // =====================================================
  // Platform Event Publish Modal Functions
  // =====================================================

  function openPublishModal(eventApiName) {
    if (!dom.publishModal) return;
    state.publishModalEventName = eventApiName;
    state.publishModalFields = [];

    // Set event name display
    if (dom.publishModalEventName) {
      dom.publishModalEventName.textContent = eventApiName;
    }

    // Clear previous state
    if (dom.publishModalPayload) {
      dom.publishModalPayload.value = '{\n  \n}';
      dom.publishModalPayload.classList.remove('error');
    }
    if (dom.publishModalError) {
      dom.publishModalError.hidden = true;
      dom.publishModalError.textContent = '';
    }
    if (dom.publishModalFieldsList) {
      dom.publishModalFieldsList.innerHTML = '<span class="placeholder-note">Loading fields...</span>';
    }

    // Show modal
    dom.publishModal.hidden = false;

    // Focus textarea
    setTimeout(() => {
      if (dom.publishModalPayload) dom.publishModalPayload.focus();
    }, 100);

    // Fetch event fields (describe)
    fetchEventFields(eventApiName);
  }

  function closePublishModal() {
    if (!dom.publishModal) return;
    dom.publishModal.hidden = true;
    state.publishModalEventName = null;
    state.publishModalFields = [];
  }

  async function fetchEventFields(eventApiName) {
    if (!dom.publishModalFieldsList) return;

    try {
      const base = opts.getSession()?.instanceUrl?.replace(/\/+$/, '') || '';
      if (!base) {
        dom.publishModalFieldsList.innerHTML = '<span class="placeholder-note">Not connected</span>';
        return;
      }

      // Use background to describe the Platform Event sObject
      const resp = await new Promise((resolve) => {
        try {
          chrome.runtime.sendMessage({ action: 'DESCRIBE_SOBJECT', instanceUrl: base, name: eventApiName, useTooling: false }, (r) => {
            if (chrome.runtime.lastError) return resolve({ success: false, error: chrome.runtime.lastError.message });
            resolve(r || { success: false, error: 'no-response' });
          });
        } catch (e) { resolve({ success: false, error: String(e) }); }
      });

      if (!resp || !resp.success || !resp.describe) {
        dom.publishModalFieldsList.innerHTML = `<span class="placeholder-note">Could not load fields: ${Utils.escapeHtml(resp?.error || 'Unknown error')}</span>`;
        return;
      }

      const describe = resp.describe;
      const fields = Array.isArray(describe.fields) ? describe.fields : [];

      // Filter to only createable/writable custom fields (exclude system fields like ReplayId, CreatedById, etc.)
      const writableFields = fields.filter(f => {
        const name = f.name || '';
        // Exclude standard system fields
        const systemFields = ['Id', 'ReplayId', 'CreatedById', 'CreatedDate', 'EventUuid'];
        if (systemFields.includes(name)) return false;
        // Include custom fields (__c) or fields that look writable
        return name.endsWith('__c') || (f.nillable !== false && !name.startsWith('System'));
      });

      state.publishModalFields = writableFields;

      if (writableFields.length === 0) {
        dom.publishModalFieldsList.innerHTML = '<span class="placeholder-note">No writable fields found</span>';
        // Generate empty template
        generatePayloadTemplate([]);
        return;
      }

      // Render field chips
      const chipsHtml = writableFields.map(f => {
        const required = f.nillable === false;
        const typeLabel = f.type || 'text';
        return `<span class="field-chip${required ? ' required' : ''}" data-field-name="${Utils.escapeHtml(f.name)}" data-field-type="${Utils.escapeHtml(typeLabel)}" title="${required ? 'Required - ' : ''}${Utils.escapeHtml(f.label || f.name)} (${typeLabel})">${Utils.escapeHtml(f.name)}<span class="field-type">${Utils.escapeHtml(typeLabel)}</span></span>`;
      }).join('');

      dom.publishModalFieldsList.innerHTML = chipsHtml;

      // Generate payload template
      generatePayloadTemplate(writableFields);

    } catch (e) {
      dom.publishModalFieldsList.innerHTML = `<span class="placeholder-note">Error: ${Utils.escapeHtml(String(e))}</span>`;
    }
  }

  function generatePayloadTemplate(fields) {
    if (!dom.publishModalPayload) return;

    if (!fields || fields.length === 0) {
      dom.publishModalPayload.value = '{\n  \n}';
      return;
    }

    // Build a template JSON with placeholder values based on field types
    const template = {};
    for (const f of fields) {
      const name = f.name;
      const type = (f.type || 'string').toLowerCase();

      // Generate appropriate placeholder value
      let placeholder;
      switch (type) {
        case 'boolean':
          placeholder = false;
          break;
        case 'int':
        case 'integer':
        case 'double':
        case 'currency':
        case 'percent':
          placeholder = 0;
          break;
        case 'date':
          placeholder = new Date().toISOString().split('T')[0];
          break;
        case 'datetime':
          placeholder = new Date().toISOString();
          break;
        case 'reference':
        case 'id':
          placeholder = '';
          break;
        default:
          placeholder = '';
      }
      template[name] = placeholder;
    }

    dom.publishModalPayload.value = JSON.stringify(template, null, 2);
  }

  function insertFieldIntoPayload(fieldName) {
    if (!dom.publishModalPayload) return;

    const textarea = dom.publishModalPayload;
    const currentText = textarea.value;

    // Try to parse current JSON
    try {
      const obj = JSON.parse(currentText);
      if (!(fieldName in obj)) {
        obj[fieldName] = '';
      }
      textarea.value = JSON.stringify(obj, null, 2);
    } catch {
      // If invalid JSON, just insert at cursor
      const start = textarea.selectionStart;
      const before = currentText.substring(0, start);
      const after = currentText.substring(textarea.selectionEnd);
      const insert = `"${fieldName}": ""`;
      textarea.value = before + insert + after;
      textarea.selectionStart = textarea.selectionEnd = start + insert.length - 1;
    }
    textarea.focus();
  }

  function formatPayloadJson() {
    if (!dom.publishModalPayload) return;

    const textarea = dom.publishModalPayload;
    try {
      const obj = JSON.parse(textarea.value);
      textarea.value = JSON.stringify(obj, null, 2);
      textarea.classList.remove('error');
      if (dom.publishModalError) {
        dom.publishModalError.hidden = true;
      }
    } catch (e) {
      textarea.classList.add('error');
      if (dom.publishModalError) {
        dom.publishModalError.textContent = `Invalid JSON: ${e.message}`;
        dom.publishModalError.hidden = false;
      }
    }
  }

  function validatePayloadJson() {
    if (!dom.publishModalPayload) return null;

    const text = dom.publishModalPayload.value.trim();
    if (!text) {
      showPayloadError('Payload cannot be empty');
      return null;
    }

    try {
      const obj = JSON.parse(text);
      if (typeof obj !== 'object' || obj === null || Array.isArray(obj)) {
        showPayloadError('Payload must be a JSON object');
        return null;
      }
      dom.publishModalPayload.classList.remove('error');
      if (dom.publishModalError) dom.publishModalError.hidden = true;
      return obj;
    } catch (e) {
      showPayloadError(`Invalid JSON: ${e.message}`);
      return null;
    }
  }

  function showPayloadError(message) {
    if (dom.publishModalPayload) dom.publishModalPayload.classList.add('error');
    if (dom.publishModalError) {
      dom.publishModalError.textContent = message;
      dom.publishModalError.hidden = false;
    }
  }

  async function submitPublishEvent() {
    if (!ensureSession()) return;

    const eventApiName = state.publishModalEventName;
    if (!eventApiName) {
      showPayloadError('No event selected');
      return;
    }

    const payload = validatePayloadJson();
    if (!payload) return;

    const submitBtn = dom.publishModalSubmit;
    const btnText = submitBtn?.querySelector('.btn-text');
    const btnLoading = submitBtn?.querySelector('.btn-loading');

    try {
      // Show loading state
      if (submitBtn) submitBtn.disabled = true;
      if (btnText) btnText.hidden = true;
      if (btnLoading) btnLoading.hidden = false;

      const base = opts.getSession()?.instanceUrl?.replace(/\/+$/, '') || '';

      // Call background to publish the event
      const resp = await new Promise((resolve) => {
        try {
          chrome.runtime.sendMessage({
            action: 'PUBLISH_PLATFORM_EVENT',
            instanceUrl: base,
            eventApiName: eventApiName,
            payload: payload
          }, (r) => {
            if (chrome.runtime.lastError) return resolve({ success: false, error: chrome.runtime.lastError.message });
            resolve(r || { success: false, error: 'no-response' });
          });
        } catch (e) { resolve({ success: false, error: String(e) }); }
      });

      if (!resp || !resp.success) {
        const errorMsg = resp?.error || 'Failed to publish event';
        showPayloadError(errorMsg);
        appendPeLog(`Publish failed for ${eventApiName}: ${errorMsg}`, resp?.details, 'error');
        return;
      }

      // Success!
      appendPeLog(`✓ Published ${eventApiName}`, { payload, response: resp.response }, 'event');
      Utils.showToast && Utils.showToast('Event published successfully!', 'success');
      closePublishModal();

    } catch (e) {
      showPayloadError(`Error: ${String(e)}`);
      appendPeLog(`Publish error: ${String(e)}`, null, 'error');
    } finally {
      // Restore button state
      if (submitBtn) submitBtn.disabled = false;
      if (btnText) btnText.hidden = false;
      if (btnLoading) btnLoading.hidden = true;
    }
  }

  function attachHandlers(){
    if (dom.peRefreshBtn) {
      dom.peRefreshBtn.addEventListener('click', async () => {
        if (dom.peRefreshBtn.disabled) return;
        const originalHtml = dom.peRefreshBtn.innerHTML;
        dom.peRefreshBtn.disabled = true;
        dom.peRefreshBtn.innerHTML = '<span class="btn-icon">⏳</span>';
        try { await loadPlatformEventsList(true); } finally { dom.peRefreshBtn.innerHTML = originalHtml; dom.peRefreshBtn.disabled = false; }
      });
    }
    if (dom.peListEl) {
      dom.peListEl.addEventListener('click', async (e) => {
        const target = e.target;
        if (!(target instanceof Element)) return;
        const toggleBtn = target.closest('.pe-toggle');
        const triggerBtn = target.closest('.pe-trigger-btn');
        const parentItem = target.closest('[data-event-api-name]');
        if (!parentItem) return;
        const apiName = parentItem.getAttribute('data-event-api-name');
        if (!apiName) return;
        const channel = `/event/${apiName}`;

        // Handle trigger/publish button click
        if (triggerBtn) {
          if (!state.peSubscriptions.has(channel)) {
            appendPeLog(`Subscribe to ${channel} before publishing`);
            try { Utils.showToast && Utils.showToast('Subscribe to the event before publishing', 'warning'); } catch {}
            return;
          }
          openPublishModal(apiName);
          return;
        }

        if (toggleBtn) {
          if (state.pePendingOps.has(channel)) { appendPeLog(`Action already in progress for ${channel}`); return; }
          state.pePendingOps.add(channel);
          try {
            if (state.peSubscriptions.has(channel)) { await handleUnsubscribe(channel, parentItem, toggleBtn); }
            else { await handleSubscribe(channel, parentItem, toggleBtn); }
          } finally { state.pePendingOps.delete(channel); }
        }
      });
    }
    if (dom.peLogClearBtn) dom.peLogClearBtn.addEventListener('click', clearPeLog);
    if (dom.peLogPauseBtn) dom.peLogPauseBtn.addEventListener('click', () => { state.peLogPaused = !state.peLogPaused; dom.peLogEl?.classList.toggle('paused', state.peLogPaused); updatePauseUI(); });
    if (dom.peLogAutoscrollBtn) dom.peLogAutoscrollBtn.addEventListener('click', () => { state.peLogAutoScrollEnabled = !state.peLogAutoScrollEnabled; updateAutoScrollUI(); });
    if (dom.peLogFilterSel) dom.peLogFilterSel.addEventListener('change', applyPeLogFilter);
    if (dom.peLogEl) dom.peLogEl.addEventListener('click', async (e) => {
      const t = e.target; if (!(t instanceof Element)) return;
      if (t.classList.contains('copy-btn')) {
        const entry = t.closest('.log-entry');
        const pre = entry?.querySelector('.log-json');
        const text = pre ? pre.textContent || '' : entry?.querySelector('.log-message')?.textContent || '';
        try { await navigator.clipboard.writeText(text); const old = t.textContent; t.textContent = 'Copied'; setTimeout(() => { t.textContent = old || 'Copy'; }, 800); } catch {}
      }
    });

    // Publish modal handlers
    if (dom.publishModalClose) {
      dom.publishModalClose.addEventListener('click', closePublishModal);
    }
    if (dom.publishModalCancel) {
      dom.publishModalCancel.addEventListener('click', closePublishModal);
    }
    if (dom.publishModalSubmit) {
      dom.publishModalSubmit.addEventListener('click', submitPublishEvent);
    }
    if (dom.publishModalFormatBtn) {
      dom.publishModalFormatBtn.addEventListener('click', formatPayloadJson);
    }
    if (dom.publishModalFieldsList) {
      dom.publishModalFieldsList.addEventListener('click', (e) => {
        const target = e.target;
        if (!(target instanceof Element)) return;
        const chip = target.closest('.field-chip');
        if (chip) {
          const fieldName = chip.getAttribute('data-field-name');
          if (fieldName) insertFieldIntoPayload(fieldName);
        }
      });
    }
    // Close modal on Escape key
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && dom.publishModal && !dom.publishModal.hidden) {
        closePublishModal();
      }
    });
    // Close modal on overlay click
    if (dom.publishModal) {
      dom.publishModal.addEventListener('click', (e) => {
        if (e.target === dom.publishModal) {
          closePublishModal();
        }
      });
    }

    updateAutoScrollUI();
    updatePauseUI();

    try { document.addEventListener('platform-load', () => { loadPlatformEventsList(false); }); } catch {}
    const activeTab = document.querySelector('.tab-button.active')?.getAttribute('data-tab');
    if (activeTab === 'platform') loadPlatformEventsList(false);
  }

  function init(options){
    opts = { ...opts, ...options };
    const norm = Utils.normalizeApiVersion ? Utils.normalizeApiVersion(opts.apiVersion || state.apiVersion) : (opts.apiVersion || state.apiVersion);
    state.apiVersion = String(norm || '66.0');
    dom = {
      peRefreshBtn: document.getElementById('pe-refresh'),
      peListEl: document.getElementById('platform-events-list'),
      peLogEl: document.getElementById('platform-event-log'),
      cometdStatusEl: document.getElementById('cometd-status'),
      peLogClearBtn: document.getElementById('pe-log-clear'),
      peLogPauseBtn: document.getElementById('pe-log-pause'),
      peLogAutoscrollBtn: document.getElementById('pe-log-autoscroll-btn'),
      peLogFilterSel: document.getElementById('pe-log-filter'),
      // Publish modal elements
      publishModal: document.getElementById('pe-publish-modal'),
      publishModalClose: document.getElementById('pe-modal-close'),
      publishModalEventName: document.getElementById('pe-modal-event-name'),
      publishModalPayload: document.getElementById('pe-payload-textarea'),
      publishModalFormatBtn: document.getElementById('pe-payload-format'),
      publishModalError: document.getElementById('pe-payload-error'),
      publishModalFieldsList: document.getElementById('pe-modal-fields-list'),
      publishModalCancel: document.getElementById('pe-modal-cancel'),
      publishModalSubmit: document.getElementById('pe-modal-publish')
    };
    attachHandlers();
  }

  function updateApiVersion(v){
    const norm = Utils.normalizeApiVersion ? Utils.normalizeApiVersion(v) : v;
    if (norm) state.apiVersion = String(norm);
  }

  window.PlatformHelper = window.PlatformHelper || {};
  window.PlatformHelper.init = function(options) {
      try {
          init(options);
          state.cometdBaseUrl = getCometdBase();
      } catch (e) {
          try { console.error('PlatformHelper.init error:', e); } catch {}
      }
  };
  window.PlatformHelper.updateApiVersion = function(v) {
    try {
        updateApiVersion(v);
        state.cometdBaseUrl = getCometdBase();
    } catch {}
  };
  // test hooks
  try {
    window.__PlatformTestHooks = {
      cometdHandshake,
      setOpts: (o) => { opts = Object.assign(opts, o || {}); },
      setState: (patch) => { Object.assign(state, patch || {}); },
      setDomForTests: (d) => { dom = d || {}; },
      getState: () => state,
    };
  } catch {}

})();
