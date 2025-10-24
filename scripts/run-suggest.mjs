// Simple runner to test suggestSoql from the extension codebase
// Run with: SUGGEST_DEBUG=1 node scripts/run-suggest.mjs

const { default: suggestSoql, suggestSoqlAll } = await import(new URL('../soql_suggester.js', import.meta.url));

async function run() {
  const query = 'SELECT Id FROM Account ';
  console.log('Query:', JSON.stringify(query));
  try {
    // Call the new API that returns all generated candidate suggestions
    const allCandidates = await suggestSoqlAll(query, null, {});
    console.log('All candidate suggestions:', JSON.stringify(allCandidates, null, 2));

    // Also show the resolved top suggestion for comparison
    const suggestions = await suggestSoql(query, null, {});
    console.log('Resolved suggestion (original):', JSON.stringify(suggestions, null, 2));
  } catch (e) {
    console.error('Error calling suggest functions:', e && e.stack ? e.stack : e);
  }
}

run();
