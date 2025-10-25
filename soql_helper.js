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
function setEditorStatus(status) {
  try {
    if (!els) return;

    const editor = els.editor;
    if (editor && editor.classList) {
      try {
        for (const cls of EDITOR_STATUS_CLASSES) {
          editor.classList.remove(cls);
        }
      } catch (_) {}
      const cls = EDITOR_STATUS_CLASS_MAP[String(status)] || null;
      if (cls) {
        try { editor.classList.add(cls); } catch (_) {}
      }
    }

    const runBtn = els.run;
    if (runBtn) {
      if (status === 'progress') {
        try { runBtn.disabled = true; } catch (_) {}
        try { runBtn.setAttribute('aria-busy', 'true'); } catch (_) {}
      } else {
        try { runBtn.disabled = false; } catch (_) {}
        try { runBtn.removeAttribute('aria-busy'); } catch (_) {}
      }
    }

    const results = els.results;
    if (results) {
      if (status === 'progress') {
        try { results.setAttribute('aria-busy', 'true'); } catch (_) {}
      } else {
        try { results.removeAttribute('aria-busy'); } catch (_) {}
      }
    }
  } catch (e) { /* ignore status update errors */ }
}

function clearResults(message = 'Running query...') {
  try {
    if (!els || !els.results) return;
    const container = els.results;
    container.innerHTML = '';
    if (message) {
      const placeholder = document.createElement('div');
      placeholder.className = 'placeholder-note';
      placeholder.textContent = String(message);
      container.appendChild(placeholder);
    }
  } catch (e) { /* ignore clear errors */ }
}

const VALIDATE_DEBOUNCE_MS = 140;
let _validateTimer = null;
let _rulesPromise = null;
let _rulesLoadedOnce = false;

function ensureRulesRequested() {
  if (!_rulesPromise) {
    _rulesPromise = loadRules()
      .then((loaded) => {
        if (loaded && typeof loaded === 'object') rules = loaded;
        _rulesLoadedOnce = true;
        return rules;
      })
      .catch((err) => {
        try { console.warn && console.warn('soql_helper: failed to load rules', err); } catch (_) {}
        _rulesLoadedOnce = true;
        return rules;
      })
      .then((res) => {
        try { scheduleValidation(); } catch (_) {}
        return res;
      });
  }
  return _rulesPromise;
}

function scheduleValidation() {
  try {
    if (_validateTimer) clearTimeout(_validateTimer);
    _validateTimer = setTimeout(() => {
      _validateTimer = null;
      try { validateInline(); } catch (e) { try { console.warn && console.warn('validateInline error', e); } catch (_) {} }
      try { validateAndRender().catch(()=>{}); } catch(e){}
    }, VALIDATE_DEBOUNCE_MS);
    ensureRulesRequested();
  } catch (e) { /* ignore */ }
}

function validateInline() {
  try {
    if (!els || !els.editor) return;
    ensureRulesRequested();
    const query = typeof els.editor.value === 'string' ? els.editor.value : '';
    const messages = [];

    const validators = (rules && Array.isArray(rules.inlineValidators)) ? rules.inlineValidators : [];
    for (const validator of validators) {
      if (!validator) continue;
      const message = validator.message ? String(validator.message) : '';
      const pattern = validator.pattern;
      if (!pattern || !message) continue;
      let regex = validator._compiledRegex;
      if (!regex) {
        try {
          const flags = typeof validator.flags === 'string' ? validator.flags : 'i';
          regex = new RegExp(pattern, flags);
          validator._compiledRegex = regex;
        } catch (_) {
          continue;
        }
      }
      const matches = regex.test(query);
      const negate = !!validator.negate;
      const passed = negate ? !matches : matches;
      if (!passed) {
        const level = (validator.level || '').toString().toLowerCase();
        if (level === 'warning') messages.push(`Warning: ${message}`);
        else messages.push(message);
      }
    }

    const fieldsMacroError = validateFieldsMacro(query);
    if (fieldsMacroError) messages.push(fieldsMacroError);

    renderInlineValidationMessages(messages);
  } catch (e) {
    try { console.warn && console.warn('validateInline top error', e); } catch (_) {}
  }
}

