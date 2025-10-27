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
        currentSuggestionKeyword: '',
        currentSuggestionKeywordMatch: '',
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
        setSuggestionKeyword('', '');
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
        text.textContent = entry?.suggestion || entry?.message || entry?.title || '';
        const keyword = typeof entry?.keyword === 'string' ? entry.keyword.trim() : '';
        if (keyword) {
            div.dataset.keyword = keyword;
            const keywordMatch = typeof entry?.keywordMatch === 'string' ? entry.keywordMatch.trim() : '';
            if (keywordMatch) {
                div.dataset.keywordMatch = keywordMatch;
            }
            div.classList.add('has-keyword');
            div.setAttribute('role', 'button');
            div.tabIndex = 0;
        }
        div.appendChild(badge);
        div.appendChild(text);
        return div;
    }

    function applyKeyword(keyword, match) {
        const queryEl = STATE.elements.query;
        const trimmedKeyword = typeof keyword === 'string' ? keyword.trim() : '';
        if (!queryEl || !trimmedKeyword) return;

        const currentValue = queryEl.value || '';
        const loweredValue = currentValue.toLowerCase();
        const loweredKeyword = trimmedKeyword.toLowerCase();
        const trimmedMatch = typeof match === 'string' ? match.trim() : '';
        let searchNeedle = trimmedMatch ? trimmedMatch.toLowerCase() : loweredKeyword;
        if (!trimmedMatch) {
            const firstToken = loweredKeyword.split(/\s+/)[0];
            if (firstToken) {
                searchNeedle = firstToken;
            }
        }
        const hasKeyword = searchNeedle ? loweredValue.includes(searchNeedle) : false;
        let nextValue = currentValue;
        if (!hasKeyword) {
            const sanitized = currentValue.replace(/\s+$/, '');
            nextValue = sanitized ? `${sanitized}\n${trimmedKeyword}` : trimmedKeyword;
        }

        const changed = nextValue !== currentValue;
        if (changed) {
            queryEl.value = nextValue;
        }
        queryEl.focus();
        try {
            const len = queryEl.value.length;
            queryEl.setSelectionRange(len, len);
        } catch {}
        if (changed) {
            queryEl.dispatchEvent(new Event('input', { bubbles: true }));
        }
    }

    function getFlagKeywordFromEvent(evt) {
        if (!evt) return { keyword: '', match: '' };
        const target = evt.target?.closest ? evt.target.closest('.soql-guidance-flag.has-keyword') : null;
        const keyword = target?.dataset?.keyword;
        const match = target?.dataset?.keywordMatch;
        return {
            keyword: typeof keyword === 'string' ? keyword : '',
            match: typeof match === 'string' ? match : ''
        };
    }

    function handleFlagActivate(evt) {
        if (!evt) return;
        if (evt.type === 'keydown' && evt.key !== 'Enter' && evt.key !== ' ') return;
        const { keyword, match } = getFlagKeywordFromEvent(evt);
        if (!keyword) return;
        if (evt.type === 'keydown') evt.preventDefault();
        applyKeyword(keyword, match);
    }

    function setSuggestionKeyword(keyword, match) {
        STATE.currentSuggestionKeyword = typeof keyword === 'string' ? keyword.trim() : '';
        STATE.currentSuggestionKeywordMatch = typeof match === 'string' ? match.trim() : '';
        const card = STATE.elements.suggestionCard;
        if (!card) return;

        if (STATE.currentSuggestionKeyword) {
            card.dataset.keyword = STATE.currentSuggestionKeyword;
            if (STATE.currentSuggestionKeywordMatch) {
                card.dataset.keywordMatch = STATE.currentSuggestionKeywordMatch;
            } else {
                card.removeAttribute('data-keyword-match');
            }
            card.classList.add('has-keyword');
            card.setAttribute('role', 'button');
            card.tabIndex = 0;
        } else {
            card.classList.remove('has-keyword');
            card.removeAttribute('data-keyword');
            card.removeAttribute('data-keyword-match');
            card.removeAttribute('role');
            card.tabIndex = -1;
        }
    }

    function handleSuggestionActivate(evt) {
        if (!evt) return;
        if (!STATE.currentSuggestionKeyword) return;
        if (evt.type === 'keydown' && evt.key !== 'Enter' && evt.key !== ' ') return;
        if (evt.type === 'keydown') evt.preventDefault();
        applyKeyword(STATE.currentSuggestionKeyword, STATE.currentSuggestionKeywordMatch);
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
            setSuggestionKeyword(suggestion.keyword || '', suggestion.keywordMatch || '');
            toggleContainer(true);
        } else {
            setSuggestionKeyword('', '');
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
        if (STATE.elements.statusList) {
            on(STATE.elements.statusList, 'click', handleFlagActivate);
            on(STATE.elements.statusList, 'keydown', handleFlagActivate);
        }

        if (STATE.elements.suggestionCard) {
            on(STATE.elements.suggestionCard, 'click', handleSuggestionActivate);
            on(STATE.elements.suggestionCard, 'keydown', handleSuggestionActivate);
        }

        return () => {
            resetTeardown();
            STATE.elements = {
                query: null,
                suggestionCard: null,
                suggestionTitle: null,
                suggestionMessage: null,
                statusList: null,
                container: null
            };
            STATE.currentSuggestionKeyword = '';
            STATE.currentSuggestionKeywordMatch = '';
        };
    }

    window.SoqlGuidance = {
        init,
        refresh: evaluate,
        detach() {
            resetTeardown();
            STATE.elements = {
                query: null,
                suggestionCard: null,
                suggestionTitle: null,
                suggestionMessage: null,
                statusList: null,
                container: null
            };
            STATE.currentSuggestionKeyword = '';
            STATE.currentSuggestionKeywordMatch = '';
        }
    };
})();