import { Soql_helper_schema } from './soql_helper_schema.js';
import { Soql_helper_storage } from './soql_helper_storage.js';
import {
  getInstanceUrl,
  buildKeyPrefixMap,
  getClauseAtCursor,
  getSelectPhase,
  getFromPhase,
  validateFieldsMacro,
  sendMessageToSalesforceTab,
  buildColumnsUnion,
  recordsToCsv,
  downloadCsv,
  downloadExcel,
  linkifyInfoForValue
} from './soql_helper_utils.js';
import { ensureIdContextMenuWired, showIdContextMenu } from './soql_helper_dom.js';

let initialized = false;
let rules = {};

// Load rules used by the SOQL helper UI (fetch JSON or fall back to defaults)
async function loadRules(){
  const defaultRules = {
    keywords: ["SELECT","FROM","WHERE","GROUP BY","HAVING","ORDER BY","LIMIT","OFFSET","ASC","DESC","NULLS FIRST","NULLS LAST"],
    operators: ["=","!=","<","<=",">",">=","LIKE","IN","NOT IN","INCLUDES","EXCLUDES"],
    inlineValidators: [
      { id: 'requireSelectFrom', level: 'error', pattern: "^\\s*select\\b[\\s\\S]*\\bfrom\\b", negate: false, message: 'A SOQL query requires SELECT ... FROM ...' }
    ],
    suggestionProviders: {
      suggestLimitValues: { samples: ["10","50","100","200","500","2000"] },
      suggestOffsetValues: { samples: ["0","10","100","500"] }
    },
    apexFieldMacros: ["FIELDS(ALL)", "FIELDS(STANDARD)", "FIELDS(CUSTOM)"]
  };

  const candidates = [
    'soqlRules.json',
    'soql_builder_tips.json',
    'soql_suggestions_config.json'
  ];

  // Try fetching in browser/extension environment
  try {
    if (typeof fetch === 'function') {
      for (const name of candidates) {
        try {
          const url = new URL(`./rules/${name}`, import.meta.url);
          if (typeof console !== 'undefined' && console.debug) console.debug && console.debug('soql_helper: attempting to fetch rules', url.href);
          const res = await fetch(url, { cache: 'no-store' });
          if (res && res.ok) {
            const txt = await res.text();
            try { rules = JSON.parse(txt); if (console && console.debug) console.debug('soql_helper: loaded rules from', name); return rules; }
            catch (e) {
              const cleaned = txt.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
              rules = JSON.parse(cleaned);
              if (console && console.debug) console.debug('soql_helper: loaded rules (cleaned) from', name);
              return rules;
            }
          }
        } catch (e) { /* try next candidate */ if (console && console.debug) console.debug('soql_helper: fetch failed for', name, e && e.message ? e.message : e); }
      }
    }
  } catch (e) { if (console && console.debug) console.debug('soql_helper: fetch env threw', e && e.message ? e.message : e); /* ignore fetch errors and fallthrough to node fallback */ }

  // Node/test fallback: try reading files from process.cwd()/rules
  try {
    if (typeof process !== 'undefined' && process.cwd) {
      const fsMod = await import('fs');
      const pathMod = await import('path');
      const fs = fsMod && fsMod.default ? fsMod.default : fsMod;
      const path = pathMod && pathMod.default ? pathMod.default : pathMod;
      for (const name of candidates) {
        try {
          const p = path.resolve(process.cwd(), 'rules', name);
          if (fs.existsSync(p)) {
            if (console && console.debug) console.debug('soql_helper: reading rules file from', p);
            const txt = fs.readFileSync(p, 'utf8');
            const cleaned = txt.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
            rules = JSON.parse(cleaned);
            if (console && console.debug) console.debug('soql_helper: loaded rules from file', p);
            return rules;
          }
        } catch (e) { if (console && console.debug) console.debug('soql_helper: fs read failed for', name, e && e.message ? e.message : e); /* try next */ }
      }
    }
  } catch (e) { if (console && console.debug) console.debug('soql_helper: node fs fallback error', e && e.message ? e.message : e); /* ignore node fs errors */ }

  // Final fallback
  if (console && console.debug) console.debug('soql_helper: using default rules fallback');
  rules = defaultRules;
  return rules;
}

// DOM element references used throughout the module
const els = {
  editor: null,
  hints: null,
  errors: null,
  obj: null,
  run: null,
  clear: null,
  limit: null,
  results: null,
  autoFill: null,
  debug: null,
  debugToggle: null,
  useTooling: null
};

function qs(id) { return document.getElementById(id); }

// Suggestion subsystem state (added)
let suggesterModule = null;
let suggestionDebounce = null;
const SUGGEST_DEBOUNCE_MS = 250;

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
    console.warn && console.warn('soql_helper: failed to load suggester', e);
    suggesterModule = null;
    return null;
  }
}

async function computeAndRenderSuggestions() {
  try {
    if (!els || !els.editor || !els.hints) return;
    const q = els.editor.value || '';
    const mod = await loadSuggester();
    if (!mod || typeof mod.suggestSoql !== 'function') { renderSuggestions([]); return; }
    // Best-effort describe: none in popup module; pass null
    let suggestions;
    try {
      suggestions = await mod.suggestSoql(q, null, 'soqlEditor') || [];
    } catch (e) { suggestions = []; }
    // store latest and render
    try { els.hints._latestSuggestions = suggestions; } catch {}
    renderSuggestions(Array.isArray(suggestions) ? suggestions.slice(0, 10) : []);
  } catch (e) { console.warn && console.warn('computeAndRenderSuggestions error', e); renderSuggestions([]); }
}

function scheduleSuggestionCompute() {
  if (suggestionDebounce) clearTimeout(suggestionDebounce);
  suggestionDebounce = setTimeout(() => { computeAndRenderSuggestions().catch(()=>{}); }, SUGGEST_DEBOUNCE_MS);
}

function renderSuggestions(items) {
  try {
    if (!els || !els.hints) return;
    const ul = els.hints;
    ul.innerHTML = '';
    if (!items || items.length === 0) { ul.classList.add('hidden'); return; }
    const frag = document.createDocumentFragment();
    items.forEach((s, idx) => {
      try {
        const li = document.createElement('li');
        li.className = 'soql-suggestion';
        li.tabIndex = 0;
        // Use text or message as label
        li.textContent = String(s.text || s.message || (s.apply && s.apply.text) || s.id || 'Suggestion');
        li.addEventListener('click', (ev) => {
          try { ev.preventDefault(); applySuggestionByIndex(idx); } catch (e) { console.warn && console.warn('suggest click error', e); }
        });
        li.addEventListener('keydown', (ev) => {
          if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); applySuggestionByIndex(idx); }
        });
        frag.appendChild(li);
      } catch (e) { /* ignore per-item errors */ }
    });
    ul.appendChild(frag);
    ul.classList.remove('hidden');
  } catch (e) { console.warn && console.warn('renderSuggestions error', e); }
}

