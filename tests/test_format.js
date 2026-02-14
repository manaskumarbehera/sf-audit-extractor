// Test formatGraphQL function
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
        // Add newline after closing brace unless next is also closing
        if (nextChar && nextChar !== '}' && nextChar !== ')' && nextChar !== '\n') {
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

const input = 'query { uiapi { query { Opportunity(first: 50) { edges { node { Id AccountId { value } } } pageInfo { endCursor hasNextPage } } } } }';
console.log('INPUT:');
console.log(input);
console.log('\nFORMATTED:');
console.log(formatGraphQL(input));

