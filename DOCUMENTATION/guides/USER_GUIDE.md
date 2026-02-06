# SF Audit Extractor - User Guide

## Introduction
The SF Audit Extractor is a powerful Chrome extension designed for Salesforce Administrators and Developers. It streamlines the process of auditing fields, building GraphQL/SOQL queries, and inspecting object schemas directly from your browser.

## Table of Contents
1. [Installation](#installation)
2. [Interface Overview](#interface-overview)
3. [Features](#features)
   - [Audit Extractor](#audit-extractor)
   - [GraphQL Builder](#graphql-builder)
   - [SOQL Builder](#soql-builder)
4. [Tips & Tricks](#tips--tricks)

---

## Installation

1.  **Download Source**: Get the source code for the extension.
2.  **Open Chrome Extensions**: Go to `chrome://extensions/`.
3.  **Enable Developer Mode**: Toggle the switch in the top right.
4.  **Load Unpacked**: Click "Load unpacked" and select the extension folder.

---

## Interface Overview

The extension popup has a tabbed interface with three main modes:

1.  **Audit**: For extracting field details from Setup (Object Manager) pages.
2.  **GraphQL**: A visual builder for crafting GraphQL queries against the UI API.
3.  **SOQL**: A visual builder relative for SOQL queries.

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

---

## Tips & Tricks

- **Performance**: The extension caches object schemas for 5 minutes. If you add a new field in Salesforce, wait 5 minutes or use "Refresh Objects".
- **Keyboard Shortcuts**: Use standard text editing shortcuts (Ctrl+C/V) in the Query editor.
- **Manual Mode**: If the visual builder is too limiting, just toggle it "Off" and write your own query code. The "Run" button still works!

