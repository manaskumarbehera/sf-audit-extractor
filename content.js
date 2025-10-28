// Detect Salesforce pages, notify background, and serve session info requests from the popup.
// Runs in all frames but only the top frame sends the ready event.

(() => {
    'use strict';

    const isSalesforceHost = (hostname) =>
        /(^|\.)salesforce\.com$/i.test(hostname) || /(^|\.)force\.com$/i.test(hostname) || /(^|\.)salesforce-setup\.com$/i.test(hostname);

    const isTop = window === window.top;
    const host = location.hostname;
    const onSF = isSalesforceHost(host);

    // Message handler from popup: return session info (delegates to background to read cookies).
    chrome.runtime.onMessage.addListener((req, _sender, sendResponse) => {
        if (req && req.action === 'getSessionInfo') {
            getSessionInfoFromBackground().then(sendResponse).catch((e) => {
                sendResponse({ success: false, error: String(e), isLoggedIn: false });
            });
            return true; // async
        }
    });

    // Notify background when ready (top frame only) so it can update state/UI.
    if (onSF && isTop) {
        if (document.readyState === 'complete' || document.readyState === 'interactive') {
            notifyReady();
        } else {
            window.addEventListener('DOMContentLoaded', notifyReady, { once: true });
            window.addEventListener('load', notifyReady, { once: true });
        }
    }

    function notifyReady() {
        getSessionInfoFromBackground()
            .then((sessionInfo) => {
                chrome.runtime.sendMessage({
                    action: 'contentReady',
                    url: location.href,
                    sessionInfo
                });
            })
            .catch(() => {
                chrome.runtime.sendMessage({
                    action: 'contentReady',
                    url: location.href,
                    sessionInfo: {
                        success: true,
                        isSalesforce: onSF,
                        isLoggedIn: false,
                        instanceUrl: getInstanceOrigin(),
                        sessionId: null
                    }
                });
            });
    }

    function getInstanceOrigin() {
        try {
            return location.origin;
        } catch {
            const m = String(location.href).match(/^(https:\/\/[^/]+)/i);
            return m ? m[1] : null;
        }
    }

    // Ask background to read cookies and assemble session info.
    function getSessionInfoFromBackground() {
        const instanceUrl = getInstanceOrigin();
        return new Promise((resolve) => {
            chrome.runtime.sendMessage(
                {
                    action: 'GET_SESSION_INFO',
                    url: instanceUrl,
                    hostname: host
                },
                (resp) => {
                    if (chrome.runtime.lastError) {
                        resolve({
                            success: true,
                            isSalesforce: onSF,
                            isLoggedIn: false,
                            instanceUrl,
                            sessionId: null,
                            warning: chrome.runtime.lastError.message
                        });
                        return;
                    }
                    if (!resp) {
                        resolve({
                            success: true,
                            isSalesforce: onSF,
                            isLoggedIn: false,
                            instanceUrl,
                            sessionId: null
                        });
                        return;
                    }
                    resolve(resp);
                }
            );
        });
    }
})();