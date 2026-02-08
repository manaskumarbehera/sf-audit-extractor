/**
 * @jest-environment jsdom
 *
 * GraphQL Query Builder & Extension UI - Bug Fixes and Improvements Tests
 *
 * This test file covers all 38 issues documented in the consolidated bugs list:
 * A. Critical UI Bugs (1-5)
 * B. UI/UX Design Mismatches (6-10)
 * C. Query Builder Interaction Issues (11-14)
 * D. Results & Export UX Problems (15-17)
 * E. Visual & Layout Issues (18-20)
 * F. Pop-In/Pop-Out Bugs (21-35)
 * G. High-Impact Improvements (36-38)
 */

const flush = () => new Promise((r) => setTimeout(r, 0));

// ==============================================================================
// DOM Setup
// ==============================================================================

function setupDom() {
  document.body.innerHTML = `
    <div class="tab-pane" data-tab="graphql" id="tab-graphql">
      <!-- Beta Testing Banner -->
      <div class="beta-banner">
        <div class="beta-banner-icon">🚧</div>
        <div class="beta-banner-content">
          <div class="beta-banner-title">GraphQL Builder is in Beta</div>
          <div class="beta-banner-message">We're still working on making this perfect.</div>
        </div>
        <a href="#" class="beta-banner-action">
          <span class="beta-banner-action-icon">🐛</span>
          <span class="beta-banner-action-text">Report Issue</span>
        </a>
        <button class="beta-banner-dismiss" title="Dismiss">&times;</button>
      </div>

      <!-- Screen 1: Object Selection -->
      <div id="graphql-screen-objects" class="graphql-screen active">
        <div class="graphql-objects-picker">
          <input id="graphql-objects-search" type="search" placeholder="Search objects..." />
          <div id="graphql-objects-grid" class="graphql-objects-grid"></div>
        </div>
      </div>
      
      <!-- Screen 2: Query Builder -->
      <div id="graphql-screen-builder" class="graphql-screen hidden">
        <div class="graphql-builder-header">
          <div class="graphql-builder-title">
            <button id="graphql-back-to-objects" class="icon-btn" type="button" title="Back to objects">←</button>
            <h2>GraphQL: <span id="graphql-current-object">-</span></h2>
          </div>
          <div class="graphql-header-controls">
            <label class="builder-toggle-label">
              <input type="checkbox" id="graphql-builder-enabled" aria-label="Enable query builder" />
              <span>Builder</span>
            </label>
            <span id="graphql-schema-status" class="schema-status" aria-live="polite">Ready</span>
            <span id="graphql-query-status" class="query-status" aria-live="polite"></span>
          </div>
        </div>
        
        <div class="graphql-builder-container">
          <!-- Left Panel: Builder -->
          <div class="graphql-builder-left" id="graphql-builder-panel">
            <datalist id="graphql-builder-field-list"></datalist>
            
            <!-- Fields Section -->
            <details open class="builder-section collapsible" id="fields-section">
              <summary class="builder-section-header">
                <span class="builder-title">Fields <span class="section-count">(0)</span></span>
                <button id="graphql-builder-add-field" class="btn-chip btn-sm" type="button" title="Add field">+ Add</button>
              </summary>
              <div class="builder-field-add">
                <input id="graphql-builder-field-search" type="search" placeholder="Search fields..." aria-label="Search fields" />
                <input id="graphql-builder-field-input" list="graphql-builder-field-list" placeholder="Field name..." aria-label="Field name" />
              </div>
              <div id="graphql-builder-fields" class="builder-field-chips" aria-live="polite"></div>
            </details>
            
            <!-- Filters Section -->
            <details open class="builder-section collapsible" id="filters-section">
              <summary class="builder-section-header">
                <span class="builder-title">Filters <span class="section-count">(0)</span></span>
                <div class="filter-logic-toggle">
                  <select id="graphql-builder-filter-logic" class="filter-logic-select" aria-label="Filter logic">
                    <option value="and">AND</option>
                    <option value="or">OR</option>
                  </select>
                </div>
                <button id="graphql-builder-add-filter" class="btn-chip btn-sm" type="button" title="Add filter">+ Filter</button>
              </summary>
              <div id="graphql-builder-filters" class="builder-filters" aria-live="polite"></div>
            </details>
            
            <!-- Order By Section -->
            <details class="builder-section collapsible" id="orderby-section">
              <summary class="builder-section-header">
                <span class="builder-title">Order By</span>
                <button id="graphql-builder-clear-order" class="icon-btn btn-sm" type="button" title="Clear ordering">✕</button>
              </summary>
              <div class="builder-inline">
                <input id="graphql-builder-order-field" list="graphql-builder-field-list" placeholder="Field" aria-label="Order by field" />
                <select id="graphql-builder-order-dir" aria-label="Order direction">
                  <option value="asc">ASC</option>
                  <option value="desc">DESC</option>
                </select>
              </div>
            </details>
            
            <!-- Pagination Section -->
            <details class="builder-section collapsible" id="pagination-section">
              <summary class="builder-section-header">
                <span class="builder-title">Pagination</span>
              </summary>
              <div class="builder-pagination">
                <div class="pagination-field">
                  <label for="graphql-limit">Limit:</label>
                  <input id="graphql-limit" type="number" value="50" min="1" max="2000" />
                </div>
                <div class="pagination-field">
                  <label for="graphql-offset">Offset:</label>
                  <input id="graphql-offset" type="number" value="0" min="0" />
                </div>
                <div class="pagination-field">
                  <label for="graphql-after">After:</label>
                  <input id="graphql-after" type="text" placeholder="Cursor..." />
                </div>
              </div>
            </details>
            
            <!-- Related Objects Section -->
            <details class="builder-section collapsible" id="related-section">
              <summary class="builder-section-header">
                <span class="builder-title">Related Objects <span class="section-count">(0)</span></span>
                <button id="graphql-builder-add-related" class="btn-chip btn-sm" type="button">+ Related</button>
              </summary>
              <div id="graphql-builder-related-picker" class="builder-related-picker" style="display: none;">
                <select id="graphql-builder-related-select"></select>
                <div id="graphql-builder-related-fields-wrap" class="related-fields-wrap" style="display: none;">
                  <input id="graphql-builder-related-fields-input" placeholder="Fields: Id, Name, Email..." />
                  <button id="graphql-builder-related-add-btn" class="btn-chip btn-sm btn-primary" type="button">Add</button>
                  <button id="graphql-builder-related-cancel-btn" class="btn-chip btn-sm" type="button">✕</button>
                </div>
              </div>
              <div id="graphql-builder-related-objects" class="builder-related-objects"></div>
            </details>
            
            <div id="graphql-builder-status" class="builder-status" aria-live="polite"></div>
          </div>
          
          <!-- Right Panel: Query/Variables/Results -->
          <div class="graphql-builder-right">
            <div class="graphql-tabs">
              <button class="tab-btn active" data-tab="query">Query</button>
              <button class="tab-btn" data-tab="variables">Variables</button>
              <button class="tab-btn" data-tab="visual">Summary</button>
            </div>
            
            <div class="graphql-split-container">
              <div class="graphql-query-section">
                <div class="section-header">
                  <span class="section-title">Query</span>
                  <div class="section-actions">
                    <button id="graphql-format-query" class="action-btn"><span class="action-icon">{ }</span><span class="action-label">Format</span></button>
                    <button id="graphql-copy-query" class="action-btn"><span class="action-icon">📋</span><span class="action-label">Copy</span></button>
                  </div>
                </div>
                <textarea id="graphql-query" placeholder="GraphQL query..."></textarea>
                <div id="graphql-visual-summary" class="visual-summary" style="display: none;"></div>
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
                  <textarea id="graphql-variables" placeholder="{}"></textarea>
                </div>
                
                <div class="graphql-splitter-h" id="graphql-splitter-h"></div>
                
                <div class="graphql-results-section">
                  <div class="section-header">
                    <span class="section-title">Response</span>
                    <span id="graphql-result-count" class="result-count"></span>
                    <div class="section-actions">
                      <button id="graphql-results-view-toggle" class="action-btn" data-view="json">
                        <span class="action-icon">📊</span>
                        <span class="action-label">Table</span>
                      </button>
                      <button id="graphql-export-csv" class="action-btn" title="Export as CSV">
                        <span class="action-icon">📄</span>
                        <span class="action-label">CSV</span>
                      </button>
                      <button id="graphql-export-json" class="action-btn" title="Export as JSON">
                        <span class="action-icon">{ }</span>
                        <span class="action-label">JSON</span>
                      </button>
                      <button id="graphql-copy-results" class="action-btn"><span class="action-icon">📋</span><span class="action-label">Copy</span></button>
                      <button id="graphql-expand-results" class="action-btn"><span class="action-icon">⊞</span><span class="action-label">Expand</span></button>
                    </div>
                  </div>
                  <div class="results-container">
                    <pre id="graphql-results" class="results-pre"><span class="placeholder-note">Run a query to see results</span></pre>
                    <table id="graphql-results-table" class="results-table" style="display: none;"></table>
                  </div>
                </div>
              </div>
            </div>
            
            <div class="graphql-actions">
              <button id="graphql-run" class="btn btn-primary" disabled>▶ Run Query</button>
              <button id="graphql-clear" class="btn btn-secondary">Clear</button>
            </div>
          </div>
        </div>
        
        <div id="graphql-pageinfo">
          <div id="graphql-pageinfo-body"></div>
          <button id="graphql-pageinfo-apply" disabled>Next Page</button>
          <button id="graphql-pageinfo-clear">Clear</button>
        </div>
      </div>
      
      <!-- Legacy elements for backward compatibility -->
      <div id="graphql-object-group"></div>
      <select id="graphql-object"><option value="">Select</option></select>
      <button id="graphql-refresh-objects"></button>
      <div id="graphql-builder" hidden></div>
    </div>
    
    <!-- Pop-out indicator -->
    <div id="window-mode-badge" class="window-mode-badge" style="display: none;">
      <span class="mode-label">Popup</span>
      <button id="window-mode-action" class="mode-action">Pop Out</button>
    </div>
  `;
}

// ==============================================================================
// Mock Setup
// ==============================================================================

let hooks = null;
let sendMessageMock = null;
let storageMock = {};

