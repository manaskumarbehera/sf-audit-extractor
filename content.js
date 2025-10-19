// Content script to extract Salesforce session information
// This runs in the context of Salesforce pages

(function() {
  'use strict';

  // Listen for messages from the popup
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'getSessionInfo') {
      const sessionInfo = extractSessionInfo();
      sendResponse(sessionInfo);
      return true;
    }
  });

  function extractSessionInfo() {
    try {
      // Try to extract session ID from various sources
      const sessionId = extractSessionId();
      const instanceUrl = extractInstanceUrl();
      
      return {
        success: true,
        sessionId: sessionId,
        instanceUrl: instanceUrl,
        isLoggedIn: !!(sessionId && instanceUrl)
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        isLoggedIn: false
      };
    }
  }

  function extractSessionId() {
    // Method 1: Try to get from global variables
    if (typeof window !== 'undefined') {
      // Check for common Salesforce session variables
      if (window.__sfdcSessionId) {
        return window.__sfdcSessionId;
      }
      
      // Check for session in embedded scripts
      const scripts = document.getElementsByTagName('script');
      for (let script of scripts) {
        const content = script.textContent || script.innerText;
        const sessionMatch = content.match(/['"](00D[a-zA-Z0-9]{12,15})![\w.]+['"]/);
        if (sessionMatch) {
          return sessionMatch[1] + sessionMatch[0].split('!')[1].replace(/['"]/g, '');
        }
      }
    }

    // Method 2: Try to extract from meta tags
    const metaTags = document.getElementsByTagName('meta');
    for (let meta of metaTags) {
      if (meta.name === '_session_id' || meta.name === 'sessionId') {
        return meta.content;
      }
    }

    return null;
  }

  function extractInstanceUrl() {
    // Get the instance URL from current location
    const url = window.location.href;
    const match = url.match(/(https:\/\/[^\/]+)/);
    return match ? match[1] : null;
  }

  // Send initial status to background
  if (document.readyState === 'complete') {
    notifyReady();
  } else {
    window.addEventListener('load', notifyReady);
  }

  function notifyReady() {
    const sessionInfo = extractSessionInfo();
    chrome.runtime.sendMessage({
      action: 'contentReady',
      sessionInfo: sessionInfo
    });
  }
})();
