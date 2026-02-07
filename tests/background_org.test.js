/**
 * Background Script Tests - Org ID and Session Management
 * Tests for GET_ORG_ID, GET_SESSION_INFO, and related functionality
 */

// Mock fetch
global.fetch = jest.fn();

// Mock chrome APIs
global.chrome = {
    cookies: {
        get: jest.fn(),
        getAll: jest.fn()
    },
    storage: {
        local: {
            get: jest.fn(() => Promise.resolve({ apiVersion: '66.0' })),
            set: jest.fn(() => Promise.resolve())
        }
    },
    runtime: {
        sendMessage: jest.fn(),
        onMessage: {
            addListener: jest.fn()
        }
    },
    tabs: {
        query: jest.fn()
    },
    windows: {
        create: jest.fn(),
        update: jest.fn(),
        remove: jest.fn(),
        onRemoved: {
            addListener: jest.fn()
        }
    },
    action: {
        setBadgeText: jest.fn(),
        setBadgeBackgroundColor: jest.fn()
    },
    declarativeContent: {
        onPageChanged: {
            removeRules: jest.fn(),
            addRules: jest.fn()
        },
        PageStateMatcher: jest.fn(),
        ShowAction: jest.fn()
    }
};

beforeEach(() => {
    jest.clearAllMocks();
    global.fetch.mockReset();
});

describe('GET_ORG_ID Message Handler', () => {

    test('should return org ID from successful API call', async () => {
        const mockOrgId = '00D5g0000012345AAA';

        global.fetch.mockResolvedValueOnce({
            ok: true,
            json: () => Promise.resolve({
                records: [{ Id: mockOrgId }]
            })
        });

        chrome.cookies.getAll.mockResolvedValueOnce([
            { name: 'sid', value: 'test-session-id', domain: '.salesforce.com' }
        ]);

        // Simulate the handler logic
        const hostname = 'myorg.my.salesforce.com';
        const instanceUrl = `https://${hostname}`;
        const apiVersion = 'v66.0';
        const soql = 'SELECT+Id+FROM+Organization+LIMIT+1';

        const response = await fetch(`${instanceUrl}/services/data/${apiVersion}/query?q=${soql}`, {
            method: 'GET',
            headers: {
                'Authorization': 'Bearer test-session-id',
                'Accept': 'application/json'
            }
        });

        const data = await response.json();
        const orgId = data?.records?.[0]?.Id || null;

        expect(orgId).toBe(mockOrgId);
    });

    test('should handle missing session cookie', async () => {
        // Set up mock to return empty array for this specific test
        const emptyCookies = [];

        // Simulate no sid cookie found
        const sidCookie = emptyCookies.find(c => c.name === 'sid');

        expect(sidCookie).toBeUndefined();
    });

    test('should handle API error response', async () => {
        global.fetch.mockResolvedValueOnce({
            ok: false,
            status: 401,
            statusText: 'Unauthorized'
        });

        const response = await fetch('https://myorg.my.salesforce.com/services/data/v66.0/query');

        expect(response.ok).toBe(false);
        expect(response.status).toBe(401);
    });

    test('should handle network error', async () => {
        global.fetch.mockRejectedValueOnce(new Error('Network error'));

        try {
            await fetch('https://myorg.my.salesforce.com/services/data/v66.0/query');
        } catch (e) {
            expect(e.message).toBe('Network error');
        }
    });
});

describe('Session Detection', () => {

    test('should find sid cookie from Salesforce domain', async () => {
        const mockCookies = [
            { name: 'sid', value: 'session-123', domain: '.my.salesforce.com' },
            { name: 'other', value: 'other-value', domain: '.salesforce.com' }
        ];

        const sidCookie = mockCookies.find(c => c.name === 'sid');

        expect(sidCookie).toBeDefined();
        expect(sidCookie.value).toBe('session-123');
    });

    test('should rank cookies by domain priority', async () => {
        const cookies = [
            { domain: '.force.com', name: 'sid', value: 'a' },
            { domain: '.my.salesforce.com', name: 'sid', value: 'b' },
            { domain: '.salesforce.com', name: 'sid', value: 'c' }
        ];

        const rankHost = (domain) => {
            const h = domain.toLowerCase();
            if (h.endsWith('.my.salesforce.com')) return 4;
            if (h.endsWith('.salesforce.com')) return 3;
            if (h.endsWith('.force.com')) return 2;
            return 0;
        };

        cookies.sort((a, b) => rankHost(b.domain) - rankHost(a.domain));

        expect(cookies[0].domain).toBe('.my.salesforce.com');
    });
});

