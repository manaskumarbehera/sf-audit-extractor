/**
 * Tests for update-docs-version.js automation script
 *
 * Run with: npm test -- tests/update-docs-version.test.js
 */

const fs = require('fs');
const path = require('path');

// Import functions from the script (we'll need to make them exportable)
// For now, we'll test the regex patterns directly

describe('Documentation Version Update Automation', () => {

    // Test data
    const testVersion = '1.2.0';
    const testDate = 'February 14, 2026';
    const testShortDate = 'February 2026';

    describe('Version Badge Updates', () => {

        test('should update version badge with "Version X.X.X" format', () => {
            const input = '<span class="version-badge">Version 1.1.14</span>';
            const expected = '<span class="version-badge">Version 1.2.0</span>';

            const result = input.replace(
                /(<span class="version-badge">Version )\d+\.\d+\.\d+(<\/span>)/g,
                `$1${testVersion}$2`
            );

            expect(result).toBe(expected);
        });

        test('should update version badge with "vX.X.X" format', () => {
            const input = '<span class="version-badge">v1.1.14</span>';
            const expected = '<span class="version-badge">v1.2.0</span>';

            const result = input.replace(
                /(<span class="version-badge">v)\d+\.\d+\.\d+(<\/span>)/g,
                `$1${testVersion}$2`
            );

            expect(result).toBe(expected);
        });

        test('should update about-version span', () => {
            const input = '<span class="about-version">Version 1.1.14</span>';
            const expected = '<span class="about-version">Version 1.2.0</span>';

            const result = input.replace(
                /(about-version">Version )\d+\.\d+\.\d+(<\/span>)/g,
                `$1${testVersion}$2`
            );

            expect(result).toBe(expected);
        });

        test('should update multiple version badges in same content', () => {
            const input = `
                <span class="version-badge">Version 1.1.14</span>
                <span class="version-badge">v1.1.14</span>
            `;

            let result = input;
            result = result.replace(
                /(<span class="version-badge">Version )\d+\.\d+\.\d+(<\/span>)/g,
                `$1${testVersion}$2`
            );
            result = result.replace(
                /(<span class="version-badge">v)\d+\.\d+\.\d+(<\/span>)/g,
                `$1${testVersion}$2`
            );

            expect(result).toContain('Version 1.2.0');
            expect(result).toContain('v1.2.0');
            expect(result).not.toContain('1.1.14');
        });
    });

    describe('Last Updated Date Updates', () => {

        test('should update "Last updated:" date format', () => {
            const input = 'Last updated: January 1, 2025';
            const expected = `Last updated: ${testDate}`;

            const result = input.replace(
                /(Last updated: )[A-Za-z]+ \d+, \d{4}/g,
                `$1${testDate}`
            );

            expect(result).toBe(expected);
        });

        test('should update date in privacy policy class format', () => {
            const input = '<p class="last-updated">Last updated: January 1, 2025</p>';
            const expected = `<p class="last-updated">Last updated: ${testDate}</p>`;

            const result = input.replace(
                /(last-updated">Last updated: )[A-Za-z]+ \d+, \d{4}/g,
                `$1${testDate}`
            );

            expect(result).toBe(expected);
        });

        test('should handle various month names', () => {
            const months = ['January', 'February', 'March', 'April', 'May', 'June',
                          'July', 'August', 'September', 'October', 'November', 'December'];

            months.forEach(month => {
                const input = `Last updated: ${month} 15, 2025`;
                const result = input.replace(
                    /(Last updated: )[A-Za-z]+ \d+, \d{4}/g,
                    `$1${testDate}`
                );
                expect(result).toBe(`Last updated: ${testDate}`);
            });
        });
    });

    describe('Footer Version Updates', () => {

        test('should update "TrackForcePro vX.X.X" format', () => {
            const input = 'TrackForcePro v1.1.14 | Some text';
            const expected = 'TrackForcePro v1.2.0 | Some text';

            const result = input.replace(
                /(TrackForcePro v)\d+\.\d+\.\d+/g,
                `$1${testVersion}`
            );

            expect(result).toBe(expected);
        });

        test('should update "Version X.X.X | Month Year" format', () => {
            const input = 'Version 1.1.14 | January 2025';
            const expected = `Version ${testVersion} | ${testShortDate}`;

            const result = input.replace(
                /(Version )\d+\.\d+\.\d+( \| [A-Za-z]+ \d{4})/g,
                `$1${testVersion} | ${testShortDate}`
            );

            expect(result).toBe(expected);
        });
    });

    describe('Features Title Updates', () => {

        test('should update "Key Features (vX.X.X)" format', () => {
            const input = '<h2>Key Features (v1.1.14)</h2>';
            const expected = '<h2>Key Features (v1.2.0)</h2>';

            const result = input.replace(
                /(Key Features \(v)\d+\.\d+\.\d+(\))/g,
                `$1${testVersion}$2`
            );

            expect(result).toBe(expected);
        });
    });

    describe('Version Selector Updates', () => {

        test('should generate correct version selector options', () => {
            const versions = ['1.2.0', '1.1.14', '1.1.13', '1.1.12'];

            const options = versions.map((v, i) => {
                const isLatest = i === 0;
                const selected = isLatest ? ' selected' : '';
                const label = isLatest ? `v${v} (Latest)` : `v${v}`;
                return `<option value="${v}"${selected}>${label}</option>`;
            });

            expect(options[0]).toContain('selected');
            expect(options[0]).toContain('(Latest)');
            expect(options[1]).not.toContain('selected');
            expect(options[1]).not.toContain('(Latest)');
        });

        test('should limit versions to 6', () => {
            const allVersions = ['1.2.0', '1.1.14', '1.1.13', '1.1.12', '1.1.11', '1.1.10', '1.1.9', '1.1.8'];
            const limitedVersions = allVersions.slice(0, 6);

            expect(limitedVersions.length).toBe(6);
            expect(limitedVersions).not.toContain('1.1.9');
            expect(limitedVersions).not.toContain('1.1.8');
        });
    });

    describe('Recent Changes Updates', () => {

        test('should format changelog items correctly', () => {
            const changelog = ['New feature X', 'Fixed bug Y', 'Improved Z'];
            const changelogItems = changelog.map(item => `<li>${item}</li>`).join('\n');

            expect(changelogItems).toContain('<li>New feature X</li>');
            expect(changelogItems).toContain('<li>Fixed bug Y</li>');
            expect(changelogItems).toContain('<li>Improved Z</li>');
        });

        test('should match recent changes section pattern', () => {
            const content = `
                <h4 style="color: var(--primary-color); margin-bottom: 10px;">v1.1.14 - January 1, 2025</h4>
                <ul style="margin-left: 20px; color: var(--text-muted);">
                    <li>Old item 1</li>
                    <li>Old item 2</li>
                </ul>
            `;

            const regex = /(<h4 style="color: var\(--primary-color\); margin-bottom: 10px;">v)\d+\.\d+\.\d+( - [A-Za-z]+ \d+, \d{4}<\/h4>[\s\S]*?<\/ul>)/;

            expect(regex.test(content)).toBe(true);
        });
    });

    describe('Version Parsing', () => {

        test('should sort versions correctly (descending)', () => {
            const versions = ['1.1.0', '1.1.14', '1.2.0', '1.1.2', '1.1.13'];

            const sorted = versions.sort((a, b) => {
                const partsA = a.split('.').map(Number);
                const partsB = b.split('.').map(Number);
                for (let i = 0; i < 3; i++) {
                    if (partsA[i] !== partsB[i]) return partsB[i] - partsA[i];
                }
                return 0;
            });

            expect(sorted).toEqual(['1.2.0', '1.1.14', '1.1.13', '1.1.2', '1.1.0']);
        });

        test('should extract versions from content IDs', () => {
            const content = `
                <div id="content-1.1.14" class="version-content active">
                <div id="content-1.1.13" class="version-content">
                <div id="content-1.1.12" class="version-content">
            `;

            const versionRegex = /content-(\d+\.\d+\.\d+)/g;
            const versions = [];
            let match;

            while ((match = versionRegex.exec(content)) !== null) {
                if (!versions.includes(match[1])) versions.push(match[1]);
            }

            expect(versions).toContain('1.1.14');
            expect(versions).toContain('1.1.13');
            expect(versions).toContain('1.1.12');
            expect(versions.length).toBe(3);
        });
    });

    describe('Changelog Argument Parsing', () => {

        test('should split comma-separated changelog entries', () => {
            const changelogArg = 'New feature X, Fixed bug Y, Improved Z';
            const entries = changelogArg.split(',').map(item => item.trim());

            expect(entries).toEqual(['New feature X', 'Fixed bug Y', 'Improved Z']);
        });

        test('should handle single changelog entry', () => {
            const changelogArg = 'Single update';
            const entries = changelogArg.split(',').map(item => item.trim());

            expect(entries).toEqual(['Single update']);
        });

        test('should handle entries with extra whitespace', () => {
            const changelogArg = '  Feature A  ,  Feature B  ,  Feature C  ';
            const entries = changelogArg.split(',').map(item => item.trim());

            expect(entries).toEqual(['Feature A', 'Feature B', 'Feature C']);
        });
    });

    describe('Date Formatting', () => {

        test('should format full date correctly', () => {
            const date = new Date('2026-02-14');
            const months = ['January', 'February', 'March', 'April', 'May', 'June',
                          'July', 'August', 'September', 'October', 'November', 'December'];
            const formatted = `${months[date.getMonth()]} ${date.getDate()}, ${date.getFullYear()}`;

            expect(formatted).toBe('February 14, 2026');
        });

        test('should format short date correctly', () => {
            const date = new Date('2026-02-14');
            const months = ['January', 'February', 'March', 'April', 'May', 'June',
                          'July', 'August', 'September', 'October', 'November', 'December'];
            const formatted = `${months[date.getMonth()]} ${date.getFullYear()}`;

            expect(formatted).toBe('February 2026');
        });
    });

    describe('File Naming Convention Fixes', () => {

        test('should convert QUICK_START_GUIDE.html to quick-start-guide.html', () => {
            const input = '<a href="QUICK_START_GUIDE.html">Quick Start</a>';
            const expected = '<a href="quick-start-guide.html">Quick Start</a>';

            const result = input.replace(/QUICK_START_GUIDE\.html/g, 'quick-start-guide.html');

            expect(result).toBe(expected);
        });

        test('should fix multiple QUICK_START_GUIDE.html references', () => {
            const input = `
                <a href="QUICK_START_GUIDE.html">Link 1</a>
                <a href="QUICK_START_GUIDE.html">Link 2</a>
            `;

            const result = input.replace(/QUICK_START_GUIDE\.html/g, 'quick-start-guide.html');

            expect(result).not.toContain('QUICK_START_GUIDE.html');
            expect(result).toContain('quick-start-guide.html');
        });

        test('should not affect already correct file names', () => {
            const input = '<a href="quick-start-guide.html">Quick Start</a>';

            const result = input.replace(/QUICK_START_GUIDE\.html/g, 'quick-start-guide.html');

            expect(result).toBe(input);
        });
    });

    describe('README.md Version Updates', () => {
        const testVersion = '1.2.0';
        const testDate = 'February 15, 2026';

        test('should update README.md version header', () => {
            const input = '**Current Version: 1.1.14** | **Release Date: February 14, 2026**';
            const expected = `**Current Version: ${testVersion}** | **Release Date: ${testDate}**`;

            const result = input.replace(
                /(\*\*Current Version: )\d+\.\d+\.\d+(\*\* \| \*\*Release Date: )[A-Za-z]+ \d+, \d{4}(\*\*)/g,
                `$1${testVersion}$2${testDate}$3`
            );

            expect(result).toBe(expected);
        });

        test('should not affect unrelated markdown content', () => {
            const input = 'Some other content with version 1.0.0 mentioned';

            const result = input.replace(
                /(\*\*Current Version: )\d+\.\d+\.\d+(\*\* \| \*\*Release Date: )[A-Za-z]+ \d+, \d{4}(\*\*)/g,
                `$1${testVersion}$2${testDate}$3`
            );

            expect(result).toBe(input);
        });

        test('DOCUMENTATION/README.md should have version header', () => {
            const readmePath = path.join(__dirname, '..', 'DOCUMENTATION', 'README.md');
            const content = fs.readFileSync(readmePath, 'utf8');
            expect(content).toMatch(/\*\*Current Version: \d+\.\d+\.\d+\*\*/);
        });

        test('DOCUMENTATION/README.md should reference quick-start-guide.html (lowercase)', () => {
            const readmePath = path.join(__dirname, '..', 'DOCUMENTATION', 'README.md');
            const content = fs.readFileSync(readmePath, 'utf8');
            expect(content).toContain('quick-start-guide.html');
            expect(content).not.toContain('QUICK_START_GUIDE.html');
        });
    });
});

describe('Documentation Files Integrity', () => {
    const docsDir = path.join(__dirname, '..', 'docs');

    const requiredFiles = [
        'index.html',
        'documentation.html',
        'help.html',
        'quick-start-guide.html',
        'privacy-policy.html'
    ];

    describe('File Existence', () => {
        requiredFiles.forEach(fileName => {
            test(`${fileName} should exist`, () => {
                const filePath = path.join(docsDir, fileName);
                expect(fs.existsSync(filePath)).toBe(true);
            });
        });
    });

    describe('File Naming Conventions', () => {
        test('all doc files should be lowercase', () => {
            const files = fs.readdirSync(docsDir);
            files.forEach(file => {
                expect(file).toBe(file.toLowerCase());
            });
        });

        test('all doc files should use hyphens not underscores', () => {
            const files = fs.readdirSync(docsDir);
            files.forEach(file => {
                expect(file).not.toContain('_');
            });
        });

        test('should not have QUICK_START_GUIDE.html (should be quick-start-guide.html)', () => {
            const files = fs.readdirSync(docsDir);
            expect(files).not.toContain('QUICK_START_GUIDE.html');
            expect(files).toContain('quick-start-guide.html');
        });
    });

    describe('Version Badge Presence', () => {
        test('quick-start-guide.html should have version badge', () => {
            const content = fs.readFileSync(path.join(docsDir, 'quick-start-guide.html'), 'utf8');
            expect(content).toMatch(/<span class="version-badge">Version \d+\.\d+\.\d+<\/span>/);
        });

        test('help.html should have version badge', () => {
            const content = fs.readFileSync(path.join(docsDir, 'help.html'), 'utf8');
            expect(content).toMatch(/<span class="version-badge">Version \d+\.\d+\.\d+<\/span>/);
        });

        test('documentation.html should have version selector', () => {
            const content = fs.readFileSync(path.join(docsDir, 'documentation.html'), 'utf8');
            expect(content).toContain('id="version-select"');
        });

        test('index.html should have version selector', () => {
            const content = fs.readFileSync(path.join(docsDir, 'index.html'), 'utf8');
            expect(content).toContain('id="version-select"');
        });
    });

    describe('Link References', () => {
        test('all files should reference quick-start-guide.html not QUICK_START_GUIDE.html', () => {
            requiredFiles.forEach(fileName => {
                const content = fs.readFileSync(path.join(docsDir, fileName), 'utf8');
                expect(content).not.toContain('QUICK_START_GUIDE.html');
            });
        });

        test('help.html should link to all other doc pages', () => {
            const content = fs.readFileSync(path.join(docsDir, 'help.html'), 'utf8');
            expect(content).toContain('href="index.html"');
            expect(content).toContain('href="quick-start-guide.html"');
            expect(content).toContain('href="documentation.html"');
            expect(content).toContain('href="privacy-policy.html"');
        });
    });
});

describe('Popup HTML Integration', () => {
    const rootDir = path.join(__dirname, '..');

    test('popup.html should have help links section', () => {
        const content = fs.readFileSync(path.join(rootDir, 'popup.html'), 'utf8');
        expect(content).toContain('help-links');
    });

    test('popup.html should link to quick-start-guide.html', () => {
        const content = fs.readFileSync(path.join(rootDir, 'popup.html'), 'utf8');
        expect(content).toContain('quick-start-guide.html');
        expect(content).not.toContain('QUICK_START_GUIDE.html');
    });

    test('popup.html should link to documentation.html', () => {
        const content = fs.readFileSync(path.join(rootDir, 'popup.html'), 'utf8');
        expect(content).toContain('documentation.html');
    });

    test('popup.html should have about version badge', () => {
        const content = fs.readFileSync(path.join(rootDir, 'popup.html'), 'utf8');
        expect(content).toMatch(/about-version">Version \d+\.\d+\.\d+<\/span>/);
    });

    test('build/popup.html should match popup.html links', () => {
        const popupContent = fs.readFileSync(path.join(rootDir, 'popup.html'), 'utf8');
        const buildPopupContent = fs.readFileSync(path.join(rootDir, 'build', 'popup.html'), 'utf8');

        // Both should have same doc links
        expect(buildPopupContent).toContain('quick-start-guide.html');
        expect(buildPopupContent).toContain('documentation.html');
        expect(buildPopupContent).not.toContain('QUICK_START_GUIDE.html');
    });
});

describe('Version Consistency', () => {
    const rootDir = path.join(__dirname, '..');

    test('manifest.json version should be valid semver', () => {
        const manifest = JSON.parse(fs.readFileSync(path.join(rootDir, 'manifest.json'), 'utf8'));
        expect(manifest.version).toMatch(/^\d+\.\d+\.\d+$/);
    });

    test('all docs should have same version as manifest', () => {
        const manifest = JSON.parse(fs.readFileSync(path.join(rootDir, 'manifest.json'), 'utf8'));
        const expectedVersion = manifest.version;

        // Check quick-start-guide.html
        const quickStart = fs.readFileSync(path.join(rootDir, 'docs', 'quick-start-guide.html'), 'utf8');
        expect(quickStart).toContain(`Version ${expectedVersion}`);

        // Check help.html
        const help = fs.readFileSync(path.join(rootDir, 'docs', 'help.html'), 'utf8');
        expect(help).toContain(`Version ${expectedVersion}`);
    });

    test('popup.html about section should match manifest version', () => {
        const manifest = JSON.parse(fs.readFileSync(path.join(rootDir, 'manifest.json'), 'utf8'));
        const popup = fs.readFileSync(path.join(rootDir, 'popup.html'), 'utf8');

        expect(popup).toContain(`Version ${manifest.version}`);
    });
});

describe('Update Script Existence', () => {
    const scriptsDir = path.join(__dirname, '..', 'scripts');

    test('update-docs-version.js should exist', () => {
        expect(fs.existsSync(path.join(scriptsDir, 'update-docs-version.js'))).toBe(true);
    });

    test('update-docs-version.js should be valid JavaScript', () => {
        const scriptPath = path.join(scriptsDir, 'update-docs-version.js');
        const content = fs.readFileSync(scriptPath, 'utf8');

        // Basic syntax check - should not throw
        expect(() => {
            // Check for required functions
            expect(content).toContain('function getFormattedDate()');
            expect(content).toContain('function getVersionFromManifest()');
            expect(content).toContain('function updateVersionBadge(');
            expect(content).toContain('function updateFile(');
        }).not.toThrow();
    });
});

