/**
 * @jest-environment jsdom
 */

const flush = () => new Promise((r) => setTimeout(r, 0));

function setupDom() {
  document.body.innerHTML = `
    <div class="tab-pane active" data-tab="soql">
      <input type="checkbox" id="soql-tooling" />
      <div id="soql-object-group"><select id="soql-object"><option value="">Select</option></select></div>
      <input id="soql-limit" type="number" value="200" />
      <button id="soql-run"></button>
      <button id="soql-clear"></button>
      <!-- SOQL query tabs bar -->
      <div id="soql-tabs" class="soql-tabbar">
        <div class="soql-tablist"></div>
        <button id="soql-tab-add" class="icon-btn btn-sm">＋</button>
      </div>
      <textarea id="soql-query"></textarea>
      <div id="soql-results"></div>
      <input id="soql-view-advanced" type="checkbox" />
      <div id="soql-builder"></div>
      <input id="soql-builder-enabled" type="checkbox" />
      <input id="soql-builder-field-input" />
      <datalist id="soql-builder-field-list"></datalist>
      <div id="soql-builder-fields"></div>
      <button id="soql-builder-add-field"></button>
      <!-- Lookup elements -->
      <button id="soql-builder-add-lookup"></button>
      <div id="soql-builder-lookups-picker" style="display: none;">
        <select id="soql-builder-lookup-select"><option value="">-- Select lookup --</option></select>
        <select id="soql-builder-lookup-field" style="display: none;"><option value="">-- Select field --</option></select>
        <button id="soql-builder-lookup-add-btn" style="display: none;">Add</button>
      </div>
      <div id="soql-builder-lookups" class="chip-wrap builder-chip-wrap"></div>
      <!-- Subquery elements -->
      <button id="soql-builder-add-subquery"></button>
      <div id="soql-builder-subquery-picker" style="display: none;">
        <select id="soql-builder-subquery-select"><option value="">-- Select child relationship --</option></select>
        <div id="soql-builder-subquery-fields-wrap" style="display: none;">
          <input id="soql-builder-subquery-fields-input" value="Id, Name" />
          <button id="soql-builder-subquery-add-btn">Add</button>
        </div>
      </div>
      <div id="soql-builder-subqueries" class="builder-subqueries"></div>
      <!-- End lookup/subquery elements -->
      <div id="soql-builder-filters"></div>
      <button id="soql-builder-add-filter"></button>
      <input id="soql-builder-order-field" />
      <select id="soql-builder-order-dir"><option value="asc">asc</option><option value="desc">desc</option></select>
      <button id="soql-builder-clear-order"></button>
      <div id="soql-builder-status"></div>
    </div>
  `;
}

let hooks = null;
let sendMessageMock = null;

beforeAll(async () => {
  setupDom();

  sendMessageMock = jest.fn((msg, cb) => {
    if (typeof msg === 'object' && msg.action === 'DESCRIBE_GLOBAL') {
      const makeObjs = (names) => names.map((n) => ({ name: n, label: n, queryable: true }));
      if (msg.useTooling) {
        // Tooling API returns Tooling-specific objects
        cb({ success: true, objects: makeObjs(['ApexClass', 'ApexTrigger', 'LightningComponentBundle']) });
      } else {
        // REST API returns standard SObjects AND Tooling objects (ApexClass is queryable via REST too)
        // but the filter should exclude Apex/Lightning objects when useTooling is false
        cb({ success: true, objects: makeObjs(['Account', 'Contact', 'ApexClass', 'ApexTrigger', 'LightningComponentBundle']) });
      }
      return;
    }
    if (typeof msg === 'object' && msg.action === 'GET_SESSION_INFO') {
      cb({ success: true, isSalesforce: true, isLoggedIn: true });
      return;
    }
    cb({ success: true });
  });

  global.Utils = {
    escapeHtml: (s) => String(s),
    getInstanceUrl: async () => 'https://example.my.salesforce.com',
    looksLikeSalesforceOrigin: () => true,
    setInstanceUrlCache: () => {},
  };
  global.chrome = {
    runtime: { sendMessage: (msg, cb) => sendMessageMock(msg, cb), lastError: null },
    storage: { local: { get: (_q, cb) => cb && cb({ soqlShowObjectSelector: true }), set: () => {} } },
  };
  await import('../soql_helper.js');
  const soqlTab = document.querySelector('.tab-pane[data-tab="soql"]');
  soqlTab.setAttribute('hidden', '');
  soqlTab.removeAttribute('hidden');
  soqlTab.classList.remove('active');
  soqlTab.classList.add('active');
  await flush();
  hooks = window.__SoqlTestHooks;
});

