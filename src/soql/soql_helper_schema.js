// filepath: /Users/manas/IdeaProjects/sf-audit-extractor/soql_helper_schema.js
export const Soql_helper_schema = (function(){
  const describeCache = new Map();
  // support separate global lists for standard vs tooling endpoints
  const globalLists = { standard: null, tooling: null };
  let _lastDescribeResp = null; // module-level variable to store last raw DESCRIBE_GLOBAL response

  // helper: safe JSON stringify (handles circular refs and truncation)
  function safeStringify(obj, maxLen = 2000) {
    const seen = new WeakSet();
    try {
      const str = JSON.stringify(obj, function(key, value) {
        if (value && typeof value === 'object') {
          if (seen.has(value)) return '[Circular]';
          seen.add(value);
        }
        return value;
      });
      if (typeof str === 'string' && str.length > maxLen) return str.slice(0, maxLen) + '... (truncated)';
      return str;
    } catch (e) {
      try { return String(obj); } catch (e2) { return '<unserializable>'; }
    }
  }

  // initSchema accepts optional useTooling flag
  async function initSchema(useTooling = false){
    const key = useTooling ? 'tooling' : 'standard';
    try {
      const instanceUrl = await (await import('./soql_helper_utils.js')).getInstanceUrl();
      let resp = await send({ action: 'DESCRIBE_GLOBAL', instanceUrl, useTooling });

      // Specific: if background returned an explicit 'Instance URL not detected.' error,
      // avoid doing the runtime.sendMessage fallback (it's redundant) and surface a clearer message.
      try {
        if (resp && resp.success === false && typeof resp.error === 'string' && /instance\s*url\s*not\s*detected/i.test(resp.error)) {
          try { _lastDescribeResp = resp; } catch (e) { /* ignore */ }
          try { console.warn('soql_helper_schema: DESCRIBE_GLOBAL failed — instance URL not detected. Open a Salesforce tab or ensure a session is available.'); } catch (e) {}
          globalLists[key] = [];
          return globalLists[key];
        }
      } catch (e) { /* ignore parsing failure and continue to fallback logic */ }

      // If send returned null or there's no objects array, try a direct runtime.sendMessage fallback for better diagnostics
      if (!resp || !Array.isArray(resp.objects)) {
        try {
          resp = await new Promise((resolve) => {
            try {
              chrome.runtime.sendMessage({ action: 'DESCRIBE_GLOBAL', instanceUrl, useTooling }, (r) => {
                if (chrome.runtime.lastError) {
                  console.warn('soql_helper_schema: runtime.sendMessage lastError', chrome.runtime.lastError);
                  resolve(null);
                } else {
                  resolve(r || null);
                }
              });
            } catch (e) { console.warn('soql_helper_schema: runtime.sendMessage exception', e); resolve(null); }
          });
        } catch (e) { console.warn('soql_helper_schema: send fallback failed', e); }
      }

      // store raw response for diagnostics
      try { _lastDescribeResp = resp; } catch (e) { /* ignore */ }

      // Accept responses that include an objects array even when `success` is missing.
      if (resp && Array.isArray(resp.objects)) {
        const raw = resp.objects;

        const queryableForSoql = raw.filter(o => {
          try {
            if (!o || !o.name) return false;
            if (String(o.name).endsWith('ChangeEvent')) return false; // CDC events (e.g., AccountCleanInfoChangeEvent)
            if (String(o.name).endsWith('__e')) return false;         // Platform Events
            if (String(o.name).endsWith('__b')) return false;         // Big Objects (Async SOQL only)
            // If API provides explicit queryable flag, prefer it. Otherwise treat as queryable when not explicitly false.
            if (typeof o.queryable === 'boolean') return o.queryable === true;
            return o.queryable !== false;
          } catch (e) { return false; }
        });

        globalLists[key] = (queryableForSoql.length ? queryableForSoql : raw.filter(o =>
          o && o.name && !String(o.name).endsWith('ChangeEvent') && !String(o.name).endsWith('__e') && !String(o.name).endsWith('__b')
        )).sort((a,b) => (String(a.name||'')).localeCompare(String(b.name||'')));
      } else {
        // if there was an error message, surface it to console for diagnostics (stringify safely)
        try { console.warn('soql_helper_schema: DESCRIBE_GLOBAL unexpected response', safeStringify(resp)); } catch {}
        globalLists[key] = [];
      }
    } catch (e) { console.warn('soql_helper_schema: initSchema exception', e); globalLists[key] = []; }
    return globalLists[key];
  }

  // describeSObject optionally accepts useTooling
  async function describeSObject(name, useTooling = false){
    if (!name) return null;
    const cacheKey = (useTooling ? 'TOOLING|' : 'STD|') + name;
    if (describeCache.has(cacheKey)) return describeCache.get(cacheKey);
    try {
      const instanceUrl = await (await import('./soql_helper_utils.js')).getInstanceUrl();
      const resp = await send({ action: 'DESCRIBE_SOBJECT', name, instanceUrl, useTooling });
      if (resp && resp.success && resp.describe) {
        describeCache.set(cacheKey, resp.describe);
        return resp.describe;
      }
    } catch {}
    return null;
  }

  // getObjects accepts useTooling flag and returns appropriate cached list
  function getObjects(useTooling = false) { return globalLists[useTooling ? 'tooling' : 'standard'] || []; }

  // Diagnostic accessor: return last raw DESCRIBE_GLOBAL response (may be null)
  function getLastDescribeGlobalResponse() { return _lastDescribeResp; }

  // Modified: ensure instanceUrl is passed along; keep Promise-based API
  async function send(msg){
    const base = typeof msg === 'object' && msg ? msg : { action: String(msg || '') };
    if (!base.instanceUrl) {
      try { base.instanceUrl = await (await import('./soql_helper_utils.js')).getInstanceUrl(); } catch { /* ignore */ }
    }
    // Return structured response so callers can show diagnostics when messaging fails
    return await new Promise((resolve) => {
      try {
        chrome.runtime.sendMessage(base, (resp) => {
          if (chrome.runtime.lastError) {
            resolve({ success: false, error: String(chrome.runtime.lastError && chrome.runtime.lastError.message ? chrome.runtime.lastError.message : chrome.runtime.lastError) });
          } else {
            resolve(resp || { success: true, data: null });
          }
        });
      } catch (e) {
        resolve({ success: false, error: String(e) });
      }
    });
  }

  // Helper: determine whether an sObject name is queryable (uses cached DESCRIBE_GLOBAL when available,
  // falls back to attempting a describeSObject call if necessary). This avoids blind describe calls for
  // objects that are known to be non-queryable (Platform Events, CDC events, big objects) or flagged by the API.
  async function isQueryable(name, useTooling = false) {
    try {
      if (!name) return false;
      // quick string normalization
      const n = String(name || '');
      // Filter out obvious non-queryable patterns first
      if (n.endsWith('ChangeEvent')) return false; // CDC event variants intentionally excluded
      if (n.endsWith('__e')) return false;         // Platform Events
      if (n.endsWith('__b')) return false;         // Big Objects (Async SOQL only)

      const key = useTooling ? 'tooling' : 'standard';
      const list = globalLists[key] || [];
      if (list && list.length) {
        const found = list.find(o => o && (String(o.name) === n || String(o.label) === n));
        if (found) {
          if (typeof found.queryable === 'boolean') return !!found.queryable;
          // if not explicitly boolean, treat as queryable unless API explicitly set queryable === false
          return found.queryable !== false;
        }
      }

      // If we couldn't determine from global list, try a describeSObject (will return null if describe fails)
      try {
        const desc = await describeSObject(n, useTooling);
        return !!(desc && Array.isArray(desc.fields));
      } catch (e) {
        return false;
      }
    } catch (e) {
      return false;
    }
  }

  return { initSchema, describeSObject, getObjects, getLastDescribeGlobalResponse, isQueryable };
})();
