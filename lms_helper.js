(function(){
  'use strict';
  const state = {
    channels: [],
    loaded: false,
    lmsAvailable: null,  // null = not checked, true/false = checked
    selectedChannelIndex: -1,
    logPaused: false,
    logAutoScrollEnabled: true,
    // Publish modal state
    publishModalChannel: null
  };
  let dom = {};
  let opts = { getSession: () => null };

  function appendLog(message, type = 'info', data = null) {
    if (!dom.log) return;
    if (state.logPaused) return;

    const entry = document.createElement('div');
    entry.className = `log-entry log-${type}`;
    entry.setAttribute('data-type', type);

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
    applyLogFilter();
    if (state.logAutoScrollEnabled) {
      dom.log.scrollTop = dom.log.scrollHeight;
    }
  }

  function applyLogFilter() {
    if (!dom.log) return;
    const filter = dom.logFilterSel ? dom.logFilterSel.value : 'all';
    const entries = dom.log.querySelectorAll('.log-entry');
    entries.forEach(el => {
      const type = el.getAttribute('data-type') || 'info';
      const visible = filter === 'all' || filter === type;
      el.style.display = visible ? '' : 'none';
    });
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

  /**
   * Render channels as a list with inline publish buttons (similar to Platform Events)
   */
  function renderChannelsList(channels) {
    if (!dom.channelsList) return;
    if (!channels || channels.length === 0) {
      dom.channelsList.innerHTML = '<div class="placeholder"><p>No LMS channels found</p></div>';
      return;
    }

    const html = channels.map((channel, idx) => {
      const api = channel.fullName || channel.developerName;
      const label = channel.masterLabel || channel.fullName || channel.developerName;
      const publishIcon = `<svg viewBox="0 0 24 24" width="12" height="12" aria-hidden="true"><path fill="currentColor" d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg>`;
      return `
        <div class="list-item" data-channel-index="${idx}" data-channel-api="${Utils.escapeHtml(api)}">
          <div class="item-actions leading">
            <button class="lms-publish-btn" aria-label="Publish to ${Utils.escapeHtml(label)}" title="Publish to ${Utils.escapeHtml(label)}">
              ${publishIcon}
            </button>
          </div>
          <div class="item-main">
            <div class="item-title">${Utils.escapeHtml(label)} <span class="item-subtle">(${Utils.escapeHtml(api)})</span></div>
          </div>
        </div>`;
    }).join('');
    dom.channelsList.innerHTML = html;
  }

  async function checkLmsAvailability() {
    try {
      // Get instanceUrl from session to help background find the right tab
      const session = opts.getSession();
      const instanceUrl = session?.instanceUrl || null;

      const resp = await new Promise((resolve) => {
        chrome.runtime.sendMessage({ action: 'LMS_CHECK_AVAILABILITY', instanceUrl: instanceUrl }, (r) => resolve(r));
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
      renderChannelsList(state.channels);
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

  /**
   * Open the publish modal for a given channel
   */
  function openPublishModal(channelIndex) {
    if (channelIndex < 0 || channelIndex >= state.channels.length) return;
    const channel = state.channels[channelIndex];
    state.publishModalChannel = channel;

    // Set channel name in modal
    if (dom.modalChannelName) {
      dom.modalChannelName.textContent = channel.fullName || channel.developerName;
    }

    // Generate and set sample payload
    if (dom.modalPayload) {
      const sample = generateSamplePayload(channel);
      try {
        dom.modalPayload.value = JSON.stringify(sample, null, 2);
        dom.modalPayload.classList.remove('error');
      } catch {
        dom.modalPayload.value = '{ "text": "Hello from LMS" }';
      }
    }

    // Show modal
    if (dom.publishModal) {
      dom.publishModal.hidden = false;
    }
  }

  /**
   * Close the publish modal
   */
  function closePublishModal() {
    if (dom.publishModal) {
      dom.publishModal.hidden = true;
    }
    state.publishModalChannel = null;
  }

  /**
   * Handle publish from modal
   */
  async function handleModalPublish() {
    const channel = state.publishModalChannel;
    if (!channel) {
      appendLog('No channel selected', 'error');
      return;
    }

    const channelApiName = channel.fullName || channel.developerName;

    // Parse and validate payload
    let payload;
    try {
      const payloadText = dom.modalPayload?.value?.trim() || '{}';
      payload = JSON.parse(payloadText);
      if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) {
        throw new Error('Payload must be a JSON object');
      }
      dom.modalPayload?.classList.remove('error');
    } catch (e) {
      dom.modalPayload?.classList.add('error');
      appendLog('Invalid JSON payload: ' + e.message, 'error');
      return;
    }

    // Disable button and show loading state
    if (dom.modalPublishBtn) {
      dom.modalPublishBtn.disabled = true;
      dom.modalPublishBtn.textContent = 'Publishing...';
    }

    appendLog(`Publishing to ${channelApiName}...`, 'system', payload);

    try {
      // Get instanceUrl from session to help background find the right tab
      const session = opts.getSession();
      const instanceUrl = session?.instanceUrl || null;

      const resp = await new Promise((resolve) => {
        chrome.runtime.sendMessage({
          action: 'LMS_PUBLISH',
          channel: channelApiName,
          payload: payload,
          instanceUrl: instanceUrl  // Pass instanceUrl to help find the correct SF tab
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
        closePublishModal();
      }
    } catch (e) {
      appendLog('Publish error: ' + String(e), 'error');
    } finally {
      // Restore button state
      if (dom.modalPublishBtn) {
        dom.modalPublishBtn.disabled = false;
        dom.modalPublishBtn.textContent = 'Publish';
      }
    }
  }

  function clearLog() {
    if (!dom.log) return;
    dom.log.innerHTML = '<div class="placeholder-note">No LMS activity yet</div>';
  }

  function togglePause() {
    state.logPaused = !state.logPaused;
    if (dom.logPauseBtn) {
      dom.logPauseBtn.setAttribute('aria-pressed', String(state.logPaused));
      dom.logPauseBtn.title = state.logPaused ? 'Resume logging' : 'Pause logging';
      dom.logPauseBtn.innerHTML = state.logPaused
        ? '<span aria-hidden="true">▶</span>'
        : '<span aria-hidden="true">⏸</span>';
    }
  }

  function toggleAutoScroll() {
    state.logAutoScrollEnabled = !state.logAutoScrollEnabled;
    if (dom.logAutoscrollBtn) {
      dom.logAutoscrollBtn.setAttribute('aria-pressed', String(state.logAutoScrollEnabled));
      dom.logAutoscrollBtn.title = state.logAutoScrollEnabled ? 'Auto-scroll: on' : 'Auto-scroll: off';
    }
  }

  function attachHandlers(){
    // Refresh button
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

    // Channel list click delegation for publish buttons
    if (dom.channelsList) {
      dom.channelsList.addEventListener('click', (e) => {
        const publishBtn = e.target.closest('.lms-publish-btn');
        if (publishBtn) {
          const listItem = publishBtn.closest('.list-item');
          if (listItem) {
            const idx = parseInt(listItem.dataset.channelIndex, 10);
            if (Number.isFinite(idx)) {
              openPublishModal(idx);
            }
          }
        }
      });
    }

    // Modal close button
    if (dom.modalCloseBtn) {
      dom.modalCloseBtn.addEventListener('click', closePublishModal);
    }

    // Modal cancel button
    if (dom.modalCancelBtn) {
      dom.modalCancelBtn.addEventListener('click', closePublishModal);
    }

    // Modal publish button
    if (dom.modalPublishBtn) {
      dom.modalPublishBtn.addEventListener('click', handleModalPublish);
    }

    // Modal copy button
    if (dom.modalCopyBtn) {
      dom.modalCopyBtn.addEventListener('click', async () => {
        if (!dom.modalPayload) return;
        const text = String(dom.modalPayload.value || '');
        if (!text.trim()) return;
        try {
          await navigator.clipboard.writeText(text);
          const prevTitle = dom.modalCopyBtn.title;
          dom.modalCopyBtn.title = 'Copied!';
          dom.modalCopyBtn.classList.add('copied');
          setTimeout(() => {
            dom.modalCopyBtn.classList.remove('copied');
            dom.modalCopyBtn.title = prevTitle || 'Copy payload';
          }, 900);
        } catch {
          try {
            dom.modalPayload.select();
            document.execCommand('copy');
            const prevTitle = dom.modalCopyBtn.title;
            dom.modalCopyBtn.title = 'Copied!';
            dom.modalCopyBtn.classList.add('copied');
            setTimeout(() => {
              dom.modalCopyBtn.classList.remove('copied');
              dom.modalCopyBtn.title = prevTitle || 'Copy payload';
            }, 900);
          } catch {}
        }
      });
    }

    // Modal overlay click to close
    if (dom.publishModal) {
      dom.publishModal.addEventListener('click', (e) => {
        if (e.target === dom.publishModal) {
          closePublishModal();
        }
      });
    }

    // Log toolbar buttons
    if (dom.clearLogBtn) {
      dom.clearLogBtn.addEventListener('click', clearLog);
    }

    if (dom.logPauseBtn) {
      dom.logPauseBtn.addEventListener('click', togglePause);
    }

    if (dom.logAutoscrollBtn) {
      dom.logAutoscrollBtn.addEventListener('click', toggleAutoScroll);
    }

    if (dom.logFilterSel) {
      dom.logFilterSel.addEventListener('change', applyLogFilter);
    }

    try {
      document.addEventListener('lms-load', () => { loadChannels(false); });
    } catch {}

    const activeTab = document.querySelector('.tab-button.active')?.getAttribute('data-tab');
    if (activeTab === 'lms') loadChannels(false);
  }

  function init(options){
    opts = { ...opts, ...options };
    dom = {
      log: document.getElementById('lms-log'),
      refreshBtn: document.getElementById('lms-refresh'),
      clearLogBtn: document.getElementById('lms-log-clear'),
      logPauseBtn: document.getElementById('lms-log-pause'),
      logAutoscrollBtn: document.getElementById('lms-log-autoscroll-btn'),
      logFilterSel: document.getElementById('lms-log-filter'),
      channelsList: document.getElementById('lms-channels-list'),
      // Modal elements
      publishModal: document.getElementById('lms-publish-modal'),
      modalCloseBtn: document.getElementById('lms-modal-close'),
      modalCancelBtn: document.getElementById('lms-modal-cancel'),
      modalPublishBtn: document.getElementById('lms-modal-publish'),
      modalChannelName: document.getElementById('lms-modal-channel-name'),
      modalPayload: document.getElementById('lms-modal-payload'),
      modalCopyBtn: document.getElementById('lms-modal-copy')
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
      handleModalPublish,
      loadChannels,
      checkLmsAvailability,
      appendLog,
      applyLogFilter,
      togglePause,
      toggleAutoScroll,
      clearLog,
      openPublishModal,
      closePublishModal,
      renderChannelsList,
      generateSamplePayload
    };
  }

  window.LmsHelper = { init };
})();