function applySuggestionByIndex(idx) {
  try {
    if (!els || !els.hints || !els.editor) return;
    const hintsEl = els.hints;
    if (hintsEl._applying) return;
    const suggestions = hintsEl._latestSuggestions || [];
    const s = suggestions[idx];
    if (!s) return;
    const editor = els.editor;
    if (!editor) return;
    try {
      hintsEl._applying = true;
      const cur = editor.value || '';
      const app = s.apply || {};
      let next = cur;
      if (app.type === 'append') {
        next = cur + (app.text || '');
      } else if (app.type === 'replace') {
        if (typeof app.start === 'number' && typeof app.end === 'number' && app.start >= 0 && app.end > app.start && app.end <= cur.length) {
          next = cur.slice(0, app.start) + (app.text || '') + cur.slice(app.end);
        } else if (app.text) {
          const star = cur.indexOf('*');
          if (star >= 0) next = cur.slice(0, star) + app.text + cur.slice(star+1);
          else next = cur + app.text;
        }
      } else if (app.type === 'insert') {
        if (typeof app.pos === 'number' && app.pos >= 0 && app.pos <= cur.length) {
          next = cur.slice(0, app.pos) + (app.text || '') + cur.slice(app.pos);
        } else {
          next = cur + (app.text || '');
        }
      } else {
        next = cur + (app.text || '');
      }
      editor.value = next;
      try { editor.focus(); } catch {}
      try { editor.setSelectionRange(editor.value.length, editor.value.length); } catch {}
      validateInline();
      hintsHide();
      // re-run suggestions after small delay
      setTimeout(() => { try { computeAndRenderSuggestions().catch(()=>{}); } catch(_){} }, 80);
    } finally {
      try { hintsEl._applying = false; } catch(_){}
    }
  } catch (e) { console.warn && console.warn('applySuggestionByIndex top error', e); }
}

function bindDom(){
  try {
    els.editor = qs('soql-editor');
    els.hints = qs('soql-hints');
    els.errors = qs('soql-errors');
    els.obj = qs('soql-obj');
    els.run = qs('soql-run');
    els.clear = qs('soql-clear');
    els.limit = qs('soql-limit');
    els.results = qs('soql-results');
    els.autoFill = qs('soql-auto-fill');
    els.debug = qs('soql-debug');
    els.debugToggle = qs('soql-debug-toggle');
    els.useTooling = qs('soql-use-tooling');
  } catch {}
}

function ensureInitOnce() {
  if (initialized) {
      return;
  }
  initialized = true;
  bindDom();
  wireEvents();
  initSchemaAndUI();
}

async function initSchemaAndUI() {
  await loadRules();
  // Load persisted Tooling API preference (soqlUseTooling) if available
  try {
    if (els.useTooling && chrome?.storage?.local?.get) {
      const pref = await chrome.storage.local.get({ soqlUseTooling: false });
      els.useTooling.checked = !!pref.soqlUseTooling;
    }
  } catch {}

  const toolingPref = !!(els.useTooling && els.useTooling.checked);

  // Diagnostic: log detected instance url early so popup console shows why DESCRIBE_GLOBAL may fail
  try {
    const detectedInstance = await getInstanceUrl().catch(() => null);
    console.debug && console.debug('soql_helper: initSchemaAndUI detected instance:', detectedInstance, 'toolingPref:', toolingPref);
  } catch {}

  // Try initializing the schema with a small retry loop to tolerate transient failures
  let objs = [];
  const maxAttempts = 3;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      console.debug && console.debug(`soql_helper: initSchema attempt ${attempt} (useTooling=${toolingPref})`);
      await Soql_helper_schema.initSchema(toolingPref);
      buildKeyPrefixMap(toolingPref);
    } catch (err) {
      console.warn && console.warn('soql_helper: initSchema error attempt', attempt, err);
      try { buildKeyPrefixMap(); } catch {}
    }
    populateObjectPicker();
    objs = Soql_helper_schema.getObjects(toolingPref) || [];
    console.debug && console.debug('soql_helper: objects after attempt', attempt, objs && objs.length);
    if (objs && objs.length > 0) break;
    // small backoff before retrying
    if (attempt < maxAttempts) await new Promise(r => setTimeout(r, 300 * attempt));
  }

  // If still empty, try the alternative endpoint(s) as a final fallback
  if (!objs || objs.length === 0) {
    try {
      // Try standard endpoint
      console.debug && console.debug('soql_helper: retrying initSchema with standard endpoint');
      await Soql_helper_schema.initSchema(false);
      buildKeyPrefixMap(false);
      populateObjectPicker();
      objs = Soql_helper_schema.getObjects(false) || [];
      console.debug && console.debug('soql_helper: objects after standard retry', objs && objs.length);
    } catch (err) { console.warn && console.warn('soql_helper: standard initSchema error', err); }

    if ((!objs || objs.length === 0) && toolingPref) {
      try {
        // Try tooling endpoint explicitly
        console.debug && console.debug('soql_helper: retrying initSchema with tooling endpoint');
        await Soql_helper_schema.initSchema(true);
        buildKeyPrefixMap(true);
        populateObjectPicker();
        objs = Soql_helper_schema.getObjects(true) || [];
        console.debug && console.debug('soql_helper: objects after tooling retry', objs && objs.length);
      } catch (err) { console.warn && console.warn('soql_helper: tooling initSchema error', err); }
    }
  }

  if ((!objs || objs.length === 0) && els.errors) {
    try {
      // Attempt to give the user a diagnostic hint: do we see an instance URL/session?
      let inst = null;
      try { inst = await getInstanceUrl(); } catch {}
      const instHint = inst ? `Detected instance: ${inst}` : 'No Salesforce session detected';
      els.errors.textContent = `Warning: Could not load object list — ${instHint}. Try logging into Salesforce in a browser tab, then reopen this popup or toggle "Use Tooling API".`;

      // Additional diagnostic: fetch and display raw responses (DESCRIBE_GLOBAL + GET_SESSION_INFO)
      try { await fetchAndDisplayDiagnostics(toolingPref); } catch (e) { console.warn('soql_helper: fetchAndDisplayDiagnostics error', e); }
    } catch (e) { console.warn && console.warn('soql_helper: error while setting error hint', e); }
  }

  // Load recent query if any
  try {
    const recent = await Soql_helper_storage.loadRecent();
    if (recent && recent[0] && els.editor) els.editor.value = recent[0];
  } catch {}
  // Sync object picker from any pre-filled query in the editor
  try { syncObjectPickerFromEditor(); } catch {}
  // Load auto-fill preference
  try {
    if (els.autoFill && chrome?.storage?.local?.get) {
      const pref = await chrome.storage.local.get({ soqlAutoFill: true });
      els.autoFill.checked = !!pref.soqlAutoFill;
    }
  } catch {}
  // Load debug overlay preference
  try {
    if (els.debugToggle && chrome?.storage?.local?.get) {
      const pref = await chrome.storage.local.get({ soqlDebugOverlay: false });
      els.debugToggle.checked = !!pref.soqlDebugOverlay;
      applyDebugOverlayVisibility();
    } else {
      applyDebugOverlayVisibility();
    }
  } catch {
    applyDebugOverlayVisibility();
  }
  validateInline();
  // sync the limit dropdown from any pre-filled query
  try { syncLimitDropdownFromEditor(); } catch {}
  // compute initial suggestions
  try { scheduleSuggestionCompute(); } catch {}
}

