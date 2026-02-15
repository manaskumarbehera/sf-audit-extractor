#!/usr/bin/env node
/**
 * update-docs-version.js
 *
 * Automatically updates all documentation files with new version information.
 *
 * Usage:
 *   node scripts/update-docs-version.js
 *   node scripts/update-docs-version.js --changelog "New feature X, Fixed bug Y"
 *
 * This script reads the version from manifest.json and updates:
 *   - docs/index.html
 *   - docs/documentation.html
 *   - docs/help.html
 *   - docs/quick-start-guide.html
 *   - docs/privacy-policy.html
 *   - popup.html
 *   - build/popup.html
 *   - DOCUMENTATION/html/*.html
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configuration
const ROOT_DIR = path.join(__dirname, '..');
const DOCS_DIR = path.join(ROOT_DIR, 'docs');
const DOCUMENTATION_HTML_DIR = path.join(ROOT_DIR, 'DOCUMENTATION', 'html');

// Get current date formatted (e.g., "February 14, 2026")
function getFormattedDate() {
    const date = new Date();
    const months = ['January', 'February', 'March', 'April', 'May', 'June',
                    'July', 'August', 'September', 'October', 'November', 'December'];
    return `${months[date.getMonth()]} ${date.getDate()}, ${date.getFullYear()}`;
}

// Get short date (e.g., "February 2026")
function getShortDate() {
    const date = new Date();
    const months = ['January', 'February', 'March', 'April', 'May', 'June',
                    'July', 'August', 'September', 'October', 'November', 'December'];
    return `${months[date.getMonth()]} ${date.getFullYear()}`;
}

// Read manifest.json to get current version
function getVersionFromManifest() {
    const manifestPath = path.join(ROOT_DIR, 'manifest.json');
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    return manifest.version;
}

// Parse changelog from command line arguments
function getChangelogFromArgs() {
    const args = process.argv.slice(2);
    const changelogIndex = args.indexOf('--changelog');
    if (changelogIndex !== -1 && args[changelogIndex + 1]) {
        return args[changelogIndex + 1].split(',').map(item => item.trim());
    }
    return null;
}

// Update version badge in HTML files
function updateVersionBadge(content, version) {
    let updated = content;
    // Various version badge patterns
    updated = updated.replace(/(<span class="version-badge">Version )\d+\.\d+\.\d+(<\/span>)/g, `$1${version}$2`);
    updated = updated.replace(/(<span class="version-badge">v)\d+\.\d+\.\d+(<\/span>)/g, `$1${version}$2`);
    updated = updated.replace(/(Version )\d+\.\d+\.\d+( \| )/g, `$1${version}$2`);
    updated = updated.replace(/(about-version">Version )\d+\.\d+\.\d+(<\/span>)/g, `$1${version}$2`);
    return updated;
}

// Update "Last updated" dates
function updateLastUpdatedDate(content, formattedDate) {
    let updated = content;
    updated = updated.replace(/(Last updated: )[A-Za-z]+ \d+, \d{4}/g, `$1${formattedDate}`);
    updated = updated.replace(/(last-updated">Last updated: )[A-Za-z]+ \d+, \d{4}/g, `$1${formattedDate}`);
    return updated;
}

// Update version selector dropdown options
function updateVersionSelector(content, version, previousVersions = []) {
    const allVersions = [version, ...previousVersions].slice(0, 6);

    // Pattern 1: documentation.html style (simple options)
    const selectorRegex1 = /(<select id="version-select"[^>]*onchange[^>]*>)([\s\S]*?)(<\/select>)/g;

    // Pattern 2: index.html style (options with inline styles)
    const selectorRegex2 = /(<select id="version-select"[^>]*>)([\s\S]*?)(<\/select>)/g;

    let updated = content;

    // Check if it's the index.html format (has inline styles in options)
    if (content.includes('style="color:#333;background:white;"')) {
        updated = content.replace(selectorRegex2, (match, openTag, options, closeTag) => {
            const newOptions = allVersions.map((v, i) => {
                const isLatest = i === 0;
                const label = isLatest ? `v${v} (Latest)` : `v${v}`;
                return `\n                <option value="${v}" style="color:#333;background:white;">${label}</option>`;
            }).join('');
            return `${openTag}${newOptions}\n            ${closeTag}`;
        });
    } else {
        // documentation.html format
        updated = content.replace(selectorRegex1, (match, openTag, options, closeTag) => {
            const newOptions = allVersions.map((v, i) => {
                const isLatest = i === 0;
                const selected = isLatest ? ' selected' : '';
                const label = isLatest ? `v${v} (Latest)` : `v${v}`;
                return `\n                <option value="${v}"${selected}>${label}</option>`;
            }).join('');
            return `${openTag}${newOptions}\n            ${closeTag}`;
        });
    }

    return updated;
}

// Update footer version
function updateFooterVersion(content, version, shortDate) {
    let updated = content;
    updated = updated.replace(/(TrackForcePro v)\d+\.\d+\.\d+/g, `$1${version}`);
    updated = updated.replace(/(Version )\d+\.\d+\.\d+( \| [A-Za-z]+ \d{4})/g, `$1${version} | ${shortDate}`);
    return updated;
}

// Update features section title
function updateFeaturesTitle(content, version) {
    return content.replace(/(Key Features \(v)\d+\.\d+\.\d+(\))/g, `$1${version}$2`);
}

// Fix file naming conventions (uppercase to lowercase with hyphens)
function fixFileNamingConventions(content) {
    let updated = content;
    // Fix QUICK_START_GUIDE.html references
    updated = updated.replace(/QUICK_START_GUIDE\.html/g, 'quick-start-guide.html');
    return updated;
}

// Update README.md version header
function updateReadmeVersion(content, version, formattedDate) {
    let updated = content;
    // Update "**Current Version: X.X.X** | **Release Date: Month Day, Year**"
    updated = updated.replace(
        /(\*\*Current Version: )\d+\.\d+\.\d+(\*\* \| \*\*Release Date: )[A-Za-z]+ \d+, \d{4}(\*\*)/g,
        `$1${version}$2${formattedDate}$3`
    );
    return updated;
}

// Update Recent Changes section in index.html
function updateRecentChanges(content, version, formattedDate, changelog) {
    if (!changelog || changelog.length === 0) return content;

    const changelogItems = changelog.map(item => `<li>${item}</li>`).join('\n                    ');
    const newChangesSection = `<h4 style="color: var(--primary-color); margin-bottom: 10px;">v${version} - ${formattedDate}</h4>
                <ul style="margin-left: 20px; color: var(--text-muted);">
                    ${changelogItems}
                </ul>`;

    const recentChangesRegex = /(<h4 style="color: var\(--primary-color\); margin-bottom: 10px;">v)\d+\.\d+\.\d+( - [A-Za-z]+ \d+, \d{4}<\/h4>[\s\S]*?<\/ul>)/;

    if (recentChangesRegex.test(content)) {
        return content.replace(recentChangesRegex, newChangesSection);
    }
    return content;
}

// Main update function for a single file
function updateFile(filePath, version, formattedDate, shortDate, changelog, previousVersions) {
    if (!fs.existsSync(filePath)) {
        console.log(`  ⚠️  File not found: ${filePath}`);
        return false;
    }

    let content = fs.readFileSync(filePath, 'utf8');
    const originalContent = content;

    const fileName = path.basename(filePath);
    const ext = path.extname(filePath).toLowerCase();

    // Handle Markdown files differently
    if (ext === '.md') {
        content = updateReadmeVersion(content, version, formattedDate);
        content = fixFileNamingConventions(content);
    } else {
        // Apply HTML updates
        content = updateVersionBadge(content, version);
        content = updateLastUpdatedDate(content, formattedDate);
        content = updateFooterVersion(content, version, shortDate);
        content = updateFeaturesTitle(content, version);
        content = fixFileNamingConventions(content);

        // Special updates for specific files
        if (fileName === 'index.html' || fileName === 'documentation.html') {
            content = updateVersionSelector(content, version, previousVersions);
        }

        if (fileName === 'index.html' && changelog) {
            content = updateRecentChanges(content, version, formattedDate, changelog);
        }
    }

    // Only write if content changed
    if (content !== originalContent) {
        fs.writeFileSync(filePath, content, 'utf8');
        return true;
    }
    return false;
}

// Get previous versions from documentation.html
function getPreviousVersions(docsDir) {
    const docPath = path.join(docsDir, 'documentation.html');
    if (!fs.existsSync(docPath)) {
        return ['1.1.13', '1.1.12', '1.1.2', '1.1.1', '1.1.0'];
    }

    const content = fs.readFileSync(docPath, 'utf8');
    const versionRegex = /content-(\d+\.\d+\.\d+)/g;
    const versions = [];
    let match;

    while ((match = versionRegex.exec(content)) !== null) {
        if (!versions.includes(match[1])) versions.push(match[1]);
    }

    // Sort versions descending
    return versions.sort((a, b) => {
        const partsA = a.split('.').map(Number);
        const partsB = b.split('.').map(Number);
        for (let i = 0; i < 3; i++) {
            if (partsA[i] !== partsB[i]) return partsB[i] - partsA[i];
        }
        return 0;
    });
}

// Main execution
function main() {
    console.log('\n🔄 TrackForcePro Documentation Version Updater\n');
    console.log('='.repeat(50));

    // Get version and dates
    const version = getVersionFromManifest();
    const formattedDate = getFormattedDate();
    const shortDate = getShortDate();
    const changelog = getChangelogFromArgs();

    console.log(`\n📦 Version: ${version}`);
    console.log(`📅 Date: ${formattedDate}`);

    if (changelog) {
        console.log(`📝 Changelog entries: ${changelog.length}`);
        changelog.forEach(item => console.log(`   - ${item}`));
    }

    console.log('\n' + '-'.repeat(50));
    console.log('Updating files...\n');

    // Get previous versions
    const previousVersions = getPreviousVersions(DOCS_DIR).filter(v => v !== version);

    // Files to update
    const filesToUpdate = [
        path.join(DOCS_DIR, 'index.html'),
        path.join(DOCS_DIR, 'documentation.html'),
        path.join(DOCS_DIR, 'help.html'),
        path.join(DOCS_DIR, 'quick-start-guide.html'),
        path.join(DOCS_DIR, 'privacy-policy.html'),
        path.join(ROOT_DIR, 'popup.html'),
        path.join(ROOT_DIR, 'build', 'popup.html'),
        // DOCUMENTATION/html folder
        path.join(DOCUMENTATION_HTML_DIR, 'index.html'),
        path.join(DOCUMENTATION_HTML_DIR, 'quick-start-guide.html'),
        path.join(DOCUMENTATION_HTML_DIR, 'privacy-policy.html'),
        // README.md files
        path.join(ROOT_DIR, 'DOCUMENTATION', 'README.md'),
        path.join(ROOT_DIR, 'DOCUMENTATION', 'README_MAIN.md'),
    ];

    let updatedCount = 0;

    filesToUpdate.forEach(filePath => {
        const relativePath = path.relative(ROOT_DIR, filePath);
        const updated = updateFile(filePath, version, formattedDate, shortDate, changelog, previousVersions);

        if (updated) {
            console.log(`  ✅ Updated: ${relativePath}`);
            updatedCount++;
        } else {
            console.log(`  ⏭️  No changes: ${relativePath}`);
        }
    });

    console.log('\n' + '-'.repeat(50));
    console.log(`\n✨ Done! Updated ${updatedCount} file(s).\n`);

    // Reminder for manual steps
    console.log('📋 Reminder: You may still need to manually update:');
    console.log('   - documentation.html: Add new version content section if needed');
    console.log('   - Changelog details in documentation.html');
    console.log('   - Run build.sh to update build/ folder\n');
}

// Run the script
main();

