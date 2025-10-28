(function(){
  'use strict';
  // Minimal UI-only SOQL helper. Exposes only detach(). No async/await to avoid parser issues.

  let attached = false;
  const cleanup = [];
  let guidanceCleanup = null;

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
      getObjectSelectorPref().then((show) => { group.style.display = show ? 'inline-flex' : 'none'; });
    } catch {}
  }

  function fetchDescribe(tooling) {
    return new Promise((resolve) => {
      try {
        Utils.getInstanceUrl().then((instanceUrl) => {
          const payload = { action: 'DESCRIBE_GLOBAL', useTooling: !!tooling };
          if (instanceUrl) payload.instanceUrl = instanceUrl;
          chrome.runtime.sendMessage(payload, async (resp) => {
            if (chrome.runtime && chrome.runtime.lastError) { resolve([]); return; }
            if (!resp || !resp.success) {
              const msg = String(resp?.error || '').toLowerCase();
              if (/(^|[^\d])(401|403)([^\d]|$)/.test(msg)) {
                try { Utils.setInstanceUrlCache && Utils.setInstanceUrlCache(null); } catch {}
                try { await new Promise((res) => chrome.runtime.sendMessage({ action: 'GET_SESSION_INFO' }, () => res())); } catch {}
                const inst2 = await Utils.getInstanceUrl();
                const payload2 = { action: 'DESCRIBE_GLOBAL', useTooling: !!tooling };
                if (inst2) payload2.instanceUrl = inst2;
                chrome.runtime.sendMessage(payload2, (resp2) => {
                  if (chrome.runtime && chrome.runtime.lastError) { resolve([]); return; }
                  if (!resp2 || !resp2.success) { resolve([]); return; }
                  const objs = Array.isArray(resp2.objects) ? resp2.objects : [];
                  const names = objs
                    .filter((o) => {
                      if (!o) return false;
                      const val = o.queryable;
                      if (typeof val === 'boolean') return val === true;
                      if (typeof val === 'string') return val.toLowerCase() === 'true';
                      return false; // strict: missing flag => not included
                    })
                    .map(o => o?.name || o?.label || '')
                    .filter(Boolean)
                    .sort((a,b) => a.localeCompare(b));
                  resolve(names);
                });
                return;
              }
              resolve([]); return;
            }
            const objs = Array.isArray(resp.objects) ? resp.objects : [];
            const names = objs
                .filter((o) => {
                    if (!o) return false;
                    const val = o.queryable;
                    if (typeof val === 'boolean') return val === true;
                    if (typeof val === 'string') return val.toLowerCase() === 'true';
                    return false; // strict: missing flag => not included
                })
              .map(o => o?.name || o?.label || '')
              .filter(Boolean)
              .sort((a,b) => a.localeCompare(b));
            resolve(names);
          });
        });
      } catch { resolve([]); }
    });
  }

  function reloadObjects(tooling) {
    const sel = document.getElementById('soql-object');
    if (!sel) return;
    sel.innerHTML = '';
    const def = document.createElement('option');
    def.value = '';
    def.textContent = 'Select an object';
    sel.appendChild(def);

    fetchDescribe(!!tooling).then((names) => {
      const list = Array.isArray(names) ? names : [];
      if (list.length === 0) {
        const opt = document.createElement('option');
        opt.value = '';
        opt.textContent = 'No objects loaded';
        opt.disabled = true;
        sel.appendChild(opt);
        return;
      }
      const frag = document.createDocumentFragment();
      list.forEach(name => {
        const opt = document.createElement('option');
        opt.value = name; opt.textContent = name; frag.appendChild(opt);
      });
      sel.appendChild(frag);
    });
  }

  function wireUiOnly() {
    const runBtn = document.getElementById('soql-run');
    const clearBtn = document.getElementById('soql-clear');
    const queryEl = document.getElementById('soql-query');
    const results = document.getElementById('soql-results');
    const objSel = document.getElementById('soql-object');
    const toolingCb = document.getElementById('soql-tooling');

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
        clearUi();
        applyObjectSelectorVisibility();
        reloadObjects(!!toolingCb.checked);
      });
    }

    if (objSel && queryEl) {
      on(objSel, 'change', () => {
        const v = (objSel.value || '').trim();
        if (!v) { clearUi(); return; }
        queryEl.value = `SELECT Id FROM ${v} LIMIT 10`;
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
        if (!q) {
          results.innerHTML = `
            <div class="log-entry">
              <div class="log-header"><div class="log-left"><span class="log-badge error">error</span><span class="log-message">Please type a SOQL query.</span></div></div>
            </div>
          `;
          return;
        }
        try {
          Utils.getInstanceUrl().then((instanceUrl) => {
            const payload = { action: 'RUN_SOQL', query: q, useTooling: tooling, limit: 200 };
            if (instanceUrl) payload.instanceUrl = instanceUrl;
            function runOnce(p){
              return new Promise((resolve) => {
                chrome.runtime.sendMessage(p, (resp) => {
                  if (chrome.runtime && chrome.runtime.lastError) { resolve({ ok: false, error: chrome.runtime.lastError.message }); return; }
                  resolve(resp || { ok: false, error: 'No response' });
                });
              });
            }
            runOnce(payload).then(async (resp) => {
              if (!resp || !resp.success) {
                const msg = String(resp?.error || '').toLowerCase();
                if (/(^|[^\d])(401|403)([^\d]|$)/.test(msg)) {
                  try { Utils.setInstanceUrlCache && Utils.setInstanceUrlCache(null); } catch {}
                  try { await new Promise((res) => chrome.runtime.sendMessage({ action: 'GET_SESSION_INFO' }, () => res())); } catch {}
                  const inst2 = await Utils.getInstanceUrl();
                  const p2 = { ...payload };
                  if (inst2) p2.instanceUrl = inst2;
                  resp = await runOnce(p2);
                }
              }
              if (!resp || !resp.success) {
                const msgSafe = Utils.escapeHtml(resp?.error || 'Query failed');
                results.innerHTML = `<div class="log-entry"><div class="log-header"><div class="log-left"><span class="log-badge error">error</span><span class="log-message">${msgSafe}</span></div></div></div>`;
                return;
              }
              const total = Number(resp.totalSize || (Array.isArray(resp.records) ? resp.records.length : 0));
              results.innerHTML = `
                <div class="log-entry">
                  <div class="log-header">
                    <div class="log-left">
                      <span class="log-badge event">event</span>
                      <span class="log-message">Returned ${total} record(s)</span>
                    </div>
                  </div>
                  <div class="log-details"><details><summary>Records</summary><pre class="log-json">${Utils.escapeHtml(JSON.stringify(resp.records || [], null, 2))}</pre></details></div>
                </div>
              `;
            });
          });
        } catch (e) {
          results.innerHTML = `<div class="log-entry"><div class="log-header"><div class="log-left"><span class="log-badge error">error</span><span class="log-message">${Utils.escapeHtml(String(e))}</span></div></div></div>`;
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
  try { observer.observe(document.body, { subtree: true, attributes: true, attributeFilter: ['class','hidden'] }); } catch {}
  cleanup.push(() => { try { observer.disconnect(); } catch {} });

  function detach() {
    cleanup.splice(0).forEach(fn => { try { fn(); } catch {} });
    attached = false;
      if (typeof guidanceCleanup === 'function') {
          try { guidanceCleanup(); } catch {}
      }
      guidanceCleanup = null;
      try { window.SoqlGuidance?.detach?.(); } catch {}
  }

  window.SoqlHelper = { detach };
})();