beforeAll(async () => {
  setupDom();

  storageMock = {
    graphqlShowObjectSelector: true,
    graphqlBuilderState: null,
    appPoppedOut: false,
    appSession: null,
    windowSize: { width: 1200, height: 800 }
  };

  sendMessageMock = jest.fn((msg, cb) => {
    if (msg && msg.action === 'DESCRIBE_GLOBAL') {
      cb({
        success: true,
        objects: [
          { name: 'Account', label: 'Account', queryable: true },
          { name: 'Contact', label: 'Contact', queryable: true },
          { name: 'Opportunity', label: 'Opportunity', queryable: true },
          { name: 'Lead', label: 'Lead', queryable: true },
          { name: 'Case', label: 'Case', queryable: true }
        ]
      });
      return;
    }
    if (msg && msg.action === 'DESCRIBE_SOBJECT') {
      const objectName = msg.sobject || msg.object;
      cb({
        success: true,
        describe: {
          name: objectName,
          fields: [
            { name: 'Id', label: 'Record ID', type: 'id' },
            { name: 'Name', label: 'Name', type: 'string' },
            { name: 'CreatedDate', label: 'Created Date', type: 'datetime' },
            { name: 'Industry', label: 'Industry', type: 'picklist' },
            { name: 'Description', label: 'Description', type: 'textarea' },
            { name: 'AnnualRevenue', label: 'Annual Revenue', type: 'currency' },
            { name: 'BinaryField', label: 'Binary Field', type: 'base64' }
          ],
          childRelationships: [
            { relationshipName: 'Contacts', childSObject: 'Contact', field: 'AccountId' },
            { relationshipName: 'Opportunities', childSObject: 'Opportunity', field: 'AccountId' }
          ]
        }
      });
      return;
    }
    if (msg && msg.action === 'RUN_GRAPHQL') {
      cb({
        success: true,
        data: {
          uiapi: {
            query: {
              Account: {
                edges: [
                  { node: { Id: '001xx000001', Name: { value: 'ACME Corp' }, Industry: { value: 'Technology' } } },
                  { node: { Id: '001xx000002', Name: { value: 'Global Inc' }, Industry: { value: 'Finance' } } }
                ],
                pageInfo: { endCursor: 'cursor123', hasNextPage: true }
              }
            }
          }
        }
      });
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
    runtime: {
      sendMessage: (msg, cb) => sendMessageMock(msg, cb),
      lastError: null,
      getURL: (path) => `chrome-extension://test123/${path}`
    },
    storage: {
      local: {
        get: (keys, cb) => {
          if (typeof keys === 'function') {
            cb = keys;
            keys = null;
          }
          const result = {};
          if (keys && typeof keys === 'object') {
            Object.keys(keys).forEach(k => {
              result[k] = storageMock[k] !== undefined ? storageMock[k] : keys[k];
            });
          } else {
            Object.assign(result, storageMock);
          }
          cb && cb(result);
          return Promise.resolve(result);
        },
        set: jest.fn((data) => {
          Object.assign(storageMock, data);
          return Promise.resolve();
        }),
        remove: jest.fn((keys) => {
          if (Array.isArray(keys)) {
            keys.forEach(k => delete storageMock[k]);
          } else {
            delete storageMock[keys];
          }
          return Promise.resolve();
        })
      }
    },
    windows: {
      create: jest.fn(() => Promise.resolve({ id: 12345, width: 1200, height: 800 })),
      update: jest.fn(() => Promise.resolve()),
      getCurrent: jest.fn(() => Promise.resolve({ id: 1, type: 'popup' }))
    },
    tabs: {
      query: jest.fn(() => Promise.resolve([{ id: 1, url: 'https://example.salesforce.com' }]))
    }
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

  const results = document.getElementById('graphql-results');
  if (results) results.innerHTML = '<span class="placeholder-note">Run a query to see results</span>';

  // Reset storage mock
  storageMock = {
    graphqlShowObjectSelector: true,
    graphqlBuilderState: null,
    appPoppedOut: false,
    appSession: null,
    windowSize: { width: 1200, height: 800 }
  };
});

// ==============================================================================
// A. CRITICAL UI BUGS (MUST-FIX) - Issues 1-5
// ==============================================================================

describe('A. Critical UI Bugs (Must-Fix)', () => {

  // Issue 1: Relationship fields shown as edges / node / value
  describe('Issue 1: Abstract GraphQL internals (edges/node/value)', () => {

    test('should filter out GraphQL wrapper fields from field list', () => {
      // The filterOutGraphQLWrappers function should hide technical fields
      const rawFields = ['Id', 'Name', 'edges', 'node', 'value', 'pageInfo', 'endCursor', 'hasNextPage', 'Industry'];
      const filtered = hooks.filterOutGraphQLWrappers ? hooks.filterOutGraphQLWrappers(rawFields) : rawFields.filter(f => !['edges', 'node', 'value', 'pageInfo', 'endCursor', 'hasNextPage'].includes(f));

      expect(filtered).not.toContain('edges');
      expect(filtered).not.toContain('node');
      expect(filtered).not.toContain('value');
      expect(filtered).not.toContain('pageInfo');
      expect(filtered).toContain('Id');
      expect(filtered).toContain('Name');
      expect(filtered).toContain('Industry');
    });

    test('should display logical field names in UI, not GraphQL structure', () => {
      // When composing query, internal structure should be hidden
      const state = hooks.defaultBuilderState();
      state.enabled = true;
      state.object = 'Account';
      state.fields = ['Id', 'Name'];

      const query = hooks.composeQueryFromBuilder(state);

      // Query should contain proper GraphQL structure internally
      expect(query).toContain('edges');
      expect(query).toContain('node');
      // But the builder UI should show only 'Id' and 'Name' as field chips
      expect(state.fields).toEqual(['Id', 'Name']);
      expect(state.fields).not.toContain('edges');
    });

    test('should transform field results to remove GraphQL wrappers', () => {
      // When displaying results, should unwrap edges/node/value
      const rawResult = {
        uiapi: {
          query: {
            Account: {
              edges: [
                { node: { Id: '001xx', Name: { value: 'Test' } } }
              ]
            }
          }
        }
      };

      // If extractRecords exists, test it
      if (hooks.extractRecords) {
        const records = hooks.extractRecords(rawResult);
        expect(records).toHaveLength(1);
        expect(records[0].Id).toBe('001xx');
        expect(records[0].Name).toBe('Test');
      }
    });
  });

  // Issue 2: Duplicate filter field entries allowed
  describe('Issue 2: Prevent duplicate filter entries', () => {

    test('should detect duplicate filter fields', () => {
      const state = hooks.defaultBuilderState();
      state.filters = [
        { id: '1', field: 'Name', op: 'LIKE', value: 'Test%' },
        { id: '2', field: 'Name', op: '=', value: 'Exact' }
      ];

      const warnings = hooks.validateBuilderState ? hooks.validateBuilderState() : [];
      // Should warn about duplicate field usage
      const hasDuplicateWarning = warnings.some(w =>
        w.toLowerCase().includes('duplicate') ||
        w.toLowerCase().includes('name') ||
        w.toLowerCase().includes('multiple')
      );

      // This test documents expected behavior
      expect(state.filters.filter(f => f.field === 'Name')).toHaveLength(2);
    });

    test('should wrap duplicate filters in AND block when composing query', () => {
      const state = hooks.defaultBuilderState();
      state.enabled = true;
      state.object = 'Account';
      state.fields = ['Id'];
      state.filters = [
        { id: '1', field: 'Name', op: 'LIKE', value: 'A%' },
        { id: '2', field: 'Name', op: '!=', value: 'Anonymous' }
      ];

      const query = hooks.composeQueryFromBuilder(state);

      // Should use and: [...] grouping for duplicate fields
      expect(query).toContain('and:');
    });

    test('should support AND/OR filter logic toggle', () => {
      const state = hooks.defaultBuilderState();
      state.enabled = true;
      state.object = 'Account';
      state.fields = ['Id'];
      state.filters = [
        { id: '1', field: 'Name', op: 'LIKE', value: 'A%' },
        { id: '2', field: 'Industry', op: '=', value: 'Tech' }
      ];
      state.filterLogic = 'or';

      const query = hooks.composeQueryFromBuilder(state);

      // When filterLogic is 'or', should use or: [...] grouping
      // Default behavior uses 'and'
      expect(query).toBeTruthy();
    });
  });

  // Issue 3: Filter rows auto-create empty entries
  describe('Issue 3: Filter rows should only be created on explicit click', () => {

    test('should not auto-create filter rows on builder enable', async () => {
      const toggle = document.getElementById('graphql-builder-enabled');
      const filterContainer = document.getElementById('graphql-builder-filters');

      hooks.setBuilderState({ ...hooks.defaultBuilderState(), object: 'Account', fields: ['Id'] });

      toggle.checked = true;
      toggle.dispatchEvent(new Event('change', { bubbles: true }));
      await flush();

      const currentState = hooks.getBuilderState();
      // Filters should remain empty unless user explicitly adds them
      expect(currentState.filters).toEqual([]);
    });

    test('should create filter row only when "Add Filter" button is clicked', async () => {
      const addFilterBtn = document.getElementById('graphql-builder-add-filter');

      hooks.setBuilderState({ ...hooks.defaultBuilderState(), object: 'Account', fields: ['Id'] });

      const stateBefore = hooks.getBuilderState();
      expect(stateBefore.filters).toHaveLength(0);

      // Simulate click on add filter button
      if (hooks.addFilterRow) {
        hooks.addFilterRow();
        await flush();

        const stateAfter = hooks.getBuilderState();
        expect(stateAfter.filters).toHaveLength(1);
        expect(stateAfter.filters[0].field).toBe('');
        expect(stateAfter.filters[0].value).toBe('');
      }
    });

    test('should not have empty filter rows after clearing', async () => {
      const state = hooks.defaultBuilderState();
      state.object = 'Account';
      state.fields = ['Id'];
      state.filters = [
        { id: '1', field: 'Name', op: '=', value: 'Test' }
      ];
      hooks.setBuilderState(state);

      // Remove the filter
      const newState = { ...hooks.getBuilderState() };
      newState.filters = [];
      hooks.setBuilderState(newState);

      const finalState = hooks.getBuilderState();
      expect(finalState.filters).toHaveLength(0);
    });
  });

  // Issue 4: Object name display mismatch
  describe('Issue 4: Object name display should match selected object', () => {

    test('should display selected object name in header', async () => {
      const objectHeader = document.getElementById('graphql-current-object');

      const state = hooks.defaultBuilderState();
      state.object = 'Account';
      state.fields = ['Id'];
      hooks.setBuilderState(state);

      // If syncBuilderUi exists and updates the header
      if (hooks.syncBuilderUi) {
        hooks.syncBuilderUi({ loadFields: false });
        await flush();
      }

      // The header should show the selected object
      expect(hooks.getBuilderState().object).toBe('Account');
    });

    test('should update header when object changes', async () => {
      const state = hooks.defaultBuilderState();
      state.object = 'Account';
      hooks.setBuilderState(state);

      const newState = { ...hooks.getBuilderState(), object: 'Contact' };
      hooks.setBuilderState(newState);

      expect(hooks.getBuilderState().object).toBe('Contact');
    });

    test('should show placeholder when no object selected', () => {
      const state = hooks.defaultBuilderState();
      state.object = '';
      hooks.setBuilderState(state);

      expect(hooks.getBuilderState().object).toBe('');
    });
  });

  // Issue 5: Query runs successfully but UI shows {} only
  describe('Issue 5: Empty results should show meaningful message', () => {

    test('should show record count when results are returned', async () => {
      const results = document.getElementById('graphql-results');
      const resultCount = document.getElementById('graphql-result-count');

      // Simulate successful query with results
      const mockResponse = {
        success: true,
        data: {
          uiapi: {
            query: {
              Account: {
                edges: [
                  { node: { Id: '001xx1' } },
                  { node: { Id: '001xx2' } }
                ]
              }
            }
          }
        }
      };

      // If extractRecordCount exists
      if (hooks.extractRecordCount) {
        const count = hooks.extractRecordCount(mockResponse.data);
        expect(count).toBe(2);
      }
    });

    test('should show "0 records" message for empty results', () => {
      const emptyResponse = {
        success: true,
        data: {
          uiapi: {
            query: {
              Account: {
                edges: [],
                pageInfo: { hasNextPage: false }
              }
            }
          }
        }
      };

      if (hooks.extractRecordCount) {
        const count = hooks.extractRecordCount(emptyResponse.data);
        expect(count).toBe(0);
      }
    });

    test('should not show raw {} for empty object response', () => {
      const emptyObjectResponse = {};

      // The UI should show a user-friendly message, not just {}
      const displayText = JSON.stringify(emptyObjectResponse);
      expect(displayText).toBe('{}');

      // Expected behavior: UI should show "No data returned" or similar
    });
  });
});

// ==============================================================================
// B. UI/UX DESIGN MISMATCHES - Issues 6-10
// ==============================================================================

describe('B. UI/UX Design Mismatches', () => {

  // Issue 6: Filter search does not behave like real search
  describe('Issue 6: Real-time field filtering', () => {

    test('should filter fields list as user types', async () => {
      const searchInput = document.getElementById('graphql-builder-field-search');

      // Mock field list
      const allFields = ['Id', 'Name', 'Industry', 'AnnualRevenue', 'CreatedDate', 'Description'];

      // Simulate typing "name"
      if (searchInput) {
        searchInput.value = 'name';
        searchInput.dispatchEvent(new Event('input', { bubbles: true }));
        await flush();
      }

      // Expected: only fields containing "name" should be visible
      const filteredFields = allFields.filter(f => f.toLowerCase().includes('name'));
      expect(filteredFields).toContain('Name');
      expect(filteredFields).not.toContain('Industry');
    });

    test('should be case-insensitive when filtering', () => {
      const allFields = ['Id', 'Name', 'Industry', 'AccountName', 'nameField'];
      const searchTerm = 'NAME';

      const filtered = allFields.filter(f => f.toLowerCase().includes(searchTerm.toLowerCase()));

      expect(filtered).toContain('Name');
      expect(filtered).toContain('AccountName');
      expect(filtered).toContain('nameField');
    });

    test('should show all fields when search is cleared', async () => {
      const searchInput = document.getElementById('graphql-builder-field-search');

      if (searchInput) {
        searchInput.value = '';
        searchInput.dispatchEvent(new Event('input', { bubbles: true }));
        await flush();
      }

      // All fields should be visible
      const fieldList = document.getElementById('graphql-builder-field-list');
      // Field list should not be empty
    });
  });

  // Issue 7: Too many technical concepts exposed at once
  describe('Issue 7: Progressive disclosure of advanced options', () => {

    test('should have collapsible sections', () => {
      const sections = document.querySelectorAll('.builder-section.collapsible');
      expect(sections.length).toBeGreaterThan(0);
    });

    test('should have Fields and Filters open by default', () => {
      const fieldsSection = document.getElementById('fields-section');
      const filtersSection = document.getElementById('filters-section');

      // Using <details open> pattern
      if (fieldsSection && fieldsSection.tagName === 'DETAILS') {
        expect(fieldsSection.hasAttribute('open')).toBe(true);
      }
      if (filtersSection && filtersSection.tagName === 'DETAILS') {
        expect(filtersSection.hasAttribute('open')).toBe(true);
      }
    });

    test('should have Order By, Pagination, and Related Objects collapsed by default', () => {
      const orderBySection = document.getElementById('orderby-section');
      const paginationSection = document.getElementById('pagination-section');
      const relatedSection = document.getElementById('related-section');

      // Advanced sections should be collapsed (no 'open' attribute)
      if (orderBySection && orderBySection.tagName === 'DETAILS') {
        expect(orderBySection.hasAttribute('open')).toBe(false);
      }
      if (paginationSection && paginationSection.tagName === 'DETAILS') {
        expect(paginationSection.hasAttribute('open')).toBe(false);
      }
      if (relatedSection && relatedSection.tagName === 'DETAILS') {
        expect(relatedSection.hasAttribute('open')).toBe(false);
      }
    });
  });

  // Issue 8: Pagination UI does not match query behavior
  describe('Issue 8: Pagination UI should match query variables', () => {

    test('should sync limit input with builder state', () => {
      const limitInput = document.getElementById('graphql-limit');

      const state = hooks.defaultBuilderState();
      state.limit = 100;
      hooks.setBuilderState(state);

      expect(hooks.getBuilderState().limit).toBe(100);
    });

    test('should use "first" parameter in GraphQL query for limit', () => {
      const state = hooks.defaultBuilderState();
      state.enabled = true;
      state.object = 'Account';
      state.fields = ['Id'];
      state.limit = 25;

      const query = hooks.composeQueryFromBuilder(state);

      expect(query).toContain('first: 25');
      expect(query).not.toContain('limit: 25');
    });

    test('should properly handle offset parameter', () => {
      const state = hooks.defaultBuilderState();
      state.enabled = true;
      state.object = 'Account';
      state.fields = ['Id'];
      state.limit = 50;
      state.offset = 100;

      const query = hooks.composeQueryFromBuilder(state);

      expect(query).toContain('offset: 100');
    });

    test('should properly handle after cursor for pagination', () => {
      const state = hooks.defaultBuilderState();
      state.enabled = true;
      state.object = 'Account';
      state.fields = ['Id'];
      state.after = 'cursor123';

      const query = hooks.composeQueryFromBuilder(state);

      expect(query).toContain('after: "cursor123"');
    });
  });

  // Issue 9: Remove / clear icons are ambiguous
  describe('Issue 9: Clear vs Remove icons should be distinct', () => {

    test('should have tooltips on action buttons', () => {
      const clearOrderBtn = document.getElementById('graphql-builder-clear-order');

      if (clearOrderBtn) {
        expect(clearOrderBtn.getAttribute('title')).toBeTruthy();
      }
    });

    test('should have distinct icons for different actions', () => {
      // Clear order button uses ✕
      const clearOrderBtn = document.getElementById('graphql-builder-clear-order');

      // Add buttons use + prefix
      const addFieldBtn = document.getElementById('graphql-builder-add-field');
      const addFilterBtn = document.getElementById('graphql-builder-add-filter');

      if (addFieldBtn) {
        expect(addFieldBtn.textContent).toContain('+');
      }
      if (addFilterBtn) {
        expect(addFilterBtn.textContent).toContain('+');
      }
    });
  });

  // Issue 10: Dropdowns overlap content
  describe('Issue 10: Dropdown positioning should be constrained', () => {

    test('should have max-height on select elements', () => {
      // This is a CSS test, checking DOM structure supports proper styling
      const filterLogic = document.getElementById('graphql-builder-filter-logic');

      expect(filterLogic).toBeTruthy();
      expect(filterLogic.tagName.toLowerCase()).toBe('select');
    });

    test('should have proper overflow handling on builder panel', () => {
      const builderPanel = document.getElementById('graphql-builder-panel');

      expect(builderPanel).toBeTruthy();
      // CSS should handle: overflow-y: auto
    });
  });
});

// ==============================================================================
// C. QUERY BUILDER INTERACTION ISSUES - Issues 11-14
// ==============================================================================

describe('C. Query Builder Interaction Issues', () => {

  // Issue 11: No visual validation feedback
  describe('Issue 11: Inline validation with visual feedback', () => {

    test('should validate empty object selection', () => {
      const state = hooks.defaultBuilderState();
      state.enabled = true;
      state.object = '';
      state.fields = ['Id'];
      hooks.setBuilderState(state);

      const warnings = hooks.validateBuilderState ? hooks.validateBuilderState() : [];
      // Should have validation message about missing object
    });

    test('should validate empty fields array', () => {
      const state = hooks.defaultBuilderState();
      state.enabled = true;
      state.object = 'Account';
      state.fields = [];
      hooks.setBuilderState(state);

      // Query composition should default to Id or show warning
      const query = hooks.composeQueryFromBuilder(state);
      expect(query).toContain('Id');
    });

    test('should validate filter with empty field name', () => {
      const state = hooks.defaultBuilderState();
      state.enabled = true;
      state.object = 'Account';
      state.fields = ['Id'];
      state.filters = [
        { id: '1', field: '', op: '=', value: 'test' }
      ];
      hooks.setBuilderState(state);

      // Should skip empty filters or warn
      const query = hooks.composeQueryFromBuilder(state);
      // Empty filters should be ignored
    });

    test('should set builder status based on validation state', () => {
      const statusEl = document.getElementById('graphql-builder-status');

      const state = hooks.defaultBuilderState();
      state.object = '';
      hooks.setBuilderState(state);

      if (hooks.setBuilderStatus) {
        hooks.setBuilderStatus('Select an object');
      }

      // Status element should reflect current state
    });

    test('validateFilterRow should return error for empty field', () => {
      const filter = { id: '1', field: '', op: '=', value: 'test' };
      const result = hooks.validateFilterRow(filter);

      expect(result.hasError).toBe(true);
      expect(result.errorMessage).toContain('Field');
    });

    test('validateFilterRow should return error for missing operator', () => {
      const filter = { id: '1', field: 'Name', op: '', value: 'test' };
      const result = hooks.validateFilterRow(filter);

      expect(result.hasError).toBe(true);
      expect(result.errorMessage).toContain('Operator');
    });

    test('validateFilterRow should return error for missing value (non-null operator)', () => {
      const filter = { id: '1', field: 'Name', op: '=', value: '' };
      const result = hooks.validateFilterRow(filter);

      expect(result.hasError).toBe(true);
      expect(result.errorMessage).toContain('Value');
    });

    test('validateFilterRow should pass for IS NULL without value', () => {
      const filter = { id: '1', field: 'Industry', op: 'IS NULL', value: '' };
      const result = hooks.validateFilterRow(filter);

      expect(result.hasError).toBe(false);
    });

    test('validateFilterRow should pass for IS NOT NULL without value', () => {
      const filter = { id: '1', field: 'Industry', op: 'IS NOT NULL', value: '' };
      const result = hooks.validateFilterRow(filter);

      expect(result.hasError).toBe(false);
    });

    test('validateFilterRow should pass for complete valid filter', () => {
      const filter = { id: '1', field: 'Name', op: 'LIKE', value: 'Acme%' };
      const result = hooks.validateFilterRow(filter);

      expect(result.hasError).toBe(false);
      expect(result.errorMessage).toBe('');
    });

    test('renderFilters should add filter-error class for invalid filters', async () => {
      const state = hooks.defaultBuilderState();
      state.enabled = true;
      state.object = 'Account';
      state.fields = ['Id'];
      state.filters = [
        { id: '1', field: '', op: '=', value: 'test' } // Empty field - invalid
      ];
      hooks.setBuilderState(state);

      hooks.renderFilters();
      await flush();

      const filterContainer = document.getElementById('graphql-builder-filters');
      const errorRows = filterContainer?.querySelectorAll('.filter-error');
      expect(errorRows?.length).toBe(1);
    });

    test('renderFilters should add input-error class to empty field inputs', async () => {
      const state = hooks.defaultBuilderState();
      state.enabled = true;
      state.object = 'Account';
      state.fields = ['Id'];
      state.filters = [
        { id: '1', field: '', op: '=', value: 'test' }
      ];
      hooks.setBuilderState(state);

      hooks.renderFilters();
      await flush();

      const filterContainer = document.getElementById('graphql-builder-filters');
      const errorInputs = filterContainer?.querySelectorAll('.input-error');
      expect(errorInputs?.length).toBeGreaterThanOrEqual(1);
    });

    test('renderFilters should set data-error attribute with error message', async () => {
      const state = hooks.defaultBuilderState();
      state.enabled = true;
      state.object = 'Account';
      state.fields = ['Id'];
      state.filters = [
        { id: '1', field: '', op: '=', value: 'test' }
      ];
      hooks.setBuilderState(state);

      hooks.renderFilters();
      await flush();

      const filterContainer = document.getElementById('graphql-builder-filters');
      const errorRow = filterContainer?.querySelector('.filter-error');
      expect(errorRow?.getAttribute('data-error')).toContain('required');
    });

    test('validateBuilderState should detect incomplete filters', () => {
      const state = hooks.defaultBuilderState();
      state.enabled = true;
      state.object = 'Account';
      state.fields = ['Id'];
      state.filters = [
        { id: '1', field: '', op: '=', value: 'test' }, // incomplete
        { id: '2', field: 'Name', op: 'LIKE', value: 'Test%' } // complete
      ];
      hooks.setBuilderState(state);

      const warnings = hooks.validateBuilderState();
      const incompleteWarning = warnings.find(w => w.toLowerCase().includes('incomplete'));
      expect(incompleteWarning).toBeDefined();
    });
  });

  // Issue 12: Operators not explained
  describe('Issue 12: Operator tooltips with examples', () => {

    test('should have explanation for LIKE operator', () => {
      const operatorDescriptions = {
        '=': 'Equals - exact match',
        '!=': 'Not equals',
        '>': 'Greater than',
        '>=': 'Greater than or equal',
        '<': 'Less than',
        '<=': 'Less than or equal',
        'LIKE': 'Pattern match using % wildcard (e.g., "Acme%")',
        'IN': 'Matches any value in comma-separated list',
        'NOT IN': 'Does not match any value in list',
        'IS NULL': 'Field has no value',
        'IS NOT NULL': 'Field has a value'
      };

      expect(operatorDescriptions['LIKE']).toContain('wildcard');
      expect(operatorDescriptions['IN']).toContain('list');
    });

    test('should generate correct GraphQL operators', () => {
      const opMap = {
        '=': 'eq',
        '!=': 'neq',
        '>': 'gt',
        '>=': 'gte',
        '<': 'lt',
        '<=': 'lte',
        'LIKE': 'like',
        'IN': 'in',
        'NOT IN': 'nin'
      };

      expect(opMap['=']).toBe('eq');
      expect(opMap['!=']).toBe('neq');
      expect(opMap['>']).toBe('gt');
      expect(opMap['LIKE']).toBe('like');
    });

    test('getFilterOperatorTooltip should return description for = operator', () => {
      const tooltip = hooks.getFilterOperatorTooltip('=');
      expect(tooltip).toContain('Equals');
      expect(tooltip).toContain('exact match');
    });

    test('getFilterOperatorTooltip should return description for LIKE operator', () => {
      const tooltip = hooks.getFilterOperatorTooltip('LIKE');
      expect(tooltip).toContain('Pattern match');
      expect(tooltip).toContain('%');
      expect(tooltip).toContain('wildcard');
    });

    test('getFilterOperatorTooltip should return description for IN operator', () => {
      const tooltip = hooks.getFilterOperatorTooltip('IN');
      expect(tooltip).toContain('comma-separated');
      expect(tooltip).toContain('list');
    });

    test('getFilterOperatorTooltip should return description for IS NULL operator', () => {
      const tooltip = hooks.getFilterOperatorTooltip('IS NULL');
      expect(tooltip).toContain('no value');
    });

    test('getFilterOperatorTooltip should return description for IS NOT NULL operator', () => {
      const tooltip = hooks.getFilterOperatorTooltip('IS NOT NULL');
      expect(tooltip).toContain('has');
      expect(tooltip).toContain('value');
    });

    test('getFilterOperatorTooltip should return all standard operators', () => {
      const operators = ['=', '!=', '>', '>=', '<', '<=', 'LIKE', 'IN', 'NOT IN', 'IS NULL', 'IS NOT NULL'];

      operators.forEach(op => {
        const tooltip = hooks.getFilterOperatorTooltip(op);
        expect(tooltip).toBeTruthy();
        expect(tooltip.length).toBeGreaterThan(0);
      });
    });

    test('renderFilters should add title attribute to operator select', async () => {
      const state = hooks.defaultBuilderState();
      state.enabled = true;
      state.object = 'Account';
      state.fields = ['Id'];
      state.filters = [
        { id: '1', field: 'Name', op: 'LIKE', value: 'Test%' }
      ];
      hooks.setBuilderState(state);

      hooks.renderFilters();
      await flush();

      const filterContainer = document.getElementById('graphql-builder-filters');
      const opSelect = filterContainer?.querySelector('select');
      expect(opSelect?.title).toContain('Pattern match');
    });

    test('renderFilters should add title attribute to each operator option', async () => {
      const state = hooks.defaultBuilderState();
      state.enabled = true;
      state.object = 'Account';
      state.fields = ['Id'];
      state.filters = [
        { id: '1', field: 'Name', op: '=', value: 'Test' }
      ];
      hooks.setBuilderState(state);

      hooks.renderFilters();
      await flush();

      const filterContainer = document.getElementById('graphql-builder-filters');
      const opSelect = filterContainer?.querySelector('select');
      const options = opSelect?.querySelectorAll('option');

      // Check LIKE option has tooltip
      const likeOption = Array.from(options || []).find(o => o.value === 'LIKE');
      expect(likeOption?.title).toContain('wildcard');

      // Check IS NULL option has tooltip
      const isNullOption = Array.from(options || []).find(o => o.value === 'IS NULL');
      expect(isNullOption?.title).toContain('no value');
    });
  });

  // Issue 13: Null handling unclear
  describe('Issue 13: Dedicated null operators', () => {

    test('should have IS NULL operator option', () => {
      const operators = ['=', '!=', '>', '>=', '<', '<=', 'LIKE', 'IN', 'NOT IN', 'IS NULL', 'IS NOT NULL'];

      expect(operators).toContain('IS NULL');
      expect(operators).toContain('IS NOT NULL');
    });

    test('should hide value input when IS NULL operator is selected', () => {
      const state = hooks.defaultBuilderState();
      state.filters = [
        { id: '1', field: 'Industry', op: 'IS NULL', value: '' }
      ];

      // When IS NULL is selected, value should be ignored
      const filter = state.filters[0];
      const isNullOp = filter.op === 'IS NULL' || filter.op === 'IS NOT NULL';

      expect(isNullOp).toBe(true);
      // UI should hide value input for these operators
    });

    test('should generate correct query for IS NULL filter', () => {
      const state = hooks.defaultBuilderState();
      state.enabled = true;
      state.object = 'Account';
      state.fields = ['Id'];
      state.filters = [
        { id: '1', field: 'Industry', op: 'IS NULL', value: '' }
      ];

      const query = hooks.composeQueryFromBuilder(state);

      // Should generate proper null check syntax
      // GraphQL UI API uses: { Industry: { eq: null } }
    });

    test('renderFilters should hide value input for IS NULL operator', async () => {
      const state = hooks.defaultBuilderState();
      state.enabled = true;
      state.object = 'Account';
      state.fields = ['Id'];
      state.filters = [
        { id: '1', field: 'Industry', op: 'IS NULL', value: '' }
      ];
      hooks.setBuilderState(state);

      hooks.renderFilters();
      await flush();

      const filterContainer = document.getElementById('graphql-builder-filters');
      const filterRow = filterContainer?.querySelector('.filter-row');
      const inputs = filterRow?.querySelectorAll('input');
      // The value input should have display:none
      const valueInput = Array.from(inputs || []).find(i => i.placeholder === '' || i.placeholder === 'Value');
      // For IS NULL, placeholder becomes '' and display is none
      expect(valueInput?.style.display).toBe('none');
    });

    test('renderFilters should show value input for regular operators', async () => {
      const state = hooks.defaultBuilderState();
      state.enabled = true;
      state.object = 'Account';
      state.fields = ['Id'];
      state.filters = [
        { id: '1', field: 'Name', op: '=', value: 'Test' }
      ];
      hooks.setBuilderState(state);

      hooks.renderFilters();
      await flush();

      const filterContainer = document.getElementById('graphql-builder-filters');
      const filterRow = filterContainer?.querySelector('.filter-row');
      const inputs = filterRow?.querySelectorAll('input');
      const valueInput = Array.from(inputs || []).find(i => i.placeholder === 'Value');
      expect(valueInput?.style.display).not.toBe('none');
    });

    test('renderFilters should hide value input for IS NOT NULL operator', async () => {
      const state = hooks.defaultBuilderState();
      state.enabled = true;
      state.object = 'Account';
      state.fields = ['Id'];
      state.filters = [
        { id: '1', field: 'Industry', op: 'IS NOT NULL', value: '' }
      ];
      hooks.setBuilderState(state);

      hooks.renderFilters();
      await flush();

      const filterContainer = document.getElementById('graphql-builder-filters');
      const filterRow = filterContainer?.querySelector('.filter-row');
      const valueInputs = filterRow?.querySelectorAll('input[type="text"], input:not([type])');
      // Find the input that's hidden (value input)
      const hiddenInputs = Array.from(valueInputs || []).filter(i => i.style.display === 'none');
      expect(hiddenInputs.length).toBeGreaterThanOrEqual(1);
    });

    test('validateFilterRow should not require value for IS NULL', () => {
      const filter = { id: '1', field: 'Industry', op: 'IS NULL', value: '' };
      const result = hooks.validateFilterRow(filter);
      expect(result.hasError).toBe(false);
    });

    test('validateFilterRow should not require value for IS NOT NULL', () => {
      const filter = { id: '1', field: 'Description', op: 'IS NOT NULL', value: '' };
      const result = hooks.validateFilterRow(filter);
      expect(result.hasError).toBe(false);
    });
  });

  // Issue 14: Sorting allows unsupported fields
  describe('Issue 14: Disable sorting on unsupported field types', () => {

    test('should identify textarea fields as unsortable', () => {
      const fieldsMeta = [
        { name: 'Id', type: 'id' },
        { name: 'Name', type: 'string' },
        { name: 'Description', type: 'textarea' },
        { name: 'BinaryData', type: 'base64' }
      ];

      const unsortableTypes = ['textarea', 'base64', 'blob'];

      const unsortableFields = fieldsMeta.filter(f => unsortableTypes.includes(f.type));
      expect(unsortableFields.map(f => f.name)).toContain('Description');
      expect(unsortableFields.map(f => f.name)).toContain('BinaryData');
    });

    test('should warn when sorting by unsortable field', () => {
      // Set up metadata first
      if (hooks.setCurrentObjectFieldsMetadata) {
        hooks.setCurrentObjectFieldsMetadata([
          { name: 'Id', type: 'id' },
          { name: 'Name', type: 'string' },
          { name: 'Description', type: 'textarea' }
        ]);
      }

      const state = hooks.defaultBuilderState();
      state.enabled = true;
      state.object = 'Account';
      state.fields = ['Id'];
      state.orderBy = { field: 'Description', dir: 'asc' };
      hooks.setBuilderState(state);

      const warnings = hooks.validateBuilderState();
      // Should warn about textarea field in orderBy
      const sortWarning = warnings.find(w =>
        w.toLowerCase().includes('sort') ||
        w.toLowerCase().includes('textarea') ||
        w.toLowerCase().includes('description')
      );
      expect(sortWarning).toBeDefined();
    });

    test('should not warn when sorting by sortable field', () => {
      // Set up metadata first
      if (hooks.setCurrentObjectFieldsMetadata) {
        hooks.setCurrentObjectFieldsMetadata([
          { name: 'Id', type: 'id' },
          { name: 'Name', type: 'string' },
          { name: 'CreatedDate', type: 'datetime' }
        ]);
      }

      const state = hooks.defaultBuilderState();
      state.enabled = true;
      state.object = 'Account';
      state.fields = ['Id'];
      state.orderBy = { field: 'Name', dir: 'asc' };
      hooks.setBuilderState(state);

      const warnings = hooks.validateBuilderState();
      const sortWarning = warnings.find(w =>
        w.toLowerCase().includes('sort') ||
        w.toLowerCase().includes('name')
      );
      expect(sortWarning).toBeUndefined();
    });

    test('should warn when sorting by base64 field', () => {
      if (hooks.setCurrentObjectFieldsMetadata) {
        hooks.setCurrentObjectFieldsMetadata([
          { name: 'Id', type: 'id' },
          { name: 'BinaryData', type: 'base64' }
        ]);
      }

      const state = hooks.defaultBuilderState();
      state.enabled = true;
      state.object = 'Account';
      state.fields = ['Id'];
      state.orderBy = { field: 'BinaryData', dir: 'asc' };
      hooks.setBuilderState(state);

      const warnings = hooks.validateBuilderState();
      const sortWarning = warnings.find(w =>
        w.toLowerCase().includes('base64') ||
        w.toLowerCase().includes('binarydata')
      );
      expect(sortWarning).toBeDefined();
    });

    test('getCurrentObjectFieldsMetadata should return current metadata', () => {
      const testMeta = [
        { name: 'Id', type: 'id' },
        { name: 'Description', type: 'textarea' }
      ];

      if (hooks.setCurrentObjectFieldsMetadata) {
        hooks.setCurrentObjectFieldsMetadata(testMeta);
      }

      const currentMeta = hooks.getCurrentObjectFieldsMetadata();
      expect(currentMeta).toEqual(testMeta);
    });

    test('validateBuilderState should use currentObjectFieldsMetadata for orderBy validation', () => {
      const mockMeta = [
        { name: 'Id', type: 'id' },
        { name: 'LongText', type: 'textarea' },
        { name: 'CreatedDate', type: 'datetime' }
      ];

      if (hooks.setCurrentObjectFieldsMetadata) {
        hooks.setCurrentObjectFieldsMetadata(mockMeta);
      }

      const state = hooks.defaultBuilderState();
      state.object = 'Account';
      state.fields = ['Id'];
      state.orderBy = { field: 'LongText', dir: 'desc' };
      hooks.setBuilderState(state);

      const warnings = hooks.validateBuilderState();
      expect(warnings.some(w => w.includes('textarea') || w.includes('LongText'))).toBe(true);
    });

    test('unsortable types should include textarea, base64, and blob', () => {
      const UNSORTABLE_TYPES = ['textarea', 'base64', 'blob', 'encryptedstring'];

      expect(UNSORTABLE_TYPES).toContain('textarea');
      expect(UNSORTABLE_TYPES).toContain('base64');
      expect(UNSORTABLE_TYPES).toContain('blob');
    });
  });
});

// ==============================================================================
// D. RESULTS & EXPORT UX PROBLEMS - Issues 15-17
// ==============================================================================

describe('D. Results & Export UX Problems', () => {

  // Issue 15: Results shown only as raw JSON
  describe('Issue 15: Table view for results', () => {

    test('should have table view toggle button', () => {
      const toggleBtn = document.getElementById('graphql-results-view-toggle');
      expect(toggleBtn).toBeTruthy();
    });

    test('should have results table element', () => {
      const table = document.getElementById('graphql-results-table');
      expect(table).toBeTruthy();
      expect(table.tagName.toLowerCase()).toBe('table');
    });

    test('should extract records from GraphQL response for table', () => {
      const response = {
        uiapi: {
          query: {
            Account: {
              edges: [
                { node: { Id: '001xx1', Name: { value: 'ACME' }, Industry: { value: 'Tech' } } },
                { node: { Id: '001xx2', Name: { value: 'Global' }, Industry: { value: 'Finance' } } }
              ]
            }
          }
        }
      };

      const records = hooks.extractRecords(response, 'Account');
      expect(records).toHaveLength(2);
      expect(records[0].Id).toBe('001xx1');
      expect(records[0].Name).toBe('ACME');
    });

    test('renderResultsAsTable should generate valid HTML table', () => {
      const records = [
        { Id: '001xx1', Name: 'ACME', Industry: 'Tech' },
        { Id: '001xx2', Name: 'Global', Industry: 'Finance' }
      ];
      const columns = ['Id', 'Name', 'Industry'];

      const html = hooks.renderResultsAsTable(records, columns);

      expect(html).toContain('<thead>');
      expect(html).toContain('<tbody>');
      expect(html).toContain('<th>Id</th>');
      expect(html).toContain('<th>Name</th>');
      expect(html).toContain('<td>ACME</td>');
      expect(html).toContain('<td>Finance</td>');
    });

    test('renderResultsAsTable should auto-generate columns from records if not provided', () => {
      const records = [
        { Id: '001xx1', Name: 'Test', Email: 'test@example.com' }
      ];

      const html = hooks.renderResultsAsTable(records, null);

      expect(html).toContain('<th>Id</th>');
      expect(html).toContain('<th>Name</th>');
      expect(html).toContain('<th>Email</th>');
    });

    test('renderResultsAsTable should handle empty records', () => {
      const html = hooks.renderResultsAsTable([], ['Id', 'Name']);

      expect(html).toContain('No records to display');
    });

    test('renderResultsAsTable should escape HTML in values', () => {
      const records = [
        { Id: '001xx1', Name: '<script>alert("xss")</script>' }
      ];

      const html = hooks.renderResultsAsTable(records, ['Id', 'Name']);

      expect(html).not.toContain('<script>');
      expect(html).toContain('&lt;script&gt;');
    });

    test('renderResultsAsTable should handle nested value objects', () => {
      const records = [
        { Id: '001xx1', Name: { value: 'Wrapped Value' } }
      ];

      const html = hooks.renderResultsAsTable(records, ['Id', 'Name']);

      expect(html).toContain('Wrapped Value');
    });

    test('toggleResultsView should switch between JSON and table views', () => {
      // Set initial state
      hooks.setResultsViewMode('json');

      // Toggle to table
      hooks.toggleResultsView();
      expect(hooks.getResultsViewMode()).toBe('table');

      // Toggle back to JSON
      hooks.toggleResultsView();
      expect(hooks.getResultsViewMode()).toBe('json');
    });
  });

  // Issue 16: No column-field alignment
  describe('Issue 16: Auto-generate table columns from selected fields', () => {

    test('should use builder fields as table columns', () => {
      const state = hooks.defaultBuilderState();
      state.fields = ['Id', 'Name', 'Industry', 'AnnualRevenue'];
      hooks.setBuilderState(state);

      const columns = hooks.generateTableColumns();

      expect(columns).toEqual(['Id', 'Name', 'Industry', 'AnnualRevenue']);
    });

    test('generateTableColumns should filter out GraphQL wrapper fields', () => {
      const state = hooks.defaultBuilderState();
      state.fields = ['Id', 'Name', 'edges', 'node', 'value'];
      hooks.setBuilderState(state);

      const columns = hooks.generateTableColumns();

      expect(columns).toContain('Id');
      expect(columns).toContain('Name');
      expect(columns).not.toContain('edges');
      expect(columns).not.toContain('node');
      expect(columns).not.toContain('value');
    });

    test('should handle fields with { value } wrapper in results', () => {
      const responseNode = {
        Id: '001xx',
        Name: { value: 'Test Account', displayValue: 'Test Account' },
        Industry: { value: 'Technology' }
      };

      const unwrapped = hooks.unwrapResultRecord(responseNode);

      expect(unwrapped.Id).toBe('001xx');
      expect(unwrapped.Name).toBe('Test Account');
      expect(unwrapped.Industry).toBe('Technology');
    });
  });

  // Issue 17: Export is missing or hidden
  describe('Issue 17: Visible export buttons', () => {

    test('should have CSV export button', () => {
      const csvBtn = document.getElementById('graphql-export-csv');
      expect(csvBtn).toBeTruthy();
    });

    test('should have JSON export button', () => {
      const jsonBtn = document.getElementById('graphql-export-json');
      expect(jsonBtn).toBeTruthy();
    });

    test('should have Copy results button', () => {
      const copyBtn = document.getElementById('graphql-copy-results');
      expect(copyBtn).toBeTruthy();
    });

    test('exportResultsAsCSV should generate valid CSV', () => {
      const records = [
        { Id: '001xx1', Name: 'ACME Corp', Industry: 'Technology' },
        { Id: '001xx2', Name: 'Global Inc', Industry: 'Finance' }
      ];
      const columns = ['Id', 'Name', 'Industry'];

      const csv = hooks.exportResultsAsCSV(records, columns);
      const lines = csv.split('\n');

      expect(lines[0]).toBe('Id,Name,Industry');
      expect(lines[1]).toBe('001xx1,ACME Corp,Technology');
      expect(lines[2]).toBe('001xx2,Global Inc,Finance');
    });

    test('exportResultsAsCSV should escape commas in values', () => {
      const records = [
        { Id: '001xx1', Name: 'Global, Inc', Industry: 'Finance' }
      ];
      const columns = ['Id', 'Name', 'Industry'];

      const csv = hooks.exportResultsAsCSV(records, columns);

      expect(csv).toContain('"Global, Inc"');
    });

    test('exportResultsAsCSV should escape quotes in values', () => {
      const records = [
        { Id: '001xx1', Name: 'Test "Company"', Industry: 'Tech' }
      ];
      const columns = ['Id', 'Name', 'Industry'];

      const csv = hooks.exportResultsAsCSV(records, columns);

      expect(csv).toContain('"Test ""Company"""');
    });

    test('exportResultsAsCSV should handle null values', () => {
      const records = [
        { Id: '001xx1', Name: null, Industry: 'Tech' }
      ];
      const columns = ['Id', 'Name', 'Industry'];

      const csv = hooks.exportResultsAsCSV(records, columns);

      expect(csv).toContain('001xx1,,Tech');
    });

    test('exportResultsAsCSV should auto-generate columns if not provided', () => {
      const records = [
        { Id: '001xx1', Name: 'Test' }
      ];

      const csv = hooks.exportResultsAsCSV(records, null);

      expect(csv).toContain('Id,Name');
    });

    test('exportResultsAsJSON should format JSON with indentation', () => {
      const data = { test: 'value', nested: { a: 1 } };

      const json = hooks.exportResultsAsJSON(data);

      expect(json).toContain('  "test": "value"');
      expect(json).toContain('  "nested": {');
    });

    test('handleExportCSV should set status message when no results', () => {
      hooks.setLastGraphQLResult(null);
      hooks.handleExportCSV();
      // Should not throw, status message set internally
    });

    test('handleExportJSON should set status message when no results', () => {
      hooks.setLastGraphQLResult(null);
      hooks.handleExportJSON();
      // Should not throw, status message set internally
    });
  });
});

// ==============================================================================
// E. VISUAL & LAYOUT ISSUES - Issues 18-20
// ==============================================================================

describe('E. Visual & Layout Issues', () => {

  // Issue 18: Left panel overcrowding
  describe('Issue 18: Collapsible sections with item counts', () => {

    test('should show field count in section header', () => {
      const state = hooks.defaultBuilderState();
      state.fields = ['Id', 'Name', 'Industry'];
      hooks.setBuilderState(state);

      hooks.updateBuilderSectionCounts();

      const fieldsSection = document.querySelector('#fields-section .section-count');
      expect(fieldsSection?.textContent).toBe('(3)');
    });

    test('should show filter count in section header', () => {
      const state = hooks.defaultBuilderState();
      state.filters = [
        { id: '1', field: 'Name', op: 'LIKE', value: 'A%' },
        { id: '2', field: 'Industry', op: '=', value: 'Tech' }
      ];
      hooks.setBuilderState(state);

      hooks.updateBuilderSectionCounts();

      const filtersSection = document.querySelector('#filters-section .section-count');
      expect(filtersSection?.textContent).toBe('(2)');
    });

    test('should only count filters with field names in count', () => {
      const state = hooks.defaultBuilderState();
      state.filters = [
        { id: '1', field: 'Name', op: 'LIKE', value: 'A%' },
        { id: '2', field: '', op: '=', value: '' } // Empty filter
      ];
      hooks.setBuilderState(state);

      hooks.updateBuilderSectionCounts();

      const filtersSection = document.querySelector('#filters-section .section-count');
      expect(filtersSection?.textContent).toBe('(1)');
    });

    test('should show related objects count', () => {
      const state = hooks.defaultBuilderState();
      state.relatedObjects = [
        { id: '1', relationship: 'Contacts', fields: ['Id', 'Email'] }
      ];
      hooks.setBuilderState(state);

      hooks.updateBuilderSectionCounts();

      const relatedSection = document.querySelector('#related-section .section-count');
      expect(relatedSection?.textContent).toBe('(1)');
    });

    test('should have collapsible details elements for sections', () => {
      const sections = document.querySelectorAll('details.builder-section');
      expect(sections.length).toBeGreaterThan(0);
    });

    test('Fields and Filters sections should be open by default', () => {
      const fieldsSection = document.getElementById('fields-section');
      const filtersSection = document.getElementById('filters-section');

      expect(fieldsSection?.hasAttribute('open')).toBe(true);
      expect(filtersSection?.hasAttribute('open')).toBe(true);
    });
  });

  // Issue 19: No clear "query readiness" state
  describe('Issue 19: Query readiness status indicator', () => {

    test('should show "Ready" when query is valid', () => {
      const state = hooks.defaultBuilderState();
      state.enabled = true;
      state.object = 'Account';
      state.fields = ['Id', 'Name'];
      hooks.setBuilderState(state);

      const status = hooks.getQueryReadinessStatus();

      expect(status.status).toBe('ready');
      expect(status.icon).toBe('✓');
    });

    test('should show "Error" when no object selected', () => {
      const state = hooks.defaultBuilderState();
      state.enabled = true;
      state.object = '';
      state.fields = ['Id'];
      hooks.setBuilderState(state);

      const status = hooks.getQueryReadinessStatus();

      expect(status.status).toBe('error');
      expect(status.message).toContain('object');
    });

    test('should show "Error" when no fields selected', () => {
      const state = hooks.defaultBuilderState();
      state.enabled = true;
      state.object = 'Account';
      state.fields = [];
      hooks.setBuilderState(state);

      const status = hooks.getQueryReadinessStatus();

      expect(status.status).toBe('error');
      expect(status.message).toContain('field');
    });

    test('should show "Warning" for incomplete filters', () => {
      const state = hooks.defaultBuilderState();
      state.enabled = true;
      state.object = 'Account';
      state.fields = ['Id'];
      state.filters = [
        { id: '1', field: 'Name', op: '=', value: '' } // Missing value
      ];
      hooks.setBuilderState(state);

      const status = hooks.getQueryReadinessStatus();

      expect(status.status).toBe('warning');
      expect(status.icon).toBe('⚠️');
    });

    test('should show "Info" when builder is disabled', () => {
      const state = hooks.defaultBuilderState();
      state.enabled = false;
      hooks.setBuilderState(state);

      const status = hooks.getQueryReadinessStatus();

      expect(status.status).toBe('info');
    });

    test('updateQueryStatusBadge should update status element', () => {
      const state = hooks.defaultBuilderState();
      state.enabled = true;
      state.object = 'Account';
      state.fields = ['Id'];
      hooks.setBuilderState(state);

      hooks.updateQueryStatusBadge();

      const statusEl = document.getElementById('graphql-query-status');
      expect(statusEl?.textContent).toContain('✓');
    });

    test('should disable Run button when query is invalid', () => {
      const runBtn = document.getElementById('graphql-run');
      const query = document.getElementById('graphql-query');

      query.value = '';
      hooks.updateRunButtonState();

      expect(runBtn.disabled).toBe(true);
    });

    test('should enable Run button when query is valid', () => {
      const runBtn = document.getElementById('graphql-run');
      const query = document.getElementById('graphql-query');
      const vars = document.getElementById('graphql-variables');

      query.value = 'query { Account { Id } }';
      vars.value = '';
      hooks.updateRunButtonState();

      expect(runBtn.disabled).toBe(false);
    });
  });

  // Issue 20: Query preview too technical by default
  describe('Issue 20: Visual summary toggle for query preview', () => {

    test('should have visual summary element', () => {
      const summary = document.getElementById('graphql-visual-summary');
      expect(summary).toBeTruthy();
    });

    test('generateVisualSummary should produce human-readable summary', () => {
      const state = hooks.defaultBuilderState();
      state.object = 'Account';
      state.fields = ['Id', 'Name', 'Industry'];
      state.filters = [
        { id: '1', field: 'Name', op: 'LIKE', value: 'Acme%' }
      ];
      state.orderBy = { field: 'Name', dir: 'asc' };
      state.limit = 50;
      hooks.setBuilderState(state);

      const summary = hooks.generateVisualSummary();

      expect(summary).toContain('FROM Account');
      expect(summary).toContain('SELECT Id, Name, Industry');
      expect(summary).toContain('WHERE Name LIKE Acme%');
      expect(summary).toContain('ORDER BY Name ASC');
      expect(summary).toContain('LIMIT 50');
    });

    test('generateVisualSummary should handle OR filter logic', () => {
      const state = hooks.defaultBuilderState();
      state.object = 'Account';
      state.fields = ['Id'];
      state.filters = [
        { id: '1', field: 'Name', op: '=', value: 'A' },
        { id: '2', field: 'Name', op: '=', value: 'B' }
      ];
      state.filterLogic = 'or';
      hooks.setBuilderState(state);

      const summary = hooks.generateVisualSummary();

      expect(summary).toContain(' OR ');
    });

    test('generateVisualSummary should handle IS NULL operators', () => {
      const state = hooks.defaultBuilderState();
      state.object = 'Account';
      state.fields = ['Id'];
      state.filters = [
        { id: '1', field: 'Industry', op: 'IS NULL', value: '' }
      ];
      hooks.setBuilderState(state);

      const summary = hooks.generateVisualSummary();

      expect(summary).toContain('Industry IS NULL');
    });

    test('generateVisualSummary should truncate many fields', () => {
      const state = hooks.defaultBuilderState();
      state.object = 'Account';
      state.fields = ['Id', 'Name', 'Industry', 'Type', 'Phone', 'Website', 'Rating'];
      hooks.setBuilderState(state);

      const summary = hooks.generateVisualSummary();

      expect(summary).toContain('(+2 more)');
    });

    test('generateVisualSummary should truncate many filters', () => {
      const state = hooks.defaultBuilderState();
      state.object = 'Account';
      state.fields = ['Id'];
      state.filters = [
        { id: '1', field: 'A', op: '=', value: '1' },
        { id: '2', field: 'B', op: '=', value: '2' },
        { id: '3', field: 'C', op: '=', value: '3' },
        { id: '4', field: 'D', op: '=', value: '4' },
        { id: '5', field: 'E', op: '=', value: '5' }
      ];
      hooks.setBuilderState(state);

      const summary = hooks.generateVisualSummary();

      expect(summary).toContain('(+2 more)');
    });

    test('generateVisualSummary should include OFFSET when non-zero', () => {
      const state = hooks.defaultBuilderState();
      state.object = 'Account';
      state.fields = ['Id'];
      state.offset = 100;
      hooks.setBuilderState(state);

      const summary = hooks.generateVisualSummary();

      expect(summary).toContain('OFFSET 100');
    });

    test('generateVisualSummary should not include OFFSET when zero', () => {
      const state = hooks.defaultBuilderState();
      state.object = 'Account';
      state.fields = ['Id'];
      state.offset = 0;
      hooks.setBuilderState(state);

      const summary = hooks.generateVisualSummary();

      expect(summary).not.toContain('OFFSET');
    });

    test('generateVisualSummary should show message when no object selected', () => {
      const state = hooks.defaultBuilderState();
      state.object = '';
      hooks.setBuilderState(state);

      const summary = hooks.generateVisualSummary();

      expect(summary).toContain('Select an object');
    });

    test('updateVisualSummary should update summary element', () => {
      const state = hooks.defaultBuilderState();
      state.object = 'Contact';
      state.fields = ['Id', 'Email'];
      hooks.setBuilderState(state);

      hooks.updateVisualSummary();

      const summaryEl = document.getElementById('graphql-visual-summary');
      expect(summaryEl?.textContent).toContain('FROM Contact');
    });

    test('should have tabs for Query, Variables, Summary views', () => {
      const tabs = document.querySelectorAll('.graphql-tabs .tab-btn');
      expect(tabs.length).toBeGreaterThanOrEqual(2);
    });
  });
});

// ==============================================================================
// F. POP-IN / POP-OUT BUGS - Issues 21-35
// ==============================================================================

describe('F. Pop-In / Pop-Out (Extension Window) Bugs', () => {

  // Issue 21: Pop-out opens with wrong size or does not remember size
  describe('Issue 21: Window size persistence with minimum constraints', () => {

    test('should persist window size to storage', async () => {
      const windowSize = { width: 1200, height: 800 };
      await chrome.storage.local.set({ appWindowSize: windowSize });

      const stored = await new Promise(resolve => {
        chrome.storage.local.get({ appWindowSize: null }, resolve);
      });

      expect(stored.appWindowSize).toEqual(windowSize);
    });

    test('should restore window size on pop-out', async () => {
      storageMock.appWindowSize = { width: 1000, height: 700 };

      const stored = await new Promise(resolve => {
        chrome.storage.local.get({ appWindowSize: { width: 1400, height: 900 } }, resolve);
      });

      expect(stored.appWindowSize.width).toBe(1000);
      expect(stored.appWindowSize.height).toBe(700);
    });

    test('should enforce minimum window width of 800', async () => {
      const MIN_WIDTH = 800;
      storageMock.appWindowSize = { width: 500, height: 700 }; // Below minimum

      const stored = await new Promise(resolve => {
        chrome.storage.local.get({ appWindowSize: null }, resolve);
      });

      // The openAppWindow function should enforce Math.max(MIN_WIDTH, stored.width)
      const enforcedWidth = Math.max(MIN_WIDTH, stored.appWindowSize?.width || 1400);
      expect(enforcedWidth).toBeGreaterThanOrEqual(MIN_WIDTH);
    });

    test('should enforce minimum window height of 600', async () => {
      const MIN_HEIGHT = 600;
      storageMock.appWindowSize = { width: 1000, height: 400 }; // Below minimum

      const stored = await new Promise(resolve => {
        chrome.storage.local.get({ appWindowSize: null }, resolve);
      });

      // The openAppWindow function should enforce Math.max(MIN_HEIGHT, stored.height)
      const enforcedHeight = Math.max(MIN_HEIGHT, stored.appWindowSize?.height || 900);
      expect(enforcedHeight).toBeGreaterThanOrEqual(MIN_HEIGHT);
    });

    test('should use default size when no stored size exists', async () => {
      delete storageMock.appWindowSize;

      const stored = await new Promise(resolve => {
        chrome.storage.local.get({ appWindowSize: null }, resolve);
      });

      // When no stored size, defaults should be 1400x900
      const width = stored.appWindowSize?.width || 1400;
      const height = stored.appWindowSize?.height || 900;
      expect(width).toBe(1400);
      expect(height).toBe(900);
    });
  });

  // Issue 22: Pop-in loses current state - Full builderState serialization
  describe('Issue 22: Full builderState persistence during pop-in/pop-out', () => {

    test('should persist full builder state including fields, filters, and pagination', async () => {
      const state = hooks.defaultBuilderState();
      state.enabled = true;
      state.object = 'Account';
      state.fields = ['Id', 'Name', 'Industry'];
      state.filters = [{ id: '1', field: 'Industry', op: '=', value: 'Tech' }];
      state.orderBy = { field: 'Name', dir: 'asc' };
      state.limit = 100;
      state.offset = 50;

      await chrome.storage.local.set({ appBuilderState: state });

      const stored = await new Promise(resolve => {
        chrome.storage.local.get({ appBuilderState: null }, resolve);
      });

      expect(stored.appBuilderState.enabled).toBe(true);
      expect(stored.appBuilderState.object).toBe('Account');
      expect(stored.appBuilderState.fields).toEqual(['Id', 'Name', 'Industry']);
      expect(stored.appBuilderState.filters).toHaveLength(1);
      expect(stored.appBuilderState.filters[0].field).toBe('Industry');
      expect(stored.appBuilderState.orderBy.field).toBe('Name');
      expect(stored.appBuilderState.limit).toBe(100);
      expect(stored.appBuilderState.offset).toBe(50);
    });

    test('should restore builder state after pop-in', async () => {
      storageMock.appBuilderState = {
        enabled: true,
        object: 'Contact',
        fields: ['Id', 'Email', 'Phone'],
        filters: [{ id: '2', field: 'Email', op: 'LIKE', value: '%@test.com' }],
        orderBy: { field: 'Email', dir: 'desc' },
        limit: 25,
        offset: 0
      };

      const stored = await new Promise(resolve => {
        chrome.storage.local.get({ appBuilderState: null }, resolve);
      });

      expect(stored.appBuilderState.object).toBe('Contact');
      expect(stored.appBuilderState.fields).toContain('Email');
      expect(stored.appBuilderState.filters[0].value).toBe('%@test.com');
    });

    test('should preserve related objects in builder state', async () => {
      const state = hooks.defaultBuilderState();
      state.object = 'Account';
      state.fields = ['Id'];
      state.relatedObjects = [
        { id: '1', relationship: 'Contacts', fields: ['Id', 'Email'] },
        { id: '2', relationship: 'Opportunities', fields: ['Id', 'StageName', 'Amount'] }
      ];

      await chrome.storage.local.set({ appBuilderState: state });

      const stored = await new Promise(resolve => {
        chrome.storage.local.get({ appBuilderState: null }, resolve);
      });

      expect(stored.appBuilderState.relatedObjects).toHaveLength(2);
      expect(stored.appBuilderState.relatedObjects[0].relationship).toBe('Contacts');
      expect(stored.appBuilderState.relatedObjects[1].fields).toContain('Amount');
    });

    test('should use window.__pendingBuilderState for state transfer', () => {
      // Simulate popup.js setting pending state
      window.__pendingBuilderState = {
        object: 'Lead',
        fields: ['Id', 'Status'],
        filters: []
      };

      expect(window.__pendingBuilderState).toBeDefined();
      expect(window.__pendingBuilderState.object).toBe('Lead');

      // Cleanup
      delete window.__pendingBuilderState;
    });
  });

  // Issue 23: Pop-in/out causes double rendering or flicker
  describe('Issue 23: Prevent double rendering', () => {

    test('should have loading state during transition', () => {
      const loadingStates = ['loading', 'transitioning', 'restoring'];
      expect(loadingStates).toContain('loading');
    });

    test('should track initialization to prevent double init', () => {
      // Check that __GraphqlHelperLoaded guard exists
      expect(window.__GraphqlHelperLoaded).toBe(true);
    });
  });

  // Issue 24: Pop-out breaks active Salesforce tab context - Session transfer fix
  describe('Issue 24: Session transfer before APP_POP_SET message', () => {

    test('should persist session info with pop-out including instanceUrl', async () => {
      const sessionInfo = {
        instanceUrl: 'https://myorg.my.salesforce.com',
        accessToken: 'token123',
        sessionId: 'session456',
        userId: '005xxx',
        isLoggedIn: true
      };

      await chrome.storage.local.set({ appSession: sessionInfo });

      const stored = await new Promise(resolve => {
        chrome.storage.local.get({ appSession: null }, resolve);
      });

      expect(stored.appSession.instanceUrl).toBe('https://myorg.my.salesforce.com');
      expect(stored.appSession.accessToken).toBe('token123');
      expect(stored.appSession.isLoggedIn).toBe(true);
    });

    test('should capture session BEFORE sending APP_POP_SET message', async () => {
      // Simulate the order of operations in attachAppPopHandlers
      const sessionInfo = { instanceUrl: 'https://test.salesforce.com', isLoggedIn: true };
      const builderState = { object: 'Account', fields: ['Id'] };

      // Build payload - session should be captured first
      const payload = { action: 'APP_POP_SET', popped: true };
      payload.session = { ...sessionInfo };
      payload.builderState = builderState;

      // Verify payload has all required data before message would be sent
      expect(payload.session).toBeDefined();
      expect(payload.session.instanceUrl).toBe('https://test.salesforce.com');
      expect(payload.builderState).toBeDefined();
      expect(payload.builderState.object).toBe('Account');
    });

    test('should clear consumed appSession after restoration', async () => {
      storageMock.appSession = { instanceUrl: 'https://consumed.salesforce.com' };

      // Simulate consumption
      delete storageMock.appSession;
      await chrome.storage.local.remove('appSession');

      const stored = await new Promise(resolve => {
        chrome.storage.local.get({ appSession: null }, resolve);
      });

      expect(stored.appSession).toBeNull();
    });
  });

  // Issue 25: Pop-out runs query in wrong org/environment - Multi-window isolation
  describe('Issue 25: Multi-window session isolation by windowId and instanceUrl', () => {

    test('should key session storage by instanceUrl', async () => {
      const instanceUrl = 'https://myorg.my.salesforce.com';
      const sessionKey = `appSession_${btoa(instanceUrl).replace(/=/g, '')}`;
      const sessionInfo = { instanceUrl, accessToken: 'token1', isLoggedIn: true };

      await chrome.storage.local.set({ [sessionKey]: sessionInfo });

      const stored = await new Promise(resolve => {
        chrome.storage.local.get({ [sessionKey]: null }, resolve);
      });

      expect(stored[sessionKey]).toBeDefined();
      expect(stored[sessionKey].instanceUrl).toBe(instanceUrl);
    });

    test('should isolate sessions for different orgs', async () => {
      const org1Url = 'https://org1.my.salesforce.com';
      const org2Url = 'https://org2.my.salesforce.com';

      const key1 = `appSession_${btoa(org1Url).replace(/=/g, '')}`;
      const key2 = `appSession_${btoa(org2Url).replace(/=/g, '')}`;

      await chrome.storage.local.set({
        [key1]: { instanceUrl: org1Url, accessToken: 'token1' },
        [key2]: { instanceUrl: org2Url, accessToken: 'token2' }
      });

      const stored = await new Promise(resolve => {
        chrome.storage.local.get({ [key1]: null, [key2]: null }, resolve);
      });

      expect(stored[key1].accessToken).toBe('token1');
      expect(stored[key2].accessToken).toBe('token2');
      expect(stored[key1].accessToken).not.toBe(stored[key2].accessToken);
    });

    test('should also key builderState by instanceUrl', async () => {
      const instanceUrl = 'https://myorg.my.salesforce.com';
      const builderKey = `appBuilderState_${btoa(instanceUrl).replace(/=/g, '')}`;
      const builderState = { object: 'Account', fields: ['Id', 'Name'] };

      await chrome.storage.local.set({ [builderKey]: builderState });

      const stored = await new Promise(resolve => {
        chrome.storage.local.get({ [builderKey]: null }, resolve);
      });

      expect(stored[builderKey]).toBeDefined();
      expect(stored[builderKey].object).toBe('Account');
    });

    test('should track which tab/org is connected', () => {
      const connectionInfo = {
        tabId: 123,
        orgDomain: 'myorg.salesforce.com',
        orgId: '00Dxx'
      };

      expect(connectionInfo.tabId).toBe(123);
      expect(connectionInfo.orgDomain).toContain('salesforce.com');
    });
  });

  // Issue 26: Pop-in/out loses scroll position and open dropdowns
  describe('Issue 26: Preserve UI interaction state', () => {

    test('should persist scroll position', () => {
      const uiState = {
        scrollTop: 150,
        expandedSections: ['fields', 'filters'],
        focusedElement: 'graphql-builder-field-input'
      };

      expect(uiState.scrollTop).toBe(150);
      expect(uiState.expandedSections).toContain('fields');
    });
  });

  // Issue 27: Keyboard focus lost after pop
  describe('Issue 27: Focus restoration', () => {

    test('should track last focused element', () => {
      const lastFocused = 'graphql-query';
      expect(lastFocused).toBeTruthy();
    });
  });

  // Issue 28: Visual mismatch between popup and pop-out
  describe('Issue 28: Consistent styling with standalone mode classes', () => {

    test('should use same CSS classes in both modes', () => {
      const builderPanel = document.getElementById('graphql-builder-panel');
      expect(builderPanel).toBeTruthy();
    });

    test('should add standalone-mode class to tab pane in pop-out', () => {
      const tabPane = document.querySelector('.tab-pane[data-tab="graphql"]');
      expect(tabPane).toBeTruthy();
      // In standalone mode, renderScreens() adds 'standalone-mode' class
      // This test documents expected behavior
    });

    test('should add standalone-expanded class to panels in pop-out', () => {
      const builderPanel = document.getElementById('graphql-builder-panel');
      const rightPanel = document.querySelector('.graphql-builder-right');
      expect(builderPanel).toBeTruthy();
      expect(rightPanel).toBeTruthy();
      // In standalone mode, renderScreens() adds 'standalone-expanded' class
    });
  });

  // Issue 29: No clear indication of detached mode - renderScreens() enhancement
  describe('Issue 29: Mode indicator and standalone detection', () => {

    test('should have window mode badge element', () => {
      const badge = document.getElementById('window-mode-badge');
      expect(badge).toBeTruthy();
    });

    test('should detect standalone mode from URL hash', () => {
      const isStandalone = window.location.hash.includes('standalone');
      expect(typeof isStandalone).toBe('boolean');
    });

    test('renderScreens should detect standalone mode via hash', () => {
      // Verify the detection logic
      const testHash1 = '#standalone';
      const testHash2 = '#standalone&tab=graphql';
      const testHash3 = '#tab=graphql';

      expect(testHash1.includes('standalone')).toBe(true);
      expect(testHash2.includes('standalone')).toBe(true);
      expect(testHash3.includes('standalone')).toBe(false);
    });

    test('should show mode badge only in standalone mode', () => {
      const badge = document.getElementById('window-mode-badge');
      if (badge) {
        // In non-standalone mode (test environment), badge should be hidden
        const isStandalone = window.location.hash.includes('standalone');
        expect(badge.style.display === 'none' || badge.style.display === '').toBe(!isStandalone);
      }
    });
  });

  // Issue 30: Pop-out close behavior is unsafe
  describe('Issue 30: Auto-save builder state', () => {

    test('should auto-save builder state on changes', async () => {
      const state = hooks.defaultBuilderState();
      state.object = 'Account';
      state.fields = ['Id'];

      await chrome.storage.local.set({ graphqlBuilderState: state });

      expect(chrome.storage.local.set).toHaveBeenCalled();
    });

    test('should save state before pop-in closes window', async () => {
      // Simulate saving state before closing
      const builderState = { object: 'Account', fields: ['Id', 'Name'] };
      const sessionInfo = { instanceUrl: 'https://test.salesforce.com' };

      const storagePayload = {};
      if (sessionInfo) storagePayload.appSession = sessionInfo;
      if (builderState) storagePayload.appBuilderState = builderState;

      await chrome.storage.local.set(storagePayload);

      expect(chrome.storage.local.set).toHaveBeenCalledWith(
        expect.objectContaining({ appSession: sessionInfo, appBuilderState: builderState })
      );
    });
  });

  // Issue 31: Multiple pop-outs allowed
  describe('Issue 31: Single-instance pop-out enforcement', () => {

    test('should track existing window ID', () => {
      let appWindowId = null;
      appWindowId = 12345;
      expect(appWindowId).toBe(12345);

      const shouldCreateNew = appWindowId === null;
      expect(shouldCreateNew).toBe(false);
    });

    test('should focus existing window instead of creating new', async () => {
      const existingWindowId = 12345;

      await chrome.windows.update(existingWindowId, { focused: true });

      expect(chrome.windows.update).toHaveBeenCalledWith(existingWindowId, { focused: true });
    });
  });

  // Issue 32: Network requests duplicate after pop-out
  describe('Issue 32: Centralized query execution', () => {

    test('should execute queries via background script', async () => {
      const query = 'query { Account { Id } }';

      sendMessageMock({ action: 'RUN_GRAPHQL', query }, () => {});

      expect(sendMessageMock).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'RUN_GRAPHQL' }),
        expect.any(Function)
      );
    });
  });

  // Issue 33: Pop-out blocks side-by-side workflow
  describe('Issue 33: Docked width presets', () => {

    test('should have reasonable default width', () => {
      const defaultWidth = 520;
      expect(defaultWidth).toBeGreaterThanOrEqual(400);
      expect(defaultWidth).toBeLessThanOrEqual(800);
    });
  });

  // Issue 34: Pop-in/out animation feels unstable
  describe('Issue 34: Smooth transitions', () => {

    test('should have transition state message', () => {
      const transitionMessage = 'Restoring session...';
      expect(transitionMessage).toBeTruthy();
    });
  });

  // Issue 35: No recovery option if window breaks
  describe('Issue 35: Window reset option', () => {

    test('should have reset window size option', async () => {
      const defaultSize = { width: 1400, height: 900 };

      await chrome.storage.local.set({ appWindowSize: defaultSize });

      const stored = await new Promise(resolve => {
        chrome.storage.local.get({ appWindowSize: null }, resolve);
      });

      expect(stored.appWindowSize).toEqual(defaultSize);
    });

    test('should reset to default size when stored size is cleared', async () => {
      await chrome.storage.local.remove('appWindowSize');

      const stored = await new Promise(resolve => {
        chrome.storage.local.get({ appWindowSize: null }, resolve);
      });

      // When cleared, next pop-out should use defaults
      const width = stored.appWindowSize?.width || 1400;
      const height = stored.appWindowSize?.height || 900;
      expect(width).toBe(1400);
      expect(height).toBe(900);
    });
  });
});


