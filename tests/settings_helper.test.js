/**
 * @jest-environment jsdom
 */

const flush = () => new Promise((r) => setTimeout(r, 0));

// Mock chrome API
const mockStorage = {
    tabVisibility: {},
    tabOrder: [],
    soqlShowObjectSelector: true,
    graphqlShowObjectSelector: true,
    graphqlAutoFormat: true,
    soqlEnableBuilder: true,
    platformShowPublishButton: true,
    platformAutoSubscribe: false,
    lmsShowPublishButton: true,
    lmsAutoLoadChannels: false
};

global.chrome = {
    storage: {
        local: {
            get: jest.fn((keys, callback) => {
                const result = {};
                if (typeof keys === 'object') {
                    Object.keys(keys).forEach(key => {
                        result[key] = mockStorage[key] !== undefined ? mockStorage[key] : keys[key];
                    });
                }
                if (callback) callback(result);
                return Promise.resolve(result);
            }),
            set: jest.fn((data) => {
                Object.assign(mockStorage, data);
                return Promise.resolve();
            })
        }
    }
};

// Reset DOM and mocks before each test
function setupDOM() {
    document.body.innerHTML = `
        <div class="tabs">
            <button class="tab-button" data-tab="sf">Audit Trails</button>
            <button class="tab-button" data-tab="soql">SOQL</button>
            <button class="tab-button" data-tab="graphql">GraphQL</button>
            <button class="tab-button" data-tab="platform">Platform</button>
            <button class="tab-button" data-tab="data">Data</button>
            <button class="tab-button" data-tab="help">Help</button>
        </div>
        <div class="tab-panes">
            <section class="tab-pane active" data-tab="sf"></section>
            <section class="tab-pane" data-tab="soql"></section>
            <section class="tab-pane" data-tab="graphql"></section>
            <section class="tab-pane" data-tab="platform"></section>
            <section class="tab-pane" data-tab="data"></section>
            <section class="tab-pane" data-tab="help"></section>
        </div>
    `;
}

describe('Settings Helper - Tab Reordering', () => {
    let SettingsHelper;

    beforeEach(async () => {
        jest.resetModules();
        setupDOM();
        Object.assign(mockStorage, {
            tabVisibility: {},
            tabOrder: []
        });

        // Load the settings helper
        require('../settings_helper.js');
        SettingsHelper = window.SettingsHelper;
        await flush();
    });

    test('ensureSettingsTabExists creates settings tab and pane', () => {
        SettingsHelper.ensureSettingsTabExists();

        const settingsBtn = document.querySelector('.tab-button[data-tab="settings"]');
        const settingsPane = document.querySelector('.tab-pane[data-tab="settings"]');

        expect(settingsBtn).not.toBeNull();
        expect(settingsPane).not.toBeNull();
        expect(settingsBtn.textContent).toBe('Settings');
    });

    test('ensureSettingsTabExists creates accordion container', () => {
        SettingsHelper.ensureSettingsTabExists();

        const accordion = document.getElementById('tab-accordion');
        expect(accordion).not.toBeNull();
    });

    test('Settings pane has correct card structure', () => {
        SettingsHelper.ensureSettingsTabExists();

        const settingsPane = document.querySelector('.tab-pane[data-tab="settings"]');
        const card = settingsPane.querySelector('.settings-card');

        expect(card).not.toBeNull();
    });

    test('Settings pane has tab order section with puzzle icon', () => {
        SettingsHelper.ensureSettingsTabExists();

        const settingsPane = document.querySelector('.tab-pane[data-tab="settings"]');
        const tabOrderSection = settingsPane.querySelector('.settings-card-header .settings-icon');

        expect(tabOrderSection).not.toBeNull();
        expect(tabOrderSection.textContent).toBe('🧩');
    });
});

describe('Settings Helper - Accordion Items', () => {
    let SettingsHelper;

    beforeEach(async () => {
        jest.resetModules();
        setupDOM();
        Object.assign(mockStorage, {
            tabVisibility: { sf: true, soql: true, graphql: true, platform: true, data: true, help: true },
            tabOrder: [],
            soqlShowObjectSelector: true,
            soqlEnableBuilder: true,
            graphqlShowObjectSelector: true,
            graphqlAutoFormat: true
        });

        require('../settings_helper.js');
        SettingsHelper = window.SettingsHelper;
        await flush();
    });

    test('buildSettingsPanel creates accordion items for each tab', async () => {
        SettingsHelper.ensureSettingsTabExists();
        await SettingsHelper.buildSettingsPanel();

        const accordion = document.getElementById('tab-accordion');
        const items = accordion.querySelectorAll('.accordion-item');

        // Should have items for all tabs except settings
        expect(items.length).toBe(6);
    });

    test('Accordion items have draggable attribute', async () => {
        SettingsHelper.ensureSettingsTabExists();
        await SettingsHelper.buildSettingsPanel();

        const items = document.querySelectorAll('.accordion-item');
        items.forEach(item => {
            expect(item.draggable).toBe(true);
        });
    });

    test('Accordion items contain drag handle, icon, label, and toggle', async () => {
        SettingsHelper.ensureSettingsTabExists();
        await SettingsHelper.buildSettingsPanel();

        const item = document.querySelector('.accordion-item[data-tab="sf"]');

        expect(item.querySelector('.accordion-drag-handle')).not.toBeNull();
        expect(item.querySelector('.accordion-icon')).not.toBeNull();
        expect(item.querySelector('.accordion-label')).not.toBeNull();
        expect(item.querySelector('.accordion-toggle')).not.toBeNull();
    });

    test('Accordion items have correct data-tab attribute', async () => {
        SettingsHelper.ensureSettingsTabExists();
        await SettingsHelper.buildSettingsPanel();

        const sfItem = document.querySelector('.accordion-item[data-tab="sf"]');
        const soqlItem = document.querySelector('.accordion-item[data-tab="soql"]');

        expect(sfItem).not.toBeNull();
        expect(soqlItem).not.toBeNull();
    });

    test('Accordion item adds dragging class on dragstart', async () => {
        SettingsHelper.ensureSettingsTabExists();
        await SettingsHelper.buildSettingsPanel();

        const item = document.querySelector('.accordion-item[data-tab="sf"]');

        const dragStartEvent = new Event('dragstart', { bubbles: true });
        Object.defineProperty(dragStartEvent, 'dataTransfer', {
            value: {
                effectAllowed: 'move',
                setData: jest.fn()
            }
        });

        item.dispatchEvent(dragStartEvent);

        expect(item.classList.contains('dragging')).toBe(true);
    });

    test('Accordion item removes dragging class on dragend', async () => {
        SettingsHelper.ensureSettingsTabExists();
        await SettingsHelper.buildSettingsPanel();

        const item = document.querySelector('.accordion-item[data-tab="sf"]');

        // First add dragging class
        item.classList.add('dragging');

        // Then trigger dragend
        const dragEndEvent = new Event('dragend', { bubbles: true });
        item.dispatchEvent(dragEndEvent);

        expect(item.classList.contains('dragging')).toBe(false);
    });
});

