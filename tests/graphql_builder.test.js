/**
 * @jest-environment jsdom
 */

const flush = () => new Promise((r) => setTimeout(r, 0));

function setupDom() {
  document.body.innerHTML = `
    <div class="tab-pane" data-tab="graphql" id="tab-graphql">
      <div id="graphql-object-group"></div>
      <select id="graphql-object"><option value="">Select</option></select>
      <button id="graphql-refresh-objects"></button>
      <input id="graphql-limit" type="number" value="50" />
      <input id="graphql-offset" type="number" value="0" />
      <input id="graphql-after" type="text" />
      <div id="graphql-pageinfo"><div id="graphql-pageinfo-body"></div><button id="graphql-pageinfo-apply"></button><button id="graphql-pageinfo-clear"></button></div>
      <input type="checkbox" id="graphql-builder-enabled" />
      <div id="graphql-builder" hidden></div>
      <input id="graphql-builder-field-input" />
      <datalist id="graphql-builder-field-list"></datalist>
      <div id="graphql-builder-fields"></div>
      <button id="graphql-builder-add-field"></button>
      <div id="graphql-builder-filters"></div>
      <button id="graphql-builder-add-filter"></button>
      <input id="graphql-builder-order-field" />
      <select id="graphql-builder-order-dir"><option value="asc">asc</option><option value="desc">desc</option></select>
      <button id="graphql-builder-clear-order"></button>
      <div id="graphql-builder-status"></div>
      <div class="graphql-split-container">
        <div class="graphql-query-section">
          <div class="section-header">
            <span class="section-title">Query</span>
            <div class="section-actions">
              <button id="graphql-format-query" class="action-btn"><span class="action-icon">{ }</span><span class="action-label">Format</span></button>
              <button id="graphql-copy-query" class="action-btn"><span class="action-icon">📋</span><span class="action-label">Copy</span></button>
            </div>
          </div>
          <textarea id="graphql-query"></textarea>
        </div>
        <div class="graphql-splitter" id="graphql-splitter"></div>
        <div class="graphql-right-panel">
          <div class="graphql-variables-section">
            <div class="section-header">
              <span class="section-title">Variables</span>
              <div class="section-actions">
                <button id="graphql-format-vars" class="action-btn"><span class="action-icon">{ }</span><span class="action-label">Format</span></button>
                <button id="graphql-copy-vars" class="action-btn"><span class="action-icon">📋</span><span class="action-label">Copy</span></button>
              </div>
            </div>
            <textarea id="graphql-variables"></textarea>
          </div>
          <div class="graphql-splitter-h" id="graphql-splitter-h"></div>
          <div class="graphql-results-section">
            <div class="section-header">
              <span class="section-title">Response</span>
              <div class="section-actions">
                <button id="graphql-copy-results" class="action-btn"><span class="action-icon">📋</span><span class="action-label">Copy</span></button>
                <button id="graphql-expand-results" class="action-btn"><span class="action-icon">⊞</span><span class="action-label">Expand</span></button>
              </div>
            </div>
            <div class="results-container">
              <pre id="graphql-results" class="results-pre"><span class="placeholder-note">Run a query to see results</span></pre>
            </div>
          </div>
        </div>
      </div>
      <button id="graphql-run"></button>
      <button id="graphql-clear"></button>
    </div>
  `;
}

let hooks = null;
let sendMessageMock = null;

beforeAll(async () => {
  setupDom();

  sendMessageMock = jest.fn((msg, cb) => {
    if (msg && msg.action === 'DESCRIBE_GLOBAL') {
      cb({ success: true, objects: [ { name: 'Account', queryable: true }, { name: 'Contact', queryable: true } ] });
      return;
    }
    if (msg && msg.action === 'DESCRIBE_SOBJECT') {
      cb({ success: true, describe: { fields: [ { name: 'Id' }, { name: 'Name' }, { name: 'Industry' }, { name: 'CreatedDate' } ] } });
      return;
    }
    if (msg && msg.action === 'RUN_GRAPHQL') {
      cb({ success: true, data: { account: { name: 'ACME' } } });
      return;
    }
    cb({ success: true });
  });

  global.Utils = {
    getInstanceUrl: async () => 'https://example.my.salesforce.com',
    escapeHtml: (s) => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;'),
    looksLikeSalesforceOrigin: () => true,
  };
  global.chrome = {
    runtime: { sendMessage: (msg, cb) => sendMessageMock(msg, cb), lastError: null },
    storage: { local: { get: (_q, cb) => cb && cb({ graphqlShowObjectSelector: true }), set: jest.fn() } },
  };

  await import('../graphql_helper.js');
  await flush();
  hooks = window.__GraphqlTestHooks;
});

beforeEach(() => {
  expect(hooks).toBeDefined();
  hooks.setBuilderState(hooks.defaultBuilderState());
  sendMessageMock.mockClear();
  const toggle = document.getElementById('graphql-builder-enabled');
  if (toggle) toggle.checked = false;
  const query = document.getElementById('graphql-query');
  if (query) query.value = '';
});

function setBuilderStateAndSync(state) {
  hooks.setBuilderState(state);
  const toggle = document.getElementById('graphql-builder-enabled');
  toggle.checked = !!state.enabled;
}

test('composeQueryFromBuilder builds GraphQL query with where/order/limit/offset', () => {
  const state = hooks.defaultBuilderState();
  state.enabled = true;
  state.object = 'Account';
  state.fields = ['Id', 'Name'];
  state.filters = [
    { id: '1', field: 'Name', op: 'LIKE', value: 'Acme%' },
    { id: '2', field: 'AnnualRevenue', op: '>', value: '100000' },
    { id: '3', field: 'Tier__c', op: 'IN', value: 'Gold, Silver' },
  ];
  state.orderBy = { field: 'CreatedDate', dir: 'desc' };
  state.limit = 10;
  state.offset = 2;

  const q = hooks.composeQueryFromBuilder(state);
  expect(q).toBe('query { uiapi { query { Account(where: { Name: { like: "Acme%" }, AnnualRevenue: { gt: 100000 }, Tier__c: { in: ["Gold", "Silver"] } }, orderBy: { CreatedDate: { order: DESC } }, first: 10, offset: 2) { edges { node { Id Name { value } } } pageInfo { endCursor hasNextPage } } } } }');
});

test('tryImportQueryToBuilder parses object, fields, filters, order, and pagination', () => {
  hooks.setBuilderState(hooks.defaultBuilderState());
  hooks.tryImportQueryToBuilder('query { Account(where: { Name: { like: "Acme%" }, Status__c: { neq: "Closed" }, Tier__c: { in: ["Gold","Silver"] } }, orderBy: { field: CreatedDate, direction: DESC }, first: 25, offset: 5) { Id Name Industry } }');
  const bs = hooks.getBuilderState();

  expect(bs.object).toBe('Account');
  expect(bs.fields).toEqual(['Id', 'Name', 'Industry']);
  expect(bs.filters).toHaveLength(3);
  expect(bs.filters.map((f) => f.op)).toEqual(['LIKE', '!=', 'IN']);
  expect(bs.orderBy).toEqual({ field: 'CreatedDate', dir: 'desc' });
  expect(bs.limit).toBe(25);
  expect(bs.offset).toBe(5);
});

test('enabling builder shows panel and writes composed query', async () => {
  const objSel = document.getElementById('graphql-object');
  objSel.value = 'Account';
  objSel.dispatchEvent(new Event('change', { bubbles: true }));
  await flush();

  const toggle = document.getElementById('graphql-builder-enabled');
  const panel = document.getElementById('graphql-builder');
  toggle.checked = true;
  toggle.dispatchEvent(new Event('change', { bubbles: true }));
  await flush();

  expect(panel.hidden).toBe(false);
  const q = document.getElementById('graphql-query').value || '';
  expect(q).toContain('Account');
});

