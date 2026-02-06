/**
 * @jest-environment node
 */

const listeners = {};

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
  },
  tabs: {
    onUpdated: makeEvent('onUpdated'),
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

describe('background PUBLISH_PLATFORM_EVENT handler', () => {
  beforeAll(async () => {
    fetch.mockResolvedValue({
      ok: true,
      status: 200,
      statusText: 'OK',
      text: async () => JSON.stringify({ id: 'evt123' }),
    });
    await import('../background.js');
  });

  test('returns success when publishPlatformEvent is invoked', async () => {
    const handler = listeners.onMessage;
    expect(handler).toBeInstanceOf(Function);

    const msg = {
      action: 'PUBLISH_PLATFORM_EVENT',
      instanceUrl: 'https://example.my.salesforce.com',
      sessionId: 'sid123',
      eventApiName: 'Test__e',
      payload: { Foo__c: 'Bar' },
    };

    const response = await new Promise((resolve) => {
      handler(msg, {}, (resp) => resolve(resp));
    });

    expect(response).toEqual(expect.objectContaining({ success: true, id: 'evt123' }));
    expect(fetch).toHaveBeenCalled();
  });
});

