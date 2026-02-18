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
    _currentOrgData: null, // Full org record from query
    _profiles: [],
    _roles: [],
    _languages: [],
    _recordHistory: [],
    _maxHistoryItems: 5,

    // New state for 3-column Org & Favicon layout
    _selectedOrgId: null, // Currently selected org in the list (for editing)
    _savedOrgs: {}, // Cached saved orgs from storage
    _draftIconConfig: null, // Draft icon config being edited (not yet applied)
    _appliedIconConfig: null, // Currently applied icon config for selected org
    _orgSearchQuery: '', // Search query for filtering orgs list
    _detectedOrgs: {}, // Multi-org support: all detected orgs from open tabs

    /**
     * CRITICAL: Reset all in-memory data
     * Called on every app startup to clear leftover org data
     * This is essential for org switching to work properly
     */
    resetAllData: function() {
        console.log('🔥 DataExplorerHelper: Resetting all in-memory data');
        this._currentUserId = null;
        this._selectedUserId = null;
        this._currentOrgId = null;
        this._currentOrgName = null;
        this._currentOrgData = null;
        this._profiles = [];
        this._roles = [];
        this._languages = [];
        this._recordHistory = [];
        // Reset new org/favicon state
        this._selectedOrgId = null;
        this._savedOrgs = {};
        this._draftIconConfig = null;
        this._appliedIconConfig = null;
        this._orgSearchQuery = '';
        this._detectedOrgs = {};
        console.log('✅ DataExplorerHelper: All data reset complete');
    },

    init: function() {
        if (this._initialized) return;
        this._initialized = true;
        console.log("Initializing Data Explorer...");

        // CRITICAL: Reset all in-memory data on every startup
        // This ensures old org data is NOT carried forward
        this.resetAllData();

        // CRITICAL: Load org info immediately to set up CacheManager properly
        // This ensures we clear caches if switching orgs
        this.loadOrgInfo().catch(e => {
            console.warn('Error loading org info on init:', e);
        });

        this.wireEvents();

         // Apply display settings (column widths)
        this.applyAuditDisplaySettings();
        document.addEventListener('audit-display-settings-changed', () => {
             this.applyAuditDisplaySettings();
        });

        // Load the default active sub-tab for Data Explorer (Record Scanner)
        const activeBtn = document.querySelector('#tab-data .sub-tab-button.active');
        if (activeBtn) {
            this.switchSubTab(activeBtn.dataset.subtab);
        }

        // Wire Settings sub-tabs
        this.wireSettingsSubTabs();
    },

    wireSettingsSubTabs: function() {
        // Wire Settings sub-tab switching
        const settingsSubTabButtons = document.querySelectorAll('#tab-settings .sub-tab-button');
        settingsSubTabButtons.forEach(btn => {
            btn.addEventListener('click', (e) => {
                this.switchSettingsSubTab(e.target.dataset.subtab);
            });
        });
    },

    switchSettingsSubTab: function(subTabId) {
        // Update buttons in Settings
        const buttons = document.querySelectorAll('#tab-settings .sub-tab-button');
        buttons.forEach(btn => {
            if (btn.dataset.subtab === subTabId) {
                btn.classList.add('active');
                btn.setAttribute('aria-selected', 'true');
            } else {
                btn.classList.remove('active');
                btn.setAttribute('aria-selected', 'false');
            }
        });

        // Update content panes in Settings
        const panes = document.querySelectorAll('#tab-settings .sub-tab-content');
        panes.forEach(pane => {
            if (pane.id === `subtab-${subTabId}`) {
                pane.hidden = false;
                pane.classList.add('active');
            } else {
                pane.hidden = true;
                pane.classList.remove('active');
            }
        });
    },

    wireEvents: function() {
        // Wire sub-tab switching
        const subTabButtons = document.querySelectorAll('#tab-data .sub-tab-button');
        subTabButtons.forEach(btn => {
            btn.addEventListener('click', (e) => {
                this.switchSubTab(e.target.dataset.subtab);
            });
        });

        // NEW 3-COLUMN ORG & FAVICON LAYOUT EVENTS
        this.wireOrgFaviconEventsV2();

        // Legacy: Sandbox & Favicon Manager - Wire up events for both Settings tab and Data Explorer tab
        this.wireFaviconEventsDataExplorer('-data'); // Data Explorer tab (suffixed IDs)
        this.wireFaviconEventsSettings(); // Settings tab (legacy IDs)

        // Refresh Org Info buttons (both tabs)
        const refreshOrgBtn = document.getElementById('refresh-org-btn');
        const refreshOrgBtnData = document.getElementById('refresh-org-btn-data');
        if (refreshOrgBtn) {
            refreshOrgBtn.addEventListener('click', () => this.loadOrgInfo());
        }
        if (refreshOrgBtnData) {
            refreshOrgBtnData.addEventListener('click', () => this.loadOrgInfo());
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

        const userResetPasswordBtn = document.getElementById('user-reset-password-btn');
        if (userResetPasswordBtn) {
            userResetPasswordBtn.addEventListener('click', () => this.resetUserPassword());
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

    applyAuditDisplaySettings: async function() {
        const { auditFaviconColumnWidth = 40 } = await chrome.storage?.local?.get?.({
            auditFaviconColumnWidth: 40
        }) || {};

        const favWidth = parseInt(auditFaviconColumnWidth) || 40;


        // Apply favicon width via dynamic style injection
        // This is more efficient than iterating elements and handles future elements
        let styleTag = document.getElementById('dynamic-audit-display-styles');
        if (!styleTag) {
            styleTag = document.createElement('style');
            styleTag.id = 'dynamic-audit-display-styles';
            document.head.appendChild(styleTag);
        }

        // Set dynamic styles for favicon width
        // Adjust canvas size to fit within the container
        const canvasSize = Math.max(16, favWidth - 4);
        styleTag.textContent = `
            .org-item-icon { width: ${favWidth}px !important; }
            .org-item-icon canvas { width: ${canvasSize}px !important; height: ${canvasSize}px !important; }
        `;
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

    // Wire up favicon events for a specific suffix ('' for Settings, '-data' for Data Explorer)
    wireFaviconEvents: function(suffix) {
        const faviconColor = document.getElementById(`favicon-color${suffix}`);
        const faviconLabel = document.getElementById(`favicon-label${suffix}`);
        const faviconApply = document.getElementById(`apply-favicon-btn${suffix}`);
        const faviconSave = document.getElementById(`save-favicon-btn${suffix}`);
        const faviconReset = document.getElementById(`reset-favicon-btn${suffix}`);
        const faviconShapeOptions = document.querySelectorAll(`#favicon-shape-options${suffix} .shape-btn`);
        const faviconOrgSelect = document.getElementById(`favicon-org-select${suffix}`);
        const faviconColorPresets = document.querySelectorAll(`#favicon-color-presets${suffix} .color-preset`);

        if (faviconColor) {
            faviconColor.addEventListener('input', () => {
                this.updateFaviconPreview(suffix);
                this.updateColorPresetSelection(suffix);
            });
        }
        if (faviconLabel) {
            faviconLabel.addEventListener('input', () => this.updateFaviconPreview(suffix));
        }
        // Shape selection event listeners (button-based)
        faviconShapeOptions.forEach(btn => {
            btn.addEventListener('click', () => {
                // Remove active from siblings
                faviconShapeOptions.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                this.updateFaviconPreview(suffix);
            });
        });
        // Color preset click handlers
        faviconColorPresets.forEach(preset => {
            preset.addEventListener('click', () => this.selectColorPreset(preset.dataset.color, suffix));
        });
        if (faviconApply) {
            faviconApply.addEventListener('click', () => this.applyFavicon(suffix));
        }
        if (faviconSave) {
            faviconSave.addEventListener('click', () => this.applyFavicon(suffix));
        }
        if (faviconReset) {
            faviconReset.addEventListener('click', () => this.resetFavicon(suffix));
        }
        // Org selector for editing different orgs
        if (faviconOrgSelect) {
            faviconOrgSelect.addEventListener('change', () => this.onOrgSelectChange(suffix));
        }
    },

    // ==========================================
    // NEW 3-COLUMN ORG & FAVICON EVENTS (V2)
    // ==========================================

    wireOrgFaviconEventsV2: function() {
        // Add Current Org button (in header)
        const addOrgBtn = document.getElementById('add-current-org-btn');
        if (addOrgBtn) {
            addOrgBtn.addEventListener('click', () => this.addCurrentOrg());
        }

        // Add Current Org Hero Button (in empty state)
        const addOrgHeroBtn = document.getElementById('add-current-org-hero-btn');
        if (addOrgHeroBtn) {
            addOrgHeroBtn.addEventListener('click', () => this.addCurrentOrg());
        }

        // Org search input
        const orgSearchInput = document.getElementById('org-search-input');
        if (orgSearchInput) {
            orgSearchInput.addEventListener('input', (e) => {
                this._orgSearchQuery = e.target.value;
                this.renderSavedOrgsList();
            });
        }

        // Preset chips (V2, V3, V4, V5)
        const presetChipsV2 = document.querySelectorAll('#preset-chips .preset-chip-v2');
        const presetChipsV3 = document.querySelectorAll('#preset-chips .preset-chip-v3');
        const presetChipsV4 = document.querySelectorAll('#preset-chips .preset-btn');
        const presetChipsV5 = document.querySelectorAll('#preset-chips .env-btn-v5');
        presetChipsV2.forEach(chip => {
            chip.addEventListener('click', () => this.applyPresetV2(chip));
        });
        presetChipsV3.forEach(chip => {
            chip.addEventListener('click', () => this.applyPresetV3(chip));
        });
        presetChipsV4.forEach(chip => {
            chip.addEventListener('click', () => this.applyPresetV4(chip));
        });
        presetChipsV5.forEach(chip => {
            chip.addEventListener('click', () => this.applyPresetV5(chip));
        });

        // Color swatches (V2, V3, V4, V5)
        const colorSwatches = document.querySelectorAll('#favicon-color-presets-data .color-swatch');
        const colorSwatchesV3 = document.querySelectorAll('#favicon-color-presets-data .color-swatch-v3');
        const colorSwatchesV4 = document.querySelectorAll('#favicon-color-presets-data .swatch');
        const colorSwatchesV5 = document.querySelectorAll('#favicon-color-presets-data .swatch-v5');
        colorSwatches.forEach(swatch => {
            swatch.addEventListener('click', () => this.selectColorSwatch(swatch));
        });
        colorSwatchesV3.forEach(swatch => {
            swatch.addEventListener('click', () => this.selectColorSwatchV3(swatch));
        });
        colorSwatchesV4.forEach(swatch => {
            swatch.addEventListener('click', () => this.selectColorSwatchV4(swatch));
        });
        colorSwatchesV5.forEach(swatch => {
            swatch.addEventListener('click', () => this.selectColorSwatchV5(swatch));
        });

        // Preview background toggle
        const bgLightBtn = document.getElementById('preview-bg-light');
        const bgDarkBtn = document.getElementById('preview-bg-dark');
        if (bgLightBtn) {
            bgLightBtn.addEventListener('click', () => this.setPreviewBackgroundV4('light'));
        }
        if (bgDarkBtn) {
            bgDarkBtn.addEventListener('click', () => this.setPreviewBackgroundV4('dark'));
        }

        // Apply All Tabs toggle
        const applyAllToggle = document.getElementById('apply-all-tabs-toggle');
        if (applyAllToggle) {
            // Load saved preference
            chrome.storage.local.get('applyAllTabs').then(result => {
                applyAllToggle.checked = result.applyAllTabs || false;
            });
            applyAllToggle.addEventListener('change', (e) => {
                chrome.storage.local.set({ applyAllTabs: e.target.checked });
            });
        }

        // Save button (single primary action)
        const saveBtn = document.getElementById('save-org-icon-btn');
        if (saveBtn) {
            saveBtn.addEventListener('click', () => this.saveOrgAndIcon());
        }

        // Banner save button (same action as main save button)
        const bannerSaveBtn = document.getElementById('banner-save-btn');
        if (bannerSaveBtn) {
            bannerSaveBtn.addEventListener('click', () => this.saveOrgAndIcon());
        }

        // Reset button
        const resetBtn = document.getElementById('reset-favicon-btn-data');
        if (resetBtn) {
            resetBtn.addEventListener('click', () => this.resetToApplied());
        }

        // Show More button for org info (V3/V4)
        const showMoreBtn = document.getElementById('show-more-org-info');
        if (showMoreBtn) {
            showMoreBtn.addEventListener('click', () => this.toggleOrgInfoExpanded());
        }

        // Watch for changes to detect unsaved changes
        const colorInput = document.getElementById('favicon-color-data');
        const labelInput = document.getElementById('favicon-label-data');
        const shapeRadios = document.querySelectorAll('input[name="favicon-shape-data"]');

        if (colorInput) {
            colorInput.addEventListener('input', () => this.onIconConfigChangeV4());
        }
        if (labelInput) {
            labelInput.addEventListener('input', () => this.onIconConfigChangeV4());
        }
        shapeRadios.forEach(radio => {
            radio.addEventListener('change', () => this.onIconConfigChangeV4());
        });
    },

    // Apply preset V4 - clean, minimal
    applyPresetV4: function(chip) {
        const { color, label } = chip.dataset;

        // Update form values
        const colorInput = document.getElementById('favicon-color-data');
        const labelInput = document.getElementById('favicon-label-data');

        if (colorInput && color) colorInput.value = color;
        if (labelInput && label) labelInput.value = label;

        // Update preset chip selection visuals (V4)
        document.querySelectorAll('#preset-chips .preset-btn').forEach(c => {
            c.classList.toggle('active', c === chip);
        });

        // Update color swatch selection
        this.updateColorSwatchSelectionV4(color);

        // Update draft and preview
        this.onIconConfigChangeV4();
    },

    // Apply preset V5 - refactored layout with segmented control
    applyPresetV5: function(chip) {
        const { color, label } = chip.dataset;

        // Update form values
        const colorInput = document.getElementById('favicon-color-data');
        const labelInput = document.getElementById('favicon-label-data');

        if (colorInput && color) colorInput.value = color;
        if (labelInput && label) labelInput.value = label;

        // Update environment type selection visuals (V5)
        document.querySelectorAll('#preset-chips .env-btn-v5').forEach(c => {
            c.classList.toggle('active', c === chip);
        });

        // Update draft badge in preview
        const draftBadge = document.getElementById('preview-draft-badge');
        if (draftBadge && label) {
            draftBadge.textContent = label;
        }

        // Update color swatch selection
        this.updateColorSwatchSelectionV5(color);

        // Update draft and preview
        this.onIconConfigChangeV4();
    },

    // Select color swatch V4
    selectColorSwatchV4: function(swatch) {
        const color = swatch.dataset.color;
        const colorInput = document.getElementById('favicon-color-data');

        if (colorInput && color) {
            colorInput.value = color;
            this.updateColorSwatchSelectionV4(color);
            this.onIconConfigChangeV4();
        }
    },

    // Update color swatch selection visuals V4
    updateColorSwatchSelectionV4: function(color) {
        document.querySelectorAll('#favicon-color-presets-data .swatch').forEach(s => {
            s.classList.toggle('active', s.dataset.color === color);
        });
        // Also update V2/V3 swatches for compatibility
        document.querySelectorAll('#favicon-color-presets-data .color-swatch').forEach(s => {
            s.classList.toggle('active', s.dataset.color === color);
        });
        document.querySelectorAll('#favicon-color-presets-data .color-swatch-v3').forEach(s => {
            s.classList.toggle('active', s.dataset.color === color);
        });
    },

    // Select color swatch V5
    selectColorSwatchV5: function(swatch) {
        const color = swatch.dataset.color;
        const colorInput = document.getElementById('favicon-color-data');

        if (colorInput && color) {
            colorInput.value = color;
            this.updateColorSwatchSelectionV5(color);
            this.onIconConfigChangeV4();
        }
    },

    // Update color swatch selection visuals V5
    updateColorSwatchSelectionV5: function(color) {
        // Update V5 swatches
        document.querySelectorAll('#favicon-color-presets-data .swatch-v5').forEach(s => {
            s.classList.toggle('active', s.dataset.color === color);
        });
        // Also update V4 swatches for compatibility
        document.querySelectorAll('#favicon-color-presets-data .swatch').forEach(s => {
            s.classList.toggle('active', s.dataset.color === color);
        });
    },

    // Set preview background V4 (both cards)
    setPreviewBackgroundV4: function(mode) {
        const previewBodies = document.querySelectorAll('.preview-canvas, .preview-card-body-v3, .editing-preview-body, .preview-canvas-v5');
        const lightBtn = document.getElementById('preview-bg-light');
        const darkBtn = document.getElementById('preview-bg-dark');

        previewBodies.forEach(body => {
            body.classList.toggle('dark-bg', mode === 'dark');
        });

        if (lightBtn) lightBtn.classList.toggle('active', mode === 'light');
        if (darkBtn) darkBtn.classList.toggle('active', mode === 'dark');
    },

    // Called when any icon config input changes (V4)
    onIconConfigChangeV4: function() {
        this.updateDraftConfig();
        this.updateFaviconPreviewRadio('-data');
        this.updateUnsavedIndicatorV4();
        this.updateSaveButtonStateV4();

        // Mark draft preview as having changes
        const draftCard = document.getElementById('preview-card-draft');
        if (draftCard) {
            draftCard.classList.toggle('has-changes', this.hasUnsavedChanges());
        }

        // Update change dot
        const changeDot = document.getElementById('draft-status-badge');
        if (changeDot) {
            changeDot.classList.toggle('unsaved', this.hasUnsavedChanges());
        }

        // Persist draft config for pop-in/pop-out state
        if (this._draftIconConfig) {
            chrome.storage.local.set({ draftIconConfig: this._draftIconConfig });
        }
    },

    // Update unsaved indicator V4 - minimal
    updateUnsavedIndicatorV4: function() {
        const unsavedBanner = document.getElementById('unsaved-changes-banner');
        const hasChanges = this.hasUnsavedChanges();

        // Update inline unsaved banner
        if (unsavedBanner) {
            unsavedBanner.hidden = !hasChanges;
        }
    },

    // Update save button state V4
    updateSaveButtonStateV4: function() {
        const saveBtn = document.getElementById('save-org-icon-btn');
        if (!saveBtn) return;

        const hasChanges = this.hasUnsavedChanges();
        const isOrgSaved = this._selectedOrgId && this._savedOrgs[this._selectedOrgId];
        const isCurrentOrgNotSaved = this._currentOrgId && !this._savedOrgs[this._currentOrgId];

        // Enable save if there are changes or if org not yet saved
        if (isCurrentOrgNotSaved && !this._selectedOrgId) {
            saveBtn.disabled = false;
        } else if (!isOrgSaved && this._currentOrgId) {
            saveBtn.disabled = false;
        } else {
            saveBtn.disabled = !hasChanges;
        }
    },

    // Apply preset V3 - updates draft only, shows visual selection
    applyPresetV3: function(chip) {
        const { color, label } = chip.dataset;

        // Update form values
        const colorInput = document.getElementById('favicon-color-data');
        const labelInput = document.getElementById('favicon-label-data');

        if (colorInput && color) colorInput.value = color;
        if (labelInput && label) labelInput.value = label;

        // Update preset chip selection visuals (V3)
        document.querySelectorAll('#preset-chips .preset-chip-v3').forEach(c => {
            c.classList.toggle('active', c === chip);
        });

        // Update color swatch selection
        this.updateColorSwatchSelectionV3(color);

        // Update draft and preview
        this.onIconConfigChangeV3();
    },

    // Select color swatch V3
    selectColorSwatchV3: function(swatch) {
        const color = swatch.dataset.color;
        const colorInput = document.getElementById('favicon-color-data');

        if (colorInput && color) {
            colorInput.value = color;
            this.updateColorSwatchSelectionV3(color);
            this.onIconConfigChangeV3();
        }
    },

    // Update color swatch selection visuals V3
    updateColorSwatchSelectionV3: function(color) {
        document.querySelectorAll('#favicon-color-presets-data .color-swatch-v3').forEach(s => {
            s.classList.toggle('active', s.dataset.color === color);
        });
        // Also update V2 swatches for compatibility
        document.querySelectorAll('#favicon-color-presets-data .color-swatch').forEach(s => {
            s.classList.toggle('active', s.dataset.color === color);
        });
    },

    // Set preview background V3 (both cards)
    setPreviewBackgroundV3: function(mode) {
        const previewBodies = document.querySelectorAll('.preview-card-body-v3, .editing-preview-body');
        const lightBtn = document.getElementById('preview-bg-light');
        const darkBtn = document.getElementById('preview-bg-dark');

        previewBodies.forEach(body => {
            body.classList.toggle('dark-bg', mode === 'dark');
        });

        if (lightBtn) lightBtn.classList.toggle('active', mode === 'light');
        if (darkBtn) darkBtn.classList.toggle('active', mode === 'dark');
    },

    // Called when any icon config input changes (V3)
    onIconConfigChangeV3: function() {
        this.updateDraftConfig();
        this.updateFaviconPreviewRadio('-data');
        this.updateUnsavedIndicatorV3();
        this.updateSaveButtonStateV3();
        this.updateEditingLabelDisplay();

        // Mark draft preview as having changes
        const draftCard = document.getElementById('preview-card-draft');
        if (draftCard) {
            draftCard.classList.toggle('has-changes', this.hasUnsavedChanges());
        }

        // Persist draft config for pop-in/pop-out state
        if (this._draftIconConfig) {
            chrome.storage.local.set({ draftIconConfig: this._draftIconConfig });
        }
    },

    // Update editing label display in preview
    updateEditingLabelDisplay: function() {
        const labelDisplay = document.getElementById('editing-label-display');
        if (labelDisplay && this._draftIconConfig) {
            labelDisplay.textContent = this._draftIconConfig.label || '—';
        }
    },

    // Update unsaved indicator V3 - compact inline banner
    updateUnsavedIndicatorV3: function() {
        const draftBadge = document.getElementById('draft-status-badge');
        const unsavedBanner = document.getElementById('unsaved-changes-banner');
        const hasChanges = this.hasUnsavedChanges();

        // Update draft badge (mini dot style - CSS handles the visual)
        if (draftBadge) {
            if (hasChanges) {
                draftBadge.textContent = '';
                draftBadge.className = 'draft-badge-mini unsaved';
                draftBadge.title = 'Unsaved changes';
            } else {
                draftBadge.textContent = '';
                draftBadge.className = 'draft-badge-mini saved';
                draftBadge.title = 'Up to date';
            }
        }

        // Update inline unsaved banner
        if (unsavedBanner) {
            unsavedBanner.hidden = !hasChanges;
        }

        // Update applied summary display
        this.updateAppliedSummaryDisplayV3();
    },

    // Update the applied summary section V3 with current applied config
    updateAppliedSummaryDisplayV3: function() {
        const labelDisplay = document.getElementById('applied-label-display');

        if (this._appliedIconConfig) {
            if (labelDisplay) {
                labelDisplay.textContent = this._appliedIconConfig.label || '—';
            }
        } else {
            if (labelDisplay) labelDisplay.textContent = '—';
        }
    },

    // Update save button state V3
    updateSaveButtonStateV3: function() {
        const saveBtn = document.getElementById('save-org-icon-btn');
        if (!saveBtn) return;

        const hasChanges = this.hasUnsavedChanges();
        const isOrgSaved = this._selectedOrgId && this._savedOrgs[this._selectedOrgId];
        const isCurrentOrgNotSaved = this._currentOrgId && !this._savedOrgs[this._currentOrgId];

        // Determine button label and state
        if (isCurrentOrgNotSaved && !this._selectedOrgId) {
            saveBtn.textContent = 'Save & Apply';
            saveBtn.disabled = false;
        } else if (!isOrgSaved && this._currentOrgId) {
            saveBtn.textContent = 'Save & Apply';
            saveBtn.disabled = false;
        } else {
            saveBtn.textContent = 'Save & Apply';
            saveBtn.disabled = !hasChanges;
        }
    },

    // Toggle org info expanded section
    toggleOrgInfoExpanded: function() {
        const expandedSection = document.getElementById('org-info-expanded');
        const showMoreBtn = document.getElementById('show-more-org-info');

        if (expandedSection && showMoreBtn) {
            const isHidden = expandedSection.hidden;
            expandedSection.hidden = !isHidden;
            // Support both V3 and V4 button text
            showMoreBtn.textContent = isHidden ? 'Less ▴' : 'More ▾';
        }
    },

    // Update org summary in V3 layout
    updateOrgSummaryV3: function(orgData) {
        this.updateOrgSummaryV4(orgData);
    },

    // Update org summary in V4 layout (also used by V3)
    updateOrgSummaryV4: function(orgData) {
        const nameEl = document.getElementById('summary-org-name');
        const typeEl = document.getElementById('summary-org-type');
        const apiEl = document.getElementById('summary-api-version');
        const lastSeenEl = document.getElementById('summary-last-seen');
        const instanceEl = document.getElementById('summary-instance');
        const orgIdEl = document.getElementById('summary-org-id');
        const localeEl = document.getElementById('summary-locale');
        const createdEl = document.getElementById('summary-created');

        if (orgData) {
            if (nameEl) nameEl.textContent = orgData.orgName || orgData.Name || '—';
            if (typeEl) typeEl.textContent = orgData.environment || (orgData.IsSandbox ? 'Sandbox' : 'Production');
            if (apiEl) apiEl.textContent = document.getElementById('api-version')?.value || '63.0';
            if (lastSeenEl) lastSeenEl.textContent = orgData.lastSeenAt ? this.formatRelativeTime(orgData.lastSeenAt) : '—';
            if (instanceEl) instanceEl.textContent = orgData.instance || orgData.InstanceName || '—';
            if (orgIdEl) orgIdEl.textContent = orgData.orgId || this._currentOrgId || '—';
            if (localeEl) localeEl.textContent = orgData.locale || orgData.DefaultLocaleSidKey || '—';
            if (createdEl) createdEl.textContent = orgData.createdDate ? this.formatDate(orgData.createdDate) : '—';

            // Update env badge
            this.updateEnvBadge(orgData.environment || (orgData.IsSandbox ? 'sandbox' : 'production'));

            // Show live indicator
            const liveIndicator = document.getElementById('live-indicator');
            if (liveIndicator) liveIndicator.hidden = !this._appliedIconConfig;
        }
    },

    // Update environment badge
    updateEnvBadge: function(env) {
        const badge = document.getElementById('org-env-badge');
        if (badge) {
            badge.dataset.env = env || 'none';
            badge.textContent = (env || '').toUpperCase().substring(0, 4);
        }
    },

    // Format relative time (e.g., "2 hours ago")
    formatRelativeTime: function(dateStr) {
        try {
            const date = new Date(dateStr);
            const now = new Date();
            const diffMs = now - date;
            const diffMins = Math.floor(diffMs / 60000);
            const diffHours = Math.floor(diffMs / 3600000);
            const diffDays = Math.floor(diffMs / 86400000);

            if (diffMins < 1) return 'Just now';
            if (diffMins < 60) return `${diffMins}m ago`;
            if (diffHours < 24) return `${diffHours}h ago`;
            if (diffDays < 7) return `${diffDays}d ago`;
            return date.toLocaleDateString();
        } catch (e) {
            return '—';
        }
    },

    // Format date
    formatDate: function(dateStr) {
        try {
            return new Date(dateStr).toLocaleDateString();
        } catch (e) {
            return '—';
        }
    },

    // Apply preset V2 - updates draft only, shows visual selection
    applyPresetV2: function(chip) {
        const { color, label } = chip.dataset;

        // Update form values
        const colorInput = document.getElementById('favicon-color-data');
        const labelInput = document.getElementById('favicon-label-data');

        if (colorInput && color) colorInput.value = color;
        if (labelInput && label) labelInput.value = label;

        // Update preset chip selection visuals
        document.querySelectorAll('#preset-chips .preset-chip-v2').forEach(c => {
            c.classList.toggle('active', c === chip);
        });

        // Update color swatch selection
        this.updateColorSwatchSelection(color);

        // Update draft and preview
        this.onIconConfigChangeV2();
    },

    // Select color swatch
    selectColorSwatch: function(swatch) {
        const color = swatch.dataset.color;
        const colorInput = document.getElementById('favicon-color-data');

        if (colorInput && color) {
            colorInput.value = color;
            this.updateColorSwatchSelection(color);
            this.onIconConfigChangeV2();
        }
    },

    // Update color swatch selection visuals
    updateColorSwatchSelection: function(color) {
        document.querySelectorAll('#favicon-color-presets-data .color-swatch').forEach(s => {
            s.classList.toggle('active', s.dataset.color === color);
        });
    },

    // Set preview background V2 (both cards)
    setPreviewBackgroundV2: function(mode) {
        const previewBodies = document.querySelectorAll('.preview-card-body, .editing-preview-body');
        const lightBtn = document.getElementById('preview-bg-light');
        const darkBtn = document.getElementById('preview-bg-dark');

        previewBodies.forEach(body => {
            body.classList.toggle('dark-bg', mode === 'dark');
        });

        if (lightBtn) lightBtn.classList.toggle('active', mode === 'light');
        if (darkBtn) darkBtn.classList.toggle('active', mode === 'dark');
    },

    // Called when any icon config input changes (V2)
    onIconConfigChangeV2: function() {
        this.updateDraftConfig();
        this.updateFaviconPreviewRadio('-data');
        this.updateUnsavedIndicatorV2();
        this.updateSaveButtonState();

        // Persist draft config for pop-in/pop-out state
        if (this._draftIconConfig) {
            chrome.storage.local.set({ draftIconConfig: this._draftIconConfig });
        }
    },

    // Update unsaved indicator V2 - now includes sticky banner and applied summary
    updateUnsavedIndicatorV2: function() {
        const draftBadge = document.getElementById('draft-status-badge');
        const unsavedBanner = document.getElementById('unsaved-changes-banner');
        const hasChanges = this.hasUnsavedChanges();

        // Update draft badge
        if (draftBadge) {
            if (hasChanges) {
                draftBadge.textContent = 'Unsaved Changes';
                draftBadge.className = 'draft-status-badge unsaved';
            } else {
                draftBadge.textContent = 'Up to date';
                draftBadge.className = 'draft-status-badge saved';
            }
        }

        // Update sticky unsaved banner
        if (unsavedBanner) {
            unsavedBanner.hidden = !hasChanges;
        }

        // Update applied summary display
        this.updateAppliedSummaryDisplay();
    },

    // Update the applied summary section with current applied config
    updateAppliedSummaryDisplay: function() {
        const labelDisplay = document.getElementById('applied-label-display');
        const colorDisplay = document.getElementById('applied-color-display');

        if (this._appliedIconConfig) {
            if (labelDisplay) {
                labelDisplay.textContent = this._appliedIconConfig.labelText || '—';
            }
            if (colorDisplay) {
                colorDisplay.textContent = this._appliedIconConfig.baseColor || '#000000';
            }
        } else {
            if (labelDisplay) labelDisplay.textContent = '—';
            if (colorDisplay) colorDisplay.textContent = 'No icon applied';
        }
    },

    // Update save button state
    updateSaveButtonState: function() {
        const saveBtn = document.getElementById('save-org-icon-btn');
        if (!saveBtn) return;

        const hasChanges = this.hasUnsavedChanges();
        const isOrgSaved = this._selectedOrgId && this._savedOrgs[this._selectedOrgId];
        const isCurrentOrgNotSaved = this._currentOrgId && !this._savedOrgs[this._currentOrgId];

        // Determine button label
        if (isCurrentOrgNotSaved && !this._selectedOrgId) {
            saveBtn.textContent = 'Save Org + Icon';
            saveBtn.disabled = false; // Always allow saving new org
        } else if (!isOrgSaved && this._currentOrgId) {
            saveBtn.textContent = 'Save Org + Icon';
            saveBtn.disabled = false;
        } else {
            saveBtn.textContent = 'Save Changes';
            saveBtn.disabled = !hasChanges;
        }
    },

    // Save org and icon (single save action)
    saveOrgAndIcon: async function() {
        const targetOrgId = this._selectedOrgId || this._currentOrgId;

        if (!targetOrgId) {
            this.showFaviconStatus('No org selected. Please select or add an org.', 'error');
            return;
        }

        const color = document.getElementById('favicon-color-data')?.value || '#ff6b6b';
        const label = document.getElementById('favicon-label-data')?.value || '';
        const shapeRadio = document.querySelector('input[name="favicon-shape-data"]:checked');
        const shape = shapeRadio ? shapeRadio.value : 'circle';

        try {
            // Load existing records
            const result = await chrome.storage.local.get(['orgRecords', 'orgFavicons']);
            let orgRecords = (result && result.orgRecords) || {};
            let orgFavicons = (result && result.orgFavicons) || {};

            // CRITICAL: Always get the CURRENT hostname for this org
            // This ensures we apply favicon to the correct tabs
            let hostname = null;

            // Method 1: Try to get hostname from current session's instanceUrl (most reliable)
            try {
                const session = PlatformHelper.getSession ? PlatformHelper.getSession() : null;
                if (session && session.instanceUrl) {
                    hostname = new URL(session.instanceUrl).hostname;
                    console.log(`📝 Got hostname from session instanceUrl: ${hostname}`);
                }
            } catch (e) {
                console.warn('Could not get hostname from session:', e);
            }

            // Method 2: Query for SF tabs and find the most recent one
            if (!hostname) {
                try {
                    const sfTabs = await chrome.tabs.query({
                        url: ['*://*.salesforce.com/*', '*://*.force.com/*', '*://*.salesforce-setup.com/*']
                    });

                    if (sfTabs.length > 0) {
                        let currentWindowId = null;
                        try {
                            const currentWindow = await chrome.windows.getCurrent();
                            currentWindowId = currentWindow?.id;
                        } catch (e) {}

                        let candidateTabs = sfTabs;
                        if (currentWindowId) {
                            const sameWindowTabs = sfTabs.filter(t => t.windowId === currentWindowId);
                            if (sameWindowTabs.length > 0) {
                                candidateTabs = sameWindowTabs;
                            }
                        }

                        candidateTabs.sort((a, b) => (b.lastAccessed || 0) - (a.lastAccessed || 0));

                        const targetTab = candidateTabs[0];
                        if (targetTab?.url) {
                            hostname = new URL(targetTab.url).hostname;
                            console.log(`📝 Got hostname from SF tab: ${hostname}`);
                        }
                    }
                } catch (e) {
                    console.warn('Error getting hostname from tabs:', e);
                }
            }

            // If org doesn't exist, create it from current org data
            if (!orgRecords[targetOrgId] && this._currentOrgData) {
                const org = this._currentOrgData;
                const envType = org.OrganizationType || (org.IsSandbox ? 'Sandbox' : 'Production');
                console.log(`📋 Saving new org: ${org.Name}, OrganizationType=${envType}`);

                orgRecords[targetOrgId] = {
                    orgId: targetOrgId,
                    orgName: org.Name,
                    displayName: org.Name,
                    instance: org.InstanceName,
                    environment: envType,
                    isSandbox: org.IsSandbox === true,
                    orgType: org.OrganizationType,
                    locale: org.DefaultLocaleSidKey,
                    language: org.LanguageLocaleKey,
                    timezone: org.TimeZoneSidKey,
                    createdDate: org.CreatedDate,
                    hostname: hostname,
                    lastSeenAt: new Date().toISOString(),
                    iconConfig: { color, label, shape },
                    appliedIconConfig: { color, label, shape }
                };
            } else if (orgRecords[targetOrgId]) {
                // Update existing record
                orgRecords[targetOrgId].iconConfig = { color, label, shape };
                orgRecords[targetOrgId].appliedIconConfig = { color, label, shape };
                orgRecords[targetOrgId].lastSeenAt = new Date().toISOString();

                // CRITICAL FIX: Also update environment and org metadata from current org data
                // This ensures the environment type is always current, BUT only if we are actually on that org
                if (this._currentOrgData && this._currentOrgData.Id === targetOrgId) {
                    const org = this._currentOrgData;
                    const newEnv = org.OrganizationType || (org.IsSandbox ? 'Sandbox' : 'Production');
                    const oldEnv = orgRecords[targetOrgId].environment;
                    console.log(`📝 Updating org ${org.Name}: environment ${oldEnv} → ${newEnv}`);

                    orgRecords[targetOrgId].environment = newEnv;
                    orgRecords[targetOrgId].isSandbox = org.IsSandbox === true;
                    orgRecords[targetOrgId].orgType = org.OrganizationType;
                    orgRecords[targetOrgId].locale = org.DefaultLocaleSidKey;
                    orgRecords[targetOrgId].language = org.LanguageLocaleKey;
                    orgRecords[targetOrgId].timezone = org.TimeZoneSidKey;
                    console.log(`📝 Updated environment and metadata for existing org: ${newEnv}`);
                }

                // CRITICAL FIX: Also update hostname if we have a new one
                // This ensures we always have the correct hostname for tab matching
                if (hostname) {
                    orgRecords[targetOrgId].hostname = hostname;
                    console.log(`📝 Updated hostname for existing org: ${hostname}`);
                }
            }

            // Also update legacy orgFavicons - ALWAYS include current hostname
            orgFavicons[targetOrgId] = {
                color,
                label,
                shape,
                orgName: orgRecords[targetOrgId]?.orgName || 'Unknown Org',
                hostname: hostname || orgRecords[targetOrgId]?.hostname,
                savedAt: new Date().toISOString()
            };

            // Save to storage
            await chrome.storage.local.set({ orgRecords, orgFavicons });

            // Update in-memory cache
            this._savedOrgs = orgRecords;
            this._appliedIconConfig = { color, label, shape };
            this._draftIconConfig = { color, label, shape };

            // Clear persisted draft config since we just saved
            chrome.storage.local.remove('draftIconConfig');

            // Update UI
            this.renderSavedOrgsList();
            this.renderAppliedPreview();
            this.updateUnsavedIndicatorV2();
            this.updateSaveButtonState();
            this.updateOrgSavedStatus(true);

            // Apply to tabs
            const applyAllToggle = document.getElementById('apply-all-tabs-toggle');
            const applyToAllTabs = applyAllToggle?.checked || false;

            // Pass the hostname we detected during save to ensure we apply to correct tabs
            await this.applyFaviconToTabs(color, label, shape, targetOrgId, applyToAllTabs, hostname);

            this.showFaviconStatus('Saved successfully!', 'success');

        } catch (error) {
            console.error('Error saving org and icon:', error);
            this.showFaviconStatus('Error: ' + error.message, 'error');
        }
    },

    // Apply favicon to tabs
    // targetHostnameOverride: Optional hostname to use instead of looking up from _savedOrgs
    applyFaviconToTabs: async function(color, label, shape, orgId, applyToAll, targetHostnameOverride) {
        try {
            const allTabs = await chrome.tabs.query({});
            const sfTabs = allTabs.filter(tab =>
                tab.url && (
                    tab.url.includes('.salesforce.com') ||
                    tab.url.includes('.force.com') ||
                    tab.url.includes('.salesforce-setup.com')
                ) && !tab.url.startsWith('chrome-extension://')
            );

            if (sfTabs.length === 0) return;

            // Get the saved org record to check hostname for matching
            const orgRecord = this._savedOrgs[orgId];

            // CRITICAL: Use provided hostname override if available (freshly detected during save)
            // This ensures we apply to the correct tabs even if in-memory cache is stale
            let targetHostname = targetHostnameOverride || orgRecord?.hostname || null;

            console.log(`📍 applyFaviconToTabs: orgId=${orgId}, targetHostname=${targetHostname}, override=${!!targetHostnameOverride}`);

            // FIX: If no hostname in saved record, try to get it from the active Salesforce tab
            // and update the saved record for future use
            if (!targetHostname && sfTabs.length > 0) {
                const activeTab = sfTabs.find(t => t.active) || sfTabs[0];
                if (activeTab?.url) {
                    try {
                        targetHostname = new URL(activeTab.url).hostname;
                        console.log(`📝 No hostname saved for org, using active tab hostname: ${targetHostname}`);

                        // Update the saved org record with this hostname for future
                        if (orgRecord && targetHostname) {
                            orgRecord.hostname = targetHostname;
                            this._savedOrgs[orgId] = orgRecord;

                            // Persist to storage - update BOTH orgRecords AND orgFavicons
                            try {
                                const result = await chrome.storage.local.get(['orgRecords', 'orgFavicons']);
                                let orgRecords = (result && result.orgRecords) || {};
                                let orgFavicons = (result && result.orgFavicons) || {};

                                // Update orgRecords
                                if (orgRecords[orgId]) {
                                    orgRecords[orgId].hostname = targetHostname;
                                }

                                // CRITICAL: Also update orgFavicons (used by content.js for auto-apply)
                                if (orgFavicons[orgId]) {
                                    orgFavicons[orgId].hostname = targetHostname;
                                }

                                await chrome.storage.local.set({ orgRecords, orgFavicons });
                                console.log(`✅ Updated saved org with hostname: ${targetHostname} (both orgRecords and orgFavicons)`);
                            } catch (e) {
                                console.warn('Could not persist hostname update:', e);
                            }
                        }
                    } catch (e) {
                        console.warn('Could not extract hostname from active tab:', e);
                    }
                }
            }

            // If applyToAll is true, only apply to tabs that match the SAME org (by hostname)
            // This prevents cross-org contamination
            let tabsToApply;
            if (applyToAll && targetHostname) {
                // Filter tabs to only those matching the target org's hostname
                tabsToApply = sfTabs.filter(tab => {
                    try {
                        const tabHostname = new URL(tab.url).hostname;
                        return tabHostname === targetHostname;
                    } catch {
                        return false;
                    }
                });
                console.log(`📌 Applying favicon to ${tabsToApply.length} tabs matching hostname: ${targetHostname}`);
            } else if (targetHostname) {
                // CRITICAL FIX: Even when applyToAll is false, we must apply to tabs matching THIS org
                // Don't use t.active because popup is open and no tab is "active"
                // Instead, find tabs matching the target org's hostname
                tabsToApply = sfTabs.filter(tab => {
                    try {
                        const tabHostname = new URL(tab.url).hostname;
                        return tabHostname === targetHostname;
                    } catch {
                        return false;
                    }
                });
                // If multiple tabs match, just apply to the first one (or all if applyToAll would be true)
                if (tabsToApply.length > 1 && !applyToAll) {
                    tabsToApply = [tabsToApply[0]];
                }
                console.log(`📌 Applying favicon to ${tabsToApply.length} tab(s) for hostname: ${targetHostname}`);
            } else {
                // No hostname to match - try to find active tab, else first SF tab
                console.warn('⚠️ No hostname for org, trying active tab or first SF tab');
                const activeTab = sfTabs.find(t => t.active);
                tabsToApply = activeTab ? [activeTab] : (sfTabs.length > 0 ? [sfTabs[0]] : []);
            }

            for (const tab of tabsToApply) {
                try {
                    await chrome.tabs.sendMessage(tab.id, {
                        action: 'updateFavicon',
                        color, label, shape, orgId
                    });
                } catch (e) {
                    try {
                        await chrome.scripting.executeScript({
                            target: { tabId: tab.id },
                            func: this.injectFaviconUpdate,
                            args: [color, label, shape]
                        });
                    } catch (e2) {}
                }
            }
        } catch (e) {
            console.warn('Error applying favicon to tabs:', e);
        }
    },

    // Reset to applied state
    resetToApplied: function() {
        if (!this._appliedIconConfig) return;

        const colorInput = document.getElementById('favicon-color-data');
        const labelInput = document.getElementById('favicon-label-data');

        if (colorInput) colorInput.value = this._appliedIconConfig.color || '#ff6b6b';
        if (labelInput) labelInput.value = this._appliedIconConfig.label || '';

        if (this._appliedIconConfig.shape) {
            this.setSelectedShape(this._appliedIconConfig.shape, '-data');
        }

        // Update draft to match applied
        this._draftIconConfig = { ...this._appliedIconConfig };

        // Update visuals (all versions)
        this.updateFaviconPreviewRadio('-data');
        this.updateColorSwatchSelection(this._appliedIconConfig.color);
        this.updateColorSwatchSelectionV4(this._appliedIconConfig.color);
        this.updateColorSwatchSelectionV5(this._appliedIconConfig.color);
        this.clearPresetSelection();
        this.updateUnsavedIndicatorV2();
        this.updateUnsavedIndicatorV4();
        this.updateSaveButtonState();
        this.updateSaveButtonStateV4();

        // Reset change indicators
        const draftCard = document.getElementById('preview-card-draft');
        if (draftCard) draftCard.classList.remove('has-changes');
        const changeDot = document.getElementById('draft-status-badge');
        if (changeDot) changeDot.classList.remove('unsaved');

        this.showFaviconStatus('Reset to applied settings.', 'success');
    },

    // Clear preset selection
    clearPresetSelection: function() {
        document.querySelectorAll('#preset-chips .preset-chip-v2').forEach(c => {
            c.classList.remove('active');
        });
        document.querySelectorAll('#preset-chips .env-btn-v5').forEach(c => {
            c.classList.remove('active');
        });
    },

    // Update org saved status badge
    updateOrgSavedStatus: function(isSaved) {
        const statusContainer = document.getElementById('org-saved-status');
        if (!statusContainer) return;

        statusContainer.hidden = false;
        statusContainer.innerHTML = isSaved
            ? '<span class="status-badge saved">✓ Saved</span>'
            : '<span class="status-badge not-saved">⚠ Not Saved</span>';
    },

    // Show/hide icon editor panel
    showIconEditorPanel: function(show) {
        const noOrgState = document.getElementById('no-org-selected-state');
        const editorPanel = document.getElementById('icon-editor-panel');

        if (noOrgState) noOrgState.hidden = show;
        if (editorPanel) editorPanel.hidden = !show;
    },

    // Update draft config from form values
    updateDraftConfig: function() {
        const color = document.getElementById('favicon-color-data')?.value || '#ff6b6b';
        const label = document.getElementById('favicon-label-data')?.value || '';
        const shapeRadio = document.querySelector('input[name="favicon-shape-data"]:checked');
        const shape = shapeRadio ? shapeRadio.value : 'circle';

        this._draftIconConfig = { color, label, shape };
    },

    // Check if there are unsaved changes
    hasUnsavedChanges: function() {
        if (!this._draftIconConfig || !this._appliedIconConfig) return false;
        return (
            this._draftIconConfig.color !== this._appliedIconConfig.color ||
            this._draftIconConfig.label !== this._appliedIconConfig.label ||
            this._draftIconConfig.shape !== this._appliedIconConfig.shape
        );
    },

    // Update unsaved changes indicator
    updateUnsavedIndicator: function() {
        const banner = document.getElementById('unsaved-changes-banner');
        const previewBadge = document.getElementById('preview-state-badge');

        const hasChanges = this.hasUnsavedChanges();

        if (banner) {
            banner.hidden = !hasChanges;
        }
        if (previewBadge) {
            if (hasChanges) {
                previewBadge.textContent = 'UNSAVED';
                previewBadge.className = 'state-badge changed-badge';
            } else {
                previewBadge.textContent = 'PREVIEW';
                previewBadge.className = 'state-badge preview-badge';
            }
        }
    },

    // Set preview background (light/dark)
    setPreviewBackground: function(mode) {
        const previewBoxes = document.querySelectorAll('.preview-box');
        const lightBtn = document.getElementById('preview-bg-light');
        const darkBtn = document.getElementById('preview-bg-dark');

        previewBoxes.forEach(box => {
            box.classList.toggle('dark-bg', mode === 'dark');
        });

        if (lightBtn) lightBtn.classList.toggle('active', mode === 'light');
        if (darkBtn) darkBtn.classList.toggle('active', mode === 'dark');
    },

    // Apply a preset to the form
    applyPreset: function(presetData) {
        const { preset, color, label } = presetData;

        // Update form values
        const colorInput = document.getElementById('favicon-color-data');
        const labelInput = document.getElementById('favicon-label-data');

        if (colorInput && color) colorInput.value = color;
        if (labelInput && label) labelInput.value = label;

        // Update preset chip selection
        document.querySelectorAll('#preset-chips .preset-chip').forEach(chip => {
            chip.classList.toggle('active', chip.dataset.preset === preset);
        });

        // Update draft and preview
        this.onIconConfigChange();
    },

    // Add current org to saved orgs
    addCurrentOrg: async function() {
        if (!this._currentOrgId || !this._currentOrgData) {
            this.showFaviconStatus('No org detected. Please navigate to a Salesforce org.', 'error');
            return { success: false, error: 'No org detected' };
        }

        try {
            // Load existing saved orgs
            const result = await chrome.storage.local.get('orgRecords');
            let orgRecords = (result && result.orgRecords) || {};

            const orgId = this._currentOrgId;
            const org = this._currentOrgData;

            // Check if this org already exists
            if (orgRecords[orgId]) {
                // Org already saved - just select it and show info message
                this.showFaviconStatus('This org is already saved. Selecting it now.', 'info');
                await this.loadSavedOrgs();
                this.selectOrg(orgId);
                return { success: true, action: 'selected', orgId: orgId };
            }

            // Get current hostname
            let hostname = null;
            try {
                const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
                if (tabs[0]?.url && !tabs[0].url.startsWith('chrome-extension://')) {
                    hostname = new URL(tabs[0].url).hostname;
                }
            } catch (e) {}

            // Create new org record with default icon config
            const envType = org.OrganizationType || (org.IsSandbox ? 'Sandbox' : 'Production');
            console.log(`📋 Adding org: ${org.Name}, OrganizationType=${envType}`);

            const defaultIconConfig = {
                color: org.IsSandbox ? '#ffa500' : '#51cf66',
                label: envType.substring(0, 3).toUpperCase(),
                shape: 'circle'
            };

            orgRecords[orgId] = {
                orgId: orgId,
                orgName: org.Name,
                displayName: org.Name,
                instance: org.InstanceName,
                environment: envType,
                isSandbox: org.IsSandbox === true,
                orgType: org.OrganizationType,
                locale: org.DefaultLocaleSidKey,
                language: org.LanguageLocaleKey,
                timezone: org.TimeZoneSidKey,
                createdDate: org.CreatedDate,
                hostname: hostname,
                lastSeenAt: new Date().toISOString(),
                iconConfig: defaultIconConfig,
                appliedIconConfig: defaultIconConfig
            };

            await chrome.storage.local.set({ orgRecords });

            // Also save to legacy orgFavicons for backward compatibility
            const faviconResult = await chrome.storage.local.get('orgFavicons');
            let orgFavicons = (faviconResult && faviconResult.orgFavicons) || {};
            const iconConfig = orgRecords[orgId].appliedIconConfig;
            orgFavicons[orgId] = {
                color: iconConfig.color,
                label: iconConfig.label,
                shape: iconConfig.shape,
                orgName: org.Name,
                hostname: hostname,
                savedAt: new Date().toISOString()
            };
            await chrome.storage.local.set({ orgFavicons });

            // Refresh the list and select the new org
            await this.loadSavedOrgs();
            this.selectOrg(orgId);

            // Show success with org count
            const orgCount = Object.keys(orgRecords).length;
            this.showFaviconStatus(`Org "${org.Name}" saved! (${orgCount} org${orgCount > 1 ? 's' : ''} total)`, 'success');

            // Hide save prompt and new org detected banner
            const savePrompt = document.getElementById('save-org-prompt');
            if (savePrompt) savePrompt.hidden = true;
            this.hideNewOrgDetectedBanner();

            return { success: true, action: 'added', orgId: orgId };

        } catch (error) {
            console.error('Error adding org:', error);
            this.showFaviconStatus('Error saving org: ' + error.message, 'error');
            return { success: false, error: error.message };
        }
    },

    // ==========================================
    // MULTI-ORG SUPPORT FUNCTIONS
    // ==========================================

    /**
     * Check if an org is already saved
     * @param {string} orgId - The org ID to check
     * @returns {boolean} True if org is saved
     */
    isOrgSaved: function(orgId) {
        return !!(this._savedOrgs && this._savedOrgs[orgId]);
    },

    /**
     * Get org by hostname - useful for matching tabs to saved orgs
     * @param {string} hostname - The hostname to search for
     * @returns {Object|null} The org record or null
     */
    getOrgByHostname: function(hostname) {
        if (!hostname || !this._savedOrgs) return null;

        for (const orgId in this._savedOrgs) {
            const org = this._savedOrgs[orgId];
            if (org.hostname === hostname) {
                return org;
            }
        }
        return null;
    },

    /**
     * Extract org key from hostname for grouping
     * Handles various Salesforce URL patterns
     * @param {string} hostname - The hostname to parse
     * @returns {string} The org key
     */
    extractOrgKeyFromHostname: function(hostname) {
        if (!hostname) return '';
        // mycompany.my.salesforce.com -> mycompany
        // mycompany--sandbox.sandbox.my.salesforce.com -> mycompany--sandbox
        // mycompany.lightning.force.com -> mycompany
        const match = hostname.match(/^([^.]+)/);
        return match ? match[1] : hostname;
    },

    /**
     * Detect all Salesforce orgs from open browser tabs
     * Groups tabs by org hostname for multi-org scenarios
     * @returns {Promise<Object>} Map of orgKey -> {hostname, tabs}
     */
    detectAllOpenOrgs: async function() {
        try {
            const tabs = await chrome.tabs.query({});
            const sfTabs = tabs.filter(tab =>
                tab.url && (
                    tab.url.includes('.salesforce.com') ||
                    tab.url.includes('.force.com')
                ) && !tab.url.startsWith('chrome-extension://')
            );

            const detectedOrgs = {};

            for (const tab of sfTabs) {
                try {
                    const hostname = new URL(tab.url).hostname;
                    const orgKey = this.extractOrgKeyFromHostname(hostname);

                    if (!detectedOrgs[orgKey]) {
                        detectedOrgs[orgKey] = {
                            hostname: hostname,
                            tabs: [],
                            orgKey: orgKey
                        };
                    }
                    detectedOrgs[orgKey].tabs.push(tab);
                } catch (e) {
                    // Invalid URL, skip
                }
            }

            this._detectedOrgs = detectedOrgs;
            return detectedOrgs;
        } catch (error) {
            console.warn('Error detecting open orgs:', error);
            return {};
        }
    },

    /**
     * Refresh current org info from the active Salesforce tab
     * Used to ensure we're showing the correct org when multiple are open
     * @returns {Promise<Object>} Result object with success status
     */
    refreshCurrentOrgFromActiveTab: async function() {
        try {
            // Get active tab
            const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
            const activeTab = tabs[0];

            if (!activeTab?.url ||
                (!activeTab.url.includes('salesforce.com') && !activeTab.url.includes('force.com'))) {
                return { success: false, error: 'Active tab is not a Salesforce page' };
            }

            // Refresh session from the active tab
            if (PlatformHelper.refreshSessionFromTab) {
                try { await PlatformHelper.refreshSessionFromTab(); } catch {}
            }

            // Check session
            const session = await PlatformHelper.getSession();
            if (!session || !session.isLoggedIn) {
                return { success: false, error: 'Not connected' };
            }

            // Query org info
            const result = await PlatformHelper.executeQuery(
                'SELECT Id, Name, IsSandbox, InstanceName, OrganizationType FROM Organization LIMIT 1'
            );

            if (result && result.records && result.records.length > 0) {
                const org = result.records[0];
                this._currentOrgId = org.Id;
                this._currentOrgName = org.Name;
                this._currentOrgData = org;
                this._currentOrgIsSandbox = org.IsSandbox === true;

                // Update CacheManager
                if (window.CacheManager) {
                    window.CacheManager.setCurrentOrgId(org.Id);
                }

                return { success: true, org: org };
            }

            return { success: false, error: 'Could not fetch org info' };
        } catch (error) {
            console.warn('Error refreshing current org:', error);
            return { success: false, error: error.message };
        }
    },

    /**
     * Show the "New Org Detected" banner with blinking animation
     * Clicking on it navigates to the Data Explorer → Org & Favicon tab
     * @param {Object} org - The detected org data
     */
    showNewOrgDetectedBanner: function(org) {
        const banner = document.getElementById('new-org-detected');
        if (!banner) {
            console.warn('🆕 New org detected but banner element not found in DOM');
            return;
        }

        // Update banner content with org name
        const textEl = banner.querySelector('.new-org-text');
        if (textEl) {
            textEl.textContent = `New Org: ${org.Name || 'Unknown'}`;
        }

        // Add sandbox class for different styling
        if (org.IsSandbox) {
            banner.classList.add('sandbox');
        } else {
            banner.classList.remove('sandbox');
        }

        // Show the banner - ensure it's visible
        banner.hidden = false;
        banner.style.display = 'inline-flex'; // Force display in case CSS isn't applied

        // Wire click handler (only once)
        if (!banner._clickWired) {
            const self = this;
            banner.addEventListener('click', function() {
                self.navigateToOrgFaviconTab();
                self.hideNewOrgDetectedBanner();
            });
            banner._clickWired = true;
        }

        console.log(`🆕 New org detected and banner shown: ${org.Name} (${org.Id}), IsSandbox: ${org.IsSandbox}`);
    },

    /**
     * Hide the "New Org Detected" banner
     */
    hideNewOrgDetectedBanner: function() {
        const banner = document.getElementById('new-org-detected');
        if (banner) {
            banner.hidden = true;
            banner.style.display = 'none';
        }
    },

    /**
     * Navigate to the Data Explorer → Org & Favicon tab
     */
    navigateToOrgFaviconTab: function() {
        // Switch to Data Explorer main tab
        const dataTabBtn = document.querySelector('[data-tab="data"]');
        if (dataTabBtn) {
            dataTabBtn.click();
        }

        // Switch to Org & Favicon sub-tab
        setTimeout(() => {
            const orgFaviconSubTab = document.querySelector('#tab-data [data-subtab="org-favicon"]');
            if (orgFaviconSubTab) {
                orgFaviconSubTab.click();
            } else {
                // Fallback: try to find by text content
                const subTabs = document.querySelectorAll('#tab-data .sub-tab-button');
                for (const btn of subTabs) {
                    if (btn.textContent.includes('Org') || btn.textContent.includes('Favicon')) {
                        btn.click();
                        break;
                    }
                }
            }
        }, 50);
    },

    // Load saved orgs from storage
    loadSavedOrgs: async function() {
        try {
            const result = await chrome.storage.local.get(['orgRecords', 'orgFavicons', 'selectedOrgId', 'draftIconConfig']);
            let orgRecords = (result && result.orgRecords) || {};

            // Migrate from legacy orgFavicons if needed
            if (Object.keys(orgRecords).length === 0 && result.orgFavicons) {
                orgRecords = this.migrateFromLegacyFavicons(result.orgFavicons);
                await chrome.storage.local.set({ orgRecords });
            }

            this._savedOrgs = orgRecords;
            this.renderSavedOrgsList();

            // Restore selected org if it exists
            const savedSelectedOrgId = result.selectedOrgId;
            if (savedSelectedOrgId && orgRecords[savedSelectedOrgId]) {
                this.selectOrg(savedSelectedOrgId);

                // Restore draft config if it was saved
                if (result.draftIconConfig) {
                    this._draftIconConfig = result.draftIconConfig;
                    const colorInput = document.getElementById('favicon-color-data');
                    const labelInput = document.getElementById('favicon-label-data');
                    if (colorInput) colorInput.value = result.draftIconConfig.color || '#ff6b6b';
                    if (labelInput) labelInput.value = result.draftIconConfig.label || '';
                    if (result.draftIconConfig.shape) {
                        this.setSelectedShape(result.draftIconConfig.shape, '-data');
                    }
                    this.updateFaviconPreviewRadio('-data');
                    this.updateColorSwatchSelection(result.draftIconConfig.color);
                    this.updateUnsavedIndicatorV2();
                    this.updateSaveButtonState();
                }
            }

            // Also update the legacy saved favicons list for backward compatibility
            this.loadSavedFavicons();

        } catch (error) {
            console.error('Error loading saved orgs:', error);
        }
    },

    // Migrate from legacy orgFavicons format
    migrateFromLegacyFavicons: function(orgFavicons) {
        const orgRecords = {};

        Object.entries(orgFavicons).forEach(([orgId, data]) => {
            orgRecords[orgId] = {
                orgId: orgId,
                orgName: data.orgName || 'Unknown Org',
                displayName: data.orgName || 'Unknown Org',
                instance: null,
                environment: 'unknown',
                orgType: null,
                hostname: data.hostname,
                lastSeenAt: data.savedAt || new Date().toISOString(),
                iconConfig: {
                    color: data.color || '#ff6b6b',
                    label: data.label || '',
                    shape: data.shape || 'circle'
                },
                appliedIconConfig: {
                    color: data.color || '#ff6b6b',
                    label: data.label || '',
                    shape: data.shape || 'circle'
                }
            };
        });

        return orgRecords;
    },

    // Render the saved orgs list
    renderSavedOrgsList: function() {
        const container = document.getElementById('saved-orgs-list');
        if (!container) return;

        const orgs = Object.values(this._savedOrgs);
        const query = this._orgSearchQuery.toLowerCase();

        // Detect layout version
        const isV3 = container.classList.contains('saved-orgs-list-v3');
        const isV4 = container.classList.contains('org-list-scroll');
        const isV5 = container.classList.contains('org-list-scroll-v5');

        // Filter by search query
        const filteredOrgs = query
            ? orgs.filter(org =>
                (org.orgName || '').toLowerCase().includes(query) ||
                (org.displayName || '').toLowerCase().includes(query) ||
                (org.orgId || '').toLowerCase().includes(query) ||
                (org.instance || '').toLowerCase().includes(query) ||
                (org.environment || '').toLowerCase().includes(query)
            )
            : orgs;

        if (filteredOrgs.length === 0) {
            if (isV5) {
                container.innerHTML = `<div class="empty-minimal-v5">${query ? 'No match' : 'No orgs saved'}</div>`;
            } else if (isV4) {
                container.innerHTML = `<div class="empty-minimal">${query ? 'No match' : 'No orgs saved'}</div>`;
            } else if (isV3) {
                container.innerHTML = `
                    <div class="empty-state-compact">
                        <span class="empty-icon-sm">📋</span>
                        <span class="empty-text-sm">${query ? 'No match' : 'No orgs saved'}</span>
                    </div>
                `;
            } else {
                container.innerHTML = `
                    <div class="empty-state">
                        <div class="empty-icon">📋</div>
                        <div class="empty-text">${query ? 'No matching orgs' : 'No orgs saved yet'}</div>
                        <div class="empty-hint">${query ? 'Try a different search term' : 'Navigate to a Salesforce org and click "Add Current Org"'}</div>
                    </div>
                `;
            }
            return;
        }

        // Sort: current org first, then by last seen
        filteredOrgs.sort((a, b) => {
            if (a.orgId === this._currentOrgId) return -1;
            if (b.orgId === this._currentOrgId) return 1;
            return new Date(b.lastSeenAt || 0) - new Date(a.lastSeenAt || 0);
        });

        let html = '';
        filteredOrgs.forEach(org => {
            const isCurrentOrg = org.orgId === this._currentOrgId;
            const isSelected = org.orgId === this._selectedOrgId;
            // Display the actual environment type as 3-letter abbreviation
            const envLabel = org.environment ? org.environment.substring(0, 3).toUpperCase() : 'UNK';

            if (isV4 || isV5) {
                // V4/V5 minimal layout with remove button
                html += `
                    <div class="org-item ${isSelected ? 'selected' : ''} ${isCurrentOrg ? 'current' : ''}" 
                         data-org-id="${org.orgId}">   
                        <div class="org-item-icon" id="org-icon-${org.orgId}"></div>
                        <div class="org-item-name">${org.displayName || org.orgName || 'Unknown'}</div>
                        <div class="org-item-env">${envLabel}</div>
                        <button class="org-item-remove" data-org-id="${org.orgId}" title="Remove org">×</button>
                    </div>
                `;
            } else if (isV3) {
                // V3 compact layout
                html += `
                    <div class="org-list-item-v3 ${isSelected ? 'selected' : ''} ${isCurrentOrg ? 'current-org' : ''}" 
                         data-org-id="${org.orgId}">
                        <div class="org-list-icon-v3" id="org-icon-${org.orgId}"></div>
                        <div class="org-list-info-v3">
                            <div class="org-list-name-v3">${org.displayName || org.orgName || 'Unknown'}</div>
                            <div class="org-list-meta-v3">${envLabel}${org.instance ? ' · ' + org.instance : ''}</div>
                        </div>
                    </div>
                `;
            } else {
                // V2 layout
                // Determine badge class based on sandbox status when available, or use environment name
                const isSandbox = org.isSandbox === true;
                const envBadgeClass = isSandbox ? 'sandbox' : 'production';
                html += `
                    <div class="org-list-item ${isSelected ? 'selected' : ''} ${isCurrentOrg ? 'current-org' : ''}" 
                         data-org-id="${org.orgId}">
                        <div class="org-list-icon" id="org-icon-${org.orgId}"></div>
                        <div class="org-list-info">
                            <div class="org-list-name">
                                ${org.displayName || org.orgName || 'Unknown'}
                                ${isCurrentOrg ? '<span class="current-badge" title="Current org">●</span>' : ''}
                            </div>
                            <div class="org-list-meta">
                                <span class="org-type-badge ${envBadgeClass}">${envLabel}</span>
                                ${org.instance ? `<span>${org.instance}</span>` : ''}
                            </div>
                        </div>
                        <div class="org-list-actions">
                            <button class="btn-rename" title="Rename" data-org-id="${org.orgId}">✎</button>
                            <button class="btn-delete" title="Delete" data-org-id="${org.orgId}">×</button>
                        </div>
                    </div>
                `;
            }
        });

        container.innerHTML = html;

        // Wire up event listeners for org list items (CSP compliant)
        container.querySelectorAll('.org-list-item, .org-list-item-v3, .org-item').forEach(item => {
            item.addEventListener('click', () => {
                this.selectOrg(item.dataset.orgId);
            });
        });

        // Wire up rename buttons (V2 only)
        container.querySelectorAll('.btn-rename').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.promptRenameOrg(btn.dataset.orgId);
            });
        });

        // Wire up delete buttons (V2 only)
        container.querySelectorAll('.btn-delete').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.deleteOrg(btn.dataset.orgId);
            });
        });

        // Wire up remove buttons (V4/V5)
        container.querySelectorAll('.org-item-remove').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.deleteOrg(btn.dataset.orgId);
            });
        });

        // Render icon previews for each org (High-DPI aware)
        filteredOrgs.forEach(org => {
            const iconEl = document.getElementById(`org-icon-${org.orgId}`);
            if (iconEl) {
                // Clear existing canvas before adding new one
                iconEl.innerHTML = '';

                const canvas = document.createElement('canvas');
                const isV4Icon = iconEl.classList.contains('org-item-icon');
                const isV3Icon = iconEl.classList.contains('org-list-icon-v3');
                const displaySize = isV4Icon ? 18 : (isV3Icon ? 20 : 24);

                // High-DPI support: render at higher resolution for crisp icons
                const dpr = window.devicePixelRatio || 1;
                // Use minimum 2x for crisp rendering on all displays
                const effectiveDpr = Math.max(dpr, 2);
                canvas.width = displaySize * effectiveDpr;
                canvas.height = displaySize * effectiveDpr;
                canvas.style.width = displaySize + 'px';
                canvas.style.height = displaySize + 'px';

                const ctx = canvas.getContext('2d');
                ctx.scale(effectiveDpr, effectiveDpr); // Scale context to match DPR

                const iconConfig = org.appliedIconConfig || org.iconConfig || {};
                this.drawFaviconShape(ctx, iconConfig.color || '#ccc', iconConfig.label || '', iconConfig.shape || 'circle', displaySize);
                iconEl.appendChild(canvas);
            }
        });
    },

    // Select an org from the list
    selectOrg: function(orgId) {
        this._selectedOrgId = orgId;
        const org = this._savedOrgs[orgId];

        if (!org) {
            console.warn('Org not found:', orgId);
            return;
        }

        // Update list selection (V2, V3, V4)
        document.querySelectorAll('.org-list-item, .org-list-item-v3, .org-item').forEach(item => {
            item.classList.toggle('selected', item.dataset.orgId === orgId);
        });

        // Update editing org name in header
        const editingOrgName = document.getElementById('editing-org-name');
        if (editingOrgName) {
            editingOrgName.textContent = org.displayName || org.orgName || 'Unknown';
        }

        // Update v5 preview org names
        const previewLiveOrgName = document.getElementById('preview-live-org-name');
        const previewDraftOrgName = document.getElementById('preview-draft-org-name');
        const displayName = org.displayName || org.orgName || 'Unknown';
        if (previewLiveOrgName) previewLiveOrgName.textContent = displayName;
        if (previewDraftOrgName) previewDraftOrgName.textContent = displayName;

        // Update env badge (V4, V5)
        const envBadge = document.getElementById('org-env-badge');
        if (envBadge) {
            // Display the actual environment type (DEV, UAT, QA, SANDBOX, Production, etc)
            const envDisplay = org.environment || 'Unknown';
            const envShort = envDisplay.substring(0, 3).toUpperCase();
            envBadge.textContent = envShort;
            envBadge.className = 'env-badge env-badge-v5 ' + (org.environment || '').toLowerCase();
        }

        // Show live indicator
        const liveIndicator = document.getElementById('live-indicator');
        if (liveIndicator) {
            liveIndicator.hidden = false;
        }

        // Show icon editor panel
        this.showIconEditorPanel(true);

        // Load icon config into form
        const iconConfig = org.appliedIconConfig || org.iconConfig || {};
        this._appliedIconConfig = { ...iconConfig };
        this._draftIconConfig = { ...iconConfig };

        // Populate form
        const colorInput = document.getElementById('favicon-color-data');
        const labelInput = document.getElementById('favicon-label-data');

        if (colorInput) colorInput.value = iconConfig.color || '#ff6b6b';
        if (labelInput) labelInput.value = iconConfig.label || '';

        if (iconConfig.shape) {
            this.setSelectedShape(iconConfig.shape, '-data');
        }

        // Update color swatch selection (all versions)
        this.updateColorSwatchSelection(iconConfig.color);
        this.updateColorSwatchSelectionV3(iconConfig.color);
        this.updateColorSwatchSelectionV4(iconConfig.color);
        this.updateColorSwatchSelectionV5(iconConfig.color);

        // Update both preview canvases
        this.updateFaviconPreviewRadio('-data');
        this.renderAppliedPreview();

        // Clear preset selection (all versions)
        this.clearPresetSelection();
        document.querySelectorAll('#preset-chips .preset-chip-v3, #preset-chips .preset-btn, #preset-chips .env-btn-v5').forEach(c => {
            c.classList.remove('active');
        });

        // Update org info panel and org summary
        this.renderOrgInfoPanel(org);
        this.updateOrgSummaryV4(org);

        // Update indicators (all versions)
        this.updateUnsavedIndicatorV2();
        this.updateUnsavedIndicatorV3();
        this.updateUnsavedIndicatorV4();
        this.updateSaveButtonState();
        this.updateSaveButtonStateV3();
        this.updateSaveButtonStateV4();
        this.updateOrgSavedStatus(true);


        // Persist selected org ID for pop-in/pop-out state
        chrome.storage.local.set({ selectedOrgId: orgId });
    },

    // Render the applied preview canvas (High-DPI aware)
    renderAppliedPreview: function() {
        const canvas = document.getElementById('favicon-applied-preview');
        if (!canvas || !this._appliedIconConfig) return;

        // High-DPI support
        const displaySize = 32;
        const dpr = window.devicePixelRatio || 1;

        // Resize canvas for DPR if needed
        if (canvas.width !== displaySize * dpr) {
            canvas.width = displaySize * dpr;
            canvas.height = displaySize * dpr;
            canvas.style.width = displaySize + 'px';
            canvas.style.height = displaySize + 'px';
        }

        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        // Reset transform and apply DPR scale
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, displaySize, displaySize);
        this.drawFaviconShape(
            ctx,
            this._appliedIconConfig.color || '#ccc',
            this._appliedIconConfig.label || '',
            this._appliedIconConfig.shape || 'circle',
            displaySize
        );
    },

    // Render org info in the right column
    renderOrgInfoPanel: function(org) {
        const container = document.getElementById('org-info-container-data');
        if (!container) return;

        if (!org) {
            container.innerHTML = `
                <div class="not-selected-state">
                    <div class="empty-icon">👈</div>
                    <div class="empty-text">Select an org</div>
                    <div class="empty-hint">Choose from saved orgs or add current org</div>
                </div>
            `;
            return;
        }

        const envBadge = org.environment === 'production'
            ? '<span style="background:#d3f9d8;color:#2b8a3e;padding:2px 6px;border-radius:4px;font-size:10px;font-weight:600;">PRODUCTION</span>'
            : org.environment === 'sandbox'
                ? '<span style="background:#fff3bf;color:#e67700;padding:2px 6px;border-radius:4px;font-size:10px;font-weight:600;">SANDBOX</span>'
                : '<span style="background:#e7f5ff;color:#1971c2;padding:2px 6px;border-radius:4px;font-size:10px;font-weight:600;">DEVELOPER</span>';

        const fields = [
            { label: 'Name', value: org.orgName },
            { label: 'Org ID', value: `${org.orgId} <button class="copy-btn" data-copy="${org.orgId}" title="Copy">📋</button>` },
            { label: 'Type', value: `${org.orgType || '-'} ${envBadge}` },
            { label: 'Instance', value: org.instance || '-' },
            { label: 'Language', value: org.language || '-' },
            { label: 'Locale', value: org.locale || '-' },
            { label: 'Timezone', value: org.timezone || '-' },
            { label: 'Created', value: org.createdDate ? new Date(org.createdDate).toLocaleDateString() : '-' },
            { label: 'Last Seen', value: org.lastSeenAt ? new Date(org.lastSeenAt).toLocaleString() : '-' }
        ];

        let html = '<div class="org-details-content">';
        fields.forEach(f => {
            html += `<span class="detail-label">${f.label}:</span>
                <span class="detail-value">${f.value || '-'}</span>`;
        });
        html += '</div>';

        container.innerHTML = html;

        // Wire up copy buttons (CSP compliant)
        container.querySelectorAll('.copy-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const text = btn.dataset.copy;
                navigator.clipboard.writeText(text).then(() => {
                    this.showFaviconStatus('Copied!', 'success');
                    btn.textContent = '✓';
                    setTimeout(() => { btn.textContent = '📋'; }, 1500);
                });
            });
        });

        // Check if this org is saved
        const isOrgSaved = !!this._savedOrgs[org.orgId];
        const savePrompt = document.getElementById('save-org-prompt');
        if (savePrompt) {
            savePrompt.hidden = isOrgSaved;
        }
    },

    // Prompt to rename org
    promptRenameOrg: function(orgId) {
        const org = this._savedOrgs[orgId];
        if (!org) return;

        const newName = prompt('Enter new display name:', org.displayName || org.orgName);
        if (newName && newName.trim()) {
            this.renameOrg(orgId, newName.trim());
        }
    },

    // Rename an org
    renameOrg: async function(orgId, displayName) {
        try {
            const result = await chrome.storage.local.get('orgRecords');
            let orgRecords = (result && result.orgRecords) || {};

            if (orgRecords[orgId]) {
                orgRecords[orgId].displayName = displayName;
                await chrome.storage.local.set({ orgRecords });
                this._savedOrgs = orgRecords;
                this.renderSavedOrgsList();

                // Update editing org name if this org is selected (V2)
                if (this._selectedOrgId === orgId) {
                    const editingOrgName = document.getElementById('editing-org-name');
                    if (editingOrgName) {
                        editingOrgName.textContent = displayName;
                    }
                }

                this.showFaviconStatus('Org renamed!', 'success');
            }
        } catch (error) {
            console.error('Error renaming org:', error);
            this.showFaviconStatus('Error renaming org', 'error');
        }
    },

    // Delete an org
    deleteOrg: async function(orgId) {
        if (!confirm('Delete this saved org? This cannot be undone.')) return;

        try {
            const result = await chrome.storage.local.get(['orgRecords', 'orgFavicons']);
            let orgRecords = (result && result.orgRecords) || {};
            let orgFavicons = (result && result.orgFavicons) || {};

            delete orgRecords[orgId];
            delete orgFavicons[orgId];

            await chrome.storage.local.set({ orgRecords, orgFavicons });
            this._savedOrgs = orgRecords;

            // Clear selection if we deleted the selected org
            if (this._selectedOrgId === orgId) {
                this._selectedOrgId = null;
                this._appliedIconConfig = null;
                this._draftIconConfig = null;

                const editingBadge = document.getElementById('editing-org-badge');
                if (editingBadge) editingBadge.hidden = true;

                this.renderOrgInfoPanel(null);
            }

            this.renderSavedOrgsList();
            this.loadSavedFavicons(); // Update legacy list too

            this.showFaviconStatus('Org deleted', 'success');
        } catch (error) {
            console.error('Error deleting org:', error);
            this.showFaviconStatus('Error deleting org', 'error');
        }
    },

    // Render org info panel for current org that is NOT saved yet
    renderOrgInfoPanelForCurrentOrg: function(org) {
        const container = document.getElementById('org-info-container-data');
        if (!container || !org) return;

        const isSandbox = org.IsSandbox === true;
        const envBadge = isSandbox
            ? '<span style="background:#fff3bf;color:#e67700;padding:2px 6px;border-radius:4px;font-size:10px;font-weight:600;">SANDBOX</span>'
            : '<span style="background:#d3f9d8;color:#2b8a3e;padding:2px 6px;border-radius:4px;font-size:10px;font-weight:600;">PRODUCTION</span>';

        // Add prominent "New Org Detected" alert at top
        const alertColor = isSandbox ? '#ffa500' : '#ff6b6b';
        const newOrgAlert = `
            <div class="new-org-alert" style="
                background: linear-gradient(135deg, ${alertColor} 0%, ${isSandbox ? '#ff8c00' : '#ee5a5a'} 100%);
                color: white;
                padding: 12px 16px;
                border-radius: 8px;
                margin-bottom: 12px;
                display: flex;
                align-items: center;
                gap: 10px;
                animation: newOrgAlertPulse 2s ease-in-out infinite;
                box-shadow: 0 2px 12px rgba(0,0,0,0.2);
            ">
                <span style="font-size: 24px;">🆕</span>
                <div style="flex: 1;">
                    <div style="font-weight: 600; font-size: 14px;">New Org Detected!</div>
                    <div style="font-size: 12px; opacity: 0.9;">${org.Name} • Not saved yet</div>
                </div>
                <button id="quick-save-org-btn" style="
                    background: white;
                    color: ${alertColor};
                    border: none;
                    padding: 8px 16px;
                    border-radius: 6px;
                    font-weight: 600;
                    cursor: pointer;
                    font-size: 12px;
                    transition: transform 0.2s;
                " onmouseover="this.style.transform='scale(1.05)'" onmouseout="this.style.transform='scale(1)'">
                    Save Org →
                </button>
            </div>
        `;

        const fields = [
            { label: 'Name', value: org.Name },
            { label: 'Org ID', value: `${org.Id} <button class="copy-btn" data-copy="${org.Id}" title="Copy">📋</button>` },
            { label: 'Type', value: `${org.OrganizationType || '-'} ${envBadge}` },
            { label: 'Instance', value: org.InstanceName || '-' },
            { label: 'Language', value: org.LanguageLocaleKey || '-' },
            { label: 'Locale', value: org.DefaultLocaleSidKey || '-' },
            { label: 'Timezone', value: org.TimeZoneSidKey || '-' },
            { label: 'Created', value: org.CreatedDate ? new Date(org.CreatedDate).toLocaleDateString() : '-' }
        ];

        let html = newOrgAlert + '<div class="org-details-content">';
        fields.forEach(f => {
            html += `<span class="detail-label">${f.label}:</span>
                <span class="detail-value">${f.value || '-'}</span>`;
        });
        html += '</div>';

        container.innerHTML = html;

        // Wire up quick save button
        const quickSaveBtn = document.getElementById('quick-save-org-btn');
        if (quickSaveBtn) {
            quickSaveBtn.addEventListener('click', () => {
                this.addCurrentOrg();
            });
        }

        // Wire up copy buttons (CSP compliant)
        container.querySelectorAll('.copy-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const text = btn.dataset.copy;
                navigator.clipboard.writeText(text).then(() => {
                    this.showFaviconStatus('Copied!', 'success');
                    btn.textContent = '✓';
                    setTimeout(() => { btn.textContent = '📋'; }, 1500);
                });
            });
        });

        // Update org saved status badge (V2)
        this.updateOrgSavedStatus(false);

        // Set up default icon config for preview
        const defaultIconConfig = {
            color: isSandbox ? '#ffa500' : '#51cf66',
            label: isSandbox ? 'SBX' : 'PRD',
            shape: 'circle'
        };
        this._appliedIconConfig = defaultIconConfig;
        this._draftIconConfig = { ...defaultIconConfig };

        // Update form with defaults
        const colorInput = document.getElementById('favicon-color-data');
        const labelInput = document.getElementById('favicon-label-data');
        if (colorInput) colorInput.value = defaultIconConfig.color;
        if (labelInput) labelInput.value = defaultIconConfig.label;
        this.setSelectedShape(defaultIconConfig.shape, '-data');

        // Update color swatch selection
        this.updateColorSwatchSelection(defaultIconConfig.color);

        // Update previews
        this.updateFaviconPreviewRadio('-data');
        this.renderAppliedPreview();

        // Update editing org name (V2)
        const editingOrgName = document.getElementById('editing-org-name');
        if (editingOrgName) {
            editingOrgName.textContent = org.Name + ' (unsaved)';
        }

        // Show icon editor panel
        this.showIconEditorPanel(true);

        // Update V2, V3, V4 indicators
        this.updateUnsavedIndicatorV2();
        this.updateUnsavedIndicatorV3();
        this.updateUnsavedIndicatorV4();
        this.updateSaveButtonState();
        this.updateSaveButtonStateV3();
        this.updateSaveButtonStateV4();
    },

    // Wire events for Data Explorer tab (-data suffix) - uses radio buttons for shapes
    wireFaviconEventsDataExplorer: function(suffix) {
        const faviconColor = document.getElementById(`favicon-color${suffix}`);
        const faviconLabel = document.getElementById(`favicon-label${suffix}`);
        const faviconApply = document.getElementById(`apply-favicon-btn${suffix}`);
        const faviconReset = document.getElementById(`reset-favicon-btn${suffix}`);
        const faviconShapeRadios = document.querySelectorAll(`input[name="favicon-shape${suffix}"]`);
        const faviconOrgSelect = document.getElementById(`favicon-org-select${suffix}`);
        const faviconColorPresets = document.querySelectorAll(`#favicon-color-presets${suffix} .color-preset`);

        if (faviconColor) {
            faviconColor.addEventListener('input', () => {
                this.updateFaviconPreviewRadio(suffix);
            });
        }
        if (faviconLabel) {
            faviconLabel.addEventListener('input', () => this.updateFaviconPreviewRadio(suffix));
        }
        // Shape selection event listeners (radio-based)
        faviconShapeRadios.forEach(radio => {
            radio.addEventListener('change', () => this.updateFaviconPreviewRadio(suffix));
        });
        // Color preset click handlers
        faviconColorPresets.forEach(preset => {
            preset.addEventListener('click', () => {
                if (faviconColor) faviconColor.value = preset.dataset.color;
                this.updateFaviconPreviewRadio(suffix);
            });
        });
        if (faviconApply) {
            faviconApply.addEventListener('click', () => this.applyFaviconRadio(suffix));
        }
        if (faviconReset) {
            faviconReset.addEventListener('click', () => this.resetFavicon(suffix));
        }
        // Org selector for editing different orgs
        if (faviconOrgSelect) {
            faviconOrgSelect.addEventListener('change', () => this.onOrgSelectChange(suffix));
        }
    },

    // Update preview for radio-based shape selection
    updateFaviconPreviewRadio: function(suffix) {
        const preview = document.getElementById(`favicon-preview${suffix}`);
        const color = document.getElementById(`favicon-color${suffix}`)?.value || '#ff6b6b';
        const label = document.getElementById(`favicon-label${suffix}`)?.value || '';
        const shapeRadio = document.querySelector(`input[name="favicon-shape${suffix}"]:checked`);
        const shape = shapeRadio ? shapeRadio.value : 'circle';

        if (!preview) return;

        // High-DPI support
        const displaySize = 32;
        const dpr = window.devicePixelRatio || 1;

        // Resize canvas for DPR if needed
        if (preview.width !== displaySize * dpr) {
            preview.width = displaySize * dpr;
            preview.height = displaySize * dpr;
            preview.style.width = displaySize + 'px';
            preview.style.height = displaySize + 'px';
        }

        const ctx = preview.getContext('2d');
        if (!ctx) return;

        // Reset transform and apply DPR scale
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, displaySize, displaySize);
        this.drawFaviconShape(ctx, color, label, shape, displaySize);
    },

    // Apply favicon for radio-based shape selection
    applyFaviconRadio: async function(suffix) {
        const color = document.getElementById(`favicon-color${suffix}`)?.value || '#ff6b6b';
        const label = document.getElementById(`favicon-label${suffix}`)?.value || '';
        const shapeRadio = document.querySelector(`input[name="favicon-shape${suffix}"]:checked`);
        const shape = shapeRadio ? shapeRadio.value : 'circle';

        await this.applyFaviconWithValues(color, label, shape);
    },

    // Wire events for Settings tab (legacy IDs without suffix)
    wireFaviconEventsSettings: function() {
        const faviconColor = document.getElementById('favicon-color');
        const faviconLabel = document.getElementById('favicon-label');
        const faviconApply = document.getElementById('favicon-apply');
        const faviconReset = document.getElementById('favicon-reset');
        const faviconShapeRadios = document.querySelectorAll('input[name="favicon-shape"]');
        const faviconOrgSelect = document.getElementById('favicon-org-select');
        const faviconColorPresets = document.querySelectorAll('#favicon-color-presets .color-preset');

        if (faviconColor) {
            faviconColor.addEventListener('input', () => {
                this.updateFaviconPreviewSettings();
                this.updateColorPresetSelection('');
            });
        }
        if (faviconLabel) {
            faviconLabel.addEventListener('input', () => this.updateFaviconPreviewSettings());
        }
        // Shape selection event listeners (radio-based for Settings)
        faviconShapeRadios.forEach(radio => {
            radio.addEventListener('change', () => this.updateFaviconPreviewSettings());
        });
        // Color preset click handlers
        faviconColorPresets.forEach(preset => {
            preset.addEventListener('click', () => this.selectColorPresetSettings(preset.dataset.color));
        });
        if (faviconApply) {
            faviconApply.addEventListener('click', () => this.applyFaviconSettings());
        }
        if (faviconReset) {
            faviconReset.addEventListener('click', () => this.resetFavicon(''));
        }
        // Org selector for editing different orgs
        if (faviconOrgSelect) {
            faviconOrgSelect.addEventListener('change', () => this.onOrgSelectChange(''));
        }
    },

    // Settings-specific favicon preview update (uses radio buttons)
    updateFaviconPreviewSettings: function() {
        const preview = document.getElementById('favicon-preview');
        const color = document.getElementById('favicon-color')?.value || '#ff6b6b';
        const label = document.getElementById('favicon-label')?.value || '';
        const shapeRadio = document.querySelector('input[name="favicon-shape"]:checked');
        const shape = shapeRadio ? shapeRadio.value : 'cloud';

        if (!preview) return;

        // Clear and render preview (High-DPI aware)
        preview.innerHTML = '';
        const canvas = document.createElement('canvas');
        const displaySize = 36;
        const dpr = window.devicePixelRatio || 1;
        canvas.width = displaySize * dpr;
        canvas.height = displaySize * dpr;
        canvas.style.width = displaySize + 'px';
        canvas.style.height = displaySize + 'px';
        const ctx = canvas.getContext('2d');
        ctx.scale(dpr, dpr);
        this.drawFaviconShape(ctx, color || '#ff6b6b', label, shape, displaySize);
        preview.appendChild(canvas);
    },

    // Settings-specific color preset selection
    selectColorPresetSettings: function(color) {
        const colorInput = document.getElementById('favicon-color');
        if (colorInput && color) {
            colorInput.value = color;
            this.updateFaviconPreviewSettings();
            this.updateColorPresetSelection('');
        }
    },

    // Settings-specific apply favicon (uses radio buttons)
    applyFaviconSettings: async function() {
        const color = document.getElementById('favicon-color')?.value || '#ff6b6b';
        const label = document.getElementById('favicon-label')?.value || '';
        const shapeRadio = document.querySelector('input[name="favicon-shape"]:checked');
        const shape = shapeRadio ? shapeRadio.value : 'cloud';

        // Use the main apply logic with these values
        await this.applyFaviconWithValues(color, label, shape);
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
                this.loadSavedOrgs(); // Load saved orgs for new 3-column layout
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
        // Support both Settings tab and Data Explorer tab containers
        const containers = [
            document.getElementById('org-info-container'),
            document.getElementById('org-info-container-data')
        ].filter(Boolean);

        if (containers.length === 0) return;

        containers.forEach(c => {
            c.innerHTML = '<div class="spinner">Loading organization info...</div>';
        });

        try {
            // CRITICAL: Clear previous org data BEFORE refreshing session
            // This prevents showing stale org data when switching between orgs
            const previousOrgId = this._currentOrgId;

            // IMPORTANT: Always refresh session from current window's tab to ensure correct org context
            // This prevents showing data from other browser windows
            if (PlatformHelper.refreshSessionFromTab) {
                try {
                    await PlatformHelper.refreshSessionFromTab();
                    // NOTE: Don't clear cache here - let the session refresh handle it
                    // The refreshSessionFromTab function will clear cache only if org changes
                } catch (e) {
                    console.warn('Failed to refresh session from tab:', e);
                }
            }

            // Check if we have a valid session first
            const session = await PlatformHelper.getSession();
            if (!session || !session.isLoggedIn) {
                // Clear current org data when not connected
                this._currentOrgId = null;
                this._currentOrgName = null;
                this._currentOrgData = null;

                const notConnectedHtml = `
                    <div class="not-connected-message">
                        <div style="font-size: 24px; margin-bottom: 8px;">🔌</div>
                        <div style="font-weight: 600; margin-bottom: 4px;">Not Connected</div>
                        <div style="font-size: 12px; color: #6c757d; margin-bottom: 12px;">
                            Please ensure you have an active Salesforce tab open and are logged in.
                        </div>
                        <button id="retry-connection-btn" style="
                            background: linear-gradient(135deg, #4dabf7 0%, #228be6 100%);
                            color: white;
                            border: none;
                            padding: 10px 20px;
                            border-radius: 6px;
                            font-weight: 600;
                            cursor: pointer;
                            font-size: 13px;
                            display: inline-flex;
                            align-items: center;
                            gap: 6px;
                        ">
                            <span>🔄</span> Retry Connection
                        </button>
                        <div style="font-size: 11px; color: #adb5bd; margin-top: 12px;">
                            Tip: Make sure your Salesforce tab is active, then click Retry.
                        </div>
                    </div>
                `;
                containers.forEach(c => { c.innerHTML = notConnectedHtml; });

                // Wire up retry button
                const retryBtn = document.getElementById('retry-connection-btn');
                if (retryBtn) {
                    retryBtn.addEventListener('click', () => {
                        // Force clear all caches before retry
                        if (window.Utils && window.Utils.setInstanceUrlCache) {
                            window.Utils.setInstanceUrlCache(null);
                        }
                        this.loadOrgInfo();
                    });
                }

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

                // CRITICAL: Check if org has changed
                const orgChanged = previousOrgId && previousOrgId !== org.Id;
                if (orgChanged) {
                    console.log(`🔄 Org changed from ${previousOrgId} to ${org.Id}`);
                    // Clear draft config when org changes to prevent mixing up configs
                    this._draftIconConfig = null;
                    this._appliedIconConfig = null;
                    // Don't auto-select the previous org
                    this._selectedOrgId = null;
                }

                // Store current org info
                this._currentOrgId = org.Id;
                this._currentOrgName = org.Name;
                this._currentOrgData = org; // Store full org data for addCurrentOrg
                this._currentOrgIsSandbox = org.IsSandbox === true;

                // CRITICAL: Update CacheManager with current org ID to enable org-scoped caching
                if (window.CacheManager) {
                    window.CacheManager.setCurrentOrgId(org.Id);
                }

                containers.forEach(c => this.renderOrgInfo(org, c));

                // Load saved orgs (new 3-column layout)
                await this.loadSavedOrgs();

                console.log(`📋 Loaded org: ${org.Name} (${org.Id}), Saved orgs: ${Object.keys(this._savedOrgs).length}, Is current org saved: ${!!this._savedOrgs[org.Id]}`);

                // Auto-select current org if it's saved and not already selected
                if (this._savedOrgs[org.Id]) {
                    console.log(`✅ Org ${org.Name} is already saved, selecting it`);

                    // FIX: Update hostname if missing from saved org record
                    if (!this._savedOrgs[org.Id].hostname) {
                        try {
                            const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
                            if (tabs[0]?.url && !tabs[0].url.startsWith('chrome-extension://')) {
                                const hostname = new URL(tabs[0].url).hostname;
                                if (hostname) {
                                    this._savedOrgs[org.Id].hostname = hostname;
                                    // Persist to storage - update BOTH orgRecords AND orgFavicons
                                    const storageResult = await chrome.storage.local.get(['orgRecords', 'orgFavicons']);
                                    let orgRecords = (storageResult && storageResult.orgRecords) || {};
                                    let orgFavicons = (storageResult && storageResult.orgFavicons) || {};

                                    // Update orgRecords
                                    if (orgRecords[org.Id]) {
                                        orgRecords[org.Id].hostname = hostname;
                                    }

                                    // CRITICAL: Also update orgFavicons (used by content.js for auto-apply)
                                    if (orgFavicons[org.Id]) {
                                        orgFavicons[org.Id].hostname = hostname;
                                    }

                                    await chrome.storage.local.set({ orgRecords, orgFavicons });
                                    console.log(`📝 Updated saved org with missing hostname: ${hostname} (both orgRecords and orgFavicons)`);
                                }
                            }
                        } catch (e) {
                            console.warn('Could not update hostname for saved org:', e);
                        }
                    }

                    this.selectOrg(org.Id);
                    // Hide new org notification since it's already saved
                    this.hideNewOrgDetectedBanner();
                } else {
                    console.log(`🆕 Org ${org.Name} is NOT saved, showing new org banner`);
                    // Current org is not saved - show it in the info panel with save prompt
                    this._selectedOrgId = null;
                    this.renderOrgInfoPanelForCurrentOrg(org);
                    // Show new org detected notification banner with blinking
                    this.showNewOrgDetectedBanner(org);
                }

                // Load saved favicons list (legacy)
                this.loadSavedFavicons();
            } else {
                // Clear current org data when query returns nothing
                this._currentOrgId = null;
                this._currentOrgName = null;
                this._currentOrgData = null;

                containers.forEach(c => {
                    c.innerHTML = '<div class="error-message">Could not retrieve organization information.</div>';
                });
                this.loadSavedFavicons();
            }
        } catch (error) {
            console.error('Error loading org info:', error);
            // Clear current org data on error
            this._currentOrgId = null;
            this._currentOrgName = null;
            this._currentOrgData = null;

            const errorDetails = error.message || String(error);
            const isNotConnected = errorDetails.includes('Not connected') || errorDetails.includes('Missing session');
            const errorHtml = `<div class="error-message">
                ${isNotConnected 
                    ? '<div style="font-size: 24px; margin-bottom: 8px;">🔌</div><div style="font-weight: 600; margin-bottom: 4px;">Session Error</div><div style="font-size: 12px; color: #6c757d;">Please ensure you are logged into Salesforce in an active tab.</div>'
                    : `Error: ${errorDetails}`
                }
            </div>`;
            containers.forEach(c => { c.innerHTML = errorHtml; });
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
        // Support both Settings tab and Data Explorer tab forms
        const suffixes = ['', '-data'];

        try {
            const result = await chrome.storage.local.get('orgFavicons');
            const orgFavicons = (result && result.orgFavicons && typeof result.orgFavicons === 'object')
                ? result.orgFavicons : {};

            if (orgId && orgFavicons[orgId]) {
                // Existing data found - populate both forms in edit mode
                const { color, label, shape } = orgFavicons[orgId];

                for (const suffix of suffixes) {
                    const labelInput = document.getElementById(`favicon-label${suffix}`);
                    const colorInput = document.getElementById(`favicon-color${suffix}`);

                    if (colorInput && color) {
                        colorInput.value = color;
                    }
                    if (labelInput) labelInput.value = label || '';
                    // Set the shape selection
                    if (shape) {
                        this.setSelectedShape(shape, suffix);
                    }

                    // Update preview with saved settings
                    if (suffix === '-data') {
                        this.updateFaviconPreviewRadio(suffix);
                    } else {
                        this.updateFaviconPreview(suffix);
                    }
                }
                return;
            }
        } catch (e) {
            console.warn('Could not check existing favicon:', e);
        }

        // No existing data - auto-suggest based on org type
        for (const suffix of suffixes) {
            const labelInput = document.getElementById(`favicon-label${suffix}`);
            if (labelInput && !labelInput.value && isSandbox) {
                labelInput.value = 'SBX';
            }
            if (suffix === '-data') {
                this.updateFaviconPreviewRadio(suffix);
            } else {
                this.updateFaviconPreview(suffix);
            }
        }
    },

    initFaviconPreview: async function(suffix = '') {
        // Render initial preview based on current form values
        // Note: loadExistingFaviconOrSuggest (called from renderOrgInfo) handles loading saved data
        // Initialize both Settings and Data Explorer previews if no suffix specified
        const suffixes = suffix ? [suffix] : ['', '-data'];

        for (const s of suffixes) {
            const color = document.getElementById(`favicon-color${s}`)?.value || '#ff6b6b';
            const label = document.getElementById(`favicon-label${s}`)?.value || '';
            const shape = this.getSelectedShape(s);

            // For Data Explorer (-data suffix), use radio-based update
            if (s === '-data') {
                this.updateFaviconPreviewRadio(s);
                // Also initialize the applied preview canvas for 3-column layout
                this.renderAppliedPreview();
            } else {
                this.renderFaviconPreview(color, label, shape, s);
            }
        }
    },

    updateFaviconPreview: function(suffix = '') {
        const preview = document.getElementById(`favicon-preview${suffix}`);
        const color = document.getElementById(`favicon-color${suffix}`)?.value || '#ff6b6b';
        const label = document.getElementById(`favicon-label${suffix}`)?.value || '';
        const shape = this.getSelectedShape(suffix);

        if (!preview) return;

        // Update preview with colored shape
        this.renderFaviconPreview(color, label, shape, suffix);
    },

    renderFaviconPreview: function(color, label, shape = 'circle', suffix = '') {
        const preview = document.getElementById(`favicon-preview${suffix}`);
        if (!preview) return;

        // High-DPI support
        const displaySize = 32;
        const dpr = window.devicePixelRatio || 1;

        // Resize canvas for DPR if needed
        if (preview.width !== displaySize * dpr) {
            preview.width = displaySize * dpr;
            preview.height = displaySize * dpr;
            preview.style.width = displaySize + 'px';
            preview.style.height = displaySize + 'px';
        }

        const ctx = preview.getContext('2d');
        if (!ctx) return;

        // Reset transform and apply DPR scale
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, displaySize, displaySize);
        this.drawFaviconShape(ctx, color || '#ff6b6b', label, shape, displaySize);
    },

    // Helper to get selected shape from the form (supports both button and radio-based)
    getSelectedShape: function(suffix = '') {
        // First try radio buttons (Data Explorer uses these)
        const shapeRadio = document.querySelector(`input[name="favicon-shape${suffix}"]:checked`);
        if (shapeRadio) return shapeRadio.value;

        // Fallback to button-based (Settings tab uses these)
        const activeShapeBtn = document.querySelector(`#favicon-shape-options${suffix} .shape-btn.active`);
        if (activeShapeBtn) return activeShapeBtn.dataset.shape;

        // Default to circle
        return 'circle';
    },

    // Set shape selection in the form (supports both button and radio-based)
    setSelectedShape: function(shape, suffix = '') {
        // Try radio buttons first (Data Explorer)
        const shapeRadio = document.querySelector(`input[name="favicon-shape${suffix}"][value="${shape}"]`);
        if (shapeRadio) {
            shapeRadio.checked = true;
            return;
        }

        // Fallback to buttons (Settings tab)
        const shapeButtons = document.querySelectorAll(`#favicon-shape-options${suffix} .shape-btn`);
        shapeButtons.forEach(btn => {
            btn.classList.toggle('active', btn.dataset.shape === shape);
        });
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
    selectColorPreset: function(color, suffix = '') {
        const colorInput = document.getElementById(`favicon-color${suffix}`);
        if (colorInput && color) {
            colorInput.value = color;
            this.updateFaviconPreview(suffix);
            this.updateColorPresetSelection(suffix);
        }
    },

    // Update color preset selection state
    updateColorPresetSelection: function(suffix = '') {
        const colorInput = document.getElementById(`favicon-color${suffix}`);
        const presets = document.querySelectorAll(`#favicon-color-presets${suffix} .color-preset`);
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

    drawFaviconShape: function(ctx, color, label, shape = 'cloud', displaySize = null) {
        // Get actual canvas dimensions (or use displaySize for High-DPI rendering)
        const canvas = ctx.canvas;
        const w = displaySize || canvas.width;
        const h = displaySize || canvas.height;
        const size = Math.min(w, h);
        const center = size / 2;

        // Completely clear the canvas (use actual canvas dimensions)
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        // Reset all drawing state to prevent artifacts
        ctx.globalAlpha = 1.0;
        ctx.globalCompositeOperation = 'source-over';
        ctx.strokeStyle = 'transparent';
        ctx.lineWidth = 0;
        ctx.lineCap = 'butt';
        ctx.lineJoin = 'round';
        ctx.miterLimit = 10;
        ctx.fillStyle = color;

        switch (shape) {
            case 'circle':
                ctx.beginPath();
                ctx.arc(center, center, size * 0.44, 0, Math.PI * 2);
                ctx.fill();
                break;

            case 'square':
                ctx.fillRect(size * 0.06, size * 0.06, size * 0.88, size * 0.88);
                break;

            case 'rounded':
                this.drawRoundedRect(ctx, size * 0.06, size * 0.06, size * 0.88, size * 0.88, size * 0.19);
                ctx.fill();
                break;

            case 'diamond':
                ctx.beginPath();
                ctx.moveTo(center, size * 0.03);
                ctx.lineTo(size * 0.94, center);
                ctx.lineTo(center, size * 0.97);
                ctx.lineTo(size * 0.06, center);
                ctx.closePath();
                ctx.fill();
                break;

            case 'hexagon':
                this.drawHexagon(ctx, center, center, size * 0.44);
                ctx.fill();
                break;

            case 'cloud':
            default:
                // Draw Salesforce-style cloud shape
                ctx.beginPath();
                ctx.arc(center, center * 1.125, size * 0.31, Math.PI * 0.5, Math.PI * 1.5);
                ctx.arc(center * 0.625, center * 0.75, size * 0.19, Math.PI, Math.PI * 1.5);
                ctx.arc(center, center * 0.5, size * 0.22, Math.PI * 1.2, Math.PI * 1.8);
                ctx.arc(center * 1.375, center * 0.625, size * 0.19, Math.PI * 1.5, Math.PI * 0.3);
                ctx.arc(center * 1.5, center * 1.125, size * 0.19, Math.PI * 1.5, Math.PI * 0.5);
                ctx.closePath();
                ctx.fill();
                break;
        }

        // Draw label text if provided
        if (label) {
            ctx.fillStyle = '#ffffff';
            ctx.font = `bold ${Math.floor(size * 0.25)}px Arial, sans-serif`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.shadowColor = 'rgba(0,0,0,0.3)';
            ctx.shadowBlur = 2;
            ctx.shadowOffsetX = 0;
            ctx.shadowOffsetY = 0;
            ctx.fillText(label.substring(0, 3).toUpperCase(), center, center);
            ctx.shadowColor = 'transparent';
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

    applyFavicon: async function(suffix = '') {
        const color = document.getElementById(`favicon-color${suffix}`)?.value || '#ff6b6b';
        const label = document.getElementById(`favicon-label${suffix}`)?.value || '';
        const shape = this.getSelectedShape(suffix);

        await this.applyFaviconWithValues(color, label, shape);
    },

    applyFaviconWithValues: async function(color, label, shape) {
        // Determine which org to save for - selected org (new UI), editing org (legacy), or current org
        const targetOrgId = this._selectedOrgId || this._editingOrgId || this._currentOrgId;

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

            // ALSO update the new orgRecords storage for 3-column layout
            const orgRecordsResult = await chrome.storage.local.get('orgRecords');
            let orgRecords = (orgRecordsResult && orgRecordsResult.orgRecords) || {};
            if (orgRecords[targetOrgId]) {
                orgRecords[targetOrgId].iconConfig = { color, label, shape };
                orgRecords[targetOrgId].appliedIconConfig = { color, label, shape };
                orgRecords[targetOrgId].lastSeenAt = new Date().toISOString();
                await chrome.storage.local.set({ orgRecords });

                // Update in-memory cache
                this._savedOrgs = orgRecords;

                // Update applied config state
                this._appliedIconConfig = { color, label, shape };
                this._draftIconConfig = { color, label, shape };

                // Re-render the saved orgs list to show updated icon
                this.renderSavedOrgsList();

                // Update the applied preview
                this.renderAppliedPreview();

                // Clear unsaved indicator
                this.updateUnsavedIndicator();
            }

            // Verify save was successful
            const verifyResult = await chrome.storage.local.get('orgFavicons');
            console.log('Verified saved favicons:', Object.keys(verifyResult.orgFavicons || {}));

            // Refresh the saved list immediately - wait for completion
            await this.loadSavedFavicons();

            // Update preview to show saved favicon
            const suffixes = ['', '-data'];
            for (const suffix of suffixes) {
                if (suffix === '-data') {
                    this.updateFaviconPreviewRadio(suffix);
                } else {
                    this.updateFaviconPreview(suffix);
                }
            }

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
                    // Check if "apply to all tabs" is enabled
                    const applyAllToggle = document.getElementById('apply-all-tabs-toggle');
                    const applyToAllTabs = applyAllToggle?.checked || false;

                    // Try the active SF tab first, or the first SF tab found
                    const activeTab = sfTabs.find(t => t.active) || sfTabs[0];

                    // Only apply to tab if editing current org or selected org matches
                    const isEditingCurrentOrg = !this._editingOrgId || this._editingOrgId === this._currentOrgId;
                    const isSelectedOrgCurrent = this._selectedOrgId === this._currentOrgId;

                    if (isEditingCurrentOrg || isSelectedOrgCurrent) {
                        // Determine which tabs to apply to
                        const tabsToApply = applyToAllTabs ? sfTabs : [activeTab];
                        let successCount = 0;

                        for (const tab of tabsToApply) {
                            try {
                                await chrome.tabs.sendMessage(tab.id, {
                                    action: 'updateFavicon',
                                    color: color,
                                    label: label,
                                    shape: shape,
                                    orgId: targetOrgId
                                });
                                successCount++;
                            } catch (msgError) {
                                // Content script might not be loaded, try scripting API
                                try {
                                    await chrome.scripting.executeScript({
                                        target: { tabId: tab.id },
                                        func: this.injectFaviconUpdate,
                                        args: [color, label, shape]
                                    });
                                    successCount++;
                                } catch (scriptError) {
                                    console.warn('Scripting API failed for tab:', tab.id);
                                }
                            }
                        }

                        if (successCount > 0) {
                            const tabText = successCount > 1 ? `${successCount} tabs` : 'tab';
                            this.showFaviconStatus(`Favicon saved & applied to ${tabText}!`, 'success');
                        } else {
                            this.showFaviconStatus('Favicon saved. Refresh Salesforce page to see change.', 'success');
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
        // Support both Settings and Data Explorer status elements
        const statusElements = [
            document.getElementById('favicon-status'),
            document.getElementById('favicon-status-data')
        ].filter(Boolean);

        statusElements.forEach(status => {
            status.textContent = message;
            // Support V2, V3, V4, and V5 class names
            const isV5 = status.classList.contains('status-msg-v5');
            const isV3 = status.classList.contains('favicon-status-v3');

            if (isV5) {
                status.className = `status-msg-v5 ${type}`;
            } else if (isV3) {
                status.className = `favicon-status-v3 ${type}`;
            } else {
                status.className = `favicon-status status-msg ${type}`;
            }

            status.hidden = false;
            status.style.display = 'block';

            // Auto-hide after 4 seconds
            setTimeout(() => {
                status.hidden = true;
                status.style.display = 'none';
            }, 4000);
        });
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

    resetFavicon: async function(suffix = '') {
        // For the new 3-column layout (-data suffix), reset means revert to applied state
        if (suffix === '-data' && this._selectedOrgId && this._appliedIconConfig) {
            // Reset form to applied config
            const colorInput = document.getElementById('favicon-color-data');
            const labelInput = document.getElementById('favicon-label-data');

            if (colorInput) colorInput.value = this._appliedIconConfig.color || '#ff6b6b';
            if (labelInput) labelInput.value = this._appliedIconConfig.label || '';

            if (this._appliedIconConfig.shape) {
                this.setSelectedShape(this._appliedIconConfig.shape, '-data');
            }

            // Update draft to match applied
            this._draftIconConfig = { ...this._appliedIconConfig };

            // Update previews
            this.updateFaviconPreviewRadio('-data');

            // Clear unsaved indicator
            this.updateUnsavedIndicator();

            // Clear preset selection
            document.querySelectorAll('#preset-chips .preset-chip').forEach(chip => {
                chip.classList.remove('active');
            });

            this.showFaviconStatus('Reset to applied settings.', 'success');
            return;
        }

        // Legacy behavior: delete from storage (for Settings tab)
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

            // Reset UI for both form sets
            const suffixes = ['', '-data'];
            for (const s of suffixes) {
                const colorInput = document.getElementById(`favicon-color${s}`);
                const labelInput = document.getElementById(`favicon-label${s}`);
                const colorValueSpan = document.getElementById(`favicon-color-value${s}`);

                if (colorInput) colorInput.value = '#ff6b6b';
                if (labelInput) labelInput.value = '';
                if (colorValueSpan) colorValueSpan.textContent = '#ff6b6b';

                // Reset shape to circle
                this.setSelectedShape('circle', s);

                // Reset preview to default
                this.renderFaviconPreview('#ff6b6b', '', 'circle', s);
                this.updateColorPresetSelection(s);
            }

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
        // Support both Settings tab and Data Explorer tab containers
        // Note: saved-favicons-list-data is legacy - new UI uses saved-orgs-list and renderSavedOrgsList
        const containers = [
            document.getElementById('saved-favicons-list')
        ].filter(Boolean);

        const orgSelects = [
            document.getElementById('favicon-org-select')
            // Note: favicon-org-select-data is removed in the new 3-column layout
        ].filter(Boolean);

        try {
            const result = await chrome.storage.local.get('orgFavicons');
            let orgFavicons = {};

            if (result && result.orgFavicons && typeof result.orgFavicons === 'object') {
                orgFavicons = result.orgFavicons;
            }

            const entries = Object.entries(orgFavicons);
            console.log('Loading saved favicons, count:', entries.length);

            // Populate org selector dropdowns (both tabs)
            orgSelects.forEach(orgSelect => {
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
            });

            if (containers.length === 0) return;

            if (entries.length === 0) {
                containers.forEach(container => {
                    container.innerHTML = '<div class="placeholder-note">No saved favicons yet</div>';
                });
                return;
            }

            // Render the saved favicons list in each container
            containers.forEach(container => {
                let html = '';
                entries.forEach(([orgId, data]) => {
                    const isCurrentOrg = orgId === this._currentOrgId;
                    const previewId = `preview-${orgId}-${container.id}`;

                    html += `
                        <div class="favicon-list-item ${isCurrentOrg ? 'current-org' : ''}" data-org-id="${orgId}">
                            <div class="favicon-list-preview" id="${previewId}"></div>
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

                // Render previews for each item (using saved shape) - High-DPI aware
                entries.forEach(([orgId, data]) => {
                    const previewId = `preview-${orgId}-${container.id}`;
                    const previewEl = document.getElementById(previewId);
                    if (previewEl) {
                        const canvas = document.createElement('canvas');
                        const displaySize = 24;
                        const dpr = window.devicePixelRatio || 1;
                        canvas.width = displaySize * dpr;
                        canvas.height = displaySize * dpr;
                        canvas.style.width = displaySize + 'px';
                        canvas.style.height = displaySize + 'px';
                        const ctx = canvas.getContext('2d');
                        ctx.scale(dpr, dpr);
                        this.drawFaviconShape(ctx, data.color || '#ff6b6b', data.label, data.shape || 'cloud', displaySize);
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
            });

        } catch (error) {
            console.error('Error loading saved favicons:', error);
            containers.forEach(container => {
                container.innerHTML = '<div class="error-message">Error loading saved favicons</div>';
            });
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
        const resetPasswordBtn = document.getElementById('user-reset-password-btn');
        const clearBtn = document.getElementById('user-clear-selection');

        if (profileSelect) profileSelect.disabled = false;
        if (roleSelect) roleSelect.disabled = false;
        if (languageSelect) languageSelect.disabled = false;
        if (updateBtn) updateBtn.disabled = false;
        if (resetPasswordBtn) resetPasswordBtn.disabled = false;
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
        const resetPasswordBtn = document.getElementById('user-reset-password-btn');
        const clearBtn = document.getElementById('user-clear-selection');

        if (profileSelect) { profileSelect.value = ''; profileSelect.disabled = true; }
        if (roleSelect) { roleSelect.value = ''; roleSelect.disabled = true; }
        if (languageSelect) { languageSelect.value = ''; languageSelect.disabled = true; }
        if (updateBtn) updateBtn.disabled = true;
        if (resetPasswordBtn) resetPasswordBtn.disabled = true;
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

    resetUserPassword: async function() {
        if (!this._selectedUserId) {
            this.showUpdateStatus('No user selected', 'error');
            return;
        }

        const userName = document.getElementById('selected-user-display')?.value || 'this user';

        // Confirm action with user
        if (!confirm(`Are you sure you want to reset the password for ${userName}?\n\nA password reset email will be sent to the user.`)) {
            return;
        }

        try {
            const apiSel = document.getElementById('api-version');
            const v = (apiSel && apiSel.value) ? apiSel.value : '63.0';

            // Salesforce REST API: DELETE to /services/data/vXX.X/sobjects/User/{userId}/password
            // This triggers a password reset email to the user
            await PlatformHelper.fetchFromSalesforce(
                `/services/data/v${v}/sobjects/User/${this._selectedUserId}/password`,
                {
                    method: 'DELETE'
                }
            );

            this.showUpdateStatus('Password reset email sent successfully!', 'success');
        } catch (error) {
            console.error('Error resetting password:', error);
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

        // PROACTIVE CHECK: Check connection status BEFORE making any API calls
        // This prevents the "Not connected to Salesforce, stopping SOQL attempts" warning
        try {
            const session = await PlatformHelper.getSession();
            if (!session || !session.isLoggedIn) {
                return {
                    _objectName: this._keyPrefixMap[keyPrefix] || `Unknown (${keyPrefix}...)`,
                    _fields: { Id: recordId },
                    _error: 'Not connected to Salesforce. Please ensure you have an active Salesforce tab open and are logged in.'
                };
            }
        } catch (sessionError) {
            // If we can't even check session, assume not connected
            return {
                _objectName: this._keyPrefixMap[keyPrefix] || `Unknown (${keyPrefix}...)`,
                _fields: { Id: recordId },
                _error: 'Not connected to Salesforce. Please ensure you have an active Salesforce tab open and are logged in.'
            };
        }

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
                const errMsg = (describeError?.message || '').toLowerCase();
                // If it's a connection error, don't try SOQL - return early with helpful message
                if (errMsg.includes('not connected') || errMsg.includes('no session') || errMsg.includes('unauthorized')) {
                    // Proactive check should have caught this, but handle gracefully as fallback
                    return {
                        _objectName: this._keyPrefixMap[keyPrefix] || `Unknown (${keyPrefix}...)`,
                        _fields: { Id: recordId },
                        _error: 'Not connected to Salesforce. Please ensure you have an active Salesforce tab open and are logged in.'
                    };
                }
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
                const errMsg = (soqlError?.message || '').toLowerCase();

                // If it's a connection error, stop immediately - no point trying more field sets
                if (errMsg.includes('not connected') || errMsg.includes('no session') ||
                    errMsg.includes('unauthorized') || errMsg.includes('invalid session')) {
                    // Proactive check should have caught this, but handle gracefully as fallback
                    return {
                        _objectName: objectName,
                        _fields: { Id: recordId },
                        _error: 'Not connected to Salesforce. Please ensure you have an active Salesforce tab open and are logged in.'
                    };
                }

                // If it's a field not found error, try with fewer fields
                if (errMsg.includes('no such column') || errMsg.includes('invalid field') || errMsg.includes('doesn\'t exist')) {
                    console.warn(`SOQL failed with fields [${fieldsToQuery}], trying with fewer fields...`);
                    continue;
                }
                // For other errors, log and continue to next field set
                console.warn('SOQL fallback failed:', soqlError);
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

        // PROACTIVE CHECK: Check connection status before making API calls
        try {
            const session = await PlatformHelper.getSession();
            if (!session || !session.isLoggedIn) {
                const keyPrefix = recordId.substring(0, 3);
                const objectName = this._keyPrefixMap[keyPrefix] || `Unknown (${keyPrefix}...)`;
                container.innerHTML = `<div class="record-detail-card">
                    <div class="record-detail-row">
                        <span class="record-detail-label">Object</span>
                        <span class="record-detail-value">${objectName}</span>
                    </div>
                    <div class="record-detail-row">
                        <span class="record-detail-label">ID</span>
                        <span class="record-detail-value"><code>${recordId}</code></span>
                    </div>
                    <div class="info-message" style="margin-top:8px;">Not connected to Salesforce. Please ensure you have an active Salesforce tab open and are logged in.</div>
                </div>`;
                return;
            }
        } catch (sessionError) {
            // Session check failed - continue anyway as API might still work
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
                            _note: `Unable to fetch record details. Please check your Salesforce connection. (${soqlFallbackError.message})`
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
            // Use CacheManager for organization-scoped history
            if (window.CacheManager) {
                this._recordHistory = window.CacheManager.getCache('recordHistory') || [];
            } else {
                // Fallback to chrome storage if CacheManager not available
                const result = await chrome.storage.local.get('recordHistory');
                this._recordHistory = result.recordHistory || [];
            }
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

        // Save to storage - use CacheManager for org-scoped caching
        try {
            if (window.CacheManager) {
                window.CacheManager.setCache('recordHistory', this._recordHistory);
            } else {
                // Fallback to chrome storage
                await chrome.storage.local.set({ recordHistory: this._recordHistory });
            }
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
            if (window.CacheManager) {
                window.CacheManager.removeCache('recordHistory');
            } else {
                // Fallback to chrome storage
                await chrome.storage.local.remove('recordHistory');
            }
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
            const errorMsg = (e?.message || 'Unknown error').toLowerCase();

            // Check for connection errors first
            if (errorMsg.includes('not connected') || errorMsg.includes('no session') || errorMsg.includes('unauthorized')) {
                container.innerHTML = '<div class="info-note">Not connected to Salesforce. Please ensure you have an active Salesforce tab open.</div>';
            } else if (errorMsg.includes('does not exist') || errorMsg.includes('invalid') || errorMsg.includes('invalid_type')) {
                container.innerHTML = `<div class="info-note">Field history tracking is not enabled for ${objectName}.</div>`;
            } else if (errorMsg.includes('invalid_field') || errorMsg.includes('no such column')) {
                container.innerHTML = '<div class="info-note">Unable to query field history. The history object may have a different structure.</div>';
            } else {
                container.innerHTML = `<div class="error-note">Error loading history: ${e.message || 'Unknown error'}</div>`;
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
            // Check connection status first to avoid unnecessary API calls
            const session = await PlatformHelper.getSession();
            if (!session || !session.isLoggedIn) {
                container.innerHTML = '<div class="info-note">Not connected to Salesforce. Please ensure you have an active Salesforce tab open.</div>';
                return;
            }

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
            const errMsg = (e?.message || '').toLowerCase();
            if (errMsg.includes('not connected') || errMsg.includes('no session') || errMsg.includes('unauthorized')) {
                container.innerHTML = '<div class="info-note">Not connected to Salesforce. Please ensure you have an active Salesforce tab open.</div>';
            } else {
                container.innerHTML = `<div class="error-note">Error loading related records: ${e.message}</div>`;
            }
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
            // Check connection status first to avoid unnecessary API calls
            const session = await PlatformHelper.getSession();
            if (!session || !session.isLoggedIn) {
                itemsContainer.innerHTML = '<div class="info-note">Not connected to Salesforce.</div>';
                return;
            }

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