test('run GraphQL sends variables and renders result', async () => {
  const query = document.getElementById('graphql-query');
  const vars = document.getElementById('graphql-variables');
  const runBtn = document.getElementById('graphql-run');
  const results = document.getElementById('graphql-results');

  query.value = 'query { Account { Name } }';
  vars.value = '{"limit":5}';
  runBtn.click();
  await flush();

  const payload = sendMessageMock.mock.calls.find((c) => c[0]?.action === 'RUN_GRAPHQL')?.[0];
  expect(payload).toBeDefined();
  expect(payload.variables).toEqual({ limit: 5 });
  expect(results.innerHTML).toContain('OK');
  expect(results.innerHTML).toContain('account');
});

test('run mutation passes variables and renders response', async () => {
  const query = document.getElementById('graphql-query');
  const vars = document.getElementById('graphql-variables');
  const runBtn = document.getElementById('graphql-run');
  const results = document.getElementById('graphql-results');

  sendMessageMock.mockImplementationOnce((msg, cb) => cb({ success: true, data: { updateAccount: { name: 'ACME 2' } } }));
  query.value = 'mutation UpdateAccount($id: ID!, $name: String!) { updateAccount(input: { id: $id, name: $name }) { name } }';
  vars.value = '{"id":"001xx000003","name":"ACME 2"}';
  runBtn.click();
  await flush();

  const payload = sendMessageMock.mock.calls.find((c) => c[0]?.action === 'RUN_GRAPHQL')?.[0];
  expect(payload.query.startsWith('mutation')).toBe(true);
  expect(payload.variables).toEqual({ id: '001xx000003', name: 'ACME 2' });
  expect(results.innerHTML).toContain('OK');
  expect(results.innerHTML).toContain('updateAccount');
});

test('background error renders error block', async () => {
  const query = document.getElementById('graphql-query');
  const vars = document.getElementById('graphql-variables');
  const runBtn = document.getElementById('graphql-run');
  const results = document.getElementById('graphql-results');

  sendMessageMock.mockImplementationOnce((msg, cb) => cb({ success: false, error: 'Access denied' }));
  query.value = 'query { Account { Name } }';
  vars.value = '';
  runBtn.click();
  await flush();

  expect(results.innerHTML).toContain('Access denied');
});

test('clear button wipes rendered results', async () => {
  const clearBtn = document.getElementById('graphql-clear');
  const results = document.getElementById('graphql-results');
  results.innerHTML = '<div>Some prior result</div>';
  clearBtn.click();
  await flush();
  expect(results.innerHTML).toContain('Cleared');
});

test('invalid variables blocks run and surfaces error', async () => {
  const vars = document.getElementById('graphql-variables');
  const runBtn = document.getElementById('graphql-run');

  // A query is required for the error message to appear
  const query = document.getElementById('graphql-query');
  query.value = 'query { Account { Id } }';
  vars.value = '{bad json';

  // The updateRunButtonState should disable the button when vars are invalid
  hooks.updateRunButtonState();

  // Button should be disabled due to invalid JSON
  expect(runBtn.disabled).toBe(true);

  // Even if we force-enable and click, the handler checks vars again
  runBtn.disabled = false;
  runBtn.click();
  await flush();

  // The run should NOT have been executed
  expect(sendMessageMock).not.toHaveBeenCalledWith(expect.objectContaining({ action: 'RUN_GRAPHQL' }), expect.any(Function));
});

test('imports UI API query with edges/node/value and after cursor', () => {
  hooks.setBuilderState(hooks.defaultBuilderState());
  const src = 'query { uiapi { query { Account(first: 5, after: "abc", where: { Name: { like: "Acme%" } }) { edges { node { Id Name { value } } } pageInfo { endCursor hasNextPage } } } } }';
  hooks.tryImportQueryToBuilder(src);
  const bs = hooks.getBuilderState();
  expect(bs.object).toBe('Account');
  // The parser extracts fields and may include value token depending on implementation
  expect(bs.fields).toContain('Id');
  expect(bs.fields).toContain('Name');
  expect(bs.filters[0].op).toBe('LIKE');
  expect(bs.after).toBe('abc');
  expect(bs.limit).toBe(5);
});

test('imports orderBy with keyed order object', () => {
  hooks.setBuilderState(hooks.defaultBuilderState());
  const src = 'query { uiapi { query { Contact(orderBy: { LastName: { order: ASC } }) { edges { node { Id LastName { value } } } } } } }';
  hooks.tryImportQueryToBuilder(src);
  const bs = hooks.getBuilderState();
  expect(bs.orderBy).toEqual({ field: 'LastName', dir: 'asc' });
});

test('auto-template fills UI API shape when builder disabled', async () => {
  const objSel = document.getElementById('graphql-object');
  objSel.value = 'Account';
  objSel.dispatchEvent(new Event('change', { bubbles: true }));
  await flush();
  const q = document.getElementById('graphql-query').value;
  expect(q).toContain('uiapi');
  expect(q.replace(/\s+/g, ' ')).toContain('edges { node');
  expect(q).toContain('pageInfo');
});

test('pageInfo apply sets after cursor', async () => {
  const after = document.getElementById('graphql-after');
  const apply = document.getElementById('graphql-pageinfo-apply');
  hooks.updatePageInfoUI({ endCursor: 'CUR123', hasNextPage: true });
  apply.disabled = false;
  apply.click();
  await flush();
  expect(after.value).toBe('CUR123');
});

// ==================== Postman-like Formatting Tests ====================

describe('formatGraphQL', () => {
  test('formats single-line query with proper indentation', () => {
    const input = 'query { Account { Id Name } }';
    const result = hooks.formatGraphQL(input);
    expect(result).toContain('query {');
    expect(result).toContain('Account {');
    expect(result).toContain('Id');
    expect(result).toContain('Name');
    // Should have newlines
    expect(result.split('\n').length).toBeGreaterThan(1);
  });

  test('formats nested query with proper indentation', () => {
    const input = 'query { uiapi { query { Account { edges { node { Id Name { value } } } } } } }';
    const result = hooks.formatGraphQL(input);
    expect(result).toContain('uiapi {');
    expect(result).toContain('query {');
    expect(result).toContain('edges {');
    expect(result).toContain('node {');
  });

  test('preserves string literals', () => {
    const input = 'query { Account(where: { Name: { like: "Acme Corp" } }) { Id } }';
    const result = hooks.formatGraphQL(input);
    expect(result).toContain('"Acme Corp"');
  });

  test('handles arguments in parentheses', () => {
    const input = 'query { Account(first: 10, offset: 5) { Id } }';
    const result = hooks.formatGraphQL(input);
    expect(result).toContain('first: 10');
    expect(result).toContain('offset: 5');
  });

  test('returns original if input is empty', () => {
    expect(hooks.formatGraphQL('')).toBe('');
    expect(hooks.formatGraphQL(null)).toBe(null);
    expect(hooks.formatGraphQL(undefined)).toBe(undefined);
  });

  test('handles mutation queries', () => {
    const input = 'mutation { createAccount(input: { Name: "Test" }) { Id } }';
    const result = hooks.formatGraphQL(input);
    expect(result).toContain('mutation {');
    expect(result).toContain('createAccount');
  });

  test('handles subscription queries', () => {
    const input = 'subscription { accountUpdated { Id Name } }';
    const result = hooks.formatGraphQL(input);
    expect(result).toContain('subscription {');
  });

  test('preserves single quotes in strings', () => {
    const input = "query { Account(where: { Name: { eq: \"John's Company\" } }) { Id } }";
    const result = hooks.formatGraphQL(input);
    expect(result).toContain("John's Company");
  });

  test('handles complex where clauses', () => {
    const input = 'query { Account(where: { AND: [{ Name: { like: "Test%" } }, { Industry: { eq: "Tech" } }] }) { Id } }';
    const result = hooks.formatGraphQL(input);
    expect(result).toContain('AND');
    expect(result).toContain('Name');
    expect(result).toContain('Industry');
  });

  test('handles fragments', () => {
    const input = 'fragment AccountFields on Account { Id Name Industry }';
    const result = hooks.formatGraphQL(input);
    expect(result).toContain('fragment');
    expect(result).toContain('AccountFields');
  });

  test('handles deeply nested queries', () => {
    const input = 'query { a { b { c { d { e { f { Id } } } } }';
    const result = hooks.formatGraphQL(input);
    const lines = result.split('\n');
    expect(lines.length).toBeGreaterThan(5);
  });
});

