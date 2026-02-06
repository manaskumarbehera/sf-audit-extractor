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

  const defaultBuilderState = () => ({
     enabled: false,
     object: '',
     fields: ['Id'],
     filters: [],
     orderBy: null,
     limit: 50,
     offset: 0,
     after: '',
     includePageInfo: true,
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

     // Hide all screens
     graphqlScreenObjects.classList.remove('active');
     graphqlScreenObjects.classList.add('hidden');
     graphqlScreenBuilder.classList.remove('active');
     graphqlScreenBuilder.classList.add('hidden');
     graphqlScreenResults.classList.remove('active');
     graphqlScreenResults.classList.add('hidden');

     // Show current screen
     const screen = graphqlUIState.currentScreen;
     if (screen === 'objects') {
       graphqlScreenObjects.classList.add('active');
       graphqlScreenObjects.classList.remove('hidden');
     } else if (screen === 'builder') {
       graphqlScreenBuilder.classList.add('active');
       graphqlScreenBuilder.classList.remove('hidden');
       if (graphqlCurrentObject) graphqlCurrentObject.textContent = graphqlUIState.selectedObject || '-';
     } else if (screen === 'results') {
       graphqlScreenResults.classList.add('active');
       graphqlScreenResults.classList.remove('hidden');
       if (graphqlResultsObject) graphqlResultsObject.textContent = graphqlUIState.selectedObject || '-';
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
      function done(names, error) { resolve({ names: Array.isArray(names) ? names : [], error: error ? String(error) : null }); }
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
            done(describeObjectsToNames(resp.objects), null);
          });
        }).catch(() => done([], 'Describe failed'));
      } catch (e) { done([], e); }
    });
  }

  function getDescribeCached() {
    const fresh = Array.isArray(describeCache.names) && describeCache.names.length && (nowTs() - describeCache.ts < DESCRIBE_TTL_MS);
    if (fresh) return Promise.resolve({ names: describeCache.names.slice(), error: null });
    return fetchDescribe().then((res) => {
      if (!res.error && res.names.length) describeCache.ts = nowTs(), describeCache.names = res.names.slice();
      return res;
    }).catch((e) => ({ names: [], error: String(e || 'Describe failed') }));
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

  function quoteValue(v) {
    if (v === null || v === undefined) return 'null';
    const trimmed = String(v).trim();
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

  function composeWhere(filters) {
    const clauses = [];
    (filters || []).forEach((f) => {
      const field = (f?.field || '').trim();
      const op = (f?.op || '').trim().toUpperCase();
      if (!field || !op) return;
      const rawVal = f?.value ?? '';
      if (op === 'IN') {
        const list = splitListValue(rawVal);
        const rendered = list.length ? `[${list.map(quoteValue).join(', ')}]` : '[]';
        clauses.push(`${field}: { in: ${rendered} }`);
        return;
      }
      const opMap = { '=': 'eq', '!=': 'neq', '>': 'gt', '>=': 'gte', '<': 'lt', '<=': 'lte', 'LIKE': 'like' };
      const gqlOp = opMap[op] || 'eq';
      clauses.push(`${field}: { ${gqlOp}: ${quoteValue(rawVal)} }`);
    });
    if (!clauses.length) return '';
    return `{ ${clauses.join(', ')} }`;
  }

  function composeArgs(state) {
    const args = [];
    const where = composeWhere(state.filters);
    if (where) args.push(`where: ${where}`);
    if (state.orderBy && state.orderBy.field) {
      const dir = (state.orderBy.dir || 'asc').toLowerCase() === 'desc' ? 'DESC' : 'ASC';
      args.push(`orderBy: { ${state.orderBy.field}: { order: ${dir} } }`);
    }
    if (Number.isFinite(state.limit)) args.push(`first: ${state.limit}`);
    if (Number.isFinite(state.offset) && state.offset > 0) args.push(`offset: ${state.offset}`);
    if (state.after) args.push(`after: "${state.after}"`);
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

  function composeQueryFromBuilder(state) {
    const obj = String(state?.object || '').trim();
    if (!obj) return '';
    const args = composeArgs(state || {});
    const selection = composeSelection(state?.fields);
    const pageInfo = state?.includePageInfo === false ? '' : ' pageInfo { endCursor hasNextPage }';
    return `query { uiapi { query { ${obj}${args} { edges { node { ${selection} } }${pageInfo} } } } }`;
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
      const cleaned = selectionMatch[1].replace(/\{\s*value\s*\}/g, '');
      builderState.fields = cleaned.split(/\s+/).map((f) => f.trim()).filter(Boolean);
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

      endpointUrl.textContent = '/services/data/v66.0/graphql';
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

  function renderFilters() {
    if (!filterContainer) return;
    filterContainer.innerHTML = '';
    (builderState.filters || []).forEach((f) => {
      const row = document.createElement('div');
      row.className = 'filter-row';
      const field = document.createElement('input');
      field.value = f.field || '';
      field.placeholder = 'Field';
      field.setAttribute('list', 'graphql-builder-field-list');
      const op = document.createElement('select');
      ['=', '!=', '>', '>=', '<', '<=', 'LIKE', 'IN'].forEach((o) => {
        const opt = document.createElement('option'); opt.value = o; opt.textContent = o; op.appendChild(opt);
      });
      op.value = f.op || '=';
      const val = document.createElement('input');
      val.placeholder = 'Value';
      val.value = f.value || '';
      const rm = document.createElement('button');
      rm.type = 'button';
      rm.className = 'icon-btn btn-sm filter-remove';
      rm.textContent = '✕';
      field.addEventListener('input', () => { f.field = field.value; handleBuilderChange({ writeQuery: true }); });
      op.addEventListener('change', () => { f.op = op.value; handleBuilderChange({ writeQuery: true }); });
      val.addEventListener('input', () => { f.value = val.value; handleBuilderChange({ writeQuery: true }); });
      rm.addEventListener('click', () => {
        builderState.filters = (builderState.filters || []).filter((x) => x.id !== f.id);
        handleBuilderChange({ writeQuery: true });
      });
      row.appendChild(field); row.appendChild(op); row.appendChild(val); row.appendChild(rm);
      filterContainer.appendChild(row);
    });
  }

  function renderOrder() {
    if (orderFieldInput) orderFieldInput.value = builderState.orderBy?.field || '';
    if (orderDirSel) orderDirSel.value = builderState.orderBy?.dir || 'asc';
  }

  function renderFieldListOptions(fields) {
    if (!fieldList) return;
    fieldList.innerHTML = '';
    (fields || []).forEach((name) => {
      const opt = document.createElement('option');
      opt.value = name;
      fieldList.appendChild(opt);
    });
  }

  async function refreshBuilderFields(objectName) {
    const obj = String(objectName || '').trim();
    if (!obj) { renderFieldListOptions([]); return; }
    const desc = await getSobjectDescribeCached(obj);
    const fields = Array.isArray(desc?.fields) ? desc.fields.map((f) => f.name).filter(Boolean).sort((a, b) => a.localeCompare(b)) : [];
    renderFieldListOptions(fields);
  }

  function syncBuilderUi(opts = {}) {
    const { loadFields = false } = opts;
    setBuilderVisibility(!!builderState.enabled);
    renderFieldChips();
    renderFilters();
    renderOrder();
    if (loadFields) refreshBuilderFields(builderState.object);
  }

  function writeQueryFromBuilder() {
    if (!builderState.enabled || !queryEl) return;
    const q = composeQueryFromBuilder(builderState);
    if (!q) { setBuilderStatus('Select an object to build a query.'); return; }

    // Auto-format the generated query for better readability
    const formattedQuery = formatGraphQL(q);
    queryEl.value = formattedQuery;

    // Update endpoint display
    updateEndpointDisplay();
    try { queryEl.dispatchEvent(new Event('input', { bubbles: true })); } catch {}
  }

  function getLimitOffsetValues() {
    const lim = Number(limitInput?.value || builderState.limit || 0);
    const off = Number(offsetInput?.value || 0);
    const after = (afterInput?.value || '').trim();
    return { limit: Number.isFinite(lim) && lim > 0 ? lim : 50, offset: Number.isFinite(off) && off >= 0 ? off : 0, after };
  }

  function handleBuilderChange(opts = {}) {
    const { writeQuery = true, loadFields = false } = opts;
    const { limit, offset, after } = getLimitOffsetValues();
    builderState.limit = limit;
    builderState.offset = offset;
    builderState.after = after;
    if (!builderState.object) setBuilderStatus('Select an object to build a query.');
    else if (!builderState.fields.length) setBuilderStatus('Add at least one field.');
    else setBuilderStatus('Builder ready');
    syncBuilderUi({ loadFields });
    if (writeQuery) {
      writeQueryFromBuilder();
      // Update run button state after writing query
      updateRunButtonState();
    }
    saveBuilderState();
  }

  function addFieldFromInput() {
    const val = (fieldInput?.value || '').trim();
    if (!val) return;
    if (!builderState.fields.includes(val)) builderState.fields.push(val);
    fieldInput.value = '';
    handleBuilderChange({ writeQuery: true });
  }

  function addFilterRow() {
    builderState.filters = builderState.filters || [];
    builderState.filters.push({ id: uid(), field: '', op: '=', value: '' });
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
    on(limitInput, 'input', () => handleBuilderChange({ writeQuery: true }));
    on(offsetInput, 'input', () => handleBuilderChange({ writeQuery: true }));
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
    on(addFilterBtn, 'click', addFilterRow);
    on(orderFieldInput, 'input', () => {
      const name = orderFieldInput.value.trim();
      builderState.orderBy = name ? { field: name, dir: orderDirSel?.value || 'asc' } : null;
      handleBuilderChange({ writeQuery: true });
    });
    on(orderDirSel, 'change', () => {
      if (!builderState.orderBy) builderState.orderBy = { field: orderFieldInput?.value || '', dir: orderDirSel.value };
      else builderState.orderBy.dir = orderDirSel.value;
      handleBuilderChange({ writeQuery: true });
    });
    on(clearOrderBtn, 'click', () => { builderState.orderBy = null; handleBuilderChange({ writeQuery: true }); });

    // Auto-format with debounce for manual input/paste
    let formatTimeout;
    on(queryEl, 'input', () => {
      if (builderToggle?.checked) {
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

  function populateObjects(names) {
    if (!objectSelect) {
      // New UI: populate object grid
      if (!graphqlObjectsGrid) return;

      const filteredNames = (names || []).filter(n => {
        const searchTerm = (graphqlObjectsSearch?.value || '').toLowerCase();
        return !searchTerm || n.toLowerCase().includes(searchTerm);
      });

      graphqlObjectsGrid.innerHTML = '';

      if (!filteredNames.length) {
        graphqlObjectsGrid.innerHTML = '<div class="placeholder-note" style="grid-column: 1/-1;">No objects found</div>';
        return;
      }

      filteredNames.forEach((name) => {
        const card = document.createElement('div');
        card.className = 'graphql-object-card';
        card.setAttribute('data-object', name);
        card.innerHTML = `
          <div class="graphql-object-icon">📦</div>
          <div class="graphql-object-name">${Utils.escapeHtml(name)}</div>
        `;
        card.addEventListener('click', () => {
          graphqlUIState.selectObject(name);
        });
        graphqlObjectsGrid.appendChild(card);
      });
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
    if (graphqlObjectsSearch) on(graphqlObjectsSearch, 'input', async () => {
      const { names } = await getDescribeCached();
      populateObjects(names);
    });

    await loadBuilderState();
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
  }

  try {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => init(), { once: true });
    else init();
  } catch { init(); }

function renderResult(ok, payload) {
    if (!resultsEl) return;
    if (!ok) {
      lastGraphQLResult = null;
      resultsEl.innerHTML = `<span class="log-badge error">ERROR</span>\n${Utils.escapeHtml(payload?.error || 'GraphQL failed')}`;
      updatePageInfoUI(null);
      return;
    }
    // Store result for expand/collapse
    lastGraphQLResult = payload?.data || payload;
    const pretty = Utils.escapeHtml(JSON.stringify(lastGraphQLResult, null, 2));
    resultsEl.innerHTML = `<span class="log-badge system">OK</span>\n${pretty}`;
    try {
      const obj = builderState.object;
      const pi = obj ? payload?.data?.uiapi?.query?.[obj]?.pageInfo : null;
      updatePageInfoUI(pi);
    } catch { updatePageInfoUI(null); }
  }

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
      on(clearBtn, 'click', () => { resultsEl.innerHTML = '<div class="placeholder-note">Cleared.</div>'; updatePageInfoUI(null); });
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
     };
   } catch {}

 })();

