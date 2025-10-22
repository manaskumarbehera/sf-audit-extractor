
const SALESFORCE_SUFFIXES = ['salesforce.com', 'force.com'];
const API_VERSION = 'v65.0';

let platformWindowId = null;
let lastInstanceUrl = null;

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

chrome.runtime.onStartup.addListener(async () => {
    try {
        const { platformPinned } = await chrome.storage.local.get({ platformPinned: false });
        if (platformPinned) {
            await openPlatformWindow();
        }
    } catch (e) {
        console.warn('onStartup pin restore failed', e);
    }
});

chrome.windows.onRemoved.addListener((winId) => {
    if (platformWindowId && winId === platformWindowId) {
        platformWindowId = null;
    }
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

// Handle general actions and Platform Events pinning
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    (async () => {
        try {
            const raw = msg?.action ?? '';
            const upper = typeof raw === 'string' ? raw.toUpperCase() : '';
            const is = (v) => upper === v || raw === v || raw === v.toLowerCase();

            if (is('PLATFORM_PIN_GET')) {
                const { platformPinned } = await chrome.storage.local.get({ platformPinned: false });
                return { success: true, pinned: !!platformPinned, windowId: platformWindowId };
            }
            if (is('PLATFORM_PIN_SET')) {
                const pinned = !!msg?.pinned;
                await chrome.storage.local.set({ platformPinned: pinned });
                if (pinned) {
                    await openPlatformWindow();
                } else {
                    if (platformWindowId) {
                        try { await chrome.windows.remove(platformWindowId); } catch {}
                        platformWindowId = null;
                    }
                }
                return { success: true, pinned, windowId: platformWindowId };
            }
            if (is('PLATFORM_PIN_TOGGLE')) {
                const { platformPinned } = await chrome.storage.local.get({ platformPinned: false });
                const next = !platformPinned;
                await chrome.storage.local.set({ platformPinned: next });
                if (next) {
                    await openPlatformWindow();
                } else {
                    if (platformWindowId) {
                        try { await chrome.windows.remove(platformWindowId); } catch {}
                        platformWindowId = null;
                    }
                }
                return { success: true, pinned: next, windowId: platformWindowId };
            }

            if (is('CONTENT_PING') || is('CONTENT_READY') || upper === 'CONTENTREADY') {
                // keep track of last known instance URL for extension pages
                try {
                    const url = sanitizeUrl(msg?.url) || (sender?.tab?.url ? sanitizeUrl(sender.tab.url) : null);
                    const norm = normalizeApiBase(url);
                    if (norm) lastInstanceUrl = norm;
                } catch {}
                return { ok: true };
            }

            if (is('GET_SESSION_INFO') || is('GET_SESSION')) {
                const url = sanitizeUrl(msg.url) || (sender?.tab?.url ? sanitizeUrl(sender.tab.url) : null) || lastInstanceUrl || (await findSalesforceOrigin());
                return await getSalesforceSession(url);
            }

            if (is('FETCH_AUDIT_TRAIL') || is('FETCH_AUDIT') || is('fetchAuditTrail')) {
                const rawUrl =
                    sanitizeUrl(msg.instanceUrl) ||
                    sanitizeUrl(msg.url) ||
                    (sender?.tab?.url ? sanitizeUrl(sender.tab.url) : null) ||
                    lastInstanceUrl ||
                    (await findSalesforceOrigin());

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

            if (is('LMS_FETCH_CHANNELS')) {
                const rawUrl =
                    sanitizeUrl(msg.instanceUrl) ||
                    sanitizeUrl(msg.url) ||
                    (sender?.tab?.url ? sanitizeUrl(sender.tab.url) : null) ||
                    lastInstanceUrl ||
                    (await findSalesforceOrigin());
                const instanceUrl = normalizeApiBase(rawUrl);
                if (!instanceUrl) {
                    return { success: false, error: 'Instance URL not detected.' };
                }
                const sess = await getSalesforceSession(instanceUrl);
                const sessionId = sess.sessionId || null;
                if (!sessionId) {
                    return { success: false, error: 'Salesforce session not found. Log in and retry.' };
                }

                const channels = await fetchLmsChannels(instanceUrl, sessionId);
                return { success: true, channels };
            }

            //  SOQL Builder schema and run actions
            if (is('DESCRIBE_GLOBAL')) {
                const rawUrl = sanitizeUrl(msg.instanceUrl) || (sender?.tab?.url ? sanitizeUrl(sender.tab.url) : null) || lastInstanceUrl || (await findSalesforceOrigin());
                const instanceUrl = normalizeApiBase(rawUrl);
                if (!instanceUrl) return { success: false, error: 'Instance URL not detected.' };
                const sess = await getSalesforceSession(instanceUrl);
                const sessionId = sess.sessionId || null;
                if (!sessionId) return { success: false, error: 'Salesforce session not found.' };
                const data = await describeGlobal(instanceUrl, sessionId);
                return { success: true, objects: data };
            }

            if (is('DESCRIBE_SOBJECT')) {
                const name = (msg && msg.name) ? String(msg.name) : '';
                if (!name) return { success: false, error: 'Missing sObject name' };
                const rawUrl = sanitizeUrl(msg.instanceUrl) || (sender?.tab?.url ? sanitizeUrl(sender.tab.url) : null) || lastInstanceUrl || (await findSalesforceOrigin());
                const instanceUrl = normalizeApiBase(rawUrl);
                if (!instanceUrl) return { success: false, error: 'Instance URL not detected.' };
                const sess = await getSalesforceSession(instanceUrl);
                const sessionId = sess.sessionId || null;
                if (!sessionId) return { success: false, error: 'Salesforce session not found.' };
                const describe = await describeSObject(instanceUrl, sessionId, name);
                return describe ? { success: true, describe } : { success: false, error: 'Describe failed' };
            }

            if (is('RUN_SOQL')) {
                const rawUrl = sanitizeUrl(msg.instanceUrl) || (sender?.tab?.url ? sanitizeUrl(sender.tab.url) : null) || lastInstanceUrl || (await findSalesforceOrigin());
                const instanceUrl = normalizeApiBase(rawUrl);
                if (!instanceUrl) return { success: false, error: 'Instance URL not detected.' };
                const sess = await getSalesforceSession(instanceUrl);
                const sessionId = sess.sessionId || null;
                if (!sessionId) return { success: false, error: 'Salesforce session not found.' };
                const query = String(msg?.query || '').trim();
                if (!query) return { success: false, error: 'Empty query' };
                const limit = Number.isFinite(msg?.limit) ? Number(msg.limit) : null;
                const result = await runSoql(instanceUrl, sessionId, query, limit);
                return { success: true, totalSize: result.totalSize, records: result.records, done: true };
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

async function openPlatformWindow() {
    try {
        if (platformWindowId) {
            // if exists, try focus
            await chrome.windows.update(platformWindowId, { focused: true });
            return platformWindowId;
        }
    } catch {
        platformWindowId = null;
    }

    const url = chrome.runtime.getURL('popup.html#platform');
    try {
        const win = await chrome.windows.create({ url, type: 'popup', width: 740, height: 760, focused: true });
        platformWindowId = win?.id || null;
        return platformWindowId;
    } catch (e) {
        console.warn('Failed to open Platform window', e);
        platformWindowId = null;
        return null;
    }
}

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

async function findSalesforceOrigin() {
    try {
        const tabs = await chrome.tabs.query({ url: ['https://*.salesforce.com/*', 'https://*.force.com/*'] });
        const t = Array.isArray(tabs) && tabs.length ? tabs[0] : null;
        return t?.url ? sanitizeUrl(t.url) : null;
    } catch {
        return null;
    }
}

const cookies = {
    get: (details) => new Promise((resolve) => {
        try { chrome.cookies.get(details, (c) => resolve(c || null)); } catch { resolve(null); }
    }),
    getAll: (details) => new Promise((resolve) => {
        try { chrome.cookies.getAll(details, (arr) => resolve(arr || [])); } catch { resolve([]); }
    })
};

async function getSalesforceSession(url) {
    const rawOrigin = originFromUrl(url);
    const instanceUrl = normalizeApiBase(rawOrigin) || rawOrigin;
    const onSF = url ? isSalesforceUrl(url) : false;

    if (!instanceUrl || !onSF) {
        return { success: true, isSalesforce: false, isLoggedIn: false, instanceUrl: instanceUrl || null, sessionId: null };
    }

    let sid = await cookies.get({ url: instanceUrl + '/', name: 'sid' });

    if (!sid) {
        const all = await cookies.getAll({});
        const candidates = (all || []).filter(
            (c) => (c.name === 'sid' || /^sid[_-]/i.test(c.name)) && (c.domain.endsWith('salesforce.com') || c.domain.endsWith('force.com')) && c.value
        );

        candidates.sort((a, b) => {
            const rank = (c) => (c.domain.endsWith('.my.salesforce.com') ? 3 : c.domain.endsWith('salesforce.com') ? 2 : c.domain.endsWith('force.com') ? 1 : 0);
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

    const headers = { Authorization: `Bearer ${sessionId}`, Accept: 'application/json' };

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


async function fetchLmsChannels(instanceUrl, sessionId) {
    const base = String(instanceUrl || '').replace(/\/+$/, '');
    if (!base || !/^https:\/\//i.test(base)) throw new Error('Invalid instance URL');
    const headers = { Authorization: `Bearer ${sessionId}`, Accept: 'application/json' };

    // Do NOT select Metadata in a multi-row query (it causes MALFORMED_QUERY)
    const soql = 'SELECT Id, DeveloperName, MasterLabel, NamespacePrefix FROM LightningMessageChannel ORDER BY DeveloperName';
    const url = `${base}/services/data/${API_VERSION}/tooling/query?q=${encodeURIComponent(soql)}`;
    const res = await fetch(url, { method: 'GET', headers, credentials: 'omit' });
    if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(`Tooling query failed (${res.status}): ${text || res.statusText}`);
    }
    const data = await res.json();
    const items = Array.isArray(data.records) ? data.records : [];

    // Fetch per-channel Metadata with limited concurrency
    const metas = await fetchChannelMetas(base, headers, items, 5);

    return items.map((r, idx) => {
        const meta = metas[idx] || {};
        const lmfs = Array.isArray(meta.lightningMessageFields) ? meta.lightningMessageFields : [];
        const fields = lmfs
            .map((f) => ({
                name: f.name || f.fieldName || f.fullName || '',
                description: f.description || ''
            }))
            .filter((f) => !!f.name);

        return {
            id: r.Id,
            developerName: r.DeveloperName,
            masterLabel: r.MasterLabel,
            namespacePrefix: r.NamespacePrefix || null,
            fullName: (r.NamespacePrefix ? r.NamespacePrefix + '__' : '') + r.DeveloperName,
            fields
        };
    });

    async function fetchChannelMetas(baseUrl, hdrs, channels, concurrency = 5) {
        const out = new Array(channels.length).fill(null);
        let i = 0;

        async function worker() {
            while (true) {
                const idx = i++;
                if (idx >= channels.length) break;
                const id = channels[idx].Id;
                try {
                    const resp = await fetch(
                        `${baseUrl}/services/data/${API_VERSION}/tooling/sobjects/LightningMessageChannel/${encodeURIComponent(id)}`,
                        { method: 'GET', headers: hdrs, credentials: 'omit' }
                    );
                    if (resp.ok) {
                        const json = await resp.json();
                        out[idx] = json?.Metadata || null;
                    } else {
                        out[idx] = null;
                    }
                } catch {
                    out[idx] = null;
                }
            }
        }

        const workers = Array.from({ length: Math.min(concurrency, channels.length) }, () => worker());
        await Promise.all(workers);
        return out;
    }
}

// New helpers for SOQL Builder
async function getApiVersion() {
    try {
        const { apiVersion } = await chrome.storage.local.get({ apiVersion: '65.0' });
        const v = String(apiVersion || '65.0');
        return v.startsWith('v') ? v : ('v' + v);
    } catch {
        return API_VERSION; // fallback (already has leading 'v')
    }
}

async function describeGlobal(instanceUrl, sessionId) {
    const base = String(instanceUrl || '').replace(/\/+$/, '');
    if (!base) throw new Error('Invalid instance URL');
    const v = await getApiVersion();
    const url = `${base}/services/data/${v}/sobjects`;
    const res = await fetch(url, { method: 'GET', headers: { Authorization: `Bearer ${sessionId}`, Accept: 'application/json' }, credentials: 'omit' });
    if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(`Describe Global failed (${res.status}): ${text || res.statusText}`);
    }
    const data = await res.json();
    const list = Array.isArray(data?.sobjects) ? data.sobjects : [];
    return list.map(s => ({ name: s.name, label: s.label || s.name, custom: !!s.custom, keyPrefix: s.keyPrefix || null }));
}

async function describeSObject(instanceUrl, sessionId, name) {
    const base = String(instanceUrl || '').replace(/\/+$/, '');
    if (!base) throw new Error('Invalid instance URL');
    const v = await getApiVersion();
    const url = `${base}/services/data/${v}/sobjects/${encodeURIComponent(name)}/describe`;
    const res = await fetch(url, { method: 'GET', headers: { Authorization: `Bearer ${sessionId}`, Accept: 'application/json' }, credentials: 'omit' });
    if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(`Describe ${name} failed (${res.status}): ${text || res.statusText}`);
    }
    const json = await res.json();
    // Keep as-is but trim heavy props; include relationshipName for relationship field suggestions
    const fields = Array.isArray(json.fields)
        ? json.fields.map(f => ({
            name: f.name,
            label: f.label || f.name,
            type: f.type,
            nillable: f.nillable,
            referenceTo: f.referenceTo || [],
            relationshipName: f.relationshipName || null
        }))
        : [];
    return { name: json.name || name, label: json.label || name, fields };
}

async function runSoql(instanceUrl, sessionId, query, limit) {
    const base = String(instanceUrl || '').replace(/\/+$/, '');
    if (!base) throw new Error('Invalid instance URL');
    const v = await getApiVersion();

    let finalQuery = String(query || '').trim();
    if (limit && !/\blimit\b/i.test(finalQuery)) {
        finalQuery = `${finalQuery} LIMIT ${limit}`;
    }

    const headers = { Authorization: `Bearer ${sessionId}`, Accept: 'application/json' };

    const records = [];
    let url = `${base}/services/data/${v}/query?q=${encodeURIComponent(finalQuery)}`;
    let guard = 0;
    const hardCap = Math.max(1, Number(limit || 200));

    while (url && records.length < hardCap && guard < 50) {
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
                if (records.length >= hardCap) break;
            }
        }
        url = data.nextRecordsUrl && records.length < hardCap ? `${base}${data.nextRecordsUrl}` : null;
    }

    return { totalSize: records.length, records };
}

