import suggestSoql, { suggestSoqlAll } from '../soql_suggester.js';

async function run() {
  const tests = [
    { q: '', name: 'empty editor' },
    { q: 'SELECT ', name: "after SELECT" },
    { q: 'SELECT FIELDS(ALL) ', name: "after FIELDS(ALL)" },
    { q: 'SELECT Id FROM Account ', name: 'after SELECT...FROM Account' },
  ];

  for (const t of tests) {
    try {
      const resAll = await suggestSoqlAll(t.q, null, 'soqlEditor');
      const res = await suggestSoql(t.q, null, 'soqlEditor');
      console.log('---', t.name, '---');
      console.log('All candidates:', JSON.stringify(resAll, null, 2));
      console.log('Resolved top suggestion:', JSON.stringify(res, null, 2));
    } catch (e) {
      console.error('Error for', t.name, e && e.message ? e.message : e);
    }
  }
}

run().catch(e => { console.error(e); process.exit(1); });

