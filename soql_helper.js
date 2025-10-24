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

// Track the most recent object list request so outdated async resolutions can be ignored
let _objectListRequestId = 0;
// Remember last selected object separately for standard vs tooling endpoints so we can restore selection after reloads
const _lastSelectedObjectByEndpoint = { standard: '', tooling: '' };

function isToolingModeEnabled() {
  try { return !!(els && els.useTooling && els.useTooling.checked); }
  catch (_) { return false; }
}

function setObjectPickerStatus(message, { disabled = true } = {}) {
  try {
    if (!els || !els.obj) return;
    const select = els.obj;
    select.innerHTML = '';
    const opt = document.createElement('option');
    opt.value = '';
    opt.textContent = String(message || '');
    if (disabled) opt.disabled = true;
    opt.selected = true;
    select.appendChild(opt);
    select.disabled = !!disabled;
  } catch (e) { /* ignore status update errors */ }
}

async function ensureObjectOptions(forceRefresh = false) {
  try {
    if (!els || !els.obj) return;
    const select = els.obj;
    const useTooling = isToolingModeEnabled();
    const endpointKey = useTooling ? 'tooling' : 'standard';
    const currentValue = (typeof select.value === 'string') ? select.value : '';
    const rememberedValue = _lastSelectedObjectByEndpoint[endpointKey] || '';
    const desiredValue = (rememberedValue || currentValue || '').trim();
    const desiredLower = desiredValue.toLowerCase();
    const requestId = ++_objectListRequestId;

    const applyListToSelect = (list) => {
      if (requestId !== _objectListRequestId) return;
      if (!Array.isArray(list) || list.length === 0) {
        setObjectPickerStatus('No queryable objects found', { disabled: true });
        try { select.removeAttribute('aria-busy'); } catch {}
        return;
      }

      const frag = document.createDocumentFragment();
      const placeholder = document.createElement('option');
      placeholder.value = '';
      placeholder.textContent = 'Select an object';
      placeholder.disabled = true;
      frag.appendChild(placeholder);

      let matchedValue = '';
      for (const obj of list) {
        if (!obj || !obj.name) continue;
        const opt = document.createElement('option');
        opt.value = String(obj.name);
        try {
          const label = obj.label ? String(obj.label) : '';
          if (label && label.toLowerCase() !== String(obj.name).toLowerCase()) {
            opt.textContent = `${label} (${obj.name})`;
          } else {
            opt.textContent = String(obj.name);
          }
        } catch (e) {
          opt.textContent = String(obj.name);
        }
        if (!matchedValue && desiredLower && opt.value.toLowerCase() === desiredLower) {
          matchedValue = opt.value;
          opt.selected = true;
        }
        frag.appendChild(opt);
      }

      select.innerHTML = '';
      select.appendChild(frag);
      select.disabled = false;
      try { select.removeAttribute('aria-busy'); } catch {}

      if (matchedValue) {
        placeholder.selected = false;
        select.value = matchedValue;
        _lastSelectedObjectByEndpoint[endpointKey] = matchedValue;
        try { persistSelectedObjects().catch(()=>{}); } catch(e){}
      } else {
        placeholder.selected = true;
      }
      // After populating, emit a synthetic change so sync/validation handlers run
      try { select.dispatchEvent(new Event('change', { bubbles: true })); } catch (e) {}
    };

    let cachedList = [];
    try {
      if (!forceRefresh && Soql_helper_schema && typeof Soql_helper_schema.getObjects === 'function') {
        cachedList = Soql_helper_schema.getObjects(useTooling) || [];
      }
    } catch (e) { cachedList = []; }

    if (Array.isArray(cachedList) && cachedList.length > 0 && !forceRefresh) {
      applyListToSelect(cachedList);
      return;
    }

    setObjectPickerStatus('Loading objects...', { disabled: true });
    try { select.setAttribute('aria-busy', 'true'); } catch {}

    try {
      await Soql_helper_schema.initSchema(useTooling);
    } catch (err) {
      if (requestId !== _objectListRequestId) return;
      try { console.warn && console.warn('soql_helper: failed to initialize schema', err); } catch {}
      setObjectPickerStatus('Unable to load objects', { disabled: false });
      try { select.removeAttribute('aria-busy'); } catch {}
      return;
    }

    if (requestId !== _objectListRequestId) return;

    let list = [];
    try {
      if (Soql_helper_schema && typeof Soql_helper_schema.getObjects === 'function') {
        list = Soql_helper_schema.getObjects(useTooling) || [];
      }
    } catch (e) { list = []; }

    applyListToSelect(list);
  } catch (e) { /* ignore ensureObjectOptions errors */ }
}

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
    // When used as an event handler, the first argument will be the event object.
    // Treat any non-boolean argument as "no force" while still inspecting the event later.
    let evt = null;
    if (typeof force === 'object' && force) {
      evt = force;
      force = false;
    }
    if (typeof force !== 'boolean') force = false;

    if (!els || !els.editor) return;

    if (!force && _suppressFurtherRecompute) {
      const shouldOverride = shouldUnsuppressSuggestions(evt);
      if (!shouldOverride) {
        console.debug && console.debug('scheduleSuggestionCompute -> suppressed, not scheduling');
        return;
      }
      _suppressFurtherRecompute = false;
    }
    if (suggestionDebounce) clearTimeout(suggestionDebounce);
    suggestionDebounce = setTimeout(() => { computeAndRenderSuggestions().catch(()=>{}); }, SUGGEST_DEBOUNCE_MS);
  } catch (e) { /* ignore scheduling errors */ }
}

