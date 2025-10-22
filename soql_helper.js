import { Soql_helper_schema } from './soql_helper_schema.js';
import { Soql_helper_storage } from './soql_helper_storage.js';
import { validateSoql, parseQueryParts } from './soql_semantic_validator.js';
import {
  // parse/context
  getClauseAtCursor,
  getSelectPhase,
  getFromPhase,
  getGroupByPhase,
  getWherePhase,
  getOrderByPhase,
  prefixFilter,
  // schema
  getFieldsForObject,
  getRelationshipMeta,
  getFieldsForRelationship,
  filterRelationshipCompletions,
  buildKeyPrefixMap,
  getObjectLabelByKeyPrefix,
  // id/data
  isSalesforceIdValue,
  getByPath,
  // exports
  parseSelectItem,
  toCSV,
  toExcelHTML,
  // SF/Chrome
  getInstanceUrl,
  openRecordInNewTab,
  // misc
  fallbackCopyText
} from './soql_helper_utils.js';

let initialized = false;
let rules = {};

async function loadRules(){
  try {
    const res = await fetch(new URL('./rules/soqlRules.json', import.meta.url));
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    rules = await res.json();
  } catch (e) {
    console.error('Failed to load SOQL rules, using fallbacks', e);
    rules = {
      keywords: ["SELECT","FROM","WHERE","GROUP BY","HAVING","ORDER BY","LIMIT","OFFSET","ASC","DESC","NULLS FIRST","NULLS LAST"],
      operators: ["=","!=","<","<=",">",">=","LIKE","IN","NOT IN","INCLUDES","EXCLUDES"],
      inlineValidators: [
        { id: 'requireSelectFrom', level: 'error', pattern: "^\\s*select\\b[\\s\\S]*\\bfrom\\b", negate: false, message: 'A SOQL query requires SELECT ... FROM ...' }
      ],
      suggestionProviders: {
        suggestLimitValues: { samples: ["10","50","100","200","500","2000"] },
        suggestOffsetValues: { samples: ["0","10","100","500"] }
      }
    };
  }
}

function qs(id) { return document.getElementById(id); }

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
  debugToggle: null
};

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
  } catch {}
}