// Expose a hook for the popup fallback and initialize the module UI when loaded
try {
  if (typeof window !== 'undefined') {
    window.__soql_helper_loaded = true;
    window.__soql_helper_ensureInitOnce = ensureInitOnce;
  }
} catch (e) { /* ignore */ }

// Auto-init when the module is loaded in the popup context
try { ensureInitOnce(); } catch (e) { console.warn && console.warn('soql_helper auto-init failed', e); }

// Diagnostic: force-tooling flag for dev/testing
try {
  if (typeof window !== 'undefined' && window.location) {
    const q = window.location.search;
    if (q.indexOf('soql_tooling=1') >= 0) {
      const el = document.getElementById('soql-use-tooling');
      if (el) {
        el.checked = true;
        el.dispatchEvent(new Event('change', { bubbles: true }));
      }
    }
  }
} catch (e) { console.warn && console.warn('soql_helper tooling flag parse error', e); }

let _populateRetries = 0;

async function populateObjectPicker(){
  try {
    // If DOM hasn't been bound yet, retry a few times with backoff
    if (!els.obj) {
      if (_populateRetries < 5) {
        _populateRetries++;
        setTimeout(populateObjectPicker, 200 * _populateRetries);
      }
      return;
    }
  } catch {}

  const list = Soql_helper_schema.getObjects(!!(els.useTooling && els.useTooling.checked));
  console.debug && console.debug('soql_helper: populateObjectPicker got list length', Array.isArray(list) ? list.length : 'null');
  try { els.obj.innerHTML = ''; } catch { return; }
  if (!list || list.length === 0) {
    // Runtime fallback: attempt direct DESCRIBE_GLOBAL from background (helps when schema cache didn't populate)
    try {
      if (typeof chrome !== 'undefined' && chrome?.runtime?.sendMessage) {
        const resp = await new Promise((resolve) => {
          try {
            chrome.runtime.sendMessage({ action: 'DESCRIBE_GLOBAL', useTooling: !!(els.useTooling && els.useTooling.checked) }, (r) => {
              if (chrome.runtime.lastError) {
                // Return structured error so UI can render a helpful diagnostic
                console.debug('soql_helper: populateObjectPicker DESCRIBE_GLOBAL lastError', chrome.runtime.lastError);
                resolve({ success: false, error: String(chrome.runtime.lastError && chrome.runtime.lastError.message ? chrome.runtime.lastError.message : chrome.runtime.lastError) });
              } else {
                resolve(r || { success: true, objects: null });
              }
            });
          } catch (e) { console.debug('soql_helper: populateObjectPicker sendMessage exception', e); resolve({ success: false, error: String(e) }); }
        });
        // If the background returned a structured failure, show it to the user for diagnostics
        if (resp && resp.success === false && resp.error) {
          try { if (els.errors) els.errors.textContent = `Could not load objects: ${resp.error}`; } catch {}
        }
        if (resp && resp.success && Array.isArray(resp.objects) && resp.objects.length > 0) {
          // Populate directly from background response
          try { els.obj.innerHTML = ''; } catch {}
          resp.objects.forEach(it => {
            try {
              const name = it.name || it.label || it.keyPrefix || '';
              if (!name) return;
              const o = document.createElement('option');
              o.value = name;
              o.textContent = `${it.label || name} (${name})`;
              try { if (String(name || '').toLowerCase().endsWith('__mdt')) o.dataset.isMdt = '1'; } catch {}
              els.obj.appendChild(o);
            } catch {}
          });
          try { if (els.obj.options && els.obj.options.length > 0) { els.obj.selectedIndex = 0; try { els.obj.dispatchEvent(new Event('change', { bubbles: true })); } catch {} } } catch {}
          // Clear any previous object-load errors
          try { if (els.errors) els.errors.textContent = ''; } catch {}
          return;
        }
      }
    } catch (e) { console.debug('soql_helper: populateObjectPicker fallback failed', e); }
     // show a disabled placeholder and a clear error hint so the user knows why objects are empty
     const o = document.createElement('option');
     o.textContent = '\u2014 none (objects not loaded) \u2014';
     o.disabled = true;
     o.selected = true;
     try { els.obj.appendChild(o); } catch {}
    try {
      if (els.errors) {
        // Clear previous content and render a retry UI
        els.errors.textContent = '';
        // If the last DESCRIBE_GLOBAL response explicitly said the instance URL wasn't detected,
        // show a prominent action to open/sign-in to Salesforce and retry; otherwise fall back to the generic UI.
        try {
          const lastResp = (Soql_helper_schema && typeof Soql_helper_schema.getLastDescribeGlobalResponse === 'function') ? Soql_helper_schema.getLastDescribeGlobalResponse() : null;
          const instUrlErr = lastResp && lastResp.success === false && typeof lastResp.error === 'string' && /instance\s*url\s*not\s*detected/i.test(lastResp.error);

          if (instUrlErr) {
            const wrap = document.createElement('div');
            wrap.style.display = 'flex';
            wrap.style.flexDirection = 'column';
            wrap.style.gap = '8px';
            wrap.style.padding = '8px 6px';

            const header = document.createElement('div');
            header.style.fontWeight = '600';
            header.style.marginBottom = '4px';
            header.textContent = 'Salesforce session not detected';
            wrap.appendChild(header);

            const msg = document.createElement('div');
            msg.textContent = 'The extension could not detect a Salesforce instance or session. Open a Salesforce tab and sign in, then retry loading objects.';
            wrap.appendChild(msg);

            const actionsRow = document.createElement('div');
            actionsRow.style.display = 'flex';
            actionsRow.style.gap = '8px';

            const openSfPrimary = document.createElement('button');
            openSfPrimary.type = 'button';
            openSfPrimary.textContent = 'Open Salesforce';
            openSfPrimary.style.padding = '8px 12px';
            openSfPrimary.style.background = 'var(--accent, #0070d2)';
            openSfPrimary.style.color = '#fff';
            openSfPrimary.style.border = 'none';
            openSfPrimary.style.borderRadius = '4px';
            openSfPrimary.addEventListener('click', async () => {
              try {
                openSfPrimary.disabled = true;
                const tabs = await new Promise((resolve) => {
                  try { chrome.tabs.query({ url: ['https://*.salesforce.com/*', 'https://*.force.com/*'] }, (arr) => resolve(arr || [])); }
                  catch { resolve([]); }
                });
                if (Array.isArray(tabs) && tabs.length > 0) {
                  const t = tabs[0];
                  try { chrome.tabs.update(t.id, { active: true }); } catch {}
                  try { chrome.windows.update(t.windowId, { focused: true }); } catch {}
                } else {
                  try { chrome.tabs.create({ url: 'https://login.salesforce.com/' }); } catch {}
                }
                // Give user a moment to sign in, then enable retry
                setTimeout(() => { try { openSfPrimary.disabled = false; } catch {} }, 1500);
              } catch (e) { console.warn('openSfPrimary error', e); try { openSfPrimary.disabled = false; } catch {} }
            });
            actionsRow.appendChild(openSfPrimary);

            const retryBtn = document.createElement('button');
            retryBtn.type = 'button';
            retryBtn.textContent = 'Retry detection';
            retryBtn.addEventListener('click', async () => {
              try { retryBtn.disabled = true; await reloadObjects(); } catch {} finally { try { retryBtn.disabled = false; } catch {} }
            });
            actionsRow.appendChild(retryBtn);

            const diagBtn = document.createElement('button');
            diagBtn.type = 'button';
            diagBtn.id = 'soql-show-diagnostics';
            diagBtn.textContent = 'Show diagnostics';
            diagBtn.addEventListener('click', async () => {
              try { diagBtn.disabled = true; await fetchAndDisplayDiagnostics(!!(els.useTooling && els.useTooling.checked)); } catch (e) { console.warn('diagnostics button error', e); } finally { try { diagBtn.disabled = false; } catch {} }
            });
            actionsRow.appendChild(diagBtn);

            wrap.appendChild(actionsRow);

            els.errors.appendChild(wrap);
            return; // done — we rendered the instance-URL-missing UI
          }
        } catch (e) { console.debug('soql_helper: failed to render last describe resp', e); }

        // Fallback: render the previous generic UI when instance URL isn't the clear cause
        const p = document.createElement('div');
        p.textContent = 'Could not load objects. Ensure you have an active Salesforce session.';
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.id = 'soql-retry-objects';
        btn.textContent = 'Retry loading objects';
        btn.style.marginLeft = '8px';
        btn.addEventListener('click', async () => {
          try { btn.disabled = true; await reloadObjects(); } catch {} finally { try { btn.disabled = false; } catch {} }
        });
        const diagBtn = document.createElement('button');
        diagBtn.type = 'button';
        diagBtn.id = 'soql-show-diagnostics';
        diagBtn.textContent = 'Show diagnostics';
        diagBtn.style.marginLeft = '8px';
        diagBtn.addEventListener('click', async () => {
          try { diagBtn.disabled = true; await fetchAndDisplayDiagnostics(!!(els.useTooling && els.useTooling.checked)); } catch (e) { console.warn('diagnostics button error', e); } finally { try { diagBtn.disabled = false; } catch {} }
        });
        const openSfBtn = document.createElement('button');
        openSfBtn.type = 'button';
        openSfBtn.id = 'soql-open-salesforce';
        openSfBtn.textContent = 'Open Salesforce tab';
        openSfBtn.style.marginLeft = '8px';
        openSfBtn.addEventListener('click', async () => {
          try {
            openSfBtn.disabled = true;
            const tabs = await new Promise((resolve) => { try { chrome.tabs.query({ url: ['https://*.salesforce.com/*', 'https://*.force.com/*'] }, (arr) => { resolve(arr || []); }); } catch (e) { resolve([]); } });
            if (Array.isArray(tabs) && tabs.length > 0) {
              const t = tabs[0];
              try { chrome.tabs.update(t.id, { active: true }); } catch (e) {}
              try { chrome.windows.update(t.windowId, { focused: true }); } catch (e) {}
            } else {
              try { chrome.tabs.create({ url: 'https://login.salesforce.com/' }); } catch (e) {}
            }
          } catch (e) { console.warn('openSfBtn error', e); }
          try { openSfBtn.disabled = false; } catch {}
        });
        els.errors.appendChild(p);
        els.errors.appendChild(btn);
        els.errors.appendChild(diagBtn);
        els.errors.appendChild(openSfBtn);
       }
     } catch {}
  }
  // Clear any previous object-load errors when we do have objects
  try { if (els.errors) els.errors.textContent = ''; } catch {}
  list.forEach(it => {
    try {
      const o = document.createElement('option');
      o.value = it.name;
      // show both label and an indicator when the object looks like tooling or metadata
      o.textContent = `${it.label || it.name} (${it.name})`;
      // mark custom metadata types so we can auto-select Tooling API
      try { if (String(it.name || '').toLowerCase().endsWith('__mdt')) o.dataset.isMdt = '1'; } catch {}
      els.obj.appendChild(o);
    } catch {}
  });

  // Make sure the select shows a selection (choose first) and trigger change so other UI updates run
  try {
    if (els.obj.options && els.obj.options.length > 0) {
      els.obj.selectedIndex = 0;
      // update any listeners
      try { els.obj.dispatchEvent(new Event('change', { bubbles: true })); } catch {}
    }
  } catch {}
}

