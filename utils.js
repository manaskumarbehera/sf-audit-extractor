(function(){
  'use strict';
  function escapeHtml(str) {
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }
  function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
  async function fetchWithTimeout(resource, options = {}, timeoutMs = 15000) {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await fetch(resource, { ...options, signal: controller.signal });
    } finally { clearTimeout(id); }
  }
  function svgPlus() {
    return '<svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true"><path fill="currentColor" d="M11 11V5h2v6h6v2h-6v6h-2v-6H5v-2z"/></svg>';
  }
  function svgMinus() {
    return '<svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true"><path fill="currentColor" d="M5 11h14v2H5z"/></svg>';
  }
  function showToast(message, type = 'success', durationMs = 1500) {
    try {
      const el = document.createElement('div');
      el.className = `toast ${type}`;
      el.setAttribute('role', 'status');
      el.setAttribute('aria-live', 'polite');
      el.textContent = String(message || 'Done');
      document.body.appendChild(el);
      // force reflow to apply transition
      void el.offsetWidth;
      el.classList.add('show');
      setTimeout(() => {
        el.classList.remove('show');
        setTimeout(() => { try { el.remove(); } catch {} }, 250);
      }, Math.max(800, Number(durationMs)||1500));
    } catch {}
  }

  // New: reusable download helper
  function download(filename, data, mime) {
    try {
      const blob = new Blob([data], { type: mime || 'application/octet-stream' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = filename;
      // append and click
      document.body.appendChild(a); a.click();
      a.remove(); URL.revokeObjectURL(url);
    } catch (e) {
      // fallback: copy data to clipboard if available
      try { navigator.clipboard.writeText(String(data || '')); } catch {}
    }
  }

  // Salesforce / Chrome helpers (centralized)
  async function findSalesforceTab(){
    try {
      const matches = await chrome.tabs.query({ url: ['https://*.salesforce.com/*', 'https://*.force.com/*'] });
      if (!Array.isArray(matches) || matches.length === 0) return null;
      let currentWindowId = null;
      try { const current = await chrome.windows.getCurrent({ populate: true }); currentWindowId = current?.id ?? null; } catch {}
      const activeInCurrent = matches.find(t => t.active && (currentWindowId == null || t.windowId === currentWindowId));
      return activeInCurrent || matches[0] || null;
    } catch { return null; }
  }

  async function sendMessageToSalesforceTab(message){
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
  async function getInstanceUrl(){
    if (instanceUrlCache) return instanceUrlCache;
    // Prefer a live Salesforce tab first (like Audit/LMS helpers)
    try {
      const resp = await sendMessageToSalesforceTab({ action: 'getSessionInfo' });
      if (resp && resp.success && resp.isLoggedIn && resp.instanceUrl) {
        instanceUrlCache = resp.instanceUrl;
        return instanceUrlCache;
      }
    } catch {}
    // Fallback: ask background (cookie-based)
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

  async function openRecordInNewTab(id){
    const base = (await getInstanceUrl()) || '';
    const url = (base ? base.replace(/\/+$/, '') : '') + '/' + encodeURIComponent(id);
    if (!url.startsWith('http')) return;
    try {
      await chrome.tabs.create({ url });
    } catch {
      try { window.open(url, '_blank', 'noopener,noreferrer'); } catch {}
    }
  }

  // misc fallback copy
  function fallbackCopyText(text){
    try {
      const ta = document.createElement('textarea');
      ta.value = text; ta.style.position = 'fixed'; ta.style.left = '-9999px';
      document.body.appendChild(ta); ta.select(); document.execCommand('copy'); ta.remove();
    } catch {}
  }

  window.Utils = { escapeHtml, sleep, fetchWithTimeout, svgPlus, svgMinus, showToast, download,
    findSalesforceTab, sendMessageToSalesforceTab, getInstanceUrl, openRecordInNewTab, fallbackCopyText };
})();