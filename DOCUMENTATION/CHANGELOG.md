# TrackForcePro - Changelog & Version History

## Version Selection
Select a version to view its documentation:
- [v1.1.15 (Current)](#v1115---february-15-2026)
- [v1.1.14](#v1114---february-14-2026)
- [v1.1.13](#v1113---february-12-2026)
- [v1.1.12](#v1112---february-11-2026)
- [v1.1.2](#v112---february-9-2026)
- [v1.1.1](#v111---february-8-2026)
- [v1.1.0](#v110---february-7-2026)

---

## v1.1.15 - February 15, 2026

### 🚀 Improvements

#### Extension Description
- **Added proper manifest description** for Chrome Web Store listing
- Description: "Salesforce developer toolkit with audit trail extraction, SOQL/GraphQL query builders, record scanner, org favicon manager, platform events monitor, and LMS tools."

#### Documentation Improvements
- **Automated version updates** - Enhanced update-docs-version.js script
- **README.md updates** - Script now updates DOCUMENTATION/README.md automatically
- **File naming convention fix** - Renamed QUICK_START_GUIDE.html to lowercase quick-start-guide.html
- **ES modules conversion** - Converted update script from CommonJS to ES modules

#### Test Suite
- **New test cases** - Added 4 new tests for README.md version update functionality
- **Total tests** - 1652 passing tests

---

## v1.1.14 - February 14, 2026

### 🚀 New Features

#### Cache Manager
- **Intelligent caching** - Automatic caching of object and field metadata
- **Smart invalidation** - Cache refreshes when data changes
- **Performance boost** - Faster load times for repeated operations
- **Storage management** - Efficient browser storage usage

### 📝 Documentation
- Added comprehensive documentation HTML pages
- Updated GitHub Pages site with new features
- Enhanced Quick Start Guide

---

## v1.1.13 - February 12, 2026

### 🚀 Improvements
- Stability improvements
- Bug fixes for Record Scanner
- Enhanced Page Blinker functionality

---

## v1.1.12 - February 11, 2026

### 🐛 Bug Fixes
- Performance improvements
- Minor bug fixes

---

## v1.1.2 - February 9, 2026

### 🚀 New Features

#### Record Scanner (formerly Record Lookup)
- **Renamed** "Record Lookup" to "Record Scanner" for better clarity
- **Field History Tracking**: View field-level change history for records
  - Shows old value → new value transitions
  - Displays who made the change and when
  - Supports standard objects (Account, Contact, Case, etc.)
  - Supports custom objects with history tracking enabled
  - Export history to CSV
- **Related Records Explorer**: Discover and navigate child relationships
  - Shows count of related records per relationship
  - Expandable groups to preview individual records
  - Click to scan related records
  - Links to view full related list in Salesforce

#### Page Blinker/Indicator
- **New floating indicator** on Salesforce pages (top-right corner)
- Quick access to open TrackForcePro from any Salesforce page
- Click to open extension in new tab
- Double-click to minimize to icon only
- Close button to hide (reappears on page reload)
- Pulsing animation for visibility

### 🐛 Bug Fixes

#### Platform Events Authentication Retry
- **Root Cause**: CometD handshake could fail with 401/403 authentication errors when session expired
- **Error Message**: `Handshake unsuccessful: {"ext":{"sfdc":{"failureReason":"401::Authentication invalid"}},"error":"403::Handshake denied","successful":false}`
- **Impact**: Platform Events subscription would fail permanently until page refresh
- **Fix**: Added automatic retry logic on authentication errors:
  - Detects auth failures (401, 403, "authentication invalid", "handshake denied")
  - Clears instance URL cache
  - Refreshes session from active Salesforce tab
  - Retries handshake once with fresh credentials
  - Falls back to error message if retry fails
- **Tests Added**: New tests for auth retry scenarios

#### Content Script Loading Fix
- **Root Cause**: `content_scripts` in manifest.json was missing `*.salesforce.com/*`
- **Impact**: Extension couldn't connect on main Salesforce pages
- **Fix**: Added all required URL patterns:
  - `https://*.salesforce.com/*`
  - `https://*.force.com/*`
  - `https://*.salesforce-setup.com/*`
  - `https://*.visualforce.com/*`
  - `https://*.lightning.force.com/*`

#### Related Records Query Errors
- Fixed "entity type does not support query" errors for:
  - ActivityHistory, AttachedContentDocument
  - CaseFeed and other Feed objects
  - Share objects, Team member objects
- Added deduplication to prevent duplicate entries (e.g., EmailMessage)

#### Field History Query
- Fixed parent ID field detection for standard vs custom objects
- Standard objects use `{ObjectName}Id` (e.g., `AccountId`)
- Custom objects use `ParentId`

### 📝 Documentation
- Updated all guides to reflect Record Scanner rename
- Added comprehensive test suite for content script loading
- Updated QUICK_REFERENCE.md with new UI layout

---

## v1.1.1 - February 8, 2026

### 🚀 New Features

#### Record Lookup (Unified Interface)
- Combined Current Record + Search + History into single interface
- Three-panel layout: Recent Records | Record Inspector | Dev Tools
- Auto-detect records from current Salesforce URL
- Manual search by 15/18 character Record ID
- Recent records history (last 5 viewed)

#### Developer Tools Panel
- Quick links: Setup, Developer Console, Object Manager, Debug Logs
- Record-specific tools: View in Setup, Query in SOQL, Copy SOQL, View API
- ID prefix reference guide

### 🐛 Bug Fixes
- Fixed SOQL fallback for objects not supported by UI API
- Improved record type detection using key prefix mapping
- Better error handling for invalid record IDs

---

## v1.1.0 - February 7, 2026

### 🚀 New Features

#### Popout Window Enhancements
- Single-click opens as browser tab (adjacent to current)
- Shift+click opens as standalone window
- Dynamic window title shows org name
- Pop-in from window opens as tab instead of closing

#### User Manager
- View current logged-in user details
- Search users by name, email, or username
- Update user profile, role, and language
- Batch selection support

#### Sandbox & Favicon Manager
- Custom favicon shapes: Cloud, Circle, Square, Rounded, Diamond, Hexagon
- Color presets and custom colors
- Label text on favicon (up to 3 characters)
- Per-org favicon settings
- Automatic favicon application on page load

### 🐛 Bug Fixes
- Fixed session detection on sandbox orgs
- Improved favicon persistence across page navigation
- Fixed GraphQL query builder field selection

---

## v1.0.9 - February 6, 2026

### 🚀 New Features

#### SOQL Builder Enhancements
- Smart field suggestions based on object
- Filter builder with multiple conditions
- AND/OR logic toggle
- ORDER BY and LIMIT support
- Query history

#### GraphQL Builder
- Visual query composition for UI API
- Field selection with nested objects
- Pagination support (first, after, offset)
- Real-time query preview

### 🐛 Bug Fixes
- Fixed API version detection
- Improved error messages for query failures

---

## v1.0.8 - February 5, 2026

### 🚀 New Features
- Platform Events monitoring
- Lightning Message Service (LMS) support
- Real-time event streaming

---

## v1.0.7 - February 4, 2026

### 🚀 New Features
- Audit Trail extraction with CSV export
- Setup audit log viewer
- Date range filtering

---

## Previous Versions

For versions prior to v1.0.7, please refer to the GitHub release history.

---

## Upgrade Notes

### Upgrading to v1.1.2
1. Reload the extension after update
2. Refresh any open Salesforce tabs
3. The new blinker will appear on Salesforce pages
4. Navigate to Explore → Record Scanner (formerly Record Lookup)

### Known Issues
- Field history requires history tracking to be enabled in Salesforce Setup
- Some related objects may not be queryable due to Salesforce restrictions
- Blinker may overlap with some Salesforce UI elements (can be minimized)

---

**Current Version:** 1.1.2  
**Release Date:** February 9, 2026  
**Minimum Chrome Version:** 88+

