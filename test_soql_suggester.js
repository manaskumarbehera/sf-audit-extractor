import suggestSoql from './soql_suggester.js';

async function run() {
  const describe = {
    fields: [{ name: 'IsActive', type: 'boolean' }, { name: 'Id', type: 'id' }],
    parentFields: { Account: ['Name', 'Id'], Owner: ['Name', 'Id'] }
  };

  const cases = [
    { name: 'empty', q: '' },
    { name: 'space', q: '   ' },
    { name: 'select-no-space', q: 'SELECT' },
    { name: 'select-space', q: 'SELECT ' },
    { name: 'fields-all', q: 'SELECT FIELDS(ALL)' },
    { name: 'leading-comma', q: 'SELECT ,Id' }
  ];

  for (const c of cases) {
    const suggestions = await suggestSoql(c.q, describe, 'soqlEditor');
    console.log('---', c.name, '---');
    console.log('input:', JSON.stringify(c.q));
    console.log('suggestions:');
    suggestions.forEach(s => {
      const short = { id: s.id, text: s.text, severity: s.severity, apply: s.apply };
      console.log(JSON.stringify(short));
    });
    console.log('\n');
  }
}

run().catch(err => { console.error(err); process.exit(2); });
