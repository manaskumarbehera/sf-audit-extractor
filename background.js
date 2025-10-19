// Background service worker for the extension
// Handles API requests and data processing

// Store session info
let cachedSessionInfo = null;

// Listen for messages from content scripts and popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'contentReady') {
    cachedSessionInfo = request.sessionInfo;
  } else if (request.action === 'getSessionInfo') {
    sendResponse(cachedSessionInfo);
  } else if (request.action === 'fetchAuditTrail') {
    handleFetchAuditTrail(request, sendResponse);
    return true; // Will respond asynchronously
  }
});

async function handleFetchAuditTrail(request, sendResponse) {
  try {
    const { sessionId, instanceUrl } = request;
    
    if (!sessionId || !instanceUrl) {
      sendResponse({
        success: false,
        error: 'No valid Salesforce session found. Please make sure you are logged into Salesforce.'
      });
      return;
    }

    // Fetch audit trail data
    const auditData = await fetchAuditTrailData(sessionId, instanceUrl);
    
    sendResponse({
      success: true,
      data: auditData
    });
  } catch (error) {
    sendResponse({
      success: false,
      error: error.message
    });
  }
}

async function fetchAuditTrailData(sessionId, instanceUrl) {
  // Calculate date 6 months ago
  const sixMonthsAgo = new Date();
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
  const startDate = sixMonthsAgo.toISOString().split('T')[0];

  try {
    // Try to use Tooling API to query SetupAuditTrail
    const query = `SELECT Id, Action, Section, CreatedDate, CreatedBy.Name, Display, DelegateUser FROM SetupAuditTrail WHERE CreatedDate >= ${startDate}T00:00:00Z ORDER BY CreatedDate DESC`;
    
    const response = await fetch(`${instanceUrl}/services/data/v58.0/tooling/query?q=${encodeURIComponent(query)}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${sessionId}`,
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      throw new Error(`API request failed: ${response.status} ${response.statusText}`);
    }

    const result = await response.json();
    return result.records || [];
  } catch (error) {
    console.error('Error fetching audit trail:', error);
    throw error;
  }
}

// Installation handler
chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    console.log('Salesforce Audit Trail Extractor installed');
  }
});
