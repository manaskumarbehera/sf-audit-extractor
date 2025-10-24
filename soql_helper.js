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
    // Prefer the structured suggestions policy first so the suggester finds it before other tips
    'soql_suggestions_config.json',
    'soql_builder_tips.json'
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

// Attempt to find a suitable editor host element in a variety of environments.
function findEditorElement() {
  try {
    // Preferred: explicit id
    let el = document.getElementById('soql-editor');
    if (el) return el;

    // Common tag/component variants (note: querySelector lowercases tag names)
    el = document.querySelector('soqleditor, soql-editor');
    if (el) return resolveEditorHost(el);

    // Data attributes / classes that some integrations may use
    el = document.querySelector('[data-soql-editor], textarea.soql-editor, .soql-editor, #soqlEditor');
    if (el) return resolveEditorHost(el);

    // As a last-resort, find a visible textarea or contenteditable element that looks like an editor
    const candidate = Array.from(document.querySelectorAll('textarea, input[type="text"], [contenteditable="true"]')).find(c => {
      try {
        const t = (c.value || c.textContent || '').toString();
        // prefer elements that contain SQL keywords or are empty (likely editor)
        return /\bselect\b|\bfrom\b/i.test(t) || t.trim().length === 0;
      } catch { return false; }
    });
    if (candidate) return resolveEditorHost(candidate);
  } catch (e) { /* ignore and return null below */ }
  return null;
}

// Given a host element (could be a custom element), resolve the actual input-like element that carries `.value`
function resolveEditorHost(host) {
  try {
    if (!host) return null;
    // If the host already exposes a value property, use it directly
    if ('value' in host && (typeof host.value === 'string' || typeof host.value === 'number')) return host;

    // If host has a property that looks like an internal editor (common in some frameworks)
    if (host.editor && ('value' in host.editor)) return host.editor;
    if (host.input && ('value' in host.input)) return host.input;

    // Search inside shadow root for a textarea/input/contenteditable
    if (host.shadowRoot) {
      const inner = host.shadowRoot.querySelector('textarea, input[type="text"], [contenteditable="true"]');
      if (inner) return inner;
    }

    // Search children DOM
    if (host.querySelector) {
      const inner = host.querySelector('textarea, input[type="text"], [contenteditable="true"]');
      if (inner) return inner;
    }

    // fallback: return host itself (consumer may still attempt to read/assign .value)
    return host;
  } catch (e) { return host; }
}

