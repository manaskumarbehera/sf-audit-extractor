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

