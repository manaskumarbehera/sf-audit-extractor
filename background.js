// JavaScript
// file: background.js
// MV3 service worker: Salesforce detection, session reading, and Tooling API fetch for SetupAuditTrail.

const SALESFORCE_SUFFIXES = ['salesforce.com', 'force.com'];
const API_VERSION = 'v65.0';

chrome.runtime.onInstalled.addListener(() => {
    if (!chrome.declarativeContent?.onPageChanged) return;
    chrome.declarativeContent.onPageChanged.removeRules(undefined, () => {
        const conditions = SALESFORCE_SUFFIXES.map(
            (suffix) =>
                new chrome.declarativeContent.PageStateMatcher({
                    pageUrl: { hostSuffix: suffix, schemes: ['https'] }
                })
        );
        chrome.declarativeContent.onPageChanged.addRules([
            { conditions, actions: [new chrome.declarativeContent.ShowAction()] }
        ]);
    });
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (changeInfo.status !== 'complete' || !tab?.url) return;
    const isSF = isSalesforceUrl(tab.url);
    chrome.action.setBadgeText({ tabId, text: isSF ? 'SF' : '' });
    if (isSF) chrome.action.setBadgeBackgroundColor({ tabId, color: '#00A1E0' });
});
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg && msg.action === 'FETCH_ORG_NAME') {
        (async () => {
            try {
                const soql = 'SELECT+Name+FROM+Organization+LIMIT+1';
                const url = `${msg.instanceUrl}/services/data/v56.0/query?q=${soql}`;
                const res = await fetch(url, {
                    method: 'GET',
                    headers: {
                        'Authorization': `Bearer ${msg.accessToken}`,
                        'Accept': 'application/json'
                    }
                });
                if (!res.ok) throw new Error(`SF API ${res.status}: ${res.statusText}`);
                const data = await res.json();
                const name = data?.records?.[0]?.Name || null;
                sendResponse({ success: true, orgName: name });
            } catch (err) {
                console.error('background FETCH_ORG_NAME error', err);
                sendResponse({ success: false, error: String(err) });
            }
        })();
        return true; // keep message channel open for async sendResponse
    }
});

// Always reply and keep worker alive for async.
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    (async () => {
        try {
            const raw = msg?.action ?? '';
            const upper = typeof raw === 'string' ? raw.toUpperCase() : '';
            const is = (v) => upper === v || raw === v || raw === v.toLowerCase();

            if (is('CONTENT_PING') || is('CONTENT_READY') || upper === 'CONTENTREADY') {
                return { ok: true };
            }

            if (is('GET_SESSION_INFO') || is('GET_SESSION')) {
                const url = sanitizeUrl(msg.url) || (sender?.tab?.url ? sanitizeUrl(sender.tab.url) : null);
                return await getSalesforceSession(url);
            }

            if (is('FETCH_AUDIT_TRAIL') || is('FETCH_AUDIT') || is('fetchAuditTrail')) {
                const rawUrl =
                    sanitizeUrl(msg.instanceUrl) ||
                    sanitizeUrl(msg.url) ||
                    (sender?.tab?.url ? sanitizeUrl(sender.tab.url) : null);

                const instanceUrl = normalizeApiBase(rawUrl);
                if (!instanceUrl) return { success: false, error: 'Instance URL not detected.' };

                const sess = await getSalesforceSession(instanceUrl);
                const sessionId = sess.sessionId || null;
                if (!sessionId) return { success: false, error: 'Salesforce session not found. Log in and retry.' };

                const days = Number.isFinite(msg?.days) ? Number(msg.days) : 180;
                const limit = Number.isFinite(msg?.limit) ? Number(msg.limit) : 2000;

                const result = await fetchAuditTrail(instanceUrl, sessionId, { days, limit });
                return { success: true, totalSize: result.totalSize, data: result.records };
            }

            return { ok: false, error: 'Unknown action', action: raw, expected: ['GET_SESSION_INFO', 'FETCH_AUDIT_TRAIL'] };
        } catch (e) {
            return { success: false, error: String(e) };
        }
    })().then((resp) => {
        try { sendResponse(resp); } catch {}
    });

    return true;
});

// Helpers

function isSalesforceUrl(url) {
    try {
        const u = new URL(url);
        if (u.protocol !== 'https:') return false;
        const h = u.hostname.toLowerCase();
        return SALESFORCE_SUFFIXES.some((s) => h === s || h.endsWith('.' + s));
    } catch {
        return false;
    }
}

function originFromUrl(url) {
    try {
        return new URL(url).origin;
    } catch {
        const m = String(url || '').match(/^(https:\/\/[^/]+)/i);
        return m ? m[1] : null;
    }
}

function sanitizeUrl(url) {
    if (!url) return null;
    try {
        return new URL(url).origin;
    } catch {
        return null;
    }
}

// Map Lightning/VF/other force.com hosts to API base host that accepts REST session cookie.
function normalizeApiBase(url) {
    const o = sanitizeUrl(url);
    if (!o) return null;
    const u = new URL(o);
    const h = u.hostname.toLowerCase();

    if (h.endsWith('.lightning.force.com')) {
        u.hostname = h.replace(/\.lightning\.force\.com$/, '.my.salesforce.com');
    } else if (h.endsWith('.visual.force.com')) {
        u.hostname = h.replace(/\.visual\.force\.com$/, '.my.salesforce.com');
    } else if (h.endsWith('.force.com') && !h.endsWith('.my.salesforce.com')) {
        u.hostname = h.replace(/\.force\.com$/, '.salesforce.com');
    }
    return u.origin;
}

