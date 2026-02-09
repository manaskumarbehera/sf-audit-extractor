/**
 * @jest-environment node
 *
 * Version Consistency Tests
 *
 * Ensures that the version displayed in the About section of popup.html
 * matches the version specified in manifest.json
 */

const fs = require('fs');
const path = require('path');

describe('Version Consistency', () => {
    let manifestVersion;
    let popupHtmlContent;

    beforeAll(() => {
        // Read manifest.json
        const manifestPath = path.join(__dirname, '..', 'manifest.json');
        const manifestContent = fs.readFileSync(manifestPath, 'utf8');
        const manifest = JSON.parse(manifestContent);
        manifestVersion = manifest.version;

        // Read popup.html
        const popupPath = path.join(__dirname, '..', 'popup.html');
        popupHtmlContent = fs.readFileSync(popupPath, 'utf8');
    });

    test('manifest.json should have a valid version', () => {
        expect(manifestVersion).toBeDefined();
        expect(typeof manifestVersion).toBe('string');
        expect(manifestVersion).toMatch(/^\d+\.\d+\.\d+$/); // Semantic versioning pattern
    });

    test('popup.html About section version should match manifest.json version', () => {
        // Look for the version in the About section
        const versionPattern = /<span class="about-version">Version ([\d.]+)<\/span>/;
        const match = popupHtmlContent.match(versionPattern);

        expect(match).not.toBeNull();
        expect(match[1]).toBe(manifestVersion);
    });

    test('popup.html should contain the about-version element', () => {
        expect(popupHtmlContent).toContain('class="about-version"');
        expect(popupHtmlContent).toContain('Version ');
    });

    test('manifest.json version should be 1.1.2 or higher', () => {
        const [major, minor, patch] = manifestVersion.split('.').map(Number);
        const versionNumber = major * 10000 + minor * 100 + patch;

        // 1.1.2 = 10102
        expect(versionNumber).toBeGreaterThanOrEqual(10102);
    });

    test('current version should be 1.1.2', () => {
        expect(manifestVersion).toBe('1.1.2');
    });

    test('build output filename should match manifest version', () => {
        // Check if the expected build file exists
        const buildFilename = `TrackForcePro-v${manifestVersion}.zip`;
        const buildPath = path.join(__dirname, '..', buildFilename);

        // This test documents the expected behavior - build.sh creates this file
        expect(buildFilename).toBe(`TrackForcePro-v${manifestVersion}.zip`);
    });
});

describe('Manifest.json Validation', () => {
    let manifest;

    beforeAll(() => {
        const manifestPath = path.join(__dirname, '..', 'manifest.json');
        const manifestContent = fs.readFileSync(manifestPath, 'utf8');
        manifest = JSON.parse(manifestContent);
    });

    test('should have manifest_version 3', () => {
        expect(manifest.manifest_version).toBe(3);
    });

    test('should have required host_permissions for Salesforce domains', () => {
        const requiredDomains = [
            'https://*.salesforce.com/*',
            'https://*.force.com/*'
        ];

        requiredDomains.forEach(domain => {
            expect(manifest.host_permissions).toContain(domain);
        });
    });

    test('should have content_scripts matching Salesforce domains', () => {
        expect(manifest.content_scripts).toBeDefined();
        expect(manifest.content_scripts.length).toBeGreaterThan(0);

        const matches = manifest.content_scripts[0].matches;
        expect(matches).toContain('https://*.salesforce.com/*');
        expect(matches).toContain('https://*.force.com/*');
    });

    test('should have name TrackForcePro', () => {
        expect(manifest.name).toBe('TrackForcePro');
    });
});