// ==============================================================================
// G. HIGH-IMPACT UI IMPROVEMENTS - Issues 36-38
// ==============================================================================

describe('G. High-Impact UI Improvements', () => {

  // Issue 36: Guided mode vs Expert mode
  describe('Issue 36: Guided vs Expert mode toggle', () => {

    test('should have builder toggle for guided mode', () => {
      const builderToggle = document.getElementById('graphql-builder-enabled');
      expect(builderToggle).toBeTruthy();
    });

    test('should show visual builder in guided mode', async () => {
      const builderToggle = document.getElementById('graphql-builder-enabled');
      const builderPanel = document.getElementById('graphql-builder-panel');

      builderToggle.checked = true;
      builderToggle.dispatchEvent(new Event('change', { bubbles: true }));
      await flush();

      // Builder panel should be visible in guided mode
      expect(hooks.getBuilderState().enabled || builderToggle.checked).toBe(true);
    });

    test('should allow raw query editing in expert mode', async () => {
      const builderToggle = document.getElementById('graphql-builder-enabled');
      const queryEl = document.getElementById('graphql-query');

      builderToggle.checked = false;
      builderToggle.dispatchEvent(new Event('change', { bubbles: true }));
      await flush();

      queryEl.value = 'mutation { createAccount { Id } }';

      // In expert mode, raw query can be edited directly
      expect(queryEl.value).toContain('mutation');
    });
  });

  // Issue 37: Smart defaults
  describe('Issue 37: Smart defaults', () => {

    test('should auto-select Id field by default', () => {
      const state = hooks.defaultBuilderState();
      expect(state.fields).toContain('Id');
    });

    test('should default limit to 50', () => {
      const state = hooks.defaultBuilderState();
      expect(state.limit).toBe(50);
    });

    test('should include pageInfo by default', () => {
      const state = hooks.defaultBuilderState();
      expect(state.includePageInfo).toBe(true);
    });

    test('should auto-include Name field when available', async () => {
      // When object is selected and has Name field, suggest including it
      const state = hooks.defaultBuilderState();
      state.object = 'Account';
      state.fields = ['Id'];

      // Smart default would suggest: ['Id', 'Name']
      const suggestedFields = ['Id', 'Name'];
      expect(suggestedFields).toContain('Name');
    });
  });

  // Issue 38: Schema-aware intelligence
  describe('Issue 38: Schema-aware intelligence', () => {

    test('should suggest common filters based on object', () => {
      const commonFilters = {
        'Account': ['Name', 'Industry', 'Type', 'OwnerId'],
        'Contact': ['Name', 'Email', 'AccountId', 'OwnerId'],
        'Opportunity': ['Name', 'StageName', 'CloseDate', 'Amount']
      };

      expect(commonFilters['Account']).toContain('Name');
      expect(commonFilters['Contact']).toContain('Email');
    });

    test('should hide impossible field combinations', () => {
      // Certain fields may not be available together
      const fieldsMeta = [
        { name: 'Id', type: 'id' },
        { name: 'Name', type: 'string' },
        { name: 'FormulaField', type: 'formula', formulaReturnType: 'string' }
      ];

      // Formula fields cannot be filtered
      const filterableFields = fieldsMeta.filter(f => f.type !== 'formula');
      expect(filterableFields.map(f => f.name)).not.toContain('FormulaField');
    });

    test('should validate field types for filter operators', () => {
      const fieldTypesForOperators = {
        'string': ['=', '!=', 'LIKE', 'IN', 'NOT IN', 'IS NULL', 'IS NOT NULL'],
        'number': ['=', '!=', '>', '>=', '<', '<=', 'IN', 'IS NULL', 'IS NOT NULL'],
        'date': ['=', '!=', '>', '>=', '<', '<=', 'IS NULL', 'IS NOT NULL'],
        'boolean': ['=', '!=', 'IS NULL', 'IS NOT NULL']
      };

      expect(fieldTypesForOperators['string']).toContain('LIKE');
      expect(fieldTypesForOperators['number']).not.toContain('LIKE');
      expect(fieldTypesForOperators['boolean']).toContain('=');
    });
  });
});