function shouldUnsuppressSuggestions(evt) {
  try {
    if (!els || !els.editor) return false;
    const editor = els.editor;
    const snapshot = _lastEditorSnapshot;
    const currText = (editor && typeof editor.value === 'string') ? editor.value : '';
    const currCaret = (editor && typeof editor.selectionStart === 'number') ? editor.selectionStart : currText.length;

    if (!snapshot) return true;

    const prevText = (snapshot && typeof snapshot.text === 'string') ? snapshot.text : '';
    const prevCaret = (snapshot && typeof snapshot.caret === 'number') ? snapshot.caret : prevText.length;

    const lengthDelta = Math.abs(currText.length - prevText.length);
    const caretDelta = Math.abs(currCaret - prevCaret);
    const changeMagnitude = estimateTextChangeMagnitude(prevText, currText);

    const threshold = Math.max(1, Number.isFinite(SUGGEST_STICKY_CHAR_THRESHOLD) ? SUGGEST_STICKY_CHAR_THRESHOLD : 3);

    // Pointer interactions are intentional context switches; resume suggestions even for small caret moves
    if (evt && typeof evt === 'object') {
      const type = evt.type || '';
      if (type === 'click' || type === 'mouseup') {
        return caretDelta > 0 || changeMagnitude > 0;
      }
      if (type === 'keyup') {
        const key = evt.key || evt.code || '';
        if (['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home','End','PageUp','PageDown'].includes(key)) {
          return caretDelta > 0;
        }
      }
      if (type === 'focus') {
        return caretDelta > 0 || changeMagnitude > 0;
      }
    }

    if (lengthDelta >= threshold) return true;
    if (changeMagnitude >= threshold) return true;
    if (caretDelta >= threshold) return true;

    return false;
  } catch (e) {
    // In case of unexpected errors, err on the side of recomputing to avoid stale suggestions
    return true;
  }
}