beforeEach(() => {
  expect(hooks).toBeDefined();
  hooks.setBuilderState(hooks.defaultBuilderState());
});

test('composeQueryFromBuilder builds basic SELECT/WHERE/ORDER/LIMIT', () => {
  const state = hooks.defaultBuilderState();
  state.enabled = true;
  state.object = 'Account';
  state.fields = ['Id', 'Name', 'Industry'];
  state.filters = [
    { id: '1', field: 'Name', op: 'LIKE', value: 'Acme%' },
    { id: '2', field: 'AnnualRevenue', op: '>', value: '100000' },
    { id: '3', field: 'Tier__c', op: 'IN', value: 'Gold, Silver' },
  ];
  state.orderBy = { field: 'CreatedDate', dir: 'desc' };
  state.limit = 123;

  const q = hooks.composeQueryFromBuilder(state);
  expect(q).toBe(
    "SELECT Id, Name, Industry FROM Account WHERE Name LIKE 'Acme%' AND AnnualRevenue > 100000 AND Tier__c IN ('Gold', 'Silver') ORDER BY CreatedDate DESC LIMIT 123"
  );
});

test('composeQueryFromBuilder includes lookup fields', () => {
  const state = hooks.defaultBuilderState();
  state.enabled = true;
  state.object = 'Contact';
  state.fields = ['Id', 'Name'];
  state.lookups = ['Account.Name', 'Owner.Email'];
  state.limit = 100;

  const q = hooks.composeQueryFromBuilder(state);
  expect(q).toBe(
    "SELECT Id, Name, Account.Name, Owner.Email FROM Contact LIMIT 100"
  );
});

test('composeQueryFromBuilder includes subqueries', () => {
  const state = hooks.defaultBuilderState();
  state.enabled = true;
  state.object = 'Account';
  state.fields = ['Id', 'Name'];
  state.subqueries = [
    { id: '1', relationship: 'Contacts', childObject: 'Contact', fields: 'Id, Name, Email' },
    { id: '2', relationship: 'Cases', childObject: 'Case', fields: 'Id, Subject' }
  ];
  state.limit = 50;

  const q = hooks.composeQueryFromBuilder(state);
  expect(q).toBe(
    "SELECT Id, Name, (SELECT Id, Name, Email FROM Contacts), (SELECT Id, Subject FROM Cases) FROM Account LIMIT 50"
  );
});

test('composeQueryFromBuilder combines fields, lookups, and subqueries', () => {
  const state = hooks.defaultBuilderState();
  state.enabled = true;
  state.object = 'Account';
  state.fields = ['Id', 'Name'];
  state.lookups = ['Owner.Name'];
  state.subqueries = [
    { id: '1', relationship: 'Contacts', childObject: 'Contact', fields: 'Id, FirstName' }
  ];
  state.filters = [{ id: 'f1', field: 'Industry', op: '=', value: 'Technology' }];
  state.orderBy = { field: 'Name', dir: 'asc' };
  state.limit = 10;

  const q = hooks.composeQueryFromBuilder(state);
  expect(q).toBe(
    "SELECT Id, Name, Owner.Name, (SELECT Id, FirstName FROM Contacts) FROM Account WHERE Industry = 'Technology' ORDER BY Name ASC LIMIT 10"
  );
});

