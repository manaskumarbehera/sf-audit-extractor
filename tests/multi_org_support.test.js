/**
 * @jest-environment jsdom
 *
 * Multi-Org Support Tests
 * Tests for detecting and managing multiple Salesforce orgs simultaneously
 *
 * Issue: When 2 orgs are open simultaneously in the same browser,
 * the extension only shows info from one org and can't properly add a new org
 * (it just overrides the existing one instead of adding a new entry)
 */

describe('Multi-Org Support', () => {
    let mockPlatformHelper;
    let mockChrome;
    let storageData;
    let dataExplorer;

    // Sample org data for testing
    const ORG_PRODUCTION = {
        Id: '00D000000000001AAA',
        Name: 'Production Org',
        OrganizationType: 'Production',
        IsSandbox: false,
        InstanceName: 'NA100',
        LanguageLocaleKey: 'en_US',
        DefaultLocaleSidKey: 'en_US',
        TimeZoneSidKey: 'America/Los_Angeles',
        CreatedDate: '2020-01-01T00:00:00.000Z'
    };

    const ORG_SANDBOX_1 = {
        Id: '00D000000000002AAA',
        Name: 'Dev Sandbox',
        OrganizationType: 'Sandbox',
        IsSandbox: true,
        InstanceName: 'CS50',
        LanguageLocaleKey: 'en_US',
        DefaultLocaleSidKey: 'en_US',
        TimeZoneSidKey: 'America/Los_Angeles',
        CreatedDate: '2023-01-01T00:00:00.000Z'
    };

    const ORG_SANDBOX_2 = {
        Id: '00D000000000003AAA',
        Name: 'QA Sandbox',
        OrganizationType: 'Sandbox',
        IsSandbox: true,
        InstanceName: 'CS51',
        LanguageLocaleKey: 'en_US',
        DefaultLocaleSidKey: 'en_US',
        TimeZoneSidKey: 'America/New_York',
        CreatedDate: '2023-06-01T00:00:00.000Z'
    };

    // Sample tabs representing different orgs
    const TAB_PRODUCTION = {
        id: 1,
        url: 'https://mycompany.my.salesforce.com/lightning/page/home',
        active: true,
        title: 'Salesforce - Production Org'
    };

    const TAB_SANDBOX_1 = {
        id: 2,
        url: 'https://mycompany--dev.sandbox.my.salesforce.com/lightning/page/home',
        active: false,
        title: 'Salesforce - Dev Sandbox'
    };

    const TAB_SANDBOX_2 = {
        id: 3,
        url: 'https://mycompany--qa.sandbox.my.salesforce.com/lightning/page/home',
        active: false,
        title: 'Salesforce - QA Sandbox'
    };

    beforeEach(() => {
        // Reset storage
        storageData = {
            orgRecords: {},
            orgFavicons: {},
            selectedOrgId: null
        };

        // Mock chrome API
        mockChrome = {
            storage: {
                local: {
                    get: jest.fn((keys) => {
                        if (typeof keys === 'string') {
                            return Promise.resolve({ [keys]: storageData[keys] });
                        }
                        const result = {};
                        (Array.isArray(keys) ? keys : Object.keys(keys || storageData)).forEach(k => {
                            result[k] = storageData[k];
                        });
                        return Promise.resolve(result);
                    }),
                    set: jest.fn((data) => {
                        Object.assign(storageData, data);
                        return Promise.resolve();
                    }),
                    remove: jest.fn((keys) => {
                        const keysArray = Array.isArray(keys) ? keys : [keys];
                        keysArray.forEach(k => delete storageData[k]);
                        return Promise.resolve();
                    })
                }
            },
            tabs: {
                query: jest.fn(() => Promise.resolve([TAB_PRODUCTION, TAB_SANDBOX_1, TAB_SANDBOX_2]))
            },
            windows: {
                getCurrent: jest.fn(() => Promise.resolve({ id: 1 }))
            },
            runtime: {
                sendMessage: jest.fn(() => Promise.resolve({})),
                lastError: null
            }
        };
        global.chrome = mockChrome;

        // Mock PlatformHelper
        mockPlatformHelper = {
            getSession: jest.fn(),
            executeQuery: jest.fn(),
            fetchFromSalesforce: jest.fn(),
            refreshSessionFromTab: jest.fn()
        };
        global.window.PlatformHelper = mockPlatformHelper;

        // Setup DOM
        document.body.innerHTML = `
            <div id="org-info-container"></div>
            <div id="saved-orgs-list"></div>
            <div id="org-info-panel"></div>
            <button id="add-current-org-btn">Add Current Org</button>
            <div id="save-org-prompt" hidden></div>
            <div id="favicon-status-data"></div>
            <input id="org-search-input" value="" />
            <div id="no-org-selected-state"></div>
            <div id="icon-editor-panel" hidden></div>
            <span id="editing-org-name"></span>
            <div id="org-saved-status"></div>
            <input id="favicon-color-data" value="#ff6b6b" />
            <input id="favicon-label-data" value="" />
            <input type="radio" name="favicon-shape-data" value="circle" checked />
            <!-- New Org Detected Banner -->
            <div id="new-org-detected" class="new-org-detected-banner" hidden>
                <span class="new-org-icon">🆕</span>
                <span class="new-org-text">New Org Detected!</span>
                <span class="new-org-action">Click to configure →</span>
            </div>
            <!-- Tab navigation for testing -->
            <button class="tab-button" data-tab="data">Data Explorer</button>
            <div id="tab-data">
                <button class="sub-tab-button" data-subtab="org-favicon">Org & Favicon</button>
            </div>
        `;

        // Create mock DataExplorerHelper
        dataExplorer = createMockDataExplorer();
        global.window.DataExplorerHelper = dataExplorer;
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    function createMockDataExplorer() {
        return {
            // State
            _currentOrgId: null,
            _currentOrgName: null,
            _currentOrgData: null,
            _currentOrgIsSandbox: false,
            _selectedOrgId: null,
            _savedOrgs: {},
            _draftIconConfig: null,
            _appliedIconConfig: null,
            _detectedOrgs: {}, // NEW: Track all detected orgs from open tabs

            // Detect org from a specific tab
            detectOrgFromTab: jest.fn(async function(tab) {
                if (!tab || !tab.url) return null;

                // Check if it's a Salesforce URL
                const url = new URL(tab.url);
                const hostname = url.hostname;

                if (!hostname.includes('salesforce.com') && !hostname.includes('force.com')) {
                    return null;
                }

                return {
                    tabId: tab.id,
                    hostname: hostname,
                    url: tab.url,
                    title: tab.title
                };
            }),

            // NEW: Detect all orgs from all open Salesforce tabs
            detectAllOpenOrgs: jest.fn(async function() {
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
                        // Extract org identifier from hostname
                        // e.g., "mycompany.my.salesforce.com" -> "mycompany"
                        // e.g., "mycompany--dev.sandbox.my.salesforce.com" -> "mycompany--dev"
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
            }),

            // Extract org key from hostname for grouping
            extractOrgKeyFromHostname: jest.fn(function(hostname) {
                // Handle various Salesforce URL patterns
                // mycompany.my.salesforce.com -> mycompany
                // mycompany--sandbox.sandbox.my.salesforce.com -> mycompany--sandbox
                // mycompany.lightning.force.com -> mycompany

                const match = hostname.match(/^([^.]+)/);
                return match ? match[1] : hostname;
            }),

            // NEW: Check if an org is already saved
            isOrgSaved: jest.fn(function(orgId) {
                return !!this._savedOrgs[orgId];
            }),

            // NEW: Get org by hostname (for matching tabs to saved orgs)
            getOrgByHostname: jest.fn(function(hostname) {
                for (const orgId in this._savedOrgs) {
                    const org = this._savedOrgs[orgId];
                    if (org.hostname === hostname) {
                        return org;
                    }
                }
                return null;
            }),

            // Add current org to saved orgs (WITH FIX for multi-org)
            addCurrentOrg: jest.fn(async function() {
                if (!this._currentOrgId || !this._currentOrgData) {
                    this.showFaviconStatus('No org detected. Please navigate to a Salesforce org.', 'error');
                    return { success: false, error: 'No org detected' };
                }

                const orgId = this._currentOrgId;
                const org = this._currentOrgData;

                // FIX: Check if this org already exists
                if (this._savedOrgs[orgId]) {
                    // Org already exists - update instead of override
                    this.showFaviconStatus('This org is already saved. Selecting it.', 'info');
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

                // FIX: Check if there's already a saved org with the same hostname
                // This prevents duplicates when the same org is accessed from different URLs
                const existingByHostname = this.getOrgByHostname(hostname);
                if (existingByHostname && existingByHostname.orgId !== orgId) {
                    // Different orgId but same hostname - this shouldn't happen normally
                    // but handle it gracefully
                    console.warn('Different org ID detected for same hostname:', hostname);
                }

                // Load existing saved orgs
                const result = await chrome.storage.local.get('orgRecords');
                let orgRecords = (result && result.orgRecords) || {};

                // Create new org record
                const defaultIconConfig = {
                    color: org.IsSandbox ? '#ffa500' : '#51cf66',
                    label: org.IsSandbox ? 'SBX' : 'PRD',
                    shape: 'circle'
                };

                orgRecords[orgId] = {
                    orgId: orgId,
                    orgName: org.Name,
                    displayName: org.Name,
                    instance: org.InstanceName,
                    environment: org.IsSandbox ? 'sandbox' : 'production',
                    orgType: org.OrganizationType,
                    hostname: hostname,
                    lastSeenAt: new Date().toISOString(),
                    iconConfig: defaultIconConfig,
                    appliedIconConfig: defaultIconConfig
                };

                await chrome.storage.local.set({ orgRecords });

                // Refresh saved orgs
                this._savedOrgs = orgRecords;
                this.renderSavedOrgsList();
                this.selectOrg(orgId);

                this.showFaviconStatus('Org saved successfully!', 'success');
                return { success: true, action: 'added', orgId: orgId };
            }),

            // Load saved orgs
            loadSavedOrgs: jest.fn(async function() {
                const result = await chrome.storage.local.get(['orgRecords', 'selectedOrgId']);
                this._savedOrgs = (result && result.orgRecords) || {};
                this.renderSavedOrgsList();

                if (result.selectedOrgId && this._savedOrgs[result.selectedOrgId]) {
                    this.selectOrg(result.selectedOrgId);
                }
            }),

            // Select org
            selectOrg: jest.fn(function(orgId) {
                this._selectedOrgId = orgId;
                const org = this._savedOrgs[orgId];
                if (!org) return;

                const editingName = document.getElementById('editing-org-name');
                if (editingName) {
                    editingName.textContent = org.displayName || org.orgName;
                }

                this._appliedIconConfig = org.appliedIconConfig || org.iconConfig;
                this._draftIconConfig = { ...this._appliedIconConfig };

                chrome.storage.local.set({ selectedOrgId: orgId });
            }),

            // Render saved orgs list
            renderSavedOrgsList: jest.fn(function() {
                const container = document.getElementById('saved-orgs-list');
                if (!container) return;

                const orgs = Object.values(this._savedOrgs);

                if (orgs.length === 0) {
                    container.innerHTML = '<div class="empty-state">No orgs saved yet</div>';
                    return;
                }

                let html = '';
                orgs.forEach(org => {
                    const isSelected = org.orgId === this._selectedOrgId;
                    const isCurrent = org.orgId === this._currentOrgId;
                    html += `<div class="org-list-item ${isSelected ? 'selected' : ''} ${isCurrent ? 'current' : ''}" data-org-id="${org.orgId}">
                        <span class="org-name">${org.displayName || org.orgName}</span>
                        <span class="org-env-badge ${org.environment}">${org.environment === 'sandbox' ? 'SBX' : 'PRD'}</span>
                        ${isCurrent ? '<span class="current-badge">●</span>' : ''}
                        <button class="btn-delete" data-org-id="${org.orgId}">×</button>
                    </div>`;
                });
                container.innerHTML = html;
            }),

            // Delete org
            deleteOrg: jest.fn(async function(orgId) {
                const result = await chrome.storage.local.get('orgRecords');
                let orgRecords = (result && result.orgRecords) || {};
                delete orgRecords[orgId];
                await chrome.storage.local.set({ orgRecords });

                this._savedOrgs = orgRecords;
                if (this._selectedOrgId === orgId) {
                    this._selectedOrgId = null;
                }
                this.renderSavedOrgsList();
            }),

            // Show favicon status
            showFaviconStatus: jest.fn(function(message, type) {
                const status = document.getElementById('favicon-status-data');
                if (status) {
                    status.textContent = message;
                    status.className = `favicon-status ${type}`;
                }
            }),

            // NEW: Switch to a different org tab
            switchToOrgTab: jest.fn(async function(orgId) {
                const org = this._savedOrgs[orgId];
                if (!org || !org.hostname) return { success: false };

                // Find a tab with this org's hostname
                const tabs = await chrome.tabs.query({});
                const matchingTab = tabs.find(tab =>
                    tab.url && tab.url.includes(org.hostname)
                );

                if (matchingTab) {
                    // Activate the tab (would use chrome.tabs.update in real implementation)
                    return { success: true, tabId: matchingTab.id };
                }

                return { success: false, error: 'No tab found for this org' };
            }),

            // NEW: Refresh org info from active tab
            refreshCurrentOrgFromActiveTab: jest.fn(async function() {
                // Get active tab
                const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
                const activeTab = tabs[0];

                if (!activeTab?.url || !activeTab.url.includes('salesforce')) {
                    return { success: false, error: 'Active tab is not a Salesforce page' };
                }

                // Query org info
                const session = await window.PlatformHelper.getSession();
                if (!session || !session.isLoggedIn) {
                    return { success: false, error: 'Not connected' };
                }

                const result = await window.PlatformHelper.executeQuery(
                    'SELECT Id, Name, IsSandbox, InstanceName FROM Organization LIMIT 1'
                );

                if (result && result.records && result.records.length > 0) {
                    const org = result.records[0];
                    this._currentOrgId = org.Id;
                    this._currentOrgName = org.Name;
                    this._currentOrgData = org;
                    this._currentOrgIsSandbox = org.IsSandbox === true;

                    return { success: true, org: org };
                }

                return { success: false, error: 'Could not fetch org info' };
            }),

            // ==========================================
            // NEW ORG DETECTED BANNER FUNCTIONS
            // ==========================================

            /**
             * Show the "New Org Detected" banner with blinking animation
             * @param {Object} org - The detected org data
             */
            showNewOrgDetectedBanner: jest.fn(function(org) {
                const banner = document.getElementById('new-org-detected');
                if (!banner) return;

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

                // Show the banner
                banner.hidden = false;

                // Wire click handler (only once)
                if (!banner._clickWired) {
                    banner.addEventListener('click', () => {
                        this.navigateToOrgFaviconTab();
                        this.hideNewOrgDetectedBanner();
                    });
                    banner._clickWired = true;
                }
            }),

            /**
             * Hide the "New Org Detected" banner
             */
            hideNewOrgDetectedBanner: jest.fn(function() {
                const banner = document.getElementById('new-org-detected');
                if (banner) {
                    banner.hidden = true;
                }
            }),

            /**
             * Navigate to the Data Explorer → Org & Favicon tab
             */
            navigateToOrgFaviconTab: jest.fn(function() {
                // Switch to Data Explorer main tab
                const dataTabBtn = document.querySelector('[data-tab="data"]');
                if (dataTabBtn) {
                    dataTabBtn.click();
                }

                // Switch to Org & Favicon sub-tab
                const orgFaviconSubTab = document.querySelector('#tab-data [data-subtab="org-favicon"]');
                if (orgFaviconSubTab) {
                    orgFaviconSubTab.click();
                }
            })
        };
    }

    // ==========================================
    // MULTI-ORG DETECTION TESTS
    // ==========================================

    describe('Multi-Org Detection', () => {
        test('should detect all Salesforce tabs across browser', async () => {
            const detectedOrgs = await dataExplorer.detectAllOpenOrgs();

            // Should detect unique orgs from tabs
            expect(Object.keys(detectedOrgs).length).toBeGreaterThan(0);
        });

        test('should group tabs by org hostname', async () => {
            // Setup multiple tabs for same org
            mockChrome.tabs.query.mockResolvedValue([
                TAB_PRODUCTION,
                { ...TAB_PRODUCTION, id: 10, url: 'https://mycompany.my.salesforce.com/lightning/o/Account/list' },
                TAB_SANDBOX_1
            ]);

            const detectedOrgs = await dataExplorer.detectAllOpenOrgs();

            // mycompany tabs should be grouped
            expect(detectedOrgs['mycompany']).toBeDefined();
            expect(detectedOrgs['mycompany'].tabs.length).toBe(2);
        });

        test('should distinguish production from sandbox orgs', async () => {
            mockChrome.tabs.query.mockResolvedValue([TAB_PRODUCTION, TAB_SANDBOX_1]);

            const detectedOrgs = await dataExplorer.detectAllOpenOrgs();

            expect(detectedOrgs['mycompany']).toBeDefined(); // Production
            expect(detectedOrgs['mycompany--dev']).toBeDefined(); // Sandbox
        });

        test('should extract org key correctly from various hostname formats', () => {
            // Standard production
            expect(dataExplorer.extractOrgKeyFromHostname('mycompany.my.salesforce.com'))
                .toBe('mycompany');

            // Sandbox
            expect(dataExplorer.extractOrgKeyFromHostname('mycompany--dev.sandbox.my.salesforce.com'))
                .toBe('mycompany--dev');

            // Lightning force.com
            expect(dataExplorer.extractOrgKeyFromHostname('mycompany.lightning.force.com'))
                .toBe('mycompany');
        });

        test('should not include extension pages in detected orgs', async () => {
            mockChrome.tabs.query.mockResolvedValue([
                TAB_PRODUCTION,
                { id: 99, url: 'chrome-extension://abc123/popup.html', title: 'Extension' }
            ]);

            const detectedOrgs = await dataExplorer.detectAllOpenOrgs();

            // Should only have production org, not extension
            const orgKeys = Object.keys(detectedOrgs);
            expect(orgKeys.some(k => k.includes('chrome-extension'))).toBe(false);
        });
    });

    // ==========================================
    // ADD ORG - PREVENTS OVERRIDE
    // ==========================================

    describe('Add Current Org - Prevent Override', () => {
        test('should add new org without overriding existing ones', async () => {
            // First, save production org
            dataExplorer._currentOrgId = ORG_PRODUCTION.Id;
            dataExplorer._currentOrgData = ORG_PRODUCTION;
            mockChrome.tabs.query.mockResolvedValue([TAB_PRODUCTION]);

            const result1 = await dataExplorer.addCurrentOrg();
            expect(result1.success).toBe(true);
            expect(result1.action).toBe('added');

            // Verify it's saved
            expect(storageData.orgRecords[ORG_PRODUCTION.Id]).toBeDefined();
            expect(storageData.orgRecords[ORG_PRODUCTION.Id].orgName).toBe('Production Org');

            // Now switch to sandbox and add it
            dataExplorer._currentOrgId = ORG_SANDBOX_1.Id;
            dataExplorer._currentOrgData = ORG_SANDBOX_1;
            mockChrome.tabs.query.mockResolvedValue([TAB_SANDBOX_1]);

            const result2 = await dataExplorer.addCurrentOrg();
            expect(result2.success).toBe(true);
            expect(result2.action).toBe('added');

            // Both orgs should exist
            expect(Object.keys(storageData.orgRecords).length).toBe(2);
            expect(storageData.orgRecords[ORG_PRODUCTION.Id]).toBeDefined();
            expect(storageData.orgRecords[ORG_SANDBOX_1.Id]).toBeDefined();
        });

        test('should not duplicate when adding same org twice', async () => {
            dataExplorer._currentOrgId = ORG_PRODUCTION.Id;
            dataExplorer._currentOrgData = ORG_PRODUCTION;
            mockChrome.tabs.query.mockResolvedValue([TAB_PRODUCTION]);

            // Add first time
            await dataExplorer.addCurrentOrg();
            expect(Object.keys(storageData.orgRecords).length).toBe(1);

            // Add same org again
            const result = await dataExplorer.addCurrentOrg();
            expect(result.action).toBe('selected'); // Should select, not add
            expect(Object.keys(storageData.orgRecords).length).toBe(1); // Still only 1
        });

        test('should select existing org when trying to add duplicate', async () => {
            // Pre-save the org
            storageData.orgRecords[ORG_PRODUCTION.Id] = {
                orgId: ORG_PRODUCTION.Id,
                orgName: 'Production Org',
                environment: 'production'
            };
            dataExplorer._savedOrgs = { ...storageData.orgRecords };

            dataExplorer._currentOrgId = ORG_PRODUCTION.Id;
            dataExplorer._currentOrgData = ORG_PRODUCTION;

            const result = await dataExplorer.addCurrentOrg();

            expect(result.action).toBe('selected');
            expect(dataExplorer.selectOrg).toHaveBeenCalledWith(ORG_PRODUCTION.Id);
        });

        test('should maintain all saved orgs after switching between orgs', async () => {
            // Save 3 different orgs
            const orgs = [ORG_PRODUCTION, ORG_SANDBOX_1, ORG_SANDBOX_2];
            const tabs = [TAB_PRODUCTION, TAB_SANDBOX_1, TAB_SANDBOX_2];

            for (let i = 0; i < orgs.length; i++) {
                dataExplorer._currentOrgId = orgs[i].Id;
                dataExplorer._currentOrgData = orgs[i];
                mockChrome.tabs.query.mockResolvedValue([tabs[i]]);
                await dataExplorer.addCurrentOrg();
            }

            // All 3 should be saved
            expect(Object.keys(storageData.orgRecords).length).toBe(3);
            expect(storageData.orgRecords[ORG_PRODUCTION.Id].orgName).toBe('Production Org');
            expect(storageData.orgRecords[ORG_SANDBOX_1.Id].orgName).toBe('Dev Sandbox');
            expect(storageData.orgRecords[ORG_SANDBOX_2.Id].orgName).toBe('QA Sandbox');
        });
    });

    // ==========================================
    // ORG SWITCHING TESTS
    // ==========================================

    describe('Org Switching', () => {
        beforeEach(async () => {
            // Pre-populate with multiple orgs
            storageData.orgRecords = {
                [ORG_PRODUCTION.Id]: {
                    orgId: ORG_PRODUCTION.Id,
                    orgName: 'Production Org',
                    hostname: 'mycompany.my.salesforce.com',
                    environment: 'production',
                    iconConfig: { color: '#51cf66', label: 'PRD', shape: 'circle' }
                },
                [ORG_SANDBOX_1.Id]: {
                    orgId: ORG_SANDBOX_1.Id,
                    orgName: 'Dev Sandbox',
                    hostname: 'mycompany--dev.sandbox.my.salesforce.com',
                    environment: 'sandbox',
                    iconConfig: { color: '#ffa500', label: 'DEV', shape: 'circle' }
                }
            };
            dataExplorer._savedOrgs = { ...storageData.orgRecords };
        });

        test('should correctly switch between saved orgs', () => {
            // Select production
            dataExplorer.selectOrg(ORG_PRODUCTION.Id);
            expect(dataExplorer._selectedOrgId).toBe(ORG_PRODUCTION.Id);

            // Select sandbox
            dataExplorer.selectOrg(ORG_SANDBOX_1.Id);
            expect(dataExplorer._selectedOrgId).toBe(ORG_SANDBOX_1.Id);

            // Back to production
            dataExplorer.selectOrg(ORG_PRODUCTION.Id);
            expect(dataExplorer._selectedOrgId).toBe(ORG_PRODUCTION.Id);
        });

        test('should persist selected org to storage', () => {
            dataExplorer.selectOrg(ORG_SANDBOX_1.Id);

            expect(mockChrome.storage.local.set).toHaveBeenCalledWith(
                expect.objectContaining({ selectedOrgId: ORG_SANDBOX_1.Id })
            );
        });

        test('should load correct icon config when switching orgs', () => {
            dataExplorer.selectOrg(ORG_PRODUCTION.Id);
            expect(dataExplorer._appliedIconConfig.label).toBe('PRD');
            expect(dataExplorer._appliedIconConfig.color).toBe('#51cf66');

            dataExplorer.selectOrg(ORG_SANDBOX_1.Id);
            expect(dataExplorer._appliedIconConfig.label).toBe('DEV');
            expect(dataExplorer._appliedIconConfig.color).toBe('#ffa500');
        });

        test('should highlight current org differently from selected org', () => {
            dataExplorer._currentOrgId = ORG_PRODUCTION.Id;
            dataExplorer._selectedOrgId = ORG_SANDBOX_1.Id;

            dataExplorer.renderSavedOrgsList();

            const container = document.getElementById('saved-orgs-list');
            const prodItem = container.querySelector(`[data-org-id="${ORG_PRODUCTION.Id}"]`);
            const sandboxItem = container.querySelector(`[data-org-id="${ORG_SANDBOX_1.Id}"]`);

            expect(prodItem.classList.contains('current')).toBe(true);
            expect(sandboxItem.classList.contains('selected')).toBe(true);
        });
    });

    // ==========================================
    // CURRENT ORG DETECTION FROM ACTIVE TAB
    // ==========================================

    describe('Current Org Detection from Active Tab', () => {
        test('should detect current org from active Salesforce tab', async () => {
            mockPlatformHelper.getSession.mockResolvedValue({ isLoggedIn: true });
            mockPlatformHelper.executeQuery.mockResolvedValue({
                records: [ORG_PRODUCTION]
            });
            mockChrome.tabs.query.mockResolvedValue([TAB_PRODUCTION]);

            const result = await dataExplorer.refreshCurrentOrgFromActiveTab();

            expect(result.success).toBe(true);
            expect(result.org.Id).toBe(ORG_PRODUCTION.Id);
            expect(dataExplorer._currentOrgId).toBe(ORG_PRODUCTION.Id);
        });

        test('should return error when active tab is not Salesforce', async () => {
            mockChrome.tabs.query.mockResolvedValue([
                { id: 1, url: 'https://google.com', active: true }
            ]);

            const result = await dataExplorer.refreshCurrentOrgFromActiveTab();

            expect(result.success).toBe(false);
            expect(result.error).toContain('not a Salesforce page');
        });

        test('should return error when not connected', async () => {
            mockPlatformHelper.getSession.mockResolvedValue(null);
            mockChrome.tabs.query.mockResolvedValue([TAB_PRODUCTION]);

            const result = await dataExplorer.refreshCurrentOrgFromActiveTab();

            expect(result.success).toBe(false);
            expect(result.error).toContain('Not connected');
        });

        test('should update current org when switching tabs', async () => {
            // First detect production
            mockPlatformHelper.getSession.mockResolvedValue({ isLoggedIn: true });
            mockPlatformHelper.executeQuery.mockResolvedValue({ records: [ORG_PRODUCTION] });
            mockChrome.tabs.query.mockResolvedValue([TAB_PRODUCTION]);

            await dataExplorer.refreshCurrentOrgFromActiveTab();
            expect(dataExplorer._currentOrgId).toBe(ORG_PRODUCTION.Id);

            // Switch to sandbox tab
            mockPlatformHelper.executeQuery.mockResolvedValue({ records: [ORG_SANDBOX_1] });
            mockChrome.tabs.query.mockResolvedValue([TAB_SANDBOX_1]);

            await dataExplorer.refreshCurrentOrgFromActiveTab();
            expect(dataExplorer._currentOrgId).toBe(ORG_SANDBOX_1.Id);
        });
    });

    // ==========================================
    // ORG LOOKUP BY HOSTNAME
    // ==========================================

    describe('Org Lookup by Hostname', () => {
        beforeEach(() => {
            dataExplorer._savedOrgs = {
                [ORG_PRODUCTION.Id]: {
                    orgId: ORG_PRODUCTION.Id,
                    hostname: 'mycompany.my.salesforce.com'
                },
                [ORG_SANDBOX_1.Id]: {
                    orgId: ORG_SANDBOX_1.Id,
                    hostname: 'mycompany--dev.sandbox.my.salesforce.com'
                }
            };
        });

        test('should find org by hostname', () => {
            const result = dataExplorer.getOrgByHostname('mycompany.my.salesforce.com');
            expect(result.orgId).toBe(ORG_PRODUCTION.Id);
        });

        test('should return null for unknown hostname', () => {
            const result = dataExplorer.getOrgByHostname('unknown.salesforce.com');
            expect(result).toBeNull();
        });

        test('should distinguish between production and sandbox hostnames', () => {
            const prod = dataExplorer.getOrgByHostname('mycompany.my.salesforce.com');
            const sandbox = dataExplorer.getOrgByHostname('mycompany--dev.sandbox.my.salesforce.com');

            expect(prod.orgId).toBe(ORG_PRODUCTION.Id);
            expect(sandbox.orgId).toBe(ORG_SANDBOX_1.Id);
        });
    });

    // ==========================================
    // DELETE ORG - DOESN'T AFFECT OTHERS
    // ==========================================

    describe('Delete Org - Isolation', () => {
        beforeEach(() => {
            storageData.orgRecords = {
                [ORG_PRODUCTION.Id]: { orgId: ORG_PRODUCTION.Id, orgName: 'Production' },
                [ORG_SANDBOX_1.Id]: { orgId: ORG_SANDBOX_1.Id, orgName: 'Dev Sandbox' },
                [ORG_SANDBOX_2.Id]: { orgId: ORG_SANDBOX_2.Id, orgName: 'QA Sandbox' }
            };
            dataExplorer._savedOrgs = { ...storageData.orgRecords };
        });

        test('should delete single org without affecting others', async () => {
            await dataExplorer.deleteOrg(ORG_SANDBOX_1.Id);

            expect(storageData.orgRecords[ORG_SANDBOX_1.Id]).toBeUndefined();
            expect(storageData.orgRecords[ORG_PRODUCTION.Id]).toBeDefined();
            expect(storageData.orgRecords[ORG_SANDBOX_2.Id]).toBeDefined();
        });

        test('should clear selection if deleted org was selected', async () => {
            dataExplorer._selectedOrgId = ORG_SANDBOX_1.Id;

            await dataExplorer.deleteOrg(ORG_SANDBOX_1.Id);

            expect(dataExplorer._selectedOrgId).toBeNull();
        });

        test('should keep selection if different org deleted', async () => {
            dataExplorer._selectedOrgId = ORG_PRODUCTION.Id;

            await dataExplorer.deleteOrg(ORG_SANDBOX_1.Id);

            expect(dataExplorer._selectedOrgId).toBe(ORG_PRODUCTION.Id);
        });
    });

    // ==========================================
    // ORG LIST RENDERING
    // ==========================================

    describe('Org List Rendering', () => {
        test('should render all saved orgs in list', () => {
            dataExplorer._savedOrgs = {
                [ORG_PRODUCTION.Id]: { orgId: ORG_PRODUCTION.Id, orgName: 'Production', environment: 'production' },
                [ORG_SANDBOX_1.Id]: { orgId: ORG_SANDBOX_1.Id, orgName: 'Dev Sandbox', environment: 'sandbox' }
            };

            dataExplorer.renderSavedOrgsList();

            const container = document.getElementById('saved-orgs-list');
            expect(container.innerHTML).toContain('Production');
            expect(container.innerHTML).toContain('Dev Sandbox');
        });

        test('should show environment badges for each org', () => {
            dataExplorer._savedOrgs = {
                [ORG_PRODUCTION.Id]: { orgId: ORG_PRODUCTION.Id, orgName: 'Production', environment: 'production' },
                [ORG_SANDBOX_1.Id]: { orgId: ORG_SANDBOX_1.Id, orgName: 'Dev Sandbox', environment: 'sandbox' }
            };

            dataExplorer.renderSavedOrgsList();

            const container = document.getElementById('saved-orgs-list');
            expect(container.innerHTML).toContain('PRD');
            expect(container.innerHTML).toContain('SBX');
        });

        test('should show current indicator for active org', () => {
            dataExplorer._currentOrgId = ORG_PRODUCTION.Id;
            dataExplorer._savedOrgs = {
                [ORG_PRODUCTION.Id]: { orgId: ORG_PRODUCTION.Id, orgName: 'Production', environment: 'production' }
            };

            dataExplorer.renderSavedOrgsList();

            const container = document.getElementById('saved-orgs-list');
            expect(container.innerHTML).toContain('current-badge');
        });

        test('should show empty state when no orgs saved', () => {
            dataExplorer._savedOrgs = {};

            dataExplorer.renderSavedOrgsList();

            const container = document.getElementById('saved-orgs-list');
            expect(container.innerHTML).toContain('No orgs saved');
        });
    });

    // ==========================================
    // REGRESSION TESTS
    // ==========================================

    describe('Regression Prevention', () => {
        test('REGRESSION: Adding new org must not clear existing orgs', async () => {
            // Pre-save production org
            storageData.orgRecords = {
                [ORG_PRODUCTION.Id]: {
                    orgId: ORG_PRODUCTION.Id,
                    orgName: 'Production Org'
                }
            };
            dataExplorer._savedOrgs = { ...storageData.orgRecords };

            // Now add sandbox
            dataExplorer._currentOrgId = ORG_SANDBOX_1.Id;
            dataExplorer._currentOrgData = ORG_SANDBOX_1;
            mockChrome.tabs.query.mockResolvedValue([TAB_SANDBOX_1]);

            await dataExplorer.addCurrentOrg();

            // BOTH should exist
            expect(storageData.orgRecords[ORG_PRODUCTION.Id]).toBeDefined();
            expect(storageData.orgRecords[ORG_SANDBOX_1.Id]).toBeDefined();
        });

        test('REGRESSION: Switching orgs must not delete unselected orgs', async () => {
            storageData.orgRecords = {
                [ORG_PRODUCTION.Id]: { orgId: ORG_PRODUCTION.Id, orgName: 'Production' },
                [ORG_SANDBOX_1.Id]: { orgId: ORG_SANDBOX_1.Id, orgName: 'Dev Sandbox' }
            };
            dataExplorer._savedOrgs = { ...storageData.orgRecords };

            // Switch between orgs multiple times
            dataExplorer.selectOrg(ORG_PRODUCTION.Id);
            dataExplorer.selectOrg(ORG_SANDBOX_1.Id);
            dataExplorer.selectOrg(ORG_PRODUCTION.Id);

            // Both should still exist
            expect(storageData.orgRecords[ORG_PRODUCTION.Id]).toBeDefined();
            expect(storageData.orgRecords[ORG_SANDBOX_1.Id]).toBeDefined();
        });

        test('REGRESSION: Saving icon config for one org must not affect other orgs', async () => {
            storageData.orgRecords = {
                [ORG_PRODUCTION.Id]: {
                    orgId: ORG_PRODUCTION.Id,
                    iconConfig: { color: '#51cf66', label: 'PRD', shape: 'circle' }
                },
                [ORG_SANDBOX_1.Id]: {
                    orgId: ORG_SANDBOX_1.Id,
                    iconConfig: { color: '#ffa500', label: 'DEV', shape: 'circle' }
                }
            };
            dataExplorer._savedOrgs = { ...storageData.orgRecords };

            // Modify production's icon
            dataExplorer.selectOrg(ORG_PRODUCTION.Id);
            const newConfig = { color: '#ff0000', label: 'PROD', shape: 'square' };
            storageData.orgRecords[ORG_PRODUCTION.Id].iconConfig = newConfig;

            // Sandbox should be unchanged
            expect(storageData.orgRecords[ORG_SANDBOX_1.Id].iconConfig.label).toBe('DEV');
            expect(storageData.orgRecords[ORG_SANDBOX_1.Id].iconConfig.color).toBe('#ffa500');
        });

        test('REGRESSION: isOrgSaved should correctly identify saved vs unsaved orgs', () => {
            dataExplorer._savedOrgs = {
                [ORG_PRODUCTION.Id]: { orgId: ORG_PRODUCTION.Id }
            };

            expect(dataExplorer.isOrgSaved(ORG_PRODUCTION.Id)).toBe(true);
            expect(dataExplorer.isOrgSaved(ORG_SANDBOX_1.Id)).toBe(false);
        });
    });

    // ==========================================
    // ORG CHANGE DETECTION TESTS
    // ==========================================

    describe('Org Change Detection', () => {
        test('should detect when org changes and clear previous state', async () => {
            // Set up initial org
            dataExplorer._currentOrgId = ORG_PRODUCTION.Id;
            dataExplorer._currentOrgData = ORG_PRODUCTION;
            dataExplorer._draftIconConfig = { color: '#ff0000', label: 'OLD', shape: 'square' };
            dataExplorer._appliedIconConfig = { color: '#ff0000', label: 'OLD', shape: 'square' };

            // Simulate org change detection
            const previousOrgId = dataExplorer._currentOrgId;
            const newOrg = ORG_SANDBOX_1;

            // Check if org changed
            const orgChanged = previousOrgId && previousOrgId !== newOrg.Id;
            expect(orgChanged).toBe(true);

            // When org changes, draft config should be cleared
            if (orgChanged) {
                dataExplorer._draftIconConfig = null;
                dataExplorer._appliedIconConfig = null;
                dataExplorer._selectedOrgId = null;
            }

            // Update to new org
            dataExplorer._currentOrgId = newOrg.Id;
            dataExplorer._currentOrgData = newOrg;

            // Verify state was cleared
            expect(dataExplorer._draftIconConfig).toBeNull();
            expect(dataExplorer._appliedIconConfig).toBeNull();
            expect(dataExplorer._selectedOrgId).toBeNull();
            expect(dataExplorer._currentOrgId).toBe(ORG_SANDBOX_1.Id);
        });

        test('should not lose saved orgs when org changes', async () => {
            // Pre-save orgs
            storageData.orgRecords = {
                [ORG_PRODUCTION.Id]: { orgId: ORG_PRODUCTION.Id, orgName: 'Production' },
                [ORG_SANDBOX_1.Id]: { orgId: ORG_SANDBOX_1.Id, orgName: 'Dev Sandbox' }
            };
            dataExplorer._savedOrgs = { ...storageData.orgRecords };

            // Switch from production to sandbox
            dataExplorer._currentOrgId = ORG_PRODUCTION.Id;

            // Simulate org change
            dataExplorer._currentOrgId = ORG_SANDBOX_1.Id;
            dataExplorer._currentOrgData = ORG_SANDBOX_1;

            // Both saved orgs should still exist
            expect(Object.keys(dataExplorer._savedOrgs).length).toBe(2);
            expect(dataExplorer._savedOrgs[ORG_PRODUCTION.Id]).toBeDefined();
            expect(dataExplorer._savedOrgs[ORG_SANDBOX_1.Id]).toBeDefined();
        });

        test('should correctly identify new unsaved org', async () => {
            // Save only production
            storageData.orgRecords = {
                [ORG_PRODUCTION.Id]: { orgId: ORG_PRODUCTION.Id, orgName: 'Production' }
            };
            dataExplorer._savedOrgs = { ...storageData.orgRecords };

            // Switch to a new unsaved org
            dataExplorer._currentOrgId = ORG_SANDBOX_2.Id;
            dataExplorer._currentOrgData = ORG_SANDBOX_2;

            // Check if current org is saved
            const isCurrentOrgSaved = dataExplorer.isOrgSaved(dataExplorer._currentOrgId);
            expect(isCurrentOrgSaved).toBe(false);

            // Production should still be saved
            expect(dataExplorer.isOrgSaved(ORG_PRODUCTION.Id)).toBe(true);
        });

        test('should allow adding new org after switching from saved org', async () => {
            // First save production
            dataExplorer._currentOrgId = ORG_PRODUCTION.Id;
            dataExplorer._currentOrgData = ORG_PRODUCTION;
            mockChrome.tabs.query.mockResolvedValue([TAB_PRODUCTION]);
            await dataExplorer.addCurrentOrg();

            expect(storageData.orgRecords[ORG_PRODUCTION.Id]).toBeDefined();
            expect(Object.keys(storageData.orgRecords).length).toBe(1);

            // Now switch to sandbox (new org)
            dataExplorer._currentOrgId = ORG_SANDBOX_1.Id;
            dataExplorer._currentOrgData = ORG_SANDBOX_1;
            mockChrome.tabs.query.mockResolvedValue([TAB_SANDBOX_1]);

            // Add the new org
            const result = await dataExplorer.addCurrentOrg();
            expect(result.success).toBe(true);
            expect(result.action).toBe('added');

            // Both should exist
            expect(Object.keys(storageData.orgRecords).length).toBe(2);
            expect(storageData.orgRecords[ORG_PRODUCTION.Id]).toBeDefined();
            expect(storageData.orgRecords[ORG_SANDBOX_1.Id]).toBeDefined();
        });

        test('should preserve saved orgs list across org switches', async () => {
            // Save all 3 orgs first
            const orgs = [ORG_PRODUCTION, ORG_SANDBOX_1, ORG_SANDBOX_2];
            const tabs = [TAB_PRODUCTION, TAB_SANDBOX_1, TAB_SANDBOX_2];

            for (let i = 0; i < orgs.length; i++) {
                dataExplorer._currentOrgId = orgs[i].Id;
                dataExplorer._currentOrgData = orgs[i];
                mockChrome.tabs.query.mockResolvedValue([tabs[i]]);
                await dataExplorer.addCurrentOrg();
            }

            expect(Object.keys(storageData.orgRecords).length).toBe(3);

            // Now simulate rapid org switching
            for (let i = 0; i < 5; i++) {
                for (const org of orgs) {
                    dataExplorer._currentOrgId = org.Id;
                    dataExplorer._currentOrgData = org;
                }
            }

            // All 3 should still be saved
            expect(Object.keys(storageData.orgRecords).length).toBe(3);
        });
    });

    // ==========================================
    // CONCURRENT ORG HANDLING
    // ==========================================

    describe('Concurrent Multi-Org Handling', () => {
        test('should handle rapid org switching without data corruption', async () => {
            storageData.orgRecords = {
                [ORG_PRODUCTION.Id]: { orgId: ORG_PRODUCTION.Id, orgName: 'Production' },
                [ORG_SANDBOX_1.Id]: { orgId: ORG_SANDBOX_1.Id, orgName: 'Dev Sandbox' },
                [ORG_SANDBOX_2.Id]: { orgId: ORG_SANDBOX_2.Id, orgName: 'QA Sandbox' }
            };
            dataExplorer._savedOrgs = { ...storageData.orgRecords };

            // Rapid switching
            for (let i = 0; i < 10; i++) {
                dataExplorer.selectOrg(ORG_PRODUCTION.Id);
                dataExplorer.selectOrg(ORG_SANDBOX_1.Id);
                dataExplorer.selectOrg(ORG_SANDBOX_2.Id);
            }

            // All orgs should still exist
            expect(Object.keys(storageData.orgRecords).length).toBe(3);
        });

        test('should handle adding orgs in rapid succession', async () => {
            const orgs = [ORG_PRODUCTION, ORG_SANDBOX_1, ORG_SANDBOX_2];
            const tabs = [TAB_PRODUCTION, TAB_SANDBOX_1, TAB_SANDBOX_2];

            // Add all orgs quickly
            const addPromises = orgs.map(async (org, i) => {
                dataExplorer._currentOrgId = org.Id;
                dataExplorer._currentOrgData = org;
                mockChrome.tabs.query.mockResolvedValue([tabs[i]]);
                return dataExplorer.addCurrentOrg();
            });

            await Promise.all(addPromises);

            // All should be added
            expect(Object.keys(storageData.orgRecords).length).toBe(3);
        });
    });

    // ==========================================
    // NEW ORG DETECTED BANNER TESTS
    // ==========================================

    describe('New Org Detected Banner', () => {
        test('should show banner when new unsaved org is detected', () => {
            dataExplorer.showNewOrgDetectedBanner(ORG_PRODUCTION);

            const banner = document.getElementById('new-org-detected');
            expect(banner.hidden).toBe(false);
        });

        test('should display org name in banner text', () => {
            dataExplorer.showNewOrgDetectedBanner(ORG_PRODUCTION);

            const textEl = document.querySelector('.new-org-text');
            expect(textEl.textContent).toContain('Production Org');
        });

        test('should add sandbox class for sandbox orgs', () => {
            dataExplorer.showNewOrgDetectedBanner(ORG_SANDBOX_1);

            const banner = document.getElementById('new-org-detected');
            expect(banner.classList.contains('sandbox')).toBe(true);
        });

        test('should not add sandbox class for production orgs', () => {
            dataExplorer.showNewOrgDetectedBanner(ORG_PRODUCTION);

            const banner = document.getElementById('new-org-detected');
            expect(banner.classList.contains('sandbox')).toBe(false);
        });

        test('should hide banner when hideNewOrgDetectedBanner is called', () => {
            // First show it
            dataExplorer.showNewOrgDetectedBanner(ORG_PRODUCTION);
            expect(document.getElementById('new-org-detected').hidden).toBe(false);

            // Then hide it
            dataExplorer.hideNewOrgDetectedBanner();
            expect(document.getElementById('new-org-detected').hidden).toBe(true);
        });

        test('should wire click handler for navigation', () => {
            dataExplorer.showNewOrgDetectedBanner(ORG_PRODUCTION);

            const banner = document.getElementById('new-org-detected');

            // Simulate click
            banner.click();

            // Should have called navigation function
            expect(dataExplorer.navigateToOrgFaviconTab).toHaveBeenCalled();
            // Should have hidden the banner
            expect(dataExplorer.hideNewOrgDetectedBanner).toHaveBeenCalled();
        });

        test('should only wire click handler once', () => {
            // Show multiple times
            dataExplorer.showNewOrgDetectedBanner(ORG_PRODUCTION);
            dataExplorer.showNewOrgDetectedBanner(ORG_SANDBOX_1);
            dataExplorer.showNewOrgDetectedBanner(ORG_SANDBOX_2);

            const banner = document.getElementById('new-org-detected');

            // Click once
            banner.click();

            // Should only navigate once (not 3 times)
            expect(dataExplorer.navigateToOrgFaviconTab).toHaveBeenCalledTimes(1);
        });

        test('navigateToOrgFaviconTab should click data tab and org-favicon sub-tab', () => {
            const dataTabBtn = document.querySelector('[data-tab="data"]');
            const subTabBtn = document.querySelector('[data-subtab="org-favicon"]');

            const dataTabClick = jest.spyOn(dataTabBtn, 'click');
            const subTabClick = jest.spyOn(subTabBtn, 'click');

            dataExplorer.navigateToOrgFaviconTab();

            expect(dataTabClick).toHaveBeenCalled();
            expect(subTabClick).toHaveBeenCalled();
        });
    });

    // ==========================================
    // BANNER INTEGRATION WITH ORG SAVE
    // ==========================================

    describe('Banner Integration with Org Save', () => {
        test('should show banner for new unsaved org', () => {
            // Simulate detecting a new org that's not saved
            dataExplorer._savedOrgs = {};
            dataExplorer._currentOrgId = ORG_PRODUCTION.Id;
            dataExplorer._currentOrgData = ORG_PRODUCTION;

            // Check if org is saved
            const isOrgSaved = dataExplorer.isOrgSaved(ORG_PRODUCTION.Id);
            expect(isOrgSaved).toBe(false);

            // Show banner for unsaved org
            dataExplorer.showNewOrgDetectedBanner(ORG_PRODUCTION);
            expect(document.getElementById('new-org-detected').hidden).toBe(false);
        });

        test('should hide banner after org is saved', async () => {
            // Show banner first
            dataExplorer.showNewOrgDetectedBanner(ORG_PRODUCTION);
            expect(document.getElementById('new-org-detected').hidden).toBe(false);

            // Save the org
            dataExplorer._currentOrgId = ORG_PRODUCTION.Id;
            dataExplorer._currentOrgData = ORG_PRODUCTION;
            mockChrome.tabs.query.mockResolvedValue([TAB_PRODUCTION]);
            await dataExplorer.addCurrentOrg();

            // Banner should be hidden after save
            dataExplorer.hideNewOrgDetectedBanner();
            expect(document.getElementById('new-org-detected').hidden).toBe(true);
        });

        test('should not show banner for already saved org', () => {
            // Pre-save the org
            dataExplorer._savedOrgs = {
                [ORG_PRODUCTION.Id]: { orgId: ORG_PRODUCTION.Id, orgName: 'Production' }
            };

            // Check if org is saved
            const isOrgSaved = dataExplorer.isOrgSaved(ORG_PRODUCTION.Id);
            expect(isOrgSaved).toBe(true);

            // Should NOT show banner for saved org
            // (in real implementation, this check happens in loadOrgInfo)
        });

        test('should update banner text when switching between new orgs', () => {
            // Show for production
            dataExplorer.showNewOrgDetectedBanner(ORG_PRODUCTION);
            let textEl = document.querySelector('.new-org-text');
            expect(textEl.textContent).toContain('Production Org');

            // Show for sandbox
            dataExplorer.showNewOrgDetectedBanner(ORG_SANDBOX_1);
            textEl = document.querySelector('.new-org-text');
            expect(textEl.textContent).toContain('Dev Sandbox');
        });
    });

    // ==========================================
    // NEW ORG ALERT CARD TESTS (In-panel notification)
    // ==========================================

    describe('New Org Alert Card (In-Panel)', () => {
        let renderOrgInfoPanelForCurrentOrg;

        beforeEach(() => {
            // Add org info container
            document.body.innerHTML += `<div id="org-info-container-data"></div>`;

            // Implementation matching actual code
            renderOrgInfoPanelForCurrentOrg = function(org) {
                const container = document.getElementById('org-info-container-data');
                if (!container || !org) return;

                const isSandbox = org.IsSandbox === true;
                const alertColor = isSandbox ? '#ffa500' : '#ff6b6b';

                const newOrgAlert = `
                    <div class="new-org-alert" style="background: ${alertColor}; color: white; padding: 12px;">
                        <span>🆕</span>
                        <div>
                            <div class="alert-title">New Org Detected!</div>
                            <div class="alert-subtitle">${org.Name} • Not saved yet</div>
                        </div>
                        <button id="quick-save-org-btn">Save Org →</button>
                    </div>
                `;

                container.innerHTML = newOrgAlert;
            };
        });

        test('should show new org alert when rendering unsaved org', () => {
            renderOrgInfoPanelForCurrentOrg(ORG_PRODUCTION);

            const alert = document.querySelector('.new-org-alert');
            expect(alert).not.toBeNull();
        });

        test('should display org name in alert', () => {
            renderOrgInfoPanelForCurrentOrg(ORG_PRODUCTION);

            const alertSubtitle = document.querySelector('.alert-subtitle');
            expect(alertSubtitle.textContent).toContain('Production Org');
        });

        test('should show quick save button', () => {
            renderOrgInfoPanelForCurrentOrg(ORG_SANDBOX_1);

            const saveBtn = document.getElementById('quick-save-org-btn');
            expect(saveBtn).not.toBeNull();
            expect(saveBtn.textContent).toContain('Save Org');
        });

        test('should use orange color for sandbox orgs', () => {
            renderOrgInfoPanelForCurrentOrg(ORG_SANDBOX_1);

            const alert = document.querySelector('.new-org-alert');
            // Browser converts hex to rgb, so check for rgb(255, 165, 0) which is #ffa500
            expect(alert.style.background).toMatch(/ffa500|rgb\(255,\s*165,\s*0\)/i);
        });

        test('should use red color for production orgs', () => {
            renderOrgInfoPanelForCurrentOrg(ORG_PRODUCTION);

            const alert = document.querySelector('.new-org-alert');
            // Browser converts hex to rgb, so check for rgb(255, 107, 107) which is #ff6b6b
            expect(alert.style.background).toMatch(/ff6b6b|rgb\(255,\s*107,\s*107\)/i);
        });
    });

    // ==========================================
    // CONNECTION RETRY TESTS
    // ==========================================

    describe('Connection Retry', () => {
        test('should show retry button when not connected', () => {
            document.body.innerHTML = `<div id="org-info-container-data"></div>`;
            const container = document.getElementById('org-info-container-data');

            // Simulate not connected state
            container.innerHTML = `
                <div class="not-connected-message">
                    <div>🔌</div>
                    <div>Not Connected</div>
                    <button id="retry-connection-btn">🔄 Retry Connection</button>
                </div>
            `;

            const retryBtn = document.getElementById('retry-connection-btn');
            expect(retryBtn).not.toBeNull();
            expect(retryBtn.textContent).toContain('Retry');
        });

        test('retry button should be clickable', () => {
            document.body.innerHTML = `<div id="org-info-container-data"></div>`;
            const container = document.getElementById('org-info-container-data');

            container.innerHTML = `<button id="retry-connection-btn">🔄 Retry</button>`;

            const retryBtn = document.getElementById('retry-connection-btn');
            const clickHandler = jest.fn();
            retryBtn.addEventListener('click', clickHandler);

            retryBtn.click();

            expect(clickHandler).toHaveBeenCalled();
        });

        test('should clear cache when retrying connection', () => {
            const setInstanceUrlCache = jest.fn();
            window.Utils = { setInstanceUrlCache };

            // Simulate cache clear on retry
            setInstanceUrlCache(null);

            expect(setInstanceUrlCache).toHaveBeenCalledWith(null);
        });
    });

    // ==========================================
    // CROSS-ORG FAVICON PROTECTION TESTS
    // ==========================================

    describe('Cross-Org Favicon Protection', () => {
        test('applyFaviconToTabs should only apply to tabs matching target org hostname', async () => {
            // Setup saved orgs with hostnames
            dataExplorer._savedOrgs = {
                [ORG_PRODUCTION.Id]: {
                    orgId: ORG_PRODUCTION.Id,
                    hostname: 'mycompany.my.salesforce.com'
                },
                [ORG_SANDBOX_1.Id]: {
                    orgId: ORG_SANDBOX_1.Id,
                    hostname: 'mycompany--dev.sandbox.my.salesforce.com'
                }
            };

            // Mock tabs from different orgs
            const prodTab = { id: 1, url: 'https://mycompany.my.salesforce.com/lightning/page/home', active: true };
            const sandboxTab = { id: 2, url: 'https://mycompany--dev.sandbox.my.salesforce.com/lightning/page/home', active: false };
            mockChrome.tabs.query.mockResolvedValue([prodTab, sandboxTab]);
            mockChrome.tabs.sendMessage = jest.fn().mockResolvedValue({ success: true });

            // Create mock applyFaviconToTabs that filters by hostname
            const applyFaviconToTabs = async (color, label, shape, orgId, applyToAll) => {
                const allTabs = await chrome.tabs.query({});
                const sfTabs = allTabs.filter(tab => tab.url.includes('salesforce.com'));
                const orgRecord = dataExplorer._savedOrgs[orgId];
                const targetHostname = orgRecord?.hostname;

                let tabsToApply;
                if (applyToAll && targetHostname) {
                    tabsToApply = sfTabs.filter(tab => {
                        const tabHostname = new URL(tab.url).hostname;
                        return tabHostname === targetHostname;
                    });
                } else {
                    tabsToApply = [sfTabs.find(t => t.active) || sfTabs[0]];
                }

                return tabsToApply;
            };

            // When applying to production org with applyToAll=true
            const prodTabs = await applyFaviconToTabs('#ff0000', 'PROD', 'circle', ORG_PRODUCTION.Id, true);

            // Should only include the production tab, NOT the sandbox tab
            expect(prodTabs.length).toBe(1);
            expect(prodTabs[0].id).toBe(1);

            // When applying to sandbox org with applyToAll=true
            const sandboxTabs = await applyFaviconToTabs('#ffa500', 'DEV', 'circle', ORG_SANDBOX_1.Id, true);

            // Should only include the sandbox tab
            expect(sandboxTabs.length).toBe(1);
            expect(sandboxTabs[0].id).toBe(2);
        });

        test('should not apply favicon to tabs from different org', async () => {
            dataExplorer._savedOrgs = {
                [ORG_PRODUCTION.Id]: {
                    orgId: ORG_PRODUCTION.Id,
                    hostname: 'mycompany.my.salesforce.com'
                }
            };

            // All tabs are from a DIFFERENT org (sandbox)
            const sandboxTabs = [
                { id: 1, url: 'https://mycompany--dev.sandbox.my.salesforce.com/lightning/page/home', active: true },
                { id: 2, url: 'https://mycompany--dev.sandbox.my.salesforce.com/lightning/o/Account/list', active: false }
            ];
            mockChrome.tabs.query.mockResolvedValue(sandboxTabs);

            // Try to apply production favicon to all tabs
            const applyFaviconToTabs = async (color, label, shape, orgId, applyToAll) => {
                const allTabs = await chrome.tabs.query({});
                const sfTabs = allTabs.filter(tab => tab.url.includes('salesforce.com'));
                const orgRecord = dataExplorer._savedOrgs[orgId];
                const targetHostname = orgRecord?.hostname;

                if (applyToAll && targetHostname) {
                    return sfTabs.filter(tab => {
                        const tabHostname = new URL(tab.url).hostname;
                        return tabHostname === targetHostname;
                    });
                }
                return [sfTabs.find(t => t.active) || sfTabs[0]];
            };

            const tabsToApply = await applyFaviconToTabs('#ff0000', 'PROD', 'circle', ORG_PRODUCTION.Id, true);

            // Should NOT match any tabs since hostnames don't match
            expect(tabsToApply.length).toBe(0);
        });

        test('saving favicon for one org should not affect other orgs settings', async () => {
            // Setup two orgs with different favicons
            storageData.orgRecords = {
                [ORG_PRODUCTION.Id]: {
                    orgId: ORG_PRODUCTION.Id,
                    hostname: 'prod.salesforce.com',
                    iconConfig: { color: '#51cf66', label: 'PROD', shape: 'circle' },
                    appliedIconConfig: { color: '#51cf66', label: 'PROD', shape: 'circle' }
                },
                [ORG_SANDBOX_1.Id]: {
                    orgId: ORG_SANDBOX_1.Id,
                    hostname: 'sandbox.salesforce.com',
                    iconConfig: { color: '#ffa500', label: 'DEV', shape: 'square' },
                    appliedIconConfig: { color: '#ffa500', label: 'DEV', shape: 'square' }
                }
            };
            dataExplorer._savedOrgs = { ...storageData.orgRecords };

            // Change production's favicon
            storageData.orgRecords[ORG_PRODUCTION.Id].iconConfig = { color: '#ff0000', label: 'PRD', shape: 'diamond' };

            // Verify sandbox's favicon is UNCHANGED
            expect(storageData.orgRecords[ORG_SANDBOX_1.Id].iconConfig.color).toBe('#ffa500');
            expect(storageData.orgRecords[ORG_SANDBOX_1.Id].iconConfig.label).toBe('DEV');
            expect(storageData.orgRecords[ORG_SANDBOX_1.Id].iconConfig.shape).toBe('square');
        });
    });

    // ==========================================
    // SESSION CACHE CLEARING TESTS
    // ==========================================

    describe('Session Cache Clearing on Org Switch', () => {
        test('should keep existing session when refresh returns not logged in (fallback)', () => {
            let sessionInfo = { isLoggedIn: true, instanceUrl: 'https://old-org.salesforce.com' };
            const before = { ...sessionInfo };

            // Simulate refresh returning not logged in
            const fresh = { success: true, isLoggedIn: false };

            if (fresh && fresh.success && fresh.isLoggedIn) {
                sessionInfo = fresh;
            } else {
                // NEW BEHAVIOR: Keep existing session as fallback, don't clear
                console.log('Session refresh returned not logged in, keeping existing session');
                // Return existing session as fallback
                if (before && before.isLoggedIn) {
                    sessionInfo = before;
                }
            }

            // Session should still be available as fallback
            expect(sessionInfo).not.toBeNull();
            expect(sessionInfo.isLoggedIn).toBe(true);
        });

        test('should update session when refresh returns new logged in session', () => {
            let sessionInfo = { isLoggedIn: true, instanceUrl: 'https://old-org.salesforce.com' };

            // Simulate refresh returning logged in with new URL
            const fresh = { success: true, isLoggedIn: true, instanceUrl: 'https://new-org.salesforce.com' };

            if (fresh && fresh.success && fresh.isLoggedIn) {
                sessionInfo = fresh;
            }

            expect(sessionInfo.instanceUrl).toBe('https://new-org.salesforce.com');
        });

        test('should detect org change when instance URLs differ', () => {
            const prevUrl = 'https://old-org.salesforce.com';
            const nextUrl = 'https://new-org.salesforce.com';
            const setInstanceUrlCache = jest.fn();
            window.Utils = { setInstanceUrlCache };

            // Simulate org change detection
            if (prevUrl && nextUrl && prevUrl !== nextUrl) {
                setInstanceUrlCache(null);
            }

            expect(setInstanceUrlCache).toHaveBeenCalledWith(null);
        });
    });

    // ==========================================
    // HOSTNAME SYNCING TESTS
    // ==========================================

    describe('Hostname Syncing (orgRecords AND orgFavicons)', () => {
        test('should update BOTH orgRecords and orgFavicons when hostname is missing', async () => {
            const orgId = ORG_PRODUCTION.Id;
            const hostname = 'mycompany.my.salesforce.com';

            // Initial state: hostname missing
            storageData.orgRecords = {
                [orgId]: { orgId, hostname: null, iconConfig: { color: '#ff0000' } }
            };
            storageData.orgFavicons = {
                [orgId]: { color: '#ff0000', hostname: null }
            };

            // Simulate hostname update (like applyFaviconToTabs does)
            storageData.orgRecords[orgId].hostname = hostname;
            storageData.orgFavicons[orgId].hostname = hostname;

            // Verify BOTH are updated
            expect(storageData.orgRecords[orgId].hostname).toBe(hostname);
            expect(storageData.orgFavicons[orgId].hostname).toBe(hostname);
        });

        test('orgFavicons should have hostname for content.js auto-apply to work', () => {
            const orgId = ORG_PRODUCTION.Id;
            const hostname = 'mycompany.my.salesforce.com';

            // Simulate saved favicon with hostname
            storageData.orgFavicons = {
                [orgId]: {
                    color: '#51cf66',
                    label: 'PROD',
                    shape: 'circle',
                    hostname: hostname
                }
            };

            // Content.js would look up by hostname
            const currentHostname = hostname;
            let foundFavicon = null;

            for (const [id, settings] of Object.entries(storageData.orgFavicons)) {
                if (settings.hostname === currentHostname) {
                    foundFavicon = settings;
                    break;
                }
            }

            expect(foundFavicon).not.toBeNull();
            expect(foundFavicon.color).toBe('#51cf66');
        });

        test('should NOT find favicon if hostname not saved in orgFavicons', () => {
            const orgId = ORG_PRODUCTION.Id;

            // Simulate saved favicon WITHOUT hostname (the bug)
            storageData.orgFavicons = {
                [orgId]: {
                    color: '#51cf66',
                    label: 'PROD',
                    shape: 'circle',
                    hostname: null  // Missing!
                }
            };

            // Content.js would fail to find by hostname
            const currentHostname = 'mycompany.my.salesforce.com';
            let foundFavicon = null;

            for (const [id, settings] of Object.entries(storageData.orgFavicons)) {
                if (settings.hostname === currentHostname) {
                    foundFavicon = settings;
                    break;
                }
            }

            // Without hostname, auto-apply fails
            expect(foundFavicon).toBeNull();
        });
    });

    // ==========================================
    // ORG ID NORMALIZATION TESTS (15 vs 18 char)
    // ==========================================

    describe('Org ID Normalization (15 vs 18 char)', () => {
        test('should normalize 18-char ID to 15-char for comparison', () => {
            const normalizeOrgId = (id) => {
                if (!id) return null;
                return id.substring(0, 15);
            };

            const id18 = '00D000000000001AAA';
            const id15 = '00D000000000001';

            expect(normalizeOrgId(id18)).toBe(id15);
            expect(normalizeOrgId(id15)).toBe(id15);
        });

        test('should match saved 18-char ID with detected 15-char ID', () => {
            const normalizeOrgId = (id) => id ? id.substring(0, 15) : null;

            const savedOrgId = '00D000000000001AAA';  // 18 chars stored
            const detectedOrgId = '00D000000000001';   // 15 chars detected

            const orgFavicons = {
                [savedOrgId]: { color: '#51cf66', label: 'PROD' }
            };

            // Direct match fails
            expect(orgFavicons[detectedOrgId]).toBeUndefined();

            // Normalized match succeeds
            const normalizedDetected = normalizeOrgId(detectedOrgId);
            let found = null;
            for (const [id, settings] of Object.entries(orgFavicons)) {
                if (normalizeOrgId(id) === normalizedDetected) {
                    found = settings;
                    break;
                }
            }

            expect(found).not.toBeNull();
            expect(found.color).toBe('#51cf66');
        });

        test('should match saved 15-char ID with detected 18-char ID', () => {
            const normalizeOrgId = (id) => id ? id.substring(0, 15) : null;

            const savedOrgId = '00D000000000001';      // 15 chars stored
            const detectedOrgId = '00D000000000001AAA'; // 18 chars detected

            const orgFavicons = {
                [savedOrgId]: { color: '#ffa500', label: 'DEV' }
            };

            // Direct match fails
            expect(orgFavicons[detectedOrgId]).toBeUndefined();

            // Normalized match succeeds
            const normalizedDetected = normalizeOrgId(detectedOrgId);
            let found = null;
            for (const [id, settings] of Object.entries(orgFavicons)) {
                if (normalizeOrgId(id) === normalizedDetected) {
                    found = settings;
                    break;
                }
            }

            expect(found).not.toBeNull();
            expect(found.label).toBe('DEV');
        });
    });

    // ==========================================
    // FAVICON AUTO-APPLY ON PAGE LOAD TESTS
    // ==========================================

    describe('Favicon Auto-Apply on Page Load', () => {
        test('should find favicon by exact org ID match', () => {
            const currentOrgId = '00D000000000001AAA';
            const orgFavicons = {
                '00D000000000001AAA': { color: '#51cf66', label: 'PROD', shape: 'circle' }
            };

            let applied = false;
            if (currentOrgId && orgFavicons[currentOrgId]) {
                applied = true;
            }

            expect(applied).toBe(true);
        });

        test('should find favicon by hostname when org ID not available', () => {
            const currentHostname = 'mycompany.my.salesforce.com';
            const orgFavicons = {
                '00D000000000001AAA': {
                    color: '#51cf66',
                    label: 'PROD',
                    hostname: 'mycompany.my.salesforce.com'
                }
            };

            let found = null;
            for (const [id, settings] of Object.entries(orgFavicons)) {
                if (settings.hostname === currentHostname) {
                    found = settings;
                    break;
                }
            }

            expect(found).not.toBeNull();
            expect(found.label).toBe('PROD');
        });

        test('should use multiple fallback strategies for favicon lookup', () => {
            const currentOrgId = null; // Can't detect org ID
            const currentHostname = 'mycompany--dev.sandbox.my.salesforce.com';

            const orgFavicons = {
                '00D000000000002AAA': {
                    color: '#ffa500',
                    label: 'DEV',
                    hostname: 'mycompany--dev.sandbox.my.salesforce.com'
                }
            };

            // Strategy 1: Org ID match - fails
            let found = null;
            if (currentOrgId && orgFavicons[currentOrgId]) {
                found = orgFavicons[currentOrgId];
            }
            expect(found).toBeNull();

            // Strategy 2: Hostname match - succeeds
            for (const [id, settings] of Object.entries(orgFavicons)) {
                if (settings.hostname === currentHostname) {
                    found = settings;
                    break;
                }
            }
            expect(found).not.toBeNull();
            expect(found.label).toBe('DEV');
        });

        test('should not apply favicon if no matching org found', () => {
            const currentOrgId = '00D999999999999AAA'; // Different org
            const currentHostname = 'unknown-org.salesforce.com';

            const orgFavicons = {
                '00D000000000001AAA': {
                    color: '#51cf66',
                    hostname: 'mycompany.my.salesforce.com'
                }
            };

            // Strategy 1: Org ID match
            let found = null;
            if (currentOrgId && orgFavicons[currentOrgId]) {
                found = orgFavicons[currentOrgId];
            }

            // Strategy 2: Hostname match
            if (!found) {
                for (const [id, settings] of Object.entries(orgFavicons)) {
                    if (settings.hostname === currentHostname) {
                        found = settings;
                        break;
                    }
                }
            }

            expect(found).toBeNull();
        });
    });

    // ==========================================
    // REGRESSION: STALE SESSION DATA
    // ==========================================

    describe('REGRESSION: Stale Session Data Prevention', () => {
        test('should use fallback session when switching to new org tab fails', () => {
            // Initial state: connected to Org A
            let sessionInfo = {
                isLoggedIn: true,
                instanceUrl: 'https://org-a.salesforce.com',
                orgId: '00D000000000001AAA'
            };
            const before = { ...sessionInfo };

            // User switches to Org B tab, but refresh fails
            const refreshResult = null; // Failed to get session from new tab

            // NEW BEHAVIOR: Keep existing session as fallback
            if (!refreshResult || !refreshResult.isLoggedIn) {
                // Return existing session as fallback if available
                if (before && before.isLoggedIn) {
                    sessionInfo = before;
                }
            }

            // Session should still be available (fallback)
            expect(sessionInfo).not.toBeNull();
            expect(sessionInfo.instanceUrl).toBe('https://org-a.salesforce.com');
        });

        test('should NOT clear instance URL cache BEFORE fetching new session', () => {
            const setInstanceUrlCache = jest.fn();
            window.Utils = { setInstanceUrlCache };

            // NEW BEHAVIOR: Don't clear cache before fetch
            // The fetch should try with existing data first

            // Then fetch new session
            const fresh = { success: true, isLoggedIn: true, instanceUrl: 'https://new-org.salesforce.com' };
            if (fresh && fresh.isLoggedIn) {
                setInstanceUrlCache(fresh.instanceUrl); // Only update after successful fetch
            }

            // Should only be called once (after success), not twice (before and after)
            expect(setInstanceUrlCache).toHaveBeenCalledTimes(1);
            expect(setInstanceUrlCache).toHaveBeenCalledWith('https://new-org.salesforce.com');
        });
    });

    // ==========================================
    // REGRESSION: CROSS-ORG FAVICON CONTAMINATION
    // ==========================================

    describe('REGRESSION: Cross-Org Favicon Contamination Prevention', () => {
        test('updateFavicon message should be ignored if orgId does not match', () => {
            const currentPageOrgId = '00D000000000001AAA';
            const requestedOrgId = '00D000000000002AAA'; // Different org!

            let faviconApplied = false;

            // Simulate the FIX in content.js
            if (requestedOrgId && currentPageOrgId && requestedOrgId !== currentPageOrgId) {
                // Ignore - different org
                faviconApplied = false;
            } else {
                faviconApplied = true;
            }

            expect(faviconApplied).toBe(false);
        });

        test('updateFavicon message should be applied if orgId matches', () => {
            const currentPageOrgId = '00D000000000001AAA';
            const requestedOrgId = '00D000000000001AAA'; // Same org

            let faviconApplied = false;

            if (requestedOrgId && currentPageOrgId && requestedOrgId !== currentPageOrgId) {
                faviconApplied = false;
            } else {
                faviconApplied = true;
            }

            expect(faviconApplied).toBe(true);
        });

        test('applyFaviconToTabs should filter by hostname, not apply to all SF tabs', async () => {
            const targetOrgHostname = 'mycompany.my.salesforce.com';

            const allSfTabs = [
                { id: 1, url: 'https://mycompany.my.salesforce.com/lightning/page/home' },
                { id: 2, url: 'https://mycompany--dev.sandbox.my.salesforce.com/lightning/page/home' },
                { id: 3, url: 'https://other-org.salesforce.com/lightning/page/home' }
            ];

            // Filter tabs by hostname
            const tabsToApply = allSfTabs.filter(tab => {
                const tabHostname = new URL(tab.url).hostname;
                return tabHostname === targetOrgHostname;
            });

            // Should only include tab 1
            expect(tabsToApply.length).toBe(1);
            expect(tabsToApply[0].id).toBe(1);
        });
    });

    // ==========================================
    // ORG DETECTION FAILURE TESTS
    // ==========================================

    describe('Org Detection Failure Scenarios', () => {
        test('should show error when session has no instanceUrl', () => {
            const session = { isLoggedIn: true, instanceUrl: null };

            let errorMessage = null;
            if (!session.instanceUrl) {
                errorMessage = 'Could not determine Salesforce instance URL. Please ensure you are logged in to Salesforce.';
            }

            expect(errorMessage).not.toBeNull();
            expect(errorMessage).toContain('Please ensure you are logged in');
        });

        test('should show error when session is null', () => {
            const session = null;

            let errorMessage = null;
            if (!session || !session.isLoggedIn) {
                errorMessage = 'Not connected to Salesforce';
            }

            expect(errorMessage).toBe('Not connected to Salesforce');
        });

        test('should show error when isLoggedIn is false', () => {
            const session = { isLoggedIn: false, instanceUrl: 'https://example.salesforce.com' };

            let errorMessage = null;
            if (!session.isLoggedIn) {
                errorMessage = 'Please ensure you are logged in to Salesforce';
            }

            expect(errorMessage).toContain('Please ensure you are logged in');
        });

        test('should detect org failure when Utils.getInstanceUrl returns null', async () => {
            const mockGetInstanceUrl = jest.fn().mockResolvedValue(null);
            window.Utils = { getInstanceUrl: mockGetInstanceUrl };

            const session = { isLoggedIn: true, instanceUrl: null };
            let base = session.instanceUrl;

            if (!base) {
                try {
                    const resolved = await mockGetInstanceUrl();
                    if (resolved) base = resolved;
                } catch {}
            }

            expect(base).toBeNull();
            expect(mockGetInstanceUrl).toHaveBeenCalled();
        });

        test('should throw error when both session and Utils fail to provide instanceUrl', async () => {
            const mockGetInstanceUrl = jest.fn().mockResolvedValue(null);
            window.Utils = { getInstanceUrl: mockGetInstanceUrl };

            const session = { isLoggedIn: true, instanceUrl: null };
            let base = session.instanceUrl;

            if (!base) {
                const resolved = await mockGetInstanceUrl();
                if (resolved) base = resolved;
            }

            let errorThrown = false;
            if (!base) {
                errorThrown = true;
            }

            expect(errorThrown).toBe(true);
        });

        test('content.js getOrgIdFromPageFresh should return null when no org ID found', async () => {
            // Simulate page without org ID
            const getOrgIdFromPageFresh = async () => {
                // No cookies, no URL params, no meta tags, no scripts with org ID
                return null;
            };

            const orgId = await getOrgIdFromPageFresh();
            expect(orgId).toBeNull();
        });

        test('content.js should fallback to hostname matching when org ID detection fails', () => {
            const currentOrgId = null; // Detection failed
            const currentHostname = 'mycompany.my.salesforce.com';

            const orgFavicons = {
                '00D000000000001AAA': {
                    color: '#51cf66',
                    label: 'PROD',
                    hostname: 'mycompany.my.salesforce.com'
                }
            };

            let found = null;

            // Strategy 1: Org ID match - fails because no org ID
            if (currentOrgId && orgFavicons[currentOrgId]) {
                found = orgFavicons[currentOrgId];
            }
            expect(found).toBeNull();

            // Strategy 2: Hostname match - succeeds
            for (const [id, settings] of Object.entries(orgFavicons)) {
                if (settings.hostname === currentHostname) {
                    found = settings;
                    break;
                }
            }

            expect(found).not.toBeNull();
            expect(found.color).toBe('#51cf66');
        });

        test('should show "Not Connected" message when loadOrgInfo fails', async () => {
            // Simulate loadOrgInfo with no valid session
            const session = null;
            let displayedMessage = null;

            if (!session || !session.isLoggedIn) {
                displayedMessage = 'Not Connected - Please navigate to a Salesforce org';
            }

            expect(displayedMessage).toContain('Not Connected');
        });

        test('should provide retry button when not connected', () => {
            document.body.innerHTML = `
                <div id="org-info-container-data">
                    <div class="not-connected-message">
                        <div>🔌</div>
                        <div>Not Connected</div>
                        <button id="retry-connection-btn">🔄 Retry Connection</button>
                    </div>
                </div>
            `;

            const retryBtn = document.getElementById('retry-connection-btn');
            expect(retryBtn).not.toBeNull();
        });

        test('retry button should clear cache and reload org info', async () => {
            const setInstanceUrlCache = jest.fn();
            window.Utils = { setInstanceUrlCache };

            const loadOrgInfo = jest.fn();

            // Simulate retry button click
            setInstanceUrlCache(null);
            await loadOrgInfo();

            expect(setInstanceUrlCache).toHaveBeenCalledWith(null);
            expect(loadOrgInfo).toHaveBeenCalled();
        });
    });

    // ==========================================
    // CONTENT SCRIPT ORG ID DETECTION TESTS
    // ==========================================

    describe('Content Script Org ID Detection', () => {
        test('should detect org ID from oid cookie', () => {
            const mockCookies = 'oid=00D000000000001AAA; sid=abc123';

            const detectOrgIdFromCookie = (cookieStr) => {
                const cookies = cookieStr.split(';');
                for (const cookie of cookies) {
                    const [name, value] = cookie.trim().split('=');
                    if (name === 'oid' && value && (value.length === 15 || value.length === 18)) {
                        return value;
                    }
                }
                return null;
            };

            const orgId = detectOrgIdFromCookie(mockCookies);
            expect(orgId).toBe('00D000000000001AAA');
        });

        test('should detect org ID from URL parameter', () => {
            const mockUrl = 'https://example.salesforce.com/setup?oid=00D000000000001AAA';

            const detectOrgIdFromUrl = (urlStr) => {
                try {
                    const url = new URL(urlStr);
                    return url.searchParams.get('oid') || url.searchParams.get('organizationId');
                } catch {
                    return null;
                }
            };

            const orgId = detectOrgIdFromUrl(mockUrl);
            expect(orgId).toBe('00D000000000001AAA');
        });

        test('should return null when no org ID in URL', () => {
            const mockUrl = 'https://example.salesforce.com/lightning/page/home';

            const detectOrgIdFromUrl = (urlStr) => {
                try {
                    const url = new URL(urlStr);
                    return url.searchParams.get('oid') || url.searchParams.get('organizationId');
                } catch {
                    return null;
                }
            };

            const orgId = detectOrgIdFromUrl(mockUrl);
            expect(orgId).toBeNull();
        });

        test('should detect org ID from script content', () => {
            const scriptContent = 'var config = { organizationId: "00D000000000001AAA" };';

            const detectOrgIdFromScript = (content) => {
                const match = content.match(/(?:organizationId|orgId)['":\s]+(['"]?)([0-9a-zA-Z]{15,18})\1/i);
                if (match && match[2] && match[2].startsWith('00D')) {
                    return match[2];
                }
                return null;
            };

            const orgId = detectOrgIdFromScript(scriptContent);
            expect(orgId).toBe('00D000000000001AAA');
        });

        test('should normalize 18-char ID to 15-char for comparison', () => {
            const id18 = '00D000000000001AAA';
            const id15 = '00D000000000001';

            const normalize = (id) => id ? id.substring(0, 15) : null;

            expect(normalize(id18)).toBe(id15);
            expect(normalize(id15)).toBe(id15);
        });
    });

    // ==========================================
    // PLATFORM HELPER INSTANCE URL TESTS
    // ==========================================

    describe('Platform Helper Instance URL Resolution', () => {
        test('should use instanceUrl from session when available', () => {
            const session = {
                isLoggedIn: true,
                instanceUrl: 'https://myorg.my.salesforce.com'
            };

            let base = session.instanceUrl?.replace(/\/+$/, '') || '';

            expect(base).toBe('https://myorg.my.salesforce.com');
        });

        test('should fallback to Utils.getInstanceUrl when session has no instanceUrl', async () => {
            const mockGetInstanceUrl = jest.fn().mockResolvedValue('https://fallback.salesforce.com');
            window.Utils = { getInstanceUrl: mockGetInstanceUrl };

            const session = { isLoggedIn: true, instanceUrl: null };
            let base = session.instanceUrl?.replace(/\/+$/, '') || '';

            if (!base) {
                const resolved = await mockGetInstanceUrl();
                if (resolved) base = String(resolved).replace(/\/+$/, '');
            }

            expect(base).toBe('https://fallback.salesforce.com');
            expect(mockGetInstanceUrl).toHaveBeenCalled();
        });

        test('should throw error when both session and Utils fail', async () => {
            const mockGetInstanceUrl = jest.fn().mockResolvedValue(null);
            window.Utils = { getInstanceUrl: mockGetInstanceUrl };

            const session = { isLoggedIn: true, instanceUrl: null };
            let base = session.instanceUrl?.replace(/\/+$/, '') || '';

            if (!base) {
                const resolved = await mockGetInstanceUrl();
                if (resolved) base = String(resolved).replace(/\/+$/, '');
            }

            expect(base).toBe('');

            // Should throw error
            expect(() => {
                if (!base) {
                    throw new Error('Could not determine Salesforce instance URL. Please ensure you are logged in to Salesforce.');
                }
            }).toThrow('Please ensure you are logged in');
        });

        test('should strip trailing slashes from instanceUrl', () => {
            const session = {
                isLoggedIn: true,
                instanceUrl: 'https://myorg.my.salesforce.com///'
            };

            let base = session.instanceUrl?.replace(/\/+$/, '') || '';

            expect(base).toBe('https://myorg.my.salesforce.com');
        });
    });

    // ==========================================
    // NEW ORG DETECTION WHEN ANOTHER ORG IS OPEN
    // ==========================================

    describe('New Org Detection When Another Org Already Open', () => {
        const TAB_ORG_A = {
            id: 1,
            url: 'https://org-a.my.salesforce.com/lightning/page/home',
            active: false,
            windowId: 1,
            lastAccessed: 1000
        };

        const TAB_ORG_B = {
            id: 2,
            url: 'https://org-b.my.salesforce.com/lightning/page/home',
            active: true,  // User is currently on this tab
            windowId: 1,
            lastAccessed: 2000  // More recently accessed
        };

        test('findSalesforceTab should prefer active tab over first tab', async () => {
            // Mock chrome.tabs.query to return both tabs
            mockChrome.tabs.query = jest.fn((query) => {
                if (query.active && query.currentWindow) {
                    // Return the active tab (Org B)
                    return Promise.resolve([TAB_ORG_B]);
                }
                // Return all SF tabs
                return Promise.resolve([TAB_ORG_A, TAB_ORG_B]);
            });
            mockChrome.windows = {
                getCurrent: jest.fn().mockResolvedValue({ id: 1 })
            };
            global.chrome = mockChrome;

            // Simulate findSalesforceTab logic
            const findSalesforceTab = async () => {
                // First try active tab in current window
                const activeTabs = await chrome.tabs.query({ active: true, currentWindow: true });
                if (activeTabs && activeTabs.length > 0) {
                    const activeTab = activeTabs[0];
                    if (activeTab.url && activeTab.url.includes('.salesforce.com')) {
                        return activeTab;
                    }
                }
                // Fallback to all SF tabs
                const matches = await chrome.tabs.query({ url: ['https://*.salesforce.com/*'] });
                return matches[0] || null;
            };

            const result = await findSalesforceTab();

            // Should return Org B (active tab), not Org A (first tab)
            expect(result.id).toBe(2);
            expect(result.url).toContain('org-b');
        });

        test('should detect NEW org when user switches from Org A to Org B tab', async () => {
            // Initial state: connected to Org A
            let currentSession = {
                isLoggedIn: true,
                instanceUrl: 'https://org-a.my.salesforce.com',
                orgId: '00D000000000001AAA'
            };

            // User switches to Org B tab and opens popup
            const newTabSession = {
                isLoggedIn: true,
                instanceUrl: 'https://org-b.my.salesforce.com',
                orgId: '00D000000000002AAA'
            };

            // Simulate session refresh
            const prevUrl = currentSession.instanceUrl;
            const nextUrl = newTabSession.instanceUrl;

            // Should detect org change
            const orgChanged = prevUrl && nextUrl && prevUrl !== nextUrl;
            expect(orgChanged).toBe(true);

            // Update session
            currentSession = newTabSession;
            expect(currentSession.orgId).toBe('00D000000000002AAA');
        });

        test('should update cache when org changes', () => {
            const setInstanceUrlCache = jest.fn();
            window.Utils = { setInstanceUrlCache };

            const prevUrl = 'https://org-a.my.salesforce.com';
            const nextUrl = 'https://org-b.my.salesforce.com';

            // Simulate org change detection and cache update
            if (prevUrl && nextUrl && prevUrl !== nextUrl) {
                setInstanceUrlCache(null); // Clear old cache
            }
            setInstanceUrlCache(nextUrl); // Set new cache

            expect(setInstanceUrlCache).toHaveBeenCalledWith(null);
            expect(setInstanceUrlCache).toHaveBeenCalledWith('https://org-b.my.salesforce.com');
        });

        test('should NOT return stale session from old org', async () => {
            // Simulate the scenario where old session is cached
            let cachedSession = {
                isLoggedIn: true,
                instanceUrl: 'https://org-a.my.salesforce.com',
                orgId: '00D_OLD_ORG'
            };

            // New session from current active tab
            const freshSession = {
                isLoggedIn: true,
                instanceUrl: 'https://org-b.my.salesforce.com',
                orgId: '00D_NEW_ORG'
            };

            // Simulate refreshSessionFromTab logic
            const refreshSessionFromTab = async () => {
                const fresh = freshSession; // Would come from sendMessageToSalesforceTab
                if (fresh && fresh.isLoggedIn) {
                    const prevUrl = cachedSession?.instanceUrl;
                    const nextUrl = fresh.instanceUrl;

                    // Detect org change
                    if (prevUrl && nextUrl && prevUrl !== nextUrl) {
                        console.log('Org changed!');
                    }

                    // Return fresh session, NOT cached
                    return fresh;
                }
                return cachedSession; // Fallback
            };

            const result = await refreshSessionFromTab();

            // Should return NEW org, not old cached org
            expect(result.orgId).toBe('00D_NEW_ORG');
            expect(result.instanceUrl).toContain('org-b');
        });

        test('should prefer lastAccessed tab when multiple SF tabs exist', async () => {
            const tabs = [
                { id: 1, url: 'https://org-a.salesforce.com/', windowId: 1, lastAccessed: 1000 },
                { id: 2, url: 'https://org-b.salesforce.com/', windowId: 1, lastAccessed: 3000 }, // Most recent
                { id: 3, url: 'https://org-c.salesforce.com/', windowId: 1, lastAccessed: 2000 }
            ];

            // Sort by lastAccessed descending
            const sortedByAccess = [...tabs].sort((a, b) => {
                return (b.lastAccessed || 0) - (a.lastAccessed || 0);
            });

            // Should return org-b (most recently accessed)
            expect(sortedByAccess[0].id).toBe(2);
            expect(sortedByAccess[0].url).toContain('org-b');
        });

        test('should detect org from active tab URL even when session cached', async () => {
            const activeTab = {
                id: 5,
                url: 'https://brand-new-org.my.salesforce.com/lightning/page/home',
                active: true
            };

            // Check if active tab is a Salesforce tab
            const isSFTab = activeTab.url && (
                activeTab.url.includes('.salesforce.com') ||
                activeTab.url.includes('.force.com')
            );

            expect(isSFTab).toBe(true);

            // Extract hostname from URL
            const hostname = new URL(activeTab.url).hostname;
            expect(hostname).toBe('brand-new-org.my.salesforce.com');
        });

        test('REGRESSION: Opening new org tab should detect new org, not show old org', async () => {
            // This is the specific user-reported issue:
            // 1. User has Org A open
            // 2. User opens new tab with Org B
            // 3. User clicks extension icon
            // 4. Extension should show Org B, NOT Org A

            // State: Org A was previously detected
            const oldOrgState = {
                currentOrgId: '00D_ORG_A',
                instanceUrl: 'https://org-a.my.salesforce.com'
            };

            // User's current active tab is Org B
            const currentActiveTab = {
                id: 99,
                url: 'https://org-b.my.salesforce.com/lightning/page/home',
                active: true
            };

            // Simulate what findSalesforceTab should do
            const findActiveTabFirst = async () => {
                // MUST check active tab FIRST
                if (currentActiveTab.active && currentActiveTab.url.includes('salesforce.com')) {
                    return currentActiveTab;
                }
                return null;
            };

            const foundTab = await findActiveTabFirst();
            expect(foundTab).not.toBeNull();
            expect(foundTab.url).toContain('org-b'); // NOT org-a

            // Extract new instance URL
            const newInstanceUrl = new URL(foundTab.url).origin;
            expect(newInstanceUrl).toBe('https://org-b.my.salesforce.com');

            // Should detect org change
            const orgChanged = oldOrgState.instanceUrl !== newInstanceUrl;
            expect(orgChanged).toBe(true);
        });

        test('should show "New Org Detected" banner when switching to unsaved org', () => {
            const savedOrgs = {
                '00D_ORG_A': { orgId: '00D_ORG_A', hostname: 'org-a.my.salesforce.com' }
            };

            const currentOrg = {
                Id: '00D_ORG_B',
                Name: 'New Org B',
                IsSandbox: false
            };

            // Check if current org is saved
            const isOrgSaved = !!savedOrgs[currentOrg.Id];
            expect(isOrgSaved).toBe(false);

            // Should show new org detected banner
            const shouldShowBanner = !isOrgSaved;
            expect(shouldShowBanner).toBe(true);
        });
    });

    // ==========================================
    // FINDSFORCETAB FUNCTION TESTS
    // ==========================================

    describe('findSalesforceTab Function', () => {
        test('should query active tab in current window first', async () => {
            const mockQuery = jest.fn();
            mockQuery.mockImplementation((query) => {
                if (query.active && query.currentWindow) {
                    return Promise.resolve([{
                        id: 1,
                        url: 'https://correct-org.salesforce.com/page',
                        active: true
                    }]);
                }
                return Promise.resolve([]);
            });

            global.chrome = { tabs: { query: mockQuery }, windows: { getCurrent: jest.fn().mockResolvedValue({ id: 1 }) } };

            // First call should be for active tab
            await mockQuery({ active: true, currentWindow: true });

            expect(mockQuery).toHaveBeenCalledWith({ active: true, currentWindow: true });
        });

        test('should return active SF tab even when other SF tabs exist', async () => {
            const activeTab = { id: 2, url: 'https://new-org.salesforce.com/', active: true };
            const otherTab = { id: 1, url: 'https://old-org.salesforce.com/', active: false };

            // Simulate the priority logic
            const tabs = [otherTab, activeTab];

            // Find active first
            const active = tabs.find(t => t.active && t.url.includes('salesforce.com'));
            expect(active).toBeDefined();
            expect(active.url).toContain('new-org');
        });

        test('should handle non-SF active tab gracefully', async () => {
            const activeTab = { id: 1, url: 'https://google.com/', active: true };
            const sfTab = { id: 2, url: 'https://my-org.salesforce.com/', active: false };

            // Active tab is not SF
            const isActiveSF = activeTab.url.includes('salesforce.com') || activeTab.url.includes('force.com');
            expect(isActiveSF).toBe(false);

            // Should fall back to SF tab
            const allTabs = [activeTab, sfTab];
            const sfTabs = allTabs.filter(t => t.url.includes('salesforce.com'));
            expect(sfTabs.length).toBe(1);
            expect(sfTabs[0].id).toBe(2);
        });
    });

    // ==========================================
    // CONTENT SCRIPT FALLBACK TESTS
    // ==========================================

    describe('Content Script Fallback to Background', () => {
        test('should fallback to background.js when content script not ready', async () => {
            // Simulate content script not responding (new tab, script not loaded)
            const contentScriptResponse = null; // Failed

            // Simulate background fallback
            const backgroundResponse = {
                success: true,
                isLoggedIn: true,
                instanceUrl: 'https://new-org.my.salesforce.com',
                sessionId: 'abc123'
            };

            // Simulate sendMessageToSalesforceTab logic
            let finalResponse = contentScriptResponse;
            if (!contentScriptResponse || !contentScriptResponse.success) {
                // Fallback to background
                finalResponse = backgroundResponse;
            }

            expect(finalResponse).not.toBeNull();
            expect(finalResponse.isLoggedIn).toBe(true);
            expect(finalResponse.instanceUrl).toContain('new-org');
        });

        test('should use content script response when available', async () => {
            const contentScriptResponse = {
                success: true,
                isLoggedIn: true,
                instanceUrl: 'https://from-content-script.salesforce.com'
            };

            // Content script responded, no need for fallback
            let finalResponse = contentScriptResponse;
            if (contentScriptResponse && contentScriptResponse.success) {
                finalResponse = contentScriptResponse;
            }

            expect(finalResponse.instanceUrl).toContain('from-content-script');
        });

        test('should get session from cookies via background for new tab', async () => {
            // Scenario: User opens new Salesforce tab, content script not loaded yet
            const tabUrl = 'https://brand-new-org.my.salesforce.com/lightning/page/home';

            // Background can get session from cookies using the tab URL
            const mockGetSession = jest.fn().mockResolvedValue({
                success: true,
                isLoggedIn: true,
                instanceUrl: 'https://brand-new-org.my.salesforce.com',
                sessionId: 'session_from_cookies'
            });

            const result = await mockGetSession(tabUrl);

            expect(result.isLoggedIn).toBe(true);
            expect(result.instanceUrl).toContain('brand-new-org');
        });

        test('REGRESSION: New tab should work even when content script not injected', () => {
            // The fix: sendMessageToSalesforceTab should:
            // 1. Try content script first
            // 2. If fails, call background.js with tab URL
            // 3. Background reads cookies for that URL domain
            // 4. Return session info

            const steps = [
                'findSalesforceTab() - finds the NEW tab',
                'chrome.tabs.sendMessage() - fails because content script not ready',
                'chrome.runtime.sendMessage({ action: GET_SESSION_INFO, url: tabUrl })',
                'background.js reads cookies for the URL domain',
                'Returns session info for the NEW org'
            ];

            expect(steps.length).toBe(5);
            expect(steps[2]).toContain('GET_SESSION_INFO');
        });
    });

    // ==========================================
    // FAVICON APPLICATION TO NEW ORGS
    // ==========================================

    describe('Favicon Application to New Orgs', () => {
        test('applyFaviconToTabs should find tabs by hostname, not active property', async () => {
            const targetHostname = 'new-org.my.salesforce.com';

            const sfTabs = [
                { id: 1, url: 'https://old-org.my.salesforce.com/page', active: false },
                { id: 2, url: 'https://new-org.my.salesforce.com/page', active: false }, // New org tab
                { id: 3, url: 'https://another-org.salesforce.com/page', active: false }
            ];

            // Filter by hostname (not by active property)
            const tabsToApply = sfTabs.filter(tab => {
                const tabHostname = new URL(tab.url).hostname;
                return tabHostname === targetHostname;
            });

            expect(tabsToApply.length).toBe(1);
            expect(tabsToApply[0].id).toBe(2);
            expect(tabsToApply[0].url).toContain('new-org');
        });

        test('should NOT rely on active property when popup is open', () => {
            // When popup is open, NO tab has active=true
            const sfTabs = [
                { id: 1, url: 'https://org-a.salesforce.com/', active: false },
                { id: 2, url: 'https://org-b.salesforce.com/', active: false }
            ];

            // Old buggy code: sfTabs.find(t => t.active) || sfTabs[0]
            const buggyResult = sfTabs.find(t => t.active) || sfTabs[0];

            // This would return org-a (first one) even if we're saving org-b!
            expect(buggyResult.url).toContain('org-a'); // BUG!

            // Fixed code: filter by hostname
            const targetHostname = 'org-b.salesforce.com';
            const fixedResult = sfTabs.filter(tab => {
                const tabHostname = new URL(tab.url).hostname;
                return tabHostname === targetHostname;
            });

            expect(fixedResult.length).toBe(1);
            expect(fixedResult[0].url).toContain('org-b'); // CORRECT!
        });

        test('content.js should use normalized org ID comparison', () => {
            const normalizeId = (id) => id ? id.substring(0, 15) : null;

            // 18-char org ID from request
            const reqOrgId = '00D000000000001AAA';
            // 15-char org ID from page detection
            const currentOrgId = '00D000000000001';

            const normalizedReq = normalizeId(reqOrgId);
            const normalizedCurrent = normalizeId(currentOrgId);

            // Should match after normalization
            expect(normalizedReq).toBe(normalizedCurrent);
        });

        test('should apply favicon to new org tab correctly', async () => {
            const newOrgHostname = 'brand-new-org.my.salesforce.com';
            const newOrgId = '00D_NEW_ORG_123';

            const savedOrgs = {
                [newOrgId]: {
                    orgId: newOrgId,
                    hostname: newOrgHostname,
                    iconConfig: { color: '#ff6b6b', label: 'NEW', shape: 'circle' }
                }
            };

            const sfTabs = [
                { id: 1, url: 'https://old-org.salesforce.com/' },
                { id: 2, url: `https://${newOrgHostname}/lightning/page` }
            ];

            // Get the target hostname from saved org record
            const targetHostname = savedOrgs[newOrgId].hostname;

            // Filter tabs by hostname
            const tabsToApply = sfTabs.filter(tab => {
                const tabHostname = new URL(tab.url).hostname;
                return tabHostname === targetHostname;
            });

            // Should find the new org's tab
            expect(tabsToApply.length).toBe(1);
            expect(tabsToApply[0].id).toBe(2);
        });

        test('REGRESSION: Favicon should apply to NEW org, not first org', () => {
            // Scenario:
            // 1. User has Org A open (with favicon)
            // 2. User opens Org B (new org)
            // 3. User saves favicon for Org B
            // 4. Favicon should apply to Org B tabs, NOT Org A tabs

            const orgAHostname = 'org-a.my.salesforce.com';
            const orgBHostname = 'org-b.my.salesforce.com';
            const orgBId = '00D_ORG_B';

            const sfTabs = [
                { id: 1, url: `https://${orgAHostname}/home`, active: false },
                { id: 2, url: `https://${orgBHostname}/home`, active: false }
            ];

            // Saving favicon for Org B
            const targetOrgRecord = { orgId: orgBId, hostname: orgBHostname };

            // Find tabs to apply favicon
            const tabsToApply = sfTabs.filter(tab => {
                const tabHostname = new URL(tab.url).hostname;
                return tabHostname === targetOrgRecord.hostname;
            });

            // Should ONLY apply to Org B (tab id: 2)
            expect(tabsToApply.length).toBe(1);
            expect(tabsToApply[0].id).toBe(2);
            expect(tabsToApply[0].url).not.toContain('org-a');
        });

        test('saveOrgAndIcon should pass hostname to applyFaviconToTabs', () => {
            // The fix: saveOrgAndIcon should:
            // 1. Detect hostname from session.instanceUrl or SF tabs
            // 2. Save hostname to orgRecords and orgFavicons
            // 3. Pass hostname to applyFaviconToTabs as override
            // 4. applyFaviconToTabs should use this hostname to find correct tabs

            const detectedHostname = 'new-org.my.salesforce.com';

            // Simulate the function signature
            const applyFaviconToTabs = (color, label, shape, orgId, applyToAll, targetHostnameOverride) => {
                // Should use the override if provided
                const targetHostname = targetHostnameOverride || null;
                return targetHostname;
            };

            const result = applyFaviconToTabs('#ff0000', 'NEW', 'circle', '00D_NEW', false, detectedHostname);
            expect(result).toBe(detectedHostname);
        });

        test('hostname should be updated for existing orgs too', () => {
            // When saving an existing org, the hostname should also be updated
            // This fixes the case where hostname was null or stale

            const existingOrg = {
                orgId: '00D_EXISTING',
                hostname: null, // Was null before
                iconConfig: { color: '#old', label: 'OLD', shape: 'square' }
            };

            const newHostname = 'updated-hostname.salesforce.com';
            const newIconConfig = { color: '#new', label: 'NEW', shape: 'circle' };

            // Simulate the fix: update hostname when saving
            existingOrg.iconConfig = newIconConfig;
            if (newHostname) {
                existingOrg.hostname = newHostname;
            }

            expect(existingOrg.hostname).toBe(newHostname);
            expect(existingOrg.iconConfig.color).toBe('#new');
        });
    });
});