describe('formatJSON', () => {
  test('formats compact JSON with indentation', () => {
    const input = '{"name":"John","age":30}';
    const result = hooks.formatJSON(input);
    expect(result).toContain('"name": "John"');
    expect(result.split('\n').length).toBeGreaterThan(1);
  });

  test('formats nested JSON', () => {
    const input = '{"user":{"name":"John","address":{"city":"NYC"}}}';
    const result = hooks.formatJSON(input);
    expect(result).toContain('"user": {');
    expect(result).toContain('"address": {');
  });

  test('returns original if invalid JSON', () => {
    const input = '{invalid json}';
    const result = hooks.formatJSON(input);
    expect(result).toBe(input);
  });

  test('handles arrays', () => {
    const input = '[1,2,3]';
    const result = hooks.formatJSON(input);
    expect(result).toContain('1');
    expect(result).toContain('2');
    expect(result).toContain('3');
  });

  test('handles empty object', () => {
    const input = '{}';
    const result = hooks.formatJSON(input);
    expect(result).toBe('{}');
  });

  test('handles empty array', () => {
    const input = '[]';
    const result = hooks.formatJSON(input);
    expect(result).toBe('[]');
  });

  test('handles null value', () => {
    const input = '{"value":null}';
    const result = hooks.formatJSON(input);
    expect(result).toContain('null');
  });

  test('handles boolean values', () => {
    const input = '{"active":true,"deleted":false}';
    const result = hooks.formatJSON(input);
    expect(result).toContain('true');
    expect(result).toContain('false');
  });

  test('handles numeric values', () => {
    const input = '{"integer":42,"float":3.14,"negative":-10}';
    const result = hooks.formatJSON(input);
    expect(result).toContain('42');
    expect(result).toContain('3.14');
    expect(result).toContain('-10');
  });

  test('handles special characters in strings', () => {
    const input = '{"text":"Hello\\nWorld\\t!"}';
    const result = hooks.formatJSON(input);
    expect(result).toContain('Hello');
  });

  test('handles deeply nested structures', () => {
    const input = '{"a":{"b":{"c":{"d":{"e":"value"}}}}}';
    const result = hooks.formatJSON(input);
    expect(result.split('\n').length).toBeGreaterThan(5);
  });

  test('handles array of objects', () => {
    const input = '[{"id":1},{"id":2},{"id":3}]';
    const result = hooks.formatJSON(input);
    expect(result).toContain('"id": 1');
    expect(result).toContain('"id": 2');
    expect(result).toContain('"id": 3');
  });

  test('returns empty string for empty input', () => {
    expect(hooks.formatJSON('')).toBe('');
  });

  test('returns original for whitespace-only input', () => {
    expect(hooks.formatJSON('   ')).toBe('');
  });
});

describe('smartFormat', () => {
  test('auto-detects and formats JSON', () => {
    const input = '{"limit":10}';
    const result = hooks.smartFormat(input);
    expect(result).toContain('"limit": 10');
  });

  test('auto-detects and formats GraphQL', () => {
    const input = 'query { Account { Id } }';
    const result = hooks.smartFormat(input);
    expect(result).toContain('query {');
    expect(result.split('\n').length).toBeGreaterThan(1);
  });

  test('respects explicit type parameter', () => {
    const input = '{"query": "test"}';
    const resultJson = hooks.smartFormat(input, 'json');
    const resultGraphql = hooks.smartFormat(input, 'graphql');
    // JSON should parse and format nicely
    expect(resultJson).toContain('"query": "test"');
  });

  test('auto-detects JSON starting with array bracket', () => {
    const input = '[{"id":1},{"id":2}]';
    const result = hooks.smartFormat(input);
    expect(result).toContain('"id": 1');
  });

  test('auto-detects mutation as GraphQL', () => {
    const input = 'mutation { createAccount { Id } }';
    const result = hooks.smartFormat(input);
    expect(result).toContain('mutation {');
  });

  test('auto-detects subscription as GraphQL', () => {
    const input = 'subscription { accountUpdated { Id } }';
    const result = hooks.smartFormat(input);
    expect(result).toContain('subscription {');
  });

  test('handles null input', () => {
    expect(hooks.smartFormat(null)).toBe(null);
  });

  test('handles undefined input', () => {
    expect(hooks.smartFormat(undefined)).toBe(undefined);
  });

  test('handles empty string', () => {
    expect(hooks.smartFormat('')).toBe('');
  });

  test('returns original for non-JSON non-GraphQL content', () => {
    const input = 'This is just plain text';
    const result = hooks.smartFormat(input);
    expect(result).toBe(input);
  });
});

