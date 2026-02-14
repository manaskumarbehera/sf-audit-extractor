// Test query composition
function composeSelection(fields) {
  const arr = Array.isArray(fields) && fields.length ? fields : ['Id'];
  return arr
    .map((f) => f.trim())
    .filter(Boolean)
    .map((name) => {
      if (!name || name.toLowerCase() === 'id') return 'Id';
      return `${name} { value }`;
    })
    .join(' ');
}

function composeRelatedObjectSelection(relatedObj) {
  if (!relatedObj || !relatedObj.relationship) return '';
  const fields = Array.isArray(relatedObj.fields) && relatedObj.fields.length
    ? relatedObj.fields
    : ['Id'];
  const selection = fields
    .map((f) => f.trim())
    .filter(Boolean)
    .map((name) => {
      if (!name || name.toLowerCase() === 'id') return 'Id';
      return `${name} { value }`;
    })
    .join(' ');
  return `${relatedObj.relationship} { edges { node { ${selection} } } }`;
}

// Simulating what might be happening
const state = {
  object: 'Account',
  fields: ['Id', 'Active__c'],
  relatedObjects: [
    { relationship: 'AccountBrands', fields: ['Id'] },
    { relationship: 'Tasks', fields: ['Id'] }
  ],
  orderBy: { field: 'BillingStreet', dir: 'asc' },
  limit: 50
};

// Get related object relationship names to exclude from regular fields
const relatedRelationships = new Set(
  (state.relatedObjects || []).map(r => r.relationship).filter(Boolean)
);

// Filter out fields that are also related objects to prevent duplicates
const filteredFields = (state.fields || []).filter(f => !relatedRelationships.has(f));
const selection = composeSelection(filteredFields.length ? filteredFields : ['Id']);

// Add related objects for composite query
const relatedSelections = (state.relatedObjects || [])
  .map(composeRelatedObjectSelection)
  .filter(Boolean)
  .join(' ');

const fullSelection = relatedSelections
  ? `${selection} ${relatedSelections}`
  : selection;

console.log('filteredFields:', filteredFields);
console.log('selection:', selection);
console.log('relatedSelections:', relatedSelections);
console.log('fullSelection:', fullSelection);
console.log('');
console.log('FINAL QUERY:');
const query = `query { uiapi { query { ${state.object}(first: 50) { edges { node { ${fullSelection} } } pageInfo { endCursor hasNextPage } } } } }`;
console.log(query);

