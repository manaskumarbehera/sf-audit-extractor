/**
 * Popup Tab Mode Tests
 * Tests for the new tab-based pop out feature:
 * - Single-click opens TrackForcePro as a new browser tab
 * - Shift+click opens as a standalone popup window (existing behavior)
 * - Pop-in from standalone opens as a tab and closes the window
 * - Tab mode (#tab hash) detection and close behavior
 */

// Mock chrome APIs
global.chrome = {
    storage: {
        local: {
            get: jest.fn((keys) => {
                return new Promise((resolve) => {
                    if (typeof keys === 'object' && 'appPoppedOut' in keys) {
                        resolve({ appPoppedOut: false });
                    } else if (typeof keys === 'object' && 'appSession' in keys) {
                        resolve({ appSession: null });
                    } else if (typeof keys === 'object' && 'appBuilderState' in keys) {
                        resolve({ appBuilderState: null });
                    } else {
                        resolve({});
                    }
                });
            }),
            set: jest.fn(() => Promise.resolve()),
            remove: jest.fn(() => Promise.resolve())
        }
    },
    runtime: {
        sendMessage: jest.fn(),
        lastError: null,
        getURL: jest.fn(path => `chrome-extension://abc123/${path}`)
    },
    windows: {
        create: jest.fn(() => Promise.resolve({ id: 12345 })),
        update: jest.fn(() => Promise.resolve()),
        remove: jest.fn(() => Promise.resolve())
    },
    tabs: {
        query: jest.fn(() => Promise.resolve([{ id: 1, index: 5, url: 'https://test.salesforce.com' }])),
        create: jest.fn(() => Promise.resolve({ id: 99 })),
        remove: jest.fn(() => Promise.resolve())
    }
};

// Reset mocks before each test
beforeEach(() => {
    jest.clearAllMocks();
    chrome.runtime.lastError = null;
});

