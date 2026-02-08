/**
 * data_explorer_helper.js
 * Logic for the Data Explorer tab with sub-tabs:
 * - Sandbox & Favicon Manager
 * - User Manager (current user, search, update profile/role/language)
 * - Current Record
 * - Record Search
 */

const DataExplorerHelper = {
    _initialized: false,
    _currentUserId: null,
    _selectedUserId: null,
    _currentOrgId: null,
    _currentOrgName: null,
    _profiles: [],
    _roles: [],
    _languages: [],

    init: function() {
        if (this._initialized) return;
        this._initialized = true;
        console.log("Initializing Data Explorer...");
        this.wireEvents();
        // Load the default active sub-tab
        const activeBtn = document.querySelector('#tab-data .sub-tab-button.active');
        if (activeBtn) {
            this.switchSubTab(activeBtn.dataset.subtab);
        }
    },

    wireEvents: function() {
        // Wire sub-tab switching
        const subTabButtons = document.querySelectorAll('#tab-data .sub-tab-button');
        subTabButtons.forEach(btn => {
            btn.addEventListener('click', (e) => {
                this.switchSubTab(e.target.dataset.subtab);
            });
        });

        // Sandbox & Favicon Manager
        const faviconColor = document.getElementById('favicon-color');
        const faviconPreset = document.getElementById('favicon-preset-colors');
        const faviconLabel = document.getElementById('favicon-label');
        const faviconApply = document.getElementById('favicon-apply');
        const faviconReset = document.getElementById('favicon-reset');
        const faviconShapeOptions = document.querySelectorAll('input[name="favicon-shape"]');

        if (faviconPreset) {
            faviconPreset.addEventListener('change', () => {
                if (faviconPreset.value && faviconColor) {
                    faviconColor.value = faviconPreset.value;
                    this.updateFaviconPreview();
                }
            });
        }
        if (faviconColor) {
            faviconColor.addEventListener('input', () => this.updateFaviconPreview());
        }
        if (faviconLabel) {
            faviconLabel.addEventListener('input', () => this.updateFaviconPreview());
        }
        // Shape selection event listeners
        faviconShapeOptions.forEach(radio => {
            radio.addEventListener('change', () => this.updateFaviconPreview());
        });
        if (faviconApply) {
            faviconApply.addEventListener('click', () => this.applyFavicon());
        }
        if (faviconReset) {
            faviconReset.addEventListener('click', () => this.resetFavicon());
        }

        // User Manager
        const refreshUserBtn = document.getElementById('refresh-user-btn');
        if (refreshUserBtn) {
            refreshUserBtn.addEventListener('click', () => this.loadCurrentUser());
        }

        const userSearchBtn = document.getElementById('user-search-btn');
        const userSearchInput = document.getElementById('user-search-input');
        if (userSearchBtn) {
            userSearchBtn.addEventListener('click', () => this.searchUsers());
        }
        if (userSearchInput) {
            userSearchInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') this.searchUsers();
            });
        }

        const userUpdateBtn = document.getElementById('user-update-btn');
        if (userUpdateBtn) {
            userUpdateBtn.addEventListener('click', () => this.updateSelectedUser());
        }

        const userClearBtn = document.getElementById('user-clear-selection');
        if (userClearBtn) {
            userClearBtn.addEventListener('click', () => this.clearUserSelection());
        }

        // Current Record
        const refreshRecordBtn = document.getElementById('refresh-record-btn');
        if (refreshRecordBtn) {
            refreshRecordBtn.addEventListener('click', () => this.loadCurrentRecordContext());
        }

        // Record Search
        const recordSearchBtn = document.getElementById('record-search-btn');
        const recordSearchInput = document.getElementById('record-search-input');
        if (recordSearchBtn) {
            recordSearchBtn.addEventListener('click', () => this.searchRecord());
        }
        if (recordSearchInput) {
            recordSearchInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') this.searchRecord();
            });
        }
    },

    switchSubTab: function(subTabId) {
        // Update buttons
        document.querySelectorAll('#tab-data .sub-tab-button').forEach(btn => {
            const isActive = btn.dataset.subtab === subTabId;
            btn.classList.toggle('active', isActive);
            btn.setAttribute('aria-selected', isActive ? 'true' : 'false');
        });

        // Update content
        document.querySelectorAll('#tab-data .sub-tab-content').forEach(content => {
            const isActive = content.id === `subtab-${subTabId}`;
            content.hidden = !isActive;
            content.classList.toggle('active', isActive);
        });

        // Load content on switch
        switch (subTabId) {
            case 'sandbox-manager':
                this.loadOrgInfo();
                this.initFaviconPreview();
                break;
            case 'user-manager':
                this.loadCurrentUser();
                this.loadOrgMetadata(); // profiles, roles, languages
                break;
            case 'current-record':
                this.loadCurrentRecordContext();
                break;
        }
    },

    // ==========================================
    // SANDBOX & FAVICON MANAGER
    // ==========================================

    loadOrgInfo: async function() {
        const container = document.getElementById('org-info-container');
        if (!container) return;
        container.innerHTML = '<div class="spinner">Loading organization info...</div>';

        try {
            // IMPORTANT: Always refresh session from current window's tab to ensure correct org context
            // This prevents showing data from other browser windows
            if (PlatformHelper.refreshSessionFromTab) {
                try { await PlatformHelper.refreshSessionFromTab(); } catch {}
            }

            // Check if we have a valid session first
            const session = await PlatformHelper.getSession();
            if (!session || !session.isLoggedIn) {
                container.innerHTML = `
                    <div class="not-connected-message">
                        <div style="font-size: 24px; margin-bottom: 8px;">🔌</div>
                        <div style="font-weight: 600; margin-bottom: 4px;">Not Connected</div>
                        <div style="font-size: 12px; color: #6c757d;">Please navigate to a Salesforce org to view organization info.</div>
                    </div>
                `;
                // Still load saved favicons even if not connected
                this.loadSavedFavicons();
                return;
            }

            const query = `SELECT Id, Name, OrganizationType, IsSandbox, InstanceName, LanguageLocaleKey, 
                           DefaultLocaleSidKey, TimeZoneSidKey, TrialExpirationDate, CreatedDate 
                           FROM Organization LIMIT 1`;
            const result = await PlatformHelper.executeQuery(query);

            if (result && result.records && result.records.length > 0) {
                const org = result.records[0];
                // Store current org info
                this._currentOrgId = org.Id;
                this._currentOrgName = org.Name;
                this.renderOrgInfo(org, container);
                // Load saved favicons list
                this.loadSavedFavicons();
            } else {
                container.innerHTML = '<div class="error-message">Could not retrieve organization information.</div>';
                this.loadSavedFavicons();
            }
        } catch (error) {
            console.error('Error loading org info:', error);
            const errorDetails = error.message || String(error);
            const isNotConnected = errorDetails.includes('Not connected') || errorDetails.includes('Missing session');
            container.innerHTML = `<div class="error-message">
                ${isNotConnected 
                    ? '<div style="font-size: 24px; margin-bottom: 8px;">🔌</div><div style="font-weight: 600; margin-bottom: 4px;">Session Error</div><div style="font-size: 12px; color: #6c757d;">Please ensure you are logged into Salesforce in an active tab.</div>'
                    : `Error: ${errorDetails}`
                }
            </div>`;
            // Still try to load saved favicons
            this.loadSavedFavicons();
        }
    },

    renderOrgInfo: function(org, container) {
        const isSandbox = org.IsSandbox === true;
        const orgType = isSandbox ? `${org.OrganizationType} (Sandbox)` : org.OrganizationType;
        const statusBadge = isSandbox
            ? '<span style="background:#fff3bf;color:#e67700;padding:2px 8px;border-radius:4px;font-size:11px;font-weight:600;">SANDBOX</span>'
            : '<span style="background:#d3f9d8;color:#2b8a3e;padding:2px 8px;border-radius:4px;font-size:11px;font-weight:600;">PRODUCTION</span>';

        const fields = [
            { label: 'Organization Name', value: org.Name },
            { label: 'Organization ID', value: org.Id },
            { label: 'Type', value: `${orgType} ${statusBadge}` },
            { label: 'Instance', value: org.InstanceName || '-' },
            { label: 'Language', value: org.LanguageLocaleKey },
            { label: 'Locale', value: org.DefaultLocaleSidKey },
            { label: 'Timezone', value: org.TimeZoneSidKey },
            { label: 'Created', value: org.CreatedDate ? new Date(org.CreatedDate).toLocaleDateString() : '-' }
        ];

        if (org.TrialExpirationDate) {
            fields.push({ label: 'Trial Expires', value: new Date(org.TrialExpirationDate).toLocaleDateString() });
        }

        let html = '<div class="details-list">';
        fields.forEach(f => {
            html += `<div class="detail-row">
                <span class="detail-label">${f.label}:</span>
                <span class="detail-value">${f.value || '-'}</span>
            </div>`;
        });
        html += '</div>';
        container.innerHTML = html;

        // Check if this org already has saved favicon data - if so, load it (edit mode)
        // Otherwise, auto-suggest based on org type
        this.loadExistingFaviconOrSuggest(org.Id, isSandbox);
    },

    loadExistingFaviconOrSuggest: async function(orgId, isSandbox) {
        const labelInput = document.getElementById('favicon-label');
        const colorInput = document.getElementById('favicon-color');
        const editIndicator = document.getElementById('favicon-edit-indicator');

        try {
            const result = await chrome.storage.local.get('orgFavicons');
            const orgFavicons = (result && result.orgFavicons && typeof result.orgFavicons === 'object')
                ? result.orgFavicons : {};

            if (orgId && orgFavicons[orgId]) {
                // Existing data found - populate form in edit mode
                const { color, label, shape } = orgFavicons[orgId];
                if (colorInput && color) colorInput.value = color;
                if (labelInput) labelInput.value = label || '';
                // Set the shape selection
                if (shape) {
                    this.setSelectedShape(shape);
                }

                // Show edit mode indicator
                if (editIndicator) {
                    editIndicator.innerHTML = '<span style="color:#2b8a3e;font-size:11px;">✓ Editing existing favicon</span>';
                    editIndicator.style.display = 'block';
                }

                // Update preview with saved settings
                this.updateFaviconPreview();
                return;
            }
        } catch (e) {
            console.warn('Could not check existing favicon:', e);
        }

        // No existing data - auto-suggest based on org type
        if (editIndicator) {
            editIndicator.innerHTML = '';
            editIndicator.style.display = 'none';
        }

        if (labelInput && !labelInput.value && isSandbox) {
            labelInput.value = 'SBX';
            this.updateFaviconPreview();
        }
    },

    initFaviconPreview: async function() {
        // Render initial preview based on current form values
        // Note: loadExistingFaviconOrSuggest (called from renderOrgInfo) handles loading saved data
        const color = document.getElementById('favicon-color')?.value || '#ff6b6b';
        const label = document.getElementById('favicon-label')?.value || '';
        this.renderFaviconPreview(color, label);
    },

    updateFaviconPreview: function() {
        const preview = document.getElementById('favicon-preview');
        const color = document.getElementById('favicon-color')?.value || '#ff6b6b';
        const label = document.getElementById('favicon-label')?.value || '';
        const shapeRadio = document.querySelector('input[name="favicon-shape"]:checked');
        const shape = shapeRadio ? shapeRadio.value : 'cloud';

        if (!preview) return;

        // Remove existing content
        const existingBadge = preview.querySelector('.favicon-badge');
        if (existingBadge) existingBadge.remove();

        // Update preview with colored shape
        this.renderFaviconPreview(color, label, shape);
    },

    renderFaviconPreview: function(color, label, shape = 'cloud') {
        const preview = document.getElementById('favicon-preview');
        if (!preview) return;

        // Clear preview
        preview.innerHTML = '';

        // Create canvas for preview
        const canvas = document.createElement('canvas');
        canvas.width = 32;
        canvas.height = 32;
        canvas.style.width = '32px';
        canvas.style.height = '32px';
        const ctx = canvas.getContext('2d');

        // Draw the selected shape with color
        this.drawFaviconShape(ctx, color || '#ff6b6b', label, shape);

        preview.appendChild(canvas);
    },

    // Helper to get selected shape from the form
    getSelectedShape: function() {
        const shapeRadio = document.querySelector('input[name="favicon-shape"]:checked');
        return shapeRadio ? shapeRadio.value : 'cloud';
    },

    // Set shape selection in the form
    setSelectedShape: function(shape) {
        const shapeRadio = document.querySelector(`input[name="favicon-shape"][value="${shape}"]`);
        if (shapeRadio) {
            shapeRadio.checked = true;
        }
    },

    drawFaviconShape: function(ctx, color, label, shape = 'cloud') {
        ctx.clearRect(0, 0, 32, 32);
        ctx.fillStyle = color;

        switch (shape) {
            case 'circle':
                ctx.beginPath();
                ctx.arc(16, 16, 14, 0, Math.PI * 2);
                ctx.fill();
                break;

            case 'square':
                ctx.fillRect(2, 2, 28, 28);
                break;

            case 'rounded':
                this.drawRoundedRect(ctx, 2, 2, 28, 28, 6);
                ctx.fill();
                break;

            case 'diamond':
                ctx.beginPath();
                ctx.moveTo(16, 1);
                ctx.lineTo(30, 16);
                ctx.lineTo(16, 31);
                ctx.lineTo(2, 16);
                ctx.closePath();
                ctx.fill();
                break;

            case 'hexagon':
                this.drawHexagon(ctx, 16, 16, 14);
                ctx.fill();
                break;

            case 'cloud':
            default:
                // Draw Salesforce-style cloud shape
                ctx.beginPath();
                ctx.arc(16, 18, 10, Math.PI * 0.5, Math.PI * 1.5);
                ctx.arc(10, 12, 6, Math.PI, Math.PI * 1.5);
                ctx.arc(16, 8, 7, Math.PI * 1.2, Math.PI * 1.8);
                ctx.arc(22, 10, 6, Math.PI * 1.5, Math.PI * 0.3);
                ctx.arc(24, 18, 6, Math.PI * 1.5, Math.PI * 0.5);
                ctx.closePath();
                ctx.fill();
                break;
        }

        // Draw label text if provided
        if (label) {
            ctx.fillStyle = '#ffffff';
            ctx.font = 'bold 10px Arial, sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(label.substring(0, 3).toUpperCase(), 16, 16);
        }
    },

    // Helper function to draw a rounded rectangle
    drawRoundedRect: function(ctx, x, y, width, height, radius) {
        ctx.beginPath();
        ctx.moveTo(x + radius, y);
        ctx.lineTo(x + width - radius, y);
        ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
        ctx.lineTo(x + width, y + height - radius);
        ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
        ctx.lineTo(x + radius, y + height);
        ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
        ctx.lineTo(x, y + radius);
        ctx.quadraticCurveTo(x, y, x + radius, y);
        ctx.closePath();
    },

    // Helper function to draw a hexagon
    drawHexagon: function(ctx, cx, cy, radius) {
        ctx.beginPath();
        for (let i = 0; i < 6; i++) {
            const angle = (Math.PI / 3) * i - Math.PI / 2;
            const x = cx + radius * Math.cos(angle);
            const y = cy + radius * Math.sin(angle);
            if (i === 0) {
                ctx.moveTo(x, y);
            } else {
                ctx.lineTo(x, y);
            }
        }
        ctx.closePath();
    },

    // Legacy method - keep for backwards compatibility
    drawSalesforceCloud: function(ctx, color, label) {
        this.drawFaviconShape(ctx, color, label, 'cloud');
    },

    applyFavicon: async function() {
        const color = document.getElementById('favicon-color')?.value || '#ff6b6b';
        const label = document.getElementById('favicon-label')?.value || '';
        const shape = this.getSelectedShape();

        if (!this._currentOrgId) {
            this.showFaviconStatus('Could not determine current org. Please refresh.', 'error');
            return;
        }

        try {
            // Load existing favicons - be very careful to preserve existing data
            const result = await chrome.storage.local.get('orgFavicons');
            let orgFavicons = {};

            // Ensure we have a valid object
            if (result && result.orgFavicons && typeof result.orgFavicons === 'object') {
                orgFavicons = { ...result.orgFavicons }; // Create a copy to avoid mutation issues
            }

            console.log('Before save - existing favicons:', Object.keys(orgFavicons));

            // Get the current hostname from Salesforce tab (NOT the popup)
            let currentHostname = null;
            try {
                // First try to get ALL Salesforce tabs
                const allTabs = await chrome.tabs.query({});
                const sfTabs = allTabs.filter(tab =>
                    tab.url && (
                        tab.url.includes('.salesforce.com') ||
                        tab.url.includes('.force.com') ||
                        tab.url.includes('.salesforce-setup.com')
                    ) && !tab.url.startsWith('chrome-extension://')
                );

                if (sfTabs.length > 0) {
                    // Prefer active SF tab, otherwise use first SF tab
                    const sfTab = sfTabs.find(t => t.active) || sfTabs[0];
                    if (sfTab?.url) {
                        currentHostname = new URL(sfTab.url).hostname;
                        console.log('[TrackForcePro] Got hostname from SF tab:', currentHostname);
                    }
                }

                // Fallback: try active tab in current window (might be popup)
                if (!currentHostname) {
                    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
                    if (tabs[0]?.url && !tabs[0].url.startsWith('chrome-extension://')) {
                        currentHostname = new URL(tabs[0].url).hostname;
                        console.log('[TrackForcePro] Got hostname from active tab:', currentHostname);
                    }
                }
            } catch (e) {
                console.warn('Could not get hostname:', e);
            }

            if (!currentHostname) {
                console.warn('[TrackForcePro] Could not determine hostname for favicon save');
            }

            // Save/update favicon for current org ID (including shape)
            orgFavicons[this._currentOrgId] = {
                color,
                label,
                shape,
                orgName: this._currentOrgName || 'Unknown Org',
                hostname: currentHostname, // Store hostname for fallback lookup
                savedAt: new Date().toISOString()
            };

            console.log('After save - favicon data:', JSON.stringify(orgFavicons[this._currentOrgId]));
            console.log('After save - all favicons:', Object.keys(orgFavicons));

            // Save back to storage
            await chrome.storage.local.set({ orgFavicons: orgFavicons });

            // Verify save was successful
            const verifyResult = await chrome.storage.local.get('orgFavicons');
            console.log('Verified saved favicons:', Object.keys(verifyResult.orgFavicons || {}));

            // Refresh the saved list
            this.loadSavedFavicons();

            // Try to send message to Salesforce tab (not the popup itself)
            try {
                // Find Salesforce tabs specifically (exclude extension pages)
                const allTabs = await chrome.tabs.query({});
                const sfTabs = allTabs.filter(tab =>
                    tab.url && (
                        tab.url.includes('.salesforce.com') ||
                        tab.url.includes('.force.com') ||
                        tab.url.includes('.salesforce-setup.com')
                    ) && !tab.url.startsWith('chrome-extension://')
                );

                if (sfTabs.length > 0) {
                    // Try the active SF tab first, or the first SF tab found
                    const activeTab = sfTabs.find(t => t.active) || sfTabs[0];

                    try {
                        await chrome.tabs.sendMessage(activeTab.id, {
                            action: 'updateFavicon',
                            color: color,
                            label: label,
                            shape: shape,
                            orgId: this._currentOrgId
                        });
                        this.showFaviconStatus('Favicon saved & applied!', 'success');
                    } catch (msgError) {
                        // Content script might not be loaded, try scripting API
                        console.warn('Content script not responding:', msgError.message);
                        try {
                            await chrome.scripting.executeScript({
                                target: { tabId: activeTab.id },
                                func: this.injectFaviconUpdate,
                                args: [color, label, shape]
                            });
                            this.showFaviconStatus('Favicon saved & applied!', 'success');
                        } catch (scriptError) {
                            console.warn('Scripting API failed:', scriptError.message);
                            this.showFaviconStatus('Favicon saved. Refresh Salesforce page to see change.', 'success');
                        }
                    }
                } else {
                    this.showFaviconStatus('Favicon saved! Will apply when you visit this org.', 'success');
                }

                // Theme application removed - favicon only
            } catch (tabError) {
                console.warn('Tab query error:', tabError);
                this.showFaviconStatus('Favicon saved! Will apply on next page load.', 'success');
            }
        } catch (error) {
            console.error('Error applying favicon:', error);
            this.showFaviconStatus('Error: ' + error.message, 'error');
        }
    },

    showFaviconStatus: function(message, type) {
        const status = document.getElementById('favicon-status');
        if (!status) return;
        status.textContent = message;
        status.className = `update-status ${type}`;
        status.hidden = false;
        setTimeout(() => { status.hidden = true; }, 4000);
    },

    // Function to be injected into the page - supports all shapes
    injectFaviconUpdate: function(color, label, shape) {
        const canvas = document.createElement('canvas');
        canvas.width = 32;
        canvas.height = 32;
        const ctx = canvas.getContext('2d');

        ctx.clearRect(0, 0, 32, 32);
        ctx.fillStyle = color;

        // Draw the shape based on the shape parameter
        switch (shape) {
            case 'circle':
                ctx.beginPath();
                ctx.arc(16, 16, 14, 0, Math.PI * 2);
                ctx.fill();
                break;

            case 'square':
                ctx.fillRect(2, 2, 28, 28);
                break;

            case 'rounded':
                ctx.beginPath();
                ctx.moveTo(8, 2);
                ctx.lineTo(24, 2);
                ctx.quadraticCurveTo(30, 2, 30, 8);
                ctx.lineTo(30, 24);
                ctx.quadraticCurveTo(30, 30, 24, 30);
                ctx.lineTo(8, 30);
                ctx.quadraticCurveTo(2, 30, 2, 24);
                ctx.lineTo(2, 8);
                ctx.quadraticCurveTo(2, 2, 8, 2);
                ctx.closePath();
                ctx.fill();
                break;

            case 'diamond':
                ctx.beginPath();
                ctx.moveTo(16, 1);
                ctx.lineTo(30, 16);
                ctx.lineTo(16, 31);
                ctx.lineTo(2, 16);
                ctx.closePath();
                ctx.fill();
                break;

            case 'hexagon':
                ctx.beginPath();
                for (let i = 0; i < 6; i++) {
                    const angle = (Math.PI / 3) * i - Math.PI / 2;
                    const x = 16 + 14 * Math.cos(angle);
                    const y = 16 + 14 * Math.sin(angle);
                    if (i === 0) ctx.moveTo(x, y);
                    else ctx.lineTo(x, y);
                }
                ctx.closePath();
                ctx.fill();
                break;

            case 'cloud':
            default:
                // Draw Salesforce cloud with color
                ctx.beginPath();
                ctx.arc(16, 18, 10, Math.PI * 0.5, Math.PI * 1.5);
                ctx.arc(10, 12, 6, Math.PI, Math.PI * 1.5);
                ctx.arc(16, 8, 7, Math.PI * 1.2, Math.PI * 1.8);
                ctx.arc(22, 10, 6, Math.PI * 1.5, Math.PI * 0.3);
                ctx.arc(24, 18, 6, Math.PI * 1.5, Math.PI * 0.5);
                ctx.closePath();
                ctx.fill();
                break;
        }

        if (label) {
            ctx.fillStyle = '#ffffff';
            ctx.font = 'bold 10px Arial, sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(label.substring(0, 3).toUpperCase(), 16, 16);
        }

        // Remove existing favicons
        document.querySelectorAll('link[rel*="icon"]').forEach(l => l.remove());

        // Add new favicon
        const link = document.createElement('link');
        link.rel = 'icon';
        link.type = 'image/png';
        link.href = canvas.toDataURL('image/png');
        document.head.appendChild(link);
    },

    resetFavicon: async function() {
        try {
            // Remove from saved list for current org only
            if (this._currentOrgId) {
                const result = await chrome.storage.local.get('orgFavicons');
                let orgFavicons = {};

                if (result && result.orgFavicons && typeof result.orgFavicons === 'object') {
                    orgFavicons = { ...result.orgFavicons };
                }

                console.log('Before delete - existing favicons:', Object.keys(orgFavicons));
                delete orgFavicons[this._currentOrgId];
                console.log('After delete - remaining favicons:', Object.keys(orgFavicons));

                await chrome.storage.local.set({ orgFavicons: orgFavicons });
                this.loadSavedFavicons();
            }

            // Reset UI
            const colorInput = document.getElementById('favicon-color');
            const labelInput = document.getElementById('favicon-label');

            if (colorInput) colorInput.value = '#ff6b6b';
            if (labelInput) labelInput.value = '';

            // Reset preview to default
            this.renderFaviconPreview('#ff6b6b', '');

            // Try to reset on Salesforce tabs (not the popup)
            try {
                const allTabs = await chrome.tabs.query({});
                const sfTabs = allTabs.filter(tab =>
                    tab.url && (
                        tab.url.includes('.salesforce.com') ||
                        tab.url.includes('.force.com') ||
                        tab.url.includes('.salesforce-setup.com')
                    ) && !tab.url.startsWith('chrome-extension://')
                );

                if (sfTabs.length > 0) {
                    const activeTab = sfTabs.find(t => t.active) || sfTabs[0];
                    try {
                        await chrome.tabs.sendMessage(activeTab.id, { action: 'resetFavicon' });
                    } catch (msgError) {
                        // Silently fail - favicon will reset on next page load
                    }
                }
            } catch (e) {
                // Ignore errors - favicon will reset on next page load
            }

            this.showFaviconStatus('Favicon removed for this org.', 'success');

            // Theme reset removed - favicon only
        } catch (error) {
            console.error('Error resetting favicon:', error);
        }
    },

    loadSavedFavicons: async function() {
        const container = document.getElementById('saved-favicons-list');
        if (!container) return;

        try {
            const result = await chrome.storage.local.get('orgFavicons');
            let orgFavicons = {};

            if (result && result.orgFavicons && typeof result.orgFavicons === 'object') {
                orgFavicons = result.orgFavicons;
            }

            const entries = Object.entries(orgFavicons);
            console.log('Loading saved favicons, count:', entries.length);

            if (entries.length === 0) {
                container.innerHTML = '<div class="placeholder-note">No saved favicons yet</div>';
                return;
            }

            let html = '';
            entries.forEach(([orgId, data]) => {
                const isCurrentOrg = orgId === this._currentOrgId;

                html += `
                    <div class="favicon-list-item ${isCurrentOrg ? 'current-org' : ''}" data-org-id="${orgId}">
                        <div class="favicon-list-preview" id="preview-${orgId}"></div>
                        <div class="favicon-list-info">
                            <div class="favicon-list-org-name">${data.orgName || 'Unknown Org'}</div>
                            <div class="favicon-list-org-id">${orgId}</div>
                        </div>
                        <span class="favicon-current-badge">Current</span>
                        <div class="favicon-list-meta">
                            <span class="favicon-list-label" style="background:${data.color};color:#fff;">${data.label || '—'}</span>
                        </div>
                        <div class="favicon-list-actions">
                            <button class="btn-delete" data-org-id="${orgId}" title="Delete">×</button>
                        </div>
                    </div>
                `;
            });

            container.innerHTML = html;

            // Render previews for each item (using saved shape)
            entries.forEach(([orgId, data]) => {
                const previewEl = document.getElementById(`preview-${orgId}`);
                if (previewEl) {
                    const canvas = document.createElement('canvas');
                    canvas.width = 32;
                    canvas.height = 32;
                    const ctx = canvas.getContext('2d');
                    // Use the saved shape, defaulting to 'cloud' for backwards compatibility
                    this.drawFaviconShape(ctx, data.color || '#ff6b6b', data.label, data.shape || 'cloud');
                    previewEl.appendChild(canvas);
                }
            });

            // Wire delete buttons
            container.querySelectorAll('.btn-delete').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    this.deleteSavedFavicon(btn.dataset.orgId);
                });
            });

        } catch (error) {
            console.error('Error loading saved favicons:', error);
            container.innerHTML = '<div class="error-message">Error loading saved favicons</div>';
        }
    },

    deleteSavedFavicon: async function(orgId) {
        if (!orgId) return;

        try {
            const result = await chrome.storage.local.get('orgFavicons');
            let orgFavicons = {};

            if (result && result.orgFavicons && typeof result.orgFavicons === 'object') {
                orgFavicons = { ...result.orgFavicons };
            }

            const orgName = orgFavicons[orgId]?.orgName || orgId;
            delete orgFavicons[orgId];

            await chrome.storage.local.set({ orgFavicons: orgFavicons });
            this.loadSavedFavicons();

            // If we deleted the current org's favicon, reset the form
            if (orgId === this._currentOrgId) {
                const colorInput = document.getElementById('favicon-color');
                const labelInput = document.getElementById('favicon-label');
                if (colorInput) colorInput.value = '#ff6b6b';
                if (labelInput) labelInput.value = '';
                this.renderFaviconPreview('#ff6b6b', '');
            }

            this.showFaviconStatus(`Favicon removed for ${orgName}`, 'success');
        } catch (error) {
            console.error('Error deleting favicon:', error);
            this.showFaviconStatus('Error deleting favicon', 'error');
        }
    },

    // ==========================================
    // USER MANAGER
    // ==========================================

    loadCurrentUser: async function() {
        const container = document.getElementById('user-details-container');
        if (!container) return;
        container.innerHTML = '<div class="spinner">Loading user details...</div>';

        try {
            // IMPORTANT: Always refresh session from current window's tab to ensure correct org context
            if (PlatformHelper.refreshSessionFromTab) {
                try { await PlatformHelper.refreshSessionFromTab(); } catch {}
            }

            const session = await PlatformHelper.getSession();

            // Check if connected first
            if (!session || !session.isLoggedIn) {
                container.innerHTML = `
                    <div class="not-connected-message">
                        <div style="font-size: 24px; margin-bottom: 8px;">👤</div>
                        <div style="font-weight: 600; margin-bottom: 4px;">Not Connected</div>
                        <div style="font-size: 12px; color: #6c757d;">Please navigate to a Salesforce org to view user information.</div>
                    </div>
                `;
                return;
            }

            let userId = session.userId || null;

            // If userId is missing, fetch via "me" endpoint
            if (!userId) {
                try {
                    const apiSel = document.getElementById('api-version');
                    const v = (apiSel && apiSel.value) ? apiSel.value : '66.0';
                    const meRes = await PlatformHelper.fetchFromSalesforce(`/services/data/v${v}/chatter/users/me`);
                    if (meRes && meRes.id) {
                        userId = meRes.id;
                    }
                } catch (e) {
                    console.warn('Could not fetch current user ID via API', e);
                }
            }

            if (!userId) {
                container.innerHTML = '<div class="error-message">Could not determine current user ID. Are you logged in?</div>';
                return;
            }

            this._currentUserId = userId;

            const query = `SELECT Id, Username, FirstName, LastName, Email, LanguageLocaleKey, LocaleSidKey, 
                           TimeZoneSidKey, Profile.Name, Profile.Id, UserRole.Name, UserRole.Id, IsActive, 
                           LastLoginDate, CreatedDate FROM User WHERE Id = '${userId}'`;
            const result = await PlatformHelper.executeQuery(query);

            if (result && result.records && result.records.length > 0) {
                const user = result.records[0];
                this.renderUserDetails(user, container);
            } else {
                container.innerHTML = '<div class="error-message">User record not found.</div>';
            }
        } catch (error) {
            console.error('Error loading user details:', error);
            container.innerHTML = `<div class="error-message">Error: ${error.message}</div>`;
        }
    },

    renderUserDetails: function(user, container) {
        const isActive = user.IsActive !== false;
        const statusBadge = isActive
            ? '<span style="background:#d3f9d8;color:#2b8a3e;padding:2px 6px;border-radius:4px;font-size:10px;font-weight:600;">Active</span>'
            : '<span style="background:#ffe3e3;color:#c92a2a;padding:2px 6px;border-radius:4px;font-size:10px;font-weight:600;">Inactive</span>';

        const fullName = `${user.FirstName || ''} ${user.LastName || ''}`.trim() || user.Username;

        // Compact view - show only essential fields
        const fields = [
            { label: 'Name', value: `${fullName} ${statusBadge}` },
            { label: 'Email', value: user.Email || '-' },
            { label: 'Profile', value: user.Profile ? user.Profile.Name : '-' },
            { label: 'Role', value: user.UserRole ? user.UserRole.Name : 'None' },
            { label: 'Language', value: user.LanguageLocaleKey || '-' },
            { label: 'Last Login', value: user.LastLoginDate ? new Date(user.LastLoginDate).toLocaleDateString() : 'Never' }
        ];

        let html = '<div class="details-list compact">';
        fields.forEach(f => {
            html += `<div class="detail-row">
                <span class="detail-label">${f.label}:</span>
                <span class="detail-value">${f.value || '-'}</span>
            </div>`;
        });
        html += '</div>';
        container.innerHTML = html;
    },

    loadOrgMetadata: async function() {
        // Load profiles, roles, and languages for user update form
        try {
            await Promise.all([
                this.loadProfiles(),
                this.loadRoles(),
                this.loadLanguages()
            ]);
        } catch (error) {
            console.error('Error loading org metadata:', error);
        }
    },

    loadProfiles: async function() {
        try {
            const query = `SELECT Id, Name FROM Profile WHERE UserType = 'Standard' ORDER BY Name LIMIT 200`;
            const result = await PlatformHelper.executeQuery(query);
            if (result && result.records) {
                this._profiles = result.records;
                this.populateProfileSelect();
            }
        } catch (error) {
            console.warn('Error loading profiles:', error);
        }
    },

    loadRoles: async function() {
        try {
            const query = `SELECT Id, Name FROM UserRole ORDER BY Name LIMIT 200`;
            const result = await PlatformHelper.executeQuery(query);
            if (result && result.records) {
                this._roles = result.records;
                this.populateRoleSelect();
            }
        } catch (error) {
            console.warn('Error loading roles:', error);
        }
    },

    loadLanguages: async function() {
        // Common Salesforce language locale keys
        this._languages = [
            { value: 'en_US', label: 'English (US)' },
            { value: 'en_GB', label: 'English (UK)' },
            { value: 'de', label: 'German' },
            { value: 'es', label: 'Spanish' },
            { value: 'fr', label: 'French' },
            { value: 'it', label: 'Italian' },
            { value: 'ja', label: 'Japanese' },
            { value: 'ko', label: 'Korean' },
            { value: 'pt_BR', label: 'Portuguese (Brazil)' },
            { value: 'zh_CN', label: 'Chinese (Simplified)' },
            { value: 'zh_TW', label: 'Chinese (Traditional)' },
            { value: 'nl_NL', label: 'Dutch' },
            { value: 'da', label: 'Danish' },
            { value: 'fi', label: 'Finnish' },
            { value: 'ru', label: 'Russian' },
            { value: 'sv', label: 'Swedish' },
            { value: 'th', label: 'Thai' },
            { value: 'cs', label: 'Czech' },
            { value: 'pl', label: 'Polish' },
            { value: 'hu', label: 'Hungarian' },
            { value: 'tr', label: 'Turkish' },
            { value: 'in', label: 'Indonesian' },
            { value: 'vi', label: 'Vietnamese' }
        ];
        this.populateLanguageSelect();
    },

    populateProfileSelect: function() {
        const select = document.getElementById('user-profile-select');
        if (!select) return;
        select.innerHTML = '<option value="">-- Select Profile --</option>';
        this._profiles.forEach(p => {
            select.innerHTML += `<option value="${p.Id}">${p.Name}</option>`;
        });
    },

    populateRoleSelect: function() {
        const select = document.getElementById('user-role-select');
        if (!select) return;
        select.innerHTML = '<option value="">-- No Role --</option>';
        this._roles.forEach(r => {
            select.innerHTML += `<option value="${r.Id}">${r.Name}</option>`;
        });
    },

    populateLanguageSelect: function() {
        const select = document.getElementById('user-language-select');
        if (!select) return;
        select.innerHTML = '<option value="">-- Select Language --</option>';
        this._languages.forEach(l => {
            select.innerHTML += `<option value="${l.value}">${l.label}</option>`;
        });
    },

    searchUsers: async function() {
        const input = document.getElementById('user-search-input');
        const container = document.getElementById('user-search-results');
        const searchTerm = input?.value?.trim() || '';

        if (!searchTerm) {
            container.innerHTML = '<div class="placeholder-note">Enter a search term to find users</div>';
            return;
        }

        container.innerHTML = '<div class="spinner">Searching...</div>';

        try {
            const escapedTerm = searchTerm.replace(/'/g, "\\'");
            const query = `SELECT Id, Username, FirstName, LastName, Email, Profile.Name, IsActive 
                           FROM User 
                           WHERE Name LIKE '%${escapedTerm}%' 
                              OR Username LIKE '%${escapedTerm}%' 
                              OR Email LIKE '%${escapedTerm}%' 
                           ORDER BY Name 
                           LIMIT 20`;
            const result = await PlatformHelper.executeQuery(query);

            if (result && result.records && result.records.length > 0) {
                this.renderUserSearchResults(result.records, container);
            } else {
                container.innerHTML = '<div class="placeholder-note">No users found matching your search</div>';
            }
        } catch (error) {
            console.error('Error searching users:', error);
            container.innerHTML = `<div class="error-message">Error: ${error.message}</div>`;
        }
    },

    renderUserSearchResults: function(users, container) {
        let html = '';
        users.forEach(user => {
            const name = `${user.FirstName || ''} ${user.LastName || ''}`.trim() || user.Username;
            const status = user.IsActive !== false ? '✓' : '✗';
            const statusClass = user.IsActive !== false ? 'color:#2b8a3e' : 'color:#c92a2a';
            html += `
                <div class="user-result-item" data-user-id="${user.Id}" data-user-name="${name}">
                    <div>
                        <div class="user-result-name">
                            <span style="${statusClass};margin-right:4px;">${status}</span>
                            ${name}
                        </div>
                        <div class="user-result-email">${user.Email || user.Username}</div>
                    </div>
                    <button class="user-result-select-btn" data-user-id="${user.Id}" data-user-name="${name}">Select</button>
                </div>
            `;
        });
        container.innerHTML = html;

        // Wire select buttons
        container.querySelectorAll('.user-result-select-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.selectUser(btn.dataset.userId, btn.dataset.userName);
            });
        });

        // Also allow clicking the row
        container.querySelectorAll('.user-result-item').forEach(item => {
            item.addEventListener('click', () => {
                this.selectUser(item.dataset.userId, item.dataset.userName);
            });
        });
    },

    selectUser: async function(userId, userName) {
        this._selectedUserId = userId;

        // Update display
        const displayInput = document.getElementById('selected-user-display');
        const hiddenInput = document.getElementById('selected-user-id');
        if (displayInput) displayInput.value = userName;
        if (hiddenInput) hiddenInput.value = userId;

        // Enable form controls
        const profileSelect = document.getElementById('user-profile-select');
        const roleSelect = document.getElementById('user-role-select');
        const languageSelect = document.getElementById('user-language-select');
        const updateBtn = document.getElementById('user-update-btn');
        const clearBtn = document.getElementById('user-clear-selection');

        if (profileSelect) profileSelect.disabled = false;
        if (roleSelect) roleSelect.disabled = false;
        if (languageSelect) languageSelect.disabled = false;
        if (updateBtn) updateBtn.disabled = false;
        if (clearBtn) clearBtn.disabled = false;

        // Load current values for the selected user
        try {
            const query = `SELECT ProfileId, UserRoleId, LanguageLocaleKey FROM User WHERE Id = '${userId}'`;
            const result = await PlatformHelper.executeQuery(query);
            if (result && result.records && result.records.length > 0) {
                const user = result.records[0];
                if (profileSelect && user.ProfileId) profileSelect.value = user.ProfileId;
                if (roleSelect) roleSelect.value = user.UserRoleId || '';
                if (languageSelect && user.LanguageLocaleKey) languageSelect.value = user.LanguageLocaleKey;
            }
        } catch (error) {
            console.warn('Error loading selected user details:', error);
        }

        // Highlight selected in results
        document.querySelectorAll('.user-result-item').forEach(item => {
            item.classList.toggle('selected', item.dataset.userId === userId);
        });
    },

    clearUserSelection: function() {
        this._selectedUserId = null;

        const displayInput = document.getElementById('selected-user-display');
        const hiddenInput = document.getElementById('selected-user-id');
        if (displayInput) displayInput.value = '';
        if (hiddenInput) hiddenInput.value = '';

        const profileSelect = document.getElementById('user-profile-select');
        const roleSelect = document.getElementById('user-role-select');
        const languageSelect = document.getElementById('user-language-select');
        const updateBtn = document.getElementById('user-update-btn');
        const clearBtn = document.getElementById('user-clear-selection');

        if (profileSelect) { profileSelect.value = ''; profileSelect.disabled = true; }
        if (roleSelect) { roleSelect.value = ''; roleSelect.disabled = true; }
        if (languageSelect) { languageSelect.value = ''; languageSelect.disabled = true; }
        if (updateBtn) updateBtn.disabled = true;
        if (clearBtn) clearBtn.disabled = true;

        document.querySelectorAll('.user-result-item').forEach(item => {
            item.classList.remove('selected');
        });

        this.hideUpdateStatus();
    },

    updateSelectedUser: async function() {
        if (!this._selectedUserId) {
            this.showUpdateStatus('No user selected', 'error');
            return;
        }

        const profileId = document.getElementById('user-profile-select')?.value;
        const roleId = document.getElementById('user-role-select')?.value;
        const language = document.getElementById('user-language-select')?.value;

        // Build update payload
        const updateData = {};
        if (profileId) updateData.ProfileId = profileId;
        if (roleId) updateData.UserRoleId = roleId;
        else if (roleId === '') updateData.UserRoleId = null; // explicitly clear role
        if (language) updateData.LanguageLocaleKey = language;

        if (Object.keys(updateData).length === 0) {
            this.showUpdateStatus('No changes to save', 'error');
            return;
        }

        try {
            const apiSel = document.getElementById('api-version');
            const v = (apiSel && apiSel.value) ? apiSel.value : '66.0';

            await PlatformHelper.fetchFromSalesforce(
                `/services/data/v${v}/sobjects/User/${this._selectedUserId}`,
                {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(updateData)
                }
            );

            this.showUpdateStatus('User updated successfully!', 'success');

            // Refresh current user if we updated ourselves
            if (this._selectedUserId === this._currentUserId) {
                this.loadCurrentUser();
            }
        } catch (error) {
            console.error('Error updating user:', error);
            this.showUpdateStatus(`Error: ${error.message}`, 'error');
        }
    },

    showUpdateStatus: function(message, type) {
        const status = document.getElementById('user-update-status');
        if (!status) return;
        status.textContent = message;
        status.className = `update-status ${type}`;
        status.hidden = false;

        // Auto-hide after 5 seconds
        setTimeout(() => {
            status.hidden = true;
        }, 5000);
    },

    hideUpdateStatus: function() {
        const status = document.getElementById('user-update-status');
        if (status) status.hidden = true;
    },

    // ==========================================
    // CURRENT RECORD
    // ==========================================

    loadCurrentRecordContext: async function() {
        const container = document.getElementById('current-record-info');
        if (!container) return;
        container.innerHTML = '<div class="spinner">Analyzing current page...</div>';

        try {
            const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
            if (!tabs || tabs.length === 0) {
                container.innerHTML = '<div class="info-message">No active tab found.</div>';
                return;
            }

            const currentUrl = tabs[0].url;
            const possibleId = this.extractRecordIdFromUrl(currentUrl);

            if (possibleId) {
                this.identifyRecord(possibleId, container);
            } else {
                container.innerHTML = '<div class="info-message">No Record ID detected in the current URL. Navigate to a record page.</div>';
            }
        } catch (error) {
            container.innerHTML = `<div class="error-message">Error: ${error.message}</div>`;
        }
    },

    extractRecordIdFromUrl: function(url) {
        try {
            // Lightning: /r/Object/{ID}/view
            if (url.includes('/r/') && url.includes('/view')) {
                const parts = url.split('/r/');
                if (parts.length > 1) {
                    const segs = parts[1].split('/');
                    if (segs.length >= 2 && (segs[1].length === 15 || segs[1].length === 18)) {
                        return segs[1];
                    }
                }
            }

            // Query param ?id=
            const urlObj = new URL(url);
            const idParam = urlObj.searchParams.get('id');
            if (idParam && (idParam.length === 15 || idParam.length === 18)) {
                return idParam;
            }

            // Generic pattern match
            const idPattern = /\b([a-zA-Z0-9]{15}|[a-zA-Z0-9]{18})\b/g;
            const matches = url.match(idPattern);
            if (matches) {
                for (const m of matches) {
                    if (m.length === 15 || m.length === 18) {
                        // Basic validation: starts with valid prefix (most SF IDs start with 0 or a)
                        if (/^[0-9a-zA-Z]/.test(m)) {
                            return m;
                        }
                    }
                }
            }
        } catch (e) {
            console.warn('Error extracting record ID:', e);
        }
        return null;
    },

    // ==========================================
    // RECORD SEARCH
    // ==========================================

    searchRecord: function() {
        const input = document.getElementById('record-search-input');
        const container = document.getElementById('search-results-container');
        const recordId = input?.value?.trim();

        if (!recordId) {
            container.innerHTML = '<div class="error-message">Please enter a Record ID.</div>';
            return;
        }

        if (recordId.length !== 15 && recordId.length !== 18) {
            container.innerHTML = '<div class="error-message">Invalid ID length. Salesforce IDs are 15 or 18 characters.</div>';
            return;
        }

        this.identifyRecord(recordId, container);
    },

    identifyRecord: async function(recordId, container) {
        container.innerHTML = `<div class="spinner">Identifying record ${recordId}...</div>`;

        try {
            const endpoint = `/ui-api/records/${recordId}`;
            const response = await PlatformHelper.fetchFromSalesforce(endpoint);

            if (response && response.apiName) {
                const objectName = response.apiName;
                const fields = response.fields;

                let html = `<div class="record-card">
                    <h4>${objectName}</h4>
                    <div class="detail-row"><span class="detail-label">Record ID:</span><span class="detail-value">${recordId}</span></div>`;

                // Show common fields if available
                const commonFields = ['Name', 'Subject', 'Title', 'CaseNumber', 'OrderNumber'];
                for (const fieldName of commonFields) {
                    if (fields[fieldName] && fields[fieldName].value) {
                        html += `<div class="detail-row"><span class="detail-label">${fieldName}:</span><span class="detail-value">${fields[fieldName].value}</span></div>`;
                        break;
                    }
                }

                if (fields['CreatedById']) {
                    html += `<div class="detail-row"><span class="detail-label">Created By:</span><span class="detail-value">${fields['CreatedById'].value}</span></div>`;
                }
                if (fields['LastModifiedDate']) {
                    html += `<div class="detail-row"><span class="detail-label">Last Modified:</span><span class="detail-value">${new Date(fields['LastModifiedDate'].value).toLocaleString()}</span></div>`;
                }

                html += '</div>';
                container.innerHTML = html;
            } else {
                container.innerHTML = `<div class="record-card">
                    <div class="detail-row"><span class="detail-label">ID:</span><span class="detail-value">${recordId}</span></div>
                    <div class="info-message" style="margin-top:8px;">Could not retrieve details. The record may not exist or you may lack permissions.</div>
                </div>`;
            }
        } catch (e) {
            container.innerHTML = `<div class="record-card">
                <div class="detail-row"><span class="detail-label">ID:</span><span class="detail-value">${recordId}</span></div>
                <div class="error-message" style="margin-top:8px;">Error: ${e.message}</div>
            </div>`;
        }
    },

    // ==========================================
    // UTILITIES
    // ==========================================

    showNotification: function(message, type) {
        // Simple notification - could be enhanced
        console.log(`[${type}] ${message}`);
    }
};

// Expose globally
window.DataExplorerHelper = DataExplorerHelper;