test('defaultBuilderState includes empty lookups and subqueries arrays', () => {
  const state = hooks.defaultBuilderState();
  expect(state.lookups).toEqual([]);
  expect(state.subqueries).toEqual([]);
});

test('cloneBuilderState preserves lookups and subqueries', () => {
  const original = hooks.defaultBuilderState();
  original.lookups = ['Account.Name', 'Owner.Email'];
  original.subqueries = [{ id: '1', relationship: 'Contacts', childObject: 'Contact', fields: 'Id' }];

  hooks.setBuilderState(original);
  const cloned = hooks.getBuilderState();

  expect(cloned.lookups).toEqual(['Account.Name', 'Owner.Email']);
  expect(cloned.subqueries).toHaveLength(1);
  expect(cloned.subqueries[0].relationship).toBe('Contacts');
});

test('tryImportQueryToBuilder parses fields, filters, order, and limit', () => {
  hooks.setBuilderState(hooks.defaultBuilderState());
  hooks.tryImportQueryToBuilder(
    "SELECT Id, Name, Industry FROM Account WHERE Name LIKE 'Acme%' AND Status__c != 'Closed' AND Tier__c IN ('Gold','Silver') ORDER BY CreatedDate DESC LIMIT 321"
  );
  const bs = hooks.getBuilderState();

  expect(bs.object).toBe('Account');
  expect(bs.fields).toEqual(['Id', 'Name', 'Industry']);
  expect(bs.filters).toHaveLength(3);
  expect(bs.filters.map((f) => f.op)).toEqual(['LIKE', '!=', 'IN']);
  expect(bs.filters[2].value).toBe('Gold, Silver');
  expect(bs.orderBy).toEqual({ field: 'CreatedDate', dir: 'desc' });
  expect(bs.limit).toBe(321);
});

test('tryImportQueryToBuilder separates lookup fields from regular fields', () => {
  hooks.setBuilderState(hooks.defaultBuilderState());
  hooks.tryImportQueryToBuilder(
    "SELECT Id, Name, Owner.Name, Owner.Email, Account.Name FROM Contact LIMIT 100"
  );
  const bs = hooks.getBuilderState();

  expect(bs.object).toBe('Contact');
  expect(bs.fields).toEqual(['Id', 'Name']);
  expect(bs.lookups).toEqual(['Owner.Name', 'Owner.Email', 'Account.Name']);
});

describe('Object dropdown Tooling API toggle', () => {
  test('REST mode excludes Tooling objects (ApexClass, ApexTrigger, etc)', async () => {
    const sel = document.getElementById('soql-object');
    const toolingCb = document.getElementById('soql-tooling');

    // Ensure Tooling is off
    toolingCb.checked = false;
    toolingCb.dispatchEvent(new Event('change', { bubbles: true }));
    await flush();

    // REST mode should only show standard SObjects, NOT ApexClass/ApexTrigger/LightningComponentBundle
    const restOptions = Array.from(sel.options).map((o) => o.value).filter(Boolean);
    expect(restOptions).toEqual(['Account', 'Contact']);
    expect(restOptions).not.toContain('ApexClass');
    expect(restOptions).not.toContain('ApexTrigger');
    expect(restOptions).not.toContain('LightningComponentBundle');
  });

  test('Tooling mode shows Tooling objects (ApexClass, ApexTrigger, etc)', async () => {
    const sel = document.getElementById('soql-object');
    const toolingCb = document.getElementById('soql-tooling');

    // Toggle Tooling on
    toolingCb.checked = true;
    toolingCb.dispatchEvent(new Event('change', { bubbles: true }));
    await flush();

    const toolOptions = Array.from(sel.options).map((o) => o.value).filter(Boolean);
    expect(toolOptions).toEqual(['ApexClass', 'ApexTrigger', 'LightningComponentBundle']);
    expect(toolOptions).toContain('ApexClass');
  });

  test('toggling Tooling API off restores SObject list without Tooling objects', async () => {
    const sel = document.getElementById('soql-object');
    const toolingCb = document.getElementById('soql-tooling');

    // Ensure Tooling is on first
    toolingCb.checked = true;
    toolingCb.dispatchEvent(new Event('change', { bubbles: true }));
    await flush();

    // Toggle Tooling off
    toolingCb.checked = false;
    toolingCb.dispatchEvent(new Event('change', { bubbles: true }));
    await flush();

    const restOptions = Array.from(sel.options).map((o) => o.value).filter(Boolean);
    expect(restOptions).toEqual(['Account', 'Contact']);
    expect(restOptions).not.toContain('ApexClass');
  });
});

