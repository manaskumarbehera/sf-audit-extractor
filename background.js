import { SALESFORCE_SUFFIXES, DEFAULT_API_VERSION, LMS_CHANNELS_SOQL } from './constants.js';
import { sanitizeUrl, normalizeApiBase, originFromUrl } from './url_helper.js';

let platformWindowId = null;
let appWindowId = null;
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
        const { platformPinned, appPoppedOut } = await chrome.storage.local.get({ platformPinned: false, appPoppedOut: false });
        if (platformPinned) {
            await openPlatformWindow();
        }
        if (appPoppedOut) {
            await openAppWindow();
        }
    } catch (e) {
        console.warn('onStartup restore failed', e);
    }
});

chrome.windows.onRemoved.addListener((winId) => {
    if (platformWindowId && winId === platformWindowId) {
        platformWindowId = null;
        try { chrome.storage.local.set({ platformPinned: false }); } catch {}
    }
    if (appWindowId && winId === appWindowId) {
        appWindowId = null;
        try { chrome.storage.local.set({ appPoppedOut: false }); } catch {}
        // Only clear transferred session if the popout was not explicitly popped back in.
        try {
            chrome.storage.local.get({ appPoppedOut: false }, (r) => {
                const stillPopped = !!(r && r.appPoppedOut);
                if (stillPopped) { try { chrome.storage.local.remove('appSession'); } catch {} }
            });
        } catch {}
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
                const v = await getApiVersion();
                const url = `${msg.instanceUrl}/services/data/${v}/query?q=${soql}`;
                const res = await fetch(url, {
                    method: 'GET',
                    headers: {
                        'Authorization': `Bearer ${msg.accessToken}`,
                        'Accept': 'application/json'
                    }
                });
                if (!res.ok) {
                    const errMsg = `SF API ${res.status}: ${res.statusText}`;
                    sendResponse({ success: false, error: errMsg });
                    return;
                }
                const data = await res.json();
                const name = data?.records?.[0]?.Name || null;
                sendResponse({ success: true, orgName: name });
            } catch (err) {
                console.error('background FETCH_ORG_NAME error', err);
                sendResponse({ success: false, error: String(err) });
            }
        })();
        return true;
    }

    // Handle GET_ORG_ID request from content script or popup for favicon/theme lookup
    if (msg && msg.action === 'GET_ORG_ID') {
        (async () => {
            try {
                // Determine the URL - from sender tab (content script) or active tab (popup)
                let url = sender.tab?.url || sender.url;
                let hostname = null;

                // If no URL from sender (popup request), query the active Salesforce tab
                if (!url || url.startsWith('chrome-extension://')) {
                    try {
                        const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
                        const activeTab = tabs[0];
                        if (activeTab && activeTab.url && !activeTab.url.startsWith('chrome-extension://')) {
                            url = activeTab.url;
                        }
                    } catch (e) {
                        console.log('[GET_ORG_ID] Could not get active tab:', e.message);
                    }
                }

                // Still no URL? Try to find any Salesforce tab
                if (!url || url.startsWith('chrome-extension://')) {
                    try {
                        const sfTabs = await chrome.tabs.query({ url: ['*://*.salesforce.com/*', '*://*.force.com/*'] });
                        if (sfTabs.length > 0) {
                            url = sfTabs[0].url;
                        }
                    } catch (e) {
                        console.log('[GET_ORG_ID] Could not find SF tab:', e.message);
                    }
                }

                if (!url) {
                    sendResponse({ success: false, error: 'No Salesforce URL found' });
                    return;
                }

                try {
                    hostname = new URL(url).hostname;
                } catch (e) {
                    sendResponse({ success: false, error: 'Invalid URL' });
                    return;
                }

                // Try to get the oid cookie directly first (most reliable)
                try {
                    const oidCookies = await chrome.cookies.getAll({ name: 'oid' });
                    // Find oid cookie that matches the domain
                    for (const c of oidCookies) {
                        if (hostname.includes(c.domain.replace(/^\./, '')) || c.domain.includes(hostname.split('.')[0])) {
                            if (c.value && (c.value.length === 15 || c.value.length === 18)) {
                                console.log('[TrackForcePro] Got org ID from oid cookie in background');
                                sendResponse({ success: true, orgId: c.value });
                                return;
                            }
                        }
                    }
                } catch (e) {
                    console.warn('Could not get oid cookie:', e);
                }

                // Fallback: Try to get session ID and make API call
                // Get cookies from multiple possible domains
                const possibleDomains = [
                    hostname,
                    hostname.replace('.lightning.force.com', '.my.salesforce.com'),
                    hostname.replace('.force.com', '.salesforce.com')
                ];

                let sidCookie = null;
                for (const domain of possibleDomains) {
                    try {
                        const cookies = await chrome.cookies.getAll({ domain });
                        sidCookie = cookies.find(c => c.name === 'sid');
                        if (sidCookie) break;
                    } catch (e) {}
                }

                if (!sidCookie) {
                    // Try getting sid from any salesforce domain
                    try {
                        const allSfCookies = await chrome.cookies.getAll({ name: 'sid' });
                        sidCookie = allSfCookies.find(c =>
                            c.domain.includes('salesforce.com') || c.domain.includes('force.com')
                        );
                    } catch (e) {}
                }

                if (!sidCookie) {
                    // No session - but we might still have oid from the fallback check
                    // Try one more time with all oid cookies
                    try {
                        const allOidCookies = await chrome.cookies.getAll({ name: 'oid' });
                        if (allOidCookies.length > 0) {
                            const validOid = allOidCookies.find(c => c.value && (c.value.length === 15 || c.value.length === 18));
                            if (validOid) {
                                sendResponse({ success: true, orgId: validOid.value });
                                return;
                            }
                        }
                    } catch (e) {}

                    sendResponse({ success: false, error: 'No session cookie' });
                    return;
                }

                // Build the correct API URL - need to use my.salesforce.com domain
                let apiHostname = hostname;
                if (hostname.includes('.lightning.force.com')) {
                    apiHostname = hostname.replace('.lightning.force.com', '.my.salesforce.com');
                } else if (hostname.includes('.visual.force.com')) {
                    apiHostname = hostname.replace('.visual.force.com', '.my.salesforce.com');
                } else if (hostname.includes('.vf.force.com')) {
                    apiHostname = hostname.replace('.vf.force.com', '.my.salesforce.com');
                }

                const instanceUrl = `https://${apiHostname}`;
                const v = await getApiVersion();
                const soql = 'SELECT+Id+FROM+Organization+LIMIT+1';
                const apiUrl = `${instanceUrl}/services/data/${v}/query?q=${soql}`;

                try {
                    const res = await fetch(apiUrl, {
                        method: 'GET',
                        headers: {
                            'Authorization': `Bearer ${sidCookie.value}`,
                            'Accept': 'application/json'
                        }
                    });

                    if (!res.ok) {
                        sendResponse({ success: false, error: `API ${res.status}` });
                        return;
                    }

                    const data = await res.json();
                    const orgId = data?.records?.[0]?.Id || null;
                    sendResponse({ success: true, orgId });
                } catch (fetchErr) {
                    // Fetch failed - return oid cookie if we have any
                    console.log('[GET_ORG_ID] Fetch failed, trying oid cookies');
                    try {
                        const allOidCookies = await chrome.cookies.getAll({ name: 'oid' });
                        if (allOidCookies.length > 0) {
                            const validOid = allOidCookies.find(c => c.value && (c.value.length === 15 || c.value.length === 18));
                            if (validOid) {
                                sendResponse({ success: true, orgId: validOid.value });
                                return;
                            }
                        }
                    } catch (e) {}
                    sendResponse({ success: false, error: 'Fetch failed: ' + fetchErr.message });
                }
            } catch (err) {
                console.error('background GET_ORG_ID error', err);
                sendResponse({ success: false, error: String(err) });
            }
        })();
        return true;
    }
});

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
            if (is('APP_POP_GET')) {
                let popped = !!appWindowId;
                if (!popped) {
                    try {
                        const { appPoppedOut } = await chrome.storage.local.get({ appPoppedOut: false });
                        if (appPoppedOut) {
                            await openAppWindow();
                            popped = !!appWindowId;
                        }
                    } catch {}
                }
                return { success: true, popped, windowId: appWindowId };
            }
            if (is('APP_POP_SET')) {
                const next = !!msg?.popped;
                await chrome.storage.local.set({ appPoppedOut: next });
                // If a session payload is supplied, persist it for the popped window to read
                // Key by instanceUrl to support multi-window session isolation
                try {
                    if (msg && msg.session) {
                        const instanceUrl = msg.session.instanceUrl || '';
                        const sessionKey = instanceUrl ? `appSession_${btoa(instanceUrl).replace(/=/g, '')}` : 'appSession';

                        // Store both the keyed session and the default appSession for backward compatibility
                        const storagePayload = { appSession: msg.session };
                        if (instanceUrl) {
                            storagePayload[sessionKey] = msg.session;
                        }

                        // Include builderState if provided in the message
                        if (msg.builderState) {
                            storagePayload.appBuilderState = msg.builderState;
                            if (instanceUrl) {
                                storagePayload[`appBuilderState_${btoa(instanceUrl).replace(/=/g, '')}`] = msg.builderState;
                            }
                        }

                        await chrome.storage.local.set(storagePayload);
                    }
                } catch {}
                if (next) {
                    await openAppWindow();
                } else if (appWindowId) {
                    try { await chrome.windows.remove(appWindowId); } catch {}
                    appWindowId = null;
                }
                return { success: true, popped: !!appWindowId, windowId: appWindowId };
            }
            if (is('APP_POP_TOGGLE')) {
                const { appPoppedOut } = await chrome.storage.local.get({ appPoppedOut: false });
                const next = !appPoppedOut;
                await chrome.storage.local.set({ appPoppedOut: next });
                if (next) {
                    await openAppWindow();
                } else if (appWindowId) {
                    try { await chrome.windows.remove(appWindowId); } catch {}
                    appWindowId = null;
                }
                return { success: true, popped: next, windowId: appWindowId };
            }

            // Open TrackForcePro as a browser tab (single-click behavior)
            if (is('APP_TAB_OPEN')) {
                try {
                    // Store session and builder state if provided
                    if (msg && msg.session) {
                        const instanceUrl = msg.session.instanceUrl || '';
                        const sessionKey = instanceUrl ? `appSession_${btoa(instanceUrl).replace(/=/g, '')}` : 'appSession';
                        const storagePayload = { appSession: msg.session };
                        if (instanceUrl) {
                            storagePayload[sessionKey] = msg.session;
                        }
                        if (msg.builderState) {
                            storagePayload.appBuilderState = msg.builderState;
                            if (instanceUrl) {
                                storagePayload[`appBuilderState_${btoa(instanceUrl).replace(/=/g, '')}`] = msg.builderState;
                            }
                        }
                        await chrome.storage.local.set(storagePayload);
                    }

                    // Get the current active tab to determine where to insert the new tab
                    let insertIndex = undefined;
                    try {
                        const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
                        if (activeTab && typeof activeTab.index === 'number') {
                            insertIndex = activeTab.index + 1;
                        }
                    } catch {}

                    // Create the new tab with #tab hash
                    const url = chrome.runtime.getURL('popup.html#tab');
                    const createOptions = { url, active: true };
                    if (typeof insertIndex === 'number') {
                        createOptions.index = insertIndex;
                    }
                    const newTab = await chrome.tabs.create(createOptions);
                    return { success: true, tabId: newTab?.id || null };
                } catch (e) {
                    console.warn('Failed to open App tab', e);
                    return { success: false, error: String(e) };
                }
            }

            if (is('CONTENT_PING') || is('CONTENT_READY') || upper === 'CONTENTREADY') {
                try {
                    const url = sanitizeUrl(msg?.url) || (sender?.tab?.url ? sanitizeUrl(sender.tab.url) : null);
                    const norm = normalizeApiBase(url);
                    if (norm) lastInstanceUrl = norm;
                } catch {}
                return { ok: true };
            }

            if (is('GET_SESSION_INFO') || is('GET_SESSION')) {
                let url = sanitizeUrl(msg.url) || (sender?.tab?.url ? sanitizeUrl(sender.tab.url) : null) || lastInstanceUrl || (await findSalesforceOrigin());
                if (!url) {
                    const fromCookies = await findInstanceFromCookies();
                    if (fromCookies) url = sanitizeUrl(fromCookies) || fromCookies;
                }
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

                let sessionId = msg?.sessionId || null;
                if (!sessionId) {
                    const sess = await getSalesforceSession(instanceUrl);
                    sessionId = sess.sessionId || null;
                }

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
                let sessionId = msg?.sessionId || null;
                if (!sessionId) {
                    const sess = await getSalesforceSession(instanceUrl);
                    sessionId = sess.sessionId || null;
                }
                if (!sessionId) {
                    return { success: false, error: 'Salesforce session not found. Log in and retry.' };
                }

                const channels = await fetchLmsChannels(instanceUrl, sessionId);
                return { success: true, channels };
            }

            if (is('LMS_PUBLISH')) {
                // LMS publishing requires injecting code into a Salesforce Lightning page
                // We relay this to the content script which handles the injection
                const channelApiName = msg?.channel || msg?.channelApiName || '';
                const payload = msg?.payload || {};
                const providedInstanceUrl = msg?.instanceUrl || null;

                if (!channelApiName) {
                    return { success: false, error: 'Channel name is required' };
                }

                // Find a Salesforce tab to send the publish request
                let targetTabId = null;

                // First try the sender tab if it's a Salesforce page
                if (sender?.tab?.id && sender?.tab?.url && isSalesforceUrl(sender.tab.url)) {
                    targetTabId = sender.tab.id;
                }

                // If we have an instanceUrl from the popup session, use it to find the matching tab
                if (!targetTabId && providedInstanceUrl) {
                    try {
                        const sfTabs = await chrome.tabs.query({
                            url: ['*://*.salesforce.com/*', '*://*.force.com/*', '*://*.lightning.force.com/*', '*://*.salesforce-setup.com/*']
                        });

                        // Try to match by instanceUrl (normalize for comparison)
                        const normalizedProvided = normalizeApiBase(providedInstanceUrl);

                        // First, try to find a Lightning page that matches the instanceUrl
                        for (const tab of sfTabs) {
                            if (tab.url) {
                                const tabOrigin = normalizeApiBase(tab.url);
                                if (tabOrigin === normalizedProvided && tab.url.includes('/lightning/')) {
                                    targetTabId = tab.id;
                                    break;
                                }
                            }
                        }

                        // If no Lightning match, try any tab matching the instanceUrl
                        if (!targetTabId) {
                            for (const tab of sfTabs) {
                                if (tab.url) {
                                    const tabOrigin = normalizeApiBase(tab.url);
                                    if (tabOrigin === normalizedProvided) {
                                        targetTabId = tab.id;
                                        break;
                                    }
                                }
                            }
                        }
                    } catch {}
                }

                // Try to find an active Salesforce tab in the current window
                if (!targetTabId) {
                    try {
                        const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
                        const activeTab = tabs[0];
                        if (activeTab && activeTab.url && isSalesforceUrl(activeTab.url)) {
                            targetTabId = activeTab.id;
                        }
                    } catch {}
                }

                // Search across ALL windows for any Salesforce tab (handles standalone/popout mode)
                if (!targetTabId) {
                    try {
                        const sfTabs = await chrome.tabs.query({
                            url: ['*://*.salesforce.com/*', '*://*.force.com/*', '*://*.lightning.force.com/*', '*://*.salesforce-setup.com/*']
                        });
                        // Prefer Lightning pages over setup/classic
                        const lightningTab = sfTabs.find(t => t.url && t.url.includes('/lightning/'));
                        if (lightningTab) {
                            targetTabId = lightningTab.id;
                        } else if (sfTabs.length > 0) {
                            targetTabId = sfTabs[0].id;
                        }
                    } catch {}
                }

                if (!targetTabId) {
                    return {
                        success: false,
                        error: 'No Salesforce tab found. Please open a Salesforce Lightning page.'
                    };
                }

                // Send publish request to content script
                return new Promise((resolve) => {
                    chrome.tabs.sendMessage(targetTabId, {
                        action: 'LMS_PUBLISH',
                        channel: channelApiName,
                        payload: payload
                    }, (response) => {
                        if (chrome.runtime.lastError) {
                            resolve({
                                success: false,
                                error: 'Failed to communicate with Salesforce tab: ' + chrome.runtime.lastError.message
                            });
                        } else {
                            resolve(response || { success: false, error: 'No response from content script' });
                        }
                    });
                });
            }

            if (is('LMS_CHECK_AVAILABILITY')) {
                // Check if LMS is available on the current page
                let targetTabId = null;
                const providedInstanceUrl = msg?.instanceUrl || null;

                // First try sender tab
                if (sender?.tab?.id && sender?.tab?.url && isSalesforceUrl(sender.tab.url)) {
                    targetTabId = sender.tab.id;
                }

                // If we have an instanceUrl from the popup session, use it to find the matching tab
                if (!targetTabId && providedInstanceUrl) {
                    try {
                        const sfTabs = await chrome.tabs.query({
                            url: ['*://*.salesforce.com/*', '*://*.force.com/*', '*://*.lightning.force.com/*', '*://*.salesforce-setup.com/*']
                        });
                        const normalizedProvided = normalizeApiBase(providedInstanceUrl);

                        // First, try to find a Lightning page that matches the instanceUrl
                        for (const tab of sfTabs) {
                            if (tab.url) {
                                const tabOrigin = normalizeApiBase(tab.url);
                                if (tabOrigin === normalizedProvided && tab.url.includes('/lightning/')) {
                                    targetTabId = tab.id;
                                    break;
                                }
                            }
                        }

                        // If no Lightning match, try any tab matching the instanceUrl
                        if (!targetTabId) {
                            for (const tab of sfTabs) {
                                if (tab.url) {
                                    const tabOrigin = normalizeApiBase(tab.url);
                                    if (tabOrigin === normalizedProvided) {
                                        targetTabId = tab.id;
                                        break;
                                    }
                                }
                            }
                        }
                    } catch {}
                }

                // Try active tab in current window
                if (!targetTabId) {
                    try {
                        const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
                        const activeTab = tabs[0];
                        if (activeTab && activeTab.url && isSalesforceUrl(activeTab.url)) {
                            targetTabId = activeTab.id;
                        }
                    } catch {}
                }

                // Search across ALL windows for any Salesforce tab
                if (!targetTabId) {
                    try {
                        const sfTabs = await chrome.tabs.query({
                            url: ['*://*.salesforce.com/*', '*://*.force.com/*', '*://*.lightning.force.com/*', '*://*.salesforce-setup.com/*']
                        });
                        // Prefer Lightning pages
                        const lightningTab = sfTabs.find(t => t.url && t.url.includes('/lightning/'));
                        if (lightningTab) {
                            targetTabId = lightningTab.id;
                        } else if (sfTabs.length > 0) {
                            targetTabId = sfTabs[0].id;
                        }
                    } catch {}
                }

                if (!targetTabId) {
                    return {
                        success: false,
                        isLightningPage: false,
                        error: 'No Salesforce tab found'
                    };
                }

                return new Promise((resolve) => {
                    chrome.tabs.sendMessage(targetTabId, {
                        action: 'LMS_CHECK_AVAILABILITY'
                    }, (response) => {
                        if (chrome.runtime.lastError) {
                            resolve({
                                success: false,
                                isLightningPage: false,
                                error: chrome.runtime.lastError.message
                            });
                        } else {
                            resolve(response || { success: false, isLightningPage: false });
                        }
                    });
                });
            }

            if (is('DESCRIBE_GLOBAL')) {
                let rawUrl = sanitizeUrl(msg.instanceUrl) || (sender?.tab?.url ? sanitizeUrl(sender.tab.url) : null) || lastInstanceUrl || (await findSalesforceOrigin());
                if (!rawUrl) {
                    const fromCookies = await findInstanceFromCookies();
                    if (fromCookies) rawUrl = sanitizeUrl(fromCookies) || fromCookies;
                }
                const instanceUrl = normalizeApiBase(rawUrl);
                if (!instanceUrl) return { success: false, error: 'Instance URL not detected.' };
                let sessionId = msg?.sessionId || null;
                if (!sessionId) {
                    const sess = await getSalesforceSession(instanceUrl);
                    sessionId = sess.sessionId || null;
                }
                if (!sessionId) return { success: false, error: 'Salesforce session not found.' };
                const data = await describeGlobal(instanceUrl, sessionId, msg.useTooling);
                const source = msg.useTooling ? 'tooling' : 'rest';
                return { success: true, objects: data, source };
            }

            if (is('DESCRIBE_SOBJECT')) {
                const name = (msg && msg.name) ? String(msg.name) : '';
                if (!name) return { success: false, error: 'Missing sObject name' };
                const rawUrl = sanitizeUrl(msg.instanceUrl) || (sender?.tab?.url ? sanitizeUrl(sender.tab.url) : null) || lastInstanceUrl || (await findSalesforceOrigin());
                const instanceUrl = normalizeApiBase(rawUrl);
                if (!instanceUrl) return { success: false, error: 'Instance URL not detected.' };
                let sessionId = msg?.sessionId || null;
                if (!sessionId) {
                    const sess = await getSalesforceSession(instanceUrl);
                    sessionId = sess.sessionId || null;
                }
                if (!sessionId) return { success: false, error: 'Salesforce session not found.' };
                try {
                    const describe = await describeSObject(instanceUrl, sessionId, name, msg.useTooling);
                    return describe ? { success: true, describe } : { success: false, error: 'Describe failed' };
                } catch (e) {
                    return { success: false, error: String(e) };
                }
            }

            if (is('RUN_SOQL')) {
                const rawUrl = sanitizeUrl(msg.instanceUrl) || (sender?.tab?.url ? sanitizeUrl(sender.tab.url) : null) || lastInstanceUrl || (await findSalesforceOrigin());
                const instanceUrl = normalizeApiBase(rawUrl);
                if (!instanceUrl) return { success: false, error: 'Instance URL not detected.' };
                // allow provided sessionId to be used
                let sessionId = msg?.sessionId || null;
                if (!sessionId) {
                    const sess = await getSalesforceSession(instanceUrl);
                    sessionId = sess.sessionId || null;
                }
                if (!sessionId) return { success: false, error: 'Salesforce session not found.' };
                const query = String(msg?.query || '').trim();
                if (!query) return { success: false, error: 'Empty query' };
                const limit = Number.isFinite(msg?.limit) ? Number(msg.limit) : null;
                const result = await runSoql(instanceUrl, sessionId, query, limit, msg.useTooling);
                return { success: true, totalSize: result.totalSize, records: result.records, done: true };
            }

            if (is('RUN_GRAPHQL')) {
                const rawUrl = sanitizeUrl(msg.instanceUrl) || (sender?.tab?.url ? sanitizeUrl(sender.tab.url) : null) || lastInstanceUrl || (await findSalesforceOrigin());
                const instanceUrl = normalizeApiBase(rawUrl);
                if (!instanceUrl) return { success: false, error: 'Instance URL not detected.' };
                let sessionId = msg?.sessionId || null;
                if (!sessionId) {
                    const sess = await getSalesforceSession(instanceUrl);
                    sessionId = sess.sessionId || null;
                }
                const accessToken = msg?.accessToken || null;
                if (!sessionId && !accessToken) return { success: false, error: 'Salesforce session not found.' };
                const query = String(msg?.query || '').trim();
                if (!query) return { success: false, error: 'Empty query' };
                const variables = msg?.variables && typeof msg.variables === 'object' ? msg.variables : undefined;
                const apiVersion = msg?.apiVersion ? String(msg.apiVersion) : null;
                const result = await runGraphql(instanceUrl, sessionId, query, variables, { accessToken, apiVersion });
                return result;
            }

            if (is('PUBLISH_PLATFORM_EVENT')) {
                const rawUrl = sanitizeUrl(msg.instanceUrl) || (sender?.tab?.url ? sanitizeUrl(sender.tab.url) : null) || lastInstanceUrl || (await findSalesforceOrigin());
                const instanceUrl = normalizeApiBase(rawUrl);
                if (!instanceUrl) return { success: false, error: 'Instance URL not detected.' };
                let sessionId = msg?.sessionId || null;
                if (!sessionId) {
                    const sess = await getSalesforceSession(instanceUrl);
                    sessionId = sess.sessionId || null;
                }
                if (!sessionId) return { success: false, error: 'Salesforce session not found. Log in and retry.' };
                const payload = msg?.payload && typeof msg.payload === 'object' ? msg.payload : {};
                const eventApiName = msg?.eventApiName || msg?.eventName || '';
                if (!eventApiName) return { success: false, error: 'Event API name required.' };
                return await publishPlatformEvent(instanceUrl, sessionId, eventApiName, payload);
            }

            if (is('GRAPHQL_INTROSPECT')) {
                const rawUrl = sanitizeUrl(msg.instanceUrl) || (sender?.tab?.url ? sanitizeUrl(sender.tab.url) : null) || lastInstanceUrl || (await findSalesforceOrigin());
                const instanceUrl = normalizeApiBase(rawUrl);
                if (!instanceUrl) return { success: false, error: 'Instance URL not detected.' };
                let sessionId = msg?.sessionId || null;
                if (!sessionId) {
                    const sess = await getSalesforceSession(instanceUrl);
                    sessionId = sess.sessionId || null;
                }
                const accessToken = msg?.accessToken || null;
                if (!sessionId && !accessToken) return { success: false, error: 'Salesforce session not found.' };
                const apiVersion = msg?.apiVersion ? String(msg.apiVersion) : null;
                return await runGraphqlIntrospection(instanceUrl, { sessionId, accessToken, apiVersion });
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

async function openAppWindow() {
    try {
        if (appWindowId) {
            await chrome.windows.update(appWindowId, { focused: true });
            return appWindowId;
        }
    } catch {
        appWindowId = null;
    }
    const url = chrome.runtime.getURL('popup.html#standalone');
    try {
        // Restore saved window size or use defaults with minimum constraints
        let width = 1400;
        let height = 900;
        const MIN_WIDTH = 800;
        const MIN_HEIGHT = 600;

        try {
            const stored = await chrome.storage.local.get({ appWindowSize: null });
            if (stored && stored.appWindowSize) {
                width = Math.max(MIN_WIDTH, stored.appWindowSize.width || 1400);
                height = Math.max(MIN_HEIGHT, stored.appWindowSize.height || 900);
            }
        } catch {}

        // Create with enforced minimum dimensions for usability
        const win = await chrome.windows.create({
            url,
            type: 'popup',
            width: Math.max(MIN_WIDTH, width),
            height: Math.max(MIN_HEIGHT, height),
            focused: true
        });
        appWindowId = win?.id || null;
        return appWindowId;
    } catch (e) {
        console.warn('Failed to open App window', e);
        appWindowId = null;
        return null;
    }
}

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

const cookies = {
    get: (details) => new Promise((resolve) => {
        try {
            chrome.cookies.get(details, (c) => {
                // Check for runtime errors (common in Chrome)
                if (chrome.runtime.lastError) {
                    console.warn('cookies.get error:', chrome.runtime.lastError.message);
                    resolve(null);
                    return;
                }
                resolve(c || null);
            });
        } catch (e) {
            console.warn('cookies.get exception:', e);
            resolve(null);
        }
    }),
    getAll: (details) => new Promise((resolve) => {
        try {
            chrome.cookies.getAll(details, (arr) => {
                // Check for runtime errors (common in Chrome)
                if (chrome.runtime.lastError) {
                    console.warn('cookies.getAll error:', chrome.runtime.lastError.message);
                    resolve([]);
                    return;
                }
                resolve(arr || []);
            });
        } catch (e) {
            console.warn('cookies.getAll exception:', e);
            resolve([]);
        }
    })
};

async function findInstanceFromCookies() {
    try {
        const all = await cookies.getAll({});
        if (!Array.isArray(all) || all.length === 0) return null;
        // Filter cookie domains that look like Salesforce hosts
        const candidates = all
            .map(c => ({ domain: c.domain || '', name: c.name || '', valueLength: c.value ? String(c.value).length : 0 }))
            .filter(c => typeof c.domain === 'string' && /(?:salesforce\.com|force\.com|salesforce-setup\.com)$/i.test(c.domain))
            .map(c => {
                // normalize domain to a host (remove leading dot)
                let host = String(c.domain).trim();
                if (host.startsWith('.')) host = host.slice(1);
                return { host, name: c.name, valueLength: c.valueLength };
            });
        if (!candidates.length) return null;
        // Rank candidates: prefer *.my.salesforce.com, then *.salesforce.com, then *.force.com, then *.salesforce-setup.com
        function rankHost(h) {
            const lh = h.toLowerCase();
            if (lh.endsWith('.my.salesforce.com')) return 4;
            if (lh.endsWith('.salesforce.com')) return 3;
            if (lh.endsWith('.force.com')) return 2;
            if (lh.endsWith('.salesforce-setup.com')) return 1;
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
        const origin = `https://${pick.host}`;
        return origin;
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

    // Try multiple URL formats for cookie retrieval (Chrome can be stricter)
    let sid = await cookies.get({ url: instanceUrl + '/', name: 'sid' });

    // If not found, try without trailing slash
    if (!sid) {
        sid = await cookies.get({ url: instanceUrl, name: 'sid' });
    }

    // Try with explicit domain extraction for Chrome compatibility
    if (!sid) {
        try {
            const urlObj = new URL(instanceUrl);
            sid = await cookies.get({ url: instanceUrl, name: 'sid', domain: urlObj.hostname });
        } catch {}
    }

    let inspectedCandidates = [];

    if (!sid) {
        const all = await cookies.getAll({});
        const candidates = (all || []).filter(
            (c) => (c.name === 'sid' || /^sid[_-]/i.test(c.name)) && (c.domain.endsWith('salesforce.com') || c.domain.endsWith('force.com') || c.domain.endsWith('salesforce-setup.com')) && c.value
        );

        // Prepare a masked diagnostics list (do not expose full cookie values in UI)
        inspectedCandidates = candidates.map(c => ({ domain: c.domain || null, name: c.name || null, valueLength: c.value ? String(c.value).length : 0 }));

        candidates.sort((a, b) => {
            const rank = (c) => (c.domain.endsWith('.my.salesforce.com') ? 3 : c.domain.endsWith('salesforce.com') ? 2 : c.domain.endsWith('force.com') ? 1 : 0);
            const rdiff = rank(b) - rank(a);
            return rdiff !== 0 ? rdiff : (b.value.length - a.value.length);
        });

        sid = candidates[0] || null;
    }

    // Also include a lightweight count of all cookies inspected for additional context
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
        'SELECT Id, Action, Section, Display, DelegateUser, CreatedDate, CreatedById, CreatedBy.Name',
        'FROM SetupAuditTrail',
        `WHERE CreatedDate = LAST_N_DAYS:${days}`,
        'ORDER BY CreatedDate DESC'
    ].join(' ');

    const headers = { Authorization: `Bearer ${sessionId}`, Accept: 'application/json' };

    const records = [];
    const v = await getApiVersion();
    let url = `${base}/services/data/${v}/query?q=${encodeURIComponent(soql)}`;
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

    const soql = LMS_CHANNELS_SOQL;
    const v = await getApiVersion();
    const url = `${base}/services/data/${v}/tooling/query?q=${encodeURIComponent(soql)}`;
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
                    const v = await getApiVersion();
                    const resp = await fetch(
                        `${baseUrl}/services/data/${v}/tooling/sobjects/LightningMessageChannel/${encodeURIComponent(id)}`,
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

async function getApiVersion() {
    try {
        const { apiVersion } = await chrome.storage.local.get({ apiVersion: '65.0' });
        const stored = String(apiVersion || '65.0');
        // normalize: ensure storage has no leading v
        let majorMinor = stored.replace(/^v/i, '');
        const m = majorMinor.match(/^(\d{1,3})(?:\.(\d{1,2}))?$/);
        if (!m) majorMinor = '65.0';
        if (majorMinor !== stored) {
            try { await chrome.storage.local.set({ apiVersion: majorMinor }); } catch {}
        }
        return 'v' + majorMinor;
    } catch {
        return DEFAULT_API_VERSION;
    }
}

async function describeGlobal(instanceUrl, sessionId, useTooling = false) {
    const base = String(instanceUrl || '').replace(/\/+$/, '');
    if (!base) throw new Error('Invalid instance URL');
    if (!sessionId) throw new Error('Session ID is required');

    const v = await getApiVersion();
    const url = useTooling
        ? `${base}/services/data/${v}/tooling/sobjects`
        : `${base}/services/data/${v}/sobjects`;

    // Retry logic for transient network failures
    const maxRetries = 3;
    let lastError = null;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 second timeout

            const res = await fetch(url, {
                method: 'GET',
                headers: {
                    Authorization: `Bearer ${sessionId}`,
                    Accept: 'application/json'
                },
                credentials: 'omit',
                signal: controller.signal
            });

            clearTimeout(timeoutId);

            if (!res.ok) {
                const text = await res.text().catch(() => '');
                // Include the URL that was attempted for easier debugging
                throw new Error(`Describe Global failed (${res.status}) for URL ${url}: ${text || res.statusText}`);
            }

            const data = await res.json();
            const list = Array.isArray(data?.sobjects) ? data.sobjects : [];
            return list.map(s => {
                const toBool = (v) => (typeof v === 'boolean' ? v : (typeof v === 'string' ? v.toLowerCase() === 'true' : false));
                const queryable = toBool(s?.queryable);
                const createable = toBool(s?.createable);
                const updateable = toBool(s?.updateable);
                const retrieveable = toBool(s?.retrieveable);
                const searchable = toBool(s?.searchable);
                const deprecatedAndHidden = toBool(s?.deprecatedAndHidden);
                return ({
                    name: s?.name || s?.keyPrefix || '',
                    label: s?.label || s?.name || s?.keyPrefix || '',
                    custom: !!s?.custom,
                    keyPrefix: s?.keyPrefix || null,
                    queryable,
                    createable,
                    updateable,
                    retrieveable,
                    searchable,
                    deprecatedAndHidden
                });
            });
        } catch (err) {
            lastError = err;
            const errStr = String(err);
            const isRetryable = errStr.includes('Failed to fetch') ||
                               errStr.includes('NetworkError') ||
                               errStr.includes('AbortError') ||
                               errStr.includes('network') ||
                               errStr.includes('timeout') ||
                               err.name === 'AbortError';

            if (isRetryable && attempt < maxRetries) {
                // Wait before retrying (exponential backoff: 1s, 2s, 4s...)
                await new Promise(r => setTimeout(r, Math.pow(2, attempt - 1) * 1000));
                continue;
            }

            // Non-retryable error or max retries reached
            break;
        }
    }

    // Enhance error message for common issues with clearer, more actionable descriptions
    const errMsg = String(lastError || 'Unknown error');
    if (errMsg.includes('Failed to fetch') || errMsg.includes('NetworkError')) {
        throw new Error(`Connection failed: Unable to reach Salesforce.\n\nTry these steps:\n• Refresh the Salesforce page and try again\n• Check your internet connection\n• Ensure you're logged into Salesforce\n• If using a VPN, try disconnecting temporarily`);
    }
    if (lastError?.name === 'AbortError' || errMsg.includes('AbortError')) {
        throw new Error(`Request timed out: Salesforce is taking too long to respond.\n\nTry again in a few moments. If the issue persists, the server may be experiencing high load.`);
    }
    throw lastError || new Error('Failed to fetch SObjects');
}

async function describeSObject(instanceUrl, sessionId, name, useTooling = false) {
    const base = String(instanceUrl || '').replace(/\/+$/, '');
    if (!base) throw new Error('Invalid instance URL');
    if (!sessionId) throw new Error('Session ID is required');

    const v = await getApiVersion();
    const url = useTooling
        ? `${base}/services/data/${v}/tooling/sobjects/${encodeURIComponent(name)}/describe`
        : `${base}/services/data/${v}/sobjects/${encodeURIComponent(name)}/describe`;

    // Retry logic for transient network failures
    const maxRetries = 3;
    let lastError = null;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 second timeout

            const res = await fetch(url, {
                method: 'GET',
                headers: {
                    Authorization: `Bearer ${sessionId}`,
                    Accept: 'application/json'
                },
                credentials: 'omit',
                signal: controller.signal
            });

            clearTimeout(timeoutId);

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
                    relationshipName: f.relationshipName || null,
                    filterable: f.filterable !== false,
                    sortable: f.sortable !== false
                }))
                : [];
            // Include child relationships for subquery suggestions
            const childRelationships = Array.isArray(json.childRelationships)
                ? json.childRelationships
                    .filter(cr => cr.relationshipName && cr.childSObject)
                    .map(cr => ({
                        relationshipName: cr.relationshipName,
                        childSObject: cr.childSObject,
                        field: cr.field || null,
                        cascadeDelete: cr.cascadeDelete || false
                    }))
                : [];
            return { name: json.name || name, label: json.label || name, fields, childRelationships };
        } catch (err) {
            lastError = err;
            const errStr = String(err);
            const isRetryable = errStr.includes('Failed to fetch') ||
                               errStr.includes('NetworkError') ||
                               errStr.includes('AbortError') ||
                               errStr.includes('network') ||
                               errStr.includes('timeout') ||
                               err.name === 'AbortError';

            if (isRetryable && attempt < maxRetries) {
                // Wait before retrying (exponential backoff: 1s, 2s, 4s...)
                await new Promise(r => setTimeout(r, Math.pow(2, attempt - 1) * 1000));
                continue;
            }

            // Non-retryable error or max retries reached
            break;
        }
    }

    // Enhance error message for common issues with clearer descriptions
    const errMsg = String(lastError || 'Unknown error');
    if (errMsg.includes('Failed to fetch') || errMsg.includes('NetworkError')) {
        throw new Error(`Connection failed: Unable to load ${name} details.\n\nTry refreshing the Salesforce page and ensure you're logged in.`);
    }
    if (lastError?.name === 'AbortError' || errMsg.includes('AbortError')) {
        throw new Error(`Request timed out loading ${name}. Try again in a few moments.`);
    }
    throw lastError || new Error(`Failed to describe ${name}`);
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