// Allow manual retry of schema/object loading from the UI
async function reloadObjects() {
  try {
    if (!els.errors) return;
    try { els.errors.textContent = 'Reloading objects...'; } catch {}
    const tooling = !!(els.useTooling && els.useTooling.checked);
    try { await Soql_helper_schema.initSchema(tooling); } catch {}
    try { buildKeyPrefixMap(tooling); } catch {}
    try { populateObjectPicker(); } catch {}
    const objs = Soql_helper_schema.getObjects(tooling) || [];
    if (objs && objs.length > 0) {
      try { els.errors.textContent = ''; } catch {}
    } else {
      try {
        let inst = null;
        try { inst = await getInstanceUrl(); } catch {}
        const instHint = inst ? `Detected instance: ${inst}` : 'No Salesforce session detected';
        // Enhanced diagnostics: try to get raw DESCRIBE_GLOBAL response from background
        let rawResp = null;
        try {
          rawResp = await new Promise((resolve) => {
            try {
              chrome.runtime.sendMessage({ action: 'DESCRIBE_GLOBAL', instanceUrl: inst || undefined, useTooling: tooling }, (r) => {
                if (chrome.runtime.lastError) {
                  console.warn('soql_helper: reloadObjects DESCRIBE_GLOBAL lastError', chrome.runtime.lastError);
                  resolve({ success: false, error: String(chrome.runtime.lastError) });
                } else {
                  resolve(r || null);
                }
              });
            } catch (e) { console.warn('soql_helper: reloadObjects sendMessage exception', e); resolve({ success: false, error: String(e) }); }
          });
        } catch (e) { console.warn('soql_helper: reloadObjects DESCRIBE_GLOBAL promise error', e); }

        // Also fetch session info from background for diagnostics
        let sessionResp = null;
        try {
          sessionResp = await new Promise((resolve) => {
            try {
              chrome.runtime.sendMessage({ action: 'GET_SESSION_INFO', url: inst || undefined }, (r) => {
                if (chrome.runtime.lastError) {
                  console.warn('soql_helper: reloadObjects GET_SESSION_INFO lastError', chrome.runtime.lastError);
                  resolve({ success: false, error: String(chrome.runtime.lastError) });
                } else {
                  resolve(r || null);
                }
              });
            } catch (e) { console.warn('soql_helper: reloadObjects GET_SESSION_INFO exception', e); resolve({ success: false, error: String(e) }); }
          });
        } catch (e) { console.warn('soql_helper: reloadObjects GET_SESSION_INFO promise error', e); }

        try {
          const detail = rawResp ? JSON.stringify(rawResp, null, 2) : 'No response from background (runtime.lastError or blocked)';
          const sessionDetail = sessionResp ? JSON.stringify(sessionResp, null, 2) : 'No session info available';
          els.errors.textContent = `Reload failed — ${instHint}.\n\nRaw DESCRIBE_GLOBAL response:\n${detail}\n\nGET_SESSION_INFO response:\n${sessionDetail}`;
          console.warn('soql_helper: raw DESCRIBE_GLOBAL response', rawResp, 'GET_SESSION_INFO', sessionResp);
        } catch (e) { console.warn('soql_helper: failed to render DESCRIBE_GLOBAL diagnostic', e); }
      } catch {}
    }
  } catch {}
}

