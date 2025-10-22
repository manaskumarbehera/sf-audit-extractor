// soql_helper_utils.js
// API: Utilities used by SOQL helper UI and logic
// Exports
// - parse/context: getClauseAtCursor, getSelectPhase, getFromPhase, getGroupByPhase, getWherePhase, getOrderByPhase, prefixFilter
// - schema: getFieldsForObject, getRelationshipMeta, getFieldsForRelationship, filterRelationshipCompletions, buildKeyPrefixMap, getObjectLabelByKeyPrefix
// - id/data: isSalesforceIdValue, getByPath
// - exports: parseSelectItem, toCSV, toExcelHTML
// - SF/Chrome: findSalesforceTab, sendMessageToSalesforceTab, getInstanceUrl, openRecordInNewTab
// - misc: fallbackCopyText

import { Soql_helper_schema } from './soql_helper_schema.js';

// -------------------- parse/context helpers --------------------
export function getClauseAtCursor(txt, pos) {
  const s = String(txt || '');
  const upTo = s.slice(0, pos);
  const map = [];
  const re = /\b(SELECT|FROM|WHERE|GROUP\s+BY|HAVING|ORDER\s+BY|LIMIT|OFFSET)\b/gi;
  let m;
  while ((m = re.exec(upTo)) !== null) { map.push({ kw: m[1].toUpperCase().replace(/\s+/g, ' '), idx: m.index }); }
  if (map.length === 0) return 'START';
  const last = map[map.length - 1].kw;
  return last;
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

// -------------------- schema helpers --------------------
let relationshipMetaCache = new Map();
let keyPrefixMap = null; // prefix -> label/name

export async function getFieldsForObject(objName) {
  if (!objName) return [];
  try {
    const desc = await Soql_helper_schema.describeSObject(objName);
    return Array.isArray(desc?.fields) ? desc.fields.map(f => ({ name: f.name, type: f.type, sortable: true })) : [];
  } catch { return []; }
}

export async function getRelationshipMeta(objName){
  if (!objName) return { relMap: new Map(), relNames: new Set() };
  if (relationshipMetaCache.has(objName)) return relationshipMetaCache.get(objName);
  try {
    const d = await Soql_helper_schema.describeSObject(objName);
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
    relationshipMetaCache.set(objName, meta);
    return meta;
  } catch {
    return { relMap: new Map(), relNames: new Set() };
  }
}

export async function getFieldsForRelationship(objName, relName){
  const { relMap } = await getRelationshipMeta(objName);
  const refSet = relMap.get(relName) || new Set();
  if (!refSet.size) return [];
  const out = new Set();
  for (const refObj of refSet) {
    try {
      const desc = await Soql_helper_schema.describeSObject(refObj);
      if (desc && Array.isArray(desc.fields)) {
        for (const f of desc.fields) out.add(`${relName}.${f.name}`);
      }
    } catch {}
  }
  return Array.from(out);
}

export function filterRelationshipCompletions(relName, partialAfterDot, fields){
  const p = (partialAfterDot||'').toLowerCase();
  return fields.filter(fn=>{
    const after = fn.slice(relName.length+1);
    return after.toLowerCase().startsWith(p);
  });
}

export function buildKeyPrefixMap(){
  try {
    const objs = Soql_helper_schema.getObjects?.() || [];
    const map = new Map();
    for (const o of objs) {
      const p = (o && o.keyPrefix) ? String(o.keyPrefix).toUpperCase() : null;
      if (p && p.length === 3) {
        const label = o.label || o.name || p;
        if (!map.has(p)) map.set(p, label);
      }
    }
    keyPrefixMap = map;
  } catch { keyPrefixMap = keyPrefixMap || new Map(); }
}

export function getObjectLabelByKeyPrefix(prefix){
  if (!prefix || prefix.length < 3) return null;
  const p = prefix.slice(0,3).toUpperCase();
  try {
    if (!keyPrefixMap || keyPrefixMap.size === 0) buildKeyPrefixMap();
    return keyPrefixMap?.get(p) || null;
  } catch { return null; }
}

// -------------------- id/data helpers --------------------
export function isSalesforceIdValue(key, value){
  if (!value || typeof value !== 'string') return false;
  const s = value.trim();
  const idRe = /^[a-zA-Z0-9]{15}(?:[a-zA-Z0-9]{3})?$/;
  return idRe.test(s);
}

export function getByPath(obj, pathArr){
  try {
    let cur = obj;
    for (const p of pathArr) { if (cur == null) return undefined; cur = cur[p]; }
    return cur;
  } catch { return undefined; }
}

// -------------------- export helpers --------------------
export function parseSelectItem(item){
  const s = String(item||'').trim();
  if (!s) return null;
  if (s.startsWith('(')) return null;
  let expr = s;
  let alias = null;
  const mAs = s.match(/^[\s\S]*?\s+AS\s+([A-Za-z_][A-Za-z0-9_]*)$/i);
  if (mAs) {
    expr = s.replace(/\s+AS\s+[A-Za-z_][A-ZaZ0-9_]*$/i,'').trim();
    alias = mAs[1];
  } else if (/\(/.test(s) && !/^FIELDS\(/i.test(s)) {
    const mAgg = s.match(/^([\s\S]*?\))\s+([A-Za-z_][A-ZaZ0-9_]*)$/);
    const mAgg2 = mAgg || s.match(/^(.*\))\s+([A-Za-z_][A-ZaZ0-9_]*)$/);
    if (mAgg2) { expr = mAgg2[1].trim(); alias = mAgg2[2]; }
  }
  let path = null;
  const isAggregate = /\(/.test(expr) && !/^FIELDS\(/i.test(expr);
  if (!isAggregate && /^[A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)*$/.test(expr)) {
    path = expr.split('.');
  }
  const label = alias || expr;
  return { expr, alias, label, path, isAggregate };
}

export function toCSV(resp, parts, describe){
  if (!Array.isArray(resp?.records)) return '';
  const records = resp.records;

  let colDefs = [];
  if (parts && Array.isArray(parts.selectFields) && parts.selectFields.length) {
    const defs = [];
    for (const raw of parts.selectFields) {
      const s = String(raw||'').trim();
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
    colDefs = defs.filter(cd => { const key = cd.label + '|' + (cd.path?cd.path.join('.'):''); if (seen.has(key)) return false; seen.add(key); return true; });
  }

  if (!colDefs.length) {
    const keys = Array.from(records.reduce((s, r) => { Object.keys(r).forEach(k => { if (k !== 'attributes') s.add(k); }); return s; }, new Set()));
    const rows = [keys.join(',')];
    records.forEach(r=>{
      const row = keys.map(k=>{
        const v = r[k];
        let s = (v===null||v===undefined) ? '' : (typeof v==='object' ? JSON.stringify(v) : String(v));
        s = s.replace(/"/g,'""');
        return `"${s}"`;
      }).join(',');
      rows.push(row);
    });
    return rows.join('\n');
  }

  const header = colDefs.map(cd=>cd.label).join(',');
  const rows = [header];

  const first = records[0] || {};
  const exprKeys = Object.keys(first).filter(k=>/^expr\d+$/.test(k)).sort((a,b)=>Number(a.slice(4))-Number(b.slice(4)));
  const aggNoAliasIdx = colDefs.map((cd, idx)=> (cd.isAggregate && !cd.alias) ? idx : -1).filter(i=>i>=0);
  const exprMap = new Map();
  let cursor = 0;
  for (const idx of aggNoAliasIdx) { if (cursor < exprKeys.length) { exprMap.set(idx, exprKeys[cursor++]); } }

  rows.push(...records.map(rec => {
    const row = colDefs.map((cd, colIdx)=>{
      let v;
      if (cd.path) v = getByPath(rec, cd.path);
      else if (cd.alias) v = rec[cd.alias];
      else if (cd.isAggregate) { const key = exprMap.get(colIdx); v = key ? rec[key] : undefined; }
      else v = rec[cd.expr];
      let s = (v===null||v===undefined) ? '' : (typeof v==='object' ? JSON.stringify(v) : String(v));
      s = s.replace(/"/g,'""');
      return `"${s}"`;
    }).join(',');
    return row;
  }));
  return rows.join('\n');
}

export function toExcelHTML(resp, parts, describe){
  const docStart = '<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta http-equiv="X-UA-Compatible" content="IE=edge"><meta name="viewport" content="width=device-width, initial-scale=1">\n<style>table{border-collapse:collapse} th,td{border:1px solid #000; padding:4px; text-align:left; white-space:pre-wrap}</style></head><body>';
  const docEnd = '</body></html>';

  if (!Array.isArray(resp?.records)) {
    try {
      const body = `<pre>${String(JSON.stringify(resp||{}, null, 2)).replace(/[&<>]/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]))}</pre>`;
      return `${docStart}${body}${docEnd}`;
    } catch {
      return `${docStart}<pre></pre>${docEnd}`;
    }
  }
  const records = resp.records;

  function escHtml(s){ return String(s==null?'':s).replace(/[&<>]/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[c])); }

  let colDefs = [];
  if (parts && Array.isArray(parts.selectFields) && parts.selectFields.length) {
    const defs = [];
    for (const raw of parts.selectFields) {
      const s = String(raw||'').trim();
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
    colDefs = defs.filter(cd => { const key = cd.label + '|' + (cd.path?cd.path.join('.'):''); if (seen.has(key)) return false; seen.add(key); return true; });
  }

  if (!colDefs.length) {
    const keys = Array.from(records.reduce((s, r) => { Object.keys(r).forEach(k => { if (k !== 'attributes') s.add(k); }); return s; }, new Set()));
    const head = '<tr>' + keys.map(k=>`<th>${escHtml(k)}</th>`).join('') + '</tr>';
    const rows = records.map(r=> '<tr>' + keys.map(k=>`<td>${escHtml(typeof r[k]==='object' ? JSON.stringify(r[k]) : (r[k] ?? ''))}</td>`).join('') + '</tr>').join('');
    return `${docStart}<table>${head}${rows}</table>${docEnd}`;
  }

  const first = records[0] || {};
  const exprKeys = Object.keys(first).filter(k=>/^expr\d+$/.test(k)).sort((a,b)=>Number(a.slice(4))-Number(b.slice(4)));
  const aggNoAliasIdx = colDefs.map((cd, idx)=> (cd.isAggregate && !cd.alias) ? idx : -1).filter(i=>i>=0);
  const exprMap = new Map(); let cursor = 0;
  for (const idx of aggNoAliasIdx) { if (cursor < exprKeys.length) { exprMap.set(idx, exprKeys[cursor++]); } }

  const head = '<tr>' + colDefs.map(cd=>`<th>${escHtml(cd.label)}</th>`).join('') + '</tr>';
  const rows = records.map(rec => {
    return '<tr>' + colDefs.map((cd, colIdx)=>{
      let v;
      if (cd.path) v = getByPath(rec, cd.path);
      else if (cd.alias) v = rec[cd.alias];
      else if (cd.isAggregate) { const key = exprMap.get(colIdx); v = key ? rec[key] : undefined; }
      else v = rec[cd.expr];
      return `<td>${escHtml(v)}</td>`;
    }).join('') + '</tr>';
  }).join('');
  return `${docStart}<table>${head}${rows}</table>${docEnd}`;
}

// -------------------- SF/Chrome helpers --------------------
export async function findSalesforceTab(){
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

let instanceUrlCache = null;
export async function getInstanceUrl(){
  if (instanceUrlCache) return instanceUrlCache;
  try {
    const resp = await sendMessageToSalesforceTab({ action: 'getSessionInfo' });
    if (resp && resp.success && resp.isLoggedIn && resp.instanceUrl) {
      instanceUrlCache = resp.instanceUrl;
      return instanceUrlCache;
    }
  } catch {}
  return await new Promise((resolve) => {
    try {
      chrome.runtime.sendMessage({ action: 'GET_SESSION_INFO' }, (resp) => {
        if (chrome.runtime.lastError) { resolve(null); return; }
        const url = resp?.instanceUrl || null;
        instanceUrlCache = url || null;
        resolve(instanceUrlCache);
      });
    } catch { resolve(null); }
  });
}

export async function openRecordInNewTab(id){
  const base = (await getInstanceUrl()) || '';
  const url = (base ? base.replace(/\/+$/, '') : '') + '/' + encodeURIComponent(id);
  if (!url.startsWith('http')) return;
  try {
    await chrome.tabs.create({ url });
  } catch {
    try { window.open(url, '_blank', 'noopener,noreferrer'); } catch {}
  }
}

// -------------------- misc helpers --------------------
export function fallbackCopyText(text){
  try {
    const ta = document.createElement('textarea');
    ta.value = text; ta.style.position = 'fixed'; ta.style.left = '-9999px';
    document.body.appendChild(ta); ta.select(); document.execCommand('copy'); ta.remove();
  } catch {}
}