function estimateTextChangeMagnitude(prevText, currText) {
  try {
    const prev = typeof prevText === 'string' ? prevText : '';
    const curr = typeof currText === 'string' ? currText : '';
    if (prev === curr) return 0;

    const prevLen = prev.length;
    const currLen = curr.length;
    const minLen = Math.min(prevLen, currLen);

    let prefix = 0;
    while (prefix < minLen && prev.charCodeAt(prefix) === curr.charCodeAt(prefix)) prefix++;

    let suffix = 0;
    while (suffix < (minLen - prefix) && prev.charCodeAt(prevLen - 1 - suffix) === curr.charCodeAt(currLen - 1 - suffix)) {
      suffix++;
    }

    return Math.max(prevLen, currLen) - prefix - suffix;
  } catch (e) {
    return Math.max(1, Number.isFinite(SUGGEST_STICKY_CHAR_THRESHOLD) ? SUGGEST_STICKY_CHAR_THRESHOLD : 3);
  }
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

// Safe helper to update the editor UI status used by runQuery and other workflows.
function setEditorStatus(state, message) {
  try {
    if (!els) return;
    // Update editor attributes to reflect status
    try {
      if (els.editor && typeof els.editor.setAttribute === 'function') {
        try { els.editor.setAttribute('data-status', String(state || '') ); } catch(e){}
        if (state === 'progress') {
          try { els.editor.setAttribute('aria-busy', 'true'); } catch(e){}
        } else {
          try { els.editor.removeAttribute('aria-busy'); } catch(e){}
        }
      }
    } catch(e){}

    // Update a small errors area when in error state
    try {
      if (els.errors && typeof els.errors.textContent === 'string') {
        if (state === 'error') {
          try { els.errors.textContent = (message == null) ? (els.errors.textContent || 'Error') : String(message); } catch(e){}
        } else if (state === 'success') {
          try { els.errors.textContent = ''; } catch(e){}
        }
      }
    } catch(e){}

    // Optionally set a visual marker on results area
    try {
      if (els.results && typeof els.results.setAttribute === 'function') {
        try { els.results.setAttribute('data-status', String(state || '')); } catch(e){}
      }
    } catch(e){}
  } catch (e) { /* swallow */ }
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

// Initialization: populate `els` and wire DOM handlers. Also expose an ensureInitOnce function
// so popup fallback can call into the real helper and clean up its listeners.
(function(){
  function ensureInitOnce(){
    try {
      if (typeof window !== 'undefined') {
        try { window.__soql_helper_loaded = true; } catch(e){}
        try { window.__soql_helper_ensureInitOnce = ensureInitOnce; } catch(e){}
        try { if (typeof setEditorStatus === 'function') window.setEditorStatus = setEditorStatus; } catch(e){}
      }
      if (initialized) return;
      initialized = true;

      // Populate element references (best-effort)
      try { els.editor = qs('soql-editor') || findEditorElement(); } catch(e) { els.editor = els.editor || null; }
      try { els.hints = qs('soql-hints'); } catch(e) { els.hints = els.hints || null; }
      try { els.errors = qs('soql-errors'); } catch(e) { els.errors = els.errors || null; }
      try { els.obj = qs('soql-obj'); } catch(e) { els.obj = els.obj || null; }
      try { els.run = qs('soql-run'); } catch(e) { els.run = els.run || null; }
      try { els.clear = qs('soql-clear'); } catch(e) { els.clear = els.clear || null; }
      try { els.limit = qs('soql-limit'); } catch(e) { els.limit = els.limit || null; }
      try { els.results = qs('soql-results'); } catch(e) { els.results = els.results || null; }
      try { els.autoFill = qs('soql-auto-fill'); } catch(e) { els.autoFill = els.autoFill || null; }
      try { els.debug = qs('soql-debug'); } catch(e) { els.debug = els.debug || null; }
      try { els.debugToggle = qs('soql-debug-toggle'); } catch(e) { els.debugToggle = els.debugToggle || null; }
      try { els.useTooling = qs('soql-use-tooling'); } catch(e) { els.useTooling = els.useTooling || null; }

      // Wire editor events
      try {
        if (els.editor) {
          try { els.editor.addEventListener('blur', scheduleValidation); } catch(e){}
          try { els.editor.addEventListener('input', scheduleSuggestionCompute); } catch(e){}
          try { els.editor.addEventListener('input', scheduleSyncFromEditor); } catch(e){}
          try { els.editor.addEventListener('keyup', scheduleSuggestionCompute); } catch(e){}
          try { els.editor.addEventListener('keyup', scheduleSyncFromEditor); } catch(e){}
          try { els.editor.addEventListener('focus', scheduleSuggestionCompute); } catch(e){}
          try { els.editor.addEventListener('click', scheduleSuggestionCompute); } catch(e){}
          try { els.editor.addEventListener('keydown', onKeyDown); } catch(e){}
        }
      } catch(e){}

      // Run / clear / limit handlers
      try { if (els.run) { els.run.addEventListener('click', runQuery); els.run.addEventListener('click', scheduleSuggestionCompute); } } catch(e){}
      try { if (els.clear) { els.clear.addEventListener('click', () => { try { if (els.editor) { els.editor.value = ''; scheduleValidation(); scheduleSuggestionCompute(true); } } catch(e){} }); } } catch(e){}
      try { if (els.limit) els.limit.addEventListener('change', applyLimitFromDropdown); } catch(e){}

      // Switching between standard and tooling endpoints requires a fresh object list and validation
      try {
        if (els.useTooling) {
          els.useTooling.addEventListener('change', () => {
            try { ensureObjectOptions(true); } catch (e) { /* ignore */ }
            try { scheduleValidation(); } catch (e) { /* ignore */ }
            try { scheduleSuggestionCompute(true); } catch (e) { /* ignore */ }
          });
        }
      } catch (e) { /* ignore */ }

      // Object-picker: clear suppression and force recompute on change so suggerstions update promptly
      try {
        if (els.obj) {
          els.obj.addEventListener('change', (ev) => {
            try {
              // Always clear suppression when object picker changes
              _suppressFurtherRecompute = false;
              try {
                const key = isToolingModeEnabled() ? 'tooling' : 'standard';
                _lastSelectedObjectByEndpoint[key] = String(els.obj.value || '');
                try { persistSelectedObjects().catch(()=>{}); } catch(e){}
              } catch (e) { /* ignore */ }
              // If the editor already contains a FROM clause, replace it; otherwise optionally auto-fill
              try {
                const name = String(els.obj.value || '').trim();
                if (name && els.editor) {
                  const hasFrom = /\bfrom\b/i.test(String(els.editor.value || ''));
                  if (hasFrom) {
                    replaceFromObjectInEditor(name);
                  } else if (els.autoFill && els.autoFill.checked && (els.editor.value || '').trim().length === 0) {
                    els.editor.value = `SELECT Id, Name FROM ${name}`;
                    try { els.editor.dispatchEvent(new Event('input', { bubbles: true })); } catch(e){}
                  }
                }
              } catch(e){}
               // Re-run validation and force suggestion recompute
               try { scheduleValidation(); } catch(e){}
               try { scheduleSuggestionCompute(true); } catch(e){}
            } catch (e) { /* ignore */ }
          });
        }
      } catch (e) { /* ignore */ }

      // Ensure the object dropdown is populated on first load
      try { ensureObjectOptions(); } catch (e) { /* ignore */ }
      // Sync controls from initial editor content (limit, object) after elements wired
      try { scheduleSyncFromEditor(true); } catch (e) { /* ignore */ }

      // Kick off an initial suggestion compute so UI populates quickly
      try { scheduleSuggestionCompute(); } catch(e){}

    } catch (e) { /* ignore */ }
  }

  // Auto-init when DOM is ready and also respond to custom soql-load events from the popup fallback
  try {
    if (document.readyState === 'complete' || document.readyState === 'interactive') {
      setTimeout(ensureInitOnce, 0);
    } else {
      document.addEventListener('DOMContentLoaded', ensureInitOnce);
    }
    document.addEventListener('soql-load', ensureInitOnce);
  } catch (e) { /* ignore */ }
})();

// Persistence for last selected object per endpoint
async function loadPersistedSelectedObjects() {
  try {
    // Try Chrome storage first
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local && typeof chrome.storage.local.get === 'function') {
      const res = await new Promise((resolve) => {
        try { chrome.storage.local.get('soql_last_selected_object_by_endpoint', (r) => resolve(r || {})); }
        catch (e) { resolve({}); }
      });
      const saved = res && res['soql_last_selected_object_by_endpoint'] ? res['soql_last_selected_object_by_endpoint'] : null;
      if (saved && typeof saved === 'object') {
        try { _lastSelectedObjectByEndpoint.standard = String(saved.standard || ''); } catch(e){}
        try { _lastSelectedObjectByEndpoint.tooling = String(saved.tooling || ''); } catch(e){}
      }
      return;
    }
    // Fallback: window.localStorage if available
    if (typeof localStorage !== 'undefined') {
      const s = localStorage.getItem('soql_last_selected_object_by_endpoint');
      if (s) {
        try {
          const parsed = JSON.parse(s);
          if (parsed && typeof parsed === 'object') {
            _lastSelectedObjectByEndpoint.standard = String(parsed.standard || '');
            _lastSelectedObjectByEndpoint.tooling = String(parsed.tooling || '');
          }
        } catch (e) { /* ignore JSON errors */ }
      }
    }
  } catch (e) { /* ignore */ }
}

async function persistSelectedObjects() {
  try {
    const payload = { standard: _lastSelectedObjectByEndpoint.standard || '', tooling: _lastSelectedObjectByEndpoint.tooling || '' };
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local && typeof chrome.storage.local.set === 'function') {
      try {
        await new Promise((resolve) => {
          try { chrome.storage.local.set({ 'soql_last_selected_object_by_endpoint': payload }, () => resolve(true)); }
          catch (e) { resolve(false); }
        });
        return;
      } catch (e) { /* ignore chrome set error */ }
    }
    if (typeof localStorage !== 'undefined') {
      try { localStorage.setItem('soql_last_selected_object_by_endpoint', JSON.stringify(payload)); } catch (e) { /* ignore */ }
    }
  } catch (e) { /* ignore */ }
}