describe('Settings Helper - SOQL Sub-Settings', () => {
    let SettingsHelper;

    beforeEach(async () => {
        jest.resetModules();
        setupDOM();
        Object.assign(mockStorage, {
            tabVisibility: { sf: true, soql: true, graphql: true, platform: true, data: true, help: true },
            tabOrder: [],
            soqlShowObjectSelector: true,
            soqlEnableBuilder: false,
            graphqlShowObjectSelector: true,
            graphqlAutoFormat: true
        });

        require('../settings_helper.js');
        SettingsHelper = window.SettingsHelper;
        await flush();
    });

    test('SOQL accordion item has expand button', async () => {
        SettingsHelper.ensureSettingsTabExists();
        await SettingsHelper.buildSettingsPanel();

        const soqlItem = document.querySelector('.accordion-item[data-tab="soql"]');
        const expandBtn = soqlItem.querySelector('.accordion-expand');

        expect(expandBtn).not.toBeNull();
    });

    test('SOQL accordion item has sub-settings container', async () => {
        SettingsHelper.ensureSettingsTabExists();
        await SettingsHelper.buildSettingsPanel();

        const soqlItem = document.querySelector('.accordion-item[data-tab="soql"]');
        const subSettings = soqlItem.querySelector('.accordion-sub-settings');

        expect(subSettings).not.toBeNull();
    });

    test('SOQL sub-settings contain Object selector checkbox', async () => {
        SettingsHelper.ensureSettingsTabExists();
        await SettingsHelper.buildSettingsPanel();

        const objSelector = document.getElementById('setting-soql-object-selector');
        expect(objSelector).not.toBeNull();
        expect(objSelector.type).toBe('checkbox');
        expect(objSelector.checked).toBe(true);
    });

    test('SOQL sub-settings contain Enable Builder checkbox', async () => {
        SettingsHelper.ensureSettingsTabExists();
        await SettingsHelper.buildSettingsPanel();

        const builderToggle = document.getElementById('setting-soql-enable-builder');
        expect(builderToggle).not.toBeNull();
        expect(builderToggle.type).toBe('checkbox');
        expect(builderToggle.checked).toBe(false);
    });

    test('Clicking expand button toggles expanded class', async () => {
        SettingsHelper.ensureSettingsTabExists();
        await SettingsHelper.buildSettingsPanel();

        const soqlItem = document.querySelector('.accordion-item[data-tab="soql"]');
        const expandBtn = soqlItem.querySelector('.accordion-expand');

        expect(soqlItem.classList.contains('expanded')).toBe(false);

        expandBtn.click();

        expect(soqlItem.classList.contains('expanded')).toBe(true);
    });
});

describe('Settings Helper - GraphQL Sub-Settings', () => {
    let SettingsHelper;

    beforeEach(async () => {
        jest.resetModules();
        setupDOM();
        Object.assign(mockStorage, {
            tabVisibility: { sf: true, soql: true, graphql: true, platform: true, data: true, help: true },
            tabOrder: [],
            soqlShowObjectSelector: true,
            soqlEnableBuilder: true,
            graphqlShowObjectSelector: false,
            graphqlAutoFormat: true
        });

        require('../settings_helper.js');
        SettingsHelper = window.SettingsHelper;
        await flush();
    });

    test('GraphQL accordion item has expand button', async () => {
        SettingsHelper.ensureSettingsTabExists();
        await SettingsHelper.buildSettingsPanel();

        const gqlItem = document.querySelector('.accordion-item[data-tab="graphql"]');
        const expandBtn = gqlItem.querySelector('.accordion-expand');

        expect(expandBtn).not.toBeNull();
    });

    test('GraphQL sub-settings contain Object selector checkbox', async () => {
        SettingsHelper.ensureSettingsTabExists();
        await SettingsHelper.buildSettingsPanel();

        const objSelector = document.getElementById('setting-graphql-object-selector');
        expect(objSelector).not.toBeNull();
        expect(objSelector.type).toBe('checkbox');
        expect(objSelector.checked).toBe(false);
    });

    test('GraphQL sub-settings contain Auto-format checkbox', async () => {
        SettingsHelper.ensureSettingsTabExists();
        await SettingsHelper.buildSettingsPanel();

        const autoFormat = document.getElementById('setting-graphql-auto-format');
        expect(autoFormat).not.toBeNull();
        expect(autoFormat.type).toBe('checkbox');
        expect(autoFormat.checked).toBe(true);
    });
});

