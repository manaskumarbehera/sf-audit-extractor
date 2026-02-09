# TrackForcePro - Chrome Extension User Guide
### Version 1.1.2 | February 9, 2026

---

## What's New in v1.1.2

- 🔬 **Record Scanner** - Renamed from Record Lookup with new features:
  - Field History tracking (view old → new value changes)
  - Related Records explorer with counts
  - Export history to CSV
- ✨ **Page Blinker** - Floating indicator on Salesforce pages for quick access
- 🐛 **Bug Fixes** - Content script loading, query errors resolved

---

## Welcome to TrackForcePro

TrackForcePro is a powerful Chrome extension designed specifically for Salesforce Administrators and Developers. It provides a comprehensive suite of tools for auditing fields, building queries, monitoring events, managing org identities, and exploring data—all directly from your browser.

**[Screenshot: TrackForcePro Extension Icon in Chrome Toolbar]**

---

## Table of Contents

1. [Getting Started](#getting-started)
   - [Installation](#installation)
   - [First Launch](#first-launch)
   - [Connecting to Salesforce](#connecting-to-salesforce)
2. [Main Features](#main-features)
   - [Audit Extractor](#1-audit-extractor)
   - [GraphQL Builder](#2-graphql-builder)
   - [SOQL Builder](#3-soql-builder)
   - [Data Explorer](#4-data-explorer)
   - [Platform Tools](#5-platform-tools)
   - [Page Blinker](#6-page-blinker) *(New)*
3. [Window & Tab Modes](#7-window--tab-modes)
4. [Settings](#settings)
5. [Help & Support](#help--support)
6. [About TrackForcePro](#about-trackforcepro)
7. [Troubleshooting](#troubleshooting)
8. [Keyboard Shortcuts](#keyboard-shortcuts)
9. [Version History](#version-history)

---

## Getting Started

### Installation

#### Option 1: Chrome Web Store (Recommended) ⭐

The easiest way to install TrackForcePro:

1. **Visit the Chrome Web Store**
   - Go to: **[TrackForcePro on Chrome Web Store](https://chromewebstore.google.com/detail/trackforcepro/eombeiphccjbnndbabnkimdlkpaooipk)**

2. **Click "Add to Chrome"**
   - Click the blue "Add to Chrome" button
   - Confirm by clicking "Add extension" in the popup

3. **Done!**
   - TrackForcePro will be installed and appear in your extensions
   - Pin it to your toolbar for easy access

**[Screenshot: Chrome Web Store Installation]**

---

#### Option 2: Manual Installation (Developer Mode)

For developers or advanced users who want to use the development version:

1. **Download the Extension**
   - Visit our website and download the TrackForcePro extension package
   - The file will be downloaded as a `.zip` file

2. **Extract the Files**
   - Locate the downloaded `.zip` file
   - Right-click and select "Extract All" (Windows) or double-click to extract (Mac)
   - Remember the location of the extracted folder

3. **Open Chrome Extensions Page**
   - Open Google Chrome
   - Type `chrome://extensions/` in the address bar and press Enter
   
   **[Screenshot: Chrome Extensions Page]**

4. **Enable Developer Mode**
   - Look for the "Developer mode" toggle in the top-right corner
   - Click to enable it (toggle should turn blue)
   
   **[Screenshot: Developer Mode Toggle Enabled]**

5. **Load the Extension**
   - Click the "Load unpacked" button that appears
   - Navigate to the extracted TrackForcePro folder
   - Select the folder and click "Open"

6. **Verify Installation**
   - You should see TrackForcePro appear in your extensions list
   - The TrackForcePro icon will appear in your Chrome toolbar
   
   **[Screenshot: TrackForcePro in Extensions List]**

> **Tip:** Click the puzzle piece icon in Chrome's toolbar and pin TrackForcePro for easy access.

---

### First Launch

1. Click the TrackForcePro icon in your Chrome toolbar
2. The extension popup will open showing the main interface

**[Screenshot: TrackForcePro Main Interface]**

The interface consists of:
- **Header**: Shows the current feature name and connection status
- **Tab Navigation**: Switch between different tools (Audit, GraphQL, SOQL, Explore, Platform, Settings)
- **Content Area**: The main workspace for the selected feature
- **Footer**: Additional actions and information

---

### Connecting to Salesforce

TrackForcePro automatically detects your Salesforce session from open browser tabs.

**To connect:**

1. Open a new browser tab
2. Navigate to your Salesforce org and log in
3. Keep the Salesforce tab open
4. Click the TrackForcePro extension icon
5. The extension will automatically detect your session

**Connection Status Indicators:**
- 🟢 **Connected**: Green indicator or successful data loading
- 🔴 **Not Connected**: "Not Connected" message displayed

**[Screenshot: Connected vs Not Connected States]**

> **Important:** The extension requires an active Salesforce tab with a valid login session. If you see "Not Connected," ensure you're logged into Salesforce in another tab.

---

## Main Features

### 1. Audit Extractor

**Purpose:** Extract field metadata from Salesforce Object Manager for documentation and analysis.

**[Screenshot: Audit Tab Interface]**

#### How to Use:

1. **Navigate to Object Manager in Salesforce**
   - Go to Setup → Object Manager → Select an Object → Fields & Relationships
   
   **[Screenshot: Salesforce Fields & Relationships Page]**

2. **Open TrackForcePro**
   - Click the extension icon
   - Select the "Audit" tab

3. **Extract Field Data**
   - Click **"Download CSV"** to export all field metadata to a CSV file
   - Click **"Copy to Clipboard"** to copy data for pasting into spreadsheets

**Extracted Information Includes:**
- Field Label
- API Name
- Data Type
- Length/Precision
- Required status
- Description
- Help Text

**[Screenshot: Downloaded CSV Example]**

---

### 2. GraphQL Builder

**Purpose:** Build and execute GraphQL queries against Salesforce's UI API without writing code.

**[Screenshot: GraphQL Builder Main Screen]**

#### Step-by-Step Guide:

**Step 1: Select an Object**

1. Open the GraphQL tab
2. Browse the object cards or use the search box
3. Click on an object card to select it (e.g., Account, Contact)

**[Screenshot: Object Selection Grid]**

**Step 2: Build Your Query**

The Query Builder interface has two panels:

**Left Panel (Composition):**
- **Fields**: Check the fields you want to retrieve
- **Filters**: Add WHERE conditions
- **Order By**: Set sort field and direction
- **Pagination**: Configure limit and offset

**Right Panel (Preview):**
- Live query preview updates as you make selections
- Three tabs: Query, Variables, Endpoint

**[Screenshot: Query Builder with Fields Selected]**

**Step 3: Configure Options**

| Option | Description |
|--------|-------------|
| Fields | Select which fields to include in results |
| Filters | Add conditions like `Name = 'Acme'` |
| Order By | Sort results by a specific field |
| Limit | Maximum number of records (default: 50) |
| Offset | Skip records for pagination |

**Step 4: Execute the Query**

1. Review your query in the preview panel
2. Click **"Run Query"**
3. View results in the Results screen

**[Screenshot: Query Results View]**

**Step 5: Navigate Results**

- Click on result items to expand/collapse details
- Use pagination controls for large result sets
- Click "Edit Query" to return to the builder
- Click "Reset" to start over with object selection

#### Advanced Features:

**Manual Query Mode:**
1. Toggle the "Builder" checkbox OFF
2. Edit the query directly in the Query tab
3. Add custom variables in the Variables tab
4. Execute as normal

**Cursor-Based Pagination:**
1. Run your initial query
2. Note the `endCursor` value in results
3. Click "Use endCursor" to fetch the next page
4. Repeat until `hasNextPage` is false

---

### 3. SOQL Builder

**Purpose:** Build and execute SOQL (Salesforce Object Query Language) queries with a visual interface.

**[Screenshot: SOQL Builder Interface]**

#### How to Use:

1. **Select an Object**
   - Use the dropdown or search to find your object

2. **Choose Fields**
   - Check the fields you want to query
   - `Id` is included by default

3. **Add Conditions (Optional)**
   - Click "+ Add Filter" to add WHERE clauses
   - Choose field, operator, and value
   - Multiple filters are combined with AND

4. **Set Order (Optional)**
   - Select a field for ORDER BY
   - Choose ASC (ascending) or DESC (descending)

5. **Execute Query**
   - Review the generated SOQL query
   - Click "Run Query"
   - View results in the output area

**[Screenshot: SOQL Query Results]**

#### Supported Operators:
| Operator | Description | Example |
|----------|-------------|---------|
| = | Equals | `Status = 'Active'` |
| != | Not equals | `Type != 'Prospect'` |
| > | Greater than | `Amount > 1000` |
| < | Less than | `CreatedDate < TODAY` |
| >= | Greater or equal | `Probability >= 50` |
| <= | Less or equal | `CloseDate <= THIS_MONTH` |
| LIKE | Pattern match | `Name LIKE 'Acme%'` |
| IN | In list | `Status IN ('New','Open')` |

---

### 4. Data Explorer

**Purpose:** Comprehensive data exploration tools including org management, user management, and record inspection.

The Data Explorer has four sub-tabs:

**[Screenshot: Data Explorer Tabs]**

#### 4.1 Sandbox & Favicon Manager

Visually distinguish between different Salesforce orgs by customizing browser tab favicons.

**[Screenshot: Sandbox Manager Interface]**

**Organization Info Panel:**
Displays current org details:
- Organization Name
- Organization ID
- Type (Production/Sandbox)
- Instance Name
- Language & Locale
- Timezone
- Created Date

**Custom Favicon Section:**

1. **Choose a Color**
   Select from preset colors:
   | Color | Suggested Use |
   |-------|---------------|
   | 🔴 Red (#ff6b6b) | Production |
   | 🟢 Green (#51cf66) | Development |
   | 🔵 Blue (#339af0) | UAT |
   | 🟡 Yellow (#fcc419) | QA |
   | 🟣 Purple (#9775fa) | Staging |
   | 🟠 Orange (#ff922b) | Hotfix |

2. **Add a Label**
   - Enter up to 3 characters (e.g., DEV, UAT, PRD)
   - Sandboxes auto-suggest "SBX"

3. **Preview**
   - See your favicon before applying

4. **Apply or Reset**
   - Click "Apply Favicon" to save
   - Click "Reset" to remove custom favicon

**[Screenshot: Favicon Preview and Color Selection]**

**Saved Favicons:**
- View all saved favicons across multiple orgs
- Current org shows "CURRENT" badge
- Delete individual favicons with the 🗑️ button

**[Screenshot: Saved Favicons List]**

#### 4.2 User Manager

View and manage Salesforce users directly from the extension.

**[Screenshot: User Manager Interface]**

**Current User Section:**
Displays your logged-in user information:
- Name and Active status
- Email address
- Profile name
- Role name
- Language locale
- Last login date

**User Search:**
1. Enter search term (name, username, or email)
2. Click "Search" or press Enter
3. View matching users with status indicators

**User Update (Admin Only):**
1. Select a user from search results
2. Modify:
   - Profile
   - Role
   - Language
3. Click "Update User" to save changes

**[Screenshot: User Search and Update]**

#### 4.3 Record Lookup

A unified interface combining auto-detection and manual search with recent history.

**[Screenshot: Record Lookup Interface]**

**Three-Panel Layout:**
1. **Current Page**: Auto-detects record from your current Salesforce URL
2. **Search by ID**: Manually look up any Salesforce Record ID
3. **Recent Records**: Quick access to last 5 viewed records

**How To Use:**
1. Navigate to any record page in Salesforce
2. Open the extension
3. Go to Explore → Record Lookup
4. View auto-detected record in Current Page panel
5. Or enter any ID in Search panel
6. Click Recent Records items to quickly re-search

**Features:**
- Object type badge (Account, Contact, etc.)
- Record ID with copy button
- Name/Title field
- Created By, Last Modified, Owner ID
- 🔗 Open Record button
- 📋 Copy Link button

**ID Validation:**
- Accepts 15-character IDs
- Accepts 18-character IDs
- Shows error for invalid formats

---

### 5. Platform Tools

**Purpose:** Advanced tools for monitoring and interacting with Salesforce Platform Events and Lightning Message Service.

**[Screenshot: Platform Tools Interface]**

#### 5.1 Platform Events

Monitor and publish Salesforce Platform Events in real-time.

**[Screenshot: Platform Events Tab]**

**Subscribing to Events:**

1. Open the Platform tab
2. View the list of available Platform Events
3. Click the **+** button next to an event to subscribe
4. The event will show a "listening" indicator when subscribed

**[Screenshot: Subscribed Event with Listening Indicator]**

**Viewing Events:**

1. Once subscribed, events appear in the log panel
2. Each event shows:
   - Timestamp
   - Event type badge (event/system/error)
   - Event message
   - Expandable details with full payload

**[Screenshot: Event Log with Entries]**

**Publishing Events:**

1. Subscribe to an event first
2. Click the **➤** (publish) button
3. A modal opens with:
   - Event name
   - Available fields
   - JSON payload editor
4. Edit the payload as needed
5. Click "Publish" to send the event

**[Screenshot: Publish Event Modal]**

**Log Controls:**
| Button | Function |
|--------|----------|
| 🔄 Refresh | Reload Platform Events list |
| ⏸ Pause | Pause event logging |
| ▶ Resume | Resume event logging |
| 📜 Auto-scroll | Toggle auto-scroll on/off |
| 🗑️ Clear | Clear the event log |
| Filter | Filter by event type (All/Events/Subscribe/Error/System) |

**Connection Status:**
- Green dot: Connected to Salesforce streaming
- Gray dot: Disconnected

#### 5.2 Lightning Message Service (LMS)

Monitor and interact with Lightning Message Channels.

**[Screenshot: LMS Tab]**

**How to Use:**

1. Click "Refresh" to load available message channels
2. Select a channel from the dropdown
3. A sample payload is auto-generated based on channel fields
4. Copy the payload or modify it for testing
5. Use the payload in your Lightning components

**Sample Payload Features:**
- Auto-generates based on channel field definitions
- Detects field types and provides appropriate sample values
- Editable for custom testing scenarios

---

### 6. Page Blinker *(New in v1.1.2)*

A convenient floating indicator that appears on Salesforce pages for quick access to the extension.

**[Screenshot: Page Blinker on Salesforce Page]**

#### Location
The blinker appears in the **top-right corner** of all Salesforce pages.

#### Appearance
- Salesforce blue gradient background
- "TF" icon with pulsing animation
- "TrackForcePro" label
- Close (×) button

#### Interactions

| Action | Result |
|--------|--------|
| **Single Click** | Opens TrackForcePro in a new browser tab (adjacent to current tab) |
| **Double Click** | Minimizes to just the "TF" icon (toggle to expand) |
| **Click ×** | Hides the blinker for current session |

#### Behavior
- **Session Storage**: Hidden/minimized state persists for the browser session
- **Page Reload**: Blinker reappears after page reload if it was closed
- **Salesforce Only**: Only appears on pages matching Salesforce domains

#### Supported Domains
- `*.salesforce.com`
- `*.force.com`
- `*.lightning.force.com`
- `*.salesforce-setup.com`
- `*.visualforce.com`

---

## 7. Window & Tab Modes

**Purpose:** Open TrackForcePro in a larger workspace—either as a browser tab or a standalone window.

**[Screenshot: Pop Button in Header]**

### Opening as a Browser Tab (Default)

The easiest way to get more screen space is to open TrackForcePro as a browser tab.

**How to Open:**
1. Click the extension icon to open the popup
2. **Single-click** the pop button (⧉) in the top-right header
3. TrackForcePro opens in a new tab adjacent to your current tab
4. The popup closes automatically

**[Screenshot: TrackForcePro in Browser Tab]**

**Benefits:**
- Integrates naturally with your browser workflow
- Uses standard browser tab navigation (Ctrl+Tab, Ctrl+W)
- Full screen space for query results and data
- Easy to find in your tab bar

### Opening as a Standalone Window

For multi-monitor setups or dedicated workspaces, open as a separate window.

**How to Open:**
1. Click the extension icon to open the popup
2. **Shift+click** the pop button (⧉) in the header
3. TrackForcePro opens in a new standalone window
4. The popup closes automatically

**[Screenshot: TrackForcePro Standalone Window]**

**Benefits:**
- Separate window you can move to another monitor
- Dynamic title shows org name: `[My Org] - TrackForcePro`
- Resizable and can be maximized
- Doesn't interfere with browser tab navigation

### Closing / Pop-In

**From a Tab:**
- Click the pop-in button (closes the tab)
- Or simply close the tab normally (Ctrl+W or click X)

**From Standalone Window:**
- Click the pop-in button → Opens as a tab and closes window
- Or close the window normally (closes without opening tab)

### Quick Reference

| From Mode | Action | Result |
|-----------|--------|--------|
| Popup | Single-click pop button | Opens as browser tab |
| Popup | Shift+click pop button | Opens as standalone window |
| Tab | Click pop button | Closes tab |
| Window | Click pop button | Opens as tab, closes window |

### Session & State Transfer

When opening in a new tab or window:
- ✅ Your Salesforce session is preserved
- ✅ Current query builder state is transferred
- ✅ Selected object and fields are maintained
- ✅ GraphQL/SOQL results stay available

**[Screenshot: State Transfer Example]**

---

## Settings

Customize TrackForcePro to match your workflow.

**[Screenshot: Settings Tab]**

### Tab Visibility

Control which tabs appear in the main navigation:

1. Open the Settings tab
2. Find "Tab Visibility" section
3. Toggle checkboxes to show/hide tabs:
   - ☑️ Checked = Tab visible
   - ☐ Unchecked = Tab hidden

**[Screenshot: Tab Visibility Settings]**

### SOQL Query Editor Settings

- **Show Object Selector**: Toggle the object dropdown visibility
- **Enable Query Builder**: Toggle the visual query builder

### GraphQL Query Editor Settings

- **Show Object Selector**: Toggle the object selection grid
- **Auto-format queries on load**: Automatically format queries for readability

### Tab Reordering

Drag and drop tabs to reorder them:

1. Click and hold on a tab
2. Drag to the desired position
3. Release to drop

Your tab order is saved automatically.

---

## Help & Support

### Getting Help

If you encounter issues or have questions:

1. **Check This Guide**: Most common questions are answered here
2. **Troubleshooting Section**: See common problems and solutions below
3. **Console Logs**: Right-click the extension popup → Inspect → Console tab for error details

### Reporting Issues

When reporting a problem, please include:
- Chrome version (chrome://version)
- Extension version (1.1.1)
- Salesforce edition (Production/Sandbox)
- Steps to reproduce the issue
- Console error messages (if any)

### Feature Requests

We welcome suggestions for new features! When submitting:
- Describe the feature
- Explain the use case
- Provide examples if possible

---

## About TrackForcePro

### Version Information

| Item | Value |
|------|-------|
| Version | 1.1.1 |
| Release Date | February 2026 |
| Platform | Chrome Extension (Manifest V3) |

### What's New in 1.1.1

- **Improved Help System**: All documentation now links to hosted HTML pages instead of GitHub markdown
- **Streamlined Documentation**: Removed direct GitHub links (except for issue reporting)
- **Better User Experience**: Cleaner help tab with organized resources

### What's New in 1.1.0

- **Tab Mode**: Single-click pop button to open as browser tab (adjacent to current tab)
- **Window Mode**: Shift+click to open as standalone window (existing behavior)
- **Pop-in to Tab**: From standalone window, pop-in now opens as a tab instead of just closing
- **Improved State Transfer**: Session and builder state preserved when switching modes

### What's New in 1.0.1

- **Sandbox & Favicon Manager**: Customize browser favicons per org
- **Enhanced User Manager**: Search and update users
- **Improved Platform Events**: Better error handling and reconnection
- **Bug Fixes**: Various stability improvements

### Supported Salesforce Editions

TrackForcePro works with:
- Salesforce Lightning Experience
- Salesforce Classic
- All Salesforce editions with API access

### Permissions Explained

| Permission | Why It's Needed |
|------------|-----------------|
| tabs | Detect active Salesforce tabs |
| cookies | Access Salesforce session |
| storage | Save your preferences |
| scripting | Inject favicon changes |
| host_permissions | Communicate with Salesforce APIs |

### Privacy & Security

- **No External Servers**: All data stays between your browser and Salesforce
- **No Data Collection**: We don't collect or transmit your data
- **Secure Communication**: All API calls use HTTPS
- **Session Handling**: Uses your existing Salesforce authentication

---

## Troubleshooting

### Common Issues and Solutions

#### "Not Connected" Error

**Problem:** Extension shows "Not Connected" message

**Solutions:**
1. Open a new tab and log into Salesforce
2. Make sure the Salesforce tab stays open
3. Refresh the Salesforce page
4. Close and reopen the extension
5. Check if your session has expired—log in again if needed

#### Objects Not Loading

**Problem:** Object list shows "Loading..." indefinitely

**Solutions:**
1. Check your internet connection
2. Verify you're logged into Salesforce
3. Click "Refresh Objects" button
4. Check the browser console for errors (F12 → Console)

#### Query Execution Failed

**Problem:** Running a query shows an error

**Solutions:**
1. Verify you have permission to query the object
2. Check field-level security for selected fields
3. Ensure filter values are formatted correctly
4. Try a simpler query first

#### Favicon Not Appearing

**Problem:** Custom favicon doesn't show on Salesforce tab

**Solutions:**
1. Refresh the Salesforce page after applying
2. Try closing and reopening the Salesforce tab
3. Check if another extension is overriding favicons
4. Verify the favicon was saved (check Saved Favicons list)

#### Platform Events Not Connecting

**Problem:** Cannot subscribe to Platform Events

**Solutions:**
1. Ensure you have Platform Events enabled in your org
2. Check that you have "API Enabled" permission
3. Verify there are custom Platform Events defined
4. Refresh the page and try again

#### Extension Not Working After Chrome Update

**Problem:** Extension stops working after browser update

**Solutions:**
1. Go to `chrome://extensions/`
2. Find TrackForcePro
3. Click "Update" if available
4. If no update, remove and reinstall the extension

### Error Messages Reference

| Error | Meaning | Solution |
|-------|---------|----------|
| "No access token" | Session expired | Log into Salesforce again |
| "Invalid ID length" | Wrong ID format | Use 15 or 18 character ID |
| "Handshake failed" | Streaming connection issue | Refresh and reconnect |
| "Could not determine org" | Session detection failed | Refresh Salesforce tab |

---

## Keyboard Shortcuts

### General

| Action | Windows/Linux | Mac |
|--------|---------------|-----|
| Copy | Ctrl+C | Cmd+C |
| Paste | Ctrl+V | Cmd+V |
| Select All | Ctrl+A | Cmd+A |
| Find | Ctrl+F | Cmd+F |

### Query Editors

| Action | Description |
|--------|-------------|
| Enter (in search) | Execute search |
| Tab | Move to next field |
| Shift+Tab | Move to previous field |

### Window & Tab Actions

| Action | Description |
|--------|-------------|
| Click pop button | Open as browser tab |
| Shift+click pop button | Open as standalone window |

---

## Quick Reference Card

### Main Tabs

| Tab | Purpose | Key Actions |
|-----|---------|-------------|
| Audit | Extract field metadata | Download CSV, Copy to Clipboard |
| GraphQL | Build GraphQL queries | Select object, add fields, run query |
| SOQL | Build SOQL queries | Select object, add filters, execute |
| Explore | Data exploration | Manage favicons, search users/records |
| Platform | Monitor events | Subscribe, publish, view logs |
| Settings | Customize extension | Toggle tabs, configure editors |

### Data Explorer Sub-Tabs

| Sub-Tab | Purpose |
|---------|---------|
| Sandbox Manager | Org info & favicon customization |
| User Manager | View/search/update users |
| Record Lookup | Auto-detect, search, & history |

### Status Indicators

| Indicator | Meaning |
|-----------|---------|
| 🟢 Green | Connected/Active/Success |
| 🔴 Red | Error/Disconnected |
| 🟡 Yellow | Warning/Sandbox |
| ⏳ Loading | Processing |

---

## Glossary

| Term | Definition |
|------|------------|
| API Name | Technical identifier for Salesforce fields/objects |
| GraphQL | Query language for APIs (used by Salesforce UI API) |
| SOQL | Salesforce Object Query Language |
| Platform Event | Salesforce's event-driven messaging system |
| LMS | Lightning Message Service for component communication |
| Sandbox | Non-production Salesforce environment |
| Favicon | Small icon shown in browser tabs |
| Org | Salesforce organization/instance |

---

**Thank you for using TrackForcePro!**

*For the latest updates and documentation, visit our website.*

---

*Document Version: 1.1.1*
*Last Updated: February 8, 2026*

