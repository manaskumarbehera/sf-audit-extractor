const SALESFORCE_SUFFIXES = ['salesforce.com', 'force.com'];
const API_VERSION = 'v65.0';

let platformWindowId = null;
let lastInstanceUrl = null;

const cookies = {
    get: (details) => new Promise((resolve) => {
        try { chrome.cookies.get(details, (c) => resolve(c || null)); } catch { resolve(null); }
    }),
    getAll: (details) => new Promise((resolve) => {
        try { chrome.cookies.getAll(details, (arr) => resolve(arr || [])); } catch { resolve([]); }
    })
};

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
    handleRuntimeMessage(msg, sender)
        .then((resp) => sendResponse(resp))
        .catch((err) => {
            try {
                sendResponse({ success: false, error: String(err) });
            } catch {}
        });
    return true;
});

async function handleRuntimeMessage(msg, sender) {
    // Normalize incoming action names from various casing/aliases
    const rawAction = (msg && typeof msg === 'object') ? (msg.action || '') : (typeof msg === 'string' ? msg : '');
    const action = normalizeAction(rawAction);

    switch (action) {
        case 'FETCH_ORG_NAME':
            return await handleFetchOrgName(msg);
        case 'PLATFORM_PIN_GET':
            return await handlePlatformPinGet();
        case 'PLATFORM_PIN_SET':
            return await handlePlatformPinSet(msg);
        case 'PLATFORM_PIN_TOGGLE':
            return await handlePlatformPinToggle();
        case 'CONTENT_PING':
        case 'CONTENT_READY':
            return await handleContentReady(msg, sender);
        case 'GET_SESSION_INFO':
            return await handleGetSessionInfo(msg, sender);
        case 'FETCH_AUDIT_TRAIL':
            return await handleFetchAuditTrail(msg, sender);
        case 'LMS_FETCH_CHANNELS':
            return await handleLmsFetchChannels(msg, sender);
        case 'DESCRIBE_GLOBAL':
            return await handleDescribeGlobal(msg, sender);
        case 'DESCRIBE_SOBJECT':
            return await handleDescribeSObject(msg, sender);
        case 'RUN_SOQL':
            return await handleRunSoql(msg, sender);
        default:
            return { ok: false, error: 'Unknown action', action };
    }
}

function normalizeAction(action) {
    if (!action) return '';
    const raw = String(action).trim();
    if (!raw) return '';
    const upper = raw.toUpperCase();

    const ACTION_ALIASES = {
        FETCH_ORG_NAME: 'FETCH_ORG_NAME',
        PLATFORM_PIN_GET: 'PLATFORM_PIN_GET',
        PLATFORM_PIN_SET: 'PLATFORM_PIN_SET',
        PLATFORM_PIN_TOGGLE: 'PLATFORM_PIN_TOGGLE',
        CONTENT_PING: 'CONTENT_PING',
        CONTENT_READY: 'CONTENT_READY',
        CONTENTREADY: 'CONTENT_READY',
        GET_SESSION_INFO: 'GET_SESSION_INFO',
        GET_SESSION: 'GET_SESSION_INFO',
        GETSESSION: 'GET_SESSION_INFO',
        GETSESSIONINFO: 'GET_SESSION_INFO',
        FETCH_AUDIT_TRAIL: 'FETCH_AUDIT_TRAIL',
        FETCH_AUDIT: 'FETCH_AUDIT_TRAIL',
        FETCHAUDITTRAIL: 'FETCH_AUDIT_TRAIL',
        LMS_FETCH_CHANNELS: 'LMS_FETCH_CHANNELS',
        DESCRIBE_GLOBAL: 'DESCRIBE_GLOBAL',
        DESCRIBE_SOBJECT: 'DESCRIBE_SOBJECT',
        RUN_SOQL: 'RUN_SOQL',
        RUNSOQL: 'RUN_SOQL'
    };

    if (ACTION_ALIASES[upper]) {
        return ACTION_ALIASES[upper];
    }

    const camelToSnake = raw
        .replace(/([a-z])([A-Z])/g, '$1_$2')
        .replace(/[\s-]+/g, '_')
        .toUpperCase();

    if (ACTION_ALIASES[camelToSnake]) {
        return ACTION_ALIASES[camelToSnake];
    }

    return camelToSnake;
}

