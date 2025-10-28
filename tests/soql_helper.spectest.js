/* @jest-environment jsdom */

// Test the SOQL object list behavior between REST and Tooling modes without hardcoded filters

function setupDom() {
  document.body.innerHTML = `
    <div class="tab-contents">
      <div id="tab-soql" class="tab-pane active" data-tab="soql">
        <div class="filters">
          <label for="soql-tooling">Tooling API:</label>
          <input type="checkbox" id="soql-tooling" />
          <div id="soql-object-group">
            <label for="soql-object">Object:</label>
            <select id="soql-object">
              <option value="">Select an object</option>
            </select>
          </div>
          <label for="soql-limit">Limit:</label>
          <input id="soql-limit" type="number" value="200" />
          <button id="soql-run">Run</button>
          <button id="soql-clear">Clear</button>
        </div>
        <div class="search-box">
          <textarea id="soql-query"></textarea>
        </div>
        <div id="soql-results"></div>
      </div>
    </div>
  `;
}

function flushTimers() {
  return new Promise((r) => setTimeout(r, 0));
}

describe('SOQL helper object dropdown', () => {
  let sendMessageMock;

  beforeEach(() => {
    setupDom();

    // Minimal Utils mock used by soql_helper.js
    global.Utils = {
      getInstanceUrl: () => Promise.resolve('https://example.my.salesforce.com'),
      escapeHtml: (s) => String(s).replace(/[<>&]/g, (c) => ({'<':'&lt;','>':'&gt;','&':'&amp;'}[c] || c)),
      setInstanceUrlCache: () => {}
    };

    // chrome mocks
    sendMessageMock = jest.fn((msg, cb) => {
      if (typeof msg === 'object' && msg.action === 'DESCRIBE_GLOBAL') {
        const makeObjs = (names) => names.map((n) => ({ name: n, label: n, queryable: true }));
        if (msg.useTooling) {
          cb({ success: true, objects: makeObjs(['ApexClass', 'ApexTrigger', 'LightningComponentBundle']) });
        } else {
          cb({ success: true, objects: makeObjs(['Account', 'Contact']) });
        }
        return;
      }
      if (typeof msg === 'object' && msg.action === 'GET_SESSION_INFO') {
        cb({ success: true, isSalesforce: true, isLoggedIn: true });
        return;
      }
      cb({ success: true });
    });

    global.chrome = {
      runtime: {
        sendMessage: (msg, cb) => sendMessageMock(msg, cb),
        lastError: null
      },
      storage: {
        local: {
          get: (defaults, cb) => {
            cb({ soqlShowObjectSelector: true, ...(defaults || {}) });
          },
          set: (_v, _cb) => {}
        }
      }
    };
  });

  afterEach(() => {
    // cleanup globals
    delete global.chrome;
    delete global.Utils;
    document.body.innerHTML = '';
    jest.clearAllMocks();
  });

  test('renders only REST objects when Tooling API is unchecked; toggling shows Tooling objects and back', async () => {
    // Import soql_helper.js (IIFE runs and sets up observers + initial reload)
    await import('../soql_helper.js');

    // Trigger MutationObserver by mutating the observed attributes on the soql tab
    const soqlTab = document.querySelector('.tab-pane[data-tab="soql"]');
    // Flip hidden on and off to fire observer (attributeFilter includes 'hidden')
    soqlTab.setAttribute('hidden', '');
    soqlTab.removeAttribute('hidden');
    // Also toggle class to be safe (attributeFilter includes 'class')
    soqlTab.classList.remove('active');
    soqlTab.classList.add('active');

    await flushTimers();

    const toolingCb = document.getElementById('soql-tooling');
    const sel = document.getElementById('soql-object');

    // Wait a tick for async sendMessage callback to populate select
    await flushTimers();

    const restOptions = Array.from(sel.options).map(o => o.value).filter(Boolean);
    expect(restOptions).toEqual(['Account', 'Contact']);

    // Toggle Tooling on
    toolingCb.checked = true;
    toolingCb.dispatchEvent(new Event('change', { bubbles: true }));
    await flushTimers();

    const toolOptions = Array.from(sel.options).map(o => o.value).filter(Boolean);
    expect(toolOptions).toEqual(['ApexClass', 'ApexTrigger', 'LightningComponentBundle']);

    // Toggle Tooling off again
    toolingCb.checked = false;
    toolingCb.dispatchEvent(new Event('change', { bubbles: true }));
    await flushTimers();

    const restOptions2 = Array.from(sel.options).map(o => o.value).filter(Boolean);
    expect(restOptions2).toEqual(['Account', 'Contact']);

    // Ensure sendMessage was called with correct flags over time
    const payloads = sendMessageMock.mock.calls.map(c => c[0]).filter(p => p && p.action === 'DESCRIBE_GLOBAL');
    expect(payloads.some(p => p.useTooling === false)).toBe(true);
    expect(payloads.some(p => p.useTooling === true)).toBe(true);
  });
});
