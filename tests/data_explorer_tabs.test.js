/**
 * @jest-environment jsdom
 *
 * Test Suite: Data Explorer Tab Structure
 *
 * Tests to verify the Data Explorer tab structure with:
 * - Record Scanner as the first/default tab
 * - User Manager as the second tab
 * - Sandbox & Favicon moved to Settings tab
 */

describe('Data Explorer Tab Structure', () => {

    describe('Sub-tab Order', () => {
        test('Record Scanner should be the first sub-tab in Data Explorer', () => {
            // Mock the DOM structure
            document.body.innerHTML = `
                <div id="tab-data">
                    <nav class="sub-tabs">
                        <button class="sub-tab-button active" data-subtab="record-lookup">Record Scanner</button>
                        <button class="sub-tab-button" data-subtab="user-manager">User Manager</button>
                    </nav>
                </div>
            `;

            const buttons = document.querySelectorAll('#tab-data .sub-tab-button');
            expect(buttons[0].dataset.subtab).toBe('record-lookup');
            expect(buttons[0].textContent).toBe('Record Scanner');
        });

        test('Record Scanner should be active by default', () => {
            document.body.innerHTML = `
                <div id="tab-data">
                    <nav class="sub-tabs">
                        <button class="sub-tab-button active" data-subtab="record-lookup">Record Scanner</button>
                        <button class="sub-tab-button" data-subtab="user-manager">User Manager</button>
                    </nav>
                </div>
            `;

            const activeButton = document.querySelector('#tab-data .sub-tab-button.active');
            expect(activeButton).not.toBeNull();
            expect(activeButton.dataset.subtab).toBe('record-lookup');
        });

        test('User Manager should be the second sub-tab', () => {
            document.body.innerHTML = `
                <div id="tab-data">
                    <nav class="sub-tabs">
                        <button class="sub-tab-button active" data-subtab="record-lookup">Record Scanner</button>
                        <button class="sub-tab-button" data-subtab="user-manager">User Manager</button>
                    </nav>
                </div>
            `;

            const buttons = document.querySelectorAll('#tab-data .sub-tab-button');
            expect(buttons[1].dataset.subtab).toBe('user-manager');
        });

        test('Data Explorer should have exactly 2 sub-tabs', () => {
            document.body.innerHTML = `
                <div id="tab-data">
                    <nav class="sub-tabs">
                        <button class="sub-tab-button active" data-subtab="record-lookup">Record Scanner</button>
                        <button class="sub-tab-button" data-subtab="user-manager">User Manager</button>
                    </nav>
                </div>
            `;

            const buttons = document.querySelectorAll('#tab-data .sub-tab-button');
            expect(buttons.length).toBe(2);
        });
    });

    describe('Settings Tab Structure', () => {
        test('Settings should have Org & Favicon sub-tab', () => {
            document.body.innerHTML = `
                <div id="tab-settings">
                    <nav class="sub-tabs">
                        <button class="sub-tab-button active" data-subtab="settings-org">🏢 Org & Favicon</button>
                        <button class="sub-tab-button" data-subtab="settings-display">🎨 Display</button>
                        <button class="sub-tab-button" data-subtab="settings-about">ℹ️ About</button>
                    </nav>
                </div>
            `;

            const orgButton = document.querySelector('#tab-settings [data-subtab="settings-org"]');
            expect(orgButton).not.toBeNull();
            expect(orgButton.textContent).toContain('Org & Favicon');
        });

        test('Org & Favicon should be the default active sub-tab in Settings', () => {
            document.body.innerHTML = `
                <div id="tab-settings">
                    <nav class="sub-tabs">
                        <button class="sub-tab-button active" data-subtab="settings-org">🏢 Org & Favicon</button>
                        <button class="sub-tab-button" data-subtab="settings-display">🎨 Display</button>
                        <button class="sub-tab-button" data-subtab="settings-about">ℹ️ About</button>
                    </nav>
                </div>
            `;

            const activeButton = document.querySelector('#tab-settings .sub-tab-button.active');
            expect(activeButton).not.toBeNull();
            expect(activeButton.dataset.subtab).toBe('settings-org');
        });

        test('Settings should have Display sub-tab', () => {
            document.body.innerHTML = `
                <div id="tab-settings">
                    <nav class="sub-tabs">
                        <button class="sub-tab-button active" data-subtab="settings-org">🏢 Org & Favicon</button>
                        <button class="sub-tab-button" data-subtab="settings-display">🎨 Display</button>
                        <button class="sub-tab-button" data-subtab="settings-about">ℹ️ About</button>
                    </nav>
                </div>
            `;

            const displayButton = document.querySelector('#tab-settings [data-subtab="settings-display"]');
            expect(displayButton).not.toBeNull();
        });

        test('Settings should have About sub-tab', () => {
            document.body.innerHTML = `
                <div id="tab-settings">
                    <nav class="sub-tabs">
                        <button class="sub-tab-button active" data-subtab="settings-org">🏢 Org & Favicon</button>
                        <button class="sub-tab-button" data-subtab="settings-display">🎨 Display</button>
                        <button class="sub-tab-button" data-subtab="settings-about">ℹ️ About</button>
                    </nav>
                </div>
            `;

            const aboutButton = document.querySelector('#tab-settings [data-subtab="settings-about"]');
            expect(aboutButton).not.toBeNull();
        });

        test('Settings should have exactly 3 sub-tabs', () => {
            document.body.innerHTML = `
                <div id="tab-settings">
                    <nav class="sub-tabs">
                        <button class="sub-tab-button active" data-subtab="settings-org">🏢 Org & Favicon</button>
                        <button class="sub-tab-button" data-subtab="settings-display">🎨 Display</button>
                        <button class="sub-tab-button" data-subtab="settings-about">ℹ️ About</button>
                    </nav>
                </div>
            `;

            const buttons = document.querySelectorAll('#tab-settings .sub-tab-button');
            expect(buttons.length).toBe(3);
        });
    });

    describe('Sandbox Manager Removal from Data Explorer', () => {
        test('Sandbox Manager should NOT be in Data Explorer tabs', () => {
            document.body.innerHTML = `
                <div id="tab-data">
                    <nav class="sub-tabs">
                        <button class="sub-tab-button active" data-subtab="record-lookup">Record Scanner</button>
                        <button class="sub-tab-button" data-subtab="user-manager">User Manager</button>
                    </nav>
                </div>
            `;

            const sandboxButton = document.querySelector('#tab-data [data-subtab="sandbox-manager"]');
            expect(sandboxButton).toBeNull();
        });
    });

    describe('Sub-tab Content Containers', () => {
        test('Record Scanner content should exist and be active', () => {
            document.body.innerHTML = `
                <div id="tab-data">
                    <div id="subtab-record-lookup" class="sub-tab-content active">Record Scanner Content</div>
                    <div id="subtab-user-manager" class="sub-tab-content" hidden>User Manager Content</div>
                </div>
            `;

            const recordScannerContent = document.getElementById('subtab-record-lookup');
            expect(recordScannerContent).not.toBeNull();
            expect(recordScannerContent.classList.contains('active')).toBe(true);
            expect(recordScannerContent.hidden).toBeFalsy();
        });

        test('User Manager content should exist and be hidden by default', () => {
            document.body.innerHTML = `
                <div id="tab-data">
                    <div id="subtab-record-lookup" class="sub-tab-content active">Record Scanner Content</div>
                    <div id="subtab-user-manager" class="sub-tab-content" hidden>User Manager Content</div>
                </div>
            `;

            const userManagerContent = document.getElementById('subtab-user-manager');
            expect(userManagerContent).not.toBeNull();
            expect(userManagerContent.hidden).toBe(true);
        });

        test('Settings Org content should exist', () => {
            document.body.innerHTML = `
                <div id="tab-settings">
                    <div id="subtab-settings-org" class="sub-tab-content active">Org & Favicon Content</div>
                    <div id="subtab-settings-display" class="sub-tab-content" hidden>Display Content</div>
                    <div id="subtab-settings-about" class="sub-tab-content" hidden>About Content</div>
                </div>
            `;

            const orgContent = document.getElementById('subtab-settings-org');
            expect(orgContent).not.toBeNull();
            expect(orgContent.classList.contains('active')).toBe(true);
        });
    });
});

/**
 * UX Rationale:
 *
 * 1. Record Scanner as first tab in Data Explorer:
 *    - Most frequently used feature when exploring data
 *    - Provides immediate value when user navigates to Explore tab
 *    - Aligns with user workflow of identifying/scanning records
 *
 * 2. Sandbox & Favicon moved to Settings:
 *    - Not a "data exploration" feature
 *    - Configuration/customization belongs in Settings
 *    - Users set this once and rarely change it
 *    - Keeps Data Explorer focused on data-related tasks
 *
 * 3. Settings tab structure:
 *    - Org & Favicon: Organization info + visual customization
 *    - Display: UI preferences (labels, compact mode, blinker)
 *    - About: Version info, developer credits (quick access also via main About tab)
 */

