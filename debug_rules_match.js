import CONFIG from './rules/soql_suggestions_config.json' assert { type: 'json' };

const query = "SELECT FIELDS(ALL) FROM Account ";
console.log('Query:', query);
for (const r of CONFIG.suggestions) {
  if (!r || !r.matchOn || r.matchOn !== 'query') continue;
  try {
    const re = new RegExp(r.matchRegex, 'i');
    const m = re.test(query);
    console.log(r.id.padEnd(30), 'matchRegex:', String(r.matchRegex).padEnd(40), ' => ', m);
  } catch (e) {
    console.log(r.id.padEnd(30), 'invalid regex', r.matchRegex);
  }
}