// Suggestion subsystem state (added)
let suggesterModule = null;
let suggestionDebounce = null;
const SUGGEST_DEBOUNCE_MS = 250;
// Add a short hide timeout to prevent flicker when suggestions briefly clear
let _suggestHideTimeout = null;
// Sticky suggestion support: remember last shown suggestions and keep UI until a new non-empty set arrives
let _lastShownSuggestions = null;
let _suggestionsSticky = false;
// Editor snapshot used to decide whether changes are significant enough to re-run suggester
let _lastEditorSnapshot = null;
// Threshold of character differences to consider a change "significant" (tunable)
const SUGGEST_STICKY_CHAR_THRESHOLD = 3;
// New: suppression flag — when true, block further suggestion recompute until cleared by user action
let _suppressFurtherRecompute = false;

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
    const objName = (els.obj && els.obj.value) ? String(els.obj.value) : null;

    // If suppression is active, skip recompute entirely (user opted to keep suggestions)
    try {
      if (_suppressFurtherRecompute) {
        console.debug && console.debug('computeAndRenderSuggestions -> suppressed (no recompute)');
        return;
      }
    } catch (e) { /* ignore */ }

    // NOTE: strict suppression policy — once non-empty suggestions are shown we rely on
    // `_suppressFurtherRecompute` to block further recomputes. This avoids noisy recomputes
    // triggered by small edits or caret moves; user can force recompute via Ctrl/Cmd+Space
    // or by applying/hiding suggestions which clears suppression.

    const mod = await loadSuggester();
    if (!mod || typeof mod.suggestSoql !== 'function') { renderSuggestions([]); return; }

    // Debug: log input query, selected object, and initial describe info
    try {
      const qSample = (q || '').length > 500 ? (q || '').slice(0,500) + '...[truncated]' : (q || '');
      console.debug && console.debug('computeAndRenderSuggestions -> input', { querySample: qSample, queryLength: (q||'').length, selectedObject: objName, describeProvided: false });
    } catch (e) { /* ignore logging errors */ }

    // Best-effort describe: none in this helper; pass null
    let describe = null;
    let suggestions = [];
    try {
      // Prefer the API that returns all candidate suggestions so the popup can render multiple
      if (typeof mod.suggestSoqlAll === 'function') {
        console.debug && console.debug('computeAndRenderSuggestions -> calling suggester.suggestSoqlAll');
        try {
          suggestions = await mod.suggestSoqlAll(q, describe, 'soqlEditor') || [];
          const rawPreview = Array.isArray(suggestions) ? suggestions.slice(0,20) : suggestions;
          console.debug && console.debug('computeAndRenderSuggestions -> suggester.suggestSoqlAll returned', { count: Array.isArray(suggestions) ? suggestions.length : (typeof suggestions), preview: rawPreview });
        } catch (e) {
          console.debug && console.debug('computeAndRenderSuggestions -> suggester.suggestSoqlAll threw', e && (e.message || e));
          suggestions = [];
        }
        // If the verbose API produced nothing, fall back to the single-item API
        if ((!Array.isArray(suggestions) || suggestions.length === 0) && typeof mod.suggestSoql === 'function') {
          console.debug && console.debug('computeAndRenderSuggestions -> falling back to suggester.suggestSoql (single)');
          try {
            const top = await mod.suggestSoql(q, describe, 'soqlEditor');
            const preview = Array.isArray(top) ? top.slice(0,20) : (top ? [top] : []);
            console.debug && console.debug('computeAndRenderSuggestions -> suggester.suggestSoql (fallback) returned', { type: Array.isArray(top) ? 'array' : (top ? typeof top : 'none'), preview });
            if (Array.isArray(top)) suggestions = top.slice(0, 10);
            else if (top) suggestions = [top];
            else suggestions = [];
          } catch (e) { console.debug && console.debug('computeAndRenderSuggestions -> suggester.suggestSoql (fallback) threw', e && (e.message || e)); suggestions = []; }
        }
      } else {
        console.debug && console.debug('computeAndRenderSuggestions -> calling suggester.suggestSoql (single)');
        // Only the single-suggestion API available — normalize to array so UI can iterate
        try {
          const s = await mod.suggestSoql(q, describe, 'soqlEditor');
          const preview = Array.isArray(s) ? s.slice(0,20) : (s ? [s] : []);
          console.debug && console.debug('computeAndRenderSuggestions -> suggester.suggestSoql returned', { type: Array.isArray(s) ? 'array' : (s ? typeof s : 'none'), preview });
          suggestions = Array.isArray(s) ? s : (s ? [s] : []);
        } catch (e) { console.debug && console.debug('computeAndRenderSuggestions -> suggester.suggestSoql threw', e && (e.message || e)); suggestions = []; }
      }
    } catch (e) { suggestions = []; }

    // Debug: final surface of suggestions (limited preview)
    try { console.debug && console.debug('computeAndRenderSuggestions -> final suggestions.length=', Array.isArray(suggestions) ? suggestions.length : typeof suggestions, Array.isArray(suggestions) ? suggestions.slice(0,20) : suggestions); } catch (e) {}

    // If we have any non-empty suggestions, suppress further recompute immediately to prevent races
    try {
      if (Array.isArray(suggestions) && suggestions.length > 0) {
        _suppressFurtherRecompute = true;
      } else {
        _suppressFurtherRecompute = false;
      }
    } catch (e) { /* ignore */ }

    // store latest and render
    try { els.hints._latestSuggestions = suggestions; } catch {}
    renderSuggestions(Array.isArray(suggestions) ? suggestions.slice(0, 10) : []);
  } catch (e) { console.warn && console.warn('computeAndRenderSuggestions error', e); renderSuggestions([]); }
}

function scheduleSuggestionCompute(force = false) {
  try {
    if (!force && _suppressFurtherRecompute) {
      // Suppressed: do not schedule a recompute while user opted to keep current suggestions
      console.debug && console.debug('scheduleSuggestionCompute -> suppressed, not scheduling');
      return;
    }
    if (suggestionDebounce) clearTimeout(suggestionDebounce);
    suggestionDebounce = setTimeout(() => { computeAndRenderSuggestions().catch(()=>{}); }, SUGGEST_DEBOUNCE_MS);
  } catch (e) { /* ignore scheduling errors */ }
}

