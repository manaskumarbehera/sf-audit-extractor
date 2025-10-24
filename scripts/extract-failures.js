#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const infile = path.join(process.cwd(), 'jest-result.json');
const outfile = path.join(process.cwd(), 'test-results', 'soql_suggestions_config-failures.json');
if (!fs.existsSync(infile)) {
  console.error('Input file not found:', infile);
  process.exit(2);
}
const raw = fs.readFileSync(infile, 'utf8');
let data;
try { data = JSON.parse(raw); } catch (e) { console.error('Failed to parse JSON:', e.message); process.exit(3); }
const results = [];
for (const tr of (data.testResults || [])) {
  for (const a of (tr.assertionResults || [])) {
    if (a.status === 'failed') {
      results.push({
        title: a.title,
        fullName: a.fullName,
        ancestorTitles: a.ancestorTitles,
        status: a.status,
        duration: a.duration,
        location: a.location || null,
        failureMessages: a.failureMessages || [],
      });
    }
  }
}
fs.mkdirSync(path.dirname(outfile), { recursive: true });
fs.writeFileSync(outfile, JSON.stringify({ generatedAt: new Date().toISOString(), count: results.length, failures: results }, null, 2));
console.log('Wrote', outfile, 'with', results.length, 'failures');

