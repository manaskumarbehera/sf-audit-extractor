// filepath: /Users/manas/IdeaProjects/sf-audit-extractor/soql_semantic_validator.js
function trimQuotes(s){
  if (s == null) return s;
  const t = String(s).trim();
  if ((t.startsWith("'") && t.endsWith("'")) || (t.startsWith('"') && t.endsWith('"'))) {
    return t.slice(1, -1);
  }
  return t;
}

function splitCsvRespectingParens(s){
  const out = [];
  let buf = '';
  let depth = 0;
  let inStr = false;
  let strQuote = '';
  for (let i=0;i<s.length;i++){
    const ch = s[i];
    if (inStr) {
      buf += ch;
      if (ch === strQuote && s[i-1] !== '\\') { inStr = false; strQuote = ''; }
      continue;
    }
    if (ch === '"' || ch === "'") { inStr = true; strQuote = ch; buf += ch; continue; }
    if (ch === '(') { depth++; buf += ch; continue; }
    if (ch === ')') { depth = Math.max(0, depth-1); buf += ch; continue; }
    if (ch === ',' && depth === 0) { out.push(buf.trim()); buf = ''; continue; }
    buf += ch;
  }
  if (buf.trim()) out.push(buf.trim());
  return out;
}

function extractClause(q, startKeyword, endKeywords){
  // Scan the string and find the first occurrence of startKeyword at top-level
  const Q = String(q || '');
  const sk = startKeyword.toUpperCase();
  const ekUpper = (endKeywords || []).map(k=>k.toUpperCase());
  let depth = 0, inStr = false, quote = '';
  let foundStartIndex = -1;
  for (let i = 0; i < Q.length; i++){
    const ch = Q[i];
    if (inStr){
      if (ch === quote && Q[i-1] !== '\\') inStr = false;
      continue;
    }
    if (ch === '"' || ch === "'") { inStr = true; quote = ch; continue; }
    if (ch === '(') { depth++; continue; }
    if (ch === ')') { depth = Math.max(0, depth-1); continue; }
    if (depth === 0){
      // check for keyword match at this position
      const rest = Q.slice(i);
      const m = rest.match(/^\s*([A-Za-z ]+)/);
      if (m){
        const token = m[1].trim().toUpperCase();
        if (token === sk){ foundStartIndex = i + rest.indexOf(m[1]) + m[1].length; break; }
      }
      // alternatively check direct match of the keyword with word boundary
      const direct = Q.slice(i).match(new RegExp(`^${startKeyword}\\b`, 'i'));
      if (direct) { foundStartIndex = i + direct[0].length; break; }
    }
  }
  if (foundStartIndex < 0) return null;
  // Now find earliest endKeyword at top-level after foundStartIndex
  let endIdx = Q.length;
  depth = 0; inStr = false; quote = '';
  for (let i = foundStartIndex; i < Q.length; i++){
    const ch = Q[i];
    if (inStr){
      if (ch === quote && Q[i-1] !== '\\') inStr = false;
      continue;
    }
    if (ch === '"' || ch === "'") { inStr = true; quote = ch; continue; }
    if (ch === '(') { depth++; continue; }
    if (ch === ')') { depth = Math.max(0, depth-1); continue; }
    if (depth === 0){
      for (const ek of ekUpper){
        const slice = Q.slice(i);
        const m = slice.match(new RegExp(`^\\s*${ek}\\b`, 'i'));
        if (m){ endIdx = i; i = Q.length; break; }
      }
    }
  }
  return Q.slice(foundStartIndex, endIdx).trim();
}

