/**
 * @jest-environment jsdom
 */

const flush = () => new Promise((r) => setTimeout(r, 0));

describe('PlatformHelper cometd handshake failure', () => {
  let hooks;
  beforeAll(async () => {
    global.Utils = {
      getAccessToken: () => 'token',
      normalizeApiVersion: (v) => v,
      fetchWithTimeout: jest.fn(),
      escapeHtml: (s) => String(s || ''),
      setInstanceUrlCache: jest.fn(),
      sleep: () => Promise.resolve(),
    };
    global.chrome = { runtime: { sendMessage: jest.fn(), lastError: null } };

    // minimal DOM hooks used by appendPeLog / updateCometdStatus
    const peLogEl = document.createElement('div');
    const cometdStatusEl = document.createElement('div');
    cometdStatusEl.classList.add('status');
    const statusText = document.createElement('span');
    statusText.classList.add('status-text');
    cometdStatusEl.appendChild(statusText);

    await import('../platform_helper.js');
    hooks = window.__PlatformTestHooks;
    hooks.setDomForTests({ peLogEl, cometdStatusEl });
    hooks.setOpts({
      getSession: () => ({ isLoggedIn: true, instanceUrl: 'https://example.my.salesforce.com' }),
      refreshSessionFromTab: jest.fn(),
      apiVersion: '65.0',
    });
    hooks.setState({ apiVersion: '65.0' });
  });

  beforeEach(() => {
    Utils.fetchWithTimeout.mockReset();
  });

  test('surface API version mandatory error detail on handshake', async () => {
    const errorBody = '[{"channel":"/meta/handshake","error":"400::API version in the URI is mandatory. URI format: \'/cometd/65.0\'","successful":false}]';
    Utils.fetchWithTimeout.mockResolvedValue({
      ok: false,
      status: 400,
      statusText: 'Bad Request',
      text: async () => errorBody,
    });

    await expect(hooks.cometdHandshake()).rejects.toThrow('API version in the URI is mandatory');
    expect(Utils.fetchWithTimeout).toHaveBeenCalled();
    expect(hooks.getState().cometdState).toBe('disconnected');
  });
});
