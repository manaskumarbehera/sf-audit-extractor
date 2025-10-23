// Cleaned soql_helper_utils.js - single copy of utilities (dynamic schema imports to avoid circular references)

// Centralized instance URL/session detection cache and helpers
let _instanceUrlCache = null;

async function findSalesforceTab(){
  try {
    if (typeof window !== 'undefined' && window.Utils && typeof window.Utils.findSalesforceTab === 'function') {
      return await window.Utils.findSalesforceTab();
    }
  } catch {}
  try {
    const matches = await chrome.tabs.query({ url: ['https://*.salesforce.com/*', 'https://*.force.com/*'] });
    if (!Array.isArray(matches) || matches.length === 0) return null;
    let currentWindowId = null;
    try { const current = await chrome.windows.getCurrent({ populate: true }); currentWindowId = current?.id ?? null; } catch {}
    const activeInCurrent = matches.find(t => t.active && (currentWindowId == null || t.windowId === currentWindowId));
    return activeInCurrent || matches[0] || null;
  } catch { return null; }
}

export async function sendMessageToSalesforceTab(message){
  try {
    if (typeof window !== 'undefined' && window.Utils && typeof window.Utils.sendMessageToSalesforceTab === 'function') {
      return await window.Utils.sendMessageToSalesforceTab(message);
    }
  } catch {}
  try {
    const tab = await findSalesforceTab();
    if (!tab?.id) return null;
    return await new Promise((resolve) => {
      try {
        chrome.tabs.sendMessage(tab.id, message, (resp) => {
          if (chrome.runtime.lastError) { resolve(null); return; }
          resolve(resp || null);
        });
      } catch { resolve(null); }
    });
  } catch { return null; }
}

export async function getInstanceUrl(){
  if (_instanceUrlCache) return _instanceUrlCache;
  try {
    if (typeof window !== 'undefined' && window.Utils && typeof window.Utils.getInstanceUrl === 'function') {
      const u = await window.Utils.getInstanceUrl();
      _instanceUrlCache = u || null;
      return _instanceUrlCache;
    }
  } catch {}
  try {
    const resp = await sendMessageToSalesforceTab({ action: 'getSessionInfo' });
    if (resp && resp.success && resp.isLoggedIn && resp.instanceUrl) {
      _instanceUrlCache = resp.instanceUrl;
      return _instanceUrlCache;
    }
  } catch {}
  return await new Promise((resolve) => {
    try {
      chrome.runtime.sendMessage({ action: 'GET_SESSION_INFO' }, (resp) => {
        if (chrome.runtime.lastError) { resolve(null); return; }
        const url = resp?.instanceUrl || null;
        _instanceUrlCache = url || null;
        resolve(_instanceUrlCache);
      });
    } catch { resolve(null); }
  });
}

// -------------------- parse/context helpers --------------------
export function getClauseAtCursor(txt, pos) {
  const s = String(txt || '');
  const upTo = s.slice(0, pos);
  const map = [];
  const re = /\b(SELECT|FROM|WHERE|GROUP\s+BY|HAVING|ORDER\s+BY|LIMIT|OFFSET)\b/gi;
  let m;
  while ((m = re.exec(upTo)) !== null) { map.push({ kw: m[1].toUpperCase().replace(/\s+/g, ' '), idx: m.index }); }
  if (map.length === 0) return 'START';
  return map[map.length - 1].kw;
}

export function getSelectPhase(txt, pos) {
  if (!txt) return 'FIELD';
  const upTo = txt.slice(0, pos).toUpperCase();
  const selIdx = upTo.lastIndexOf('SELECT');
  if (selIdx < 0) return 'FIELD';
  const tail = upTo.slice(selIdx + 'SELECT'.length);
  if (tail.includes(' FROM ')) return 'FROM';
  return 'FIELD';
}

export function getFromPhase(txt, pos) {
  if (!txt) return 'OBJECT';
  const upTo = txt.slice(0, pos);
  const upToU = upTo.toUpperCase();
  const fromIdx = upToU.lastIndexOf('FROM');
  if (fromIdx < 0) return 'OBJECT';
  const tail = upTo.slice(fromIdx + 4);
  if (/\b[A-Za-z_][A-Za-z0-9_]*(?:__(?:c|kav|x))?\b/.test(tail)) {
    if (/\b[A-Za-z_][A-Za-z0-9_]*(?:__(?:c|kav|x))?\b\s*$/.test(tail)) return 'NEXT';
  }
  return 'OBJECT';
}