function wireEvents(){
  if (!els.editor) return;
  els.editor.addEventListener('keydown', onKeyDown);
  // On input, validate, update suggestions/debug overlay and keep object picker synced if a FROM clause exists
  els.editor.addEventListener('input', () => {
    try { validateInline(); suggestFromContext(); updateDebugOverlay(); syncObjectPickerFromEditor(); scheduleSuggestionCompute(); } catch {}
  });
  els.editor.addEventListener('focus', () => {
      suggestFromContext();
      updateDebugOverlay();
      scheduleSuggestionCompute();
  });
  els.editor.addEventListener('keyup', () => { updateDebugOverlay(); });
  els.editor.addEventListener('click', () => { updateDebugOverlay(); });
  els.editor.addEventListener('mouseup', () => { updateDebugOverlay(); });
  els.hints.addEventListener('mousedown', (e)=>{ e.preventDefault(); });
  els.run.addEventListener('click', runQuery);
  els.clear.addEventListener('click', () => { els.editor.value=''; clearResults(); hintsHide(); els.errors.textContent=''; setEditorStatus(''); updateDebugOverlay(); });
  els.obj.addEventListener('change', async () => { await handleObjectChange(); updateDebugOverlay(); });
  // Keep the LIMIT input (with datalist) and editor synchronized
  els.limit?.addEventListener('input', () => { applyLimitFromDropdown(); });
  els.editor.addEventListener('input', () => { try { syncLimitDropdownFromEditor(); } catch {} });
  if (els.useTooling) {
    els.useTooling.addEventListener('change', async () => {
      // Re-init schema against the selected endpoint and refresh object picker
      try { await Soql_helper_schema.initSchema(!!els.useTooling.checked); } catch {}
      try { buildKeyPrefixMap(!!els.useTooling.checked); } catch {}
      // Persist the user's choice
      try { await chrome?.storage?.local?.set?.({ soqlUseTooling: !!els.useTooling.checked }); } catch {}
      populateObjectPicker();
      // Clear any previous results since schema/objects changed
      try { clearResults(); hintsHide(); clearLimit(); } catch {}
      suggestFromContext();
    });
  }
  if (els.autoFill) {
    els.autoFill.addEventListener('change', async () => {
      try { await chrome?.storage?.local?.set?.({ soqlAutoFill: !!els.autoFill.checked }); } catch {}
    });
  }
  if (els.debugToggle) {
    els.debugToggle.addEventListener('change', async () => {
      applyDebugOverlayVisibility();
      try { await chrome?.storage?.local?.set?.({ soqlDebugOverlay: !!els.debugToggle.checked }); } catch {}
    });
  }
}

async function handleObjectChange(){
  if (!els.obj || !els.editor) return;
  const obj = (els.obj.value || '').trim();
  if (!obj) { suggestFromContext(); return; }
  try {
    const sel = els.obj.selectedOptions && els.obj.selectedOptions[0];
    if (sel && sel.dataset && sel.dataset.isMdt) {
      if (els.useTooling && !els.useTooling.checked) {
        // Do NOT auto-enable or persist the Tooling API. Require explicit user action.
        try { els.errors.textContent = 'Note: custom metadata types require the Tooling API — enable "Use Tooling API" to view them.'; } catch {}
      }
    }
  } catch {}
  // Remove previous results when the user changes the selected object
  try { clearResults(); hintsHide(); clearLimit(); } catch {}
  const current = (els.editor.value || '').trim();
  const autoRe = /^select\s+id\s+from\s+[A-Za-z_][A-Za-z0-9_]*(?:__(?:c|kav|x))?\s*;?$/i;
  const template = `SELECT Id FROM ${obj}`;
  const force = !!(els.autoFill && els.autoFill.checked);
  if (force || !current || autoRe.test(current)) {
    els.editor.value = template;
    const caret = els.editor.value.length;
    els.editor.focus();
    try { els.editor.setSelectionRange(caret, caret); } catch {}
  }
  validateInline();
  suggestFromContext();
}

// Module initialization helpers and lightweight UI implementations

function validateInline() {
  try {
    if (!els || !els.editor) return false;
    const q = String(els.editor.value || '');
    const macroErr = validateFieldsMacro ? validateFieldsMacro(q) : null;
    if (macroErr) {
      try { if (els.errors) els.errors.textContent = macroErr; } catch {}
      setEditorStatus('error');
      return false;
    }
    try {
      const inline = Array.isArray(rules.inlineValidators) ? rules.inlineValidators : [];
      for (const v of inline) {
        try {
          const re = new RegExp(v.pattern, 'i');
          const match = re.test(q);
          const ok = v.negate ? !match : match;
          if (!ok) {
            try { if (els.errors) els.errors.textContent = v.message || ''; } catch {}
            setEditorStatus(v.level === 'error' ? 'error' : '');
            return false;
          }
        } catch {}
      }
    } catch {}
    try { if (els.errors) els.errors.textContent = ''; } catch {}
    setEditorStatus('success');
    return true;
  } catch (e) { console.warn && console.warn('validateInline error', e); return false; }
}

