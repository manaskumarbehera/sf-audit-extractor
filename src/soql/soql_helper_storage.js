// filepath: /Users/manas/IdeaProjects/sf-audit-extractor/soql_helper_storage.js
export const Soql_helper_storage = (function(){
  const KEY = 'soqlRecent';
  const MAX = 20;

  async function saveQuery(query){
    try {
      const res = await chrome.storage.local.get(KEY);
      const list = (res && res[KEY]) || [];
      const normalized = (query||'').trim();
      if (!normalized) return;
      const filtered = list.filter(q => q !== normalized);
      filtered.unshift(normalized);
      const out = filtered.slice(0, MAX);
      await chrome.storage.local.set({ [KEY]: out });
    } catch {}
  }

  async function loadRecent(){
    try { const res = await chrome.storage.local.get(KEY); return (res && res[KEY]) || []; } catch { return []; }
  }

  return { saveQuery, loadRecent };
})();

