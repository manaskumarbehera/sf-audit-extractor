(function(){
  'use strict';
  const state = {
    channels: [],
    loaded: false,
    lmsAvailable: null,  // null = not checked, true/false = checked
    selectedChannelIndex: -1
  };
  let dom = {};
  let opts = { getSession: () => null };

  function updateCopyEnabled() {
    if (!dom.payloadCopy) return;
    const hasText = !!(dom.payloadTa && String(dom.payloadTa.value || '').trim());
    dom.payloadCopy.disabled = !hasText;
    dom.payloadCopy.title = hasText ? 'Copy sample payload' : 'Nothing to copy';
  }

  function updatePublishEnabled() {
    if (!dom.publishBtn) return;
    const hasChannel = state.selectedChannelIndex >= 0;
    const hasPayload = !!(dom.payloadTa && String(dom.payloadTa.value || '').trim());
    dom.publishBtn.disabled = !hasChannel || !hasPayload;

    if (!hasChannel) {
      dom.publishBtn.title = 'Select a channel first';
    } else if (!hasPayload) {
      dom.publishBtn.title = 'Enter a payload to publish';
    } else {
      dom.publishBtn.title = 'Publish message to LMS channel';
    }
  }

  function appendLog(message, type = 'info', data = null) {
    if (!dom.log) return;

    const entry = document.createElement('div');
    entry.className = `log-entry log-${type}`;

    const timestamp = new Date().toLocaleTimeString();
    const header = document.createElement('div');
    header.className = 'log-header';

    const badge = document.createElement('span');
    badge.className = `log-badge ${type}`;
    badge.textContent = type;

    const msg = document.createElement('span');
    msg.className = 'log-message';
    msg.textContent = `[${timestamp}] ${message}`;

    header.appendChild(badge);
    header.appendChild(msg);
    entry.appendChild(header);

    // Add expandable data section if provided
    if (data) {
      const details = document.createElement('details');
      details.className = 'log-details';
      const summary = document.createElement('summary');
      summary.textContent = 'Details';
      const pre = document.createElement('pre');
      pre.className = 'log-json';
      try {
        pre.textContent = typeof data === 'string' ? data : JSON.stringify(data, null, 2);
      } catch {
        pre.textContent = String(data);
      }
      details.appendChild(summary);
      details.appendChild(pre);
      entry.appendChild(details);
    }

    const ph = dom.log.querySelector('.placeholder, .placeholder-note');
    if (ph) ph.remove();
    dom.log.appendChild(entry);
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
    state.selectedChannelIndex = -1;
    updateCopyEnabled();
    updatePublishEnabled();
  }

  async function checkLmsAvailability() {
    try {
      const resp = await new Promise((resolve) => {
        chrome.runtime.sendMessage({ action: 'LMS_CHECK_AVAILABILITY' }, (r) => resolve(r));
      });
      state.lmsAvailable = !!(resp && resp.isLightningPage);
      return resp;
    } catch (e) {
      state.lmsAvailable = false;
      return { success: false, isLightningPage: false, error: String(e) };
    }
  }

  async function loadChannels(force = false) {
    try {
      if (!force && state.loaded && Array.isArray(state.channels) && state.channels.length) return;
      const s = opts.getSession();
      if (!s || !s.isLoggedIn) {
        appendLog('Not connected to Salesforce. Open a Salesforce tab and log in.', 'error');
        return;
      }

      appendLog('Fetching LMS channels...', 'system');

      const resp = await new Promise((resolve) => {
        chrome.runtime.sendMessage({ action: 'LMS_FETCH_CHANNELS', instanceUrl: s.instanceUrl }, (r) => resolve(r));
      });

      if (!resp || !resp.success) {
        appendLog('Failed to fetch LMS channels: ' + (resp?.error || 'Unknown error'), 'error');
        return;
      }

      state.channels = Array.isArray(resp.channels) ? resp.channels : [];
      populateChannelSelect(state.channels);
      state.loaded = true;
      appendLog(`Loaded ${state.channels.length} LMS channel(s).`, 'success');

      // Check LMS availability in background
      checkLmsAvailability().then(avail => {
        if (avail && !avail.isLightningPage) {
          appendLog('Note: LMS publishing requires a Lightning Experience page. Navigate to a Lightning page to enable publishing.', 'system');
        }
      });

    } catch (e) {
      appendLog('Error loading channels: ' + String(e), 'error');
    }
  }

  function handleChannelChange() {
    if (!dom.channelSel || !dom.payloadTa) return;
    const idx = parseInt(String(dom.channelSel.value || '-1'), 10);
    state.selectedChannelIndex = idx;

    if (!Number.isFinite(idx) || idx < 0 || idx >= state.channels.length) {
      dom.payloadTa.value = '';
      updateCopyEnabled();
      updatePublishEnabled();
      return;
    }

    const channel = state.channels[idx];
    const sample = generateSamplePayload(channel);
    try {
      dom.payloadTa.value = JSON.stringify(sample, null, 2);
      appendLog(`Sample payload generated for ${channel.fullName || channel.developerName}`, 'info');
    }
    catch {
      dom.payloadTa.value = '{ "text": "Hello from LMS" }';
    }
    updateCopyEnabled();
    updatePublishEnabled();
  }

  async function handlePublish() {
    const idx = state.selectedChannelIndex;
    if (idx < 0 || idx >= state.channels.length) {
      appendLog('Please select a channel first', 'error');
      return;
    }

    const channel = state.channels[idx];
    const channelApiName = channel.fullName || channel.developerName;

    // Parse and validate payload
    let payload;
    try {
      const payloadText = dom.payloadTa?.value?.trim() || '{}';
      payload = JSON.parse(payloadText);
      if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) {
        throw new Error('Payload must be a JSON object');
      }
    } catch (e) {
      appendLog('Invalid JSON payload: ' + e.message, 'error');
      return;
    }

    // Disable button and show loading state
    if (dom.publishBtn) {
      dom.publishBtn.disabled = true;
      dom.publishBtn.innerHTML = '<span aria-hidden="true">⏳</span>';
    }

    appendLog(`Publishing to ${channelApiName}...`, 'system', payload);

    try {
      const resp = await new Promise((resolve) => {
        chrome.runtime.sendMessage({
          action: 'LMS_PUBLISH',
          channel: channelApiName,
          payload: payload
        }, (r) => resolve(r));
      });

      if (!resp || !resp.success) {
        const errorMsg = resp?.error || 'Unknown error';
        appendLog(`❌ Publish failed: ${errorMsg}`, 'error', resp);

        // Provide helpful guidance
        if (errorMsg.includes('Lightning')) {
          appendLog('Tip: Make sure you have a Lightning Experience page open (not Classic or Setup).', 'system');
        }
      } else {
        appendLog(`✓ Message published to ${channelApiName}`, 'success', resp);
        if (resp.note) {
          appendLog(resp.note, 'system');
        }
      }
    } catch (e) {
      appendLog('Publish error: ' + String(e), 'error');
    } finally {
      // Restore button state
      if (dom.publishBtn) {
        dom.publishBtn.disabled = false;
        dom.publishBtn.innerHTML = '<span aria-hidden="true">📤</span>';
        updatePublishEnabled();
      }
    }
  }

  function formatPayload() {
    if (!dom.payloadTa) return;
    try {
      const obj = JSON.parse(dom.payloadTa.value);
      dom.payloadTa.value = JSON.stringify(obj, null, 2);
      dom.payloadTa.classList.remove('error');
    } catch (e) {
      dom.payloadTa.classList.add('error');
      appendLog('Invalid JSON: ' + e.message, 'error');
    }
  }

  function clearLog() {
    if (!dom.log) return;
    dom.log.innerHTML = '<div class="placeholder-note">No LMS activity yet</div>';
  }

  function attachHandlers(){
    if (dom.payloadCopy) {
      dom.payloadCopy.addEventListener('click', async () => {
        if (!dom.payloadTa) return;
        const text = String(dom.payloadTa.value || '');
        if (!text.trim()) return;
        try {
          await navigator.clipboard.writeText(text);
          const prevTitle = dom.payloadCopy.title;
          dom.payloadCopy.title = 'Copied!';
          dom.payloadCopy.classList.add('copied');
          setTimeout(() => {
            dom.payloadCopy.classList.remove('copied');
            dom.payloadCopy.title = prevTitle || 'Copy sample payload';
          }, 900);
        } catch {
          try {
            dom.payloadTa.select();
            document.execCommand('copy');
            const prevTitle = dom.payloadCopy.title;
            dom.payloadCopy.title = 'Copied!';
            dom.payloadCopy.classList.add('copied');
            setTimeout(() => {
              dom.payloadCopy.classList.remove('copied');
              dom.payloadCopy.title = prevTitle || 'Copy sample payload';
            }, 900);
          } catch {}
        }
      });
    }

    if (dom.payloadTa) {
      dom.payloadTa.addEventListener('input', () => {
        updateCopyEnabled();
        updatePublishEnabled();
      });
      // Format on blur
      dom.payloadTa.addEventListener('blur', formatPayload);
    }

    if (dom.refreshBtn) {
      dom.refreshBtn.addEventListener('click', async () => {
        if (dom.refreshBtn.disabled) return;
        const orig = dom.refreshBtn.innerHTML;
        dom.refreshBtn.disabled = true;
        dom.refreshBtn.innerHTML = '<span aria-hidden="true">⏳</span>';
        try {
          await loadChannels(true);
        } finally {
          dom.refreshBtn.innerHTML = orig;
          dom.refreshBtn.disabled = false;
        }
      });
    }

    if (dom.publishBtn) {
      dom.publishBtn.addEventListener('click', handlePublish);
    }

    if (dom.clearLogBtn) {
      dom.clearLogBtn.addEventListener('click', clearLog);
    }

    if (dom.channelSel) {
      dom.channelSel.addEventListener('change', handleChannelChange);
    }

    try {
      document.addEventListener('lms-load', () => { loadChannels(false); });
    } catch {}

    const activeTab = document.querySelector('.tab-button.active')?.getAttribute('data-tab');
    if (activeTab === 'lms') loadChannels(false);
    updateCopyEnabled();
    updatePublishEnabled();
  }

  function init(options){
    opts = { ...opts, ...options };
    dom = {
      log: document.getElementById('lms-log'),
      refreshBtn: document.getElementById('lms-refresh'),
      publishBtn: document.getElementById('lms-publish'),
      clearLogBtn: document.getElementById('lms-clear-log'),
      channelSel: document.getElementById('lms-channel'),
      payloadTa: document.getElementById('lms-payload'),
      payloadCopy: document.getElementById('lms-payload-copy')
    };
    attachHandlers();
  }

  // Export for testing
  if (typeof window !== 'undefined') {
    window.__LmsTestHooks = {
      getState: () => state,
      setState: (s) => Object.assign(state, s),
      setDomForTests: (d) => { dom = d; },
      setOpts: (o) => { opts = { ...opts, ...o }; },
      handlePublish,
      loadChannels,
      checkLmsAvailability,
      appendLog
    };
  }

  window.LmsHelper = { init };
})();
