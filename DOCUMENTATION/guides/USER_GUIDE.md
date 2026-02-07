# TrackForcePro - User Guide

## Introduction
TrackForcePro is a powerful Chrome extension designed for Salesforce Administrators and Developers. It streamlines the process of auditing fields, building GraphQL/SOQL queries, and inspecting object schemas directly from your browser.

## Table of Contents
1. [Installation](#installation)
2. [Interface Overview](#interface-overview)
3. [Features](#features)
   - [Audit Extractor](#audit-extractor)
   - [GraphQL Builder](#graphql-builder)
   - [SOQL Builder](#soql-builder)
   - [Data Explorer](#data-explorer)
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
3.  **SOQL**: A visual builder relative for SOQL queries.
4.  **Explore**: Context-aware data and user details.
5.  **Platform**: Tools for Events and Message Channels.

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

The Data Explorer provides quick access to context-aware information and productivity tools.

**Tabs:**
1.  **Current User**: View details about the currently logged-in user (Name, Username, Email, Profile, Role, Locale).
2.  **Current Record**: Automatically detects if you are viewing a record in Salesforce (by URL ID) and displays available details.
3.  **Search Record**: Quickly identify any Salesforce Record ID (15 or 18 chars) to see what object it belongs to and basic name fields.

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

Click the "Pop out window" icon in the header to open the extension in a separate, full-screen window.
- **Dynamic Title**: The window title updates to `[Org Name] - TrackForcePro`, making it easy to identify which Salesforce org you are working with when using Alt-Tab or checking the taskbar.
- **Session Transfer**: Your authentication session is automatically transferred to the new window.
- **Maximized View**: The window opens in maximized mode for a better view of large data sets or query results.

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

- **Performance**: The extension caches object schemas for 5 minutes. If you add a new field in Salesforce, wait 5 minutes or use "Refresh Objects".
- **Keyboard Shortcuts**: Use standard text editing shortcuts (Ctrl+C/V) in the Query editor.
- **Manual Mode**: If the visual builder is too limiting, just toggle it "Off" and write your own query code. The "Run" button still works!
