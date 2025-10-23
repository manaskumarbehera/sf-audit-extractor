import { generateSuggestions } from './soql_suggestions_engine.js';

let _cachedRules = null;
async function loadRules() {
  if (_cachedRules) return _cachedRules;
  // Try browser fetch first
  try {
    if (typeof fetch === 'function') {
      let fetchUrl = 'rules/soql_suggestions_config.json';
      try {
        if (typeof chrome !== 'undefined' && chrome.runtime && typeof chrome.runtime.getURL === 'function') {
          fetchUrl = chrome.runtime.getURL('rules/soql_suggestions_config.json');
        }
      } catch (e) {}
      const res = await fetch(fetchUrl, { cache: 'no-store' });
      if (res && res.ok) {
        // fetch as text first so we can tolerate comments in the JSON file
        const txt = await res.text();
        try {
          _cachedRules = JSON.parse(txt);
        } catch (e) {
          // strip JS-style comments (/* ... */ and // ...) and retry
          const cleaned = txt.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
          _cachedRules = JSON.parse(cleaned);
        }
        return _cachedRules;
      }
    }
  } catch (e) {}
  // Node/test fallback
  try {
    if (typeof process !== 'undefined' && process.cwd) {
      // Use dynamic import so this file is ESM-friendly when package.json has "type": "module"
      const fsMod = await import('fs');
      const pathMod = await import('path');
      const fs = fsMod && fsMod.default ? fsMod.default : fsMod;
      const path = pathMod && pathMod.default ? pathMod.default : pathMod;
      const p = path.resolve(process.cwd(), 'rules', 'soql_suggestions_config.json');
      if (fs.existsSync(p)) {
        const txt = fs.readFileSync(p, 'utf8');
        const cleaned = txt.replace(/^\s*\/\/.*$/gm, '');
        _cachedRules = JSON.parse(cleaned);
        return _cachedRules;
      }
    }
  } catch (e) {}
  _cachedRules = [];
  return _cachedRules;
}

function resolveSuggestions(candidates, policy, rules) {
  if (!candidates || candidates.length === 0) return [];
  const policyConflict = (policy && policy.conflictResolution) || { groupStrategy: 'highest-priority-wins', deDupeBy: ['message','id'] };
  const deDupeBy = Array.isArray(policyConflict.deDupeBy) && policyConflict.deDupeBy.length ? policyConflict.deDupeBy : ['message','id'];

  const findRuleForSuggestion = (s) => {
    if (s.__rule) return s.__rule;
    if (s.__ruleId && Array.isArray(rules)) {
      const r = rules.find(rr => rr && (rr.id === s.__ruleId || rr.type === s.__ruleId));
      if (r) return r;
    }
    if (Array.isArray(rules)) {
      const r2 = rules.find(rr => rr && (rr.id === s.id || rr.type === s.id));
      if (r2) return r2;
    }
    return null;
  };

  const byKey = new Map();
  const normalized = candidates.map(s => {
    const r = findRuleForSuggestion(s);
    const priority = (s.__priority != null) ? s.__priority : (r && r.priority != null ? r.priority : 0);
    const keyParts = deDupeBy.map(k => (s[k] != null ? String(s[k]) : '')).join('||');
    return Object.assign({}, s, { __priority: priority, __rule: r, __dupeKey: keyParts });
  });

  let candidatesToConsider = normalized;
  try {
    const hasStarter = normalized.some(s => s.__rule && s.__rule.mutexGroup === 'starter');
    if (hasStarter) candidatesToConsider = normalized.filter(s => s.__rule && s.__rule.mutexGroup === 'starter');
  } catch (e) { /* ignore */ }

  for (const s of candidatesToConsider) {
    const existing = byKey.get(s.__dupeKey);
    if (!existing) byKey.set(s.__dupeKey, s);
    else {
      if ((s.__priority || 0) > (existing.__priority || 0)) byKey.set(s.__dupeKey, s);
    }
  }

  const deduped = Array.from(byKey.values());
  deduped.sort((a, b) => {
    if ((b.__priority || 0) !== (a.__priority || 0)) return (b.__priority || 0) - (a.__priority || 0);
    const sevOrder = { 'warn': 3, 'warning': 3, 'tip': 2, 'info': 1 };
    const sa = sevOrder[(a.severity||'info')] || 0;
    const sb = sevOrder[(b.severity||'info')] || 0;
    if (sb !== sa) return sb - sa;
    return 0;
  });

  const winner = deduped[0];
  if (!winner) return [];
  const out = Object.assign({}, winner);
  delete out.__priority; delete out.__rule; delete out.__dupeKey; delete out.__ruleId;
  return [out];
}

export async function suggestSoql(query, describe, editorState) {
  const rulesRaw = await loadRules();
  let rules;
  let policy;

  // Normalize loaded rules into a definitive policy object and rules array.
  // If the loaded config is an object that contains a `suggestions` array, treat it as the policy
  // and ensure we enforce declarative-only behavior by default. Otherwise, if the config is a
  // bare array, use it as the rules array and supply a minimal policy.
  if (rulesRaw && typeof rulesRaw === 'object' && !Array.isArray(rulesRaw) && Array.isArray(rulesRaw.suggestions)) {
    // copy the loaded policy and enforce declarativeOnly
    const basePolicy = Object.assign({}, rulesRaw);
    policy = Object.assign({ declarativeOnly: true }, basePolicy);
    rules = Array.isArray(policy.suggestions) ? policy.suggestions : [];
  } else if (Array.isArray(rulesRaw)) {
    // simple array of rule objects treated as legacy rules list
    policy = Object.assign({ declarativeOnly: true }, {});
    rules = rulesRaw;
  } else if (rulesRaw && typeof rulesRaw === 'object') {
    // object without suggestions array: copy but still enforce declarativeOnly and try suggestions
    policy = Object.assign({ declarativeOnly: true }, rulesRaw);
    rules = Array.isArray(policy.suggestions) ? policy.suggestions : [];
  } else {
    // fallback: empty
    policy = { declarativeOnly: true };
    rules = [];
  }

  // delegate generation to engine (returns array of candidates)
  const candidates = await generateSuggestions(query || '', describe, editorState, rules, policy);

  // resolve/dedupe and return only top suggestion
  return resolveSuggestions(candidates, policy, rules);
}

export default suggestSoql;
