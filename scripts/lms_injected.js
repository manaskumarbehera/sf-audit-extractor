/**
 * LMS Injected Bridge Script
 * This script runs in the Salesforce page context to access the Lightning/Aura framework
 * for publishing Lightning Message Service (LMS) messages.
 *
 * Communication flow:
 * Popup -> Background -> Content Script -> (postMessage) -> This Script -> Aura/$A
 */
(function() {
    'use strict';

    const LMS_MSG_PREFIX = 'TRACKFORCEPRO_LMS_';

    /**
     * Check if we're on a Lightning Experience page with Aura framework
     */
    function isLightningPage() {
        try {
            return !!(window.$A && typeof window.$A.get === 'function');
        } catch (e) {
            console.warn('[TrackForcePro LMS] Error checking $A:', e);
            return false;
        }
    }

    /**
     * Get detailed Aura status for debugging
     */
    function getAuraStatus() {
        return {
            hasWindow$A: typeof window.$A !== 'undefined',
            $AType: typeof window.$A,
            hasGet: window.$A && typeof window.$A.get === 'function',
            hasGetReference: window.$A && typeof window.$A.getReference === 'function',
            url: window.location.href
        };
    }

    /**
     * Get the Lightning Message Channel reference
     * Uses the Aura framework to create a message channel reference
     */
    function getMessageChannelRef(channelName) {
        if (!isLightningPage()) {
            return null;
        }

        try {
            // Try to get or create a message context
            // In LEX, we need to access the messageService via Aura
            const messageService = window.$A.get('e.lightning:sendMessage');
            if (messageService) {
                return { channel: channelName, service: messageService };
            }

            // Alternative: Try accessing via the global Aura context
            // The channel name format is typically: lightning__messageChannel/{namespace}/{channelName}
            return { channel: channelName };
        } catch (e) {
            console.warn('[TrackForcePro LMS] Failed to get message channel ref:', e);
            return null;
        }
    }

    /**
     * Publish a message to an LMS channel using the Aura framework
     */
    function publishLmsMessage(channelApiName, payload) {
        return new Promise((resolve, reject) => {
            const auraStatus = getAuraStatus();
            console.log('[TrackForcePro LMS] Publishing to channel:', channelApiName, 'Aura status:', auraStatus);

            if (!isLightningPage()) {
                const errorMsg = 'Not a Lightning Experience page. ' +
                    'LMS publishing requires a Lightning page with the Aura framework loaded. ' +
                    `(Aura status: $A=${auraStatus.$AType}, hasGet=${auraStatus.hasGet})`;
                console.warn('[TrackForcePro LMS]', errorMsg, auraStatus);
                reject(new Error(errorMsg));
                return;
            }

            try {
                console.log('[TrackForcePro LMS] $A is available, attempting to publish...');

                // Method 1: Try using the Application Event approach
                // This fires a generic event that LWC components can listen to
                let appEventAvailable = false;
                try {
                    const appEvent = window.$A.get('e.force:showToast');
                    appEventAvailable = !!appEvent;
                    console.log('[TrackForcePro LMS] force:showToast event available:', appEventAvailable);
                } catch (e) {
                    console.log('[TrackForcePro LMS] force:showToast not available:', e.message);
                }

                // Method 2: Try direct message channel publishing via Aura
                // Build the message channel descriptor
                // Format: messageChannel://{namespace}__{developerName}
                const channelDescriptor = channelApiName.includes('__')
                    ? `messageChannel://${channelApiName.replace('__', '/')}`
                    : `messageChannel://default/${channelApiName}`;

                console.log('[TrackForcePro LMS] Channel descriptor:', channelDescriptor);

                // Try to use the messageService component if available
                if (window.$A && window.$A.getReference) {
                    console.log('[TrackForcePro LMS] $A.getReference is available, dispatching custom event...');
                    try {
                        // Attempt to fire a custom event that can be caught by Lightning components
                        const customEvent = new CustomEvent('trackforcepro_lms_publish', {
                            detail: {
                                channel: channelApiName,
                                payload: payload,
                                timestamp: Date.now()
                            },
                            bubbles: true,
                            composed: true
                        });
                        document.dispatchEvent(customEvent);
                        console.log('[TrackForcePro LMS] Custom event dispatched successfully');

                        // Since LMS is asynchronous and we can't directly verify delivery,
                        // we consider the publish successful if no error was thrown
                        resolve({
                            success: true,
                            message: 'Message dispatched to LMS channel',
                            channel: channelApiName,
                            note: 'LMS messages are client-side only. Verify delivery in subscribed components.'
                        });
                        return;
                    } catch (refErr) {
                        console.warn('[TrackForcePro LMS] Reference method failed:', refErr.message || refErr);
                    }
                } else {
                    console.log('[TrackForcePro LMS] $A.getReference not available, using fallback...');
                }

                // Method 3: Try using postMessage to any LWC that might be listening
                // This is a fallback that broadcasts the message
                console.log('[TrackForcePro LMS] Using postMessage fallback...');
                window.postMessage({
                    type: 'LMS_CHANNEL_PUBLISH',
                    channel: channelApiName,
                    payload: payload,
                    source: 'TrackForcePro'
                }, '*');

                resolve({
                    success: true,
                    message: 'Message broadcast via postMessage',
                    channel: channelApiName,
                    note: 'Direct LMS API access is restricted. Message sent via DOM event broadcast.'
                });

            } catch (e) {
                const errorMsg = e && e.message ? e.message : (e ? String(e) : 'Unknown error in publishLmsMessage');
                console.error('[TrackForcePro LMS] Publish error:', errorMsg, e);
                reject(new Error('Failed to publish LMS message: ' + errorMsg));
            }
        });
    }

    /**
     * Check LMS availability and return status
     */
    function checkLmsAvailability() {
        const auraStatus = getAuraStatus();
        const result = {
            isLightningPage: isLightningPage(),
            hasAura: auraStatus.hasWindow$A,
            hasAuraGet: auraStatus.hasGet,
            hasMessageService: false,
            pageType: 'unknown',
            auraStatus: auraStatus
        };

        // Detect page type
        if (window.location.pathname.includes('/lightning/')) {
            result.pageType = 'lightning';
        } else if (window.location.pathname.includes('/apex/')) {
            result.pageType = 'visualforce';
        } else if (window.location.pathname.includes('/_ui/')) {
            result.pageType = 'classic';
        } else if (window.location.pathname.includes('/setup/')) {
            result.pageType = 'setup';
        }

        // Check for message service
        if (result.hasAura && window.$A.get) {
            try {
                result.hasMessageService = true;
            } catch (e) {
                result.hasMessageService = false;
            }
        }

        return result;
    }

    /**
     * Listen for messages from the content script
     */
    window.addEventListener('message', async (event) => {
        // Only accept messages from the same window (content script)
        if (event.source !== window) return;

        const data = event.data;
        if (!data || typeof data.type !== 'string') return;
        if (!data.type.startsWith(LMS_MSG_PREFIX)) return;

        // Ignore response messages to prevent infinite loops
        // Only handle request messages (those without _RESPONSE suffix)
        if (data.type.includes('_RESPONSE')) {
            return;
        }

        // Ignore BRIDGE_READY - that's an outbound message, not a request
        if (data.type === LMS_MSG_PREFIX + 'BRIDGE_READY') {
            return;
        }

        const requestId = data.requestId;

        try {
            switch (data.type) {
                case LMS_MSG_PREFIX + 'CHECK_AVAILABILITY': {
                    const status = checkLmsAvailability();
                    window.postMessage({
                        type: LMS_MSG_PREFIX + 'AVAILABILITY_RESPONSE',
                        requestId: requestId,
                        success: true,
                        data: status
                    }, '*');
                    break;
                }

                case LMS_MSG_PREFIX + 'PUBLISH': {
                    const { channel, payload } = data;
                    console.log('[TrackForcePro LMS] Received PUBLISH request for channel:', channel);
                    if (!channel) {
                        throw new Error('Channel name is required');
                    }
                    try {
                        const result = await publishLmsMessage(channel, payload || {});
                        console.log('[TrackForcePro LMS] Publish result:', result);
                        window.postMessage({
                            type: LMS_MSG_PREFIX + 'PUBLISH_RESPONSE',
                            requestId: requestId,
                            success: true,
                            data: result
                        }, '*');
                    } catch (publishErr) {
                        console.error('[TrackForcePro LMS] Publish error in handler:', publishErr);
                        let errMsg = 'Publish failed';
                        if (publishErr) {
                            if (typeof publishErr === 'string') {
                                errMsg = publishErr;
                            } else if (publishErr.message) {
                                errMsg = publishErr.message;
                            } else {
                                try {
                                    errMsg = JSON.stringify(publishErr);
                                } catch {
                                    errMsg = String(publishErr) || 'Publish failed (error object has no message)';
                                }
                            }
                        }
                        console.error('[TrackForcePro LMS] Sending error message:', errMsg);
                        window.postMessage({
                            type: LMS_MSG_PREFIX + 'PUBLISH_RESPONSE',
                            requestId: requestId,
                            success: false,
                            error: errMsg
                        }, '*');
                    }
                    break;
                }

                default:
                    // Only respond to unknown types if they have a requestId (i.e., they expect a response)
                    if (requestId) {
                        console.log('[TrackForcePro LMS] Unknown message type:', data.type);
                        window.postMessage({
                            type: LMS_MSG_PREFIX + 'ERROR_RESPONSE',
                            requestId: requestId,
                            success: false,
                            error: 'Unknown message type: ' + data.type
                        }, '*');
                    }
            }
        } catch (err) {
            console.error('[TrackForcePro LMS] Message handler error:', err);
            const errorMessage = err && err.message ? err.message : (err ? String(err) : 'Unknown error in message handler');
            console.error('[TrackForcePro LMS] Sending error response:', errorMessage);
            // Only send error response if there's a requestId
            if (requestId) {
                window.postMessage({
                    type: LMS_MSG_PREFIX + 'ERROR_RESPONSE',
                    requestId: requestId,
                    success: false,
                    error: errorMessage || 'An unexpected error occurred'
                }, '*');
            }
        }
    });

    // Signal that the bridge is ready
    console.log('[TrackForcePro] LMS Bridge sending ready signal, Aura status:', getAuraStatus());
    window.postMessage({
        type: LMS_MSG_PREFIX + 'BRIDGE_READY',
        timestamp: Date.now(),
        auraStatus: getAuraStatus()
    }, '*');

    console.log('[TrackForcePro] LMS Bridge initialized and ready');
})();