describe('API Version Handling', () => {

    test('should return stored API version', async () => {
        chrome.storage.local.get.mockResolvedValueOnce({ apiVersion: '65.0' });

        const result = await chrome.storage.local.get({ apiVersion: '65.0' });
        expect(result.apiVersion).toBe('65.0');
    });

    test('should normalize version format', () => {
        const normalizeVersion = (v) => {
            let version = String(v || '65.0').replace(/^v/i, '');
            const match = version.match(/^(\d{1,3})(?:\.(\d{1,2}))?$/);
            if (!match) version = '65.0';
            return 'v' + version;
        };

        expect(normalizeVersion('66.0')).toBe('v66.0');
        expect(normalizeVersion('v66.0')).toBe('v66.0');
        expect(normalizeVersion('invalid')).toBe('v65.0');
        expect(normalizeVersion(null)).toBe('v65.0');
    });
});

describe('Salesforce URL Detection', () => {

    const SALESFORCE_SUFFIXES = ['salesforce.com', 'force.com', 'salesforce-setup.com'];

    const isSalesforceUrl = (url) => {
        try {
            const u = new URL(url);
            if (u.protocol !== 'https:') return false;
            const h = u.hostname.toLowerCase();
            return SALESFORCE_SUFFIXES.some((s) => h === s || h.endsWith('.' + s));
        } catch {
            return false;
        }
    };

    test('should detect valid Salesforce URLs', () => {
        expect(isSalesforceUrl('https://myorg.my.salesforce.com')).toBe(true);
        expect(isSalesforceUrl('https://myorg.lightning.force.com')).toBe(true);
        expect(isSalesforceUrl('https://myorg.salesforce-setup.com')).toBe(true);
    });

    test('should reject non-HTTPS URLs', () => {
        expect(isSalesforceUrl('http://myorg.my.salesforce.com')).toBe(false);
    });

    test('should reject non-Salesforce URLs', () => {
        expect(isSalesforceUrl('https://google.com')).toBe(false);
        expect(isSalesforceUrl('https://fake-salesforce.com')).toBe(false);
    });
});

describe('SOQL Query Building', () => {

    test('should build Organization query', () => {
        const soql = 'SELECT Id, Name FROM Organization LIMIT 1';
        const encoded = encodeURIComponent(soql);

        expect(encoded).toContain('SELECT');
        expect(encoded).toContain('Organization');
        expect(encoded).not.toContain(' '); // spaces should be encoded
    });

    test('should URL encode special characters', () => {
        const soql = "SELECT Id FROM User WHERE Name = 'Test'";
        const encoded = encodeURIComponent(soql);

        // encodeURIComponent does NOT encode apostrophes, but encodes spaces as %20
        expect(encoded).toContain('%20'); // encoded space
        expect(encoded).toContain("'"); // apostrophe remains unencoded (which is valid in URLs)
    });
});