// Promise wrappers for cookies API
const cookies = {
    get: (details) =>
        new Promise((resolve) => {
            try {
                chrome.cookies.get(details, (c) => resolve(c || null));
            } catch {
                resolve(null);
            }
        }),
    getAll: (details) =>
        new Promise((resolve) => {
            try {
                chrome.cookies.getAll(details, (arr) => resolve(arr || []));
            } catch {
                resolve([]);
            }
        })
};

async function getSalesforceSession(url) {
    const rawOrigin = originFromUrl(url);
    const instanceUrl = normalizeApiBase(rawOrigin) || rawOrigin;
    const onSF = url ? isSalesforceUrl(url) : false;

    if (!instanceUrl || !onSF) {
        return { success: true, isSalesforce: false, isLoggedIn: false, instanceUrl: instanceUrl || null, sessionId: null };
    }

    // Try direct host first
    let sid = await cookies.get({ url: instanceUrl + '/', name: 'sid' });

    // Fallback: scan all cookies for best sid candidate
    if (!sid) {
        const all = await cookies.getAll({});
        const candidates = (all || []).filter(
            (c) =>
                (c.name === 'sid' || /^sid[_-]/i.test(c.name)) &&
                (c.domain.endsWith('salesforce.com') || c.domain.endsWith('force.com')) &&
                c.value
        );

        candidates.sort((a, b) => {
            const rank = (c) =>
                (c.domain.endsWith('.my.salesforce.com') ? 3 :
                    c.domain.endsWith('salesforce.com') ? 2 :
                        c.domain.endsWith('force.com') ? 1 : 0);
            const rdiff = rank(b) - rank(a);
            return rdiff !== 0 ? rdiff : (b.value.length - a.value.length);
        });

        sid = candidates[0] || null;
    }

    return {
        success: true,
        isSalesforce: true,
        isLoggedIn: Boolean(sid?.value),
        instanceUrl,
        sessionId: sid?.value || null,
        cookieDomain: sid?.domain || null,
        cookieName: sid?.name || null,
        expiry: sid?.expirationDate || null
    };
}

// Tooling API query for SetupAuditTrail
async function fetchAuditTrailTooling(instanceUrl, sessionId, opts = {}) {
    const days = Number.isFinite(opts.days) ? opts.days : 180;
    const max = Number.isFinite(opts.limit) ? opts.limit : 2000;

    const base = String(instanceUrl || '').replace(/\/+$/, '');
    if (!base || !/^https:\/\//i.test(base)) throw new Error('Invalid instance URL');

    const soql = [
        'SELECT Id, Action, Section, CreatedDate, CreatedById, CreatedBy.Name',
        'FROM SetupAuditTrail',
        `WHERE CreatedDate = LAST_N_DAYS:${days}`,
        'ORDER BY CreatedDate DESC'
    ].join(' ');

    const headers = {
        Authorization: `Bearer ${sessionId}`,
        Accept: 'application/json'
    };

    const records = [];
    let url = `${base}/services/data/${API_VERSION}/query?q=${encodeURIComponent(soql)}`;
    let guard = 0;

    while (url && records.length < max && guard < 50) {
        guard++;
        const res = await fetch(url, { method: 'GET', headers, credentials: 'omit' });
        if (!res.ok) {
            const text = await res.text().catch(() => '');
            throw new Error(`Tooling query failed (${res.status}): ${text || res.statusText}`);
        }
        const data = await res.json();
        if (Array.isArray(data.records)) {
            for (const r of data.records) {
                records.push(r);
                if (records.length >= max) break;
            }
        }
        url = data.nextRecordsUrl && records.length < max ? `${base}${data.nextRecordsUrl}` : null;
    }

    return { totalSize: records.length, records };
}


async function fetchAuditTrail(instanceUrl, sessionId, opts = {}) {
    const days = Number.isFinite(opts.days) ? opts.days : 180;
    const max = Number.isFinite(opts.limit) ? opts.limit : 2000;

    const base = String(instanceUrl || '').replace(/\/+$/, '');
    if (!base || !/^https:\/\//i.test(base)) throw new Error('Invalid instance URL');

    const soql = [
        'SELECT Id, Action, Section, CreatedDate, CreatedById, CreatedBy.Name',
        'FROM SetupAuditTrail',
        `WHERE CreatedDate = LAST_N_DAYS:${days}`,
        'ORDER BY CreatedDate DESC'
    ].join(' ');

    const headers = {
        Authorization: `Bearer ${sessionId}`,
        Accept: 'application/json'
    };

    const records = [];
    let url = `${base}/services/data/${API_VERSION}/query?q=${encodeURIComponent(soql)}`;
    let guard = 0;

    while (url && records.length < max && guard < 50) {
        guard++;
        const res = await fetch(url, { method: 'GET', headers, credentials: 'omit' });
        if (!res.ok) {
            const text = await res.text().catch(() => '');
            throw new Error(`Query failed (${res.status}): ${text || res.statusText}`);
        }
        const data = await res.json();
        if (Array.isArray(data.records)) {
            for (const r of data.records) {
                records.push(r);
                if (records.length >= max) break;
            }
        }
        url = data.nextRecordsUrl && records.length < max ? `${base}${data.nextRecordsUrl}` : null;
    }

    return { totalSize: records.length, records };
}