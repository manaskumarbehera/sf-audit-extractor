// Quick test harness for soql_semantic_validator.js
const fs = require('fs');
const vm = require('vm');
const path = './soql_semantic_validator.js';
let src = fs.readFileSync(path,'utf8');
src = src.replace(/export \{\s*parseQueryParts\s*,\s*validateSoql\s*\};?\s*$/m, 'module.exports = { parseQueryParts, validateSoql };');
const sandbox = { module: {}, console };
vm.createContext(sandbox);
vm.runInContext(src, sandbox, { filename: path });
const { validateSoql } = sandbox.module.exports;

// Each test has the query and expectedOk (true = validator should accept, false = validator should reject)
const tests = [
  { q: "SELECT Id FROM Account LIMIT 10", expectedOk: true },
  { q: "SELECT Id, Name FROM Account LIMIT 50", expectedOk: true },
  { q: "SELECT FIELDS(ALL) FROM Account LIMIT 100", expectedOk: true },
  { q: "SELECT FIELDS(STANDARD) FROM Account LIMIT 20", expectedOk: true },
  { q: "SELECT FIELDS(CUSTOM) FROM Account LIMIT 20", expectedOk: true },
  { q: "SELECT Id FROM Account WHERE Name LIKE 'Acme%' LIMIT 25", expectedOk: true },
  { q: "SELECT Id, Industry FROM Account WHERE Industry IN ('Banking','Retail') LIMIT 30", expectedOk: true },
  { q: "SELECT Id FROM Account WHERE CreatedDate = LAST_N_DAYS:30 LIMIT 40", expectedOk: true },
  { q: "SELECT Id FROM Account ORDER BY Name ASC NULLS LAST LIMIT 100", expectedOk: true },
  { q: "SELECT Id FROM Account WHERE IsDeleted = FALSE ORDER BY LastModifiedDate DESC LIMIT 10", expectedOk: true },
  { q: "SELECT COUNT() FROM Account LIMIT 2000", expectedOk: true },
  { q: "SELECT COUNT(Id) FROM Account WHERE Industry != null LIMIT 2000", expectedOk: true },
  { q: "SELECT Id, (SELECT Id, LastName FROM Contacts LIMIT 5) FROM Account LIMIT 20", expectedOk: true },
  { q: "SELECT Id, Owner.Name FROM Account WHERE Owner.UserType = 'Standard' LIMIT 15", expectedOk: true },
  { q: "SELECT Id FROM Account WHERE ShippingState IN ('CA','NY') ORDER BY Name LIMIT 100 OFFSET 100", expectedOk: true },
  { q: "SELECT Id, Name FROM Account WHERE BillingCountry = 'Denmark' AND NumberOfEmployees > 50 LIMIT 25", expectedOk: true },
  { q: "SELECT Id FROM Account WHERE Type INCLUDES ('Customer','Partner') LIMIT 50", expectedOk: true },
  { q: "SELECT Id FROM Account WHERE Name != null AND Active__c = TRUE LIMIT 10", expectedOk: true },
  { q: "SELECT Id FROM Account WHERE RecordType.DeveloperName = 'Business' LIMIT 25", expectedOk: true },
  { q: "SELECT Id FROM Account WHERE Id IN (SELECT AccountId FROM Opportunity WHERE Amount > 10000) LIMIT 50", expectedOk: true },
  // Invalid queries (should be rejected)
  { q: "SELECT Id FROM Acc LIMIT 10", expectedOk: false },
  { q: "SELECT Name, FIELDS(ALL) FROM Account LIMIT 10", expectedOk: false },
  { q: "SELECT FIELDS(STANDARD), Id FROM Account LIMIT 10", expectedOk: false },
  { q: "SELECT FIELDS(ALL), COUNT(Id) FROM Account LIMIT 10", expectedOk: false },
  { q: "SELECT Id FROM Account ORDER BY LIMIT 10", expectedOk: false },
  { q: "SELECT FROM Account LIMIT 10", expectedOk: false },
  { q: "SELECT COUNT(Name), Id FROM Account LIMIT 10", expectedOk: false },
  { q: "SELECT Id FROM Account WHERE Name LIKE Acme% LIMIT 10", expectedOk: false },
  { q: "SELECT Id FROM Account WHERE CreatedDate = 'LAST_N_DAYS:30' LIMIT 10", expectedOk: false },
  { q: "SELECT Id FROM Account WHERE Type INCLUDES ('Customer') = TRUE LIMIT 10", expectedOk: false },
  { q: "SELECT Id FROM Account WHERE Id IN (SELECT Id FROM Opportunity) LIMIT 10", expectedOk: false },
  { q: "SELECT Id, (SELECT Id FROM Contacts ORDER BY Name) FROM Account LIMIT 10", expectedOk: false },
  { q: "SELECT Id FROM Account LIMIT -5", expectedOk: false },
  { q: "SELECT Id FROM Account OFFSET 10", expectedOk: false },
  { q: "SELECT Id FROM Account GROUP BY Name LIMIT 10", expectedOk: false },
  { q: "SELECT Id FROM Account HAVING COUNT(Id) > 1 LIMIT 10", expectedOk: false },
  { q: "SELECT Id FROM Account WHERE Name = null LIMIT 10", expectedOk: false },
  { q: "SELECT Id FROM Account WHERE Name = NULL LIMIT 10", expectedOk: false },
  { q: "SELECT Id FROM Account WHERE IsDeleted = 'false' LIMIT 10", expectedOk: false }
];

let passed = 0;
for (const t of tests) {
  const res = validateSoql(t.q, { name: 'Account', fields: [
    { name: 'Id', type: 'reference' },
    { name: 'Name', type: 'string' },
    { name: 'Industry', type: 'string' },
    { name: 'CreatedDate', type: 'date' },
    { name: 'IsDeleted', type: 'boolean' },
    { name: 'LastModifiedDate', type: 'date' },
    { name: 'ShippingState', type: 'string' },
    { name: 'BillingCountry', type: 'string' },
    { name: 'NumberOfEmployees', type: 'number' },
    { name: 'Type', type: 'string' },
    { name: 'Active__c', type: 'boolean' },
    { name: 'RecordType.DeveloperName', type: 'string' },
    { name: 'Owner.UserType', type: 'string' }
  ] });
  const ok = res.ok;
  const expectedOk = t.expectedOk;
  const q = t.q;
  const status = (ok === expectedOk) ? 'PASS' : 'FAIL';
  console.log(status + '  ' + q);
  if (status === 'FAIL') {
    console.log('  expected ok=', expectedOk, ' but validator ok=', ok);
    console.log('  messages:', res.messages.join(' || '));
  } else {
    passed++;
  }
}
console.log('\nSummary: ' + passed + '/' + tests.length + ' tests matched expected outcomes');