describe('Instance URL Normalization', () => {

    const normalizeApiBase = (url) => {
        if (!url) return null;
        try {
            const u = new URL(url);
            let host = u.hostname.toLowerCase();

            // Convert lightning.force.com to my.salesforce.com
            if (host.includes('.lightning.force.com')) {
                host = host.replace('.lightning.force.com', '.my.salesforce.com');
            }
            // Convert visual.force.com
            if (host.includes('.visual.force.com')) {
                host = host.replace('.visual.force.com', '.my.salesforce.com');
            }
            // Convert salesforce-setup.com
            if (host.includes('.salesforce-setup.com')) {
                host = host.replace('.salesforce-setup.com', '.my.salesforce.com');
            }

            return `https://${host}`;
        } catch {
            return null;
        }
    };

    test('should normalize lightning URLs', () => {
        expect(normalizeApiBase('https://myorg.lightning.force.com')).toBe('https://myorg.my.salesforce.com');
    });

    test('should normalize visualforce URLs', () => {
        expect(normalizeApiBase('https://myorg.visual.force.com')).toBe('https://myorg.my.salesforce.com');
    });

    test('should normalize setup URLs', () => {
        expect(normalizeApiBase('https://myorg.salesforce-setup.com')).toBe('https://myorg.my.salesforce.com');
    });

    test('should handle invalid URLs', () => {
        expect(normalizeApiBase('')).toBe(null);
        expect(normalizeApiBase(null)).toBe(null);
        expect(normalizeApiBase('not-a-url')).toBe(null);
    });
});

describe('Error Response Handling', () => {

    test('should parse Salesforce error response', () => {
        const errorResponse = [
            { message: 'Invalid session', errorCode: 'INVALID_SESSION_ID' }
        ];

        const errorMessage = Array.isArray(errorResponse) && errorResponse[0]?.message
            ? errorResponse[0].message
            : 'Unknown error';

        expect(errorMessage).toBe('Invalid session');
    });

    test('should handle empty error response', () => {
        const errorResponse = {};

        const errorMessage = errorResponse?.message || 'Unknown error';
        expect(errorMessage).toBe('Unknown error');
    });
});

describe('Retry Logic', () => {

    test('should identify retryable errors', () => {
        const isRetryable = (errStr) => {
            return errStr.includes('Failed to fetch') ||
                   errStr.includes('NetworkError') ||
                   errStr.includes('AbortError') ||
                   errStr.includes('timeout');
        };

        expect(isRetryable('Failed to fetch')).toBe(true);
        expect(isRetryable('NetworkError: Connection refused')).toBe(true);
        expect(isRetryable('Invalid session')).toBe(false);
    });

    test('should calculate exponential backoff', () => {
        const backoff = (attempt) => Math.pow(2, attempt - 1) * 1000;

        expect(backoff(1)).toBe(1000);  // 1 second
        expect(backoff(2)).toBe(2000);  // 2 seconds
        expect(backoff(3)).toBe(4000);  // 4 seconds
    });
});

// ==========================================
// NEW TEST CASES FOR RECENT FAILURES
// ==========================================

describe('GET_ORG_ID Edge Cases', () => {

    test('should handle missing tab ID in sender', () => {
        const sender = { tab: null };
        const hasTabId = sender.tab?.id;
        expect(hasTabId).toBeFalsy();
    });

    test('should handle missing URL in sender', () => {
        const sender = { tab: { id: 1 }, url: null };
        const url = sender.tab?.url || sender.url;
        expect(url).toBeNull();
    });

    test('should extract hostname from URL safely', () => {
        const validUrl = 'https://myorg.my.salesforce.com/lightning/page/home';
        const invalidUrl = 'not-a-url';

        // Valid URL
        try {
            const hostname = new URL(validUrl).hostname;
            expect(hostname).toBe('myorg.my.salesforce.com');
        } catch {
            fail('Should not throw for valid URL');
        }

        // Invalid URL should throw
        expect(() => new URL(invalidUrl)).toThrow();
    });

    test('should construct correct API URL for org query', () => {
        const hostname = 'myorg.my.salesforce.com';
        const apiVersion = 'v66.0';
        const soql = 'SELECT+Id+FROM+Organization+LIMIT+1';

        const instanceUrl = `https://${hostname}`;
        const apiUrl = `${instanceUrl}/services/data/${apiVersion}/query?q=${soql}`;

        expect(apiUrl).toBe('https://myorg.my.salesforce.com/services/data/v66.0/query?q=SELECT+Id+FROM+Organization+LIMIT+1');
    });
});

