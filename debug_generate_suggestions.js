import fs from 'fs';
import path from 'path';
import { generateSuggestions } from './soql_suggestions_engine.js';

function loadPolicy() {
  const p = path.resolve(process.cwd(), 'rules', 'soql_suggestions_config.json');
  const txt = fs.readFileSync(p, 'utf8');
  const cleaned = txt.replace(/^\s*\/\/.*$/gm, '');
  return JSON.parse(cleaned);
}

async function run() {
  const policy = loadPolicy();
  const rules = Array.isArray(policy.suggestions) ? policy.suggestions : [];
  console.log('Loaded rules:', rules.length);
  console.log('Has order-by-field-suggestions:', rules.some(r=>r.id==='order-by-field-suggestions'));
  console.log('Has order-by-followups:', rules.some(r=>r.id==='order-by-followups'));

  const describe = {
    fields: [ { name: 'Id', type: 'id' }, { name: 'Name', type: 'string' }, { name: 'CreatedDate', type: 'datetime' } ],
    parentFields: { Account: ['Name','Id'], Owner: ['Name','Id'] }
  };

  const queries = [
    'SELECT Id FROM Account ORDER BY ',
    'SELECT Id FROM Account ORDER BY Nam',
    'SELECT Id FROM Account ORDER BY Name ',
    'SELECT Id FROM Account ORDER BY Name ASC '
  ];

  for (const q of queries) {
    const candidates = await generateSuggestions(q, describe, 'soqlEditor', rules, policy);
    console.log('\nQuery:', q);
    console.log('Candidates count:', candidates.length);
    candidates.forEach((c, idx) => {
      console.log(idx, c.id || c.__ruleId || c.text || '(no id)', c.text || c.message || '', c.__ruleId || c.__priority || '');
    });
  }
}

run().catch(e=>{ console.error(e); process.exit(2); });

