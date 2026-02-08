# TrackForcePro - User Guide

## Introduction
TrackForcePro is a powerful Chrome extension designed for Salesforce Administrators and Developers. It streamlines the process of auditing fields, building GraphQL/SOQL queries, inspecting object schemas, managing sandbox identities, and exploring data directly from your browser.

## Table of Contents
1. [Installation](#installation)
2. [Interface Overview](#interface-overview)
3. [Features](#features)
   - [Audit Extractor](#audit-extractor)
   - [GraphQL Builder](#graphql-builder)
   - [SOQL Builder](#soql-builder)
   - [Data Explorer](#data-explorer)
     - [Sandbox & Favicon Manager](#sandbox--favicon-manager)
     - [User Manager](#user-manager)
     - [Current Record](#current-record)
     - [Record Search](#record-search)
   - [Platform Tools](#platform-tools)
4. [Settings & Customization](#settings--customization)
5. [Tips & Tricks](#tips--tricks)

---

## Installation

1.  **Download Source**: Get the source code for the extension.
2.  **Open Chrome Extensions**: Go to `chrome://extensions/`.
3.  **Enable Developer Mode**: Toggle the switch in the top right.
4.  **Load Unpacked**: Click "Load unpacked" and select the extension folder.

---

## Interface Overview

The extension popup has a tabbed interface with several main modes:

1.  **Audit**: For extracting field details from Setup (Object Manager) pages.
2.  **GraphQL**: A visual builder for crafting GraphQL queries against the UI API.
3.  **SOQL**: A visual builder for SOQL queries with field selection and filtering.
4.  **Explore**: Multi-purpose data exploration with Sandbox Manager, User Manager, Current Record, and Record Search tools.
5.  **Platform**: Tools for Platform Events and Lightning Message Channels.

### Connection Status
The extension automatically detects your Salesforce session. If you see a "Not Connected" message, ensure you:
- Are logged into a Salesforce org in an active browser tab
- Have the Salesforce tab open (not just the extension popup)

---

## Features

### Audit Extractor
*Usage Context: Salesforce Setup > Object Manager > Fields & Relationships*

When you are on a "Fields & Relationships" page in Salesforce Setup, use this tab to:
- **Download CSV**: Exports all field metadata (API Name, Label, Type, etc.) to a CSV file.
- **Copy to Clipboard**: Copies the list for quick pasting into Excel or Sheets.

### GraphQL Builder
*Usage Context: Any Salesforce page*

The GraphQL Builder uses a "Progressive Disclosure" UI to guide you through query creation.

**Step 1: Object Selection**
- Search for an object (e.g., "Account", "Opportunity").
- Select a card to initialize the builder.
- *Note*: You can click "Refresh Objects" if your object isn't listed.

**Step 2: Query Composition (Builder Mode)**
- **Fields**: Check the boxes for fields you want to retrieve. `Id` is selected by default.
- **Filters**: Add conditions (e.g., `Name LIKE 'Acme%'`).
- **Pagination**: Set limit and offset.
- **Toggle Builder**: Uncheck the "Builder" box at the top to hide the visual panel and edit the query manually.

**Step 3: Tabs (Query / Variables / Endpoint)**
- **Query**: Shows the generated GraphQL. You can manually edit this if the builder is disabled or if you need advanced features.
- **Variables**: Edit JSON variables if your query uses them.
- **Endpoint**: View technical details about the request URL and body size.

**Step 4: Results**
- Click **Run Query**.
- View results in the collapsible JSON viewer.
- Use **Pagination** controls at the bottom to load more records.

### SOQL Builder
*Usage Context: Any Salesforce page*

Similar to GraphQL, but for standard SOQL.
- Select Object.
- Check fields.
- Add Filters / Order By.
- View generated SOQL query.
- Execute and view results.

### Data Explorer
*Usage Context: Any Salesforce page*

The Data Explorer provides quick access to context-aware information and powerful productivity tools through four specialized sub-tabs.

#### Sandbox & Favicon Manager
Visually distinguish between different Salesforce orgs (Production, Sandbox, UAT, etc.) by customizing the browser tab favicon.

**Organization Info:**
- View current org details: Name, ID, Type, Instance, Language, Locale, Timezone
- See Sandbox vs Production status with color-coded badges
- View trial expiration date (if applicable)

**Custom Favicon:**
1. **Choose a Color**: Select from preset colors or use the color picker:
   - 🔴 Red - Production
   - 🟢 Green - Dev
   - 🔵 Blue - UAT
   - 🟡 Yellow - QA
   - 🟣 Purple - Staging
   - 🟠 Orange - Hotfix
2. **Add a Label**: Enter up to 3 characters (e.g., "DEV", "UAT", "PRD")
   - Sandboxes auto-suggest "SBX" label
3. **Preview**: See the favicon preview before applying
4. **Apply**: Click "Apply Favicon" to save and immediately update the browser tab icon
5. **Reset**: Remove the custom favicon for the current org

**Saved Favicons:**
- View all saved favicons across multiple orgs
- Current org is highlighted with a "CURRENT" badge
- Delete individual favicons without affecting others
- Favicons persist across browser sessions

**Edit Mode:**
- When you return to an org with a saved favicon, the form automatically loads existing settings
- An "✓ Editing existing favicon" indicator shows you're in edit mode
- Changes update the existing favicon rather than creating a new one

#### User Manager
View and manage Salesforce users directly from the extension.

**Current User Section:**
- View your logged-in user details:
  - Name and Active status
  - Email address
  - Profile name
  - Role name
  - Language locale
  - Last login date
- Click "Refresh" to reload user information

**User Search:**
1. Enter a search term (name, username, or email)
2. Click "Search" or press Enter
3. Results show:
   - User name with active/inactive status (✓/✗)
   - Email address
   - Select button to choose a user

**User Update:**
After selecting a user, you can update:
- **Profile**: Change the user's profile
- **Role**: Assign or change the user's role
- **Language**: Change the user's language locale

*Note: Requires appropriate admin permissions to update users.*

#### Current Record
Automatically detects and displays information about the Salesforce record you're viewing.

**How it works:**
- Extracts Record ID from Lightning URLs (e.g., `/lightning/r/Account/001xxx/view`)
- Extracts Record ID from query parameters (e.g., `?id=001xxx`)
- Validates 15 or 18 character Salesforce IDs

**Information displayed:**
- Object type (Account, Contact, Opportunity, etc.)
- Record ID
- Name/Subject/Title field (when available)
- Created By
- Last Modified Date

**Usage:**
1. Navigate to any record page in Salesforce
2. Open the extension
3. Go to Explore > Current Record
4. Record details load automatically

#### Record Search
Quickly identify any Salesforce Record ID and retrieve its details.

**Usage:**
1. Enter a 15 or 18 character Salesforce Record ID
2. Click "Search" or press Enter
3. View the record details:
   - Object type
   - Record ID
   - Name/identifier field
   - Created By
   - Last Modified Date

**ID Validation:**
- Accepts both 15-character and 18-character IDs
- Validates ID format before searching
- Shows helpful error messages for invalid IDs

### Platform Tools
*Usage Context: Development and Debugging*

This section includes advanced tools for event-driven architecture and messaging.

**Platform Event Audit Trail**
- **Monitor Events**: Subscribe to standard or custom Platform Events.
- **Real-time Stream**: View event payloads (JSON) as they occur in the org.
- **Replay**: Configure replay options (e.g., -1 for new events, -2 for all available).

**LMS (Lightning Message Service)**
- **Audit**: Monitor Lightning Message Channels.
- **Publish**: Send test payloads to a specific message channel.
- **Subscribe**: Listen to a channel and see what messages are being sent.

### Popout Window (Standalone Mode)
*Usage Context: Multi-monitor setups or dedicated workspace*

The extension offers flexible modes for opening TrackForcePro outside the popup:

#### Open as Browser Tab (Default - Single Click)
Click the pop button in the header to open TrackForcePro as a new browser tab.
- **Tab Position**: Opens adjacent to the current tab for easy access
- **Session Transfer**: Your authentication session is automatically transferred
- **Full Features**: All extension features work identically in tab mode
- **Easy Close**: Click the pop-in button to close the tab

#### Open as Standalone Window (Shift+Click)
Hold Shift and click the pop button to open in a separate popup window.
- **Dynamic Title**: The window title updates to `[Org Name] - TrackForcePro`, making it easy to identify which Salesforce org you are working with when using Alt-Tab or checking the taskbar.
- **Session Transfer**: Your authentication session is automatically transferred to the new window.
- **Resizable Window**: The window opens with a default size but can be resized as needed.
- **Pop-in to Tab**: When you click pop-in from the standalone window, it opens as a tab instead of just closing.

#### Button Tooltips by Mode
| Current Mode | Tooltip |
|--------------|---------|
| Popup | "Open as tab (Shift+click for window)" |
| Tab | "Close tab" |
| Standalone Window | "Pop in (open as tab)" |

---

## Settings & Customization

You can personalize the extension interface to focus on the tools you use most.

### Hiding and Unhiding Features
If the interface feels too cluttered, you can hide tabs you do not use.

1.  **Open Settings**: Click the **Settings** tab in the extension header.
2.  **Locate Feature List**: Find the list of available modules (Audit, GraphQL, SOQL, Data Explorer, Platform Tools).
3.  **Toggle Visibility**:
    - Click the toggle switch next to a feature name.
    - **Green/On**: The tab will be visible in the main navigation.
    - **Gray/Off**: The tab will be hidden.
4.  **Save**: Changes are applied immediately.

---

## Tips & Tricks

### General
- **Performance**: The extension caches object schemas for 5 minutes. If you add a new field in Salesforce, wait 5 minutes or use "Refresh Objects".
- **Keyboard Shortcuts**: Use standard text editing shortcuts (Ctrl+C/V on Windows, Cmd+C/V on Mac) in query editors.
- **Manual Mode**: If the visual builder is too limiting, toggle it "Off" and write your own query code. The "Run" button still works!

### Data Explorer
- **Multi-Org Favicon Management**: Save different favicons for each org you work with. They persist across browser sessions.
- **Quick Org Identification**: Use short labels (DEV, UAT, PRD) with distinct colors to instantly identify which org you're in.
- **Edit Existing Favicons**: When you return to an org, your saved settings are automatically loaded for easy editing.
- **Saved Favicons List**: Review and manage all your saved org favicons from the "Saved Favicons" section.

### User Management
- **Search Flexibility**: Search users by name, username, or email address.
- **Bulk User Updates**: Select users from search results to quickly update their profile, role, or language.

### Record Tools
- **Quick Record ID Lookup**: Paste any Salesforce ID to instantly identify the object type and basic details.
- **Current Record Auto-Detection**: Navigate to a record page and the extension automatically extracts and displays record information.

### Troubleshooting
- **"Not Connected" Error**: Ensure you're logged into Salesforce in an active browser tab.
- **Extension Pages**: The extension cannot read data from `chrome-extension://` URLs - switch to a Salesforce tab.
- **Favicon Not Showing**: Refresh the Salesforce page after applying a favicon. Some pages require a refresh for the icon to appear.