function parseQueryParts(query){
  const q = String(query||'');
  // FROM object
  let objectName = null;
  // Find the first top-level FROM (ignore FROM inside parentheses / subqueries)
  try {
    let depth = 0, inStr = false, quote = '';
    for (let i = 0; i < q.length; i++) {
      const ch = q[i];
      if (inStr) {
        if (ch === quote && q[i-1] !== '\\') inStr = false;
        continue;
      }
      if (ch === '"' || ch === "'") { inStr = true; quote = ch; continue; }
      if (ch === '(') { depth++; continue; }
      if (ch === ')') { depth = Math.max(0, depth - 1); continue; }
      if (depth === 0) {
        const rest = q.slice(i);
        const m = rest.match(/^FROM\s+([A-Za-z_][A-Za-z0-9_]*(?:__(?:c|kav|x))?)/i);
        if (m) { objectName = m[1]; break; }
      }
    }
  } catch(e) { /* fallback: leave objectName null */ }

  // SELECT fields (raw)
  let selectRaw = extractClause(q, 'SELECT', ['FROM']);
  const selectFields = [];
  const selectItems = selectRaw ? splitCsvRespectingParens(selectRaw) : [];
  for (const it of selectItems){
    const item = it.trim();
    if (!item) continue;
    selectFields.push(item);
  }

  const groupByRaw = extractClause(q, 'GROUP BY', ['HAVING','ORDER BY','LIMIT','OFFSET']);
  const groupByFields = groupByRaw ? splitCsvRespectingParens(groupByRaw).map(s=>s.trim()).filter(Boolean) : [];
  const hasGroupBy = groupByFields.length > 0;

  const havingRaw = extractClause(q, 'HAVING', ['ORDER BY','LIMIT','OFFSET']);
  const hasHaving = !!havingRaw;

  const orderByRaw = extractClause(q, 'ORDER BY', ['LIMIT','OFFSET']);
  const orderByFields = orderByRaw ? splitCsvRespectingParens(orderByRaw)
    .map(s=>s.trim().replace(/\s+(ASC|DESC)(\s+NULLS\s+(FIRST|LAST))?$/i,'').trim())
    .filter(Boolean) : [];

  // WHERE filters (very simple: field OP value), AND/OR separated at depth 0
  const whereRaw = extractClause(q, 'WHERE', ['GROUP BY','ORDER BY','LIMIT','OFFSET']);
  const filters = [];
  if (whereRaw) {
    let parts = [];
    // split by AND/OR at top-level (not inside quotes/parens)
    let buf = '';
    let depth = 0, inStr = false, quote = '';
    function pushBuf(){ if (buf.trim()) { parts.push(buf.trim()); buf = ''; } }
    for (let i=0;i<whereRaw.length;i++){
      const ch = whereRaw[i];
      if (inStr) {
        buf += ch;
        if (ch === quote && whereRaw[i-1] !== '\\') { inStr = false; quote = ''; }
        continue;
      }
      if (ch === '"' || ch === "'") { inStr = true; quote = ch; buf += ch; continue; }
      if (ch === '(') { depth++; buf += ch; continue; }
      if (ch === ')') { depth = Math.max(0, depth-1); buf += ch; continue; }
      // check for AND/OR when depth 0
      if (depth === 0) {
        const rest = whereRaw.slice(i);
        const m = rest.match(/^(\s+)(AND|OR)\b/i);
        if (m) { pushBuf(); i += m[0].length-1; continue; }
      }
      buf += ch;
    }
    pushBuf();

    // Match longer operator tokens first (NOT IN, INCLUDES, EXCLUDES) to avoid partial matches (e.g. IN in INCLUDES)
    const simpleCondRe = /^([A-Za-z_][A-Za-z0-9_.]*?)\s*(NOT\s+IN|INCLUDES|EXCLUDES|IN|NOT\s+LIKE|LIKE|!=|=|<=|<|>=|>)\s*(.+)$/i;
    for (const p of parts){
      const m = p.match(simpleCondRe);
      if (m) {
        const field = m[1].trim();
        const operator = m[2].toUpperCase();
        const rawValue = m[3].trim();
        filters.push({ field, operator, rawValue });
      }
    }
  }

  return { objectName, selectFields, groupByFields, hasGroupBy, hasHaving, orderByFields, filters };
}

