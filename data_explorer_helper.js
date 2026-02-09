/**
 * data_explorer_helper.js
 * Logic for the Data Explorer tab with sub-tabs:
 * - Sandbox & Favicon Manager
 * - User Manager (current user, search, update profile/role/language)
 * - Record Scanner (scan records, view field history, explore related records)
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
    _recordHistory: [],
    _maxHistoryItems: 5,

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
        const faviconLabel = document.getElementById('favicon-label');
        const faviconApply = document.getElementById('favicon-apply');
        const faviconReset = document.getElementById('favicon-reset');
        const faviconShapeOptions = document.querySelectorAll('input[name="favicon-shape"]');
        const faviconOrgSelect = document.getElementById('favicon-org-select');
        const faviconColorPresets = document.querySelectorAll('#favicon-color-presets .color-preset');

        if (faviconColor) {
            faviconColor.addEventListener('input', () => {
                this.updateFaviconPreview();
                this.updateColorPresetSelection();
            });
        }
        if (faviconLabel) {
            faviconLabel.addEventListener('input', () => this.updateFaviconPreview());
        }
        // Shape selection event listeners
        faviconShapeOptions.forEach(radio => {
            radio.addEventListener('change', () => this.updateFaviconPreview());
        });
        // Color preset click handlers
        faviconColorPresets.forEach(preset => {
            preset.addEventListener('click', () => this.selectColorPreset(preset.dataset.color));
        });
        if (faviconApply) {
            faviconApply.addEventListener('click', () => this.applyFavicon());
        }
        if (faviconReset) {
            faviconReset.addEventListener('click', () => this.resetFavicon());
        }
        // Org selector for editing different orgs
        if (faviconOrgSelect) {
            faviconOrgSelect.addEventListener('change', () => this.onOrgSelectChange());
        }

        // Refresh Org Info button
        const refreshOrgBtn = document.getElementById('refresh-org-btn');
        if (refreshOrgBtn) {
            refreshOrgBtn.addEventListener('click', () => this.loadOrgInfo());
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

        // Record Scanner (merged: scan records + history + related)
        const refreshRecordBtn = document.getElementById('refresh-record-btn');
        if (refreshRecordBtn) {
            refreshRecordBtn.addEventListener('click', () => this.loadCurrentRecordContext());
        }

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

        const clearHistoryBtn = document.getElementById('clear-record-history');
        if (clearHistoryBtn) {
            clearHistoryBtn.addEventListener('click', () => this.clearRecordHistory());
        }

        // Beta banner dismiss (CSP-compliant, no inline onclick)
        const recordLookupBannerDismiss = document.getElementById('record-lookup-banner-dismiss');
        if (recordLookupBannerDismiss) {
            recordLookupBannerDismiss.addEventListener('click', () => {
                const banner = document.getElementById('record-lookup-beta-banner');
                if (banner) banner.style.display = 'none';
                // Optionally persist dismissed state
                try { chrome.storage?.local?.set?.({ recordScannerBannerDismissed: true }); } catch {}
            });
            // Check if already dismissed (check both old and new keys for backward compatibility)
            try {
                chrome.storage?.local?.get?.({ recordScannerBannerDismissed: false, recordLookupBannerDismissed: false }).then(result => {
                    if (result.recordScannerBannerDismissed || result.recordLookupBannerDismissed) {
                        const banner = document.getElementById('record-lookup-beta-banner');
                        if (banner) banner.style.display = 'none';
                    }
                });
            } catch {}
        }

        // Collapsible panels for Field History and Related Records
        this.wireCollapsiblePanels();

        // History tools buttons
        const btnRefreshHistory = document.getElementById('btn-refresh-history');
        const btnExportHistory = document.getElementById('btn-export-history');
        if (btnRefreshHistory) {
            btnRefreshHistory.addEventListener('click', () => this.refreshFieldHistory());
        }
        if (btnExportHistory) {
            btnExportHistory.addEventListener('click', () => this.exportFieldHistory());
        }

        // Developer Tools Quick Links
        this.wireDevToolsButtons();

        // Load record history on init
        this.loadRecordHistory();
    },

    wireDevToolsButtons: function() {
        const btnSetup = document.getElementById('btn-open-setup');
        const btnDevConsole = document.getElementById('btn-open-dev-console');
        const btnObjectManager = document.getElementById('btn-open-object-manager');
        const btnDebugLogs = document.getElementById('btn-open-debug-logs');
        const btnViewInSetup = document.getElementById('btn-view-in-setup');
        const btnQueryRecord = document.getElementById('btn-query-record');
        const btnCopySOQL = document.getElementById('btn-copy-soql');
        const btnViewAPI = document.getElementById('btn-view-api');

        if (btnSetup) btnSetup.addEventListener('click', () => this.openSalesforceLink('/lightning/setup/SetupOneHome/home'));
        if (btnDevConsole) btnDevConsole.addEventListener('click', () => this.openDevConsole());
        if (btnObjectManager) btnObjectManager.addEventListener('click', () => this.openSalesforceLink('/lightning/setup/ObjectManager/home'));
        if (btnDebugLogs) btnDebugLogs.addEventListener('click', () => this.openSalesforceLink('/lightning/setup/ApexDebugLogs/home'));
        if (btnViewInSetup) btnViewInSetup.addEventListener('click', () => this.openObjectSetup());
        if (btnQueryRecord) btnQueryRecord.addEventListener('click', () => this.queryCurrentRecord());
        if (btnCopySOQL) btnCopySOQL.addEventListener('click', () => this.copyRecordSOQL());
        if (btnViewAPI) btnViewAPI.addEventListener('click', () => this.viewRecordAPI());
    },

    wireCollapsiblePanels: function() {
        // Field History panel toggle
        const fieldHistoryToggle = document.getElementById('field-history-toggle');
        const fieldHistoryPanel = document.getElementById('field-history-panel');
        if (fieldHistoryToggle && fieldHistoryPanel) {
            fieldHistoryToggle.addEventListener('click', () => {
                fieldHistoryPanel.classList.toggle('collapsed');
            });
        }

        // Related Records panel toggle
        const relatedRecordsToggle = document.getElementById('related-records-toggle');
        const relatedRecordsPanel = document.getElementById('related-records-panel');
        if (relatedRecordsToggle && relatedRecordsPanel) {
            relatedRecordsToggle.addEventListener('click', () => {
                relatedRecordsPanel.classList.toggle('collapsed');
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
            case 'record-lookup':
                this.loadCurrentRecordContext();
                this.loadRecordHistory();
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
            ? '<span style="background:#fff3bf;color:#e67700;padding:2px 6px;border-radius:4px;font-size:10px;font-weight:600;">SANDBOX</span>'
            : '<span style="background:#d3f9d8;color:#2b8a3e;padding:2px 6px;border-radius:4px;font-size:10px;font-weight:600;">PRODUCTION</span>';

        const fields = [
            { label: 'Name', value: org.Name },
            { label: 'Org ID', value: org.Id },
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

        // Use grid layout matching User Manager Current User style
        let html = '';
        fields.forEach(f => {
            html += `<span class="detail-label">${f.label}:</span>
                <span class="detail-value">${f.value || '-'}</span>`;
        });
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
                // Update color preset selection highlight
                this.updateColorPresetSelection();
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
        // Update color preset selection for default color
        this.updateColorPresetSelection();
    },

    initFaviconPreview: async function() {
        // Render initial preview based on current form values
        // Note: loadExistingFaviconOrSuggest (called from renderOrgInfo) handles loading saved data
        const color = document.getElementById('favicon-color')?.value || '#ff6b6b';
        const label = document.getElementById('favicon-label')?.value || '';
        this.renderFaviconPreview(color, label);
        // Initialize color preset selection
        this.updateColorPresetSelection();
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
        canvas.width = 36;
        canvas.height = 36;
        canvas.style.width = '36px';
        canvas.style.height = '36px';
        const ctx = canvas.getContext('2d');

        // Scale and draw the selected shape with color
        ctx.scale(36/32, 36/32);
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

    // Color presets configuration
    _colorPresets: [
        { value: '#ff6b6b', name: 'Red (Production)' },
        { value: '#51cf66', name: 'Green (Dev)' },
        { value: '#339af0', name: 'Blue (UAT)' },
        { value: '#fcc419', name: 'Yellow (QA)' },
        { value: '#9775fa', name: 'Purple (Staging)' },
        { value: '#ff922b', name: 'Orange (Hotfix)' }
    ],

    // Select a color preset
    selectColorPreset: function(color) {
        const colorInput = document.getElementById('favicon-color');
        if (colorInput && color) {
            colorInput.value = color;
            this.updateFaviconPreview();
            this.updateColorPresetSelection();
        }
    },

    // Update the visual selection state of color presets
    updateColorPresetSelection: function() {
        const colorInput = document.getElementById('favicon-color');
        const presets = document.querySelectorAll('#favicon-color-presets .color-preset');
        const currentColor = colorInput?.value?.toLowerCase() || '#ff6b6b';

        presets.forEach(preset => {
            const presetColor = preset.dataset.color?.toLowerCase();
            if (presetColor === currentColor) {
                preset.classList.add('selected');
            } else {
                preset.classList.remove('selected');
            }
        });
    },

    // Get all color presets
    getColorPresets: function() {
        return this._colorPresets;
    },

    // Check if a color is a preset color
    isPresetColor: function(color) {
        if (!color) return false;
        const normalizedColor = color.toLowerCase();
        return this._colorPresets.some(p => p.value.toLowerCase() === normalizedColor);
    },

    // Get preset name by color
    getPresetNameByColor: function(color) {
        if (!color) return null;
        const normalizedColor = color.toLowerCase();
        const preset = this._colorPresets.find(p => p.value.toLowerCase() === normalizedColor);
        return preset ? preset.name : null;
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

        // Determine which org to save for - editing org or current org
        const targetOrgId = this._editingOrgId || this._currentOrgId;

        if (!targetOrgId) {
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

            // Get existing org data if editing, or use current org info
            const existingData = orgFavicons[targetOrgId] || {};
            const orgName = this._editingOrgId
                ? (existingData.orgName || 'Unknown Org')
                : (this._currentOrgName || 'Unknown Org');

            // Save/update favicon for target org ID (including shape)
            orgFavicons[targetOrgId] = {
                color,
                label,
                shape,
                orgName: orgName,
                hostname: currentHostname || existingData.hostname, // Preserve existing hostname if we can't get new one
                savedAt: new Date().toISOString()
            };

            console.log('After save - favicon data:', JSON.stringify(orgFavicons[targetOrgId]));
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

                    // Only apply to tab if editing current org
                    const isEditingCurrentOrg = !this._editingOrgId || this._editingOrgId === this._currentOrgId;

                    if (isEditingCurrentOrg) {
                        try {
                            await chrome.tabs.sendMessage(activeTab.id, {
                                action: 'updateFavicon',
                                color: color,
                                label: label,
                                shape: shape,
                                orgId: targetOrgId
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
                        // Editing a different org, just save
                        this.showFaviconStatus('Favicon saved for selected org!', 'success');
                    }
                } else {
                    this.showFaviconStatus('Favicon saved! Will apply when you visit this org.', 'success');
                }

                // Clear editing state after successful save
                this._editingOrgId = null;
                const orgSelect = document.getElementById('favicon-org-select');
                if (orgSelect) orgSelect.value = '';
                const editIndicator = document.getElementById('favicon-edit-indicator');
                if (editIndicator) editIndicator.style.display = 'none';

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
        try {
            const canvas = document.createElement('canvas');

            // Defensive check: ensure canvas is valid
            if (!canvas || typeof canvas.getContext !== 'function') {
                console.error('[TrackForcePro] Canvas creation failed or getContext not available');
                return;
            }

            canvas.width = 32;
            canvas.height = 32;
            const ctx = canvas.getContext('2d');

            if (!ctx) {
                console.error('[TrackForcePro] Could not get 2D context from canvas');
                return;
            }

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
        } catch (e) {
            console.error('[TrackForcePro] Error in injectFaviconUpdate:', e);
        }
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
        const orgSelect = document.getElementById('favicon-org-select');

        try {
            const result = await chrome.storage.local.get('orgFavicons');
            let orgFavicons = {};

            if (result && result.orgFavicons && typeof result.orgFavicons === 'object') {
                orgFavicons = result.orgFavicons;
            }

            const entries = Object.entries(orgFavicons);
            console.log('Loading saved favicons, count:', entries.length);

            // Populate org selector dropdown
            if (orgSelect) {
                const currentValue = orgSelect.value;
                orgSelect.innerHTML = '<option value="">Current Org</option>';
                entries.forEach(([orgId, data]) => {
                    const isCurrentOrg = orgId === this._currentOrgId;
                    const label = data.orgName ? `${data.orgName} ${isCurrentOrg ? '(Current)' : ''}` : orgId;
                    orgSelect.innerHTML += `<option value="${orgId}" ${isCurrentOrg ? 'data-current="true"' : ''}>${label}</option>`;
                });
                // Restore previous selection if still valid
                if (currentValue && orgSelect.querySelector(`option[value="${currentValue}"]`)) {
                    orgSelect.value = currentValue;
                }
            }

            if (!container) return;

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
                            <div class="favicon-list-org-name">${data.orgName || 'Unknown Org'}${isCurrentOrg ? ' <span class="current-badge">●</span>' : ''}</div>
                        </div>
                        <div class="favicon-list-meta">
                            <span class="favicon-list-label" style="background:${data.color};color:#fff;">${data.label || '—'}</span>
                        </div>
                        <div class="favicon-list-actions">
                            <button class="btn-edit" data-org-id="${orgId}" title="Edit">✎</button>
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
                    canvas.width = 24;
                    canvas.height = 24;
                    const ctx = canvas.getContext('2d');
                    ctx.scale(24/32, 24/32);
                    this.drawFaviconShape(ctx, data.color || '#ff6b6b', data.label, data.shape || 'cloud');
                    previewEl.appendChild(canvas);
                }
            });

            // Wire edit buttons
            container.querySelectorAll('.btn-edit').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    this.editSavedFavicon(btn.dataset.orgId);
                });
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
            if (container) {
                container.innerHTML = '<div class="error-message">Error loading saved favicons</div>';
            }
        }
    },

    // Handle org selector change
    onOrgSelectChange: async function() {
        const orgSelect = document.getElementById('favicon-org-select');
        const selectedOrgId = orgSelect?.value;

        if (!selectedOrgId) {
            // Reset to current org
            this._editingOrgId = null;
            if (this._currentOrgId) {
                this.loadExistingFaviconOrSuggest(this._currentOrgId, this._currentOrgIsSandbox || false);
            } else {
                // Clear form
                this.resetFaviconForm();
            }
            return;
        }

        this.editSavedFavicon(selectedOrgId);
    },

    // Edit a saved favicon
    editSavedFavicon: async function(orgId) {
        if (!orgId) return;

        try {
            const result = await chrome.storage.local.get('orgFavicons');
            const orgFavicons = (result && result.orgFavicons) || {};
            const data = orgFavicons[orgId];

            if (!data) {
                this.showFaviconStatus('Favicon not found', 'error');
                return;
            }

            // Set the org selector to this org
            const orgSelect = document.getElementById('favicon-org-select');
            if (orgSelect) {
                orgSelect.value = orgId;
            }

            // Store which org we're editing
            this._editingOrgId = orgId;

            // Populate the form
            const colorInput = document.getElementById('favicon-color');
            const labelInput = document.getElementById('favicon-label');

            if (colorInput && data.color) colorInput.value = data.color;
            if (labelInput) labelInput.value = data.label || '';
            if (data.shape) this.setSelectedShape(data.shape);

            // Show edit indicator
            const editIndicator = document.getElementById('favicon-edit-indicator');
            if (editIndicator) {
                editIndicator.innerHTML = `✎ Editing: ${data.orgName || orgId}`;
                editIndicator.style.display = 'block';
            }

            // Update preview
            this.updateFaviconPreview();

        } catch (error) {
            console.error('Error loading favicon for edit:', error);
        }
    },

    // Reset favicon form to defaults
    resetFaviconForm: function() {
        const colorInput = document.getElementById('favicon-color');
        const labelInput = document.getElementById('favicon-label');
        const editIndicator = document.getElementById('favicon-edit-indicator');
        const orgSelect = document.getElementById('favicon-org-select');

        if (colorInput) colorInput.value = '#ff6b6b';
        if (labelInput) labelInput.value = '';
        if (editIndicator) editIndicator.style.display = 'none';
        if (orgSelect) orgSelect.value = '';

        this.setSelectedShape('cloud');
        this._editingOrgId = null;
        this.updateFaviconPreview();
        this.updateColorPresetSelection();
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
                    const v = (apiSel && apiSel.value) ? apiSel.value : '63.0';
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
            const v = (apiSel && apiSel.value) ? apiSel.value : '63.0';

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
    // RECORD LOOKUP (MERGED)
    // ==========================================

    loadCurrentRecordContext: async function() {
        const container = document.getElementById('current-record-info');
        if (!container) return;
        container.innerHTML = '<div class="spinner">Detecting record from Salesforce tab...</div>';

        try {
            // Use Utils.findSalesforceTab to get the correct Salesforce tab
            // This properly handles popup, standalone window, and tab modes
            let sfTab = null;
            if (window.Utils && typeof window.Utils.findSalesforceTab === 'function') {
                sfTab = await window.Utils.findSalesforceTab();
            }

            // Fallback: try direct query if Utils not available
            if (!sfTab) {
                const tabs = await chrome.tabs.query({
                    url: ['https://*.salesforce.com/*', 'https://*.force.com/*', 'https://*.salesforce-setup.com/*']
                });
                if (tabs && tabs.length > 0) {
                    // Prefer active tab in current window
                    let currentWindowId = null;
                    try {
                        const current = await chrome.windows.getCurrent({ populate: false });
                        currentWindowId = current?.id ?? null;
                    } catch {}

                    if (currentWindowId != null) {
                        const currentWindowTabs = tabs.filter(t => t.windowId === currentWindowId);
                        if (currentWindowTabs.length > 0) {
                            sfTab = currentWindowTabs.find(t => t.active) || currentWindowTabs[0];
                        }
                    }

                    if (!sfTab) {
                        sfTab = tabs.find(t => t.active) || tabs[0];
                    }
                }
            }

            if (!sfTab || !sfTab.url) {
                container.innerHTML = '<div class="info-message">No Salesforce tab found. Open a Salesforce page to auto-detect records.</div>';
                return;
            }

            const currentUrl = sfTab.url;
            const possibleId = this.extractRecordIdFromUrl(currentUrl);

            if (possibleId) {
                // Show which tab we detected from
                const tabInfo = sfTab.title ? ` from "${sfTab.title.substring(0, 30)}${sfTab.title.length > 30 ? '...' : ''}"` : '';
                container.innerHTML = `<div class="spinner">Found record${tabInfo}...</div>`;
                this.identifyRecord(possibleId, container, true);
            } else {
                container.innerHTML = '<div class="info-message">No Record ID detected in the current Salesforce URL. Navigate to a record page (e.g., Account, Contact, Opportunity).</div>';
            }
        } catch (error) {
            console.error('Error in loadCurrentRecordContext:', error);
            container.innerHTML = `<div class="error-message">Error: ${error.message}</div>`;
        }
    },

    extractRecordIdFromUrl: function(url) {
        try {
            // Lightning: /r/Object/{ID}/view or /r/Object/{ID}/edit
            if (url.includes('/r/')) {
                const match = url.match(/\/r\/[^/]+\/([a-zA-Z0-9]{15,18})(?:\/|$|\?)/);
                if (match && match[1]) {
                    return match[1];
                }
            }

            // Lightning: /lightning/r/sObject/{ID}/view
            if (url.includes('/lightning/r/sObject/')) {
                const match = url.match(/\/lightning\/r\/sObject\/([a-zA-Z0-9]{15,18})(?:\/|$|\?)/);
                if (match && match[1]) {
                    return match[1];
                }
            }

            // Lightning related list: /lightning/r/Object/{ID}/related/...
            if (url.includes('/related/')) {
                const match = url.match(/\/r\/[^/]+\/([a-zA-Z0-9]{15,18})\/related/);
                if (match && match[1]) {
                    return match[1];
                }
            }

            // Classic URL: /{ID} at the end of path
            const classicMatch = url.match(/salesforce\.com\/([a-zA-Z0-9]{15,18})(?:$|\/|\?)/);
            if (classicMatch && classicMatch[1]) {
                return classicMatch[1];
            }

            // Query param ?id=
            const urlObj = new URL(url);
            const idParam = urlObj.searchParams.get('id');
            if (idParam && (idParam.length === 15 || idParam.length === 18) && /^[a-zA-Z0-9]+$/.test(idParam)) {
                return idParam;
            }

            // recordId query param (sometimes used)
            const recordIdParam = urlObj.searchParams.get('recordId');
            if (recordIdParam && (recordIdParam.length === 15 || recordIdParam.length === 18) && /^[a-zA-Z0-9]+$/.test(recordIdParam)) {
                return recordIdParam;
            }

            // Generic pattern match - look for Salesforce ID pattern
            // Be more selective: avoid matching random alphanumeric strings
            const idPattern = /\b([a-zA-Z0-9]{15}|[a-zA-Z0-9]{18})\b/g;
            const matches = url.match(idPattern);
            if (matches) {
                for (const m of matches) {
                    // Validate it looks like a Salesforce ID (starts with known prefixes or lowercase a-z for custom objects)
                    if (/^[0-9]{3}|^[a-zA-Z][0-9]{2}|^[a-z]{3}/.test(m)) {
                        return m;
                    }
                }
            }
        } catch (e) {
            console.warn('Error extracting record ID:', e);
        }
        return null;
    },

    // Key prefix to object name mapping for common Salesforce objects
    _keyPrefixMap: {
        '001': 'Account',
        '003': 'Contact',
        '006': 'Opportunity',
        '00Q': 'Lead',
        '500': 'Case',
        '005': 'User',
        '00D': 'Organization',
        '00e': 'Profile',
        '00G': 'Group',
        '01p': 'ApexClass',
        '01q': 'ApexTrigger',
        '066': 'CustomField',
        '0DM': 'CustomMetadata',
        '801': 'ContentDocument',
        '068': 'ContentVersion',
        '00T': 'Task',
        '00U': 'Event',
        '701': 'Campaign',
        '00k': 'Product2',
        '01u': 'Pricebook2',
        '00l': 'Folder',
        '015': 'Document',
        '00b': 'Attachment',
        '570': 'EmailTemplate',
        'a00': 'CustomObject', // Custom object records often start with 'a0x' pattern
    },

    /**
     * Fallback method to fetch record details via SOQL when UI API fails
     * Uses key prefix mapping to determine object type
     */
    fetchRecordViaSoql: async function(recordId) {
        const keyPrefix = recordId.substring(0, 3);

        // Try to find object name from key prefix
        let objectName = this._keyPrefixMap[keyPrefix];

        // If not found in common map, try to get object type from global describe
        if (!objectName) {
            try {
                // Query global describe to find object by key prefix
                const apiSel = document.getElementById('api-version');
                const v = (apiSel && apiSel.value) ? apiSel.value : '63.0';
                const describeResult = await PlatformHelper.fetchFromSalesforce(`/services/data/v${v}/sobjects`);

                if (describeResult && describeResult.sobjects) {
                    for (const obj of describeResult.sobjects) {
                        if (obj.keyPrefix === keyPrefix) {
                            objectName = obj.name;
                            // Cache for future use
                            this._keyPrefixMap[keyPrefix] = objectName;
                            break;
                        }
                    }
                }
            } catch (describeError) {
                console.warn('Could not fetch global describe:', describeError);
            }
        }

        // If still no object name, return basic info with the record ID
        if (!objectName) {
            return {
                _objectName: `Unknown (${keyPrefix}...)`,
                _fields: { Id: recordId },
                _note: `Object type for key prefix '${keyPrefix}' not found. The record may be from a custom object or a special object type.`
            };
        }

        // Build SOQL query to fetch record - start with minimal fields that exist on all objects
        const minimalFields = 'Id';
        const commonFields = 'Id, CreatedById, CreatedDate, LastModifiedById, LastModifiedDate';
        const extraFields = {
            'Case': 'CaseNumber, Subject, Status, Priority, OwnerId',
            'Opportunity': 'Name, StageName, Amount, CloseDate, OwnerId',
            'Lead': 'Name, Company, Status, LeadSource, OwnerId',
            'Account': 'Name, Type, Industry, BillingCity, OwnerId',
            'Contact': 'Name, Email, Phone, Title, OwnerId',
            'Task': 'Subject, Status, Priority, OwnerId',
            'Event': 'Subject, StartDateTime, EndDateTime, OwnerId',
            'Campaign': 'Name, Status, Type, StartDate, OwnerId',
            'User': 'Name, Username, Email, IsActive',
            'ContentDocument': 'Title, FileType, ContentSize',
            'ContentVersion': 'Title, FileType, ContentSize'
        };

        // Try with full fields first, then fall back to minimal
        const fieldSets = [
            extraFields[objectName] ? `${commonFields}, ${extraFields[objectName]}` : commonFields,
            commonFields,
            minimalFields
        ];

        for (const fieldsToQuery of fieldSets) {
            try {
                const query = `SELECT ${fieldsToQuery} FROM ${objectName} WHERE Id = '${recordId}' LIMIT 1`;
                const result = await PlatformHelper.executeQuery(query);

                if (result && result.records && result.records.length > 0) {
                    const record = result.records[0];

                    // Convert to a format similar to UI API response
                    return {
                        _objectName: objectName,
                        _fields: record, // SOQL returns direct values, not {value: x} format
                        _fromSoql: true
                    };
                } else {
                    // Record not found via SOQL - return with object name at least
                    return {
                        _objectName: objectName,
                        _fields: { Id: recordId },
                        _note: 'Record not found or you may not have access to view it.'
                    };
                }
            } catch (soqlError) {
                const errMsg = soqlError?.message?.toLowerCase() || '';
                // If it's a field not found error, try with fewer fields
                if (errMsg.includes('no such column') || errMsg.includes('invalid field') || errMsg.includes('doesn\'t exist')) {
                    console.warn(`SOQL failed with fields [${fieldsToQuery}], trying with fewer fields...`);
                    continue;
                }
                // For other errors, log and continue to next field set
                console.warn('SOQL fallback failed:', soqlError);
                continue;
            }
        }

        // All attempts failed - return basic info
        return {
            _objectName: objectName,
            _fields: { Id: recordId },
            _error: 'Could not fetch record details. You may not have access to this record.'
        };
    },

    searchRecord: function() {
        const input = document.getElementById('record-search-input');
        const container = document.getElementById('current-record-info');
        const recordId = input?.value?.trim();

        if (!recordId) {
            container.innerHTML = '<div class="error-message">Please enter a Record ID.</div>';
            return;
        }

        if (recordId.length !== 15 && recordId.length !== 18) {
            container.innerHTML = '<div class="error-message">Invalid ID length. Salesforce IDs must be 15 or 18 characters.</div>';
            return;
        }

        if (!/^[a-zA-Z0-9]+$/.test(recordId)) {
            container.innerHTML = '<div class="error-message">Invalid ID format. Only alphanumeric characters allowed.</div>';
            return;
        }

        this.identifyRecord(recordId, container, false);
    },

    identifyRecord: async function(recordId, container, isAutoDetect = false) {
        container.innerHTML = `<div class="spinner">Identifying record ${recordId.substring(0, 8)}...</div>`;

        // Check if PlatformHelper is available
        if (!window.PlatformHelper || typeof window.PlatformHelper.fetchFromSalesforce !== 'function') {
            container.innerHTML = `<div class="record-detail-card">
                <div class="record-detail-row">
                    <span class="record-detail-label">ID</span>
                    <span class="record-detail-value"><code>${recordId}</code></span>
                </div>
                <div class="error-message" style="margin-top:8px;">Platform helper not available. Please refresh the extension.</div>
            </div>`;
            return;
        }

        try {
            // First, try UI API for full record details
            let response = null;
            let usedFallback = false;
            let uiApiErrorMsg = '';

            try {
                const endpoint = `/ui-api/records/${recordId}`;
                response = await PlatformHelper.fetchFromSalesforce(endpoint);
            } catch (uiApiError) {
                // UI API failed - check if it's a 404 or object not supported
                uiApiErrorMsg = (uiApiError && uiApiError.message) ? uiApiError.message : '';
                const errorMsgLower = uiApiErrorMsg.toLowerCase();

                // Check if we should fall back to SOQL
                const shouldFallback = errorMsgLower.includes('not found') ||
                                       errorMsgLower.includes('404') ||
                                       errorMsgLower.includes('does not support') ||
                                       errorMsgLower.includes('invalid') ||
                                       errorMsgLower.includes('not connected') ||
                                       errorMsgLower.includes('no response') ||
                                       errorMsgLower === '' ||
                                       errorMsgLower === 'error';

                if (shouldFallback) {
                    // Fallback: Use SOQL with key prefix mapping
                    usedFallback = true;
                    console.log('UI API failed, trying SOQL fallback for record:', recordId, 'Error:', uiApiErrorMsg);
                    try {
                        response = await this.fetchRecordViaSoql(recordId);
                    } catch (soqlFallbackError) {
                        // SOQL fallback also failed - create a basic response with error info
                        console.warn('SOQL fallback also failed:', soqlFallbackError);
                        const keyPrefix = recordId.substring(0, 3);
                        const objectName = this._keyPrefixMap[keyPrefix] || `Unknown (${keyPrefix}...)`;
                        response = {
                            _objectName: objectName,
                            _fields: { Id: recordId },
                            _error: uiApiErrorMsg || soqlFallbackError?.message || 'Unable to fetch record details. Please check your Salesforce connection.'
                        };
                    }
                } else {
                    // For other errors, still try fallback but keep the original error
                    usedFallback = true;
                    console.log('UI API error, attempting SOQL fallback:', uiApiErrorMsg);
                    try {
                        response = await this.fetchRecordViaSoql(recordId);
                    } catch (soqlFallbackError) {
                        // Both failed - throw a more informative error
                        const combinedError = new Error(uiApiErrorMsg || 'Unable to fetch record details');
                        throw combinedError;
                    }
                }
            }

            // Handle null/undefined response
            if (response === null || response === undefined) {
                container.innerHTML = `<div class="record-detail-card">
                    <div class="record-detail-row">
                        <span class="record-detail-label">ID</span>
                        <span class="record-detail-value"><code>${recordId}</code></span>
                    </div>
                    <div class="error-message" style="margin-top:8px;">Not connected to Salesforce or record not found. Please ensure you have an active Salesforce tab open and you are logged in.</div>
                </div>`;
                return;
            }

            // Check if we have valid record data (from UI API or SOQL fallback)
            const objectName = response.apiName || response._objectName;
            const fields = response.fields || response._fields || {};

            if (objectName) {
                // Get display name - handle both UI API format ({value: x}) and SOQL format (direct value)
                let displayName = '';
                const nameFields = ['Name', 'Subject', 'Title', 'CaseNumber', 'OrderNumber', 'ContractNumber', 'DeveloperName'];
                for (const fieldName of nameFields) {
                    const fieldData = fields[fieldName];
                    if (fieldData) {
                        displayName = fieldData.value !== undefined ? fieldData.value : fieldData;
                        if (displayName) break;
                    }
                }

                // Build enhanced HTML
                let html = `<div class="record-detail-card">
                    <div class="record-card-header">
                        <span class="object-badge">${objectName}</span>
                        <span class="record-title">${displayName || 'Record Details'}</span>
                    </div>
                    <div class="record-detail-row">
                        <span class="record-detail-label">Record ID</span>
                        <span class="record-detail-value">
                            <code>${recordId}</code>
                            <button class="copy-btn" data-copy="${recordId}" title="Copy ID">📋</button>
                        </span>
                    </div>`;

                if (displayName) {
                    html += `<div class="record-detail-row">
                        <span class="record-detail-label">Name</span>
                        <span class="record-detail-value">${displayName}</span>
                    </div>`;
                }

                // Get Created By (handle both formats)
                const createdById = fields['CreatedById'];
                if (createdById) {
                    const createdByValue = createdById.value !== undefined ? createdById.value : createdById;
                    if (createdByValue) {
                        html += `<div class="record-detail-row">
                            <span class="record-detail-label">Created By</span>
                            <span class="record-detail-value">${createdByValue}</span>
                        </div>`;
                    }
                }

                // Get Last Modified Date (handle both formats)
                const lastModDate = fields['LastModifiedDate'];
                if (lastModDate) {
                    const lastModValue = lastModDate.value !== undefined ? lastModDate.value : lastModDate;
                    if (lastModValue) {
                        const modDate = new Date(lastModValue);
                        html += `<div class="record-detail-row">
                            <span class="record-detail-label">Last Modified</span>
                            <span class="record-detail-value">${modDate.toLocaleString()}</span>
                        </div>`;
                    }
                }

                // Developer Info Section
                html += `<div class="dev-info-section">`;

                // Key Prefix
                const keyPrefix = recordId.substring(0, 3);
                html += `<div class="dev-info-row">
                    <span class="dev-info-label">Key Prefix</span>
                    <span class="dev-info-value">${keyPrefix}</span>
                </div>`;

                // Record ID (15 char)
                const id15 = recordId.length === 18 ? recordId.substring(0, 15) : recordId;
                html += `<div class="dev-info-row">
                    <span class="dev-info-label">15-char ID</span>
                    <span class="dev-info-value">${id15}</span>
                </div>`;

                // Created Date if available (handle both formats)
                const createdDateField = fields['CreatedDate'];
                if (createdDateField) {
                    const createdDateValue = createdDateField.value !== undefined ? createdDateField.value : createdDateField;
                    if (createdDateValue) {
                        const createdDate = new Date(createdDateValue);
                        html += `<div class="dev-info-row">
                            <span class="dev-info-label">Created</span>
                            <span class="dev-info-value">${createdDate.toLocaleDateString()}</span>
                        </div>`;
                    }
                }

                // Owner ID if available (handle both formats)
                const ownerIdField = fields['OwnerId'];
                if (ownerIdField) {
                    const ownerIdValue = ownerIdField.value !== undefined ? ownerIdField.value : ownerIdField;
                    if (ownerIdValue) {
                        html += `<div class="dev-info-row">
                            <span class="dev-info-label">Owner</span>
                            <span class="dev-info-value">${ownerIdValue}</span>
                        </div>`;
                    }
                }

                // Record Type if available (handle both formats)
                const recordTypeField = fields['RecordTypeId'];
                if (recordTypeField) {
                    const recordTypeValue = recordTypeField.value !== undefined ? recordTypeField.value : recordTypeField;
                    if (recordTypeValue) {
                        html += `<div class="dev-info-row">
                            <span class="dev-info-label">Record Type</span>
                            <span class="dev-info-value">${recordTypeValue}</span>
                        </div>`;
                    }
                }

                // Show if SOQL fallback was used
                if (usedFallback) {
                    html += `<div class="dev-info-row">
                        <span class="dev-info-label">Source</span>
                        <span class="dev-info-value" style="color:#868e96;">SOQL (UI API N/A)</span>
                    </div>`;
                }

                html += `</div>`;

                // Show any error or note from the SOQL fallback
                if (response._error) {
                    html += `<div class="info-message" style="margin:10px 14px;border-radius:6px;">${response._error}</div>`;
                } else if (response._note) {
                    html += `<div class="info-message" style="margin:10px 14px;border-radius:6px;">${response._note}</div>`;
                }

                // Action buttons - Compact
                html += `<div class="record-actions-bar">
                    <button class="btn btn-secondary btn-xs open-record-btn" data-record-id="${recordId}">🔗 Open</button>
                    <button class="btn btn-secondary btn-xs copy-link-btn" data-record-id="${recordId}">📋 Link</button>
                    <button class="btn btn-secondary btn-xs copy-id-btn" data-record-id="${recordId}">📋 ID</button>
                </div>`;

                html += '</div>';
                container.innerHTML = html;

                // Store current record for dev tools
                this._currentRecordId = recordId;
                this._currentRecordObject = objectName;
                this._currentRecordResponse = response;

                // Show record-specific tools
                const toolsSection = document.getElementById('record-specific-tools');
                if (toolsSection) toolsSection.style.display = 'block';

                // Add copy button listeners
                container.querySelectorAll('.copy-btn').forEach(btn => {
                    btn.addEventListener('click', (e) => {
                        e.stopPropagation();
                        const text = btn.dataset.copy;
                        navigator.clipboard.writeText(text).then(() => {
                            btn.classList.add('copied');
                            btn.textContent = '✓';
                            setTimeout(() => {
                                btn.classList.remove('copied');
                                btn.textContent = '📋';
                            }, 1500);
                        });
                    });
                });

                // Add action button listeners
                const openBtn = container.querySelector('.open-record-btn');
                if (openBtn) {
                    openBtn.addEventListener('click', () => this.openRecordInSalesforce(recordId));
                }

                const copyLinkBtn = container.querySelector('.copy-link-btn');
                if (copyLinkBtn) {
                    copyLinkBtn.addEventListener('click', () => this.copyRecordLink(recordId));
                }

                const copyIdBtn = container.querySelector('.copy-id-btn');
                if (copyIdBtn) {
                    copyIdBtn.addEventListener('click', async () => {
                        await navigator.clipboard.writeText(recordId);
                        copyIdBtn.textContent = '✓ ID';
                        setTimeout(() => { copyIdBtn.textContent = '📋 ID'; }, 1500);
                    });
                }

                // Add to history
                this.addToRecordHistory({
                    recordId,
                    objectName,
                    displayName,
                    timestamp: Date.now()
                });

                // Load Field History and Related Records for Record Scanner
                this.loadFieldHistory(recordId, objectName);
                this.loadRelatedRecords(recordId, objectName);

                // Show history tools
                const historyTools = document.getElementById('history-tools');
                if (historyTools) historyTools.style.display = 'block';

            } else {
                // Response exists but no apiName - might be an error response
                let errorMessage = 'Could not retrieve details. The record may not exist or you may lack permissions.';

                // Check if response contains error information
                if (response && response.errorCode) {
                    errorMessage = response.message || response.errorCode;
                } else if (response && Array.isArray(response) && response[0]?.message) {
                    errorMessage = response[0].message;
                } else if (response && response.error) {
                    errorMessage = response.error;
                }

                container.innerHTML = `<div class="record-detail-card">
                    <div class="record-detail-row">
                        <span class="record-detail-label">ID</span>
                        <span class="record-detail-value"><code>${recordId}</code></span>
                    </div>
                    <div class="info-message" style="margin-top:8px;">${errorMessage}</div>
                </div>`;
            }
        } catch (e) {
            // Build a meaningful error message - handle various error formats
            let errorMessage = 'Unable to fetch record details';

            // Try to extract error message from various formats safely
            try {
                if (e) {
                    if (typeof e === 'string' && e.length > 0 && e.toLowerCase() !== 'error') {
                        errorMessage = e;
                    } else if (e instanceof Error) {
                        // Handle standard Error objects - but filter out generic "Error" messages
                        const msg = e.message || '';
                        if (msg && msg.toLowerCase() !== 'error' && msg.length > 5) {
                            errorMessage = msg;
                        } else if (e.stack && e.stack.includes('Not connected')) {
                            errorMessage = 'Not connected';
                        }
                    } else if (typeof e.message === 'string' && e.message.length > 0 && e.message.toLowerCase() !== 'error') {
                        errorMessage = e.message;
                    } else if (typeof e.error === 'string' && e.error.length > 0) {
                        errorMessage = e.error;
                    } else if (e.errorCode) {
                        errorMessage = (typeof e.errorMessage === 'string' ? e.errorMessage : null) || e.errorCode;
                    } else if (e.body && typeof e.body.message === 'string') {
                        errorMessage = e.body.message;
                    } else if (typeof e.statusText === 'string' && e.statusText.length > 0) {
                        errorMessage = e.statusText;
                    } else if (Array.isArray(e) && e[0] && typeof e[0].message === 'string') {
                        errorMessage = e[0].message;
                    }
                }
            } catch (extractErr) {
                console.error('Error extracting error message:', extractErr);
                errorMessage = 'Unable to fetch record details';
            }

            // Ensure errorMessage is definitely a string before using string methods
            if (typeof errorMessage !== 'string' || !errorMessage || errorMessage.toLowerCase() === 'error') {
                errorMessage = 'Unable to fetch record details. Please check your Salesforce connection.';
            }

            // Make error messages more user-friendly using safe lowercase comparison
            const lowerMsg = errorMessage.toLowerCase();
            if (lowerMsg.includes('not connected') || lowerMsg === 'unable to fetch record details') {
                errorMessage = 'Not connected to Salesforce. Please ensure you have an active Salesforce tab open and you are logged in.';
            } else if (lowerMsg.includes('unauthorized') || lowerMsg.includes('401') || lowerMsg.includes('403')) {
                errorMessage = 'Access denied. You may not have permission to view this record.';
            } else if (lowerMsg.includes('404') || lowerMsg.includes('not found')) {
                errorMessage = 'Record not found. The record may have been deleted or the ID is incorrect.';
            } else if (lowerMsg.includes('invalid_session') || lowerMsg.includes('session expired')) {
                errorMessage = 'Session expired. Please refresh your Salesforce tab and try again.';
            } else if (lowerMsg.includes('insufficient_access') || lowerMsg.includes('insufficient access')) {
                errorMessage = 'Insufficient access. You do not have permission to view this record.';
            }

            console.error('Error identifying record:', e);

            // Show a user-friendly error card with the record ID and helpful message
            const keyPrefix = recordId.substring(0, 3);
            const objectName = this._keyPrefixMap[keyPrefix] || `Unknown (${keyPrefix}...)`;

            container.innerHTML = `<div class="record-detail-card">
                <div class="record-card-header">
                    <span class="object-badge">${objectName}</span>
                    <span class="record-title">Record Scan Failed</span>
                </div>
                <div class="record-detail-row">
                    <span class="record-detail-label">Record ID</span>
                    <span class="record-detail-value">
                        <code>${recordId}</code>
                        <button class="copy-btn" data-copy="${recordId}" title="Copy ID">📋</button>
                    </span>
                </div>
                <div class="dev-info-section">
                    <div class="dev-info-row">
                        <span class="dev-info-label">Key Prefix</span>
                        <span class="dev-info-value">${keyPrefix}</span>
                    </div>
                    <div class="dev-info-row">
                        <span class="dev-info-label">15-char ID</span>
                        <span class="dev-info-value">${recordId.length === 18 ? recordId.substring(0, 15) : recordId}</span>
                    </div>
                </div>
                <div class="error-message" style="margin:10px 14px;border-radius:6px;">${errorMessage}</div>
                <div class="record-actions-bar">
                    <button class="btn btn-secondary btn-xs open-record-btn" data-record-id="${recordId}">🔗 Try Open</button>
                    <button class="btn btn-secondary btn-xs copy-id-btn" data-record-id="${recordId}">📋 Copy ID</button>
                </div>
            </div>`;

            // Wire up buttons even in error state
            const openBtn = container.querySelector('.open-record-btn');
            if (openBtn) {
                openBtn.addEventListener('click', () => this.openRecordInSalesforce(recordId));
            }
            const copyIdBtn = container.querySelector('.copy-id-btn');
            if (copyIdBtn) {
                copyIdBtn.addEventListener('click', async () => {
                    await navigator.clipboard.writeText(recordId);
                    copyIdBtn.textContent = '✓ Copied';
                    setTimeout(() => { copyIdBtn.textContent = '📋 Copy ID'; }, 1500);
                });
            }
            const copyBtn = container.querySelector('.copy-btn');
            if (copyBtn) {
                copyBtn.addEventListener('click', async (e) => {
                    e.stopPropagation();
                    await navigator.clipboard.writeText(recordId);
                    copyBtn.textContent = '✓';
                    setTimeout(() => { copyBtn.textContent = '📋'; }, 1500);
                });
            }
        }
    },

    openRecordInSalesforce: async function(recordId) {
        try {
            // Get the Salesforce base URL - try multiple sources
            let baseUrl = null;

            // 1. Try to get from session (most reliable for popup/standalone)
            if (window.getSession && typeof window.getSession === 'function') {
                const session = window.getSession();
                if (session && session.instanceUrl) {
                    baseUrl = session.instanceUrl;
                }
            }

            // 2. Try to find a Salesforce tab
            if (!baseUrl) {
                let sfTab = null;
                if (window.Utils && typeof window.Utils.findSalesforceTab === 'function') {
                    sfTab = await window.Utils.findSalesforceTab();
                }

                if (!sfTab) {
                    // Fallback: query for SF tabs directly
                    const tabs = await chrome.tabs.query({
                        url: ['https://*.salesforce.com/*', 'https://*.force.com/*', 'https://*.salesforce-setup.com/*']
                    });
                    if (tabs && tabs.length > 0) {
                        sfTab = tabs.find(t => t.active) || tabs[0];
                    }
                }

                if (sfTab && sfTab.url) {
                    try {
                        const sfUrl = new URL(sfTab.url);
                        // Normalize to my.salesforce.com format
                        let host = sfUrl.host;
                        if (host.includes('lightning.force.com')) {
                            host = host.replace('.lightning.force.com', '.my.salesforce.com');
                        }
                        baseUrl = `${sfUrl.protocol}//${host}`;
                    } catch (e) {
                        console.warn('Error parsing SF tab URL:', e);
                    }
                }
            }

            // 3. Last resort - prompt user or use a generic domain
            if (!baseUrl) {
                console.warn('Could not determine Salesforce base URL');
                this.showNotification('Please open a Salesforce tab first', 'error');
                return;
            }

            const recordUrl = `${baseUrl}/lightning/r/sObject/${recordId}/view`;
            chrome.tabs.create({ url: recordUrl });
        } catch (e) {
            console.error('Error opening record:', e);
            this.showNotification('Error opening record: ' + e.message, 'error');
        }
    },

    copyRecordLink: async function(recordId) {
        try {
            // Get the Salesforce base URL - try multiple sources
            let baseUrl = null;

            // 1. Try to get from session (most reliable for popup/standalone)
            if (window.getSession && typeof window.getSession === 'function') {
                const session = window.getSession();
                if (session && session.instanceUrl) {
                    baseUrl = session.instanceUrl;
                }
            }

            // 2. Try to find a Salesforce tab
            if (!baseUrl) {
                let sfTab = null;
                if (window.Utils && typeof window.Utils.findSalesforceTab === 'function') {
                    sfTab = await window.Utils.findSalesforceTab();
                }

                if (!sfTab) {
                    // Fallback: query for SF tabs directly
                    const tabs = await chrome.tabs.query({
                        url: ['https://*.salesforce.com/*', 'https://*.force.com/*', 'https://*.salesforce-setup.com/*']
                    });
                    if (tabs && tabs.length > 0) {
                        sfTab = tabs.find(t => t.active) || tabs[0];
                    }
                }

                if (sfTab && sfTab.url) {
                    try {
                        const sfUrl = new URL(sfTab.url);
                        // Normalize to my.salesforce.com format
                        let host = sfUrl.host;
                        if (host.includes('lightning.force.com')) {
                            host = host.replace('.lightning.force.com', '.my.salesforce.com');
                        }
                        baseUrl = `${sfUrl.protocol}//${host}`;
                    } catch (e) {
                        console.warn('Error parsing SF tab URL:', e);
                    }
                }
            }

            // 3. If still no URL, show error
            if (!baseUrl) {
                console.warn('Could not determine Salesforce base URL');
                // Still copy a placeholder URL that user can fix
                const placeholderUrl = `https://YOUR_ORG.my.salesforce.com/lightning/r/sObject/${recordId}/view`;
                await navigator.clipboard.writeText(placeholderUrl);
                this.showNotification('Link copied (please update org domain)', 'warning');
                return;
            }

            const recordUrl = `${baseUrl}/lightning/r/sObject/${recordId}/view`;
            await navigator.clipboard.writeText(recordUrl);
            this.showNotification('Link copied to clipboard!', 'success');
        } catch (e) {
            console.error('Error copying link:', e);
            this.showNotification('Error copying link: ' + e.message, 'error');
        }
    },

    // ==========================================
    // RECORD HISTORY
    // ==========================================

    loadRecordHistory: async function() {
        try {
            const result = await chrome.storage.local.get('recordHistory');
            this._recordHistory = result.recordHistory || [];
            this.renderRecordHistory();
        } catch (e) {
            console.warn('Error loading record history:', e);
        }
    },

    addToRecordHistory: async function(record) {
        // Remove duplicate if exists
        this._recordHistory = this._recordHistory.filter(r => r.recordId !== record.recordId);

        // Add to beginning
        this._recordHistory.unshift(record);

        // Keep only max items
        if (this._recordHistory.length > this._maxHistoryItems) {
            this._recordHistory = this._recordHistory.slice(0, this._maxHistoryItems);
        }

        // Save to storage
        try {
            await chrome.storage.local.set({ recordHistory: this._recordHistory });
        } catch (e) {
            console.warn('Error saving record history:', e);
        }

        this.renderRecordHistory();
    },

    renderRecordHistory: function() {
        const container = document.getElementById('record-history-list');
        const countEl = document.getElementById('history-count');
        if (!container) return;

        if (!this._recordHistory || this._recordHistory.length === 0) {
            container.innerHTML = '<div class="placeholder-note">No recent records</div>';
            if (countEl) countEl.textContent = '';
            return;
        }

        // Update count
        if (countEl) countEl.textContent = `(${this._recordHistory.length})`;

        // Build vertical list UI
        let html = '';
        for (const record of this._recordHistory) {
            const shortType = this.getShortObjectName(record.objectName);
            const displayName = record.displayName || record.recordId.substring(0, 10) + '...';
            const timeAgo = this.getTimeAgo(record.timestamp);
            html += `<div class="record-history-item-v" data-record-id="${record.recordId}" title="${record.objectName}: ${record.displayName || record.recordId}">
                <span class="item-type">${shortType}</span>
                <div class="item-info">
                    <div class="item-name">${displayName}</div>
                    <div class="item-id">${record.recordId}</div>
                </div>
                <span class="item-time">${timeAgo}</span>
            </div>`;
        }
        container.innerHTML = html;

        // Add click listeners - clicking updates the Record Inspector panel
        container.querySelectorAll('.record-history-item-v').forEach(item => {
            item.addEventListener('click', () => {
                const recordId = item.dataset.recordId;

                // Update search input
                const searchInput = document.getElementById('record-search-input');
                if (searchInput) {
                    searchInput.value = recordId;
                }

                // Mark this item as selected
                container.querySelectorAll('.record-history-item-v').forEach(i => i.classList.remove('selected'));
                item.classList.add('selected');

                // Load record into inspector
                const recordContainer = document.getElementById('current-record-info');
                if (recordContainer) {
                    this.identifyRecord(recordId, recordContainer, false);
                }
            });
        });
    },

    getShortObjectName: function(objectName) {
        const shortNames = {
            'Account': 'Acc',
            'Contact': 'Con',
            'Opportunity': 'Opp',
            'Lead': 'Lead',
            'Case': 'Case',
            'Task': 'Task',
            'Event': 'Evt',
            'User': 'User',
            'Campaign': 'Cmp',
            'Contract': 'Ctr',
            'Order': 'Ord',
            'Product2': 'Prod',
            'Pricebook2': 'PB',
            'Quote': 'Qt'
        };
        return shortNames[objectName] || objectName.substring(0, 4);
    },

    clearRecordHistory: async function() {
        this._recordHistory = [];
        try {
            await chrome.storage.local.remove('recordHistory');
        } catch (e) {
            console.warn('Error clearing record history:', e);
        }
        this.renderRecordHistory();
    },

    getTimeAgo: function(timestamp) {
        const seconds = Math.floor((Date.now() - timestamp) / 1000);
        if (seconds < 60) return 'Just now';
        const minutes = Math.floor(seconds / 60);
        if (minutes < 60) return `${minutes}m ago`;
        const hours = Math.floor(minutes / 60);
        if (hours < 24) return `${hours}h ago`;
        const days = Math.floor(hours / 24);
        return `${days}d ago`;
    },

    // ==========================================
    // DEVELOPER TOOLS
    // ==========================================

    openSalesforceLink: async function(path) {
        try {
            let sfTab = null;
            if (window.Utils && typeof window.Utils.findSalesforceTab === 'function') {
                sfTab = await window.Utils.findSalesforceTab();
            }
            if (!sfTab) {
                const tabs = await chrome.tabs.query({ url: ['https://*.salesforce.com/*', 'https://*.force.com/*'] });
                sfTab = tabs?.[0];
            }
            if (sfTab && sfTab.url) {
                const urlObj = new URL(sfTab.url);
                const baseUrl = `${urlObj.protocol}//${urlObj.host}`;
                chrome.tabs.create({ url: `${baseUrl}${path}` });
            } else {
                this.showNotification('No Salesforce tab found', 'error');
            }
        } catch (e) {
            console.error('Error opening Salesforce link:', e);
        }
    },

    openDevConsole: async function() {
        try {
            let sfTab = null;
            if (window.Utils && typeof window.Utils.findSalesforceTab === 'function') {
                sfTab = await window.Utils.findSalesforceTab();
            }
            if (!sfTab) {
                const tabs = await chrome.tabs.query({ url: ['https://*.salesforce.com/*', 'https://*.force.com/*'] });
                sfTab = tabs?.[0];
            }
            if (sfTab && sfTab.url) {
                const urlObj = new URL(sfTab.url);
                const baseUrl = `${urlObj.protocol}//${urlObj.host}`;
                // Developer console opens in a popup window
                chrome.windows.create({
                    url: `${baseUrl}/_ui/common/apex/debug/ApexCSIPage`,
                    type: 'popup',
                    width: 1200,
                    height: 800
                });
            }
        } catch (e) {
            console.error('Error opening Developer Console:', e);
        }
    },

    openObjectSetup: async function() {
        if (!this._currentRecordObject) {
            this.showNotification('No record loaded', 'error');
            return;
        }
        const objectName = this._currentRecordObject;
        // For standard objects, use ObjectManager path
        this.openSalesforceLink(`/lightning/setup/ObjectManager/${objectName}/Details/view`);
    },

    queryCurrentRecord: async function() {
        if (!this._currentRecordId || !this._currentRecordObject) {
            this.showNotification('No record loaded', 'error');
            return;
        }
        // Build a basic SOQL query
        const query = `SELECT Id, Name FROM ${this._currentRecordObject} WHERE Id = '${this._currentRecordId}'`;

        // Try to switch to SOQL tab and populate
        const soqlTab = document.querySelector('[data-tab="soql"]');
        if (soqlTab) {
            soqlTab.click();
            // Give it a moment to switch, then populate
            setTimeout(() => {
                const queryInput = document.getElementById('soql-query') || document.getElementById('soql-manual-query');
                if (queryInput) {
                    queryInput.value = query;
                }
            }, 100);
        }
    },

    copyRecordSOQL: async function() {
        if (!this._currentRecordId || !this._currentRecordObject) {
            this.showNotification('No record loaded', 'error');
            return;
        }
        const query = `SELECT Id, Name FROM ${this._currentRecordObject} WHERE Id = '${this._currentRecordId}'`;
        try {
            await navigator.clipboard.writeText(query);
            this.showNotification('SOQL query copied!', 'success');
            // Visual feedback
            const btn = document.getElementById('btn-copy-soql');
            if (btn) {
                btn.textContent = '✓ Copied';
                setTimeout(() => { btn.textContent = '📋 Copy Query'; }, 1500);
            }
        } catch (e) {
            console.error('Error copying SOQL:', e);
        }
    },

    viewRecordAPI: async function() {
        if (!this._currentRecordId) {
            this.showNotification('No record loaded', 'error');
            return;
        }
        // Open the UI API record endpoint in a new tab
        this.openSalesforceLink(`/services/data/v60.0/ui-api/records/${this._currentRecordId}`);
    },

    // ==========================================
    // FIELD HISTORY (Record Scanner)
    // ==========================================

    // Cache for field history data
    _fieldHistoryCache: {},

    /**
     * Load field history for the current record
     * Queries {ObjectName}History or {ObjectName}__History tables
     */
    loadFieldHistory: async function(recordId, objectName) {
        const container = document.getElementById('field-history-list');
        if (!container) return;

        container.innerHTML = '<div class="loading-note">Loading field history...</div>';

        try {
            // Determine the history object name
            // Standard objects: AccountHistory, ContactHistory, etc.
            // Custom objects: CustomObject__History
            const historyObjectName = this.getHistoryObjectName(objectName);

            if (!historyObjectName) {
                container.innerHTML = '<div class="info-note">Field history tracking not available for this object type.</div>';
                return;
            }

            // Check if the history object exists and is queryable
            const historyExists = await this.checkHistoryObjectExists(historyObjectName);
            if (!historyExists) {
                container.innerHTML = `<div class="info-note">Field history tracking is not enabled for ${objectName}. Enable it in Setup → Object Manager → ${objectName} → Fields & Relationships.</div>`;
                return;
            }

            // Determine the parent ID field name
            // Standard objects use {ObjectName}Id (e.g., AccountId for AccountHistory)
            // Custom objects use ParentId
            let parentIdField;
            if (objectName.endsWith('__c')) {
                parentIdField = 'ParentId';
            } else {
                parentIdField = objectName + 'Id';
            }

            // Try to query field history with the determined field
            // If that fails, try alternative field names
            let result = null;
            const fieldAttempts = [parentIdField, 'ParentId', objectName + 'Id'];
            const uniqueAttempts = [...new Set(fieldAttempts)]; // Remove duplicates

            for (const fieldName of uniqueAttempts) {
                try {
                    const query = `SELECT Id, Field, OldValue, NewValue, CreatedById, CreatedBy.Name, CreatedDate 
                                  FROM ${historyObjectName} 
                                  WHERE ${fieldName} = '${recordId}' 
                                  ORDER BY CreatedDate DESC 
                                  LIMIT 20`;
                    result = await PlatformHelper.executeQuery(query);
                    if (result && result.records) {
                        break; // Success, exit loop
                    }
                } catch (queryError) {
                    console.warn(`History query with ${fieldName} failed:`, queryError.message);
                    // Continue to try next field name
                }
            }

            if (!result || !result.records || result.records.length === 0) {
                container.innerHTML = '<div class="info-note">No field history changes found for this record.</div>';
                return;
            }

            // Store in cache
            this._fieldHistoryCache[recordId] = result.records;

            // Render field history
            this.renderFieldHistory(result.records, container);

        } catch (e) {
            console.error('Error loading field history:', e);
            const errorMsg = e.message || 'Unknown error';

            // Check for common errors
            if (errorMsg.includes('does not exist') || errorMsg.includes('invalid') || errorMsg.includes('INVALID_TYPE')) {
                container.innerHTML = `<div class="info-note">Field history tracking is not enabled for ${objectName}.</div>`;
            } else if (errorMsg.includes('INVALID_FIELD') || errorMsg.includes('No such column')) {
                container.innerHTML = '<div class="info-note">Unable to query field history. The history object may have a different structure.</div>';
            } else {
                container.innerHTML = `<div class="error-note">Error loading history: ${errorMsg}</div>`;
            }
        }
    },

    /**
     * Get the history object name for a given object
     */
    getHistoryObjectName: function(objectName) {
        if (!objectName) return null;

        // Standard objects with history tracking support
        const standardHistoryObjects = [
            'Account', 'Contact', 'Lead', 'Opportunity', 'Case', 'Contract',
            'Solution', 'Asset', 'Campaign', 'Order', 'Quote', 'Product2',
            'Pricebook2', 'Task', 'Event'
        ];

        if (standardHistoryObjects.includes(objectName)) {
            return `${objectName}History`;
        }

        // Custom objects use __History suffix
        if (objectName.endsWith('__c')) {
            return objectName.replace('__c', '__History');
        }

        // Person accounts
        if (objectName === 'PersonAccount') {
            return 'AccountHistory';
        }

        // Some objects don't support field history
        const noHistoryObjects = ['User', 'Profile', 'Group', 'Organization', 'ContentDocument', 'ContentVersion'];
        if (noHistoryObjects.includes(objectName)) {
            return null;
        }

        // Try standard format for other objects
        return `${objectName}History`;
    },

    /**
     * Check if a history object exists and is queryable
     */
    checkHistoryObjectExists: async function(historyObjectName) {
        try {
            const apiSel = document.getElementById('api-version');
            const v = (apiSel && apiSel.value) ? apiSel.value : '63.0';
            const result = await PlatformHelper.fetchFromSalesforce(`/services/data/v${v}/sobjects/${historyObjectName}/describe`);
            return result && result.name === historyObjectName;
        } catch (e) {
            return false;
        }
    },

    /**
     * Render field history items
     */
    renderFieldHistory: function(records, container) {
        if (!records || records.length === 0) {
            container.innerHTML = '<div class="info-note">No field history changes found.</div>';
            return;
        }

        let html = '';
        for (const record of records) {
            const fieldName = record.Field || 'Unknown Field';
            const oldValue = record.OldValue !== null && record.OldValue !== undefined ? String(record.OldValue) : '(empty)';
            const newValue = record.NewValue !== null && record.NewValue !== undefined ? String(record.NewValue) : '(empty)';
            const createdByName = record.CreatedBy?.Name || record.CreatedById || 'Unknown';
            const createdDate = record.CreatedDate ? new Date(record.CreatedDate).toLocaleString() : 'Unknown date';

            // Format field name (convert API name to readable)
            const displayFieldName = this.formatFieldName(fieldName);

            html += `<div class="field-history-item">
                <div class="history-field-name">${displayFieldName}</div>
                <div class="history-change">
                    <span class="history-old-value" title="${this.escapeHtml(oldValue)}">${this.truncate(oldValue, 25)}</span>
                    <span class="history-arrow">→</span>
                    <span class="history-new-value" title="${this.escapeHtml(newValue)}">${this.truncate(newValue, 25)}</span>
                </div>
                <div class="history-meta">
                    <span class="history-user">👤 ${createdByName}</span>
                    <span class="history-date">📅 ${createdDate}</span>
                </div>
            </div>`;
        }

        container.innerHTML = html;
    },

    /**
     * Format field API name to readable format
     */
    formatFieldName: function(fieldName) {
        if (!fieldName) return 'Unknown';

        // Handle special field names
        if (fieldName === 'created') return 'Record Created';
        if (fieldName === 'feedEvent') return 'Feed Event';
        if (fieldName === 'ownerAccepted') return 'Owner Accepted';
        if (fieldName === 'ownerAssignment') return 'Owner Assignment';
        if (fieldName === 'locked') return 'Record Locked';
        if (fieldName === 'unlocked') return 'Record Unlocked';

        // Remove __c suffix for custom fields
        let name = fieldName.replace(/__c$/, '');

        // Split by underscores and camelCase
        name = name.replace(/_/g, ' ');
        name = name.replace(/([a-z])([A-Z])/g, '$1 $2');

        // Capitalize first letter of each word
        return name.split(' ').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
    },

    /**
     * Refresh field history
     */
    refreshFieldHistory: function() {
        if (this._currentRecordId && this._currentRecordObject) {
            // Clear cache
            delete this._fieldHistoryCache[this._currentRecordId];
            this.loadFieldHistory(this._currentRecordId, this._currentRecordObject);
        }
    },

    /**
     * Export field history to CSV
     */
    exportFieldHistory: function() {
        const records = this._fieldHistoryCache[this._currentRecordId];
        if (!records || records.length === 0) {
            this.showNotification('No field history to export', 'warning');
            return;
        }

        const headers = ['Field', 'Old Value', 'New Value', 'Changed By', 'Changed Date'];
        const rows = records.map(r => [
            r.Field || '',
            r.OldValue !== null ? String(r.OldValue) : '',
            r.NewValue !== null ? String(r.NewValue) : '',
            r.CreatedBy?.Name || r.CreatedById || '',
            r.CreatedDate || ''
        ]);

        const csv = [headers.join(','), ...rows.map(row => row.map(v => `"${String(v).replace(/"/g, '""')}"`).join(','))].join('\n');

        const blob = new Blob([csv], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `field-history-${this._currentRecordId}.csv`;
        a.click();
        URL.revokeObjectURL(url);

        this.showNotification('Field history exported!', 'success');
    },

    // ==========================================
    // RELATED RECORDS (Record Scanner)
    // ==========================================

    // Cache for related records data
    _relatedRecordsCache: {},

    /**
     * Load related records for the current record
     */
    loadRelatedRecords: async function(recordId, objectName) {
        const container = document.getElementById('related-records-list');
        if (!container) return;

        container.innerHTML = '<div class="loading-note">Loading related records...</div>';

        try {
            // Get object describe to find relationships
            const apiSel = document.getElementById('api-version');
            const v = (apiSel && apiSel.value) ? apiSel.value : '63.0';
            const describe = await PlatformHelper.fetchFromSalesforce(`/services/data/v${v}/sobjects/${objectName}/describe`);

            if (!describe || !describe.childRelationships) {
                container.innerHTML = '<div class="info-note">No related record information available for this object.</div>';
                return;
            }

            // Objects that don't support direct SOQL queries
            const nonQueryableObjects = [
                'ActivityHistory', 'ActivityHistories',
                'AttachedContentDocument', 'AttachedContentDocuments',
                'AttachedContentNote', 'AttachedContentNotes',
                'CombinedAttachment', 'CombinedAttachments',
                'ContentDocumentLink', // Often restricted
                'EmailStatus',
                'EventRelation',
                'TaskRelation',
                'OpenActivity', 'OpenActivities',
                'ProcessInstance', 'ProcessInstanceHistory',
                'TaskWhoRelation', 'TaskWhoRelations',
                'EventWhoRelation', 'EventWhoRelations',
                'Name', // Polymorphic Name object
                'NoteAndAttachment',
                'TopicAssignment',
                'UserRecordAccess',
                'Vote',
                'FeedTrackedChange',
                // Feed objects often have complex structures
                'AccountFeed', 'CaseFeed', 'ContactFeed', 'LeadFeed',
                'OpportunityFeed', 'UserFeed', 'CollaborationGroupFeed',
                'FeedItem', 'FeedComment', 'FeedLike', 'FeedRevision',
                // Share objects
                'AccountShare', 'CaseShare', 'ContactShare', 'LeadShare', 'OpportunityShare',
                // Team member objects can be complex
                'AccountTeamMember', 'CaseTeamMember', 'CaseTeamTemplateMember',
                // Entity subscriptions
                'EntitySubscription',
                // Duplicate rules
                'DuplicateRecordItem', 'DuplicateRecordSet'
            ];

            // Filter to meaningful relationships (ones with relationshipName)
            // and exclude non-queryable objects
            const relationships = describe.childRelationships
                .filter(r => r.relationshipName && r.childSObject &&
                            !nonQueryableObjects.includes(r.childSObject) &&
                            !r.childSObject.endsWith('History') && // Skip history objects (handled separately)
                            !r.childSObject.endsWith('__History') &&
                            !r.childSObject.endsWith('Feed') && // Skip all Feed objects
                            !r.childSObject.endsWith('Share')); // Skip all Share objects

            // Deduplicate by childSObject (same object might appear multiple times with different relationship names)
            const seenObjects = new Set();
            const uniqueRelationships = relationships.filter(r => {
                if (seenObjects.has(r.childSObject)) {
                    return false;
                }
                seenObjects.add(r.childSObject);
                return true;
            }).slice(0, 15); // Limit to avoid too many queries

            if (uniqueRelationships.length === 0) {
                container.innerHTML = '<div class="info-note">No queryable child relationships found for this object.</div>';
                return;
            }

            // Get counts for each relationship
            const relatedData = await this.fetchRelatedRecordCounts(recordId, objectName, uniqueRelationships);

            // Store in cache
            this._relatedRecordsCache[recordId] = relatedData;

            // Render related records
            this.renderRelatedRecords(relatedData, container, recordId);

        } catch (e) {
            console.error('Error loading related records:', e);
            container.innerHTML = `<div class="error-note">Error loading related records: ${e.message}</div>`;
        }
    },

    /**
     * Fetch counts for related records
     */
    fetchRelatedRecordCounts: async function(recordId, parentObject, relationships) {
        const results = [];

        for (const rel of relationships) {
            try {
                // Build count query
                const query = `SELECT COUNT() FROM ${rel.childSObject} WHERE ${rel.field} = '${recordId}'`;
                const result = await PlatformHelper.executeQuery(query);
                const count = result?.totalSize || 0;

                results.push({
                    relationshipName: rel.relationshipName,
                    childObject: rel.childSObject,
                    field: rel.field,
                    count: count,
                    label: this.formatObjectName(rel.childSObject)
                });
            } catch (e) {
                // Some relationships may not be queryable, skip them
                console.warn(`Could not query ${rel.childSObject}:`, e.message);
            }
        }

        // Sort by count (descending) then by name
        results.sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));

        return results;
    },

    /**
     * Render related records groups
     */
    renderRelatedRecords: function(relatedData, container, recordId) {
        if (!relatedData || relatedData.length === 0) {
            container.innerHTML = '<div class="info-note">No related records found.</div>';
            return;
        }

        let html = '';
        for (const rel of relatedData) {
            const countClass = rel.count === 0 ? 'zero' : '';
            html += `<div class="related-record-group" data-relationship="${rel.relationshipName}" data-object="${rel.childObject}" data-field="${rel.field}" data-parent-id="${recordId}">
                <div class="related-record-header">
                    <span class="related-record-name">
                        ${rel.label}
                    </span>
                    <span class="related-record-count ${countClass}">${rel.count}</span>
                </div>
                <div class="related-record-items">
                    <div class="loading-note">Loading...</div>
                </div>
            </div>`;
        }

        container.innerHTML = html;

        // Add click listeners to expand/collapse and load items
        container.querySelectorAll('.related-record-group').forEach(group => {
            const header = group.querySelector('.related-record-header');
            header.addEventListener('click', () => this.toggleRelatedRecordGroup(group));
        });
    },

    /**
     * Toggle a related record group expansion
     */
    toggleRelatedRecordGroup: async function(group) {
        const isExpanded = group.classList.contains('expanded');

        if (isExpanded) {
            group.classList.remove('expanded');
            return;
        }

        // Expand and load items if not already loaded
        group.classList.add('expanded');

        const itemsContainer = group.querySelector('.related-record-items');
        const childObject = group.dataset.object;
        const field = group.dataset.field;
        const parentId = group.dataset.parentId;

        // Check if already loaded
        if (itemsContainer.dataset.loaded === 'true') {
            return;
        }

        try {
            // Query actual records (limit to 5 for preview)
            const nameField = await this.getNameFieldForObject(childObject);
            const query = `SELECT Id, ${nameField} FROM ${childObject} WHERE ${field} = '${parentId}' ORDER BY ${nameField} LIMIT 5`;
            const result = await PlatformHelper.executeQuery(query);

            if (!result || !result.records || result.records.length === 0) {
                itemsContainer.innerHTML = '<div class="placeholder-note">No records found</div>';
            } else {
                let html = '';
                for (const record of result.records) {
                    const displayName = record[nameField] || record.Name || record.Id;
                    html += `<div class="related-record-item" data-record-id="${record.Id}">
                        <span class="item-name" title="Click to scan this record">${displayName}</span>
                        <span class="item-id">${record.Id.substring(0, 10)}...</span>
                    </div>`;
                }

                // Add "View more" link if there might be more records
                if (result.totalSize > 5) {
                    html += `<div class="view-more-link" data-object="${childObject}" data-field="${field}" data-parent-id="${parentId}">
                        View all ${result.totalSize} records →
                    </div>`;
                }

                itemsContainer.innerHTML = html;

                // Add click listeners to load individual records
                itemsContainer.querySelectorAll('.related-record-item').forEach(item => {
                    item.querySelector('.item-name').addEventListener('click', () => {
                        const recId = item.dataset.recordId;
                        const searchInput = document.getElementById('record-search-input');
                        if (searchInput) searchInput.value = recId;
                        this.searchRecord();
                    });
                });

                // Add view more listener
                const viewMore = itemsContainer.querySelector('.view-more-link');
                if (viewMore) {
                    viewMore.addEventListener('click', () => {
                        // Open related list in Salesforce
                        this.openSalesforceLink(`/lightning/r/${this._currentRecordObject}/${parentId}/related/${group.dataset.relationship}/view`);
                    });
                }
            }

            itemsContainer.dataset.loaded = 'true';
        } catch (e) {
            console.error('Error loading related records:', e);
            itemsContainer.innerHTML = `<div class="error-note">Error: ${e.message}</div>`;
        }
    },

    /**
     * Get the Name field for an object (handles objects without standard Name field)
     */
    getNameFieldForObject: async function(objectName) {
        // Common objects with non-standard name fields
        const nameFieldMap = {
            'Case': 'CaseNumber',
            'Task': 'Subject',
            'Event': 'Subject',
            'ContentDocument': 'Title',
            'ContentVersion': 'Title',
            'EmailMessage': 'Subject',
            'Attachment': 'Name',
            'Note': 'Title',
            'FeedItem': 'Body',
            'FeedComment': 'CommentBody',
            'CaseFeed': 'Body',
            'AccountFeed': 'Body',
            'ContactFeed': 'Body',
            'LeadFeed': 'Body',
            'OpportunityFeed': 'Body',
            'CollaborationGroupFeed': 'Body',
            'UserFeed': 'Body',
            'CaseComment': 'CommentBody',
            'Solution': 'SolutionName',
            'Contract': 'ContractNumber',
            'Order': 'OrderNumber',
            'Quote': 'QuoteNumber',
            'Invoice': 'InvoiceNumber',
            'CampaignMember': 'Id',
            'OpportunityLineItem': 'Id',
            'OrderItem': 'Id',
            'QuoteLineItem': 'Id',
            'PricebookEntry': 'Id',
            'AccountContactRelation': 'Id',
            'CaseTeamMember': 'Id',
            'OpportunityTeamMember': 'Id'
        };

        if (nameFieldMap[objectName]) {
            return nameFieldMap[objectName];
        }

        // Handle any Feed object (ends with Feed)
        if (objectName.endsWith('Feed')) {
            return 'Body';
        }

        // Default to Name field
        return 'Name';
    },

    /**
     * Format object API name to readable format
     */
    formatObjectName: function(objectName) {
        if (!objectName) return 'Unknown';

        // Remove __c suffix for custom objects
        let name = objectName.replace(/__c$/, ' (Custom)');

        // Handle __r relationship names
        name = name.replace(/__r$/, '');

        // Split by underscores and camelCase
        name = name.replace(/_/g, ' ');
        name = name.replace(/([a-z])([A-Z])/g, '$1 $2');

        return name;
    },

    // ==========================================
    // UTILITIES
    // ==========================================

    /**
     * Truncate string with ellipsis
     */
    truncate: function(str, maxLength) {
        if (!str) return str;
        str = String(str);
        if (str.length <= maxLength) return str;
        return str.substring(0, maxLength) + '...';
    },

    /**
     * Escape HTML special characters
     */
    escapeHtml: function(str) {
        if (!str) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    },

    showNotification: function(message, type) {
        // Simple notification - could be enhanced
        console.log(`[${type}] ${message}`);
        // Try to use Utils toast if available
        try {
            if (window.Utils && window.Utils.showToast) {
                window.Utils.showToast(message, type);
            }
        } catch (e) {}
    }
};

// Expose globally
window.DataExplorerHelper = DataExplorerHelper;