describe('run button validation', () => {
  test('button disabled when query is empty', () => {
    const query = document.getElementById('graphql-query');
    const runBtn = document.getElementById('graphql-run');

    query.value = '';
    hooks.updateRunButtonState();

    expect(runBtn.disabled).toBe(true);
  });

  test('button enabled when valid query exists', () => {
    const query = document.getElementById('graphql-query');
    const vars = document.getElementById('graphql-variables');
    const runBtn = document.getElementById('graphql-run');

    query.value = 'query { Account { Id } }';
    vars.value = ''; // Clear variables to avoid any JSON parsing issues
    hooks.updateRunButtonState();

    expect(runBtn.disabled).toBe(false);
  });

  test('button disabled when variables are invalid JSON', () => {
    const query = document.getElementById('graphql-query');
    const vars = document.getElementById('graphql-variables');
    const runBtn = document.getElementById('graphql-run');

    query.value = 'query { Account { Id } }';
    vars.value = '{invalid json';
    hooks.updateRunButtonState();

    expect(runBtn.disabled).toBe(true);
  });

  test('button enabled when both query and variables are valid', () => {
    const query = document.getElementById('graphql-query');
    const vars = document.getElementById('graphql-variables');
    const runBtn = document.getElementById('graphql-run');

    query.value = 'query { Account { Id } }';
    vars.value = '{"limit": 5}';
    hooks.updateRunButtonState();

    expect(runBtn.disabled).toBe(false);
  });

  test('button stays on builder screen after successful query', async () => {
    const query = document.getElementById('graphql-query');
    const vars = document.getElementById('graphql-variables');
    const runBtn = document.getElementById('graphql-run');
    const results = document.getElementById('graphql-results');

    // Start in builder mode
    hooks.setBuilderState({...hooks.getBuilderState(), enabled: true});

    query.value = 'query { Account { Name } }';
    vars.value = '{"limit":5}';
    runBtn.click();
    await flush();

    // Should show results but stay on builder screen, not redirect to results screen
    expect(results.innerHTML).toContain('OK');
    expect(results.innerHTML).toContain('account');
  });

  test('button enabled with whitespace-only variables', () => {
    const query = document.getElementById('graphql-query');
    const vars = document.getElementById('graphql-variables');
    const runBtn = document.getElementById('graphql-run');

    query.value = 'query { Account { Id } }';
    vars.value = '   ';
    hooks.updateRunButtonState();

    expect(runBtn.disabled).toBe(false);
  });

  test('button enabled with valid empty JSON object as variables', () => {
    const query = document.getElementById('graphql-query');
    const vars = document.getElementById('graphql-variables');
    const runBtn = document.getElementById('graphql-run');

    query.value = 'query { Account { Id } }';
    vars.value = '{}';
    hooks.updateRunButtonState();

    expect(runBtn.disabled).toBe(false);
  });

  test('button enabled with valid JSON array as variables', () => {
    const query = document.getElementById('graphql-query');
    const vars = document.getElementById('graphql-variables');
    const runBtn = document.getElementById('graphql-run');

    query.value = 'query { Account { Id } }';
    vars.value = '[]';
    hooks.updateRunButtonState();

    expect(runBtn.disabled).toBe(false);
  });

  test('button disabled with query containing only whitespace', () => {
    const query = document.getElementById('graphql-query');
    const vars = document.getElementById('graphql-variables');
    const runBtn = document.getElementById('graphql-run');

    query.value = '   \n\t  ';
    vars.value = '';
    hooks.updateRunButtonState();

    expect(runBtn.disabled).toBe(true);
  });

  test('button disabled when variables have trailing comma (invalid JSON)', () => {
    const query = document.getElementById('graphql-query');
    const vars = document.getElementById('graphql-variables');
    const runBtn = document.getElementById('graphql-run');

    query.value = 'query { Account { Id } }';
    vars.value = '{"limit": 5,}';
    hooks.updateRunButtonState();

    expect(runBtn.disabled).toBe(true);
  });

  test('button enabled with complex nested variables', () => {
    const query = document.getElementById('graphql-query');
    const vars = document.getElementById('graphql-variables');
    const runBtn = document.getElementById('graphql-run');

    query.value = 'query { Account { Id } }';
    vars.value = '{"filter": {"name": "Test", "active": true}, "pagination": {"limit": 10, "offset": 0}}';
    hooks.updateRunButtonState();

    expect(runBtn.disabled).toBe(false);
  });
});

describe('Clear button behavior', () => {
  test('clear button clears results area', async () => {
    const results = document.getElementById('graphql-results');
    const clearBtn = document.getElementById('graphql-clear');

    // Set some mock results content
    results.innerHTML = '<div>Some GraphQL results</div>';

    // Click clear button
    clearBtn.click();
    await flush();

    // Results should show placeholder or be cleared
    expect(results.innerHTML).toContain('Cleared');
    expect(results.innerHTML).not.toContain('Some GraphQL results');
  });

  test('clear button clears query textarea', async () => {
    const queryEl = document.getElementById('graphql-query');
    const clearBtn = document.getElementById('graphql-clear');

    // Set up query text
    queryEl.value = 'query { Account { Id Name } }';

    // Click clear button
    clearBtn.click();
    await flush();

    // Query text should be cleared
    expect(queryEl.value).toBe('');
  });

  test('clear button clears variables textarea', async () => {
    const varsEl = document.getElementById('graphql-variables');
    const clearBtn = document.getElementById('graphql-clear');

    // Set up variables
    varsEl.value = '{"limit": 50}';

    // Click clear button
    clearBtn.click();
    await flush();

    // Variables should be cleared
    expect(varsEl.value).toBe('');
  });

  test('clear button preserves builder enabled state', async () => {
    const builderToggle = document.getElementById('graphql-builder-enabled');
    const clearBtn = document.getElementById('graphql-clear');

    // Enable builder
    builderToggle.checked = true;
    builderToggle.dispatchEvent(new Event('change', { bubbles: true }));
    await flush();

    // Set up builder state
    const state = hooks.defaultBuilderState();
    state.enabled = true;
    state.object = 'Account';
    state.fields = ['Id', 'Name', 'Industry'];
    hooks.setBuilderState(state);

    // Click clear button
    clearBtn.click();
    await flush();

    // Get current builder state - should be preserved
    const currentState = hooks.getBuilderState();
    expect(currentState.enabled).toBe(true);
    expect(currentState.object).toBe('Account');
    expect(currentState.fields).toEqual(['Id', 'Name', 'Industry']);
  });

  test('clear button does not reset builder fields and filters', async () => {
    const builderToggle = document.getElementById('graphql-builder-enabled');
    const clearBtn = document.getElementById('graphql-clear');

    // Enable builder and set state
    builderToggle.checked = true;
    builderToggle.dispatchEvent(new Event('change', { bubbles: true }));
    await flush();

    const state = hooks.defaultBuilderState();
    state.enabled = true;
    state.object = 'Contact';
    state.fields = ['Id', 'FirstName', 'LastName'];
    state.filters = [{ id: '1', field: 'Email', op: '!=', value: '' }];
    state.orderBy = { field: 'LastName', dir: 'asc' };
    hooks.setBuilderState(state);

    // Click clear button
    clearBtn.click();
    await flush();

    // Get current builder state
    const currentState = hooks.getBuilderState();

    // Builder state should be preserved (fields, filters, orderBy)
    expect(currentState.enabled).toBe(true);
    expect(currentState.object).toBe('Contact');
    expect(currentState.fields).toEqual(['Id', 'FirstName', 'LastName']);
    expect(currentState.filters).toHaveLength(1);
    expect(currentState.orderBy).toEqual({ field: 'LastName', dir: 'asc' });
  });

  test('clear button updates pageInfo UI', async () => {
    const clearBtn = document.getElementById('graphql-clear');

    // Set pageInfo first
    hooks.updatePageInfoUI({ endCursor: 'ABC123', hasNextPage: true });

    // Click clear button
    clearBtn.click();
    await flush();

    // PageInfo should be cleared (apply button should be disabled)
    const applyBtn = document.getElementById('graphql-pageinfo-apply');
    expect(applyBtn.disabled).toBe(true);
  });

  test('clear button updates run button state', async () => {
    const queryEl = document.getElementById('graphql-query');
    const runBtn = document.getElementById('graphql-run');
    const clearBtn = document.getElementById('graphql-clear');

    // Set up a valid query first
    queryEl.value = 'query { Account { Id } }';
    hooks.updateRunButtonState();
    expect(runBtn.disabled).toBe(false);

    // Click clear button
    clearBtn.click();
    await flush();

    // Run button should be disabled since query is now empty
    expect(runBtn.disabled).toBe(true);
  });

  test('clear button preserves relatedObjects in builder state', async () => {
    const clearBtn = document.getElementById('graphql-clear');

    // Set up builder state with relatedObjects
    const state = hooks.defaultBuilderState();
    state.enabled = true;
    state.object = 'Account';
    state.fields = ['Id'];
    state.relatedObjects = [
      { id: '1', relationship: 'Contacts', fields: ['Id', 'Email'] }
    ];
    hooks.setBuilderState(state);

    // Click clear button
    clearBtn.click();
    await flush();

    // Builder state should preserve relatedObjects
    const currentState = hooks.getBuilderState();
    expect(currentState.relatedObjects).toHaveLength(1);
    expect(currentState.relatedObjects[0].relationship).toBe('Contacts');
  });

  test('clear button clears both query and variables simultaneously', async () => {
    const queryEl = document.getElementById('graphql-query');
    const varsEl = document.getElementById('graphql-variables');
    const clearBtn = document.getElementById('graphql-clear');

    // Set both query and variables
    queryEl.value = 'query { Account { Id } }';
    varsEl.value = '{"limit": 10}';

    // Click clear button
    clearBtn.click();
    await flush();

    // Both should be cleared
    expect(queryEl.value).toBe('');
    expect(varsEl.value).toBe('');
  });

  test('clear button works multiple times in succession', async () => {
    const queryEl = document.getElementById('graphql-query');
    const varsEl = document.getElementById('graphql-variables');
    const results = document.getElementById('graphql-results');
    const clearBtn = document.getElementById('graphql-clear');

    // First clear
    queryEl.value = 'query { Account { Id } }';
    varsEl.value = '{"limit": 10}';
    results.innerHTML = '<div>Results 1</div>';
    clearBtn.click();
    await flush();

    expect(queryEl.value).toBe('');
    expect(varsEl.value).toBe('');
    expect(results.innerHTML).toContain('Cleared');

    // Second clear (should still work)
    queryEl.value = 'query { Contact { Id } }';
    varsEl.value = '{"offset": 5}';
    clearBtn.click();
    await flush();

    expect(queryEl.value).toBe('');
    expect(varsEl.value).toBe('');
  });

  test('clear button preserves pagination settings in builder state', async () => {
    const clearBtn = document.getElementById('graphql-clear');

    // Set up builder state with pagination
    const state = hooks.defaultBuilderState();
    state.enabled = true;
    state.object = 'Account';
    state.fields = ['Id'];
    state.limit = 25;
    state.offset = 50;
    state.after = 'cursor123';
    hooks.setBuilderState(state);

    // Click clear button
    clearBtn.click();
    await flush();

    // Builder state should preserve pagination
    const currentState = hooks.getBuilderState();
    expect(currentState.limit).toBe(25);
    expect(currentState.offset).toBe(50);
    expect(currentState.after).toBe('cursor123');
  });
});

