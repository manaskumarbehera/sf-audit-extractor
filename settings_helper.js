(function () {
    'use strict';

    const DEFAULT_HIDDEN_TABS = new Set(['soql', 'graphql']);
    const SETTINGS_TAB = 'settings';
    const ALWAYS_VISIBLE_TABS = new Set(['settings', 'about']); // Tabs that cannot be hidden
    const DEFAULT_TAB = 'about'; // Default tab on first install

    function injectFlexCss() {
        if (document.head.querySelector('style[data-injected="popup-flex"]')) return;
        const css = `
:root, body, html { height: 100%; }
body { margin: 0; display: flex; flex-direction: column; min-height: 0; }
#popup-root, .popup-root { display: flex; flex-direction: column; min-height: 0; height: 100%; }
.header, .footer { flex: 0 0 auto; }
.main { display: flex; flex-direction: column; min-height: 0; flex: 1 1 auto; }
.tabs { display: flex; flex-wrap: nowrap; gap: 4px; flex: 0 0 auto; }
.tab-button[hidden] { display: none !important; }
.tab-stack, .tab-content, .tab-panes { display: flex; flex-direction: column; min-height: 0; flex: 1 1 auto; }
.tab-pane { display: none; flex: 1 1 auto; min-height: 0; }
.tab-pane.active { display: flex; flex-direction: column; }
.tab-pane[hidden] { display: none !important; }
.pane-scroll, .scroll, .log, .list, .pane-body { overflow: auto; min-height: 0; flex: 1 1 auto; }
.dragging { opacity: 0.6; }
.tab-button.drop-before { box-shadow: -4px 0 0 0 var(--accent, #26a); }
.tab-button.drop-after  { box-shadow:  4px 0 0 0 var(--accent, #26a); }
.settings-group { padding: 8px; }
.settings-group h4 { margin: 0 0 8px 0; font-size: 13px; }
.settings-list { display: grid; grid-template-columns: 1fr 1fr; gap: 6px 12px; }
.settings-list label { display: inline-flex; gap: 6px; align-items: center; }
        `.trim();
        try {
            const style = document.createElement('style');
            style.setAttribute('data-injected', 'popup-flex');
            style.textContent = css;
            document.head.appendChild(style);
        } catch {}
    }

    function ensureSettingsTabExists() {
        const tabsContainer = document.querySelector('.tabs');
        const panesContainer = document.querySelector('.tab-panes, .tab-content, .tab-stack') || document.body;
        if (!tabsContainer) return;

        let btn = tabsContainer.querySelector(`.tab-button[data-tab="${SETTINGS_TAB}"]`);
        if (!btn) {
            btn = document.createElement('button');
            btn.className = 'tab-button';
            btn.type = 'button';
            btn.dataset.tab = SETTINGS_TAB;
            btn.textContent = 'Settings';
            btn.setAttribute('aria-selected', 'false');
            btn.title = (btn.title ? btn.title + ' — ' : '') + 'Drag to reorder';
            tabsContainer.appendChild(btn);
        }

        let pane = document.querySelector(`.tab-pane[data-tab="${SETTINGS_TAB}"]`);
        if (!pane) {
            pane = document.createElement('section');
            pane.className = 'tab-pane settings-pane';
            pane.dataset.tab = SETTINGS_TAB;
            pane.setAttribute('hidden', '');
            panesContainer.appendChild(pane);
        }

        // Always ensure the pane has the settings-pane class
        pane.classList.add('settings-pane');

        // Check if accordion already exists, if not add the structure
        if (!pane.querySelector('#tab-accordion')) {
            pane.innerHTML = `
                <div class="settings-scroll">
                    <div class="settings-container">
                        <div class="settings-section settings-card">
                            <div class="settings-card-header">
                                <span class="settings-icon">🧩</span>
                                <h4>Tab Order & Visibility</h4>
                                <span class="settings-hint">Drag to reorder</span>
                            </div>
                            <div class="settings-card-body">
                                <div class="tab-accordion" id="tab-accordion"></div>
                            </div>
                        </div>
                    </div>
                </div>
            `;
        }
    }

    async function getTabVisibility(names) {
        let vis = {};
        try {
            const r = await chrome.storage?.local?.get?.({ tabVisibility: {} });
            vis = r?.tabVisibility || {};
        } catch {}
        names.forEach(n => {
            if (ALWAYS_VISIBLE_TABS.has(n)) {
                // These tabs are always visible and cannot be hidden
                vis[n] = true;
            } else if (typeof vis[n] === 'undefined') {
                vis[n] = !DEFAULT_HIDDEN_TABS.has(n);
            }
        });
        return vis;
    }

    async function setTabVisibility(vis) {
        try { await chrome.storage?.local?.set?.({ tabVisibility: vis }); } catch {}
    }

    async function applyTabVisibilityFromStorage(buttons, panes) {
        const names = Array.from(buttons).map(b => b.dataset.tab);
        const vis = await getTabVisibility(names);

        buttons.forEach(b => {
            const name = b.dataset.tab;
            const visible = !!vis[name];
            b.hidden = !visible;
            b.setAttribute('aria-hidden', visible ? 'false' : 'true');
        });

        panes.forEach(p => {
            const name = p.dataset.tab;
            const visible = !!vis[name];
            if (!visible) {
                p.setAttribute('hidden', '');
                p.classList.remove('active');
                p.dataset.hiddenBySetting = 'true';
            } else {
                p.dataset.hiddenBySetting = 'false';
            }
        });

        return vis;
    }

    async function buildSettingsPanel(onVisibilityChanged) {
        const accordion = document.getElementById('tab-accordion');
        if (!accordion) return;

        const buttons = Array.from(document.querySelectorAll('.tab-button'));
        const names = buttons.map(b => b.dataset.tab);
        const labels = new Map(names.map(n => {
            const b = buttons.find(x => x.dataset.tab === n);
            // Get only the text content, not the icon
            // For icon-only tabs, use title or aria-label attribute
            const textSpan = b?.querySelector('.tab-text');
            let label;
            if (textSpan) {
                label = textSpan.textContent.trim();
            } else if (b?.classList.contains('tab-icon-only')) {
                // Icon-only tab - use title or aria-label
                label = b.getAttribute('title') || b.getAttribute('aria-label') || n;
            } else {
                label = (b?.textContent || n).trim();
            }
            return [n, label];
        }));

        const tabIcons = {
            sf: '🔍', soql: '📊', graphql: '🔗', platform: '📡',
            data: '💾', help: '❓', settings: '⚙️', lms: '📢', about: 'ℹ️'
        };

        const vis = await getTabVisibility(names);

        // Get editor settings from storage
        const editorSettings = await chrome.storage?.local?.get?.({
            soqlShowObjectSelector: true,
            soqlEnableBuilder: true,
            graphqlShowObjectSelector: true,
            graphqlAutoFormat: true,
            platformAutoSubscribe: false,
            platformShowPublishButton: true,
            lmsShowPublishButton: true,
            lmsAutoLoadChannels: false
        }) || {};

        accordion.innerHTML = '';

        // Track dragged element at module level for drag-and-drop
        let draggedItem = null;

        // Create accordion items for each tab (except settings and about - they're always visible)
        names.filter(n => !ALWAYS_VISIBLE_TABS.has(n)).forEach(n => {
            const item = document.createElement('div');
            item.className = 'accordion-item';
            item.dataset.tab = n;
            item.draggable = true;

            // Check if this tab has sub-settings
            const hasSubSettings = (n === 'soql' || n === 'graphql' || n === 'platform' || n === 'lms');

            // Build sub-settings HTML for SOQL
            let subSettingsHtml = '';
            if (n === 'soql') {
                subSettingsHtml = `
                    <div class="accordion-sub-settings">
                        <label class="sub-setting-item">
                            <input type="checkbox" id="setting-soql-object-selector" ${editorSettings.soqlShowObjectSelector ? 'checked' : ''}>
                            <span>Show Object selector</span>
                        </label>
                        <label class="sub-setting-item">
                            <input type="checkbox" id="setting-soql-enable-builder" ${editorSettings.soqlEnableBuilder ? 'checked' : ''}>
                            <span>Enable Query Builder</span>
                        </label>
                    </div>
                `;
            } else if (n === 'graphql') {
                subSettingsHtml = `
                    <div class="accordion-sub-settings">
                        <label class="sub-setting-item">
                            <input type="checkbox" id="setting-graphql-object-selector" ${editorSettings.graphqlShowObjectSelector ? 'checked' : ''}>
                            <span>Show Object selector</span>
                        </label>
                        <label class="sub-setting-item">
                            <input type="checkbox" id="setting-graphql-auto-format" ${editorSettings.graphqlAutoFormat ? 'checked' : ''}>
                            <span>Auto-format queries on load</span>
                        </label>
                    </div>
                `;
            } else if (n === 'platform') {
                subSettingsHtml = `
                    <div class="accordion-sub-settings">
                        <label class="sub-setting-item">
                            <input type="checkbox" id="setting-platform-show-publish" ${editorSettings.platformShowPublishButton ? 'checked' : ''}>
                            <span>Show Publish button</span>
                        </label>
                        <label class="sub-setting-item">
                            <input type="checkbox" id="setting-platform-auto-subscribe" ${editorSettings.platformAutoSubscribe ? 'checked' : ''}>
                            <span>Auto-subscribe on select</span>
                        </label>
                    </div>
                `;
            } else if (n === 'lms') {
                subSettingsHtml = `
                    <div class="accordion-sub-settings">
                        <label class="sub-setting-item">
                            <input type="checkbox" id="setting-lms-show-publish" ${editorSettings.lmsShowPublishButton ? 'checked' : ''}>
                            <span>Show Publish button</span>
                        </label>
                        <label class="sub-setting-item">
                            <input type="checkbox" id="setting-lms-auto-load" ${editorSettings.lmsAutoLoadChannels ? 'checked' : ''}>
                            <span>Auto-load channels on tab open</span>
                        </label>
                    </div>
                `;
            }

            item.innerHTML = `
                <div class="accordion-header">
                    <span class="accordion-drag-handle" title="Drag to reorder">⋮⋮</span>
                    <span class="accordion-icon">${tabIcons[n] || '📋'}</span>
                    <span class="accordion-label">${labels.get(n)}</span>
                    <label class="accordion-toggle" title="Toggle visibility">
                        <input type="checkbox" class="visibility-checkbox" data-tab="${n}" ${vis[n] ? 'checked' : ''}>
                        <span class="toggle-slider"></span>
                    </label>
                    ${hasSubSettings ? '<span class="accordion-expand" title="Expand settings">▼</span>' : ''}
                </div>
                ${subSettingsHtml}
            `;

            // Mark hidden tabs
            if (!vis[n]) {
                item.classList.add('hidden-tab');
            }

            // Wire up visibility toggle
            const visCheckbox = item.querySelector('.visibility-checkbox');
            if (visCheckbox) {
                visCheckbox.addEventListener('change', async (e) => {
                    e.stopPropagation();
                    const updated = { ...(await getTabVisibility(names)), [n]: visCheckbox.checked };
                    await setTabVisibility(updated);
                    item.classList.toggle('hidden-tab', !visCheckbox.checked);
                    if (typeof onVisibilityChanged === 'function') onVisibilityChanged(updated);
                });
            }

            // Wire up sub-settings if present
            if (n === 'soql') {
                const objSelector = item.querySelector('#setting-soql-object-selector');
                const builderToggle = item.querySelector('#setting-soql-enable-builder');
                if (objSelector) {
                    objSelector.addEventListener('change', async () => {
                        try { await chrome.storage?.local?.set?.({ soqlShowObjectSelector: objSelector.checked }); } catch {}
                        try { document.dispatchEvent(new CustomEvent('soql-settings-changed')); } catch {}
                    });
                }
                if (builderToggle) {
                    builderToggle.addEventListener('change', async () => {
                        try { await chrome.storage?.local?.set?.({ soqlEnableBuilder: builderToggle.checked }); } catch {}
                        try { document.dispatchEvent(new CustomEvent('soql-settings-changed')); } catch {}
                    });
                }
            } else if (n === 'graphql') {
                const objSelector = item.querySelector('#setting-graphql-object-selector');
                const autoFormat = item.querySelector('#setting-graphql-auto-format');
                if (objSelector) {
                    objSelector.addEventListener('change', async () => {
                        try { await chrome.storage?.local?.set?.({ graphqlShowObjectSelector: objSelector.checked }); } catch {}
                        try { document.dispatchEvent(new CustomEvent('graphql-settings-changed')); } catch {}
                    });
                }
                if (autoFormat) {
                    autoFormat.addEventListener('change', async () => {
                        try { await chrome.storage?.local?.set?.({ graphqlAutoFormat: autoFormat.checked }); } catch {}
                        try { document.dispatchEvent(new CustomEvent('graphql-settings-changed')); } catch {}
                    });
                }
            } else if (n === 'platform') {
                const showPublish = item.querySelector('#setting-platform-show-publish');
                const autoSubscribe = item.querySelector('#setting-platform-auto-subscribe');
                if (showPublish) {
                    showPublish.addEventListener('change', async () => {
                        try { await chrome.storage?.local?.set?.({ platformShowPublishButton: showPublish.checked }); } catch {}
                        try { document.dispatchEvent(new CustomEvent('platform-settings-changed')); } catch {}
                    });
                }
                if (autoSubscribe) {
                    autoSubscribe.addEventListener('change', async () => {
                        try { await chrome.storage?.local?.set?.({ platformAutoSubscribe: autoSubscribe.checked }); } catch {}
                        try { document.dispatchEvent(new CustomEvent('platform-settings-changed')); } catch {}
                    });
                }
            } else if (n === 'lms') {
                const showPublish = item.querySelector('#setting-lms-show-publish');
                const autoLoad = item.querySelector('#setting-lms-auto-load');
                if (showPublish) {
                    showPublish.addEventListener('change', async () => {
                        try { await chrome.storage?.local?.set?.({ lmsShowPublishButton: showPublish.checked }); } catch {}
                        try { document.dispatchEvent(new CustomEvent('lms-settings-changed')); } catch {}
                    });
                }
                if (autoLoad) {
                    autoLoad.addEventListener('change', async () => {
                        try { await chrome.storage?.local?.set?.({ lmsAutoLoadChannels: autoLoad.checked }); } catch {}
                        try { document.dispatchEvent(new CustomEvent('lms-settings-changed')); } catch {}
                    });
                }
            }

            // Wire up accordion expand/collapse
            const expandBtn = item.querySelector('.accordion-expand');
            const subSettings = item.querySelector('.accordion-sub-settings');
            if (expandBtn && subSettings) {
                expandBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const isExpanded = item.classList.toggle('expanded');
                    expandBtn.textContent = isExpanded ? '▲' : '▼';
                });
            }

            // Drag and drop handlers
            item.addEventListener('dragstart', (e) => {
                draggedItem = item;
                item.classList.add('dragging');
                e.dataTransfer.effectAllowed = 'move';
                e.dataTransfer.setData('text/plain', n);
                // Allow drag to initiate
                setTimeout(() => item.style.opacity = '0.4', 0);
            });

            item.addEventListener('dragend', () => {
                item.classList.remove('dragging');
                item.style.opacity = '';
                draggedItem = null;
                accordion.querySelectorAll('.accordion-item').forEach(i => {
                    i.classList.remove('drop-above', 'drop-below');
                });
                saveTabOrder();
            });

            item.addEventListener('dragover', (e) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = 'move';
                if (!draggedItem || draggedItem === item) return;

                const rect = item.getBoundingClientRect();
                const midY = rect.top + rect.height / 2;

                accordion.querySelectorAll('.accordion-item').forEach(i => {
                    i.classList.remove('drop-above', 'drop-below');
                });

                if (e.clientY < midY) {
                    item.classList.add('drop-above');
                } else {
                    item.classList.add('drop-below');
                }
            });

            item.addEventListener('dragleave', (e) => {
                // Only remove if actually leaving the element
                if (!item.contains(e.relatedTarget)) {
                    item.classList.remove('drop-above', 'drop-below');
                }
            });

            item.addEventListener('drop', (e) => {
                e.preventDefault();
                if (!draggedItem || draggedItem === item) return;

                const rect = item.getBoundingClientRect();
                const midY = rect.top + rect.height / 2;
                const insertBefore = e.clientY < midY;

                if (insertBefore) {
                    accordion.insertBefore(draggedItem, item);
                } else {
                    accordion.insertBefore(draggedItem, item.nextSibling);
                }

                item.classList.remove('drop-above', 'drop-below');
            });

            accordion.appendChild(item);
        });

        function saveTabOrder() {
            const order = Array.from(accordion.querySelectorAll('.accordion-item'))
                .map(i => i.dataset.tab);
            // Add settings at the end
            order.push(SETTINGS_TAB);
            try { chrome.storage?.local?.set?.({ tabOrder: order }); } catch {}
            // Reorder actual tab buttons
            const tabsContainer = document.querySelector('.tabs');
            if (tabsContainer) {
                order.forEach(name => {
                    const btn = tabsContainer.querySelector(`.tab-button[data-tab="${name}"]`);
                    if (btn) tabsContainer.appendChild(btn);
                });
            }
        }
    }


    function firstVisibleTabName() {
        const order = Array.from(document.querySelectorAll('.tab-button'))
            .filter(b => !b.hidden)
            .map(b => b.dataset.tab);
        return order[0] || DEFAULT_TAB;
    }

    function showTab(name, currentVisibility, opts) {
        const panes = opts?.panes || document.querySelectorAll('.tab-pane');
        const buttons = opts?.buttons || document.querySelectorAll('.tab-button');
        const headerTitle = opts?.headerTitle || document.getElementById('header-title');
        const onActivated = typeof opts?.onActivated === 'function' ? opts.onActivated : () => {};

        if (!currentVisibility?.[name]) {
            name = firstVisibleTabName();
        }

        panes.forEach(p => {
            const isActive = (p.dataset.tab === name) && currentVisibility?.[p.dataset.tab];
            p.classList.toggle('active', isActive);
            if (isActive) {
                p.removeAttribute('hidden');
            } else {
                p.setAttribute('hidden', '');
            }
        });

        buttons.forEach(b => {
            const active = b.dataset.tab === name;
            b.classList.toggle('active', active);
            b.setAttribute('aria-selected', active ? 'true' : 'false');
        });

        const activeBtn = Array.from(buttons).find(b => b.dataset.tab === name);
        if (headerTitle) headerTitle.textContent = (activeBtn?.textContent || 'Audit Trails').trim();

        try { chrome.storage?.local?.set?.({ lastTab: name }); } catch {}

        try { onActivated(name); } catch {}

        return name;
    }

    async function getSoqlObjectSelectorVisibility() {
        try {
            const { soqlShowObjectSelector = true } = await chrome.storage?.local?.get?.({ soqlShowObjectSelector: true }) || {};
            return !!soqlShowObjectSelector;
        } catch { return true; }
    }

    async function getGraphqlObjectSelectorVisibility() {
        try {
            const { graphqlShowObjectSelector = true } = await chrome.storage?.local?.get?.({ graphqlShowObjectSelector: true }) || {};
            return !!graphqlShowObjectSelector;
        } catch { return true; }
    }

    async function getGraphqlAutoFormatPreference() {
        try {
            const { graphqlAutoFormat = true } = await chrome.storage?.local?.get?.({ graphqlAutoFormat: true }) || {};
            return !!graphqlAutoFormat;
        } catch { return true; }
    }

    async function getPlatformShowPublishButton() {
        try {
            const { platformShowPublishButton = true } = await chrome.storage?.local?.get?.({ platformShowPublishButton: true }) || {};
            return !!platformShowPublishButton;
        } catch { return true; }
    }

    async function getPlatformAutoSubscribe() {
        try {
            const { platformAutoSubscribe = false } = await chrome.storage?.local?.get?.({ platformAutoSubscribe: false }) || {};
            return !!platformAutoSubscribe;
        } catch { return false; }
    }

    async function getLmsShowPublishButton() {
        try {
            const { lmsShowPublishButton = true } = await chrome.storage?.local?.get?.({ lmsShowPublishButton: true }) || {};
            return !!lmsShowPublishButton;
        } catch { return true; }
    }

    async function getLmsAutoLoadChannels() {
        try {
            const { lmsAutoLoadChannels = false } = await chrome.storage?.local?.get?.({ lmsAutoLoadChannels: false }) || {};
            return !!lmsAutoLoadChannels;
        } catch { return false; }
    }

    window.SettingsHelper = {
        injectFlexCss,
        ensureSettingsTabExists,
        applyTabVisibilityFromStorage,
        buildSettingsPanel,
        firstVisibleTabName,
        showTab,
        DEFAULT_HIDDEN_TABS,
        DEFAULT_TAB,
        ALWAYS_VISIBLE_TABS,
        getSoqlObjectSelectorVisibility,
        getGraphqlObjectSelectorVisibility,
        getGraphqlAutoFormatPreference,
        getPlatformShowPublishButton,
        getPlatformAutoSubscribe,
        getLmsShowPublishButton,
        getLmsAutoLoadChannels,
    };
})();
