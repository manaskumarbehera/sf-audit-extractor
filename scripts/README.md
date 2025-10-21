# Scripts Directory

This directory contains utility scripts for the Salesforce Audit Trail Extractor extension.

## Available Scripts

### validate-syntax.js

**Purpose**: Validates JavaScript syntax for all source files in the extension.

**Usage**:
```bash
node scripts/validate-syntax.js
```

Or via NPM:
```bash
npm run validate
npm run lint
npm test
```

**Features**:
- Validates JavaScript syntax using Node.js built-in parser
- Colorized terminal output (green for success, red for errors)
- File statistics (line count, size)
- Exit code 0 on success, 1 on failure (CI/CD friendly)

**Files Validated**:
- background.js
- content.js
- popup.js

**Output Example**:
```
=== JavaScript Syntax Validator ===

Validating background.js...
✓ No syntax errors found
  Lines: 397, Size: 15.12 KB

Validating content.js...
✓ No syntax errors found
  Lines: 104, Size: 3.61 KB

Validating popup.js...
✓ No syntax errors found
  Lines: 2588, Size: 117.27 KB

=== Validation Summary ===
✓ All files passed validation.
```

**Error Example**:
```
Validating popup.js...
✗ Syntax Error: Unexpected token ')'
  Unexpected token: ')'
```

## Integration

### Package.json Scripts

```json
{
  "scripts": {
    "validate": "node scripts/validate-syntax.js",
    "lint": "node scripts/validate-syntax.js",
    "test": "node scripts/validate-syntax.js"
  }
}
```

### CI/CD

Use in GitHub Actions, GitLab CI, or other CI/CD systems:

```yaml
- name: Validate JavaScript
  run: npm run validate
```

The script exits with code 0 on success and code 1 on failure, making it suitable for automated pipelines.

### Pre-commit Hook

Add to `.git/hooks/pre-commit`:

```bash
#!/bin/bash
npm run validate || exit 1
```

## Development Workflow

1. **Before coding**: Review existing patterns
2. **While coding**: Follow project conventions
3. **Before committing**: Run `npm run validate`
4. **If errors**: Fix and re-validate
5. **When passing**: Commit changes

## Related Documentation

- [TROUBLESHOOTING_JS_ERRORS.md](../TROUBLESHOOTING_JS_ERRORS.md) - Detailed troubleshooting
- [SYNTAX_ERROR_QUICK_REF.md](../SYNTAX_ERROR_QUICK_REF.md) - Quick reference
- [DEVELOPMENT.md](../DEVELOPMENT.md) - Development guide

## Future Scripts

Potential additions:
- ESLint integration
- Prettier formatting
- Bundle size analyzer
- Dependency checker
- Security scanner
- Performance profiler

## Requirements

- Node.js 12.0.0 or higher
- No external dependencies (uses built-in Node.js APIs)

## Troubleshooting

### Script not found
```bash
# Make script executable
chmod +x scripts/validate-syntax.js

# Run with node
node scripts/validate-syntax.js
```

### Permission denied
```bash
# Run with explicit node command
node scripts/validate-syntax.js
```

### Colors not showing
Some terminals don't support ANSI colors. The script still works; you just won't see colored output.

## Contributing

When adding new scripts:
1. Add to this README
2. Update package.json if applicable
3. Document usage and purpose
4. Include error handling
5. Test on multiple platforms
6. Make executable (`chmod +x`)

---

*See [SYNTAX_ERROR_PREVENTION_SUMMARY.md](../SYNTAX_ERROR_PREVENTION_SUMMARY.md) for complete system overview*
