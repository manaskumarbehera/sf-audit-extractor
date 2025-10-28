/**
 * @jest-environment jsdom
 */

// Minimal Utils stub to satisfy audit_helper
window.Utils = {
  escapeHtml: (s) => String(s)
    .replace(/&/g,'&amp;')
    .replace(/</g,'&lt;')
    .replace(/>/g,'&gt;')
    .replace(/\"/g,'&quot;')
    .replace(/'/g,'&#39;'),
  showToast: () => {},
  openRecordInNewTab: () => {},
  setInstanceUrlCache: () => {}
};

document.body.innerHTML = `
  <button id="export-btn"></button>
  <div id="logs-container"></div>
  <div id="stats"></div>
  <span id="total-count"></span>
  <span id="user-count"></span>
  <span id="security-count"></span>
  <span id="object-count"></span>
`;

// Load the module under test
require('../audit_helper.js');

const { _test } = window.AuditHelper;

function createAuditRecord(partial = {}) {
  return Object.assign({
    Id: '1',
    Action: 'Update User',
    Section: 'User Management',
    CreatedDate: '2024-01-01T00:00:00.000Z',
    CreatedBy: { Name: 'Admin' },
    CreatedById: '005xx0000012345AAA',
    Display: 'Changed Profile',
    DelegateUser: 'delegated.user@example.com'
  }, partial);
}

describe('AuditHelper export', () => {
  test('Display and Delegate User fields flow into state and CSV', async () => {
    // Feed data
    _test.processAuditData([
      createAuditRecord(),
      createAuditRecord({ Id: '2', display: 'lowercase display alias', delegateUser: 'alias@example.com' })
    ]);

    const state = _test.getState();
    expect(state.allLogs.length).toBe(2);
    expect(state.allLogs[0].display).toBe('Changed Profile');
    expect(state.allLogs[0].delegateUser).toBe('delegated.user@example.com');
    expect(state.allLogs[1].display).toBe('lowercase display alias');
    expect(state.allLogs[1].delegateUser).toBe('alias@example.com');

    // Spy on link creation to capture CSV
    const urls = [];
    const origCreateObjectURL = URL.createObjectURL;
    URL.createObjectURL = (blob) => {
      urls.push(blob);
      return 'blob:mock';
    };

    // Stub anchor click but keep it a real element so appendChild works
    const clicks = [];
    const origCreateElement = document.createElement.bind(document);
    document.createElement = (tag) => {
      const el = origCreateElement(tag);
      if (tag.toLowerCase() === 'a') {
        el.click = () => clicks.push('clicked');
      }
      return el;
    };

    _test.handleExport();

    expect(clicks.includes('clicked')).toBe(true);
    expect(urls.length).toBe(1);

    // Validate CSV content via FileReader
    const csv = await new Promise((resolve, reject) => {
      const fr = new FileReader();
      fr.onload = () => resolve(String(fr.result));
      fr.onerror = (e) => reject(e);
      fr.readAsText(urls[0]);
    });
    try {
      expect(csv).toContain('Display,Delegate User');
      expect(csv).toContain('Changed Profile');
      expect(csv).toContain('delegated.user@example.com');
      expect(csv).toContain('lowercase display alias');
      expect(csv).toContain('alias@example.com');
    } finally {
      URL.createObjectURL = origCreateObjectURL;
      document.createElement = origCreateElement;
    }
  });
});