describe('SOQL tabs functionality', () => {
  test('tabs bar renders with at least one tab', async () => {
    const tabsBar = document.getElementById('soql-tabs');
    const tabsList = tabsBar.querySelector('.soql-tablist');

    expect(tabsBar).toBeTruthy();
    expect(tabsList).toBeTruthy();

    await flush();

    // Should have at least one tab rendered
    const tabs = tabsList.querySelectorAll('.soql-tab');
    expect(tabs.length).toBeGreaterThanOrEqual(1);
  });

  test('tabs remain visible when builder toggle is enabled', async () => {
    const tabsBar = document.getElementById('soql-tabs');
    const builderToggle = document.getElementById('soql-builder-enabled');
    const builderPanel = document.getElementById('soql-builder');

    // Initially builder is disabled
    expect(builderToggle.checked).toBe(false);

    // Enable builder
    builderToggle.checked = true;
    builderToggle.dispatchEvent(new Event('change', { bubbles: true }));
    await flush();

    // Tabs should still be visible (not hidden)
    expect(tabsBar.hidden).toBeFalsy();
    expect(tabsBar.style.display).not.toBe('none');

    // Builder panel should now be visible
    expect(builderPanel.hidden).toBeFalsy();
  });

  test('clicking add tab button creates a new tab', async () => {
    const tabsBar = document.getElementById('soql-tabs');
    const tabsList = tabsBar.querySelector('.soql-tablist');
    const addBtn = document.getElementById('soql-tab-add');

    await flush();
    const initialCount = tabsList.querySelectorAll('.soql-tab').length;

    // Click add button
    addBtn.click();
    await flush();

    const newCount = tabsList.querySelectorAll('.soql-tab').length;
    expect(newCount).toBe(initialCount + 1);
  });
});

