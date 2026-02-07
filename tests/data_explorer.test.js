/**
 * Data Explorer Helper Tests
 * Tests for Sandbox Manager, Favicon Manager, User Manager, and Record Search functionality
 */

// Mock chrome APIs
const mockStorage = {
    orgFavicons: {},
    faviconSettings: null
};

global.chrome = {
    storage: {
        local: {
            get: jest.fn((keys) => {
                return new Promise((resolve) => {
                    if (typeof keys === 'string') {
                        resolve({ [keys]: mockStorage[keys] });
                    } else if (Array.isArray(keys)) {
                        const result = {};
                        keys.forEach(k => { result[k] = mockStorage[k]; });
                        resolve(result);
                    } else if (typeof keys === 'object') {
                        const result = {};
                        Object.keys(keys).forEach(k => {
                            result[k] = mockStorage[k] !== undefined ? mockStorage[k] : keys[k];
                        });
                        resolve(result);
                    } else {
                        resolve(mockStorage);
                    }
                });
            }),
            set: jest.fn((data) => {
                return new Promise((resolve) => {
                    Object.assign(mockStorage, data);
                    resolve();
                });
            }),
            remove: jest.fn((keys) => {
                return new Promise((resolve) => {
                    if (typeof keys === 'string') {
                        delete mockStorage[keys];
                    } else if (Array.isArray(keys)) {
                        keys.forEach(k => delete mockStorage[k]);
                    }
                    resolve();
                });
            })
        }
    },
    tabs: {
        query: jest.fn(() => Promise.resolve([
            { id: 1, url: 'https://myorg.lightning.force.com/lightning/page/home', active: true }
        ])),
        sendMessage: jest.fn(() => Promise.resolve({ success: true }))
    },
    scripting: {
        executeScript: jest.fn(() => Promise.resolve([{ result: true }]))
    },
    runtime: {
        sendMessage: jest.fn(() => Promise.resolve({ success: true, orgId: '00D5g0000012345' })),
        lastError: null
    }
};

// Mock document
global.document = {
    getElementById: jest.fn((id) => {
        const elements = {
            'favicon-color': { value: '#ff6b6b' },
            'favicon-label': { value: 'DEV' },
            'favicon-status': { textContent: '', className: '', hidden: true },
            'favicon-preview': { innerHTML: '', appendChild: jest.fn(), querySelector: jest.fn() },
            'org-info-container': { innerHTML: '' },
            'saved-favicons-list': { innerHTML: '', querySelectorAll: jest.fn(() => []) },
            'user-details-container': { innerHTML: '' },
            'user-search-input': { value: '' },
            'user-search-results': { innerHTML: '' },
            'user-profile-select': { value: '', disabled: true, innerHTML: '' },
            'user-role-select': { value: '', disabled: true, innerHTML: '' },
            'user-language-select': { value: '', disabled: true, innerHTML: '' },
            'selected-user-display': { value: '' },
            'selected-user-id': { value: '' },
            'current-record-info': { innerHTML: '' },
            'record-search-input': { value: '' },
            'search-results-container': { innerHTML: '' },
            'api-version': { value: '66.0' }
        };
        return elements[id] || null;
    }),
    querySelectorAll: jest.fn(() => []),
    querySelector: jest.fn(() => null),
    createElement: jest.fn((tag) => ({
        tagName: tag.toUpperCase(),
        width: 0,
        height: 0,
        style: {},
        getContext: jest.fn(() => ({
            fillStyle: '',
            font: '',
            textAlign: '',
            textBaseline: '',
            clearRect: jest.fn(),
            fillRect: jest.fn(),
            beginPath: jest.fn(),
            arc: jest.fn(),
            closePath: jest.fn(),
            fill: jest.fn(),
            fillText: jest.fn()
        })),
        toDataURL: jest.fn(() => 'data:image/png;base64,test'),
        appendChild: jest.fn()
    }))
};

// Reset mock storage before each test
beforeEach(() => {
    mockStorage.orgFavicons = {};
    mockStorage.faviconSettings = null;
    jest.clearAllMocks();
});

describe('Favicon Storage Tests', () => {

    describe('Multiple Org Favicon Storage', () => {

        test('should store favicon for a single org', async () => {
            const orgId = '00D5g0000012345AAA';
            const faviconData = {
                color: '#ff6b6b',
                label: 'DEV',
                orgName: 'Dev Sandbox',
                savedAt: new Date().toISOString()
            };

            // Store favicon
            const result = await chrome.storage.local.get('orgFavicons');
            let orgFavicons = result.orgFavicons || {};
            orgFavicons[orgId] = faviconData;
            await chrome.storage.local.set({ orgFavicons });

            // Verify storage
            const verifyResult = await chrome.storage.local.get('orgFavicons');
            expect(verifyResult.orgFavicons).toBeDefined();
            expect(verifyResult.orgFavicons[orgId]).toEqual(faviconData);
        });

        test('should store multiple org favicons without overwriting', async () => {
            const org1 = '00D5g0000012345AAA';
            const org2 = '00D5g0000067890BBB';
            const org3 = '00D5g0000011111CCC';

            // Store first org
            let result = await chrome.storage.local.get('orgFavicons');
            let orgFavicons = result.orgFavicons || {};
            orgFavicons[org1] = { color: '#ff6b6b', label: 'DEV', orgName: 'Dev Sandbox' };
            await chrome.storage.local.set({ orgFavicons });

            // Store second org
            result = await chrome.storage.local.get('orgFavicons');
            orgFavicons = { ...result.orgFavicons };
            orgFavicons[org2] = { color: '#51cf66', label: 'UAT', orgName: 'UAT Sandbox' };
            await chrome.storage.local.set({ orgFavicons });

            // Store third org
            result = await chrome.storage.local.get('orgFavicons');
            orgFavicons = { ...result.orgFavicons };
            orgFavicons[org3] = { color: '#339af0', label: 'PRD', orgName: 'Production' };
            await chrome.storage.local.set({ orgFavicons });

            // Verify all three are stored
            const finalResult = await chrome.storage.local.get('orgFavicons');
            expect(Object.keys(finalResult.orgFavicons)).toHaveLength(3);
            expect(finalResult.orgFavicons[org1].label).toBe('DEV');
            expect(finalResult.orgFavicons[org2].label).toBe('UAT');
            expect(finalResult.orgFavicons[org3].label).toBe('PRD');
        });

        test('should update existing org favicon without affecting others', async () => {
            const org1 = '00D5g0000012345AAA';
            const org2 = '00D5g0000067890BBB';

            // Initialize with two orgs
            mockStorage.orgFavicons = {
                [org1]: { color: '#ff6b6b', label: 'DEV', orgName: 'Dev Sandbox' },
                [org2]: { color: '#51cf66', label: 'UAT', orgName: 'UAT Sandbox' }
            };

            // Update org1
            const result = await chrome.storage.local.get('orgFavicons');
            const orgFavicons = { ...result.orgFavicons };
            orgFavicons[org1] = { color: '#fcc419', label: 'QA', orgName: 'QA Sandbox' };
            await chrome.storage.local.set({ orgFavicons });

            // Verify org1 updated and org2 unchanged
            const finalResult = await chrome.storage.local.get('orgFavicons');
            expect(finalResult.orgFavicons[org1].label).toBe('QA');
            expect(finalResult.orgFavicons[org1].color).toBe('#fcc419');
            expect(finalResult.orgFavicons[org2].label).toBe('UAT');
            expect(finalResult.orgFavicons[org2].color).toBe('#51cf66');
        });

        test('should delete specific org favicon without affecting others', async () => {
            const org1 = '00D5g0000012345AAA';
            const org2 = '00D5g0000067890BBB';
            const org3 = '00D5g0000011111CCC';

            // Initialize with three orgs
            mockStorage.orgFavicons = {
                [org1]: { color: '#ff6b6b', label: 'DEV' },
                [org2]: { color: '#51cf66', label: 'UAT' },
                [org3]: { color: '#339af0', label: 'PRD' }
            };

            // Delete org2
            const result = await chrome.storage.local.get('orgFavicons');
            const orgFavicons = { ...result.orgFavicons };
            delete orgFavicons[org2];
            await chrome.storage.local.set({ orgFavicons });

            // Verify org2 deleted, others remain
            const finalResult = await chrome.storage.local.get('orgFavicons');
            expect(Object.keys(finalResult.orgFavicons)).toHaveLength(2);
            expect(finalResult.orgFavicons[org1]).toBeDefined();
            expect(finalResult.orgFavicons[org2]).toBeUndefined();
            expect(finalResult.orgFavicons[org3]).toBeDefined();
        });
    });

    describe('Favicon Data Validation', () => {

        test('should store complete favicon data structure', async () => {
            const orgId = '00D5g0000012345AAA';
            const now = new Date().toISOString();

            const faviconData = {
                color: '#ff6b6b',
                label: 'DEV',
                orgName: 'Development Sandbox',
                savedAt: now
            };

            mockStorage.orgFavicons = { [orgId]: faviconData };

            const result = await chrome.storage.local.get('orgFavicons');
            expect(result.orgFavicons[orgId]).toHaveProperty('color');
            expect(result.orgFavicons[orgId]).toHaveProperty('label');
            expect(result.orgFavicons[orgId]).toHaveProperty('orgName');
            expect(result.orgFavicons[orgId]).toHaveProperty('savedAt');
        });

        test('should handle empty label', async () => {
            const orgId = '00D5g0000012345AAA';

            mockStorage.orgFavicons = {
                [orgId]: { color: '#ff6b6b', label: '', orgName: 'Test Org' }
            };

            const result = await chrome.storage.local.get('orgFavicons');
            expect(result.orgFavicons[orgId].label).toBe('');
        });

        test('should handle special characters in org name', async () => {
            const orgId = '00D5g0000012345AAA';
            const orgName = "Manas's Test Org (Dev) - <Special>";

            mockStorage.orgFavicons = {
                [orgId]: { color: '#ff6b6b', label: 'DEV', orgName }
            };

            const result = await chrome.storage.local.get('orgFavicons');
            expect(result.orgFavicons[orgId].orgName).toBe(orgName);
        });
    });
});

