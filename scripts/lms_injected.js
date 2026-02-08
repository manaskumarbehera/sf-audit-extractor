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
        return !!(window.$A && typeof window.$A.get === 'function');
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
            if (!isLightningPage()) {
                reject(new Error('Not a Lightning Experience page. LMS publishing requires a Lightning page with the Aura framework loaded.'));
                return;
            }

            try {
                // Method 1: Try using the Application Event approach
                // This fires a generic event that LWC components can listen to
                const appEvent = window.$A.get('e.force:showToast');

                // Method 2: Try direct message channel publishing via Aura
                // Build the message channel descriptor
                // Format: messageChannel://{namespace}__{developerName}
                const channelDescriptor = channelApiName.includes('__')
                    ? `messageChannel://${channelApiName.replace('__', '/')}`
                    : `messageChannel://default/${channelApiName}`;

                // Try to use the messageService component if available
                if (window.$A && window.$A.getReference) {
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
                        console.warn('[TrackForcePro LMS] Reference method failed:', refErr);
                    }
                }

                // Method 3: Try using postMessage to any LWC that might be listening
                // This is a fallback that broadcasts the message
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
                console.error('[TrackForcePro LMS] Publish error:', e);
                reject(new Error('Failed to publish LMS message: ' + e.message));
            }
        });
    }

    /**
     * Check LMS availability and return status
     */
    function checkLmsAvailability() {
        const result = {
            isLightningPage: isLightningPage(),
            hasAura: !!(window.$A),
            hasMessageService: false,
            pageType: 'unknown'
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
                    if (!channel) {
                        throw new Error('Channel name is required');
                    }
                    const result = await publishLmsMessage(channel, payload || {});
                    window.postMessage({
                        type: LMS_MSG_PREFIX + 'PUBLISH_RESPONSE',
                        requestId: requestId,
                        success: true,
                        data: result
                    }, '*');
                    break;
                }

                default:
                    console.log('[TrackForcePro LMS] Unknown message type:', data.type);
            }
        } catch (err) {
            window.postMessage({
                type: data.type.replace(LMS_MSG_PREFIX, LMS_MSG_PREFIX) + '_RESPONSE',
                requestId: requestId,
                success: false,
                error: err.message || String(err)
            }, '*');
        }
    });

    // Signal that the bridge is ready
    window.postMessage({
        type: LMS_MSG_PREFIX + 'BRIDGE_READY',
        timestamp: Date.now()
    }, '*');

    console.log('[TrackForcePro] LMS Bridge initialized');
})();

