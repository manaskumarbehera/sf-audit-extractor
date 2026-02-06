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
      try { navigator.clipboard.writeText(String(data || '')); } catch {}
    }
  }

  async function findSalesforceTab(){
    try {
      const matches = await chrome.tabs.query({ url: ['https://*.salesforce.com/*', 'https://*.force.com/*', 'https://*.salesforce-setup.com/*'] });
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

  // Instance URL cache with TTL and explicit setter
  const INSTANCE_URL_TTL_MS = 60 * 1000; // 1 minute
  let instanceUrlCache = { value: null, ts: 0 };

  function now() { return Date.now(); }
  function isFresh(entry) { return !!(entry && entry.value && (now() - (entry.ts || 0) < INSTANCE_URL_TTL_MS)); }

  function safeOrigin(url) {
    if (!url) return null;
    try { return new URL(url).origin; } catch {
      const m = String(url || '').match(/^(https:\/\/[^/]+)/i);
      return m ? m[1] : null;
    }
  }

  function looksLikeSalesforceOrigin(origin) {
    if (!origin) return false;
    try {
      const u = new URL(origin);
      const h = (u.hostname || '').toLowerCase();
      return h.endsWith('.salesforce.com') || h.endsWith('.force.com') || h.endsWith('.salesforce-setup.com') || h.endsWith('.my.salesforce.com') || h === 'salesforce.com' || h === 'force.com';
    } catch { return false; }
  }

  function setInstanceUrlCache(value) {
    if (!value) { instanceUrlCache = { value: null, ts: 0 }; return; }
    const origin = safeOrigin(value);
    instanceUrlCache = { value: origin || null, ts: origin ? now() : 0 };
  }
  function getCachedInstanceUrl() { return instanceUrlCache?.value || null; }

  async function getInstanceUrl(){
    // Return fresh cache if available
    if (isFresh(instanceUrlCache)) return instanceUrlCache.value;

    // Check for a transferred app session (popout) stored in chrome.storage
    try {
      const stored = await new Promise((resolve) => {
        try { chrome.storage.local.get({ appSession: null }, (r) => resolve(r || {})); } catch { resolve({ appSession: null }); }
      });
      const appSess = stored?.appSession || null;
      if (appSess && appSess.instanceUrl) {
        const origin = safeOrigin(appSess.instanceUrl);
        if (origin && looksLikeSalesforceOrigin(origin)) {
          setInstanceUrlCache(origin);
          return instanceUrlCache.value;
        }
      }
    } catch {}

    // Try foreground first
    let foregroundOrigin = null;
    try {
      const resp = await sendMessageToSalesforceTab({ action: 'getSessionInfo' });
      if (resp && resp.success && resp.isLoggedIn && resp.instanceUrl) {
        foregroundOrigin = safeOrigin(resp.instanceUrl);
        if (foregroundOrigin && looksLikeSalesforceOrigin(foregroundOrigin)) {
           // If cache differs from foreground, treat as org change and replace cache
           if (instanceUrlCache.value && instanceUrlCache.value !== foregroundOrigin) {
             setInstanceUrlCache(foregroundOrigin);
           } else {
             setInstanceUrlCache(foregroundOrigin);
           }
           return instanceUrlCache.value;
         }
      } else {
        // Foreground responded but not logged in or error-like: clear cache to force background detection
        if (instanceUrlCache.value) setInstanceUrlCache(null);
      }
    } catch {
      // Foreground messaging failed: clear stale cache to force fallback
      if (instanceUrlCache.value) setInstanceUrlCache(null);
    }

    // Fallback: ask background (cookie-based)
    return await new Promise((resolve) => {
      try {
        chrome.runtime.sendMessage({ action: 'GET_SESSION_INFO' }, (resp) => {
          if (chrome.runtime.lastError) { resolve(null); return; }
          const url = resp?.instanceUrl || null;
          const origin = safeOrigin(url);
          if (origin && looksLikeSalesforceOrigin(origin)) setInstanceUrlCache(origin); else setInstanceUrlCache(null);
           resolve(instanceUrlCache.value);
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

  // Shared: normalize API version (strip leading v, validate, return "major.minor")
  function normalizeApiVersion(value){
    try {
      if (value == null) return null;
      const str = String(value).trim();
      if (!str) return null;
      const noV = str.replace(/^v/i, '');
      const m = noV.match(/^(\d{1,3})(?:\.(\d{1,2}))?$/);
      if (!m) return null;
      const major = parseInt(m[1], 10);
      const minor = m[2] != null ? parseInt(m[2], 10) : 0;
      return `${major}.${minor}`;
    } catch { return null; }
  }

  // Shared: safe URL join
  function joinUrl(base, ...parts) {
    const all = [base, ...parts].filter(Boolean).map(String);
    return all.reduce((acc, part, idx) => {
      if (idx === 0) return part.replace(/\/+$/g, '');
      return acc.replace(/\/+$/g, '') + '/' + part.replace(/^\/+/, '').replace(/\/+$/g, '');
    }, '');
  }

  async function getApiVersionNumber(){
    try {
      const { apiVersion } = await chrome.storage?.local?.get?.({ apiVersion: '65.0' });
      const normalized = normalizeApiVersion(apiVersion || '65.0') || '65.0';
      // Persist normalized (no leading v)
      if (normalized !== apiVersion) {
        try { await chrome.storage?.local?.set?.({ apiVersion: normalized }); } catch {}
      }
      return String(normalized);
    } catch { return '65.0'; }
  }

  async function getApiVersionPath(){
    const n = await getApiVersionNumber();
    return n.startsWith('v') ? n : ('v' + n);
  }

  function getAccessToken(session){
    if (!session) return null;
    return (
      session.accessToken ||
      session.sessionId ||
      session.sid ||
      session.sessionToken ||
      session.session_token ||
      null
    );
  }

  async function getSessionInfo(){
    const resp = await sendMessageToSalesforceTab({ action: 'getSessionInfo' });
    return resp || null;
  }

  window.Utils = { escapeHtml, sleep, fetchWithTimeout, svgPlus, svgMinus, showToast, download,
    findSalesforceTab, sendMessageToSalesforceTab, getInstanceUrl, openRecordInNewTab, fallbackCopyText,
    getApiVersionNumber, getApiVersionPath, getAccessToken, getSessionInfo,
    normalizeApiVersion, joinUrl, setInstanceUrlCache, getCachedInstanceUrl, looksLikeSalesforceOrigin };
})();

