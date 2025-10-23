// soql_suggestions_engine.js
// Suggestions engine: generates candidate suggestions based on query, describe, editorState and rules.
// It supports a declarative JSON-driven match pass (rule.matchOn/matchRegex/notMatchRegex)
// and falls back to procedural checks for common suggestion types to preserve compatibility.

import { getSelectSegment } from './soql_helper_utils.js';

export function indexOfWordInsensitive(haystack, needle) {
  if (!haystack || !needle) return -1;
  return haystack.toLowerCase().indexOf(needle.toLowerCase());
}

export function detectPhase(query) {
  if (!query || !query.trim()) return 'IDLE';
  const q = query;
  const singleQuotes = (q.match(/'/g) || []).length;
  const doubleQuotes = (q.match(/"/g) || []).length;
  const openParens = (q.match(/\(/g) || []).length;
  const closeParens = (q.match(/\)/g) || []).length;
  if (singleQuotes % 2 !== 0 || doubleQuotes % 2 !== 0 || openParens < closeParens) return 'ERROR_RECOVERY';
  if (/\(\s*select\b/i.test(q)) return 'SUBQUERY';
  const hasSelect = /\bselect\b/i.test(q);
  const hasFrom = /\bfrom\b/i.test(q);
  const hasWhere = /\bwhere\b/i.test(q);
  const hasGroup = /\bgroup\s+by\b/i.test(q);
  const hasHaving = /\bhaving\b/i.test(q);
  const hasOrder = /\border\s+by\b/i.test(q);
  const hasLimit = /\blimit\b/i.test(q);
  const hasOffset = /\boffset\b/i.test(q);
  if (hasSelect && !hasFrom) return 'SELECTING_FIELDS';
  if (hasFrom && !/\bfrom\s+[A-Za-z_][\w.]*/i.test(q)) return 'CHOOSING_OBJECT';
  if (hasWhere) return 'FILTERING';
  if (hasGroup && !hasHaving) return 'GROUPING';
  if (hasHaving) return 'HAVING_AGG';
  if (hasOrder) return 'ORDERING';
  if (hasLimit && !/\blimit\b\s*\d+/i.test(q)) return 'LIMITING';
  if (hasOffset && !/\boffset\b\s*\d+/i.test(q)) return 'OFFSETTING';
  return 'IDLE';
}

export function buildSessionContext(editorState, policyDefaults) {
  const defaults = policyDefaults && policyDefaults.sessionContextDefaults ? policyDefaults.sessionContextDefaults : {
    isActive: true,
    phase: 'IDLE',
    cursorContext: 'top-level',
    object: null,
    fieldListMode: 'none',
    hasLimit: false,
    hasOffset: false,
    errors: [],
    emittedSuggestions: [],
    lastEmittedAt: {}
  };
  let ctx = Object.assign({}, defaults);
  if (typeof editorState === 'string') ctx.phase = editorState;
  else if (editorState && typeof editorState === 'object') ctx = Object.assign(ctx, editorState);
  ctx.emittedSuggestions = ctx.emittedSuggestions || [];
  ctx.lastEmittedAt = ctx.lastEmittedAt || {};
  return ctx;
}

export function canEmitRule(rule, sessionContext) {
  if (!rule || !rule.enabled) return false;
  const now = Date.now();
  const scope = rule.fireOncePer || 'phase';
  const ruleId = rule.id || rule.type || JSON.stringify(rule);
  if (scope === 'session') {
    if ((sessionContext.emittedSuggestions || []).includes(ruleId)) return false;
  } else if (scope === 'phase' || scope === 'query') {
    const key = `${ruleId}::${sessionContext.phase}`;
    if ((sessionContext.emittedSuggestions || []).includes(key)) return false;
  }
  const last = sessionContext.lastEmittedAt && sessionContext.lastEmittedAt[ruleId];
  const cooldown = rule.cooldownMs || 0;
  if (!last) return true;
  return (now - last) >= cooldown;
}

export function markEmitted(rule, sessionContext) {
  const now = Date.now();
  const ruleId = rule.id || rule.type || JSON.stringify(rule);
  const scope = rule.fireOncePer || 'phase';
  if (scope === 'session') {
    sessionContext.emittedSuggestions = sessionContext.emittedSuggestions || [];
    if (!sessionContext.emittedSuggestions.includes(ruleId)) sessionContext.emittedSuggestions.push(ruleId);
  } else if (scope === 'phase' || scope === 'query') {
    const key = `${ruleId}::${sessionContext.phase}`;
    sessionContext.emittedSuggestions = sessionContext.emittedSuggestions || [];
    if (!sessionContext.emittedSuggestions.includes(key)) sessionContext.emittedSuggestions.push(key);
  }
  sessionContext.lastEmittedAt = sessionContext.lastEmittedAt || {};
  sessionContext.lastEmittedAt[ruleId] = now;
}

// Main generator
export async function generateSuggestions(query, describe, editorState, rulesArray, policy) {
  if (typeof query !== 'string') return [];
  const trimmed = query.trim();
  const rules = Array.isArray(rulesArray) ? rulesArray : (Array.isArray(policy && policy.suggestions) ? policy.suggestions : []);
  const sessionContext = buildSessionContext(editorState, policy || {});
  // If caller provided a non-canonical editorState (e.g., 'soqlEditor') as a string,
  // or if phase is missing/IDLE, compute the phase from the query text.
  if (!sessionContext.phase || sessionContext.phase === 'IDLE' || (typeof sessionContext.phase === 'string' && sessionContext.phase.toUpperCase() !== sessionContext.phase)) {
    sessionContext.phase = detectPhase(query);
  }
  const suggestions = [];

  const testRegex = (rx, input) => {
    try { if (!rx) return false; const re = new RegExp(rx, 'i'); return re.test(input || ''); } catch (e) { return false; }
  };

  // 1) Declarative JSON-driven pass
  try {
    for (const r of rules) {
      try {
        if (!r || !r.enabled || !r.matchOn) continue;
        const phase = sessionContext.phase;
        if (r.phaseAllow && !r.phaseAllow.includes(phase) && !(Array.isArray(r.phaseAllow) && r.phaseAllow.includes('global'))) continue;
        let matched = false;
        if (r.matchOn === 'query') {
          matched = testRegex(r.matchRegex, query);
          if (matched && r.notMatchRegex) matched = !testRegex(r.notMatchRegex, query);
        } else if (r.matchOn === 'selectSegment') {
          const seg = getSelectSegment(query);
          matched = testRegex(r.matchRegex, seg);
          if (matched && r.notMatchRegex) matched = !testRegex(r.notMatchRegex, seg);
        } else if (r.matchOn === 'describe') {
          if (!describe || !Array.isArray(describe.fields)) matched = false;
          else if (r.matchDescribeFieldType) matched = describe.fields.some(f => String(f.type || '').toLowerCase() === String(r.matchDescribeFieldType || '').toLowerCase());
          else matched = true;
          if (matched && r.notMatchRegex) matched = !testRegex(r.notMatchRegex, query);
        }
        if (!matched) continue;
        let suggestion = { id: r.id || r.type || 'rule-suggest', text: r.message || (r.id || r.type), reason: r.guard || r.message || '', severity: r.severity || 'info' };
        if (r.apply && r.apply.type) {
          if (r.apply.type === 'replace' && typeof r.apply.text === 'string') {
            if (r.apply.start == null && r.apply.end == null) suggestion.apply = { type: 'replace', start: 0, end: query.length, text: r.apply.text };
            else suggestion.apply = Object.assign({}, r.apply);
          } else if (r.apply.type === 'append' && typeof r.apply.text === 'string') suggestion.apply = { type: 'append', text: r.apply.text };
          else if (r.apply.type === 'insert' && typeof r.apply.text === 'string') {
            const selIdx = indexOfWordInsensitive(query, 'select');
            const fromIdx = (selIdx >= 0) ? query.toLowerCase().indexOf(' from ', selIdx + 6) : -1;
            const pos = (selIdx >= 0) ? ((fromIdx >= 0) ? fromIdx : (selIdx + 'select'.length)) : query.length;
            suggestion.apply = { type: 'insert', pos: pos, text: r.apply.text };
          } else suggestion.apply = r.apply;
        } else {
          if (r.type === 'add_limit' || r.type === 'add_offset') { const limitVal = r.defaultLimit || 200; suggestion.apply = { type: 'append', text: ` LIMIT ${limitVal}` }; }
          else if (r.type === 'replace_select_star') { const starPos = query.indexOf('*'); const repl = r.replacement || r.replacementText || 'Id, Name'; if (starPos >= 0) suggestion.apply = { type: 'replace', start: starPos, end: starPos + 1, text: repl }; else suggestion.apply = { type: 'append', text: ` ${repl}` }; }
          else if (r.type === 'fields_helpers') { const selIdx = indexOfWordInsensitive(query, 'select'); const pos = selIdx >= 0 ? selIdx + 'select'.length : 0; suggestion.apply = { type: 'insert', pos: pos, text: ' FIELDS(ALL) ' }; }
          else if (r.type === 'next_keyword') suggestion.apply = { type: 'append', text: ' FROM ' };
        }
        suggestion.__ruleId = r.id || r.type || null; suggestion.__priority = r.priority || 0;
        suggestions.push(suggestion);
      } catch (e) { /* per-rule errors don't break engine */ }
    }
  } catch (e) { /* ignore */ }

  // 2) Procedural fallback generation (keep lightweight, only common cases)
  // If the caller (policy) requests declarative-only suggestions, skip this entire procedural block.
  if (!(policy && policy.declarativeOnly)) {
    const getRule = (type) => {
      if (!(rules && Array.isArray(rules))) return null;
      const candidates = rules.filter(r => r && (r.type === type || r.id === type) && r.enabled);
      if (!candidates.length) return null;
      const phase = sessionContext.phase;
      const matched = candidates.find(r => {
        if (!r.phaseAllow && !r.state) return true;
        const allow = r.phaseAllow || r.state;
        if (!allow) return true;
        if (typeof allow === 'string') return allow === phase || allow === 'global' || allow === 'any';
        if (Array.isArray(allow)) return allow.includes(phase) || allow.includes('global') || allow.includes('any');
        return true;
      });
      return matched || candidates[0];
    };
    const hasRule = (type) => !!getRule(type);

    function tryPushSuggestion(suggestion, rule) {
      if (!rule) { suggestions.push(suggestion); return true; }
      if (!canEmitRule(rule, sessionContext)) return false;
      if (Array.isArray(rule.conflictsWith) && rule.conflictsWith.length > 0) {
        for (let i = suggestions.length - 1; i >= 0; i--) {
          const s = suggestions[i];
          if (s && rule.conflictsWith.includes(s.id)) suggestions.splice(i, 1);
        }
      }
      if (rule.mutexGroup) {
        for (let i = suggestions.length - 1; i >= 0; i--) {
          const s = suggestions[i];
          const existingRuleId = s.__ruleId || s.id;
          const existingRule = (rules || []).find(r => r && (r.id === existingRuleId || r.type === existingRuleId));
          if (existingRule && existingRule.mutexGroup === rule.mutexGroup) {
            const prNew = rule.priority || 0;
            const prOld = existingRule.priority || 0;
            if (prNew >= prOld) suggestions.splice(i, 1);
            else return false;
          }
        }
      }
      suggestion.__ruleId = rule.id || rule.type || null;
      suggestion.__priority = rule.priority || 0;
      suggestions.push(suggestion);
      markEmitted(rule, sessionContext);
    }

    // Starter suggestions
    if (!trimmed) {
      const starterRulePresent = hasRule('starter_suggestions') || !Array.isArray(rules) || rules.length === 0;
      if (starterRulePresent) {
        const endPos = query.length;
        suggestions.push({ id: 'init-select', text: 'Start a SELECT', reason: 'Begin a SOQL SELECT', severity: 'info', apply: { type: 'replace', start: 0, end: endPos, text: 'SELECT ' } });
        suggestions.push({ id: 'init-fields-all', text: 'SELECT FIELDS(ALL)', reason: 'Use FIELDS(ALL) to include all fields', severity: 'info', apply: { type: 'replace', start: 0, end: endPos, text: 'SELECT FIELDS(ALL) ' } });
        suggestions.push({ id: 'init-fields-standard', text: 'SELECT FIELDS(STANDARD)', reason: 'Include only standard fields', severity: 'info', apply: { type: 'replace', start: 0, end: endPos, text: 'SELECT FIELDS(STANDARD) ' } });
        suggestions.push({ id: 'init-fields-custom', text: 'SELECT FIELDS(CUSTOM)', reason: 'Include only custom fields', severity: 'info', apply: { type: 'replace', start: 0, end: endPos, text: 'SELECT FIELDS(CUSTOM) ' } });
        suggestions.push({ id: 'init-parent', text: 'SELECT Account.Parent.', reason: 'Start typing a parent relationship field', severity: 'info', apply: { type: 'replace', start: 0, end: endPos, text: 'SELECT Account.Parent.' } });
        return suggestions;
      }
      return [];
    }

    const hasLimit = /\blimit\b\s*\d+/i.test(trimmed);
    const hasWhere = /\bwhere\b/i.test(trimmed);

    // add LIMIT rule
    const limitRule = getRule('add_limit');
    if (limitRule && !hasLimit && !hasWhere && limitRule.enabled) {
      const guardOk = !/subquery/i.test(sessionContext.phase || '') && (!sessionContext.errors || sessionContext.errors.length === 0);
      if (guardOk && canEmitRule(limitRule, sessionContext)) {
        const appendText = ` LIMIT ${limitRule.defaultLimit}`;
        const suggestion = { id: limitRule.id, text: `Add LIMIT ${limitRule.defaultLimit}`, reason: limitRule.message, severity: 'hint', apply: { type: 'append', text: appendText } };
        tryPushSuggestion(suggestion, limitRule);
      }
    }

    // replace select *
    const selectStarRule = getRule('replace_select_star');
    if (selectStarRule) {
      const m = trimmed.match(/select\s+([\s\S]+?)\s+from\s+/i);
      if (m) {
        const selStart = trimmed.toLowerCase().indexOf('select');
        const starIdx = indexOfWordInsensitive(trimmed.substring(selStart, trimmed.length), '*');
        if (starIdx >= 0 && trimmed.indexOf('*') >= 0) {
          const starPos = trimmed.indexOf('*');
          const suggestion = { id: selectStarRule.id, text: `Replace '*' with explicit fields (${selectStarRule.replacement})`, reason: selectStarRule.message, severity: 'info', apply: { type: 'replace', start: starPos, end: starPos + 1, text: selectStarRule.replacement } };
          tryPushSuggestion(suggestion, selectStarRule);
        }
      }
    }

    // suggest boolean filter (procedural fallback if describe provided and no WHERE)
    const boolRule = getRule('suggest_boolean_filter');
    if (boolRule && describe && Array.isArray(describe.fields) && !hasWhere) {
      const boolField = describe.fields.find(f => { if (!f) return false; const name = f.name || ''; if (typeof name === 'string' && name.toLowerCase() === 'isdeleted') return false; return f.type === 'boolean' || (name && name.toLowerCase().endsWith('__c') && f.type === 'boolean'); });
      if (boolField) {
        const fromMatch = trimmed.match(/\bfrom\b\s+([\w.]+)(?:\s+\w+)?/i);
        let insertPos = trimmed.length;
        if (fromMatch) {
          const idx = indexOfWordInsensitive(trimmed, 'from');
          if (idx >= 0) {
            const orderIdx = /\border\s+by\b/i.test(trimmed) ? trimmed.search(/\border\s+by\b/i) : -1;
            const limitIdx = /\blimit\b/i.test(trimmed) ? trimmed.search(/\blimit\b/i) : -1;
            const cutIdx = [orderIdx, limitIdx].filter(i => i >= 0).sort((a,b)=>a-b)[0];
            insertPos = (cutIdx && cutIdx > 0) ? cutIdx : trimmed.length;
          }
        }
        const whereText = ` WHERE ${boolField.name} = true`;
        const suggestion = { id: boolRule.id, text: `Filter by ${boolField.name}`, reason: boolRule.message + (boolRule.note ? ` — ${boolRule.note}` : ''), severity: 'info', apply: { type: 'insert', pos: insertPos, text: whereText } };
        tryPushSuggestion(suggestion, boolRule);
      }
    }

    // SELECT-clause punctuation and helpers
    // Only treat SELECT as a start if the full word 'select' is present and followed by whitespace
    let selectIdx = -1;
    const selMatch = trimmed.match(/\bselect\b/i);
    if (selMatch) {
      const matchEnd = selMatch.index + selMatch[0].length;
      // require a whitespace after the word 'select' to consider field entry (i.e. 'select ')
      const nextChar = trimmed.charAt(matchEnd);
      if (nextChar && /\s/.test(nextChar)) selectIdx = selMatch.index;
    }
    if (selectIdx >= 0) {
      const fromMatchIdx = (() => { const m = trimmed.toLowerCase().indexOf(' from '); return m >= 0 ? m : trimmed.length; })();
      const fieldsStart = selectIdx + 'select'.length;
      const fieldsText = trimmed.slice(fieldsStart, fromMatchIdx);
      const hasFieldsFunction = /fields\s*\(/i.test(fieldsText);
      if (/^\s*$/.test(fieldsText)) {
        const fieldsHelpersRulePresent = hasRule('fields_helpers') || !Array.isArray(rules) || rules.length === 0;
        if (fieldsHelpersRulePresent) {
          suggestions.push({ id: 'suggest-fields-all', text: 'FIELDS(ALL)', reason: 'Use FIELDS(ALL) to include all fields', severity: 'info', apply: { type: 'insert', pos: fieldsStart, text: ' FIELDS(ALL) ' } });
          suggestions.push({ id: 'suggest-fields-standard', text: 'FIELDS(STANDARD)', reason: 'Include only standard fields', severity: 'info', apply: { type: 'insert', pos: fieldsStart, text: ' FIELDS(STANDARD) ' } });
          suggestions.push({ id: 'suggest-fields-custom', text: 'FIELDS(CUSTOM)', reason: 'Include only custom fields', severity: 'info', apply: { type: 'insert', pos: fieldsStart, text: ' FIELDS(CUSTOM) ' } });
          suggestions.push({ id: 'suggest-select-star', text: 'SELECT *', reason: 'Select all fields (consider replacing with explicit fields)', severity: 'info', apply: { type: 'insert', pos: fieldsStart, text: ' * ' } });
          suggestions.push({ id: 'suggest-parent-example', text: 'Account.Parent.', reason: 'Start a parent relationship field', severity: 'info', apply: { type: 'insert', pos: fieldsStart, text: ' Account.Parent.' } });
        }
        return suggestions;
      }
      if (hasFieldsFunction) {
        const fromRegex = /\bfrom\b/i;
        if (!fromRegex.test(trimmed)) {
          const fromAfterFieldsRule = getRule('from_after_fields') || getRule('fields_helpers') || !Array.isArray(rules) || rules.length === 0;
          if (fromAfterFieldsRule) suggestions.push({ id: 'suggest-from-after-fields', text: 'Add FROM', reason: 'Add FROM after FIELDS(...)', severity: 'info', apply: { type: 'append', text: ' FROM ' } });
        } else {
          const fromTrailing = /\bfrom\b\s*$/i.test(trimmed);
          if (fromTrailing) {
            const commonObjects = ['Account','Contact','Opportunity','Case','User'];
            commonObjects.forEach(obj => suggestions.push({ id: `suggest-from-${obj.toLowerCase()}`, text: `FROM ${obj}`, reason: `Use ${obj} as the query object`, severity: 'info', apply: { type: 'append', text: obj } }));
          }
        }
        return suggestions;
      }

      const ft = fieldsText;
      const punctuationRulePresent = hasRule('select_punctuation') || !Array.isArray(rules) || rules.length === 0;
      if (punctuationRulePresent && /^\s*,+/.test(ft)) {
        const relStart = fieldsStart + ft.search(/,*/);
        const m = ft.match(/^\s*,+/);
        const commaLen = m ? m[0].length : 0;
        suggestions.push({ id: 'select-leading-comma', text: 'Remove leading comma after SELECT', reason: 'First item after SELECT must not be a comma', severity: 'warning', apply: { type: 'replace', start: relStart, end: relStart + commaLen, text: '' } });
      }

      if (punctuationRulePresent) {
        const missingCommaRegex = /([A-Za-z_][\w.]*)\s+([A-Za-z_][\w.]*)/g; let mm;
        while ((mm = missingCommaRegex.exec(ft)) !== null) {
          const g1 = mm[1]; const g2 = mm[2];
          if (/\)$/.test(g1) || g1.toUpperCase() === 'DISTINCT' || /\(/.test(g1) || /\(/.test(g2)) continue;
          const sepIndexInFt = mm.index + g1.length; const absPos = fieldsStart + sepIndexInFt;
          const suggestion = { id: 'select-missing-comma', text: `Insert comma between '${g1}' and '${g2}'`, reason: 'Multiple fields must be separated by commas', severity: 'warning', apply: { type: 'replace', start: absPos, end: absPos + 1, text: ', ' } };
          tryPushSuggestion(suggestion, getRule('comma-between-fields'));
          break;
        }
        const commaNoSpaceIdx = ft.search(/,\S/);
        if (commaNoSpaceIdx >= 0) { const insertPos = fieldsStart + commaNoSpaceIdx + 1; suggestions.push({ id: 'select-space-after-comma', text: 'Insert space after comma', reason: 'Use a space after commas between fields', severity: 'hint', apply: { type: 'insert', pos: insertPos, text: ' ' } }); }
        const doubleCommaIdx = ft.indexOf(',,'); if (doubleCommaIdx >= 0) { const abs = fieldsStart + doubleCommaIdx; suggestions.push({ id: 'select-extra-commas', text: 'Remove duplicate commas', reason: 'Remove extra commas in field list', severity: 'warning', apply: { type: 'replace', start: abs, end: abs + 2, text: ',' } }); }
        if (/,+\s*$/.test(ft)) { const rel = ft.search(/,+\s*$/); const absStart = fieldsStart + rel; const commaMatch = ft.match(/,+\s*$/); const len = commaMatch ? commaMatch[0].length : 1; const suggestion = { id: 'select-trailing-comma', text: 'Remove trailing comma before FROM', reason: 'No trailing comma before FROM', severity: 'warning', apply: { type: 'replace', start: absStart, end: absStart + len, text: '' } }; tryPushSuggestion(suggestion, getRule('no-trailing-comma')); }
      }

      const dotRulePresent = hasRule('dot_completion') || !Array.isArray(rules) || rules.length === 0;
      const dotEndRegex = /([A-Za-z_][\w]*)\.$/g; let dm;
      while (dotRulePresent && (dm = dotEndRegex.exec(ft)) !== null) {
        const relName = dm[1];
        if (describe && describe.parentFields && Array.isArray(describe.parentFields[relName]) && describe.parentFields[relName].length > 0) {
          const firstField = describe.parentFields[relName][0]; const dotIndexInFt = dm.index + relName.length; const absDotPos = fieldsStart + dotIndexInFt; suggestions.push({ id: 'select-dot-field', text: `Complete '${relName}.' to '${relName}.${firstField}'`, reason: 'Suggest a common parent field after dot', severity: 'info', apply: { type: 'insert', pos: absDotPos + 1, text: firstField } });
        }
      }
      const spaceBeforeDotIdx = ft.search(/\w\s+\./);
      if (dotRulePresent && spaceBeforeDotIdx >= 0) { const match = ft.match(/(\w)(\s+)(\.)/); if (match) { const wsIndex = ft.indexOf(match[2], 0); const absWsPos = fieldsStart + wsIndex; suggestions.push({ id: 'select-space-before-dot', text: 'Remove space before dot', reason: 'No spaces before dot in relationship notation', severity: 'hint', apply: { type: 'replace', start: absWsPos, end: absWsPos + match[2].length, text: '' } }); } }
    }
  }

  return suggestions;
}