export function getGroupByPhase(txt, pos) {
  const upTo = txt.slice(0, pos).toUpperCase();
  const idx = upTo.lastIndexOf('GROUP BY');
  if (idx < 0) return 'FIELD';
  const tail = upTo.slice(idx + 'GROUP BY'.length);
  if (/\b[A-Z_][A-Z0-9_.]*\b/.test(tail)) {
    if (/\bHAVING\b|\bORDER BY\b|\bLIMIT\b|\bOFFSET\b/.test(upTo)) return 'NEXT';
    return 'FIELD';
  }
  return 'FIELD';
}

export function getWherePhase(txt, pos) {
  const upTo = txt.slice(0, pos);
  const mWhere = upTo.match(/\bWHERE\b/gi);
  if (!mWhere) return 'FIELD';
  const whereIdx = upTo.toUpperCase().lastIndexOf('WHERE');
  const tail = upTo.slice(whereIdx + 5);
  if (/\b(=|!=|<=|>=|<|>|LIKE|NOT\s+LIKE|IN|NOT\s+IN|INCLUDES|EXCLUDES)\s*$/i.test(tail)) return 'VALUE';
  if (/\b[A-Za-z_][A-Za-z0-9_.]*\s*$/.test(tail)) return 'OP';
  return 'FIELD';
}

export function getOrderByPhase(txt, pos) {
  const upTo = txt.slice(0, pos);
  const idx = upTo.toUpperCase().lastIndexOf('ORDER BY');
  if (idx < 0) return 'FIELD';
  const tail = upTo.slice(idx + 8);
  const afterComma = tail.split(',').pop() || '';
  if (/\b[A-Za-z_][A-Za-z0-9_.]*\s*$/.test(afterComma)) return 'DIR';
  return 'FIELD';
}

export function prefixFilter(list, prefix) {
  const p = (prefix || '').toLowerCase();
  return list.filter(x => String(x.label || x).toLowerCase().startsWith(p));
}

export function prefixFilterFlexible(list, prefix) {
  try {
    const p = (prefix || '').toLowerCase();
    if (!p) return Array.from(list);
    const asStrings = Array.from(list);
    const starts = asStrings.filter(x => String(x.label || x).toLowerCase().startsWith(p));
    if (starts.length) return starts;
    return asStrings.filter(x => String(x.label || x).toLowerCase().includes(p));
  } catch (e) { return Array.from(list); }
}

export function getSelectSegment(query) {
  try {
    const q = String(query || '');
    const m = q.match(/\bSELECT\b([\s\S]*?)\bFROM\b/i);
    if (!m) return '';
    return m[1] || '';
  } catch { return ''; }
}

export function hasTopLevelFieldsMacro(query) {
  try {
    const seg = getSelectSegment(query).toUpperCase();
    return /\bFIELDS\s*\(\s*(ALL|STANDARD|CUSTOM)\s*\)/i.test(seg);
  } catch { return false; }
}

