/**
 * @jest-environment jsdom
 */

const flush = () => new Promise((r) => setTimeout(r, 0));

describe('LmsHelper publish functionality', () => {
  let hooks;
  let logEl;
  let channelSel;
  let payloadTa;
  let publishBtn;
  let mockSendMessage;

  beforeAll(async () => {
    // Setup global mocks
    global.Utils = {
      escapeHtml: (s) => String(s || '').replace(/[&<>"']/g, (m) => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
      }[m] || m)),
    };

    mockSendMessage = jest.fn();
    global.chrome = {
      runtime: {
        sendMessage: mockSendMessage,
        lastError: null
      }
    };

    // Create DOM elements
    logEl = document.createElement('div');
    logEl.id = 'lms-log';
    logEl.innerHTML = '<div class="placeholder-note">No LMS activity yet</div>';
    document.body.appendChild(logEl);

    channelSel = document.createElement('select');
    channelSel.id = 'lms-channel';
    channelSel.innerHTML = '<option value="">Select a message channel</option>';
    document.body.appendChild(channelSel);

    payloadTa = document.createElement('textarea');
    payloadTa.id = 'lms-payload';
    document.body.appendChild(payloadTa);

    publishBtn = document.createElement('button');
    publishBtn.id = 'lms-publish';
    publishBtn.disabled = true;
    publishBtn.innerHTML = '<span aria-hidden="true">📤</span>';
    document.body.appendChild(publishBtn);

    const copyBtn = document.createElement('button');
    copyBtn.id = 'lms-payload-copy';
    document.body.appendChild(copyBtn);

    const refreshBtn = document.createElement('button');
    refreshBtn.id = 'lms-refresh';
    document.body.appendChild(refreshBtn);

    const clearLogBtn = document.createElement('button');
    clearLogBtn.id = 'lms-clear-log';
    document.body.appendChild(clearLogBtn);

    // Import the module
    await import('../lms_helper.js');
    hooks = window.__LmsTestHooks;

    // Initialize with mock session
    window.LmsHelper.init({
      getSession: () => ({
        isLoggedIn: true,
        instanceUrl: 'https://example.my.salesforce.com'
      })
    });
  });

  beforeEach(() => {
    mockSendMessage.mockReset();
    logEl.innerHTML = '<div class="placeholder-note">No LMS activity yet</div>';
    payloadTa.value = '';
    channelSel.innerHTML = '<option value="">Select a message channel</option>';
    hooks.setState({ channels: [], loaded: false, selectedChannelIndex: -1 });
  });

  afterAll(() => {
    document.body.innerHTML = '';
  });

  describe('loadChannels', () => {
    test('fetches LMS channels successfully', async () => {
      const mockChannels = [
        { id: '1', developerName: 'TestChannel', masterLabel: 'Test Channel', fullName: 'TestChannel', fields: [] },
        { id: '2', developerName: 'AnotherChannel', masterLabel: 'Another Channel', fullName: 'ns__AnotherChannel', fields: [{ name: 'Message__c' }] }
      ];

      mockSendMessage.mockImplementation((msg, callback) => {
        if (msg.action === 'LMS_FETCH_CHANNELS') {
          callback({ success: true, channels: mockChannels });
        } else if (msg.action === 'LMS_CHECK_AVAILABILITY') {
          callback({ success: true, isLightningPage: true });
        }
      });

      await hooks.loadChannels(true);
      await flush();

      expect(mockSendMessage).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'LMS_FETCH_CHANNELS' }),
        expect.any(Function)
      );

      const state = hooks.getState();
      expect(state.channels).toHaveLength(2);
      expect(state.loaded).toBe(true);
    });

    test('handles fetch failure gracefully', async () => {
      mockSendMessage.mockImplementation((msg, callback) => {
        if (msg.action === 'LMS_FETCH_CHANNELS') {
          callback({ success: false, error: 'Network error' });
        }
      });

      await hooks.loadChannels(true);
      await flush();

      const state = hooks.getState();
      expect(state.channels).toHaveLength(0);
      expect(state.loaded).toBe(false);

      // Check error was logged
      const errorEntry = logEl.querySelector('.log-error');
      expect(errorEntry).toBeTruthy();
    });
  });

  describe('handlePublish', () => {
    beforeEach(() => {
      // Setup channels
      hooks.setState({
        channels: [
          { id: '1', developerName: 'TestChannel', masterLabel: 'Test Channel', fullName: 'TestChannel', fields: [] }
        ],
        loaded: true,
        selectedChannelIndex: 0
      });

      // Populate dropdown
      channelSel.innerHTML = '<option value="">Select a message channel</option><option value="0">Test Channel (TestChannel)</option>';
      channelSel.value = '0';

      // Set valid payload
      payloadTa.value = '{ "message": "Hello World" }';
    });

    test('publishes message successfully', async () => {
      mockSendMessage.mockImplementation((msg, callback) => {
        if (msg.action === 'LMS_PUBLISH') {
          expect(msg.channel).toBe('TestChannel');
          expect(msg.payload).toEqual({ message: 'Hello World' });
          callback({
            success: true,
            message: 'Message published successfully',
            channel: 'TestChannel'
          });
        }
      });

      await hooks.handlePublish();
      await flush();

      expect(mockSendMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'LMS_PUBLISH',
          channel: 'TestChannel',
          payload: { message: 'Hello World' }
        }),
        expect.any(Function)
      );

      // Check success was logged
      const successEntry = logEl.querySelector('.log-success');
      expect(successEntry).toBeTruthy();
    });

    test('handles publish failure', async () => {
      mockSendMessage.mockImplementation((msg, callback) => {
        if (msg.action === 'LMS_PUBLISH') {
          callback({
            success: false,
            error: 'Not a Lightning Experience page'
          });
        }
      });

      await hooks.handlePublish();
      await flush();

      // Check error was logged
      const entries = logEl.querySelectorAll('.log-entry');
      const hasError = Array.from(entries).some(e => e.classList.contains('log-error'));
      expect(hasError).toBe(true);
    });

    test('rejects invalid JSON payload', async () => {
      payloadTa.value = '{ invalid json }';

      await hooks.handlePublish();
      await flush();

      // Should not call sendMessage for publish
      expect(mockSendMessage).not.toHaveBeenCalledWith(
        expect.objectContaining({ action: 'LMS_PUBLISH' }),
        expect.any(Function)
      );

      // Check error was logged
      const errorEntry = logEl.querySelector('.log-error');
      expect(errorEntry).toBeTruthy();
      expect(errorEntry.textContent).toContain('Invalid JSON');
    });

    test('requires channel selection', async () => {
      hooks.setState({ selectedChannelIndex: -1 });

      await hooks.handlePublish();
      await flush();

      // Should not call sendMessage for publish
      expect(mockSendMessage).not.toHaveBeenCalledWith(
        expect.objectContaining({ action: 'LMS_PUBLISH' }),
        expect.any(Function)
      );

      // Check error was logged
      const errorEntry = logEl.querySelector('.log-error');
      expect(errorEntry).toBeTruthy();
      expect(errorEntry.textContent).toContain('select a channel');
    });
  });

  describe('checkLmsAvailability', () => {
    test('returns availability status', async () => {
      mockSendMessage.mockImplementation((msg, callback) => {
        if (msg.action === 'LMS_CHECK_AVAILABILITY') {
          callback({
            success: true,
            isLightningPage: true,
            hasAura: true,
            pageType: 'lightning'
          });
        }
      });

      const result = await hooks.checkLmsAvailability();

      expect(result.isLightningPage).toBe(true);
      expect(hooks.getState().lmsAvailable).toBe(true);
    });

    test('handles non-Lightning page', async () => {
      mockSendMessage.mockImplementation((msg, callback) => {
        if (msg.action === 'LMS_CHECK_AVAILABILITY') {
          callback({
            success: true,
            isLightningPage: false,
            hasAura: false,
            pageType: 'classic'
          });
        }
      });

      const result = await hooks.checkLmsAvailability();

      expect(result.isLightningPage).toBe(false);
      expect(hooks.getState().lmsAvailable).toBe(false);
    });
  });

  describe('appendLog', () => {
    test('adds log entries with correct type badges', () => {
      hooks.appendLog('Test info message', 'info');
      hooks.appendLog('Test error message', 'error');
      hooks.appendLog('Test success message', 'success');

      const entries = logEl.querySelectorAll('.log-entry');
      expect(entries).toHaveLength(3);

      expect(entries[0].classList.contains('log-info')).toBe(true);
      expect(entries[1].classList.contains('log-error')).toBe(true);
      expect(entries[2].classList.contains('log-success')).toBe(true);
    });

    test('includes expandable details when data provided', () => {
      hooks.appendLog('Message with data', 'info', { foo: 'bar' });

      const details = logEl.querySelector('.log-details');
      expect(details).toBeTruthy();

      const pre = details.querySelector('pre');
      expect(pre.textContent).toContain('"foo"');
      expect(pre.textContent).toContain('"bar"');
    });

    test('removes placeholder on first entry', () => {
      expect(logEl.querySelector('.placeholder-note')).toBeTruthy();

      hooks.appendLog('First message', 'info');

      expect(logEl.querySelector('.placeholder-note')).toBeFalsy();
    });
  });
});