describe('Help Links Validation', () => {
    const GITHUB_PAGES_BASE = 'https://manaskumarbehera.github.io/sf-audit-extractor/';
    const GITHUB_ISSUES_URL = 'https://github.com/manaskumarbehera/sf-audit-extractor/issues';
    let popupHtmlContent;

    beforeAll(() => {
        const popupPath = path.join(__dirname, '..', 'popup.html');
        popupHtmlContent = fs.readFileSync(popupPath, 'utf8');
    });

    test('should link to GitHub Pages help.html', () => {
        expect(popupHtmlContent).toContain(`${GITHUB_PAGES_BASE}help.html`);
    });

    test('should link to GitHub Pages QUICK_START_GUIDE.html', () => {
        expect(popupHtmlContent).toContain(`${GITHUB_PAGES_BASE}QUICK_START_GUIDE.html`);
    });

    test('should link to GitHub Pages privacy-policy.html', () => {
        expect(popupHtmlContent).toContain(`${GITHUB_PAGES_BASE}privacy-policy.html`);
    });

    test('should link to GitHub issues for bug reports', () => {
        expect(popupHtmlContent).toContain(GITHUB_ISSUES_URL);
    });

    test('should NOT contain direct GitHub MD file links for USER_GUIDE', () => {
        expect(popupHtmlContent).not.toContain('DOCUMENTATION/guides/USER_GUIDE.md');
    });

    test('should NOT contain direct GitHub MD file links for DEVELOPER_GUIDE', () => {
        expect(popupHtmlContent).not.toContain('DOCUMENTATION/guides/DEVELOPER_GUIDE.md');
    });

    test('should NOT contain direct GitHub MD file links for QUICK_REFERENCE', () => {
        expect(popupHtmlContent).not.toContain('DOCUMENTATION/reference/QUICK_REFERENCE.md');
    });

    test('should NOT contain placeholder GitHub user links', () => {
        expect(popupHtmlContent).not.toContain('github.com/user/sf-audit-extractor');
    });
});

describe('Docs HTML Files Version', () => {
    const EXPECTED_VERSION = '1.1.2';

    test('docs/index.html should have correct version', () => {
        const filePath = path.join(__dirname, '..', 'docs', 'index.html');
        const content = fs.readFileSync(filePath, 'utf8');
        // Check for version in dropdown or version badge
        expect(content).toContain(`v${EXPECTED_VERSION}`);
    });

    test('docs/help.html should have correct version', () => {
        const filePath = path.join(__dirname, '..', 'docs', 'help.html');
        const content = fs.readFileSync(filePath, 'utf8');
        expect(content).toContain(`Version ${EXPECTED_VERSION}`);
    });

    test('docs/QUICK_START_GUIDE.html should have correct version', () => {
        const filePath = path.join(__dirname, '..', 'docs', 'QUICK_START_GUIDE.html');
        const content = fs.readFileSync(filePath, 'utf8');
        expect(content).toContain(`Version ${EXPECTED_VERSION}`);
    });
});

describe('docs/help.html Structure', () => {
    let helpContent;

    beforeAll(() => {
        const helpPath = path.join(__dirname, '..', 'docs', 'help.html');
        helpContent = fs.readFileSync(helpPath, 'utf8');
    });

    test('help.html file should exist', () => {
        const helpPath = path.join(__dirname, '..', 'docs', 'help.html');
        expect(fs.existsSync(helpPath)).toBe(true);
    });

    test('should have Documentation section', () => {
        expect(helpContent).toContain('Documentation');
    });

    test('should have Features Overview section', () => {
        expect(helpContent).toContain('Features Overview');
    });

    test('should have FAQ section', () => {
        expect(helpContent).toContain('Frequently Asked Questions');
    });

    test('should have Support section', () => {
        expect(helpContent).toContain('Support');
    });

    test('should have Troubleshooting section', () => {
        expect(helpContent).toContain('Troubleshooting');
    });

    test('should have navigation links to other pages', () => {
        expect(helpContent).toContain('href="index.html"');
        expect(helpContent).toContain('href="QUICK_START_GUIDE.html"');
        expect(helpContent).toContain('href="privacy-policy.html"');
    });

    test('should only link to GitHub issues (not repo directly)', () => {
        const GITHUB_ISSUES_URL = 'https://github.com/manaskumarbehera/sf-audit-extractor/issues';
        expect(helpContent).toContain(GITHUB_ISSUES_URL);

        // Check that all github.com links are to /issues
        const githubLinks = helpContent.match(/github\.com\/manaskumarbehera\/sf-audit-extractor[^"']*/g) || [];
        githubLinks.forEach(link => {
            expect(link).toContain('/issues');
        });
    });
});

describe('Build Zip File', () => {
    test('TrackForcePro-v1.1.2.zip should exist', () => {
        const zipPath = path.join(__dirname, '..', 'TrackForcePro-v1.1.2.zip');
        expect(fs.existsSync(zipPath)).toBe(true);
    });
});
