(function(){
  'use strict';

  const state = {
    allLogs: [],
    filteredLogs: [],
    fetched: false
  };

  let dom = {};
  let opts = {
    getSession: () => null,
    refreshSessionFromTab: async () => null
  };

  function escape(s){ return Utils.escapeHtml(s); }

  function showEmpty() {
    if (!dom.logs) return;
    dom.logs.innerHTML = '<div class="empty-state"><p>No audit logs found</p></div>';
  }

  function showError(message) {
    if (!dom.logs) return;
    dom.logs.innerHTML = `<div class="error">${escape(message)}</div>`;
  }

  function enableControls() {
    if (dom.search) dom.search.disabled = false;
    if (dom.category) dom.category.disabled = false;
    if (dom.exportBtn) dom.exportBtn.disabled = false;
  }

  function categorizeAction(section, action) {
    const userPatterns = ['User', 'Profile', 'Permission', 'Role', 'Group'];
    const securityPatterns = ['Security', 'Password', 'Login', 'Authentication', 'Certificate', 'Session'];
    const objectPatterns = ['Object', 'Field', 'Custom', 'Layout', 'Validation', 'Workflow', 'Trigger', 'Apex'];
    const searchText = (String(section||'') + ' ' + String(action||'')).toLowerCase();
    for (const pattern of userPatterns) { if (searchText.includes(pattern.toLowerCase())) return 'User Management'; }
    for (const pattern of securityPatterns) { if (searchText.includes(pattern.toLowerCase())) return 'Security'; }
    for (const pattern of objectPatterns) { if (searchText.includes(pattern.toLowerCase())) return 'Object Changes'; }
    return 'Object Changes';
  }

  function updateStats() {
    const userCount = state.allLogs.filter(l => l.category === 'User Management').length;
    const securityCount = state.allLogs.filter(l => l.category === 'Security').length;
    const objectCount = state.allLogs.filter(l => l.category === 'Object Changes').length;
    if (dom.total) dom.total.textContent = String(state.allLogs.length);
    if (dom.user) dom.user.textContent = String(userCount);
    if (dom.security) dom.security.textContent = String(securityCount);
    if (dom.object) dom.object.textContent = String(objectCount);
    if (dom.stats) dom.stats.style.display = 'grid';
  }

  function renderLogs() {
    if (!dom.logs) return;
    if (state.filteredLogs.length === 0) {
      dom.logs.innerHTML = '<div class="empty-state"><p>No logs match your search criteria</p></div>';
      return;
    }
    const html = state.filteredLogs.map(log => {
      const categoryClass = log.category === 'User Management' ? 'user' : (log.category === 'Security' ? 'security' : 'object');
      const date = new Date(log.date);
      const formattedDate = date.toLocaleString('en-US', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
      const userHtml = (log.createdById && /^[a-zA-Z0-9]{15}(?:[a-zA-Z0-9]{3})?$/.test(String(log.createdById)))
        ? `<span class="sf-id-link" data-id="${escape(log.createdById)}" role="button" title="Open User in a new tab">${escape(log.user)}</span>`
        : `${escape(log.user)}`;
      return `
        <div class="log-item ${categoryClass}">
          <div class="log-header">
            <span class="log-category ${categoryClass}">${escape(log.category)}</span>
            <span class="log-date">${formattedDate}</span>
          </div>
          <div class="log-body">
            <div class="log-action">${escape(log.action)}</div>
            <div class="log-section">${escape(log.section)}</div>
            <div class="log-user">${userHtml}</div>
          </div>
        </div>`;
    }).join('');
    dom.logs.innerHTML = html;
  }

  function processAuditData(records) {
    if (!Array.isArray(records) || records.length === 0) { showEmpty(); return; }
    state.allLogs = records.map(record => ({
      id: record.Id,
      action: record.Action || 'Unknown Action',
      section: record.Section || 'Unknown',
      date: record.CreatedDate,
      user: record.CreatedBy ? record.CreatedBy.Name : 'Unknown User',
      createdById: record.CreatedById || '',
      display: record.Display || '',
      delegateUser: record.DelegateUser || '',
      category: categorizeAction(record.Section, record.Action)
    }));
    state.filteredLogs = [...state.allLogs];
    updateStats();
    renderLogs();
  }

  function handleSearch() {
    const term = String(dom.search?.value || '').toLowerCase();
    state.filteredLogs = state.allLogs.filter(log =>
      log.action.toLowerCase().includes(term) ||
      log.section.toLowerCase().includes(term) ||
      log.user.toLowerCase().includes(term)
    );
    renderLogs();
  }

  function handleFilter() {
    const category = dom.category ? dom.category.value : 'all';
    state.filteredLogs = (category === 'all') ? [...state.allLogs] : state.allLogs.filter(log => log.category === category);
    renderLogs();
  }

  function handleExport() {
    try {
      const rows = Array.isArray(state.filteredLogs) ? state.filteredLogs : [];
      if (!rows.length) {
        if (dom.exportBtn) {
          const oldTitle = dom.exportBtn.title; dom.exportBtn.title = 'No data to export'; dom.exportBtn.disabled = true; setTimeout(() => { dom.exportBtn.disabled = false; dom.exportBtn.title = oldTitle || 'Export CSV'; }, 800);
        }
        return;
      }
      const headers = ['Date','User','Section','Action','Category','Display','Delegate User','Id'];
      function toCsvValue(v) { const s = String(v == null ? '' : v); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; }
      const lines = []; lines.push(headers.join(','));
      for (const log of rows) {
        const d = new Date(log.date);
        const dateStr = isNaN(d.getTime()) ? String(log.date || '') : d.toISOString();
        lines.push([
          toCsvValue(dateStr), toCsvValue(log.user), toCsvValue(log.section), toCsvValue(log.action),
          toCsvValue(log.category), toCsvValue(log.display || ''), toCsvValue(log.delegateUser || ''), toCsvValue(log.id || '')
        ].join(','));
      }
      const csv = lines.join('\r\n');
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const now = new Date(); const pad = (n) => String(n).padStart(2, '0');
      const fileName = `audit-trail-${now.getFullYear()}${pad(now.getMonth()+1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}.csv`;
      const a = document.createElement('a'); a.href = url; a.download = fileName; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
      try { Utils.showToast(`CSV downloaded (${rows.length} rows)`, 'success'); } catch {}
    } catch (e) {
      if (dom.logs) dom.logs.insertAdjacentHTML('afterbegin', `<div class="error">${escape('Export failed: ' + String(e))}</div>`);
      try { Utils.showToast('Export failed', 'error'); } catch {}
    }
  }

  async function getInstanceUrl(){
    try {
      const s = opts.getSession?.() || null;
      if (s && s.instanceUrl) return String(s.instanceUrl).replace(/\/+$/, '');
    } catch {}
    return await new Promise((resolve) => {
      try {
        chrome.runtime.sendMessage({ action: 'GET_SESSION_INFO' }, (resp) => {
          if (chrome.runtime.lastError) { resolve(null); return; }
          const url = resp?.instanceUrl || null;
          resolve(url ? String(url).replace(/\/+$/, '') : null);
        });
      } catch { resolve(null); }
    });
  }

  async function openRecordInNewTab(id){
    try {
      const base = await getInstanceUrl();
      if (!base) { try { Utils.showToast('Salesforce URL not detected', 'error'); } catch {} return; }
      const url = base + '/' + encodeURIComponent(String(id||''));
      try { await chrome?.tabs?.create?.({ url }); }
      catch { try { window.open(url, '_blank', 'noopener,noreferrer'); } catch {} }
    } catch {}
  }

  function attachHandlers(){
    if (dom.fetchBtn) dom.fetchBtn.addEventListener('click', handleFetch);
    if (dom.exportBtn) dom.exportBtn.addEventListener('click', handleExport);
    if (dom.search) dom.search.addEventListener('input', handleSearch);
    if (dom.category) dom.category.addEventListener('change', handleFilter);
    if (dom.logs) dom.logs.addEventListener('click', async (e) => {
      const t = e.target; if (!(t instanceof Element)) return;
      if (t.classList.contains('sf-id-link')) {
        const id = t.getAttribute('data-id') || '';
        if (!id) return;
        e.stopPropagation();
        if (e.shiftKey) { try { await navigator.clipboard.writeText(id); Utils.showToast('Id copied', 'success'); } catch {} return; }
        await openRecordInNewTab(id);
      }
    });
  }

  function init(options){
    opts = { ...opts, ...options };
    dom = {
      fetchBtn: document.getElementById('fetch-btn'),
      exportBtn: document.getElementById('export-btn'),
      search: document.getElementById('search-input'),
      category: document.getElementById('category-filter'),
      logs: document.getElementById('logs-container'),
      stats: document.getElementById('stats'),
      total: document.getElementById('total-count'),
      user: document.getElementById('user-count'),
      security: document.getElementById('security-count'),
      object: document.getElementById('object-count')
    };
    attachHandlers();
  }

  function fetchNow(){ handleFetch(); }

  async function handleFetch() {
    try {
      await opts.refreshSessionFromTab();
      // ignore result; rely on getSession()
    } catch {}
    const s = opts.getSession();
    if (!s || !s.isLoggedIn) { showError('Please ensure you are logged in to Salesforce'); return; }
    if (dom.fetchBtn) { dom.fetchBtn.disabled = true; dom.fetchBtn.innerHTML = '<span class="btn-icon">⏳</span>'; }
    if (dom.logs) dom.logs.innerHTML = '<div class="loading"><div class="loading-spinner"></div><p>Fetching audit trail data...</p></div>';
    try {
      chrome.runtime.sendMessage({ action: 'FETCH_AUDIT_TRAIL', url: s.instanceUrl, days: 180, limit: 2000 }, (response) => {
        if (chrome.runtime.lastError) { showError('Failed to fetch data: ' + chrome.runtime.lastError.message); resetFetchButton(); return; }
        if (response && response.success) { processAuditData(response.data); enableControls(); state.fetched = true; }
        else { showError(response?.error || 'Failed to fetch audit trail data'); }
        resetFetchButton();
      });
    } catch {
      showError('An error occurred while fetching data');
      resetFetchButton();
    }
  }

  function resetFetchButton() {
    if (dom.fetchBtn) { dom.fetchBtn.disabled = false; dom.fetchBtn.innerHTML = '<span class="btn-icon">↻</span>'; }
  }

  window.AuditHelper = { init, fetchNow };
})();