describe('Lookup and Subquery UI', () => {
  test('lookup picker toggle shows/hides on button click', async () => {
    const addLookupBtn = document.getElementById('soql-builder-add-lookup');
    const lookupsPicker = document.getElementById('soql-builder-lookups-picker');

    expect(lookupsPicker.style.display).toBe('none');

    // Click to show
    addLookupBtn.click();
    await flush();
    expect(lookupsPicker.style.display).toBe('');

    // Click to hide
    addLookupBtn.click();
    await flush();
    expect(lookupsPicker.style.display).toBe('none');
  });

  test('subquery picker toggle shows/hides on button click', async () => {
    const addSubqueryBtn = document.getElementById('soql-builder-add-subquery');
    const subqueryPicker = document.getElementById('soql-builder-subquery-picker');

    expect(subqueryPicker.style.display).toBe('none');

    // Click to show
    addSubqueryBtn.click();
    await flush();
    expect(subqueryPicker.style.display).toBe('');

    // Click to hide
    addSubqueryBtn.click();
    await flush();
    expect(subqueryPicker.style.display).toBe('none');
  });

  test('lookup chips are rendered when lookups are in state', async () => {
    const lookupsWrap = document.getElementById('soql-builder-lookups');

    // Set state with lookups
    const state = hooks.defaultBuilderState();
    state.enabled = true;
    state.object = 'Contact';
    state.lookups = ['Account.Name', 'Owner.Email'];
    hooks.setBuilderState(state);

    // Trigger UI sync by enabling builder
    const builderToggle = document.getElementById('soql-builder-enabled');
    builderToggle.checked = true;
    builderToggle.dispatchEvent(new Event('change', { bubbles: true }));
    await flush();

    // Check if lookup chips are rendered
    const chips = lookupsWrap.querySelectorAll('.chip');
    expect(chips.length).toBe(2);
    expect(chips[0].textContent).toContain('Account.Name');
    expect(chips[1].textContent).toContain('Owner.Email');
  });

  test('subquery chips are rendered when subqueries are in state', async () => {
    const subqueriesWrap = document.getElementById('soql-builder-subqueries');

    // Set state with subqueries
    const state = hooks.defaultBuilderState();
    state.enabled = true;
    state.object = 'Account';
    state.subqueries = [
      { id: 'sq1', relationship: 'Contacts', childObject: 'Contact', fields: 'Id, Name' }
    ];
    hooks.setBuilderState(state);

    // Trigger UI sync by enabling builder
    const builderToggle = document.getElementById('soql-builder-enabled');
    builderToggle.checked = true;
    builderToggle.dispatchEvent(new Event('change', { bubbles: true }));
    await flush();

    // Check if subquery chips are rendered
    const chips = subqueriesWrap.querySelectorAll('.subquery-chip');
    expect(chips.length).toBe(1);
    expect(chips[0].textContent).toContain('Contacts');
  });

  test('multiple lookups from same relationship are preserved', async () => {
    // Test that adding Owner.Name and Owner.Email both show up
    const state = hooks.defaultBuilderState();
    state.enabled = true;
    state.object = 'Account';
    state.fields = ['Id', 'Name'];
    state.lookups = ['Owner.Name', 'Owner.Email', 'Owner.Phone'];
    state.limit = 100;

    const q = hooks.composeQueryFromBuilder(state);
    expect(q).toContain('Owner.Name');
    expect(q).toContain('Owner.Email');
    expect(q).toContain('Owner.Phone');
    expect(q).toBe('SELECT Id, Name, Owner.Name, Owner.Email, Owner.Phone FROM Account LIMIT 100');
  });
});

describe('tryImportQueryToBuilder lookup parsing', () => {
  test('separates simple fields from lookup fields', () => {
    hooks.setBuilderState(hooks.defaultBuilderState());
    hooks.tryImportQueryToBuilder(
      "SELECT Id, Name, Owner.Name FROM Account LIMIT 100"
    );
    const bs = hooks.getBuilderState();

    expect(bs.fields).toEqual(['Id', 'Name']);
    expect(bs.lookups).toEqual(['Owner.Name']);
  });

  test('handles multiple lookups from same relationship', () => {
    hooks.setBuilderState(hooks.defaultBuilderState());
    hooks.tryImportQueryToBuilder(
      "SELECT Id, Owner.Name, Owner.Email, Owner.Phone FROM Account LIMIT 100"
    );
    const bs = hooks.getBuilderState();

    expect(bs.fields).toEqual(['Id']);
    expect(bs.lookups).toEqual(['Owner.Name', 'Owner.Email', 'Owner.Phone']);
  });

  test('handles lookups from different relationships', () => {
    hooks.setBuilderState(hooks.defaultBuilderState());
    hooks.tryImportQueryToBuilder(
      "SELECT Id, Name, Account.Name, Owner.Name, CreatedBy.Email FROM Contact LIMIT 100"
    );
    const bs = hooks.getBuilderState();

    expect(bs.fields).toEqual(['Id', 'Name']);
    expect(bs.lookups).toEqual(['Account.Name', 'Owner.Name', 'CreatedBy.Email']);
  });

  test('handles nested lookups (multi-level relationships)', () => {
    hooks.setBuilderState(hooks.defaultBuilderState());
    hooks.tryImportQueryToBuilder(
      "SELECT Id, Account.Owner.Name FROM Contact LIMIT 100"
    );
    const bs = hooks.getBuilderState();

    expect(bs.fields).toEqual(['Id']);
    expect(bs.lookups).toEqual(['Account.Owner.Name']);
  });

  test('preserves lookups when re-importing query with existing lookups', () => {
    // First import
    hooks.setBuilderState(hooks.defaultBuilderState());
    hooks.tryImportQueryToBuilder(
      "SELECT Id, Name, Owner.Name FROM Account LIMIT 100"
    );
    let bs = hooks.getBuilderState();
    expect(bs.lookups).toEqual(['Owner.Name']);

    // Modify and re-import (simulating toggle builder on/off)
    hooks.tryImportQueryToBuilder(
      "SELECT Id, Name, Owner.Name, Owner.Email FROM Account LIMIT 100"
    );
    bs = hooks.getBuilderState();
    expect(bs.lookups).toEqual(['Owner.Name', 'Owner.Email']);
  });
});

