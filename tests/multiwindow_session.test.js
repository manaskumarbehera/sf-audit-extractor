/**
 * Tests for multi-window session isolation
 * Ensures that each browser window gets session data from its own active SF tab
 */

// Mock Chrome APIs
let mockTabs = [];
let mockCurrentWindowId = 1;

const chrome = {
    tabs: {
        query: jest.fn((queryInfo) => {
            let filtered = [...mockTabs];

            // Filter by URL pattern
            if (queryInfo.url) {
                const patterns = Array.isArray(queryInfo.url) ? queryInfo.url : [queryInfo.url];
                filtered = filtered.filter(t => {
                    return patterns.some(pattern => {
                        if (pattern.includes('salesforce.com')) {
                            return t.url && t.url.includes('salesforce.com');
                        }
                        if (pattern.includes('force.com')) {
                            return t.url && t.url.includes('force.com');
                        }
                        if (pattern.includes('salesforce-setup.com')) {
                            return t.url && t.url.includes('salesforce-setup.com');
                        }
                        return false;
                    });
                });
            }

            return Promise.resolve(filtered);
        }),
        sendMessage: jest.fn()
    },
    windows: {
        getCurrent: jest.fn(() => Promise.resolve({ id: mockCurrentWindowId }))
    },
    runtime: {
        lastError: null
    }
};

global.chrome = chrome;

// Simplified findSalesforceTab implementation (mirrors utils.js)
async function findSalesforceTab() {
    try {
        const matches = await chrome.tabs.query({
            url: ['https://*.salesforce.com/*', 'https://*.force.com/*', 'https://*.salesforce-setup.com/*']
        });
        if (!Array.isArray(matches) || matches.length === 0) return null;

        let currentWindowId = null;
        try {
            const current = await chrome.windows.getCurrent({ populate: false });
            currentWindowId = current?.id ?? null;
        } catch {}

        // If we know current window, strictly filter to that window first
        if (currentWindowId != null) {
            const currentWindowTabs = matches.filter(t => t.windowId === currentWindowId);
            if (currentWindowTabs.length > 0) {
                // Prefer active tab in current window
                const activeInCurrent = currentWindowTabs.find(t => t.active);
                return activeInCurrent || currentWindowTabs[0];
            }
        }

        // Fallback: try to find any active SF tab (for standalone windows)
        const anyActive = matches.find(t => t.active);
        if (anyActive) return anyActive;

        // Last resort: first SF tab found (least preferred)
        return matches[0] || null;
    } catch { return null; }
}

