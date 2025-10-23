import suggestSoql from './soql_suggester.js';
import assert from 'assert';

async function testCooldown() {
  const describe = { fields: [{ name: 'IsActive', type: 'boolean' }] };
  // sessionContext is passed through calls to preserve emittedSuggestions/lastEmittedAt
  const sessionContext = { emittedSuggestions: [], lastEmittedAt: {} };
  // First call should emit the limit suggestion
  const s1 = await suggestSoql('SELECT', describe, sessionContext);
  const hasLimit1 = s1.some(s => s.id === 'limit-suggestion' || s.id === 'limit-suggestion' || s.id === 'limit-suggestion');
  assert.ok(hasLimit1, 'First call should include limit-suggestion');

  // Immediately call again with the same sessionContext; cooldown (60000ms) should suppress re-emission
  const s2 = await suggestSoql('SELECT', describe, sessionContext);
  const hasLimit2 = s2.some(s => s.id === 'limit-suggestion');
  assert.ok(!hasLimit2, 'Second call within cooldown should NOT include limit-suggestion');

  console.log('testCooldown: PASS');
}

async function testMutexGroupSuppression() {
  const describe = { fields: [{ name: 'Id', type: 'id' }] };
  // craft a query that triggers both missing-comma and trailing-comma suggestions
  const q = 'SELECT Id Name,';
  const s = await suggestSoql(q, describe, 'SELECTING_FIELDS');
  const ids = s.map(x => x.id);
  // missing-comma should be present
  assert.ok(ids.includes('select-missing-comma'), 'Expected select-missing-comma to be suggested');
  // trailing-comma should be suppressed because it's lower priority in same mutexGroup
  assert.ok(!ids.includes('select-trailing-comma'), 'Expected select-trailing-comma to be suppressed by mutexGroup priority');
  console.log('testMutexGroupSuppression: PASS');
}

async function run() {
  await testCooldown();
  await testMutexGroupSuppression();
  console.log('All policy behavior tests passed');
}

run().catch(err => { console.error(err); process.exit(2); });

