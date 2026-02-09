/**
 * @jest-environment jsdom
 */
/**
 * cache_org_switch.test.js
 * Integration tests for organization switching and cache management
 */

const fs = require('fs');
const path = require('path');

// Load and evaluate the cache manager code
const cacheManagerCode = fs.readFileSync(
  path.join(__dirname, '../cache_manager.js'),
  'utf8'
);

// Execute cache manager in global scope
eval(cacheManagerCode);

describe('Organization Switch Cache Management', () => {
  beforeEach(() => {
    localStorage.clear();
    if (window.CacheManager) {
      window.CacheManager.clearAllCaches();
    }
  });

  /**
   * IMPORTANT: CacheManager clears the PREVIOUS organization's cache when switching orgs.
   * This is a SAFETY FEATURE to prevent data leakage between organizations.
   *
   * Design Decision:
   * - When setCurrentOrgId('org2') is called, org1's cache is automatically cleared
   * - This prevents accidental exposure of sensitive data from different organizations
   */

  describe('Recent Records Isolation', () => {
    test('should clear recent records when switching orgs', () => {
      const recordsKey = 'recentRecords';

      // Org A sets recent records
      window.CacheManager.setCurrentOrgId('orgA');
      window.CacheManager.setCache(recordsKey, [
        { Id: '001', Name: 'Org A Record' }
      ]);
      expect(window.CacheManager.getCache(recordsKey)).not.toBeNull();

      // User switches to Org B
      window.CacheManager.setCurrentOrgId('orgB');

      // Org A's records should be cleared (security feature)
      window.CacheManager.setCurrentOrgId('orgA');
      expect(window.CacheManager.getCache(recordsKey)).toBeNull();
    });

    test('should isolate recent records per org when actively used', () => {
      const recordsKey = 'recentRecords';

      // Org A: User sets and immediately uses records
      window.CacheManager.setCurrentOrgId('orgA');
      const orgARecords = [{ Id: 'a001', Name: 'Org A Account' }];
      window.CacheManager.setCache(recordsKey, orgARecords);
      expect(window.CacheManager.getCache(recordsKey)).toEqual(orgARecords);

      // Switch to Org B: Org A cache is cleared
      window.CacheManager.setCurrentOrgId('orgB');
      const orgBRecords = [{ Id: 'b001', Name: 'Org B Account' }];
      window.CacheManager.setCache(recordsKey, orgBRecords);
      expect(window.CacheManager.getCache(recordsKey)).toEqual(orgBRecords);
    });
  });

  describe('Record History Isolation', () => {
    test('should not leak record history between orgs', () => {
      const historyKey = 'recordHistory';

      // Org A: User views records and history is recorded
      window.CacheManager.setCurrentOrgId('orgA');
      const orgAHistory = [
        { recordId: 'a001', timestamp: Date.now(), objectName: 'Account', displayName: 'Acme' }
      ];
      window.CacheManager.setCache(historyKey, orgAHistory);

      // Switch to Org B
      window.CacheManager.setCurrentOrgId('orgB');

      // Org A history should be cleared
      window.CacheManager.setCurrentOrgId('orgA');
      expect(window.CacheManager.getCache(historyKey)).toBeNull();
    });
  });

  describe('Sandbox vs Production Isolation', () => {
    test('should keep sandbox and production separate', () => {
      const recordsKey = 'recentRecords';

      // Sandbox org
      window.CacheManager.setCurrentOrgId('sandbox-001');
      window.CacheManager.setCache(recordsKey, [{ Id: 'sb_001', Name: 'Sandbox Record' }]);
      expect(window.CacheManager.getCache(recordsKey)).not.toBeNull();

      // Switch to Production org (clears sandbox cache)
      window.CacheManager.setCurrentOrgId('prod-001');
      window.CacheManager.setCache(recordsKey, [{ Id: 'prod_001', Name: 'Prod Record' }]);
      expect(window.CacheManager.getCache(recordsKey)).not.toBeNull();

      // Sandbox cache is now gone
      window.CacheManager.setCurrentOrgId('sandbox-001');
      expect(window.CacheManager.getCache(recordsKey)).toBeNull();
    });
  });

  describe('Real-World Workflows', () => {
    test('Developer working in multiple orgs throughout day', () => {
      const historyKey = 'recordHistory';

      // Morning: Dev org
      window.CacheManager.setCurrentOrgId('dev-org');
      window.CacheManager.setCache(historyKey, [{ recordId: 'dev-rec-1' }]);
      expect(window.CacheManager.getCache(historyKey)).not.toBeNull();

      // Midday: Staging org
      window.CacheManager.setCurrentOrgId('staging-org');
      window.CacheManager.setCache(historyKey, [{ recordId: 'staging-rec-1' }]);
      expect(window.CacheManager.getCache(historyKey)).not.toBeNull();

      // Back to Dev: Previous data is cleared
      window.CacheManager.setCurrentOrgId('dev-org');
      expect(window.CacheManager.getCache(historyKey)).toBeNull();
    });

    test('Should prevent accidental data leakage on quick org switch', () => {
      const sensitiveKey = 'sensitiveData';

      // User in sensitive Org A
      window.CacheManager.setCurrentOrgId('sensitive-orgA');
      window.CacheManager.setCache(sensitiveKey, { pin: '1234' });

      // Accidentally switches to Org B
      window.CacheManager.setCurrentOrgId('orgB');

      // Even if they go back to Org A, sensitive data is gone
      window.CacheManager.setCurrentOrgId('sensitive-orgA');
      expect(window.CacheManager.getCache(sensitiveKey)).toBeNull();
    });
  });
});