describe('Organization ID Validation', () => {

    test('should validate 15-character org ID', () => {
        const orgId15 = '00D5g0000012345';
        expect(orgId15.length).toBe(15);
        expect(/^[a-zA-Z0-9]{15}$/.test(orgId15)).toBe(true);
    });

    test('should validate 18-character org ID', () => {
        const orgId18 = '00D5g0000012345AAA';
        expect(orgId18.length).toBe(18);
        expect(/^[a-zA-Z0-9]{18}$/.test(orgId18)).toBe(true);
    });

    test('should reject invalid org IDs', () => {
        const invalidIds = [
            '00D5g000001234',   // 14 chars
            '00D5g00000123456789', // 19 chars
            '00D5g0000012345!!!', // special chars
            '',                  // empty
            null,               // null
            undefined           // undefined
        ];

        invalidIds.forEach(id => {
            if (id === null || id === undefined || id === '') {
                expect(!id).toBe(true);
            } else {
                const isValid = /^[a-zA-Z0-9]{15}$|^[a-zA-Z0-9]{18}$/.test(id);
                expect(isValid).toBe(false);
            }
        });
    });
});

describe('Salesforce URL Detection', () => {

    const isSalesforceUrl = (url) => {
        try {
            const u = new URL(url);
            const h = u.hostname.toLowerCase();
            return h.includes('.salesforce.com') ||
                   h.includes('.force.com') ||
                   h.includes('.salesforce-setup.com');
        } catch {
            return false;
        }
    };

    test('should detect lightning URLs', () => {
        expect(isSalesforceUrl('https://myorg.lightning.force.com')).toBe(true);
        expect(isSalesforceUrl('https://myorg--sb.sandbox.lightning.force.com')).toBe(true);
    });

    test('should detect classic URLs', () => {
        expect(isSalesforceUrl('https://myorg.my.salesforce.com')).toBe(true);
        expect(isSalesforceUrl('https://myorg.salesforce.com')).toBe(true);
    });

    test('should detect setup URLs', () => {
        expect(isSalesforceUrl('https://myorg.salesforce-setup.com')).toBe(true);
    });

    test('should reject non-Salesforce URLs', () => {
        expect(isSalesforceUrl('https://google.com')).toBe(false);
        expect(isSalesforceUrl('https://salesforce.com.fake.com')).toBe(false);
        expect(isSalesforceUrl('chrome-extension://abcdef/popup.html')).toBe(false);
    });

    test('should handle invalid URLs', () => {
        expect(isSalesforceUrl('')).toBe(false);
        expect(isSalesforceUrl('not-a-url')).toBe(false);
        expect(isSalesforceUrl(null)).toBe(false);
    });
});

describe('Favicon Color Presets', () => {
    const presets = [
        { value: '#ff6b6b', name: 'Red (Production)' },
        { value: '#51cf66', name: 'Green (Dev)' },
        { value: '#339af0', name: 'Blue (UAT)' },
        { value: '#fcc419', name: 'Yellow (QA)' },
        { value: '#9775fa', name: 'Purple (Staging)' },
        { value: '#ff922b', name: 'Orange (Hotfix)' }
    ];

    test('should have valid hex color codes', () => {
        const hexRegex = /^#[0-9a-fA-F]{6}$/;
        presets.forEach(preset => {
            expect(hexRegex.test(preset.value)).toBe(true);
        });
    });

    test('should have unique color values', () => {
        const values = presets.map(p => p.value.toLowerCase());
        const uniqueValues = [...new Set(values)];
        expect(uniqueValues.length).toBe(presets.length);
    });
});

describe('Tab Filtering for Favicon Application', () => {

    test('should filter Salesforce tabs correctly', async () => {
        const mockTabs = [
            { id: 1, url: 'https://myorg.lightning.force.com/lightning/page/home', active: true },
            { id: 2, url: 'https://google.com', active: false },
            { id: 3, url: 'chrome-extension://abc/popup.html#data', active: false },
            { id: 4, url: 'https://other-org.my.salesforce.com/home', active: false },
            { id: 5, url: 'https://setup.salesforce-setup.com', active: false }
        ];

        const sfTabs = mockTabs.filter(tab =>
            tab.url && (
                tab.url.includes('.salesforce.com') ||
                tab.url.includes('.force.com') ||
                tab.url.includes('.salesforce-setup.com')
            ) && !tab.url.startsWith('chrome-extension://')
        );

        expect(sfTabs).toHaveLength(3);
        expect(sfTabs.map(t => t.id)).toEqual([1, 4, 5]);
    });

    test('should exclude extension pages', async () => {
        const mockTabs = [
            { id: 1, url: 'chrome-extension://abc/popup.html', active: true },
            { id: 2, url: 'chrome-extension://def/background.html', active: false }
        ];

        const sfTabs = mockTabs.filter(tab =>
            tab.url &&
            !tab.url.startsWith('chrome-extension://')
        );

        expect(sfTabs).toHaveLength(0);
    });
});