let hintItems = [];
let activeHint = -1;

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
  try {
    await Soql_helper_schema.initSchema();
    buildKeyPrefixMap();
  } catch { buildKeyPrefixMap(); }
  populateObjectPicker();
  // Load recent query if any
  try {
    const recent = await Soql_helper_storage.loadRecent();
    if (recent && recent[0] && els.editor) els.editor.value = recent[0];
  } catch {}
  // Load auto-fill preference
  try {
    if (els.autoFill && chrome?.storage?.local?.get) {
      const pref = await chrome.storage.local.get({ soqlAutoFill: false });
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
}

function populateObjectPicker(){
  const list = Soql_helper_schema.getObjects();
  els.obj.innerHTML = '';
  if (!list || list.length === 0) {
    const o = document.createElement('option'); o.textContent = '\u2014 none \u2014'; els.obj.appendChild(o); return;
  }
  list.forEach(it => {
    const o = document.createElement('option');
    o.value = it.name;
    o.textContent = `${it.label || it.name} (${it.name})`;
    els.obj.appendChild(o);
  });
}

function wireEvents(){
  if (!els.editor) return;
  els.editor.addEventListener('keydown', onKeyDown);
  els.editor.addEventListener('input', () => { validateInline(); suggestFromContext(); updateDebugOverlay(); });
  els.editor.addEventListener('focus', () => { suggestFromContext(); updateDebugOverlay(); });
  els.editor.addEventListener('keyup', () => { updateDebugOverlay(); });
  els.editor.addEventListener('click', () => { updateDebugOverlay(); });
  els.editor.addEventListener('mouseup', () => { updateDebugOverlay(); });
  els.hints.addEventListener('mousedown', (e)=>{ e.preventDefault(); });
  els.run.addEventListener('click', runQuery);
  els.clear.addEventListener('click', () => { els.editor.value=''; clearResults(); hintsHide(); els.errors.textContent=''; updateDebugOverlay(); });
  els.obj.addEventListener('change', () => { handleObjectChange(); updateDebugOverlay(); });
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

function handleObjectChange(){
  if (!els.obj || !els.editor) return;
  const obj = (els.obj.value || '').trim();
  if (!obj) { suggestFromContext(); return; }
  const current = (els.editor.value || '').trim();
  const autoRe = /^select\s+id\s+from\s+[A-Za-z_][A-Za-z0-9_]*(?:__(?:c|kav|x))?\s*;?$/i;
  const template = `SELECT Id FROM ${obj}`;
  const force = !!(els.autoFill && els.autoFill.checked);
  if (force || !current || autoRe.test(current)) {
    els.editor.value = template;
    const caret = els.editor.value.length;
    els.editor.focus();
    els.editor.setSelectionRange(caret, caret);
  }
  validateInline();
  suggestFromContext();
}

function onKeyDown(e){
  if ((e.ctrlKey||e.metaKey) && e.key === 'Enter') { e.preventDefault(); runQuery(); return; }
  if (hintsVisible()) {
    if (e.key === 'ArrowDown') { e.preventDefault(); moveHint(1); return; }
    if (e.key === 'ArrowUp') { e.preventDefault(); moveHint(-1); return; }
    if (e.key === 'Tab' || e.key === 'Enter') { e.preventDefault(); commitActiveHint(); return; }
    if (e.key === 'Escape') { hintsHide(); }
  }
}

function getTokenAtCursor(){
  const pos = els.editor.selectionStart;
  const txt = els.editor.value;
  let start = pos, end = pos;
  while (start>0 && /[A-Za-z0-9_.]/.test(txt[start-1])) start--;
  while (end < txt.length && /[A-Za-z0-9_.]/.test(txt[end])) end++;
  const token = txt.slice(start, end);
  return { token, start, end, pos };
}

function getObjectNameFromEditor() {
  try {
    const txt = els.editor?.value || '';
    const m = txt.match(/\bFROM\s+([A-Za-z_][A-Za-z0-9_]*(?:__(?:c|kav|x))?)/i);
    if (m) return m[1];
  } catch {}
  return els.obj?.value || '';
}

function basicDateLiterals() {
  return ['TODAY','YESTERDAY','LAST_N_DAYS:7','THIS_MONTH'];
}

function updateDebugOverlay(){
  try {
    if (!els.debug || !els.editor) return;
    const q = els.editor.value || '';
    const pos = els.editor.selectionStart || 0;
    const clause = getClauseAtCursor(q, pos);
    let phase = '';
    switch (clause) {
      case 'SELECT': phase = getSelectPhase(q, pos); break;
      case 'FROM': phase = getFromPhase(q, pos); break;
      case 'WHERE': phase = getWherePhase(q, pos); break;
      case 'GROUP BY': phase = getGroupByPhase(q, pos); break;
      case 'ORDER BY': phase = getOrderByPhase(q, pos); break;
      case 'HAVING': phase = 'COND'; break;
      case 'LIMIT': phase = 'VALUE'; break;
      case 'OFFSET': phase = 'VALUE'; break;
      case 'START': phase = 'BEGIN'; break;
      default: phase = ''; break;
    }
    const tok = (getTokenAtCursor().token || '').trim();
    const obj = getObjectNameFromEditor();
    els.debug.textContent = `Clause: ${clause} | Phase: ${phase || '-'} | Token: ${tok || '\u2205'} | Object: ${obj || '\u2205'}`;
  } catch {}
}

async function suggestFromContext(){
  const { token, pos } = (function(){
    const t = getTokenAtCursor();
    return { token: t.token, pos: t.pos };
  })();
  const t = token.trim();
  const q = els.editor?.value || '';
  const clause = getClauseAtCursor(q, pos);
  const objectName = getObjectNameFromEditor();
  const suggestions = [];

  // Helper: push unique
  function pushMany(arr, kind) {
    for (const a of arr) {
      if (!a) continue;
      if (typeof a === 'string') suggestions.push(a);
      else suggestions.push(Object.assign({ kind: kind || a.kind }, a));
    }
  }

  const nextKeywords = ['WHERE','GROUP BY','HAVING','ORDER BY','LIMIT','OFFSET'];

  // Relationship-aware helpers
  async function addRelationshipNameSuggestions(prefixToken){
    const meta = await getRelationshipMeta(objectName || els.obj?.value || '');
    const base = Array.from(meta.relNames || []);
    // propose relName. items
    const relWithDot = base.map(r => `${r}.`);
    pushMany(prefixFilter(relWithDot, prefixToken || ''));
  }

  async function addRelationshipFieldSuggestions(prefixToken){
    // If token contains a dot, try to complete the right-hand side
    const dot = prefixToken.indexOf('.');
    if (dot <= 0) return;
    const rel = prefixToken.slice(0, dot);
    const after = prefixToken.slice(dot+1);
    const list = await getFieldsForRelationship(objectName || els.obj?.value || '', rel);
    const filtered = filterRelationshipCompletions(rel, after, list);
    pushMany(filtered);
  }

  // Clause-aware suggestions
  if (clause === 'START' || clause === 'SELECT') {
    const selPhase = getSelectPhase(q, pos);
    if (clause === 'START') pushMany(prefixFilter((rules.keywords||[]).map(k=>({label:k, insertText:k})), t));
    if (selPhase === 'FROM') { pushMany(prefixFilter(['FROM'], t)); }

    // Macros
    const macros = (rules.apexFieldMacros||[]).map(m=>({ label: m, insertText: m }));
    pushMany(prefixFilter(macros, t));

    // Relationship completions first if user typed a dot
    if (t.includes('.')) {
      await addRelationshipFieldSuggestions(t);
    } else {
      // suggest relationship names with trailing dot
      await addRelationshipNameSuggestions(t);
    }

    // Fields from current object if known
    const fields = await getFieldsForObject(objectName || els.obj?.value || '');
    const fieldItems = fields.map(f=>f.name);
    pushMany(prefixFilter(fieldItems, t));
  } else if (clause === 'FROM') {
    const phase = getFromPhase(q, pos);
    if (phase === 'OBJECT') {
      const objs = Soql_helper_schema.getObjects?.() || [];
      const items = objs.map(o=>o.name || o.apiName || o.label).filter(Boolean).slice(0, 500);
      pushMany(prefixFilter(items, t));
    } else {
      pushMany(prefixFilter(nextKeywords, t));
    }
  } else if (clause === 'WHERE') {
    const phase = getWherePhase(q, pos);
    const fields = await getFieldsForObject(objectName || els.obj?.value || '');
    if (phase === 'FIELD') {
      // Relationship-aware field suggestions
      if (t.includes('.')) {
        await addRelationshipFieldSuggestions(t);
      } else {
        await addRelationshipNameSuggestions(t);
      }
      pushMany(prefixFilter(fields.map(f=>f.name), t));
      pushMany(prefixFilter(['('], t));
    } else if (phase === 'OP') {
      const operators = rules.operators || ["=","!=","<","<=",">",">=","LIKE","IN","NOT IN","INCLUDES","EXCLUDES"];
      pushMany(prefixFilter(operators, t));
    } else if (phase === 'VALUE') {
      const lit = basicDateLiterals();
      pushMany(prefixFilter(['TRUE','FALSE'], t));
      pushMany(prefixFilter(lit, t));
      pushMany(prefixFilter(["'Sample'","'001000000000001'","0","100"], t));
      pushMany(prefixFilter(['AND','OR'], t));
    }
    pushMany(prefixFilter(['AND','OR','GROUP BY','ORDER BY','LIMIT'], t));
  } else if (clause === 'GROUP BY') {
    const phase = getGroupByPhase(q, pos);
    const fields = await getFieldsForObject(objectName || els.obj?.value || '');
    if (phase === 'FIELD') {
      if (t.includes('.')) { await addRelationshipFieldSuggestions(t); } else { await addRelationshipNameSuggestions(t); }
      pushMany(prefixFilter(fields.map(f=>f.name), t));
    }
    pushMany(prefixFilter(['HAVING','ORDER BY','LIMIT','OFFSET'], t));
  } else if (clause === 'ORDER BY') {
    const phase = getOrderByPhase(q, pos);
    const fields = await getFieldsForObject(objectName || els.obj?.value || '');
    if (phase === 'FIELD') {
      if (t.includes('.')) { await addRelationshipFieldSuggestions(t); } else { await addRelationshipNameSuggestions(t); }
      pushMany(prefixFilter(fields.map(f=>f.name), t));
    } else {
      pushMany(prefixFilter(['ASC','DESC','ASC NULLS FIRST','ASC NULLS LAST','DESC NULLS FIRST','DESC NULLS LAST'], t));
      pushMany(prefixFilter([','], t));
      pushMany(prefixFilter(['LIMIT','OFFSET'], t));
    }
  } else if (clause === 'LIMIT') {
    const samples = (rules?.suggestionProviders?.suggestLimitValues?.samples) || ["10","50","100","200","500","2000"];
    pushMany(prefixFilter(samples, t));
    pushMany(prefixFilter(['OFFSET'], t));
  } else if (clause === 'OFFSET') {
    const samples = (rules?.suggestionProviders?.suggestOffsetValues?.samples) || ["0","10","100","500"];
    pushMany(prefixFilter(samples, t));
  } else {
    pushMany(prefixFilter((rules.keywords||[]), t));
    const fields = await getFieldsForObject(objectName || els.obj?.value || '');
    if (t.includes('.')) { await addRelationshipFieldSuggestions(t); } else { await addRelationshipNameSuggestions(t); }
    pushMany(prefixFilter(fields.map(f=>f.name), t));
    pushMany(prefixFilter((rules.operators||[]), t));
  }

  // Render plain strings
  const rendered = suggestions.map(s => typeof s === 'string' ? s : (s.label || s.insertText || ''))
    .filter((v,i,arr)=>v && arr.indexOf(v)===i)
    .slice(0, 50);
  renderHints(rendered);
  updateDebugOverlay();
}

function renderHints(list){
  hintItems = list;
  if (!list || list.length === 0) { hintsHide(); return; }
  els.hints.innerHTML = '';
  list.forEach((s,i)=>{
    const li = document.createElement('li');
    li.textContent = s;
    li.dataset.index = i;
    li.addEventListener('click', ()=>{ activeHint = i; commitActiveHint(); });
    els.hints.appendChild(li);
  });
  activeHint = 0;
  updateHintActive();
  els.hints.classList.remove('hidden');
}

function hintsHide(){ els.hints.classList.add('hidden'); hintItems = []; activeHint = -1; }
function hintsVisible(){ return !els.hints.classList.contains('hidden'); }

function moveHint(delta){
  if (!hintItems.length) return;
  activeHint = (activeHint + delta + hintItems.length) % hintItems.length;
  updateHintActive();
  ensureHintVisible();
}

function updateHintActive(){
  Array.from(els.hints.children).forEach((li,idx)=> li.classList.toggle('active', idx===activeHint));
}

function ensureHintVisible(){
  const el = els.hints.children[activeHint];
  if (el) el.scrollIntoView({ block: 'nearest' });
}

function commitActiveHint(){
  if (activeHint < 0 || !hintItems[activeHint]) return;
  const { start, end } = getTokenAtCursor();
  const before = els.editor.value.slice(0, start);
  const after = els.editor.value.slice(end);
  const insert = hintItems[activeHint];
  const space = after.startsWith('.') || insert.endsWith('.') ? '' : ' ';
  els.editor.value = before + insert + space + after;
  const caret = (before + insert + space).length;
  els.editor.focus();
  els.editor.setSelectionRange(caret, caret);
  hintsHide();
  validateInline();
  updateDebugOverlay();
}

function validateInline(){
  const q = els.editor.value || '';
  const errors = [];
  for (const v of rules.inlineValidators || []) {
    try {
      const re = new RegExp(v.pattern, v.flags || 'i');
      const matched = re.test(q);
      const isError = v.negate ? !matched : !matched;
      if (isError && v.level === 'error') errors.push(v.message);
      if (isError && v.level === 'hint' && errors.length === 0) errors.push(`Hint: ${v.message}`);
    } catch {}
  }
  els.errors.textContent = errors.join(' \u2022 ');
}

function clearResults(){ if (els.results) els.results.innerHTML = '<div class="placeholder-note">No results yet</div>'; }

function renderResults(resp, parts, describe){
    if (!els.results) return;
    els.results.innerHTML = '';
    const actions = document.createElement('div');
    actions.className = 'actions';
    const exportBtn = document.createElement('button');
    exportBtn.textContent = 'Export CSV';
    exportBtn.addEventListener('click', () => {
      const csv = toCSV(resp, parts, describe);
      download('soql_results.csv', csv, 'text/csv');
      try { const n = Array.isArray(resp?.records) ? resp.records.length : 0; window?.Utils?.showToast?.(`CSV downloaded${n?` (${n} rows)`:''}`, 'success'); } catch {}
    });
    const exportXlsBtn = document.createElement('button');
    exportXlsBtn.textContent = 'Export Excel';
    exportXlsBtn.addEventListener('click', () => {
      const html = toExcelHTML(resp, parts, describe);
      download('soql_results.xls', html, 'application/vnd.ms-excel');
      try { const n = Array.isArray(resp?.records) ? resp.records.length : 0; window?.Utils?.showToast?.(`Excel downloaded${n?` (${n} rows)`:''}`, 'success'); } catch {}
    });
    const copyJsonBtn = document.createElement('button');
    copyJsonBtn.textContent = 'Copy JSON';
    copyJsonBtn.addEventListener('click', async () => {
      const data = Array.isArray(resp?.records) ? resp.records : resp;
      const json = (() => {
        try { return JSON.stringify(data, null, 2); } catch { return String(data || ''); }
      })();
      try {
        await navigator.clipboard.writeText(json);
        copyJsonBtn.textContent = 'Copied';
        setTimeout(() => { copyJsonBtn.textContent = 'Copy JSON'; }, 1200);
      } catch {
        try { fallbackCopyText(json); copyJsonBtn.textContent = 'Copied'; setTimeout(() => { copyJsonBtn.textContent = 'Copy JSON'; }, 1200); } catch {}
      }
    });
    actions.appendChild(exportBtn);
    actions.appendChild(exportXlsBtn);
    actions.appendChild(copyJsonBtn);
    els.results.appendChild(actions);

  let colDefs = [];
  if (parts && Array.isArray(parts.selectFields) && parts.selectFields.length) {
    const defs = [];
    for (const raw of parts.selectFields) {
      const s = String(raw || '').trim();
      const m = s.match(/^FIELDS\((ALL|STANDARD|CUSTOM)\)$/i);
      if (m) {
        const mode = m[1].toUpperCase();
        const fields = Array.isArray(describe?.fields) ? describe.fields.map(f => f.name) : [];
        const list = fields.length ? fields : [];
        let chosen = list;
        if (mode === 'STANDARD') chosen = list.filter(n => !/__c$/i.test(n));
        else if (mode === 'CUSTOM') chosen = list.filter(n => /__c$/i.test(n));
        chosen.forEach(name => defs.push({ expr: name, alias: null, label: name, path: [name], isAggregate: false }));
      } else {
        const parsed = parseSelectItem(s);
        if (parsed) defs.push(parsed);
      }
    }
    const seen = new Set();
    colDefs = defs.filter(cd => {
      const key = cd.label + '|' + (Array.isArray(cd.path) ? cd.path.join('.') : cd.expr);
      if (seen.has(key)) return false; seen.add(key); return true;
    });
  }

  if (!Array.isArray(resp.records)) {
    const pre = document.createElement('pre');
    pre.textContent = JSON.stringify(resp, null, 2);
    els.results.appendChild(pre);
    return;
  }

  const records = resp.records;

  // Fallback when no parsed columns (e.g., parse failed): use object keys excluding 'attributes'
  if (!colDefs.length) {
    const keys = Array.from(records.reduce((s, r) => { Object.keys(r).forEach(k => { if (k !== 'attributes') s.add(k); }); return s; }, new Set()));
    // Build simple table
    const tbl = document.createElement('table');
    tbl.className = 'results-table';
    const thead = document.createElement('thead');
    const headerRow = document.createElement('tr');
    keys.forEach(k => { const c = document.createElement('th'); c.textContent = k; headerRow.appendChild(c); });
    thead.appendChild(headerRow);
    tbl.appendChild(thead);
    const tbody = document.createElement('tbody');
    records.forEach(rec => {
      const tr = document.createElement('tr');
      keys.forEach(k => {
        const td = document.createElement('td');
        const v = rec[k];
        const clickableId = (k === 'Id' || /Id$/i.test(k)) && isSalesforceIdValue('Id', v);
        if (clickableId) {
          const idStr = String(v);
          const a = document.createElement('span');
          a.className = 'sf-id-link';
          a.textContent = idStr;
          const pref = idStr.slice(0,3);
          const label = getObjectLabelByKeyPrefix(pref) || 'Record';
          a.title = `${label} (${pref}) \u2014 Click for options`;
          a.tabIndex = 0;
          a.setAttribute('role', 'button');
          a.dataset.id = idStr;
          a.addEventListener('click', (ev) => {
            ev.stopPropagation();
            if (ev.metaKey || ev.ctrlKey) { openRecordInNewTab(idStr); return; }
            if (ev.shiftKey) { try { navigator.clipboard.writeText(idStr); } catch { fallbackCopyText(idStr); } return; }
            showIdContextMenu(idStr, ev.clientX, ev.clientY);
          });
          td.appendChild(a);
        } else {
          td.textContent = (v === null || v === undefined) ? '' : (typeof v === 'object' ? JSON.stringify(v) : String(v));
        }
        tr.appendChild(td);
      });
      tbody.appendChild(tr);
    });
    tbl.appendChild(tbody);
    els.results.appendChild(tbl);
    ensureIdContextMenuWired();
    return;
  }

  // Build table using colDefs
  const tbl = document.createElement('table');
  tbl.className = 'results-table';
  const thead = document.createElement('thead');
  const headerRow = document.createElement('tr');
  colDefs.forEach(cd => { const c = document.createElement('th'); c.textContent = cd.label; headerRow.appendChild(c); });
  thead.appendChild(headerRow);
  tbl.appendChild(thead);
  const tbody = document.createElement('tbody');

  // Precompute expr key mapping for aggregates without alias using the first record
  const first = records[0] || {};
  const exprKeys = Object.keys(first).filter(k=>/^expr\d+$/.test(k)).sort((a,b)=>Number(a.slice(4))-Number(b.slice(4)));
  const aggNoAliasIdx = colDefs.map((cd, idx)=> (cd.isAggregate && !cd.alias) ? idx : -1).filter(i=>i>=0);
  const exprMap = new Map(); // colIdx -> exprKey
  let exprCursor = 0;
  for (const colIdx of aggNoAliasIdx) {
    if (exprCursor < exprKeys.length) {
      exprMap.set(colIdx, exprKeys[exprCursor]);
      exprCursor++;
    }
  }

  // Build rows
  records.forEach(rec=>{
    const tr = document.createElement('tr');
    colDefs.forEach((cd, colIdx)=>{
      const td = document.createElement('td');
      let v;
      if (cd.path) {
        v = getByPath(rec, cd.path);
      } else if (cd.alias) {
        v = rec[cd.alias];
      } else if (cd.isAggregate) {
        const key = exprMap.get(colIdx);
        v = key ? rec[key] : undefined;
      } else {
        v = rec[cd.expr];
      }

      // Helper: derive related Id for relationship paths using parent object
      function deriveRelatedIdForPath(pathArr){
        try {
          if (!Array.isArray(pathArr) || pathArr.length < 2) return null;
          const parentPath = pathArr.slice(0, pathArr.length - 1);
          const parentObj = getByPath(rec, parentPath);
          if (!parentObj || typeof parentObj !== 'object') return null;
          if (typeof parentObj.Id === 'string') return parentObj.Id;
          const url = parentObj?.attributes?.url || '';
          const m = String(url).match(/\/sobjects\/[^/]+\/([a-zA-Z0-9]{15,18})$/);
          return m ? m[1] : null;
        } catch { return null; }
      }

      if (Array.isArray(cd.path) && cd.path.length === 1 && /Id$/i.test(cd.path[0]) && isSalesforceIdValue('Id', v)) {
        // Top-level Id-like field (Id, OwnerId, AccountId, etc.)
        const idStr = String(v);
        const a = document.createElement('span');
        a.className = 'sf-id-link';
        a.textContent = idStr;
        const pref = idStr.slice(0,3);
        const label = getObjectLabelByKeyPrefix(pref) || 'Record';
        a.title = `${label} (${pref}) \u2014 Click for options`;
        a.tabIndex = 0;
        a.setAttribute('role', 'button');
        a.dataset.id = idStr;
        a.addEventListener('click', (ev) => {
          ev.stopPropagation();
          if (ev.metaKey || ev.ctrlKey) { openRecordInNewTab(idStr); return; }
          if (ev.shiftKey) { try { navigator.clipboard.writeText(idStr); } catch { fallbackCopyText(idStr); } return; }
          showIdContextMenu(idStr, ev.clientX, ev.clientY);
        });
        td.appendChild(a);
      } else if (Array.isArray(cd.path) && cd.path.length >= 2) {
        let relatedId = null;
        try {
          const lastSeg = cd.path[cd.path.length - 1];
          if (/Id$/i.test(lastSeg) && isSalesforceIdValue(lastSeg, v)) {
            relatedId = String(v);
          }
        } catch {}
        if (!relatedId) {
          relatedId = deriveRelatedIdForPath(cd.path);
        }
        if (relatedId && isSalesforceIdValue('Id', relatedId)) {
          const text = (v === null || v === undefined) ? '' : (typeof v === 'object' ? JSON.stringify(v) : String(v));
          const a = document.createElement('span');
          a.className = 'sf-id-link';
          a.textContent = text;
          const pref = relatedId.slice(0,3);
          const label = getObjectLabelByKeyPrefix(pref) || 'Record';
          a.title = `${label} (${pref}) \u2014 Click for options`;
          a.tabIndex = 0;
          a.setAttribute('role', 'button');
          a.dataset.id = relatedId;
          a.addEventListener('click', (ev) => {
            ev.stopPropagation();
            if (ev.metaKey || ev.ctrlKey) { openRecordInNewTab(relatedId); return; }
            if (ev.shiftKey) { try { navigator.clipboard.writeText(relatedId); } catch { fallbackCopyText(relatedId); } return; }
            showIdContextMenu(relatedId, ev.clientX, ev.clientY);
          });
          td.appendChild(a);
        } else {
          td.textContent = (v === null || v === undefined) ? '' : (typeof v === 'object' ? JSON.stringify(v) : String(v));
        }
      } else {
        td.textContent = (v === null || v === undefined) ? '' : (typeof v === 'object' ? JSON.stringify(v) : String(v));
      }
      tr.appendChild(td);
    });
    tbody.appendChild(tr);
  });
  tbl.appendChild(tbody);
  els.results.appendChild(tbl);

  ensureIdContextMenuWired();
}

// --- Clickable Salesforce Id helpers ---
let sfContextMenuEl = null;
function ensureIdContextMenuWired(){
  if (!sfContextMenuEl) {
    sfContextMenuEl = document.createElement('div');
    sfContextMenuEl.className = 'sf-context-menu hidden';
    sfContextMenuEl.innerHTML = '<ul><li data-act="copy">Copy Id</li><li data-act="open" title="Open record in a new tab">Open in new tab</li></ul>';
    document.body.appendChild(sfContextMenuEl);
    sfContextMenuEl.addEventListener('click', async (e) => {
      const li = e.target && e.target.closest('li');
      if (!li || li.classList.contains('disabled')) return;
      const act = li.getAttribute('data-act');
      const id = sfContextMenuEl.getAttribute('data-id') || '';
      hideIdContextMenu();
      if (!id) return;
      if (act === 'copy') {
        try { await navigator.clipboard.writeText(id); } catch { fallbackCopyText(id); }
      } else if (act === 'open') {
        openRecordInNewTab(id);
      }
    });
  }
  // Global dismiss
  document.addEventListener('click', (e) => {
    const inside = sfContextMenuEl && (e.target === sfContextMenuEl || sfContextMenuEl.contains(e.target));
    if (!inside) hideIdContextMenu();
  }, { capture: true });
  window.addEventListener('resize', hideIdContextMenu);
  els.results?.addEventListener('scroll', hideIdContextMenu, { passive: true });
}

async function showIdContextMenu(id, clientX, clientY){
  if (!sfContextMenuEl) ensureIdContextMenuWired();
  sfContextMenuEl.setAttribute('data-id', id);
  // Position
  sfContextMenuEl.style.left = Math.max(8, Math.min(window.innerWidth - 180, clientX)) + 'px';
  sfContextMenuEl.style.top = Math.max(8, Math.min(window.innerHeight - 80, clientY)) + 'px';

  // Enable/disable Open action based on instance URL availability
  const liOpen = sfContextMenuEl.querySelector('li[data-act="open"]');
  try {
    const base = await getInstanceUrl();
    const ok = !!base;
    if (liOpen) {
      liOpen.classList.toggle('disabled', !ok);
      liOpen.title = ok ? 'Open record in a new tab' : 'Salesforce instance URL not detected. Open a Salesforce tab to enable this action.';
    }
  } catch {
    if (liOpen) {
      liOpen.classList.add('disabled');
      liOpen.title = 'Salesforce instance URL not detected. Open a Salesforce tab to enable this action.';
    }
  }

  sfContextMenuEl.classList.remove('hidden');
}

function hideIdContextMenu(){
  if (sfContextMenuEl) {
    sfContextMenuEl.classList.add('hidden');
    sfContextMenuEl.removeAttribute('data-id');
  }
}

// Added: apply debug overlay visibility helper (used on init and toggle)
function applyDebugOverlayVisibility(){
  try {
    if (!els.debug) return;
    const show = els.debugToggle ? !!els.debugToggle.checked : false;
    els.debug.classList.toggle('hidden', !show);
  } catch {}
}

// Download helper used by export
function download(filename, data, mime){
  const blob = new Blob([data], { type: mime || 'application/octet-stream' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click();
  a.remove(); URL.revokeObjectURL(url);
}

// Run query used by Run button and keyboard shortcut
async function runQuery(){
  const raw = els.editor?.value || '';
  const query = raw.trim();
  if (!query) { els.errors.textContent = 'Query empty'; return; }
  try {
    const rule = (rules.inlineValidators||[]).find(v=>v.id==='requireSelectFrom');
    if (rule) {
      const re = new RegExp(rule.pattern, 'i');
      const ok = re.test(query);
      if (!ok) { els.errors.textContent = rule.message; return; }
    }
  } catch {}

  // Semantic validation using schema and query structure
  els.errors.textContent = 'Validating...';
  let parts = null;
  try {
    // Extract object name and get schema describe
    parts = parseQueryParts(query);
    let describe = null;
    if (parts.objectName) {
      try { describe = await Soql_helper_schema.describeSObject(parts.objectName); } catch {}
    }
    const result = validateSoql(query, describe);
    if (!result.ok) {
      els.errors.textContent = result.messages.join(' \u2022 ');
      return;
    }
    // prefer describe from result.parts if validator modified; else keep
  } catch (e) {
    console.error('Semantic validation failed', e);
  }

  els.errors.textContent = 'Running...';
  try { await Soql_helper_storage.saveQuery(query); } catch {}

  // Include instanceUrl explicitly like Audit/LMS do
  let instanceUrl = null;
  try { instanceUrl = await getInstanceUrl(); } catch { instanceUrl = null; }

  const payload = { action: 'RUN_SOQL', query, limit: parseInt(els.limit?.value||'200',10) };
  if (instanceUrl) payload.instanceUrl = instanceUrl;

  chrome.runtime.sendMessage(payload, (resp) => {
    if (chrome.runtime.lastError || !resp) {
        els.errors.textContent = 'Run failed: no response'; clearResults(); return;
    }
    if (resp.error || resp.success === false) {
        els.errors.textContent = `Error: ${resp.error||'Unknown error'}`;
        clearResults();
        return;
    }
    els.errors.textContent = '';
    // Pass describe we looked up to support FIELDS(...) expansion and exports
    (async () => {
      let describe = null;
      try { describe = parts?.objectName ? await Soql_helper_schema.describeSObject(parts.objectName) : null; } catch {}
      renderResults(resp, parts, describe);
    })();
  });
}

window.addEventListener('DOMContentLoaded', () => {
  const pane = document.querySelector('#tab-soql.tab-pane');
  if (pane && pane.style.display !== 'none') { ensureInitOnce(); if (els.editor) { els.editor.focus(); suggestFromContext(); updateDebugOverlay(); applyDebugOverlayVisibility(); } }
});

document.addEventListener('soql-load', () => { ensureInitOnce(); if (els.editor) { els.editor.focus(); suggestFromContext(); updateDebugOverlay(); applyDebugOverlayVisibility(); } });