// Validation helpers
let validatorModule = null;
let _validationDebounceTimer = null;
const VALIDATION_DEBOUNCE_MS = 300;

async function loadValidator() {
  if (validatorModule) return validatorModule;
  try {
    const mod = await import('./soql_semantic_validator.js');
    validatorModule = mod;
    return validatorModule;
  } catch (e) {
    console.warn && console.warn('soql_helper: failed to load validator', e);
    validatorModule = null;
    return null;
  }
}

function escapeHtml(s) {
  try {
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
  } catch (e) { return String(s); }
}

function renderValidatorAreas(messages) {
  try {
    // Deduplicate and sanitize messages while preserving order
    const seen = new Set();
    const out = [];
    for (const m of (messages || [])) {
      try {
        const s = typeof m === 'string' ? m : JSON.stringify(m);
        const trimmed = s.trim();
        if (!trimmed) continue;
        if (seen.has(trimmed)) continue;
        seen.add(trimmed);
        out.push(trimmed);
      } catch (e) { /* ignore per-message errors */ }
    }

    // Render into the inline errors panel (#soql-errors) if present
    try {
      if (els && els.errors) {
        const el = els.errors;
        if (!out || out.length === 0) {
          el.innerHTML = '';
          el.classList.remove('soql-error-list');
          el.classList.remove('soql-valid');
        } else {
          el.classList.remove('soql-valid');
          el.classList.add('soql-error-list');
          const lis = out.map(m => `<li>${escapeHtml(m)}</li>`).join('\n');
          el.innerHTML = `<ul class="soql-messages">${lis}</ul>`;
        }
      }
    } catch (e) { /* ignore render errors */ }

    // Also render to the top validator area if present (#soql-validator-top)
    try {
      const topEl = document.getElementById('soql-validator-top');
      if (topEl) {
        if (!out || out.length === 0) {
          topEl.innerHTML = '';
          topEl.classList.remove('soql-error-list');
          topEl.classList.remove('soql-valid');
        } else {
          topEl.classList.remove('soql-valid');
          topEl.classList.add('soql-error-list');
          const lis = out.map(m => `<li>${escapeHtml(m)}</li>`).join('\n');
          topEl.innerHTML = `<ul class="soql-messages">${lis}</ul>`;
        }
      }
    } catch (e) { /* ignore */ }
  } catch (e) { /* ignore */ }
}

