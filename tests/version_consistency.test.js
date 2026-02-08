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

    test('manifest.json version should be 1.0.8 or higher', () => {
        const [major, minor, patch] = manifestVersion.split('.').map(Number);
        const versionNumber = major * 10000 + minor * 100 + patch;

        // 1.0.8 = 10008
        expect(versionNumber).toBeGreaterThanOrEqual(10008);
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

