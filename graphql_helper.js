(function(){
  'use strict';

  if (window.__GraphqlHelperLoaded) {
    try { console.warn('[GraphQL] graphql_helper.js already loaded; skipping'); } catch {}
    return;
  }
  window.__GraphqlHelperLoaded = true;

  const cleanup = [];
  const nowTs = () => Date.now ? Date.now() : new Date().getTime();
  const DESCRIBE_TTL_MS = 5 * 60 * 1000;
  const describeCache = { names: null, ts: 0 };
  const describeObjCache = new Map();

  const uid = () => 'gq-' + Math.random().toString(36).slice(2, 10);

  // ==================== Smart Formatting Functions (Postman-like) ====================

  /**
   * Format GraphQL query with smart indentation
   * Handles nested braces, parentheses, and preserves string literals
   */
  function formatGraphQL(query) {
    if (!query || typeof query !== 'string') return query;

    let formatted = '';
    let indent = 0;
    const indentStr = '  ';
    let inString = false;
    let stringChar = '';

    // Normalize whitespace but preserve structure
    const normalized = query
      .replace(/\r\n/g, '\n')
      .replace(/\r/g, '\n')
      .replace(/[ \t]+/g, ' ')
      .replace(/\n\s*\n/g, '\n')
      .trim();

    for (let i = 0; i < normalized.length; i++) {
      const char = normalized[i];
      const prevChar = normalized[i - 1];
      const nextChar = normalized[i + 1];

      // Track string state (handle both single and double quotes)
      if ((char === '"' || char === "'") && prevChar !== '\\') {
        if (!inString) {
          inString = true;
          stringChar = char;
        } else if (char === stringChar) {
          inString = false;
          stringChar = '';
        }
      }

      if (inString) {
        formatted += char;
        continue;
      }

      // Handle opening braces
      if (char === '{') {
        // Check if previous non-space char needs newline
        const trimmed = formatted.trimEnd();
        if (trimmed.length > 0 && !trimmed.endsWith('\n') && !trimmed.endsWith('(')) {
          if (!trimmed.endsWith(' ')) formatted = trimmed + ' ';
        }
        formatted += '{\n' + indentStr.repeat(++indent);
      }
      // Handle closing braces
      else if (char === '}') {
        formatted = formatted.trimEnd() + '\n' + indentStr.repeat(--indent) + '}';
        // Add newline after closing brace if next char is alphanumeric (field name) or not a closing delimiter
        if (nextChar && nextChar !== '}' && nextChar !== ')') {
          formatted += '\n' + indentStr.repeat(indent);
        }
      }
      // Handle opening parentheses (for arguments)
      else if (char === '(') {
        formatted += '(';
      }
      // Handle closing parentheses
      else if (char === ')') {
        formatted += ')';
      }
      // Handle commas in arguments
      else if (char === ',') {
        formatted += ', ';
        // Skip following spaces
        while (normalized[i + 1] === ' ') i++;
      }
      // Handle colons
      else if (char === ':') {
        formatted += ': ';
        // Skip following spaces
        while (normalized[i + 1] === ' ') i++;
      }
      // Handle newlines
      else if (char === '\n') {
        // Only add newline if not already at one
        if (!formatted.endsWith('\n')) {
          formatted += '\n' + indentStr.repeat(indent);
        }
      }
      // Handle spaces
      else if (char === ' ') {
        // Check if this space separates two field names (lookahead for pattern: word space word {)
        // This helps format field selections like "Id AccountId { value }" properly
        const afterSpace = normalized.slice(i + 1);
        const isFieldSeparator = /^[A-Za-z_][A-Za-z0-9_]*\s*\{/.test(afterSpace);

        if (isFieldSeparator) {
          // This space separates fields, add newline with proper indentation
          if (!formatted.endsWith('\n')) {
            formatted += '\n' + indentStr.repeat(indent);
          }
        } else {
          // Avoid multiple spaces
          if (!formatted.endsWith(' ') && !formatted.endsWith('\n') && !formatted.endsWith('(') && !formatted.endsWith(': ')) {
            formatted += ' ';
          }
        }
      }
      // Regular characters
      else {
        formatted += char;
      }
    }

    // Clean up extra whitespace
    return formatted
      .replace(/\n\s*\n/g, '\n')
      .replace(/{\s+}/g, '{ }')
      .replace(/\(\s+\)/g, '()')
      .trim();
  }

  /**
   * Format JSON with smart indentation
   * Returns prettified JSON or original if invalid
   */
  function formatJSON(jsonString, spaces = 2) {
    if (!jsonString || typeof jsonString !== 'string') return jsonString;

    const trimmed = jsonString.trim();
    if (!trimmed) return trimmed;

    try {
      const parsed = JSON.parse(trimmed);
      return JSON.stringify(parsed, null, spaces);
    } catch (e) {
      // Return original if invalid JSON
      return jsonString;
    }
  }

  /**
   * Smart formatter that auto-detects content type
   */
  function smartFormat(input, type = 'auto') {
    if (!input || typeof input !== 'string') return input;

    const trimmed = input.trim();

    if (type === 'json') {
      return formatJSON(trimmed);
    }

    if (type === 'graphql') {
      return formatGraphQL(trimmed);
    }

    // Auto-detect type
    // Try JSON first (if starts with { or [)
    if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
      try {
        JSON.parse(trimmed);
        return formatJSON(trimmed);
      } catch {
        // Not valid JSON, try GraphQL
      }
    }

    // Check if it looks like GraphQL
    if (/^(query|mutation|subscription|fragment|\{)/i.test(trimmed)) {
      return formatGraphQL(trimmed);
    }

    return input;
  }

  // ==================== End Formatting Functions ====================

  // ==================== Intelligent Autocomplete System ====================

  // Cache for autocomplete suggestions
  const autocompleteCache = {
    currentObject: null,
    fields: [],
    childRelationships: [],
    parentRelationships: [],
    allObjects: []
  };

  // Autocomplete UI state
  let autocompleteEl = null;
  let autocompleteVisible = false;
  let autocompleteItems = [];
  let autocompleteSelectedIndex = 0;
  let autocompleteContext = null; // { type: 'field'|'object'|'keyword', startPos, endPos, prefix }

  // GraphQL keywords and structures
  const GRAPHQL_KEYWORDS = ['query', 'mutation', 'subscription', 'fragment', 'on'];
  const UIAPI_STRUCTURE = ['uiapi', 'query', 'edges', 'node', 'pageInfo', 'endCursor', 'hasNextPage', 'value'];
  const FILTER_OPERATORS = ['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'like', 'in'];
  const COMMON_ARGS = ['first', 'after', 'offset', 'where', 'orderBy'];

  /**
   * Initialize autocomplete UI
   */
  function initAutocomplete() {
    if (autocompleteEl) return;

    autocompleteEl = document.createElement('div');
    autocompleteEl.id = 'graphql-autocomplete';
    autocompleteEl.className = 'graphql-autocomplete';
    autocompleteEl.setAttribute('role', 'listbox');
    autocompleteEl.style.display = 'none';
    document.body.appendChild(autocompleteEl);

    // Close autocomplete when clicking outside
    document.addEventListener('click', (e) => {
      if (!autocompleteEl.contains(e.target) && e.target !== queryEl) {
        hideAutocomplete();
      }
    });
  }

  /**
   * Show autocomplete dropdown
   */
  function showAutocomplete(items, position) {
    if (!autocompleteEl || !items.length) {
      hideAutocomplete();
      return;
    }

    autocompleteItems = items;
    autocompleteSelectedIndex = 0;
    autocompleteVisible = true;

    // Render items
    autocompleteEl.innerHTML = items.map((item, idx) => `
      <div class="autocomplete-item ${idx === 0 ? 'selected' : ''}" 
           data-index="${idx}" 
           data-value="${Utils.escapeHtml(item.value)}"
           data-type="${item.type}">
        <span class="autocomplete-icon">${getItemIcon(item.type)}</span>
        <span class="autocomplete-label">${Utils.escapeHtml(item.label)}</span>
        <span class="autocomplete-type">${Utils.escapeHtml(item.typeLabel || item.type)}</span>
        ${item.description ? `<span class="autocomplete-desc">${Utils.escapeHtml(item.description)}</span>` : ''}
      </div>
    `).join('');

    // Position dropdown
    if (position && queryEl) {
      const rect = queryEl.getBoundingClientRect();
      const lineHeight = 18; // Approximate line height
      const lines = queryEl.value.substring(0, position.start).split('\n');
      const currentLine = lines.length - 1;
      const charOffset = lines[lines.length - 1].length;

      autocompleteEl.style.position = 'fixed';
      autocompleteEl.style.left = `${rect.left + Math.min(charOffset * 7.2, rect.width - 300)}px`;
      autocompleteEl.style.top = `${rect.top + (currentLine + 1) * lineHeight + 5}px`;
      autocompleteEl.style.maxWidth = '350px';
      autocompleteEl.style.maxHeight = '250px';
    }

    autocompleteEl.style.display = 'block';

    // Wire up click handlers
    autocompleteEl.querySelectorAll('.autocomplete-item').forEach(el => {
      el.addEventListener('click', () => {
        const value = el.dataset.value;
        const type = el.dataset.type;
        applyAutocomplete(value, type);
      });
      el.addEventListener('mouseenter', () => {
        autocompleteSelectedIndex = parseInt(el.dataset.index, 10);
        updateAutocompleteSelection();
      });
    });
  }

  /**
   * Hide autocomplete dropdown
   */
  function hideAutocomplete() {
    if (autocompleteEl) {
      autocompleteEl.style.display = 'none';
    }
    autocompleteVisible = false;
    autocompleteItems = [];
    autocompleteContext = null;
  }

  /**
   * Get icon for item type
   */
  function getItemIcon(type) {
    switch (type) {
      case 'field': return '📝';
      case 'relationship': return '🔗';
      case 'childRelationship': return '👶';
      case 'parentRelationship': return '👆';
      case 'object': return '📦';
      case 'keyword': return '🔑';
      case 'structure': return '🏗️';
      case 'operator': return '⚡';
      case 'argument': return '⚙️';
      default: return '•';
    }
  }

  /**
   * Update autocomplete selection highlight
   */
  function updateAutocompleteSelection() {
    if (!autocompleteEl) return;
    autocompleteEl.querySelectorAll('.autocomplete-item').forEach((el, idx) => {
      el.classList.toggle('selected', idx === autocompleteSelectedIndex);
    });
    // Scroll into view
    const selectedEl = autocompleteEl.querySelector('.autocomplete-item.selected');
    if (selectedEl) {
      selectedEl.scrollIntoView({ block: 'nearest' });
    }
  }

  /**
   * Apply selected autocomplete item
   */
  function applyAutocomplete(value, type) {
    if (!queryEl || !autocompleteContext) return;

    const { startPos, endPos } = autocompleteContext;
    const before = queryEl.value.substring(0, startPos);
    const after = queryEl.value.substring(endPos);

    let insertText = value;

    // Add appropriate structure based on type
    switch (type) {
      case 'object':
        // For objects, add full structure
        insertText = `${value} {\n    edges {\n      node {\n        Id\n      }\n    }\n    pageInfo {\n      endCursor\n      hasNextPage\n    }\n  }`;
        break;
      case 'childRelationship':
        // For child relationships, add nested structure
        insertText = `${value} {\n      edges {\n        node {\n          Id\n        }\n      }\n    }`;
        break;
      case 'parentRelationship':
        // For parent lookups, add value wrapper
        insertText = `${value} {\n      Id\n      Name { value }\n    }`;
        break;
      case 'field':
        // For regular fields (non-Id), add { value }
        if (value.toLowerCase() !== 'id') {
          insertText = `${value} { value }`;
        }
        break;
      case 'structure':
        // For structure keywords like edges, node, pageInfo
        if (value === 'edges') {
          insertText = `edges {\n      node {\n        \n      }\n    }`;
        } else if (value === 'node') {
          insertText = `node {\n        \n      }`;
        } else if (value === 'pageInfo') {
          insertText = `pageInfo {\n      endCursor\n      hasNextPage\n    }`;
        } else if (value === 'value') {
          insertText = `{ value }`;
        }
        break;
    }

    queryEl.value = before + insertText + after;

    // Position cursor appropriately
    const newPos = startPos + insertText.length;
    queryEl.setSelectionRange(newPos, newPos);
    queryEl.focus();

    hideAutocomplete();

    // Trigger input event for any listeners
    queryEl.dispatchEvent(new Event('input', { bubbles: true }));
  }

  /**
   * Parse the current context in the GraphQL query
   */
  function parseQueryContext(text, cursorPos) {
    const beforeCursor = text.substring(0, cursorPos);

    // Find the current word being typed
    const wordMatch = beforeCursor.match(/[\w_]+$/);
    const currentWord = wordMatch ? wordMatch[0] : '';
    const wordStart = cursorPos - currentWord.length;

    // Analyze context by looking at surrounding braces and keywords
    const context = {
      prefix: currentWord,
      startPos: wordStart,
      endPos: cursorPos,
      type: 'unknown',
      parentObject: null,
      depth: 0,
      inArgs: false,
      inWhere: false,
      path: []
    };

    // Count braces to determine depth
    let braceDepth = 0;
    let parenDepth = 0;
    const objectStack = [];

    for (let i = 0; i < beforeCursor.length; i++) {
      const char = beforeCursor[i];
      if (char === '{') {
        braceDepth++;
        // Look back for object name
        const beforeBrace = beforeCursor.substring(0, i).trim();
        const objMatch = beforeBrace.match(/(\w+)\s*(?:\([^)]*\))?\s*$/);
        if (objMatch) {
          objectStack.push(objMatch[1]);
        }
      } else if (char === '}') {
        braceDepth--;
        objectStack.pop();
      } else if (char === '(') {
        parenDepth++;
      } else if (char === ')') {
        parenDepth--;
      }
    }

    context.depth = braceDepth;
    context.inArgs = parenDepth > 0;
    context.path = [...objectStack];

    // Check if we're in a where clause
    const lastWhereIndex = beforeCursor.lastIndexOf('where');
    const lastBraceAfterWhere = beforeCursor.substring(lastWhereIndex).indexOf('}');
    context.inWhere = lastWhereIndex > -1 && (lastBraceAfterWhere === -1 || lastWhereIndex > beforeCursor.lastIndexOf('}'));

    // Determine suggestion type based on context
    if (braceDepth === 0 && !currentWord) {
      context.type = 'keyword';
    } else if (braceDepth === 1 && objectStack[0]?.toLowerCase() === 'query') {
      context.type = 'keyword'; // uiapi level
    } else if (braceDepth === 2 && objectStack[1]?.toLowerCase() === 'uiapi') {
      context.type = 'keyword'; // query level
    } else if (braceDepth === 3 && objectStack[2]?.toLowerCase() === 'query') {
      context.type = 'object'; // Object selection level
    } else if (context.inArgs) {
      context.type = context.inWhere ? 'operator' : 'argument';
    } else if (objectStack.includes('node') || objectStack.includes('edges')) {
      context.type = 'field';
      // Find the main object
      const nodeIndex = objectStack.indexOf('node');
      if (nodeIndex > 0) {
        const edgesIndex = objectStack.indexOf('edges');
        if (edgesIndex > 0 && edgesIndex < nodeIndex) {
          context.parentObject = objectStack[edgesIndex - 1];
        }
      }
    } else if (braceDepth > 3) {
      context.type = 'field';
      // Try to find parent object
      for (let i = objectStack.length - 1; i >= 0; i--) {
        const item = objectStack[i];
        if (!['edges', 'node', 'pageInfo', 'uiapi', 'query'].includes(item.toLowerCase())) {
          context.parentObject = item;
          break;
        }
      }
    }

    return context;
  }

  /**
   * Get suggestions based on context
   */
  async function getSuggestions(context) {
    const { type, prefix, parentObject, inWhere, inArgs } = context;
    let suggestions = [];
    const prefixLower = (prefix || '').toLowerCase();

    switch (type) {
      case 'keyword':
        suggestions = [
          { value: 'query', label: 'query', type: 'keyword', typeLabel: 'GraphQL' },
          { value: 'mutation', label: 'mutation', type: 'keyword', typeLabel: 'GraphQL' },
          { value: 'uiapi', label: 'uiapi', type: 'structure', typeLabel: 'Salesforce', description: 'UI API root' },
          { value: 'query', label: 'query', type: 'structure', typeLabel: 'UI API', description: 'Query container' },
        ];
        break;

      case 'object': {
        // Get all objects from cache
        const { names } = await getDescribeCached();
        suggestions = names
          .filter(n => n.toLowerCase().startsWith(prefixLower))
          .slice(0, 20)
          .map(name => ({
            value: name,
            label: name,
            type: 'object',
            typeLabel: 'SObject',
            description: 'Salesforce object'
          }));
        break;
      }

      case 'field':
        // Get fields for the parent object
        if (parentObject) {
          const desc = await getSobjectDescribeCached(parentObject);
          if (desc) {
            // Regular fields
            const fields = (desc.fields || [])
              .filter(f => f.name.toLowerCase().startsWith(prefixLower))
              .slice(0, 15)
              .map(f => ({
                value: f.name,
                label: f.name,
                type: 'field',
                typeLabel: f.type || 'Field',
                description: f.label || ''
              }));

            // Child relationships
            const childRels = (desc.childRelationships || [])
              .filter(r => r.relationshipName && r.relationshipName.toLowerCase().startsWith(prefixLower))
              .slice(0, 10)
              .map(r => ({
                value: r.relationshipName,
                label: r.relationshipName,
                type: 'childRelationship',
                typeLabel: `→ ${r.childSObject}`,
                description: 'Child relationship'
              }));

            // Parent/Lookup relationships
            const parentRels = (desc.fields || [])
              .filter(f => f.type === 'reference' && f.relationshipName &&
                      f.relationshipName.toLowerCase().startsWith(prefixLower))
              .slice(0, 10)
              .map(f => ({
                value: f.relationshipName,
                label: f.relationshipName,
                type: 'parentRelationship',
                typeLabel: `← ${f.referenceTo?.[0] || 'Lookup'}`,
                description: 'Parent lookup'
              }));

            suggestions = [...fields, ...childRels, ...parentRels];
          }
        }

        // Always add structure suggestions if relevant
        if (!prefixLower || 'edges'.startsWith(prefixLower)) {
          suggestions.push({ value: 'edges', label: 'edges', type: 'structure', typeLabel: 'Structure', description: 'Record container' });
        }
        if (!prefixLower || 'node'.startsWith(prefixLower)) {
          suggestions.push({ value: 'node', label: 'node', type: 'structure', typeLabel: 'Structure', description: 'Record data' });
        }
        if (!prefixLower || 'pageinfo'.startsWith(prefixLower)) {
          suggestions.push({ value: 'pageInfo', label: 'pageInfo', type: 'structure', typeLabel: 'Structure', description: 'Pagination info' });
        }
        if (!prefixLower || 'value'.startsWith(prefixLower)) {
          suggestions.push({ value: 'value', label: '{ value }', type: 'structure', typeLabel: 'Wrapper', description: 'Field value wrapper' });
        }
        break;

      case 'operator':
        suggestions = FILTER_OPERATORS
          .filter(op => op.toLowerCase().startsWith(prefixLower))
          .map(op => ({
            value: op,
            label: op,
            type: 'operator',
            typeLabel: 'Filter Op',
            description: getOperatorDescription(op)
          }));
        break;

      case 'argument':
        suggestions = COMMON_ARGS
          .filter(arg => arg.toLowerCase().startsWith(prefixLower))
          .map(arg => ({
            value: arg,
            label: arg,
            type: 'argument',
            typeLabel: 'Argument',
            description: getArgumentDescription(arg)
          }));
        break;
    }

    return suggestions;
  }

  function getOperatorDescription(op) {
    const descriptions = {
      'eq': 'Equals (=)',
      'neq': 'Not equals (!=)',
      'gt': 'Greater than (>)',
      'gte': 'Greater or equal (>=)',
      'lt': 'Less than (<)',
      'lte': 'Less or equal (<=)',
      'like': 'Pattern match (LIKE)',
      'in': 'In list (IN)'
    };
    return descriptions[op] || '';
  }

  function getArgumentDescription(arg) {
    const descriptions = {
      'first': 'Limit number of results',
      'after': 'Cursor for pagination',
      'offset': 'Skip number of results',
      'where': 'Filter conditions',
      'orderBy': 'Sort results'
    };
    return descriptions[arg] || '';
  }

  /**
   * Handle keydown events for autocomplete navigation
   */
  function handleAutocompleteKeydown(e) {
    if (!autocompleteVisible) return false;

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        autocompleteSelectedIndex = (autocompleteSelectedIndex + 1) % autocompleteItems.length;
        updateAutocompleteSelection();
        return true;

      case 'ArrowUp':
        e.preventDefault();
        autocompleteSelectedIndex = (autocompleteSelectedIndex - 1 + autocompleteItems.length) % autocompleteItems.length;
        updateAutocompleteSelection();
        return true;

      case 'Enter':
      case 'Tab':
        if (autocompleteItems.length > 0) {
          e.preventDefault();
          const selected = autocompleteItems[autocompleteSelectedIndex];
          if (selected) {
            applyAutocomplete(selected.value, selected.type);
          }
          return true;
        }
        break;

      case 'Escape':
        hideAutocomplete();
        return true;
    }

    return false;
  }

  /**
   * Trigger autocomplete on input
   */
  async function triggerAutocomplete() {
    if (!queryEl) return;

    const cursorPos = queryEl.selectionStart;
    const text = queryEl.value;

    // Parse context
    const context = parseQueryContext(text, cursorPos);
    autocompleteContext = context;

    // Don't show autocomplete for empty prefix in some contexts
    if (!context.prefix && context.type === 'unknown') {
      hideAutocomplete();
      return;
    }

    // Get suggestions
    const suggestions = await getSuggestions(context);

    if (suggestions.length > 0) {
      showAutocomplete(suggestions, { start: context.startPos, end: context.endPos });
    } else {
      hideAutocomplete();
    }
  }

  /**
   * Wire up autocomplete events
   */
  function wireAutocomplete() {
    if (!queryEl) return;

    initAutocomplete();

    // Trigger on input with debounce
    let autocompleteTimeout;
    on(queryEl, 'input', () => {
      clearTimeout(autocompleteTimeout);
      autocompleteTimeout = setTimeout(triggerAutocomplete, 150);
    });

    // Handle keyboard navigation
    on(queryEl, 'keydown', (e) => {
      if (handleAutocompleteKeydown(e)) {
        return;
      }

      // Trigger autocomplete on Ctrl+Space
      if (e.ctrlKey && e.key === ' ') {
        e.preventDefault();
        triggerAutocomplete();
      }
    });

    // Hide on blur (with delay to allow click on dropdown)
    on(queryEl, 'blur', () => {
      setTimeout(() => {
        if (!autocompleteEl?.matches(':hover')) {
          hideAutocomplete();
        }
      }, 150);
    });

    // Reposition on scroll
    on(queryEl, 'scroll', () => {
      if (autocompleteVisible) {
        hideAutocomplete();
      }
    });
  }

  // ==================== End Autocomplete System ====================

  // ==================== Object/Field Filtering System ====================

  // Store full object metadata (name, label, custom) for richer display
  let allObjectsMetadata = []; // Array of { name, label, isCustom }
  let objectFilterTerm = '';
  let fieldFilterTerm = '';
  let objectFilterDebounceTimer = null;
  let fieldFilterDebounceTimer = null;
  const FILTER_DEBOUNCE_MS = 200;

  // GraphQL connection wrappers to filter out from field lists
  const GRAPHQL_WRAPPER_FIELDS = new Set([
    'edges', 'node', 'value', 'pageInfo', 'endCursor', 'hasNextPage', 'hasPreviousPage',
    'startCursor', 'cursor', '__typename', 'totalCount'
  ]);

  // Utility: Check if a field is a GraphQL wrapper field
  function isGraphQLWrapperField(fieldName) {
    return GRAPHQL_WRAPPER_FIELDS.has(fieldName);
  }

  // Utility: Filter out GraphQL wrapper fields from field array
  function filterOutGraphQLWrappers(fields) {
    if (!Array.isArray(fields)) return [];
    return fields.filter(f => {
      const name = typeof f === 'string' ? f : f?.name;
      return name && !isGraphQLWrapperField(name);
    });
  }

  // Utility: Check if field is custom (__c suffix)
  function isCustomField(fieldName) {
    return typeof fieldName === 'string' && fieldName.endsWith('__c');
  }

  // Utility: Check if object is custom (__c suffix)
  function isCustomObject(objectName) {
    return typeof objectName === 'string' && objectName.endsWith('__c');
  }

  /**
   * Transform a field display name by stripping GraphQL wrapper notation
   * Converts "Name { value }" to "Name" for display purposes
   * @param {string} fieldName - Field name potentially with { value } wrapper
   * @returns {string} Clean field name for display
   */
  function transformFieldDisplay(fieldName) {
    if (!fieldName || typeof fieldName !== 'string') return fieldName || '';
    // Strip "{ value }" wrapper if present
    return fieldName.replace(/\s*\{\s*value\s*\}\s*$/i, '').trim();
  }

  /**
   * Unwrap a single record from GraphQL node structure
   * Flattens { value } wrappers on field values for display
   * @param {Object} nodeData - A node object from GraphQL response
   * @returns {Object} Flattened record with clean field values
   */
  function unwrapResultRecord(nodeData) {
    if (!nodeData || typeof nodeData !== 'object') return nodeData;
    const result = {};
    for (const [key, value] of Object.entries(nodeData)) {
      // Skip GraphQL wrapper fields
      if (isGraphQLWrapperField(key)) continue;
      // Unwrap { value } wrapper objects (may also have displayValue, etc.)
      if (value && typeof value === 'object' && 'value' in value) {
        result[key] = value.value;
      } else if (value && typeof value === 'object' && !Array.isArray(value)) {
        // Recursively unwrap nested objects (e.g., lookup relationships)
        result[key] = unwrapResultRecord(value);
      } else {
        result[key] = value;
      }
    }
    return result;
  }

  /**
   * Extract and unwrap all records from a GraphQL response
   * @param {Object} data - GraphQL response data
   * @param {string} [objectName] - Optional object name to extract from
   * @returns {Array} Array of flattened records
   */
  function extractRecords(data, objectName) {
    if (!data) return [];

    // Try UI API structure: data.uiapi.query.ObjectName.edges
    let edges = null;
    if (objectName && data?.uiapi?.query?.[objectName]?.edges) {
      edges = data.uiapi.query[objectName].edges;
    } else if (data?.edges) {
      edges = data.edges;
    } else {
      // Try to find any edges array in the response
      const findEdges = (obj, depth = 0) => {
        if (depth > 10) return null;
        if (!obj || typeof obj !== 'object') return null;
        if (Array.isArray(obj.edges)) return obj.edges;
        for (const key of Object.keys(obj)) {
          const found = findEdges(obj[key], depth + 1);
          if (found) return found;
        }
        return null;
      };
      edges = findEdges(data);
    }

    if (!Array.isArray(edges)) return [];

    return edges
      .map(edge => edge?.node ? unwrapResultRecord(edge.node) : null)
      .filter(Boolean);
  }

  // ==================== End Object/Field Filtering System ====================

  // Flag to prevent circular import when programmatically writing query
  let isWritingQueryFromBuilder = false;

  const defaultBuilderState = () => ({
     enabled: false,
     object: '',
     fields: ['Id'],
     filters: [],
     filterLogic: 'and', // 'and' | 'or' - how to combine multiple filters
     orderBy: null,
     limit: 50,
     offset: 0,
     after: '',
     includePageInfo: true,
     // Composite query support - related objects
     relatedObjects: [], // Array of { relationship: string, fields: string[], filters: [], isLookup: boolean }
   });
   let builderState = defaultBuilderState();

   const SCHEMA_CACHE_KEY = 'graphqlSchemaCache';
   const SCHEMA_TTL_MS = 6 * 60 * 60 * 1000; // 6h cache
   let cachedSchema = null;

   // ==================== Screen State Management ====================
   const graphqlUIState = {
     currentScreen: 'objects', // 'objects' | 'builder' | 'results'
     selectedObject: null,
     currentResults: null,

     // Screen navigation
     goToObjectSelection() {
       this.currentScreen = 'objects';
       this.selectedObject = null;
       renderScreens();
     },

     selectObject(objectName) {
       this.currentScreen = 'builder';
       this.selectedObject = objectName;
       builderState.object = objectName;
       builderState.enabled = true;  // Enable builder by default
       builderState.fields = ['Id'];  // Start with Id field
       builderState.filters = [];
       renderScreens();
       refreshBuilderFields(objectName);
       if (builderToggle) builderToggle.checked = true;
       handleBuilderChange({ writeQuery: true, loadFields: false });
     },

     goToBuilder() {
       this.currentScreen = 'builder';
       renderScreens();
     },

     runQueryAndShowResults(results) {
       this.currentScreen = 'results';
       this.currentResults = results;
       renderScreens();
     },

     backToBuilder() {
       this.currentScreen = 'builder';
       renderScreens();
     }
   };

   // ...existing code...
   async function cleanupSchemaCache() {
     return new Promise((resolve) => {
       try {
         chrome.storage?.local?.get?.({ [SCHEMA_CACHE_KEY]: {} }, (r) => {
           const stash = r?.[SCHEMA_CACHE_KEY] || {};
           const entries = Object.entries(stash);

           // Keep only 1 most recent schema, delete older ones
           if (entries.length > 1) {
             const sorted = entries.sort((a, b) => (b[1]?.ts || 0) - (a[1]?.ts || 0));
             const cleaned = {};
             cleaned[sorted[0][0]] = sorted[0][1];

             try {
               chrome.storage.local.set({ [SCHEMA_CACHE_KEY]: cleaned }, () => {
                 resolve(true);
               });
             } catch {
               resolve(false);
             }
           } else {
             resolve(true);
           }
         });
       } catch {
         resolve(false);
       }
     });
   }

   // DOM refs
   let objectGroup, objectSelect, refreshObjectsBtn;
   let limitInput, offsetInput, afterInput;
   let queryEl;
   let editorMount;
   let schemaStatusEl, schemaRefreshBtn;
   let schemaSearchInput, schemaResultsEl;
   let variablesEl, runBtn, clearBtn, resultsEl;
   let pageInfoEl;
   let pageInfoApplyBtn, pageInfoClearBtn;
   let builderToggle, builderPanel, builderStatus;
   let fieldInput, fieldList, fieldChips, addFieldBtn;
   let filterContainer, addFilterBtn;
   let orderFieldInput, orderDirSel, clearOrderBtn;
   let pageInfoBody;
   let lastPageInfo = null;
   let editorView = null;
   let schemaIndex = [];
   let lastSession = null;

   // Screen DOM refs
   let graphqlScreenObjects, graphqlScreenBuilder, graphqlScreenResults;
   let graphqlObjectsGrid, graphqlObjectsSearch, graphqlCurrentObject, graphqlResultsObject;
   let graphqlQueryPreview, graphqlBackToObjects, graphqlBackToBuilder;
   let graphqlAdvancedMode, graphqlManualMode, graphqlManualEditToggle;

   // Screen Rendering Function
   function renderScreens() {
     if (!graphqlScreenObjects || !graphqlScreenBuilder || !graphqlScreenResults) return;

     // Detect pop-out/standalone mode for UI adjustments
     const isStandalone = window.location.hash.includes('standalone');

     // Apply standalone-specific UI adjustments
     const tabPane = document.querySelector('.tab-pane[data-tab="graphql"]');
     if (tabPane) {
       tabPane.classList.toggle('standalone-mode', isStandalone);
     }

     // In standalone mode, show a mode indicator badge if present
     const modeBadge = document.getElementById('window-mode-badge');
     if (modeBadge) {
       modeBadge.style.display = isStandalone ? 'flex' : 'none';
       const modeLabel = modeBadge.querySelector('.mode-label');
       if (modeLabel) modeLabel.textContent = isStandalone ? 'Pop-out Window' : 'Popup';
     }

     // Adjust layout constraints for standalone mode (larger panels, more space)
     if (isStandalone) {
       const builderPanel = document.getElementById('graphql-builder-panel');
       if (builderPanel) {
         builderPanel.classList.add('standalone-expanded');
       }
       const rightPanel = document.querySelector('.graphql-builder-right');
       if (rightPanel) {
         rightPanel.classList.add('standalone-expanded');
       }
     }

     // Hide all screens
     graphqlScreenObjects.classList.remove('active');
     graphqlScreenObjects.classList.add('hidden');
     graphqlScreenBuilder.classList.remove('active');
     graphqlScreenBuilder.classList.add('hidden');
     graphqlScreenResults.classList.remove('active');
     graphqlScreenResults.classList.add('hidden');

     // Sync object state: ensure graphqlUIState.selectedObject and builderState.object are consistent
     // Use graphqlUIState.selectedObject as source of truth, but fall back to builderState.object
     const displayObject = graphqlUIState.selectedObject || builderState.object || '-';
     if (graphqlUIState.selectedObject && builderState.object !== graphqlUIState.selectedObject) {
       builderState.object = graphqlUIState.selectedObject;
     }

     // Show current screen
     const screen = graphqlUIState.currentScreen;
     if (screen === 'objects') {
       graphqlScreenObjects.classList.add('active');
       graphqlScreenObjects.classList.remove('hidden');
     } else if (screen === 'builder') {
       graphqlScreenBuilder.classList.add('active');
       graphqlScreenBuilder.classList.remove('hidden');
       if (graphqlCurrentObject) graphqlCurrentObject.textContent = displayObject;
     } else if (screen === 'results') {
       graphqlScreenResults.classList.add('active');
       graphqlScreenResults.classList.remove('hidden');
       if (graphqlResultsObject) graphqlResultsObject.textContent = displayObject;
     }
   }

   // No-op CodeMirror initializer to avoid ReferenceError when the editor library is absent.
   function initCodeMirror() {
     try {
       if (editorMount) editorMount.hidden = true;
       if (queryEl) queryEl.hidden = false;
     } catch {}
     return Promise.resolve();
   }

   // Keep textarea and hypothetical editor in sync; no-op when editor is absent.
   function syncEditorFromTextarea() {
     return;
   }

   // Fallback session fetch in case instance URL is cached but session not set.
   async function getSessionInfoFallback() {
     return new Promise((resolve) => {
       try {
         chrome.runtime.sendMessage({ action: 'GET_SESSION_INFO' }, (resp) => {
           if (chrome.runtime?.lastError) { resolve(null); return; }
           lastSession = resp && resp.success ? resp : null;
           resolve(lastSession);
         });
       } catch { resolve(null); }
     });
   }

   // Ensure we have a cached session object, fetching from background if needed.
   async function ensureSessionCached() {
     if (lastSession) return lastSession;
     try { lastSession = await getSessionInfoFallback(); } catch { lastSession = null; }
     return lastSession;
   }

  async function getPreferredApiVersion() {
     return new Promise((resolve) => {
       try {
         chrome.storage?.local?.get?.({ apiVersion: '65.0' }, (r) => {
           const raw = String(r?.apiVersion || '65.0').replace(/^v/i, '');
           resolve(raw);
         });
       } catch { resolve('65.0'); }
     });
   }

   // Safe error stringifier to avoid [object Object] in logs
   function safeStringify(obj, depth = 0, maxDepth = 3) {
     if (depth > maxDepth) return '[max depth]';
     if (obj === null) return 'null';
     if (obj === undefined) return 'undefined';
     if (typeof obj === 'string') return `"${obj}"`;
     if (typeof obj !== 'object') return String(obj);

     try {
       if (Array.isArray(obj)) {
         return `[${obj.slice(0, 5).map((v) => safeStringify(v, depth + 1, maxDepth)).join(', ')}${obj.length > 5 ? '...' : ''}]`;
       }
       const pairs = Object.entries(obj)
         .slice(0, 10)
         .map(([k, v]) => `${k}: ${safeStringify(v, depth + 1, maxDepth)}`);
       return `{${pairs.join(', ')}${Object.keys(obj).length > 10 ? '...' : ''}}`;
     } catch {
       return String(obj);
     }
   }

   function setSchemaStatus(msg, tone = 'info') {
     if (!schemaStatusEl) return;
     schemaStatusEl.textContent = msg;
     schemaStatusEl.dataset.tone = tone;
   }

   function schemaCacheKey(instanceUrl, apiVersion) {
     return `${instanceUrl}|v${String(apiVersion || '65.0').replace(/^v/i, '')}`;
   }

   function schemaEntryFresh(entry) {
     return !!(entry && entry.schema && Number.isFinite(entry.ts) && (nowTs() - entry.ts < SCHEMA_TTL_MS));
   }

   function buildSchemaIndex(schema) {
     schemaIndex = [];
     try {
       const types = schema?.__schema?.types || [];
       types.forEach((t) => {
         const typeName = t?.name;
         if (!typeName) return;
         const fields = Array.isArray(t.fields) ? t.fields : [];
         if (!fields.length) {
           schemaIndex.push({ type: typeName, field: null });
           return;
         }
         fields.forEach((f) => {
           if (f?.name) schemaIndex.push({ type: typeName, field: f.name });
         });
       });
     } catch {}
     return schemaIndex;
   }

   function renderSchemaSearch(query) {
     if (!schemaResultsEl) return [];
     const term = String(query || '').trim().toLowerCase();
     if (!term) { schemaResultsEl.innerHTML = '<div class="placeholder-note">Type to search schema</div>'; return []; }
     const matches = schemaIndex.filter((e) => {
       const hay = `${e.type}${e.field ? '.' + e.field : ''}`.toLowerCase();
       return hay.includes(term);
     }).slice(0, 50);
     if (!matches.length) {
       schemaResultsEl.innerHTML = '<div class="placeholder-note">No matches</div>';
       return [];
     }
     const html = matches.map((m) => `<div class="schema-hit"><span class="schema-type">${Utils.escapeHtml(m.type)}</span>${m.field ? `<span class="schema-sep">.</span><span class="schema-field">${Utils.escapeHtml(m.field)}</span>` : ''}</div>`).join('');
     schemaResultsEl.innerHTML = html;
     return matches;
   }

   function readSchemaCache(key) {
     return new Promise((resolve) => {
       try {
         chrome.storage?.local?.get?.({ [SCHEMA_CACHE_KEY]: {} }, (r) => {
           resolve(r?.[SCHEMA_CACHE_KEY]?.[key] || null);
         });
       } catch { resolve(null); }
     });
   }

   function writeSchemaCache(key, schema) {
     return new Promise((resolve) => {
       try {
         chrome.storage?.local?.get?.({ [SCHEMA_CACHE_KEY]: {} }, (r) => {
           const stash = r?.[SCHEMA_CACHE_KEY] || {};
           const schemaSize = JSON.stringify(schema).length;
           const schemaSizeMB = Math.round(schemaSize / 1024 / 1024 * 100) / 100; // More precise decimal
           const maxSizeMB = 5;

           // If schema is too large (>5MB), don't cache it
           if (schemaSize > 5 * 1024 * 1024) {
             console.warn(`[GraphQL] Schema too large to cache: ${schemaSizeMB}MB (max: ${maxSizeMB}MB). Schema will still work but won't be cached for faster load next time.`);
             resolve(false);
             return;
           }

           stash[key] = { schema, ts: nowTs() };

           try {
             chrome.storage.local.set({ [SCHEMA_CACHE_KEY]: stash }, () => {
               if (chrome.runtime.lastError) {
                 // Quota exceeded - clear old entries and retry
                 const sortedKeys = Object.entries(stash)
                   .sort((a, b) => (b[1]?.ts || 0) - (a[1]?.ts || 0));

                 // Keep only the 2 most recent schemas
                 const cleaned = {};
                 sortedKeys.slice(0, 2).forEach(([k, v]) => {
                   cleaned[k] = v;
                 });

                 try {
                   chrome.storage.local.set({ [SCHEMA_CACHE_KEY]: cleaned }, () => {
                     resolve(true);
                   });
                 } catch {
                   resolve(false);
                 }
               } else {
                 // Cache write successful
                 console.log(`[GraphQL] Schema cached successfully (${schemaSizeMB}MB)`);
                 resolve(true);
               }
             });
           } catch (e) {
             console.warn('[GraphQL] Cache write error:', e.message);
             resolve(false);
           }
         });
       } catch { resolve(false); }
     });
   }

   function extractRootObjects(schema) {
     try {
       const s = schema?.__schema;
       const qName = s?.queryType?.name;
       const qType = (s?.types || []).find((t) => t?.name === qName);
       const fields = Array.isArray(qType?.fields) ? qType.fields : [];
       return fields.map((f) => f?.name).filter(Boolean).sort();
     } catch { return []; }
   }

   function applySchemaToUi(schema) {
     if (!schema || !objectSelect) return;
     const roots = extractRootObjects(schema);
     if (!roots.length) return;
     const existing = Array.from(objectSelect.querySelectorAll('option')).map((o) => o.value).filter(Boolean);
     const merged = Array.from(new Set([...(existing || []), ...roots])).sort((a, b) => a.localeCompare(b));
     populateObjects(merged);
   }

   async function loadSchema(opts = {}) {
     const force = !!opts.force;
     const skipFullSchema = opts.skipFullSchema !== false; // Default to skipping full schema load

     // Make sure we have a fresh session if available
     await ensureSessionCached();
     let instanceUrl = null;
     try { instanceUrl = await Utils.getInstanceUrl(); } catch {}
     if (!instanceUrl && lastSession?.instanceUrl) instanceUrl = lastSession.instanceUrl;
     if (!instanceUrl) {
       setSchemaStatus('Schema: org not detected', 'warn');
       return null;
     }

     // If skipFullSchema is true, only load object metadata on-demand (optimized)
     if (skipFullSchema) {
       setSchemaStatus('Schema: on-demand loading enabled', 'ok');
       console.log('[GraphQL] Using on-demand object introspection (only object-specific metadata cached)');
       return null;
     }

     const apiVersion = await getPreferredApiVersion();
     const key = schemaCacheKey(instanceUrl, apiVersion);
     if (!force) {
       const cached = await readSchemaCache(key);
       if (schemaEntryFresh(cached)) {
         cachedSchema = cached.schema;
         applySchemaToUi(cachedSchema);
         setSchemaStatus('Schema: loaded (cache)', 'ok');
         return cachedSchema;
       }
     }
     setSchemaStatus('Schema: loading…', 'info');
     return new Promise((resolve) => {
        const payload = { action: 'GRAPHQL_INTROSPECT', instanceUrl, apiVersion: `v${String(apiVersion).replace(/^v/i, '')}` };
        // Prefer a recent session if available so introspection works when instance URL is cached but auth is missing.
        const session = lastSession || null;
        if (session?.sessionId) payload.sessionId = session.sessionId;
        if (session?.accessToken) payload.accessToken = session.accessToken;
        try {
          chrome.runtime.sendMessage(payload, async (resp) => {
            if (chrome.runtime?.lastError) {
              const errMsg = `${chrome.runtime.lastError.message}. Try logging in to Salesforce and retry.`;
              setSchemaStatus(`Schema: ${errMsg}`, 'error');
              console.warn('[GraphQL] Schema introspection error:', chrome.runtime.lastError);
              resolve(null);
              return;
            }
            if (!resp || !resp.success || !resp.data) {
              const errorMsg = resp?.error || 'Unknown error. Check if you are logged in to Salesforce.';
              setSchemaStatus(`Schema: failed (${errorMsg})`, 'error');
              const debugInfo = `success: ${resp?.success}, error: "${resp?.error}", has data: ${!!resp?.data}`;
              console.warn(`[GraphQL] Schema introspection failed: ${debugInfo}`);
              console.warn('[GraphQL] Full response:', safeStringify(resp));
              resolve(null);
              return;
            }
            cachedSchema = resp.data;
            await writeSchemaCache(key, resp.data);
            applySchemaToUi(resp.data);
            buildSchemaIndex(resp.data);
            setSchemaStatus('Schema loaded ✓', 'ok');
            resolve(resp.data);
          });
        } catch (e) {
          const errMsg = `${String(e)}. Try logging in to Salesforce and retry.`;
          setSchemaStatus(`Schema: ${errMsg}`, 'error');
          console.warn(`[GraphQL] Schema introspection error: ${String(e)}`);
          if (e?.stack) console.warn('[GraphQL] Stack:', e.stack);
          resolve(null);
        }
      });
    }

  function on(el, evt, fn, opts) {
    if (!el) return;
    el.addEventListener(evt, fn, opts);
    cleanup.push(() => { try { el.removeEventListener(evt, fn, opts); } catch {} });
  }

  function applyObjectSelectorVisibility() {
    try {
      const group = objectGroup;
      if (!group) return;
      chrome.storage?.local?.get?.({ graphqlShowObjectSelector: true }, (r) => {
        const show = (r && typeof r.graphqlShowObjectSelector === 'boolean') ? r.graphqlShowObjectSelector : true;
        group.style.display = show ? 'inline-flex' : 'none';
        try { if (objectSelect) objectSelect.disabled = !show; } catch {}
      });
    } catch {}
  }

  // Extract full object metadata (name, label, isCustom) from describe response
  function extractObjectsMetadata(objs) {
    const arr = Array.isArray(objs) ? objs : [];
    return arr
      .filter((o) => o && (o.queryable === undefined || !!o.queryable))
      .map((o) => ({
        name: o?.name || '',
        label: o?.label || o?.name || '',
        isCustom: isCustomObject(o?.name || '')
      }))
      .filter((o) => o.name)
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  function describeObjectsToNames(objs) {
    const arr = Array.isArray(objs) ? objs : [];
    return arr
      .filter((o) => o && (o.queryable === undefined || !!o.queryable))
      .map((o) => o?.name || o?.label || '')
      .filter(Boolean)
      .sort((a, b) => a.localeCompare(b));
  }

  // Enhanced object introspection cache: stores field metadata for selected objects only
  const objectIntrospectionCache = new Map(); // Maps object name -> { fields, ts }
  const OBJECT_INTROSPECTION_TTL_MS = 5 * 60 * 1000; // 5 minutes

  /**
   * Load and cache introspection data for a specific object.
   * This is the optimized approach - only load what's needed.
   */
  async function loadObjectIntrospection(objectName) {
    const obj = String(objectName || '').trim();
    if (!obj) return null;

    const now = nowTs();
    const cached = objectIntrospectionCache.get(obj);

    // Return cached if fresh
    if (cached && (now - cached.ts < OBJECT_INTROSPECTION_TTL_MS)) {
      console.log(`[GraphQL] Object introspection for ${obj} (cached)`);
      return cached.fields;
    }

    // Load via DESCRIBE_SOBJECT
    console.log(`[GraphQL] Loading object introspection for ${obj}...`);
    const desc = await getSobjectDescribeCached(obj);
    if (!desc || !Array.isArray(desc.fields)) return null;

    const fields = desc.fields.map((f) => f.name).filter(Boolean).sort((a, b) => a.localeCompare(b));
    objectIntrospectionCache.set(obj, { fields, ts: now });

    console.log(`[GraphQL] Cached ${fields.length} fields for ${obj}`);
    return fields;
  }

  function fetchDescribe() {
    return new Promise((resolve) => {
      function done(names, error, metadata = []) {
        resolve({
          names: Array.isArray(names) ? names : [],
          metadata: Array.isArray(metadata) ? metadata : [],
          error: error ? String(error) : null
        });
      }
      try {
        const payload = { action: 'DESCRIBE_GLOBAL' };
        const maybeSetInstance = () => {
          try { return Utils.getInstanceUrl && Utils.getInstanceUrl(); } catch { return null; }
        };
        Promise.resolve(maybeSetInstance()).then((instanceUrl) => {
          if (instanceUrl) payload.instanceUrl = instanceUrl;
          chrome.runtime.sendMessage(payload, (resp) => {
            const lastErr = (chrome.runtime && chrome.runtime.lastError) ? chrome.runtime.lastError.message : null;
            if (lastErr) { done([], lastErr); return; }
            if (!resp || !resp.success) { done([], resp?.error || 'Describe failed'); return; }
            const metadata = extractObjectsMetadata(resp.objects);
            const names = describeObjectsToNames(resp.objects);
            done(names, null, metadata);
          });
        }).catch(() => done([], 'Describe failed'));
      } catch (e) { done([], e); }
    });
  }

  function getDescribeCached() {
    const fresh = Array.isArray(describeCache.names) && describeCache.names.length && (nowTs() - describeCache.ts < DESCRIBE_TTL_MS);
    if (fresh) return Promise.resolve({ names: describeCache.names.slice(), metadata: allObjectsMetadata, error: null });
    return fetchDescribe().then((res) => {
      if (!res.error && res.names.length) {
        describeCache.ts = nowTs();
        describeCache.names = res.names.slice();
        allObjectsMetadata = res.metadata || [];
      }
      return res;
    }).catch((e) => ({ names: [], metadata: [], error: String(e || 'Describe failed') }));
  }

  function getSobjectDescribeCached(name) {
    const obj = String(name || '').trim();
    if (!obj) return Promise.resolve(null);
    const key = obj.toLowerCase();
    const cached = describeObjCache.get(key);
    const now = nowTs();
    if (cached && (now - cached.ts < DESCRIBE_TTL_MS)) return Promise.resolve(cached.describe || null);
    return new Promise((resolve) => {
      try {
        const payload = { action: 'DESCRIBE_SOBJECT', name: obj };
        Promise.resolve(Utils?.getInstanceUrl?.()).then((instanceUrl) => {
          if (instanceUrl) payload.instanceUrl = instanceUrl;
          chrome.runtime.sendMessage(payload, (resp) => {
            if (chrome.runtime && chrome.runtime.lastError) { resolve(null); return; }
            if (resp && resp.success && resp.describe) {
              describeObjCache.set(key, { describe: resp.describe, ts: nowTs() });
              resolve(resp.describe);
            } else {
              resolve(null);
            }
          });
        }).catch(() => resolve(null));
      } catch { resolve(null); }
    });
  }

  function quoteValue(v, isNullComparison = false) {
    // Handle actual null for IS NULL / IS NOT NULL comparisons
    if (v === null || v === undefined) return 'null';
    const trimmed = String(v).trim();
    // Handle "null" string as actual null for null comparisons
    if (trimmed.toLowerCase() === 'null' && isNullComparison) return 'null';
    if (!trimmed) return '""';
    if (/^(true|false)$/i.test(trimmed)) return trimmed.toLowerCase();
    const num = Number(trimmed);
    if (Number.isFinite(num) && String(num) === trimmed) return trimmed;
    return JSON.stringify(trimmed);
  }

  function splitListValue(value) {
    return String(value || '')
      .split(',')
      .map((p) => p.trim())
      .filter(Boolean);
  }

  /**
   * Compose a single filter clause for GraphQL where
   * Returns { field, clause } object for proper grouping
   */
  function composeFilterClause(f) {
    const field = (f?.field || '').trim();
    const op = (f?.op || '').trim().toUpperCase();
    if (!field || !op) return null;
    const rawVal = f?.value ?? '';

    // Check if this is a null comparison
    const isNullVal = rawVal === null || rawVal === undefined ||
                      String(rawVal).trim().toLowerCase() === 'null' ||
                      String(rawVal).trim() === '';

    // Handle IS NULL / IS NOT NULL operators
    if (op === 'IS NULL' || (op === '=' && isNullVal)) {
      return { field, clause: `${field}: { eq: null }` };
    }
    if (op === 'IS NOT NULL' || (op === '!=' && isNullVal)) {
      return { field, clause: `${field}: { ne: null }` };
    }

    if (op === 'IN') {
      const list = splitListValue(rawVal);
      const rendered = list.length ? `[${list.map(v => quoteValue(v)).join(', ')}]` : '[]';
      return { field, clause: `${field}: { in: ${rendered} }` };
    }
    if (op === 'NOT IN') {
      const list = splitListValue(rawVal);
      const rendered = list.length ? `[${list.map(v => quoteValue(v)).join(', ')}]` : '[]';
      return { field, clause: `${field}: { nin: ${rendered} }` };
    }

    const opMap = {
      '=': 'eq',
      '!=': 'ne',
      '<>': 'ne',
      '>': 'gt',
      '>=': 'gte',
      '<': 'lt',
      '<=': 'lte',
      'LIKE': 'like',
      'IN': 'in',
      'NOT IN': 'nin'
    };
    const gqlOp = opMap[op] || 'eq';
    return { field, clause: `${field}: { ${gqlOp}: ${quoteValue(rawVal, isNullVal)} }` };
  }

  /**
   * Compose where clause with proper AND/OR grouping for multiple filters on same field
   * This prevents duplicate keys in the GraphQL object which would be invalid
   */
  function composeWhere(filters, logicOperator = 'and') {
    const validFilters = (filters || [])
      .map(composeFilterClause)
      .filter(Boolean);

    if (!validFilters.length) return '';

    // Group filters by field to detect duplicates
    const fieldGroups = new Map();
    validFilters.forEach(({ field, clause }) => {
      if (!fieldGroups.has(field)) {
        fieldGroups.set(field, []);
      }
      fieldGroups.get(field).push(clause);
    });

    // Check if we have duplicate fields (multiple filters on same field)
    const hasDuplicateFields = Array.from(fieldGroups.values()).some(arr => arr.length > 1);

    if (hasDuplicateFields || validFilters.length > 1) {
      // Use and: [...] array format to properly group multiple conditions
      // This avoids duplicate keys in GraphQL object
      const clauses = validFilters.map(({ clause }) => `{ ${clause} }`);
      return `{ ${logicOperator}: [${clauses.join(', ')}] }`;
    }

    // Single filter - use simple format
    return `{ ${validFilters[0].clause} }`;
  }

  function composeArgs(state) {
    const args = [];
    const filterLogic = state.filterLogic || 'and';
    const where = composeWhere(state.filters, filterLogic);
    if (where) args.push(`where: ${where}`);
    // Pagination arguments should come before orderBy
    if (Number.isFinite(state.limit)) args.push(`first: ${state.limit}`);
    if (Number.isFinite(state.offset) && state.offset > 0) args.push(`offset: ${state.offset}`);
    if (state.after) args.push(`after: "${state.after}"`);
    // orderBy comes after pagination
    if (state.orderBy && state.orderBy.field) {
      const dir = (state.orderBy.dir || 'asc').toLowerCase() === 'desc' ? 'DESC' : 'ASC';
      args.push(`orderBy: { ${state.orderBy.field}: { order: ${dir} } }`);
    }
    return args.length ? `(${args.join(', ')})` : '';
  }

  function composeSelection(fields) {
    const arr = Array.isArray(fields) && fields.length ? fields : ['Id'];
    return arr
      .map((f) => f.trim())
      .filter(Boolean)
      .map((name) => {
        if (!name || name.toLowerCase() === 'id') return 'Id';
        return `${name} { value }`;
      })
      .join(' ');
  }

  /**
   * Compose related object query part for composite queries.
   * Handles both lookup (parent) relationships and child relationships differently:
   * - Lookup/Parent relationships: Direct object selection (no edges/node)
   * - Child relationships: Connection with edges/node pattern
   *
   * @param {Object} relatedObj - Related object config { relationship, fields, isLookup }
   * @returns {string} GraphQL selection string
   */
  function composeRelatedObjectSelection(relatedObj) {
    if (!relatedObj || !relatedObj.relationship) return '';
    const fields = Array.isArray(relatedObj.fields) && relatedObj.fields.length
      ? relatedObj.fields
      : ['Id'];
    const selection = fields
      .map((f) => f.trim())
      .filter(Boolean)
      .map((name) => {
        if (!name || name.toLowerCase() === 'id') return 'Id';
        return `${name} { value }`;
      })
      .join(' ');

    // Lookup (parent) relationships should NOT use edges/node pattern
    // They are single objects, not connections
    if (relatedObj.isLookup === true) {
      return `${relatedObj.relationship} { ${selection} }`;
    }

    // Child relationships use the connection pattern with edges/node
    return `${relatedObj.relationship} { edges { node { ${selection} } } }`;
  }

  function composeQueryFromBuilder(state) {
    const obj = String(state?.object || '').trim();
    if (!obj) return '';
    const args = composeArgs(state || {});

    // Get related object relationship names to exclude from regular fields
    const relatedRelationships = new Set(
      (state?.relatedObjects || []).map(r => r.relationship).filter(Boolean)
    );

    // Filter out fields that are also related objects to prevent duplicates
    const filteredFields = (state?.fields || []).filter(f => !relatedRelationships.has(f));
    const selection = composeSelection(filteredFields.length ? filteredFields : ['Id']);

    // Add related objects for composite query
    const relatedSelections = (state?.relatedObjects || [])
      .map(composeRelatedObjectSelection)
      .filter(Boolean)
      .join(' ');

    const fullSelection = relatedSelections
      ? `${selection} ${relatedSelections}`
      : selection;

    const pageInfo = state?.includePageInfo === false ? '' : ' pageInfo { endCursor hasNextPage }';
    return `query { uiapi { query { ${obj}${args} { edges { node { ${fullSelection} } }${pageInfo} } } } }`;
  }

  function parseWhereClause(raw) {
    const filters = [];
    const body = raw.replace(/^\{\s*|\s*\}$/g, '').trim();
    if (!body) return filters;
    const parts = [];
    const clauseRe = /([A-Za-z0-9_.`"]+\s*:\s*\{[^}]*\})/g;
    let m;
    while ((m = clauseRe.exec(body))) {
      if (m[1]) parts.push(m[1].trim());
    }
    parts.forEach((part) => {
      const m = part.match(/^([A-Za-z0-9_.`"]+)\s*:\s*\{\s*([^}]+)\s*\}$/);
      if (!m) return;
      const field = m[1].replace(/[`"]/g, '');
      const inner = m[2].trim();
      const kv = inner.match(/^([a-zA-Z]+)\s*:\s*(.+)$/);
      if (!kv) return;
      const opToken = kv[1].toLowerCase();
      const valRaw = kv[2].trim();
      const opMap = { eq: '=', neq: '!=', gt: '>', gte: '>=', lt: '<', lte: '<=', like: 'LIKE', in: 'IN' };
      const op = opMap[opToken] || '=';
      let value = valRaw;
      if (op === 'IN') {
        const listMatch = valRaw.match(/^\[(.*)\]$/);
        const listStr = listMatch ? listMatch[1] : valRaw;
        let arr = [];
        try { const parsed = JSON.parse(`[${listStr}]`); if (Array.isArray(parsed)) arr = parsed; } catch {}
        if (!arr.length) arr = listStr.split(/,(?=(?:[^"\\]|\\.)*$)/).map((v) => v.trim().replace(/^"|"$/g, '')).filter(Boolean);
        value = arr.join(', ');
      } else {
        value = valRaw.replace(/^"|"$/g, '');
      }
      filters.push({ id: uid(), field, op, value });
    });
    return filters;
  }

  function tryImportQueryToBuilder(q) {
    const src = String(q || '').trim();
    if (!src) return;
    let uiapiMatch = src.match(/uiapi\s*\{\s*query\s*\{\s*([A-Za-z0-9_.`"]+)\s*(\(([^)]*)\))?\s*\{/i);
    let selectionMatch = null;
    if (uiapiMatch) {
      const nodePageMatch = src.match(/node\s*\{\s*([\s\S]*?)\}\s*\}\s*(pageInfo|\}\s*\}\s*\}\s*\})/i);
      const nodeMatch = nodePageMatch || src.match(/node\s*\{\s*([\s\S]*?)\}\s*\}\s*\}\s*\}\s*\}/i);
      if (nodeMatch && nodeMatch[1]) selectionMatch = [null, nodeMatch[1]];
    }
    let objMatch = uiapiMatch;
    if (!uiapiMatch) {
      objMatch = src.match(/query\s*\{\s*([A-Za-z0-9_.`"]+)\s*(\(([^)]*)\))?\s*\{/i);
      selectionMatch = src.match(/[A-Za-z0-9_.`"]+\s*(?:\([^)]*\))?\s*\{\s*([^{}]+)\s*\}\s*\}$/);
    }
    if (!objMatch) return;
    builderState.object = objMatch[1].replace(/[`"]/g, '');
    const argStr = objMatch[3] || '';
    if (argStr) {
      const whereMatch = argStr.match(/where\s*:\s*(\{[^)]*\})/i);
      if (whereMatch && whereMatch[1]) builderState.filters = parseWhereClause(whereMatch[1]); else builderState.filters = [];
      const orderFieldDir = argStr.match(/orderBy\s*:\s*\{\s*field\s*:\s*([^,\s]+)\s*,\s*direction\s*:\s*(ASC|DESC)\s*\}/i);
      const orderWithKey = argStr.match(/orderBy\s*:\s*\{\s*([A-Za-z0-9_.`"]+)\s*:\s*\{\s*order\s*:\s*(ASC|DESC)\s*\}\s*\}/i);
      if (orderWithKey && orderWithKey[1]) builderState.orderBy = { field: orderWithKey[1].replace(/[`"]/g, ''), dir: (orderWithKey[2] || 'asc').toLowerCase() === 'desc' ? 'desc' : 'asc' };
      else if (orderFieldDir && orderFieldDir[1]) builderState.orderBy = { field: orderFieldDir[1].replace(/[`"]/g, ''), dir: (orderFieldDir[2] || 'asc').toLowerCase() === 'desc' ? 'desc' : 'asc' };
      const firstMatch = argStr.match(/first\s*:\s*(\d+)/i);
      if (firstMatch && firstMatch[1]) builderState.limit = Number(firstMatch[1]);
      const offsetMatch = argStr.match(/offset\s*:\s*(\d+)/i);
      if (offsetMatch && offsetMatch[1]) builderState.offset = Number(offsetMatch[1]);
      const afterMatch = argStr.match(/after\s*:\s*"?([^"\s]+)"?/i);
      if (afterMatch && afterMatch[1]) builderState.after = afterMatch[1];
    }
    if (selectionMatch && selectionMatch[1]) {
      // Parse fields more carefully to handle related objects
      const rawSelection = selectionMatch[1];
      const simpleFields = [];
      const relatedObjects = [];

      // More robust related object parsing
      // Pattern: Name { edges { node { ...fields... } } }
      // We need to find all occurrences of: Word { edges { node { ... } } }

      // First, find all potential related objects by looking for pattern: word { edges
      const relatedPattern = /(\w+)\s*\{\s*edges\s*\{/g;
      let match;
      const relatedNames = [];
      while ((match = relatedPattern.exec(rawSelection)) !== null) {
        relatedNames.push(match[1]);
      }

      // For each related object name, extract its fields
      relatedNames.forEach(relName => {
        // Find the start of this related object
        const startPattern = new RegExp(relName + '\\s*\\{\\s*edges\\s*\\{\\s*node\\s*\\{');
        const startMatch = startPattern.exec(rawSelection);
        if (startMatch) {
          const startIdx = startMatch.index + startMatch[0].length;
          // Find the matching closing braces - count braces to find the end
          let braceCount = 1;
          let endIdx = startIdx;
          for (let i = startIdx; i < rawSelection.length && braceCount > 0; i++) {
            if (rawSelection[i] === '{') braceCount++;
            else if (rawSelection[i] === '}') braceCount--;
            endIdx = i;
          }
          // Extract the fields inside the node
          const nodeContent = rawSelection.substring(startIdx, endIdx).trim();
          const relFields = [];
          // Parse field names from node content
          const fieldPattern = /(\w+)(?:\s*\{\s*value\s*\})?/g;
          let fieldMatch;
          while ((fieldMatch = fieldPattern.exec(nodeContent)) !== null) {
            const fn = fieldMatch[1];
            if (fn && fn !== 'value' && fn !== 'edges' && fn !== 'node' && fn !== 'pageInfo') {
              relFields.push(fn);
            }
          }
          if (relFields.length) {
            relatedObjects.push({
              id: uid(),
              relationship: relName,
              fields: relFields
            });
          }
        }
      });

      // Now parse simple fields (not part of related objects)
      // Remove related object blocks first
      let cleanedSelection = rawSelection;
      relatedNames.forEach(relName => {
        // Remove the entire related object block
        const pattern = new RegExp(relName + '\\s*\\{[^}]*edges[^}]*\\{[^}]*node[^}]*\\{[^}]*\\}[^}]*\\}[^}]*\\}', 'g');
        cleanedSelection = cleanedSelection.replace(pattern, ' ');
      });

      // Also do a simpler removal for any remaining edges/node patterns
      cleanedSelection = cleanedSelection.replace(/\w+\s*\{\s*edges\s*\{[\s\S]*?\}\s*\}\s*\}/g, ' ');

      // Remove { value } wrappers and extract field names
      cleanedSelection = cleanedSelection.replace(/\{\s*value\s*\}/g, '').replace(/\s+/g, ' ').trim();
      const fieldTokens = cleanedSelection.split(/\s+/).filter(Boolean);
      fieldTokens.forEach(token => {
        // Skip tokens that are just braces, keywords, or related object names
        if (token === '{' || token === '}' || token === 'edges' || token === 'node' || token === 'value' || token === 'pageInfo') return;
        if (relatedNames.includes(token)) return; // Skip related object names
        // Only keep valid field names
        if (/^[A-Za-z_][A-Za-z0-9_]*(__c)?$/.test(token)) {
          simpleFields.push(token);
        }
      });

      builderState.fields = simpleFields.length ? simpleFields : ['Id'];
      builderState.relatedObjects = relatedObjects;
    }
  }

  function saveBuilderState() {
    try { chrome.storage?.local?.set?.({ graphqlBuilderState: builderState }); } catch {}
  }
  function loadBuilderState() {
    return new Promise((resolve) => {
      try {
        chrome.storage?.local?.get?.({ graphqlBuilderState: null }, (r) => {
          const stored = r?.graphqlBuilderState;
          if (stored && typeof stored === 'object') {
            builderState = cloneBuilderState(stored);
          }
          resolve();
        });
      } catch { resolve(); }
    });
  }

  function cloneBuilderState(src) {
    const merged = { ...defaultBuilderState(), ...(src || {}) };
    return JSON.parse(JSON.stringify(merged));
  }

  function setBuilderStatus(msg) { if (builderStatus) builderStatus.textContent = msg || ''; }

  function setBuilderVisibility(enabled) {
    if (builderPanel) builderPanel.hidden = !enabled;
    // Toggle builder left panel visibility
    const leftPanel = document.getElementById('graphql-builder-panel');
    if (leftPanel) {
      if (enabled) {
        leftPanel.classList.remove('hidden');
      } else {
        leftPanel.classList.add('hidden');
      }
    }
    if (!enabled) setBuilderStatus('Builder disabled. Toggle to enable.');
    else setBuilderStatus('Builder ready');
  }

  // Tab switching functionality
  // Wire up draggable splitters
  function wireSplitters() {
    const verticalSplitter = document.getElementById('graphql-splitter');
    const horizontalSplitter = document.getElementById('graphql-splitter-h');
    const container = document.querySelector('.graphql-split-container');
    const sideSection = document.querySelector('.graphql-side-sections');
    const variablesSection = document.querySelector('.graphql-variables-section');
    const resultsSection = document.querySelector('.graphql-results-right-section');

    if (!verticalSplitter || !container) return;

    // Vertical splitter (resize Query vs Variables/Results)
    let isResizingVertical = false;
    let startX = 0;
    let startFlex = 0;

    verticalSplitter.addEventListener('mousedown', (e) => {
      isResizingVertical = true;
      startX = e.clientX;

      const querySection = document.querySelector('.graphql-query-section');
      const style = window.getComputedStyle(querySection);
      startFlex = parseFloat(style.flex) || 2;

      verticalSplitter.classList.add('active');
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
    });

    document.addEventListener('mousemove', (e) => {
      if (!isResizingVertical) return;

      const querySection = document.querySelector('.graphql-query-section');
      const sideSection = document.querySelector('.graphql-side-sections');
      const diff = e.clientX - startX;
      const containerWidth = container.clientWidth;

      // Calculate new flex ratios
      const newQueryFlex = Math.max(1, startFlex + (diff / (containerWidth / 3)));
      const newSideFlex = Math.max(0.5, 3 - newQueryFlex);

      querySection.style.flex = newQueryFlex;
      sideSection.style.flex = newSideFlex;
    });

    document.addEventListener('mouseup', () => {
      if (!isResizingVertical) return;
      isResizingVertical = false;
      verticalSplitter.classList.remove('active');
      document.body.style.cursor = 'auto';
      document.body.style.userSelect = 'auto';
    });

    // Horizontal splitter (resize Variables vs Results)
    if (horizontalSplitter) {
      let isResizingHorizontal = false;
      let startY = 0;
      let startVariablesFlex = 0;

      horizontalSplitter.addEventListener('mousedown', (e) => {
        isResizingHorizontal = true;
        startY = e.clientY;

        const style = window.getComputedStyle(variablesSection);
        startVariablesFlex = parseFloat(style.flex) || 1;

        horizontalSplitter.classList.add('active');
        document.body.style.cursor = 'row-resize';
        document.body.style.userSelect = 'none';
      });

      document.addEventListener('mousemove', (e) => {
        if (!isResizingHorizontal) return;

        const diff = e.clientY - startY;
        const sectionHeight = sideSection.clientHeight;

        // Calculate new flex ratios
        const newVariablesFlex = Math.max(0.3, startVariablesFlex + (diff / (sectionHeight / 1.5)));
        const newResultsFlex = Math.max(0.3, 1.5 - newVariablesFlex);

        variablesSection.style.flex = newVariablesFlex;
        resultsSection.style.flex = newResultsFlex;
      });

      document.addEventListener('mouseup', () => {
        if (!isResizingHorizontal) return;
        isResizingHorizontal = false;
        horizontalSplitter.classList.remove('active');
        document.body.style.cursor = 'auto';
        document.body.style.userSelect = 'auto';
      });
    }
  }

  // Update endpoint display
  function updateEndpointDisplay() {
    const endpointUrl = document.getElementById('graphql-endpoint-url');
    const endpointObject = document.getElementById('graphql-endpoint-object');
    const bodySize = document.getElementById('graphql-body-size');

    if (endpointUrl && queryEl) {
      const query = queryEl.value || '';
      const vars = variablesEl?.value || '{}';
      const bodyObj = { query, variables: JSON.parse(vars || '{}') };
      const bodySizeBytes = JSON.stringify(bodyObj).length;

      endpointUrl.textContent = '/services/data/v63.0/graphql';
      if (bodySize) bodySize.textContent = `${bodySizeBytes} bytes`;
    }

    if (endpointObject) {
      endpointObject.textContent = graphqlUIState.selectedObject || '-';
    }
  }

  function renderFieldChips() {
    if (!fieldChips) return;
    fieldChips.innerHTML = '';
    (builderState.fields || []).forEach((f) => {
      const chip = document.createElement('div');
      chip.className = 'chip';
      chip.textContent = f;
      const rm = document.createElement('button');
      rm.className = 'remove';
      rm.type = 'button';
      rm.textContent = '×';
      rm.addEventListener('click', () => {
        builderState.fields = (builderState.fields || []).filter((x) => x !== f);
        handleBuilderChange({ writeQuery: true });
      });
      chip.appendChild(rm);
      fieldChips.appendChild(chip);
    });
  }

  /**
   * Get tooltip description for a filter operator (Issue 12)
   * @param {string} op - The operator symbol
   * @returns {string} Human-readable description with examples
   */
  function getFilterOperatorTooltip(op) {
    const tooltips = {
      '=': 'Equals - exact match (e.g., Name = "Acme")',
      '!=': 'Not equals - excludes exact match',
      '>': 'Greater than (for numbers/dates)',
      '>=': 'Greater than or equal to',
      '<': 'Less than (for numbers/dates)',
      '<=': 'Less than or equal to',
      'LIKE': 'Pattern match using % wildcard (e.g., "Acme%" matches "Acme Corp")',
      'IN': 'Matches any value in comma-separated list (e.g., "A, B, C")',
      'NOT IN': 'Excludes values in comma-separated list',
      'IS NULL': 'Field has no value (empty)',
      'IS NOT NULL': 'Field has any value (not empty)'
    };
    return tooltips[op] || op;
  }

  /**
   * Check if a filter row has validation errors (Issue 11)
   * @param {Object} filter - Filter object {field, op, value}
   * @returns {Object} {hasError: boolean, errorMessage: string}
   */
  function validateFilterRow(filter) {
    const field = (filter?.field || '').trim();
    const op = (filter?.op || '').trim();
    const val = filter?.value ?? '';
    const isNullOp = op === 'IS NULL' || op === 'IS NOT NULL';

    if (!field) {
      return { hasError: true, errorMessage: 'Field name is required' };
    }
    if (!op) {
      return { hasError: true, errorMessage: 'Operator is required' };
    }
    // IS NULL / IS NOT NULL don't need a value
    if (!isNullOp && val === '' && op !== '') {
      return { hasError: true, errorMessage: 'Value is required for this operator' };
    }
    return { hasError: false, errorMessage: '' };
  }

  function renderFilters() {
    // Ensure filterContainer is available
    if (!filterContainer) {
      filterContainer = document.getElementById('graphql-builder-filters');
    }

    if (!filterContainer) {
      console.warn('[GraphQL] renderFilters: filterContainer not found');
      return;
    }

    console.log('[GraphQL] renderFilters called, filters count:', (builderState.filters || []).length);

    // Get currently focused element info before clearing
    const activeEl = document.activeElement;
    let focusInfo = null;
    if (activeEl && filterContainer.contains(activeEl)) {
      const row = activeEl.closest('.filter-row');
      if (row) {
        const rows = Array.from(filterContainer.querySelectorAll('.filter-row'));
        const rowIndex = rows.indexOf(row);
        const inputType = activeEl.tagName === 'SELECT' ? 'select' :
                         (activeEl.placeholder === 'Field' ? 'field' : 'value');
        const cursorPos = activeEl.selectionStart;
        focusInfo = { rowIndex, inputType, cursorPos };
      }
    }

    filterContainer.innerHTML = '';
    (builderState.filters || []).forEach((f, idx) => {
      const row = document.createElement('div');
      row.className = 'filter-row';
      row.dataset.filterId = f.id;

      // Issue 11: Add per-field validation error badges
      const validation = validateFilterRow(f);
      if (validation.hasError) {
        row.classList.add('filter-error');
        row.setAttribute('data-error', validation.errorMessage);
      }

      const field = document.createElement('input');
      field.value = f.field || '';
      field.placeholder = 'Field';
      field.setAttribute('list', 'graphql-builder-field-list');
      field.className = 'filter-field-input';
      // Add error styling if field is empty
      if (!(f.field || '').trim()) {
        field.classList.add('input-error');
      }

      const op = document.createElement('select');
      op.className = 'filter-op-select';
      // Issue 12: Add operator tooltips with descriptions
      ['=', '!=', '>', '>=', '<', '<=', 'LIKE', 'IN', 'NOT IN', 'IS NULL', 'IS NOT NULL'].forEach((o) => {
        const opt = document.createElement('option');
        opt.value = o;
        opt.textContent = o;
        opt.title = getFilterOperatorTooltip(o); // Add tooltip to each option
        op.appendChild(opt);
      });
      op.value = f.op || '=';
      op.title = getFilterOperatorTooltip(f.op || '='); // Tooltip on select itself

      const val = document.createElement('input');
      val.placeholder = 'Value';
      val.value = f.value || '';

      const rm = document.createElement('button');
      rm.type = 'button';
      rm.className = 'icon-btn btn-sm filter-remove';
      rm.textContent = '✕';

      // Use debounced update to avoid losing focus during typing
      let updateTimeout = null;
      const debouncedUpdate = () => {
        clearTimeout(updateTimeout);
        updateTimeout = setTimeout(() => {
          writeQueryFromBuilder();
          saveBuilderState();
        }, 300);
      };

      // Function to show/hide value input based on operator
      const updateValueVisibility = () => {
        const isNullOp = op.value === 'IS NULL' || op.value === 'IS NOT NULL';
        val.style.display = isNullOp ? 'none' : '';
        val.placeholder = isNullOp ? '' : 'Value';
        if (isNullOp) {
          val.value = '';
          f.value = '';
        }
      };

      // Initialize visibility
      updateValueVisibility();

      field.addEventListener('input', () => {
        f.field = field.value;
        debouncedUpdate();
      });
      op.addEventListener('change', () => {
        f.op = op.value;
        op.title = getFilterOperatorTooltip(op.value); // Update tooltip on change
        updateValueVisibility();
        writeQueryFromBuilder();
        saveBuilderState();
      });
      val.addEventListener('input', () => {
        f.value = val.value;
        debouncedUpdate();
      });
      rm.addEventListener('click', () => {
        builderState.filters = (builderState.filters || []).filter((x) => x.id !== f.id);
        handleBuilderChange({ writeQuery: true });
      });

      row.appendChild(field); row.appendChild(op); row.appendChild(val); row.appendChild(rm);
      filterContainer.appendChild(row);

      // Restore focus if this was the focused row
      if (focusInfo && focusInfo.rowIndex === idx) {
        let elToFocus = null;
        if (focusInfo.inputType === 'field') elToFocus = field;
        else if (focusInfo.inputType === 'select') elToFocus = op;
        else if (focusInfo.inputType === 'value') elToFocus = val;

        if (elToFocus) {
          elToFocus.focus();
          if (focusInfo.cursorPos !== undefined && elToFocus.setSelectionRange) {
            try { elToFocus.setSelectionRange(focusInfo.cursorPos, focusInfo.cursorPos); } catch {}
          }
        }
      }
    });
  }

  function renderOrder() {
    if (orderFieldInput) orderFieldInput.value = builderState.orderBy?.field || '';
    if (orderDirSel) orderDirSel.value = builderState.orderBy?.dir || 'asc';
  }

  // Store current object's full field metadata for rich display
  let currentObjectFieldsMetadata = [];

  // Render field list options with filtering of GraphQL wrappers
  function renderFieldListOptions(fields, fieldsMeta = []) {
    if (!fieldList) return;
    fieldList.innerHTML = '';

    // Filter out GraphQL wrapper fields
    const filteredFields = filterOutGraphQLWrappers(fields);

    // Sort with Id and Name at the top
    const sortedFields = [...filteredFields].sort((a, b) => {
      const aName = typeof a === 'string' ? a : a?.name || '';
      const bName = typeof b === 'string' ? b : b?.name || '';
      // Pin Id and Name to top
      if (aName === 'Id') return -1;
      if (bName === 'Id') return 1;
      if (aName === 'Name') return -1;
      if (bName === 'Name') return 1;
      return aName.localeCompare(bName);
    });

    sortedFields.forEach((field) => {
      const name = typeof field === 'string' ? field : field?.name;
      if (!name) return;

      const opt = document.createElement('option');
      opt.value = name;

      // Add type info to option label if we have metadata
      const meta = fieldsMeta.find(f => f.name === name);
      if (meta && meta.type) {
        opt.textContent = `${name} (${meta.type})`;
      } else {
        opt.textContent = name;
      }

      fieldList.appendChild(opt);
    });
  }

  async function refreshBuilderFields(objectName) {
    const obj = String(objectName || '').trim();
    if (!obj) {
      renderFieldListOptions([]);
      currentObjectFieldsMetadata = [];
      fieldFilterTerm = ''; // Clear field filter when no object
      return;
    }

    const desc = await getSobjectDescribeCached(obj);

    // Extract full field metadata (name, type, label, referenceTo)
    const fieldsMeta = Array.isArray(desc?.fields) ? desc.fields.map((f) => ({
      name: f.name || '',
      label: f.label || f.name || '',
      type: f.type || 'Unknown',
      isCustom: isCustomField(f.name || ''),
      referenceTo: Array.isArray(f.referenceTo) ? f.referenceTo : []
    })).filter(f => f.name && !isGraphQLWrapperField(f.name)) : [];

    // Sort with Id and Name pinned to top
    fieldsMeta.sort((a, b) => {
      if (a.name === 'Id') return -1;
      if (b.name === 'Id') return 1;
      if (a.name === 'Name') return -1;
      if (b.name === 'Name') return 1;
      return a.name.localeCompare(b.name);
    });

    currentObjectFieldsMetadata = fieldsMeta;

    // Get just the names for the datalist
    const fieldNames = fieldsMeta.map(f => f.name);
    renderFieldListOptions(fieldNames, fieldsMeta);

    // Clear field filter when switching objects
    fieldFilterTerm = '';
    const fieldSearchInput = document.getElementById('graphql-builder-field-search');
    if (fieldSearchInput) fieldSearchInput.value = '';

    // Also populate related object relationships
    await populateRelatedObjectOptions(desc);
  }

  // Populate related object dropdown with child relationships
  async function populateRelatedObjectOptions(describe) {
    const relatedSelect = document.getElementById('graphql-builder-related-select');
    if (!relatedSelect) return;

    relatedSelect.innerHTML = '<option value="">-- Select relationship --</option>';

    if (!describe) return;

    // Get child relationships
    const childRelationships = describe.childRelationships || [];
    const validRelationships = childRelationships
      .filter(r => r.relationshipName && r.childSObject)
      .sort((a, b) => (a.relationshipName || '').localeCompare(b.relationshipName || ''));

    validRelationships.forEach(rel => {
      const opt = document.createElement('option');
      opt.value = rel.relationshipName;
      opt.textContent = `${rel.relationshipName} (${rel.childSObject})`;
      opt.dataset.childObject = rel.childSObject;
      relatedSelect.appendChild(opt);
    });

    // Also add lookup relationships (parent objects)
    const lookupFields = (describe.fields || [])
      .filter(f => f.type === 'reference' && f.relationshipName && f.referenceTo?.length)
      .sort((a, b) => (a.relationshipName || '').localeCompare(b.relationshipName || ''));

    if (lookupFields.length > 0) {
      const optGroup = document.createElement('optgroup');
      optGroup.label = 'Lookup (Parent) Objects';
      lookupFields.forEach(field => {
        const opt = document.createElement('option');
        opt.value = field.relationshipName;
        opt.textContent = `${field.relationshipName} (${field.referenceTo[0]})`;
        opt.dataset.childObject = field.referenceTo[0];
        opt.dataset.isLookup = 'true';
        optGroup.appendChild(opt);
      });
      relatedSelect.appendChild(optGroup);
    }
  }

  // Render related objects chips
  function renderRelatedObjects() {
    const container = document.getElementById('graphql-builder-related-objects');
    if (!container) return;

    container.innerHTML = '';

    const relatedObjects = builderState.relatedObjects || [];

    if (relatedObjects.length === 0) {
      // Show empty state
      container.innerHTML = `
        <div class="related-empty-state">
          <span class="empty-icon">📭</span>
          <span class="empty-text">No related objects. Add child records or parent lookups.</span>
        </div>
      `;
      return;
    }

    relatedObjects.forEach((rel, idx) => {
      const chip = document.createElement('div');
      chip.className = 'related-object-chip';
      chip.innerHTML = `
        <div class="related-header">
          <span class="related-name">🔗 ${Utils.escapeHtml(rel.relationship)}</span>
          <span class="related-fields">(${Utils.escapeHtml((rel.fields || []).join(', '))})</span>
        </div>
        <button class="remove" type="button" title="Remove">×</button>
      `;
      chip.querySelector('.remove').addEventListener('click', () => {
        builderState.relatedObjects = (builderState.relatedObjects || []).filter((_, i) => i !== idx);
        handleBuilderChange({ writeQuery: true });
        setBuilderStatus(`Removed ${rel.relationship} from query`);
      });
      container.appendChild(chip);
    });
  }

  /**
   * Update section count badges in collapsible headers
   */
  function updateSectionCounts() {
    // Fields count
    const fieldsCount = document.getElementById('fields-count');
    if (fieldsCount) {
      const count = (builderState.fields || []).length;
      fieldsCount.textContent = `(${count})`;
    }

    // Filters count
    const filtersCount = document.getElementById('filters-count');
    if (filtersCount) {
      const count = (builderState.filters || []).filter(f => f.field && f.field.trim()).length;
      filtersCount.textContent = `(${count})`;
    }

    // Related objects count
    const relatedCount = document.getElementById('related-count');
    if (relatedCount) {
      const count = (builderState.relatedObjects || []).length;
      relatedCount.textContent = `(${count})`;
    }
  }

  /**
   * Sync pagination UI inputs with builderState (two-way sync)
   */
  function syncPaginationUI() {
    if (limitInput && builderState.limit !== undefined) {
      limitInput.value = builderState.limit;
    }
    if (offsetInput && builderState.offset !== undefined) {
      offsetInput.value = builderState.offset;
    }
    if (afterInput) {
      afterInput.value = builderState.after || '';
    }
  }

  function syncBuilderUi(opts = {}) {
    const { loadFields = false } = opts;
    setBuilderVisibility(!!builderState.enabled);
    renderFieldChips();
    renderFilters();
    renderOrder();
    renderRelatedObjects();
    updateSectionCounts();
    syncPaginationUI();
    if (loadFields) refreshBuilderFields(builderState.object);
  }

  function writeQueryFromBuilder() {
    if (!builderState.enabled || !queryEl) return;
    const q = composeQueryFromBuilder(builderState);
    if (!q) { setBuilderStatus('Select an object to build a query.'); return; }

    // Auto-format the generated query for better readability
    const formattedQuery = formatGraphQL(q);

    // Set flag to prevent circular import
    isWritingQueryFromBuilder = true;
    queryEl.value = formattedQuery;

    // Update endpoint display
    updateEndpointDisplay();
    try { queryEl.dispatchEvent(new Event('input', { bubbles: true })); } catch {}

    // Reset flag after a short delay to allow event to propagate
    setTimeout(() => { isWritingQueryFromBuilder = false; }, 50);
  }

  function getLimitOffsetValues() {
    const lim = Number(limitInput?.value || builderState.limit || 0);
    const off = Number(offsetInput?.value || 0);
    const after = (afterInput?.value || '').trim();
    return { limit: Number.isFinite(lim) && lim > 0 ? lim : 50, offset: Number.isFinite(off) && off >= 0 ? off : 0, after };
  }

  /**
   * Validate builder state and return validation issues
   * @returns {Array<string>} Array of validation warning messages
   */
  function validateBuilderState() {
    const warnings = [];

    // Check for duplicate field filters (potential issue)
    const filterFields = (builderState.filters || [])
      .map(f => (f?.field || '').trim())
      .filter(Boolean);
    const fieldCounts = {};
    filterFields.forEach(f => { fieldCounts[f] = (fieldCounts[f] || 0) + 1; });
    const duplicateFields = Object.entries(fieldCounts)
      .filter(([_, count]) => count > 1)
      .map(([field]) => field);
    if (duplicateFields.length > 0) {
      warnings.push(`Multiple filters on: ${duplicateFields.join(', ')} (using AND grouping)`);
    }

    // Check for incomplete filters
    const incompleteFilters = (builderState.filters || []).filter(f => {
      const field = (f?.field || '').trim();
      const op = (f?.op || '').trim();
      const val = f?.value ?? '';
      // IS NULL / IS NOT NULL don't need a value
      if (op === 'IS NULL' || op === 'IS NOT NULL') {
        return !field;
      }
      return !field || !op;
    });
    if (incompleteFilters.length > 0) {
      warnings.push(`${incompleteFilters.length} incomplete filter(s)`);
    }

    // Check orderBy field type if metadata available
    if (builderState.orderBy?.field && currentObjectFieldsMetadata?.length) {
      const orderField = currentObjectFieldsMetadata.find(
        f => f.name === builderState.orderBy.field
      );
      if (orderField && (orderField.type === 'textarea' || orderField.type === 'base64')) {
        warnings.push(`Warning: ${orderField.name} (${orderField.type}) may not be sortable`);
      }
    }

    return warnings;
  }

  function handleBuilderChange(opts = {}) {
    const { writeQuery = true, loadFields = false } = opts;
    const { limit, offset, after } = getLimitOffsetValues();
    builderState.limit = limit;
    builderState.offset = offset;
    builderState.after = after;

    // Validate and build status message
    if (!builderState.object) {
      setBuilderStatus('Select an object to build a query.');
    } else if (!builderState.fields.length) {
      setBuilderStatus('Add at least one field.');
    } else {
      // Check for validation warnings
      const warnings = validateBuilderState();
      if (warnings.length > 0) {
        setBuilderStatus(`⚠️ ${warnings[0]}`);
      } else {
        setBuilderStatus('✓ Builder ready');
      }
    }

    syncBuilderUi({ loadFields });
    if (writeQuery) {
      writeQueryFromBuilder();
      // Update run button state after writing query
      updateRunButtonState();
    }
    saveBuilderState();

    // Update UI elements for Results & Export UX (Issues 18-20)
    updateBuilderSectionCounts();
    updateQueryStatusBadge();
    updateVisualSummary();
  }

  function addFieldFromInput() {
    const val = (fieldInput?.value || '').trim();
    if (!val) return;
    if (!builderState.fields.includes(val)) builderState.fields.push(val);
    fieldInput.value = '';
    handleBuilderChange({ writeQuery: true });
  }

  function addFilterRow() {
    console.log('[GraphQL] addFilterRow called, current filters:', builderState.filters?.length || 0);
    builderState.filters = builderState.filters || [];
    const newFilter = { id: uid(), field: '', op: '=', value: '' };
    builderState.filters.push(newFilter);
    console.log('[GraphQL] Added new filter, total:', builderState.filters.length);

    // Ensure filterContainer is available
    if (!filterContainer) {
      filterContainer = document.getElementById('graphql-builder-filters');
      console.log('[GraphQL] filterContainer re-queried:', !!filterContainer);
    }

    handleBuilderChange({ writeQuery: true });
  }

  async function writeAutoTemplateForObject(objectName) {
    if (!queryEl) return;
    const obj = String(objectName || '').trim();
    if (!obj) return;
    const { limit, offset, after } = getLimitOffsetValues();
    const desc = await getSobjectDescribeCached(obj);
    const fieldNames = Array.isArray(desc?.fields) ? desc.fields.map((f) => f.name).filter(Boolean) : [];
    const preferred = [];
    if (fieldNames.includes('Name')) preferred.push('Name');
    fieldNames.forEach((f) => { if (preferred.length < 3 && f !== 'Id' && f !== 'Name') preferred.push(f); });
    const fields = ['Id', ...preferred].slice(0, 3).map((f) => f === 'Id' ? 'Id' : `${f} { value }`).join(' ');
    const argsParts = [`first: ${limit}`];
    if (offset > 0) argsParts.push(`offset: ${offset}`);
    if (after) argsParts.push(`after: "${after}"`);
    const args = argsParts.length ? `(${argsParts.join(', ')})` : '';
    const template = `query { uiapi { query { ${obj}${args} { edges { node { ${fields} } } pageInfo { endCursor hasNextPage } } } } }`;

    // Auto-format the generated template for better readability
    const formattedTemplate = formatGraphQL(template);
    queryEl.value = formattedTemplate;

    try { queryEl.dispatchEvent(new Event('input', { bubbles: true })); } catch {}
    // Update run button state after writing template
    updateRunButtonState();
  }

  function bindEvents() {
    on(refreshObjectsBtn, 'click', async () => {
      const { names } = await getDescribeCached();
      populateObjects(names);
    });
    on(objectSelect, 'change', async () => {
      builderState.object = objectSelect.value || '';
      builderState.fields = builderState.fields && builderState.fields.length ? builderState.fields : ['Id'];
      builderState.filters = [];
      await refreshBuilderFields(builderState.object);
      if (builderToggle?.checked) handleBuilderChange({ writeQuery: true, loadFields: false });
      else await writeAutoTemplateForObject(builderState.object);
    });

    // Two-way pagination sync (Issue 8)
    on(limitInput, 'input', () => {
      const val = parseInt(limitInput.value, 10);
      builderState.limit = Number.isFinite(val) && val > 0 ? val : 50;
      handleBuilderChange({ writeQuery: true });
    });
    on(offsetInput, 'input', () => {
      const val = parseInt(offsetInput.value, 10);
      builderState.offset = Number.isFinite(val) && val >= 0 ? val : 0;
      handleBuilderChange({ writeQuery: true });
    });
    on(afterInput, 'input', () => {
      builderState.after = (afterInput.value || '').trim();
      handleBuilderChange({ writeQuery: true });
    });

    on(builderToggle, 'change', () => {
      builderState.enabled = !!builderToggle.checked;
      setBuilderVisibility(builderState.enabled);
      if (builderState.enabled) {
        tryImportQueryToBuilder(queryEl?.value);
        handleBuilderChange({ writeQuery: true, loadFields: true });
        updateEndpointDisplay(); // Update endpoint when builder enabled
      } else {
        setBuilderVisibility(false);
      }
      saveBuilderState();
    });
    on(addFieldBtn, 'click', addFieldFromInput);
    on(fieldInput, 'keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); addFieldFromInput(); } });

    // Wire field search input with debounce (Issue 6)
    const fieldSearchInput = document.getElementById('graphql-builder-field-search');
    if (fieldSearchInput) {
      let fieldSearchTimeout = null;
      on(fieldSearchInput, 'input', (e) => {
        clearTimeout(fieldSearchTimeout);
        fieldSearchTimeout = setTimeout(() => {
          handleFieldFilterInput(e.target.value || '');
        }, FILTER_DEBOUNCE_MS);
      });
      // Handle search clear
      on(fieldSearchInput, 'search', (e) => {
        if (!e.target.value) {
          handleFieldFilterInput('');
        }
      });
    }

    // Wire filter logic toggle (AND/OR)
    const filterLogicSelect = document.getElementById('graphql-builder-filter-logic');
    if (filterLogicSelect) {
      filterLogicSelect.value = builderState.filterLogic || 'and';
      on(filterLogicSelect, 'change', () => {
        builderState.filterLogic = filterLogicSelect.value;
        handleBuilderChange({ writeQuery: true });
      });
    }

    // Wire filter button - use multiple approaches to ensure it works
    const wireFilterButton = () => {
      const btn = addFilterBtn || document.getElementById('graphql-builder-add-filter');
      if (btn) {
        // Remove any existing listeners first
        btn.onclick = null;
        btn.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          console.log('[GraphQL] Add filter button clicked');
          addFilterRow();
        });
        console.log('[GraphQL] Filter button wired successfully');
        return true;
      }
      return false;
    };

    // Try to wire immediately
    if (!wireFilterButton()) {
      console.warn('[GraphQL] addFilterBtn not found initially, will retry...');
      // Retry after DOM is fully ready
      setTimeout(wireFilterButton, 100);
      setTimeout(wireFilterButton, 500);
    }

    // Also use event delegation as a fallback
    document.addEventListener('click', (e) => {
      if (e.target && (e.target.id === 'graphql-builder-add-filter' || e.target.closest('#graphql-builder-add-filter'))) {
        e.preventDefault();
        e.stopPropagation();
        console.log('[GraphQL] Add filter button clicked (via delegation)');
        addFilterRow();
      }
    }, true);

    // Issue 14: Unsortable field types
    const UNSORTABLE_TYPES = ['textarea', 'base64', 'blob', 'encryptedstring'];

    /**
     * Check if a field is sortable based on its type (Issue 14)
     * @param {string} fieldName - The field name to check
     * @returns {Object} {sortable: boolean, type: string, message: string}
     */
    function isFieldSortable(fieldName) {
      if (!fieldName || !currentObjectFieldsMetadata?.length) {
        return { sortable: true, type: '', message: '' };
      }
      const fieldMeta = currentObjectFieldsMetadata.find(f => f.name === fieldName);
      if (!fieldMeta) {
        return { sortable: true, type: '', message: '' };
      }
      const type = (fieldMeta.type || '').toLowerCase();
      if (UNSORTABLE_TYPES.includes(type)) {
        return {
          sortable: false,
          type: fieldMeta.type,
          message: `${fieldName} (${fieldMeta.type}) cannot be used for sorting`
        };
      }
      return { sortable: true, type: fieldMeta.type, message: '' };
    }

    /**
     * Update order field input validation state (Issue 14)
     */
    function updateOrderFieldValidation() {
      if (!orderFieldInput) return;
      const fieldName = orderFieldInput.value.trim();
      const sortCheck = isFieldSortable(fieldName);

      // Remove previous validation classes
      orderFieldInput.classList.remove('input-error', 'input-warning');
      orderFieldInput.removeAttribute('title');

      if (fieldName && !sortCheck.sortable) {
        orderFieldInput.classList.add('input-warning');
        orderFieldInput.title = sortCheck.message;
        // Update builder status with warning
        setBuilderStatus(`⚠️ ${sortCheck.message}`);
      }
    }

    on(orderFieldInput, 'input', () => {
      const name = orderFieldInput.value.trim();
      builderState.orderBy = name ? { field: name, dir: orderDirSel?.value || 'asc' } : null;
      updateOrderFieldValidation(); // Issue 14: Validate sortability
      handleBuilderChange({ writeQuery: true });
    });
    on(orderDirSel, 'change', () => {
      if (!builderState.orderBy) builderState.orderBy = { field: orderFieldInput?.value || '', dir: orderDirSel.value };
      else builderState.orderBy.dir = orderDirSel.value;
      handleBuilderChange({ writeQuery: true });
    });
    on(clearOrderBtn, 'click', () => { builderState.orderBy = null; handleBuilderChange({ writeQuery: true }); });

    // Related objects event wiring
    const addRelatedBtn = document.getElementById('graphql-builder-add-related');
    const relatedPicker = document.getElementById('graphql-builder-related-picker');
    const relatedSelect = document.getElementById('graphql-builder-related-select');
    const relatedFieldsWrap = document.getElementById('graphql-builder-related-fields-wrap');
    const relatedFieldsInput = document.getElementById('graphql-builder-related-fields-input');
    const relatedAddBtn = document.getElementById('graphql-builder-related-add-btn');

    if (addRelatedBtn && relatedPicker) {
      on(addRelatedBtn, 'click', () => {
        const isVisible = relatedPicker.style.display !== 'none';
        relatedPicker.style.display = isVisible ? 'none' : 'flex';
        if (!isVisible && relatedSelect) {
          relatedSelect.value = '';
          if (relatedFieldsWrap) relatedFieldsWrap.style.display = 'none';
          // Don't pre-fill fields - let user specify what they want
          if (relatedFieldsInput) relatedFieldsInput.value = '';
        }
      });
    }

    if (relatedSelect && relatedFieldsWrap) {
      on(relatedSelect, 'change', async () => {
        const selectedOpt = relatedSelect.options[relatedSelect.selectedIndex];
        if (relatedSelect.value && selectedOpt) {
          relatedFieldsWrap.style.display = 'flex';
          // Don't pre-populate - let user enter their own fields
          // Show placeholder hint instead
          if (relatedFieldsInput) {
            relatedFieldsInput.value = '';
            relatedFieldsInput.placeholder = 'e.g., Id, Name, Email';
          }
          // Focus the input
          if (relatedFieldsInput) relatedFieldsInput.focus();
        } else {
          relatedFieldsWrap.style.display = 'none';
        }
      });
    }

    if (relatedAddBtn) {
      on(relatedAddBtn, 'click', () => {
        const relationship = relatedSelect?.value;
        const fieldsStr = relatedFieldsInput?.value || 'Id';
        if (!relationship) {
          setBuilderStatus('Please select a relationship first');
          return;
        }

        // Get the selected option to check if it's a lookup (parent) relationship
        const selectedOpt = relatedSelect?.options[relatedSelect.selectedIndex];
        const isLookup = selectedOpt?.dataset?.isLookup === 'true';

        const fields = fieldsStr.split(',').map(f => f.trim()).filter(Boolean);
        if (!fields.length) fields.push('Id');

        builderState.relatedObjects = builderState.relatedObjects || [];
        // Check if already added
        const existing = builderState.relatedObjects.find(r => r.relationship === relationship);
        if (existing) {
          existing.fields = fields;
          existing.isLookup = isLookup;
          setBuilderStatus(`Updated ${relationship} fields`);
        } else {
          builderState.relatedObjects.push({
            id: uid(),
            relationship,
            fields,
            isLookup
          });
          setBuilderStatus(`Added ${isLookup ? 'lookup' : 'child'} relationship: ${relationship}`);
        }

        // Auto-remove the relationship from fields array if present (prevents duplicates)
        builderState.fields = (builderState.fields || []).filter(f => f !== relationship);

        // Hide picker and reset
        if (relatedPicker) relatedPicker.style.display = 'none';
        if (relatedSelect) relatedSelect.value = '';
        if (relatedFieldsWrap) relatedFieldsWrap.style.display = 'none';

        handleBuilderChange({ writeQuery: true });
      });
    }

    // Cancel button for related picker
    const relatedCancelBtn = document.getElementById('graphql-builder-related-cancel-btn');
    if (relatedCancelBtn && relatedPicker) {
      on(relatedCancelBtn, 'click', () => {
        relatedPicker.style.display = 'none';
        if (relatedSelect) relatedSelect.value = '';
        if (relatedFieldsWrap) relatedFieldsWrap.style.display = 'none';
      });
    }

    // Auto-format with debounce for manual input/paste
    let formatTimeout;
    on(queryEl, 'input', () => {
      // Skip import if we're programmatically writing from builder (prevents circular updates)
      if (builderToggle?.checked && !isWritingQueryFromBuilder) {
        tryImportQueryToBuilder(queryEl.value);
      }

      // Auto-format after user stops typing (debounced)
      clearTimeout(formatTimeout);
      formatTimeout = setTimeout(() => {
        const currentValue = queryEl.value;
        const formatted = formatGraphQL(currentValue);
        if (formatted && formatted !== currentValue && formatted.trim()) {
          const startPos = queryEl.selectionStart;
          const endPos = queryEl.selectionEnd;
          queryEl.value = formatted;

          // Try to restore cursor position relative to content
          try {
            const ratio = startPos / currentValue.length;
            const newPos = Math.min(Math.round(ratio * formatted.length), formatted.length);
            queryEl.setSelectionRange(newPos, newPos);
          } catch {
            // Fallback: move cursor to end
            queryEl.setSelectionRange(formatted.length, formatted.length);
          }

          // Trigger events for consistency
          try { queryEl.dispatchEvent(new Event('input', { bubbles: true })); } catch {}
        }
      }, 2000); // 2 second delay after user stops typing
    });
    on(pageInfoApplyBtn, 'click', () => {
      if (!lastPageInfo || !lastPageInfo.endCursor || !afterInput) return;
      afterInput.value = lastPageInfo.endCursor;
      handleBuilderChange({ writeQuery: builderToggle?.checked });
    });
    on(pageInfoClearBtn, 'click', () => {
      if (!afterInput) return;
      afterInput.value = '';
      handleBuilderChange({ writeQuery: builderToggle?.checked });
    });
    try { document.addEventListener('graphql-settings-changed', applyObjectSelectorVisibility); } catch {}

    // Wire up Postman-like formatting and tab switching
    wirePostmanFeatures();
  }

// ==================== Postman-like Features ====================

  function wirePostmanFeatures() {
    const formatQueryBtn = document.getElementById('graphql-format-query');
    const copyQueryBtn = document.getElementById('graphql-copy-query');
    const formatVarsBtn = document.getElementById('graphql-format-vars');
    const copyVarsBtn = document.getElementById('graphql-copy-vars');
    const copyResultsBtn = document.getElementById('graphql-copy-results');
    const expandResultsBtn = document.getElementById('graphql-expand-results');

    // Format Query Button
    if (formatQueryBtn && queryEl) {
      on(formatQueryBtn, 'click', () => {
        const formatted = formatGraphQL(queryEl.value);
        if (formatted !== queryEl.value) {
          queryEl.value = formatted;
          showToast('Query formatted ✓');
        }
      });
    }

    // Copy Query Button
    if (copyQueryBtn && queryEl) {
      on(copyQueryBtn, 'click', async () => {
        try {
          await navigator.clipboard.writeText(queryEl.value);
          showToast('Query copied ✓');
        } catch {
          showToast('Copy failed');
        }
      });
    }

    // Format Variables Button
    if (formatVarsBtn && variablesEl) {
      on(formatVarsBtn, 'click', () => {
        const formatted = formatJSON(variablesEl.value);
        if (formatted !== variablesEl.value) {
          variablesEl.value = formatted;
          variablesEl.classList.remove('error');
          variablesEl.classList.add('valid');
          showToast('Variables formatted ✓');
        }
      });
    }

    // Copy Variables Button
    if (copyVarsBtn && variablesEl) {
      on(copyVarsBtn, 'click', async () => {
        try {
          await navigator.clipboard.writeText(variablesEl.value);
          showToast('Variables copied ✓');
        } catch {
          showToast('Copy failed');
        }
      });
    }

    // Copy Results Button
    if (copyResultsBtn && resultsEl) {
      on(copyResultsBtn, 'click', async () => {
        try {
          const text = resultsEl.textContent || '';
          await navigator.clipboard.writeText(text);
          showToast('Results copied ✓');
        } catch {
          showToast('Copy failed');
        }
      });
    }

    // Expand Results Button (toggle pretty print)
    if (expandResultsBtn && resultsEl) {
      let expanded = true;
      on(expandResultsBtn, 'click', () => {
        expanded = !expanded;
        const iconEl = expandResultsBtn.querySelector('.action-icon');
        const labelEl = expandResultsBtn.querySelector('.action-label');
        if (iconEl) iconEl.textContent = expanded ? '⊞' : '⊟';
        if (labelEl) labelEl.textContent = expanded ? 'Expand' : 'Collapse';
        // Re-render results with different spacing
        if (lastGraphQLResult) {
          const pretty = Utils.escapeHtml(JSON.stringify(lastGraphQLResult, null, expanded ? 2 : 0));
          resultsEl.innerHTML = `<span class="log-badge system">OK</span>\n${pretty}`;
        }
      });
    }

    // Keyboard Shortcuts for formatting (Cmd/Ctrl + B)
    if (queryEl) {
      on(queryEl, 'keydown', (e) => {
        // Cmd/Ctrl + B to format
        if ((e.metaKey || e.ctrlKey) && e.key === 'b') {
          e.preventDefault();
          const formatted = formatGraphQL(queryEl.value);
          if (formatted !== queryEl.value) {
            queryEl.value = formatted;
            showToast('Query formatted ✓');
          }
        }
        // Shift + Enter to format
        if (e.shiftKey && e.key === 'Enter') {
          e.preventDefault();
          const formatted = formatGraphQL(queryEl.value);
          if (formatted !== queryEl.value) {
            queryEl.value = formatted;
            showToast('Query formatted ✓');
          }
        }
        // Tab key to insert 2 spaces
        if (e.key === 'Tab' && !e.shiftKey) {
          e.preventDefault();
          const start = queryEl.selectionStart;
          const end = queryEl.selectionEnd;
          queryEl.value = queryEl.value.substring(0, start) + '  ' + queryEl.value.substring(end);
          queryEl.selectionStart = queryEl.selectionEnd = start + 2;
        }
      });

      // Auto-format on paste
      on(queryEl, 'paste', (e) => {
        setTimeout(() => {
          // Only auto-format if the pasted content looks like a single-line query
          if (queryEl.value && !queryEl.value.includes('\n')) {
            const formatted = formatGraphQL(queryEl.value);
            if (formatted !== queryEl.value) {
              queryEl.value = formatted;
            }
          }
        }, 0);
      });
    }

    if (variablesEl) {
      on(variablesEl, 'keydown', (e) => {
        // Cmd/Ctrl + B to format
        if ((e.metaKey || e.ctrlKey) && e.key === 'b') {
          e.preventDefault();
          const formatted = formatJSON(variablesEl.value);
          if (formatted !== variablesEl.value) {
            variablesEl.value = formatted;
            variablesEl.classList.remove('error');
            variablesEl.classList.add('valid');
            showToast('Variables formatted ✓');
          }
        }
        // Shift + Enter to format
        if (e.shiftKey && e.key === 'Enter') {
          e.preventDefault();
          const formatted = formatJSON(variablesEl.value);
          if (formatted !== variablesEl.value) {
            variablesEl.value = formatted;
            variablesEl.classList.remove('error');
            variablesEl.classList.add('valid');
            showToast('Variables formatted ✓');
          }
        }
        // Tab key to insert 2 spaces
        if (e.key === 'Tab' && !e.shiftKey) {
          e.preventDefault();
          const start = variablesEl.selectionStart;
          const end = variablesEl.selectionEnd;
          variablesEl.value = variablesEl.value.substring(0, start) + '  ' + variablesEl.value.substring(end);
          variablesEl.selectionStart = variablesEl.selectionEnd = start + 2;
        }
      });

      // Auto-format JSON on paste
      on(variablesEl, 'paste', (e) => {
        setTimeout(() => {
          const formatted = formatJSON(variablesEl.value);
          if (formatted !== variablesEl.value) {
            variablesEl.value = formatted;
            variablesEl.classList.remove('error');
            variablesEl.classList.add('valid');
          }
        }, 0);
      });
    }

    // Wire up horizontal splitter for Variables/Results resize
    wireHorizontalSplitter();
  }

  // Horizontal splitter for Variables/Results sections
  function wireHorizontalSplitter() {
    const splitter = document.getElementById('graphql-splitter-h');
    const variablesSection = document.querySelector('.graphql-variables-section');
    const resultsSection = document.querySelector('.graphql-results-section');
    const rightPanel = document.querySelector('.graphql-right-panel');

    if (!splitter || !variablesSection || !resultsSection || !rightPanel) return;

    let isResizing = false;
    let startY = 0;
    let startVarHeight = 0;

    splitter.addEventListener('mousedown', (e) => {
      isResizing = true;
      startY = e.clientY;
      startVarHeight = variablesSection.offsetHeight;
      splitter.classList.add('active');
      document.body.style.cursor = 'row-resize';
      document.body.style.userSelect = 'none';
      e.preventDefault();
    });

    document.addEventListener('mousemove', (e) => {
      if (!isResizing) return;

      const diff = e.clientY - startY;
      const panelHeight = rightPanel.offsetHeight;
      const newVarHeight = Math.max(60, Math.min(panelHeight - 100, startVarHeight + diff));

      variablesSection.style.flex = 'none';
      variablesSection.style.height = newVarHeight + 'px';
      resultsSection.style.flex = '1';
    });

    document.addEventListener('mouseup', () => {
      if (!isResizing) return;
      isResizing = false;
      splitter.classList.remove('active');
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    });
  }

  // Store last result for expand/collapse toggle
  let lastGraphQLResult = null;

  // Simple toast notification
  function showToast(message, duration = 2000) {
    let toast = document.getElementById('graphql-toast');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'graphql-toast';
      toast.style.cssText = `
        position: fixed;
        bottom: 20px;
        left: 50%;
        transform: translateX(-50%);
        background: #212529;
        color: white;
        padding: 8px 16px;
        border-radius: 6px;
        font-size: 12px;
        z-index: 10000;
        opacity: 0;
        transition: opacity 0.2s ease;
        pointer-events: none;
      `;
      document.body.appendChild(toast);
    }

    toast.textContent = message;
    toast.style.opacity = '1';

    setTimeout(() => {
      toast.style.opacity = '0';
    }, duration);
  }

  // ==================== End Postman-like Features ====================

  // Filter objects based on search term (case-insensitive match on name or label)
  function filterObjectsMetadata(metadata, searchTerm) {
    if (!searchTerm || !searchTerm.trim()) return metadata;
    const term = searchTerm.toLowerCase().trim();
    return metadata.filter(obj =>
      obj.name.toLowerCase().includes(term) ||
      obj.label.toLowerCase().includes(term)
    );
  }

  // Render the objects grid with filtering support
  function populateObjectsGrid(searchTerm = '') {
    if (!graphqlObjectsGrid) return;

    const metadata = allObjectsMetadata || [];
    const filtered = filterObjectsMetadata(metadata, searchTerm);

    graphqlObjectsGrid.innerHTML = '';

    // Show loading state if no metadata yet
    if (!metadata.length) {
      graphqlObjectsGrid.innerHTML = '<div class="placeholder-note" style="grid-column: 1/-1;">Loading objects...</div>';
      return;
    }

    // Show empty state with search term if no matches
    if (!filtered.length) {
      const escapedTerm = Utils.escapeHtml(searchTerm);
      graphqlObjectsGrid.innerHTML = `
        <div class="graphql-empty-state" style="grid-column: 1/-1; text-align: center; padding: 40px 20px;">
          <div style="font-size: 48px; margin-bottom: 12px;">🔍</div>
          <div style="font-size: 14px; font-weight: 600; color: #495057; margin-bottom: 8px;">No objects found</div>
          <div style="font-size: 12px; color: #6c757d;">No objects matching "${escapedTerm}"</div>
          <button class="btn btn-sm btn-secondary" style="margin-top: 12px;" onclick="document.getElementById('graphql-objects-search').value=''; window.__graphqlFilterObjects && window.__graphqlFilterObjects('');">Clear filter</button>
        </div>
      `;
      return;
    }

    // Show count indicator
    const countIndicator = document.createElement('div');
    countIndicator.className = 'graphql-objects-count';
    countIndicator.style.cssText = 'grid-column: 1/-1; font-size: 11px; color: #6c757d; padding: 4px 0; margin-bottom: 4px;';
    if (searchTerm.trim()) {
      countIndicator.textContent = `Showing ${filtered.length} of ${metadata.length} objects`;
    } else {
      countIndicator.textContent = `${metadata.length} objects`;
    }
    graphqlObjectsGrid.appendChild(countIndicator);

    // Render filtered objects
    filtered.forEach((obj) => {
      const card = document.createElement('div');
      card.className = 'graphql-object-card';
      if (obj.isCustom) card.classList.add('custom-object');
      card.setAttribute('data-object', obj.name);

      // Show both name and label if they differ
      const showLabel = obj.label && obj.label !== obj.name;
      const labelHtml = showLabel
        ? `<div class="graphql-object-label" style="font-size: 10px; color: #6c757d; margin-top: 2px;">${Utils.escapeHtml(obj.label)}</div>`
        : '';
      const customBadge = obj.isCustom
        ? '<span class="custom-badge" style="font-size: 9px; background: #e9ecef; color: #495057; padding: 1px 4px; border-radius: 3px; margin-left: 4px;">Custom</span>'
        : '';

      card.innerHTML = `
        <div class="graphql-object-icon">${obj.isCustom ? '⚙️' : '📦'}</div>
        <div class="graphql-object-info">
          <div class="graphql-object-name">${Utils.escapeHtml(obj.name)}${customBadge}</div>
          ${labelHtml}
        </div>
      `;
      card.addEventListener('click', () => {
        graphqlUIState.selectObject(obj.name);
      });
      graphqlObjectsGrid.appendChild(card);
    });
  }

  // Debounced object filter function
  function handleObjectFilterInput(searchTerm) {
    clearTimeout(objectFilterDebounceTimer);
    objectFilterDebounceTimer = setTimeout(() => {
      objectFilterTerm = searchTerm;
      populateObjectsGrid(searchTerm);

      // If current selected object is not in filtered list, clear selection
      if (graphqlUIState.selectedObject) {
        const filtered = filterObjectsMetadata(allObjectsMetadata, searchTerm);
        const stillVisible = filtered.some(obj => obj.name === graphqlUIState.selectedObject);
        if (!stillVisible && searchTerm.trim()) {
          // Don't clear selection, just show warning
          console.log(`[GraphQL] Selected object "${graphqlUIState.selectedObject}" not in filtered results`);
        }
      }
    }, FILTER_DEBOUNCE_MS);
  }

  // Expose filter function globally for the clear button onclick
  window.__graphqlFilterObjects = handleObjectFilterInput;

  /**
   * Debounced field filter function (Issue 6: Real-time field filtering)
   * Filters the field datalist and highlights matching fields
   */
  function handleFieldFilterInput(searchTerm) {
    fieldFilterTerm = searchTerm.toLowerCase().trim();

    // Update the datalist to show only matching fields
    if (!fieldList) {
      fieldList = document.getElementById('graphql-builder-field-list');
    }

    if (!fieldList || !currentObjectFieldsMetadata?.length) return;

    // Filter fields based on search term
    const filteredFields = fieldFilterTerm
      ? currentObjectFieldsMetadata.filter(f =>
          f.name.toLowerCase().includes(fieldFilterTerm) ||
          (f.label && f.label.toLowerCase().includes(fieldFilterTerm))
        )
      : currentObjectFieldsMetadata;

    // Rebuild the datalist with filtered options
    fieldList.innerHTML = '';
    filteredFields
      .filter(f => !isGraphQLWrapperField(f.name))
      .forEach(f => {
        const opt = document.createElement('option');
        opt.value = f.name;
        opt.textContent = f.label && f.label !== f.name ? `${f.name} (${f.label})` : f.name;
        fieldList.appendChild(opt);
      });

    // Update field search status
    const searchInput = document.getElementById('graphql-builder-field-search');
    if (searchInput && fieldFilterTerm) {
      searchInput.setAttribute('data-matches', filteredFields.length.toString());
    }

    console.log(`[GraphQL] Field filter: "${fieldFilterTerm}" → ${filteredFields.length} matches`);
  }

  // Expose field filter function globally
  window.__graphqlFilterFields = handleFieldFilterInput;

  function populateObjects(names) {
    // Store metadata if we have it
    if (allObjectsMetadata.length === 0 && names && names.length) {
      // Fallback: create basic metadata from names only
      allObjectsMetadata = names.map(name => ({
        name,
        label: name,
        isCustom: isCustomObject(name)
      }));
    }

    if (!objectSelect) {
      // New UI: populate object grid with filtering
      populateObjectsGrid(objectFilterTerm);
      return;
    }

    // Fallback for old UI (if still needed)
    const current = objectSelect.value;
    objectSelect.innerHTML = '<option value="">Select</option>';
    (names || []).forEach((n) => {
      const opt = document.createElement('option');
      opt.value = n; opt.textContent = n;
      objectSelect.appendChild(opt);
    });
    if (current && (names || []).includes(current)) objectSelect.value = current;
  }

   async function init() {
     // Cleanup old schema cache to prevent quota exceeded errors
     try { await cleanupSchemaCache(); } catch {}

     objectGroup = document.getElementById('graphql-object-group');
     objectSelect = document.getElementById('graphql-object');
     refreshObjectsBtn = document.getElementById('graphql-refresh-objects');
     limitInput = document.getElementById('graphql-limit');
     offsetInput = document.getElementById('graphql-offset');
     afterInput = document.getElementById('graphql-after');
     queryEl = document.getElementById('graphql-query');
     editorMount = document.getElementById('graphql-editor');
     schemaStatusEl = document.getElementById('graphql-schema-status');
     schemaRefreshBtn = document.getElementById('graphql-schema-refresh');
     schemaSearchInput = document.getElementById('graphql-schema-search');
     schemaResultsEl = document.getElementById('graphql-schema-results');
     variablesEl = document.getElementById('graphql-variables');
     runBtn = document.getElementById('graphql-run');
     clearBtn = document.getElementById('graphql-clear');
     resultsEl = document.getElementById('graphql-results');
     pageInfoEl = document.getElementById('graphql-pageinfo');
     pageInfoApplyBtn = document.getElementById('graphql-pageinfo-apply');
     pageInfoClearBtn = document.getElementById('graphql-pageinfo-clear');
     pageInfoBody = document.getElementById('graphql-pageinfo-body');
     builderToggle = document.getElementById('graphql-builder-enabled');
     builderPanel = document.getElementById('graphql-builder');
     builderStatus = document.getElementById('graphql-builder-status');
     fieldInput = document.getElementById('graphql-builder-field-input');
     fieldList = document.getElementById('graphql-builder-field-list');
     fieldChips = document.getElementById('graphql-builder-fields');
     addFieldBtn = document.getElementById('graphql-builder-add-field');
     filterContainer = document.getElementById('graphql-builder-filters');
     addFilterBtn = document.getElementById('graphql-builder-add-filter');
     orderFieldInput = document.getElementById('graphql-builder-order-field');
     orderDirSel = document.getElementById('graphql-builder-order-dir');
     clearOrderBtn = document.getElementById('graphql-builder-clear-order');

     // Related objects DOM refs
     const addRelatedBtn = document.getElementById('graphql-builder-add-related');
     const relatedPicker = document.getElementById('graphql-builder-related-picker');
     const relatedSelect = document.getElementById('graphql-builder-related-select');
     const relatedFieldsWrap = document.getElementById('graphql-builder-related-fields-wrap');
     const relatedFieldsInput = document.getElementById('graphql-builder-related-fields-input');
     const relatedAddBtn = document.getElementById('graphql-builder-related-add-btn');
     const relatedObjectsContainer = document.getElementById('graphql-builder-related-objects');

     // New Screen DOM refs
     graphqlScreenObjects = document.getElementById('graphql-screen-objects');
     graphqlScreenBuilder = document.getElementById('graphql-screen-builder');
     graphqlScreenResults = document.getElementById('graphql-screen-results');
     graphqlObjectsGrid = document.getElementById('graphql-objects-grid');
     graphqlObjectsSearch = document.getElementById('graphql-objects-search');
     graphqlCurrentObject = document.getElementById('graphql-current-object');
     graphqlResultsObject = document.getElementById('graphql-results-object');
     graphqlQueryPreview = document.getElementById('graphql-query-preview');
     graphqlBackToObjects = document.getElementById('graphql-back-to-objects');
     graphqlBackToBuilder = document.getElementById('graphql-back-to-builder');
     graphqlAdvancedMode = document.getElementById('graphql-advanced-mode');
     graphqlManualMode = document.getElementById('graphql-manual-mode');
     graphqlManualEditToggle = document.getElementById('graphql-manual-edit-toggle');

    if (!document.getElementById('tab-graphql')) return;

    // Wire up screen navigation events
    if (graphqlBackToObjects) on(graphqlBackToObjects, 'click', () => graphqlUIState.goToObjectSelection());
    if (graphqlBackToBuilder) on(graphqlBackToBuilder, 'click', () => graphqlUIState.backToBuilder());

    // Wire up object search with debounce
    if (graphqlObjectsSearch) {
      on(graphqlObjectsSearch, 'input', (e) => {
        handleObjectFilterInput(e.target.value || '');
      });
      // Also handle search clear (X button in search input)
      on(graphqlObjectsSearch, 'search', (e) => {
        if (!e.target.value) {
          handleObjectFilterInput('');
        }
      });
    }

    await loadBuilderState();

    // Restore pending builder state from pop-out transfer if available
    // This handles state transferred from popup.js during pop-out operation
    try {
      if (window.__pendingBuilderState) {
        const pending = window.__pendingBuilderState;
        builderState = cloneBuilderState({ ...defaultBuilderState(), ...pending });
        delete window.__pendingBuilderState;
        // Persist the restored state
        saveBuilderState();
      }
    } catch (e) {
      console.warn('[GraphQL] Failed to restore pending builder state:', e);
    }

    if (builderToggle) builderToggle.checked = !!builderState.enabled;
    if (limitInput) limitInput.value = builderState.limit;
    if (offsetInput) offsetInput.value = builderState.offset;
    if (afterInput) afterInput.value = builderState.after || '';
    setBuilderVisibility(builderState.enabled);
    bindEvents();
    applyObjectSelectorVisibility();
    wireSplitters(); // Wire up draggable splitters
    renderScreens(); // Initialize screen visibility
    // Use on-demand object introspection by default (skipFullSchema: true)
    // This loads only object-specific metadata into cache, not the entire schema
    loadSchema({ skipFullSchema: true }).catch(() => {});
    initCodeMirror().catch(() => {});

    const { names } = await getDescribeCached();
    populateObjects(names);
    if (builderState.object) {
      await refreshBuilderFields(builderState.object);
      updateEndpointDisplay(); // Update endpoint display on init
    }
    syncBuilderUi({ loadFields: false });
    if (builderState.enabled) writeQueryFromBuilder();
    else if (builderState.object && !(queryEl?.value || '').trim()) await writeAutoTemplateForObject(builderState.object);
    wireRunControls();
    wireExportButtons(); // Wire up export and view toggle buttons (Issues 15-17)

    // Initialize intelligent autocomplete for the query editor
    wireAutocomplete();

    // Wire up beta banner dismiss functionality
    wireBetaBanner();
  }

  /**
   * Wire up the beta testing banner dismiss functionality
   */
  function wireBetaBanner() {
    const banner = document.querySelector('#tab-graphql .beta-banner');
    const dismissBtn = document.querySelector('#tab-graphql .beta-banner-dismiss');

    if (!banner) return;

    // Check if banner was previously dismissed
    try {
      chrome.storage.local.get({ graphqlBetaBannerDismissed: false }, (result) => {
        if (result.graphqlBetaBannerDismissed) {
          banner.classList.add('hidden');
        }
      });
    } catch {}

    // Handle dismiss button click
    if (dismissBtn) {
      dismissBtn.addEventListener('click', () => {
        banner.classList.add('hidden');
        try {
          chrome.storage.local.set({ graphqlBetaBannerDismissed: true });
        } catch {}
      });
    }
  }

  /**
   * Extract record count from GraphQL response
   * Handles various response structures including UI API format
   * Returns -1 if data exists but count cannot be determined (non-UI API format)
   */
  function extractRecordCount(data, objectName) {
    if (!data) return 0;

    // Check if data is truly empty (not just missing edges)
    if (typeof data === 'object' && Object.keys(data).length === 0) return 0;

    // Try UI API structure: data.uiapi.query.ObjectName.edges
    if (objectName && data?.uiapi?.query?.[objectName]?.edges) {
      return data.uiapi.query[objectName].edges.length;
    }

    // Try direct edges structure
    if (data?.edges) {
      return data.edges.length;
    }

    // Try to find any edges array in the response
    const findEdges = (obj, depth = 0) => {
      if (depth > 10) return -1; // Prevent infinite recursion
      if (!obj || typeof obj !== 'object') return -1;
      if (Array.isArray(obj.edges)) return obj.edges.length;
      for (const key of Object.keys(obj)) {
        const count = findEdges(obj[key], depth + 1);
        if (count >= 0) return count;
      }
      return -1;
    };

    const edgeCount = findEdges(data);
    // If we found edges, return the count; otherwise return -1 (unknown, but data exists)
    return edgeCount >= 0 ? edgeCount : -1;
  }

  /**
   * Render GraphQL results with improved formatting, record count, and empty state handling
   */
  function renderResult(ok, payload) {
    if (!resultsEl) return;
    if (!ok) {
      lastGraphQLResult = null;
      let errorMsg = payload?.error || payload?.errors?.[0]?.message || 'GraphQL request failed';

      // Make error messages more user-friendly
      let friendlyError = errorMsg;
      let tips = '';

      if (errorMsg.includes('Failed to fetch') || errorMsg.includes('NetworkError') || errorMsg.includes('Connection failed')) {
        friendlyError = 'Unable to connect to Salesforce';
        tips = '\n\n💡 Try:\n• Refresh the Salesforce page\n• Check your internet connection\n• Ensure you are logged in';
      } else if (errorMsg.includes('401') || errorMsg.includes('403') || errorMsg.includes('Unauthorized')) {
        friendlyError = 'Session expired or unauthorized';
        tips = '\n\n💡 Refresh the Salesforce page to get a new session';
      } else if (errorMsg.includes('timeout') || errorMsg.includes('timed out')) {
        friendlyError = 'Request timed out';
        tips = '\n\n💡 Try again in a few moments';
      }

      resultsEl.innerHTML = `<span class="log-badge error">ERROR</span>\n${Utils.escapeHtml(friendlyError)}${tips}`;
      updatePageInfoUI(null);
      updateResultCountBadge(null);
      return;
    }

    // Store result for expand/collapse
    lastGraphQLResult = payload?.data || payload;

    // Check for GraphQL-level errors in response
    if (payload?.errors && payload.errors.length > 0) {
      const errorMessages = payload.errors.map(e => e.message || 'Unknown error').join('\n');
      resultsEl.innerHTML = `<span class="log-badge warning">WARNING</span> Query returned with errors:\n${Utils.escapeHtml(errorMessages)}\n\n${Utils.escapeHtml(JSON.stringify(lastGraphQLResult, null, 2))}`;
      updatePageInfoUI(null);
      updateResultCountBadge(null);
      return;
    }

    // Extract record count (-1 means unknown but data exists)
    const recordCount = extractRecordCount(lastGraphQLResult, builderState.object);

    // Check for truly empty results (empty object {})
    const isEmptyResult = !lastGraphQLResult ||
      (typeof lastGraphQLResult === 'object' && Object.keys(lastGraphQLResult).length === 0);

    if (isEmptyResult) {
      resultsEl.innerHTML = `<span class="log-badge info">INFO</span> <span class="empty-state">No data returned</span>\n\nThe query completed but the response was empty.\nThis may indicate:\n• The object doesn't exist or is inaccessible\n• A permission or sharing issue\n• The API version doesn't support this query`;
      updatePageInfoUI(null);
      updateResultCountBadge(0);
      return;
    }

    // Check for zero records (only when we can determine the count)
    if (recordCount === 0) {
      resultsEl.innerHTML = `<span class="log-badge info">INFO</span> <strong class="empty-state">0 records found</strong>\n\nThe query executed successfully but returned no matching records.\n\nTips:\n• Check your filter conditions\n• Verify field access permissions\n• Try removing filters to see all records`;
      updatePageInfoUI(null);
      updateResultCountBadge(0);
      return;
    }

    // Update the result count badge in the header
    updateResultCountBadge(recordCount);

    // Format the result with record count header (only show if count is known and positive)
    const pretty = Utils.escapeHtml(JSON.stringify(lastGraphQLResult, null, 2));
    const countBadge = recordCount > 0 ? `<span class="record-count">${recordCount} record${recordCount !== 1 ? 's' : ''}</span>` :
                       (recordCount === -1 ? `<span class="record-count">Data received</span>` : '');
    resultsEl.innerHTML = `<span class="log-badge system">OK</span> ${countBadge}\n${pretty}`;

    try {
      const obj = builderState.object;
      const pi = obj ? payload?.data?.uiapi?.query?.[obj]?.pageInfo : null;
      updatePageInfoUI(pi);
    } catch { updatePageInfoUI(null); }
  }

  /**
   * Update the result count badge in the results section header
   */
  function updateResultCountBadge(count) {
    const countEl = document.getElementById('graphql-result-count');
    if (!countEl) return;

    if (count === null || count === undefined) {
      countEl.textContent = '';
      countEl.style.display = 'none';
    } else if (count === 0) {
      countEl.textContent = '0 records';
      countEl.className = 'result-count empty';
      countEl.style.display = 'inline';
    } else if (count === -1) {
      countEl.textContent = 'Data received';
      countEl.className = 'result-count unknown';
      countEl.style.display = 'inline';
    } else {
      countEl.textContent = `${count} record${count !== 1 ? 's' : ''}`;
      countEl.className = 'result-count';
      countEl.style.display = 'inline';
    }
  }

  // ==================== Results & Export UX (Issues 15-20) ====================

  // Track current results view mode: 'json' | 'table'
  let resultsViewMode = 'json';

  /**
   * Issue 15: Render results as HTML table
   * Parses edges.node structure and generates an HTML table
   * @param {Array} records - Array of unwrapped record objects
   * @param {Array} columns - Array of column names (field names)
   * @returns {string} HTML table string
   */
  function renderResultsAsTable(records, columns) {
    if (!records || !records.length) {
      return '<div class="empty-table-message">No records to display</div>';
    }

    // Auto-generate columns from first record if not provided
    if (!columns || !columns.length) {
      columns = Object.keys(records[0]).filter(k => !isGraphQLWrapperField(k));
    }

    // Build table HTML
    const escapeHtml = Utils.escapeHtml || ((s) => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'));

    let html = '<thead><tr>';
    columns.forEach(col => {
      html += `<th>${escapeHtml(col)}</th>`;
    });
    html += '</tr></thead><tbody>';

    records.forEach(record => {
      html += '<tr>';
      columns.forEach(col => {
        let val = record[col];
        // Handle nested objects (unwrap { value } if needed)
        if (val && typeof val === 'object' && 'value' in val) {
          val = val.value;
        }
        // Format display value
        const displayVal = val === null || val === undefined ? '' :
                          typeof val === 'object' ? JSON.stringify(val) : String(val);
        html += `<td>${escapeHtml(displayVal)}</td>`;
      });
      html += '</tr>';
    });
    html += '</tbody>';

    return html;
  }

  /**
   * Issue 16: Generate table columns from builderState.fields
   * @returns {Array<string>} Array of column names
   */
  function generateTableColumns() {
    // Use builder fields if available, otherwise fall back to extracting from results
    const fields = builderState.fields || [];
    // Filter out any GraphQL wrapper fields
    return fields.filter(f => !isGraphQLWrapperField(f));
  }

  /**
   * Toggle between JSON and Table view for results
   */
  function toggleResultsView() {
    const tableEl = document.getElementById('graphql-results-table');
    const jsonEl = document.getElementById('graphql-results');
    const toggleBtn = document.getElementById('graphql-results-view-toggle');

    if (!tableEl || !jsonEl) return;

    if (resultsViewMode === 'json') {
      // Switch to table view
      resultsViewMode = 'table';

      // Extract records and render table
      if (lastGraphQLResult) {
        const records = extractRecords(lastGraphQLResult, builderState.object);
        const columns = generateTableColumns();
        tableEl.innerHTML = renderResultsAsTable(records, columns);
      } else {
        tableEl.innerHTML = '<div class="empty-table-message">No data to display</div>';
      }

      tableEl.style.display = 'table';
      jsonEl.style.display = 'none';
      if (toggleBtn) {
        toggleBtn.querySelector('.action-label').textContent = 'JSON';
        toggleBtn.dataset.view = 'table';
      }
    } else {
      // Switch to JSON view
      resultsViewMode = 'json';
      tableEl.style.display = 'none';
      jsonEl.style.display = 'block';
      if (toggleBtn) {
        toggleBtn.querySelector('.action-label').textContent = 'Table';
        toggleBtn.dataset.view = 'json';
      }
    }
  }

  /**
   * Issue 17: Export results as CSV
   * @param {Array} records - Array of record objects
   * @param {Array} columns - Array of column names
   * @returns {string} CSV string
   */
  function exportResultsAsCSV(records, columns) {
    if (!records || !records.length) return '';

    // Auto-generate columns if not provided
    if (!columns || !columns.length) {
      columns = Object.keys(records[0]).filter(k => !isGraphQLWrapperField(k));
    }

    // CSV escape function
    const escapeCSV = (val) => {
      if (val === null || val === undefined) return '';
      const str = typeof val === 'object' ? JSON.stringify(val) : String(val);
      // Escape quotes and wrap in quotes if contains comma, quote, or newline
      if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    };

    // Build CSV
    const lines = [];
    lines.push(columns.join(','));

    records.forEach(record => {
      const row = columns.map(col => {
        let val = record[col];
        if (val && typeof val === 'object' && 'value' in val) val = val.value;
        return escapeCSV(val);
      });
      lines.push(row.join(','));
    });

    return lines.join('\n');
  }

  /**
   * Issue 17: Export results as JSON file
   * @param {Object} data - Data to export
   * @returns {string} JSON string
   */
  function exportResultsAsJSON(data) {
    return JSON.stringify(data, null, 2);
  }

  /**
   * Issue 17: Download data as a file
   * @param {string} content - File content
   * @param {string} filename - File name
   * @param {string} mimeType - MIME type
   */
  function downloadFile(content, filename, mimeType) {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  /**
   * Handle CSV export button click
   */
  function handleExportCSV() {
    if (!lastGraphQLResult) {
      setBuilderStatus('No results to export');
      return;
    }
    const records = extractRecords(lastGraphQLResult, builderState.object);
    const columns = generateTableColumns();
    const csv = exportResultsAsCSV(records, columns);
    const objectName = builderState.object || 'results';
    const timestamp = new Date().toISOString().slice(0, 10);
    downloadFile(csv, `${objectName}_${timestamp}.csv`, 'text/csv');
    setBuilderStatus(`Exported ${records.length} records as CSV`);
  }

  /**
   * Handle JSON export button click
   */
  function handleExportJSON() {
    if (!lastGraphQLResult) {
      setBuilderStatus('No results to export');
      return;
    }
    const json = exportResultsAsJSON(lastGraphQLResult);
    const objectName = builderState.object || 'results';
    const timestamp = new Date().toISOString().slice(0, 10);
    downloadFile(json, `${objectName}_${timestamp}.json`, 'application/json');
    setBuilderStatus('Exported results as JSON');
  }

  /**
   * Handle copy results button click
   */
  function handleCopyResults() {
    if (!lastGraphQLResult) {
      setBuilderStatus('No results to copy');
      return;
    }
    const json = JSON.stringify(lastGraphQLResult, null, 2);
    navigator.clipboard.writeText(json).then(() => {
      setBuilderStatus('Results copied to clipboard ✓');
    }).catch(() => {
      setBuilderStatus('Failed to copy to clipboard');
    });
  }

  /**
   * Issue 18: Update section counts dynamically
   * Updates the count badges in collapsible section headers
   */
  function updateBuilderSectionCounts() {
    // Fields count
    const fieldsSection = document.querySelector('#fields-section .section-count');
    if (fieldsSection) {
      const count = (builderState.fields || []).length;
      fieldsSection.textContent = `(${count})`;
    }

    // Filters count (only count filters with field names)
    const filtersSection = document.querySelector('#filters-section .section-count');
    if (filtersSection) {
      const count = (builderState.filters || []).filter(f => (f.field || '').trim()).length;
      filtersSection.textContent = `(${count})`;
    }

    // Related objects count
    const relatedSection = document.querySelector('#related-section .section-count');
    if (relatedSection) {
      const count = (builderState.relatedObjects || []).length;
      relatedSection.textContent = `(${count})`;
    }
  }

  /**
   * Issue 19: Get query readiness status
   * @returns {Object} {status: 'ready'|'warning'|'error', message: string, icon: string}
   */
  function getQueryReadinessStatus() {
    if (!builderState.enabled) {
      return { status: 'info', message: 'Builder disabled', icon: 'ℹ️' };
    }

    if (!builderState.object) {
      return { status: 'error', message: 'Select an object', icon: '❌' };
    }

    if (!builderState.fields || builderState.fields.length === 0) {
      return { status: 'error', message: 'Add at least one field', icon: '❌' };
    }

    // Check for validation warnings
    const warnings = validateBuilderState();
    if (warnings.length > 0) {
      return { status: 'warning', message: warnings[0], icon: '⚠️' };
    }

    // Check for incomplete filters
    const incompleteFilters = (builderState.filters || []).filter(f => {
      const field = (f?.field || '').trim();
      const op = (f?.op || '').trim();
      const isNullOp = op === 'IS NULL' || op === 'IS NOT NULL';
      if (!field) return false; // Empty filter rows don't count
      return !op || (!isNullOp && !(f?.value ?? '').toString());
    });

    if (incompleteFilters.length > 0) {
      return { status: 'warning', message: `${incompleteFilters.length} incomplete filter(s)`, icon: '⚠️' };
    }

    return { status: 'ready', message: 'Query ready', icon: '✓' };
  }

  /**
   * Issue 19: Update query status badge near Run button
   */
  function updateQueryStatusBadge() {
    const statusEl = document.getElementById('graphql-query-status');
    if (!statusEl) return;

    const status = getQueryReadinessStatus();

    statusEl.textContent = `${status.icon} ${status.message}`;
    statusEl.className = `query-status query-status-${status.status}`;
  }

  /**
   * Issue 20: Generate visual/human-readable query summary
   * @returns {string} Human-readable query summary
   */
  function generateVisualSummary() {
    if (!builderState.object) {
      return 'Select an object to build a query';
    }

    const parts = [];

    // FROM clause
    parts.push(`FROM ${builderState.object}`);

    // SELECT clause
    const fields = builderState.fields || ['Id'];
    parts.push(`SELECT ${fields.slice(0, 5).join(', ')}${fields.length > 5 ? ` (+${fields.length - 5} more)` : ''}`);

    // WHERE clause
    const validFilters = (builderState.filters || []).filter(f => (f.field || '').trim());
    if (validFilters.length > 0) {
      const filterStrs = validFilters.slice(0, 3).map(f => {
        if (f.op === 'IS NULL' || f.op === 'IS NOT NULL') {
          return `${f.field} ${f.op}`;
        }
        const val = (f.value || '').includes(' ') ? `"${f.value}"` : f.value;
        return `${f.field} ${f.op} ${val}`;
      });
      const logic = builderState.filterLogic === 'or' ? ' OR ' : ' AND ';
      let whereStr = filterStrs.join(logic);
      if (validFilters.length > 3) {
        whereStr += ` (+${validFilters.length - 3} more)`;
      }
      parts.push(`WHERE ${whereStr}`);
    }

    // ORDER BY clause
    if (builderState.orderBy?.field) {
      parts.push(`ORDER BY ${builderState.orderBy.field} ${(builderState.orderBy.dir || 'ASC').toUpperCase()}`);
    }

    // LIMIT clause
    parts.push(`LIMIT ${builderState.limit || 50}`);

    // OFFSET clause (only if non-zero)
    if (builderState.offset > 0) {
      parts.push(`OFFSET ${builderState.offset}`);
    }

    return parts.join(' ');
  }

  /**
   * Issue 20: Update visual summary display
   */
  function updateVisualSummary() {
    const summaryEl = document.getElementById('graphql-visual-summary');
    if (!summaryEl) return;

    const summary = generateVisualSummary();
    summaryEl.textContent = summary;
  }

  /**
   * Wire up export and view toggle buttons
   */
  function wireExportButtons() {
    const viewToggle = document.getElementById('graphql-results-view-toggle');
    const csvBtn = document.getElementById('graphql-export-csv');
    const jsonBtn = document.getElementById('graphql-export-json');
    const copyBtn = document.getElementById('graphql-copy-results');

    if (viewToggle) {
      viewToggle.addEventListener('click', toggleResultsView);
    }

    if (csvBtn) {
      csvBtn.addEventListener('click', handleExportCSV);
    }

    if (jsonBtn) {
      jsonBtn.addEventListener('click', handleExportJSON);
    }

    if (copyBtn) {
      copyBtn.addEventListener('click', handleCopyResults);
    }
  }

  // ==================== End Results & Export UX ====================


  function switchToResultsTab() {
    // No longer needed with split view - results are always visible
  }

  function parseVariables() {
    const raw = (variablesEl?.value || '').trim();
    if (!raw) return null;
    try { return JSON.parse(raw); } catch (e) {
      setBuilderStatus(`Invalid variables JSON: ${String(e)}`);
      return null;
    }
  }

  function validateAndFormatJSON(textarea) {
    if (!textarea) return;

    const raw = textarea.value.trim();
    if (!raw) {
      textarea.classList.remove('error', 'valid');
      return;
    }

    try {
      const parsed = JSON.parse(raw);
      // Valid JSON - auto-beautify it
      textarea.value = JSON.stringify(parsed, null, 2);
      textarea.classList.remove('error');
      textarea.classList.add('valid');
      if (setBuilderStatus) setBuilderStatus('Variables JSON valid ✓');
    } catch (e) {
      // Invalid JSON - show error
      textarea.classList.remove('valid');
      textarea.classList.add('error');
      if (setBuilderStatus) setBuilderStatus(`JSON Error: ${e.message}`);
    }
  }

  function wireVariablesInput() {
    if (!variablesEl) return;

    // Validate on input (with debounce to avoid constant parsing)
    let validateTimeout;
    variablesEl.addEventListener('input', () => {
      clearTimeout(validateTimeout);
      validateTimeout = setTimeout(() => {
        validateAndFormatJSON(variablesEl);
        updateRunButtonState(); // Update button state when variables change
      }, 500); // Debounce 500ms
    });

    // Validate on blur (immediate)
    variablesEl.addEventListener('blur', () => {
      clearTimeout(validateTimeout);
      validateAndFormatJSON(variablesEl);
      updateRunButtonState(); // Update button state when variables change
    });

    // Validate on focus (show status)
    variablesEl.addEventListener('focus', () => {
      const raw = variablesEl.value.trim();
      if (raw) validateAndFormatJSON(variablesEl);
      updateRunButtonState(); // Update button state when variables change
    });
  }

  // Validate query and update button state
  function updateRunButtonState() {
    if (!runBtn || !queryEl) return;

    const q = (queryEl.value || '').trim();
    const variables = parseVariables();
    const hasInvalidVariables = variables === null && (variablesEl?.value || '').trim();

    const isValid = q && !hasInvalidVariables;
    runBtn.disabled = !isValid;

    if (!isValid) {
      runBtn.removeAttribute('aria-busy');
    }
  }

  function wireRunControls() {
    if (clearBtn && resultsEl) {
      on(clearBtn, 'click', () => {
        // Only clear query text, variables, and results - preserve builder state
        if (queryEl) queryEl.value = '';
        if (variablesEl) variablesEl.value = '';
        resultsEl.innerHTML = '<div class="placeholder-note">Cleared.</div>';
        updatePageInfoUI(null);
        // Update button state after clearing
        updateRunButtonState();
      });
    }
    if (schemaRefreshBtn) {
      on(schemaRefreshBtn, 'click', () => {
        // Shift+Click for full schema load, regular click for on-demand refresh
        return loadSchema({ force: true, skipFullSchema: true });
      });
    }
    if (schemaSearchInput) {
      on(schemaSearchInput, 'input', () => renderSchemaSearch(schemaSearchInput.value));
    }
    // Wire up JSON validation for variables input
    wireVariablesInput();

    // Add input listeners to validate query and update button state
    if (runBtn && queryEl) {
      on(queryEl, 'input', updateRunButtonState);
      on(queryEl, 'change', updateRunButtonState);
      // Initial state check
      updateRunButtonState();

      on(runBtn, 'click', () => {
        const variables = parseVariables();
        if (variables === null && (variablesEl?.value || '').trim()) {
          setBuilderStatus('Invalid variables JSON');
          return;
        }
        const q = (queryEl.value || '').trim();
        if (!q) { renderResult(false, { error: 'Please enter a GraphQL query.' }); return; }
        try { runBtn.disabled = true; runBtn.setAttribute('aria-busy', 'true'); } catch {}
        if (resultsEl) resultsEl.innerHTML = '<div class="loading"><div class="loading-spinner"></div><div>Running GraphQL…</div></div>';
        Utils.getInstanceUrl().then(async (instanceUrl) => {
          await ensureSessionCached();
          const payload = { action: 'RUN_GRAPHQL', query: q, variables };
          if (instanceUrl && Utils.looksLikeSalesforceOrigin && Utils.looksLikeSalesforceOrigin(instanceUrl)) payload.instanceUrl = instanceUrl;
          if (!payload.instanceUrl && lastSession?.instanceUrl) payload.instanceUrl = lastSession.instanceUrl;
          if (lastSession?.sessionId) payload.sessionId = lastSession.sessionId;
          if (lastSession?.accessToken) payload.accessToken = lastSession.accessToken;
           chrome.runtime.sendMessage(payload, (resp) => {
             try { updateRunButtonState(); } catch {}
             if (chrome.runtime && chrome.runtime.lastError) { renderResult(false, { error: chrome.runtime.lastError.message }); return; }
             if (!resp || !resp.success) { renderResult(false, { error: resp?.error || 'GraphQL failed' }); return; }
             renderResult(true, resp);
             // Stay on builder screen instead of redirecting to results screen
             // Results are shown in the split view on the builder screen
             // Only navigate to results screen if user is currently on objects screen
             if (graphqlUIState.currentScreen === 'objects') {
               graphqlUIState.runQueryAndShowResults(resp);
             }

             syncEditorFromTextarea();
           });
         });
       });
     }
   }

  function updatePageInfoUI(pi) {
    lastPageInfo = pi && typeof pi === 'object' ? pi : null;
    if (!pageInfoEl || !pageInfoBody) return;
    if (!pi) {
      pageInfoBody.textContent = 'No page info';
      if (pageInfoApplyBtn) pageInfoApplyBtn.disabled = true;
      return;
    }
    pageInfoBody.textContent = `endCursor: ${pi.endCursor || ''} • hasNextPage: ${pi.hasNextPage ? 'true' : 'false'}`;
    if (pageInfoApplyBtn) pageInfoApplyBtn.disabled = !pi.endCursor;
  }

  // test hooks
  try {
    window.__GraphqlTestHooks = {
      composeQueryFromBuilder,
      tryImportQueryToBuilder,
      defaultBuilderState,
      cloneBuilderState,
      getBuilderState: () => cloneBuilderState(builderState),
      setBuilderState: (s) => { builderState = cloneBuilderState(s); },
      uid,
      parseWhereClause,
      parseVariables,
      writeAutoTemplateForObject,
      updatePageInfoUI,
      renderSchemaSearch,
      buildSchemaIndex,
      // Postman-like formatting functions
      formatGraphQL,
      formatJSON,
      smartFormat,
      // Button state management
      updateRunButtonState,
      // Object and field filtering
      isGraphQLWrapperField,
      filterOutGraphQLWrappers,
      isCustomField,
      isCustomObject,
      filterObjectsMetadata,
      extractObjectsMetadata,
      // Field display transformers (Issue 1: abstract GraphQL internals)
      transformFieldDisplay,
      unwrapResultRecord,
      extractRecords,
      extractRecordCount,
      // Builder UI functions
      addFilterRow,
      renderFilters,
      syncBuilderUi,
      validateBuilderState,
      // Phase 3: Query Builder Validation & Operators (Issues 11-14)
      getFilterOperatorTooltip,
      validateFilterRow,
      setCurrentObjectFieldsMetadata: (meta) => { currentObjectFieldsMetadata = meta || []; },
      // Results & Export UX (Issues 15-20)
      renderResultsAsTable,
      generateTableColumns,
      exportResultsAsCSV,
      exportResultsAsJSON,
      toggleResultsView,
      getResultsViewMode: () => resultsViewMode,
      setResultsViewMode: (mode) => { resultsViewMode = mode; },
      handleExportCSV,
      handleExportJSON,
      handleCopyResults,
      updateBuilderSectionCounts,
      getQueryReadinessStatus,
      updateQueryStatusBadge,
      generateVisualSummary,
      updateVisualSummary,
      getLastGraphQLResult: () => lastGraphQLResult,
      setLastGraphQLResult: (data) => { lastGraphQLResult = data; },
      // Section counts and pagination sync (Issues 6-10)
      updateSectionCounts,
      syncPaginationUI,
      handleFieldFilterInput,
      // Getters for filter state
      getObjectFilterTerm: () => objectFilterTerm,
      getFieldFilterTerm: () => fieldFilterTerm,
      getAllObjectsMetadata: () => allObjectsMetadata,
      getCurrentObjectFieldsMetadata: () => currentObjectFieldsMetadata,
     };
   } catch {}

  // Initialize when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

 })();