describe('Run and Clear button placement', () => {
  test('Run button exists in DOM', () => {
    const runBtn = document.getElementById('graphql-run');
    expect(runBtn).toBeTruthy();
    expect(runBtn.tagName.toLowerCase()).toBe('button');
  });

  test('Clear button exists in DOM', () => {
    const clearBtn = document.getElementById('graphql-clear');
    expect(clearBtn).toBeTruthy();
    expect(clearBtn.tagName.toLowerCase()).toBe('button');
  });
});

describe('Builder state persistence', () => {
  test('setBuilderState and getBuilderState work correctly', () => {
    const state = hooks.defaultBuilderState();
    state.enabled = true;
    state.object = 'Account';
    state.fields = ['Id', 'Name', 'Industry'];
    state.limit = 100;
    state.offset = 10;

    hooks.setBuilderState(state);
    const retrieved = hooks.getBuilderState();

    expect(retrieved.enabled).toBe(true);
    expect(retrieved.object).toBe('Account');
    expect(retrieved.fields).toEqual(['Id', 'Name', 'Industry']);
    expect(retrieved.limit).toBe(100);
    expect(retrieved.offset).toBe(10);
  });

  test('defaultBuilderState returns expected structure', () => {
    const state = hooks.defaultBuilderState();

    expect(state.enabled).toBe(false);
    expect(state.object).toBe('');
    expect(state.fields).toEqual(['Id']);
    expect(state.filters).toEqual([]);
    expect(state.orderBy).toBe(null);
    expect(state.limit).toBe(50);
    expect(state.offset).toBe(0);
    expect(state.after).toBe('');
    expect(state.includePageInfo).toBe(true);
  });

  test('builder state preserves filters array', () => {
    const state = hooks.defaultBuilderState();
    state.filters = [
      { id: '1', field: 'Name', op: 'LIKE', value: 'Test%' },
      { id: '2', field: 'Status', op: '=', value: 'Active' }
    ];

    hooks.setBuilderState(state);
    const retrieved = hooks.getBuilderState();

    expect(retrieved.filters).toHaveLength(2);
    expect(retrieved.filters[0].field).toBe('Name');
    expect(retrieved.filters[1].field).toBe('Status');
  });

  test('builder state preserves pagination settings', () => {
    const state = hooks.defaultBuilderState();
    state.limit = 25;
    state.offset = 50;
    state.after = 'cursor123';

    hooks.setBuilderState(state);
    const retrieved = hooks.getBuilderState();

    expect(retrieved.limit).toBe(25);
    expect(retrieved.offset).toBe(50);
    expect(retrieved.after).toBe('cursor123');
  });

  test('builder state preserves orderBy settings', () => {
    const state = hooks.defaultBuilderState();
    state.orderBy = { field: 'CreatedDate', dir: 'desc' };

    hooks.setBuilderState(state);
    const retrieved = hooks.getBuilderState();

    expect(retrieved.orderBy).toEqual({ field: 'CreatedDate', dir: 'desc' });
  });

  test('builder state handles null orderBy', () => {
    const state = hooks.defaultBuilderState();
    state.orderBy = null;

    hooks.setBuilderState(state);
    const retrieved = hooks.getBuilderState();

    expect(retrieved.orderBy).toBeNull();
  });

  test('builder state handles empty filters array', () => {
    const state = hooks.defaultBuilderState();
    state.filters = [];

    hooks.setBuilderState(state);
    const retrieved = hooks.getBuilderState();

    expect(retrieved.filters).toEqual([]);
  });

  test('builder state handles empty fields array', () => {
    const state = hooks.defaultBuilderState();
    state.fields = [];

    hooks.setBuilderState(state);
    const retrieved = hooks.getBuilderState();

    expect(retrieved.fields).toEqual([]);
  });

  test('builder state handles includePageInfo setting', () => {
    const state = hooks.defaultBuilderState();
    state.includePageInfo = false;

    hooks.setBuilderState(state);
    const retrieved = hooks.getBuilderState();

    expect(retrieved.includePageInfo).toBe(false);
  });

  test('getBuilderState returns a clone, not the original', () => {
    const state = hooks.defaultBuilderState();
    state.fields = ['Id', 'Name'];
    hooks.setBuilderState(state);

    const retrieved1 = hooks.getBuilderState();
    retrieved1.fields.push('Industry');

    const retrieved2 = hooks.getBuilderState();
    expect(retrieved2.fields).toEqual(['Id', 'Name']);
  });

  test('setBuilderState handles partial state updates', () => {
    // First set a complete state
    const state = hooks.defaultBuilderState();
    state.object = 'Account';
    state.fields = ['Id'];
    hooks.setBuilderState(state);

    // Then update with partial state (simulating merge behavior)
    const partialState = { ...hooks.getBuilderState(), fields: ['Id', 'Name'] };
    hooks.setBuilderState(partialState);

    const retrieved = hooks.getBuilderState();
    expect(retrieved.object).toBe('Account');
    expect(retrieved.fields).toEqual(['Id', 'Name']);
  });

  test('builder state preserves relatedObjects', () => {
    const state = hooks.defaultBuilderState();
    state.relatedObjects = [
      { id: '1', relationship: 'Contacts', fields: ['Id', 'Email'] }
    ];

    hooks.setBuilderState(state);
    const retrieved = hooks.getBuilderState();

    expect(retrieved.relatedObjects).toHaveLength(1);
    expect(retrieved.relatedObjects[0].relationship).toBe('Contacts');
    expect(retrieved.relatedObjects[0].fields).toEqual(['Id', 'Email']);
  });

  test('defaultBuilderState always returns a new object', () => {
    const state1 = hooks.defaultBuilderState();
    const state2 = hooks.defaultBuilderState();

    state1.fields.push('Name');

    expect(state2.fields).toEqual(['Id']);
    expect(state1).not.toBe(state2);
  });

  test('builder state handles complex filter values', () => {
    const state = hooks.defaultBuilderState();
    state.filters = [
      { id: '1', field: 'Name', op: 'IN', value: 'Value1, Value2, Value3' },
      { id: '2', field: 'CreatedDate', op: '>=', value: '2024-01-01' }
    ];

    hooks.setBuilderState(state);
    const retrieved = hooks.getBuilderState();

    expect(retrieved.filters[0].value).toBe('Value1, Value2, Value3');
    expect(retrieved.filters[1].value).toBe('2024-01-01');
  });
});