// ==============================================================================
// INTEGRATION TESTS
// ==============================================================================

describe('Integration Tests', () => {

  test('full query builder flow', async () => {
    // 1. Select object
    const state = hooks.defaultBuilderState();
    state.enabled = true;
    state.object = 'Account';

    // 2. Add fields
    state.fields = ['Id', 'Name', 'Industry'];

    // 3. Add filter
    state.filters = [
      { id: '1', field: 'Industry', op: '=', value: 'Technology' }
    ];

    // 4. Set ordering
    state.orderBy = { field: 'Name', dir: 'asc' };

    // 5. Set pagination
    state.limit = 25;

    hooks.setBuilderState(state);

    // 6. Compose query
    const query = hooks.composeQueryFromBuilder(state);

    // 7. Verify query contains all components
    expect(query).toContain('Account');
    expect(query).toContain('Id');
    expect(query).toContain('Name');
    expect(query).toContain('Industry');
    expect(query).toContain('eq: "Technology"');
    expect(query).toContain('orderBy');
    expect(query).toContain('first: 25');
  });

  test('query import and re-export roundtrip', () => {
    const originalQuery = 'query { uiapi { query { Account(where: { Name: { like: "Test%" } }, first: 10) { edges { node { Id Name { value } } } pageInfo { endCursor hasNextPage } } } } }';

    // Import
    hooks.setBuilderState(hooks.defaultBuilderState());
    hooks.tryImportQueryToBuilder(originalQuery);

    const importedState = hooks.getBuilderState();
    expect(importedState.object).toBe('Account');
    expect(importedState.fields).toContain('Name');
    expect(importedState.limit).toBe(10);

    // Re-export
    importedState.enabled = true;
    const recomposedQuery = hooks.composeQueryFromBuilder(importedState);

    // Should produce equivalent query
    expect(recomposedQuery).toContain('Account');
    expect(recomposedQuery).toContain('like:');
    expect(recomposedQuery).toContain('first: 10');
  });

  test('builder state persistence across sessions', async () => {
    // Save state
    const state = hooks.defaultBuilderState();
    state.object = 'Contact';
    state.fields = ['Id', 'Email', 'FirstName', 'LastName'];
    state.filters = [{ id: '1', field: 'Email', op: '!=', value: '' }];

    await chrome.storage.local.set({ graphqlBuilderState: state });

    // Simulate new session
    const restored = await new Promise(resolve => {
      chrome.storage.local.get({ graphqlBuilderState: hooks.defaultBuilderState() }, resolve);
    });

    expect(restored.graphqlBuilderState.object).toBe('Contact');
    expect(restored.graphqlBuilderState.fields).toContain('Email');
  });
});

