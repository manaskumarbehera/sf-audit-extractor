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


  // Shared helper: normalize and extract object names. When Tooling is OFF, always filter to business/data SObjects.
  function describeObjectsToNames(objs, opts) {
    const arr = Array.isArray(objs) ? objs : [];
    const useTooling = !!(opts && opts.useTooling);
    const excludeAdminPattern = /^(Auth|Async|Process|Setup|UserEntityAccess|ObjectPermissions|PermissionSet|PermissionSetAssignment|Profile|QueueSobject|RecordType|EventLogFile|FieldDefinition|EntityDefinition|UserFieldAccess|InstalledPackage|UserPermissionAccess|UserAppMenu|BrandingSet|CorsWhitelistEntry|ExternalDataSource|Duplicate|UserProv|Matching|OrgPreference|Content[A-Z]|Knowledge[A-Z]|Flow|AIPrediction|UserLoginHistory)/;
    const standardAllow = new Set(['Account','Contact','Lead','Opportunity','Case','Task','Event','User','Campaign','CampaignMember','Product2','Pricebook2','PricebookEntry','Asset','Contract','Order','OrderItem','Quote','QuoteLineItem']);
    const toBool = (v, def = false) => (typeof v === 'boolean' ? v : (typeof v === 'string' ? v.toLowerCase() === 'true' : !!def));
    return arr
      .filter((o) => {
        if (!o) return false;
        const name = String(o?.name || o?.label || '').trim();
        if (!name) return false;
        const isQueryable = toBool(o.queryable, false);
        if (!isQueryable) return false;
        if (!useTooling) {
          const isDeprecatedHidden = toBool(o.deprecatedAndHidden, false);
            if (isDeprecatedHidden) return false;
          const isCustom = toBool(o.custom, false) || /__(c|mdt)$/i.test(name);
          const createable = (o.createable == null) ? true : toBool(o.createable, false);
          const updateable = (o.updateable == null) ? true : toBool(o.updateable, false);
          const retrieveable = (o.retrieveable == null) ? true : toBool(o.retrieveable, false);
          const hasDataCaps = (createable || updateable || retrieveable);
          const searchable = (o.searchable == null) ? true : toBool(o.searchable, false);
          if (excludeAdminPattern.test(name)) return false;
          const likelyData = isCustom || standardAllow.has(name) || (hasDataCaps && searchable);
          if (!likelyData) return false;
        }

        return true;
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
      // Common SOQL errors
      if (/invalid_field/i.test(msg) || /no such column/i.test(msg)) hints.push('One or more fields in the query do not exist on the target object. Check field API names and append __c for custom fields.');
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
            // Build options based solely on the Tooling API toggle
            const opts = { useTooling: !!tooling };
            done(describeObjectsToNames(resp.objects, opts), null);
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

  async function warmUpSession() {
    try {
      // Ask background to refresh session info (side effect: may ensure cookies/session are ready)
      await new Promise((resolve) => {
        try {
          chrome.runtime.sendMessage({ action: 'GET_SESSION_INFO' }, () => resolve());
        } catch { resolve(); }
      });
      // Refresh instance URL cache
      try { await Utils.getInstanceUrl(); } catch {}
    } catch {}
  }

  function reloadObjects(tooling) {
    const sel = document.getElementById('soql-object');
    if (!sel) return;

    const epoch = lifecycleEpoch;
    const seq = ++reloadSeq;

    const prevVal = sel.value || '';

    function setLoading() {
      sel.innerHTML = '';
      const opt = document.createElement('option');
      opt.value = '';
      opt.textContent = 'Loading objects…';
      opt.disabled = true;
      sel.appendChild(opt);
    }

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
    }

    setLoading();

    const wantTooling = !!tooling;

    const tryLoad = (isTooling, attempt) => {
      const getter = () => getDescribeCached(!!isTooling);
      getter().then(async (res) => {
        if (epoch !== lifecycleEpoch || seq !== reloadSeq || !sel.isConnected) return;
        const names = Array.isArray(res?.names) ? res.names : [];
        const hasAny = names.length > 0;
        if (hasAny) {
          renderSimple(names);
          return;
        }
        // If first attempt returned empty, do a one-time warm-up and retry
        if ((attempt || 0) === 0) {
          await warmUpSession();
          // Clear caches so next fetch actually re-runs
          try {
            const STATE = getSharedState();
            if (STATE) {
              STATE.describeCache.rest = { names: null, ts: 0 };
              STATE.describeCache.tooling = { names: null, ts: 0 };
              STATE.describeInFlight.rest = null;
              STATE.describeInFlight.tooling = null;
            }
          } catch {}
          // Retry once
          return tryLoad(isTooling, 1);
        }
        // Final: show a helpful empty state
        if (epoch !== lifecycleEpoch || seq !== reloadSeq || !sel.isConnected) return;
        resetSelect();
        const opt = document.createElement('option');
        opt.value = '';
        opt.textContent = 'No objects loaded — open a Salesforce tab and try again';
        opt.disabled = true;
        try { sel.appendChild(opt); } catch {}
      });
    };

    tryLoad(wantTooling, 0);
  }

  function setSoqlState(state) {
    try {
      const el = document.getElementById('soql-query');
      if (!el) return;
      el.classList.remove('soql-error', 'soql-success', 'soql-inprogress');
      if (state === 'error') el.classList.add('soql-error');
      else if (state === 'success') el.classList.add('soql-success');
      else if (state === 'inprogress') el.classList.add('soql-inprogress');
    } catch {}
  }

  function wireUiOnly() {
    
  // Advanced grid session state (resets on new query)
  const advState = {
    sort: [], // [{key, dir: 'asc'|'desc'}]
    filters: {}, // key -> text
    colWidths: {}, // key -> px
    order: null, // array of column keys
  };
    const runBtn = document.getElementById('soql-run');
    const clearBtn = document.getElementById('soql-clear');
    const queryEl = document.getElementById('soql-query');
    const results = document.getElementById('soql-results');
    const objSel = document.getElementById('soql-object');
    const toolingCb = document.getElementById('soql-tooling');
    const limitEl = document.getElementById('soql-limit');
    const viewAdvSwitch = document.getElementById('soql-view-advanced');

    // Multi-query tabs elements
    const tabsBar = document.getElementById('soql-tabbar');
    const tabsWrap = document.getElementById('soql-tabs');
    const tabAddBtn = document.getElementById('soql-tab-add');

    // Cache last successful response for re-rendering across view modes
    let lastSoqlResp = null;
    let lastSoqlMeta = null;

    // ========== Multi-query tabs state ==========
    const TAB_STORAGE_KEY = 'soqlTabsV1';
    let tabs = [];
    let activeTabId = null;

    function uid() { return Math.random().toString(36).slice(2, 10); }

    function parseFromObject(q) {
      try {
        const s = String(q || '');
        const m = s.match(/\bfrom\s+([`"\[]?[A-Za-z0-9_.`"\]]+)/i);
        if (!m) return '';
        let raw = m[1] || '';
        // strip quotes/backticks/brackets
        raw = raw.replace(/^[`"\[]/, '').replace(/[`"\]]$/, '');
        // Only last segment for relationship paths
        const parts = raw.split('.');
        return parts[parts.length - 1];
      } catch { return ''; }
    }

    function buildTitleForQuery(q) {
      const obj = parseFromObject(q);
      return obj ? obj : 'Untitled';
    }

    function uniquifyTitle(base) {
      const titles = new Map();
      for (const t of tabs) {
        const key = (t.title || '').toLowerCase();
        titles.set(key, (titles.get(key) || 0) + 1);
      }
      let title = base;
      let n = 1;
      while (tabs.some(t => (t.title || '').toLowerCase() === (title || '').toLowerCase())) {
        n += 1;
        title = base + ' (' + n + ')';
      }
      return title;
    }

    function saveTabs() {
      try {
        const payload = { tabs, activeTabId };
        chrome.storage?.local?.set?.({ [TAB_STORAGE_KEY]: payload }, () => {});
      } catch {}
    }

    function loadTabs() {
      return new Promise((resolve) => {
        try {
          chrome.storage?.local?.get?.({ [TAB_STORAGE_KEY]: null }, (r) => {
            const payload = r ? r[TAB_STORAGE_KEY] : null;
            if (payload && Array.isArray(payload.tabs) && payload.tabs.length) {
              tabs = payload.tabs;
              activeTabId = payload.activeTabId || tabs[0].id;
            } else {
              const id = uid();
              tabs = [{ id, title: 'Untitled', query: '', tooling: !!toolingCb?.checked, limit: getLimitValue(), viewMode: 'raw', advState: null, lastResp: null, lastMeta: null }];
              activeTabId = id;
            }
            resolve();
          });
        } catch {
          const id = uid();
          tabs = [{ id, title: 'Untitled', query: '', tooling: !!toolingCb?.checked, limit: getLimitValue(), viewMode: 'raw', advState: null, lastResp: null, lastMeta: null }];
          activeTabId = id;
          resolve();
        }
      });
    }

    function renderTabsBar() {
      if (!tabsWrap) return;
      tabsWrap.innerHTML = '';
      const frag = document.createDocumentFragment();
      for (const t of tabs) {
        const b = document.createElement('button');
        b.className = 'soql-tab' + (t.id === activeTabId ? ' active' : '');
        b.setAttribute('role', 'tab');
        b.setAttribute('aria-selected', t.id === activeTabId ? 'true' : 'false');
        b.dataset.id = t.id;
        const span = document.createElement('span');
        span.className = 'title';
        span.textContent = t.title || 'Untitled';
        const close = document.createElement('button');
        close.className = 'close';
        close.type = 'button';
        close.title = 'Close tab';
        close.textContent = '×';
        close.addEventListener('click', (e) => { e.stopPropagation(); closeTab(t.id); });
        b.appendChild(span);
        b.appendChild(close);
        b.addEventListener('click', () => setActiveTab(t.id));
        frag.appendChild(b);
      }
      tabsWrap.appendChild(frag);
    }

    function setActiveTab(id) {
      const t = tabs.find(x => x.id === id);
      if (!t) return;
      activeTabId = id;
      // Populate UI inputs
      if (queryEl) queryEl.value = t.query || '';
      if (toolingCb) toolingCb.checked = !!t.tooling;
      if (limitEl) limitEl.value = String(t.limit || 200);
      if (viewAdvSwitch) viewAdvSwitch.checked = (t.viewMode === 'advanced');
      try { viewAdvSwitch && viewAdvSwitch.setAttribute('aria-checked', viewAdvSwitch.checked ? 'true' : 'false'); } catch {}

      // Restore last response render if present
      lastSoqlResp = t.lastResp || null;
      lastSoqlMeta = t.lastMeta || null;
      // Reset advState from tab if present
      if (t.advState && typeof t.advState === 'object') {
        advState.sort = Array.isArray(t.advState.sort) ? t.advState.sort : [];
        advState.filters = t.advState.filters || {};
        advState.colWidths = t.advState.colWidths || {};
        advState.order = Array.isArray(t.advState.order) ? t.advState.order : null;
      } else {
        advState.sort = []; advState.filters = {}; advState.colWidths = {}; advState.order = null;
      }
      renderTabsBar();
      if (lastSoqlResp) { renderByMode(lastSoqlResp); } else { renderPlaceholder(); }
      saveTabs();
    }

    function addTab(initialQuery) {
      const q = String(initialQuery || '').trim();
      const base = buildTitleForQuery(q) || 'Untitled';
      const unique = tabs.some(t => (t.title || '').toLowerCase() === base.toLowerCase()) ? uniquifyTitle(base) : base;
      const id = uid();
      const t = { id, title: unique, query: q, tooling: !!toolingCb?.checked, limit: getLimitValue(), viewMode: (viewAdvSwitch && viewAdvSwitch.checked) ? 'advanced' : 'raw', advState: null, lastResp: null, lastMeta: null };
      tabs.push(t);
      setActiveTab(id);
      saveTabs();
    }

    function closeTab(id) {
      const idx = tabs.findIndex(t => t.id === id);
      if (idx < 0) return;
      const wasActive = (activeTabId === id);
      tabs.splice(idx, 1);
      if (tabs.length === 0) {
        addTab('');
      } else if (wasActive) {
        const next = tabs[Math.max(0, idx - 1)];
        setActiveTab(next.id);
      } else {
        renderTabsBar();
        saveTabs();
      }
    }

    function updateActiveTabFromInputs({ andRender } = {}) {
      const t = tabs.find(x => x.id === activeTabId);
      if (!t) return;
      t.query = queryEl ? (queryEl.value || '') : t.query;
      t.tooling = toolingCb ? !!toolingCb.checked : t.tooling;
      t.limit = limitEl ? getLimitValue() : t.limit;
      t.viewMode = (viewAdvSwitch && viewAdvSwitch.checked) ? 'advanced' : 'raw';
      // derive title from FROM object and ensure uniqueness among others
      let newTitle = buildTitleForQuery(t.query) || 'Untitled';
      if (!newTitle) newTitle = 'Untitled';
      if (newTitle.toLowerCase() !== (t.title || '').toLowerCase()) {
        // Ensure uniqueness: if another tab already has same title, suffix
        let candidate = newTitle;
        let n = 1;
        while (tabs.some(x => x.id !== t.id && (x.title || '').toLowerCase() === candidate.toLowerCase())) {
          n += 1; candidate = newTitle + ' (' + n + ')';
        }
        t.title = candidate;
        renderTabsBar();
      }
      saveTabs();
      if (andRender) { rerenderCurrent(); }
    }

    function saveAdvStateIntoTab() {
      const t = tabs.find(x => x.id === activeTabId);
      if (!t) return;
      t.advState = { sort: advState.sort.slice(), filters: { ...(advState.filters||{}) }, colWidths: { ...(advState.colWidths||{}) }, order: advState.order ? advState.order.slice() : null };
    }

    // Wire tabbar buttons
    if (tabAddBtn) on(tabAddBtn, 'click', () => addTab(''));

    // Load and render tabs initially
    if (tabsBar) {
      loadTabs().then(() => {
        renderTabsBar();
        setActiveTab(activeTabId);
      });
    }

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

    function getViewModePref(){
      return new Promise((resolve) => {
        try {
          chrome.storage?.local?.get?.({ soqlViewMode: 'raw' }, (r) => {
            if (chrome.runtime && chrome.runtime.lastError) { resolve('raw'); return; }
            const v = (r && r.soqlViewMode) || 'raw';
            resolve(v === 'advanced' ? 'advanced' : 'raw');
          });
        } catch (e) { resolve('raw'); }
      });
    }
    function setViewModePref(mode){
      try { chrome.storage?.local?.set?.({ soqlViewMode: mode === 'advanced' ? 'advanced' : 'raw' }, () => {}); } catch {}
    }

    function clearUi() {
      if (queryEl) queryEl.value = '';
      lastSoqlResp = null; lastSoqlMeta = null;
      renderPlaceholder();
    }

    function renderRaw(resp){
      if (!results) return;
      const total = Number(resp?.totalSize || (Array.isArray(resp?.records) ? resp.records.length : 0));
      results.innerHTML = `
        <div class=\"log-entry\">\n          <div class=\"log-header\">\n            <div class=\"log-left\">\n              <span class=\"log-badge event\">event</span>\n              <span class=\"log-message\">Returned ${total} record(s)</span>\n            </div>\n          </div>\n          <div class=\"log-details\"><details open><summary>Records</summary><pre class=\"log-json\">${Utils.escapeHtml(JSON.stringify(resp?.records || [], null, 2))}</pre></details></div>\n        </div>
      `;
    }

    function isSalesforceId(val){
      const s = String(val || '');
      return /^[a-zA-Z0-9]{15}(?:[a-zA-Z0-9]{3})?$/.test(s);
    }

    function buildIdLinkHtml(id, label){
      const safeId = Utils.escapeHtml(id);
      const safeLabel = Utils.escapeHtml(label || id);
      return `<a href=\"#\" class=\"sf-id-link\" data-sfid=\"${safeId}\" title=\"Open record\">${safeLabel}</a>`;
    }

    // Call after rendering advanced grid
    function renderAdvanced(resp) {
      // Build enhanced Excel-like grid
      if (!results) return;
      if (!results) return;
      const rawRows = Array.isArray(resp?.records) ? resp.records : [];
      // Determine headers
      const cols = new Set();
      rawRows.forEach((r) => {
        if (!r || typeof r !== 'object') return;
        Object.keys(r).forEach((k) => { if (k !== 'attributes') cols.add(k); });
      });
      let headers = advState.order && advState.order.length ? advState.order.filter(k=>cols.has(k)) : Array.from(cols);
      if (!advState.order || advState.order.length === 0) advState.order = headers.slice();
      const escape = (v) => Utils.escapeHtml(String(v));

      // Apply filters
      const filterText = (txt) => String(txt || '').toLowerCase();
      const recordValString = (v) => {
        if (v == null) return '';
        if (typeof v === 'object') {
          const rid = v.Id || v.id || null;
          const nm = v.Name || v.name || null;
          if (rid && isSalesforceId(rid)) return nm ? `${nm} (${rid})` : `${rid}`;
          try { return JSON.stringify(v); } catch { return String(v); }
        }
        return String(v);
      };
      const activeFilters = Object.keys(advState.filters || {}).filter(k => (advState.filters[k] || '').trim() !== '');
      const filteredRows = activeFilters.length === 0 ? rawRows : rawRows.filter((r) => {
        return activeFilters.every((key) => {
          const needle = filterText(advState.filters[key] || '');
          const hay = filterText(recordValString(r[key]));
          return hay.indexOf(needle) !== -1;
        });
      });

      // Apply sorting
      const sorters = Array.isArray(advState.sort) ? advState.sort : [];
      const sortedRows = sorters.length === 0 ? filteredRows.slice() : filteredRows.slice().sort((a,b) => {
        for (const s of sorters) {
          const ka = recordValString(a[s.key]);
          const kb = recordValString(b[s.key]);
          if (ka === kb) continue;
          const cmp = ka < kb ? -1 : 1;
          return s.dir === 'desc' ? -cmp : cmp;
        }
        return 0;
      });

      // Build body rows
      const htmlRows = sortedRows.map((r) => {
        const tds = headers.map((h) => {
          const width = advState.colWidths && advState.colWidths[h] ? ` style=\"width:${advState.colWidths[h]}px;\"` : '';
          let v = r[h];
          if (v == null) return `<td${width}></td>`;
          if (typeof v === 'object') {
            const rid = v.Id || v.id || null;
            const nm = v.Name || v.name || null;
            if (rid && isSalesforceId(rid)) {
              const label = nm ? `${nm}` : `${rid}`;
              return `<td${width}><div class=\"cell\">${buildIdLinkHtml(rid, label)}</div></td>`;
            }
            try { return `<td${width}><div class=\"cell\"><code>${escape(JSON.stringify(v))}</code></div></td>`; } catch { return `<td${width}></td>`; }
          }
          if (typeof v === 'string' && isSalesforceId(v)) {
            return `<td${width}><div class=\"cell\">${buildIdLinkHtml(v)}</div></td>`;
          }
          return `<td${width} title=\"${escape(recordValString(v))}\"><div class=\"cell\">${escape(v)}</div></td>`;
        }).join('');
        return `<tr>${tds}</tr>`;
      }).join('');

      // Build header with sort indicators and filter inputs
      const sortMap = Object.create(null);
      (advState.sort || []).forEach((s, i) => { sortMap[s.key] = { dir: s.dir, idx: i+1 }; });
      const ths = headers.map(h => {
        const sortInfo = sortMap[h];
        const dir = sortInfo ? sortInfo.dir : '';
        const ind = dir === 'asc' ? '▲' : (dir === 'desc' ? '▼' : '');
        const orderBadge = sortInfo ? `<span class=\"sort-order\">${sortInfo.idx}</span>` : '';
        const width = advState.colWidths && advState.colWidths[h] ? `width:${advState.colWidths[h]}px;` : '';
        return `<th draggable=\"true\" data-key=\"${escape(h)}\" class=\"hdr ${dir ? 'sorted-'+dir : ''}\" aria-sort=\"${dir || 'none'}\" style=\"position:sticky; top:0; ${width}\">
                  <div class=\"hdr-inner\" title=\"Click to sort; Shift+Click for multi-sort\">
                    <span class=\"hdr-name\">${escape(h)}</span>
                    <span class=\"sort-ind\">${ind}</span>
                    ${orderBadge}
                  </div>
                  <span class=\"col-resizer\" data-col=\"${escape(h)}\" style=\"position:absolute; right:0; top:0; width:6px; cursor:col-resize; user-select:none; height:100%;\"></span>
                </th>`;
      }).join('');
      const filterRow = headers.map(h => {
        const val = Utils.escapeHtml(advState.filters && advState.filters[h] ? advState.filters[h] : '');
        const width = advState.colWidths && advState.colWidths[h] ? ` style=\"width:${advState.colWidths[h]}px;\"` : '';
        return `<th${width}><input class=\"col-filter\" data-key=\"${escape(h)}\" type=\"text\" placeholder=\"Filter\" value=\"${val}\" /></th>`;
      }).join('');

      const statusHtml = `<div class="soql-adv-status">${filteredRows.length} of ${rawRows.length} row(s)</div>`;

      const actionsHtml = `
        <div class=\"btn-group soql-adv-btnbar\" style=\"display:flex; gap:8px; padding:6px 0; justify-content:flex-end; align-items:center; width:100%; flex-wrap:nowrap;\">\n        </div>`;
      const table = `
        <div class=\"soql-adv-wrap\">\n          <div class=\"soql-adv-actions\" style=\"display:flex; justify-content:flex-end;\">${actionsHtml}</div>\n          <div class=\"soql-adv-table-wrap\" style=\"overflow:auto;\">\n            <table class=\"soql-adv-table\" style=\"border-collapse:collapse; table-layout:fixed; width:max-content; min-width:100%;\">\n              <thead><tr>${ths}</tr><tr class=\"filter-row\">${filterRow}</tr></thead>\n              <tbody>${htmlRows}</tbody>\n            </table>\n          </div>\n          ${statusHtml}\n          <div class=\"sf-id-menu\" style=\"position:absolute; display:none; z-index:1000; background:#fff; border:1px solid #e1e5ea; border-radius:6px; box-shadow:0 4px 16px rgba(0,0,0,0.12);\">\n            <button data-cmd=\"copy\" style=\"display:block; width:100%; padding:8px 12px; text-align:left; background:none; border:0; cursor:pointer;\">Copy Id</button>\n            <button data-cmd=\"open\" style=\"display:block; width:100%; padding:8px 12px; text-align:left; background:none; border:0; cursor:pointer;\">Open in new tab</button>\n          </div>\n        </div>`;
      results.innerHTML = table;

      // Remove export button wiring (not needed)
      try {
        const tableEl = results.querySelector('table.soql-adv-table');
        const headRow = tableEl ? tableEl.querySelector('thead tr') : null;
        const thEls = headRow ? Array.from(headRow.children) : [];
        // Sorting
        thEls.forEach((th) => {
          const key = th.getAttribute('data-key');
          const inner = th.querySelector('.hdr-inner') || th;
          on(inner, 'click', (evt) => {
            const multi = !!evt.shiftKey;
            const existingIdx = (advState.sort || []).findIndex(s => s.key === key);
            let nextDir = 'asc';
            if (existingIdx >= 0) {
              const cur = advState.sort[existingIdx];
              nextDir = cur.dir === 'asc' ? 'desc' : (cur.dir === 'desc' ? 'none' : 'asc');
            }
            if (!multi) advState.sort = [];
            if (nextDir === 'none') {
              if (existingIdx >= 0) advState.sort.splice(existingIdx, 1);
            } else {
              if (existingIdx >= 0) advState.sort[existingIdx].dir = nextDir; else advState.sort.push({ key, dir: nextDir });
            }
            rerenderCurrent();
          });
        });
        // Drag reorder
        let dragKey = null;
        thEls.forEach((th) => {
          const key = th.getAttribute('data-key');
          on(th, 'dragstart', () => { dragKey = key; });
          on(th, 'dragover', (e) => { try { e.preventDefault(); } catch {} });
          on(th, 'drop', (e) => {
            try { e.preventDefault(); } catch {}
            const targetKey = th.getAttribute('data-key');
            if (!dragKey || !targetKey || dragKey === targetKey) return;
            const order = advState.order ? advState.order.slice() : headers.slice();
            const from = order.indexOf(dragKey);
            const to = order.indexOf(targetKey);
            if (from < 0 || to < 0) return;
            order.splice(from, 1);
            order.splice(to, 0, dragKey);
            advState.order = order;
            rerenderCurrent();
          });
        });
      } catch {}

      // Wire filter inputs (debounced)
      try {
        const inputs = Array.from(results.querySelectorAll('input.col-filter'));
        let tId = null;
        const schedule = () => { if (tId) clearTimeout(tId); tId = setTimeout(() => rerenderCurrent(), 200); };
        inputs.forEach((inp) => {
          const key = inp.getAttribute('data-key');
          on(inp, 'input', () => { advState.filters[key] = inp.value || ''; schedule(); });
        });
      } catch {}

      // Wire id link interactions
      const menu = results.querySelector('.sf-id-menu');
      let menuForId = null;
      function hideMenu(){ if (menu) { menu.style.display = 'none'; } menuForId = null; }
      on(document, 'click', (e) => {
        const a = e.target?.closest ? e.target.closest('.sf-id-link') : null;
        if (a && a.dataset?.sfid) {
          e.preventDefault();
          const id = a.dataset.sfid;
          menuForId = id;
          const rect = a.getBoundingClientRect();
          const x = rect.left + window.scrollX;
          const y = rect.bottom + window.scrollY + 4;
          if (menu) { menu.style.left = x + 'px'; menu.style.top = y + 'px'; menu.style.display = 'block'; }
          return;
        }
        hideMenu();
      });
      on(document, 'keydown', (e) => { if (e.key === 'Escape') hideMenu(); });
      on(menu, 'click', async (e) => {
        const cmd = e.target?.getAttribute ? e.target.getAttribute('data-cmd') : '';
        if (!cmd || !menuForId) return;
        if (cmd === 'copy') {
          try { await navigator.clipboard.writeText(menuForId); Utils.showToast && Utils.showToast('Id copied'); } catch {}
          hideMenu();
        } else if (cmd === 'open') {
          try {
            const origin = await Utils.getInstanceUrl();
            if (origin) window.open(origin + '/' + menuForId, '_blank');
          } catch {}
          hideMenu();
        }
      });

      // Column resizing like Excel
      try {
        const tableEl = results.querySelector('table.soql-adv-table');
        const headRow = tableEl ? tableEl.querySelector('thead tr') : null; // first header row
        const ths = headRow ? Array.from(headRow.children) : [];
        const bodyRows = tableEl ? Array.from(tableEl.querySelectorAll('tbody tr')) : [];
        const minWidth = 60;
        function setColWidth(idx, px){
          const w = Math.max(minWidth, Math.floor(px));
          const th = ths[idx];
          if (!th) return;
          th.style.width = w + 'px';
          const key = th.getAttribute('data-key');
          if (key) advState.colWidths[key] = w;
          // apply to cells
          for (const tr of bodyRows) {
            const td = tr.children[idx];
            if (td) td.style.width = w + 'px';
          }
        }
        function autoFit(idx){
          const th = ths[idx]; if (!th) return;
          let max = 0;
          // header name
          const nameEl = th.querySelector('.hdr-name');
          if (nameEl) max = Math.max(max, nameEl.scrollWidth + 24);
          // filter input (second header row)
          try {
            const filterRow = tableEl.querySelector('thead tr.filter-row');
            const filterTh = filterRow ? filterRow.children[idx] : null;
            const inp = filterTh ? filterTh.querySelector('input') : null;
            if (inp) max = Math.max(max, inp.scrollWidth + 24);
          } catch {}
          // body cells
          for (const tr of bodyRows) {
            const td = tr.children[idx];
            if (!td) continue;
            const cell = td.querySelector('.cell') || td;
            max = Math.max(max, cell.scrollWidth + 24);
          }
          if (max > 0) setColWidth(idx, max);
        }
        ths.forEach((th, idx) => {
          const handle = th.querySelector('.col-resizer');
          if (!handle) return;
          let startX = 0; let startW = 0; let dragging = false;
          const mm = (evt) => {
            if (!dragging) return;
            const dx = evt.clientX - startX;
            setColWidth(idx, startW + dx);
            try { evt.preventDefault(); } catch {}
          };
          const mu = () => {
            if (!dragging) return;
            dragging = false;
            document.body.style.cursor = '';
            document.body.classList.remove('no-select');
          };
          on(handle, 'mousedown', (evt) => {
            startX = evt.clientX;
            startW = th.getBoundingClientRect().width;
            dragging = true;
            document.body.style.cursor = 'col-resize';
            document.body.classList.add('no-select');
          });
          // Double-click to auto-fit
          on(handle, 'dblclick', () => { autoFit(idx); });
          on(document, 'mousemove', mm);
          on(document, 'mouseup', mu);
        });
      } catch {}
    }

    function renderByMode(resp){
      const mode = (viewAdvSwitch && viewAdvSwitch.checked) ? 'advanced' : 'raw';
      if (mode === 'advanced') renderAdvanced(resp); else renderRaw(resp);
    }

    function rerenderCurrent(){
      if (!lastSoqlResp) { renderPlaceholder(); return; }
      renderByMode(lastSoqlResp);
      // persist current adv grid state with the tab
      try { saveAdvStateIntoTab(); saveTabs(); } catch {}
    }

    if (toolingCb) {
      on(toolingCb, 'change', () => {
        const STATE = getSharedState();
        STATE.describeCache.rest = { names: null, ts: 0 };
        STATE.describeCache.tooling = { names: null, ts: 0 };
        STATE.describeInFlight.rest = null;
        STATE.describeInFlight.tooling = null;
        clearUi();
        setSoqlState('inprogress');
        applyObjectSelectorVisibility();
        updateActiveTabFromInputs({ andRender: false });
        reloadObjects(!!toolingCb.checked);
      });
    }

    // Initialize editor state and keep it in-progress while editing
    if (queryEl) {
      try { setSoqlState('inprogress'); } catch {}
      on(queryEl, 'input', () => { setSoqlState('inprogress'); updateActiveTabFromInputs({ andRender: false }); });
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
          try { queryEl.dispatchEvent(new Event('input', { bubbles: true })); } catch {}
        }
        updateActiveTabFromInputs({ andRender: false });
      });
    }

    if (objSel && queryEl) {
      on(objSel, 'change', () => {
        const v = (objSel.value || '').trim();
        if (!v) { clearUi(); setSoqlState('inprogress'); updateActiveTabFromInputs({ andRender: true }); return; }
        const qName = quoteIdentifier(v);
        const lim = getLimitValue();
        const templateQuery = `SELECT Id FROM ${qName} LIMIT ${lim}`;
        try { setSoqlState('inprogress'); } catch {}
        // Decide whether to create a new tab or reuse the current one
        let usedNewTab = false;
        try {
          const t = tabs.find(x => x.id === activeTabId);
          const hasContent = !!(t && ((t.query && t.query.trim() !== '') || t.lastResp));
          if (hasContent) {
            addTab(templateQuery);
            usedNewTab = true;
          }
        } catch {}
        if (!usedNewTab) {
          queryEl.value = templateQuery;
          renderPlaceholder();
          updateActiveTabFromInputs({ andRender: false });
        }
        // Move focus to the query editor and blur the object selector to dismiss any native suggestions/dropdowns
        try { objSel.blur(); } catch {}
        try { setTimeout(() => { if (queryEl && queryEl.isConnected) { queryEl.focus(); } }, 0); } catch {}
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

    // Initialize view mode from storage and wire changes (switch)
    if (viewAdvSwitch) {
      getViewModePref().then((mode) => {
        try { viewAdvSwitch.checked = (mode === 'advanced'); } catch {}
        try { viewAdvSwitch.setAttribute('aria-checked', viewAdvSwitch.checked ? 'true' : 'false'); } catch {}
      });
      on(viewAdvSwitch, 'change', () => {
        const mode = (viewAdvSwitch && viewAdvSwitch.checked) ? 'advanced' : 'raw';
        try { viewAdvSwitch.setAttribute('aria-checked', viewAdvSwitch.checked ? 'true' : 'false'); } catch {}
        setViewModePref(mode);
        updateActiveTabFromInputs({ andRender: false });
        if (lastSoqlResp) renderByMode(lastSoqlResp);
      });
    }

    if (runBtn && queryEl && results) {
      on(runBtn, 'click', () => {
        const q = (queryEl.value || '').trim();
        const tooling = !!document.getElementById('soql-tooling')?.checked;
        const limitVal = getLimitValue();
        if (!q) {
          try { setSoqlState('error'); } catch {}
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
            try {
              if (instanceUrl && Utils.looksLikeSalesforceOrigin && Utils.looksLikeSalesforceOrigin(instanceUrl)) {
                payload.instanceUrl = instanceUrl;
              }
            } catch {}
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
                try { console.error('SOQL RUN failed', JSON.stringify({ error: resp?.error, payload: usedPayload, retried }, null, 2)); } catch {}
                const msgSafe = Utils.escapeHtml(resp?.error || 'Query failed');
                const details = buildErrorDetailsHTML(resp?.error, { useTooling: tooling, limit: payload.limit, instanceUrl: usedPayload.instanceUrl, query: q, retried });
                try { setSoqlState('error'); } catch {}
                if (results && results.isConnected) {
                  results.innerHTML = `<div class=\"log-entry\"><div class=\"log-header\"><div class=\"log-left\"><span class=\"log-badge error\">error</span><span class=\"log-message\">${msgSafe}</span></div></div>${details}</div>`;
                }
                return;
              }
              const total = Number(resp.totalSize || (Array.isArray(resp.records) ? resp.records.length : 0));
              try { setSoqlState('success'); } catch {}
              // Reset Advanced grid session state on new successful result
              advState.sort = [];
              advState.filters = {};
              advState.colWidths = {};
              advState.order = null;
              lastSoqlResp = resp;
              lastSoqlMeta = { useTooling: tooling, limit: payload.limit, instanceUrl: usedPayload.instanceUrl, query: q };
              // Persist into active tab (last results + meta)
              try {
                const t = tabs.find(x => x.id === activeTabId);
                if (t) { t.lastResp = lastSoqlResp; t.lastMeta = lastSoqlMeta; saveTabs(); }
              } catch {}
              if (results && results.isConnected) {
                renderByMode(resp);
                // Save grid state after initial render (no-op for raw)
                try { saveAdvStateIntoTab(); saveTabs(); } catch {}
              }
            }).catch((e) => {
              // Ignore stale
              if (epoch !== lifecycleEpoch || seq !== runSeq) return;
              try { runBtn.disabled = false; runBtn.removeAttribute('aria-busy'); } catch {}
              try { console.error('SOQL RUN chain error', e); } catch {}
              try { setSoqlState('error'); } catch {}
              if (results && results.isConnected) {
                results.innerHTML = `<div class=\"log-entry\"><div class=\"log-header\"><div class=\"log-left\"><span class=\"log-badge error\">error</span><span class=\"log-message\">${Utils.escapeHtml(String(e))}</span></div></div></div>`;
              }
            });
          }).catch((e) => {
            // Ignore stale
            if (epoch !== lifecycleEpoch || seq !== runSeq) return;
            try { runBtn.disabled = false; runBtn.removeAttribute('aria-busy'); } catch {}
            try { console.error('SOQL RUN instanceUrl error', e); } catch {}
            try { setSoqlState('error'); } catch {}
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
      on(clearBtn, 'click', () => { 
        clearUi(); 
        try { setSoqlState('inprogress'); } catch {}
        try {
          const t = tabs.find(x => x.id === activeTabId);
          if (t) { t.query = ''; t.lastResp = null; t.lastMeta = null; t.advState = null; saveTabs(); }
        } catch {}
      });
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