function validateInline() {
  try {
    if (!els || !els.editor) return;
    const q = String(els.editor.value || '');
    const msgs = [];

    // Quick: FIELDS() macro guard from utils
    try {
      const fm = validateFieldsMacro(q);
      if (fm) msgs.push(fm);
    } catch (e) { /* ignore field-macro errors */ }

    // Load rules in background if not already loaded so future inline validators run
    try { if (!rules || Object.keys(rules).length === 0) { loadRules().catch(() => {}); } } catch (e) {}

    // Run lightweight inline validators from rules.inlineValidators (if present)
    try {
      const inline = (rules && Array.isArray(rules.inlineValidators)) ? rules.inlineValidators : [];
      for (const v of inline) {
        try {
          const pattern = v && v.pattern ? String(v.pattern) : null;
          if (!pattern) continue;
          const negate = !!v.negate;
          let re = null;
          try { re = new RegExp(pattern, 'i'); } catch (e) { re = null; }
          const matches = re ? re.test(q) : false;
          // If negate=false then message is shown when pattern DOES NOT match
          // If negate=true then message is shown when pattern DOES match
          const shouldReport = (!negate && !matches) || (negate && matches);
          if (shouldReport) {
            const m = v.message || v.msg || v.id || 'Validation failed';
            msgs.push(String(m));
          }
        } catch (e) { /* ignore per-validator */ }
      }
    } catch (e) { /* ignore */ }

    // Deduplicate and sanitize messages before rendering
    try { renderValidatorAreas(msgs); } catch (e) { /* ignore */ }

    // Also schedule full async validation (which may show richer messages) shortly
    try { scheduleValidation(); } catch (e) { /* ignore */ }
  } catch (e) { /* swallow */ }
}

