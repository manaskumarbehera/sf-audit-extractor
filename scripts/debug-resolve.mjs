import fs from 'fs';
import path from 'path';

function localResolveSuggestions(candidates, policy, rules) {
  if (!candidates || candidates.length === 0) return [];
  // reference optional params to avoid 'unused' inspections
  if (policy && policy.conflictResolution) { /* intentionally no-op: policy referenced */ }
  if (rules && rules.length) { /* intentionally no-op: rules referenced */ }

  const byKey = new Map();
  const normalized = (candidates || []).map(s => Object.assign({}, s, { __priority: s.__priority || 0, __dupeKey: (s.id || '') }));
  for (const s of normalized) {
    const existing = byKey.get(s.__dupeKey);
    if (!existing) byKey.set(s.__dupeKey, s);
    else if ((s.__priority || 0) > (existing.__priority || 0)) byKey.set(s.__dupeKey, s);
  }
  const deduped = Array.from(byKey.values());
  deduped.sort((a,b)=>((b.__priority||0)-(a.__priority||0)));
  return deduped.slice(0,1);
}

async function runCase(q) {
  const rulesFiles = [
    path.resolve(process.cwd(), 'rules', 'soql_suggestions_config.json'),
    path.resolve(process.cwd(), 'rules', 'soql_builder_tips.json'),
    path.resolve(process.cwd(), 'rules')
  ];
  let rules = [];
  for (const rf of rulesFiles) {
    try {
      if (fs.existsSync(rf) && fs.statSync(rf).isFile()) {
        const txt = fs.readFileSync(rf, 'utf8');
        try { rules = rules.concat(JSON.parse(txt).suggestions || []); } catch {}
      }
    } catch (e) {}
  }
  console.log('\n=== CASE:', q, '===');
  // No SOQL engine available; create a minimal candidate set based on query
  const candidates = [];
  if (!q || q.trim() === '') candidates.push({ id: 'start_select', text: 'Start a SELECT', __priority: 10 });
  else if (/select\s+fields\(all\)/i.test(q)) candidates.push({ id: 'add_from', text: 'Add FROM <Object>', __priority: 8 });
  else if (/select\s+/i.test(q)) candidates.push({ id: 'fields_helper', text: 'FIELDS(...) helpers', __priority: 5 });

  console.log('candidates:', candidates.map(c=>({id:c.id,text:c.text})));
  const resolved = localResolveSuggestions(candidates, {}, rules);
  console.log('resolved:', resolved);
}

(async ()=>{
  await runCase('');
  await runCase(['SELECT'].join(' '));
  await runCase(['SELECT','FIELDS(ALL)'].join(' '));
  await runCase(['SELECT','Id','FROM','Account'].join(' '));
})();
