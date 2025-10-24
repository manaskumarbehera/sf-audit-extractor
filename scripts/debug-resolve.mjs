import fs from 'fs';
import path from 'path';
import { generateSuggestions } from '../soql_suggestions_engine.js';

function localResolveSuggestions(candidates, policy, rules) {
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

  console.log('localResolve -> normalized', normalized.map(n=>({id:n.id, __dupeKey:n.__dupeKey, __priority:n.__priority, hasRule: !!n.__rule})));

  let candidatesToConsider = normalized;
  try {
    const hasStarter = normalized.some(s => s.__rule && s.__rule.mutexGroup === 'starter');
    if (hasStarter) candidatesToConsider = normalized.filter(s => s.__rule && s.__rule.mutexGroup === 'starter');
  } catch (e) {}

  console.log('localResolve -> candidatesToConsider', candidatesToConsider.map(c=>({id:c.id, __dupeKey:c.__dupeKey, __priority:c.__priority, ruleId: c.__rule && c.__rule.id})));

  for (const s of candidatesToConsider) {
    const existing = byKey.get(s.__dupeKey);
    if (!existing) byKey.set(s.__dupeKey, s);
    else {
      if ((s.__priority || 0) > (existing.__priority || 0)) byKey.set(s.__dupeKey, s);
    }
  }

  const deduped = Array.from(byKey.values());
  console.log('localResolve -> deduped', deduped.map(d=>({id:d.id,__priority:d.__priority, ruleId: d.__rule && d.__rule.id})));

  deduped.sort((a, b) => {
    if ((b.__priority || 0) !== (a.__priority || 0)) return (b.__priority || 0) - (a.__priority || 0);
    const sevOrder = { 'warn': 3, 'warning': 3, 'tip': 2, 'info': 1 };
    const sa = sevOrder[(a.severity||'info')] || 0;
    const sb = sevOrder[(b.severity||'info')] || 0;
    if (sb !== sa) return sb - sa;
    return 0;
  });

  console.log('localResolve -> sorted deduped', deduped.map(d=>({id:d.id,__priority:d.__priority, severity: d.severity})));

  const winner = deduped[0];
  console.log('localResolve -> winner', winner && {id:winner.id, __priority:winner.__priority});
  if (!winner) return [];
  const out = Object.assign({}, winner);
  delete out.__priority; delete out.__rule; delete out.__dupeKey; delete out.__ruleId;
  return [out];
}

async function runCase(q) {
  const rulesFile = path.resolve(process.cwd(), 'rules', 'soql_suggestions_config.json');
  const txt = fs.readFileSync(rulesFile, 'utf8');
  const cfg = JSON.parse(txt.replace(/\/\*?[\s\S]*?\*\//g, ''));
  const policy = Object.assign({declarativeOnly:true}, cfg);
  const rules = Array.isArray(policy.suggestions)?policy.suggestions:[];
  console.log('\n=== CASE:', q, '===');
  const candidates = await generateSuggestions(q, null, 'soqlEditor', rules, policy);
  console.log('generateSuggestions -> candidates', candidates.map(c=>({id:c.id, text:c.text, __ruleId:c.__ruleId, __priority:c.__priority})) );
  const resolved = localResolveSuggestions(candidates, policy, rules);
  console.log('resolved:', resolved);
}

(async ()=>{
  await runCase('');
  await runCase('SELECT ');
  await runCase('SELECT FIELDS(ALL) ');
  await runCase('SELECT Id FROM Account ');
})();

