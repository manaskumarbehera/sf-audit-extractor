// Lightweight PKCE + token cache scaffold for Salesforce OAuth. Not yet wired to UI.

export function generateCodeVerifier(length = 64) {
  const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~';
  let out = '';
  const arr = new Uint8Array(length);
  crypto.getRandomValues(arr);
  for (const n of arr) out += possible[n % possible.length];
  return out;
}

async function sha256Base64Url(input) {
  const data = new TextEncoder().encode(input);
  const hash = await crypto.subtle.digest('SHA-256', data);
  const bytes = new Uint8Array(hash);
  let str = '';
  bytes.forEach((b) => { str += String.fromCharCode(b); });
  return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export async function buildPkcePair() {
  const verifier = generateCodeVerifier();
  const challenge = await sha256Base64Url(verifier);
  return { verifier, challenge, method: 'S256' };
}

export async function storeToken(key, token) {
  const payload = { oauthTokens: { [key]: { ...token, storedAt: Date.now() } } };
  return new Promise((resolve) => {
    try { chrome.storage?.local?.set?.(payload, () => resolve(true)); } catch { resolve(false); }
  });
}

export async function getToken(key) {
  return new Promise((resolve) => {
    try {
      chrome.storage?.local?.get?.(['oauthTokens'], (r) => {
        const tok = r?.oauthTokens?.[key];
        resolve(tok || null);
      });
    } catch { resolve(null); }
  });
}

export async function clearToken(key) {
  return new Promise((resolve) => {
    try {
      chrome.storage?.local?.get?.(['oauthTokens'], (r) => {
        const stash = r?.oauthTokens || {};
        delete stash[key];
        chrome.storage.local.set({ oauthTokens: stash }, () => resolve(true));
      });
    } catch { resolve(false); }
  });
}

export async function startOAuthFlow({ authUrl, redirectUri, clientId, scope = 'refresh_token api openid', state }) {
  // Placeholder: caller should build authUrl with PKCE params. We keep hook for launchWebAuthFlow.
  return new Promise((resolve) => {
    if (!chrome?.identity?.launchWebAuthFlow) {
      resolve({ success: false, error: 'launchWebAuthFlow unavailable' });
      return;
    }
    chrome.identity.launchWebAuthFlow({ url: authUrl, interactive: true }, (responseUrl) => {
      if (chrome.runtime.lastError || !responseUrl) {
        resolve({ success: false, error: chrome.runtime.lastError?.message || 'OAuth failed' });
        return;
      }
      resolve({ success: true, responseUrl, redirectUri, clientId, scope, state });
    });
  });
}

