
(function() {
    'use strict';
    const API_VERSION = '56.0';

    let allLogs = [];
    let filteredLogs = [];
    let sessionInfo = null;

    const statusEl = document.getElementById('status');
    const statusText = statusEl ? statusEl.querySelector('.status-text') : null;
    const fetchBtn = document.getElementById('fetch-btn');
    const exportBtn = document.getElementById('export-btn');
    const searchInput = document.getElementById('search-input');
    const categoryFilter = document.getElementById('category-filter');
    const logsContainer = document.getElementById('logs-container');
    const statsEl = document.getElementById('stats');

    init();

    async function init() {
        setupTabs();

        // attach LMS UI handlers (if elements exist)
        attachLmsHandlers();

        await checkSalesforceConnection();

        try {
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            if (tab && tab.id) {
                const fresh = await new Promise((resolve) => {
                    chrome.tabs.sendMessage(tab.id, { action: 'getSessionInfo' }, (resp) => resolve(resp));
                });

                if (fresh && fresh.success && fresh.isLoggedIn) {
                    sessionInfo = fresh;

                    const accessToken = fresh.accessToken || fresh.sessionId || fresh.sid || fresh.sessionToken || fresh.session_token;
                    const instanceUrl = fresh.instanceUrl;

                    if (accessToken && instanceUrl) {
                        try {
                            const orgName = await fetchOrgName(instanceUrl, accessToken);
                            updateStatus(true, orgName ? `Connected to ${orgName}` : 'Connected to Salesforce');
                        } catch (err) {
                            updateStatus(true, 'Connected to Salesforce');
                        }
                    }
                }
            }
        } catch (err) {
            // silent
        }

        if (fetchBtn) fetchBtn.addEventListener('click', handleFetch);
        if (exportBtn) exportBtn.addEventListener('click', handleExport);
        if (searchInput) searchInput.addEventListener('input', handleSearch);
        if (categoryFilter) categoryFilter.addEventListener('change', handleFilter);
    }

    async function fetchOrgName(instanceUrl, accessToken) {
        if (!instanceUrl || !accessToken) {
            return null;
        }

        const soql = 'SELECT+Name+FROM+Organization+LIMIT+1';
        const url = `${instanceUrl}/services/data/v${API_VERSION}/query?q=${soql}`;

        try {
            const res = await fetch(url, {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${accessToken}`,
                    'Accept': 'application/json'
                }
            });
            if (!res.ok) throw new Error(`SF API ${res.status}: ${res.statusText}`);
            const data = await res.json();
            const name = data && data.records && data.records[0] && data.records[0].Name;
            return name || null;
        } catch (err) {
            // fallback to background fetch
            return await new Promise((resolve) => {
                chrome.runtime.sendMessage(
                    { action: 'FETCH_ORG_NAME', instanceUrl, accessToken },
                    (resp) => {
                        if (chrome.runtime.lastError) {
                            resolve(null);
                            return;
                        }
                        if (resp && resp.success) {
                            resolve(resp.orgName || null);
                        } else {
                            resolve(null);
                        }
                    }
                );
            });
        }
    }

    function setupTabs() {
        const buttons = document.querySelectorAll('.tab-button');
        const panes = document.querySelectorAll('.tab-pane');
        const headerTitle = document.getElementById('header-title');

        function showTab(name) {
            panes.forEach(p => (p.style.display = p.dataset.tab === name ? 'block' : 'none'));
            buttons.forEach(b => {
                const active = b.dataset.tab === name;
                b.classList.toggle('active', active);
                b.setAttribute('aria-selected', active ? 'true' : 'false');
            });
            const label = {
                sf: 'SF Audit Trail',
                event: 'Event Monitor',
                platform: 'Platform Events',
                lms: 'Lightning Message Service'
            }[name] || 'SF Audit Trail';
            if (headerTitle) headerTitle.textContent = label;
        }

        buttons.forEach(btn => {
            btn.addEventListener('click', () => showTab(btn.dataset.tab));
        });

        const initial = document.querySelector('.tab-button.active')?.dataset.tab || 'sf';
        showTab(initial);
    }

    function attachLmsHandlers() {
        // Simple UI-only handlers for LMS pane; real publish/subscribe requires content/background integration
        const lmsRefresh = document.getElementById('lms-refresh');
        const lmsPublish = document.getElementById('lms-test-publish');
        const lmsLog = document.getElementById('lms-log');

        if (lmsRefresh) {
            lmsRefresh.addEventListener('click', () => {
                if (lmsLog) lmsLog.innerHTML = '<div class="loading"><p>Refreshing LMS activity...</p></div>';
                // placeholder: actual LMS inspection would be implemented with content scripts / background messages
                setTimeout(() => {
                    if (lmsLog) lmsLog.innerHTML = '<div class="placeholder-note">No LMS activity detected (UI-only)</div>';
                }, 800);
            });
        }

        if (lmsPublish) {
            lmsPublish.addEventListener('click', async () => {
                if (lmsLog) lmsLog.innerHTML = '<div class="loading"><p>Publishing test message (UI-only)...</p></div>';
                // placeholder: to actually publish, send message to content script to call LMS API on page context
                setTimeout(() => {
                    if (lmsLog) lmsLog.innerHTML = '<div class="placeholder-note">Published test message (UI-only)</div>';
                }, 600);
            });
        }
    }

    async function checkSalesforceConnection() {
        try {
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            if (!tab || !tab.url) {
                updateStatus(false, 'No active tab');
                return;
            }

            let isSalesforce = false;
            try {
                const url = new URL(tab.url);
                const hostname = url.hostname.toLowerCase();
                isSalesforce = hostname.endsWith('.salesforce.com') ||
                    hostname.endsWith('.force.com') ||
                    hostname === 'salesforce.com' ||
                    hostname === 'force.com';
            } catch {
                isSalesforce = false;
            }

            if (!isSalesforce) {
                updateStatus(false, 'Not on Salesforce');
                showError('Please navigate to a Salesforce page first');
                return;
            }

            // Await the content script response so init() can act on it reliably
            const response = await new Promise((resolve) => {
                chrome.tabs.sendMessage(tab.id, { action: 'getSessionInfo' }, (resp) => resolve(resp));
            });

            if (chrome.runtime.lastError) {
                updateStatus(false, 'Cannot access page');
                return;
            }

            if (response && response.success && response.isLoggedIn) {
                sessionInfo = response;
                updateStatus(true, 'Connected to Salesforce');
            } else {
                updateStatus(false, 'Not logged in');
                showError('Please log in to Salesforce first');
            }
        } catch (error) {
            updateStatus(false, 'Connection failed');
        }
    }

    function updateStatus(connected, message) {
        if (!statusEl || !statusText) return;
        if (connected) statusEl.classList.add('connected');
        else statusEl.classList.remove('connected');
        statusText.textContent = message;
    }

    async function handleFetch() {
        try {
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            if (tab && tab.id) {
                const fresh = await new Promise((resolve) => {
                    chrome.tabs.sendMessage(tab.id, { action: 'getSessionInfo' }, (resp) => resolve(resp));
                });
                if (fresh && fresh.success && fresh.isLoggedIn) {
                    sessionInfo = fresh;
                }
            }
        } catch {
            // ignore
        }

        if (!sessionInfo || !sessionInfo.isLoggedIn) {
            showError('Please ensure you are logged in to Salesforce');
            return;
        }

        if (fetchBtn) {
            fetchBtn.disabled = true;
            fetchBtn.innerHTML = '<span class="btn-icon">⏳</span> Fetching...';
        }
        if (logsContainer) logsContainer.innerHTML = '<div class="loading"><div class="loading-spinner"></div><p>Fetching audit trail data...</p></div>';

        try {
            // Only pass the instance origin; background will normalize host and refresh sid
            chrome.runtime.sendMessage(
                {
                    action: 'FETCH_AUDIT_TRAIL',
                    url: sessionInfo.instanceUrl,
                    days: 180,
                    limit: 2000
                },
                (response) => {
                    if (chrome.runtime.lastError) {
                        showError('Failed to fetch data: ' + chrome.runtime.lastError.message);
                        resetFetchButton();
                        return;
                    }
                    if (response && response.success) {
                        processAuditData(response.data);
                        enableControls();
                    } else {
                        showError(response?.error || 'Failed to fetch audit trail data');
                    }
                    resetFetchButton();
                }
            );
        } catch {
            showError('An error occurred while fetching data');
            resetFetchButton();
        }
    }

    function resetFetchButton() {
        if (fetchBtn) {
            fetchBtn.disabled = false;
            fetchBtn.innerHTML = '<span class="btn-icon">↻</span> Fetch Data';
        }
    }

    function processAuditData(records) {
        if (!records || records.length === 0) {
            showEmpty();
            return;
        }

        allLogs = records.map(record => {
            const category = categorizeAction(record.Section, record.Action);
            return {
                id: record.Id,
                action: record.Action || 'Unknown Action',
                section: record.Section || 'Unknown',
                date: record.CreatedDate,
                user: record.CreatedBy ? record.CreatedBy.Name : 'Unknown User',
                display: record.Display || '',
                delegateUser: record.DelegateUser || '',
                category: category
            };
        });

        filteredLogs = [...allLogs];
        updateStats();
        renderLogs();
    }

    function categorizeAction(section, action) {
        const userPatterns = ['User', 'Profile', 'Permission', 'Role', 'Group'];
        const securityPatterns = ['Security', 'Password', 'Login', 'Authentication', 'Certificate', 'Session'];
        const objectPatterns = ['Object', 'Field', 'Custom', 'Layout', 'Validation', 'Workflow', 'Trigger', 'Apex'];

        const searchText = (section + ' ' + action).toLowerCase();

        for (const pattern of userPatterns) {
            if (searchText.includes(pattern.toLowerCase())) return 'User Management';
        }
        for (const pattern of securityPatterns) {
            if (searchText.includes(pattern.toLowerCase())) return 'Security';
        }
        for (const pattern of objectPatterns) {
            if (searchText.includes(pattern.toLowerCase())) return 'Object Changes';
        }
        return 'Object Changes';
    }

    function updateStats() {
        const userCount = allLogs.filter(log => log.category === 'User Management').length;
        const securityCount = allLogs.filter(log => log.category === 'Security').length;
        const objectCount = allLogs.filter(log => log.category === 'Object Changes').length;

        const totalEl = document.getElementById('total-count');
        const userEl = document.getElementById('user-count');
        const secEl = document.getElementById('security-count');
        const objEl = document.getElementById('object-count');

        if (totalEl) totalEl.textContent = allLogs.length;
        if (userEl) userEl.textContent = userCount;
        if (secEl) secEl.textContent = securityCount;
        if (objEl) objEl.textContent = objectCount;

        if (statsEl) statsEl.style.display = 'grid';
    }

    function renderLogs() {
        if (!logsContainer) return;

        if (filteredLogs.length === 0) {
            logsContainer.innerHTML = '<div class="empty-state"><p>No logs match your search criteria</p></div>';
            return;
        }

        const logsHTML = filteredLogs.map(log => {
            const categoryClass = log.category === 'User Management' ? 'user' :
                log.category === 'Security' ? 'security' : 'object';
            const date = new Date(log.date);
            const formattedDate = date.toLocaleString('en-US', {
                year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
            });

            return `
        <div class="log-item">
          <div class="log-header">
            <div class="log-action">${escapeHtml(log.action)}</div>
            <span class="log-category ${categoryClass}">${log.category}</span>
          </div>
          <div class="log-details">
            <span class="log-detail-label">Section:</span>
            <span>${escapeHtml(log.section)}</span>
            <span class="log-detail-label">User:</span>
            <span>${escapeHtml(log.user)}</span>
            ${log.display ? `
              <span class="log-detail-label">Details:</span>
              <span>${escapeHtml(log.display)}</span>
            ` : ''}
            ${log.delegateUser ? `
              <span class="log-detail-label">Delegate:</span>
              <span>${escapeHtml(log.delegateUser)}</span>
            ` : ''}
          </div>
          <div class="log-date">${formattedDate}</div>
        </div>
      `;
        }).join('');

        logsContainer.innerHTML = logsHTML;
    }

    function handleSearch(e) {
        const term = String(e?.target?.value || '').trim().toLowerCase();
        applyFilters(term, categoryFilter ? categoryFilter.value : 'all');
    }

    function handleFilter(e) {
        const category = String(e?.target?.value || 'all');
        const term = searchInput ? String(searchInput.value || '').trim().toLowerCase() : '';
        applyFilters(term, category);
    }

    function applyFilters(searchTerm, category) {
        const tokens = String(searchTerm || '').split(/\s+/).filter(Boolean);

        filteredLogs = allLogs.filter(log => {
            const action = String(log.action || '').toLowerCase();
            const section = String(log.section || '').toLowerCase();
            const user = String(log.user || '').toLowerCase();
            const display = String(log.display || '').toLowerCase();

            if (category && category !== 'all' && String(log.category) !== String(category)) return false;

            if (tokens.length === 0) return true;

            const haystack = `${action} ${section} ${user} ${display}`;

            return tokens.every(t => haystack.includes(t));
        });

        renderLogs();
    }

    function handleExport() {
        if (allLogs.length === 0) return;
        const csv = convertToCSV(filteredLogs);
        downloadCSV(csv, 'salesforce-audit-trail.csv');
    }

    function convertToCSV(logs) {
        const headers = ['Date', 'Action', 'Section', 'Category', 'User', 'Details', 'Delegate User'];
        const rows = logs.map(log => {
            const date = new Date(log.date).toISOString();
            return [date, log.action, log.section, log.category, log.user, log.display, log.delegateUser];
        });

        const csvContent = [
            headers.join(','),
            ...rows.map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
        ].join('\n');

        return csvContent;
    }

    function downloadCSV(csvContent, filename) {
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        const url = URL.createObjectURL(blob);
        link.setAttribute('href', url);
        link.setAttribute('download', filename);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }

    function enableControls() {
        if (searchInput) searchInput.disabled = false;
        if (categoryFilter) categoryFilter.disabled = false;
        if (exportBtn) exportBtn.disabled = false;
    }

    function showError(message) {
        if (logsContainer) logsContainer.innerHTML = `<div class="error">${escapeHtml(message)}</div>`;
    }

    function showEmpty() {
        if (logsContainer) logsContainer.innerHTML = '<div class="empty-state"><p>No audit trail records found for the last 6 months</p></div>';
    }

    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
})();