import CONFIG from './rules/soql_suggestions_config.json' assert { type: 'json' };
const r = CONFIG.suggestions.find(x => x.id === 'limit-suggestion');
console.log('raw matchRegex (JS value):', r.matchRegex);
console.log('as JSON string:', JSON.stringify(r.matchRegex));
try { new RegExp(r.matchRegex); console.log('RegExp compiles OK'); } catch (e) { console.log('RegExp compile error:', e.message); }

