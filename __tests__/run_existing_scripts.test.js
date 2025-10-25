import fs from 'fs';
import path from 'path';
import { spawnSync } from 'child_process';

const root = path.resolve(process.cwd());

// List of existing ad-hoc test scripts in the repo to run (child process)
const scripts = [
  'test_soql_validator.js',
  'test_soql_suggester.js',
  'test_soql_expected_failures.js',
  'test_regex_suggestions.js',
  'test_order_suggestions.js',
  'test_policy_behavior.js',
  'test_select_comma.js'
];

// Helper to run a script as a child Node process and return result
function runScript(file) {
  const full = path.join(root, file);
  if (!fs.existsSync(full)) {
    return { skipped: true, message: 'Not found: ' + file };
  }
  // Use dynamic import in a node -e evaluation so ES module scripts execute correctly
  const importExpr = `import(${JSON.stringify(full)})
    .then(() => { process.exit(0); })
    .catch((err) => { console.error(err && err.stack ? err.stack : err); process.exit(2); });`;
  const proc = spawnSync(process.execPath, ['-e', importExpr], { encoding: 'utf8', timeout: 30_000 });
  return {
    skipped: false,
    file,
    status: proc.status,
    signal: proc.signal,
    stdout: proc.stdout || '',
    stderr: proc.stderr || ''
  };
}

for (const script of scripts) {
  test(`run ${script} (child process)`, () => {
    const res = runScript(script);
    if (res.skipped) {
      // treat missing script as skipped, not a failure
      // By default, don't print a console warning to keep test output clean.
      // Set SHOW_SKIPPED_SCRIPTS=1 to enable warnings for debugging.
      if (process.env.SHOW_SKIPPED_SCRIPTS) {
        console.warn(res.message);
      }
      return;
    }
    // If the script exited with non-zero, include stdout/stderr to help debugging
    if (res.status !== 0) {
      const errOut = `\n--- STDOUT ---\n${res.stdout}\n--- STDERR ---\n${res.stderr}\n`;
      throw new Error(`Script ${script} exited with code ${res.status}${errOut}`);
    }
    // otherwise pass
    expect(res.status).toBe(0);
  });
}