describe('Settings Helper - Visibility Toggles', () => {
    let SettingsHelper;

    beforeEach(async () => {
        jest.resetModules();
        setupDOM();
        Object.assign(mockStorage, {
            tabVisibility: { sf: true, soql: false, graphql: false, platform: true, data: true, help: true },
            tabOrder: []
        });

        require('../settings_helper.js');
        SettingsHelper = window.SettingsHelper;
        await flush();
    });

    test('Hidden tabs are marked with hidden-tab class', async () => {
        SettingsHelper.ensureSettingsTabExists();
        await SettingsHelper.buildSettingsPanel();

        const soqlItem = document.querySelector('.accordion-item[data-tab="soql"]');
        const sfItem = document.querySelector('.accordion-item[data-tab="sf"]');

        expect(soqlItem.classList.contains('hidden-tab')).toBe(true);
        expect(sfItem.classList.contains('hidden-tab')).toBe(false);
    });

    test('Visibility checkbox reflects visibility state', async () => {
        SettingsHelper.ensureSettingsTabExists();
        await SettingsHelper.buildSettingsPanel();

        const sfCheckbox = document.querySelector('.accordion-item[data-tab="sf"] .visibility-checkbox');
        const soqlCheckbox = document.querySelector('.accordion-item[data-tab="soql"] .visibility-checkbox');

        expect(sfCheckbox.checked).toBe(true);
        expect(soqlCheckbox.checked).toBe(false);
    });

    test('Changing visibility checkbox triggers onVisibilityChanged callback', async () => {
        SettingsHelper.ensureSettingsTabExists();

        const onVisibilityChanged = jest.fn();
        await SettingsHelper.buildSettingsPanel(onVisibilityChanged);

        const soqlCheckbox = document.querySelector('.accordion-item[data-tab="soql"] .visibility-checkbox');
        soqlCheckbox.checked = true;
        soqlCheckbox.dispatchEvent(new Event('change', { bubbles: true }));

        await flush();

        expect(onVisibilityChanged).toHaveBeenCalled();
    });
});

describe('Settings Helper - Tab Icons', () => {
    let SettingsHelper;

    beforeEach(async () => {
        jest.resetModules();
        setupDOM();
        Object.assign(mockStorage, {
            tabVisibility: { sf: true, soql: true, graphql: true, platform: true, data: true, help: true },
            tabOrder: []
        });

        require('../settings_helper.js');
        SettingsHelper = window.SettingsHelper;
        await flush();
    });

    test('Accordion items display appropriate icons for known tabs', async () => {
        SettingsHelper.ensureSettingsTabExists();
        await SettingsHelper.buildSettingsPanel();

        const sfIcon = document.querySelector('.accordion-item[data-tab="sf"] .accordion-icon');
        const soqlIcon = document.querySelector('.accordion-item[data-tab="soql"] .accordion-icon');
        const graphqlIcon = document.querySelector('.accordion-item[data-tab="graphql"] .accordion-icon');

        expect(sfIcon.textContent).toBe('🔍');
        expect(soqlIcon.textContent).toBe('📊');
        expect(graphqlIcon.textContent).toBe('🔗');
    });
});

describe('Settings Helper - applyTabVisibilityFromStorage', () => {
    let SettingsHelper;

    beforeEach(async () => {
        jest.resetModules();
        setupDOM();
        Object.assign(mockStorage, {
            tabVisibility: { sf: true, soql: false, graphql: false, platform: true, data: true, help: true },
            tabOrder: []
        });

        require('../settings_helper.js');
        SettingsHelper = window.SettingsHelper;
        await flush();
    });

    test('applyTabVisibilityFromStorage hides buttons for hidden tabs', async () => {
        const buttons = document.querySelectorAll('.tab-button');
        const panes = document.querySelectorAll('.tab-pane');

        await SettingsHelper.applyTabVisibilityFromStorage(buttons, panes);

        const soqlButton = document.querySelector('.tab-button[data-tab="soql"]');
        const sfButton = document.querySelector('.tab-button[data-tab="sf"]');

        expect(soqlButton.hidden).toBe(true);
        expect(sfButton.hidden).toBe(false);
    });

    test('applyTabVisibilityFromStorage sets aria-hidden attribute', async () => {
        const buttons = document.querySelectorAll('.tab-button');
        const panes = document.querySelectorAll('.tab-pane');

        await SettingsHelper.applyTabVisibilityFromStorage(buttons, panes);

        const soqlButton = document.querySelector('.tab-button[data-tab="soql"]');
        const sfButton = document.querySelector('.tab-button[data-tab="sf"]');

        expect(soqlButton.getAttribute('aria-hidden')).toBe('true');
        expect(sfButton.getAttribute('aria-hidden')).toBe('false');
    });

    test('applyTabVisibilityFromStorage returns visibility object', async () => {
        const buttons = document.querySelectorAll('.tab-button');
        const panes = document.querySelectorAll('.tab-pane');

        const vis = await SettingsHelper.applyTabVisibilityFromStorage(buttons, panes);

        expect(vis.sf).toBe(true);
        expect(vis.soql).toBe(false);
    });
});

describe('Settings Helper - firstVisibleTabName', () => {
    let SettingsHelper;

    beforeEach(async () => {
        jest.resetModules();
        setupDOM();
        require('../settings_helper.js');
        SettingsHelper = window.SettingsHelper;
        await flush();
    });

    test('firstVisibleTabName returns first non-hidden tab', () => {
        // Hide some tabs
        const soqlBtn = document.querySelector('.tab-button[data-tab="soql"]');
        soqlBtn.hidden = true;

        const firstTab = SettingsHelper.firstVisibleTabName();

        expect(firstTab).toBe('sf');
    });

    test('firstVisibleTabName returns settings if all other tabs are hidden', () => {
        // Hide all non-settings tabs
        document.querySelectorAll('.tab-button').forEach(btn => {
            btn.hidden = true;
        });

        // Add settings tab
        SettingsHelper.ensureSettingsTabExists();
        const settingsBtn = document.querySelector('.tab-button[data-tab="settings"]');
        settingsBtn.hidden = false;

        const firstTab = SettingsHelper.firstVisibleTabName();

        expect(firstTab).toBe('settings');
    });
});

