// filepath: /Users/manas/IdeaProjects/sf-audit-extractor/soql_helper.js
import { Soql_helper_schema } from './soql_helper_schema.js';
import { Soql_helper_storage } from './soql_helper_storage.js';
import {
  getInstanceUrl,
  buildKeyPrefixMap,
  getClauseAtCursor,
  getSelectPhase,
  getFromPhase,
  validateFieldsMacro,
  sendMessageToSalesforceTab,
  buildColumnsUnion,
  recordsToCsv,
  downloadCsv,
  downloadExcel,
  linkifyInfoForValue
} from './soql_helper_utils.js';
import { ensureIdContextMenuWired, showIdContextMenu } from './soql_helper_dom.js';

let initialized = false;
let rules = {};

// Load rules used by the SOQL helper UI (fetch JSON or fall back to defaults)
async function loadRules(){
  const defaultRules = {
    keywords: ["SELECT","FROM","WHERE","GROUP BY","HAVING","ORDER BY","LIMIT","OFFSET","ASC","DESC","NULLS FIRST","NULLS LAST"],
    operators: ["=","!=","<","<=",">",">=","LIKE","IN","NOT IN","INCLUDES","EXCLUDES"],
    inlineValidators: [
      { id: 'requireSelectFrom', level: 'error', pattern: "^\\s*select\\b[\\s\\S]*\\bfrom\\b", negate: false, message: 'A SOQL query requires SELECT ... FROM ...' }
    ],
    suggestionProviders: {
      suggestLimitValues: { samples: ["10","50","100","200","500","2000"] },
      suggestOffsetValues: { samples: ["0","10","100","500"] }
    },
    apexFieldMacros: ["FIELDS(ALL)", "FIELDS(STANDARD)", "FIELDS(CUSTOM)"]
  };

  const candidates = [
    // Prefer the structured suggestions policy first so the suggester finds it before other tips
    'soql_suggestions_config.json',
    'soql_builder_tips.json'
  ];

  // Try fetching in browser/extension environment
  try {
    if (typeof fetch === 'function') {
      for (const name of candidates) {
        try {
          const url = new URL(`./rules/${name}`, import.meta.url);
          if (typeof console !== 'undefined' && console.debug) console.debug && console.debug('soql_helper: attempting to fetch rules', url.href);
          const res = await fetch(url, { cache: 'no-store' });
          if (res && res.ok) {
            const txt = await res.text();
            try { rules = JSON.parse(txt); if (console && console.debug) console.debug('soql_helper: loaded rules from', name); return rules; }
            catch (e) {
              const cleaned = txt.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
              rules = JSON.parse(cleaned);
              if (console && console.debug) console.debug('soql_helper: loaded rules (cleaned) from', name);
              return rules;
            }
          }
        } catch (e) { /* try next candidate */ if (console && console.debug) console.debug('soql_helper: fetch failed for', name, e && e.message ? e.message : e); }
      }
    }
  } catch (e) { if (console && console.debug) console.debug('soql_helper: fetch env threw', e && e.message ? e.message : e); /* ignore fetch errors and fallthrough to node fallback */ }

  // Node/test fallback: try reading files from process.cwd()/rules
  try {
    if (typeof process !== 'undefined' && process.cwd) {
      const fsMod = await import('fs');
      const pathMod = await import('path');
      const fs = fsMod && fsMod.default ? fsMod.default : fsMod;
      const path = pathMod && pathMod.default ? pathMod.default : pathMod;
      for (const name of candidates) {
        try {
          const p = path.resolve(process.cwd(), 'rules', name);
          if (fs.existsSync(p)) {
            if (console && console.debug) console.debug('soql_helper: reading rules file from', p);
            const txt = fs.readFileSync(p, 'utf8');
            const cleaned = txt.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
            rules = JSON.parse(cleaned);
            if (console && console.debug) console.debug('soql_helper: loaded rules from file', p);
            return rules;
          }
        } catch (e) { if (console && console.debug) console.debug('soql_helper: fs read failed for', name, e && e.message ? e.message : e); /* try next */ }
      }
    }
  } catch (e) { if (console && console.debug) console.debug('soql_helper: node fs fallback error', e && e.message ? e.message : e); /* ignore node fs errors */ }

  // Final fallback
  if (console && console.debug) console.debug('soql_helper: using default rules fallback');
  rules = defaultRules;
  return rules;
}

// DOM element references used throughout the module
const els = {
  editor: null,
  hints: null,
  errors: null,
  obj: null,
  run: null,
  clear: null,
  limit: null,
  results: null,
  autoFill: null,
  debug: null,
  debugToggle: null,
  useTooling: null
};

function qs(id) { return document.getElementById(id); }

// Attempt to find a suitable editor host element in a variety of environments.
function findEditorElement() {
  try {
    // Preferred: explicit id
    let el = document.getElementById('soql-editor');
    if (el) return el;

    // Common tag/component variants (note: querySelector lowercases tag names)
    el = document.querySelector('soqleditor, soql-editor');
    if (el) return resolveEditorHost(el);

    // Data attributes / classes that some integrations may use
    el = document.querySelector('[data-soql-editor], textarea.soql-editor, .soql-editor, #soqlEditor');
    if (el) return resolveEditorHost(el);

    // As a last-resort, find a visible textarea or contenteditable element that looks like an editor
    const candidate = Array.from(document.querySelectorAll('textarea, input[type="text"], [contenteditable="true"]')).find(c => {
      try {
        const t = (c.value || c.textContent || '').toString();
        // prefer elements that contain SQL keywords or are empty (likely editor)
        return /\bselect\b|\bfrom\b/i.test(t) || t.trim().length === 0;
      } catch { return false; }
    });
    if (candidate) return resolveEditorHost(candidate);
  } catch (e) { /* ignore and return null below */ }
  return null;

}
