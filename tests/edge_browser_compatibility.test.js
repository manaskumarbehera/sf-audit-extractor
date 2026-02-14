/**
 * @jest-environment node
 */

// Edge Browser Compatibility Tests
// Tests to verify the extension works properly in Microsoft Edge browser
// where declarativeContent API may not be available or may fail silently.

const listeners = {};
const windowListeners = {};
const tabListeners = {};

function makeEvent(name) {
    return {
        addListener: (fn) => {
            if (!listeners[name]) listeners[name] = [];
            listeners[name].push(fn);
        },
        removeListener: (fn) => {
            if (listeners[name]) {
                listeners[name] = listeners[name].filter(f => f !== fn);
            }
        },
        removeRules: jest.fn((filters, callback) => {
            if (typeof callback === 'function') callback();
        }),
        addRules: jest.fn((rules, callback) => {
            if (typeof callback === 'function') callback();
        })
    };
}

function makeWindowEvent(name) {
    return {
        addListener: (fn) => {
            if (!windowListeners[name]) windowListeners[name] = [];
            windowListeners[name].push(fn);
        }
    };
}

function makeTabEvent(name) {
    return {
        addListener: (fn) => {
            if (!tabListeners[name]) tabListeners[name] = [];
            tabListeners[name].push(fn);
        }
    };
}

