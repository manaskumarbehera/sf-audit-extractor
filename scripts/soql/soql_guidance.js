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
        const loweredKeyword = trimmedKeyword.toLowerCase();
        const trimmedMatch = typeof match === 'string' ? match.trim() : '';
        let searchNeedle = trimmedMatch ? trimmedMatch.toLowerCase() : loweredKeyword;
        if (!trimmedMatch) {
            const firstToken = loweredKeyword.split(/\s+/)[0];
            if (firstToken) {
                searchNeedle = firstToken;
            }
        }

        try {
            const km = (trimmedMatch || '').toLowerCase();
            if (km === 'where') {
                if (!/\bwhere\b/i.test(currentValue)) {
                    insertWhereClause(queryEl);
                } else {
                    try { queryEl.focus(); } catch {}
                }
                return;
            }
            if (km === 'limit') {
                if (!/\blimit\b/i.test(currentValue)) {
                    insertLimitClause(queryEl);
                } else {
                    try { queryEl.focus(); } catch {}
                }
                return;
            }
            if (km === 'select') {
                if (trimmedKeyword.indexOf('.') !== -1) {
                    insertRelatedField(queryEl, trimmedKeyword);
                    return;
                }
             }
         } catch {}

        const hasKeyword = searchNeedle ? loweredValue.includes(searchNeedle) : false;
        let nextValue = currentValue;
        if (!hasKeyword) {
            const sanitizedBefore = currentValue.replace(/,\s*(from\b)/i, ' $1');
            const sanitized = sanitizedBefore.replace(/\s+$/g, '');
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

    function handleFlagActivate(evt) {
        if (!evt) return;
        if (evt.type === 'keydown' && evt.key !== 'Enter' && evt.key !== ' ') return;
        try { evt.preventDefault(); } catch (e) {}
        try { evt.stopPropagation(); } catch (e) {}
        try { if (STATE.debug) console.debug('[SOQL Guidance] handleFlagActivate', { type: evt.type, time: Date.now(), target: (evt.target && evt.target.closest) ? evt.target.closest('.soql-guidance-flag')?.dataset : null }); } catch {}
        const targetFlag = evt.target?.closest ? evt.target.closest('.soql-guidance-flag') : null;
        if (!targetFlag) return;
        const action = targetFlag.dataset?.action;
        if (action) {
          if (action === 'insert-where') insertWhereClause(STATE.elements.query);
          else if (action === 'insert-limit') insertLimitClause(STATE.elements.query);
          else if (action === 'insert-related') {
              const kw = targetFlag.dataset?.keyword || targetFlag.dataset?.keywordMatch || '';
              if (kw && kw.indexOf('.') !== -1) {
                  insertRelatedField(STATE.elements.query, kw);
              } else {
                  insertRelatedFieldDynamic(STATE.elements.query, getFromObject(STATE.elements.query?.value || ''));
              }
          }
           return;
        }
        const keyword = targetFlag?.dataset?.keyword;
        const match = targetFlag?.dataset?.keywordMatch;
        if (!keyword) return;
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

    // Make suggestion card chips clickable without triggering card keyword action
    function handleCardChipActivate(evt) {
        const t = evt.target;
        if (!t || !t.classList || !t.classList.contains('chip')) return;
        if (evt.type === 'keydown' && evt.key !== 'Enter' && evt.key !== ' ') return;
        // Prevent other handlers from interfering so a single activation works
        try { evt.preventDefault(); } catch (e) {}
        try { evt.stopPropagation(); } catch (e) {}
        try { if (STATE.debug) console.debug('[SOQL Guidance] handleCardChipActivate', { type: evt.type, time: Date.now(), targetDataset: t.dataset }); } catch {}

        const queryEl = STATE.elements.query;
        if (!queryEl) return;

        // Action chips (data-action) take precedence
        const action = t.getAttribute('data-action');
        if (action) {
            if (action === 'insert-where') {
                insertWhereClause(queryEl);
                queryEl.dispatchEvent(new Event('input', { bubbles: true }));
                return;
            }
            if (action === 'insert-limit') {
                const limitAttr = t.getAttribute('data-limit');
                const limitVal = limitAttr ? parseInt(limitAttr, 10) || 100 : 100;
                insertLimitClause(queryEl, limitVal);
                queryEl.dispatchEvent(new Event('input', { bubbles: true }));
                return;
            }
            if (action === 'insert-related') {
                const fieldSpec = t.getAttribute('data-field') || t.getAttribute('data-keyword') || '';
                if (fieldSpec && fieldSpec.indexOf('.') !== -1) {
                    insertRelatedField(queryEl, fieldSpec);
                    // show fields after insertion
                    STATE.pendingShowFields = true;
                } else {
                    insertRelatedFieldDynamic(queryEl, getFromObject(queryEl.value || ''));
                    STATE.pendingShowFields = true;
                }
                queryEl.dispatchEvent(new Event('input', { bubbles: true }));
                return;
            }
        }

        // Otherwise handle object/field chips
        const type = t.getAttribute('data-badge-type');
        const objectName = t.getAttribute('data-object');
        const fieldName = t.getAttribute('data-field');

        if (type === 'object' && objectName) {
            // Update FROM but don't automatically show fields — user must type comma or place caret in fields
            queryEl.value = replaceFromObjectInQuery(queryEl.value, objectName);
            try { queryEl.focus(); } catch {}
            queryEl.dispatchEvent(new Event('input', { bubbles: true }));
        } else if (type === 'field' && fieldName) {
            insertFieldIntoSelect(queryEl, fieldName);
            // mark that we should show fields on next input (caret likely in fields)
            STATE.pendingShowFields = true;
            queryEl.dispatchEvent(new Event('input', { bubbles: true }));
        }
    }

    function handleSuggestionActivate(evt) {
        // Ignore clicks originating on chips inside the suggestion card
        if (evt?.target?.closest && evt.target.closest('.chip')) return;
        if (!evt) return;
        if (!STATE.currentSuggestionKeyword) return;
        if (evt.type === 'keydown' && evt.key !== 'Enter' && evt.key !== ' ') return;
        if (evt.type === 'keydown') evt.preventDefault();
        try { evt.preventDefault(); } catch (e) {}
        try { evt.stopPropagation(); } catch (e) {}
        try { if (STATE.debug) console.debug('[SOQL Guidance] handleSuggestionActivate', { type: evt.type, time: Date.now(), keyword: STATE.currentSuggestionKeyword, keywordMatch: STATE.currentSuggestionKeywordMatch }); } catch {}
        applyKeyword(STATE.currentSuggestionKeyword, STATE.currentSuggestionKeywordMatch);
    }

    function detectPhase(el, q) {
        try {
            const val = String(q || '');
            const hasSelect = /\bselect\b/i.test(val);
            const hasFromClause = /\bfrom\b\s+[A-Za-z0-9_.]+/i.test(val);
            const inFieldsCtx = getCurrentFieldToken(el);
            if (inFieldsCtx && inFieldsCtx.inFields) return 'SELECTING_FIELDS';
            const fromCtx = getCurrentFromToken(el);
            if (fromCtx && fromCtx.inFrom) {
                // If token incomplete or object not chosen yet
                const tok = String(fromCtx.token || '');
                const chosen = getFromObject(val);
                if (!chosen || (tok && tok.toLowerCase() !== String(chosen).toLowerCase())) {
                    return 'CHOOSING_OBJECT';
                }
            }
            const whereCtx = getCurrentWhereToken(el);
            if (whereCtx && whereCtx.inWhere) return 'FILTERING';
            // LIMITING when caret appears after the word LIMIT or limit exists and caret at end
            const limitMatch = /(\blimit\b)([\s\S]*)$/i.exec(val);
            if (limitMatch) {
                const caret = Math.max(0, Math.min(el?.selectionStart ?? val.length, val.length));
                const limPos = limitMatch.index + (limitMatch[1] || '').length;
                if (caret >= limPos) return 'LIMITING';
            }
            if (hasSelect && hasFromClause) return 'READY';
            return 'IDLE';
        } catch { return 'IDLE'; }
    }

    function filterAndDedupeEntriesByPhase(phase, engineResult) {
        const out = [];
        const seen = new Set();
        function push(type, entry) {
            const key = `${type}|${entry?.id || ''}|${entry?.message || entry?.title || ''}`;
            if (seen.has(key)) return;
            seen.add(key);
            out.push({ type, entry });
        }
        const qEl = STATE.elements.query;
        const q = qEl?.value || '';
        const minimalValid = /\bselect\b[\s\S]*\bfrom\b\s+[A-Za-z0-9_.]+/i.test(q);
        const suppressWhere = phase !== 'FILTERING';
        const suppressLimit = phase !== 'LIMITING';
        const warnTooEarly = (msg) => /\bwhere\b/i.test(msg) || /\blimit\b/i.test(msg);

        (engineResult.errors || []).forEach(e => push('error', e));
        (engineResult.warnings || []).forEach(e => {
            const msg = String(e?.message || e?.title || '');
            // Suppress WHERE/LIMIT warnings unless caret is in that phase; also if minimal valid query, keep hints softer
            if ((/\bwhere\b/i.test(msg) && suppressWhere) || (/\blimit\b/i.test(msg) && suppressLimit)) return;
            push('warning', e);
        });
        (engineResult.info || []).forEach(e => {
            const msg = String(e?.message || e?.title || '');
            // If minimal query and message is about WHERE/LIMIT, allow as info but not duplicate
            if (minimalValid && warnTooEarly(msg)) {
                // keep as info only if not already warned
                push('info', e);
                return;
            }
            push('info', e);
        });
        return out;
    }

    function renderStatuses(engineResult) {
        clearStatuses();
        if (!engineResult) { try { toggleContainer(false); } catch {} return; }
        const list = STATE.elements.statusList;
        if (!list) return;
        const el = STATE.elements.query;
        const phase = detectPhase(el, el?.value || '');
        const entries = filterAndDedupeEntriesByPhase(phase, engineResult);
        if (!entries.length && !engineResult?.suggestion) { try { toggleContainer(false); } catch {} return; }
        entries.forEach(({ type, entry }) => {
            list.appendChild(createFlag(type, entry));
        });
    }

    function extractFromPartial(q) {
        try {
            const m = String(q || '').match(/\bfrom\s+([A-Za-z0-9_]+)?/i);
            return (m && m[1]) ? m[1] : '';
        } catch { return ''; }
    }

    function getCurrentObjectNames(root) {
        try {
            const sel = root?.querySelector('#soql-object');
            if (!sel) return [];
            const opts = Array.from(sel.options || []);
            return opts
                .map(o => (o && o.value ? String(o.value) : ''))
                .filter(Boolean);
        } catch { return []; }
    }

    function makeBadge(text, attrs = {}) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'chip';
        btn.textContent = text;
        Object.keys(attrs).forEach(k => btn.setAttribute(k, attrs[k]));
        btn.setAttribute('aria-label', text);
        return btn;
    }

    function replaceFromObjectInQuery(query, objectName) {
        const q = String(query || '');
        const re = /(\bfrom\s+)([A-Za-z0-9_.]+)?/i;
         if (re.test(q)) {
             return q.replace(re, (m, p1) => `${p1}${objectName}`);
         }
         // No FROM present: append simple FROM clause
         if (/\bselect\b/i.test(q)) return `${q} FROM ${objectName}`;
         return `SELECT Id FROM ${objectName}`;
     }

     function insertFieldIntoSelect(targetOrText, fieldName) {
         if (targetOrText && typeof targetOrText.value === 'string') {
             const el = targetOrText;
             const q = String(el.value || '');
             const re = /(\s*select\s+)([\s\S]*?)(\s+from\b)/i;
             const m = re.exec(q);
             if (m) {
                 const prefixStart = m.index;
                 const selectPart = m[1];
                 const fieldsPart = m[2];
                 const fieldsStart = prefixStart + selectPart.length;
                 const fieldsEnd = fieldsStart + fieldsPart.length;

                const selStart = Math.max(0, Math.min(el.selectionStart ?? fieldsEnd, q.length));

                // helper to set focus/caret safely
                function setCaret(pos) { try { el.focus(); el.setSelectionRange(pos, pos); } catch {} }

                // Check if this is a relationship field (contains a dot)
                const isRelationshipField = fieldName.includes('.');

                // Parse existing fields
                const existingParts = fieldsPart.split(',').map(s => s.trim()).filter(Boolean);

                // Short-circuit when field already exists: keep caret
                if (existingParts.includes(fieldName)) {
                  setCaret(selStart);
                  return q;
                }

                // If inserting a relationship field like "Pricebook2.Name", check for and remove
                // any partial tokens that the user typed:
                // - "Pricebook2." (just the prefix with dot)
                // - "Pricebook2.Na" (partial field name)
                // - "Pricebook2.Nam" (partial field name)
                let cleanedParts = existingParts;
                if (isRelationshipField) {
                  const relationshipPrefix = fieldName.split('.').slice(0, -1).join('.'); // "Pricebook2"
                  const fieldNameLower = fieldName.toLowerCase();

                  cleanedParts = existingParts.filter(p => {
                    const pLower = p.toLowerCase();

                    // Remove if it's exactly the prefix with dot (e.g., "Pricebook2.")
                    if (pLower === relationshipPrefix.toLowerCase() + '.') return false;

                    // Remove if it's a partial of the field being inserted
                    // e.g., when inserting "Pricebook2.Name", remove "Pricebook2.Na", "Pricebook2.Nam"
                    if (pLower.startsWith(relationshipPrefix.toLowerCase() + '.') &&
                        fieldNameLower.startsWith(pLower) &&
                        pLower !== fieldNameLower) {
                      return false;
                    }

                    // Remove if it ends with a dot and the fieldName starts with it
                    if (p.endsWith('.') && fieldNameLower.startsWith(pLower)) return false;

                    return true;
                  });
                }

                // Always append field at the end of the field list, regardless of cursor position
                if (!cleanedParts.length || /^count\s*\(/i.test(fieldsPart)) {
                  const before = q.slice(0, fieldsStart);
                  const after = q.slice(fieldsEnd);
                  try { el.value = before + fieldName + after; setCaret((before + fieldName).length); } catch {}
                  return before + fieldName + after;
                }

                // Add the new field
                cleanedParts.push(fieldName);

                // Deduplicate
                const seen = new Set();
                const dedupParts = [];
                for (const p of cleanedParts) { if (!seen.has(p)) { seen.add(p); dedupParts.push(p); } }

                const nextFields = dedupParts.join(', ');
                const before = q.slice(0, fieldsStart);
                const after = q.slice(fieldsEnd);
                const nextQuery = before + nextFields + after;
                try { el.value = nextQuery; setCaret((before + nextFields).length); } catch {}
                return nextQuery;
             }

             // No SELECT/FROM structure; add minimal one near FROM if present
             const hasFrom = /\bfrom\s+[A-Za-z0-9_.]+/i.test(q);
             if (hasFrom) {
               const fromMatch = /\bfrom\s+[A-Za-z0-9_.]+/i.exec(q);
               const before = q.slice(0, fromMatch.index);
               const after = q.slice(fromMatch.index);
               const nextQuery = `${before}SELECT ${fieldName} ${after}`;
               try { el.value = nextQuery; el.focus(); el.setSelectionRange((before + 'SELECT ' + fieldName).length, (before + 'SELECT ' + fieldName).length); } catch {}
               return nextQuery;
             }
             const nextQuery = `SELECT ${fieldName}`;
             try { el.value = nextQuery; el.focus(); el.setSelectionRange(nextQuery.length, nextQuery.length); } catch {}
             return nextQuery;
         }

         // Fallback legacy string signature
         const q = String(targetOrText || '');
         const m = q.match(/^(\s*select\s+)([\s\S]*?)(\s+from\b[\s\S]*)$/i);
         if (m) {
             const prefix = m[1];
             const fields = m[2].trim();
             const suffix = m[3];
             if (!fields || /^count\s*\(/i.test(fields)) {
                 return `${prefix}${fieldName}${suffix}`;
             }
             const parts = fields.split(',').map(s => s.trim()).filter(Boolean);
             if (!parts.includes(fieldName)) parts.push(fieldName);
             return `${prefix}${parts.join(', ')}${suffix}`;
         }
         const fromMatch = q.match(/\bfrom\s+[A-Za-z0-9_.]+/i);
         if (fromMatch) {
             const afterFrom = q.slice(fromMatch.index);
             return `SELECT ${fieldName} ${afterFrom}`;
         }
         return `SELECT ${fieldName}`;
     }

     function handleChipActivate(evt) {
         const t = evt.target;
         if (!t || !t.classList || !t.classList.contains('chip')) return;
         // Chip-level action support (e.g., show-all-fields, where-snippet)
         const chipAction = t.getAttribute('data-action');
         if (chipAction) {
             if (chipAction === 'show-all-fields') {
                 const obj = t.getAttribute('data-object');
                 if (!obj) return;
                 fetchFieldsForObject(document, obj).then(fields => {
                     if (Array.isArray(fields) && fields.length) appendFieldsFlag(document, obj, fields);
                 }).catch(() => {});
                 try { evt.preventDefault(); } catch (e) {}
                 try { evt.stopPropagation(); } catch (e) {}
                 return;
             }
             if (chipAction === 'where-snippet') {
                 const snippet = t.getAttribute('data-snippet') || '';
                 const queryEl = STATE.elements.query;
                 if (queryEl && snippet) {
                     insertWhereSnippet(queryEl, snippet);
                     try { evt.preventDefault(); } catch (e) {}
                     try { evt.stopPropagation(); } catch (e) {}
                     return;
                 }
             }
         }
         if (evt.type === 'keydown' && evt.key !== 'Enter' && evt.key !== ' ') return;
         // Prevent other listeners from handling this same activation
         try { evt.preventDefault(); } catch (e) {}
         try { evt.stopPropagation(); } catch (e) {}
         const type = t.getAttribute('data-badge-type');
         const objectName = t.getAttribute('data-object');
         const fieldName = t.getAttribute('data-field');
         const queryEl = STATE.elements.query;
         if (!queryEl) return;
         if (type === 'object' && objectName) {
             // Update FROM object in query but do NOT immediately show the full field list.
             // Fields will be suggested when the user places the caret inside the SELECT list or types a comma.
             queryEl.value = replaceFromObjectInQuery(queryEl.value, objectName);
             try { queryEl.focus(); } catch {}
             queryEl.dispatchEvent(new Event('input', { bubbles: true }));
         } else if (type === 'lookup-hint') {
             // Insert the relationship prefix with a dot to trigger related field suggestions
             const relationship = t.getAttribute('data-relationship');
             if (relationship) {
               insertFieldIntoSelect(queryEl, relationship + '.');
               STATE.pendingShowFields = true;
               queryEl.dispatchEvent(new Event('input', { bubbles: true }));
             }
         } else if (type === 'field' && fieldName) {
             // Insert the field and mark that we should show the field suggestions on the next input
             insertFieldIntoSelect(queryEl, fieldName);
             // Ask the guidance UI to show top fields (if caret lands in the fields area)
             STATE.pendingShowFields = true;
             queryEl.dispatchEvent(new Event('input', { bubbles: true }));
         }
     }


     function appendFieldMatchesFlag(root, el, query) {
        const list = STATE.elements.statusList;
        if (!list || !el) return;
        const obj = getFromObject(query);
        if (!obj) return;
        const { token, inFields, bounds } = getCurrentFieldToken(el);
        if (!inFields) return;

        // Check if user is typing a relationship path (contains a dot)
        if (token.includes('.')) {
          appendRelatedFieldSuggestions(root, el, obj, token, bounds);
          return;
        }

        fetchFieldsForObject(root, obj).then((fields) => {
             const allFields = Array.isArray(fields) ? fields : [];
             const names = allFields.map(f => f?.name).filter(Boolean);
             if (!names.length) { STATE.pendingShowFields = false; return; }

             // existing selected fields in the SELECT area
             let existing = [];
             try {
                 const fieldsPart = String(el.value || '').slice(bounds.fieldsStart, bounds.fieldsEnd);
                 existing = fieldsPart.split(',').map(s => s.trim()).filter(Boolean).map(s => s.toLowerCase());
             } catch (e) { existing = []; }

             const p = (token || '').toLowerCase();
             let matches = [];
             let lookupFields = [];

             // Get lookup/reference fields for separate display
             const refFields = allFields.filter(f => f.type === 'reference' && f.relationshipName);

             if (p) {
                 // If token exactly matches an already-selected field, suppress suggestions
                 const hasExact = existing.some(n => n === p);
                 if (hasExact) { STATE.pendingShowFields = false; return; }
                 matches = names.filter(n => n.toLowerCase().startsWith(p) && !existing.includes(n.toLowerCase())).slice(0, 8);
                 // Also suggest lookup relationships that match - be more generous with matching
                 // Don't filter out lookups that already have fields - user might want to add more
                 lookupFields = refFields.filter(f =>
                   (f.relationshipName.toLowerCase().startsWith(p) || f.name.toLowerCase().startsWith(p))
                 ).slice(0, 6);
             } else {
                 // empty token: show when user is in fields area or explicitly requested
                 // Always show lookup hints when in field area to help discovery
                 if (!STATE.pendingShowFields && !inFields) return;
                 matches = names.filter(n => !existing.includes(n.toLowerCase())).slice(0, 6);
                 // Show common lookup fields prominently (Owner, Account, etc)
                 // Don't filter out lookups that already have fields selected - user might want more
                 const commonLookups = ['Owner', 'Account', 'Contact', 'CreatedBy', 'LastModifiedBy', 'Parent'];
                 const sortedRefFields = refFields.sort((a, b) => {
                   const aCommon = commonLookups.includes(a.relationshipName) ? 0 : 1;
                   const bCommon = commonLookups.includes(b.relationshipName) ? 0 : 1;
                   return aCommon - bCommon;
                 });
                 lookupFields = sortedRefFields.slice(0, 6);
             }

             if (!matches.length && !lookupFields.length) { STATE.pendingShowFields = false; return; }

             const li = document.createElement('div');
             li.className = 'soql-guidance-item';
             li.setAttribute('role', 'listitem');
             const div = document.createElement('div');
             div.className = 'soql-guidance-flag info';
             const badge = document.createElement('span');
             badge.className = 'soql-guidance-flag-badge';
             badge.textContent = 'INFO';
             const title = document.createElement('span');
             title.className = 'soql-guidance-flag-text';
             title.textContent = 'Matching fields';
             const wrap = document.createElement('div');
             wrap.className = 'chip-wrap';

             // Add lookup fields FIRST with special styling - make them more visible
             if (lookupFields.length > 0) {
               lookupFields.forEach(f => {
                 const chip = makeBadge(`↗ ${f.relationshipName}.`, {
                   'data-badge-type': 'lookup-hint',
                   'data-object': obj,
                   'data-relationship': f.relationshipName,
                   'data-reference-to': JSON.stringify(f.referenceTo || [])
                 });
                 chip.title = `Lookup: ${f.relationshipName} → ${(f.referenceTo || []).join(', ')} (click to see related fields)`;
                 chip.style.background = '#e8f5e9';
                 chip.style.borderColor = 'rgba(46, 125, 50, 0.4)';
                 chip.style.fontWeight = '500';
                 wrap.appendChild(chip);
               });
             }

             // Add regular fields after lookups
             matches.forEach(name => wrap.appendChild(makeBadge(name, { 'data-badge-type': 'field', 'data-object': obj, 'data-field': name })));

             div.appendChild(badge);
             // Add a small "Show all" action chip to render the full field list using appendFieldsFlag
             const showAll = makeBadge('Show all', { 'data-action': 'show-all-fields', 'data-object': obj });
             showAll.title = 'Show all fields';
             wrap.appendChild(showAll);
             div.appendChild(title);
             div.appendChild(wrap);
             li.appendChild(div);
             list.appendChild(li);
             // reset pending flag
             STATE.pendingShowFields = false;
         }).catch(() => { STATE.pendingShowFields = false; });
     }

     // Suggest fields from a related object when user types "Relationship."
     function appendRelatedFieldSuggestions(root, el, parentObj, token, bounds) {
       const list = STATE.elements.statusList;
       if (!list) return;

       const parts = token.split('.');
       const relationshipName = parts.slice(0, -1).join('.');
       const fieldPrefix = (parts[parts.length - 1] || '').toLowerCase();

       // First, get the parent object's fields to find the relationship
       fetchFieldsForObject(root, parentObj).then((parentFields) => {
         const allFields = Array.isArray(parentFields) ? parentFields : [];
         const refField = allFields.find(f =>
           f.relationshipName && f.relationshipName.toLowerCase() === relationshipName.toLowerCase()
         );

         if (!refField || !refField.referenceTo || !refField.referenceTo.length) {
           STATE.pendingShowFields = false;
           return;
         }

         // Get the target object (use first one for polymorphic lookups)
         const targetObj = refField.referenceTo[0];

         fetchFieldsForObject(root, targetObj).then((relatedFields) => {
           const arr = Array.isArray(relatedFields) ? relatedFields : [];
           if (!arr.length) { STATE.pendingShowFields = false; return; }

           const names = arr.map(f => f?.name).filter(Boolean);
           let matches = [];

           if (fieldPrefix) {
             matches = names.filter(n => n.toLowerCase().startsWith(fieldPrefix)).slice(0, 10);
           } else {
             // Show common fields first when no prefix
             const commonFields = ['Name', 'Id', 'Email', 'Phone', 'Title', 'FirstName', 'LastName'];
             const common = names.filter(n => commonFields.includes(n));
             const others = names.filter(n => !commonFields.includes(n)).slice(0, 10 - common.length);
             matches = [...common, ...others].slice(0, 10);
           }

           if (!matches.length) { STATE.pendingShowFields = false; return; }

           const li = document.createElement('div');
           li.className = 'soql-guidance-item';
           li.setAttribute('role', 'listitem');
           const div = document.createElement('div');
           div.className = 'soql-guidance-flag info';
           const badge = document.createElement('span');
           badge.className = 'soql-guidance-flag-badge';
           badge.textContent = 'LOOKUP';
           badge.style.background = '#2e7d32';
           const title = document.createElement('span');
           title.className = 'soql-guidance-flag-text';
           title.textContent = `Fields from ${targetObj} (via ${relationshipName})`;
           const wrap = document.createElement('div');
           wrap.className = 'chip-wrap';

           matches.forEach(name => {
             const fullPath = `${relationshipName}.${name}`;
             const chip = makeBadge(name, {
               'data-badge-type': 'field',
               'data-object': parentObj,
               'data-field': fullPath
             });
             chip.title = `Insert: ${fullPath}`;
             wrap.appendChild(chip);
           });

           div.appendChild(badge);
           div.appendChild(title);
           div.appendChild(wrap);
           li.appendChild(div);
           list.appendChild(li);
           STATE.pendingShowFields = false;
         }).catch(() => { STATE.pendingShowFields = false; });
       }).catch(() => { STATE.pendingShowFields = false; });
     }
    function getCurrentFieldToken(el) {
        try {
            const q = String(el?.value || '');
            const m = /(\s*select\s+)([\s\S]*?)(\s+from\b)/i.exec(q);
            if (!m) return { token: '', inFields: false, bounds: { fieldsStart: 0, fieldsEnd: 0 } };
            const fieldsStart = m.index + m[1].length;
            const fieldsEnd = fieldsStart + m[2].length;
            const selStart = Math.max(0, Math.min(el.selectionStart ?? fieldsEnd, q.length));
            const inFields = selStart >= fieldsStart && selStart <= fieldsEnd;
            const rel = Math.max(0, selStart - fieldsStart);
            const fieldsPart = m[2];
            const left = fieldsPart.slice(0, rel);
            const right = fieldsPart.slice(rel);
            const leftTokenMatch = left.match(/[A-Za-z0-9_.]+$/);
            const rightTokenMatch = right.match(/^[A-Za-z0-9_.]+/);
            const token = ((leftTokenMatch ? leftTokenMatch[0] : '') + (rightTokenMatch ? rightTokenMatch[0] : '')).trim();
            return { token, inFields, bounds: { fieldsStart, fieldsEnd } };
        } catch { return { token: '', inFields: false, bounds: { fieldsStart: 0, fieldsEnd: 0 } }; }
    }
    function getCurrentFromToken(el) {
        try {
            const q = String(el?.value || '');
            // capture FROM segment up to next clause or end
            const m = /(\bfrom\s+)([\s\S]*?)(?=\s+(where|group\s+by|order\s+by|limit|offset)\b|$)/i.exec(q);
            if (!m) return { token: '', inFrom: false, bounds: { fromStart: 0, fromEnd: 0 } };
            const fromStart = m.index + m[1].length;
            const fromEnd = fromStart + m[2].length;
            const selStart = Math.max(0, Math.min(el.selectionStart ?? fromEnd, q.length));
            const inFrom = selStart >= fromStart && selStart <= fromEnd;
            const rel = Math.max(0, selStart - fromStart);
            const seg = m[2];
            const left = seg.slice(0, rel);
            const right = seg.slice(rel);
            const leftTokenMatch = left.match(/[A-Za-z0-9_]+$/);
            const rightTokenMatch = right.match(/^[A-Za-z0-9_]+/);
            const token = ((leftTokenMatch ? leftTokenMatch[0] : '') + (rightTokenMatch ? rightTokenMatch[0] : '')).trim();
            return { token, inFrom, bounds: { fromStart, fromEnd } };
        } catch { return { token: '', inFrom: false, bounds: { fromStart: 0, fromEnd: 0 } }; }
    }

    // WHERE context helpers and suggestions (scoped within IIFE to access STATE)
    function getCurrentWhereToken(el) {
      try {
        const q = String(el?.value || '');
        const m = /(\bwhere\s+)([\s\S]*?)(?=\s+(group\s+by|order\s+by|limit|offset)\b|$)/i.exec(q);
        if (!m) return { token: '', inWhere: false, bounds: { whereStart: 0, whereEnd: 0 } };
        const whereStart = m.index + m[1].length;
        const whereEnd = whereStart + m[2].length;
        const selStart = Math.max(0, Math.min(el.selectionStart ?? whereEnd, q.length));
        const inWhere = selStart >= whereStart && selStart <= whereEnd;
        const rel = Math.max(0, selStart - whereStart);
        const seg = m[2];
        const left = seg.slice(0, rel);
        const right = seg.slice(rel);
        const leftTokenMatch = left.match(/[A-Za-z0-9_:.]+$/);
        const rightTokenMatch = right.match(/^[A-Za-z0-9_:.]+/);
        const token = ((leftTokenMatch ? leftTokenMatch[0] : '') + (rightTokenMatch ? rightTokenMatch[0] : '')).trim();
        return { token, inWhere, bounds: { whereStart, whereEnd } };
      } catch { return { token: '', inWhere: false, bounds: { whereStart: 0, whereEnd: 0 } }; }
    }

    function insertWhereSnippet(el, snippet) {
      if (!el || typeof el.value !== 'string') return;
      const snip = String(snippet || '');
      if (!snip) return;
      let q = String(el.value || '');
      if (!/\bwhere\b/i.test(q)) {
        try { insertWhereClause(el); } catch {}
        q = String(el.value || '');
      }
      const wctx = getCurrentWhereToken(el);
      const pos = Math.max(0, Math.min(el.selectionStart ?? (wctx.bounds.whereEnd || q.length), q.length));
      const before = q.slice(0, pos);
      const after = q.slice(pos);
      const needsPre = /[^\s]$/.test(before);
      const needsPost = /^[^\s]/.test(after);
      const ins = (needsPre ? ' ' : '') + snip + (needsPost ? ' ' : '');
      const next = before + ins + after;
      try { el.value = next; el.focus(); const caret = (before + ins).length; el.setSelectionRange(caret, caret); } catch {}
      el.dispatchEvent(new Event('input', { bubbles: true }));
    }

    function appendWhereMatchesFlag(root, el, query, wctx) {
      const list = STATE.elements.statusList;
      if (!list || !el) return;
      const obj = getFromObject(query);
      const token = String(wctx?.token || '').toLowerCase();
      const baseSnippets = [
        'AND', 'OR', 'NOT', '=', '!=', '>', '<', '>=', '<=', 'LIKE', 'IN', 'NOT IN', 'INCLUDES', 'EXCLUDES', 'NULL', 'NOT NULL'
      ];
      const dateLiterals = ['TODAY', 'YESTERDAY', 'TOMORROW', 'THIS_WEEK', 'LAST_WEEK', 'NEXT_WEEK', 'THIS_MONTH', 'LAST_MONTH', 'NEXT_MONTH', 'LAST_N_DAYS:7', 'LAST_N_DAYS:30'];
      let snippets = baseSnippets.concat(dateLiterals);
      if (token) snippets = snippets.filter(s => s.toLowerCase().startsWith(token));
      snippets = snippets.slice(0, 10);
      function render(fields) {
        const fieldNames = (Array.isArray(fields) ? fields : []).map(f => f?.name).filter(Boolean);
        const fieldMatches = token
          ? fieldNames.filter(n => n.toLowerCase().startsWith(token)).slice(0, 10)
          : fieldNames.slice(0, 6);
        if (snippets.length === 0 && fieldMatches.length === 0) return;
        const li = document.createElement('div');
        li.className = 'soql-guidance-item';
        li.setAttribute('role', 'listitem');
        const div = document.createElement('div');
        div.className = 'soql-guidance-flag info';
        const badge = document.createElement('span');
        badge.className = 'soql-guidance-flag-badge';
        badge.textContent = 'INFO';
        const title = document.createElement('span');
        title.className = 'soql-guidance-flag-text';
        title.textContent = 'WHERE helpers';
        const wrap = document.createElement('div');
        wrap.className = 'chip-wrap';
        snippets.forEach(txt => {
          const chip = makeBadge(txt, { 'data-action': 'where-snippet', 'data-snippet': txt });
          wrap.appendChild(chip);
        });
        fieldMatches.forEach(name => {
          wrap.appendChild(makeBadge(name, { 'data-action': 'where-snippet', 'data-snippet': name }));
        });
        div.appendChild(badge);
        div.appendChild(title);
        div.appendChild(wrap);
        li.appendChild(div);
        list.appendChild(li);
      }
      if (obj) {
        fetchFieldsForObject(root, obj).then(render).catch(() => render([]));
      } else {
        render([]);
      }
    }

    function appendObjectMatchesFlag(root, el, query) {
        const list = STATE.elements.statusList;
        if (!list || !el) return;
        // Determine phase and current object to avoid premature suggestions
        const currentObj = getFromObject(query);
        const { token, inFrom } = getCurrentFromToken(el);
        if (!inFrom) return;
        // If an object is already selected and token fully matches it, do not re-suggest
        if (currentObj && token && token.toLowerCase() === String(currentObj).toLowerCase()) return;
        const allObjects = getCurrentObjectNames(root);
        if (!Array.isArray(allObjects) || allObjects.length === 0) return;

        const p = (token || '').toLowerCase();

        // Ranked, case-insensitive matching:
        // 1) startsWith
        // 2) contains at a word boundary (e.g., after underscore)
        // 3) general contains
        const lower = allObjects.map(n => ({ raw: String(n), low: String(n).toLowerCase() }));
        let starts = [];
        let wbContains = [];
        let anyContains = [];
        if (p) {
            starts = lower.filter(o => o.low.startsWith(p));
            const wbRe = new RegExp(`(?:^|_|__|\.)${p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`); // word-ish boundary
            wbContains = lower.filter(o => !o.low.startsWith(p) && wbRe.test(o.low));
            anyContains = lower.filter(o => !o.low.startsWith(p) && !wbRe.test(o.low) && o.low.includes(p));
        } else {
            // Empty token: show a default slice of the full list (already curated in the dropdown)
            starts = lower.slice(0, 12);
        }
        const seen = new Set();
        const merged = [];
        function pushList(arr) {
            for (const o of arr) {
                if (!seen.has(o.raw)) { seen.add(o.raw); merged.push(o.raw); }
                if (merged.length >= 12) break;
            }
        }
        pushList(starts);
        if (merged.length < 12) pushList(wbContains);
        if (merged.length < 12) pushList(anyContains);

        const matches = merged;

        const li = document.createElement('div');
        li.className = 'soql-guidance-item';
        li.setAttribute('role', 'listitem');
        const div = document.createElement('div');
        div.className = 'soql-guidance-flag info';
        const badge = document.createElement('span');
        badge.className = 'soql-guidance-flag-badge';
        badge.textContent = 'INFO';
        const title = document.createElement('span');
        title.className = 'soql-guidance-flag-text';
        title.textContent = p ? 'Matching objects' : 'Objects';
        const wrap = document.createElement('div');
        wrap.className = 'chip-wrap';

        if (matches.length === 0) {
            if (p) {
                // Keep panel stable with a subtle message instead of vanishing
                const none = makeBadge('No matches', { 'aria-disabled': 'true' });
                none.classList.add('chip-disabled');
                wrap.appendChild(none);
                div.appendChild(badge);
                div.appendChild(title);
                div.appendChild(wrap);
                li.appendChild(div);
                list.appendChild(li);
            }
            return;
        }

        matches.forEach(name => wrap.appendChild(makeBadge(name, { 'data-badge-type': 'object', 'data-object': name })));
        div.appendChild(badge);
        div.appendChild(title);
        div.appendChild(wrap);
        li.appendChild(div);
        list.appendChild(li);
    }

    function insertWhereClause(el) {
      if (!el || typeof el.value !== 'string') return;
      const q = String(el.value || '');
      // If WHERE already present, keep caret and return
      if (/\bwhere\b/i.test(q)) { try { el.focus(); } catch {} return; }
      // Find FROM segment and inject WHERE before next clause (GROUP BY|ORDER BY|LIMIT|OFFSET) or end
      const re = /(from\s+[\s\S]*?)(?=\s+(where|group\s+by|order\s+by|limit|offset)\b|$)/i;
      const m = re.exec(q);
      if (!m) {
        // No FROM: prepend WHERE after SELECT if possible, else append
        const selRe = /(\bselect\b[\s\S]*?)(?=$)/i;
        const sm = selRe.exec(q);
        if (sm) {
          const idx = sm.index + sm[0].length;
          // If nothing follows (or a clause follows immediately), just insert WHERE
          const whereText = ' WHERE ';
          const next = q.slice(0, idx) + whereText + q.slice(idx);
          try { el.value = next; el.focus(); el.setSelectionRange(idx + whereText.length, idx + whereText.length); } catch {}
          el.dispatchEvent(new Event('input', { bubbles: true }));
          return;
        }
        const tailTrim = q.replace(/\s+$/,'');
        const whereText = tailTrim === '' ? 'WHERE' : 'WHERE ';
        const next = q + (q.endsWith(' ') ? '' : ' ') + whereText;
        try { el.value = next; el.focus(); el.setSelectionRange(next.length, next.length); } catch {}
        el.dispatchEvent(new Event('input', { bubbles: true }));
        return;
      }
      const insertPos = m.index + m[0].length;
      // Insert a plain WHERE regardless of following clauses
      const whereText = ' WHERE ';
      const next = q.slice(0, insertPos) + whereText + q.slice(insertPos);
      try { el.value = next; el.focus(); el.setSelectionRange(insertPos + whereText.length, insertPos + whereText.length); } catch {}
      // Do not track placeholder anymore
      try { STATE.lastWherePlaceholder = null; } catch { /* noop */ }
      el.dispatchEvent(new Event('input', { bubbles: true }));
    }

    function insertLimitClause(el, defaultLimit = 100) {
      if (!el || typeof el.value !== 'string') return;
      const q = String(el.value || '');
      if (/\blimit\b/i.test(q)) { try { el.focus(); } catch {} return; }
      const limitStr = ` LIMIT ${defaultLimit}`;
      // Insert before OFFSET if present
      const offsetRe = /\s+offset\b/i;
      const offM = offsetRe.exec(q);
      if (offM) {
        const pos = offM.index;
        const next = q.slice(0, pos) + limitStr + q.slice(pos);
        try { el.value = next; el.focus(); el.setSelectionRange(pos + limitStr.length, pos + limitStr.length); } catch {}
        el.dispatchEvent(new Event('input', { bubbles: true }));
        return;
      }
      // Otherwise append at end, ensuring spacing
      const trimmed = q.replace(/\s+$/,'');
      const sep = /\s$/.test(trimmed) ? '' : ' ';
      const next = trimmed + sep + limitStr.trim();
      try { el.value = next; el.focus(); el.setSelectionRange(next.length, next.length); } catch {}
      el.dispatchEvent(new Event('input', { bubbles: true }));
    }

    // === Initialization and public API ===
    function runEvaluation(engine) {
        try {
            const q = STATE.elements.query?.value || '';
            const result = engine.evaluate(q);
            // Suggestion card content
            const sug = result?.suggestion || null;
            if (sug && typeof sug.title === 'string') setText(STATE.elements.suggestionTitle, sug.title);
            if (sug && typeof sug.suggestion === 'string') setText(STATE.elements.suggestionMessage, sug.suggestion);
            const kw = typeof sug?.keyword === 'string' ? sug.keyword : '';
            const km = typeof sug?.keywordMatch === 'string' ? sug.keywordMatch : '';
            setSuggestionKeyword(kw, km);
            // Flags
            renderStatuses(result);
            toggleContainer(true);
        } catch (e) {
            try { toggleContainer(true); } catch {}
        }
    }

    function init(opts = {}) {
        const root = opts.root || document;
        const configUrl = opts.configUrl || 'rules/soql_guidance_rules.json';
        // Capture elements
        STATE.elements.query = root.querySelector('#soql-query');
        STATE.elements.container = root.querySelector('#soql-guidance');
        if (STATE.elements.container) {
            STATE.elements.suggestionTitle = STATE.elements.container.querySelector('.soql-guidance-card-title');
            STATE.elements.suggestionMessage = STATE.elements.container.querySelector('.soql-guidance-card-message');
            STATE.elements.suggestionCard = STATE.elements.container.querySelector('.soql-guidance-card');
            STATE.elements.statusList = STATE.elements.container.querySelector('.soql-guidance-flags');
        }
        // Wire activation handlers
        on(STATE.elements.suggestionCard, 'click', handleSuggestionActivate);
        on(STATE.elements.suggestionCard, 'keydown', handleSuggestionActivate);
        // Make chips inside the card clickable with their own actions
        on(STATE.elements.suggestionCard, 'click', handleCardChipActivate);
        on(STATE.elements.suggestionCard, 'keydown', handleCardChipActivate);
        // Flags activation via event delegation on the list
        on(STATE.elements.statusList, 'click', handleChipActivate);
        on(STATE.elements.statusList, 'keydown', handleChipActivate);
        on(STATE.elements.statusList, 'click', handleFlagActivate);
        on(STATE.elements.statusList, 'keydown', handleFlagActivate);

        // Evaluate on input
        if (STATE.elements.query) {
            on(STATE.elements.query, 'input', (evt) => {
                const el = STATE.elements.query;
                const val = String(el.value || '');
                const caret = Math.max(0, Math.min(el.selectionStart ?? val.length, val.length));
                // Detect quick comma typing to request field suggestions
                try {
                    const prevCh = caret > 0 ? val.charAt(caret - 1) : '';
                    if (prevCh === ',') STATE.pendingShowFields = true;
                } catch {}
                // Debounce evaluations to reduce flicker and redundant work
                try { if (STATE.inputTmr) { clearTimeout(STATE.inputTmr); } } catch {}
                STATE.inputTmr = setTimeout(() => {
                  ensureEngine(configUrl).then((engine) => {
                      runEvaluation(engine);
                      // Append dynamic matching fields suggestions when caret is in SELECT fields
                      try {
                          const ctx = getCurrentFieldToken(el);
                          if (ctx && ctx.inFields && (ctx.token || STATE.pendingShowFields)) {
                              appendFieldMatchesFlag(document, el, val);
                          }
                      } catch {}
                      // Append object suggestions when caret is in FROM object (supports empty token)
                      try {
                          const ctx = getCurrentFromToken(el);
                          if (ctx && ctx.inFrom) {
                              appendObjectMatchesFlag(document, el, val);
                          }
                      } catch {}
                      // Append WHERE starter suggestions (operators/date literals/fields)
                      try {
                          const wctx = getCurrentWhereToken(el);
                          if (wctx && wctx.inWhere) {
                              appendWhereMatchesFlag(document, el, val, wctx);
                          }
                      } catch {}
                  });
                }, 120);
            });
        }

        // Prime engine and render defaults
        ensureEngine(configUrl).then((engine) => {
            try { renderEmpty(engine); } catch {}
            runEvaluation(engine);
        }).catch(() => {});

        // Provide a cleanup function
        return function cleanup() {
            try { STATE.teardown.splice(0).forEach(fn => { try { fn(); } catch {} }); } catch {}
            STATE.engine = null;
            STATE.elements = { query: null, suggestionTitle: null, suggestionMessage: null, statusList: null, container: null, suggestionCard: null };
            STATE.currentSuggestionKeyword = '';
            STATE.currentSuggestionKeywordMatch = '';
        };
    }

    function detach() {
        try { STATE.teardown.splice(0).forEach(fn => { try { fn(); } catch {} }); } catch {}
        STATE.engine = null;
    }

    function getFromObject(q) {
        try {
            const m = String(q || '').match(/\bfrom\s+([A-Za-z0-9_.]+)/i);
            return (m && m[1]) ? m[1] : '';
        } catch { return ''; }
    }

    function fetchFieldsForObject(root, objectName) {
        return new Promise((resolve) => {
            try {
                Utils.getInstanceUrl().then((instanceUrl) => {
                    const payload = { action: 'DESCRIBE_SOBJECT', name: objectName };
                    if (instanceUrl) payload.instanceUrl = instanceUrl;
                    chrome.runtime.sendMessage(payload, (resp) => {
                        if (chrome.runtime && chrome.runtime.lastError) { resolve([]); return; }
                        if (!resp || !resp.success) { resolve([]); return; }
                        const fields = resp?.describe?.fields || [];
                        resolve(Array.isArray(fields) ? fields : []);
                    });
                }).catch(() => resolve([]));
            } catch { resolve([]); }
        });
    }

    function appendFieldsFlag(root, obj, fields) {
        const list = STATE.elements.statusList;
        if (!list || !Array.isArray(fields)) return;
        const names = fields.map(f => f?.name).filter(Boolean);
        if (!names.length) return;
        const li = document.createElement('div');
        li.className = 'soql-guidance-item';
        li.setAttribute('role', 'listitem');
        const div = document.createElement('div');
        div.className = 'soql-guidance-flag info';
        const badge = document.createElement('span');
        badge.className = 'soql-guidance-flag-badge';
        badge.textContent = 'INFO';
        const title = document.createElement('span');
        title.className = 'soql-guidance-flag-text';
        title.textContent = `Fields for ${obj}`;
        const wrap = document.createElement('div');
        wrap.className = 'chip-wrap';
        names.forEach(name => wrap.appendChild(makeBadge(name, { 'data-badge-type': 'field', 'data-object': obj, 'data-field': name })));
        div.appendChild(badge);
        div.appendChild(title);
        div.appendChild(wrap);
        li.appendChild(div);
        list.appendChild(li);
    }

    // expose
    try { window.SoqlGuidance = { init, detach }; } catch {}
})();