function isAggregateExpr(expr){
  return /(COUNT|SUM|AVG|MIN|MAX)\s*\(/i.test(expr);
}

function validateSoql(query, describe){
  const errors = [];
  const parts = parseQueryParts(query);

  // Basic checks: SELECT MUST have fields
  if (!parts.selectFields || parts.selectFields.length === 0) {
    errors.push('SELECT list is empty');
  }

  // If object present but describe missing -> flag
  if (parts.objectName) {
    if (!describe) {
      errors.push(`Failed to retrieve describe for '${parts.objectName}'`);
    } else {
      const describedName = (describe.name || describe.objectName || describe.sobjectName || describe.sobject || '').toString();
      // If the caller provided a demo describe object (marker __demo), don't emit the unknown-object mismatch
      const isDemoDescribe = !!describe.__demo;
      if (describedName && describedName.toLowerCase() !== parts.objectName.toLowerCase() && !isDemoDescribe) {
        errors.push(`Unknown object '${parts.objectName}' (describe is for '${describedName}')`);
      }
    }
  }

  // Detect FIELDS(...) macro mixing and aggregate misuse
  try {
    const macroCount = parts.selectFields.filter(s=>/^FIELDS\s*\(/i.test(String(s))).length;
    if (macroCount > 0 && parts.selectFields.length > macroCount) {
      errors.push('FIELDS(...) cannot be mixed with explicit field names.');
    }
    // If macro present alongside aggregates -> invalid
    if (macroCount > 0 && parts.selectFields.some(isAggregateExpr)) {
      errors.push('FIELDS() macros cannot be used with aggregate functions.');
    }
  } catch (e) {}

  // ORDER BY must have at least one field when present
  if (/\bORDER\s+BY\b/i.test(query) && parts.orderByFields.length === 0) {
    errors.push('ORDER BY must specify at least one field');
  }

  // LIMIT parsing and validation
  try {
    const mLim = query.match(/\bLIMIT\s+(-?\d+)\b/i);
    if (mLim) {
      const lim = parseInt(mLim[1], 10);
      if (!Number.isFinite(lim) || lim < 0) errors.push('LIMIT must be a non-negative integer');
    }
    const mOffset = query.match(/\bOFFSET\s+(-?\d+)\b/i);
    if (mOffset && !mLim) errors.push('OFFSET requires a LIMIT to be specified');
  } catch (e) {}

  // Aggregates mixed with non-aggregates without GROUP BY
  try {
    const hasAgg = parts.selectFields.some(isAggregateExpr);
    if (hasAgg && !parts.hasGroupBy) {
      // allow aggregate-only queries like COUNT()
      const nonAgg = parts.selectFields.filter(s=>!isAggregateExpr(s)).filter(s=>!/^\(\s*/i.test(s);
      if (nonAgg.length > 0) {
        errors.push('Cannot mix aggregate and non-aggregate select items without GROUP BY');
      }
    }
  } catch (e) {}

  // GROUP BY rules: every non-aggregate select item must appear in GROUP BY
  try {
    if (parts.hasGroupBy) {
      const gbSet = new Set(parts.groupByFields.map(s=>s.toLowerCase()));
      for (const sf of parts.selectFields) {
        const s = String(sf||'').trim();
        if (s === '') continue;
        if (/^\s*\(/.test(s)) continue; // subquery
        if (isAggregateExpr(s)) continue;
        if (/^FIELDS\s*\(/i.test(s)) continue;
        // extract simple field name (ignore functions/aliases)
        const m = s.match(/^([A-Za-z_][A-Za-z0-9_.]*)/);
        const fld = m ? m[1].toLowerCase() : null;
        if (fld && !gbSet.has(fld)) {
          errors.push(`Non-aggregate select item '${s}' must appear in GROUP BY`);
        }
      }
    }
    // HAVING requires GROUP BY
    if (parts.hasHaving && !parts.hasGroupBy) {
      errors.push('HAVING clause requires a GROUP BY');
    }
  } catch(e) {}

  // Subquery checks (in SELECT and in WHERE IN)
  try {
    // SELECT subqueries: ensure no ORDER BY inside subqueries
    for (const sf of parts.selectFields) {
      const s = String(sf || '');
      if (/^\s*\(/.test(s) && /\bSELECT\b/i.test(s)) {
        if (/\bORDER\s+BY\b/i.test(s)) {
          errors.push('ORDER BY is not allowed inside subqueries');
        }
      }
    }
  } catch (e) {}

  // WHERE clause validations against describe
  if (describe && Array.isArray(describe.fields) && parts.filters.length){
    const fmap = new Map();
    for (const f of describe.fields) fmap.set(String(f.name||'').toLowerCase(), f);
    const idRe = /^[a-zA-Z0-9]{15,18}$/;
    const numRe = /^-?\d+(?:\.\d+)?$/;
    const dateLitRe = new RegExp('^' + (globalThis.soqlDateLiteralPattern || '(TODAY|YESTERDAY|TOMORROW|THIS_WEEK|LAST_WEEK|NEXT_WEEK|THIS_MONTH|LAST_MONTH|NEXT_MONTH|THIS_QUARTER|LAST_QUARTER|NEXT_QUARTER|THIS_YEAR|LAST_YEAR|NEXT_YEAR|LAST_N_DAYS:\\d+|NEXT_N_DAYS:\\d+|LAST_N_WEEKS:\\d+|NEXT_N_WEEKS:\\d+|LAST_N_MONTHS:\\d+|NEXT_N_MONTHS:\\d+|LAST_N_QUARTERS:\\d+|NEXT_N_QUARTERS:\\d+|LAST_N_YEARS:\\d+|NEXT_N_YEARS:\\d+)') + '$', 'i');

    function valuesFromRaw(raw){
      const t = raw.trim();
      if (t.startsWith('(') && t.endsWith(')')) {
        const inner = t.slice(1, -1);
        return splitCsvRespectingParens(inner).map(s=>s.trim());
      }
      return [t];
    }

    for (const cond of parts.filters){
      const fld = fmap.get(cond.field.toLowerCase());
      if (!fld) continue; // unknown field, skip schema checks
      const type = String(fld.type||'').toUpperCase();
      const vals = valuesFromRaw(cond.rawValue);

      // Special handling for IN-subqueries and invalid comparisons
      const rvTrim = cond.rawValue.trim();
      const isSubquery = /^\(\s*SELECT\b/i.test(rvTrim);
      if ((cond.operator === 'IN' || cond.operator === 'NOT IN') && isSubquery) {
        // parse inner SELECT ... FROM ...
        const innerMatch = rvTrim.match(/^\(\s*SELECT\s+([\s\S]+?)\s+FROM\s+([A-Za-z_][A-Za-z0-9_]*(?:__(?:c|kav|x))?)/i);
        if (innerMatch) {
          const innerSelect = innerMatch[1].trim();
          const innerFrom = innerMatch[2].trim();
          // ensure single field selected in inner query
          if (/,/.test(innerSelect)) {
            errors.push('Subquery used in IN(...) must select a single field');
          } else {
            // if inner selects Id but from different object -> likely incorrect (should select <Outer>Id)
            if (/^Id$/i.test(innerSelect) && parts.objectName && innerFrom && innerFrom.toLowerCase() !== parts.objectName.toLowerCase()) {
              errors.push(`Subquery in IN(...) must select a referencing field (e.g. ${parts.objectName}Id) rather than Id`);
            }
          }
          // ORDER BY not allowed inside inner subquery
          if (/\bORDER\s+BY\b/i.test(rvTrim)) {
            errors.push('ORDER BY is not allowed inside subqueries');
          }
        } else {
          errors.push('Malformed subquery used with IN/NOT IN');
        }
      }

      // For IN/INCLUDES/EXCLUDES ensure proper parentheses and no trailing comparisons
      if (/(IN|NOT IN|INCLUDES|EXCLUDES)/i.test(cond.operator)) {
        const rv = cond.rawValue.trim();
        if (!/^\(.*\)$/s.test(rv)) {
          if (!/^\(\s*SELECT\b/i.test(rv)) {
            errors.push(`Operator ${cond.operator} expects a parenthesized list or a subquery`);
          }
        }
        if (/[=<>]/.test(rv) && !/^\(\s*SELECT\b/i.test(rv)) {
          errors.push(`Unexpected comparison following ${cond.operator}`);
        }
      }

      for (const v of vals){
        const tv = v.trim();
        // NULL handling: equality to NULL using '=' is flagged
        if (/^null$/i.test(tv)) {
          if (cond.operator === '=') {
            errors.push(`Avoid using '=' to compare to NULL; use IS NULL / IS NOT NULL instead`);
          }
        }

        if (type === 'BOOLEAN') {
          // must be unquoted TRUE/FALSE
          if (!/^(TRUE|FALSE)$/i.test(tv)) errors.push(`Field '${fld.name}' expects a BOOLEAN (TRUE/FALSE).`);
          if ((tv.startsWith("'") && tv.endsWith("'")) || (tv.startsWith('"') && tv.endsWith('"'))) {
            errors.push(`Boolean value for '${fld.name}' should not be quoted`);
          }
        } else if (type === 'NUMBER' || type === 'CURRENCY' ) {
          if (!numRe.test(trimQuotes(tv))) errors.push(`Field '${fld.name}' expects a numeric value.`);
        } else if (type === 'DATE' || type === 'DATETIME') {
          // DATE literals must be unquoted and match allowed literals
          const valUnq = trimQuotes(tv);
          if ((tv.startsWith("'") && tv.endsWith("'")) || (tv.startsWith('"') && tv.endsWith('"'))) {
            errors.push(`Field '${fld.name}' expects an unquoted date literal (e.g., TODAY or LAST_N_DAYS:7), not a quoted string`);
          } else if (!dateLitRe.test(valUnq)) {
            errors.push(`Field '${fld.name}' expects a date literal (e.g., TODAY, LAST_N_DAYS:7).`);
          }
        } else if (type === 'ID' || type === 'REFERENCE') {
          const valUnq = trimQuotes(tv);
          if (!isSubquery && !idRe.test(valUnq)) errors.push(`Field '${fld.name}' expects a valid Salesforce Id (15 or 18 chars).`);
        } else {
          // STRING-like types
          if (/^(LIKE|NOT LIKE)$/i.test(cond.operator)) {
            // value must be a quoted string for LIKE
            if (!((tv.startsWith("'") && tv.endsWith("'")) || (tv.startsWith('"') && tv.endsWith('"')))) {
              errors.push(`Field '${fld.name}' with LIKE operator requires a quoted string (e.g. 'Acme%').`);
            }
          }
          if (/^(=|!=)$/i.test(cond.operator)) {
            // if RHS is not NULL and operator is equality on string-like fields, require quoted string
            if (!/^null$/i.test(tv) && !((tv.startsWith("'") && tv.endsWith("'")) || (tv.startsWith('"') && tv.endsWith('"')))) {
              // allow unquoted numbers handled earlier
              errors.push(`Field '${fld.name}' expects a quoted string value.`);
            }
          }
        }
      }
    }
  }

  return { ok: errors.length === 0, messages: errors, parts };
}

export { parseQueryParts, validateSoql };