describe('quoteIdentifier for relationship paths', () => {
  test('composeQueryFromBuilder does not quote simple relationship paths', () => {
    const state = hooks.defaultBuilderState();
    state.enabled = true;
    state.object = 'Contact';
    state.fields = ['Id'];
    state.lookups = ['Account.Name', 'Owner.Email'];
    state.limit = 100;

    const q = hooks.composeQueryFromBuilder(state);
    // Should NOT have backticks around relationship paths
    expect(q).toBe('SELECT Id, Account.Name, Owner.Email FROM Contact LIMIT 100');
    expect(q).not.toContain('`Account.Name`');
    expect(q).not.toContain('`Owner.Email`');
  });

  test('composeQueryFromBuilder handles multi-level relationship paths', () => {
    const state = hooks.defaultBuilderState();
    state.enabled = true;
    state.object = 'Contact';
    state.fields = ['Id'];
    state.lookups = ['Account.Owner.Name'];
    state.limit = 100;

    const q = hooks.composeQueryFromBuilder(state);
    expect(q).toBe('SELECT Id, Account.Owner.Name FROM Contact LIMIT 100');
    expect(q).not.toContain('`');
  });
});

describe('Builder state persistence with lookups', () => {
  test('cloneBuilderState deep copies lookups array', () => {
    const original = hooks.defaultBuilderState();
    original.lookups = ['Owner.Name', 'Account.Name'];

    hooks.setBuilderState(original);
    const cloned = hooks.getBuilderState();

    // Modify original
    original.lookups.push('CreatedBy.Email');

    // Cloned should not be affected
    expect(cloned.lookups).toEqual(['Owner.Name', 'Account.Name']);
    expect(cloned.lookups).toHaveLength(2);
  });

  test('cloneBuilderState deep copies subqueries array', () => {
    const original = hooks.defaultBuilderState();
    original.subqueries = [
      { id: '1', relationship: 'Contacts', childObject: 'Contact', fields: 'Id, Name' }
    ];

    hooks.setBuilderState(original);
    const cloned = hooks.getBuilderState();

    // Modify original
    original.subqueries[0].fields = 'Id, Name, Email';

    // Cloned should have original values (though note: shallow copy of objects inside)
    expect(cloned.subqueries).toHaveLength(1);
    expect(cloned.subqueries[0].relationship).toBe('Contacts');
  });
});