async function handleFetchOrgName(msg) {
    try {
        const instanceUrl = sanitizeUrl(msg?.instanceUrl) || msg?.instanceUrl || null;
        const accessToken = msg?.accessToken || null;
        if (!instanceUrl || !accessToken) {
            return { success: false, error: 'Missing instanceUrl or accessToken' };
        }
        const soql = 'SELECT+Name+FROM+Organization+LIMIT+1';
        const version = typeof msg?.apiVersion === 'string' && msg.apiVersion.trim()
            ? `v${msg.apiVersion.replace(/^v/i, '')}`
            : API_VERSION;
        const url = `${instanceUrl}/services/data/${version}/query?q=${soql}`;
        const res = await fetch(url, {
            method: 'GET',
            headers: {
                Authorization: `Bearer ${accessToken}`,
                Accept: 'application/json'
            }
        });
        if (!res.ok) {
            const errMsg = `SF API ${res.status}: ${res.statusText}`;
            return { success: false, error: errMsg };
        }
        const data = await res.json();
        const name = data?.records?.[0]?.Name || null;
        return { success: true, orgName: name };
    } catch (err) {
        console.error('background FETCH_ORG_NAME error', err);
        return { success: false, error: String(err) };
    }
}

async function handlePlatformPinGet() {
    const { platformPinned } = await chrome.storage.local.get({ platformPinned: false });
    return { success: true, pinned: !!platformPinned, windowId: platformWindowId };
}

async function handlePlatformPinSet(msg) {
    const pinned = !!msg?.pinned;
    await chrome.storage.local.set({ platformPinned: pinned });
    if (pinned) {
        await openPlatformWindow();
    } else if (platformWindowId) {
        try { await chrome.windows.remove(platformWindowId); } catch {}
        platformWindowId = null;
    }
    return { success: true, pinned, windowId: platformWindowId };
}

async function handlePlatformPinToggle() {
    const { platformPinned } = await chrome.storage.local.get({ platformPinned: false });
    const next = !platformPinned;
    await chrome.storage.local.set({ platformPinned: next });
    if (next) {
        await openPlatformWindow();
    } else if (platformWindowId) {
        try { await chrome.windows.remove(platformWindowId); } catch {}
        platformWindowId = null;
    }
    return { success: true, pinned: next, windowId: platformWindowId };
}

async function handleContentReady(msg, sender) {
    try {
        const url = sanitizeUrl(msg?.url) || (sender?.tab?.url ? sanitizeUrl(sender.tab.url) : null);
        const norm = normalizeApiBase(url);
        if (norm) {
            lastInstanceUrl = norm;
        }
    } catch {}
    return { ok: true };
}

async function handleGetSessionInfo(msg, sender) {
    const context = await resolveInstanceContext(msg, sender, { ensureSessionInfo: true });
    return context.sessionInfo;
}

async function handleFetchAuditTrail(msg, sender) {
    const context = await resolveInstanceContext(msg, sender, {
        requireInstance: true,
        requireSession: true,
        ensureSessionInfo: false
    });
    const days = Number.isFinite(msg?.days) ? Number(msg.days) : 180;
    const limit = Number.isFinite(msg?.limit) ? Number(msg.limit) : 2000;
    const result = await fetchAuditTrail(context.instanceUrl, context.sessionId, { days, limit });
    return { success: true, totalSize: result.totalSize, data: result.records };
}

async function handleLmsFetchChannels(msg, sender) {
    const context = await resolveInstanceContext(msg, sender, {
        requireInstance: true,
        requireSession: true
    });
    const channels = await fetchLmsChannels(context.instanceUrl, context.sessionId);
    return { success: true, channels };
}

async function handleDescribeGlobal(msg, sender) {
    const context = await resolveInstanceContext(msg, sender, {
        requireInstance: true,
        requireSession: true
    });
    const data = await describeGlobal(context.instanceUrl, context.sessionId, msg.useTooling);
    return { success: true, objects: data };
}

async function handleDescribeSObject(msg, sender) {
    const name = msg?.name ? String(msg.name) : '';
    if (!name) {
        return { success: false, error: 'Missing sObject name' };
    }
    const context = await resolveInstanceContext(msg, sender, {
        requireInstance: true,
        requireSession: true
    });
    try {
        const describe = await describeSObject(context.instanceUrl, context.sessionId, name, msg.useTooling);
        return describe ? { success: true, describe } : { success: false, error: 'Describe failed' };
    } catch (e) {
        return { success: false, error: String(e) };
    }
}

async function handleRunSoql(msg, sender) {
    const context = await resolveInstanceContext(msg, sender, {
        requireInstance: true,
        requireSession: true
    });
    const query = String(msg?.query || '').trim();
    if (!query) {
        return { success: false, error: 'Empty query' };
    }
    const limit = Number.isFinite(msg?.limit) ? Number(msg.limit) : null;
    const result = await runSoql(context.instanceUrl, context.sessionId, query, limit, msg.useTooling);
    return { success: true, totalSize: result.totalSize, records: result.records, done: true };
}