function suggestFromContext() {
  try {
    if (!els || !els.editor || !els.hints) return;
    const txt = els.editor.value || '';
    const pos = (els.editor.selectionStart == null) ? txt.length : els.editor.selectionStart;
    let clause;
    try { clause = getClauseAtCursor ? getClauseAtCursor(txt, pos) : null; } catch { clause = null; }
    els.hints.innerHTML = '';
    if (clause === 'FROM') {
      const objs = Soql_helper_schema.getObjects(!!(els.useTooling && els.useTooling.checked)) || [];
      const frag = document.createDocumentFragment();
      objs.slice(0, 30).forEach(o => {
        try {
          const btn = document.createElement('button');
          btn.type = 'button';
          btn.className = 'soql-hint';
          btn.textContent = o.name || o.label || '';
          btn.addEventListener('click', () => {
            try {
              const upTo = txt.slice(0, pos);
              const after = txt.slice(pos);
              const m = upTo.match(/FROM\s+([A-Za-z0-9_\u007F-]*)$/i);
              const prefix = m ? m[1] : '';
              const newUp = upTo.replace(new RegExp(prefix + '$'), (o.name || ''));
              els.editor.value = newUp + after;
              els.editor.focus();
              try { els.editor.setSelectionRange(newUp.length, newUp.length); } catch {}
              validateInline();
              hintsHide();
              syncObjectPickerFromEditor();
            } catch (e) { console.warn && console.warn('suggest click error', e); }
          });
          frag.appendChild(btn);
        } catch {}
      });
      els.hints.appendChild(frag);
    }
  } catch (e) { console.warn && console.warn('suggestFromContext error', e); }
}

function updateDebugOverlay() {
  try {
    if (!els || !els.debug || !els.editor) return;
    const q = els.editor.value || '';
    const pos = (els.editor.selectionStart == null) ? q.length : els.editor.selectionStart;
    const info = {
      clause: (getClauseAtCursor ? getClauseAtCursor(q, pos) : null),
      selectPhase: (getSelectPhase ? getSelectPhase(q, pos) : null),
      fromPhase: (getFromPhase ? getFromPhase(q, pos) : null),
      pos
    };
    els.debug.textContent = JSON.stringify(info, null, 2);
  } catch (e) { console.warn && console.warn('updateDebugOverlay error', e); }
}

function syncObjectPickerFromEditor(){
  try {
    if (!els || !els.editor || !els.obj) return;
    const q = (els.editor.value || '');
    const m = q.match(/\bFROM\s+([A-Za-z_][A-Za-z0-9_]*(?:__(?:c|kav|x))?)/i);
    if (!m) return;
    const name = m[1];
    Array.from(els.obj.options || []).forEach((opt, idx) => {
      try { if ((opt.value || '').toLowerCase() === (name || '').toLowerCase()) els.obj.selectedIndex = idx; } catch {}
    });
  } catch (e) { console.warn && console.warn('syncObjectPickerFromEditor error', e); }
}

function syncLimitDropdownFromEditor(){
  try {
    if (!els || !els.editor || !els.limit) return;
    const q = els.editor.value || '';
    const m = q.match(/\bLIMIT\s+(\d+)/i);
    const val = m ? m[1] : '';
    els.limit.value = val;
    try {
      if (val) els.limit.setAttribute('data-applied', String(val)); else els.limit.removeAttribute('data-applied');
    } catch (e) { /* ignore attribute errors */ }
    try { console.debug && console.debug('syncLimitDropdownFromEditor -> limit value set to', val, 'data-applied=', els.limit.getAttribute && els.limit.getAttribute('data-applied')); } catch (e) {}
  } catch (e) { console.warn && console.warn('syncLimitDropdownFromEditor error', e); }
}

function applyDebugOverlayVisibility(){
  try {
    if (!els || !els.debug) return;
    const show = !!(els.debugToggle && els.debugToggle.checked);
    els.debug.style.display = show ? '' : 'none';
  } catch (e) { console.warn && console.warn('applyDebugOverlayVisibility error', e); }
}

async function fetchAndDisplayDiagnostics(toolingPref){
  try {
    if (!els || !els.errors) return;
    const inst = await getInstanceUrl().catch(() => null);
    const instHint = inst ? `Detected instance: ${inst}` : 'No Salesforce session detected';
    let rawResp;
    try {
      rawResp = await new Promise((resolve) => {
        try { chrome.runtime.sendMessage({ action: 'DESCRIBE_GLOBAL', instanceUrl: inst || undefined, useTooling: !!toolingPref }, (r) => { if (chrome.runtime.lastError) resolve({ success: false, error: String(chrome.runtime.lastError) }); else resolve(r || null); }); } catch (e) { resolve({ success: false, error: String(e) }); }
      });
    } catch (e) { rawResp = { success: false, error: String(e) }; }

    let sessionResp;
    try {
      sessionResp = await new Promise((resolve) => {
        try { chrome.runtime.sendMessage({ action: 'GET_SESSION_INFO', url: inst || undefined }, (r) => { if (chrome.runtime.lastError) resolve({ success: false, error: String(chrome.runtime.lastError) }); else resolve(r || null); }); } catch (e) { resolve({ success: false, error: String(e) }); }
      });
    } catch (e) { sessionResp = { success: false, error: String(e) }; }

    try {
      const detail = rawResp ? JSON.stringify(rawResp, null, 2) : 'No response from background';
      const sessionDetail = sessionResp ? JSON.stringify(sessionResp, null, 2) : 'No session info available';
      els.errors.textContent = `${instHint}\n\nRaw DESCRIBE_GLOBAL response:\n${detail}\n\nGET_SESSION_INFO response:\n${sessionDetail}`;
    } catch (e) { console.warn && console.warn('diagnostics render failed', e); }
  } catch (e) { console.warn && console.warn('fetchAndDisplayDiagnostics error', e); }
}

function clearResults(){ try { if (els && els.results) els.results.innerHTML = ''; } catch {} }
function hintsHide(){ try { if (els && els.hints) els.hints.innerHTML = ''; } catch {} }
function clearLimit(){ try { if (els && els.limit) els.limit.value = ''; } catch {} }
// New: update editor visual status and validator top area
function setEditorStatus(status) {
  try {
    // Update textarea visual styles
    const editorEl = (els && els.editor) ? els.editor : qs('soql-editor');
    if (editorEl && editorEl.classList) {
      editorEl.classList.remove('soql-editor--progress','soql-editor--success','soql-editor--error');
      if (status === 'progress') editorEl.classList.add('soql-editor--progress');
      else if (status === 'success') editorEl.classList.add('soql-editor--success');
      else if (status === 'error') editorEl.classList.add('soql-editor--error');
    }

    // Update validator area above editor (helps screen readers and inline feedback)
    const validatorEl = qs('soql-validator-top');
    if (validatorEl) {
      if (status === 'progress') {
        validatorEl.textContent = 'Running...';
        validatorEl.className = 'soql-validator placeholder-note';
        validatorEl.setAttribute('aria-live', 'polite');
      } else if (status === 'success') {
        const msg = (els && els.errors && els.errors.textContent) ? els.errors.textContent : '';
        validatorEl.textContent = msg || 'OK';
        validatorEl.className = msg ? 'soql-validator soql-valid' : 'soql-validator placeholder-note';
      } else if (status === 'error') {
        const msg = (els && els.errors && els.errors.textContent) ? els.errors.textContent : 'Error';
        validatorEl.textContent = msg;
        validatorEl.className = 'soql-validator soql-error-list';
      } else {
        validatorEl.textContent = '';
        validatorEl.className = 'soql-validator placeholder-note';
      }
    }
  } catch (e) { console.warn && console.warn('setEditorStatus error', e); }
}

