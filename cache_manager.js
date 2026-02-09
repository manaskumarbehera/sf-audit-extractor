/**
 * cache_manager.js
 * Manages organization-aware caching to prevent data leakage when switching between orgs.
 *
 * Key features:
 * - Organization-scoped cache keys (includes orgId in key)
 * - Automatic cache invalidation on org switch
 * - Support for both localStorage and sessionStorage
 * - Clear cache on demand
 */

(function() {
  'use strict';

  const state = {
    currentOrgId: null,
    cacheVersion: 1  // Increment to invalidate all caches
  };

  /**
   * Generate an organization-specific cache key
   * @param {string} key - Base cache key
   * @param {string} orgId - Organization ID (optional, uses current if not provided)
   * @returns {string} Org-specific cache key
   */
  function generateOrgCacheKey(key, orgId = null) {
    const org = orgId || state.currentOrgId || 'unknown';
    return `cache_${org}_${key}`;
  }

  /**
   * Get cached data from localStorage
   * @param {string} key - Cache key (will be org-scoped)
   * @param {string} orgId - Organization ID (optional)
   * @returns {any} Cached value or null
   */
  function getCache(key, orgId = null) {
    try {
      const fullKey = generateOrgCacheKey(key, orgId);
      const item = localStorage.getItem(fullKey);
      if (!item) return null;

      const parsed = JSON.parse(item);
      // Check cache expiration if it has a ttl
      if (parsed && parsed.__expires && Date.now() > parsed.__expires) {
        localStorage.removeItem(fullKey);
        return null;
      }

      return parsed.data !== undefined ? parsed.data : parsed;
    } catch (e) {
      console.warn(`Error reading cache for ${key}:`, e);
      return null;
    }
  }

  /**
   * Set cached data in localStorage
   * @param {string} key - Cache key (will be org-scoped)
   * @param {any} value - Value to cache
   * @param {number} ttlMs - Time to live in milliseconds (optional)
   * @param {string} orgId - Organization ID (optional)
   * @returns {boolean} Success status
   */
  function setCache(key, value, ttlMs = null, orgId = null) {
    try {
      const fullKey = generateOrgCacheKey(key, orgId);
      const item = {
        data: value,
        timestamp: Date.now(),
        version: state.cacheVersion
      };

      if (ttlMs) {
        item.__expires = Date.now() + ttlMs;
      }

      localStorage.setItem(fullKey, JSON.stringify(item));
      return true;
    } catch (e) {
      console.warn(`Error setting cache for ${key}:`, e);
      return false;
    }
  }

  /**
   * Remove cached data
   * @param {string} key - Cache key (will be org-scoped)
   * @param {string} orgId - Organization ID (optional)
   * @returns {boolean} Success status
   */
  function removeCache(key, orgId = null) {
    try {
      const fullKey = generateOrgCacheKey(key, orgId);
      localStorage.removeItem(fullKey);
      return true;
    } catch (e) {
      console.warn(`Error removing cache for ${key}:`, e);
      return false;
    }
  }

  /**
   * Clear all caches for the current organization
   * @param {string} orgId - Organization ID to clear (optional, uses current if not provided)
   * @returns {number} Number of items cleared
   */
  function clearOrgCache(orgId = null) {
    try {
      const org = orgId || state.currentOrgId;
      if (!org) return 0;

      const prefix = `cache_${org}_`;
      let count = 0;

      // Collect keys to remove (can't modify during iteration)
      const keysToRemove = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith(prefix)) {
          keysToRemove.push(key);
        }
      }

      // Remove collected keys
      keysToRemove.forEach(key => {
        localStorage.removeItem(key);
        count++;
      });

      console.log(`Cleared ${count} cache items for org ${org}`);
      return count;
    } catch (e) {
      console.warn('Error clearing org cache:', e);
      return 0;
    }
  }

  /**
   * Clear all caches (including session-specific ones)
   * @returns {number} Number of items cleared
   */
  function clearAllCaches() {
    try {
      const keysToRemove = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith('cache_')) {
          keysToRemove.push(key);
        }
      }

      keysToRemove.forEach(key => {
        localStorage.removeItem(key);
      });

      // Also clear specific known cache keys
      const knownCacheKeys = [
        'recordHistory',
        'recentRecords',
        'scannerData',
        'fieldHistory',
        'relatedRecords',
        'userSearchResults',
        'orgInfo'
      ];

      knownCacheKeys.forEach(key => {
        try { localStorage.removeItem(key); } catch {}
        try { sessionStorage.removeItem(key); } catch {}
      });

      console.log(`Cleared ${keysToRemove.length} cache items and session storage`);
      return keysToRemove.length;
    } catch (e) {
      console.warn('Error clearing all caches:', e);
      return 0;
    }
  }

  /**
   * Set the current organization ID
   * @param {string} orgId - Organization ID
   * @returns {boolean} Success status
   */
  function setCurrentOrgId(orgId) {
    try {
      if (!orgId) {
        console.warn('Invalid orgId provided');
        return false;
      }

      const previousOrgId = state.currentOrgId;
      state.currentOrgId = orgId;

      // If switching from one org to another, clear previous org's cache from current context
      // This prevents data leakage when switching orgs, but data can still be accessed with explicit org ID
      if (previousOrgId && previousOrgId !== orgId) {
        console.log(`[CacheManager] Org switch detected in setCurrentOrgId: ${previousOrgId} → ${orgId}`);
        clearOrgCache(previousOrgId);
      }

      // Store org ID in localStorage to detect switches between app launches
      try {
        localStorage.setItem('_cacheManagerOrgId', orgId);
      } catch (e) {
        console.warn('[CacheManager] Could not store org ID in localStorage:', e);
      }

      return true;
    } catch (e) {
      console.warn('Error setting current org ID:', e);
      return false;
    }
  }

  /**
   * Get the current organization ID
   * @returns {string|null} Current organization ID
   */
  function getCurrentOrgId() {
    return state.currentOrgId;
  }

  /**
   * Get the last stored organization ID from localStorage
   * Used to detect org switches between app launches
   * @returns {string|null} Last stored organization ID
   */
  function getLastStoredOrgId() {
    try {
      return localStorage.getItem('_cacheManagerOrgId') || null;
    } catch (e) {
      console.warn('[CacheManager] Could not read stored org ID:', e);
      return null;
    }
  }

  /**
   * Increment cache version to invalidate all caches
   * @returns {number} New cache version
   */
  function invalidateAllCaches() {
    state.cacheVersion++;
    clearAllCaches();
    console.log(`Cache version incremented to ${state.cacheVersion}`);
    return state.cacheVersion;
  }

  /**
   * Get cache statistics
   * @returns {object} Cache statistics
   */
  function getCacheStats() {
    let totalSize = 0;
    let itemCount = 0;
    const byOrg = {};

    try {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith('cache_')) {
          const value = localStorage.getItem(key);
          if (value) {
            totalSize += value.length;
            itemCount++;

            // Extract org ID from key
            const match = key.match(/^cache_(.+?)_/);
            if (match) {
              const org = match[1];
              byOrg[org] = (byOrg[org] || 0) + 1;
            }
          }
        }
      }
    } catch (e) {
      console.warn('Error getting cache stats:', e);
    }

    return {
      totalSize,
      itemCount,
      byOrg,
      cacheVersion: state.cacheVersion,
      currentOrgId: state.currentOrgId
    };
  }

  // Expose API
  window.CacheManager = {
    getCache,
    setCache,
    removeCache,
    clearOrgCache,
    clearAllCaches,
    setCurrentOrgId,
    getCurrentOrgId,
    getLastStoredOrgId,
    invalidateAllCaches,
    getCacheStats
  };

  console.log('CacheManager initialized');
})();

