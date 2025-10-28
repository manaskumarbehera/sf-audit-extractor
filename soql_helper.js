(function(){
  'use strict';

  // Prevent double-loading this helper in the same document
  if (window.__SoqlHelperLoaded) {
    try { console.warn('[SOQL] soql_helper.js already loaded; skipping second initialization'); } catch {}
    return;
  }
  window.__SoqlHelperLoaded = true;

  let attached = false;
  const cleanup = [];
  let guidanceCleanup = null;

  let lifecycleEpoch = 0;
  let reloadSeq = 0;
  let runSeq = 0;

  const DESCRIBE_TTL_MS = 5 * 60 * 1000;

  // Use a window-backed shared state to avoid redeclaration errors if the script is injected more than once
  function getSharedState() {
    const w = window;
    if (!w.__SOQL_HELPER_STATE__) {
      w.__SOQL_HELPER_STATE__ = {
        describeCache: {
          rest: { names: null, ts: 0 },
          tooling: { names: null, ts: 0 }
        },
        describeInFlight: { rest: null, tooling: null }
      };
    }
    return w.__SOQL_HELPER_STATE__;
  }

  const nowTs = () => Date.now ? Date.now() : new Date().getTime();

  function on(el, evt, fn, opts) {
    if (!el) return;
    el.addEventListener(evt, fn, opts);
    cleanup.push(() => { try { el.removeEventListener(evt, fn, opts); } catch {} });
  }

  function getObjectSelectorPref() {
    return new Promise((resolve) => {
      try {
        chrome.storage?.local?.get?.({ soqlShowObjectSelector: true }, (r) => {
          if (chrome.runtime && chrome.runtime.lastError) { resolve(true); return; }
          resolve(!!(r && r.soqlShowObjectSelector));
        });
      } catch { resolve(true); }
    });
  }

  function applyObjectSelectorVisibility() {
    try {
      const group = document.getElementById('soql-object-group');
      if (!group) return;
        getObjectSelectorPref().then((show) => {
        const shouldShow = !!show; // visible regardless of Tooling state
        group.style.display = shouldShow ? 'inline-flex' : 'none';
        try {
          const sel = group.querySelector('#soql-object');
          if (sel) sel.disabled = !shouldShow;
        } catch {}
      });
    } catch {}
  }

  // Shared helper: normalize and extract queryable object names in sorted order
  function describeObjectsToNames(objs) {
    const arr = Array.isArray(objs) ? objs : [];
    return arr
      .filter((o) => {
        if (!o) return false;
        const val = o.queryable;
        if (typeof val === 'boolean') return val === true;
        if (typeof val === 'string') return val.toLowerCase() === 'true';
        return false; // strict: missing flag => not included
      })
      .map((o) => o?.name || o?.label || '')
      .filter(Boolean)
      .sort((a, b) => a.localeCompare(b));
  }

  function quoteIdentifier(name) {
    const n = String(name || '');
    if (!n) return n;
    if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(n)) return n;
    if ((n.startsWith('`') && n.endsWith('`')) || (n.startsWith('"') && n.endsWith('"'))) return n;
    return '`' + n.replace(/`/g, '\\`') + '`';
  }

  function buildErrorDetailsHTML(errText, meta) {
    try {
      const E = (s) => (typeof Utils?.escapeHtml === 'function' ? Utils.escapeHtml(String(s)) : String(s));
      const msg = String(errText || '');
      const lower = msg.toLowerCase();
      let status = null;
      const m = msg.match(/\((\d{3})\)/);
      if (m) status = m[1];

      const hints = [];
      if (/401|403/.test(msg)) hints.push('Authentication required. Log in to Salesforce in a browser tab, then retry.');
      if (/instance url not detected/.test(lower)) hints.push('Open a Salesforce tab first so the extension can detect your instance.');
      if (/session not found/.test(lower)) hints.push('Your session expired. Refresh your Salesforce tab to obtain a new session.');
      if (/network|failed to fetch|timeout|ecconnreset/i.test(lower)) hints.push('Network issue. Check VPN/Proxy and try again.');
      if (!hints.length) hints.push('Check the query syntax and permissions for the selected API.');

      const api = meta?.useTooling ? 'Tooling Query API' : 'REST Query API';
      const limit = Number.isFinite(meta?.limit) ? meta.limit : (meta?.limit || null);
      const retried = !!meta?.retried;
      const inst = meta?.instanceUrl ? String(meta.instanceUrl) : null;
      const queryPreview = (meta?.query ? String(meta.query) : '').slice(0, 140);

      const rows = [];
      if (status) rows.push(`<div><strong>Status</strong>: ${E(status)}</div>`);
      rows.push(`<div><strong>API</strong>: ${E(api)}</div>`);
      if (limit != null) rows.push(`<div><strong>Limit</strong>: ${E(limit)}</div>`);
      if (inst) rows.push(`<div><strong>Instance</strong>: ${E(inst)}</div>`);
      if (retried) rows.push(`<div><strong>Retried after 401/403</strong>: yes</div>`);
      if (queryPreview) rows.push(`<div><strong>Query</strong>: <code>${E(queryPreview)}${meta.query && meta.query.length > 140 ? '…' : ''}</code></div>`);

      return (
        `<div class=\"log-details\">` +
          `<details>` +
            `<summary>Details & tips</summary>` +
            `<div class=\"log-grid\">` + rows.join('') + `</div>` +
            `<div class=\"log-hints\"><ul>` + hints.map(h => `<li>${E(h)}</li>`).join('') + `</ul></div>` +
          `</details>` +
        `</div>`
      );
    } catch { return ''; }
  }

  function fetchDescribe(tooling) {
    // Returns { names: string[], error: string|null }
    return new Promise((resolve) => {
      function done(names, error) { resolve({ names: Array.isArray(names) ? names : [], error: error ? String(error) : null }); }
      try {
        Utils.getInstanceUrl().then((instanceUrl) => {
          const payload = { action: 'DESCRIBE_GLOBAL', useTooling: !!tooling };
          if (instanceUrl) payload.instanceUrl = instanceUrl;
          chrome.runtime.sendMessage(payload, async (resp) => {
            const lastErr = (chrome.runtime && chrome.runtime.lastError) ? chrome.runtime.lastError.message : null;
            if (lastErr) { done([], lastErr); return; }
            if (!resp || !resp.success) {
              done([], resp?.error || 'Describe failed');
              return;
            }
            // Optional: validate returned source if provided
            try {
              const src = (typeof resp.source === 'string') ? resp.source.toLowerCase() : null;
              if (src && ((tooling && src !== 'tooling') || (!tooling && src !== 'rest'))) {
                done([], `Mismatched describe source: expected ${tooling ? 'tooling' : 'rest'}, got ${resp.source}`);
                return;
              }
            } catch {}
            done(describeObjectsToNames(resp.objects), null);
          });
        });
      } catch (e) { try { console.error('Describe Global failed', e); } catch {} done([], e); }
    });
  }

  function getDescribeCached(tooling) {
    const STATE = getSharedState();
    const key = tooling ? 'tooling' : 'rest';
    const cache = STATE.describeCache[key];
    const fresh = cache.names && (nowTs() - cache.ts < DESCRIBE_TTL_MS);
    if (fresh) {
      return Promise.resolve({ names: cache.names.slice(), error: null, fromCache: true });
    }
    if (STATE.describeInFlight[key]) {
      return STATE.describeInFlight[key];
    }
    const p = fetchDescribe(!!tooling).then((res) => {
      if (Array.isArray(res.names) && res.names.length > 0 && !res.error) {
        STATE.describeCache[key] = { names: res.names.slice(), ts: nowTs() };
      }
      STATE.describeInFlight[key] = null;
      return { names: res.names || [], error: res.error || null, fromCache: false };
    }).catch((e) => {
      STATE.describeInFlight[key] = null;
      return { names: [], error: String(e || 'Describe failed'), fromCache: false };
    });
    STATE.describeInFlight[key] = p;
    return p;
  }

  function setModeLabel(tooling) {
    try {
      const mode = document.getElementById('soql-api-mode');
      if (!mode) return;
      mode.textContent = tooling ? 'Using Tooling' : 'Using SObject';
    } catch {}
  }

  function setObjectLoading(on) {
    try {
      const sp = document.getElementById('soql-object-loading');
      if (!sp) return;
      if (on) { sp.hidden = false; sp.setAttribute('aria-hidden', 'false'); }
      else { sp.hidden = true; sp.setAttribute('aria-hidden', 'true'); }
    } catch {}
  }

  function reloadObjects(tooling) {
    const sel = document.getElementById('soql-object');
    if (!sel) return;

    setModeLabel(!!tooling);
    setObjectLoading(true);

    const epoch = lifecycleEpoch;
    const seq = ++reloadSeq;

    const prevVal = sel.value || '';

    function resetSelect() {
      sel.innerHTML = '';
      const def = document.createElement('option');
      def.value = '';
      def.textContent = tooling ? 'Select a Tooling object' : 'Select an SObject';
      sel.appendChild(def);
    }

    function renderSimple(names) {
      if (epoch !== lifecycleEpoch || seq !== reloadSeq || !sel.isConnected) return; // stale
      resetSelect();
      const frag = document.createDocumentFragment();
      (Array.isArray(names) ? names : []).forEach((name) => {
        const opt = document.createElement('option');
        opt.value = name; opt.textContent = name; frag.appendChild(opt);
      });
      try { sel.appendChild(frag); } catch {}
      if (prevVal) { try { sel.value = prevVal; } catch {} }
      setObjectLoading(false);
    }

    resetSelect();

    const wantTooling = !!tooling;

    if (wantTooling) {
      getDescribeCached(true).then((res) => {
        if (epoch !== lifecycleEpoch || seq !== reloadSeq || !sel.isConnected) return;
        const names = Array.isArray(res?.names) ? res.names : [];
        if (names.length === 0) {
          const opt = document.createElement('option');
          opt.value = '';
          opt.textContent = 'No objects loaded';
          opt.disabled = true;
          try { sel.appendChild(opt); } catch {}
          setObjectLoading(false);
          if (res && typeof res.error === 'string' && res.error) {
            try {
              const results = document.getElementById('soql-results');
              if (results && results.isConnected) {
                const msgSafe = (typeof Utils?.escapeHtml === 'function') ? Utils.escapeHtml(res.error) : String(res.error);
                const details = buildErrorDetailsHTML(res.error, { action: 'DESCRIBE_GLOBAL', useTooling: true });
                results.innerHTML = `<div class=\"log-entry\"><div class=\"log-header\"><div class=\"log-left\"><span class=\"log-badge error\">error</span><span class=\"log-message\">Failed to load objects: ${msgSafe}</span></div></div>${details}</div>`;
              }
            } catch {}
          }
          return;
        }
        renderSimple(names);
      });
      return;
    }

    getDescribeCached(false).then((restRes) => {
      if (epoch !== lifecycleEpoch || seq !== reloadSeq || !sel.isConnected) return;
      const restNames = Array.isArray(restRes?.names) ? restRes.names : [];
      if (restNames.length === 0) {
        const opt = document.createElement('option');
        opt.value = '';
        opt.textContent = 'No objects loaded';
        opt.disabled = true;
        try { sel.appendChild(opt); } catch {}
        setObjectLoading(false);
        if (restRes && typeof restRes.error === 'string' && restRes.error) {
          try {
            const results = document.getElementById('soql-results');
            if (results && results.isConnected) {
              const msgSafe = (typeof Utils?.escapeHtml === 'function') ? Utils.escapeHtml(restRes.error) : String(restRes.error);
              const details = buildErrorDetailsHTML(restRes.error, { action: 'DESCRIBE_GLOBAL', useTooling: false });
              results.innerHTML = `<div class=\"log-entry\"><div class=\"log-header\"><div class=\"log-left\"><span class=\"log-badge error\">error</span><span class=\"log-message\">Failed to load objects: ${msgSafe}</span></div></div>${details}</div>`;
            }
          } catch {}
        }
        return;
      }
      renderSimple(restNames);
    });
  }

  function wireUiOnly() {
    const runBtn = document.getElementById('soql-run');
    const clearBtn = document.getElementById('soql-clear');
    const queryEl = document.getElementById('soql-query');
    const results = document.getElementById('soql-results');
    const objSel = document.getElementById('soql-object');
    const toolingCb = document.getElementById('soql-tooling');
    const limitEl = document.getElementById('soql-limit');

    function getLimitValue() {
      const v = Number((limitEl && limitEl.value) ? limitEl.value : 200);
      if (!Number.isFinite(v)) return 200;
      return Math.min(5000, Math.max(1, Math.floor(v)));
    }

    function renderPlaceholder() {
      if (!results) return;
      results.innerHTML = `
        <div class=\"placeholder\">\n          <p>SOQL Query Builder</p>\n          <p class=\"placeholder-note\">Type a query and click Run.</p>\n        </div>
      `;
    }
    function clearUi() {
      if (queryEl) queryEl.value = '';
      renderPlaceholder();
    }

    if (toolingCb) {
      on(toolingCb, 'change', () => {
        const STATE = getSharedState();
        STATE.describeCache.rest = { names: null, ts: 0 };
        STATE.describeCache.tooling = { names: null, ts: 0 };
        STATE.describeInFlight.rest = null;
        STATE.describeInFlight.tooling = null;
        setModeLabel(!!toolingCb.checked);
        setObjectLoading(true);
        clearUi();
        applyObjectSelectorVisibility();
        reloadObjects(!!toolingCb.checked);
      });
    }

    // Update LIMIT in the auto-generated template when the limit control changes
    if (limitEl && queryEl) {
      on(limitEl, 'change', () => {
        const lim = getLimitValue();
        const val = (queryEl.value || '').trim();
        // If the query looks like our template, only update the LIMIT number
        const m = val.match(/^select\s+id\s+from\s+(.+?)\s+limit\s+\d+\s*$/i);
        if (m && m[1]) {
          queryEl.value = `SELECT Id FROM ${m[1]} LIMIT ${lim}`;
        }
      });
    }

    if (objSel && queryEl) {
      on(objSel, 'change', () => {
        const v = (objSel.value || '').trim();
        if (!v) { clearUi(); return; }
        const qName = quoteIdentifier(v);
        const lim = getLimitValue();
        queryEl.value = `SELECT Id FROM ${qName} LIMIT ${lim}`;
        renderPlaceholder();
      });
    }

    if (window.SoqlGuidance?.init) {
      try {
        guidanceCleanup = window.SoqlGuidance.init({ root: document });
        if (typeof guidanceCleanup === 'function') {
          const fn = guidanceCleanup;
          cleanup.push(() => { try { fn(); } catch {}; guidanceCleanup = null; });
        }
      } catch {}
    }

    if (runBtn && queryEl && results) {
      on(runBtn, 'click', () => {
        const q = (queryEl.value || '').trim();
        const tooling = !!document.getElementById('soql-tooling')?.checked;
        const limitVal = getLimitValue();
        if (!q) {
          results.innerHTML = `
            <div class=\"log-entry\">\n              <div class=\"log-header\"><div class=\"log-left\"><span class=\"log-badge error\">error</span><span class=\"log-message\">Please type a SOQL query.</span></div></div>
            </div>
          `;
          return;
        }
        try {
          const epoch = lifecycleEpoch;
          const seq = ++runSeq;

          try { runBtn.disabled = true; runBtn.setAttribute('aria-busy', 'true'); } catch {}
          if (results && results.isConnected) {
            results.innerHTML = `<div class=\"loading\"><div class=\"loading-spinner\"></div><div>Running query… (limit ${limitVal})</div></div>`;
          }
          Utils.getInstanceUrl().then((instanceUrl) => {
            const payload = { action: 'RUN_SOQL', query: q, useTooling: tooling, limit: limitVal };
            if (instanceUrl) payload.instanceUrl = instanceUrl;
            function runOnce(p){
              return new Promise((resolve) => {
                chrome.runtime.sendMessage(p, (resp) => {
                  if (chrome.runtime && chrome.runtime.lastError) { resolve({ ok: false, error: chrome.runtime.lastError.message }); return; }
                  resolve(resp || { ok: false, error: 'No response' });
                });
              });
            }
            let usedPayload = payload;
            let retried = false;
            runOnce(payload).then(async (resp) => {
              if (!resp || !resp.success) {
                const msg = String(resp?.error || '').toLowerCase();
                if (/(^|[^\d])(401|403)([^\d]|$)/.test(msg)) {
                  try { Utils.setInstanceUrlCache && Utils.setInstanceUrlCache(null); } catch {}
                  try { await new Promise((res) => chrome.runtime.sendMessage({ action: 'GET_SESSION_INFO' }, () => res())); } catch {}
                  const inst2 = await Utils.getInstanceUrl();
                  const p2 = { ...payload };
                  if (inst2) p2.instanceUrl = inst2;
                  usedPayload = p2;
                  retried = true;
                  resp = await runOnce(p2);
                }
              }
              // Ignore stale callbacks and avoid touching DOM
              if (epoch !== lifecycleEpoch || seq !== runSeq) return;

              // Re-enable Run button before rendering
              try { runBtn.disabled = false; runBtn.removeAttribute('aria-busy'); } catch {}

              if (!resp || !resp.success) {
                try { console.error('SOQL RUN failed', { error: resp?.error, payload: usedPayload, retried }); } catch {}
                const msgSafe = Utils.escapeHtml(resp?.error || 'Query failed');
                const details = buildErrorDetailsHTML(resp?.error, { useTooling: tooling, limit: payload.limit, instanceUrl: usedPayload.instanceUrl, query: q, retried });
                if (results && results.isConnected) {
                  results.innerHTML = `<div class=\"log-entry\"><div class=\"log-header\"><div class=\"log-left\"><span class=\"log-badge error\">error</span><span class=\"log-message\">${msgSafe}</span></div></div>${details}</div>`;
                }
                return;
              }
              const total = Number(resp.totalSize || (Array.isArray(resp.records) ? resp.records.length : 0));
              if (results && results.isConnected) {
                results.innerHTML = `
                  <div class=\"log-entry\">\n                    <div class=\"log-header\">\n                      <div class=\"log-left\">\n                        <span class=\"log-badge event\">event</span>\n                        <span class=\"log-message\">Returned ${total} record(s)</span>\n                      </div>\n                    </div>\n                    <div class=\"log-details\"><details><summary>Records</summary><pre class=\"log-json\">${Utils.escapeHtml(JSON.stringify(resp.records || [], null, 2))}</pre></details></div>\n                  </div>
                `;
              }
            }).catch((e) => {
              // Ignore stale
              if (epoch !== lifecycleEpoch || seq !== runSeq) return;
              try { runBtn.disabled = false; runBtn.removeAttribute('aria-busy'); } catch {}
              try { console.error('SOQL RUN chain error', e); } catch {}
              if (results && results.isConnected) {
                results.innerHTML = `<div class=\"log-entry\"><div class=\"log-header\"><div class=\"log-left\"><span class=\"log-badge error\">error</span><span class=\"log-message\">${Utils.escapeHtml(String(e))}</span></div></div></div>`;
              }
            });
          }).catch((e) => {
            // Ignore stale
            if (epoch !== lifecycleEpoch || seq !== runSeq) return;
            try { runBtn.disabled = false; runBtn.removeAttribute('aria-busy'); } catch {}
            try { console.error('SOQL RUN instanceUrl error', e); } catch {}
            if (results && results.isConnected) {
              results.innerHTML = `<div class=\"log-entry\"><div class=\"log-header\"><div class=\"log-left\"><span class=\"log-badge error\">error</span><span class=\"log-message\">${Utils.escapeHtml(String(e))}</span></div></div></div>`;
            }
          });
        } catch (e) {
          try { console.error('SOQL RUN exception', e); } catch {}
          try { runBtn.disabled = false; runBtn.removeAttribute('aria-busy'); } catch {}
          if (results && results.isConnected) {
            results.innerHTML = `<div class=\"log-entry\"><div class=\"log-header\"><div class=\"log-left\"><span class=\"log-badge error\">error</span><span class=\"log-message\">${Utils.escapeHtml(String(e))}</span></div></div></div>`;
          }
        }
      });
    }

    if (clearBtn && results) {
      on(clearBtn, 'click', () => { clearUi(); });
    }
  }

  function attachIfNeeded() {
    if (attached) return;
    attached = true;
    applyObjectSelectorVisibility();
    wireUiOnly();

    // Flush caches on first attach to avoid stale lists from previous sessions
    try {
      const STATE = (typeof getSharedState === 'function') ? getSharedState() : null;
      if (STATE) {
        STATE.describeCache.rest = { names: null, ts: 0 };
        STATE.describeCache.tooling = { names: null, ts: 0 };
        STATE.describeInFlight.rest = null;
        STATE.describeInFlight.tooling = null;
      }
    } catch {}

    const tooling = !!document.getElementById('soql-tooling')?.checked;
    reloadObjects(tooling);

    const onSettingsChanged = () => { applyObjectSelectorVisibility(); };
    on(document, 'soql-settings-changed', onSettingsChanged);
  }

  const observer = new MutationObserver(() => {
    const soqlPane = document.querySelector('.tab-pane[data-tab="soql"]');
    if (!soqlPane) return;
    const isActive = soqlPane.classList.contains('active') && !soqlPane.hasAttribute('hidden');
    if (isActive) attachIfNeeded();
  });
  try {
    observer.observe(document.body, { subtree: true, attributes: true, attributeFilter: ['class','hidden'] });
  } catch {}
  cleanup.push(() => { try { observer.disconnect(); } catch {} });

  function detach() {
    cleanup.splice(0).forEach(fn => { try { fn(); } catch {} });
    attached = false;
    if (typeof guidanceCleanup === 'function') { try { guidanceCleanup(); } catch {} }
    guidanceCleanup = null;
    try { window.SoqlGuidance?.detach?.(); } catch {}
    lifecycleEpoch++;
    try {
      const runBtn = document.getElementById('soql-run');
      if (runBtn) { runBtn.disabled = false; runBtn.removeAttribute('aria-busy'); }
    } catch {}
    const STATE = getSharedState();
    STATE.describeCache.rest = { names: null, ts: 0 };
    STATE.describeCache.tooling = { names: null, ts: 0 };
    STATE.describeInFlight.rest = null;
    STATE.describeInFlight.tooling = null;
  }

  window.SoqlHelper = { detach };
})();
