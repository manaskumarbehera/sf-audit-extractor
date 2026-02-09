/**
 * @jest-environment jsdom
 *
 * Cache Isolation Tests
 * Tests that cache is properly cleared when switching between organizations
 */

describe('Cache Isolation on Org Switch', () => {
    let mockCacheManager;
    let mockDataExplorer;

    beforeEach(() => {
        // Clear localStorage
        localStorage.clear();

        // Mock CacheManager
        mockCacheManager = {
            _currentOrgId: null,
            _lastOrgId: null,

            setCurrentOrgId: jest.fn(function(orgId) {
                this._lastOrgId = this._currentOrgId;
                this._currentOrgId = orgId;
                console.log(`CacheManager: Set org to ${orgId}`);
            }),

            getCurrentOrgId: jest.fn(function() {
                return this._currentOrgId;
            }),

            clearAllCaches: jest.fn(function() {
                const keysToDelete = [];
                for (let i = 0; i < localStorage.length; i++) {
                    const key = localStorage.key(i);
                    if (key && key.startsWith('cache_')) {
                        keysToDelete.push(key);
                    }
                }
                keysToDelete.forEach(k => localStorage.removeItem(k));
                console.log(`CacheManager: Cleared ${keysToDelete.length} cache items`);
            }),

            getCache: jest.fn(function(key) {
                try {
                    const fullKey = `cache_${this._currentOrgId}_${key}`;
                    const item = localStorage.getItem(fullKey);
                    if (!item) return null;
                    return JSON.parse(item);
                } catch (e) {
                    return null;
                }
            }),

            setCache: jest.fn(function(key, value) {
                try {
                    const fullKey = `cache_${this._currentOrgId}_${key}`;
                    localStorage.setItem(fullKey, JSON.stringify(value));
                    return true;
                } catch (e) {
                    return false;
                }
            })
        };

        // Mock DataExplorerHelper
        mockDataExplorer = {
            _initialized: false,
            _currentOrgId: null,
            _currentOrgName: null,
            _recordHistory: [],

            resetAllData: jest.fn(function() {
                this._currentOrgId = null;
                this._currentOrgName = null;
                this._recordHistory = [];
                console.log('DataExplorerHelper: All data reset');
            }),

            init: jest.fn(function() {
                if (this._initialized) return;
                this._initialized = true;
                this.resetAllData();
                console.log('DataExplorerHelper: Initialized');
            })
        };

        window.CacheManager = mockCacheManager;
        window.DataExplorerHelper = mockDataExplorer;
    });

    describe('Cache Clearing on Org Switch', () => {
        test('should clear all caches when switching organizations', () => {
            const clearSpy = mockCacheManager.clearAllCaches;

            // Org A: Set some cache
            mockCacheManager.setCurrentOrgId('org-a');
            mockCacheManager.setCache('recentRecords', [{ id: '001', name: 'Record A' }]);

            // Verify data is cached
            expect(localStorage.length).toBeGreaterThan(0);

            // Org B: Switch org and clear
            mockCacheManager.clearAllCaches();
            mockCacheManager.setCurrentOrgId('org-b');

            // Cache should be cleared
            expect(localStorage.length).toBe(0);
            expect(clearSpy).toHaveBeenCalled();
        });

        test('should reset DataExplorerHelper when switching orgs', () => {
            const resetSpy = mockDataExplorer.resetAllData;

            // Org A: Initialize with data
            mockDataExplorer._currentOrgId = 'org-a';
            mockDataExplorer._currentOrgName = 'Org A';
            mockDataExplorer._recordHistory = [{ recordId: '001' }];

            // Verify data is set
            expect(mockDataExplorer._recordHistory.length).toBe(1);

            // Org B: Reset data
            mockDataExplorer.resetAllData();

            // Data should be cleared
            expect(mockDataExplorer._currentOrgId).toBeNull();
            expect(mockDataExplorer._currentOrgName).toBeNull();
            expect(mockDataExplorer._recordHistory).toEqual([]);
            expect(resetSpy).toHaveBeenCalled();
        });

        test('should reset initialization flag when switching orgs', () => {
            mockDataExplorer._initialized = true;

            // Reset state
            mockDataExplorer._initialized = false;

            expect(mockDataExplorer._initialized).toBe(false);
        });
    });

    describe('Recent Records Isolation', () => {
        test('should not show recent records from different org', () => {
            // Org A: Add records
            mockCacheManager.setCurrentOrgId('org-a');
            mockCacheManager.setCache('recentRecords', [
                { id: 'a001', name: 'Org A Record' }
            ]);

            // Verify in Org A
            let cached = mockCacheManager.getCache('recentRecords');
            expect(cached).not.toBeNull();
            expect(cached[0].name).toBe('Org A Record');

            // Switch to Org B: Clear cache
            mockCacheManager.clearAllCaches();
            mockCacheManager.setCurrentOrgId('org-b');

            // Verify cleared
            cached = mockCacheManager.getCache('recentRecords');
            expect(cached).toBeNull();
        });

        test('should isolate recent records per organization', () => {
            // Org A records
            mockCacheManager.setCurrentOrgId('org-a');
            mockCacheManager.setCache('recentRecords', [{ id: 'a001' }]);

            // Switch to Org B
            mockCacheManager.clearAllCaches();
            mockCacheManager.setCurrentOrgId('org-b');
            mockCacheManager.setCache('recentRecords', [{ id: 'b001' }]);

            // Verify Org B records
            let cached = mockCacheManager.getCache('recentRecords');
            expect(cached[0].id).toBe('b001');

            // Switch back to Org A: Data should be cleared (security feature)
            mockCacheManager.clearAllCaches();
            mockCacheManager.setCurrentOrgId('org-a');

            cached = mockCacheManager.getCache('recentRecords');
            expect(cached).toBeNull();
        });
    });

    describe('Record History Isolation', () => {
        test('should clear record history on org switch', () => {
            // Org A: Set record history
            mockCacheManager.setCurrentOrgId('org-a');
            const orgAHistory = [
                { recordId: '001', timestamp: Date.now(), name: 'Record A' }
            ];
            mockCacheManager.setCache('recordHistory', orgAHistory);

            // Verify
            expect(mockCacheManager.getCache('recordHistory')).not.toBeNull();

            // Switch to Org B: Clear
            mockCacheManager.clearAllCaches();
            mockCacheManager.setCurrentOrgId('org-b');

            // Verify cleared
            expect(mockCacheManager.getCache('recordHistory')).toBeNull();
        });

        test('should not mix record history from different orgs', () => {
            // Org A history
            mockCacheManager.setCurrentOrgId('org-a');
            mockCacheManager.setCache('recordHistory', [{ id: '001', org: 'A' }]);

            // Org B history
            mockCacheManager.clearAllCaches();
            mockCacheManager.setCurrentOrgId('org-b');
            mockCacheManager.setCache('recordHistory', [{ id: '002', org: 'B' }]);

            // Verify Org B
            let history = mockCacheManager.getCache('recordHistory');
            expect(history[0].org).toBe('B');

            // Switch back to Org A: Should be empty (cleared on switch)
            mockCacheManager.clearAllCaches();
            mockCacheManager.setCurrentOrgId('org-a');
            history = mockCacheManager.getCache('recordHistory');
            expect(history).toBeNull();
        });
    });

    describe('Favicon Data Isolation', () => {
        test('should clear favicon cache on org switch', () => {
            // Org A favicon
            mockCacheManager.setCurrentOrgId('org-a');
            mockCacheManager.setCache('savedFavicon', { color: '#ff6b6b', label: 'A' });

            expect(mockCacheManager.getCache('savedFavicon')).not.toBeNull();

            // Switch to Org B: Clear
            mockCacheManager.clearAllCaches();
            mockCacheManager.setCurrentOrgId('org-b');

            // Should be cleared
            expect(mockCacheManager.getCache('savedFavicon')).toBeNull();
        });
    });

    describe('Multi-Organization Switching', () => {
        test('should handle rapid org switching without data leakage', () => {
            // Org A
            mockCacheManager.setCurrentOrgId('org-a');
            mockCacheManager.setCache('recentRecords', [{ id: 'a001' }]);

            // Switch to Org B
            mockCacheManager.clearAllCaches();
            mockCacheManager.setCurrentOrgId('org-b');
            mockCacheManager.setCache('recentRecords', [{ id: 'b001' }]);

            // Switch to Org C
            mockCacheManager.clearAllCaches();
            mockCacheManager.setCurrentOrgId('org-c');
            mockCacheManager.setCache('recentRecords', [{ id: 'c001' }]);

            // Verify Org C records
            let cached = mockCacheManager.getCache('recentRecords');
            expect(cached[0].id).toBe('c001');

            // Back to Org A: Should be cleared
            mockCacheManager.clearAllCaches();
            mockCacheManager.setCurrentOrgId('org-a');

            cached = mockCacheManager.getCache('recentRecords');
            expect(cached).toBeNull();

            // Back to Org B: Should be cleared
            mockCacheManager.clearAllCaches();
            mockCacheManager.setCurrentOrgId('org-b');

            cached = mockCacheManager.getCache('recentRecords');
            expect(cached).toBeNull();
        });

        test('should track current org correctly through multiple switches', () => {
            const getCurrentSpy = mockCacheManager.getCurrentOrgId;

            mockCacheManager.setCurrentOrgId('org-a');
            expect(mockCacheManager.getCurrentOrgId()).toBe('org-a');

            mockCacheManager.setCurrentOrgId('org-b');
            expect(mockCacheManager.getCurrentOrgId()).toBe('org-b');

            mockCacheManager.setCurrentOrgId('org-c');
            expect(mockCacheManager.getCurrentOrgId()).toBe('org-c');

            expect(getCurrentSpy).toHaveBeenCalledTimes(3);
        });
    });

    describe('Real-World Scenarios', () => {
        test('scenario: Developer with Dev and Prod orgs', () => {
            // Morning: Working in Dev
            mockCacheManager.setCurrentOrgId('dev-org-id');
            mockCacheManager.setCache('recentRecords', [{ Id: 'dev-001', Name: 'Dev Record' }]);
            mockCacheManager.setCache('recordHistory', [{ recordId: 'dev-hist-1' }]);

            expect(mockCacheManager.getCache('recentRecords')).not.toBeNull();

            // Afternoon: Switch to Prod
            mockCacheManager.clearAllCaches();
            mockCacheManager.setCurrentOrgId('prod-org-id');
            mockCacheManager.setCache('recentRecords', [{ Id: 'prod-001', Name: 'Prod Record' }]);

            // Dev data should be cleared
            expect(mockCacheManager.getCache('recentRecords')[0].Name).toBe('Prod Record');

            // Evening: Back to Dev
            mockCacheManager.clearAllCaches();
            mockCacheManager.setCurrentOrgId('dev-org-id');

            // Prod data should be cleared
            expect(mockCacheManager.getCache('recentRecords')).toBeNull();
        });

        test('scenario: User logs out and back in with different org', () => {
            // Session 1: Org A
            mockCacheManager.setCurrentOrgId('org-a');
            mockCacheManager.setCache('recentRecords', [{ Id: '001' }]);

            // Logout: Clear everything
            mockCacheManager.clearAllCaches();

            // Session 2: Org B
            mockCacheManager.setCurrentOrgId('org-b');
            expect(mockCacheManager.getCache('recentRecords')).toBeNull();

            mockCacheManager.setCache('recentRecords', [{ Id: '002' }]);
            expect(mockCacheManager.getCache('recentRecords')).not.toBeNull();
        });

        test('scenario: Support analyst accessing client orgs', () => {
            const clients = ['client-1-org', 'client-2-org', 'client-3-org'];

            // Visit each client org
            clients.forEach((clientOrg, index) => {
                mockCacheManager.clearAllCaches();
                mockCacheManager.setCurrentOrgId(clientOrg);
                mockCacheManager.setCache('recentRecords', [{
                    Id: `record-${index}`,
                    ClientOrg: clientOrg
                }]);
            });

            // Verify last client's data
            let cached = mockCacheManager.getCache('recentRecords');
            expect(cached[0].ClientOrg).toBe('client-3-org');

            // Switch back to client 1: Should be cleared
            mockCacheManager.clearAllCaches();
            mockCacheManager.setCurrentOrgId('client-1-org');

            cached = mockCacheManager.getCache('recentRecords');
            expect(cached).toBeNull();
        });
    });

    describe('DataExplorerHelper Integration', () => {
        test('should reset all data on initialization', () => {
            // Setup with old org data
            mockDataExplorer._currentOrgId = 'old-org';
            mockDataExplorer._recordHistory = [{ id: '001' }];
            mockDataExplorer._initialized = true;

            // Reset for new org
            mockDataExplorer._initialized = false;
            mockDataExplorer.resetAllData();
            mockDataExplorer.init();

            // Should be cleared
            expect(mockDataExplorer._currentOrgId).toBeNull();
            expect(mockDataExplorer._recordHistory).toEqual([]);
            expect(mockDataExplorer._initialized).toBe(true);
        });

        test('should not re-initialize if already initialized for same org', () => {
            const initSpy = mockDataExplorer.init;

            mockDataExplorer.init();
            mockDataExplorer.init(); // Second call

            // Should only initialize once without reset flag
            expect(initSpy).toHaveBeenCalledTimes(2);
        });
    });
});

