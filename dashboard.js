// Dashboard JavaScript for Salesforce Audit Trail Extractor
(function() {
  'use strict';

  // State management
  let allRecords = [];
  let filteredRecords = [];
  let currentCategory = 'all';

  // DOM elements
  const searchInput = document.getElementById('searchInput');
  const filterChips = document.querySelectorAll('.chip');
  const exportCsvBtn = document.getElementById('exportCsvBtn');
  const auditTableBody = document.getElementById('auditTableBody');
  const loadingSpinner = document.getElementById('loadingSpinner');
  const errorMessage = document.getElementById('errorMessage');
  const infoMessage = document.getElementById('infoMessage');

  // Category mapping regex patterns
  const categoryPatterns = {
    user_management: /User|Profile|Permission|Role|Login/i,
    security: /Session|Password|MFA|SAML|SSO|Certificate/i,
    object_field: /Field|Object|Validation|Flow|Trigger|Layout/i,
    email: /Email|Template|Letterhead/i
  };

  // Categorize a record based on Display and Section
  function categorizeRecord(record) {
    const text = `${record.Display || ''} ${record.Section || ''}`;
    
    for (const [category, pattern] of Object.entries(categoryPatterns)) {
      if (pattern.test(text)) {
        return category;
      }
    }
    
    return 'other';
  }

  // Format date for display
  function formatDate(dateString) {
    if (!dateString) return '';
    const date = new Date(dateString);
    return date.toLocaleString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  // Show status message
  function showStatus(type, message) {
    loadingSpinner.style.display = 'none';
    errorMessage.style.display = 'none';
    infoMessage.style.display = 'none';

    if (type === 'loading') {
      loadingSpinner.style.display = 'flex';
    } else if (type === 'error') {
      errorMessage.textContent = message;
      errorMessage.style.display = 'block';
    } else if (type === 'info') {
      infoMessage.textContent = message;
      infoMessage.style.display = 'block';
    }
  }

  // Execute SOQL query in Salesforce context
  async function executeSoqlInSalesforce(tabId, query) {
    return new Promise((resolve, reject) => {
      chrome.scripting.executeScript({
        target: { tabId: tabId },
        world: 'MAIN',
        func: (soqlQuery) => {
          return new Promise(async (resolve, reject) => {
            try {
              // Get instance URL from current page
              const instanceUrl = window.location.origin;

              // Execute SOQL query using Salesforce's REST API
              // The browser already has the session cookie, so we don't need to pass it
              const fetchRecords = async (url) => {
                const response = await fetch(url, {
                  method: 'GET',
                  headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json'
                  },
                  credentials: 'include'
                });

                if (!response.ok) {
                  const errorText = await response.text();
                  throw new Error(`HTTP ${response.status}: ${errorText}`);
                }

                return response.json();
              };

              const queryUrl = `${instanceUrl}/services/data/v59.0/query?q=${encodeURIComponent(soqlQuery)}`;
              
              // Fetch all records with pagination
              const allRecords = [];
              let nextUrl = queryUrl;

              while (nextUrl) {
                const result = await fetchRecords(nextUrl);
                
                if (result.records) {
                  allRecords.push(...result.records);
                }
                
                if (result.nextRecordsUrl) {
                  nextUrl = `${instanceUrl}${result.nextRecordsUrl}`;
                } else {
                  nextUrl = null;
                }
              }
              
              resolve(allRecords);
            } catch (error) {
              reject(error.message || error.toString());
            }
          });
        },
        args: [query]
      }, (results) => {
        if (chrome.runtime.lastError) {
          reject(chrome.runtime.lastError.message);
          return;
        }

        if (results && results[0]) {
          if (results[0].result instanceof Error) {
            reject(results[0].result.message);
          } else if (typeof results[0].result === 'string' && results[0].result.includes('Error')) {
            reject(results[0].result);
          } else {
            resolve(results[0].result);
          }
        } else {
          reject('No results returned from query');
        }
      });
    });
  }

  // Fetch audit trail data
  async function fetchAuditTrail() {
    showStatus('loading', 'Loading audit trail data...');

    try {
      // Get all Salesforce tabs
      const tabs = await chrome.tabs.query({
        url: [
          'https://*.salesforce.com/*',
          'https://*.lightning.force.com/*',
          'https://*.my.salesforce.com/*'
        ]
      });

      if (tabs.length === 0) {
        throw new Error('No Salesforce tabs found. Please open a Salesforce page and try again.');
      }

      // Use the first Salesforce tab
      const sfTab = tabs[0];

      // SOQL query for audit trail (last 180 days)
      const query = `
        SELECT Action, CreatedBy.Name, CreatedDate, Section, Display, DelegateUser
        FROM SetupAuditTrail
        WHERE CreatedDate = LAST_180_DAYS
        ORDER BY CreatedDate DESC
      `;

      const records = await executeSoqlInSalesforce(sfTab.id, query);

      if (records.length === 0) {
        showStatus('info', 'No audit trail records found for the last 180 days.');
        return;
      }

      // Process records with categories
      allRecords = records.map(record => ({
        Action: record.Action || '',
        CreatedByName: record.CreatedBy?.Name || '',
        CreatedDate: record.CreatedDate || '',
        Section: record.Section || '',
        Display: record.Display || '',
        DelegateUser: record.DelegateUser || '',
        category: categorizeRecord(record)
      }));

      filteredRecords = [...allRecords];
      
      showStatus('none');
      updateCategoryCounts();
      renderTable();

    } catch (error) {
      console.error('Error fetching audit trail:', error);
      showStatus('error', `Error: ${error.message || error}. Make sure you're logged into Salesforce and try again.`);
    }
  }

  // Update category counts
  function updateCategoryCounts() {
    const counts = {
      all: allRecords.length,
      user_management: 0,
      security: 0,
      object_field: 0,
      email: 0,
      other: 0
    };

    allRecords.forEach(record => {
      counts[record.category]++;
    });

    filterChips.forEach(chip => {
      const category = chip.dataset.category;
      const countSpan = chip.querySelector('.count');
      if (countSpan) {
        countSpan.textContent = counts[category] || 0;
      }
    });
  }

  // Render table with filtered data
  function renderTable() {
    auditTableBody.innerHTML = '';

    if (filteredRecords.length === 0) {
      const row = document.createElement('tr');
      row.innerHTML = '<td colspan="7" style="text-align: center; padding: 40px; color: #6b7280;">No records match your filters</td>';
      auditTableBody.appendChild(row);
      return;
    }

    filteredRecords.forEach(record => {
      const row = document.createElement('tr');
      row.innerHTML = `
        <td>${formatDate(record.CreatedDate)}</td>
        <td>${escapeHtml(record.CreatedByName)}</td>
        <td>${escapeHtml(record.Action)}</td>
        <td>${escapeHtml(record.Section)}</td>
        <td>${escapeHtml(record.Display)}</td>
        <td>${escapeHtml(record.DelegateUser)}</td>
        <td>
          <span class="category-badge category-${record.category}">
            ${record.category.replace('_', ' ')}
          </span>
        </td>
      `;
      auditTableBody.appendChild(row);
    });
  }

  // Escape HTML to prevent XSS
  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  // Filter records by category
  function filterByCategory(category) {
    currentCategory = category;
    
    // Update active chip
    filterChips.forEach(chip => {
      if (chip.dataset.category === category) {
        chip.classList.add('active');
      } else {
        chip.classList.remove('active');
      }
    });

    applyFilters();
  }

  // Filter records by search text
  function filterBySearch(searchText) {
    applyFilters(searchText);
  }

  // Apply all active filters
  function applyFilters(searchText = '') {
    const search = searchText || searchInput.value.toLowerCase();
    
    filteredRecords = allRecords.filter(record => {
      // Category filter
      if (currentCategory !== 'all' && record.category !== currentCategory) {
        return false;
      }

      // Search filter
      if (search) {
        const searchableText = [
          record.CreatedByName,
          record.Action,
          record.Section,
          record.Display,
          record.DelegateUser,
          formatDate(record.CreatedDate)
        ].join(' ').toLowerCase();

        if (!searchableText.includes(search)) {
          return false;
        }
      }

      return true;
    });

    renderTable();
  }

  // Export to CSV
  function exportToCsv() {
    if (filteredRecords.length === 0) {
      alert('No records to export');
      return;
    }

    const headers = ['Date', 'User', 'Action', 'Section', 'Display', 'Delegate User', 'Category'];
    const rows = filteredRecords.map(record => [
      formatDate(record.CreatedDate),
      record.CreatedByName,
      record.Action,
      record.Section,
      record.Display,
      record.DelegateUser,
      record.category.replace('_', ' ')
    ]);

    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${cell.replace(/"/g, '""')}"`).join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    
    link.setAttribute('href', url);
    link.setAttribute('download', `salesforce_audit_trail_${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  // Event listeners
  searchInput.addEventListener('input', (e) => {
    filterBySearch(e.target.value);
  });

  filterChips.forEach(chip => {
    chip.addEventListener('click', () => {
      filterByCategory(chip.dataset.category);
    });
  });

  exportCsvBtn.addEventListener('click', exportToCsv);

  // Initialize - set "All" as active by default
  filterChips[0].classList.add('active');

  // Fetch data on page load
  fetchAuditTrail();
})();
