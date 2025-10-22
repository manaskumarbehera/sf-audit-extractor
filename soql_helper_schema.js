export const Soql_helper_schema = (function(){
  const describeCache = new Map();
  let globalList = null;

  // New: cache for instance URL
  let instanceUrlCache = null;

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

  async function initSchema(){
    try {
      const instanceUrl = await getInstanceUrl();
      const resp = await send({ action: 'DESCRIBE_GLOBAL', instanceUrl });
      if (resp && resp.success && Array.isArray(resp.objects)) {
        globalList = resp.objects.sort((a,b) => (a.name||'').localeCompare(b.name||''));
      } else {
        globalList = [];
      }
    } catch { globalList = []; }
    return globalList;
  }

  async function describeSObject(name){
    if (!name) return null;
    if (describeCache.has(name)) return describeCache.get(name);
    try {
      const instanceUrl = await getInstanceUrl();
      const resp = await send({ action: 'DESCRIBE_SOBJECT', name, instanceUrl });
      if (resp && resp.success && resp.describe) {
        describeCache.set(name, resp.describe);
        return resp.describe;
      }
    } catch {}
    return null;
  }

  function getObjects() { return globalList || []; }

  // Modified: ensure instanceUrl is passed along; keep Promise-based API
  async function send(msg){
    const base = typeof msg === 'object' && msg ? msg : { action: String(msg || '') };
    if (!base.instanceUrl) {
      try { base.instanceUrl = await getInstanceUrl(); } catch { /* ignore */ }
    }
    return await new Promise((resolve) => {
      try {
        chrome.runtime.sendMessage(base, (resp) => {
          if (chrome.runtime.lastError) resolve(null); else resolve(resp || null);
        });
      } catch { resolve(null); }
    });
  }

  return { initSchema, describeSObject, getObjects };
})();