function renderSuggestions(items) {
  try {
    if (!els || !els.hints) return;
    const ul = els.hints;
    // If new items arrived, cancel any pending hide timeout
    try { if (_suggestHideTimeout) { clearTimeout(_suggestHideTimeout); _suggestHideTimeout = null; } } catch(e){}

    // If items is empty: respect sticky behavior — keep previous suggestions visible until new non-empty arrives
    if (!items || items.length === 0) {
      if (_suggestionsSticky && Array.isArray(_lastShownSuggestions) && _lastShownSuggestions.length > 0) {
        // Do nothing: keep existing UI intact
        return;
      }
      // Schedule hide after short debounce (200ms). If new suggestions appear before that, cancel.
      _suggestHideTimeout = setTimeout(() => {
        try {
          ul.innerHTML = '';
          ul.classList.add('hidden');
          _lastShownSuggestions = null;
          _suggestionsSticky = false;
          _lastEditorSnapshot = null;
          // Also clear suppression when hints actually hide
          _suppressFurtherRecompute = false;
        } catch (e) { /* ignore */ }
        _suggestHideTimeout = null;
      }, 200);
      return;
    }

    // There are items — if they are identical to what is already shown, do nothing
    try {
      const same = (Array.isArray(_lastShownSuggestions) && _lastShownSuggestions.length === items.length && items.every((it, idx) => {
        const prev = _lastShownSuggestions[idx];
        try {
          if (!prev || !it) return false;
          // Compare by id/text/apply.text if present
          const a = (prev.id || prev.text || (prev.apply && prev.apply.text) || '').toString();
          const b = (it.id || it.text || (it.apply && it.apply.text) || '').toString();
          return a === b;
        } catch (e) { return false; }
      }));
      if (same) {
        // cancel any pending hide and keep sticky
        _suggestionsSticky = true;
        if (ul.classList.contains('hidden')) ul.classList.remove('hidden');
        // Update editor snapshot so the sticky window remains anchored to the latest caret/text
        try {
          const currText = (els.editor && typeof els.editor.value === 'string') ? els.editor.value : '';
          const currCaret = (typeof els.editor.selectionStart === 'number') ? els.editor.selectionStart : currText.length;
          _lastEditorSnapshot = { text: currText, caret: currCaret };
        } catch(e){}
        // Keep suppression active when same suggestions persist
        _suppressFurtherRecompute = true;
        return;
      }
    } catch (e) { /* ignore comparison errors */ }

    // New/different items: render immediately and ensure visible
    ul.innerHTML = '';
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

    // Update sticky state and remember last shown suggestions
    try { _lastShownSuggestions = Array.isArray(items) ? items.slice() : null; } catch (e) { _lastShownSuggestions = null; }
    _suggestionsSticky = true;
    // Capture current editor snapshot so we can decide when to recompute next time
    try {
      const currText = (els.editor && typeof els.editor.value === 'string') ? els.editor.value : '';
      const currCaret = (typeof els.editor.selectionStart === 'number') ? els.editor.selectionStart : currText.length;
      _lastEditorSnapshot = { text: currText, caret: currCaret };
    } catch(e) { _lastEditorSnapshot = null; }
    // New non-empty suggestions shown: suppress further recompute until user clears or applies
    _suppressFurtherRecompute = true;
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
      // Helper: clamp numeric index into [0, cur.length]
      const clamp = (n) => { if (typeof n !== 'number' || Number.isNaN(n)) return null; return Math.max(0, Math.min(cur.length, Math.floor(n))); };
      if (app.type === 'append') {
        next = cur + (app.text || '');
      } else if (app.type === 'replace') {
        // Allow replace ranges where start === end (insert at position), and clamp out-of-bounds values
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
        next = cur + (app.text || '');
      }
      editor.value = next;
      try { editor.focus(); } catch {}
      try { editor.setSelectionRange(editor.value.length, editor.value.length); } catch {}
      validateInline();
      // Clear suppression since user applied a suggestion
      _suppressFurtherRecompute = false;
      hintsHide();
      // re-run suggestions after small delay
      setTimeout(() => { try { computeAndRenderSuggestions().catch(()=>{}); } catch(_){} }, 80);
    } finally {
      try { hintsEl._applying = false; } catch(_){ }
    }
  } catch (e) { console.warn && console.warn('applySuggestionByIndex top error', e); }
}

function hintsHide(){ try { if (els && els.hints) { els.hints.innerHTML = ''; els.hints.classList.add('hidden'); } _lastShownSuggestions = null; _suggestionsSticky = false; _lastEditorSnapshot = null; _suppressFurtherRecompute = false; } catch {} }

function onKeyDown(ev){
  try {
    // Force recompute on Ctrl/Cmd+Space: clear suppression and run suggestions immediately
    if ((ev.ctrlKey || ev.metaKey) && (ev.code === 'Space' || ev.key === ' ')) {
      try { ev.preventDefault(); _suppressFurtherRecompute = false; computeAndRenderSuggestions().catch(()=>{}); } catch(e){}
      return;
    }
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
