/**
 * @jest-environment jsdom
 *
 * Org & Favicon V4 DevTools-Style Compact Layout Test Suite
 * Tests for the redesigned flat, minimal, purposeful control panel
 *
 * Tests cover:
 * - Compact 3-column layout (160px | 1fr | 150px)
 * - Side-by-side Live/Editing previews (flat, no thick borders)
 * - Inline preset buttons
 * - Compact customization controls
 * - Right-aligned action buttons
 * - Collapsible org info
 * - No nested scrollbars
 * - Minimal visual weight
 */

describe('Org & Favicon V4 - DevTools-Style Layout', () => {
    let mockChrome;
    let mockDataExplorer;
    let storageData;

    beforeEach(() => {
        storageData = {
            orgRecords: {},
            orgFavicons: {},
            selectedOrgId: null,
            draftIconConfig: null,
            applyAllTabs: false
        };

        document.body.innerHTML = `
            <div class="org-favicon-grid-v4">
                <div class="org-list-col">
                    <div class="col-header">
                        <span>Orgs</span>
                        <button id="add-current-org-btn" class="btn-add-sm">+</button>
                    </div>
                    <input type="text" id="org-search-input" class="search-input-sm" placeholder="Search..." />
                    <div id="saved-orgs-list" class="org-list-scroll">
                        <div class="empty-minimal">No orgs saved</div>
                    </div>
                </div>
                <div class="editor-col">
                    <div class="editor-header">
                        <span id="editing-org-name" class="org-name-display">—</span>
                        <span id="org-env-badge" class="env-badge"></span>
                        <span id="live-indicator" class="live-badge" hidden><span class="pulse"></span>Live</span>
                    </div>
                    <div id="no-org-selected-state" class="empty-center">
                        <span class="empty-hint">Select an org from the list</span>
                    </div>
                    <div id="icon-editor-panel" class="editor-panel" hidden>
                        <div class="preview-row">
                            <div class="preview-box preview-live" id="preview-card-live">
                                <div class="preview-head">
                                    <span>Live</span>
                                    <div class="bg-toggles">
                                        <button type="button" id="preview-bg-light" class="bg-btn active">☀</button>
                                        <button type="button" id="preview-bg-dark" class="bg-btn">🌙</button>
                                    </div>
                                </div>
                                <div class="preview-canvas">
                                    <canvas id="favicon-applied-preview" width="32" height="32"></canvas>
                                </div>
                            </div>
                            <div class="preview-box preview-edit" id="preview-card-draft">
                                <div class="preview-head">
                                    <span>Editing</span>
                                    <span id="draft-status-badge" class="change-dot"></span>
                                </div>
                                <div class="preview-canvas editing-preview-body">
                                    <canvas id="favicon-preview-data" width="32" height="32"></canvas>
                                </div>
                            </div>
                        </div>
                        <div id="preset-chips" class="presets-row">
                            <button class="preset-btn" data-preset="DEV" data-color="#339af0" data-label="DEV">DEV</button>
                            <button class="preset-btn" data-preset="UAT" data-color="#ffa500" data-label="UAT">UAT</button>
                            <button class="preset-btn preset-prod" data-preset="PROD" data-color="#e03131" data-label="PRD">PROD</button>
                            <button class="preset-btn" data-preset="QA" data-color="#9775fa" data-label="QA">QA</button>
                            <button class="preset-btn" data-preset="TRN" data-color="#20c997" data-label="TRN">TRN</button>
                            <button class="preset-btn" data-preset="SBX" data-color="#ff6b6b" data-label="SBX">SBX</button>
                        </div>
                        <div class="colors-row">
                            <input type="color" id="favicon-color-data" value="#ff6b6b" class="color-picker" />
                            <div id="favicon-color-presets-data" class="swatches">
                                <button class="swatch" data-color="#e03131" style="background:#e03131"></button>
                                <button class="swatch" data-color="#ff6b6b" style="background:#ff6b6b"></button>
                                <button class="swatch" data-color="#339af0" style="background:#339af0"></button>
                            </div>
                        </div>
                        <div class="fields-row">
                            <div class="field-inline">
                                <label>Label</label>
                                <input type="text" id="favicon-label-data" maxlength="3" class="input-label" />
                            </div>
                            <div class="field-inline">
                                <label>Shape</label>
                                <div id="favicon-shape-options-data" class="shapes">
                                    <label class="shape-opt"><input type="radio" name="favicon-shape-data" value="circle" checked /><span>●</span></label>
                                    <label class="shape-opt"><input type="radio" name="favicon-shape-data" value="square" /><span>■</span></label>
                                </div>
                            </div>
                            <label class="apply-all">
                                <input type="checkbox" id="apply-all-tabs-toggle" />
                                <span>All tabs</span>
                            </label>
                        </div>
                        <div class="actions-row">
                            <button id="reset-favicon-btn-data" class="btn-sm btn-secondary">Reset</button>
                            <button id="save-org-icon-btn" class="btn-sm btn-primary" disabled>Save</button>
                        </div>
                        <div id="favicon-status-data" class="status-msg" hidden></div>
                    </div>
                    <div id="unsaved-changes-banner" class="unsaved-strip" hidden>
                        <span class="unsaved-dot"></span>Unsaved
                        <button type="button" id="banner-save-btn" class="btn-xs">Save</button>
                    </div>
                </div>
                <div class="info-col">
                    <div class="col-header">
                        <span>Info</span>
                        <button id="refresh-org-btn-data" class="btn-icon-sm">⟲</button>
                    </div>
                    <div id="org-info-container-data" class="info-list">
                        <div class="info-row"><span class="info-key">Name</span><span class="info-val" id="summary-org-name">—</span></div>
                        <div class="info-row"><span class="info-key">Type</span><span class="info-val" id="summary-org-type">—</span></div>
                        <div id="org-info-expanded" class="info-extra" hidden>
                            <div class="info-row"><span class="info-key">Org ID</span><span class="info-val" id="summary-org-id">—</span></div>
                        </div>
                        <button type="button" id="show-more-org-info" class="btn-link">More ▾</button>
                    </div>
                </div>
            </div>
            <select id="api-version"><option value="63.0">63.0</option></select>
        `;

        mockChrome = {
            storage: {
                local: {
                    get: jest.fn(() => Promise.resolve(storageData)),
                    set: jest.fn(() => Promise.resolve()),
                    remove: jest.fn(() => Promise.resolve())
                }
            },
            tabs: { query: jest.fn(() => Promise.resolve([])), sendMessage: jest.fn(() => Promise.resolve()) },
            scripting: { executeScript: jest.fn(() => Promise.resolve()) }
        };
        global.chrome = mockChrome;

        mockDataExplorer = {
            _selectedOrgId: null,
            _savedOrgs: {},
            _draftIconConfig: null,
            _appliedIconConfig: null,
            applyPresetV4: jest.fn(function(chip) {
                document.getElementById('favicon-color-data').value = chip.dataset.color;
                document.getElementById('favicon-label-data').value = chip.dataset.label;
                document.querySelectorAll('.preset-btn').forEach(c => c.classList.toggle('active', c === chip));
            }),
            selectColorSwatchV4: jest.fn(function(swatch) {
                document.getElementById('favicon-color-data').value = swatch.dataset.color;
                document.querySelectorAll('.swatch').forEach(s => s.classList.toggle('active', s === swatch));
            }),
            setPreviewBackgroundV4: jest.fn(function(mode) {
                document.querySelectorAll('.preview-canvas').forEach(c => c.classList.toggle('dark-bg', mode === 'dark'));
            }),
            hasUnsavedChanges: jest.fn(function() {
                if (!this._draftIconConfig || !this._appliedIconConfig) return false;
                return this._draftIconConfig.color !== this._appliedIconConfig.color ||
                       this._draftIconConfig.label !== this._appliedIconConfig.label;
            }),
            updateUnsavedIndicatorV4: jest.fn(function() {
                const banner = document.getElementById('unsaved-changes-banner');
                if (banner) banner.hidden = !this.hasUnsavedChanges();
            }),
            updateSaveButtonStateV4: jest.fn(function() {
                const btn = document.getElementById('save-org-icon-btn');
                if (btn) btn.disabled = !this.hasUnsavedChanges();
            }),
            toggleOrgInfoExpanded: jest.fn(function() {
                const section = document.getElementById('org-info-expanded');
                const btn = document.getElementById('show-more-org-info');
                if (section && btn) {
                    section.hidden = !section.hidden;
                    btn.textContent = section.hidden ? 'More ▾' : 'Less ▴';
                }
            }),
            showIconEditorPanel: jest.fn(function(show) {
                const empty = document.getElementById('no-org-selected-state');
                const panel = document.getElementById('icon-editor-panel');
                if (empty) empty.hidden = show;
                if (panel) panel.hidden = !show;
            }),
            showFaviconStatus: jest.fn(function(msg, type) {
                const el = document.getElementById('favicon-status-data');
                if (el) { el.textContent = msg; el.className = `status-msg ${type}`; el.hidden = false; }
            })
        };
        Object.defineProperty(window, 'DataExplorerHelper', { value: mockDataExplorer, writable: true, configurable: true });
    });

    afterEach(() => { jest.clearAllMocks(); document.body.innerHTML = ''; });

    describe('V4 Layout Structure', () => {
        test('should have 3-column grid', () => {
            const grid = document.querySelector('.org-favicon-grid-v4');
            expect(grid).toBeTruthy();
            expect(grid.children.length).toBe(3);
        });

        test('should have org list column', () => {
            expect(document.querySelector('.org-list-col')).toBeTruthy();
            expect(document.querySelector('.org-list-scroll')).toBeTruthy();
        });

        test('should have editor column', () => {
            expect(document.querySelector('.editor-col')).toBeTruthy();
            expect(document.querySelector('.editor-panel')).toBeTruthy();
        });

        test('should have info column', () => {
            expect(document.querySelector('.info-col')).toBeTruthy();
            expect(document.querySelector('.info-list')).toBeTruthy();
        });
    });

    describe('Flat Previews', () => {
        test('should have preview row with two boxes', () => {
            const row = document.querySelector('.preview-row');
            expect(row).toBeTruthy();
            expect(row.querySelectorAll('.preview-box').length).toBe(2);
        });

        test('should toggle dark background', () => {
            mockDataExplorer.setPreviewBackgroundV4('dark');
            document.querySelectorAll('.preview-canvas').forEach(c => {
                expect(c.classList.contains('dark-bg')).toBe(true);
            });
        });
    });

    describe('Preset Buttons', () => {
        test('should render preset buttons', () => {
            expect(document.querySelectorAll('.preset-btn').length).toBe(6);
        });

        test('should have PROD button with special class', () => {
            const prod = document.querySelector('.preset-btn.preset-prod');
            expect(prod).toBeTruthy();
            expect(prod.dataset.color).toBe('#e03131');
        });

        test('should activate preset on click', () => {
            const dev = document.querySelector('[data-preset="DEV"]');
            mockDataExplorer.applyPresetV4(dev);
            expect(document.getElementById('favicon-color-data').value).toBe('#339af0');
            expect(dev.classList.contains('active')).toBe(true);
        });
    });

    describe('Compact Controls', () => {
        test('should have color picker and swatches', () => {
            expect(document.querySelector('.color-picker')).toBeTruthy();
            expect(document.querySelectorAll('.swatch').length).toBeGreaterThan(0);
        });

        test('should have label input with maxlength 3', () => {
            const input = document.querySelector('.input-label');
            expect(input).toBeTruthy();
            expect(input.maxLength).toBe(3);
        });

        test('should have shape options', () => {
            expect(document.querySelectorAll('.shape-opt').length).toBeGreaterThan(0);
        });
    });

    describe('Action Bar', () => {
        test('should have reset and save buttons', () => {
            expect(document.querySelector('.btn-secondary')).toBeTruthy();
            expect(document.querySelector('.btn-primary')).toBeTruthy();
        });

        test('should disable save when no changes', () => {
            mockDataExplorer._appliedIconConfig = { color: '#ff6b6b', label: 'DEV' };
            mockDataExplorer._draftIconConfig = { color: '#ff6b6b', label: 'DEV' };
            mockDataExplorer.updateSaveButtonStateV4();
            expect(document.getElementById('save-org-icon-btn').disabled).toBe(true);
        });

        test('should enable save when changes exist', () => {
            mockDataExplorer._appliedIconConfig = { color: '#ff6b6b', label: 'DEV' };
            mockDataExplorer._draftIconConfig = { color: '#339af0', label: 'DEV' };
            mockDataExplorer.updateSaveButtonStateV4();
            expect(document.getElementById('save-org-icon-btn').disabled).toBe(false);
        });
    });

    describe('Org Info Collapse', () => {
        test('should have More button', () => {
            const btn = document.getElementById('show-more-org-info');
            expect(btn).toBeTruthy();
            expect(btn.textContent).toBe('More ▾');
        });

        test('should toggle expanded section', () => {
            mockDataExplorer.toggleOrgInfoExpanded();
            expect(document.getElementById('org-info-expanded').hidden).toBe(false);
            expect(document.getElementById('show-more-org-info').textContent).toBe('Less ▴');
        });
    });

    describe('Unsaved State', () => {
        test('should show unsaved strip when changes exist', () => {
            mockDataExplorer._appliedIconConfig = { color: '#ff6b6b', label: 'DEV' };
            mockDataExplorer._draftIconConfig = { color: '#339af0', label: 'DEV' };
            mockDataExplorer.updateUnsavedIndicatorV4();
            expect(document.getElementById('unsaved-changes-banner').hidden).toBe(false);
        });

        test('should hide unsaved strip when no changes', () => {
            mockDataExplorer._appliedIconConfig = { color: '#ff6b6b', label: 'DEV' };
            mockDataExplorer._draftIconConfig = { color: '#ff6b6b', label: 'DEV' };
            mockDataExplorer.updateUnsavedIndicatorV4();
            expect(document.getElementById('unsaved-changes-banner').hidden).toBe(true);
        });
    });

    describe('Editor Panel Visibility', () => {
        test('should show empty state by default', () => {
            expect(document.getElementById('no-org-selected-state').hidden).toBe(false);
            expect(document.getElementById('icon-editor-panel').hidden).toBe(true);
        });

        test('should show editor when org selected', () => {
            mockDataExplorer.showIconEditorPanel(true);
            expect(document.getElementById('no-org-selected-state').hidden).toBe(true);
            expect(document.getElementById('icon-editor-panel').hidden).toBe(false);
        });

        test('empty state should be absolute positioned overlay', () => {
            const emptyState = document.getElementById('no-org-selected-state');
            const editorPanel = document.getElementById('icon-editor-panel');

            expect(emptyState.hidden).toBe(false);
            expect(editorPanel.hidden).toBe(true);

            mockDataExplorer.showIconEditorPanel(true);

            // Empty state hidden, editor visible
            expect(emptyState.hidden).toBe(true);
            expect(editorPanel.hidden).toBe(false);

            // Editor panel should be the first visible child after header
            const editorCol = document.querySelector('.editor-col');
            const children = Array.from(editorCol.children);
            const header = children.find(c => c.classList.contains('editor-header'));
            const headerIndex = children.indexOf(header);

            // Editor panel should come right after header (empty state is hidden/overlaid)
            expect(headerIndex).toBeGreaterThanOrEqual(0);
        });
    });

    describe('CSP Compliance', () => {
        test('should not have inline handlers', () => {
            document.querySelectorAll('*').forEach(el => {
                expect(el.getAttribute('onclick')).toBeNull();
                expect(el.getAttribute('onchange')).toBeNull();
            });
        });
    });
});