function renderInlineValidationMessages(messages) {
  try {
    if (!els || !els.errors) return;
    const el = els.errors;
    const uniqueMessages = [];
    const seen = new Set();
    for (const raw of Array.isArray(messages) ? messages : []) {
      const text = String(raw || '').trim();
      if (!text) continue;
      if (seen.has(text)) continue;
      seen.add(text);
      uniqueMessages.push(text);
    }

    if (uniqueMessages.length === 0) {
      el.innerHTML = '';
      try { el.classList.remove('soql-error-list'); } catch (_) {}
      if (_rulesLoadedOnce) {
        try { el.classList.add('soql-valid'); } catch (_) {}
      } else {
        try { el.classList.remove('soql-valid'); } catch (_) {}
      }
      return;
    }

    try { el.classList.remove('soql-valid'); } catch (_) {}
    try { el.classList.add('soql-error-list'); } catch (_) {}
    const lis = uniqueMessages.map((msg) => `<li>${escapeHtml(msg)}</li>`).join('');
    el.innerHTML = `<ul class="soql-messages">${lis}</ul>`;
  } catch (e) { /* ignore rendering errors */ }
}

// NOTE: removed duplicate/malformed escapeHtml block here (original caused syntax errors). The canonical escapeHtml is defined later in this file.

ensureRulesRequested();

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

function renderValidatorAreas(messages) {
  try {
    // Deduplicate and sanitize messages while preserving order
    const seen = new Set();
    const out = [];
    for (const m of (messages || [])) {
      try {
        const s = typeof m === 'string' ? m : JSON.stringify(m);
        const trimmed = (s || '').toString().trim();
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
          try { el.classList.remove('soql-error-list'); } catch (_) {}
          try { el.classList.remove('soql-valid'); } catch (_) {}
        } else {
          try { el.classList.remove('soql-valid'); } catch (_) {}
          try { el.classList.add('soql-error-list'); } catch (_) {}
          const lis = out.map(m => `<li>${escapeHtml(m)}</li>`).join('\n');
          el.innerHTML = `<ul class="soql-messages">${lis}</ul>`;
        }
      }
    } catch (e) { /* ignore render errors */ }

    // Also render to the top validator area if present (#soql-validator-top)
    try {
      const topEl = document.getElementById('soql-validator-top');
      if (topEl) {
        // Clear previous content and classes
        try { topEl.innerHTML = ''; } catch(e){}
        try { topEl.classList.remove('soql-error-list'); topEl.classList.remove('soql-valid'); } catch(e){}

        if (!out || out.length === 0) {
          // No messages → show a small positive indicator and green highlight on editor
          try { topEl.classList.add('soql-valid'); } catch(e){}
          try { topEl.textContent = 'No validation issues'; } catch(e){}
          try {
            if (els && els.editor && els.editor.style) {
              els.editor.style.border = '1px solid #4CAF50';
              els.editor.style.boxShadow = '0 0 8px rgba(76,175,80,0.25)';
              try { els.editor.setAttribute('data-validator-status','valid'); } catch(e){}
            }
          } catch (e) { /* ignore styling errors */ }
        } else {
          // We have messages → render a summary with a togglable details list and apply red styling to the editor
          try { topEl.classList.add('soql-error-list'); } catch(e){}
          try {
            if (els && els.editor && els.editor.style) {
              els.editor.style.border = '2px solid #f44336';
              els.editor.style.boxShadow = '0 0 10px rgba(244,67,54,0.28)';
              try { els.editor.setAttribute('data-validator-status','error'); } catch(e){}
            }
          } catch (e) { /* ignore styling errors */ }

          try {
            const summary = document.createElement('div');
            summary.className = 'soql-validator-summary';
            summary.style.display = 'flex';
            summary.style.alignItems = 'center';
            summary.style.justifyContent = 'space-between';
            summary.style.gap = '8px';
            summary.style.marginBottom = '6px';
            summary.style.fontWeight = '600';
            summary.style.color = '#b00020';
            summary.textContent = `${out.length} validation ${out.length === 1 ? 'issue' : 'issues'} found`;

            const btn = document.createElement('button');
            btn.type = 'button';
            btn.textContent = 'Show details';
            btn.style.marginLeft = '8px';
            btn.style.cursor = 'pointer';

            const details = document.createElement('div');
            details.className = 'soql-validator-details';
            details.style.display = 'none';
            details.style.marginTop = '6px';

            const ul = document.createElement('ul');
            ul.className = 'soql-messages';
            ul.style.margin = '0';
            ul.style.paddingLeft = '18px';

            for (const m of out) {
              try {
                const li = document.createElement('li');
                li.innerHTML = escapeHtml(m);
                ul.appendChild(li);
              } catch (e) { /* ignore individual message errors */ }
            }
            details.appendChild(ul);

            btn.addEventListener('click', () => {
              try {
                if (details.style.display === 'none') { details.style.display = ''; btn.textContent = 'Hide details'; }
                else { details.style.display = 'none'; btn.textContent = 'Show details'; }
              } catch (e) { /* ignore toggle errors */ }
            });

            // Place button at the end of the summary
            try { summary.appendChild(btn); } catch(e){}
            try { topEl.appendChild(summary); topEl.appendChild(details); } catch(e){}
          } catch (e) { try { topEl.innerHTML = `<ul class="soql-messages">${out.map(m=>`<li>${escapeHtml(m)}</li>`).join('\n')}</ul>`; } catch(e){} }
        }
      }
    } catch (e) { /* ignore top-level rendering errors */ }
  } catch (e) { /* swallow */ }
}