function onKeyDown(ev){
  try {
    if ((ev.ctrlKey || ev.metaKey) && ev.key === 'Enter') { ev.preventDefault(); runQuery(); return; }
    if (ev.key === 'Escape') { hintsHide(); }
  } catch (e) { console.warn && console.warn('onKeyDown error', e); }
}

async function runQuery(){
  try {
    if (!els || !els.editor || !els.results) return;
    const q = (els.editor.value || '').trim();
    if (!q) return;
    setEditorStatus('progress');
    try {
      const payload = { action: 'RUN_SOQL', query: q };
      try { if (els.useTooling) payload.useTooling = !!els.useTooling.checked; } catch {}

      // debug: log payload state before attaching session/limit
      try { console.debug && console.debug('runQuery initial payload', { query: payload.query, useTooling: payload.useTooling }); } catch (e) {}

      // Attach instance/session hints when available so the background can use them directly
      try {
        const inst = await getInstanceUrl().catch(() => null);
        if (inst) payload.instanceUrl = inst;
      } catch {}

      try {
        // Try to get session info via the content tab (masked flow). This may return an object like { success, isLoggedIn, instanceUrl, sessionId }.
        let sess = null;
        try {
          // Prefer the helper exposed on window if present (utils wrapper); fallback to utility function
          if (typeof window !== 'undefined' && window.Utils && typeof window.Utils.sendMessageToSalesforceTab === 'function') {
            sess = await window.Utils.sendMessageToSalesforceTab({ action: 'getSessionInfo' });
          } else if (typeof sendMessageToSalesforceTab === 'function') {
            sess = await sendMessageToSalesforceTab({ action: 'getSessionInfo' });
          }
        } catch (e) { sess = null; }
        if (sess && sess.success && sess.isLoggedIn && sess.sessionId) {
          // attach sessionId only when it looks valid. Background will still validate/verify it.
          payload.sessionId = sess.sessionId;
          // ensure instanceUrl matches if available
          try { if (!payload.instanceUrl && sess.instanceUrl) payload.instanceUrl = sess.instanceUrl; } catch {}
        }
      } catch (e) { /* non-fatal */ }

      // Attach limit from the small limit input (or its data-applied) if present.
      try {
        let limitVal = null;
        const applied = (els && els.limit && typeof els.limit.getAttribute === 'function') ? els.limit.getAttribute('data-applied') : null;
        if (applied) {
          const n = Number(applied);
          if (Number.isFinite(n) && n > 0) limitVal = n;
        } else if (els && els.limit) {
          const v = (els.limit.value || '').trim();
          const n = Number(v);
          if (Number.isFinite(n) && n > 0) limitVal = n;
        }
        if (limitVal) payload.limit = limitVal;
        try { console.debug && console.debug('runQuery -> attached limit to payload', payload.limit); } catch (e) {}
      } catch (e) { /* ignore */ }

      // Final debug: show full payload just before sending
      try { console.debug && console.debug('RUN_SOQL payload', payload); } catch (e) {}

      const resp = await new Promise((resolve) => {
        try {
          chrome.runtime.sendMessage(payload, (r) => {
            if (chrome.runtime.lastError) resolve({ success: false, error: String(chrome.runtime.lastError) });
            else resolve(r || null);
          });
        } catch (e) { resolve({ success: false, error: String(e) }); }
      });

      // Clear previous results
      try { clearResults(); } catch {}

      if (!resp) {
        try { if (els.errors) els.errors.textContent = 'No response from background'; } catch {}
        setEditorStatus('error');
        return;
      }

      if (resp.success === false && resp.error) {
        try { if (els.errors) els.errors.textContent = String(resp.error || 'Query failed'); } catch {}
        setEditorStatus('error');
        return;
      }

      // Normalized shape: background returns { totalSize, records }
      const records = Array.isArray(resp.records) ? resp.records : (Array.isArray(resp.data) ? resp.data : []);
      const total = typeof resp.totalSize === 'number' ? resp.totalSize : (Array.isArray(records) ? records.length : 0);

      if (!records || records.length === 0) {
        try { if (els.results) els.results.textContent = 'No records'; } catch {}
        setEditorStatus('success');
        try { if (els.errors) els.errors.textContent = ''; } catch {}
        return;
      }

      try { await renderSoqlResults(records, total); } catch (e) { console.warn && console.warn('renderSoqlResults error', e); try { if (els.results) els.results.textContent = JSON.stringify(records, null, 2); } catch {} }
      setEditorStatus('success');
      try { if (els.errors) els.errors.textContent = ''; } catch {}

    } catch (e) {
      try { if (els.errors) els.errors.textContent = String(e); } catch {}
      setEditorStatus('error');
    }
  } catch (e) { console.warn && console.warn('runQuery top error', e); }
}

// Update the editor's LIMIT clause (or append) when the small limit input is changed
function applyLimitFromDropdown(){
  try {
    if (!els || !els.editor || !els.limit) return;
    const v = (els.limit.value || '').trim();
    // Store the last user selection in a data attribute so other UI can show it if needed.
    if (!v) {
      try { els.limit.removeAttribute('data-applied'); } catch {}
      return;
    }
    const n = Number(v);
    if (!Number.isFinite(n) || n <= 0) return;
    try { els.limit.setAttribute('data-applied', String(n)); } catch {}

    // Update the editor's query to reflect the selected limit: replace existing LIMIT or insert one.
    try {
      const editor = els.editor;
      let q = String(editor.value || '');
      if (!q) return;
      // Remove trailing semicolon for manipulation, we'll re-add if present
      const hasSemicolon = /;\s*$/.test(q);
      if (hasSemicolon) q = q.replace(/;\s*$/, '');

      const limitRe = /\bLIMIT\s+\d+/i;
      const offsetRe = /\bOFFSET\s+\d+/i;

      if (limitRe.test(q)) {
        // Replace existing LIMIT value
        q = q.replace(/\bLIMIT\s+\d+/i, 'LIMIT ' + String(n));
      } else if (offsetRe.test(q)) {
        // If OFFSET exists, insert LIMIT before OFFSET
        q = q.replace(offsetRe, 'LIMIT ' + String(n) + ' $&');
      } else {
        // Append LIMIT at end
        q = q + ' LIMIT ' + String(n);
      }

      if (hasSemicolon) q = q + ';';
      // Apply the modified query back to the editor but preserve caret position roughly at end
      try {
        editor.value = q;
        // Dispatch input event so other listeners (validate/suggestions/sync) run
        try { editor.dispatchEvent(new Event('input', { bubbles: true })); } catch (e) {}
        editor.focus();
        const pos = editor.value.length;
        try { editor.setSelectionRange(pos, pos); } catch {}
      } catch (e) { /* ignore editor update errors */ }
    } catch (e) { /* ignore editor sync errors */ }
  } catch (e) { console.warn && console.warn('applyLimitFromDropdown error', e); }
}

