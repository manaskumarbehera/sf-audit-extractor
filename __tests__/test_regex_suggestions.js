// Copied test harness (moved from repo root)
// Original: test_regex_suggestions.js
import fs from 'fs';

function stripComments(raw) {
  return raw.replace(/^[ \t]*\/\/.*$/gm, '');
}

function fail(msg) {
  console.error('FAIL:', msg);
  process.exitCode = 2;
}

function info(msg) { console.log(msg); }

(async function run() {
  const p = 'rules/soql_suggestions_config.json';
  const raw = fs.readFileSync(p, 'utf8');
  const stripped = stripComments(raw);
  let obj;
  try {
    obj = JSON.parse(stripped);
  } catch (e) {
    fail('JSON parse error: ' + e.message);
    return;
  }

  const constructions = [];
  const warnings = [];
  const errors = [];

  for (const s of (obj.suggestions || [])) {
    ['matchRegex', 'notMatchRegex'].forEach(key => {
      if (!s[key]) return;
      const val = String(s[key]);
      if (val.includes(')\\b')) {
        warnings.push({ id: s.id, key, value: val });
      }
      try {
        new RegExp(val, 'i');
        constructions.push({ id: s.id, key });
      } catch (e) {
        errors.push({ id: s.id, key, error: e.message, value: val });
      }
    });
  }

  const limit = (obj.suggestions || []).find(x => x.id === 'limit-suggestion');
  if (!limit) {
    errors.push({ id: 'limit-suggestion', error: 'not found' });
  } else {
    const pattern = String(limit.matchRegex);
    let re;
    try {
      re = new RegExp(pattern, 'i');
    } catch (e) {
      errors.push({ id: 'limit-suggestion', key: 'matchRegex', error: 'RegExp construct failed: ' + e.message, value: pattern });
    }
    if (re) {
      const positive = ['FIELDS(ALL)', 'FIELDS (ALL)', 'fields ( standard )', 'SELECT FIELDS(ALL) FROM Account'];
      const negative = ['FIELDS(FOO)', 'LIMIT 200', 'RANDOMFIELDS(ALL)'];
      for (const t of positive) if (!re.test(t)) errors.push({ id: 'limit-suggestion', reason: 'should match positive', example: t, pattern });
      for (const t of negative) if (re.test(t)) errors.push({ id: 'limit-suggestion', reason: 'should NOT match negative', example: t, pattern });
    }
  }

  console.log('\nRegex construction summary:');
  console.log('Total constructed regex entries:', constructions.length);
  if (warnings.length) {
    console.log('\nWarnings (suspect )\\b placements):');
    for (const w of warnings) console.log('-', w.id, w.key, JSON.stringify(w.value));
  }
  if (errors.length) {
    console.error('\nErrors:');
    for (const e of errors) console.error('-', e.id, e.key || '', e.error || '', e.value ? JSON.stringify(e.value) : '');
    fail('One or more regex errors detected');
    return;
  }

  console.log('\nAll regexes constructed without error.');
  if (!warnings.length) console.log('No suspicious )\\b placements detected.');
  else console.log('Review the warnings above and adjust patterns if necessary.');
  process.exitCode = 0;
})();
// Copied test harness (moved from repo root)
// Original: test_soql_suggester.js
import('../test_soql_suggester.js');
