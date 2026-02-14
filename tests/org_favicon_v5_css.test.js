/**
 * @jest-environment jsdom
 *
 * Org & Favicon v5 CSS Styling Tests
 * Tests to verify the CSS styling requirements are met
 */

const fs = require('fs');
const path = require('path');

describe('Org & Favicon v5 - CSS Styling Verification', () => {
    let cssContent;

    beforeAll(() => {
        // Read the CSS file
        const cssPath = path.join(__dirname, '..', 'popup.css');
        cssContent = fs.readFileSync(cssPath, 'utf8');
    });

    // ==========================================
    // 1. PREVIEW CONTAINER STYLING
    // ==========================================
    describe('1. Preview Container Styling', () => {
        test('should have preview box with border styling', () => {
            expect(cssContent).toMatch(/\.preview-box-v5\s*\{[^}]*border:\s*1px/);
        });

        test('should have preview box with subtle background', () => {
            expect(cssContent).toMatch(/\.preview-box-v5\s*\{[^}]*background:\s*#f8f9fa/);
        });

        test('should have preview-live-v5 with light green tint', () => {
            expect(cssContent).toMatch(/\.preview-live-v5\s*\{[^}]*background:\s*#f0fdf4/);
        });

        test('should have preview-edit-v5 with light blue tint', () => {
            expect(cssContent).toMatch(/\.preview-edit-v5\s*\{[^}]*background:\s*#f0f7ff/);
        });

        test('should have has-changes state with light orange tint', () => {
            expect(cssContent).toMatch(/\.preview-edit-v5\.has-changes\s*\{[^}]*background:\s*#fff8e6/);
        });
    });

    // ==========================================
    // 2. ENVIRONMENT BUTTON STYLING
    // ==========================================
    describe('2. Environment Button Styling', () => {
        test('should have segmented control with grid layout', () => {
            expect(cssContent).toMatch(/\.env-segmented-control-v5\s*\{[^}]*display:\s*grid/);
        });

        test('should have 6 equal columns in segmented control', () => {
            expect(cssContent).toMatch(/\.env-segmented-control-v5\s*\{[^}]*grid-template-columns:\s*repeat\(6,\s*1fr\)/);
        });

        test('should have env button with minimum height of 36px', () => {
            expect(cssContent).toMatch(/\.env-btn-v5\s*\{[^}]*min-height:\s*36px/);
        });

        test('should have active state with solid background', () => {
            expect(cssContent).toMatch(/\.env-btn-v5\.active\s*\{[^}]*background:\s*#339af0/);
        });

        test('should have active state with white text', () => {
            expect(cssContent).toMatch(/\.env-btn-v5\.active\s*\{[^}]*color:\s*#fff/);
        });

        test('should have special PROD active state with red background', () => {
            expect(cssContent).toMatch(/\.env-btn-v5\.env-prod\.active\s*\{[^}]*background:\s*#e03131/);
        });
    });

    // ==========================================
    // 3. COLOR SWATCH STYLING
    // ==========================================
    describe('3. Color Swatch Styling', () => {
        test('should have swatches in 8-column grid', () => {
            expect(cssContent).toMatch(/\.swatches-v5\s*\{[^}]*grid-template-columns:\s*repeat\(8,\s*1fr\)/);
        });

        test('should have swatch size of 26px', () => {
            expect(cssContent).toMatch(/\.swatch-v5[^{]*\{[^}]*width:\s*26px/);
            expect(cssContent).toMatch(/\.swatch-v5[^{]*\{[^}]*height:\s*26px/);
        });

        test('should have hover scale effect on swatches', () => {
            expect(cssContent).toMatch(/\.swatch-v5:hover\s*\{[^}]*transform:\s*scale\(1\.1\)/);
        });

        test('should have active state with outline ring', () => {
            expect(cssContent).toMatch(/\.swatch-v5\.active\s*\{[^}]*box-shadow:\s*0\s*0\s*0\s*3px/);
        });
    });

    // ==========================================
    // 4. SHAPE BUTTON STYLING
    // ==========================================
    describe('4. Shape Button Styling', () => {
        test('should have shape option size of 26px', () => {
            expect(cssContent).toMatch(/\.shape-opt-v5\s+span[^{]*\{[^}]*width:\s*26px/);
            expect(cssContent).toMatch(/\.shape-opt-v5\s+span[^{]*\{[^}]*height:\s*26px/);
        });

        test('should have shape option with border', () => {
            expect(cssContent).toMatch(/\.shape-opt-v5\s+input:checked\s*\+\s*span\s*\{[^}]*border/);
        });

        test('should have checked shape with background', () => {
            expect(cssContent).toMatch(/\.shape-opt-v5\s+input:checked\s*\+\s*span\s*\{[^}]*background/);
        });
    });

    // ==========================================
    // 5. SPACING & LAYOUT STYLING
    // ==========================================
    describe('5. Spacing & Layout Styling', () => {
        test('should have 3-column grid layout', () => {
            expect(cssContent).toMatch(/\.org-favicon-grid-v5\s*\{[^}]*display:\s*grid/);
            expect(cssContent).toMatch(/\.org-favicon-grid-v5\s*\{[^}]*grid-template-columns:/);
        });

        test('should have editor panel with gap spacing', () => {
            expect(cssContent).toMatch(/\.editor-panel-v5\s*\{[^}]*gap:\s*8px/);
        });

        test('should have editor sections with gap', () => {
            expect(cssContent).toMatch(/\.editor-section-v5\s*\{[^}]*gap:\s*8px/);
        });
    });

    // ==========================================
    // 6. ACTION BUTTON STYLING
    // ==========================================
    describe('6. Action Button Styling', () => {
        test('should have action button with minimum height of 38px', () => {
            expect(cssContent).toMatch(/\.btn-v5\s*\{[^}]*min-height:\s*38px/);
        });

        test('should have primary button with gradient background', () => {
            expect(cssContent).toMatch(/\.btn-primary-v5\s*\{[^}]*background:\s*linear-gradient/);
        });

        test('should have secondary button with transparent background', () => {
            expect(cssContent).toMatch(/\.btn-secondary-v5\s*\{[^}]*background:\s*transparent/);
        });

        test('should have secondary button with border', () => {
            expect(cssContent).toMatch(/\.btn-secondary-v5\s*\{[^}]*border:\s*2px\s*solid/);
        });

        test('should have actions row with flex-shrink: 0', () => {
            expect(cssContent).toMatch(/\.actions-row-v5\s*\{[^}]*flex-shrink:\s*0/);
        });
    });

    // ==========================================
    // 7. PREVIEW CLARITY STYLING
    // ==========================================
    describe('7. Preview Clarity Styling', () => {
        test('should have preview canvas with specific size', () => {
            expect(cssContent).toMatch(/\.preview-canvas-v5\s*\{[^}]*width:\s*36px/);
            expect(cssContent).toMatch(/\.preview-canvas-v5\s*\{[^}]*height:\s*36px/);
        });

        test('should have preview badge with font size', () => {
            expect(cssContent).toMatch(/\.preview-badge-v5\s*\{[^}]*font-size:\s*8px/);
        });

        test('should have live badge with green background', () => {
            expect(cssContent).toMatch(/\.preview-badge-v5\.badge-live\s*\{[^}]*background:\s*#d3f9d8/);
        });

        test('should have draft badge with blue background', () => {
            expect(cssContent).toMatch(/\.preview-badge-v5\.badge-draft\s*\{[^}]*background:\s*#d0ebff/);
        });

        test('should have dark background class', () => {
            expect(cssContent).toMatch(/\.preview-canvas-v5\.dark-bg\s*\{[^}]*background:\s*#212529/);
        });
    });

    // ==========================================
    // 8. STATUS MESSAGE STYLING
    // ==========================================
    describe('8. Status Message Styling', () => {
        test('should have status message v5 class', () => {
            expect(cssContent).toMatch(/\.status-msg-v5\s*\{/);
        });

        test('should have success status with green background', () => {
            expect(cssContent).toMatch(/\.status-msg-v5\.success\s*\{[^}]*background:/);
        });

        test('should have error status with red background', () => {
            expect(cssContent).toMatch(/\.status-msg-v5\.error\s*\{[^}]*background:/);
        });
    });

    // ==========================================
    // 9. UNSAVED CHANGES BANNER STYLING
    // ==========================================
    describe('9. Unsaved Changes Banner Styling', () => {
        test('should have unsaved strip v5 class', () => {
            expect(cssContent).toMatch(/\.unsaved-strip-v5\s*\{/);
        });

        test('should have unsaved dot animation', () => {
            expect(cssContent).toMatch(/\.unsaved-dot-v5\s*\{[^}]*animation:/);
        });
    });

    // ==========================================
    // 10. RESPONSIVE STYLING
    // ==========================================
    describe('10. Responsive Styling', () => {
        test('should have responsive breakpoint at 850px', () => {
            expect(cssContent).toMatch(/@media\s*\(\s*max-width:\s*850px\s*\)/);
        });

        test('should have responsive breakpoint at 650px', () => {
            expect(cssContent).toMatch(/@media\s*\(\s*max-width:\s*650px\s*\)/);
        });

        test('should hide info column on smaller screens', () => {
            expect(cssContent).toMatch(/\.info-col-v5\s*\{[^}]*display:\s*none/);
        });
    });

    // ==========================================
    // 11. COLUMN HEADER STYLING
    // ==========================================
    describe('11. Column Header Styling', () => {
        test('should have column header with gradient background', () => {
            expect(cssContent).toMatch(/\.col-header-v5\s*\{[^}]*background:\s*linear-gradient/);
        });

        test('should have column header with uppercase text', () => {
            expect(cssContent).toMatch(/\.col-header-v5\s*\{[^}]*text-transform:\s*uppercase/);
        });
    });

    // ==========================================
    // 12. INPUT STYLING
    // ==========================================
    describe('12. Input Styling', () => {
        test('should have label input with uppercase transform', () => {
            expect(cssContent).toMatch(/\.input-label-v5\s*\{[^}]*text-transform:\s*uppercase/);
        });

        test('should have search input with focus state', () => {
            expect(cssContent).toMatch(/\.search-input-v5:focus\s*\{[^}]*border-color:\s*#74c0fc/);
        });

        test('should have search input with box-shadow on focus', () => {
            expect(cssContent).toMatch(/\.search-input-v5:focus\s*\{[^}]*box-shadow:/);
        });

        test('should have label section with flex layout for single row', () => {
            expect(cssContent).toMatch(/\.label-section-v5\s*\{[^}]*display:\s*flex/);
        });

        test('should have label section with center alignment', () => {
            expect(cssContent).toMatch(/\.label-section-v5\s*\{[^}]*align-items:\s*center/);
        });

        test('should have color section with flex layout for single row', () => {
            expect(cssContent).toMatch(/\.color-section-v5\s*\{[^}]*display:\s*flex/);
        });

        test('should have color section with center alignment', () => {
            expect(cssContent).toMatch(/\.color-section-v5\s*\{[^}]*align-items:\s*center/);
        });

        test('should have shape section with flex layout for single row', () => {
            expect(cssContent).toMatch(/\.shape-section-v5\s*\{[^}]*display:\s*flex/);
        });

        test('should have shape section with center alignment', () => {
            expect(cssContent).toMatch(/\.shape-section-v5\s*\{[^}]*align-items:\s*center/);
        });
    });

    // ==========================================
    // 13. CHANGE INDICATOR STYLING
    // ==========================================
    describe('13. Change Indicator Styling', () => {
        test('should have change indicator class', () => {
            expect(cssContent).toMatch(/\.change-indicator-v5\s*\{/);
        });

        test('should have unsaved state with orange background', () => {
            expect(cssContent).toMatch(/\.change-indicator-v5\.unsaved\s*\{[^}]*background:\s*#ffa500/);
        });

        test('should have pulse animation for unsaved state', () => {
            expect(cssContent).toMatch(/\.change-indicator-v5\.unsaved\s*\{[^}]*animation:/);
        });
    });

    // ==========================================
    // 14. LIVE BADGE STYLING
    // ==========================================
    describe('14. Live Badge Styling', () => {
        test('should have live badge with green background', () => {
            expect(cssContent).toMatch(/\.live-badge-v5\s*\{[^}]*background:\s*#d3f9d8/);
        });

        test('should have pulse animation element', () => {
            expect(cssContent).toMatch(/\.live-badge-v5\s+\.pulse-v5\s*\{/);
        });

        test('should have pulse animation', () => {
            expect(cssContent).toMatch(/@keyframes\s+pulse-live-v5/);
        });
    });
});

