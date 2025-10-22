(function(){
  'use strict';
  const state = { channels: [], loaded: false };
  let dom = {};
  let opts = { getSession: () => null };

  function updateCopyEnabled() {
    if (!dom.payloadCopy) return;
    const hasText = !!(dom.payloadTa && String(dom.payloadTa.value || '').trim());
    dom.payloadCopy.disabled = !hasText;
    dom.payloadCopy.title = hasText ? 'Copy sample payload' : 'Nothing to copy';
  }

  function appendLog(message) {
    if (!dom.log) return;
    const p = document.createElement('p');
    p.className = 'log-line';
    p.textContent = `[${new Date().toLocaleTimeString()}] ${message}`;
    const ph = dom.log.querySelector('.placeholder, .placeholder-note');
    if (ph) ph.remove();
    dom.log.appendChild(p);
    dom.log.scrollTop = dom.log.scrollHeight;
  }

  function generateSamplePayload(channel) {
    try {
      const fields = Array.isArray(channel?.fields) ? channel.fields : [];
      if (!fields.length) return { text: 'Hello from LMS' };
      const obj = {};
      for (const f of fields) {
        const key = String(f.name || '').trim();
        if (!key) continue;
        if (/count|number|qty/i.test(key)) obj[key] = 1;
        else if (/id$/i.test(key)) obj[key] = 'a0123456789ABCDE';
        else if (/date/i.test(key)) obj[key] = new Date().toISOString();
        else if (/url/i.test(key)) obj[key] = 'https://example.com';
        else obj[key] = 'Sample';
      }
      return Object.keys(obj).length ? obj : { text: 'Hello from LMS' };
    } catch { return { text: 'Hello from LMS' }; }
  }

  function populateChannelSelect(channels) {
    if (!dom.channelSel) return;
    const optsHtml = ['<option value="">Select a message channel</option>'];
    for (let i = 0; i < channels.length; i++) {
      const c = channels[i];
      const label = `${Utils.escapeHtml(c.masterLabel || c.fullName || c.developerName)} (${Utils.escapeHtml(c.fullName || c.developerName)})`;
      optsHtml.push(`<option value="${i}">${label}</option>`);
    }
    dom.channelSel.innerHTML = optsHtml.join('');
    dom.channelSel.disabled = channels.length === 0;
    if (dom.payloadTa) dom.payloadTa.value = '';
    updateCopyEnabled();
  }

  async function loadChannels(force = false) {
    try {
      if (!force && state.loaded && Array.isArray(state.channels) && state.channels.length) return;
      const s = opts.getSession();
      if (!s || !s.isLoggedIn) { appendLog('Not connected to Salesforce. Open a Salesforce tab and log in.'); return; }
      const resp = await new Promise((resolve) => {
        chrome.runtime.sendMessage({ action: 'LMS_FETCH_CHANNELS', instanceUrl: s.instanceUrl }, (r) => resolve(r));
      });
      if (!resp || !resp.success) { appendLog('Failed to fetch LMS channels: ' + (resp?.error || 'Unknown error')); return; }
      state.channels = Array.isArray(resp.channels) ? resp.channels : [];
      populateChannelSelect(state.channels);
      state.loaded = true;
      appendLog(`Loaded ${state.channels.length} LMS channel(s).`);
    } catch (e) { appendLog('Error loading channels: ' + String(e)); }
  }

  function handleChannelChange() {
    if (!dom.channelSel || !dom.payloadTa) return;
    const idx = parseInt(String(dom.channelSel.value || '-1'), 10);
    if (!Number.isFinite(idx) || idx < 0 || idx >= state.channels.length) { dom.payloadTa.value = ''; updateCopyEnabled(); return; }
    const channel = state.channels[idx];
    const sample = generateSamplePayload(channel);
    try { dom.payloadTa.value = JSON.stringify(sample, null, 2); appendLog(`Sample payload generated for ${channel.fullName || channel.developerName}`); }
    catch { dom.payloadTa.value = '{ "text": "Hello from LMS" }'; }
    updateCopyEnabled();
  }

  function attachHandlers(){
    if (dom.payloadCopy) {
      dom.payloadCopy.addEventListener('click', async () => {
        if (!dom.payloadTa) return;
        const text = String(dom.payloadTa.value || '');
        if (!text.trim()) return;
        try {
          await navigator.clipboard.writeText(text);
          const prevTitle = dom.payloadCopy.title; dom.payloadCopy.title = 'Copied!'; dom.payloadCopy.classList.add('copied');
          setTimeout(() => { dom.payloadCopy.classList.remove('copied'); dom.payloadCopy.title = prevTitle || 'Copy sample payload'; }, 900);
        } catch {
          try {
            dom.payloadTa.select(); document.execCommand('copy');
            const prevTitle = dom.payloadCopy.title; dom.payloadCopy.title = 'Copied!'; dom.payloadCopy.classList.add('copied');
            setTimeout(() => { dom.payloadCopy.classList.remove('copied'); dom.payloadCopy.title = prevTitle || 'Copy sample payload'; }, 900);
          } catch {}
        }
      });
    }
    if (dom.payloadTa) dom.payloadTa.addEventListener('input', updateCopyEnabled);
    if (dom.refreshBtn) dom.refreshBtn.addEventListener('click', async () => {
      if (dom.refreshBtn.disabled) return;
      const orig = dom.refreshBtn.innerHTML; dom.refreshBtn.disabled = true; dom.refreshBtn.innerHTML = '<span aria-hidden="true">⏳</span>';
      try { await loadChannels(true); } finally { dom.refreshBtn.innerHTML = orig; dom.refreshBtn.disabled = false; }
    });
    if (dom.channelSel) dom.channelSel.addEventListener('change', handleChannelChange);
    try { document.addEventListener('lms-load', () => { loadChannels(false); }); } catch {}
    const activeTab = document.querySelector('.tab-button.active')?.getAttribute('data-tab');
    if (activeTab === 'lms') loadChannels(false);
    updateCopyEnabled();
  }

  function init(options){
    opts = { ...opts, ...options };
    dom = {
      log: document.getElementById('lms-log'),
      refreshBtn: document.getElementById('lms-refresh'),
      channelSel: document.getElementById('lms-channel'),
      payloadTa: document.getElementById('lms-payload'),
      payloadCopy: document.getElementById('lms-payload-copy')
    };
    attachHandlers();
  }

  window.LmsHelper = { init };
})();
