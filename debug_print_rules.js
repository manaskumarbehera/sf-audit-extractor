import fs from 'fs';
const raw = fs.readFileSync('rules/soql_suggestions_config.json','utf8');
const obj = JSON.parse(raw);
console.log('top-level keys:', Object.keys(obj));
console.log('has suggestions array?', Array.isArray(obj.suggestions));
console.log('first suggestion id:', obj.suggestions[0].id);
console.log('types present:', obj.suggestions.map(s=>s.type).slice(0,10));
console.log('has add_limit?', obj.suggestions.some(s=>s.type==='add_limit'));
console.log('has id limit-suggestion?', obj.suggestions.some(s=>s.id==='limit-suggestion'));

