#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const rulesDir = path.join(process.cwd(), 'rules');
const candidates = [];
try {
  const files = fs.readdirSync(rulesDir);
  for (const f of files) {
    if (f.toLowerCase().endsWith('.json')) candidates.push(path.join(rulesDir, f));
  }
} catch (e) {
  // ignore
}
console.log('rulesDir:', rulesDir);
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
