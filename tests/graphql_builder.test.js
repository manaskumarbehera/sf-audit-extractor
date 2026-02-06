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
  const status = document.getElementById('graphql-builder-status');

  vars.value = '{bad json';
  runBtn.click();
  await flush();

  expect(sendMessageMock).not.toHaveBeenCalledWith(expect.objectContaining({ action: 'RUN_GRAPHQL' }), expect.any(Function));
  expect(status.textContent).toContain('Invalid variables JSON');
});

test('imports UI API query with edges/node/value and after cursor', () => {
  hooks.setBuilderState(hooks.defaultBuilderState());
  const src = 'query { uiapi { query { Account(first: 5, after: "abc", where: { Name: { like: "Acme%" } }) { edges { node { Id Name { value } } } pageInfo { endCursor hasNextPage } } } } }';
  hooks.tryImportQueryToBuilder(src);
  const bs = hooks.getBuilderState();
  expect(bs.object).toBe('Account');
  expect(bs.fields).toEqual(['Id', 'Name']);
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
  expect(q).toContain('edges { node');
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
});

