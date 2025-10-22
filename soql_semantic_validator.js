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
  const reStart = new RegExp(`\\b${startKeyword}\\b`, 'i');
  const m = q.match(reStart);
  if (!m) return null;
  const start = m.index + m[0].length;
  let rest = q.slice(start);
  let earliest = rest.length;
  for (const kw of endKeywords){
    const idx = rest.search(new RegExp(`\\b${kw}\\b`, 'i'));
    if (idx >= 0 && idx < earliest) earliest = idx;
  }
  return rest.slice(0, earliest).trim();
}

function parseQueryParts(query){
  const q = String(query||'');
  // FROM object
  let objectName = null;
  const fromRe = /\bFROM\s+([A-Za-z_][A-Za-z0-9_]*(?:__(?:c|kav|x))?)/i;
  const fm = q.match(fromRe);
  if (fm) objectName = fm[1];

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

    const simpleCondRe = /^([A-Za-z_][A-Za-z0-9_.]*?)\s*(=|!=|<|<=|>|>=|LIKE|NOT LIKE|IN|NOT IN|INCLUDES|EXCLUDES)\s*(.+)$/i;
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

  // GROUP BY validations
  if (parts.hasGroupBy) {
    const grouped = new Set(parts.groupByFields.map(s=>s.toLowerCase()));
    for (const sf of parts.selectFields){
      if (isAggregateExpr(sf)) continue;
      // handle alias: Field AS alias -> extract before AS
      const base = sf.replace(/\s+AS\s+.+$/i,'').trim();
      if (!grouped.has(base.toLowerCase())) {
        errors.push(`Non-aggregated field '${base}' must appear in GROUP BY.`);
      }
    }
  }

  // HAVING requires GROUP BY
  if (parts.hasHaving && !parts.hasGroupBy) {
    errors.push('HAVING requires GROUP BY');
  }

  // ORDER BY fields exist
  if (describe && describe.fields && parts.orderByFields.length) {
    const fieldSet = new Set(describe.fields.map(f=>String(f.name||'').toLowerCase()));
    for (const ofld of parts.orderByFields){
      if (!fieldSet.has(ofld.toLowerCase())) errors.push(`ORDER BY field '${ofld}' is not in schema`);
    }
  }

  // WHERE value types match
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
      if (!fld) continue; // unknown field, skip
      const type = String(fld.type||'').toUpperCase();
      const vals = valuesFromRaw(cond.rawValue);
      for (const v of vals){
        const tv = v.trim();
        if (type === 'BOOLEAN') {
          if (!/^TRUE|FALSE$/i.test(tv)) errors.push(`Field '${fld.name}' expects a BOOLEAN (TRUE/FALSE).`);
        } else if (type === 'NUMBER' || type === 'CURRENCY' ) {
          if (!numRe.test(trimQuotes(tv))) errors.push(`Field '${fld.name}' expects a numeric value.`);
        } else if (type === 'DATE' || type === 'DATETIME') {
          const val = trimQuotes(tv);
          if (!dateLitRe.test(val)) errors.push(`Field '${fld.name}' expects a date literal (e.g., TODAY, LAST_N_DAYS:7).`);
        } else if (type === 'ID' || type === 'REFERENCE') {
          const val = trimQuotes(tv);
          if (!idRe.test(val)) errors.push(`Field '${fld.name}' expects a valid Salesforce Id (15 or 18 chars).`);
        } else {
          // STRING-like types: ensure quotes for equality operators
          if (/^(=|!=)$/i.test(cond.operator)) {
            if (!(tv.startsWith("'") && tv.endsWith("'"))) errors.push(`Field '${fld.name}' expects a quoted string.`);
          }
        }
      }
    }
  }

  return { ok: errors.length === 0, messages: errors, parts };
}

export { parseQueryParts, validateSoql };
