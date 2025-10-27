(function(){
    'use strict';

    const STATE = {
        engine: null,
        elements: {
            query: null,
            suggestionTitle: null,
            suggestionMessage: null,
            statusList: null,
            container: null
        },
        teardown: []
    };

    function on(el, evt, fn, opts) {
        if (!el) return;
        el.addEventListener(evt, fn, opts);
        STATE.teardown.push(() => {
            try { el.removeEventListener(evt, fn, opts); } catch {}
        });
    }

    function setText(el, text) {
        if (!el) return;
        el.textContent = text || '';
    }

    function ensureEngine(configUrl) {
        if (STATE.engine) return Promise.resolve(STATE.engine);
        return SoqlGuidanceEngine.create(configUrl).then((engine) => {
            STATE.engine = engine;
            return engine;
        });
    }

    function renderEmpty(engine) {
        const defaults = engine?.defaults?.emptySuggestion || {};
        if (typeof defaults.title === 'string') {
            setText(STATE.elements.suggestionTitle, defaults.title);
        }
        if (typeof defaults.message === 'string') {
            setText(STATE.elements.suggestionMessage, defaults.message);
        }
        clearStatuses();
        toggleContainer(true);
    }

    function toggleContainer(hasContent) {
        const container = STATE.elements.container;
        if (!container) return;
        container.classList.toggle('is-empty', !hasContent);
    }

    function clearStatuses() {
        if (!STATE.elements.statusList) return;
        STATE.elements.statusList.innerHTML = '';
    }

    function createFlag(type, entry) {
        const div = document.createElement('div');
        div.className = `soql-guidance-flag ${type}`;
        const badge = document.createElement('span');
        badge.className = 'soql-guidance-flag-badge';
        badge.textContent = type.toUpperCase();
        const text = document.createElement('span');
        text.className = 'soql-guidance-flag-text';
        text.textContent = entry?.message || entry?.title || '';
        div.appendChild(badge);
        div.appendChild(text);
        return div;
    }

    function renderStatuses(engineResult) {
        clearStatuses();
        if (!engineResult) return;
        const list = STATE.elements.statusList;
        if (!list) return;

        const entries = [];
        (engineResult.errors || []).forEach(e => entries.push({ type: 'error', entry: e }));
        (engineResult.warnings || []).forEach(e => entries.push({ type: 'warning', entry: e }));
        (engineResult.info || []).forEach(e => entries.push({ type: 'info', entry: e }));

        entries.forEach(({ type, entry }) => {
            list.appendChild(createFlag(type, entry));
        });
    }

    function renderSuggestion(engineResult, engine) {
        if (!engineResult || !STATE.elements.suggestionTitle) return;

        if (!engineResult.query.trim()) {
            renderEmpty(engine);
            return;
        }

        const suggestion = engineResult.suggestion;
        if (suggestion) {
            setText(STATE.elements.suggestionTitle, suggestion.title || 'SOQL suggestion');
            setText(STATE.elements.suggestionMessage, suggestion.suggestion || suggestion.message || '');
            toggleContainer(true);
        } else {
            renderEmpty(engine);
        }
    }

    function evaluate() {
        const engine = STATE.engine;
        if (!engine) return;
        const query = STATE.elements.query ? STATE.elements.query.value : '';
        const result = engine.evaluate(query);
        renderSuggestion(result, engine);
        renderStatuses(result);
    }

    function attachElements(root) {
        const container = root?.querySelector('#soql-guidance');
        if (!container) return false;

        STATE.elements.container = container;
        STATE.elements.query = root?.querySelector('#soql-query') || null;
        STATE.elements.suggestionTitle = container.querySelector('.soql-guidance-card-title');
        STATE.elements.suggestionMessage = container.querySelector('.soql-guidance-card-message');
        STATE.elements.statusList = container.querySelector('.soql-guidance-flags');

        return true;
    }

    function resetTeardown() {
        STATE.teardown.splice(0).forEach(fn => { try { fn(); } catch {} });
    }

    function init(options) {
        resetTeardown();

        const root = options?.root || document;
        const configUrl = options?.configUrl ? options.configUrl : chrome?.runtime?.getURL?.('rules/soql_guidance_rules.json') || 'rules/soql_guidance_rules.json';

        if (!attachElements(root)) return () => {};

        ensureEngine(configUrl).then((engine) => {
            renderEmpty(engine);
            evaluate();
        });

        if (STATE.elements.query) {
            on(STATE.elements.query, 'input', evaluate);
            on(STATE.elements.query, 'blur', evaluate);
        }

        return () => {
            resetTeardown();
            STATE.elements = {
                query: null,
                suggestionTitle: null,
                suggestionMessage: null,
                statusList: null,
                container: null
            };
        };
    }

    window.SoqlGuidance = {
        init,
        refresh: evaluate,
        detach() {
            resetTeardown();
            STATE.elements = {
                query: null,
                suggestionTitle: null,
                suggestionMessage: null,
                statusList: null,
                container: null
            };
        }
    };
})();