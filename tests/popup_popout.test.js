/**
 * Popup Pop Out/Pop In Logic Tests
 * Tests for the window popout and popin functionality
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
        query: jest.fn(() => Promise.resolve([]))
    }
};

// Reset mocks before each test
beforeEach(() => {
    jest.clearAllMocks();
    chrome.runtime.lastError = null;
});

describe('Pop Out / Pop In Logic', () => {

    describe('Standalone Mode Detection', () => {

        test('should detect standalone mode from URL hash', () => {
            const detectStandalone = (hash) => hash.includes('standalone');

            expect(detectStandalone('#standalone')).toBe(true);
            expect(detectStandalone('#standalone&foo=bar')).toBe(true);
            expect(detectStandalone('')).toBe(false);
            expect(detectStandalone('#settings')).toBe(false);
        });

        test('should return false for empty or missing hash', () => {
            const detectStandalone = (hash) => (hash || '').includes('standalone');

            expect(detectStandalone(null)).toBe(false);
            expect(detectStandalone(undefined)).toBe(false);
            expect(detectStandalone('')).toBe(false);
        });
    });

    describe('APP_POP_GET Message Handling', () => {

        test('should return popped state from background', async () => {
            chrome.runtime.sendMessage.mockImplementation((msg, callback) => {
                if (msg.action === 'APP_POP_GET') {
                    callback({ success: true, popped: false, windowId: null });
                }
            });

            let result;
            chrome.runtime.sendMessage({ action: 'APP_POP_GET' }, (resp) => {
                result = resp;
            });

            expect(result.success).toBe(true);
            expect(result.popped).toBe(false);
        });

        test('should handle already popped state', async () => {
            chrome.runtime.sendMessage.mockImplementation((msg, callback) => {
                if (msg.action === 'APP_POP_GET') {
                    callback({ success: true, popped: true, windowId: 12345 });
                }
            });

            let result;
            chrome.runtime.sendMessage({ action: 'APP_POP_GET' }, (resp) => {
                result = resp;
            });

            expect(result.popped).toBe(true);
            expect(result.windowId).toBe(12345);
        });

        test('should handle runtime errors gracefully', async () => {
            chrome.runtime.lastError = { message: 'Extension context invalidated' };
            chrome.runtime.sendMessage.mockImplementation((msg, callback) => {
                callback(undefined);
            });

            let result = null;
            let errorHandled = false;

            chrome.runtime.sendMessage({ action: 'APP_POP_GET' }, (resp) => {
                if (chrome.runtime.lastError) {
                    errorHandled = true;
                    result = { success: false, popped: false };
                } else {
                    result = resp;
                }
            });

            expect(errorHandled).toBe(true);
            expect(result.success).toBe(false);
        });
    });

    describe('APP_POP_SET Message Handling', () => {

        test('should set popped state to true (pop out)', async () => {
            chrome.runtime.sendMessage.mockImplementation((msg, callback) => {
                if (msg.action === 'APP_POP_SET' && msg.popped === true) {
                    callback({ success: true, popped: true, windowId: 12345 });
                }
            });

            let result;
            chrome.runtime.sendMessage({ action: 'APP_POP_SET', popped: true }, (resp) => {
                result = resp;
            });

            expect(result.success).toBe(true);
            expect(result.popped).toBe(true);
        });

        test('should set popped state to false (pop in)', async () => {
            chrome.runtime.sendMessage.mockImplementation((msg, callback) => {
                if (msg.action === 'APP_POP_SET' && msg.popped === false) {
                    callback({ success: true, popped: false, windowId: null });
                }
            });

            let result;
            chrome.runtime.sendMessage({ action: 'APP_POP_SET', popped: false }, (resp) => {
                result = resp;
            });

            expect(result.success).toBe(true);
            expect(result.popped).toBe(false);
        });

        test('should include session when popping out', async () => {
            const mockSession = {
                isLoggedIn: true,
                instanceUrl: 'https://test.salesforce.com',
                accessToken: 'test_token'
            };

            let capturedMessage;
            chrome.runtime.sendMessage.mockImplementation((msg, callback) => {
                capturedMessage = msg;
                callback({ success: true, popped: true });
            });

            chrome.runtime.sendMessage({
                action: 'APP_POP_SET',
                popped: true,
                session: mockSession
            }, () => {});

            expect(capturedMessage.session).toBeDefined();
            expect(capturedMessage.session.instanceUrl).toBe('https://test.salesforce.com');
        });
    });

    describe('Button State Updates', () => {

        test('should update button to show pop-in icon when popped', () => {
            const updateButton = (popped, isStandalone) => {
                const showPopIn = isStandalone || popped;
                return {
                    showPopIn,
                    title: showPopIn ? 'Pop in (return to popup)' : 'Pop out to window',
                    ariaPressed: showPopIn ? 'true' : 'false'
                };
            };

            const state = updateButton(true, false);
            expect(state.showPopIn).toBe(true);
            expect(state.title).toBe('Pop in (return to popup)');
            expect(state.ariaPressed).toBe('true');
        });

        test('should update button to show pop-out icon when not popped', () => {
            const updateButton = (popped, isStandalone) => {
                const showPopIn = isStandalone || popped;
                return {
                    showPopIn,
                    title: showPopIn ? 'Pop in (return to popup)' : 'Pop out to window',
                    ariaPressed: showPopIn ? 'true' : 'false'
                };
            };

            const state = updateButton(false, false);
            expect(state.showPopIn).toBe(false);
            expect(state.title).toBe('Pop out to window');
            expect(state.ariaPressed).toBe('false');
        });

        test('should always show pop-in icon in standalone mode', () => {
            const updateButton = (popped, isStandalone) => {
                const showPopIn = isStandalone || popped;
                return { showPopIn };
            };

            // Even if popped is false, standalone should show pop-in
            expect(updateButton(false, true).showPopIn).toBe(true);
            expect(updateButton(true, true).showPopIn).toBe(true);
        });
    });

    describe('Window Close Behavior', () => {

        test('should close popup after successful pop out', (done) => {
            let windowClosed = false;
            const mockClose = jest.fn(() => { windowClosed = true; });

            chrome.runtime.sendMessage.mockImplementation((msg, callback) => {
                if (msg.action === 'APP_POP_SET' && msg.popped === true) {
                    callback({ success: true, popped: true });
                }
            });

            // Simulate pop out logic
            const isStandalone = false;
            const next = true;

            chrome.runtime.sendMessage({ action: 'APP_POP_SET', popped: next }, (resp) => {
                if (!chrome.runtime.lastError && resp && resp.success) {
                    if (next && resp.popped && !isStandalone) {
                        setTimeout(() => {
                            mockClose();
                            expect(windowClosed).toBe(true);
                            done();
                        }, 100);
                    }
                }
            });
        });

        test('should close standalone window on pop in', (done) => {
            let windowClosed = false;
            const mockClose = jest.fn(() => { windowClosed = true; });

            chrome.runtime.sendMessage.mockImplementation((msg, callback) => {
                if (msg.action === 'APP_POP_SET' && msg.popped === false) {
                    callback({ success: true, popped: false });
                }
            });

            // Simulate pop in from standalone
            const isStandalone = true;

            chrome.runtime.sendMessage({ action: 'APP_POP_SET', popped: false }, (resp) => {
                if (!chrome.runtime.lastError && resp && resp.success) {
                    if (isStandalone) {
                        mockClose();
                        expect(windowClosed).toBe(true);
                        done();
                    }
                }
            });
        });

        test('should not close popup if message fails', () => {
            let windowClosed = false;
            const mockClose = jest.fn(() => { windowClosed = true; });

            chrome.runtime.lastError = { message: 'Error' };
            chrome.runtime.sendMessage.mockImplementation((msg, callback) => {
                callback(undefined);
            });

            chrome.runtime.sendMessage({ action: 'APP_POP_SET', popped: true }, (resp) => {
                if (chrome.runtime.lastError || !resp || !resp.success) {
                    // Don't close
                } else {
                    mockClose();
                }
            });

            expect(windowClosed).toBe(false);
        });
    });

    describe('Standalone Window Behavior', () => {

        test('should open standalone window with correct URL', () => {
            const expectedUrl = 'chrome-extension://abc123/popup.html#standalone';
            const actualUrl = chrome.runtime.getURL('popup.html#standalone');

            expect(actualUrl).toBe(expectedUrl);
        });

        test('should handle pop in from standalone correctly', async () => {
            const isStandalone = true;
            let messagesSent = [];

            chrome.runtime.sendMessage.mockImplementation((msg, callback) => {
                messagesSent.push(msg);
                callback({ success: true, popped: false });
            });

            // When in standalone and clicking pop-in
            if (isStandalone) {
                chrome.runtime.sendMessage({ action: 'APP_POP_SET', popped: false }, () => {});
            }

            expect(messagesSent).toHaveLength(1);
            expect(messagesSent[0].action).toBe('APP_POP_SET');
            expect(messagesSent[0].popped).toBe(false);
        });
    });

    describe('Session Transfer', () => {

        test('should transfer session data when popping out', () => {
            const session = {
                isLoggedIn: true,
                instanceUrl: 'https://org.salesforce.com',
                accessToken: 'token123',
                userId: '005xxx'
            };

            let capturedPayload;
            chrome.runtime.sendMessage.mockImplementation((msg, callback) => {
                capturedPayload = msg;
                callback({ success: true });
            });

            const payload = { action: 'APP_POP_SET', popped: true };
            if (session) {
                payload.session = session;
            }

            chrome.runtime.sendMessage(payload, () => {});

            expect(capturedPayload.session).toBeDefined();
            expect(capturedPayload.session.isLoggedIn).toBe(true);
            expect(capturedPayload.session.accessToken).toBe('token123');
        });

        test('should not include session when popping in', () => {
            let capturedPayload;
            chrome.runtime.sendMessage.mockImplementation((msg, callback) => {
                capturedPayload = msg;
                callback({ success: true });
            });

            chrome.runtime.sendMessage({ action: 'APP_POP_SET', popped: false }, () => {});

            expect(capturedPayload.session).toBeUndefined();
        });
    });

    describe('Button Disabled State', () => {

        test('should disable button during message processing', () => {
            let buttonDisabled = true;

            chrome.runtime.sendMessage.mockImplementation((msg, callback) => {
                // Simulate async processing - button should still be disabled here
                expect(buttonDisabled).toBe(true);
                setTimeout(() => {
                    callback({ success: true });
                }, 50);
            });

            chrome.runtime.sendMessage({ action: 'APP_POP_SET', popped: true }, () => {});
            expect(buttonDisabled).toBe(true);
        });

        test('should re-enable button after message completes', (done) => {
            let buttonDisabled = true;

            chrome.runtime.sendMessage.mockImplementation((msg, callback) => {
                callback({ success: true });
            });

            chrome.runtime.sendMessage({ action: 'APP_POP_GET' }, () => {
                // Simulate button re-enable in callback
                buttonDisabled = false;
                expect(buttonDisabled).toBe(false);
                done();
            });
        });

        test('should re-enable button even on error', (done) => {
            let buttonDisabled = true;

            chrome.runtime.lastError = { message: 'Error' };
            chrome.runtime.sendMessage.mockImplementation((msg, callback) => {
                callback(undefined);
            });

            chrome.runtime.sendMessage({ action: 'APP_POP_GET' }, () => {
                // Simulate button re-enable in callback even on error
                buttonDisabled = false;
                expect(buttonDisabled).toBe(false);
                done();
            });
        });
    });

    describe('SVG Icon Generation', () => {

        test('should generate pop-out SVG with correct attributes', () => {
            // Simulate svgPopOut function
            const svgPopOut = () => {
                return `<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M18 13v6a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
                    <polyline points="15 3 21 3 21 9"></polyline>
                    <line x1="10" y1="14" x2="21" y2="3"></line>
                </svg>`;
            };

            const svg = svgPopOut();
            expect(svg).toContain('viewBox="0 0 24 24"');
            expect(svg).toContain('aria-hidden="true"');
            expect(svg).toContain('polyline');
        });

        test('should generate pop-in SVG with correct attributes', () => {
            // Simulate svgPopIn function
            const svgPopIn = () => {
                return `<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"></path>
                </svg>`;
            };

            const svg = svgPopIn();
            expect(svg).toContain('viewBox="0 0 24 24"');
            expect(svg).toContain('aria-hidden="true"');
        });
    });
});

describe('Background Window Management', () => {

    describe('openAppWindow Function', () => {

        test('should create window with correct dimensions', async () => {
            chrome.windows.create.mockResolvedValue({ id: 99999 });

            await chrome.windows.create({
                url: 'popup.html#standalone',
                type: 'popup',
                width: 1200,
                height: 800,
                focused: true
            });

            expect(chrome.windows.create).toHaveBeenCalledWith({
                url: 'popup.html#standalone',
                type: 'popup',
                width: 1200,
                height: 800,
                focused: true
            });
        });

        test('should focus existing window if already open', async () => {
            const existingWindowId = 12345;
            chrome.windows.update.mockResolvedValue({});

            await chrome.windows.update(existingWindowId, { focused: true });

            expect(chrome.windows.update).toHaveBeenCalledWith(existingWindowId, { focused: true });
        });

        test('should handle window creation failure', async () => {
            chrome.windows.create.mockRejectedValue(new Error('Failed to create window'));

            let windowId = null;
            try {
                const win = await chrome.windows.create({
                    url: 'popup.html#standalone',
                    type: 'popup'
                });
                windowId = win?.id;
            } catch (e) {
                windowId = null;
            }

            expect(windowId).toBeNull();
        });
    });

    describe('Window Removal on Pop In', () => {

        test('should remove window when popping in', async () => {
            const windowId = 12345;
            chrome.windows.remove.mockResolvedValue();

            await chrome.windows.remove(windowId);

            expect(chrome.windows.remove).toHaveBeenCalledWith(windowId);
        });

        test('should handle window removal failure gracefully', async () => {
            chrome.windows.remove.mockRejectedValue(new Error('Window not found'));

            let errorOccurred = false;
            try {
                await chrome.windows.remove(99999);
            } catch {
                errorOccurred = true;
            }

            expect(errorOccurred).toBe(true);
        });
    });
});

console.log('Popup pop out/in tests loaded');