async function renderSoqlResults(records, totalSize){
  try {
    if (!els || !els.results) return;
    els.results.innerHTML = '';
    const container = document.createElement('div');
    container.className = 'soql-results-container';

    const actions = document.createElement('div');
    actions.className = 'actions';
    const appliedLimit = (els && els.limit && els.limit.getAttribute) ? els.limit.getAttribute('data-applied') : null;
    const info = document.createElement('span');
    const shown = Math.min(records.length, totalSize);
    info.textContent = appliedLimit ? `Showing ${shown} of ${totalSize} records (display limit: ${appliedLimit})` : `Showing ${shown} of ${totalSize} records`;
    info.style.marginRight = '8px';
    actions.appendChild(info);

    const copyJsonBtn = document.createElement('button');
    copyJsonBtn.type = 'button';
    copyJsonBtn.textContent = 'Copy JSON';
    copyJsonBtn.addEventListener('click', async () => {
      try { await navigator.clipboard.writeText(JSON.stringify(records, null, 2)); copyJsonBtn.textContent = 'Copied'; setTimeout(()=>copyJsonBtn.textContent='Copy JSON',1200); } catch (e) { console.warn('copy failed', e); }
    });
    actions.appendChild(copyJsonBtn);

    const downloadCsvBtn = document.createElement('button');
    downloadCsvBtn.type = 'button';
    downloadCsvBtn.textContent = 'Download CSV';
    actions.appendChild(downloadCsvBtn);

    const downloadXlsBtn = document.createElement('button');
    downloadXlsBtn.type = 'button';
    downloadXlsBtn.textContent = 'Download Excel';
    actions.appendChild(downloadXlsBtn);

    // Linkify IDs/URLs: always enabled (restore previous behavior). No checkbox in the UI.
    const linkifyEnabled = true;

    container.appendChild(actions);

    // Columns are built via utility
    const cols = buildColumnsUnion(records || []);

    const csvContent = recordsToCsv(records, cols);
    downloadCsvBtn.addEventListener('click', async () => {
      try { downloadCsv(`soql-results-${Date.now()}.csv`, csvContent); } catch (e) { console.warn('download csv failed', e); }
    });

    downloadXlsBtn.addEventListener('click', async () => {
      try { downloadExcel(`soql-results-${Date.now()}.xls`, cols, records); } catch (e) { console.warn('download xls failed', e); }
    });

    // Wrap table in a dedicated wrapper for nicer styling (CSS handles scrolling, header stickiness, zebra rows)
     const instanceBase = await getInstanceUrl().catch(()=>null);

     // Ensure context menu wiring for clickable Ids is present
     try { ensureIdContextMenuWired(); } catch {}

     const tableWrap = document.createElement('div');
     tableWrap.className = 'soql-table-wrap';

     const table = document.createElement('table');
     table.className = 'soql-results-table';
     const thead = document.createElement('thead');
     const thr = document.createElement('tr');
     cols.forEach(c => { const th = document.createElement('th'); th.textContent = c; thr.appendChild(th); });
     thead.appendChild(thr); table.appendChild(thead);

     const tbody = document.createElement('tbody');
     for (const r of (records || [])) {
      const tr = document.createElement('tr');
      for (const c of cols) {
        const td = document.createElement('td');
        const info = linkifyInfoForValue(r && r[c], instanceBase);
        // If linkify produced an actual link (URL or SF id) and linking is enabled, render anchor
        if (info.isLink && linkifyEnabled) {
          const a = document.createElement('a');
          a.href = info.href;
          a.target = '_blank'; a.rel = 'noopener noreferrer';
          a.textContent = info.text || '';
          a.className = 'sf-id-link';
          // If the link text itself is an SF Id, wire context menu to show ID actions (copy/open)
          try {
            const idRe = /^[a-zA-Z0-9]{15,18}$/;
            const txt = String(info.text || '');
            const idMatch = idRe.test(txt) ? txt : null;
            if (idMatch) {
              a.addEventListener('contextmenu', (e) => { try { e.preventDefault(); showIdContextMenu(idMatch, e.clientX || 0, e.clientY || 0); } catch (err) { /* ignore */ } });
              // Also handle middle-click or ctrl/meta-click behavior via normal anchor; no extra handling needed
            }
          } catch (e) { /* ignore */ }
          td.appendChild(a);
        } else {
          // preserve long values while keeping cell layout manageable
          const text = info.text || '';
          // If text looks like a Salesforce Id and we have an instance base, make it a clickable id like other parts of the UI
          try {
            const idRe = /^[a-zA-Z0-9]{15,18}$/;
            if (idRe.test(String(text || '')) && instanceBase) {
              const idStr = String(text);
              const a = document.createElement('a');
              a.href = (instanceBase ? instanceBase.replace(/\/+$/, '') : '') + '/' + encodeURIComponent(idStr);
              a.target = '_blank'; a.rel = 'noopener noreferrer';
              a.textContent = idStr;
              a.className = 'sf-id-link';
              a.addEventListener('contextmenu', (e) => { try { e.preventDefault(); showIdContextMenu(idStr, e.clientX || 0, e.clientY || 0); } catch (err) { /* ignore */ } });
              td.appendChild(a);
            } else if (String(text).includes('\n') || String(text).length > 200) {
              const pre = document.createElement('div');
              pre.className = 'soql-cell-pre';
              pre.textContent = text;
              td.appendChild(pre);
            } else {
              td.textContent = text;
            }
          } catch (e) {
            try { td.textContent = String(info.text || ''); } catch { td.textContent = ''; }
          }
        }
        // add column metadata for targeted styling if needed
        try { td.setAttribute('data-col', String(c)); } catch {}
        tr.appendChild(td);
      }
      tbody.appendChild(tr);
    }
    table.appendChild(tbody);
    tableWrap.appendChild(table);
    container.appendChild(tableWrap);
    els.results.appendChild(container);
   } catch (e) { console.warn && console.warn('renderSoqlResults failed', e); try { els.results.textContent = JSON.stringify(records, null, 2); } catch {} }
}