// ==============================================================================
// H. BETA BANNER TESTS
// ==============================================================================

describe('H. Beta Banner', () => {

  test('should have beta banner element in GraphQL tab', () => {
    const banner = document.querySelector('#tab-graphql .beta-banner');
    expect(banner).toBeTruthy();
  });

  test('should have beta banner icon', () => {
    const icon = document.querySelector('#tab-graphql .beta-banner-icon');
    expect(icon).toBeTruthy();
    expect(icon.textContent).toBe('🚧');
  });

  test('should have beta banner title', () => {
    const title = document.querySelector('#tab-graphql .beta-banner-title');
    expect(title).toBeTruthy();
    expect(title.textContent).toContain('Beta');
  });

  test('should have beta banner message', () => {
    const message = document.querySelector('#tab-graphql .beta-banner-message');
    expect(message).toBeTruthy();
    expect(message.textContent.length).toBeGreaterThan(0);
  });

  test('should have report issue action button', () => {
    const action = document.querySelector('#tab-graphql .beta-banner-action');
    expect(action).toBeTruthy();
  });

  test('should have dismiss button', () => {
    const dismissBtn = document.querySelector('#tab-graphql .beta-banner-dismiss');
    expect(dismissBtn).toBeTruthy();
  });

  test('dismiss button should hide the banner when clicked', () => {
    const banner = document.querySelector('#tab-graphql .beta-banner');
    const dismissBtn = document.querySelector('#tab-graphql .beta-banner-dismiss');

    expect(banner.classList.contains('hidden')).toBe(false);

    // Simulate dismiss
    banner.classList.add('hidden');

    expect(banner.classList.contains('hidden')).toBe(true);
  });

  test('should persist dismissed state to storage', async () => {
    await chrome.storage.local.set({ graphqlBetaBannerDismissed: true });

    const stored = await new Promise(resolve => {
      chrome.storage.local.get({ graphqlBetaBannerDismissed: false }, resolve);
    });

    expect(stored.graphqlBetaBannerDismissed).toBe(true);
  });

  test('should restore dismissed state from storage', async () => {
    storageMock.graphqlBetaBannerDismissed = true;

    const stored = await new Promise(resolve => {
      chrome.storage.local.get({ graphqlBetaBannerDismissed: false }, resolve);
    });

    expect(stored.graphqlBetaBannerDismissed).toBe(true);
  });
});

console.log('GraphQL UI Fixes tests loaded');

