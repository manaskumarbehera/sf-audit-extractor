(function() {
    const DEFAULTS = {
        org: 20,
        saved: 55,
        customize: 25,
        userLeft: 35 // Default width for User Manager left column
    };

    function updateCSS(org, saved, customize, userLeft) {
        // Org & Favicon
        document.documentElement.style.setProperty('--col-width-org', `${org}%`);
        document.documentElement.style.setProperty('--col-width-saved', `${saved}%`);
        document.documentElement.style.setProperty('--col-width-customize', `${customize}%`);

        // User Manager
        if (userLeft !== undefined) {
            document.documentElement.style.setProperty('--col-width-user-left', `${userLeft}%`);
        }
    }

    function updateInputs(org, saved, customize, userLeft) {
        // Org & Favicon inputs
        if (document.getElementById('setting-width-org')) {
            document.getElementById('setting-width-org').value = org;
            document.getElementById('val-width-org').textContent = `${org}%`;
        }
        if (document.getElementById('setting-width-saved')) {
            document.getElementById('setting-width-saved').value = saved;
            document.getElementById('val-width-saved').textContent = `${saved}%`;
        }

        // User Manager inputs
        if (document.getElementById('setting-width-user-left')) {
            // Ensure default if missing
            const uLeft = userLeft || DEFAULTS.userLeft;
            document.getElementById('setting-width-user-left').value = uLeft;
            document.getElementById('val-width-user-left').textContent = `${uLeft}%`;
        }
    }

    function saveSettings() {
        const org = document.getElementById('setting-width-org')?.value || DEFAULTS.org;
        const saved = document.getElementById('setting-width-saved')?.value || DEFAULTS.saved;
        let customize = 100 - parseInt(org) - parseInt(saved);
        if (customize < 0) customize = 0;

        const userLeft = document.getElementById('setting-width-user-left')?.value || DEFAULTS.userLeft;

        chrome.storage.local.set({
            layoutWidths: { org, saved, customize, userLeft }
        });
    }

    function onInput(e) {
        const id = e.target.id;

        // Handle Org & Favicon inputs
        if (id === 'setting-width-org' || id === 'setting-width-saved') {
            let org = parseInt(document.getElementById('setting-width-org').value);
            let saved = parseInt(document.getElementById('setting-width-saved').value);
            let customize = 100 - org - saved;
            if (customize < 0) customize = 0;

            if (id === 'setting-width-org') document.getElementById('val-width-org').textContent = `${org}%`;
            if (id === 'setting-width-saved') document.getElementById('val-width-saved').textContent = `${saved}%`;

            const pSaved = document.getElementById('preview-col-saved');
            const pOrg = document.getElementById('preview-col-org');
            const pEditor = document.getElementById('preview-col-editor');

            if (pSaved) {
                pSaved.style.width = `${saved}%`;
                pSaved.textContent = `Saved (${saved}%)`;
            }
            if (pOrg) {
                pOrg.style.width = `${org}%`;
                pOrg.textContent = `Info (${org}%)`;
            }
            if (pEditor) {
                pEditor.textContent = `Editor (~${customize}%)`;
            }

            // Re-read userLeft to keep it stable
            const userLeft = document.getElementById('setting-width-user-left')?.value || DEFAULTS.userLeft;
            updateCSS(org, saved, customize, userLeft);
        }

        // Handle User Manager inputs
        if (id === 'setting-width-user-left') {
            let userLeft = parseInt(e.target.value);
            document.getElementById('val-width-user-left').textContent = `${userLeft}%`;

            const pUserLeft = document.getElementById('preview-col-user-left');
            if (pUserLeft) {
                pUserLeft.style.width = `${userLeft}%`;
                pUserLeft.textContent = `Current User (${userLeft}%)`;
            }

            // Re-read Org values to keep them stable
            const org = document.getElementById('setting-width-org')?.value || DEFAULTS.org;
            const saved = document.getElementById('setting-width-saved')?.value || DEFAULTS.saved;
            let customize = 100 - parseInt(org) - parseInt(saved);

            updateCSS(org, saved, customize, userLeft);
        }
    }

    function init() {
        const sOrg = document.getElementById('setting-width-org');
        const sSaved = document.getElementById('setting-width-saved');
        const btnReset = document.getElementById('btn-reset-widths');

        const sUserLeft = document.getElementById('setting-width-user-left');
        const btnResetUser = document.getElementById('btn-reset-widths-user');

        if (!sOrg && !sUserLeft) return;

        // Load saved or defaults
        chrome.storage.local.get({ layoutWidths: DEFAULTS }, (result) => {
            const w = result.layoutWidths;
            // Handle legacy settings that might miss userLeft
            const userLeft = w.userLeft !== undefined ? w.userLeft : DEFAULTS.userLeft;

            updateInputs(w.org, w.saved, w.customize, userLeft);
            updateCSS(w.org, w.saved, w.customize, userLeft);

            // Trigger visual update Org details
            const pSaved = document.getElementById('preview-col-saved');
            const pOrg = document.getElementById('preview-col-org');
            const pEditor = document.getElementById('preview-col-editor');

            let org = parseInt(w.org);
            let saved = parseInt(w.saved);
            let rem = 100 - org - saved;

            if (pSaved) {
                pSaved.style.width = `${saved}%`;
                pSaved.textContent = `Saved (${saved}%)`;
            }
            if (pOrg) {
                pOrg.style.width = `${org}%`;
                pOrg.textContent = `Info (${org}%)`;
            }
            if (pEditor) {
                pEditor.textContent = `Editor (~${rem}%)`;
            }

            // Trigger visual update User Manager
            const pUserLeft = document.getElementById('preview-col-user-left');
            if (pUserLeft) {
                 pUserLeft.style.width = `${userLeft}%`;
                 pUserLeft.textContent = `Current User (${userLeft}%)`;
            }
        });

        // Listeners for Org Settings
        if (sOrg) sOrg.addEventListener('input', onInput);
        if (sSaved) sSaved.addEventListener('input', onInput);
        if (sOrg) sOrg.addEventListener('change', saveSettings);
        if (sSaved) sSaved.addEventListener('change', saveSettings);

        if (btnReset) {
            btnReset.addEventListener('click', () => {
                const userLeft = document.getElementById('setting-width-user-left')?.value || DEFAULTS.userLeft;
                updateInputs(DEFAULTS.org, DEFAULTS.saved, DEFAULTS.customize, userLeft);
                updateCSS(DEFAULTS.org, DEFAULTS.saved, DEFAULTS.customize, userLeft);
                saveSettings();

                // Manually trigger visual updates for Org preview
                const pSaved = document.getElementById('preview-col-saved');
                const pOrg = document.getElementById('preview-col-org');
                const pEditor = document.getElementById('preview-col-editor');
                if (pSaved) {
                    pSaved.style.width = `${DEFAULTS.saved}%`;
                    pSaved.textContent = `Saved (${DEFAULTS.saved}%)`;
                }
                if (pOrg) {
                    pOrg.style.width = `${DEFAULTS.org}%`;
                    pOrg.textContent = `Info (${DEFAULTS.org}%)`;
                }
                if (pEditor) {
                    let rem = 100 - DEFAULTS.org - DEFAULTS.saved;
                    pEditor.textContent = `Editor (~${rem}%)`;
                }
            });
        }

        // Listeners for User Manager Settings
        if (sUserLeft) {
            sUserLeft.addEventListener('input', onInput);
            sUserLeft.addEventListener('change', saveSettings);
        }

        if (btnResetUser) {
            btnResetUser.addEventListener('click', () => {
                // Get current Org values so we don't reset them
                const org = document.getElementById('setting-width-org')?.value || DEFAULTS.org;
                const saved = document.getElementById('setting-width-saved')?.value || DEFAULTS.saved;
                let customize = 100 - parseInt(org) - parseInt(saved);

                updateInputs(org, saved, customize, DEFAULTS.userLeft);
                updateCSS(org, saved, customize, DEFAULTS.userLeft);
                saveSettings();

                const pUserLeft = document.getElementById('preview-col-user-left');
                if (pUserLeft) {
                    pUserLeft.style.width = `${DEFAULTS.userLeft}%`;
                    pUserLeft.textContent = `Current User (${DEFAULTS.userLeft}%)`;
                }
            });
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