describe('Settings Helper - CSS Injection', () => {
    let SettingsHelper;

    beforeEach(async () => {
        jest.resetModules();
        setupDOM();
        require('../settings_helper.js');
        SettingsHelper = window.SettingsHelper;
        await flush();
    });

    test('injectFlexCss adds style element', () => {
        SettingsHelper.injectFlexCss();

        const style = document.querySelector('style[data-injected="popup-flex"]');
        expect(style).not.toBeNull();
    });

    test('injectFlexCss does not duplicate style element', () => {
        SettingsHelper.injectFlexCss();
        SettingsHelper.injectFlexCss();

        const styles = document.querySelectorAll('style[data-injected="popup-flex"]');
        expect(styles.length).toBe(1);
    });
});

describe('Settings Helper - Tabs without sub-settings', () => {
    let SettingsHelper;

    beforeEach(async () => {
        jest.resetModules();
        setupDOM();
        Object.assign(mockStorage, {
            tabVisibility: { sf: true, soql: true, graphql: true, platform: true, data: true, help: true },
            tabOrder: []
        });

        require('../settings_helper.js');
        SettingsHelper = window.SettingsHelper;
        await flush();
    });

    test('Non-editor tabs do not have expand button', async () => {
        SettingsHelper.ensureSettingsTabExists();
        await SettingsHelper.buildSettingsPanel();

        const sfItem = document.querySelector('.accordion-item[data-tab="sf"]');
        const expandBtn = sfItem.querySelector('.accordion-expand');

        expect(expandBtn).toBeNull();
    });

    test('Non-editor tabs do not have sub-settings', async () => {
        SettingsHelper.ensureSettingsTabExists();
        await SettingsHelper.buildSettingsPanel();

        const sfItem = document.querySelector('.accordion-item[data-tab="sf"]');
        const subSettings = sfItem.querySelector('.accordion-sub-settings');

        expect(subSettings).toBeNull();
    });
});