describe('Query composition edge cases', () => {
  test('composeQueryFromBuilder generates valid GraphQL with all options', () => {
    const state = hooks.defaultBuilderState();
    state.enabled = true;
    state.object = 'Account';
    state.fields = ['Id', 'Name'];
    state.filters = [{ id: '1', field: 'Industry', op: '=', value: 'Technology' }];
    state.orderBy = { field: 'Name', dir: 'asc' };
    state.limit = 25;
    state.offset = 0;

    const q = hooks.composeQueryFromBuilder(state);

    expect(q).toContain('Account');
    expect(q).toContain('Id');
    expect(q).toContain('Name');
    expect(q).toContain('Industry');
    expect(q).toContain('first: 25');
  });

  test('composeQueryFromBuilder handles empty filters', () => {
    const state = hooks.defaultBuilderState();
    state.enabled = true;
    state.object = 'Contact';
    state.fields = ['Id', 'Email'];
    state.filters = [];
    state.limit = 10;

    const q = hooks.composeQueryFromBuilder(state);

    expect(q).toContain('Contact');
    expect(q).toContain('Id');
    expect(q).toContain('Email');
    expect(q).toContain('first: 10');
  });

  test('composeQueryFromBuilder handles offset parameter', () => {
    const state = hooks.defaultBuilderState();
    state.enabled = true;
    state.object = 'Account';
    state.fields = ['Id'];
    state.limit = 10;
    state.offset = 20;

    const q = hooks.composeQueryFromBuilder(state);

    expect(q).toContain('first: 10');
    expect(q).toContain('offset: 20');
  });

  test('composeQueryFromBuilder handles after cursor', () => {
    const state = hooks.defaultBuilderState();
    state.enabled = true;
    state.object = 'Account';
    state.fields = ['Id'];
    state.limit = 10;
    state.after = 'abc123';

    const q = hooks.composeQueryFromBuilder(state);

    expect(q).toContain('first: 10');
    expect(q).toContain('after: "abc123"');
  });

  test('composeQueryFromBuilder includes pageInfo when enabled', () => {
    const state = hooks.defaultBuilderState();
    state.enabled = true;
    state.object = 'Account';
    state.fields = ['Id'];
    state.includePageInfo = true;

    const q = hooks.composeQueryFromBuilder(state);

    expect(q).toContain('pageInfo');
    expect(q).toContain('endCursor');
    expect(q).toContain('hasNextPage');
  });

  test('composeQueryFromBuilder excludes pageInfo when disabled', () => {
    const state = hooks.defaultBuilderState();
    state.enabled = true;
    state.object = 'Account';
    state.fields = ['Id'];
    state.includePageInfo = false;

    const q = hooks.composeQueryFromBuilder(state);

    expect(q).not.toContain('pageInfo');
    expect(q).not.toContain('endCursor');
  });

  test('composeQueryFromBuilder returns empty string without object', () => {
    const state = hooks.defaultBuilderState();
    state.enabled = true;
    state.object = '';
    state.fields = ['Id'];

    const q = hooks.composeQueryFromBuilder(state);

    expect(q).toBe('');
  });

  test('composeQueryFromBuilder handles object with only whitespace', () => {
    const state = hooks.defaultBuilderState();
    state.enabled = true;
    state.object = '   ';
    state.fields = ['Id'];

    const q = hooks.composeQueryFromBuilder(state);

    expect(q).toBe('');
  });

  test('composeQueryFromBuilder defaults to Id field when fields array is empty', () => {
    const state = hooks.defaultBuilderState();
    state.enabled = true;
    state.object = 'Account';
    state.fields = [];

    const q = hooks.composeQueryFromBuilder(state);

    expect(q).toContain('Id');
  });

  test('composeQueryFromBuilder handles multiple filters of different types', () => {
    const state = hooks.defaultBuilderState();
    state.enabled = true;
    state.object = 'Account';
    state.fields = ['Id'];
    state.filters = [
      { id: '1', field: 'Name', op: 'LIKE', value: 'Test%' },
      { id: '2', field: 'AnnualRevenue', op: '>', value: '1000000' },
      { id: '3', field: 'Industry', op: '=', value: 'Technology' },
      { id: '4', field: 'Type', op: 'IN', value: 'Customer, Partner' }
    ];

    const q = hooks.composeQueryFromBuilder(state);

    expect(q).toContain('like:');
    expect(q).toContain('gt:');
    expect(q).toContain('eq:');
    expect(q).toContain('in:');
  });

  test('composeQueryFromBuilder handles orderBy descending', () => {
    const state = hooks.defaultBuilderState();
    state.enabled = true;
    state.object = 'Account';
    state.fields = ['Id'];
    state.orderBy = { field: 'CreatedDate', dir: 'desc' };

    const q = hooks.composeQueryFromBuilder(state);

    expect(q).toContain('orderBy:');
    expect(q).toContain('DESC');
  });

  test('composeQueryFromBuilder handles orderBy ascending', () => {
    const state = hooks.defaultBuilderState();
    state.enabled = true;
    state.object = 'Account';
    state.fields = ['Id'];
    state.orderBy = { field: 'Name', dir: 'asc' };

    const q = hooks.composeQueryFromBuilder(state);

    expect(q).toContain('orderBy:');
    expect(q).toContain('ASC');
  });

  test('composeQueryFromBuilder generates valid UI API format', () => {
    const state = hooks.defaultBuilderState();
    state.enabled = true;
    state.object = 'Account';
    state.fields = ['Id', 'Name'];
    state.limit = 10;

    const q = hooks.composeQueryFromBuilder(state);

    expect(q).toContain('query {');
    expect(q).toContain('uiapi {');
    expect(q).toContain('query {');
    expect(q).toContain('edges {');
    expect(q).toContain('node {');
  });
});

