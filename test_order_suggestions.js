import suggestSoql from './soql_suggester.js';

async function run() {
  const describe = {
    fields: [
      { name: 'Id', type: 'id' },
      { name: 'Name', type: 'string' },
      { name: 'CreatedDate', type: 'datetime' },
      { name: 'OwnerId', type: 'reference' }
    ],
    parentFields: { Account: ['Name','Id'], Owner: ['Name','Id'] }
  };

  const cases = [
    { name: 'order-by-empty', q: 'SELECT Id FROM Account ORDER BY ' },
    { name: 'order-by-field-typing', q: 'SELECT Id FROM Account ORDER BY Nam' },
    { name: 'order-by-after-field', q: 'SELECT Id FROM Account ORDER BY Name ' },
    { name: 'order-by-after-asc', q: 'SELECT Id FROM Account ORDER BY Name ASC ' }
  ];

  for (const c of cases) {
    const suggestions = await suggestSoql(c.q, describe, 'soqlEditor');
    console.log('---', c.name, '---');
    console.log('input:', JSON.stringify(c.q));
    console.log('suggestions:');
    if (!suggestions || !suggestions.length) console.log('<none>');
    else suggestions.forEach(s => {
      const short = { id: s.id, text: s.text || s.message || s.apply?.text || null, severity: s.severity, apply: s.apply };
      console.log(JSON.stringify(short));
    });
    console.log('\n');
  }
}

run().catch(err => { console.error(err); process.exit(2); });