describe('Settings Helper - Existing Placeholder Pane', () => {
    let SettingsHelper;

    // Simulates the actual popup.html structure where settings pane has placeholder content
    function setupDOMWithExistingSettingsPane() {
        document.body.innerHTML = `
            <div class="tabs">
                <button class="tab-button" data-tab="sf">Audit Trails</button>
                <button class="tab-button" data-tab="soql">SOQL</button>
                <button class="tab-button" data-tab="graphql">GraphQL</button>
                <button class="tab-button" data-tab="platform">Platform</button>
                <button class="tab-button" data-tab="data">Data</button>
                <button class="tab-button" data-tab="help">Help</button>
                <button class="tab-button" data-tab="settings">Settings</button>
            </div>
            <div class="tab-panes">
                <section class="tab-pane active" data-tab="sf"></section>
                <section class="tab-pane" data-tab="soql"></section>
                <section class="tab-pane" data-tab="graphql"></section>
                <section class="tab-pane" data-tab="platform"></section>
                <section class="tab-pane" data-tab="data"></section>
                <section class="tab-pane" data-tab="help"></section>
                <div id="tab-settings" class="tab-pane" data-tab="settings" hidden>
                    <div class="logs-container">
                        <div class="placeholder">
                            <p>Settings</p>
                            <p class="placeholder-note">Configure preferences for the extension.</p>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    beforeEach(async () => {
        jest.resetModules();
        setupDOMWithExistingSettingsPane();
        Object.assign(mockStorage, {
            tabVisibility: { sf: true, soql: true, graphql: true, platform: true, data: true, help: true, settings: true },
            tabOrder: [],
            soqlShowObjectSelector: true,
            soqlEnableBuilder: true,
            graphqlShowObjectSelector: true,
            graphqlAutoFormat: true
        });

        require('../settings_helper.js');
        SettingsHelper = window.SettingsHelper;
        await flush();
    });

    test('ensureSettingsTabExists replaces placeholder content with accordion', () => {
        // Before: pane has placeholder content
        let pane = document.querySelector('.tab-pane[data-tab="settings"]');
        expect(pane.querySelector('.placeholder')).not.toBeNull();
        expect(pane.querySelector('#tab-accordion')).toBeNull();

        // Call ensureSettingsTabExists
        SettingsHelper.ensureSettingsTabExists();

        // After: pane has accordion structure
        pane = document.querySelector('.tab-pane[data-tab="settings"]');
        expect(pane.querySelector('.placeholder')).toBeNull();
        expect(pane.querySelector('#tab-accordion')).not.toBeNull();
    });

    test('ensureSettingsTabExists adds settings-pane class to existing pane', () => {
        const pane = document.querySelector('.tab-pane[data-tab="settings"]');
        expect(pane.classList.contains('settings-pane')).toBe(false);

        SettingsHelper.ensureSettingsTabExists();

        expect(pane.classList.contains('settings-pane')).toBe(true);
    });

    test('buildSettingsPanel creates accordion items in existing pane', async () => {
        SettingsHelper.ensureSettingsTabExists();
        await SettingsHelper.buildSettingsPanel();

        const accordion = document.getElementById('tab-accordion');
        const items = accordion.querySelectorAll('.accordion-item');

        // Should have items for sf, soql, graphql, platform, data, help (6 tabs, not settings)
        expect(items.length).toBe(6);
    });

    test('All accordion items are visible in the settings pane', async () => {
        SettingsHelper.ensureSettingsTabExists();
        await SettingsHelper.buildSettingsPanel();

        const pane = document.querySelector('.tab-pane[data-tab="settings"]');
        const accordion = pane.querySelector('#tab-accordion');

        expect(accordion).not.toBeNull();
        expect(accordion.children.length).toBe(6);

        // Check each item has visible content
        const items = accordion.querySelectorAll('.accordion-item');
        items.forEach(item => {
            expect(item.querySelector('.accordion-header')).not.toBeNull();
            expect(item.querySelector('.accordion-label')).not.toBeNull();
            expect(item.querySelector('.accordion-toggle')).not.toBeNull();
        });
    });

    test('SOQL and GraphQL items have expandable sub-settings', async () => {
        SettingsHelper.ensureSettingsTabExists();
        await SettingsHelper.buildSettingsPanel();

        const soqlItem = document.querySelector('.accordion-item[data-tab="soql"]');
        const graphqlItem = document.querySelector('.accordion-item[data-tab="graphql"]');

        expect(soqlItem.querySelector('.accordion-expand')).not.toBeNull();
        expect(soqlItem.querySelector('.accordion-sub-settings')).not.toBeNull();
        expect(graphqlItem.querySelector('.accordion-expand')).not.toBeNull();
        expect(graphqlItem.querySelector('.accordion-sub-settings')).not.toBeNull();
    });

    test('Settings pane structure includes all required containers', async () => {
        SettingsHelper.ensureSettingsTabExists();

        const pane = document.querySelector('.tab-pane[data-tab="settings"]');

        expect(pane.querySelector('.settings-scroll')).not.toBeNull();
        expect(pane.querySelector('.settings-container')).not.toBeNull();
        expect(pane.querySelector('.settings-card')).not.toBeNull();
        expect(pane.querySelector('.settings-card-header')).not.toBeNull();
        expect(pane.querySelector('.settings-card-body')).not.toBeNull();
        expect(pane.querySelector('#tab-accordion')).not.toBeNull();
    });

    test('Does not duplicate settings tab button if one already exists', () => {
        const tabsContainer = document.querySelector('.tabs');
        const buttonsBefore = tabsContainer.querySelectorAll('.tab-button[data-tab="settings"]').length;

        SettingsHelper.ensureSettingsTabExists();

        const buttonsAfter = tabsContainer.querySelectorAll('.tab-button[data-tab="settings"]').length;
        expect(buttonsAfter).toBe(buttonsBefore);
    });
});

// ============================================================================
// Platform Events Sub-Settings Tests
// ============================================================================
describe('Settings Helper - Platform Events Sub-Settings', () => {
    let SettingsHelper;

    beforeEach(async () => {
        jest.resetModules();
        setupDOM();
        // Add platform and lms tabs to DOM
        const tabs = document.querySelector('.tabs');
        const panes = document.querySelector('.tab-panes');

        const platformBtn = document.createElement('button');
        platformBtn.className = 'tab-button';
        platformBtn.dataset.tab = 'platform';
        platformBtn.textContent = 'Platform Events';
        tabs.appendChild(platformBtn);

        const platformPane = document.createElement('section');
        platformPane.className = 'tab-pane';
        platformPane.dataset.tab = 'platform';
        panes.appendChild(platformPane);

        const lmsBtn = document.createElement('button');
        lmsBtn.className = 'tab-button';
        lmsBtn.dataset.tab = 'lms';
        lmsBtn.textContent = 'LMS';
        tabs.appendChild(lmsBtn);

        const lmsPane = document.createElement('section');
        lmsPane.className = 'tab-pane';
        lmsPane.dataset.tab = 'lms';
        panes.appendChild(lmsPane);

        Object.assign(mockStorage, {
            tabVisibility: { sf: true, soql: true, graphql: true, platform: true, data: true, help: true, lms: true },
            tabOrder: [],
            soqlShowObjectSelector: true,
            soqlEnableBuilder: true,
            graphqlShowObjectSelector: true,
            graphqlAutoFormat: true,
            platformShowPublishButton: true,
            platformAutoSubscribe: false,
            lmsShowPublishButton: true,
            lmsAutoLoadChannels: false
        });

        require('../settings_helper.js');
        SettingsHelper = window.SettingsHelper;
        await flush();
    });

    test('Platform Events accordion item has expand button', async () => {
        SettingsHelper.ensureSettingsTabExists();
        await SettingsHelper.buildSettingsPanel();

        const platformItem = document.querySelector('.accordion-item[data-tab="platform"]');
        const expandBtn = platformItem.querySelector('.accordion-expand');

        expect(expandBtn).not.toBeNull();
    });

    test('Platform Events accordion item has sub-settings container', async () => {
        SettingsHelper.ensureSettingsTabExists();
        await SettingsHelper.buildSettingsPanel();

        const platformItem = document.querySelector('.accordion-item[data-tab="platform"]');
        const subSettings = platformItem.querySelector('.accordion-sub-settings');

        expect(subSettings).not.toBeNull();
    });

    test('Platform Events sub-settings contain Show Publish button checkbox', async () => {
        SettingsHelper.ensureSettingsTabExists();
        await SettingsHelper.buildSettingsPanel();

        const showPublish = document.getElementById('setting-platform-show-publish');
        expect(showPublish).not.toBeNull();
        expect(showPublish.type).toBe('checkbox');
        expect(showPublish.checked).toBe(true);
    });

    test('Platform Events sub-settings contain Auto-subscribe checkbox', async () => {
        SettingsHelper.ensureSettingsTabExists();
        await SettingsHelper.buildSettingsPanel();

        const autoSubscribe = document.getElementById('setting-platform-auto-subscribe');
        expect(autoSubscribe).not.toBeNull();
        expect(autoSubscribe.type).toBe('checkbox');
        expect(autoSubscribe.checked).toBe(false);
    });

    test('Platform Events Show Publish button checkbox reflects storage value', async () => {
        mockStorage.platformShowPublishButton = false;

        SettingsHelper.ensureSettingsTabExists();
        await SettingsHelper.buildSettingsPanel();

        const showPublish = document.getElementById('setting-platform-show-publish');
        expect(showPublish.checked).toBe(false);
    });

    test('Platform Events Auto-subscribe checkbox reflects storage value when true', async () => {
        mockStorage.platformAutoSubscribe = true;

        SettingsHelper.ensureSettingsTabExists();
        await SettingsHelper.buildSettingsPanel();

        const autoSubscribe = document.getElementById('setting-platform-auto-subscribe');
        expect(autoSubscribe.checked).toBe(true);
    });

    test('Changing Platform Show Publish saves to storage', async () => {
        SettingsHelper.ensureSettingsTabExists();
        await SettingsHelper.buildSettingsPanel();

        const showPublish = document.getElementById('setting-platform-show-publish');
        showPublish.checked = false;
        showPublish.dispatchEvent(new Event('change', { bubbles: true }));

        await flush();

        expect(chrome.storage.local.set).toHaveBeenCalledWith(
            expect.objectContaining({ platformShowPublishButton: false })
        );
    });

    test('Changing Platform Auto-subscribe saves to storage', async () => {
        SettingsHelper.ensureSettingsTabExists();
        await SettingsHelper.buildSettingsPanel();

        const autoSubscribe = document.getElementById('setting-platform-auto-subscribe');
        autoSubscribe.checked = true;
        autoSubscribe.dispatchEvent(new Event('change', { bubbles: true }));

        await flush();

        expect(chrome.storage.local.set).toHaveBeenCalledWith(
            expect.objectContaining({ platformAutoSubscribe: true })
        );
    });

    test('Changing Platform settings dispatches platform-settings-changed event', async () => {
        SettingsHelper.ensureSettingsTabExists();
        await SettingsHelper.buildSettingsPanel();

        const eventHandler = jest.fn();
        document.addEventListener('platform-settings-changed', eventHandler);

        const showPublish = document.getElementById('setting-platform-show-publish');
        showPublish.checked = false;
        showPublish.dispatchEvent(new Event('change', { bubbles: true }));

        await flush();

        expect(eventHandler).toHaveBeenCalled();

        document.removeEventListener('platform-settings-changed', eventHandler);
    });

    test('Clicking Platform expand button toggles expanded class', async () => {
        SettingsHelper.ensureSettingsTabExists();
        await SettingsHelper.buildSettingsPanel();

        const platformItem = document.querySelector('.accordion-item[data-tab="platform"]');
        const expandBtn = platformItem.querySelector('.accordion-expand');

        expect(platformItem.classList.contains('expanded')).toBe(false);

        expandBtn.click();

        expect(platformItem.classList.contains('expanded')).toBe(true);
    });
});

// ============================================================================
// LMS Sub-Settings Tests
// ============================================================================
describe('Settings Helper - LMS Sub-Settings', () => {
    let SettingsHelper;

    beforeEach(async () => {
        jest.resetModules();
        setupDOM();
        // Add platform and lms tabs to DOM
        const tabs = document.querySelector('.tabs');
        const panes = document.querySelector('.tab-panes');

        const platformBtn = document.createElement('button');
        platformBtn.className = 'tab-button';
        platformBtn.dataset.tab = 'platform';
        platformBtn.textContent = 'Platform Events';
        tabs.appendChild(platformBtn);

        const platformPane = document.createElement('section');
        platformPane.className = 'tab-pane';
        platformPane.dataset.tab = 'platform';
        panes.appendChild(platformPane);

        const lmsBtn = document.createElement('button');
        lmsBtn.className = 'tab-button';
        lmsBtn.dataset.tab = 'lms';
        lmsBtn.textContent = 'LMS';
        tabs.appendChild(lmsBtn);

        const lmsPane = document.createElement('section');
        lmsPane.className = 'tab-pane';
        lmsPane.dataset.tab = 'lms';
        panes.appendChild(lmsPane);

        Object.assign(mockStorage, {
            tabVisibility: { sf: true, soql: true, graphql: true, platform: true, data: true, help: true, lms: true },
            tabOrder: [],
            soqlShowObjectSelector: true,
            soqlEnableBuilder: true,
            graphqlShowObjectSelector: true,
            graphqlAutoFormat: true,
            platformShowPublishButton: true,
            platformAutoSubscribe: false,
            lmsShowPublishButton: true,
            lmsAutoLoadChannels: false
        });

        require('../settings_helper.js');
        SettingsHelper = window.SettingsHelper;
        await flush();
    });

    test('LMS accordion item has expand button', async () => {
        SettingsHelper.ensureSettingsTabExists();
        await SettingsHelper.buildSettingsPanel();

        const lmsItem = document.querySelector('.accordion-item[data-tab="lms"]');
        const expandBtn = lmsItem.querySelector('.accordion-expand');

        expect(expandBtn).not.toBeNull();
    });

    test('LMS accordion item has sub-settings container', async () => {
        SettingsHelper.ensureSettingsTabExists();
        await SettingsHelper.buildSettingsPanel();

        const lmsItem = document.querySelector('.accordion-item[data-tab="lms"]');
        const subSettings = lmsItem.querySelector('.accordion-sub-settings');

        expect(subSettings).not.toBeNull();
    });

    test('LMS sub-settings contain Show Publish button checkbox', async () => {
        SettingsHelper.ensureSettingsTabExists();
        await SettingsHelper.buildSettingsPanel();

        const showPublish = document.getElementById('setting-lms-show-publish');
        expect(showPublish).not.toBeNull();
        expect(showPublish.type).toBe('checkbox');
        expect(showPublish.checked).toBe(true);
    });

    test('LMS sub-settings contain Auto-load channels checkbox', async () => {
        SettingsHelper.ensureSettingsTabExists();
        await SettingsHelper.buildSettingsPanel();

        const autoLoad = document.getElementById('setting-lms-auto-load');
        expect(autoLoad).not.toBeNull();
        expect(autoLoad.type).toBe('checkbox');
        expect(autoLoad.checked).toBe(false);
    });

    test('LMS Show Publish button checkbox reflects storage value', async () => {
        mockStorage.lmsShowPublishButton = false;

        SettingsHelper.ensureSettingsTabExists();
        await SettingsHelper.buildSettingsPanel();

        const showPublish = document.getElementById('setting-lms-show-publish');
        expect(showPublish.checked).toBe(false);
    });

    test('LMS Auto-load channels checkbox reflects storage value when true', async () => {
        mockStorage.lmsAutoLoadChannels = true;

        SettingsHelper.ensureSettingsTabExists();
        await SettingsHelper.buildSettingsPanel();

        const autoLoad = document.getElementById('setting-lms-auto-load');
        expect(autoLoad.checked).toBe(true);
    });

    test('Changing LMS Show Publish saves to storage', async () => {
        SettingsHelper.ensureSettingsTabExists();
        await SettingsHelper.buildSettingsPanel();

        const showPublish = document.getElementById('setting-lms-show-publish');
        showPublish.checked = false;
        showPublish.dispatchEvent(new Event('change', { bubbles: true }));

        await flush();

        expect(chrome.storage.local.set).toHaveBeenCalledWith(
            expect.objectContaining({ lmsShowPublishButton: false })
        );
    });

    test('Changing LMS Auto-load channels saves to storage', async () => {
        SettingsHelper.ensureSettingsTabExists();
        await SettingsHelper.buildSettingsPanel();

        const autoLoad = document.getElementById('setting-lms-auto-load');
        autoLoad.checked = true;
        autoLoad.dispatchEvent(new Event('change', { bubbles: true }));

        await flush();

        expect(chrome.storage.local.set).toHaveBeenCalledWith(
            expect.objectContaining({ lmsAutoLoadChannels: true })
        );
    });

    test('Changing LMS settings dispatches lms-settings-changed event', async () => {
        SettingsHelper.ensureSettingsTabExists();
        await SettingsHelper.buildSettingsPanel();

        const eventHandler = jest.fn();
        document.addEventListener('lms-settings-changed', eventHandler);

        const showPublish = document.getElementById('setting-lms-show-publish');
        showPublish.checked = false;
        showPublish.dispatchEvent(new Event('change', { bubbles: true }));

        await flush();

        expect(eventHandler).toHaveBeenCalled();

        document.removeEventListener('lms-settings-changed', eventHandler);
    });

    test('Clicking LMS expand button toggles expanded class', async () => {
        SettingsHelper.ensureSettingsTabExists();
        await SettingsHelper.buildSettingsPanel();

        const lmsItem = document.querySelector('.accordion-item[data-tab="lms"]');
        const expandBtn = lmsItem.querySelector('.accordion-expand');

        expect(lmsItem.classList.contains('expanded')).toBe(false);

        expandBtn.click();

        expect(lmsItem.classList.contains('expanded')).toBe(true);
    });
});

// ============================================================================
// Settings Getter Functions Tests
// ============================================================================
describe('Settings Helper - Getter Functions', () => {
    let SettingsHelper;

    beforeEach(async () => {
        jest.resetModules();
        setupDOM();
        Object.assign(mockStorage, {
            platformShowPublishButton: true,
            platformAutoSubscribe: false,
            lmsShowPublishButton: true,
            lmsAutoLoadChannels: false
        });

        require('../settings_helper.js');
        SettingsHelper = window.SettingsHelper;
        await flush();
    });

    test('getPlatformShowPublishButton returns correct value when true', async () => {
        mockStorage.platformShowPublishButton = true;
        const result = await SettingsHelper.getPlatformShowPublishButton();
        expect(result).toBe(true);
    });

    test('getPlatformShowPublishButton returns correct value when false', async () => {
        mockStorage.platformShowPublishButton = false;
        const result = await SettingsHelper.getPlatformShowPublishButton();
        expect(result).toBe(false);
    });

    test('getPlatformShowPublishButton defaults to true when not set', async () => {
        delete mockStorage.platformShowPublishButton;
        const result = await SettingsHelper.getPlatformShowPublishButton();
        expect(result).toBe(true);
    });

    test('getPlatformAutoSubscribe returns correct value when true', async () => {
        mockStorage.platformAutoSubscribe = true;
        const result = await SettingsHelper.getPlatformAutoSubscribe();
        expect(result).toBe(true);
    });

    test('getPlatformAutoSubscribe returns correct value when false', async () => {
        mockStorage.platformAutoSubscribe = false;
        const result = await SettingsHelper.getPlatformAutoSubscribe();
        expect(result).toBe(false);
    });

    test('getPlatformAutoSubscribe defaults to false when not set', async () => {
        delete mockStorage.platformAutoSubscribe;
        const result = await SettingsHelper.getPlatformAutoSubscribe();
        expect(result).toBe(false);
    });

    test('getLmsShowPublishButton returns correct value when true', async () => {
        mockStorage.lmsShowPublishButton = true;
        const result = await SettingsHelper.getLmsShowPublishButton();
        expect(result).toBe(true);
    });

    test('getLmsShowPublishButton returns correct value when false', async () => {
        mockStorage.lmsShowPublishButton = false;
        const result = await SettingsHelper.getLmsShowPublishButton();
        expect(result).toBe(false);
    });

    test('getLmsShowPublishButton defaults to true when not set', async () => {
        delete mockStorage.lmsShowPublishButton;
        const result = await SettingsHelper.getLmsShowPublishButton();
        expect(result).toBe(true);
    });

    test('getLmsAutoLoadChannels returns correct value when true', async () => {
        mockStorage.lmsAutoLoadChannels = true;
        const result = await SettingsHelper.getLmsAutoLoadChannels();
        expect(result).toBe(true);
    });

    test('getLmsAutoLoadChannels returns correct value when false', async () => {
        mockStorage.lmsAutoLoadChannels = false;
        const result = await SettingsHelper.getLmsAutoLoadChannels();
        expect(result).toBe(false);
    });

    test('getLmsAutoLoadChannels defaults to false when not set', async () => {
        delete mockStorage.lmsAutoLoadChannels;
        const result = await SettingsHelper.getLmsAutoLoadChannels();
        expect(result).toBe(false);
    });
});

// ============================================================================
// Platform and LMS Tabs have Sub-Settings in Combined View
// ============================================================================
describe('Settings Helper - All Tabs with Sub-Settings', () => {
    let SettingsHelper;

    beforeEach(async () => {
        jest.resetModules();
        setupDOM();
        // Add platform and lms tabs to DOM
        const tabs = document.querySelector('.tabs');
        const panes = document.querySelector('.tab-panes');

        const platformBtn = document.createElement('button');
        platformBtn.className = 'tab-button';
        platformBtn.dataset.tab = 'platform';
        platformBtn.textContent = 'Platform Events';
        tabs.appendChild(platformBtn);

        const platformPane = document.createElement('section');
        platformPane.className = 'tab-pane';
        platformPane.dataset.tab = 'platform';
        panes.appendChild(platformPane);

        const lmsBtn = document.createElement('button');
        lmsBtn.className = 'tab-button';
        lmsBtn.dataset.tab = 'lms';
        lmsBtn.textContent = 'LMS';
        tabs.appendChild(lmsBtn);

        const lmsPane = document.createElement('section');
        lmsPane.className = 'tab-pane';
        lmsPane.dataset.tab = 'lms';
        panes.appendChild(lmsPane);

        Object.assign(mockStorage, {
            tabVisibility: { sf: true, soql: true, graphql: true, platform: true, data: true, help: true, lms: true },
            tabOrder: [],
            soqlShowObjectSelector: true,
            soqlEnableBuilder: true,
            graphqlShowObjectSelector: true,
            graphqlAutoFormat: true,
            platformShowPublishButton: true,
            platformAutoSubscribe: false,
            lmsShowPublishButton: true,
            lmsAutoLoadChannels: false
        });

        require('../settings_helper.js');
        SettingsHelper = window.SettingsHelper;
        await flush();
    });

    test('SOQL, GraphQL, Platform, and LMS all have expand buttons', async () => {
        SettingsHelper.ensureSettingsTabExists();
        await SettingsHelper.buildSettingsPanel();

        const soqlItem = document.querySelector('.accordion-item[data-tab="soql"]');
        const graphqlItem = document.querySelector('.accordion-item[data-tab="graphql"]');
        const platformItem = document.querySelector('.accordion-item[data-tab="platform"]');
        const lmsItem = document.querySelector('.accordion-item[data-tab="lms"]');

        expect(soqlItem.querySelector('.accordion-expand')).not.toBeNull();
        expect(graphqlItem.querySelector('.accordion-expand')).not.toBeNull();
        expect(platformItem.querySelector('.accordion-expand')).not.toBeNull();
        expect(lmsItem.querySelector('.accordion-expand')).not.toBeNull();
    });

    test('SF, Data, and Help tabs do NOT have expand buttons', async () => {
        SettingsHelper.ensureSettingsTabExists();
        await SettingsHelper.buildSettingsPanel();

        const sfItem = document.querySelector('.accordion-item[data-tab="sf"]');
        const dataItem = document.querySelector('.accordion-item[data-tab="data"]');
        const helpItem = document.querySelector('.accordion-item[data-tab="help"]');

        expect(sfItem.querySelector('.accordion-expand')).toBeNull();
        expect(dataItem.querySelector('.accordion-expand')).toBeNull();
        expect(helpItem.querySelector('.accordion-expand')).toBeNull();
    });

    test('All tabs with sub-settings have accordion-sub-settings container', async () => {
        SettingsHelper.ensureSettingsTabExists();
        await SettingsHelper.buildSettingsPanel();

        const soqlItem = document.querySelector('.accordion-item[data-tab="soql"]');
        const graphqlItem = document.querySelector('.accordion-item[data-tab="graphql"]');
        const platformItem = document.querySelector('.accordion-item[data-tab="platform"]');
        const lmsItem = document.querySelector('.accordion-item[data-tab="lms"]');

        expect(soqlItem.querySelector('.accordion-sub-settings')).not.toBeNull();
        expect(graphqlItem.querySelector('.accordion-sub-settings')).not.toBeNull();
        expect(platformItem.querySelector('.accordion-sub-settings')).not.toBeNull();
        expect(lmsItem.querySelector('.accordion-sub-settings')).not.toBeNull();
    });

    test('Platform and LMS settings each have 2 checkboxes', async () => {
        SettingsHelper.ensureSettingsTabExists();
        await SettingsHelper.buildSettingsPanel();

        const platformItem = document.querySelector('.accordion-item[data-tab="platform"]');
        const lmsItem = document.querySelector('.accordion-item[data-tab="lms"]');

        const platformCheckboxes = platformItem.querySelectorAll('.accordion-sub-settings input[type="checkbox"]');
        const lmsCheckboxes = lmsItem.querySelectorAll('.accordion-sub-settings input[type="checkbox"]');

        expect(platformCheckboxes.length).toBe(2);
        expect(lmsCheckboxes.length).toBe(2);
    });
});
