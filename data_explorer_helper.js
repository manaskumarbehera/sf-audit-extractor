/**
 * data_explorer_helper.js
 * Logic for the Data Explorer tab (Current User, Record Search, Dev Options)
 */

const DataExplorerHelper = {
    init: function() {
        console.log("Initializing Data Explorer...");
        this.wireEvents();
        // Automatically load the default active tab (Current User)
        const activeBtn = document.querySelector('#tab-data .sub-tab-button.active');
        if (activeBtn) {
            this.switchSubTab(activeBtn.dataset.subtab);
        }
    },

    wireEvents: function() {
        // Wire sub-tab switching
        const subTabButtons = document.querySelectorAll('#tab-data .sub-tab-button');
        subTabButtons.forEach(btn => {
            btn.addEventListener('click', (e) => {
                this.switchSubTab(e.target.dataset.subtab);
            });
        });

        // Wire Refresh User button
        const refreshUserBtn = document.getElementById('refresh-user-btn');
        if (refreshUserBtn) {
            refreshUserBtn.addEventListener('click', () => this.loadCurrentUser());
        }

        // Wire Refresh Record button
        const refreshRecordBtn = document.getElementById('refresh-record-btn');
        if (refreshRecordBtn) {
            refreshRecordBtn.addEventListener('click', () => this.loadCurrentRecordContext());
        }

        // Wire Search button
        const searchBtn = document.getElementById('record-search-btn');
        if (searchBtn) {
            searchBtn.addEventListener('click', () => this.searchRecord());
        }
    },

    switchSubTab: function(subTabId) {
        // Update buttons
        document.querySelectorAll('#tab-data .sub-tab-button').forEach(btn => {
            if (btn.dataset.subtab === subTabId) {
                btn.classList.add('active');
            } else {
                btn.classList.remove('active');
            }
        });

        // Update content
        document.querySelectorAll('#tab-data .sub-tab-content').forEach(content => {
            if (content.id === `subtab-${subTabId}`) {
                content.hidden = false;
                content.classList.add('active');
            } else {
                content.hidden = true;
                content.classList.remove('active');
            }
        });

        // Load content on switch if needed
        if (subTabId === 'current-user') {
            this.loadCurrentUser();
        } else if (subTabId === 'current-record') {
            this.loadCurrentRecordContext();
        }
    },

    /**
     * Loads details about the currently logged-in user.
     */
    loadCurrentUser: async function() {
        const container = document.getElementById('user-details-container');
        container.innerHTML = '<div class="spinner">Loading user details...</div>';

        try {
            // We can use the PlatformHelper to query the User object based on the current user ID
            // First, get the session info to find user ID
            const session = await PlatformHelper.getSession();
            let userId = session ? session.userId : null;

            // If userId is missing from session (Cookie-based session often lacks it), fetch "me"
            if (!userId && session && session.isLoggedIn) {
                try {
                     const apiSel = document.getElementById('api-version');
                     const v = (apiSel && apiSel.value) ? apiSel.value : '66.0';
                     const meRes = await PlatformHelper.fetchFromSalesforce(`/services/data/v${v}/chatter/users/me`);
                     if (meRes && meRes.id) {
                         userId = meRes.id;
                         // Optionally patch session - but session is readonly from here usually
                     }
                } catch (e) {
                    console.warn('Could not fetch current user ID via API', e);
                }
            }

            if (!userId) {
                container.innerHTML = '<div class="error-message">Could not determine current user ID. Are you logged in?</div>';
                return;
            }

            // Query User fields
            const query = `SELECT Id, Username, FirstName, LastName, Email, LanguageLocaleKey, LocaleSidKey, TimeZoneSidKey, Profile.Name, UserRole.Name FROM User WHERE Id = '${userId}'`;
            const result = await PlatformHelper.executeQuery(query);

            if (result && result.records && result.records.length > 0) {
                const user = result.records[0];
                this.renderUserDetails(user, container);

                // Also update language display in Developer Options
                const langDisplay = document.getElementById('current-language-display');
                if (langDisplay && user.LanguageLocaleKey) {
                    langDisplay.textContent = user.LanguageLocaleKey;
                }
            } else {
                container.innerHTML = '<div class="error-message">User record not found.</div>';
            }

        } catch (error) {
            console.error('Error loading user details:', error);
            container.innerHTML = `<div class="error-message">Error: ${error.message}</div>`;
        }
    },

    renderUserDetails: function(user, container) {
        let html = '<div class="details-list">';

        const fields = [
            { label: 'Name', value: `${user.FirstName || ''} ${user.LastName || ''}` },
            { label: 'Username', value: user.Username },
            { label: 'Email', value: user.Email },
            { label: 'ID', value: user.Id },
            { label: 'Profile', value: user.Profile ? user.Profile.Name : '-' },
            { label: 'Role', value: user.UserRole ? user.UserRole.Name : '-' },
            { label: 'Language', value: user.LanguageLocaleKey },
            { label: 'Locale', value: user.LocaleSidKey },
            { label: 'Timezone', value: user.TimeZoneSidKey }
        ];

        fields.forEach(f => {
            html += `
                <div class="detail-row">
                    <span class="detail-label">${f.label}:</span>
                    <span class="detail-value">${f.value || ''}</span>
                </div>
            `;
        });
        html += '</div>';
        container.innerHTML = html;
    },

    /**
     * Detects record ID from the active tab URL.
     */
    loadCurrentRecordContext: async function() {
        const container = document.getElementById('current-record-info');
        container.innerHTML = '<div class="spinner">Analyzing current page...</div>';

        try {
            // Get active tab info
            const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
            if (!tabs || tabs.length === 0) {
                container.innerHTML = 'No active tab found.';
                return;
            }

            const currentUrl = tabs[0].url;
            console.log('Current URL:', currentUrl);

            // Basic regex for Salesforce ID (15 or 18 chars)
            // It often appears after /view or as a stand-alone path segment
            // Improve regex to catch ID in various SF URL formats
            // This is too broad, matches everything.

            // Improved heuristic for Record ID
            let possibleId = null;

            // 1. Classic/Console/Standard ID pattern in path segments
            // Matches 15 or 18 char alphanumeric strings that look like IDs
            // We ignore common non-ID segments like 'view', 'r', 'related', 'list' etc. by just grabbing probable IDs.
            const idPattern = /\b[a-zA-Z0-9]{15}|[a-zA-Z0-9]{18}\b/g;
            const matches = currentUrl.match(idPattern);

            if (matches && matches.length > 0) {
                 // Pick the last one that looks most like a record ID (heuristic)
                 // or just the first valid one found in a meaningful position?
                 // Lightning: /r/Object/{ID}/view -> ID is usually last large token before view
                 // Classic: /{ID} -> ID is only token

                 // If we have explicit structure, use it for higher confidence
                 if (currentUrl.includes('/r/') && currentUrl.includes('/view')) {
                    const parts = currentUrl.split('/r/');
                    if (parts.length > 1) {
                         const sub = parts[1];
                         const segs = sub.split('/');
                         if (segs.length >= 2) possibleId = segs[1];
                    }
                 }

                 // If structure didn't find it, fallback to query param or just raw search
                 if (!possibleId) {
                     const urlObj = new URL(currentUrl);
                     possibleId = urlObj.searchParams.get('id'); // Explicit ?id= param
                 }

                 // Fallback to "last 18-char looking string found"
                 if (!possibleId) {
                     // Filter out access_token which spans more chars usually, but just in case
                     // session IDs are often longer.
                     // Key prefixes kike '001', '003', '500' are common but not guaranteed.
                     // Let's take the first match that is strictly 15 or 18 chars.
                     for (const m of matches) {
                         if (m.length === 15 || m.length === 18) {
                             possibleId = m;
                             // Heuristic: If it starts with 00 (Wait, Organization is 00D, User 005...)
                             // Prioritize IDs that look like data records? No, 15/18 is solid enough for now.
                             // But we might match 'salesforce' (10 chars) - regex handles length.
                             break;
                         }
                     }
                 }
            } else {
                 // Try query param even if no regex match in path (unlikely if param value is ID)
                 const urlObj = new URL(currentUrl);
                 possibleId = urlObj.searchParams.get('id');
            }

            // Validate ID format (simple check)
            if (possibleId && (possibleId.length === 15 || possibleId.length === 18)) {
                // If found, try to identify what it is
                 this.identifyRecord(possibleId, container);
            } else {
                 container.innerHTML = '<div class="info-message">No Record ID detected in the current URL. navigate to a record page.</div>';
            }

        } catch (error) {
           container.innerHTML = `<div class="error-message">Error: ${error.message}</div>`;
        }
    },

    identifyRecord: async function(recordId, container) {
        container.innerHTML = `<div>Detected ID: <strong>${recordId}</strong>. Identifying...</div>`;

        try {
             // We don't know the object type. In modern API, we can use 'ui-api/record-ui/{recordIds}' to get info without knowing object type?
             // Or use Tooling API 'getSObjectType' equivalent.
             // A cheat is to use the `Id` prefix if we had a comprehensive list, but that's flaky.
             // Let's try to query the Id from a known generic endpoint or just try to generic object describe?
             // Actually, we can use the Tooling API or a hackish global search or just UI API.
             // UI API: /ui-api/records/{recordId}

             const endpoint = `/ui-api/records/${recordId}`;
             const response = await PlatformHelper.fetchFromSalesforce(endpoint);

             if (response && response.apiName) {
                 const objectName = response.apiName;
                 const fields = response.fields;

                 // Show basic info
                 let html = `
                    <div class="record-card">
                        <h4>${objectName}</h4>
                        <div class="detail-row"><span class="detail-label">ID:</span> <span>${recordId}</span></div>
                        <div class="detail-row"><span class="detail-label">Name:</span> <span>${fields['Name'] ? fields['Name'].value : '(No Name field)'}</span></div>
                        <div class="detail-row"><span class="detail-label">Created By:</span> <span>${fields['CreatedById'] ? fields['CreatedById'].value : '-'}</span></div>
                        <div class="detail-row"><span class="detail-label">Last Modified:</span> <span>${fields['LastModifiedById'] ? fields['LastModifiedById'].value : '-'}</span></div>
                    </div>
                 `;

                 container.innerHTML = html;
             } else {
                 container.innerHTML = `
                    <div>ID detected: <strong>${recordId}</strong></div>
                    <div>Could not retrieve details (might not be a standard record or permissions issue).</div>
                 `;
             }

        } catch (e) {
            container.innerHTML = `
                <div>ID detected: <strong>${recordId}</strong></div>
                <div class="error-message">Error identifying contents: ${e.message}</div>
            `;
        }
    },

    searchRecord: function() {
        const input = document.getElementById('record-search-input');
        const container = document.getElementById('search-results-container');
        const recordId = input.value.trim();

        if (!recordId) {
            container.innerHTML = '<div class="error-message">Please enter an ID.</div>';
            return;
        }

        this.identifyRecord(recordId, container);
    }
};

// Expose globally
window.DataExplorerHelper = DataExplorerHelper;

