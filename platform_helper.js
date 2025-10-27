(function(){
  'use strict';

  const state = {
    apiVersion: '56.0',
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
  };

  let opts = {
    getSession: () => null,
    setSession: () => {},
    refreshSessionFromTab: async () => null,
    apiVersion: '56.0'
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
    await cometdHandshake();
    startConnectLoop();
  }

  async function cometdHandshake() {
    if (!ensureSession()) return;
    state.cometdState = 'handshaking';
    updateCometdStatus(false, 'Handshaking...');
    state.apiVersion = String(opts.apiVersion || state.apiVersion);
    state.cometdBaseUrl = getCometdBase();

    const token = getAccessToken();
    const body = [{
      channel: '/meta/handshake',
      version: '1.0',
      minimumVersion: '0.9',
      supportedConnectionTypes: ['long-polling'],
      advice: { timeout: 60000, interval: 0 }
    }];

    const res = await Utils.fetchWithTimeout(`${state.cometdBaseUrl}/handshake`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json;charset=UTF-8',
        'Accept': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify(body)
    });

    if (!res.ok) throw new Error(`Handshake failed: ${res.status} ${res.statusText}`);
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
    const res = await fetch(`${state.cometdBaseUrl}/connect`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json;charset=UTF-8',
        'Accept': 'application/json',
        'Authorization': `Bearer ${getAccessToken()}`
      },
      signal: state.connectAbortController.signal,
      body: JSON.stringify([{ channel: '/meta/connect', clientId: state.cometdClientId, connectionType: 'long-polling' }])
    });
    if (!res.ok) throw new Error(`Connect failed: ${res.status} ${res.statusText}`);
    return await res.json();
  }

  async function cometdSubscribe(channel) {
    if (!state.cometdClientId) await cometdEnsureConnected();
    const res = await Utils.fetchWithTimeout(`${state.cometdBaseUrl}/subscribe`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json;charset=UTF-8',
        'Accept': 'application/json',
        'Authorization': `Bearer ${getAccessToken()}`
      },
      body: JSON.stringify([{ channel: '/meta/subscribe', clientId: state.cometdClientId, subscription: channel }])
    });
    if (!res.ok) throw new Error(`Subscribe failed HTTP: ${res.status}`);
    const arr = await res.json();
    const m = Array.isArray(arr) ? arr[0] : null;
    if (!m || !m.successful) { appendPeLog(`Subscribe unsuccessful on ${channel}`, m); return false; }
    return true;
  }

  async function cometdUnsubscribe(channel) {
    if (!state.cometdClientId) return true;
    const res = await Utils.fetchWithTimeout(`${state.cometdBaseUrl}/unsubscribe`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json;charset=UTF-8',
        'Accept': 'application/json',
        'Authorization': `Bearer ${getAccessToken()}`
      },
      body: JSON.stringify([{ channel: '/meta/unsubscribe', clientId: state.cometdClientId, subscription: channel }])
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
  }

  async function loadPlatformEventsList(force = false) {
    if (!ensureSession()) return;
    if (state.platformEventsLoaded && !force) return;
    if (dom.peListEl) {
      dom.peListEl.innerHTML = '<div class="loading"><div class="loading-spinner"></div><p>Loading Platform Events...</p></div>';
    }
    try {
      const accessToken = getAccessToken();
      const base = opts.getSession()?.instanceUrl?.replace(/\/+$/, '') || '';
      const url = `${base}/services/data/v${state.apiVersion}/sobjects`;
      const res = await fetch(url, {
        method: 'GET',
        headers: { 'Authorization': `Bearer ${accessToken}`, 'Accept': 'application/json' }
      });
      if (!res.ok) throw new Error(`SObjects list failed: ${res.status} ${res.statusText}`);
      const data = await res.json();
      const sobjects = Array.isArray(data?.sobjects) ? data.sobjects : [];
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
      return `
        <div class="list-item${isSub ? ' subscribed' : ''}" data-event-api-name="${Utils.escapeHtml(api)}">
          <div class="item-actions leading">
            <button class="${btnClass}" aria-label="${btnLabel}" title="${btnLabel}">${icon}</button>
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
        const parentItem = target.closest('[data-event-api-name]');
        if (!parentItem) return;
        const apiName = parentItem.getAttribute('data-event-api-name');
        if (!apiName) return;
        const channel = `/event/${apiName}`;
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
    updateAutoScrollUI();
    updatePauseUI();

    // Lazy load hook
    try { document.addEventListener('platform-load', () => { loadPlatformEventsList(false); }); } catch {}
    // If tab is already active
    const activeTab = document.querySelector('.tab-button.active')?.getAttribute('data-tab');
    if (activeTab === 'platform') loadPlatformEventsList(false);
  }

  function init(options){
    opts = { ...opts, ...options };
    state.apiVersion = String(opts.apiVersion || state.apiVersion);
    dom = {
      peRefreshBtn: document.getElementById('pe-refresh'),
      peListEl: document.getElementById('platform-events-list'),
      peLogEl: document.getElementById('platform-event-log'),
      cometdStatusEl: document.getElementById('cometd-status'),
      peLogClearBtn: document.getElementById('pe-log-clear'),
      peLogPauseBtn: document.getElementById('pe-log-pause'),
      peLogAutoscrollBtn: document.getElementById('pe-log-autoscroll-btn'),
      peLogFilterSel: document.getElementById('pe-log-filter')
    };
    attachHandlers();
  }

  window.PlatformHelper = { init };
})();
