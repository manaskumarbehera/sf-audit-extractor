// Minimal SOQL utilities stub — disables runtime SOQL features while preserving API.
let _instanceUrlCache = null;
export async function sendMessageToSalesforceTab(message){ return null; }
export async function getInstanceUrl(){ return _instanceUrlCache; }
export function getClauseAtCursor(txt, pos) { return 'START'; }
export function getSelectPhase(txt, pos) { return 'FIELD'; }
export function getFromPhase(txt, pos) { return 'OBJECT'; }
export function getGroupByPhase(txt, pos) { return 'FIELD'; }
export function getWherePhase(txt, pos) { return 'FIELD'; }
export function getOrderByPhase(txt, pos) { return 'FIELD'; }
export function prefixFilter(list, prefix) { try { return Array.from(list || []); } catch { return []; } }
export function prefixFilterFlexible(list, prefix) { try { return Array.from(list || []); } catch { return []; } }
export function getSelectSegment(query) { return ''; }
export function hasTopLevelFieldsMacro(query) { return false; }
export function validateFieldsMacro(query) { return null; }
export async function getFieldsForObject(objName, useTooling = false) { return []; }
export async function getRelationshipMeta(objName, useTooling = false){ return { relMap: new Map(), relNames: new Set() }; }
export async function getFieldsForRelationship(objName, relName, useTooling = false){ return []; }
export function buildKeyPrefixMap(useTooling = false) { return new Map(); }
export function clearSchemaCaches(){ /* no-op */ }
export function buildColumnsUnion(records) { try { if (!Array.isArray(records) || records.length === 0) return []; return Object.keys(records[0] || {}); } catch { return []; } }
export function recordsToCsv(records, cols){ try { const h = (cols||[]).join(','); return h + '\n'; } catch { return ''; } }
export function downloadCsv(filename, csvContent){ /* no-op */ }
export function downloadExcel(filename, cols, records){ /* no-op */ }
export function linkifyInfoForValue(val, instanceBase){ try { return { isLink: false, href: null, text: String(val == null ? '' : val) }; } catch { return { isLink:false, href:null, text: '' }; } }
export function createSfIdLink(id, label, text){ try { if (typeof document !== 'undefined') { const a = document.createElement('a'); a.textContent = String(text || id || ''); return a; } return { textContent: String(text || id || '') }; } catch { return { textContent: String(text || id || '') }; } }
export function fallbackCopyText(text){ try { if (typeof navigator !== 'undefined' && navigator.clipboard && typeof navigator.clipboard.writeText === 'function') { navigator.clipboard.writeText(String(text || '')); } } catch {} }
export function getObjectLabelByKeyPrefix(prefix){ return ''; }
export function isSalesforceIdValue(fieldName, value){ try { if (!value) return false; if (typeof value === 'string') return /^[a-zA-Z0-9]{15,18}$/.test(value); if (typeof value === 'object' && typeof value.Id === 'string') return /^[a-zA-Z0-9]{15,18}$/.test(value.Id); return false; } catch { return false; } }
export function getByPath(obj, pathArr){ try { if (!obj || !Array.isArray(pathArr)) return null; let cur = obj; for (const seg of pathArr) { if (cur == null) return null; cur = cur[seg]; } return cur === undefined ? null : cur; } catch { return null; } }
export function toCSV(resp, parts, describe){ try { return ''; } catch { return ''; } }
export function toExcelHTML(resp, parts, describe){ try { return ''; } catch { return ''; } }
export async function openRecordInNewTab(id){ /* no-op */ }
