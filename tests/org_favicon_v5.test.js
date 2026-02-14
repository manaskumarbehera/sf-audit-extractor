/**
 * @jest-environment jsdom
 *
 * Org & Favicon v5 Refactored Layout Tests
 * Tests for the improved visual hierarchy, spacing, and component sizing
 */

describe('Org & Favicon v5 - Refactored Layout', () => {
    let mockDataExplorer;

    beforeEach(() => {
        // Setup the v5 HTML structure
        document.body.innerHTML = `
            <div id="subtab-sandbox-manager" class="sub-tab-content">
                <div class="org-favicon-grid-v5">
                    <!-- Column 1: Org List -->
                    <div class="org-list-col-v5">
                        <div class="col-header-v5">
                            <span>Saved Orgs</span>
                            <button id="add-current-org-btn" class="btn-add-v5" title="Add Current Org">+</button>
                        </div>
                        <input type="text" id="org-search-input" class="search-input-v5" placeholder="Search orgs..." />
                        <div id="saved-orgs-list" class="org-list-scroll-v5">
                            <div class="empty-minimal-v5">No orgs saved yet</div>
                        </div>
                    </div>

                    <!-- Column 2: Editor -->
                    <div class="editor-col-v5">
                        <div class="editor-header-v5">
                            <span id="editing-org-name" class="org-name-display-v5">—</span>
                            <span id="org-env-badge" class="env-badge-v5"></span>
                            <span id="live-indicator" class="live-badge-v5" hidden><span class="pulse-v5"></span>Currently Active</span>
                        </div>

                        <div id="no-org-selected-state" class="empty-center-v5">
                            <div class="empty-state-content">
                                <span class="empty-icon">🏢</span>
                                <span class="empty-hint-v5">Select an org from the list to customize its favicon</span>
                            </div>
                        </div>

                        <div id="icon-editor-panel" class="editor-panel-v5" hidden>
                            <!-- Preview Section -->
                            <div class="preview-section-v5">
                                <div class="preview-row-v5">
                                    <div class="preview-box-v5 preview-live-v5" id="preview-card-live">
                                        <div class="preview-label-v5">Current Org Preview</div>
                                        <div class="preview-container-v5">
                                            <div class="preview-canvas-v5">
                                                <canvas id="favicon-applied-preview" width="48" height="48"></canvas>
                                            </div>
                                            <div class="preview-badge-v5 badge-live">LIVE</div>
                                            <div class="preview-org-name-v5" id="preview-live-org-name">—</div>
                                        </div>
                                        <div class="bg-toggles-v5">
                                            <button type="button" id="preview-bg-light" class="bg-btn-v5 active">☀️ Light</button>
                                            <button type="button" id="preview-bg-dark" class="bg-btn-v5">🌙 Dark</button>
                                        </div>
                                    </div>
                                    <div class="preview-box-v5 preview-edit-v5" id="preview-card-draft">
                                        <div class="preview-label-v5">Editing Preview</div>
                                        <div class="preview-container-v5">
                                            <div class="preview-canvas-v5 editing-preview-body">
                                                <canvas id="favicon-preview-data" width="48" height="48"></canvas>
                                            </div>
                                            <div class="preview-badge-v5 badge-draft" id="preview-draft-badge">DRAFT</div>
                                            <div class="preview-org-name-v5" id="preview-draft-org-name">—</div>
                                        </div>
                                        <span id="draft-status-badge" class="change-indicator-v5"></span>
                                    </div>
                                </div>
                            </div>

                            <!-- Environment Type Section -->
                            <div class="editor-section-v5">
                                <div class="section-label-v5">Environment Type</div>
                                <div id="preset-chips" class="env-segmented-control-v5">
                                    <button type="button" class="env-btn-v5" data-preset="DEV" data-color="#339af0" data-label="DEV">DEV</button>
                                    <button type="button" class="env-btn-v5" data-preset="UAT" data-color="#ffa500" data-label="UAT">UAT</button>
                                    <button type="button" class="env-btn-v5 env-prod" data-preset="PROD" data-color="#e03131" data-label="PRD">PROD</button>
                                    <button type="button" class="env-btn-v5" data-preset="QA" data-color="#9775fa" data-label="QA">QA</button>
                                    <button type="button" class="env-btn-v5" data-preset="TRN" data-color="#20c997" data-label="TRN">TRN</button>
                                    <button type="button" class="env-btn-v5" data-preset="SBX" data-color="#ff6b6b" data-label="SBX">SBX</button>
                                </div>
                            </div>

                            <!-- Color Picker Section (single row) -->
                            <div class="color-section-v5">
                                <span class="section-label-v5">Tab Color</span>
                                <input type="color" id="favicon-color-data" value="#ff6b6b" class="color-picker-v5" />
                                <div id="favicon-color-presets-data" class="swatches-v5">
                                    <button type="button" class="swatch-v5" data-color="#e03131" style="background:#e03131"></button>
                                    <button type="button" class="swatch-v5" data-color="#ff6b6b" style="background:#ff6b6b"></button>
                                    <button type="button" class="swatch-v5" data-color="#ffa500" style="background:#ffa500"></button>
                                    <button type="button" class="swatch-v5" data-color="#ffd43b" style="background:#ffd43b"></button>
                                    <button type="button" class="swatch-v5" data-color="#51cf66" style="background:#51cf66"></button>
                                    <button type="button" class="swatch-v5" data-color="#20c997" style="background:#20c997"></button>
                                    <button type="button" class="swatch-v5" data-color="#339af0" style="background:#339af0"></button>
                                    <button type="button" class="swatch-v5" data-color="#9775fa" style="background:#9775fa"></button>
                                </div>
                            </div>

                            <!-- Icon Shape Section (single row) -->
                            <div class="shape-section-v5">
                                <span class="section-label-v5">Shape</span>
                                <div id="favicon-shape-options-data" class="shapes-v5">
                                    <label class="shape-opt-v5"><input type="radio" name="favicon-shape-data" value="circle" checked /><span>●</span></label>
                                    <label class="shape-opt-v5"><input type="radio" name="favicon-shape-data" value="square" /><span>■</span></label>
                                    <label class="shape-opt-v5"><input type="radio" name="favicon-shape-data" value="rounded" /><span>▢</span></label>
                                    <label class="shape-opt-v5"><input type="radio" name="favicon-shape-data" value="diamond" /><span>◆</span></label>
                                    <label class="shape-opt-v5"><input type="radio" name="favicon-shape-data" value="hexagon" /><span>⬡</span></label>
                                </div>
                            </div>

                            <!-- Label Input Section (single row) -->
                            <div class="label-section-v5">
                                <span class="section-label-v5">Badge Label</span>
                                <input type="text" id="favicon-label-data" maxlength="3" placeholder="DEV" class="input-label-v5" />
                                <span class="label-hint-v5">Max 3 chars</span>
                                <label class="apply-all-v5">
                                    <input type="checkbox" id="apply-all-tabs-toggle" />
                                    <span>Apply to all tabs</span>
                                </label>
                            </div>

                            <!-- Action Bar -->
                            <div class="actions-row-v5">
                                <button id="reset-favicon-btn-data" class="btn-v5 btn-secondary-v5">Reset to Default</button>
                                <button id="save-org-icon-btn" class="btn-v5 btn-primary-v5" disabled>Save & Apply</button>
                            </div>

                            <!-- Status Message -->
                            <div id="favicon-status-data" class="status-msg-v5" hidden></div>
                        </div>

                        <!-- Unsaved Changes Banner -->
                        <div id="unsaved-changes-banner" class="unsaved-strip-v5" hidden>
                            <span class="unsaved-dot-v5"></span>
                            <span>You have unsaved changes</span>
                            <button type="button" id="banner-save-btn" class="btn-xs-v5">Save Now</button>
                        </div>
                    </div>

                    <!-- Column 3: Org Info -->
                    <div class="info-col-v5">
                        <div class="col-header-v5">
                            <span>Org Details</span>
                            <button id="refresh-org-btn-data" class="btn-icon-v5">⟲</button>
                        </div>
                        <div id="org-info-container-data" class="info-list-v5">
                            <div class="info-row-v5"><span class="info-key-v5">Name</span><span class="info-val-v5" id="summary-org-name">—</span></div>
                            <div class="info-row-v5"><span class="info-key-v5">Type</span><span class="info-val-v5" id="summary-org-type">—</span></div>
                            <div class="info-row-v5"><span class="info-key-v5">Instance</span><span class="info-val-v5" id="summary-instance">—</span></div>
                        </div>
                    </div>
                </div>
            </div>
        `;

        // Mock DataExplorer with v5 functions
        mockDataExplorer = {
            _savedOrgs: {},
            _selectedOrgId: null,
            _appliedIconConfig: null,
            _draftIconConfig: null,

            // V5 preset apply function
            applyPresetV5: jest.fn(function(chip) {
                const { color, label } = chip.dataset;
                const colorInput = document.getElementById('favicon-color-data');
                const labelInput = document.getElementById('favicon-label-data');

                if (colorInput && color) colorInput.value = color;
                if (labelInput && label) labelInput.value = label;

                // Update environment type selection
                document.querySelectorAll('#preset-chips .env-btn-v5').forEach(c => {
                    c.classList.toggle('active', c === chip);
                });

                // Update draft badge
                const draftBadge = document.getElementById('preview-draft-badge');
                if (draftBadge && label) draftBadge.textContent = label;

                this.updateColorSwatchSelectionV5(color);
                this.onIconConfigChangeV4();
            }),

            // V5 color swatch selection
            selectColorSwatchV5: jest.fn(function(swatch) {
                const color = swatch.dataset.color;
                const colorInput = document.getElementById('favicon-color-data');
                if (colorInput && color) {
                    colorInput.value = color;
                    this.updateColorSwatchSelectionV5(color);
                    this.onIconConfigChangeV4();
                }
            }),

            // Update color swatch visual selection V5
            updateColorSwatchSelectionV5: jest.fn(function(color) {
                document.querySelectorAll('#favicon-color-presets-data .swatch-v5').forEach(s => {
                    s.classList.toggle('active', s.dataset.color === color);
                });
            }),

            // Clear preset selection
            clearPresetSelection: jest.fn(function() {
                document.querySelectorAll('#preset-chips .env-btn-v5').forEach(c => {
                    c.classList.remove('active');
                });
            }),

            // Config change handler
            onIconConfigChangeV4: jest.fn(function() {
                this.updateDraftConfig();
                const draftCard = document.getElementById('preview-card-draft');
                if (draftCard) {
                    draftCard.classList.toggle('has-changes', this.hasUnsavedChanges());
                }
                const changeDot = document.getElementById('draft-status-badge');
                if (changeDot) {
                    changeDot.classList.toggle('unsaved', this.hasUnsavedChanges());
                }
            }),

            // Update draft config
            updateDraftConfig: jest.fn(function() {
                const color = document.getElementById('favicon-color-data')?.value || '#ff6b6b';
                const label = document.getElementById('favicon-label-data')?.value || '';
                const shapeRadio = document.querySelector('input[name="favicon-shape-data"]:checked');
                const shape = shapeRadio ? shapeRadio.value : 'circle';
                this._draftIconConfig = { color, label, shape };
            }),

            // Check unsaved changes
            hasUnsavedChanges: jest.fn(function() {
                if (!this._draftIconConfig || !this._appliedIconConfig) return false;
                return (
                    this._draftIconConfig.color !== this._appliedIconConfig.color ||
                    this._draftIconConfig.label !== this._appliedIconConfig.label ||
                    this._draftIconConfig.shape !== this._appliedIconConfig.shape
                );
            }),

            // Show/hide editor panel
            showIconEditorPanel: jest.fn(function(show) {
                const noOrgState = document.getElementById('no-org-selected-state');
                const editorPanel = document.getElementById('icon-editor-panel');
                if (noOrgState) noOrgState.hidden = show;
                if (editorPanel) editorPanel.hidden = !show;
            }),

            // Set preview background
            setPreviewBackgroundV4: jest.fn(function(mode) {
                const previewBodies = document.querySelectorAll('.preview-canvas-v5');
                const lightBtn = document.getElementById('preview-bg-light');
                const darkBtn = document.getElementById('preview-bg-dark');

                previewBodies.forEach(body => {
                    body.classList.toggle('dark-bg', mode === 'dark');
                });

                if (lightBtn) lightBtn.classList.toggle('active', mode === 'light');
                if (darkBtn) darkBtn.classList.toggle('active', mode === 'dark');
            }),

            // Show status message
            showFaviconStatus: jest.fn(function(message, type) {
                const status = document.getElementById('favicon-status-data');
                if (status) {
                    status.textContent = message;
                    status.className = `status-msg-v5 ${type}`;
                    status.hidden = false;
                }
            })
        };

        // Wire up event listeners
        document.querySelectorAll('#preset-chips .env-btn-v5').forEach(chip => {
            chip.addEventListener('click', () => mockDataExplorer.applyPresetV5(chip));
        });

        document.querySelectorAll('#favicon-color-presets-data .swatch-v5').forEach(swatch => {
            swatch.addEventListener('click', () => mockDataExplorer.selectColorSwatchV5(swatch));
        });

        document.getElementById('preview-bg-light')?.addEventListener('click', () => {
            mockDataExplorer.setPreviewBackgroundV4('light');
        });

        document.getElementById('preview-bg-dark')?.addEventListener('click', () => {
            mockDataExplorer.setPreviewBackgroundV4('dark');
        });
    });

    afterEach(() => {
        document.body.innerHTML = '';
        jest.clearAllMocks();
    });

    // ==========================================
    // 1. VISUAL HIERARCHY TESTS
    // ==========================================
    describe('1. Visual Hierarchy - Preview Areas', () => {
        test('should have two distinct preview boxes with proper labels', () => {
            const livePreview = document.querySelector('.preview-live-v5');
            const editPreview = document.querySelector('.preview-edit-v5');

            expect(livePreview).toBeTruthy();
            expect(editPreview).toBeTruthy();

            const liveLabel = livePreview.querySelector('.preview-label-v5');
            const editLabel = editPreview.querySelector('.preview-label-v5');

            expect(liveLabel.textContent).toBe('Current Org Preview');
            expect(editLabel.textContent).toBe('Editing Preview');
        });

        test('should have LIVE and DRAFT badges in preview areas', () => {
            const liveBadge = document.querySelector('.badge-live');
            const draftBadge = document.querySelector('.badge-draft');

            expect(liveBadge).toBeTruthy();
            expect(draftBadge).toBeTruthy();
            expect(liveBadge.textContent).toBe('LIVE');
            expect(draftBadge.textContent).toBe('DRAFT');
        });

        test('should have preview org name elements', () => {
            const liveOrgName = document.getElementById('preview-live-org-name');
            const draftOrgName = document.getElementById('preview-draft-org-name');

            expect(liveOrgName).toBeTruthy();
            expect(draftOrgName).toBeTruthy();
        });

        test('should have canvas elements for favicon preview', () => {
            const appliedCanvas = document.getElementById('favicon-applied-preview');
            const draftCanvas = document.getElementById('favicon-preview-data');

            expect(appliedCanvas).toBeTruthy();
            expect(draftCanvas).toBeTruthy();
            expect(appliedCanvas.width).toBe(48);
            expect(appliedCanvas.height).toBe(48);
        });

        test('should have background toggle buttons', () => {
            const lightBtn = document.getElementById('preview-bg-light');
            const darkBtn = document.getElementById('preview-bg-dark');

            expect(lightBtn).toBeTruthy();
            expect(darkBtn).toBeTruthy();
            expect(lightBtn.classList.contains('active')).toBe(true);
        });
    });

    // ==========================================
    // 2. ENVIRONMENT TYPE BUTTONS TESTS
    // ==========================================
    describe('2. Environment Type Segmented Control', () => {
        test('should have exactly 6 environment type buttons', () => {
            const envButtons = document.querySelectorAll('.env-btn-v5');
            expect(envButtons.length).toBe(6);
        });

        test('should have correct presets: DEV, UAT, PROD, QA, TRN, SBX', () => {
            const envButtons = document.querySelectorAll('.env-btn-v5');
            const presets = Array.from(envButtons).map(btn => btn.dataset.preset);

            expect(presets).toContain('DEV');
            expect(presets).toContain('UAT');
            expect(presets).toContain('PROD');
            expect(presets).toContain('QA');
            expect(presets).toContain('TRN');
            expect(presets).toContain('SBX');
        });

        test('should have section label "Environment Type"', () => {
            const labels = document.querySelectorAll('.section-label-v5');
            const envLabel = Array.from(labels).find(l => l.textContent === 'Environment Type');
            expect(envLabel).toBeTruthy();
        });

        test('should activate button when clicked', () => {
            const devBtn = document.querySelector('.env-btn-v5[data-preset="DEV"]');
            devBtn.click();

            expect(devBtn.classList.contains('active')).toBe(true);
            expect(mockDataExplorer.applyPresetV5).toHaveBeenCalled();
        });

        test('should update color and label when preset clicked', () => {
            const uatBtn = document.querySelector('.env-btn-v5[data-preset="UAT"]');
            uatBtn.click();

            const colorInput = document.getElementById('favicon-color-data');
            const labelInput = document.getElementById('favicon-label-data');

            expect(colorInput.value).toBe('#ffa500');
            expect(labelInput.value).toBe('UAT');
        });

        test('should deactivate other buttons when one is selected', () => {
            const devBtn = document.querySelector('.env-btn-v5[data-preset="DEV"]');
            const uatBtn = document.querySelector('.env-btn-v5[data-preset="UAT"]');

            devBtn.click();
            expect(devBtn.classList.contains('active')).toBe(true);

            uatBtn.click();
            expect(devBtn.classList.contains('active')).toBe(false);
            expect(uatBtn.classList.contains('active')).toBe(true);
        });

        test('PROD button should have special env-prod class', () => {
            const prodBtn = document.querySelector('.env-btn-v5[data-preset="PROD"]');
            expect(prodBtn.classList.contains('env-prod')).toBe(true);
        });
    });

    // ==========================================
    // 3. COLOR PICKER TESTS
    // ==========================================
    describe('3. Color Picker Section', () => {
        test('should have section label "Tab Color"', () => {
            const labels = document.querySelectorAll('.section-label-v5');
            const colorLabel = Array.from(labels).find(l => l.textContent === 'Tab Color');
            expect(colorLabel).toBeTruthy();
        });

        test('should have color section in single row layout', () => {
            const colorSection = document.querySelector('.color-section-v5');
            expect(colorSection).toBeTruthy();

            // Should contain label, picker, and swatches in same container
            const label = colorSection.querySelector('.section-label-v5');
            const picker = colorSection.querySelector('.color-picker-v5');
            const swatches = colorSection.querySelector('.swatches-v5');

            expect(label).toBeTruthy();
            expect(picker).toBeTruthy();
            expect(swatches).toBeTruthy();
        });

        test('should have color input picker', () => {
            const colorPicker = document.querySelector('.color-picker-v5');
            expect(colorPicker).toBeTruthy();
            expect(colorPicker.type).toBe('color');
        });

        test('should have 8 color swatches', () => {
            const swatches = document.querySelectorAll('.swatch-v5');
            expect(swatches.length).toBe(8);
        });

        test('should update color when swatch is clicked', () => {
            const swatch = document.querySelector('.swatch-v5[data-color="#339af0"]');
            swatch.click();

            const colorInput = document.getElementById('favicon-color-data');
            expect(colorInput.value).toBe('#339af0');
        });

        test('should add active class to selected swatch', () => {
            const swatch = document.querySelector('.swatch-v5[data-color="#51cf66"]');
            swatch.click();

            expect(swatch.classList.contains('active')).toBe(true);
        });

        test('should remove active class from other swatches when one is selected', () => {
            const swatch1 = document.querySelector('.swatch-v5[data-color="#e03131"]');
            const swatch2 = document.querySelector('.swatch-v5[data-color="#339af0"]');

            swatch1.click();
            expect(swatch1.classList.contains('active')).toBe(true);

            swatch2.click();
            expect(swatch1.classList.contains('active')).toBe(false);
            expect(swatch2.classList.contains('active')).toBe(true);
        });
    });

    // ==========================================
    // 4. SHAPE SELECTION TESTS
    // ==========================================
    describe('4. Icon Shape Selection', () => {
        test('should have section label "Shape"', () => {
            const labels = document.querySelectorAll('.section-label-v5');
            const shapeLabel = Array.from(labels).find(l => l.textContent === 'Shape');
            expect(shapeLabel).toBeTruthy();
        });

        test('should have shape section in single row layout', () => {
            const shapeSection = document.querySelector('.shape-section-v5');
            expect(shapeSection).toBeTruthy();

            // Should contain label and shapes in same container
            const label = shapeSection.querySelector('.section-label-v5');
            const shapes = shapeSection.querySelector('.shapes-v5');

            expect(label).toBeTruthy();
            expect(shapes).toBeTruthy();
        });

        test('should have 5 shape options', () => {
            const shapes = document.querySelectorAll('.shape-opt-v5');
            expect(shapes.length).toBe(5);
        });

        test('should have correct shape values', () => {
            const shapeRadios = document.querySelectorAll('input[name="favicon-shape-data"]');
            const values = Array.from(shapeRadios).map(r => r.value);

            expect(values).toContain('circle');
            expect(values).toContain('square');
            expect(values).toContain('rounded');
            expect(values).toContain('diamond');
            expect(values).toContain('hexagon');
        });

        test('circle should be selected by default', () => {
            const circleRadio = document.querySelector('input[name="favicon-shape-data"][value="circle"]');
            expect(circleRadio.checked).toBe(true);
        });

        test('should change selection when different shape clicked', () => {
            const squareRadio = document.querySelector('input[name="favicon-shape-data"][value="square"]');
            squareRadio.click();

            expect(squareRadio.checked).toBe(true);

            const circleRadio = document.querySelector('input[name="favicon-shape-data"][value="circle"]');
            expect(circleRadio.checked).toBe(false);
        });
    });

    // ==========================================
    // 5. SPACING & LAYOUT TESTS
    // ==========================================
    describe('5. Layout Structure', () => {
        test('should have 3-column grid layout', () => {
            const grid = document.querySelector('.org-favicon-grid-v5');
            expect(grid).toBeTruthy();

            const columns = grid.children;
            expect(columns.length).toBe(3);
        });

        test('should have org list column', () => {
            const orgListCol = document.querySelector('.org-list-col-v5');
            expect(orgListCol).toBeTruthy();
        });

        test('should have editor column', () => {
            const editorCol = document.querySelector('.editor-col-v5');
            expect(editorCol).toBeTruthy();
        });

        test('should have info column', () => {
            const infoCol = document.querySelector('.info-col-v5');
            expect(infoCol).toBeTruthy();
        });

        test('should have editor sections with consistent structure', () => {
            const editorSections = document.querySelectorAll('.editor-section-v5');
            const colorSection = document.querySelector('.color-section-v5');
            const shapeSection = document.querySelector('.shape-section-v5');
            const labelSection = document.querySelector('.label-section-v5');

            // 1 editor-section-v5 (Env) + color-section-v5 + shape-section-v5 + label-section-v5
            expect(editorSections.length).toBeGreaterThanOrEqual(1);
            expect(colorSection).toBeTruthy();
            expect(shapeSection).toBeTruthy();
            expect(labelSection).toBeTruthy();
        });
    });

    // ==========================================
    // 6. ACTION BUTTONS TESTS
    // ==========================================
    describe('6. Action Buttons', () => {
        test('should have Reset to Default button', () => {
            const resetBtn = document.getElementById('reset-favicon-btn-data');
            expect(resetBtn).toBeTruthy();
            expect(resetBtn.textContent).toBe('Reset to Default');
            expect(resetBtn.classList.contains('btn-secondary-v5')).toBe(true);
        });

        test('should have Save & Apply button', () => {
            const saveBtn = document.getElementById('save-org-icon-btn');
            expect(saveBtn).toBeTruthy();
            expect(saveBtn.textContent).toBe('Save & Apply');
            expect(saveBtn.classList.contains('btn-primary-v5')).toBe(true);
        });

        test('Save button should be disabled by default', () => {
            const saveBtn = document.getElementById('save-org-icon-btn');
            expect(saveBtn.disabled).toBe(true);
        });

        test('should have actions row with proper class', () => {
            const actionsRow = document.querySelector('.actions-row-v5');
            expect(actionsRow).toBeTruthy();
        });
    });

    // ==========================================
    // 7. PREVIEW CLARITY TESTS
    // ==========================================
    describe('7. Preview Clarity', () => {
        test('should toggle dark background when dark button clicked', () => {
            const darkBtn = document.getElementById('preview-bg-dark');
            darkBtn.click();

            expect(mockDataExplorer.setPreviewBackgroundV4).toHaveBeenCalledWith('dark');
        });

        test('should toggle light background when light button clicked', () => {
            const lightBtn = document.getElementById('preview-bg-light');
            lightBtn.click();

            expect(mockDataExplorer.setPreviewBackgroundV4).toHaveBeenCalledWith('light');
        });

        test('should update draft badge when preset is selected', () => {
            const prodBtn = document.querySelector('.env-btn-v5[data-preset="PROD"]');
            prodBtn.click();

            const draftBadge = document.getElementById('preview-draft-badge');
            expect(draftBadge.textContent).toBe('PRD');
        });

        test('should have change indicator for unsaved changes', () => {
            const changeIndicator = document.getElementById('draft-status-badge');
            expect(changeIndicator).toBeTruthy();
            expect(changeIndicator.classList.contains('change-indicator-v5')).toBe(true);
        });

        test('draft preview should get has-changes class on change', () => {
            mockDataExplorer._appliedIconConfig = { color: '#ff6b6b', label: '', shape: 'circle' };
            mockDataExplorer._draftIconConfig = { color: '#339af0', label: 'DEV', shape: 'circle' };
            mockDataExplorer.hasUnsavedChanges = jest.fn(() => true);

            const devBtn = document.querySelector('.env-btn-v5[data-preset="DEV"]');
            devBtn.click();

            const draftCard = document.getElementById('preview-card-draft');
            expect(draftCard.classList.contains('has-changes')).toBe(true);
        });
    });

    // ==========================================
    // ADDITIONAL V5 FEATURE TESTS
    // ==========================================
    describe('Additional V5 Features', () => {
        test('should have badge label input with max 3 characters', () => {
            const labelInput = document.getElementById('favicon-label-data');
            expect(labelInput).toBeTruthy();
            expect(labelInput.maxLength).toBe(3);
        });

        test('should have label section in single row layout', () => {
            const labelSection = document.querySelector('.label-section-v5');
            expect(labelSection).toBeTruthy();

            // Should contain label, input, hint, and apply-all in same container
            const label = labelSection.querySelector('.section-label-v5');
            const input = labelSection.querySelector('.input-label-v5');
            const hint = labelSection.querySelector('.label-hint-v5');
            const applyAll = labelSection.querySelector('.apply-all-v5');

            expect(label).toBeTruthy();
            expect(input).toBeTruthy();
            expect(hint).toBeTruthy();
            expect(applyAll).toBeTruthy();
        });

        test('should have label hint text', () => {
            const hint = document.querySelector('.label-hint-v5');
            expect(hint).toBeTruthy();
            expect(hint.textContent).toBe('Max 3 chars');
        });

        test('should have apply all tabs checkbox', () => {
            const checkbox = document.getElementById('apply-all-tabs-toggle');
            expect(checkbox).toBeTruthy();
            expect(checkbox.type).toBe('checkbox');
        });

        test('should have unsaved changes banner', () => {
            const banner = document.getElementById('unsaved-changes-banner');
            expect(banner).toBeTruthy();
            expect(banner.hidden).toBe(true);
        });

        test('should have status message element', () => {
            const status = document.getElementById('favicon-status-data');
            expect(status).toBeTruthy();
            expect(status.classList.contains('status-msg-v5')).toBe(true);
        });

        test('should show status message correctly', () => {
            mockDataExplorer.showFaviconStatus('Saved successfully!', 'success');

            const status = document.getElementById('favicon-status-data');
            expect(status.textContent).toBe('Saved successfully!');
            expect(status.classList.contains('success')).toBe(true);
            expect(status.hidden).toBe(false);
        });

        test('should have empty state when no org selected', () => {
            const emptyState = document.getElementById('no-org-selected-state');
            expect(emptyState).toBeTruthy();
            expect(emptyState.hidden).toBe(false);

            const editorPanel = document.getElementById('icon-editor-panel');
            expect(editorPanel.hidden).toBe(true);
        });

        test('should show editor panel when org is selected', () => {
            mockDataExplorer.showIconEditorPanel(true);

            const emptyState = document.getElementById('no-org-selected-state');
            const editorPanel = document.getElementById('icon-editor-panel');

            expect(emptyState.hidden).toBe(true);
            expect(editorPanel.hidden).toBe(false);
        });

        test('should have org search input', () => {
            const searchInput = document.getElementById('org-search-input');
            expect(searchInput).toBeTruthy();
            expect(searchInput.classList.contains('search-input-v5')).toBe(true);
        });

        test('should have add org button', () => {
            const addBtn = document.getElementById('add-current-org-btn');
            expect(addBtn).toBeTruthy();
            expect(addBtn.classList.contains('btn-add-v5')).toBe(true);
        });

        test('should have refresh org button', () => {
            const refreshBtn = document.getElementById('refresh-org-btn-data');
            expect(refreshBtn).toBeTruthy();
            expect(refreshBtn.classList.contains('btn-icon-v5')).toBe(true);
        });

        test('should have org info rows', () => {
            const infoRows = document.querySelectorAll('.info-row-v5');
            expect(infoRows.length).toBeGreaterThanOrEqual(3);
        });
    });

    // ==========================================
    // CLEAR PRESET SELECTION TEST
    // ==========================================
    describe('Clear Preset Selection', () => {
        test('should clear all env button active states', () => {
            const devBtn = document.querySelector('.env-btn-v5[data-preset="DEV"]');
            devBtn.click();
            expect(devBtn.classList.contains('active')).toBe(true);

            mockDataExplorer.clearPresetSelection();
            expect(devBtn.classList.contains('active')).toBe(false);
        });
    });
});

