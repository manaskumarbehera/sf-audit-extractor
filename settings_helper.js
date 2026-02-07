(function () {
    'use strict';

    const DEFAULT_HIDDEN_TABS = new Set(['soql', 'graphql']);
    const SETTINGS_TAB = 'settings';

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
            pane.className = 'tab-pane';
            pane.dataset.tab = SETTINGS_TAB;
            pane.setAttribute('hidden', '');
            pane.innerHTML = `
                <div class="settings-group">
                    <h4>Tab visibility</h4>
                    <div class="settings-list" id="tab-settings-list"></div>
                </div>
            `;
            panesContainer.appendChild(pane);
        }
    }

    async function getTabVisibility(names) {
        let vis = {};
        try {
            const r = await chrome.storage?.local?.get?.({ tabVisibility: {} });
            vis = r?.tabVisibility || {};
        } catch {}
        names.forEach(n => {
            if (typeof vis[n] === 'undefined') {
                vis[n] = (n === SETTINGS_TAB) ? true : !DEFAULT_HIDDEN_TABS.has(n);
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
        const list = document.getElementById('tab-settings-list');
        if (!list) return;

        const buttons = Array.from(document.querySelectorAll('.tab-button'));
        const names = buttons.map(b => b.dataset.tab);
        const labels = new Map(names.map(n => {
            const b = buttons.find(x => x.dataset.tab === n);
            return [n, (b?.textContent || n).trim()];
        }));

        const vis = await getTabVisibility(names);

        list.innerHTML = '';

        names
            .filter(n => n !== SETTINGS_TAB)
            .forEach(n => {
                const id = `tab-vis-${n}`;
                const row = document.createElement('label');
                row.setAttribute('for', id);
                const cb = document.createElement('input');
                cb.type = 'checkbox';
                cb.id = id;
                cb.checked = !!vis[n];
                cb.dataset.tab = n;
                const span = document.createElement('span');
                span.textContent = labels.get(n);
                row.appendChild(cb);
                row.appendChild(span);
                list.appendChild(row);

                cb.addEventListener('change', async () => {
                    const updated = { ...(await getTabVisibility(names)), [n]: cb.checked };
                    await setTabVisibility(updated);
                    if (typeof onVisibilityChanged === 'function') onVisibilityChanged(updated);
                });
            });

        try {
            const settingsPane = document.querySelector('.tab-pane[data-tab="settings"]');
            if (!settingsPane) return;

            function ensureEditorGroup(id, title) {
                let group = settingsPane.querySelector(`#${id}`);
                if (!group) {
                    group = document.createElement('div');
                    group.className = 'settings-group';
                    group.id = id;
                    group.innerHTML = `
                        <h4>${title}</h4>
                        <div class="settings-list" role="group" aria-labelledby="${id}-label"></div>
                    `;
                    settingsPane.appendChild(group);
                }
                const listEl = group.querySelector('.settings-list');
                listEl.innerHTML = '';
                return group;
            }

            const { soqlShowObjectSelector = true, graphqlShowObjectSelector = true, graphqlAutoFormat = true } = await chrome.storage?.local?.get?.({ soqlShowObjectSelector: true, graphqlShowObjectSelector: true, graphqlAutoFormat: true }) || {};

            // SOQL editor group: "Show Object selector" and "Enable Builder"
            const soqlGroup = ensureEditorGroup('soql-editor-settings', 'SOQL Query Editor');
            const soqlListEl = soqlGroup.querySelector('.settings-list');
            if (soqlListEl) {
                // 1. Show Object Selector
                const selLabel = document.createElement('label');
                const selCb = document.createElement('input');
                selCb.type = 'checkbox';
                selCb.id = 'setting-soql-object-selector';
                selCb.checked = !!soqlShowObjectSelector;
                const selSpan = document.createElement('span');
                selSpan.textContent = 'Show Object selector';
                selLabel.appendChild(selCb);
                selLabel.appendChild(selSpan);
                soqlListEl.appendChild(selLabel);
                selCb.addEventListener('change', async () => {
                    try { await chrome.storage?.local?.set?.({ soqlShowObjectSelector: !!selCb.checked }); } catch {}
                    try { document.dispatchEvent(new CustomEvent('soql-settings-changed')); } catch {}
                });

                // 2. Enable Query Builder
                const { soqlEnableBuilder = true } = await chrome.storage?.local?.get?.({ soqlEnableBuilder: true }) || {};
                const bldLabel = document.createElement('label');
                const bldCb = document.createElement('input');
                bldCb.type = 'checkbox';
                bldCb.id = 'setting-soql-enable-builder';
                bldCb.checked = !!soqlEnableBuilder;
                const bldSpan = document.createElement('span');
                bldSpan.textContent = 'Enable Query Builder';
                bldLabel.appendChild(bldCb);
                bldLabel.appendChild(bldSpan);
                soqlListEl.appendChild(bldLabel);
                bldCb.addEventListener('change', async () => {
                    try { await chrome.storage?.local?.set?.({ soqlEnableBuilder: !!bldCb.checked }); } catch {}
                    try { document.dispatchEvent(new CustomEvent('soql-settings-changed')); } catch {}
                });
            }

            // GraphQL editor group: Show Object selector and Auto-format checkboxes
            const gqlGroup = ensureEditorGroup('graphql-editor-settings', 'GraphQL Query Editor');
            const gqlListEl = gqlGroup.querySelector('.settings-list');
            if (gqlListEl) {
                // Object selector checkbox
                const cbLabel = document.createElement('label');
                const cb = document.createElement('input');
                cb.type = 'checkbox';
                cb.id = 'setting-graphql-object-selector';
                cb.checked = !!graphqlShowObjectSelector;
                const span = document.createElement('span');
                span.textContent = 'Show Object selector';
                cbLabel.appendChild(cb);
                cbLabel.appendChild(span);
                gqlListEl.appendChild(cbLabel);
                cb.addEventListener('change', async () => {
                    try { await chrome.storage?.local?.set?.({ graphqlShowObjectSelector: !!cb.checked }); } catch {}
                    try { document.dispatchEvent(new CustomEvent('graphql-settings-changed')); } catch {}
                });

                // Auto-format checkbox
                const autoFormatLabel = document.createElement('label');
                const autoFormatCb = document.createElement('input');
                autoFormatCb.type = 'checkbox';
                autoFormatCb.id = 'setting-graphql-auto-format';
                autoFormatCb.checked = !!graphqlAutoFormat;
                const autoFormatSpan = document.createElement('span');
                autoFormatSpan.textContent = 'Auto-format queries on load';
                autoFormatLabel.appendChild(autoFormatCb);
                autoFormatLabel.appendChild(autoFormatSpan);
                gqlListEl.appendChild(autoFormatLabel);
                autoFormatCb.addEventListener('change', async () => {
                    try { await chrome.storage?.local?.set?.({ graphqlAutoFormat: !!autoFormatCb.checked }); } catch {}
                    try { document.dispatchEvent(new CustomEvent('graphql-settings-changed')); } catch {}
                });
            }
        } catch {}
    }

    function firstVisibleTabName() {
        const order = Array.from(document.querySelectorAll('.tab-button'))
            .filter(b => !b.hidden)
            .map(b => b.dataset.tab);
        return order[0] || SETTINGS_TAB;
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

    window.SettingsHelper = {
        injectFlexCss,
        ensureSettingsTabExists,
        applyTabVisibilityFromStorage,
        buildSettingsPanel,
        firstVisibleTabName,
        showTab,
        DEFAULT_HIDDEN_TABS,
        getSoqlObjectSelectorVisibility,
        getGraphqlObjectSelectorVisibility,
        getGraphqlAutoFormatPreference,
    };
})();