describe('Multi-Window Session Isolation', () => {
    beforeEach(() => {
        mockTabs = [];
        mockCurrentWindowId = 1;
        jest.clearAllMocks();
    });

    describe('findSalesforceTab', () => {
        test('should return active SF tab from current window', async () => {
            mockCurrentWindowId = 1;
            mockTabs = [
                { id: 1, url: 'https://dev-org.my.salesforce.com/home', active: true, windowId: 1 },
                { id: 2, url: 'https://prod-org.my.salesforce.com/home', active: true, windowId: 2 }
            ];

            const tab = await findSalesforceTab();

            expect(tab).not.toBeNull();
            expect(tab.id).toBe(1);
            expect(tab.url).toContain('dev-org');
        });

        test('should NOT return SF tab from different window when current window has SF tab', async () => {
            mockCurrentWindowId = 2;
            mockTabs = [
                { id: 1, url: 'https://dev-org.my.salesforce.com/home', active: true, windowId: 1 },
                { id: 2, url: 'https://prod-org.my.salesforce.com/home', active: true, windowId: 2 }
            ];

            const tab = await findSalesforceTab();

            expect(tab).not.toBeNull();
            expect(tab.id).toBe(2);
            expect(tab.url).toContain('prod-org');
        });

        test('should return inactive SF tab from current window if no active SF tab', async () => {
            mockCurrentWindowId = 1;
            mockTabs = [
                { id: 1, url: 'https://dev-org.my.salesforce.com/home', active: false, windowId: 1 },
                { id: 2, url: 'https://prod-org.my.salesforce.com/home', active: true, windowId: 2 }
            ];

            const tab = await findSalesforceTab();

            // Should return the tab from current window even if not active
            expect(tab).not.toBeNull();
            expect(tab.id).toBe(1);
            expect(tab.url).toContain('dev-org');
        });

        test('should return active SF tab from any window if current window has no SF tabs', async () => {
            mockCurrentWindowId = 3; // Window 3 has no SF tabs
            mockTabs = [
                { id: 1, url: 'https://dev-org.my.salesforce.com/home', active: false, windowId: 1 },
                { id: 2, url: 'https://prod-org.my.salesforce.com/home', active: true, windowId: 2 }
            ];

            const tab = await findSalesforceTab();

            // Should fallback to active SF tab in another window
            expect(tab).not.toBeNull();
            expect(tab.id).toBe(2);
            expect(tab.url).toContain('prod-org');
        });

        test('should return null if no SF tabs exist', async () => {
            mockCurrentWindowId = 1;
            mockTabs = [
                { id: 1, url: 'https://google.com', active: true, windowId: 1 },
                { id: 2, url: 'https://github.com', active: true, windowId: 2 }
            ];

            const tab = await findSalesforceTab();

            expect(tab).toBeNull();
        });

        test('should handle multiple SF tabs in current window - prefer active', async () => {
            mockCurrentWindowId = 1;
            mockTabs = [
                { id: 1, url: 'https://dev-org.my.salesforce.com/home', active: false, windowId: 1 },
                { id: 2, url: 'https://uat-org.my.salesforce.com/home', active: true, windowId: 1 },
                { id: 3, url: 'https://prod-org.my.salesforce.com/home', active: true, windowId: 2 }
            ];

            const tab = await findSalesforceTab();

            expect(tab).not.toBeNull();
            expect(tab.id).toBe(2);
            expect(tab.url).toContain('uat-org');
        });

        test('should handle Lightning domain', async () => {
            mockCurrentWindowId = 1;
            mockTabs = [
                { id: 1, url: 'https://dev-org.lightning.force.com/one/one.app', active: true, windowId: 1 }
            ];

            const tab = await findSalesforceTab();

            expect(tab).not.toBeNull();
            expect(tab.id).toBe(1);
        });
    });

    describe('Window Context Isolation', () => {
        test('Window 1 should get Window 1 SF tab, Window 2 should get Window 2 SF tab', async () => {
            mockTabs = [
                { id: 1, url: 'https://org-a.my.salesforce.com/home', active: true, windowId: 1 },
                { id: 2, url: 'https://org-b.my.salesforce.com/home', active: true, windowId: 2 },
                { id: 3, url: 'https://org-c.my.salesforce.com/home', active: true, windowId: 3 }
            ];

            // Simulate opening popup in Window 1
            mockCurrentWindowId = 1;
            let tab = await findSalesforceTab();
            expect(tab.url).toContain('org-a');

            // Simulate opening popup in Window 2
            mockCurrentWindowId = 2;
            tab = await findSalesforceTab();
            expect(tab.url).toContain('org-b');

            // Simulate opening popup in Window 3
            mockCurrentWindowId = 3;
            tab = await findSalesforceTab();
            expect(tab.url).toContain('org-c');
        });

        test('should isolate sessions between 4 different org windows', async () => {
            const orgs = ['dev', 'uat', 'staging', 'prod'];
            mockTabs = orgs.map((org, i) => ({
                id: i + 1,
                url: `https://${org}-org.my.salesforce.com/home`,
                active: true,
                windowId: i + 1
            }));

            for (let i = 0; i < orgs.length; i++) {
                mockCurrentWindowId = i + 1;
                const tab = await findSalesforceTab();
                expect(tab).not.toBeNull();
                expect(tab.url).toContain(`${orgs[i]}-org`);
            }
        });
    });
});

describe('Instance URL Cache Clearing', () => {
    // Simulates the cache behavior
    let instanceUrlCache = { value: null, ts: 0 };

    function setInstanceUrlCache(value) {
        if (!value) {
            instanceUrlCache = { value: null, ts: 0 };
            return;
        }
        instanceUrlCache = { value, ts: Date.now() };
    }

    function getCachedInstanceUrl() {
        return instanceUrlCache?.value || null;
    }

    beforeEach(() => {
        instanceUrlCache = { value: null, ts: 0 };
    });

    test('should clear cache when null is passed', () => {
        setInstanceUrlCache('https://old-org.my.salesforce.com');
        expect(getCachedInstanceUrl()).toBe('https://old-org.my.salesforce.com');

        setInstanceUrlCache(null);
        expect(getCachedInstanceUrl()).toBeNull();
    });

    test('clearing cache ensures fresh data on next popup open', () => {
        // Simulate: Window 1 opens popup, caches org-a
        setInstanceUrlCache('https://org-a.my.salesforce.com');
        expect(getCachedInstanceUrl()).toBe('https://org-a.my.salesforce.com');

        // Simulate: Window 2 opens popup, should clear cache first
        setInstanceUrlCache(null); // This is what popup.js now does on init
        expect(getCachedInstanceUrl()).toBeNull();

        // Then set the correct URL for Window 2
        setInstanceUrlCache('https://org-b.my.salesforce.com');
        expect(getCachedInstanceUrl()).toBe('https://org-b.my.salesforce.com');
    });
});