async function resolveInstanceContext(msg, sender, options = {}) {
    const {
        requireInstance = false,
        requireSession = false,
        ensureSessionInfo = false
    } = options;

    const candidates = [msg?.instanceUrl, msg?.url, sender?.tab?.url, lastInstanceUrl];
    let raw = null;
    for (const candidate of candidates) {
        const sanitized = sanitizeUrl(candidate);
        if (sanitized) {
            raw = sanitized;
            break;
        }
    }
    if (!raw) {
        raw = await findSalesforceOrigin();
    }
    if (!raw) {
        raw = await findInstanceFromCookies();
    }

    let instanceUrl = raw ? normalizeApiBase(raw) || sanitizeUrl(raw) : null;

    let sessionInfo = null;
    let sessionId = msg?.sessionId || null;

    const sessionSource = instanceUrl || raw;

    if ((ensureSessionInfo || requireSession) && sessionSource) {
        sessionInfo = await getSalesforceSession(sessionSource);
        if (sessionInfo?.instanceUrl) {
            const normalized = normalizeApiBase(sessionInfo.instanceUrl);
            if (normalized) {
                instanceUrl = normalized;
            }
        }
        if (!sessionId) {
            sessionId = sessionInfo?.sessionId || null;
        }
    }

    if (!sessionInfo && ensureSessionInfo) {
        sessionInfo = {
            success: true,
            isSalesforce: instanceUrl ? true : false,
            isLoggedIn: false,
            instanceUrl,
            sessionId: null
        };
    }

    if (instanceUrl) {
        lastInstanceUrl = instanceUrl;
    }

    if (requireInstance && !instanceUrl) {
        throw new Error('Instance URL not detected.');
    }
    if (requireSession && !sessionId) {
        throw new Error('Salesforce session not found. Log in and retry.');
    }

    return { instanceUrl, sessionId, sessionInfo };
}