// Semantic validator runner: load validator module, run it and render results via renderValidatorAreas
async function validateAndRender() {
  try {
    const mod = await loadValidator().catch(() => null);
    if (!mod) return renderValidatorAreas([]);
    if (!els || !els.editor) return;
    const q = String(els.editor.value || '');

    // Best-effort describe: allow popup demo data if provided
    let describe = null;
    try {
      const parts = (typeof mod.parseQueryParts === 'function') ? mod.parseQueryParts(q) : null;
      const obj = (els.obj && els.obj.value) ? String(els.obj.value).trim() : '';
      if (parts && parts.objectName && obj && /account/i.test(obj) && parts.objectName.toLowerCase() === 'account') {
        try { if (typeof window !== 'undefined' && window.demoAccountDescribe) describe = window.demoAccountDescribe; } catch(e){}
      }
    } catch (e) { /* ignore describe heuristics */ }

    try {
      const res = mod.validateSoql(q, describe) || {};
      const rawMsgs = Array.isArray(res.messages) ? res.messages.slice() : [];
      const describeMsgRe = /^Failed to retrieve describe for\s+'?.+?'?$/i;
      // Filter out noisy describe-failure messages and a specific message that conflicts with suggester
      const nonDescribeMsgs = rawMsgs.filter(m => !describeMsgRe.test(String(m || '')));
      const filteredMsgs = nonDescribeMsgs.filter(m => !/^\s*SELECT list is empty\s*$/i.test(String(m || '')));
      renderValidatorAreas(filteredMsgs);
    } catch (e) {
      renderValidatorAreas([`Validator exception: ${String(e)}`]);
    }
  } catch (e) { /* ignore top-level validation errors */ }
}

// Update scheduleValidation to run both rule-backed quick checks and the heavier semantic validator
function scheduleValidation() {
  try {
    if (_validateTimer) clearTimeout(_validateTimer);
    _validateTimer = setTimeout(() => {
      _validateTimer = null;
      try { validateInline(); } catch (e) { try { console.warn && console.warn('validateInline error', e); } catch (_) {} }
      try { validateAndRender().catch(()=>{}); } catch(e){}
    }, VALIDATE_DEBOUNCE_MS);
    ensureRulesRequested();
  } catch (e) { /* ignore */ }
}