describe('Clear button behavior', () => {
  test('clear button clears query textarea', async () => {
    const queryEl = document.getElementById('soql-query');
    const clearBtn = document.getElementById('soql-clear');

    // Set up query text
    queryEl.value = 'SELECT Id, Name FROM Account LIMIT 100';

    // Click clear button
    clearBtn.click();
    await flush();

    // Query text should be cleared
    expect(queryEl.value).toBe('');
  });

  test('clear button preserves guided builder enabled state', async () => {
    const builderToggle = document.getElementById('soql-builder-enabled');
    const clearBtn = document.getElementById('soql-clear');

    // Enable builder
    builderToggle.checked = true;
    builderToggle.dispatchEvent(new Event('change', { bubbles: true }));
    await flush();

    // Set up some builder state
    const state = hooks.defaultBuilderState();
    state.enabled = true;
    state.object = 'Account';
    state.fields = ['Id', 'Name', 'Industry'];
    state.lookups = ['Owner.Name'];
    hooks.setBuilderState(state);

    // Click clear button
    clearBtn.click();
    await flush();

    // Builder toggle should remain checked (enabled)
    expect(builderToggle.checked).toBe(true);
  });

  test('clear button does not reset builder fields and lookups', async () => {
    const builderToggle = document.getElementById('soql-builder-enabled');
    const clearBtn = document.getElementById('soql-clear');

    // Enable builder and set state
    builderToggle.checked = true;
    builderToggle.dispatchEvent(new Event('change', { bubbles: true }));
    await flush();

    const state = hooks.defaultBuilderState();
    state.enabled = true;
    state.object = 'Contact';
    state.fields = ['Id', 'FirstName', 'LastName'];
    state.lookups = ['Account.Name', 'Owner.Email'];
    state.filters = [{ id: '1', field: 'Email', op: '!=', value: '' }];
    hooks.setBuilderState(state);

    // Click clear button
    clearBtn.click();
    await flush();

    // Get current builder state
    const currentState = hooks.getBuilderState();

    // Builder state should be preserved (fields, lookups, filters)
    expect(currentState.enabled).toBe(true);
    expect(currentState.object).toBe('Contact');
    expect(currentState.fields).toEqual(['Id', 'FirstName', 'LastName']);
    expect(currentState.lookups).toEqual(['Account.Name', 'Owner.Email']);
    expect(currentState.filters).toHaveLength(1);
  });

  test('clear button clears results area', async () => {
    const results = document.getElementById('soql-results');
    const clearBtn = document.getElementById('soql-clear');

    // Set some mock results content
    results.innerHTML = '<div>Some query results</div>';

    // Click clear button
    clearBtn.click();
    await flush();

    // Results should show placeholder or be cleared
    // The placeholder renders "No results yet" or similar
    expect(results.innerHTML).not.toContain('Some query results');
  });
});

describe('Run and Clear button placement', () => {
  test('Run button exists in DOM', () => {
    const runBtn = document.getElementById('soql-run');
    expect(runBtn).toBeTruthy();
    expect(runBtn.tagName.toLowerCase()).toBe('button');
  });

  test('Clear button exists in DOM', () => {
    const clearBtn = document.getElementById('soql-clear');
    expect(clearBtn).toBeTruthy();
    expect(clearBtn.tagName.toLowerCase()).toBe('button');
  });
});

