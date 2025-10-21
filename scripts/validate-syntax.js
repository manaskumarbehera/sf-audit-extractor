#!/usr/bin/env node

/**
 * JavaScript Syntax Validator
 * 
 * This script validates the syntax of all JavaScript files in the extension
 * and checks for common issues like unmatched brackets, parentheses, and braces.
 */

const fs = require('fs');
const path = require('path');

// ANSI color codes for terminal output
const colors = {
    reset: '\x1b[0m',
    bright: '\x1b[1m',
    red: '\x1b[31m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    cyan: '\x1b[36m'
};

const jsFiles = ['background.js', 'content.js', 'popup.js'];
let hasErrors = false;

console.log(`${colors.bright}${colors.cyan}=== JavaScript Syntax Validator ===${colors.reset}\n`);

/**
 * Validates JavaScript syntax using Node.js built-in parser
 */
function validateSyntax(filePath) {
    try {
        const content = fs.readFileSync(filePath, 'utf8');
        // Use eval with Function constructor - it will throw SyntaxError if invalid
        new Function(content);
        return { valid: true };
    } catch (error) {
        // Extract useful information from the error
        const match = error.message.match(/Unexpected token '(.+)'/) ||
                     error.message.match(/Unexpected (.+)/);
        const token = match ? match[1] : 'unknown';
        
        return { 
            valid: false, 
            error: error.message,
            token: token,
            stack: error.stack
        };
    }
}

/**
 * Checks for unmatched brackets, braces, and parentheses
 * This is a simplified check that doesn't account for all edge cases
 * but catches common issues
 */
function checkBracketBalance(filePath) {
    const content = fs.readFileSync(filePath, 'utf8');
    const issues = [];
    
    // Simple stack-based bracket matching
    const stack = [];
    const pairs = { '(': ')', '[': ']', '{': '}' };
    const opening = new Set(['(', '[', '{']);
    const closing = new Set([')', ']', '}']);
    
    let inString = false;
    let stringChar = '';
    let inComment = false;
    let commentType = '';
    let escape = false;
    let line = 1;
    let col = 0;
    
    for (let i = 0; i < content.length; i++) {
        const ch = content[i];
        const next = i < content.length - 1 ? content[i + 1] : '';
        const prev = i > 0 ? content[i - 1] : '';
        
        col++;
        if (ch === '\n') {
            line++;
            col = 0;
        }
        
        // Handle escape sequences in strings
        if (escape) {
            escape = false;
            continue;
        }
        
        if (inString && ch === '\\') {
            escape = true;
            continue;
        }
        
        // Handle strings
        if (!inComment && (ch === '"' || ch === "'" || ch === '`')) {
            if (!inString) {
                inString = true;
                stringChar = ch;
            } else if (ch === stringChar) {
                inString = false;
                stringChar = '';
            }
            continue;
        }
        
        // Skip if in string
        if (inString) continue;
        
        // Handle comments
        if (!inComment && ch === '/' && next === '/') {
            inComment = true;
            commentType = 'line';
            i++; // Skip next char
            continue;
        }
        
        if (!inComment && ch === '/' && next === '*') {
            inComment = true;
            commentType = 'block';
            i++; // Skip next char
            continue;
        }
        
        if (inComment && commentType === 'block' && ch === '*' && next === '/') {
            inComment = false;
            commentType = '';
            i++; // Skip next char
            continue;
        }
        
        if (inComment && commentType === 'line' && ch === '\n') {
            inComment = false;
            commentType = '';
            continue;
        }
        
        // Skip if in comment
        if (inComment) continue;
        
        // Check brackets
        if (opening.has(ch)) {
            stack.push({ char: ch, line, col });
        } else if (closing.has(ch)) {
            if (stack.length === 0) {
                issues.push({
                    type: 'unmatched_closing',
                    char: ch,
                    line,
                    col,
                    message: `Unmatched closing ${ch} at line ${line}, column ${col}`
                });
            } else {
                const last = stack.pop();
                const expected = pairs[last.char];
                if (expected !== ch) {
                    issues.push({
                        type: 'mismatched',
                        char: ch,
                        expected,
                        line,
                        col,
                        openLine: last.line,
                        openCol: last.col,
                        message: `Mismatched bracket: expected ${expected} but found ${ch} at line ${line}, column ${col} (opened at line ${last.line}, column ${last.col})`
                    });
                }
            }
        }
    }
    
    // Check for unclosed brackets
    stack.forEach(item => {
        issues.push({
            type: 'unclosed',
            char: item.char,
            line: item.line,
            col: item.col,
            message: `Unclosed ${item.char} from line ${item.line}, column ${item.col}`
        });
    });
    
    return issues;
}

/**
 * Checks for common IIFE pattern issues
 */
function checkIIFEPatterns(filePath) {
    const content = fs.readFileSync(filePath, 'utf8');
    const issues = [];
    
    // Check for extra parentheses before })();
    const extraParenPattern = /\)\s+\}\s*\)\s*\(\s*\)\s*;/g;
    let match;
    let line = 1;
    
    while ((match = extraParenPattern.exec(content)) !== null) {
        // Count newlines before match to get line number
        const beforeMatch = content.substring(0, match.index);
        line = (beforeMatch.match(/\n/g) || []).length + 1;
        
        issues.push({
            type: 'iife_extra_paren',
            line,
            pattern: match[0],
            message: `Possible extra parenthesis in IIFE pattern at line ${line}: "${match[0].trim()}"`
        });
    }
    
    return issues;
}

/**
 * Main validation function
 */
function validateFile(fileName) {
    const filePath = path.join(process.cwd(), fileName);
    
    if (!fs.existsSync(filePath)) {
        console.log(`${colors.yellow}⚠  Skipping ${fileName} (file not found)${colors.reset}`);
        return;
    }
    
    console.log(`${colors.bright}Validating ${fileName}...${colors.reset}`);
    
    // Check syntax
    const syntaxResult = validateSyntax(filePath);
    if (!syntaxResult.valid) {
        console.log(`${colors.red}✗ Syntax Error:${colors.reset} ${syntaxResult.error}`);
        if (syntaxResult.token) {
            console.log(`${colors.yellow}  Unexpected token: '${syntaxResult.token}'${colors.reset}`);
        }
        hasErrors = true;
        return;
    }
    
    // Check IIFE patterns
    const iifeIssues = checkIIFEPatterns(filePath);
    if (iifeIssues.length > 0) {
        console.log(`${colors.yellow}⚠  Potential IIFE Issues:${colors.reset}`);
        iifeIssues.forEach(issue => {
            console.log(`  ${colors.yellow}•${colors.reset} ${issue.message}`);
        });
        // Note: These are warnings, not errors
    }
    
    // File is valid
    console.log(`${colors.green}✓ No syntax errors found${colors.reset}`);
    
    // Get file stats
    const stats = fs.statSync(filePath);
    const content = fs.readFileSync(filePath, 'utf8');
    const lines = content.split('\n').length;
    console.log(`${colors.cyan}  Lines: ${lines}, Size: ${(stats.size / 1024).toFixed(2)} KB${colors.reset}\n`);
}

// Run validation on all files
jsFiles.forEach(validateFile);

// Summary
console.log(`${colors.bright}${colors.cyan}=== Validation Summary ===${colors.reset}`);
if (hasErrors) {
    console.log(`${colors.red}✗ Validation failed. Please fix the errors above.${colors.reset}`);
    process.exit(1);
} else {
    console.log(`${colors.green}✓ All files passed validation.${colors.reset}`);
    process.exit(0);
}
