import { getSuggestions } from './soql_suggestions_engine.js';
import CONFIG from './rules/soql_suggestions_config.json' assert { type: 'json' };

async function run() {
  const query = "SELECT FIELDS(ALL) FROM Account ";
  const ctx = { phase: 'CHOOSING_OBJECT' };
  console.log('Query:', JSON.stringify(query));
  const s1 = await getSuggestions({ query, context: ctx, config: CONFIG, describeProvider: null });
  console.log('First call suggestions:', s1.map(s => s.id));
  const s2 = await getSuggestions({ query, context: ctx, config: CONFIG, describeProvider: null });
  console.log('Second call suggestions:', s2.map(s => s.id));
  console.log('All suggestions details (first call):', JSON.stringify(s1, null, 2));
}

run().catch(e => { console.error(e); process.exit(2); });