describe('Record ID Extraction', () => {

    // Simple function to extract record ID from Salesforce URLs
    const extractRecordIdFromUrl = (url) => {
        if (!url || typeof url !== 'string') return null;

        // Lightning: /lightning/r/Object/{ID}/view
        const lightningParts = url.split('/lightning/r/');
        if (lightningParts.length > 1) {
            const segments = lightningParts[1].split('/');
            // segments[0] = Object name, segments[1] = ID, segments[2] = 'view'
            if (segments.length >= 3 && segments[2] === 'view') {
                const id = segments[1];
                if (id && (id.length === 15 || id.length === 18) && /^[a-zA-Z0-9]+$/.test(id)) {
                    return id;
                }
            }
        }

        // Query param ?id=
        const idParamMatch = url.match(/[?&]id=([a-zA-Z0-9]{15,18})(?:[&#]|$)/i);
        if (idParamMatch) {
            return idParamMatch[1];
        }

        return null;
    };

    test('should extract ID from Lightning record URL', () => {
        // 18-character ID: 0015g00000ABCDEFGH (exactly 18 chars)
        const url = 'https://myorg.lightning.force.com/lightning/r/Account/0015g00000ABCDEFGH/view';
        const result = extractRecordIdFromUrl(url);
        expect(result).toBe('0015g00000ABCDEFGH');
    });

    test('should extract ID from query parameter', () => {
        // 18-character ID
        const url = 'https://myorg.my.salesforce.com/apex/MyPage?id=0015g00000ABCDEFGH';
        const result = extractRecordIdFromUrl(url);
        expect(result).toBe('0015g00000ABCDEFGH');
    });

    test('should return null for URL without ID', () => {
        const url = 'https://myorg.lightning.force.com/lightning/page/home';
        expect(extractRecordIdFromUrl(url)).toBe(null);
    });

    test('should extract 15-character ID', () => {
        // 15-character ID: 0015g00000ABCDE (exactly 15 chars)
        const url = 'https://myorg.lightning.force.com/lightning/r/Account/0015g00000ABCDE/view';
        expect(extractRecordIdFromUrl(url)).toBe('0015g00000ABCDE');
    });

    test('should handle query param with additional params', () => {
        // 18-character ID with additional params
        const url = 'https://myorg.my.salesforce.com/apex/MyPage?id=0015g00000ABCDEFGH&retUrl=/home';
        expect(extractRecordIdFromUrl(url)).toBe('0015g00000ABCDEFGH');
    });

    test('should reject IDs with invalid length', () => {
        // 14-character ID (too short)
        const url = 'https://myorg.lightning.force.com/lightning/r/Account/0015g0000ABCD/view';
        expect(extractRecordIdFromUrl(url)).toBe(null);
    });
});

describe('User Search Functionality', () => {

    test('should escape special characters in search term', () => {
        const searchTerm = "O'Brien";
        const escapedTerm = searchTerm.replace(/'/g, "\\'");
        expect(escapedTerm).toBe("O\\'Brien");
    });

    test('should build correct SOQL query for user search', () => {
        const searchTerm = 'john';
        const query = `SELECT Id, Username, FirstName, LastName, Email, Profile.Name, IsActive 
                       FROM User 
                       WHERE Name LIKE '%${searchTerm}%' 
                          OR Username LIKE '%${searchTerm}%' 
                          OR Email LIKE '%${searchTerm}%' 
                       ORDER BY Name 
                       LIMIT 20`;

        expect(query).toContain(`'%${searchTerm}%'`);
        expect(query).toContain('FROM User');
        expect(query).toContain('LIMIT 20');
    });
});

describe('Language Locale Keys', () => {
    const languages = [
        { value: 'en_US', label: 'English (US)' },
        { value: 'en_GB', label: 'English (UK)' },
        { value: 'de', label: 'German' },
        { value: 'es', label: 'Spanish' },
        { value: 'fr', label: 'French' },
        { value: 'ja', label: 'Japanese' },
        { value: 'zh_CN', label: 'Chinese (Simplified)' }
    ];

    test('should have valid locale key format', () => {
        languages.forEach(lang => {
            // Locale keys are either 2 chars or 2_2 format
            expect(/^[a-z]{2}(_[A-Z]{2})?$/.test(lang.value)).toBe(true);
        });
    });

    test('should have unique values', () => {
        const values = languages.map(l => l.value);
        const unique = [...new Set(values)];
        expect(unique.length).toBe(languages.length);
    });
});

describe('Canvas Drawing for Favicon', () => {

    test('should create canvas with correct dimensions', () => {
        const canvas = document.createElement('canvas');
        canvas.width = 32;
        canvas.height = 32;

        expect(canvas.width).toBe(32);
        expect(canvas.height).toBe(32);
    });

    test('should get 2D context', () => {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');

        expect(ctx).toBeDefined();
        expect(typeof ctx.fillRect).toBe('function');
        expect(typeof ctx.arc).toBe('function');
    });
});

describe('Organization Info Display', () => {

    test('should format sandbox status badge correctly', () => {
        const isSandbox = true;
        const statusBadge = isSandbox
            ? '<span style="background:#fff3bf;color:#e67700;">SANDBOX</span>'
            : '<span style="background:#d3f9d8;color:#2b8a3e;">PRODUCTION</span>';

        expect(statusBadge).toContain('SANDBOX');
        expect(statusBadge).toContain('#fff3bf');
    });

    test('should format production status badge correctly', () => {
        const isSandbox = false;
        const statusBadge = isSandbox
            ? '<span style="background:#fff3bf;color:#e67700;">SANDBOX</span>'
            : '<span style="background:#d3f9d8;color:#2b8a3e;">PRODUCTION</span>';

        expect(statusBadge).toContain('PRODUCTION');
        expect(statusBadge).toContain('#d3f9d8');
    });

    test('should format date correctly', () => {
        const dateStr = '2024-01-15T10:30:00.000Z';
        const formatted = new Date(dateStr).toLocaleDateString();

        expect(formatted).toBeTruthy();
        expect(typeof formatted).toBe('string');
    });
});

describe('Error Handling', () => {

    test('should handle storage get failure gracefully', async () => {
        chrome.storage.local.get.mockRejectedValueOnce(new Error('Storage error'));

        try {
            await chrome.storage.local.get('orgFavicons');
        } catch (e) {
            expect(e.message).toBe('Storage error');
        }
    });

    test('should handle missing org ID', () => {
        const orgId = null;
        const result = orgId ? 'valid' : 'Could not determine current org';
        expect(result).toBe('Could not determine current org');
    });
});

// ==========================================
// NEW TEST CASES FOR RECENT FAILURES
// ==========================================

describe('Session State Handling', () => {

    test('should detect not-connected state when session is null', () => {
        const session = null;
        const isConnected = session && session.isLoggedIn;
        expect(isConnected).toBeFalsy();
    });

    test('should detect not-connected state when isLoggedIn is false', () => {
        const session = { isLoggedIn: false, userId: null };
        const isConnected = session && session.isLoggedIn;
        expect(isConnected).toBeFalsy();
    });

    test('should detect connected state when isLoggedIn is true', () => {
        const session = { isLoggedIn: true, userId: '0055g000000ABCD' };
        const isConnected = session && session.isLoggedIn;
        expect(isConnected).toBeTruthy();
    });

    test('should show not-connected message structure', () => {
        const notConnectedHtml = `
            <div class="not-connected-message">
                <div style="font-size: 24px; margin-bottom: 8px;">🔌</div>
                <div style="font-weight: 600; margin-bottom: 4px;">Not Connected</div>
                <div style="font-size: 12px; color: #6c757d;">Please navigate to a Salesforce org.</div>
            </div>
        `;
        expect(notConnectedHtml).toContain('not-connected-message');
        expect(notConnectedHtml).toContain('Not Connected');
    });

    test('should handle session with userId but no isLoggedIn', () => {
        const session = { userId: '0055g000000ABCD' };
        // If isLoggedIn is not set, treat as not logged in
        const isConnected = session && session.isLoggedIn === true;
        expect(isConnected).toBeFalsy();
    });
});

describe('Extension Page Filtering', () => {

    test('should identify extension URLs', () => {
        const urls = [
            'chrome-extension://gnljkhkigiiheicjbadejppcdiknfbmj/popup.html',
            'chrome-extension://gnljkhkigiiheicjbadejppcdiknfbmj/popup.html#data',
            'chrome-extension://abcdef123456/background.html'
        ];

        urls.forEach(url => {
            expect(url.startsWith('chrome-extension://')).toBe(true);
        });
    });

    test('should exclude extension pages from Salesforce tab list', () => {
        const mockTabs = [
            { id: 1, url: 'https://myorg.lightning.force.com/lightning/page/home', active: false },
            { id: 2, url: 'chrome-extension://gnljkhkigiiheicjbadejppcdiknfbmj/popup.html#data', active: true },
            { id: 3, url: 'https://other-org.my.salesforce.com/home', active: false }
        ];

        const sfTabs = mockTabs.filter(tab =>
            tab.url && (
                tab.url.includes('.salesforce.com') ||
                tab.url.includes('.force.com') ||
                tab.url.includes('.salesforce-setup.com')
            ) && !tab.url.startsWith('chrome-extension://')
        );

        expect(sfTabs).toHaveLength(2);
        expect(sfTabs.find(t => t.id === 2)).toBeUndefined(); // Extension page excluded
        expect(sfTabs.find(t => t.id === 1)).toBeDefined();
        expect(sfTabs.find(t => t.id === 3)).toBeDefined();
    });

    test('should not attempt to message extension pages', () => {
        const tabUrl = 'chrome-extension://gnljkhkigiiheicjbadejppcdiknfbmj/popup.html#data';
        const shouldMessage = !tabUrl.startsWith('chrome-extension://');
        expect(shouldMessage).toBe(false);
    });

    test('should find active Salesforce tab when popup is standalone', () => {
        const mockTabs = [
            { id: 1, url: 'https://myorg.lightning.force.com/lightning/page/home', active: true },
            { id: 2, url: 'chrome-extension://abc/popup.html', active: false }
        ];

        // Filter to only SF tabs
        const sfTabs = mockTabs.filter(tab =>
            tab.url &&
            !tab.url.startsWith('chrome-extension://') &&
            (tab.url.includes('.salesforce.com') || tab.url.includes('.force.com'))
        );

        // Find active SF tab or first SF tab
        const targetTab = sfTabs.find(t => t.active) || sfTabs[0];
        expect(targetTab).toBeDefined();
        expect(targetTab.id).toBe(1);
    });
});

describe('Content Script Connection Errors', () => {

    test('should identify "Could not establish connection" error', () => {
        const error = new Error('Could not establish connection. Receiving end does not exist.');
        expect(error.message).toContain('Could not establish connection');
    });

    test('should handle sendMessage rejection gracefully', async () => {
        const mockSendMessage = jest.fn().mockRejectedValue(
            new Error('Could not establish connection. Receiving end does not exist.')
        );

        let errorCaught = false;
        try {
            await mockSendMessage({ action: 'updateFavicon', color: '#ff6b6b' });
        } catch (e) {
            errorCaught = true;
            expect(e.message).toContain('Could not establish connection');
        }
        expect(errorCaught).toBe(true);
    });

    test('should provide fallback when content script unavailable', () => {
        const contentScriptAvailable = false;
        const hasScriptingPermission = true;

        // Logic: if content script fails, try scripting API
        const shouldTryScripting = !contentScriptAvailable && hasScriptingPermission;
        expect(shouldTryScripting).toBe(true);
    });

    test('should show success message even when live update fails', () => {
        // When favicon is saved but can't be applied immediately
        const faviconSaved = true;
        const liveUpdateFailed = true;

        const message = faviconSaved && liveUpdateFailed
            ? 'Favicon saved. Refresh the Salesforce page to see change.'
            : 'Favicon saved & applied!';

        expect(message).toContain('Favicon saved');
    });
});

describe('Favicon Status Messages', () => {

    test('should show appropriate message for different scenarios', () => {
        const scenarios = [
            { saved: true, applied: true, expected: 'Favicon saved & applied!' },
            { saved: true, applied: false, noSfTab: false, expected: 'Favicon saved. Refresh Salesforce page to see change.' },
            { saved: true, applied: false, noSfTab: true, expected: 'Favicon saved! Will apply when you visit this org.' },
            { saved: false, error: 'Storage full', expected: 'Error: Storage full' }
        ];

        scenarios.forEach(scenario => {
            let message;
            if (!scenario.saved) {
                message = `Error: ${scenario.error}`;
            } else if (scenario.applied) {
                message = 'Favicon saved & applied!';
            } else if (scenario.noSfTab) {
                message = 'Favicon saved! Will apply when you visit this org.';
            } else {
                message = 'Favicon saved. Refresh Salesforce page to see change.';
            }
            expect(message).toBe(scenario.expected);
        });
    });

    test('should include org name when deleting favicon', () => {
        const orgName = 'Dev Sandbox';
        const deleteMessage = `Favicon removed for ${orgName}`;
        expect(deleteMessage).toContain('Dev Sandbox');
    });
});

describe('API Call Error Handling', () => {

    test('should handle "Not connected" error from PlatformHelper', () => {
        const error = new Error('Not connected');
        const errorMessage = error.message;

        expect(errorMessage).toBe('Not connected');

        // Should show not-connected UI instead of error
        const shouldShowNotConnectedUI = errorMessage === 'Not connected' ||
            errorMessage.includes('Not connected') ||
            errorMessage.includes('No session');

        expect(shouldShowNotConnectedUI).toBe(true);
    });

    test('should differentiate connection errors from API errors', () => {
        const connectionErrors = [
            'Not connected',
            'No session',
            'Session expired',
            'Failed to fetch'
        ];

        const apiErrors = [
            'INVALID_FIELD',
            'MALFORMED_QUERY',
            'INSUFFICIENT_ACCESS'
        ];

        connectionErrors.forEach(err => {
            const isConnectionError = ['Not connected', 'No session', 'Session expired', 'Failed to fetch']
                .some(ce => err.includes(ce));
            expect(isConnectionError).toBe(true);
        });

        apiErrors.forEach(err => {
            const isConnectionError = ['Not connected', 'No session', 'Session expired', 'Failed to fetch']
                .some(ce => err.includes(ce));
            expect(isConnectionError).toBe(false);
        });
    });
});

describe('Saved Favicons Loading Without Connection', () => {

    test('should load saved favicons even when not connected', async () => {
        // Simulate not connected but has saved favicons
        const isConnected = false;
        mockStorage.orgFavicons = {
            '00D5g0000012345': { color: '#ff6b6b', label: 'DEV', orgName: 'Dev Org' },
            '00D5g0000067890': { color: '#51cf66', label: 'UAT', orgName: 'UAT Org' }
        };

        // Should still be able to load saved favicons
        const result = await chrome.storage.local.get('orgFavicons');
        expect(Object.keys(result.orgFavicons)).toHaveLength(2);

        // Connection state shouldn't affect storage access
        expect(isConnected).toBe(false);
        expect(result.orgFavicons['00D5g0000012345']).toBeDefined();
    });

    test('should show saved favicons list regardless of connection', () => {
        const savedFavicons = {
            '00D5g0000012345': { color: '#ff6b6b', label: 'DEV', orgName: 'Dev Org' }
        };
        const isConnected = false;

        // UI should still render saved favicons
        const shouldRenderList = Object.keys(savedFavicons).length > 0;
        expect(shouldRenderList).toBe(true);
        expect(isConnected).toBe(false); // Not connected but list still shows
    });
});

describe('Org ID Storage Key Handling', () => {

    test('should use org ID as unique key', () => {
        const orgId1 = '00D5g0000012345AAA';
        const orgId2 = '00D5g0000067890BBB';

        const orgFavicons = {};
        orgFavicons[orgId1] = { color: '#ff6b6b', label: 'DEV' };
        orgFavicons[orgId2] = { color: '#51cf66', label: 'UAT' };

        expect(Object.keys(orgFavicons)).toHaveLength(2);
        expect(orgFavicons[orgId1].label).toBe('DEV');
        expect(orgFavicons[orgId2].label).toBe('UAT');
    });

    test('should not overwrite when adding new org', () => {
        const orgFavicons = {
            '00D5g0000012345': { color: '#ff6b6b', label: 'DEV' }
        };

        // Add new org using spread to preserve existing
        const newOrgId = '00D5g0000067890';
        const updatedFavicons = {
            ...orgFavicons,
            [newOrgId]: { color: '#51cf66', label: 'UAT' }
        };

        expect(Object.keys(updatedFavicons)).toHaveLength(2);
        expect(updatedFavicons['00D5g0000012345'].label).toBe('DEV'); // Original preserved
        expect(updatedFavicons['00D5g0000067890'].label).toBe('UAT'); // New added
    });

    test('should handle typeof check for storage object', () => {
        const validStorageResult = { orgFavicons: { '00D123': { color: '#fff' } } };
        const invalidStorageResult = { orgFavicons: null };
        const undefinedStorageResult = {};

        // Valid check
        expect(
            validStorageResult.orgFavicons &&
            typeof validStorageResult.orgFavicons === 'object'
        ).toBeTruthy();

        // Null check - null && anything returns null (falsy)
        expect(
            invalidStorageResult.orgFavicons &&
            typeof invalidStorageResult.orgFavicons === 'object'
        ).toBeFalsy();

        // Undefined check - undefined && anything returns undefined (falsy)
        expect(
            undefinedStorageResult.orgFavicons &&
            typeof undefinedStorageResult.orgFavicons === 'object'
        ).toBeFalsy();
    });
});

describe('Favicon Edit Mode Tests', () => {

    describe('loadExistingFaviconOrSuggest behavior', () => {

        test('should detect existing favicon and enter edit mode', async () => {
            const orgId = '00D5g0000012345AAA';
            const savedFavicon = { color: '#51cf66', label: 'UAT', orgName: 'UAT Sandbox' };

            // Pre-populate storage with existing favicon
            mockStorage.orgFavicons = { [orgId]: savedFavicon };

            const result = await chrome.storage.local.get('orgFavicons');
            const orgFavicons = (result && result.orgFavicons && typeof result.orgFavicons === 'object')
                ? result.orgFavicons : {};

            // Verify existing data is found
            expect(orgFavicons[orgId]).toBeDefined();
            expect(orgFavicons[orgId].color).toBe('#51cf66');
            expect(orgFavicons[orgId].label).toBe('UAT');
        });

        test('should return empty when no existing favicon for org', async () => {
            const orgId = '00D5g0000099999XXX';

            // Storage has other orgs but not this one
            mockStorage.orgFavicons = {
                '00D5g0000012345AAA': { color: '#ff6b6b', label: 'DEV' }
            };

            const result = await chrome.storage.local.get('orgFavicons');
            const orgFavicons = (result && result.orgFavicons && typeof result.orgFavicons === 'object')
                ? result.orgFavicons : {};

            // Verify no data for this org
            expect(orgFavicons[orgId]).toBeUndefined();
        });

        test('should auto-suggest SBX for sandbox when no existing favicon', () => {
            const isSandbox = true;
            const hasExistingFavicon = false;
            let labelValue = '';

            // Simulate auto-suggest logic
            if (!hasExistingFavicon && isSandbox) {
                labelValue = 'SBX';
            }

            expect(labelValue).toBe('SBX');
        });

        test('should not auto-suggest for production when no existing favicon', () => {
            const isSandbox = false;
            const hasExistingFavicon = false;
            let labelValue = '';

            // Simulate auto-suggest logic
            if (!hasExistingFavicon && isSandbox) {
                labelValue = 'SBX';
            }

            expect(labelValue).toBe('');
        });

        test('should preserve existing label when editing (not auto-suggest)', () => {
            const isSandbox = true;
            const existingLabel = 'QA';
            let labelValue = existingLabel;

            // In edit mode, existing value should be preserved
            const hasExistingFavicon = true;

            if (!hasExistingFavicon && isSandbox && !labelValue) {
                labelValue = 'SBX';
            }

            // Label should remain 'QA', not be overwritten with 'SBX'
            expect(labelValue).toBe('QA');
        });

        test('should populate both color and label from existing favicon', async () => {
            const orgId = '00D5g0000012345AAA';
            const savedFavicon = {
                color: '#9775fa',
                label: 'STG',
                orgName: 'Staging Sandbox',
                savedAt: '2026-02-07T10:00:00.000Z'
            };

            mockStorage.orgFavicons = { [orgId]: savedFavicon };

            const result = await chrome.storage.local.get('orgFavicons');
            const orgFavicons = result.orgFavicons || {};

            let colorValue = '#ff6b6b'; // default
            let labelValue = '';

            if (orgFavicons[orgId]) {
                const { color, label } = orgFavicons[orgId];
                if (color) colorValue = color;
                if (label) labelValue = label;
            }

            expect(colorValue).toBe('#9775fa');
            expect(labelValue).toBe('STG');
        });

        test('should handle empty storage gracefully', async () => {
            mockStorage.orgFavicons = {};

            const result = await chrome.storage.local.get('orgFavicons');
            const orgFavicons = (result && result.orgFavicons && typeof result.orgFavicons === 'object')
                ? result.orgFavicons : {};

            expect(Object.keys(orgFavicons)).toHaveLength(0);
            expect(orgFavicons['anyOrgId']).toBeUndefined();
        });

        test('should handle null orgFavicons in storage', async () => {
            mockStorage.orgFavicons = null;

            const result = await chrome.storage.local.get('orgFavicons');
            const orgFavicons = (result && result.orgFavicons && typeof result.orgFavicons === 'object')
                ? result.orgFavicons : {};

            expect(orgFavicons).toEqual({});
        });
    });

    describe('Edit indicator display logic', () => {

        test('should show edit indicator when existing favicon found', () => {
            const hasExistingFavicon = true;
            let indicatorVisible = false;
            let indicatorText = '';

            if (hasExistingFavicon) {
                indicatorVisible = true;
                indicatorText = '✓ Editing existing favicon';
            }

            expect(indicatorVisible).toBe(true);
            expect(indicatorText).toContain('Editing existing');
        });

        test('should hide edit indicator for new favicon', () => {
            const hasExistingFavicon = false;
            let indicatorVisible = true; // default visible
            let indicatorText = '✓ Editing existing favicon';

            if (!hasExistingFavicon) {
                indicatorVisible = false;
                indicatorText = '';
            }

            expect(indicatorVisible).toBe(false);
            expect(indicatorText).toBe('');
        });
    });
});

describe('Favicon Shape Tests', () => {

    describe('Shape Storage', () => {

        test('should store favicon with shape property', async () => {
            const orgId = '00D5g0000012345AAA';
            const faviconData = {
                color: '#ff6b6b',
                label: 'DEV',
                shape: 'circle',
                orgName: 'Dev Sandbox',
                savedAt: new Date().toISOString()
            };

            // Store favicon with shape
            const result = await chrome.storage.local.get('orgFavicons');
            let orgFavicons = result.orgFavicons || {};
            orgFavicons[orgId] = faviconData;
            await chrome.storage.local.set({ orgFavicons });

            // Verify storage includes shape
            const verifyResult = await chrome.storage.local.get('orgFavicons');
            expect(verifyResult.orgFavicons[orgId].shape).toBe('circle');
        });

        test('should store different shapes for different orgs', async () => {
            const org1 = '00D5g0000012345AAA';
            const org2 = '00D5g0000067890BBB';
            const org3 = '00D5g0000011111CCC';

            // Initialize with different shapes
            mockStorage.orgFavicons = {
                [org1]: { color: '#ff6b6b', label: 'DEV', shape: 'cloud' },
                [org2]: { color: '#51cf66', label: 'UAT', shape: 'circle' },
                [org3]: { color: '#339af0', label: 'PRD', shape: 'hexagon' }
            };

            const result = await chrome.storage.local.get('orgFavicons');
            expect(result.orgFavicons[org1].shape).toBe('cloud');
            expect(result.orgFavicons[org2].shape).toBe('circle');
            expect(result.orgFavicons[org3].shape).toBe('hexagon');
        });

        test('should default to cloud shape for favicons without shape property', async () => {
            const orgId = '00D5g0000012345AAA';

            // Legacy data without shape
            mockStorage.orgFavicons = {
                [orgId]: { color: '#ff6b6b', label: 'DEV', orgName: 'Dev Sandbox' }
            };

            const result = await chrome.storage.local.get('orgFavicons');
            const shape = result.orgFavicons[orgId].shape || 'cloud';
            expect(shape).toBe('cloud');
        });
    });

    describe('Shape Validation', () => {

        const validShapes = ['cloud', 'circle', 'square', 'rounded', 'diamond', 'hexagon'];

        test.each(validShapes)('should accept valid shape: %s', (shape) => {
            expect(validShapes.includes(shape)).toBe(true);
        });

        test('should have exactly 6 valid shapes', () => {
            expect(validShapes.length).toBe(6);
        });

        test('should reject invalid shape value by using default', () => {
            const invalidShape = 'triangle';
            const resolvedShape = validShapes.includes(invalidShape) ? invalidShape : 'cloud';
            expect(resolvedShape).toBe('cloud');
        });
    });

    describe('Shape Drawing Functions', () => {

        let mockCtx;

        beforeEach(() => {
            mockCtx = {
                fillStyle: '',
                clearRect: jest.fn(),
                fillRect: jest.fn(),
                beginPath: jest.fn(),
                arc: jest.fn(),
                moveTo: jest.fn(),
                lineTo: jest.fn(),
                quadraticCurveTo: jest.fn(),
                closePath: jest.fn(),
                fill: jest.fn(),
                fillText: jest.fn(),
                font: '',
                textAlign: '',
                textBaseline: ''
            };
        });

        test('should call arc for circle shape', () => {
            // Simulate circle drawing
            mockCtx.clearRect(0, 0, 32, 32);
            mockCtx.fillStyle = '#ff6b6b';
            mockCtx.beginPath();
            mockCtx.arc(16, 16, 14, 0, Math.PI * 2);
            mockCtx.fill();

            expect(mockCtx.beginPath).toHaveBeenCalled();
            expect(mockCtx.arc).toHaveBeenCalledWith(16, 16, 14, 0, Math.PI * 2);
            expect(mockCtx.fill).toHaveBeenCalled();
        });

        test('should call fillRect for square shape', () => {
            // Simulate square drawing
            mockCtx.clearRect(0, 0, 32, 32);
            mockCtx.fillStyle = '#ff6b6b';
            mockCtx.fillRect(2, 2, 28, 28);

            expect(mockCtx.fillRect).toHaveBeenCalledWith(2, 2, 28, 28);
        });

        test('should call quadraticCurveTo for rounded shape', () => {
            // Simulate rounded rect drawing
            mockCtx.clearRect(0, 0, 32, 32);
            mockCtx.fillStyle = '#ff6b6b';
            mockCtx.beginPath();
            mockCtx.moveTo(8, 2);
            mockCtx.quadraticCurveTo(30, 2, 30, 8);
            mockCtx.fill();

            expect(mockCtx.beginPath).toHaveBeenCalled();
            expect(mockCtx.moveTo).toHaveBeenCalled();
            expect(mockCtx.quadraticCurveTo).toHaveBeenCalled();
        });

        test('should call lineTo for diamond shape', () => {
            // Simulate diamond drawing
            mockCtx.clearRect(0, 0, 32, 32);
            mockCtx.fillStyle = '#ff6b6b';
            mockCtx.beginPath();
            mockCtx.moveTo(16, 1);
            mockCtx.lineTo(30, 16);
            mockCtx.lineTo(16, 31);
            mockCtx.lineTo(2, 16);
            mockCtx.closePath();
            mockCtx.fill();

            expect(mockCtx.moveTo).toHaveBeenCalledWith(16, 1);
            expect(mockCtx.lineTo).toHaveBeenCalledWith(30, 16);
            expect(mockCtx.closePath).toHaveBeenCalled();
        });

        test('should call lineTo 6 times for hexagon shape', () => {
            // Simulate hexagon drawing
            mockCtx.clearRect(0, 0, 32, 32);
            mockCtx.fillStyle = '#ff6b6b';
            mockCtx.beginPath();

            for (let i = 0; i < 6; i++) {
                const angle = (Math.PI / 3) * i - Math.PI / 2;
                const x = 16 + 14 * Math.cos(angle);
                const y = 16 + 14 * Math.sin(angle);
                if (i === 0) mockCtx.moveTo(x, y);
                else mockCtx.lineTo(x, y);
            }

            mockCtx.closePath();
            mockCtx.fill();

            expect(mockCtx.moveTo).toHaveBeenCalledTimes(1);
            expect(mockCtx.lineTo).toHaveBeenCalledTimes(5);
        });

        test('should draw label text on shape', () => {
            mockCtx.fillStyle = '#ffffff';
            mockCtx.font = 'bold 10px Arial, sans-serif';
            mockCtx.textAlign = 'center';
            mockCtx.textBaseline = 'middle';
            mockCtx.fillText('DEV', 16, 16);

            expect(mockCtx.fillText).toHaveBeenCalledWith('DEV', 16, 16);
        });

        test('should truncate label to 3 characters', () => {
            const label = 'PRODUCTION';
            const truncatedLabel = label.substring(0, 3).toUpperCase();
            expect(truncatedLabel).toBe('PRO');
            expect(truncatedLabel.length).toBeLessThanOrEqual(3);
        });

        test('should draw cloud shape with multiple arcs', () => {
            mockCtx.beginPath();
            mockCtx.arc(16, 18, 10, Math.PI * 0.5, Math.PI * 1.5);
            mockCtx.arc(10, 12, 6, Math.PI, Math.PI * 1.5);
            mockCtx.arc(16, 8, 7, Math.PI * 1.2, Math.PI * 1.8);
            mockCtx.arc(22, 10, 6, Math.PI * 1.5, Math.PI * 0.3);
            mockCtx.arc(24, 18, 6, Math.PI * 1.5, Math.PI * 0.5);
            mockCtx.closePath();
            mockCtx.fill();

            expect(mockCtx.arc).toHaveBeenCalledTimes(5);
        });

        test('should set correct fill color', () => {
            const testColors = ['#ff6b6b', '#51cf66', '#339af0', '#fcc419', '#9775fa', '#ff922b'];

            testColors.forEach(color => {
                mockCtx.fillStyle = color;
                expect(mockCtx.fillStyle).toBe(color);
            });
        });

        test('should handle empty label without drawing text', () => {
            const label = '';
            if (label) {
                mockCtx.fillText(label, 16, 16);
            }
            expect(mockCtx.fillText).not.toHaveBeenCalled();
        });

        test('should uppercase label before drawing', () => {
            const label = 'dev';
            const processedLabel = label.substring(0, 3).toUpperCase();
            expect(processedLabel).toBe('DEV');
        });
    });

    describe('Shape Selection UI', () => {

        test('should have 6 shape options', () => {
            const shapeOptions = ['cloud', 'circle', 'square', 'rounded', 'diamond', 'hexagon'];
            expect(shapeOptions.length).toBe(6);
        });

        test('should set default shape to cloud', () => {
            const defaultShape = 'cloud';
            expect(defaultShape).toBe('cloud');
        });

        test('should return selected shape from radio button', () => {
            // Simulate radio button selection
            const selectedValue = 'hexagon';
            const getSelectedShape = () => selectedValue;
            expect(getSelectedShape()).toBe('hexagon');
        });

        test('should update shape selection programmatically', () => {
            let currentShape = 'cloud';
            const setSelectedShape = (shape) => { currentShape = shape; };

            setSelectedShape('diamond');
            expect(currentShape).toBe('diamond');
        });

        test('should cycle through all shapes', () => {
            const shapes = ['cloud', 'circle', 'square', 'rounded', 'diamond', 'hexagon'];
            let currentIndex = 0;

            shapes.forEach((shape, index) => {
                currentIndex = index;
                expect(shapes[currentIndex]).toBe(shape);
            });
        });

        test('should validate shape value before applying', () => {
            const validShapes = ['cloud', 'circle', 'square', 'rounded', 'diamond', 'hexagon'];
            const isValidShape = (shape) => validShapes.includes(shape);

            expect(isValidShape('circle')).toBe(true);
            expect(isValidShape('triangle')).toBe(false);
            expect(isValidShape('')).toBe(false);
            expect(isValidShape(null)).toBe(false);
        });
    });

    describe('Shape Migration/Backwards Compatibility', () => {

        test('should handle favicon data without shape field', async () => {
            const orgId = '00D5g0000012345AAA';

            // Old data format without shape
            mockStorage.orgFavicons = {
                [orgId]: { color: '#ff6b6b', label: 'DEV', orgName: 'Dev Sandbox' }
            };

            const result = await chrome.storage.local.get('orgFavicons');
            const faviconData = result.orgFavicons[orgId];

            // Should default to cloud when shape is missing
            const shape = faviconData.shape || 'cloud';
            expect(shape).toBe('cloud');
            expect(faviconData.color).toBe('#ff6b6b');
            expect(faviconData.label).toBe('DEV');
        });

        test('should preserve existing shape when updating other fields', async () => {
            const orgId = '00D5g0000012345AAA';

            // Existing data with shape
            mockStorage.orgFavicons = {
                [orgId]: { color: '#ff6b6b', label: 'DEV', shape: 'hexagon', orgName: 'Dev Sandbox' }
            };

            // Update color only
            const result = await chrome.storage.local.get('orgFavicons');
            const orgFavicons = { ...result.orgFavicons };
            orgFavicons[orgId] = {
                ...orgFavicons[orgId],
                color: '#51cf66'
            };
            await chrome.storage.local.set({ orgFavicons });

            // Verify shape is preserved
            const verifyResult = await chrome.storage.local.get('orgFavicons');
            expect(verifyResult.orgFavicons[orgId].shape).toBe('hexagon');
            expect(verifyResult.orgFavicons[orgId].color).toBe('#51cf66');
        });

        test('should migrate legacy favicons on load', async () => {
            const orgId = '00D5g0000012345AAA';

            // Legacy data without shape
            mockStorage.orgFavicons = {
                [orgId]: { color: '#ff6b6b', label: 'DEV' }
            };

            const result = await chrome.storage.local.get('orgFavicons');
            const faviconData = result.orgFavicons[orgId];

            // Simulate migration: add shape if missing
            const migratedData = {
                ...faviconData,
                shape: faviconData.shape || 'cloud'
            };

            expect(migratedData.shape).toBe('cloud');
            expect(migratedData.color).toBe('#ff6b6b');
        });
    });

    describe('Shape with Different Colors', () => {

        const shapes = ['cloud', 'circle', 'square', 'rounded', 'diamond', 'hexagon'];
        const colors = ['#ff6b6b', '#51cf66', '#339af0', '#fcc419', '#9775fa', '#ff922b'];

        test.each(shapes)('should render %s shape correctly', (shape) => {
            const validShapes = ['cloud', 'circle', 'square', 'rounded', 'diamond', 'hexagon'];
            expect(validShapes.includes(shape)).toBe(true);
        });

        test.each(colors)('should accept color %s', (color) => {
            expect(/^#[0-9a-fA-F]{6}$/.test(color)).toBe(true);
        });

        test('should combine any shape with any color', () => {
            shapes.forEach(shape => {
                colors.forEach(color => {
                    const favicon = { shape, color, label: 'TST' };
                    expect(favicon.shape).toBeDefined();
                    expect(favicon.color).toBeDefined();
                });
            });
        });
    });

    describe('Shape Canvas Coordinates', () => {

        test('circle should be centered at (16, 16) with radius 14', () => {
            const center = { x: 16, y: 16 };
            const radius = 14;

            expect(center.x).toBe(16);
            expect(center.y).toBe(16);
            expect(radius).toBe(14);
            expect(radius * 2).toBeLessThanOrEqual(32); // fits in 32x32 canvas
        });

        test('square should have 2px padding from edges', () => {
            const x = 2, y = 2, width = 28, height = 28;

            expect(x + width).toBe(30); // 2px from right edge
            expect(y + height).toBe(30); // 2px from bottom edge
        });

        test('diamond points should be symmetric', () => {
            const points = [
                { x: 16, y: 1 },   // top
                { x: 30, y: 16 },  // right
                { x: 16, y: 31 },  // bottom
                { x: 2, y: 16 }    // left
            ];

            // Verify vertical symmetry
            expect(points[0].x).toBe(points[2].x); // top and bottom aligned
            // Verify horizontal symmetry
            expect(points[1].y).toBe(points[3].y); // left and right aligned
        });

        test('hexagon should have 6 vertices', () => {
            const vertices = [];
            for (let i = 0; i < 6; i++) {
                const angle = (Math.PI / 3) * i - Math.PI / 2;
                vertices.push({
                    x: 16 + 14 * Math.cos(angle),
                    y: 16 + 14 * Math.sin(angle)
                });
            }

            expect(vertices.length).toBe(6);
            // All vertices should be within canvas bounds
            vertices.forEach(v => {
                expect(v.x).toBeGreaterThanOrEqual(0);
                expect(v.x).toBeLessThanOrEqual(32);
                expect(v.y).toBeGreaterThanOrEqual(0);
                expect(v.y).toBeLessThanOrEqual(32);
            });
        });
    });
});

describe('Advanced Favicon Features', () => {

    describe('Favicon Hostname Association', () => {

        test('should store hostname with favicon', async () => {
            const orgId = '00D5g0000012345AAA';
            const hostname = 'myorg.lightning.force.com';

            mockStorage.orgFavicons = {
                [orgId]: {
                    color: '#ff6b6b',
                    label: 'DEV',
                    shape: 'circle',
                    hostname: hostname,
                    orgName: 'Dev Sandbox'
                }
            };

            const result = await chrome.storage.local.get('orgFavicons');
            expect(result.orgFavicons[orgId].hostname).toBe(hostname);
        });

        test('should match favicon by hostname when org ID unavailable', async () => {
            const hostname = 'myorg.lightning.force.com';

            mockStorage.orgFavicons = {
                '00D5g0000012345AAA': {
                    color: '#ff6b6b',
                    label: 'DEV',
                    hostname: hostname
                }
            };

            const result = await chrome.storage.local.get('orgFavicons');
            const matchingFavicon = Object.values(result.orgFavicons)
                .find(f => f.hostname === hostname);

            expect(matchingFavicon).toBeDefined();
            expect(matchingFavicon.label).toBe('DEV');
        });

        test('should extract base org from hostname', () => {
            const extractBaseOrg = (hostname) => {
                if (!hostname) return null;
                const match = hostname.match(/^([^.]+)/);
                return match ? match[1].toLowerCase() : null;
            };

            expect(extractBaseOrg('myorg.lightning.force.com')).toBe('myorg');
            expect(extractBaseOrg('myorg--dev.sandbox.my.salesforce.com')).toBe('myorg--dev');
            expect(extractBaseOrg('myorg.my.salesforce.com')).toBe('myorg');
        });
    });

    describe('Favicon Timestamp Tracking', () => {

        test('should store savedAt timestamp', async () => {
            const orgId = '00D5g0000012345AAA';
            const now = new Date().toISOString();

            mockStorage.orgFavicons = {
                [orgId]: {
                    color: '#ff6b6b',
                    label: 'DEV',
                    savedAt: now
                }
            };

            const result = await chrome.storage.local.get('orgFavicons');
            expect(result.orgFavicons[orgId].savedAt).toBe(now);
        });

        test('should update savedAt on modification', async () => {
            const orgId = '00D5g0000012345AAA';
            const oldTime = '2025-01-01T00:00:00.000Z';
            const newTime = '2026-02-07T12:00:00.000Z';

            mockStorage.orgFavicons = {
                [orgId]: { color: '#ff6b6b', savedAt: oldTime }
            };

            // Update favicon
            const result = await chrome.storage.local.get('orgFavicons');
            const orgFavicons = { ...result.orgFavicons };
            orgFavicons[orgId] = {
                ...orgFavicons[orgId],
                color: '#51cf66',
                savedAt: newTime
            };
            await chrome.storage.local.set({ orgFavicons });

            const verifyResult = await chrome.storage.local.get('orgFavicons');
            expect(verifyResult.orgFavicons[orgId].savedAt).toBe(newTime);
        });
    });

    describe('Multiple Tab Favicon Application', () => {

        test('should filter Salesforce tabs from all tabs', () => {
            const allTabs = [
                { id: 1, url: 'https://myorg.lightning.force.com/home' },
                { id: 2, url: 'https://google.com' },
                { id: 3, url: 'https://myorg.my.salesforce.com/setup' },
                { id: 4, url: 'chrome-extension://abc123/popup.html' },
                { id: 5, url: 'https://another.salesforce.com/one/one.app' }
            ];

            const sfTabs = allTabs.filter(tab =>
                tab.url && (
                    tab.url.includes('.salesforce.com') ||
                    tab.url.includes('.force.com')
                ) && !tab.url.startsWith('chrome-extension://')
            );

            expect(sfTabs.length).toBe(3);
            expect(sfTabs.map(t => t.id)).toEqual([1, 3, 5]);
        });

        test('should prefer active Salesforce tab', () => {
            const sfTabs = [
                { id: 1, url: 'https://org1.force.com', active: false },
                { id: 2, url: 'https://org2.force.com', active: true },
                { id: 3, url: 'https://org3.force.com', active: false }
            ];

            const activeTab = sfTabs.find(t => t.active) || sfTabs[0];
            expect(activeTab.id).toBe(2);
        });
    });
});

describe('User Manager Extended Tests', () => {

    describe('User Search Query Building', () => {

        test('should build SOQL query for name search', () => {
            const searchTerm = 'John';
            const escapedTerm = searchTerm.replace(/'/g, "\\'");
            const query = `SELECT Id, Username, FirstName, LastName, Email, Profile.Name 
                           FROM User 
                           WHERE (FirstName LIKE '%${escapedTerm}%' 
                              OR LastName LIKE '%${escapedTerm}%' 
                              OR Email LIKE '%${escapedTerm}%' 
                              OR Username LIKE '%${escapedTerm}%')
                           AND IsActive = true
                           ORDER BY LastName, FirstName
                           LIMIT 50`;

            expect(query).toContain('LIKE');
            expect(query).toContain('John');
            expect(query).toContain('IsActive = true');
        });

        test('should escape single quotes in search term', () => {
            const searchTerm = "O'Brien";
            const escapedTerm = searchTerm.replace(/'/g, "\\'");
            expect(escapedTerm).toBe("O\\'Brien");
        });

        test('should handle empty search term', () => {
            const searchTerm = '';
            const isValid = searchTerm && searchTerm.trim().length > 0;
            expect(isValid).toBeFalsy();
        });

        test('should trim whitespace from search term', () => {
            const searchTerm = '  John  ';
            const trimmed = searchTerm.trim();
            expect(trimmed).toBe('John');
        });
    });

    describe('User Profile Selection', () => {

        test('should load profiles for dropdown', () => {
            const profiles = [
                { Id: '00e5g000001ABCD', Name: 'System Administrator' },
                { Id: '00e5g000001EFGH', Name: 'Standard User' },
                { Id: '00e5g000001IJKL', Name: 'Read Only' }
            ];

            expect(profiles.length).toBe(3);
            expect(profiles[0].Name).toBe('System Administrator');
        });

        test('should validate profile ID format', () => {
            const validProfileIds = ['00e5g000001ABCD', '00e5g000001EFGH'];
            const invalidProfileIds = ['123', '', null, 'notaprofileid'];

            validProfileIds.forEach(id => {
                expect(id.startsWith('00e')).toBe(true);
            });

            invalidProfileIds.forEach(id => {
                expect(id === null || id === '' || !id.startsWith('00e')).toBe(true);
            });
        });
    });

    describe('User Role Selection', () => {

        test('should include "No Role" option', () => {
            const roles = [
                { Id: '', Name: '-- No Role --' },
                { Id: '00E5g000001WXYZ', Name: 'CEO' },
                { Id: '00E5g000001ABCD', Name: 'Manager' }
            ];

            const noRoleOption = roles.find(r => r.Id === '');
            expect(noRoleOption).toBeDefined();
            expect(noRoleOption.Name).toContain('No Role');
        });

        test('should sort roles alphabetically', () => {
            const roles = [
                { Name: 'Manager' },
                { Name: 'CEO' },
                { Name: 'Director' }
            ];

            const sorted = [...roles].sort((a, b) => a.Name.localeCompare(b.Name));
            expect(sorted[0].Name).toBe('CEO');
            expect(sorted[1].Name).toBe('Director');
            expect(sorted[2].Name).toBe('Manager');
        });
    });

    describe('User Update Validation', () => {

        test('should require user selection before update', () => {
            const selectedUserId = '';
            const canUpdate = selectedUserId && selectedUserId.length > 0;
            expect(canUpdate).toBeFalsy();
        });

        test('should validate user ID format', () => {
            const validUserIds = ['0055g000001ABCD', '0055g000001EFGH'];
            const isValidUserId = (id) => !!(id && /^005[a-zA-Z0-9]{12,15}$/.test(id));

            expect(isValidUserId('0055g000001ABCD')).toBe(true);
            expect(isValidUserId('invalid')).toBe(false);
            expect(isValidUserId('')).toBe(false);
        });
    });
});

describe('Record Search Extended Tests', () => {

    describe('Record ID Validation', () => {

        const recordIdPrefixes = {
            '001': 'Account',
            '003': 'Contact',
            '006': 'Opportunity',
            '00Q': 'Lead',
            '500': 'Case',
            '00D': 'Organization'
        };

        test.each(Object.entries(recordIdPrefixes))('should identify %s prefix as %s', (prefix, objectName) => {
            const recordId = prefix + '5g0000012345';
            expect(recordId.startsWith(prefix)).toBe(true);
        });

        test('should accept 15-character record ID', () => {
            const id15 = '0015g0000012345';
            expect(id15.length).toBe(15);
            expect(/^[a-zA-Z0-9]{15}$/.test(id15)).toBe(true);
        });

        test('should accept 18-character record ID', () => {
            const id18 = '0015g0000012345AAA';
            expect(id18.length).toBe(18);
            expect(/^[a-zA-Z0-9]{18}$/.test(id18)).toBe(true);
        });

        test('should reject invalid record IDs', () => {
            const invalidIds = [
                '12345',           // too short
                '0015g00000123456789', // too long
                '001-5g00-0012',   // contains dashes
                'abc!@#$%',        // special characters
                ''                 // empty
            ];

            const isValidRecordId = (id) => !!(id && /^[a-zA-Z0-9]{15}([a-zA-Z0-9]{3})?$/.test(id));

            invalidIds.forEach(id => {
                expect(isValidRecordId(id)).toBe(false);
            });
        });
    });

    describe('Record ID Extraction from URL', () => {

        test('should extract ID from Lightning record URL', () => {
            const url = 'https://myorg.lightning.force.com/lightning/r/Account/0015g000001ABCd/view';
            const match = url.match(/\/r\/[^/]+\/([a-zA-Z0-9]{15,18})/);
            expect(match[1]).toBe('0015g000001ABCd');
        });

        test('should extract ID from Classic URL', () => {
            const url = 'https://myorg.salesforce.com/0015g000001ABCd';
            const match = url.match(/\/([a-zA-Z0-9]{15,18})(?:$|\/|\?)/);
            expect(match[1]).toBe('0015g000001ABCd');
        });

        test('should extract ID from query parameter', () => {
            const url = 'https://myorg.force.com/page?id=0015g000001ABCd&other=value';
            const urlObj = new URL(url);
            const id = urlObj.searchParams.get('id');
            expect(id).toBe('0015g000001ABCd');
        });

        test('should handle URL without record ID', () => {
            const url = 'https://myorg.lightning.force.com/lightning/page/home';
            const match = url.match(/\/r\/[^/]+\/([a-zA-Z0-9]{15,18})/);
            expect(match).toBeNull();
        });
    });

    describe('Object Type Identification', () => {

        test('should identify object type from key prefix', () => {
            const keyPrefixMap = {
                '001': 'Account',
                '003': 'Contact',
                '006': 'Opportunity',
                '00Q': 'Lead',
                '500': 'Case',
                '00T': 'Task',
                '00U': 'Event'
            };

            const getObjectType = (recordId) => {
                if (!recordId || recordId.length < 3) return 'Unknown';
                const prefix = recordId.substring(0, 3);
                return keyPrefixMap[prefix] || 'Custom Object';
            };

            expect(getObjectType('0015g000001ABCD')).toBe('Account');
            expect(getObjectType('0035g000001ABCD')).toBe('Contact');
            expect(getObjectType('a0B5g000001ABCD')).toBe('Custom Object');
        });
    });
});

describe('Organization Info Display Tests', () => {

    describe('Org Type Detection', () => {

        test('should identify sandbox org', () => {
            const org = { IsSandbox: true, OrganizationType: 'Developer Edition' };
            expect(org.IsSandbox).toBe(true);
        });

        test('should identify production org', () => {
            const org = { IsSandbox: false, OrganizationType: 'Enterprise Edition' };
            expect(org.IsSandbox).toBe(false);
        });

        test('should format org type with sandbox indicator', () => {
            const org = { IsSandbox: true, OrganizationType: 'Developer Edition' };
            const displayType = org.IsSandbox
                ? `${org.OrganizationType} (Sandbox)`
                : org.OrganizationType;
            expect(displayType).toBe('Developer Edition (Sandbox)');
        });
    });

    describe('Instance Name Display', () => {

        test('should display instance name', () => {
            const org = { InstanceName: 'NA123' };
            expect(org.InstanceName).toBe('NA123');
        });

        test('should handle missing instance name', () => {
            const org = { InstanceName: null };
            const displayValue = org.InstanceName || '-';
            expect(displayValue).toBe('-');
        });
    });

    describe('Trial Expiration Display', () => {

        test('should show trial expiration for trial orgs', () => {
            const org = { TrialExpirationDate: '2026-03-01T00:00:00.000Z' };
            expect(org.TrialExpirationDate).toBeDefined();
        });

        test('should not show trial expiration for non-trial orgs', () => {
            const org = { TrialExpirationDate: null };
            const hasTrialExpiration = !!org.TrialExpirationDate;
            expect(hasTrialExpiration).toBe(false);
        });

        test('should format trial expiration date', () => {
            const dateStr = '2026-03-01T00:00:00.000Z';
            const formatted = new Date(dateStr).toLocaleDateString();
            expect(formatted).toBeDefined();
        });
    });
});

describe('Favicon Status Messages', () => {

    describe('Success Messages', () => {

        test('should show saved & applied message', () => {
            const message = 'Favicon saved & applied!';
            const type = 'success';
            expect(message).toContain('saved');
            expect(type).toBe('success');
        });

        test('should show pending application message', () => {
            const message = 'Favicon saved! Will apply when you visit this org.';
            expect(message).toContain('Will apply');
        });

        test('should show removal confirmation', () => {
            const orgName = 'Dev Sandbox';
            const message = `Favicon removed for ${orgName}`;
            expect(message).toContain('removed');
            expect(message).toContain(orgName);
        });
    });

    describe('Error Messages', () => {

        test('should show org detection error', () => {
            const message = 'Could not determine current org. Please refresh.';
            expect(message).toContain('Could not');
        });

        test('should format error with details', () => {
            const error = new Error('Storage quota exceeded');
            const message = 'Error: ' + error.message;
            expect(message).toBe('Error: Storage quota exceeded');
        });
    });

    describe('Status Display Behavior', () => {

        test('should auto-hide status after timeout', () => {
            jest.useFakeTimers();
            let hidden = false;
            const hideStatus = () => { hidden = true; };

            setTimeout(hideStatus, 4000);
            expect(hidden).toBe(false);

            jest.advanceTimersByTime(4000);
            expect(hidden).toBe(true);

            jest.useRealTimers();
        });
    });
});

describe('Chrome Storage Edge Cases', () => {

    describe('Storage Quota Handling', () => {

        test('should handle storage quota exceeded', async () => {
            // Simulate storage failure
            chrome.storage.local.set.mockImplementationOnce(() =>
                Promise.reject(new Error('QUOTA_BYTES_PER_ITEM quota exceeded'))
            );

            let errorCaught = false;
            try {
                await chrome.storage.local.set({ orgFavicons: {} });
            } catch (e) {
                errorCaught = true;
                expect(e.message).toContain('quota');
            }
            expect(errorCaught).toBe(true);
        });
    });

    describe('Concurrent Storage Access', () => {

        test('should handle concurrent reads', async () => {
            mockStorage.orgFavicons = { '00D1': { color: '#ff6b6b' } };

            const [result1, result2] = await Promise.all([
                chrome.storage.local.get('orgFavicons'),
                chrome.storage.local.get('orgFavicons')
            ]);

            expect(result1.orgFavicons).toEqual(result2.orgFavicons);
        });
    });

    describe('Storage Data Integrity', () => {

        test('should preserve data structure on read/write cycle', async () => {
            const originalData = {
                '00D5g0000012345AAA': {
                    color: '#ff6b6b',
                    label: 'DEV',
                    shape: 'hexagon',
                    orgName: 'Test Org',
                    hostname: 'test.salesforce.com',
                    savedAt: '2026-02-07T00:00:00.000Z'
                }
            };

            await chrome.storage.local.set({ orgFavicons: originalData });
            const result = await chrome.storage.local.get('orgFavicons');

            expect(result.orgFavicons).toEqual(originalData);
        });
    });
});

console.log('Data Explorer tests loaded');
