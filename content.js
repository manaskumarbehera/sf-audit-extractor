// Content script to inject floating audit button on Salesforce pages
(function() {
  'use strict';

  // Check if we're on a Salesforce page
  const isSalesforcePage = () => {
    const hostname = window.location.hostname;
    // Properly validate Salesforce domain suffixes to prevent bypassing
    return hostname.endsWith('.salesforce.com') || 
           hostname.endsWith('.lightning.force.com') || 
           hostname.endsWith('.my.salesforce.com') ||
           hostname === 'salesforce.com' ||
           hostname === 'lightning.force.com' ||
           hostname === 'my.salesforce.com';
  };

  // Create and inject the floating button
  const createFloatingButton = () => {
    // Check if button already exists
    if (document.getElementById('sf-audit-extractor-btn')) {
      return;
    }

    const button = document.createElement('div');
    button.id = 'sf-audit-extractor-btn';
    button.className = 'sf-audit-extractor-floating-btn';
    button.title = 'Open Audit Trail Dashboard';
    
    // SVG icon for audit/log
    button.innerHTML = `
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
        <path d="M9 2h6a1 1 0 011 1v1h3a1 1 0 011 1v16a1 1 0 01-1 1H5a1 1 0 01-1-1V5a1 1 0 011-1h3V3a1 1 0 011-1zm0 2v2h6V4H9zm-3 3v12h12V7H6zm2 2h8v2H8V9zm0 3h8v2H8v-2zm0 3h5v2H8v-2z"/>
      </svg>
    `;

    button.addEventListener('click', openDashboard);
    
    document.body.appendChild(button);
  };

  // Open the dashboard in a new tab
  const openDashboard = () => {
    const dashboardUrl = chrome.runtime.getURL('dashboard.html');
    window.open(dashboardUrl, '_blank');
  };

  // Initialize
  if (isSalesforcePage()) {
    // Wait for DOM to be ready
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', createFloatingButton);
    } else {
      createFloatingButton();
    }
  }
})();