async function runGraphql(instanceUrl, sessionId, query, variables, opts = {}) {
    const base = String(instanceUrl || '').replace(/\/+$/, '');
    if (!base) throw new Error('Invalid instance URL');
    const v = opts.apiVersion ? String(opts.apiVersion).replace(/^v/i, 'v') : await getApiVersion();
    const url = `${base}/services/data/${v}/graphql`;
    const token = opts.accessToken || sessionId;
    const res = await fetch(url, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
            'Accept': 'application/json'
        },
        body: JSON.stringify({ query, variables }),
        credentials: 'omit'
    });
    const text = await res.text();
    let data = null;
    try { data = JSON.parse(text); } catch { data = { raw: text }; }

    // For introspection, check if we got the schema even if there are warnings
    const hasSchema = data?.data?.__schema;

    // Fail only if HTTP error AND (no data OR it's not an introspection with schema)
    if (!res.ok) {
        const errMsg = data?.errors?.map?.((e) => e.message).join('; ') || res.statusText || 'GraphQL failed';
        // But if we got schema data, return success anyway (some APIs return 200 with errors field)
        if (hasSchema) {
            return { success: true, data: data?.data };
        }
        return { success: false, error: errMsg, data };
    }

    // HTTP 200 - consider it success if we have data (even with warnings in errors array)
    if (data?.data) {
        return { success: true, data: data?.data };
    }

    // HTTP 200 but no data - this is a real error
    const errMsg = data?.errors?.map?.((e) => e.message).join('; ') || 'GraphQL failed';
    return { success: false, error: errMsg, data };
}