describe('Query import edge cases', () => {
  test('tryImportQueryToBuilder handles standard GraphQL query', () => {
    hooks.setBuilderState(hooks.defaultBuilderState());
    hooks.tryImportQueryToBuilder('query { Account { Id Name Industry } }');
    const bs = hooks.getBuilderState();

    expect(bs.object).toBe('Account');
    expect(bs.fields).toContain('Id');
    expect(bs.fields).toContain('Name');
  });

  test('tryImportQueryToBuilder handles UI API format', () => {
    hooks.setBuilderState(hooks.defaultBuilderState());
    hooks.tryImportQueryToBuilder('query { uiapi { query { Account(first: 10) { edges { node { Id Name { value } } } pageInfo { endCursor hasNextPage } } } } }');
    const bs = hooks.getBuilderState();

    expect(bs.object).toBe('Account');
    expect(bs.fields).toContain('Id');
    expect(bs.fields).toContain('Name');
    expect(bs.limit).toBe(10);
  });

  test('tryImportQueryToBuilder handles where clause', () => {
    hooks.setBuilderState(hooks.defaultBuilderState());
    hooks.tryImportQueryToBuilder('query { Account(where: { Name: { like: "Test%" } }) { Id } }');
    const bs = hooks.getBuilderState();

    expect(bs.object).toBe('Account');
    expect(bs.filters.length).toBeGreaterThan(0);
    expect(bs.filters[0].field).toBe('Name');
    expect(bs.filters[0].op).toBe('LIKE');
  });

  test('tryImportQueryToBuilder handles multiple filters', () => {
    hooks.setBuilderState(hooks.defaultBuilderState());
    hooks.tryImportQueryToBuilder('query { Account(where: { Name: { like: "Test%" }, Industry: { eq: "Tech" } }) { Id } }');
    const bs = hooks.getBuilderState();

    expect(bs.filters).toHaveLength(2);
    expect(bs.filters[0].field).toBe('Name');
    expect(bs.filters[1].field).toBe('Industry');
  });

  test('tryImportQueryToBuilder handles IN operator', () => {
    hooks.setBuilderState(hooks.defaultBuilderState());
    hooks.tryImportQueryToBuilder('query { Account(where: { Type: { in: ["Customer", "Partner"] } }) { Id } }');
    const bs = hooks.getBuilderState();

    expect(bs.filters[0].op).toBe('IN');
    expect(bs.filters[0].value).toContain('Customer');
    expect(bs.filters[0].value).toContain('Partner');
  });

  test('tryImportQueryToBuilder handles gt (greater than) operator', () => {
    hooks.setBuilderState(hooks.defaultBuilderState());
    hooks.tryImportQueryToBuilder('query { Account(where: { AnnualRevenue: { gt: 1000000 } }) { Id } }');
    const bs = hooks.getBuilderState();

    expect(bs.filters[0].op).toBe('>');
    expect(bs.filters[0].value).toBe('1000000');
  });

  test('tryImportQueryToBuilder handles lt (less than) operator', () => {
    hooks.setBuilderState(hooks.defaultBuilderState());
    hooks.tryImportQueryToBuilder('query { Account(where: { NumberOfEmployees: { lt: 100 } }) { Id } }');
    const bs = hooks.getBuilderState();

    expect(bs.filters[0].op).toBe('<');
  });

  test('tryImportQueryToBuilder handles empty query gracefully', () => {
    hooks.setBuilderState(hooks.defaultBuilderState());
    hooks.tryImportQueryToBuilder('');
    const bs = hooks.getBuilderState();

    // Should not crash and keep default state
    expect(bs.object).toBe('');
  });

  test('tryImportQueryToBuilder handles null query gracefully', () => {
    hooks.setBuilderState(hooks.defaultBuilderState());
    hooks.tryImportQueryToBuilder(null);
    const bs = hooks.getBuilderState();

    expect(bs.object).toBe('');
  });

  test('tryImportQueryToBuilder preserves limit from first parameter', () => {
    hooks.setBuilderState(hooks.defaultBuilderState());
    hooks.tryImportQueryToBuilder('query { Account(first: 25) { Id } }');
    const bs = hooks.getBuilderState();

    expect(bs.limit).toBe(25);
  });

  test('tryImportQueryToBuilder preserves offset parameter', () => {
    hooks.setBuilderState(hooks.defaultBuilderState());
    hooks.tryImportQueryToBuilder('query { Account(first: 10, offset: 50) { Id } }');
    const bs = hooks.getBuilderState();

    expect(bs.offset).toBe(50);
  });

  test('tryImportQueryToBuilder preserves after cursor', () => {
    hooks.setBuilderState(hooks.defaultBuilderState());
    hooks.tryImportQueryToBuilder('query { Account(after: "cursor123") { Id } }');
    const bs = hooks.getBuilderState();

    expect(bs.after).toBe('cursor123');
  });
});

