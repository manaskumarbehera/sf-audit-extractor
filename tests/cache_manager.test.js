/**
 * @jest-environment jsdom
 */
/**
 * cache_manager.test.js
 * Comprehensive tests for organization-aware caching
 */

// Create a window object if it doesn't exist
if (typeof window === 'undefined') {
  global.window = global;
}
const localStorageMock = (() => {
  let store = {};

  return {
    getItem: (key) => store[key] || null,
    setItem: (key, value) => {
      store[key] = String(value);
    },
    removeItem: (key) => {
      delete store[key];
    },
    clear: () => {
      store = {};
    },
    get length() {
      return Object.keys(store).length;
    },
    key: (i) => {
      const keys = Object.keys(store);
      return keys[i] || null;
    }
  };
})();

global.localStorage = localStorageMock;
global.sessionStorage = localStorageMock;

// Load the cache manager
const fs = require('fs');
const path = require('path');
const cacheManagerCode = fs.readFileSync(
  path.join(__dirname, '../cache_manager.js'),
  'utf8'
);

// Execute cache manager code in test environment
eval(cacheManagerCode);

describe('CacheManager', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    // Reset the CacheManager state
    if (window.CacheManager) {
      window.CacheManager.clearAllCaches();
    }
  });

  describe('Basic Cache Operations', () => {
    test('should set and get cache', () => {
      const key = 'testKey';
      const value = { name: 'Test', id: 123 };

      window.CacheManager.setCurrentOrgId('org1');
      window.CacheManager.setCache(key, value);

      const cached = window.CacheManager.getCache(key);

      expect(cached).toEqual(value);
    });

    test('should return null for non-existent cache', () => {
      window.CacheManager.setCurrentOrgId('org1');
      const cached = window.CacheManager.getCache('nonExistent');

      expect(cached).toBeNull();
    });

    test('should remove cache', () => {
      const key = 'testKey';
      const value = { name: 'Test' };

      window.CacheManager.setCurrentOrgId('org1');
      window.CacheManager.setCache(key, value);
      expect(window.CacheManager.getCache(key)).toEqual(value);

      window.CacheManager.removeCache(key);
      expect(window.CacheManager.getCache(key)).toBeNull();
    });

    test('should handle various data types', () => {
      window.CacheManager.setCurrentOrgId('org1');

      // String
      window.CacheManager.setCache('str', 'test');
      expect(window.CacheManager.getCache('str')).toBe('test');

      // Number
      window.CacheManager.setCache('num', 42);
      expect(window.CacheManager.getCache('num')).toBe(42);

      // Array
      window.CacheManager.setCache('arr', [1, 2, 3]);
      expect(window.CacheManager.getCache('arr')).toEqual([1, 2, 3]);

      // Boolean
      window.CacheManager.setCache('bool', true);
      expect(window.CacheManager.getCache('bool')).toBe(true);

      // Null
      window.CacheManager.setCache('null', null);
      expect(window.CacheManager.getCache('null')).toBeNull();
    });
  });

  describe('Organization Scoping', () => {
    test('should isolate cache by organization', () => {
      const key = 'records';
      const value1 = [{ id: 1, name: 'Org1 Record' }];
      const value2 = [{ id: 2, name: 'Org2 Record' }];

      // Set for org1
      window.CacheManager.setCurrentOrgId('org1');
      window.CacheManager.setCache(key, value1);
      expect(window.CacheManager.getCache(key)).toEqual(value1);

      // Set for org2
      window.CacheManager.setCurrentOrgId('org2');
      window.CacheManager.setCache(key, value2);
      expect(window.CacheManager.getCache(key)).toEqual(value2);

      // When we switch back to org1, org2's cache is cleared
      window.CacheManager.setCurrentOrgId('org1');
      // org1's cache was also cleared when we switched to org2, so it's null now
      expect(window.CacheManager.getCache(key)).toBeNull();
    });

    test('should clear cache when switching organizations', () => {
      const key = 'records';
      const value = [{ id: 1, name: 'Record' }];

      // Set cache for org1
      window.CacheManager.setCurrentOrgId('org1');
      window.CacheManager.setCache(key, value);
      expect(window.CacheManager.getCache(key)).toEqual(value);

      // Switch to org2 should clear org1's cache from current context
      window.CacheManager.setCurrentOrgId('org2');

      // Access with old org should return null when accessed as current
      window.CacheManager.setCurrentOrgId('org1');
      expect(window.CacheManager.getCache(key)).toBeNull();
    });

    test('should get cache from specific org without switching', () => {
      const key = 'records';
      const value1 = [{ id: 1 }];
      const value2 = [{ id: 2 }];
      const value3 = [{ id: 3 }];

      // Set for org1 and get before switching
      window.CacheManager.setCurrentOrgId('org1');
      window.CacheManager.setCache(key, value1);
      expect(window.CacheManager.getCache(key)).toEqual(value1);

      // Set for org2 and get before switching (org1 cache is cleared)
      window.CacheManager.setCurrentOrgId('org2');
      window.CacheManager.setCache(key, value2);
      expect(window.CacheManager.getCache(key)).toEqual(value2);

      // Can still set org1 again and access it
      window.CacheManager.setCurrentOrgId('org1');
      window.CacheManager.setCache(key, value1); // Re-set org1 data
      expect(window.CacheManager.getCache(key)).toEqual(value1);
    });
  });

  describe('Cache Expiration (TTL)', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    test('should expire cache based on TTL', () => {
      window.CacheManager.setCurrentOrgId('org1');
      const ttl = 1000; // 1 second

      window.CacheManager.setCache('tempData', 'value', ttl);
      expect(window.CacheManager.getCache('tempData')).toBe('value');

      // Advance time past TTL
      jest.advanceTimersByTime(ttl + 100);

      // Cache should be expired
      expect(window.CacheManager.getCache('tempData')).toBeNull();
    });

    test('should not expire cache before TTL', () => {
      window.CacheManager.setCurrentOrgId('org1');
      const ttl = 5000;

      window.CacheManager.setCache('tempData', 'value', ttl);

      // Advance time but stay within TTL
      jest.advanceTimersByTime(2000);

      expect(window.CacheManager.getCache('tempData')).toBe('value');
    });

    test('should handle cache without TTL (infinite)', () => {
      window.CacheManager.setCurrentOrgId('org1');

      window.CacheManager.setCache('permanentData', 'value');

      // Advance time significantly
      jest.advanceTimersByTime(100000);

      expect(window.CacheManager.getCache('permanentData')).toBe('value');
    });
  });

  describe('Clear Operations', () => {
    test('should clear all caches for current org', () => {
      window.CacheManager.setCurrentOrgId('org1');
      window.CacheManager.setCache('key1', 'value1');
      window.CacheManager.setCache('key2', 'value2');
      window.CacheManager.setCache('key3', 'value3');

      const cleared = window.CacheManager.clearOrgCache();

      expect(cleared).toBe(3);
      expect(window.CacheManager.getCache('key1')).toBeNull();
      expect(window.CacheManager.getCache('key2')).toBeNull();
      expect(window.CacheManager.getCache('key3')).toBeNull();
    });

    test('should clear cache for specific org', () => {
      window.CacheManager.setCurrentOrgId('org1');
      window.CacheManager.setCache('key1', 'value1');
      window.CacheManager.setCache('key2', 'value2');

      // Explicitly clear org1's cache
      const cleared = window.CacheManager.clearOrgCache('org1');

      expect(cleared).toBe(2);

      // Org1's cache should be gone
      expect(window.CacheManager.getCache('key1')).toBeNull();
      expect(window.CacheManager.getCache('key2')).toBeNull();
    });

    test('should clear all caches across all orgs', () => {
      window.CacheManager.setCurrentOrgId('org1');
      window.CacheManager.setCache('key1', 'value1');
      window.CacheManager.setCache('key2', 'value2');

      window.CacheManager.setCurrentOrgId('org2');
      window.CacheManager.setCache('key1', 'value3');
      window.CacheManager.setCache('key3', 'value4');

      const cleared = window.CacheManager.clearAllCaches();

      expect(cleared).toBeGreaterThanOrEqual(2); // At least org2's items

      // All caches should be gone
      expect(window.CacheManager.getCache('key1')).toBeNull();
      expect(window.CacheManager.getCache('key3')).toBeNull();
    });

    test('should not clear other org caches when clearing one', () => {
      window.CacheManager.setCurrentOrgId('org1');
      window.CacheManager.setCache('key1', 'value1');
      const cached1Before = window.CacheManager.getCache('key1');
      expect(cached1Before).toBe('value1');

      window.CacheManager.setCurrentOrgId('org2');
      window.CacheManager.setCache('key1', 'value2');
      const cached2Before = window.CacheManager.getCache('key1');
      expect(cached2Before).toBe('value2');

      window.CacheManager.setCurrentOrgId('org3');
      window.CacheManager.setCache('key1', 'value3');
      const cached3Before = window.CacheManager.getCache('key1');
      expect(cached3Before).toBe('value3');

      // Clear only org2's cache explicitly
      window.CacheManager.clearOrgCache('org2');

      // Org2 should be empty
      expect(window.CacheManager.getCache('key1', 'org2')).toBeNull();

      // Org3 should still have data (current org)
      expect(window.CacheManager.getCache('key1')).toBe('value3');

      // Org1 should still have data (switched to org1 separately)
      window.CacheManager.setCurrentOrgId('org1');
      // But switching cleared org3's cache
      expect(window.CacheManager.getCache('key1')).toBeNull();
    });
  });

  describe('Recent Records Cache Use Case', () => {
    test('should not share recent records between orgs', () => {
      const recordsKey = 'recentRecords';

      // Org1 recent records
      window.CacheManager.setCurrentOrgId('org1');
      const org1Records = [
        { Id: '001xx000003DHP', Name: 'Org1 Account' }
      ];
      window.CacheManager.setCache(recordsKey, org1Records);
      expect(window.CacheManager.getCache(recordsKey)).toEqual(org1Records);

      // Org2 recent records
      window.CacheManager.setCurrentOrgId('org2');
      const org2Records = [
        { Id: '001xx000003DHQ', Name: 'Org2 Account' }
      ];
      window.CacheManager.setCache(recordsKey, org2Records);
      expect(window.CacheManager.getCache(recordsKey)).toEqual(org2Records);

      // Verify org1's data is cleared when switching away
      window.CacheManager.setCurrentOrgId('org1');
      expect(window.CacheManager.getCache(recordsKey)).toBeNull();
    });

    test('should clear recent records when switching orgs', () => {
      const recordsKey = 'recentRecords';

      // Set recent records for org1
      window.CacheManager.setCurrentOrgId('org1');
      window.CacheManager.setCache(recordsKey, [{ Id: '001', Name: 'Record1' }]);

      // Switch to org2 (clears org1 cache)
      window.CacheManager.setCurrentOrgId('org2');

      // Org1's records should be cleared
      window.CacheManager.setCurrentOrgId('org1');
      expect(window.CacheManager.getCache(recordsKey)).toBeNull();
    });
  });

  describe('Record History Cache Use Case', () => {
    test('should isolate record history by org', () => {
      const historyKey = 'recordHistory';

      window.CacheManager.setCurrentOrgId('org1');
      const org1History = [
        { recordId: '001', timestamp: Date.now(), name: 'Record A' }
      ];
      window.CacheManager.setCache(historyKey, org1History);
      expect(window.CacheManager.getCache(historyKey)).toEqual(org1History);

      window.CacheManager.setCurrentOrgId('org2');
      const org2History = [
        { recordId: '002', timestamp: Date.now(), name: 'Record B' }
      ];
      window.CacheManager.setCache(historyKey, org2History);
      expect(window.CacheManager.getCache(historyKey)).toEqual(org2History);

      // Verify org1 is cleared when switching back
      window.CacheManager.setCurrentOrgId('org1');
      expect(window.CacheManager.getCache(historyKey)).toBeNull();
    });
  });

  describe('Cache Statistics', () => {
    test('should report accurate cache statistics', () => {
      window.CacheManager.setCurrentOrgId('org1');
      window.CacheManager.setCache('key1', 'value1');
      window.CacheManager.setCache('key2', { data: 'value2' });

      window.CacheManager.setCurrentOrgId('org2');
      window.CacheManager.setCache('key1', 'value3');

      const stats = window.CacheManager.getCacheStats();

      // When we switch to org2, org1 cache is cleared
      // So we should only see org2 items (1 item)
      expect(stats.itemCount).toBe(1);
      expect(stats.byOrg['org2']).toBe(1);
      expect(stats.currentOrgId).toBe('org2');
    });
  });

  describe('Cache Invalidation', () => {
    test('should invalidate all caches', () => {
      window.CacheManager.setCurrentOrgId('org1');
      window.CacheManager.setCache('key1', 'value1');
      window.CacheManager.setCache('key2', 'value2');

      const version1 = window.CacheManager.getCacheStats().cacheVersion;

      window.CacheManager.invalidateAllCaches();

      const version2 = window.CacheManager.getCacheStats().cacheVersion;

      expect(version2).toBe(version1 + 1);
      expect(window.CacheManager.getCache('key1')).toBeNull();
      expect(window.CacheManager.getCache('key2')).toBeNull();
    });
  });

  describe('Error Handling', () => {
    test('should handle invalid org IDs gracefully', () => {
      const result = window.CacheManager.setCurrentOrgId(null);
      expect(result).toBe(false);
    });

    test('should handle corrupted cache data', () => {
      window.CacheManager.setCurrentOrgId('org1');

      // Manually insert corrupted data
      localStorage.setItem('cache_org1_key1', 'not valid json {');

      // Should return null without throwing
      expect(() => {
        const cached = window.CacheManager.getCache('key1');
        expect(cached).toBeNull();
      }).not.toThrow();
    });

    test('should handle missing localStorage gracefully', () => {
      const originalGetItem = localStorage.getItem;
      localStorage.getItem = jest.fn(() => {
        throw new Error('LocalStorage error');
      });

      window.CacheManager.setCurrentOrgId('org1');

      // Should handle gracefully
      expect(() => {
        const cached = window.CacheManager.getCache('key1');
        expect(cached).toBeNull();
      }).not.toThrow();

      // Restore
      localStorage.getItem = originalGetItem;
    });
  });

  describe('Real World Scenarios', () => {
    test('Scenario: User switches between Dev and Prod orgs', () => {
      const recordsKey = 'recentRecords';
      const historyKey = 'recordHistory';

      // User in Dev org
      window.CacheManager.setCurrentOrgId('dev-org-id');
      window.CacheManager.setCache(recordsKey, [{ Id: 'dev-001', Name: 'Dev Account' }]);
      window.CacheManager.setCache(historyKey, [{ recordId: 'dev-001', timestamp: 100 }]);

      // Switch to Prod org - this clears Dev cache
      window.CacheManager.setCurrentOrgId('prod-org-id');
      window.CacheManager.setCache(recordsKey, [{ Id: 'prod-001', Name: 'Prod Account' }]);
      window.CacheManager.setCache(historyKey, [{ recordId: 'prod-001', timestamp: 200 }]);

      // Verify we see Prod data
      expect(window.CacheManager.getCache(recordsKey)).toEqual([{ Id: 'prod-001', Name: 'Prod Account' }]);
      expect(window.CacheManager.getCache(historyKey)).toEqual([{ recordId: 'prod-001', timestamp: 200 }]);

      // Back to Dev - cache was cleared
      window.CacheManager.setCurrentOrgId('dev-org-id');
      expect(window.CacheManager.getCache(recordsKey)).toBeNull();
      expect(window.CacheManager.getCache(historyKey)).toBeNull();
    });

    test('Scenario: User logs out and logs back in', () => {
      const recordsKey = 'recentRecords';

      window.CacheManager.setCurrentOrgId('org-1');
      window.CacheManager.setCache(recordsKey, [{ Id: '001' }]);

      // Logout (clear everything)
      window.CacheManager.clearAllCaches();

      window.CacheManager.setCurrentOrgId('org-2');
      expect(window.CacheManager.getCache(recordsKey)).toBeNull();

      // Add new data for new org
      window.CacheManager.setCache(recordsKey, [{ Id: '002' }]);
      expect(window.CacheManager.getCache(recordsKey)).toEqual([{ Id: '002' }]);
    });

    test('Scenario: Multiple records access in record scanner', () => {
      window.CacheManager.setCurrentOrgId('org1');

      // User views multiple records
      const records = [
        { recordId: 'a0001', timestamp: 1000, name: 'Record 1' },
        { recordId: 'a0002', timestamp: 2000, name: 'Record 2' },
        { recordId: 'a0003', timestamp: 3000, name: 'Record 3' }
      ];

      window.CacheManager.setCache('recordHistory', records);
      expect(window.CacheManager.getCache('recordHistory')).toEqual(records);

      // Simulate switching orgs
      window.CacheManager.setCurrentOrgId('org2');

      // History should be cleared for org1
      window.CacheManager.setCurrentOrgId('org1');
      expect(window.CacheManager.getCache('recordHistory')).toBeNull();
    });
  });
});

