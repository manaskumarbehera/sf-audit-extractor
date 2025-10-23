// ESM-friendly debug runner for soql_semantic_validator

async function main() {
  const mod = await import('./soql_semantic_validator.js');
  const { parseQueryParts, validateSoql } = mod;

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

  const queriesToInspect = [
    "SELECT Id FROM Account WHERE Name LIKE Acme% LIMIT 10",
    "SELECT Id FROM Account WHERE CreatedDate = 'LAST_N_DAYS:30' LIMIT 10",
    "SELECT Id FROM Account WHERE Type INCLUDES ('Customer') = TRUE LIMIT 10",
    "SELECT Id FROM Account WHERE Id IN (SELECT Id FROM Opportunity) LIMIT 10",
    "SELECT Id FROM Account GROUP BY Name LIMIT 10",
    "SELECT Id FROM Account HAVING COUNT(Id) > 1 LIMIT 10",
    "SELECT Id FROM Account WHERE Name = null LIMIT 10",
    "SELECT Id FROM Account WHERE Name = NULL LIMIT 10",
    "SELECT Id FROM Account WHERE IsDeleted = 'false' LIMIT 10"
  ];

  for (const q of queriesToInspect){
    console.log('\n--- QUERY: ' + q);
    const parts = parseQueryParts(q);
    console.log('PARSE PARTS:', JSON.stringify(parts, null, 2));
    const res = validateSoql(q, accountDescribe);
    console.log('VALIDATE OK:', res.ok);
    console.log('MESSAGES:', res.messages);
  }
}

main().catch(e => { console.error('Error running validator debug:', e); process.exit(1); });
