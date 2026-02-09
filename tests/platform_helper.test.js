/**
 * @jest-environment jsdom
 */

const flush = () => new Promise((r) => setTimeout(r, 0));

describe('PlatformHelper cometd handshake failure', () => {
  let hooks;
  let mockRefreshSession;

  beforeAll(async () => {
    mockRefreshSession = jest.fn();

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
      refreshSessionFromTab: mockRefreshSession,
      apiVersion: '65.0',
    });
    hooks.setState({ apiVersion: '65.0', handshakeRetried: false });
  });

  beforeEach(() => {
    Utils.fetchWithTimeout.mockReset();
    mockRefreshSession.mockReset();
    hooks.setState({ handshakeRetried: false, cometdState: 'disconnected', cometdClientId: null });
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

  test('retry handshake on 401 authentication invalid error', async () => {
    const authErrorResponse = [{"ext":{"sfdc":{"failureReason":"401::Authentication invalid"},"replay":true,"payload.format":true},"advice":{"reconnect":"none"},"channel":"/meta/handshake","error":"403::Handshake denied","successful":false}];
    const successResponse = [{"channel":"/meta/handshake","clientId":"abc123","successful":true,"advice":{"timeout":110000,"interval":0}}];

    Utils.fetchWithTimeout
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => authErrorResponse })
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => successResponse });

    await hooks.cometdHandshake();

    // Should have called fetch twice (original + retry)
    expect(Utils.fetchWithTimeout).toHaveBeenCalledTimes(2);
    // Should have called refreshSessionFromTab
    expect(mockRefreshSession).toHaveBeenCalled();
    // Should be connected after retry
    expect(hooks.getState().cometdState).toBe('connected');
    expect(hooks.getState().cometdClientId).toBe('abc123');
  });

  test('fail after retry if auth error persists', async () => {
    const authErrorResponse = [{"ext":{"sfdc":{"failureReason":"401::Authentication invalid"}},"advice":{"reconnect":"none"},"channel":"/meta/handshake","error":"403::Handshake denied","successful":false}];

    Utils.fetchWithTimeout
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => authErrorResponse })
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => authErrorResponse });

    await expect(hooks.cometdHandshake()).rejects.toThrow('Handshake unsuccessful');

    // Should have called fetch twice (original + retry)
    expect(Utils.fetchWithTimeout).toHaveBeenCalledTimes(2);
    expect(hooks.getState().cometdState).toBe('disconnected');
  });
});