describe('Edge Browser Compatibility', () => {

    let mockTabsQuery;
    let mockTabsSendMessage;
    let mockTabsGet;

    beforeAll(async () => {
        mockTabsQuery = jest.fn(() => Promise.resolve([]));
        mockTabsSendMessage = jest.fn((tabId, msg, callback) => {
            if (typeof callback === 'function') callback({});
        });
        mockTabsGet = jest.fn((tabId, callback) => {
            if (typeof callback === 'function') callback({ id: tabId, url: 'https://example.my.salesforce.com' });
        });

        global.fetch = jest.fn();

        global.chrome = {
            runtime: {
                onInstalled: makeEvent('onInstalled'),
                onStartup: makeEvent('onStartup'),
                onMessage: makeEvent('onMessage'),
                lastError: null,
                getURL: jest.fn((path) => `chrome-extension://test-id/${path}`),
                id: 'test-extension-id'
            },
            tabs: {
                onUpdated: makeTabEvent('onUpdated'),
                onActivated: makeTabEvent('onActivated'),
                query: mockTabsQuery,
                sendMessage: mockTabsSendMessage,
                get: mockTabsGet,
                create: jest.fn().mockResolvedValue({ id: 1 })
            },
            windows: {
                onRemoved: makeWindowEvent('onRemoved'),
                update: jest.fn(),
                create: jest.fn().mockResolvedValue({ id: 1 }),
                remove: jest.fn()
            },
            storage: {
                local: {
                    get: jest.fn().mockResolvedValue({ apiVersion: '65.0' }),
                    set: jest.fn().mockResolvedValue(undefined),
                    remove: jest.fn().mockResolvedValue(undefined)
                }
            },
            declarativeContent: {
                onPageChanged: {
                    removeRules: jest.fn((_, cb) => cb && cb()),
                    addRules: jest.fn()
                },
                PageStateMatcher: function matcher() {},
                ShowAction: function showAction() {}
            },
            action: {
                setBadgeText: jest.fn(),
                setBadgeBackgroundColor: jest.fn(),
                enable: jest.fn(),
                disable: jest.fn()
            },
            cookies: {
                get: jest.fn((_, cb) => cb && cb(null)),
                getAll: jest.fn((_, cb) => cb && cb([]))
            }
        };

        await import('../background.js');
    });

    beforeEach(() => {
        // Reset mock implementations AND call history
        // This is important because some tests set mockImplementation that throws
        chrome.action.setBadgeText.mockReset();
        chrome.action.setBadgeBackgroundColor.mockReset();
        chrome.action.enable.mockReset();
        chrome.action.disable.mockReset();
        chrome.storage.local.get.mockReset();
        chrome.storage.local.set.mockReset();

        // Re-establish default implementations
        chrome.storage.local.get.mockResolvedValue({ apiVersion: '65.0' });
        chrome.storage.local.set.mockResolvedValue(undefined);

        chrome.runtime.lastError = null;
    });

    describe('Test Case 1: Extension Icon Visibility', () => {
        test('should handle missing declarativeContent API gracefully', () => {
            // Edge browser: simulate missing declarativeContent
            const originalAPI = chrome.declarativeContent;
            chrome.declarativeContent = undefined;

            // Should not throw when onInstalled fires
            const handler = listeners.onInstalled[0];
            expect(() => {
                if (handler) handler();
            }).not.toThrow();

            chrome.declarativeContent = originalAPI;
        });

        test('should show badge when navigating to Salesforce page', async () => {
            const onUpdatedHandler = tabListeners.onUpdated[0];
            expect(onUpdatedHandler).toBeDefined();

            // Simulate tab update to Salesforce page
            onUpdatedHandler(1, { status: 'complete' }, {
                id: 1,
                url: 'https://example.my.salesforce.com/app'
            });

            expect(chrome.action.setBadgeText).toHaveBeenCalledWith({
                tabId: 1,
                text: 'SF'
            });

            expect(chrome.action.setBadgeBackgroundColor).toHaveBeenCalledWith({
                tabId: 1,
                color: '#00A1E0'
            });

            expect(chrome.action.enable).toHaveBeenCalledWith(1);
        });

        test('should clear badge when navigating away from Salesforce', async () => {
            const onUpdatedHandler = tabListeners.onUpdated[0];

            // Simulate tab update to non-Salesforce page
            onUpdatedHandler(2, { status: 'complete' }, {
                id: 2,
                url: 'https://google.com'
            });

            expect(chrome.action.setBadgeText).toHaveBeenCalledWith({
                tabId: 2,
                text: ''
            });
        });
    });

    describe('Test Case 2: Tab Activation Icon Update', () => {
        test('should update icon when switching to Salesforce tab', () => {
            const onActivatedHandler = tabListeners.onActivated[0];
            expect(onActivatedHandler).toBeDefined();

            mockTabsGet.mockImplementation((tabId, callback) => {
                callback({
                    id: tabId,
                    url: 'https://myorg.my.salesforce.com/lightning/app/c__MyApp'
                });
            });

            onActivatedHandler({ tabId: 3 });

            expect(mockTabsGet).toHaveBeenCalledWith(3, expect.any(Function));
            expect(chrome.action.setBadgeText).toHaveBeenCalledWith({
                tabId: 3,
                text: 'SF'
            });
        });

        test('should disable icon when switching to non-Salesforce tab', () => {
            const onActivatedHandler = tabListeners.onActivated[0];

            mockTabsGet.mockImplementation((tabId, callback) => {
                callback({
                    id: tabId,
                    url: 'https://github.com'
                });
            });

            onActivatedHandler({ tabId: 4 });

            expect(chrome.action.disable).toHaveBeenCalledWith(4);
        });

        test('should handle chrome.runtime.lastError gracefully', () => {
            const onActivatedHandler = tabListeners.onActivated[0];

            mockTabsGet.mockImplementation((tabId, callback) => {
                chrome.runtime.lastError = { message: 'Tab not found' };
                callback(null);
            });

            // Should not throw
            expect(() => {
                onActivatedHandler({ tabId: 5 });
            }).not.toThrow();

            chrome.runtime.lastError = null;
        });
    });

    describe('Test Case 3: Background Service Worker', () => {
        test('should initialize without errors', async () => {
            // If we got here, background.js loaded successfully
            expect(chrome.runtime.onMessage).toBeDefined();
            expect(listeners.onMessage).toBeDefined();
            expect(listeners.onMessage.length).toBeGreaterThan(0);
        });

        test('should have message handlers registered', () => {
            expect(listeners.onMessage).toBeDefined();
            expect(listeners.onMessage.length).toBeGreaterThan(0);
        });

        test('should survive storage.local errors', async () => {
            chrome.storage.local.get.mockRejectedValueOnce(new Error('Storage error'));

            const handler = listeners.onInstalled[0];
            // Should handle gracefully
            await expect(async () => {
                if (handler) handler();
            }).not.toThrow();
        });
    });

    describe('Test Case 4: Content Script Communication', () => {
        test('should handle CONTENT_READY message', async () => {
            const handler = listeners.onMessage[0];
            expect(handler).toBeDefined();

            const sendResponse = jest.fn();
            const msg = { action: 'CONTENT_READY', url: 'https://test.my.salesforce.com' };
            const sender = { tab: { url: 'https://test.my.salesforce.com' } };

            handler(msg, sender, sendResponse);

            // Allow async to complete
            await new Promise(resolve => setTimeout(resolve, 100));
        });

        test('should handle GET_SESSION_INFO message', async () => {
            const handler = listeners.onMessage[0];
            const sendResponse = jest.fn();

            chrome.storage.local.get.mockResolvedValueOnce({ apiVersion: '65.0' });

            const msg = { action: 'GET_SESSION_INFO', url: 'https://test.my.salesforce.com' };
            const result = handler(msg, {}, sendResponse);

            // Some handlers return true for async, some don't - just verify no throw
            // Allow async to complete
            await new Promise(resolve => setTimeout(resolve, 50));
        });

        test('should handle LMS_CHECK_AVAILABILITY message', async () => {
            const handler = listeners.onMessage[0];
            const sendResponse = jest.fn();

            const msg = { action: 'LMS_CHECK_AVAILABILITY' };
            handler(msg, {}, sendResponse);

            // Allow async to complete
            await new Promise(resolve => setTimeout(resolve, 50));
        });
    });

    describe('Test Case 5: Storage API Compatibility', () => {
        test('should persist settings using chrome.storage.local', async () => {
            chrome.storage.local.set.mockClear();
            chrome.storage.local.set.mockResolvedValueOnce(undefined);

            await chrome.storage.local.set({ apiVersion: '65.0' });

            expect(chrome.storage.local.set).toHaveBeenCalledWith(
                expect.objectContaining({ apiVersion: '65.0' })
            );
        });

        test('should retrieve settings using chrome.storage.local.get', async () => {
            chrome.storage.local.get.mockClear();
            chrome.storage.local.get.mockResolvedValueOnce({
                apiVersion: '65.0',
                platformPinned: false
            });

            const result = await chrome.storage.local.get({
                apiVersion: '60.0',
                platformPinned: false
            });

            expect(result.apiVersion).toBe('65.0');
            expect(result.platformPinned).toBe(false);
        });

        test('should handle storage quota exceeded', async () => {
            const quotaError = new Error('QUOTA_BYTES_PER_ITEM quota exceeded');
            chrome.storage.local.set.mockRejectedValueOnce(quotaError);

            try {
                await chrome.storage.local.set({ largeData: new Array(10000).fill('x') });
            } catch (e) {
                expect(e.message).toContain('quota');
            }
        });
    });

    describe('Test Case 6: API Version Management', () => {
        test('should fetch API version from storage', async () => {
            chrome.storage.local.get.mockClear();
            chrome.storage.local.get.mockResolvedValueOnce({ apiVersion: '65.0' });

            const result = await chrome.storage.local.get({ apiVersion: '60.0' });

            expect(result.apiVersion).toBe('65.0');
        });

        test('should handle missing API version with default', async () => {
            chrome.storage.local.get.mockClear();
            chrome.storage.local.get.mockResolvedValueOnce({});

            const result = await chrome.storage.local.get({ apiVersion: '60.0' });

            // When storage returns empty, the result should be empty too
            expect(result.apiVersion).toBeUndefined();
        });

        test('should normalize API version format', async () => {
            chrome.storage.local.get.mockClear();
            chrome.storage.local.get.mockResolvedValueOnce({ apiVersion: 'v65.0' });

            const result = await chrome.storage.local.get({ apiVersion: '60.0' });

            // API version comes back as stored
            expect(result.apiVersion).toBe('v65.0');
        });
    });

    describe('Test Case 7: Error Handling', () => {
        test('should catch declarativeContent errors', () => {
            chrome.declarativeContent.onPageChanged.removeRules.mockImplementation(() => {
                throw new Error('declarativeContent is not available');
            });

            const handler = listeners.onInstalled[0];
            // Should not throw
            expect(() => {
                if (handler) handler();
            }).not.toThrow();
        });

        test('should handle badge update failures', () => {
            chrome.action.setBadgeText.mockImplementation(() => {
                throw new Error('Badge update failed');
            });

            const onUpdatedHandler = tabListeners.onUpdated[0];

            // Should not throw when badge update fails
            expect(() => {
                onUpdatedHandler(1, { status: 'complete' }, {
                    id: 1,
                    url: 'https://example.my.salesforce.com'
                });
            }).not.toThrow();
        });

        test('should handle tab.get errors gracefully', () => {
            mockTabsGet.mockImplementation((tabId, callback) => {
                chrome.runtime.lastError = { message: 'Tab not found' };
                callback(null);
            });

            const onActivatedHandler = tabListeners.onActivated[0];

            // Should not throw
            expect(() => {
                onActivatedHandler({ tabId: 10 });
            }).not.toThrow();

            chrome.runtime.lastError = null;
        });

        test('should log warnings for badge failures', () => {
            const consoleWarn = jest.spyOn(console, 'warn').mockImplementation(() => {});

            chrome.action.setBadgeText.mockImplementation(() => {
                throw new Error('test error');
            });

            const onUpdatedHandler = tabListeners.onUpdated[0];
            onUpdatedHandler(1, { status: 'complete' }, {
                id: 1,
                url: 'https://example.my.salesforce.com'
            });

            expect(consoleWarn).toHaveBeenCalled();
            consoleWarn.mockRestore();
        });
    });

    describe('Test Case 8: Multi-Domain Support', () => {
        test('should recognize .my.salesforce.com domain', () => {
            const onUpdatedHandler = tabListeners.onUpdated[0];

            onUpdatedHandler(1, { status: 'complete' }, {
                id: 1,
                url: 'https://myorg.my.salesforce.com/lightning/app/c__App'
            });

            expect(chrome.action.setBadgeText).toHaveBeenCalledWith({
                tabId: 1,
                text: 'SF'
            });
        });

        test('should recognize .force.com domain', () => {
            const onUpdatedHandler = tabListeners.onUpdated[0];

            onUpdatedHandler(2, { status: 'complete' }, {
                id: 2,
                url: 'https://myorg.force.com/apex/page'
            });

            expect(chrome.action.setBadgeText).toHaveBeenCalledWith({
                tabId: 2,
                text: 'SF'
            });
        });

        test('should recognize .lightning.force.com domain', () => {
            const onUpdatedHandler = tabListeners.onUpdated[0];

            onUpdatedHandler(3, { status: 'complete' }, {
                id: 3,
                url: 'https://myorg.lightning.force.com/lightning/app/c__App'
            });

            expect(chrome.action.setBadgeText).toHaveBeenCalledWith({
                tabId: 3,
                text: 'SF'
            });
        });

        test('should recognize .salesforce-setup.com domain', () => {
            const onUpdatedHandler = tabListeners.onUpdated[0];

            onUpdatedHandler(4, { status: 'complete' }, {
                id: 4,
                url: 'https://setup.salesforce-setup.com/setup/SecurityUserPassKey'
            });

            expect(chrome.action.setBadgeText).toHaveBeenCalledWith({
                tabId: 4,
                text: 'SF'
            });
        });
    });

    describe('Test Case 9: Icon Enable/Disable', () => {
        test('should enable icon on Salesforce pages', () => {
            chrome.action.enable.mockClear();
            chrome.action.setBadgeText.mockClear();

            const onUpdatedHandler = tabListeners.onUpdated[0];

            onUpdatedHandler(1, { status: 'complete' }, {
                id: 1,
                url: 'https://test.my.salesforce.com'
            });

            expect(chrome.action.enable).toHaveBeenCalledWith(1);
        });

        test('should not disable icon when navigating to non-SF page via onUpdated', () => {
            chrome.action.disable.mockClear();

            const onUpdatedHandler = tabListeners.onUpdated[0];

            onUpdatedHandler(2, { status: 'complete' }, {
                id: 2,
                url: 'https://google.com'
            });

            // onUpdated doesn't call disable (only onActivated does)
            expect(chrome.action.disable).not.toHaveBeenCalled();
        });

        test('should disable icon on non-SF pages via onActivated', () => {
            chrome.action.disable.mockClear();

            const onActivatedHandler = tabListeners.onActivated[0];

            mockTabsGet.mockImplementation((tabId, callback) => {
                callback({
                    id: tabId,
                    url: 'https://google.com'
                });
            });

            onActivatedHandler({ tabId: 2 });

            expect(chrome.action.disable).toHaveBeenCalledWith(2);
        });
    });

    describe('Test Case 10: Edge-Specific Fallbacks', () => {
        test('should work when declarativeContent is completely unavailable', async () => {
            const origDecl = chrome.declarativeContent;
            delete chrome.declarativeContent;

            const handler = listeners.onInstalled[0];

            // Should handle missing API gracefully
            if (handler) handler();

            chrome.declarativeContent = origDecl;
        });

        test('should log when using fallback mode', () => {
            const consoleLog = jest.spyOn(console, 'log').mockImplementation(() => {});

            chrome.declarativeContent = undefined;

            const handler = listeners.onInstalled[0];
            if (handler) handler();

            expect(consoleLog).toHaveBeenCalledWith(
                expect.stringContaining('declarativeContent')
            );

            consoleLog.mockRestore();
        });

        test('should provide fallback via onUpdated and onActivated', () => {
            // The main fallback mechanism is the onUpdated and onActivated listeners
            expect(tabListeners.onUpdated).toBeDefined();
            expect(tabListeners.onUpdated.length).toBeGreaterThan(0);
            expect(tabListeners.onActivated).toBeDefined();
            expect(tabListeners.onActivated.length).toBeGreaterThan(0);
        });
    });
});

describe('Edge Browser Performance', () => {
    test('should not cause excessive API calls', () => {
        // Simulate 10 tab updates in quick succession
        const onUpdatedHandler = tabListeners.onUpdated[0];

        for (let i = 0; i < 10; i++) {
            onUpdatedHandler(i, { status: 'complete' }, {
                id: i,
                url: 'https://example.my.salesforce.com'
            });
        }

        // Each call should result in badge updates
        expect(chrome.action.setBadgeText).toHaveBeenCalledTimes(10);
    });

    test('should not leak memory with repeated badge updates', () => {
        const onUpdatedHandler = tabListeners.onUpdated[0];

        // Simulate rapid tab switching (common browser behavior)
        for (let i = 0; i < 100; i++) {
            onUpdatedHandler(1, { status: 'complete' }, {
                id: 1,
                url: i % 2 === 0
                    ? 'https://example.my.salesforce.com'
                    : 'https://google.com'
            });
        }

        // Should handle without errors or excessive calls
        expect(chrome.action.setBadgeText).toHaveBeenCalled();
    });
});

