/**
 * @jest-environment jsdom
 */

// Mocks for globals
window.Utils = {
    getAccessToken: (session) => session ? session.accessToken : null,
    setInstanceUrlCache: jest.fn(),
    normalizeApiVersion: (v) => v
};

window.SettingsHelper = {
    ensureSettingsTabExists: jest.fn(),
    injectFlexCss: jest.fn(),
    applyTabVisibilityFromStorage: jest.fn().mockResolvedValue({}),
    buildSettingsPanel: jest.fn().mockResolvedValue(),
    firstVisibleTabName: jest.fn().mockReturnValue('sf'),
    showTab: jest.fn().mockReturnValue('sf')
};

window.chrome = {
    storage: {
        local: {
            get: jest.fn(),
            set: jest.fn(),
            remove: jest.fn()
        }
    },
    runtime: {
        sendMessage: jest.fn(),
        lastError: null,
        getURL: jest.fn(path => path)
    },
    tabs: {
        query: jest.fn(),
        sendMessage: jest.fn()
    },
    action: {
        setTitle: jest.fn()
    }
};

// Mock fetch
global.fetch = jest.fn();

// DOM Setup
document.body.innerHTML = `
    <div id="status">
        <span class="status-text"></span>
    </div>
    <button id="app-pop"></button>
    <select id="api-version"><option value="60.0">60.0</option></select>
    <div class="tab-pane" data-tab="settings"></div>
`;

// Helper to reset mocks and DOM
function resetMocks() {
    jest.clearAllMocks();
    document.title = 'TrackForcePro';
    window.location.hash = '';
    window.chrome.runtime.lastError = null;

    // Default storage mock
    window.chrome.storage.local.get.mockImplementation((keys, callback) => {
        if (callback) callback({});
        return Promise.resolve({});
    });

    // Default connection check (fresh session fail)
    window.chrome.tabs.query.mockResolvedValue([{ id: 1, url: 'https://example.com' }]);
}

describe('Popup Title Logic', () => {
    beforeEach(() => {
        resetMocks();
        jest.resetModules(); // Important to re-execute popup.js
    });

    test('sets title to "[OrgName] - TrackForcePro" when in standalone mode and session is restored', async () => {
        // 1. Simulate Standalone Mode
        window.location.hash = '#standalone';

        // 2. Mock Stored Session with Org Info
        const mockSession = {
            isLoggedIn: true,
            instanceUrl: 'https://tfp.my.salesforce.com',
            accessToken: 'mock_token'
        };

        window.chrome.storage.local.get.mockImplementation((arg, cb) => {
            // popup.js calls get({ appSession: null }, cb)
            // also calls get({ apiVersion: ... })
            if (arg && typeof arg === 'object' && 'appSession' in arg) {
                const res = { appSession: mockSession };
                if (cb) cb(res);
                return Promise.resolve(res);
            }
            if (cb) cb({});
            return Promise.resolve({});
        });

        // 3. Mock window.Utils if needed, or getAccessToken
        // popup.js has local `getAccessToken` inside init, but `fetchOrgName` uses it.
        // Wait, popup.js defines `getAccessToken` internally using `sessionInfo` variable.
        // We need `fetchOrgName` to succeed.

        // Mock fetch for Org Name
        global.fetch.mockResolvedValue({
            ok: true,
            json: async () => ({ records: [{ Name: 'AcmeCorp' }] })
        });

        // 4. Load popup.js
        require('../popup.js');

        // 5. Wait for async operations
        // init() is async, but we don't have a handle to it.
        // We can wait for fetch to be called and promises to resolve.
        await new Promise(process.nextTick);
        await new Promise(r => setTimeout(r, 10)); // tiny delay for promise chain

        // 6. Assertions
        expect(global.fetch).toHaveBeenCalled();
        expect(document.title).toBe('AcmeCorp - TrackForcePro');
    });

    test('does NOT update title if not in standalone mode', async () => {
        // 1. Normal Mode
        window.location.hash = '';

        // 2. Same mock session
        const mockSession = {
            isLoggedIn: true,
            instanceUrl: 'https://tfp.my.salesforce.com',
            accessToken: 'mock_token'
        };

        window.chrome.storage.local.get.mockImplementation((arg, cb) => {
            if (arg && 'appSession' in arg) {
                 const res = { appSession: mockSession };
                 if (cb) cb(res);
                 return Promise.resolve(res);
            }
            if (cb) cb({});
            return Promise.resolve({});
        });

        global.fetch.mockResolvedValue({
            ok: true,
            json: async () => ({ records: [{ Name: 'AcmeCorp' }] })
        });

        require('../popup.js');

        await new Promise(r => setTimeout(r, 10));

        // existing logic might fetch org name for status update, but shouldn't touch document.title
        // actually existing logic DOES fetch org name update status.
        // But my change only updates document.title if hash includes standalone.

        expect(document.title).toBe('TrackForcePro');
    });
});