async function runGraphqlIntrospection(instanceUrl, { sessionId, accessToken, apiVersion } = {}) {
    const introspectionQuery = `query IntrospectionQuery {\n  __schema {\n    queryType { name }\n    mutationType { name }\n    subscriptionType { name }\n    types {\n      kind\n      name\n      description\n      fields(includeDeprecated: true) {\n        name\n        description\n        args { name description type { kind name ofType { kind name ofType { kind name } } } defaultValue }\n        type { kind name ofType { kind name ofType { kind name } } }\n        isDeprecated\n        deprecationReason\n      }\n      inputFields { name description type { kind name ofType { kind name ofType { kind name } } } defaultValue }\n      interfaces { kind name ofType { kind name ofType { kind name } } }\n      enumValues(includeDeprecated: true) { name description isDeprecated deprecationReason }\n      possibleTypes { kind name ofType { kind name ofType { kind name } } }\n    }\n    directives { name description locations args { name description type { kind name ofType { kind name ofType { kind name } } } defaultValue } }\n  }\n}`;
    return await runGraphql(instanceUrl, sessionId, introspectionQuery, undefined, { accessToken, apiVersion });
}

async function publishPlatformEvent(instanceUrl, sessionId, eventApiName, payload) {
    const base = String(instanceUrl || '').replace(/\/+$/, '');
    if (!base) throw new Error('Invalid instance URL');
    const v = await getApiVersion();
    const url = `${base}/services/data/${v}/sobjects/${encodeURIComponent(eventApiName)}`;

    const res = await fetch(url, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${sessionId}`,
            'Content-Type': 'application/json',
            'Accept': 'application/json'
        },
        body: JSON.stringify(payload),
        credentials: 'omit'
    });

    const responseText = await res.text();
    let responseData;
    try {
        responseData = JSON.parse(responseText);
    } catch {
        responseData = { rawResponse: responseText };
    }

    if (!res.ok) {
        const errorMessage = Array.isArray(responseData) && responseData[0]?.message
            ? responseData[0].message
            : responseData?.message || `HTTP ${res.status}: ${res.statusText}`;
        return { success: false, error: errorMessage, details: responseData };
    }

    return {
        success: true,
        id: responseData?.id || null,
        message: 'Platform Event published successfully',
        response: responseData
    };
}
