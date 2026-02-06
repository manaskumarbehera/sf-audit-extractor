(function(){
    'use strict';

    const STATE = {
        engine: null,
        elements: {
            query: null,
            suggestionTitle: null,
            suggestionMessage: null,
            statusList: null,
            container: null,
            suggestionCard: null
        },
        currentSuggestionKeyword: '',
        currentSuggestionKeywordMatch: '',
        // runtime debug toggle
        debug: false,
        // track last inserted WHERE placeholder to allow easy removal when the user types
        lastWherePlaceholder: null,
        teardown: [],
        // whether the user requested to show top fields when token is empty (e.g., after comma)
        pendingShowFields: false
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
        const li = document.createElement('div');
        li.className = 'soql-guidance-item';
        li.setAttribute('role', 'listitem');

        const div = document.createElement('div');
        div.className = `soql-guidance-flag ${type}`;
        const badge = document.createElement('span');
        badge.className = 'soql-guidance-flag-badge';
        badge.textContent = type.toUpperCase();
        const text = document.createElement('span');
        text.className = 'soql-guidance-flag-text';
        const messageText = entry?.suggestion || entry?.message || entry?.title || '';
        text.textContent = messageText;

        const lowerMsg = String(messageText).toLowerCase();
        let action = '';
        if (lowerMsg.includes('where') && lowerMsg.includes('clause')) action = 'insert-where';
        else if (lowerMsg.includes('limit')) action = 'insert-limit';

        const keyword = typeof entry?.keyword === 'string' ? entry.keyword.trim() : '';
        const keywordMatch = typeof entry?.keywordMatch === 'string' ? entry.keywordMatch.trim() : '';

        if (keyword) {
            div.dataset.keyword = keyword;
            if (keywordMatch) div.dataset.keywordMatch = keywordMatch;
            div.classList.add('has-keyword');
            div.setAttribute('role', 'button');
            div.tabIndex = 0;
            try {
                const km = (keywordMatch || '').toLowerCase();
                if (km === 'where' || km === 'where_clause') div.dataset.action = 'insert-where';
                else if (km === 'limit') div.dataset.action = 'insert-limit';
                else if (km === 'select' && keyword.indexOf('.') !== -1) div.dataset.action = 'insert-related';
            } catch {}
        } else if (action) {
            div.dataset.action = action;
            div.classList.add('has-keyword');
            div.setAttribute('role', 'button');
            div.tabIndex = 0;
        }

        div.appendChild(badge);
        div.appendChild(text);
        li.appendChild(div);
        return li;
    }

    function insertRelatedField(el, fieldSpec) {
      if (!el || typeof el.value !== 'string' || !fieldSpec) return;
      try {
          insertFieldIntoSelect(el, fieldSpec);
          el.dispatchEvent(new Event('input', { bubbles: true }));
      } catch (e) {
          try { el.focus(); } catch {}
      }
    }

    function insertRelatedFieldDynamic(el, objectName) {
      if (!el) return;
      const root = document;
      const obj = objectName || getFromObject(el.value || '');
      if (!obj) {
        insertRelatedField(el, 'Owner.Name');
        return;
      }
      fetchFieldsForObject(root, obj).then((fields) => {
        try {
          const arr = Array.isArray(fields) ? fields : [];
          if (!arr.length) { insertRelatedField(el, 'Owner.Name'); return; }
          let owner = arr.find(f => /^Owner(Id)?$/i.test(f.name) || (f.relationshipName && String(f.relationshipName).toLowerCase() === 'owner'));
          if (owner) {
            const rel = owner.relationshipName || owner.name.replace(/Id$/i, '');
            insertRelatedField(el, `${rel}.Name`);
            return;
          }
          const ref = arr.find(f => String(f.type || '').toLowerCase() === 'reference' && f.relationshipName);
          if (ref) {
            insertRelatedField(el, `${ref.relationshipName}.Name`);
            return;
          }
          const anyId = arr.find(f => /Id$/i.test(f.name));
          if (anyId) {
            const rel = (anyId.relationshipName) ? anyId.relationshipName : anyId.name.replace(/Id$/i, '');
            insertRelatedField(el, `${rel}.Name`);
            return;
          }
          insertRelatedField(el, 'Owner.Name');
        } catch (e) {
          insertRelatedField(el, 'Owner.Name');
        }
      }).catch(() => {
        insertRelatedField(el, 'Owner.Name');
      });
    }

    function applyKeyword(keyword, match) {
        const queryEl = STATE.elements.query;
        const trimmedKeyword = typeof keyword === 'string' ? keyword.trim() : '';
        if (!queryEl || !trimmedKeyword) return;

        const currentValue = queryEl.value || '';
        const loweredValue = currentValue.toLowerCase();
        const loweredKeyword = trimmedText