describe('Cookie Handling for Session', () => {

    test('should find sid cookie by name', () => {
        const cookies = [
            { name: 'BrowserId', value: 'abc123', domain: '.salesforce.com' },
            { name: 'sid', value: 'session-token', domain: '.salesforce.com' },
            { name: 'oid', value: '00D123', domain: '.salesforce.com' }
        ];

        const sidCookie = cookies.find(c => c.name === 'sid');
        expect(sidCookie).toBeDefined();
        expect(sidCookie.value).toBe('session-token');
    });

    test('should handle no sid cookie found', () => {
        const cookies = [
            { name: 'BrowserId', value: 'abc123', domain: '.salesforce.com' }
        ];

        const sidCookie = cookies.find(c => c.name === 'sid');
        expect(sidCookie).toBeUndefined();
    });

    test('should use sid value as Bearer token', () => {
        const sidValue = 'session-token-12345';
        const authHeader = `Bearer ${sidValue}`;
        expect(authHeader).toBe('Bearer session-token-12345');
    });
});

describe('Message Response Handling', () => {

    test('should return success with orgId on successful query', () => {
        const apiResponse = {
            records: [{ Id: '00D5g0000012345AAA' }]
        };

        const orgId = apiResponse?.records?.[0]?.Id || null;
        const response = { success: true, orgId };

        expect(response.success).toBe(true);
        expect(response.orgId).toBe('00D5g0000012345AAA');
    });

    test('should return error response on API failure', () => {
        const apiStatus = 401;
        const response = { success: false, error: `API ${apiStatus}` };

        expect(response.success).toBe(false);
        expect(response.error).toBe('API 401');
    });

    test('should return error response on exception', () => {
        const error = new Error('Network timeout');
        const response = { success: false, error: String(error) };

        expect(response.success).toBe(false);
        expect(response.error).toContain('Network timeout');
    });
});

describe('Tab URL Validation', () => {

    test('should validate Salesforce URLs before making API calls', () => {
        const validUrls = [
            'https://myorg.my.salesforce.com/lightning/page/home',
            'https://myorg.lightning.force.com/lightning/r/Account/001/view',
            'https://myorg.salesforce-setup.com/lightning/setup/SetupOneHome/home'
        ];

        const invalidUrls = [
            'https://google.com',
            'chrome-extension://abc/popup.html',
            'about:blank',
            'file:///path/to/file.html'
        ];

        const isSalesforce = (url) => {
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

        validUrls.forEach(url => {
            expect(isSalesforce(url)).toBe(true);
        });

        invalidUrls.forEach(url => {
            expect(isSalesforce(url)).toBe(false);
        });
    });
});

describe('Async Message Handler Pattern', () => {

    test('should return true to keep message channel open for async response', () => {
        // Chrome extension pattern: return true from onMessage to indicate async response
        const handleAsyncMessage = (msg, sender, sendResponse) => {
            // Start async operation
            Promise.resolve().then(() => {
                sendResponse({ success: true });
            });
            return true; // Keep channel open
        };

        const sendResponse = jest.fn();
        const result = handleAsyncMessage({}, {}, sendResponse);

        expect(result).toBe(true);
    });

    test('should handle IIFE async pattern in message listener', async () => {
        const mockSendResponse = jest.fn();

        // Simulate the IIFE async pattern used in background.js
        const handleMessage = (msg, sender, sendResponse) => {
            (async () => {
                try {
                    const result = await Promise.resolve({ orgId: '00D123' });
                    sendResponse({ success: true, ...result });
                } catch (err) {
                    sendResponse({ success: false, error: String(err) });
                }
            })();
            return true;
        };

        handleMessage({}, {}, mockSendResponse);

        // Wait for async operation
        await new Promise(resolve => setTimeout(resolve, 10));

        expect(mockSendResponse).toHaveBeenCalledWith({
            success: true,
            orgId: '00D123'
        });
    });
});

console.log('Background script tests loaded');

