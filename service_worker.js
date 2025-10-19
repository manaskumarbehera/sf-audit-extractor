// Service worker for Salesforce Audit Trail Extractor
chrome.runtime.onInstalled.addListener(() => {
  console.log('Salesforce Audit Trail Extractor installed');
});

// Handle messages from content scripts or dashboard
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'openDashboard') {
    chrome.tabs.create({
      url: chrome.runtime.getURL('dashboard.html')
    });
  }
  return true;
});