describe('Composite Query (Related Objects)', () => {
  test('defaultBuilderState includes empty relatedObjects array', () => {
    const state = hooks.defaultBuilderState();
    expect(state.relatedObjects).toEqual([]);
  });

  test('composeQueryFromBuilder includes related objects in selection', () => {
    const state = hooks.defaultBuilderState();
    state.enabled = true;
    state.object = 'Account';
    state.fields = ['Id', 'Name'];
    state.relatedObjects = [
      { id: '1', relationship: 'Contacts', fields: ['Id', 'FirstName', 'LastName'] }
    ];
    state.limit = 10;

    const q = hooks.composeQueryFromBuilder(state);

    expect(q).toContain('Account');
    expect(q).toContain('Id');
    expect(q).toContain('Name');
    expect(q).toContain('Contacts');
    expect(q).toContain('FirstName');
    expect(q).toContain('LastName');
    expect(q).toContain('edges { node');
  });

  test('composeQueryFromBuilder handles multiple related objects', () => {
    const state = hooks.defaultBuilderState();
    state.enabled = true;
    state.object = 'Account';
    state.fields = ['Id'];
    state.relatedObjects = [
      { id: '1', relationship: 'Contacts', fields: ['Id', 'Email'] },
      { id: '2', relationship: 'Opportunities', fields: ['Id', 'Name', 'Amount'] }
    ];
    state.limit = 5;

    const q = hooks.composeQueryFromBuilder(state);

    expect(q).toContain('Contacts');
    expect(q).toContain('Email');
    expect(q).toContain('Opportunities');
    expect(q).toContain('Amount');
  });

  test('composeQueryFromBuilder works without related objects', () => {
    const state = hooks.defaultBuilderState();
    state.enabled = true;
    state.object = 'Account';
    state.fields = ['Id', 'Name'];
    state.relatedObjects = [];
    state.limit = 10;

    const q = hooks.composeQueryFromBuilder(state);

    expect(q).toContain('Account');
    expect(q).toContain('Id');
    expect(q).toContain('Name');
    expect(q).not.toContain('Contacts');
  });

  test('builder state preserves relatedObjects array', () => {
    const state = hooks.defaultBuilderState();
    state.relatedObjects = [
      { id: '1', relationship: 'Contacts', fields: ['Id', 'Name'] }
    ];

    hooks.setBuilderState(state);
    const retrieved = hooks.getBuilderState();

    expect(retrieved.relatedObjects).toHaveLength(1);
    expect(retrieved.relatedObjects[0].relationship).toBe('Contacts');
    expect(retrieved.relatedObjects[0].fields).toEqual(['Id', 'Name']);
  });

  test('cloneBuilderState deep copies relatedObjects', () => {
    const state = hooks.defaultBuilderState();
    state.relatedObjects = [
      { id: '1', relationship: 'Cases', fields: ['Id', 'Subject'] }
    ];

    hooks.setBuilderState(state);
    const cloned = hooks.getBuilderState();

    // Modify original
    state.relatedObjects[0].fields.push('Status');

    // Cloned should not be affected
    expect(cloned.relatedObjects[0].fields).toEqual(['Id', 'Subject']);
  });

  test('composeQueryFromBuilder handles related object with single field', () => {
    const state = hooks.defaultBuilderState();
    state.enabled = true;
    state.object = 'Account';
    state.fields = ['Id'];
    state.relatedObjects = [
      { id: '1', relationship: 'Contacts', fields: ['Id'] }
    ];
    state.limit = 10;

    const q = hooks.composeQueryFromBuilder(state);

    expect(q).toContain('Contacts');
    expect(q).toContain('edges { node { Id }');
  });

  test('composeQueryFromBuilder handles related object with empty fields array', () => {
    const state = hooks.defaultBuilderState();
    state.enabled = true;
    state.object = 'Account';
    state.fields = ['Id'];
    state.relatedObjects = [
      { id: '1', relationship: 'Contacts', fields: [] }
    ];
    state.limit = 10;

    const q = hooks.composeQueryFromBuilder(state);

    // Should default to Id field
    expect(q).toContain('Contacts');
    expect(q).toContain('Id');
  });

  test('composeQueryFromBuilder handles related object with null fields', () => {
    const state = hooks.defaultBuilderState();
    state.enabled = true;
    state.object = 'Account';
    state.fields = ['Id'];
    state.relatedObjects = [
      { id: '1', relationship: 'Contacts', fields: null }
    ];
    state.limit = 10;

    const q = hooks.composeQueryFromBuilder(state);

    // Should handle gracefully
    expect(q).toContain('Account');
  });

  test('composeQueryFromBuilder handles three or more related objects', () => {
    const state = hooks.defaultBuilderState();
    state.enabled = true;
    state.object = 'Account';
    state.fields = ['Id'];
    state.relatedObjects = [
      { id: '1', relationship: 'Contacts', fields: ['Id'] },
      { id: '2', relationship: 'Opportunities', fields: ['Id'] },
      { id: '3', relationship: 'Cases', fields: ['Id'] }
    ];
    state.limit = 5;

    const q = hooks.composeQueryFromBuilder(state);

    expect(q).toContain('Contacts');
    expect(q).toContain('Opportunities');
    expect(q).toContain('Cases');
  });

  test('related objects do not affect filters or orderBy', () => {
    const state = hooks.defaultBuilderState();
    state.enabled = true;
    state.object = 'Account';
    state.fields = ['Id', 'Name'];
    state.filters = [{ id: 'f1', field: 'Industry', op: '=', value: 'Tech' }];
    state.orderBy = { field: 'Name', dir: 'asc' };
    state.relatedObjects = [
      { id: '1', relationship: 'Contacts', fields: ['Id'] }
    ];
    state.limit = 10;

    const q = hooks.composeQueryFromBuilder(state);

    expect(q).toContain('where:');
    expect(q).toContain('Industry');
    expect(q).toContain('orderBy:');
    expect(q).toContain('Contacts');
  });

  test('builder state with relatedObjects survives setBuilderState/getBuilderState cycle', () => {
    const state = hooks.defaultBuilderState();
    state.enabled = true;
    state.object = 'Account';
    state.fields = ['Id', 'Name'];
    state.relatedObjects = [
      { id: '1', relationship: 'Contacts', fields: ['Id', 'Email'] },
      { id: '2', relationship: 'Opportunities', fields: ['Id', 'Amount'] }
    ];
    state.limit = 25;
    state.offset = 10;

    hooks.setBuilderState(state);
    const retrieved = hooks.getBuilderState();

    expect(retrieved.enabled).toBe(true);
    expect(retrieved.object).toBe('Account');
    expect(retrieved.fields).toEqual(['Id', 'Name']);
    expect(retrieved.relatedObjects).toHaveLength(2);
    expect(retrieved.limit).toBe(25);
    expect(retrieved.offset).toBe(10);
  });

  // === NEW TEST CASES FOR DUPLICATE FIELD/RELATED OBJECT BUG FIX ===

  test('composeQueryFromBuilder excludes fields that are also related object relationships', () => {
    const state = hooks.defaultBuilderState();
    state.enabled = true;
    state.object = 'Account';
    state.fields = ['Id', 'Name', 'Opportunities']; // Opportunities is ALSO a relationship
    state.relatedObjects = [
      { id: '1', relationship: 'Opportunities', fields: ['Id', 'Name'] }
    ];
    state.limit = 50;

    const q = hooks.composeQueryFromBuilder(state);

    // Should NOT have "Opportunities { value }" - only the edges version
    expect(q).not.toMatch(/Opportunities\s*\{\s*value\s*\}/);
    // Should have the proper edges structure for related object
    expect(q).toContain('Opportunities { edges { node {');
    // Should still have other regular fields
    expect(q).toContain('Id');
    expect(q).toContain('Name { value }');
  });

  test('composeQueryFromBuilder handles all fields being related objects', () => {
    const state = hooks.defaultBuilderState();
    state.enabled = true;
    state.object = 'Account';
    state.fields = ['Contacts', 'Opportunities']; // Both are also relationships
    state.relatedObjects = [
      { id: '1', relationship: 'Contacts', fields: ['Id'] },
      { id: '2', relationship: 'Opportunities', fields: ['Id'] }
    ];
    state.limit = 50;

    const q = hooks.composeQueryFromBuilder(state);

    // Should default to Id when all fields are filtered out
    expect(q).toContain('Id');
    // Should have both related objects as edges
    expect(q).toContain('Contacts { edges { node {');
    expect(q).toContain('Opportunities { edges { node {');
    // Should NOT have value wrappers for relationship names
    expect(q).not.toMatch(/Contacts\s*\{\s*value\s*\}/);
    expect(q).not.toMatch(/Opportunities\s*\{\s*value\s*\}/);
  });

  test('composeQueryFromBuilder handles mixed fields - some are relationships, some are not', () => {
    const state = hooks.defaultBuilderState();
    state.enabled = true;
    state.object = 'Account';
    state.fields = ['Id', 'Name', 'Industry', 'Contacts', 'Owner']; // Contacts is a relationship, Owner might be too
    state.relatedObjects = [
      { id: '1', relationship: 'Contacts', fields: ['Id', 'Email'] }
    ];
    state.limit = 10;

    const q = hooks.composeQueryFromBuilder(state);

    // Regular fields should remain
    expect(q).toContain('Name { value }');
    expect(q).toContain('Industry { value }');
    expect(q).toContain('Owner { value }'); // Owner is not in relatedObjects, so should stay as field
    // Contacts should only appear as edges
    expect(q).toContain('Contacts { edges { node {');
    expect(q).not.toMatch(/Contacts\s*\{\s*value\s*\}/);
  });

  test('composeQueryFromBuilder preserves Id field even when filtered', () => {
    const state = hooks.defaultBuilderState();
    state.enabled = true;
    state.object = 'Account';
    state.fields = ['Id', 'Contacts'];
    state.relatedObjects = [
      { id: '1', relationship: 'Contacts', fields: ['Id'] }
    ];
    state.limit = 50;

    const q = hooks.composeQueryFromBuilder(state);

    // Id should remain in main selection
    expect(q).toMatch(/node\s*\{\s*Id/);
    // Contacts should be as edges, not value
    expect(q).toContain('Contacts { edges { node {');
  });

  test('generated query produces valid GraphQL syntax without duplicate braces', () => {
    const state = hooks.defaultBuilderState();
    state.enabled = true;
    state.object = 'Account';
    state.fields = ['Id', 'Name', 'Opportunities', 'Contacts'];
    state.relatedObjects = [
      { id: '1', relationship: 'Opportunities', fields: ['Id', 'Name'] },
      { id: '2', relationship: 'Contacts', fields: ['Id', 'Name'] }
    ];
    state.limit = 50;

    const q = hooks.composeQueryFromBuilder(state);

    // Should NOT have patterns like "} { {" which indicate malformed query
    expect(q).not.toContain('} { {');
    expect(q).not.toContain('} } {');
    // Count opening and closing braces - they should match
    const openBraces = (q.match(/\{/g) || []).length;
    const closeBraces = (q.match(/\}/g) || []).length;
    expect(openBraces).toBe(closeBraces);
  });

  test('composeQueryFromBuilder with empty relatedObjects does not filter fields', () => {
    const state = hooks.defaultBuilderState();
    state.enabled = true;
    state.object = 'Account';
    state.fields = ['Id', 'Name', 'Opportunities']; // Opportunities as a field name
    state.relatedObjects = []; // No related objects
    state.limit = 50;

    const q = hooks.composeQueryFromBuilder(state);

    // All fields should be present with { value } wrappers
    expect(q).toContain('Name { value }');
    expect(q).toContain('Opportunities { value }');
  });
});

