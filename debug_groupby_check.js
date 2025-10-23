const fs = require('fs');
const vm = require('vm');
const path = './soql_semantic_validator.js';
let src = fs.readFileSync(path,'utf8');
src = src.replace(/export \{\s*parseQueryParts\s*,\s*validateSoql\s*\};?\s*$/m, 'module.exports = { parseQueryParts, validateSoql };');
const sandbox = { module: {}, console };
vm.createContext(sandbox);
vm.runInContext(src, sandbox, { filename: path });
const { parseQueryParts, validateSoql } = sandbox.module.exports;

const q = "SELECT Id FROM Account GROUP BY Name LIMIT 10";
const parts = parseQueryParts(q);
console.log('PARSE PARTS:', parts);

const gbSet = new Set(parts.groupByFields.map(s=>s.toLowerCase()));
for (const sf of parts.selectFields) {
  const s = String(sf||'').trim();
  console.log('select field:', s);
  if (s === '') continue;
  if (/^\s*\(/.test(s)) continue;
  function isAggregateExpr(expr){return /(COUNT|SUM|AVG|MIN|MAX)\s*\(/i.test(expr);}
  if (isAggregateExpr(s)) continue;
  if (/^FIELDS\s*\(/i.test(s)) continue;
  const m = s.match(/^([A-Za-z_][A-Za-z0-9_.]*)/);
  const fld = m ? m[1].toLowerCase() : null;
  console.log('fld:', fld, 'gbSet has fld?', gbSet.has(fld));
}

const res = validateSoql(q);
console.log('validator messages:', res.messages);

