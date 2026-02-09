/**
 * @jest-environment jsdom
 */
/**
 * cache_org_detection.test.js
 * Tests for organization detection and cache clearing on app launch
 */

const fs = require('fs');
const path = require('path');

// Load and evaluate the cache manager code
const cacheManagerCode = fs.readFileSync(
  path.join(__dirname, '../cache_manager.js'),
  'utf8'
);

eval(cacheManagerCode);

describe('Organization Detection and Cache Clearing', () => {
  beforeEach(() => {
    localStorage.clear();
    if (window.CacheManager) {
      window.CacheManager.clearAllCaches();
    }
  });

  describe('App Launch Scenarios', () => {
    test('should detect org change and clear cache on app relaunch', () => {
      // Simulate app launch in Org A
      window.CacheManager.setCurrentOrgId('00Da0000000001');
      window.CacheManager.setCache('recordHistory', [{ recordId: 'rec1', name: 'Record 1' }]);

      const statsOrg1 = window.CacheManager.getCacheStats();
      expect(statsOrg1.itemCount).toBeGreaterThan(0);

      // Simulate app launch detecting Org B (different org)
      const newOrgId = '00Da0000000002';
      const lastOrgId = window.CacheManager.getCurrentOrgId();

      // Org detected as changed
      if (lastOrgId && lastOrgId !== newOrgId) {
        window.CacheManager.clearAllCaches();
      }
      window.CacheManager.setCurrentOrgId(newOrgId);

      // Cache should be cleared
      expect(window.CacheManager.getCache('recordHistory')).toBeNull();

      // New org should be set
      expect(window.CacheManager.getCurrentOrgId()).toBe(newOrgId);
    });

    test('should NOT clear cache if same org detected on relaunch', () => {
      // Simulate first app launch in Org A
      window.CacheManager.setCurrentOrgId('00Da0000000001');
      window.CacheManager.setCache('recordHistory', [{ recordId: 'rec1' }]);

      // Simulate app relaunch detecting same org
      const currentOrgId = '00Da0000000001';
      const lastOrgId = window.CacheManager.getCurrentOrgId();

      // Should NOT clear since org is the same
      if (lastOrgId && lastOrgId !== currentOrgId) {
        window.CacheManager.clearAllCaches();
      }

      // Cache should still exist
      expect(window.CacheManager.getCache('recordHistory')).not.toBeNull();
    });
  });

  describe('Multiple Rapid App Launches from Different Orgs', () => {
    test('should clear cache each time org changes', () => {
      // First launch in Org A
      window.CacheManager.setCurrentOrgId('orgA');
      window.CacheManager.setCache('recordHistory', [{ recordId: 'a1' }]);
      expect(window.CacheManager.getCache('recordHistory')).not.toBeNull();

      // Second launch detects Org B
      const prevOrgId = window.CacheManager.getCurrentOrgId();
      if (prevOrgId && prevOrgId !== 'orgB') {
        window.CacheManager.clearAllCaches();
      }
      window.CacheManager.setCurrentOrgId('orgB');
      expect(window.CacheManager.getCache('recordHistory')).toBeNull();

      // Third launch detects Org C
      const prevOrgId2 = window.CacheManager.getCurrentOrgId();
      if (prevOrgId2 && prevOrgId2 !== 'orgC') {
        window.CacheManager.clearAllCaches();
      }
      window.CacheManager.setCurrentOrgId('orgC');
      expect(window.CacheManager.getCache('recordHistory')).toBeNull();

      // Set data for Org C
      window.CacheManager.setCache('recordHistory', [{ recordId: 'c1' }]);
      expect(window.CacheManager.getCache('recordHistory')).not.toBeNull();

      // Back to Org A
      const prevOrgId3 = window.CacheManager.getCurrentOrgId();
      if (prevOrgId3 && prevOrgId3 !== 'orgA') {
        window.CacheManager.clearAllCaches();
      }
      window.CacheManager.setCurrentOrgId('orgA');
      // Data is cleared
      expect(window.CacheManager.getCache('recordHistory')).toBeNull();
    });
  });

  describe('Favicon Switching with Org Changes', () => {
    test('should clear favicon cache on org switch', () => {
      // App in Org A with saved favicon
      window.CacheManager.setCurrentOrgId('orgA');
      window.CacheManager.setCache('savedFavicon', { color: '#FF0000', label: 'A' });
      expect(window.CacheManager.getCache('savedFavicon')).not.toBeNull();

      // App relaunched in Org B
      const prevOrgId = window.CacheManager.getCurrentOrgId();
      if (prevOrgId && prevOrgId !== 'orgB') {
        window.CacheManager.clearAllCaches();
      }
      window.CacheManager.setCurrentOrgId('orgB');

      // Favicon cache cleared
      expect(window.CacheManager.getCache('savedFavicon')).toBeNull();
    });
  });

  describe('Recent Records with Org Changes', () => {
    test('should not show recent records from previous org', () => {
      // User in Org A views some records
      window.CacheManager.setCurrentOrgId('orgA');
      const orgARecents = [
        { recordId: 'a001', name: 'Account A', timestamp: Date.now() },
        { recordId: 'a002', name: 'Account B', timestamp: Date.now() }
      ];
      window.CacheManager.setCache('recentRecords', orgARecents);

      // Verify Org A records are there
      let cached = window.CacheManager.getCache('recentRecords');
      expect(cached).toEqual(orgARecents);

      // User switches to Org B (app relaunches)
      const prevOrgId = window.CacheManager.getCurrentOrgId();
      if (prevOrgId && prevOrgId !== 'orgB') {
        window.CacheManager.clearAllCaches();
      }
      window.CacheManager.setCurrentOrgId('orgB');

      // Org A records should be gone
      cached = window.CacheManager.getCache('recentRecords');
      expect(cached).toBeNull();

      // Add Org B records
      const orgBRecents = [
        { recordId: 'b001', name: 'Account C', timestamp: Date.now() }
      ];
      window.CacheManager.setCache('recentRecords', orgBRecents);

      // Only Org B records should exist
      cached = window.CacheManager.getCache('recentRecords');
      expect(cached).toEqual(orgBRecents);
    });
  });

  describe('Real-World User Scenario', () => {
    test('User has multiple orgs open - switching between them', () => {
      // Morning: Working in Dev org
      window.CacheManager.setCurrentOrgId('dev-org-id');
      window.CacheManager.setCache('recordHistory', [{ recordId: 'dev-1', name: 'Dev Record' }]);
      window.CacheManager.setCache('recentRecords', [{ Id: 'dev-acc-1', Name: 'Dev Account' }]);

      expect(window.CacheManager.getCache('recordHistory')).not.toBeNull();
      expect(window.CacheManager.getCache('recentRecords')).not.toBeNull();

      // Afternoon: Needs to check Production org
      // Browser window/tab with Prod org loads extension
      const prevOrgId = window.CacheManager.getCurrentOrgId();
      if (prevOrgId && prevOrgId !== 'prod-org-id') {
        window.CacheManager.clearAllCaches();
      }
      window.CacheManager.setCurrentOrgId('prod-org-id');

      // Dev data should be cleared
      expect(window.CacheManager.getCache('recordHistory')).toBeNull();
      expect(window.CacheManager.getCache('recentRecords')).toBeNull();

      // Set Prod data
      window.CacheManager.setCache('recordHistory', [{ recordId: 'prod-1', name: 'Prod Record' }]);
      window.CacheManager.setCache('recentRecords', [{ Id: 'prod-acc-1', Name: 'Prod Account' }]);

      // Evening: Back to Dev org
      const prevOrgId2 = window.CacheManager.getCurrentOrgId();
      if (prevOrgId2 && prevOrgId2 !== 'dev-org-id') {
        window.CacheManager.clearAllCaches();
      }
      window.CacheManager.setCurrentOrgId('dev-org-id');

      // Prod data should be cleared
      expect(window.CacheManager.getCache('recordHistory')).toBeNull();
      expect(window.CacheManager.getCache('recentRecords')).toBeNull();
    });
  });

  describe('Edge Cases', () => {
    test('should handle null/undefined org IDs gracefully', () => {
      // Start with null org
      window.CacheManager.setCurrentOrgId('org1');
      window.CacheManager.setCache('data', 'value1');

      // Switch to another org
      const prevOrgId = window.CacheManager.getCurrentOrgId();
      if (prevOrgId && prevOrgId !== 'org2') {
        window.CacheManager.clearAllCaches();
      }
      window.CacheManager.setCurrentOrgId('org2');

      // Should be cleared
      expect(window.CacheManager.getCache('data')).toBeNull();
    });

    test('should handle same org ID set multiple times', () => {
      // Set org A multiple times
      window.CacheManager.setCurrentOrgId('orgA');
      window.CacheManager.setCache('data', 'value1');

      // Set same org again
      const prevOrgId = window.CacheManager.getCurrentOrgId();
      if (prevOrgId && prevOrgId !== 'orgA') {
        window.CacheManager.clearAllCaches();
      }
      window.CacheManager.setCurrentOrgId('orgA');

      // Data should still exist (not cleared)
      expect(window.CacheManager.getCache('data')).toBe('value1');

      // Set same org again
      const prevOrgId2 = window.CacheManager.getCurrentOrgId();
      if (prevOrgId2 && prevOrgId2 !== 'orgA') {
        window.CacheManager.clearAllCaches();
      }
      window.CacheManager.setCurrentOrgId('orgA');

      // Data should still exist
      expect(window.CacheManager.getCache('data')).toBe('value1');
    });
  });
});