async function openPlatformWindow() {
    try {
        if (platformWindowId) {
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

async function findInstanceFromCookies() {
    try {
        const all = await cookies.getAll({});
        if (!Array.isArray(all) || all.length === 0) return null;
        // Filter cookie domains that look like Salesforce hosts
        const candidates = all
            .map(c => ({ domain: c.domain || '', name: c.name || '', valueLength: c.value ? String(c.value).length : 0 }))
            .filter(c => typeof c.domain === 'string' && /(?:salesforce\.com|force\.com)$/i.test(c.domain))
            .map(c => {
                // normalize domain to a host (remove leading dot)
                let host = String(c.domain).trim();
                if (host.startsWith('.')) host = host.slice(1);
                return { host, name: c.name, valueLength: c.valueLength };
            });
        if (!candidates.length) return null;
        // Rank candidates: prefer *.my.salesforce.com, then *.salesforce.com, then *.force.com
        function rankHost(h) {
            const lh = h.toLowerCase();
            if (lh.endsWith('.my.salesforce.com')) return 3;
            if (lh.endsWith('.salesforce.com')) return 2;
            if (lh.endsWith('.force.com')) return 1;
            return 0;
        }
        candidates.sort((a, b) => {
            const rdiff = rankHost(b.host) - rankHost(a.host);
            if (rdiff !== 0) return rdiff;
            return b.valueLength - a.valueLength;
        });
        const pick = candidates[0];
        if (!pick || !pick.host) return null;
        // construct an origin
        return `https://${pick.host}`;
    } catch (e) {
        return null;
    }
}

async function getSalesforceSession(url) {
    const rawOrigin = originFromUrl(url);
    const instanceUrl = normalizeApiBase(rawOrigin) || rawOrigin;
    const onSF = url ? isSalesforceUrl(url) : false;

    if (!instanceUrl || !onSF) {
        return { success: true, isSalesforce: false, isLoggedIn: false, instanceUrl: instanceUrl || null, sessionId: null };
    }

    let sid = await cookies.get({ url: instanceUrl + '/', name: 'sid' });

    let inspectedCandidates = [];

    if (!sid) {
        const all = await cookies.getAll({});
        const candidates = (all || []).filter(
            (c) => (c.name === 'sid' || /^sid[_-]/i.test(c.name)) && (c.domain.endsWith('salesforce.com') || c.domain.endsWith('force.com')) && c.value
        );

        inspectedCandidates = candidates.map(c => ({ domain: c.domain || null, name: c.name || null, valueLength: c.value ? String(c.value).length : 0 }));

        candidates.sort((a, b) => {
            const rank = (c) => (c.domain.endsWith('.my.salesforce.com') ? 3 : c.domain.endsWith('salesforce.com') ? 2 : c.domain.endsWith('force.com') ? 1 : 0);
            const rdiff = rank(b) - rank(a);
            return rdiff !== 0 ? rdiff : (b.value.length - a.value.length);
        });

        sid = candidates[0] || null;
    }

    let allCookiesCount = null;
    try {
        const all = await cookies.getAll({});
        allCookiesCount = Array.isArray(all) ? all.length : null;
    } catch {}

    return {
        success: true,
        isSalesforce: true,
        isLoggedIn: Boolean(sid?.value),
        instanceUrl,
        sessionId: sid?.value || null,
        cookieDomain: sid?.domain || null,
        cookieName: sid?.name || null,
        expiry: sid?.expirationDate || null,
        cookieCandidates: inspectedCandidates,
        allCookiesCount
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

        async function worker() {
            while (true) {
                const idx = out.findIndex((v) => v === null);
                if (idx === -1) break;
                out[idx] = undefined;
                const channel = channels[idx];
                if (!channel) {
                    out[idx] = null;
                    continue;
                }
                const path = `/services/data/${API_VERSION}/tooling/sobjects/LightningMessageChannel/${channel.Id}`;
                const endpoint = `${baseUrl}${path}`;
                try {
                    const resp = await fetch(endpoint, { method: 'GET', headers: hdrs, credentials: 'omit' });

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

async function getApiVersion() {
    try {
        const { apiVersion } = await chrome.storage.local.get({ apiVersion: '65.0' });
        const v = String(apiVersion || '65.0');
        return v.startsWith('v') ? v : ('v' + v);
    } catch {
        return API_VERSION;
    }
}

async function describeGlobal(instanceUrl, sessionId, useTooling = false) {
    const base = String(instanceUrl || '').replace(/\/+$/, '');
    if (!base) throw new Error('Invalid instance URL');
    const v = await getApiVersion();
    const url = useTooling
        ? `${base}/services/data/${v}/tooling/sobjects`
        : `${base}/services/data/${v}/sobjects`;
    const res = await fetch(url, { method: 'GET', headers: { Authorization: `Bearer ${sessionId}`, Accept: 'application/json' }, credentials: 'omit' });
    if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(`Describe Global failed (${res.status}): ${text || res.statusText}`);
    }
    const data = await res.json();
    // Tooling global returns tooling sobjects on a different key but often mirrors sobjects structure
    const list = Array.isArray(data?.sobjects) ? data.sobjects : (Array.isArray(data?.sobjects) ? data.sobjects : []);
    // Map into a minimal, consistent shape and include a queryable flag when available from the API
    return list.map(s => ({
        name: s?.name || s?.keyPrefix || '',
        label: s?.label || s?.name || s?.keyPrefix || '',
        custom: !!s?.custom,
        keyPrefix: s?.keyPrefix || null,
        // Some endpoints expose a `queryable` boolean; preserve it when present, otherwise default to true
        queryable: typeof s?.queryable === 'boolean' ? s.queryable : true
    }));
}

async function describeSObject(instanceUrl, sessionId, name, useTooling = false) {
    const base = String(instanceUrl || '').replace(/\/+$/, '');
    if (!base) throw new Error('Invalid instance URL');
    const v = await getApiVersion();
    const url = useTooling
        ? `${base}/services/data/${v}/tooling/sobjects/${encodeURIComponent(name)}/describe`
        : `${base}/services/data/${v}/sobjects/${encodeURIComponent(name)}/describe`;
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

async function runSoql(instanceUrl, sessionId, query, limit, useTooling = false) {
    const base = String(instanceUrl || '').replace(/\/+$/, '');
    if (!base) throw new Error('Invalid instance URL');
    const v = await getApiVersion();

    let finalQuery = String(query || '').trim();
    if (limit && !/\blimit\b/i.test(finalQuery)) {
        finalQuery = `${finalQuery} LIMIT ${limit}`;
    }

    const headers = { Authorization: `Bearer ${sessionId}`, Accept: 'application/json' };

    const records = [];
    let url = useTooling
        ? `${base}/services/data/${v}/tooling/query?q=${encodeURIComponent(finalQuery)}`
        : `${base}/services/data/${v}/query?q=${encodeURIComponent(finalQuery)}`;
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