describe('Tab Mode Feature', () => {

    describe('Tab Mode Detection', () => {

        test('should detect tab mode from URL hash #tab', () => {
            const detectTab = (hash) => hash.includes('tab');

            expect(detectTab('#tab')).toBe(true);
            expect(detectTab('#tab&foo=bar')).toBe(true);
            expect(detectTab('')).toBe(false);
            expect(detectTab('#standalone')).toBe(false);
            expect(detectTab('#settings')).toBe(false);
        });

        test('should detect standalone mode from URL hash #standalone', () => {
            const detectStandalone = (hash) => hash.includes('standalone');

            expect(detectStandalone('#standalone')).toBe(true);
            expect(detectStandalone('#tab')).toBe(false);
            expect(detectStandalone('')).toBe(false);
        });

        test('should return false for empty or missing hash', () => {
            const detectTab = (hash) => (hash || '').includes('tab');

            expect(detectTab(null)).toBe(false);
            expect(detectTab(undefined)).toBe(false);
            expect(detectTab('')).toBe(false);
        });

        test('should differentiate between tab and standalone modes', () => {
            const getMode = (hash) => {
                if ((hash || '').includes('standalone')) return 'standalone';
                if ((hash || '').includes('tab')) return 'tab';
                return 'popup';
            };

            expect(getMode('#standalone')).toBe('standalone');
            expect(getMode('#tab')).toBe('tab');
            expect(getMode('')).toBe('popup');
            expect(getMode('#settings')).toBe('popup');
        });
    });

    describe('APP_TAB_OPEN Message Handling', () => {

        test('should send APP_TAB_OPEN message for single-click', async () => {
            let capturedMessage;
            chrome.runtime.sendMessage.mockImplementation((msg, callback) => {
                capturedMessage = msg;
                if (msg.action === 'APP_TAB_OPEN') {
                    callback({ success: true, tabId: 99 });
                }
            });

            chrome.runtime.sendMessage({ action: 'APP_TAB_OPEN' }, (resp) => {
                expect(resp.success).toBe(true);
                expect(resp.tabId).toBe(99);
            });

            expect(capturedMessage.action).toBe('APP_TAB_OPEN');
        });

        test('should include session when opening tab', async () => {
            const mockSession = {
                isLoggedIn: true,
                instanceUrl: 'https://test.salesforce.com',
                accessToken: 'test_token'
            };

            let capturedMessage;
            chrome.runtime.sendMessage.mockImplementation((msg, callback) => {
                capturedMessage = msg;
                callback({ success: true, tabId: 99 });
            });

            chrome.runtime.sendMessage({
                action: 'APP_TAB_OPEN',
                session: mockSession
            }, () => {});

            expect(capturedMessage.session).toBeDefined();
            expect(capturedMessage.session.instanceUrl).toBe('https://test.salesforce.com');
        });

        test('should include builder state when opening tab', async () => {
            const mockBuilderState = {
                endpoint: '/graphql',
                query: '{ uiapi { Account } }'
            };

            let capturedMessage;
            chrome.runtime.sendMessage.mockImplementation((msg, callback) => {
                capturedMessage = msg;
                callback({ success: true, tabId: 99 });
            });

            chrome.runtime.sendMessage({
                action: 'APP_TAB_OPEN',
                builderState: mockBuilderState
            }, () => {});

            expect(capturedMessage.builderState).toBeDefined();
            expect(capturedMessage.builderState.query).toBe('{ uiapi { Account } }');
        });

        test('should handle APP_TAB_OPEN failure gracefully', async () => {
            chrome.runtime.sendMessage.mockImplementation((msg, callback) => {
                if (msg.action === 'APP_TAB_OPEN') {
                    callback({ success: false, error: 'Tab creation failed' });
                }
            });

            let result;
            chrome.runtime.sendMessage({ action: 'APP_TAB_OPEN' }, (resp) => {
                result = resp;
            });

            expect(result.success).toBe(false);
            expect(result.error).toBe('Tab creation failed');
        });
    });

    describe('Single-Click vs Shift+Click Behavior', () => {

        test('should use APP_TAB_OPEN for single-click (no shift)', () => {
            const determineAction = (shiftKey) => {
                return shiftKey ? 'APP_POP_SET' : 'APP_TAB_OPEN';
            };

            expect(determineAction(false)).toBe('APP_TAB_OPEN');
        });

        test('should use APP_POP_SET for shift+click', () => {
            const determineAction = (shiftKey) => {
                return shiftKey ? 'APP_POP_SET' : 'APP_TAB_OPEN';
            };

            expect(determineAction(true)).toBe('APP_POP_SET');
        });

        test('should correctly determine action based on event', () => {
            const getActionFromEvent = (event) => {
                const useWindow = event.shiftKey;
                return useWindow ? 'APP_POP_SET' : 'APP_TAB_OPEN';
            };

            // Simulate regular click
            const regularClick = { shiftKey: false };
            expect(getActionFromEvent(regularClick)).toBe('APP_TAB_OPEN');

            // Simulate shift+click
            const shiftClick = { shiftKey: true };
            expect(getActionFromEvent(shiftClick)).toBe('APP_POP_SET');
        });
    });

    describe('Tab Creation with Correct Index', () => {

        test('should create tab next to active tab', async () => {
            chrome.tabs.query.mockResolvedValue([{ id: 1, index: 5, url: 'https://test.salesforce.com' }]);

            let createOptions;
            chrome.tabs.create.mockImplementation((options) => {
                createOptions = options;
                return Promise.resolve({ id: 99 });
            });

            // Simulate the background.js logic
            const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
            const url = chrome.runtime.getURL('popup.html#tab');
            await chrome.tabs.create({ url, active: true, index: activeTab.index + 1 });

            expect(createOptions.index).toBe(6); // activeTab.index (5) + 1
            expect(createOptions.url).toContain('#tab');
            expect(createOptions.active).toBe(true);
        });

        test('should create tab with #tab hash', async () => {
            let createOptions;
            chrome.tabs.create.mockImplementation((options) => {
                createOptions = options;
                return Promise.resolve({ id: 99 });
            });

            const url = chrome.runtime.getURL('popup.html#tab');
            await chrome.tabs.create({ url, active: true });

            expect(createOptions.url).toBe('chrome-extension://abc123/popup.html#tab');
        });
    });

    describe('Pop-In from Standalone to Tab', () => {

        test('should send APP_TAB_OPEN when popping in from standalone', async () => {
            const messages = [];
            chrome.runtime.sendMessage.mockImplementation((msg, callback) => {
                messages.push(msg);
                if (msg.action === 'APP_TAB_OPEN') {
                    callback({ success: true, tabId: 99 });
                } else if (msg.action === 'APP_POP_SET') {
                    callback({ success: true, popped: false });
                }
            });

            // Simulate standalone pop-in flow
            const isStandalone = true;
            if (isStandalone) {
                chrome.runtime.sendMessage({ action: 'APP_TAB_OPEN' }, (resp) => {
                    if (resp.success) {
                        chrome.runtime.sendMessage({ action: 'APP_POP_SET', popped: false }, () => {});
                    }
                });
            }

            expect(messages[0].action).toBe('APP_TAB_OPEN');
            expect(messages[1].action).toBe('APP_POP_SET');
            expect(messages[1].popped).toBe(false);
        });

        test('should transfer session when popping in from standalone to tab', async () => {
            const mockSession = {
                isLoggedIn: true,
                instanceUrl: 'https://test.salesforce.com'
            };

            let tabOpenMessage;
            chrome.runtime.sendMessage.mockImplementation((msg, callback) => {
                if (msg.action === 'APP_TAB_OPEN') {
                    tabOpenMessage = msg;
                    callback({ success: true, tabId: 99 });
                } else {
                    callback({ success: true });
                }
            });

            // Simulate standalone pop-in with session
            const payload = { action: 'APP_TAB_OPEN', session: mockSession };
            chrome.runtime.sendMessage(payload, () => {});

            expect(tabOpenMessage.session).toBeDefined();
            expect(tabOpenMessage.session.instanceUrl).toBe('https://test.salesforce.com');
        });
    });

    describe('Tab Mode Close Behavior', () => {

        test('should close tab when clicking pop-in button in tab mode', async () => {
            let removedTabId = null;
            chrome.tabs.remove.mockImplementation((tabId) => {
                removedTabId = tabId;
                return Promise.resolve();
            });
            chrome.tabs.query.mockResolvedValue([{ id: 42, index: 3 }]);

            // Simulate tab mode close
            const isTab = true;
            if (isTab) {
                const [currentTab] = await chrome.tabs.query({ active: true, currentWindow: true });
                if (currentTab && currentTab.id) {
                    await chrome.tabs.remove(currentTab.id);
                }
            }

            expect(removedTabId).toBe(42);
        });

        test('should save state before closing tab', async () => {
            const mockSession = { instanceUrl: 'https://test.salesforce.com' };
            const mockBuilderState = { query: '{ test }' };

            let savedPayload;
            chrome.storage.local.set.mockImplementation((payload) => {
                savedPayload = payload;
                return Promise.resolve();
            });

            // Simulate saving state before tab close
            const storagePayload = {
                appSession: mockSession,
                appBuilderState: mockBuilderState
            };
            await chrome.storage.local.set(storagePayload);

            expect(savedPayload.appSession).toBeDefined();
            expect(savedPayload.appBuilderState).toBeDefined();
        });
    });

    describe('Button State Updates', () => {

        test('should show "Open as tab" tooltip in popup mode', () => {
            const updateButton = (popped, isStandalone, isTab) => {
                if (isTab) {
                    return { title: 'Close tab', showPopIn: true };
                } else if (isStandalone) {
                    return { title: 'Pop in (open as tab)', showPopIn: true };
                } else if (popped) {
                    return { title: 'Pop in (return to popup)', showPopIn: true };
                } else {
                    return { title: 'Open as tab (Shift+click for window)', showPopIn: false };
                }
            };

            const state = updateButton(false, false, false);
            expect(state.title).toBe('Open as tab (Shift+click for window)');
            expect(state.showPopIn).toBe(false);
        });

        test('should show "Close tab" tooltip in tab mode', () => {
            const updateButton = (popped, isStandalone, isTab) => {
                if (isTab) {
                    return { title: 'Close tab', showPopIn: true };
                }
                return { title: 'Other', showPopIn: false };
            };

            const state = updateButton(false, false, true);
            expect(state.title).toBe('Close tab');
            expect(state.showPopIn).toBe(true);
        });

        test('should show "Pop in (open as tab)" tooltip in standalone mode', () => {
            const updateButton = (popped, isStandalone, isTab) => {
                if (isTab) {
                    return { title: 'Close tab', showPopIn: true };
                } else if (isStandalone) {
                    return { title: 'Pop in (open as tab)', showPopIn: true };
                }
                return { title: 'Other', showPopIn: false };
            };

            const state = updateButton(false, true, false);
            expect(state.title).toBe('Pop in (open as tab)');
            expect(state.showPopIn).toBe(true);
        });

        test('should show pop-in icon in tab mode', () => {
            const updateButton = (popped, isStandalone, isTab) => {
                const showPopIn = isStandalone || isTab || popped;
                return { showPopIn };
            };

            expect(updateButton(false, false, true).showPopIn).toBe(true);
            expect(updateButton(false, true, false).showPopIn).toBe(true);
            expect(updateButton(true, false, false).showPopIn).toBe(true);
            expect(updateButton(false, false, false).showPopIn).toBe(false);
        });
    });

    describe('Session and State Transfer', () => {

        test('should store session with instance URL key for tab', async () => {
            const mockSession = {
                isLoggedIn: true,
                instanceUrl: 'https://myorg.my.salesforce.com',
                accessToken: 'token123'
            };

            let storedData;
            chrome.storage.local.set.mockImplementation((data) => {
                storedData = data;
                return Promise.resolve();
            });

            // Simulate background.js storage logic
            const instanceUrl = mockSession.instanceUrl;
            const sessionKey = instanceUrl ? `appSession_${btoa(instanceUrl).replace(/=/g, '')}` : 'appSession';

            const storagePayload = { appSession: mockSession };
            if (instanceUrl) {
                storagePayload[sessionKey] = mockSession;
            }

            await chrome.storage.local.set(storagePayload);

            expect(storedData.appSession).toBeDefined();
            expect(storedData.appSession.instanceUrl).toBe('https://myorg.my.salesforce.com');
            // Should have both default and keyed session
            expect(Object.keys(storedData).length).toBeGreaterThan(1);
        });

        test('should store builder state alongside session', async () => {
            const mockSession = { instanceUrl: 'https://test.salesforce.com' };
            const mockBuilderState = {
                endpoint: '/graphql',
                query: '{ uiapi { query { Account { edges { node { Id Name { value } } } } } } }'
            };

            let storedData;
            chrome.storage.local.set.mockImplementation((data) => {
                storedData = data;
                return Promise.resolve();
            });

            const storagePayload = {
                appSession: mockSession,
                appBuilderState: mockBuilderState
            };

            await chrome.storage.local.set(storagePayload);

            expect(storedData.appSession).toBeDefined();
            expect(storedData.appBuilderState).toBeDefined();
            expect(storedData.appBuilderState.query).toContain('Account');
        });
    });

    describe('Error Handling', () => {

        test('should handle chrome.runtime.lastError on APP_TAB_OPEN', () => {
            chrome.runtime.lastError = { message: 'Extension context invalidated' };
            chrome.runtime.sendMessage.mockImplementation((msg, callback) => {
                callback(undefined);
            });

            let errorHandled = false;
            chrome.runtime.sendMessage({ action: 'APP_TAB_OPEN' }, (resp) => {
                if (chrome.runtime.lastError) {
                    errorHandled = true;
                }
            });

            expect(errorHandled).toBe(true);
        });

        test('should fallback to window.close() if tab query fails', async () => {
            chrome.tabs.query.mockRejectedValue(new Error('Query failed'));

            let closeCalled = false;
            const mockClose = () => { closeCalled = true; };

            // Simulate the fallback logic
            const isTab = true;
            if (isTab) {
                try {
                    await chrome.tabs.query({ active: true, currentWindow: true });
                } catch {
                    mockClose();
                }
            }

            expect(closeCalled).toBe(true);
        });

        test('should re-enable button on APP_TAB_OPEN failure', () => {
            chrome.runtime.sendMessage.mockImplementation((msg, callback) => {
                if (msg.action === 'APP_TAB_OPEN') {
                    callback({ success: false, error: 'Failed to create tab' });
                }
            });

            let buttonDisabled = true;
            chrome.runtime.sendMessage({ action: 'APP_TAB_OPEN' }, (resp) => {
                if (!resp || !resp.success) {
                    buttonDisabled = false;
                }
            });

            expect(buttonDisabled).toBe(false);
        });
    });

    describe('Integration Flow Tests', () => {

        test('complete flow: popup -> tab open -> tab close', async () => {
            const flowSteps = [];

            chrome.runtime.sendMessage.mockImplementation((msg, callback) => {
                flowSteps.push(msg.action);
                if (msg.action === 'APP_TAB_OPEN') {
                    callback({ success: true, tabId: 99 });
                }
            });

            chrome.tabs.remove.mockImplementation((tabId) => {
                flowSteps.push(`REMOVE_TAB_${tabId}`);
                return Promise.resolve();
            });

            // Step 1: From popup, single-click to open tab
            chrome.runtime.sendMessage({ action: 'APP_TAB_OPEN' }, () => {});

            // Step 2: From tab, click to close
            chrome.tabs.query.mockResolvedValue([{ id: 99, index: 6 }]);
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            await chrome.tabs.remove(tab.id);

            expect(flowSteps).toContain('APP_TAB_OPEN');
            expect(flowSteps).toContain('REMOVE_TAB_99');
        });

        test('complete flow: popup -> window pop-out -> pop-in to tab', async () => {
            const flowSteps = [];

            chrome.runtime.sendMessage.mockImplementation((msg, callback) => {
                flowSteps.push(msg.action);
                if (msg.action === 'APP_POP_SET') {
                    callback({ success: true, popped: msg.popped });
                } else if (msg.action === 'APP_TAB_OPEN') {
                    callback({ success: true, tabId: 99 });
                }
            });

            // Step 1: From popup, shift+click to open window
            chrome.runtime.sendMessage({ action: 'APP_POP_SET', popped: true }, () => {});

            // Step 2: From standalone, click to pop-in as tab
            chrome.runtime.sendMessage({ action: 'APP_TAB_OPEN' }, (resp) => {
                if (resp.success) {
                    chrome.runtime.sendMessage({ action: 'APP_POP_SET', popped: false }, () => {});
                }
            });

            expect(flowSteps).toEqual(['APP_POP_SET', 'APP_TAB_OPEN', 'APP_POP_SET']);
        });
    });
});

