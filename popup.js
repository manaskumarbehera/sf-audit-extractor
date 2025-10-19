// Main popup logic
(function() {
  'use strict';

  // State
  let allLogs = [];
  let filteredLogs = [];
  let sessionInfo = null;

  // DOM elements
  const statusEl = document.getElementById('status');
  const statusText = statusEl.querySelector('.status-text');
  const fetchBtn = document.getElementById('fetch-btn');
  const exportBtn = document.getElementById('export-btn');
  const searchInput = document.getElementById('search-input');
  const categoryFilter = document.getElementById('category-filter');
  const logsContainer = document.getElementById('logs-container');
  const statsEl = document.getElementById('stats');

  // Initialize
  init();

  async function init() {
    // Check if we're on a Salesforce page
    await checkSalesforceConnection();
    
    // Set up event listeners
    fetchBtn.addEventListener('click', handleFetch);
    exportBtn.addEventListener('click', handleExport);
    searchInput.addEventListener('input', handleSearch);
    categoryFilter.addEventListener('change', handleFilter);
  }

  async function checkSalesforceConnection() {
    try {
      // Query active tab
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      
      if (!tab || !tab.url) {
        updateStatus(false, 'No active tab');
        return;
      }

      // Check if it's a Salesforce URL using proper URL parsing
      let isSalesforce = false;
      try {
        const url = new URL(tab.url);
        const hostname = url.hostname.toLowerCase();
        // Check if hostname ends with salesforce.com or force.com
        isSalesforce = hostname.endsWith('.salesforce.com') || 
                       hostname.endsWith('.force.com') ||
                       hostname === 'salesforce.com' ||
                       hostname === 'force.com';
      } catch (e) {
        // Invalid URL
        isSalesforce = false;
      }
      
      if (!isSalesforce) {
        updateStatus(false, 'Not on Salesforce');
        showError('Please navigate to a Salesforce page first');
        return;
      }

      // Try to get session info from the content script
      chrome.tabs.sendMessage(tab.id, { action: 'getSessionInfo' }, (response) => {
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
      });
    } catch (error) {
      console.error('Connection check failed:', error);
      updateStatus(false, 'Connection failed');
    }
  }

  function updateStatus(connected, message) {
    if (connected) {
      statusEl.classList.add('connected');
    } else {
      statusEl.classList.remove('connected');
    }
    statusText.textContent = message;
  }

  async function handleFetch() {
    if (!sessionInfo || !sessionInfo.isLoggedIn) {
      showError('Please ensure you are logged in to Salesforce');
      return;
    }

    // Show loading
    fetchBtn.disabled = true;
    fetchBtn.innerHTML = '<span class="btn-icon">⏳</span> Fetching...';
    logsContainer.innerHTML = '<div class="loading"><div class="loading-spinner"></div><p>Fetching audit trail data...</p></div>';

    try {
      // Send request to background script
      chrome.runtime.sendMessage({
        action: 'fetchAuditTrail',
        sessionId: sessionInfo.sessionId,
        instanceUrl: sessionInfo.instanceUrl
      }, (response) => {
        if (chrome.runtime.lastError) {
          showError('Failed to fetch data: ' + chrome.runtime.lastError.message);
          resetFetchButton();
          return;
        }

        if (response && response.success) {
          processAuditData(response.data);
          enableControls();
        } else {
          showError(response.error || 'Failed to fetch audit trail data');
        }
        
        resetFetchButton();
      });
    } catch (error) {
      console.error('Fetch error:', error);
      showError('An error occurred while fetching data');
      resetFetchButton();
    }
  }

  function resetFetchButton() {
    fetchBtn.disabled = false;
    fetchBtn.innerHTML = '<span class="btn-icon">↻</span> Fetch Data';
  }

  function processAuditData(records) {
    if (!records || records.length === 0) {
      showEmpty();
      return;
    }

    // Process and categorize the data
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
    // User Management related
    const userPatterns = ['User', 'Profile', 'Permission', 'Role', 'Group'];
    
    // Security related
    const securityPatterns = ['Security', 'Password', 'Login', 'Authentication', 'Certificate', 'Session'];
    
    // Object/Data related
    const objectPatterns = ['Object', 'Field', 'Custom', 'Layout', 'Validation', 'Workflow', 'Trigger', 'Apex'];

    const searchText = (section + ' ' + action).toLowerCase();

    for (const pattern of userPatterns) {
      if (searchText.includes(pattern.toLowerCase())) {
        return 'User Management';
      }
    }

    for (const pattern of securityPatterns) {
      if (searchText.includes(pattern.toLowerCase())) {
        return 'Security';
      }
    }

    for (const pattern of objectPatterns) {
      if (searchText.includes(pattern.toLowerCase())) {
        return 'Object Changes';
      }
    }

    return 'Object Changes'; // Default category
  }

  function updateStats() {
    const userCount = allLogs.filter(log => log.category === 'User Management').length;
    const securityCount = allLogs.filter(log => log.category === 'Security').length;
    const objectCount = allLogs.filter(log => log.category === 'Object Changes').length;

    document.getElementById('total-count').textContent = allLogs.length;
    document.getElementById('user-count').textContent = userCount;
    document.getElementById('security-count').textContent = securityCount;
    document.getElementById('object-count').textContent = objectCount;

    statsEl.style.display = 'grid';
  }

  function renderLogs() {
    if (filteredLogs.length === 0) {
      logsContainer.innerHTML = '<div class="empty-state"><p>No logs match your search criteria</p></div>';
      return;
    }

    const logsHTML = filteredLogs.map(log => {
      const categoryClass = log.category === 'User Management' ? 'user' : 
                           log.category === 'Security' ? 'security' : 'object';
      
      const date = new Date(log.date);
      const formattedDate = date.toLocaleString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
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
    const searchTerm = e.target.value.toLowerCase();
    applyFilters(searchTerm, categoryFilter.value);
  }

  function handleFilter(e) {
    const category = e.target.value;
    applyFilters(searchInput.value.toLowerCase(), category);
  }

  function applyFilters(searchTerm, category) {
    filteredLogs = allLogs.filter(log => {
      const matchesSearch = !searchTerm || 
        log.action.toLowerCase().includes(searchTerm) ||
        log.section.toLowerCase().includes(searchTerm) ||
        log.user.toLowerCase().includes(searchTerm) ||
        log.display.toLowerCase().includes(searchTerm);

      const matchesCategory = category === 'all' || log.category === category;

      return matchesSearch && matchesCategory;
    });

    renderLogs();
  }

  function handleExport() {
    if (allLogs.length === 0) {
      return;
    }

    const csv = convertToCSV(filteredLogs);
    downloadCSV(csv, 'salesforce-audit-trail.csv');
  }

  function convertToCSV(logs) {
    const headers = ['Date', 'Action', 'Section', 'Category', 'User', 'Details', 'Delegate User'];
    const rows = logs.map(log => {
      const date = new Date(log.date).toISOString();
      return [
        date,
        log.action,
        log.section,
        log.category,
        log.user,
        log.display,
        log.delegateUser
      ];
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
    searchInput.disabled = false;
    categoryFilter.disabled = false;
    exportBtn.disabled = false;
  }

  function showError(message) {
    logsContainer.innerHTML = `<div class="error">${escapeHtml(message)}</div>`;
  }

  function showEmpty() {
    logsContainer.innerHTML = '<div class="empty-state"><p>No audit trail records found for the last 6 months</p></div>';
  }

  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
})();