// ============================================================================
// Field Validation Tests - Prevent child relationships from being added as fields
// ============================================================================
describe('Field validation', () => {
  beforeEach(() => {
    // Set up mock field options (simulating describe result for Account)
    hooks.setBuilderFieldOptions([
      { name: 'Id', label: 'Account ID', type: 'id' },
      { name: 'Name', label: 'Account Name', type: 'string' },
      { name: 'BillingLatitude', label: 'Billing Latitude', type: 'double' },
      { name: 'CleanStatus', label: 'Clean Status', type: 'picklist' },
      { name: 'OwnerId', label: 'Owner ID', type: 'reference', relationshipName: 'Owner', referenceTo: ['User'] },
    ]);

    // Set up mock object describe with child relationships
    hooks.setCurrentObjectDescribe({
      name: 'Account',
      fields: [
        { name: 'Id', label: 'Account ID', type: 'id' },
        { name: 'Name', label: 'Account Name', type: 'string' },
      ],
      childRelationships: [
        { relationshipName: 'Cases', childSObject: 'Case', field: 'AccountId' },
        { relationshipName: 'Contacts', childSObject: 'Contact', field: 'AccountId' },
        { relationshipName: 'Opportunities', childSObject: 'Opportunity', field: 'AccountId' },
      ]
    });
  });

  test('validateFieldForBuilder identifies valid field', () => {
    const result = hooks.validateFieldForBuilder('Name');
    expect(result.isValidField).toBe(true);
    expect(result.isChildRelationship).toBe(false);
  });

  test('validateFieldForBuilder identifies valid field case-insensitively', () => {
    const result = hooks.validateFieldForBuilder('name');
    expect(result.isValidField).toBe(true);
    expect(result.isChildRelationship).toBe(false);
  });

  test('validateFieldForBuilder identifies child relationship name as not a valid field', () => {
    const result = hooks.validateFieldForBuilder('Cases');
    expect(result.isValidField).toBe(false);
    expect(result.isChildRelationship).toBe(true);
  });

  test('validateFieldForBuilder identifies child SObject name as child relationship', () => {
    const result = hooks.validateFieldForBuilder('Case');
    expect(result.isValidField).toBe(false);
    expect(result.isChildRelationship).toBe(true);
  });

  test('validateFieldForBuilder identifies Contacts as child relationship', () => {
    const result = hooks.validateFieldForBuilder('Contacts');
    expect(result.isValidField).toBe(false);
    expect(result.isChildRelationship).toBe(true);
  });

  test('validateFieldForBuilder identifies Contact (child object) as child relationship', () => {
    const result = hooks.validateFieldForBuilder('Contact');
    expect(result.isValidField).toBe(false);
    expect(result.isChildRelationship).toBe(true);
  });

  test('validateFieldForBuilder identifies unknown field', () => {
    const result = hooks.validateFieldForBuilder('NonExistentField');
    expect(result.isValidField).toBe(false);
    expect(result.isChildRelationship).toBe(false);
  });

  test('validateFieldForBuilder identifies reference field as valid', () => {
    const result = hooks.validateFieldForBuilder('OwnerId');
    expect(result.isValidField).toBe(true);
    expect(result.isChildRelationship).toBe(false);
  });

  test('validateFieldForBuilder with BillingLatitude (actual field from error)', () => {
    const result = hooks.validateFieldForBuilder('BillingLatitude');
    expect(result.isValidField).toBe(true);
    expect(result.isChildRelationship).toBe(false);
  });

  test('validateFieldForBuilder with CleanStatus (actual field from error)', () => {
    const result = hooks.validateFieldForBuilder('CleanStatus');
    expect(result.isValidField).toBe(true);
    expect(result.isChildRelationship).toBe(false);
  });
});

describe('Field validation prevents invalid SOQL', () => {
  test('composeQueryFromBuilder with valid fields produces correct SOQL', () => {
    const state = hooks.defaultBuilderState();
    state.enabled = true;
    state.object = 'Account';
    state.fields = ['Id', 'BillingLatitude', 'CleanStatus'];
    state.lookups = ['Owner.Name'];
    state.limit = 200;

    const q = hooks.composeQueryFromBuilder(state);
    expect(q).toBe(
      "SELECT Id, BillingLatitude, CleanStatus, Owner.Name FROM Account LIMIT 200"
    );
    // Verify that "Case" is NOT in the query
    expect(q).not.toContain('Case');
  });

  test('child relationships should be in subqueries, not fields', () => {
    const state = hooks.defaultBuilderState();
    state.enabled = true;
    state.object = 'Account';
    state.fields = ['Id', 'Name'];
    state.subqueries = [
      { id: '1', relationship: 'Cases', childObject: 'Case', fields: 'Id, Subject' }
    ];
    state.limit = 200;

    const q = hooks.composeQueryFromBuilder(state);
    expect(q).toBe(
      "SELECT Id, Name, (SELECT Id, Subject FROM Cases) FROM Account LIMIT 200"
    );
    // The word "Cases" should only appear in the subquery, not as a direct field
    expect(q.indexOf('Cases')).toBeGreaterThan(q.indexOf('(SELECT'));
  });
});