export function validateFieldsMacro(query) {
  try {
    const selectSeg = getSelectSegment(query);
    if (!selectSeg) return null;

    const hasMacro = /\bFIELDS\s*\(\s*(ALL|STANDARD|CUSTOM)\s*\)/i.test(selectSeg);
    if (!hasMacro) return null;

    const withoutMacros = selectSeg.replace(/\bFIELDS\s*\(\s*(?:ALL|STANDARD|CUSTOM)\s*\)/ig, '').replace(/[()]/g, '');
    const remainder = withoutMacros.replace(/[\s,]+/g, '');
    if (remainder.length > 0) {
      return 'FIELDS(...) cannot be mixed with explicit field names.';
    }

    if (/\b(COUNT|SUM|AVG|MIN|MAX)\s*\(/i.test(selectSeg)) {
      return 'FIELDS() macros cannot be used with aggregate functions.';
    }

    const afterFrom = String(query || '').match(/\bFROM\b\s*\(/i);
    if (afterFrom) return 'FIELDS() macros are not allowed in subqueries.';
    if (/\bSELECT\b[\s\S]*\(\s*SELECT\b/i.test(selectSeg)) return 'FIELDS() macros are not allowed in subqueries.';

    return null;
  } catch (e) {
    return null;
  }
}

// -------------------- schema helpers (dynamic imports) --------------------
let relationshipMetaCache = new Map();
let keyPrefixMap = null;

export async function getFieldsForObject(objName, useTooling = false) {
  if (!objName) return [];
  try {
    const schema = await import('./soql_helper_schema.js');
    // Check if object is queryable before attempting describe
    try {
      const q = await schema.Soql_helper_schema.isQueryable(objName, useTooling);
      if (!q) return [];
    } catch (e) { /* fallback to describing if isQueryable fails */ }
    const desc = await schema.Soql_helper_schema.describeSObject(objName, useTooling);
    return Array.isArray(desc?.fields) ? desc.fields.map(f => ({ name: f.name, type: f.type, sortable: true })) : [];
  } catch { return []; }
}

export async function getRelationshipMeta(objName, useTooling = false){
  if (!objName) return { relMap: new Map(), relNames: new Set() };
  const cacheKey = `${objName}::${useTooling ? 'TOOLING' : 'STD'}`;
  if (relationshipMetaCache.has(cacheKey)) return relationshipMetaCache.get(cacheKey);
  try {
    const d = await (await import('./soql_helper_schema.js')).Soql_helper_schema.describeSObject(objName, useTooling);
    const relMap = new Map();
    const relNames = new Set();
    if (d && Array.isArray(d.fields)) {
      for (const f of d.fields) {
        let relName = f?.relationshipName;
        const refToArr = Array.isArray(f?.referenceTo) ? f.referenceTo.filter(Boolean) : [];
        if (!relName && refToArr.length && typeof f?.name === 'string' && /Id$/i.test(f.name)) {
          relName = f.name.replace(/Id$/i, '');
        }
        if (relName && refToArr.length) {
          relNames.add(relName);
          const cur = relMap.get(relName) || new Set();
          refToArr.forEach(x=>cur.add(x));
          relMap.set(relName, cur);
        }
      }
    }
    const meta = { relMap, relNames };
    relationshipMetaCache.set(cacheKey, meta);
    return meta;
  } catch {
    return { relMap: new Map(), relNames: new Set() };
  }
}

export async function getFieldsForRelationship(objName, relName, useTooling = false){
  const { relMap } = await getRelationshipMeta(objName, useTooling);
  const refSet = relMap.get(relName) || new Set();
  if (!refSet.size) return [];
  const out = new Set();
  for (const refObj of refSet) {
    try {
      // avoid describing non-queryable referenced objects
      try {
        const schema = await import('./soql_helper_schema.js');
        const q = await schema.Soql_helper_schema.isQueryable(refObj, useTooling);
        if (!q) continue;
      } catch (e) { /* ignore and try describe */ }

      const desc = await (await import('./soql_helper_schema.js')).Soql_helper_schema.describeSObject(refObj, useTooling);
      if (desc && Array.isArray(desc.fields)) {
        desc.fields.forEach(f => { if (f && f.name) out.add(f.name); });
      }
    } catch(_) {
      // ignore individual describe failures
    }
  }
  return Array.from(out);
}

// Build a quick lookup map from keyPrefix -> object name. This is synchronous-friendly
// (returns a Map immediately) but will attempt an async fill if the schema module isn't available yet.
export function buildKeyPrefixMap(useTooling = false) {
  keyPrefixMap = new Map();
  try {
    // If Soql_helper_schema is already loaded into the environment (common when soql_helper.js imports it), use it
    if (typeof Soql_helper_schema !== 'undefined' && Soql_helper_schema && typeof Soql_helper_schema.getObjects === 'function') {
      const list = Soql_helper_schema.getObjects(!!useTooling) || [];
      list.forEach(o => {
        try { if (o && o.keyPrefix) keyPrefixMap.set(String(o.keyPrefix), String(o.name || o.label || '')); } catch {}
      });
      return keyPrefixMap;
    }
  } catch (e) {
    // fall through to dynamic import fallback
  }

  // Dynamic import fallback: fill the map asynchronously and keep the immediate Map return (may be empty at first)
  (async () => {
    try {
      const mod = await import('./soql_helper_schema.js');
      const list = mod.Soql_helper_schema.getObjects(!!useTooling) || [];
      const m = new Map();
      list.forEach(o => { try { if (o && o.keyPrefix) m.set(String(o.keyPrefix), String(o.name || o.label || '')); } catch {} });
      keyPrefixMap = m;
    } catch (e) { /* ignore */ }
  })();

  return keyPrefixMap;
}

export function clearSchemaCaches(){
  try { relationshipMetaCache = new Map(); } catch {}
  try { keyPrefixMap = null; } catch {}
}

// Exported helpers for SOQL popup: CSV/Excel export and linkify utilities
export function buildColumnsUnion(records) {
  const cols = [];
  const addKey = (k) => { if (k != null && !cols.includes(k)) cols.push(k); };
  if (!Array.isArray(records)) return cols;
  if (records.length > 0) {
    Object.keys(records[0] || {}).forEach(addKey);
    for (let i = 1; i < records.length; i++) {
      try { Object.keys(records[i] || {}).forEach(addKey); } catch {}
    }
  }
  return cols;
}

function escapeCsvCellInternal(v){
  if (v == null) return '';
  const s = String(v);
  if (s.includes('"') || s.includes(',') || s.includes('\n') || s.includes('\r')){
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

export function recordsToCsv(records, cols){
  try {
    const header = (cols || []).map(c => escapeCsvCellInternal(c)).join(',');
    const rows = (records || []).map(r => (cols || []).map(c => {
      let v = r && r[c];
      if (v && typeof v === 'object') {
        if (typeof v.Name === 'string') v = v.Name;
        else if (typeof v.label === 'string') v = v.label;
        else v = JSON.stringify(v);
      }
      return escapeCsvCellInternal(v);
    }).join(','));
    return [header].concat(rows).join('\n');
  } catch (e) { return ''; }
}

export function downloadCsv(filename, csvContent){
  try {
    if (typeof window !== 'undefined' && window.Utils && typeof window.Utils.download === 'function') {
      window.Utils.download(filename, csvContent, 'text/csv');
      return;
    }
  } catch (e) {}
  try {
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
  } catch (e) { /* ignore */ }
}

export function downloadExcel(filename, cols, records){
  try {
    const esc = (s) => String(s == null ? '' : s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
    let html = '<table><thead><tr>' + (cols || []).map(c => `<th>${esc(c)}</th>`).join('') + '</tr></thead><tbody>';
    for (const r of (records || [])) {
      html += '<tr>' + (cols || []).map(c => {
        let v = r && r[c];
        if (v && typeof v === 'object') {
          if (typeof v.Name === 'string') v = v.Name;
          else if (typeof v.label === 'string') v = v.label;
          else v = JSON.stringify(v);
        }
        return `<td>${esc(v)}</td>`;
      }).join('') + '</tr>';
    }
    html += '</tbody></table>';

    const blob = new Blob([html], { type: 'application/vnd.ms-excel' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
  } catch (e) { /* ignore */ }
}

export function linkifyInfoForValue(val, instanceBase){
   try {
     const idRegex = /^[a-zA-Z0-9]{15,18}$/;
     const urlRegex = /^https?:\/\//i;
     let isLink = false;
     let href = null;
     let text;

     if (val && typeof val === 'object') {
       if (typeof val.Name === 'string') { text = val.Name; }
       else if (typeof val.label === 'string') { text = val.label; }
       else { text = JSON.stringify(val); }
       if (val.Id && idRegex.test(val.Id)) {
         isLink = true; href = (instanceBase ? instanceBase.replace(/\/$/, '') : '') + '/' + val.Id; text = text || val.Id;
       }
       return { isLink, href, text };
     }

     const s = val == null ? '' : String(val);
     if (urlRegex.test(s)) { isLink = true; href = s; text = s; }
     else if (idRegex.test(s)) {
       if (instanceBase) { isLink = true; href = instanceBase.replace(/\/$/, '') + '/' + s; text = s; }
       else { isLink = false; text = s; }
     } else { text = s; }
     return { isLink, href, text };
   } catch (e) { return { isLink: false, href: null, text: String(val == null ? '' : val) }; }
 }

// New helper: create a clickable Salesforce Id link element and wire custom events
export function createSfIdLink(id, label, text) {
  try {
    const a = document.createElement('a');
    a.className = 'sf-id-link';
    a.href = 'javascript:void(0)';
    a.setAttribute('role', 'button');
    a.setAttribute('aria-label', label ? `${label} ${id}` : String(id || ''));
    a.textContent = (typeof text === 'string' && text.length > 0) ? text : (id || '');

    function dispatchSfIdEvent(ev) {
      try {
        // Prefer reporting client coordinates when available
        const detail = { id: String(id || ''), clientX: ev?.clientX || 0, clientY: ev?.clientY || 0 };
        const ce = new CustomEvent('sf-id-click', { detail, bubbles: true, cancelable: true });
        a.dispatchEvent(ce);
      } catch (e) { /* ignore */ }
    }

    // Primary interactions: left-click, auxiliary (middle) click, contextmenu, keyboard activation
    a.addEventListener('click', (ev) => { try { ev.preventDefault(); dispatchSfIdEvent(ev); } catch (e) {} });
    a.addEventListener('auxclick', (ev) => { try { dispatchSfIdEvent(ev); } catch (e) {} });
    a.addEventListener('contextmenu', (ev) => { try { ev.preventDefault(); dispatchSfIdEvent(ev); } catch (e) {} });
    a.addEventListener('keydown', (ev) => { try { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); dispatchSfIdEvent(ev); } } catch (e) {} });

    return a;
  } catch (e) {
    try { const a = document.createElement('a'); a.textContent = String(id || ''); return a; } catch { return document.createElement('span'); }
  }
}

// New: synchronous fallback copy helper (used when navigator.clipboard isn't available or fails)
export function fallbackCopyText(text) {
  try {
    // Prefer a hidden textarea + execCommand copy fallback
    const ta = document.createElement('textarea');
    ta.value = String(text == null ? '' : text);
    // Keep off-screen
    ta.style.position = 'fixed';
    ta.style.left = '-9999px';
    ta.style.top = '0';
    document.body.appendChild(ta);
    ta.select();
    try {
      document.execCommand('copy');
    } catch (e) {
      // ignore execCommand failure
    }
    try { ta.remove(); } catch (e) { /* ignore */ }
  } catch (e) {
    // Last-ditch: try to write to clipboard if available (async), ignoring promise
    try { navigator.clipboard && navigator.clipboard.writeText && navigator.clipboard.writeText(String(text || '')); } catch (e2) { /* ignore */ }
  }
}

// Lookup object label by key prefix (synchronous-friendly; may return empty string if map not populated yet)
export function getObjectLabelByKeyPrefix(prefix) {
  try {
    if (!prefix) return '';
    try {
      if (keyPrefixMap && keyPrefixMap.has(String(prefix))) return keyPrefixMap.get(String(prefix));
    } catch {}
    // Attempt to build map synchronously (async fill may be in progress)
    try { const m = buildKeyPrefixMap(); if (m && m.has(String(prefix))) return m.get(String(prefix)); } catch {}
    return '';
  } catch (e) { return '';
  }
}

// Heuristic: check whether a value (or object) looks like a Salesforce Id
export function isSalesforceIdValue(fieldName, value) {
  try {
    const idRegex = /^[a-zA-Z0-9]{15,18}$/;
    if (value == null) return false;
    if (typeof value === 'string') return idRegex.test(value);
    if (typeof value === 'object') {
      if (typeof value.Id === 'string' && idRegex.test(value.Id)) return true;
      // If object is a simple wrapper with a single Id property
      return false;
    }
    return false;
  } catch (e) { return false; }
}

// Utility to retrieve a value by path array from nested record objects
export function getByPath(obj, pathArr) {
  try {
    if (!obj || !Array.isArray(pathArr) || pathArr.length === 0) return null;
    let cur = obj;
    for (const seg of pathArr) {
      if (cur == null) return null;
      if (typeof cur !== 'object') return null;
      cur = cur[seg];
    }
    return cur === undefined ? null : cur;
  } catch (e) { return null; }
}

// Convert a response or records array into CSV string (small adapter used by DOM code)
export function toCSV(resp, parts, describe) {
  try {
    const records = Array.isArray(resp?.records) ? resp.records : (Array.isArray(resp) ? resp : (resp?.data || []));
    const cols = buildColumnsUnion(records || []);
    return recordsToCsv(records || [], cols || []);
  } catch (e) { return ''; }
}

// Create a simple Excel-compatible HTML table string for download
export function toExcelHTML(resp, parts, describe) {
  try {
    const records = Array.isArray(resp?.records) ? resp.records : (Array.isArray(resp) ? resp : (resp?.data || []));
    const cols = buildColumnsUnion(records || []);
    const esc = (s) => String(s == null ? '' : s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
    let html = '<table><thead><tr>' + (cols || []).map(c => `<th>${esc(c)}</th>`).join('') + '</tr></thead><tbody>';
    for (const r of (records || [])) {
      html += '<tr>' + (cols || []).map(c => {
        let v = r && r[c];
        if (v && typeof v === 'object') {
          if (typeof v.Name === 'string') v = v.Name;
          else if (typeof v.label === 'string') v = v.label;
          else v = JSON.stringify(v);
        }
        return `<td>${esc(v)}</td>`;
      }).join('') + '</tr>';
    }
    html += '</tbody></table>';
    return html;
  } catch (e) { return ''; }
}

// Open a Salesforce record in a new tab using the detected instance URL
export async function openRecordInNewTab(id) {
  try {
    const base = (await getInstanceUrl()) || '';
    const url = (base ? base.replace(/\/+$/, '') : '') + '/' + encodeURIComponent(id);
    if (!url.startsWith('http')) return;
    try { await chrome.tabs.create({ url }); } catch {
      try { window.open(url, '_blank', 'noopener,noreferrer'); } catch {}
    }
  } catch (e) { /* ignore */ }
}
