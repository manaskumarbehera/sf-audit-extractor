#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const specPath = path.join(process.cwd(), 'soql_suggestions_config.spec.js');
const specDir = path.dirname(specPath);
const candidates = [
  path.join(specDir, 'soql_suggestions_config.json'),
  path.join(specDir, '..', 'soql_suggestions_config.json'),
  path.join(process.cwd(), 'soql_suggestions_config.json'),
];
console.log('specPath:', specPath);
console.log('specDir:', specDir);
for (const p of candidates) {
  try {
    const exists = fs.existsSync(p);
    console.log(p, exists);
    if (exists) {
      const stat = fs.statSync(p);
      console.log('  size:', stat.size, 'mode:', (stat.mode).toString(8));
      console.log('  firstLine:', fs.readFileSync(p, 'utf8').split('\n')[0]);
    }
  } catch (e) {
    console.error('error for', p, e.message);
  }
}

