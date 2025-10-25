// Moved from repo root: test_soql_expected_failures.js
import fs from 'fs';
import vm from 'vm';
const path = '../soql_semantic_validator.js';
let src = fs.readFileSync(path.replace('../',''), 'utf8');
src = src.replace(/export \{\s*parseQueryParts\s*,\s*validateSoql\s*\};?\s*$/m, 'module.exports = { parseQueryParts, validateSoql };');
const sandbox = { module: {}, console };
vm.createContext(sandbox);
vm.runInContext(src, sandbox, { filename: path.replace('../','') });
const { validateSoql } = sandbox.module.exports;

const accountDescribe = { name: 'Account', fields: [
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
]};

const tests = [
  "SELECT Id FROM Acc LIMIT 10",
  "SELECT Name, FIELDS(ALL) FROM Account LIMIT 10",
  "SELECT FIELDS(STANDARD), Id FROM Account LIMIT 10",
  "SELECT FIELDS(ALL), COUNT(Id) FROM Account LIMIT 10",
  "SELECT Id FROM Account ORDER BY LIMIT 10",
  "SELECT FROM Account LIMIT 10",
  "SELECT COUNT(Name), Id FROM Account LIMIT 10",
  "SELECT Id FROM Account WHERE Name LIKE Acme% LIMIT 10",
  "SELECT Id FROM Account WHERE CreatedDate = 'LAST_N_DAYS:30' LIMIT 10",
  "SELECT Id FROM Account WHERE Type INCLUDES ('Customer') = TRUE LIMIT 10",
  "SELECT Id FROM Account WHERE Id IN (SELECT Id FROM Opportunity) LIMIT 10",
  "SELECT Id, (SELECT Id FROM Contacts ORDER BY Name) FROM Account LIMIT 10",
  "SELECT Id FROM Account LIMIT -5",
  "SELECT Id FROM Account OFFSET 10",
  "SELECT Id FROM Account GROUP BY Name LIMIT 10",
  "SELECT Id FROM Account HAVING COUNT(Id) > 1 LIMIT 10",
  "SELECT Id FROM Account WHERE Name = null LIMIT 10",
  "SELECT Id FROM Account WHERE Name = NULL LIMIT 10",
  "SELECT Id FROM Account WHERE IsDeleted = 'false' LIMIT 10"
];

let passed = 0;
for (const q of tests) {
  const res = validateSoql(q, accountDescribe);
  const ok = res.ok;
  const expectOk = false; // all of these should be invalid per your list
  const status = (!ok && !expectOk) || (ok && expectOk) ? 'PASS' : 'FAIL';
  console.log(`${status} | ${q}`);
  if (status === 'FAIL') {
    console.log('  validator ok:', ok);
    console.log('  messages:', res.messages.join(' || '));
  } else {
    passed++;
  }
}
console.log('\nSummary: ' + passed + '/' + tests.length + ' expected failures matched');
