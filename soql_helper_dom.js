// soql_helper_dom.js
// DOM helpers extracted from soql_helper.js
// Exports:
// - createResultsActions(resp, parts, describe) -> HTMLElement
// - buildSimpleResultsTable(records) -> HTMLTableElement
// - buildResultsTableFromColDefs(records, colDefs, describe) -> HTMLTableElement
// - ensureIdContextMenuWired(), showIdContextMenu(id, x, y), hideIdContextMenu()

import {
  createSfIdLink,
  getObjectLabelByKeyPrefix,
  isSalesforceIdValue,
  getByPath,
  toCSV,
  toExcelHTML,
  fallbackCopyText,
  getInstanceUrl,
  openRecordInNewTab
} from './soql_helper_utils.js';

// -------------------- Export actions --------------------
export function createResultsActions(resp, parts, describe){
  const actions = document.createElement('div');
  actions.className = 'actions';

  const exportBtn = document.createElement('button');
  exportBtn.textContent = 'Export CSV';
  exportBtn.addEventListener('click', () => {
    const csv = toCSV(resp, parts, describe);
    try { window.Utils.download('soql_results.csv', csv, 'text/csv'); } catch {}
    try { const n = Array.isArray(resp?.records) ? resp.records.length : 0; window?.Utils?.showToast?.(`CSV downloaded${n?` (${n} rows)`:''}`, 'success'); } catch {}
  });

  const exportXlsBtn = document.createElement('button');
  exportXlsBtn.textContent = 'Export Excel';
  exportXlsBtn.addEventListener('click', () => {
    const html = toExcelHTML(resp, parts, describe);
    try { window.Utils.download('soql_results.xls', html, 'application/vnd.ms-excel'); } catch {}
    try { const n = Array.isArray(resp?.records) ? resp.records.length : 0; window?.Utils?.showToast?.(`Excel downloaded${n?` (${n} rows)`:''}`, 'success'); } catch {}
  });

  const copyJsonBtn = document.createElement('button');
  copyJsonBtn.textContent = 'Copy JSON';
  copyJsonBtn.addEventListener('click', async () => {
    const data = Array.isArray(resp?.records) ? resp.records : resp;
    const json = (() => { try { return JSON.stringify(data, null, 2); } catch { return String(data || ''); } })();
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
  return actions;
}

// -------------------- Simple table for unparsed records --------------------
export function buildSimpleResultsTable(records){
  const keys = Array.from(records.reduce((s, r) => { Object.keys(r).forEach(k => { if (k !== 'attributes') s.add(k); }); return s; }, new Set()));
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
        const pref = idStr.slice(0,3);
        const label = getObjectLabelByKeyPrefix(pref) || 'Record';
        const a = createSfIdLink(idStr, label, idStr);
        a.addEventListener('sf-id-click', (ev) => { const d = ev.detail || {}; showIdContextMenu(d.id || idStr, d.clientX || 0, d.clientY || 0); });
        td.appendChild(a);
      } else {
        td.textContent = (v === null || v === undefined) ? '' : (typeof v === 'object' ? JSON.stringify(v) : String(v));
      }
      tr.appendChild(td);
    });
    tbody.appendChild(tr);
  });

  tbl.appendChild(tbody);
  return tbl;
}

