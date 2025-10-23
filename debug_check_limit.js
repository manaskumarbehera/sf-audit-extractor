import suggestSoql from './soql_suggester.js';

async function run() {
  const describe = { fields: [{ name: 'IsActive', type: 'boolean' }] };
  const sessionContext = { emittedSuggestions: [], lastEmittedAt: {} };
  const suggestions = await suggestSoql('SELECT', describe, sessionContext);
  console.log('suggestions ids:', suggestions.map(s=>s.id));
  console.log('sessionContext after:', JSON.stringify(sessionContext, null, 2));
}

run().catch(e=>{console.error(e);process.exit(1)});