async function validateAndRender() {
  try {
    if (!els || !els.editor) return;
    const q = els.editor.value || '';

    const mod = await loadValidator();
    if (!mod || typeof mod.validateSoql !== 'function') {
      renderValidatorAreas([`Failed to load validator module`]);
      return;
    }

    // Provide a best-effort describe when Account is selected and query mentions Account
    let describe = null;
    try {
      const parts = (typeof mod.parseQueryParts === 'function') ? mod.parseQueryParts(q) : null;
      const obj = (els.obj && els.obj.value) ? String(els.obj.value).trim() : '';
      if (parts && parts.objectName && obj && /account/i.test(obj) && parts.objectName.toLowerCase() === 'account') {
        // Attempt to use demo describe from popup fallback if available
        try { if (typeof window !== 'undefined' && window.demoAccountDescribe) describe = window.demoAccountDescribe; } catch(e){}
        // Otherwise, leave describe null (validator may still run)
      }
    } catch(e){}

    try {
      const res = mod.validateSoql(q, describe) || {};
      const rawMsgs = Array.isArray(res.messages) ? res.messages.slice() : [];
      const describeMsgRe = /^Failed to retrieve describe for\s+'?.+?'?$/i;
      // Filter out describe-failure noise and the specific 'SELECT list is empty' message which conflicts with suggester
      const nonDescribeMsgs = rawMsgs.filter(m => !describeMsgRe.test(String(m || '')));
      const filteredMsgs = nonDescribeMsgs.filter(m => !/^\s*SELECT list is empty\s*$/i.test(String(m || '')));
      renderValidatorAreas(filteredMsgs);
    } catch (e) {
      renderValidatorAreas([`Validator exception: ${String(e)}`]);
    }
  } catch (e) { /* ignore top-level validation errors */ }
}

function scheduleValidation() {
  try {
    if (_validationDebounceTimer) clearTimeout(_validationDebounceTimer);
    _validationDebounceTimer = setTimeout(() => { try { validateAndRender().catch(()=>{}); } catch(_){} }, VALIDATION_DEBOUNCE_MS);
  } catch (e) { /* ignore */ }
}

function clearResults() {
  try {
    if (els && els.results) {
      try { els.results.innerHTML = ''; } catch(e){}
      try { els.results.textContent = ''; } catch(e){}
      try { els.results.removeAttribute('data-status'); } catch(e){}
    }
    try { if (els && els.errors) { els.errors.textContent = ''; els.errors.innerHTML = ''; } } catch(e){}
    try { const topEl = document.getElementById('soql-validator-top'); if (topEl) { topEl.textContent = ''; topEl.innerHTML = ''; } } catch(e){}
    try { setEditorStatus(''); } catch(e){}
  } catch (e) { /* ignore */ }
}

