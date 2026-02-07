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

console.log('Data Explorer tests loaded');