// -------------------- Table builder for parsed columns --------------------
export function buildResultsTableFromColDefs(records, colDefs){
  const tbl = document.createElement('table');
  tbl.className = 'results-table';
  const thead = document.createElement('thead');
  const headerRow = document.createElement('tr');
  colDefs.forEach(cd => { const c = document.createElement('th'); c.textContent = cd.label; headerRow.appendChild(c); });
  thead.appendChild(headerRow);
  tbl.appendChild(thead);
  const tbody = document.createElement('tbody');

  const first = records[0] || {};
  const exprKeys = Object.keys(first).filter(k=>/^expr\d+$/.test(k)).sort((a,b)=>Number(a.slice(4))-Number(b.slice(4)));
  const aggNoAliasIdx = colDefs.map((cd, idx)=> (cd.isAggregate && !cd.alias) ? idx : -1).filter(i=>i>=0);
  const exprMap = new Map(); let exprCursor = 0;
  for (const colIdx of aggNoAliasIdx) {
    if (exprCursor < exprKeys.length) { exprMap.set(colIdx, exprKeys[exprCursor]); exprCursor++; }
  }

  function deriveRelatedIdForPath(rec, pathArr){
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

  records.forEach(rec => {
    const tr = document.createElement('tr');
    colDefs.forEach((cd, colIdx) => {
      const td = document.createElement('td');
      let v;
      if (cd.path) v = getByPath(rec, cd.path);
      else if (cd.alias) v = rec[cd.alias];
      else if (cd.isAggregate) { const key = exprMap.get(colIdx); v = key ? rec[key] : undefined; }
      else v = rec[cd.expr];

      if (Array.isArray(cd.path) && cd.path.length === 1 && /Id$/i.test(cd.path[0]) && isSalesforceIdValue('Id', v)) {
        const idStr = String(v);
        const pref = idStr.slice(0,3);
        const label = getObjectLabelByKeyPrefix(pref) || 'Record';
        const a = createSfIdLink(idStr, label, idStr);
        a.addEventListener('sf-id-click', (ev) => { const d = ev.detail || {}; showIdContextMenu(d.id || idStr, d.clientX || 0, d.clientY || 0); });
        td.appendChild(a);
      } else if (Array.isArray(cd.path) && cd.path.length >= 2) {
        let relatedId = null;
        try {
          const lastSeg = cd.path[cd.path.length - 1];
          if (/Id$/i.test(lastSeg) && isSalesforceIdValue(lastSeg, v)) { relatedId = String(v); }
        } catch {}
        if (!relatedId) relatedId = deriveRelatedIdForPath(rec, cd.path);
        if (relatedId && isSalesforceIdValue('Id', relatedId)) {
          const text = (v === null || v === undefined) ? '' : (typeof v === 'object' ? JSON.stringify(v) : String(v));
          const pref = relatedId.slice(0,3);
          const label = getObjectLabelByKeyPrefix(pref) || 'Record';
          const a = createSfIdLink(relatedId, label, text);
          a.addEventListener('sf-id-click', (ev) => { const d = ev.detail || {}; showIdContextMenu(d.id || relatedId, d.clientX || 0, d.clientY || 0); });
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
  return tbl;
}

// -------------------- Clickable Salesforce Id context menu --------------------
let sfContextMenuEl = null;
export function ensureIdContextMenuWired(){
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
  // Note: the caller should also wire results scroll -> hideIdContextMenu if desired
}

export async function showIdContextMenu(id, clientX, clientY){
  if (!sfContextMenuEl) ensureIdContextMenuWired();
  sfContextMenuEl.setAttribute('data-id', id);
  sfContextMenuEl.style.left = Math.max(8, Math.min(window.innerWidth - 180, clientX)) + 'px';
  sfContextMenuEl.style.top = Math.max(8, Math.min(window.innerHeight - 80, clientY)) + 'px';

  const liOpen = sfContextMenuEl.querySelector('li[data-act="open"]');
  try {
    const base = await getInstanceUrl();
    const ok = !!base;
    if (liOpen) { liOpen.classList.toggle('disabled', !ok); liOpen.title = ok ? 'Open record in a new tab' : 'Salesforce instance URL not detected. Open a Salesforce tab to enable this action.'; }
  } catch {
    if (liOpen) { liOpen.classList.add('disabled'); liOpen.title = 'Salesforce instance URL not detected. Open a Salesforce tab to enable this action.'; }
  }
  sfContextMenuEl.classList.remove('hidden');
}

export function hideIdContextMenu(){ try { if (sfContextMenuEl) sfContextMenuEl.classList.add('hidden'); } catch(e){} }
