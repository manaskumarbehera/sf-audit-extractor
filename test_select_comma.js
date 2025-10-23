import { getSelectSegment } from './soql_helper_utils.js';

function check(q) {
  const pos = q.length;
  const selectSeg = getSelectSegment(q);
  const selectEndsWithComma = /,\s*$/.test(selectSeg);
  const prevChar = (typeof pos === 'number' && pos > 0) ? (q[pos-1] || '') : '';
  const justTypedComma = prevChar === ',' || (selectSeg.trim() === ',' );
  console.log('INPUT:', JSON.stringify(q));
  console.log('  selectSeg:', JSON.stringify(selectSeg));
  console.log('  selectEndsWithComma:', selectEndsWithComma);
  console.log('  prevChar:', JSON.stringify(prevChar));
  console.log('  justTypedComma:', justTypedComma);
  console.log('');
}

const cases = [
  'SELECT Id, FROM Opportunity',
  'SELECT Id, FROM Opportunity ',
  'SELECT Id, FROM',
  'SELECT Id,',
  'SELECT Id, ',
  'SELECT Id, Name',
  'SELECT ,Id',
  'SELECT ,' ,
  'SELECT' ,
  'SELECT '
];

for (const c of cases) check(c);