// Editor <-> controls synchronization helpers
let _syncDebounceTimer = null;
const SYNC_DEBOUNCE_MS = 200;

function parseObjectNameFromQuery(q) {
  try {
    if (!q || typeof q !== 'string') return null;
    // Simple heuristic: find first top-level FROM <identifier>
    // This will pick up subquery FROMs too, but it's acceptable for a best-effort sync.
    const m = q.match(/\bFROM\s+([A-Za-z0-9_.]+)/i);
    if (m && m[1]) return m[1];
    return null;
  } catch (e) { return null; }
}

function parseLimitFromQuery(q) {
  try {
    if (!q || typeof q !== 'string') return null;
    const m = q.match(/\bLIMIT\s+(\d+)/i);
    if (m && m[1]) return Number(m[1]);
    return null;
  } catch (e) { return null; }
}

function setSelectValueIgnoreCase(select, value) {
  try {
    if (!select || !value) return false;
    const v = String(value);
    // Try exact first
    for (const opt of Array.from(select.options || [])) {
      try { if (opt.value === v) { select.value = v; return true; } } catch(e){}
    }
    // Fallback: case-insensitive match
    for (const opt of Array.from(select.options || [])) {
      try { if (String(opt.value).toLowerCase() === v.toLowerCase()) { select.value = opt.value; return true; } } catch(e){}
    }
    return false;
  } catch (e) { return false; }
}

function syncEditorControls(force = false) {
  try {
    if (!els || !els.editor) return;
    const q = String(els.editor.value || '');
    const objName = parseObjectNameFromQuery(q);
    const limitVal = parseLimitFromQuery(q);

    // Sync object select
    try {
      if (els.obj && objName) {
        const changed = setSelectValueIgnoreCase(els.obj, objName);
        if (changed) {
          try { const key = isToolingModeEnabled() ? 'tooling' : 'standard'; _lastSelectedObjectByEndpoint[key] = String(els.obj.value || ''); } catch(e){}
        }
      }
    } catch (e) {}

    // Sync limit control
    try {
      if (els && els.limit) {
        if (Number.isFinite(limitVal) && limitVal > 0) {
          try { els.limit.value = String(limitVal); } catch(e){}
          try { els.limit.setAttribute('data-applied', String(limitVal)); } catch(e){}
        } else {
          // No explicit limit in query -> clear applied data attribute but don't clear user's typed value
          try { els.limit.removeAttribute('data-applied'); } catch(e){}
        }
      }
    } catch (e) {}

  } catch (e) { /* ignore */ }
}

function scheduleSyncFromEditor(force = false) {
  try {
    if (_syncDebounceTimer) clearTimeout(_syncDebounceTimer);
    if (force) {
      try { syncEditorControls(true); } catch(e){}
      return;
    }
    _syncDebounceTimer = setTimeout(() => { try { syncEditorControls(false); } catch(e){} }, SYNC_DEBOUNCE_MS);
  } catch (e) { /* ignore */ }
}

function replaceFromObjectInEditor(newName) {
  try {
    if (!els || !els.editor) return false;
    const q = String(els.editor.value || '');
    if (!/\bfrom\b/i.test(q)) return false;
    // Replace the first occurrence of FROM <identifier> with FROM <newName>
    const replaced = q.replace(/(\bFROM\s+)([A-Za-z0-9_.]+)/i, function(_, p1) {
      return p1 + newName;
    });
    if (replaced !== q) {
      try {
        els.editor.value = replaced;
        // Dispatch input event so other listeners react
        try { els.editor.dispatchEvent(new Event('input', { bubbles: true })); } catch(e){}
      } catch(e){}
      return true;
    }
    return false;
  } catch (e) { return false; }
}

// Initialization: load persisted state and then rules, to avoid flicker
(async function initPersistedStateAndRules() {
  try {
    // Load persisted last-selected objects (if any)
    await loadPersistedSelectedObjects();

    // Then load rules (which may depend on persisted state for initial suggestions)
    await loadRules();
  } catch (e) { /* ignore */ }
})();