describe('LMS background handler', () => {
  let listeners = {};
  let mockTabsSendMessage;

  beforeAll(async () => {
    // Reset modules
    jest.resetModules();

    listeners = {};
    mockTabsSendMessage = jest.fn();

    function makeEvent(name) {
      return {
        addListener: (fn) => { listeners[name] = fn; },
        removeListener: jest.fn(),
      };
    }

    global.fetch = jest.fn();
    global.chrome = {
      runtime: {
        onInstalled: makeEvent('onInstalled'),
        onStartup: makeEvent('onStartup'),
        onMessage: makeEvent('onMessage'),
        lastError: null,
      },
      tabs: {
        onUpdated: makeEvent('onUpdated'),
        query: jest.fn(),
        sendMessage: mockTabsSendMessage,
      },
      windows: {
        onRemoved: makeEvent('onRemoved'),
        update: jest.fn(),
        create: jest.fn().mockResolvedValue({ id: 1 }),
        remove: jest.fn(),
      },
      storage: {
        local: {
          get: jest.fn().mockResolvedValue({ apiVersion: '65.0' }),
          set: jest.fn().mockResolvedValue(undefined),
        },
      },
      declarativeContent: {
        onPageChanged: {
          removeRules: jest.fn((_, cb) => cb && cb()),
          addRules: jest.fn(),
        },
        PageStateMatcher: function matcher() {},
        ShowAction: function showAction() {},
      },
      action: {
        setBadgeText: jest.fn(),
        setBadgeBackgroundColor: jest.fn(),
      },
      cookies: {
        get: jest.fn((_, cb) => cb && cb(null)),
        getAll: jest.fn((_, cb) => cb && cb([])),
      },
    };

    await import('../background.js');
  });

  beforeEach(() => {
    mockTabsSendMessage.mockReset();
    chrome.tabs.query.mockReset();
  });

  test('LMS_PUBLISH routes to content script', async () => {
    const handler = listeners.onMessage;
    expect(handler).toBeInstanceOf(Function);

    // Mock finding an active Salesforce tab
    chrome.tabs.query.mockResolvedValue([
      { id: 123, url: 'https://example.lightning.force.com/one/one.app' }
    ]);

    // Mock content script response
    mockTabsSendMessage.mockImplementation((tabId, msg, callback) => {
      expect(tabId).toBe(123);
      expect(msg.action).toBe('LMS_PUBLISH');
      expect(msg.channel).toBe('TestChannel');
      callback({ success: true, message: 'Published' });
    });

    const msg = {
      action: 'LMS_PUBLISH',
      channel: 'TestChannel',
      payload: { text: 'Hello' }
    };

    const response = await new Promise((resolve) => {
      handler(msg, {}, (resp) => resolve(resp));
    });

    expect(response.success).toBe(true);
    expect(mockTabsSendMessage).toHaveBeenCalled();
  });

  test('LMS_PUBLISH returns error when no Salesforce tab found', async () => {
    const handler = listeners.onMessage;

    // No Salesforce tabs
    chrome.tabs.query.mockResolvedValue([]);

    const msg = {
      action: 'LMS_PUBLISH',
      channel: 'TestChannel',
      payload: { text: 'Hello' }
    };

    const response = await new Promise((resolve) => {
      handler(msg, {}, (resp) => resolve(resp));
    });

    expect(response.success).toBe(false);
    expect(response.error).toContain('No Salesforce tab');
  });

  test('LMS_PUBLISH requires channel name', async () => {
    const handler = listeners.onMessage;

    const msg = {
      action: 'LMS_PUBLISH',
      channel: '', // Empty channel
      payload: { text: 'Hello' }
    };

    const response = await new Promise((resolve) => {
      handler(msg, {}, (resp) => resolve(resp));
    });

    expect(response.success).toBe(false);
    expect(response.error).toContain('Channel name is required');
  });

  test('LMS_CHECK_AVAILABILITY routes to content script', async () => {
    const handler = listeners.onMessage;

    // Mock finding an active Salesforce tab
    chrome.tabs.query.mockResolvedValue([
      { id: 456, url: 'https://example.my.salesforce.com/lightning/page' }
    ]);

    // Mock content script response
    mockTabsSendMessage.mockImplementation((tabId, msg, callback) => {
      expect(msg.action).toBe('LMS_CHECK_AVAILABILITY');
      callback({ success: true, isLightningPage: true, hasAura: true });
    });

    const msg = { action: 'LMS_CHECK_AVAILABILITY' };

    const response = await new Promise((resolve) => {
      handler(msg, {}, (resp) => resolve(resp));
    });

    expect(response.success).toBe(true);
    expect(response.isLightningPage).toBe(true);
  });
});

