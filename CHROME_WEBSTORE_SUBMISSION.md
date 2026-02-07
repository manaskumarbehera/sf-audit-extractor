# TrackForcePro - Chrome Web Store Submission Details

This document contains all the information needed to submit TrackForcePro to the Chrome Web Store.

---

## 📋 STORE LISTING DETAILS

### Extension Name
```
TrackForcePro - Salesforce Admin & Developer Toolkit
```

### Short Description (132 characters max)
```
Powerful Salesforce toolkit: Audit extractor, SOQL/GraphQL builders, Platform Events monitor, Data Explorer & User Management tools.
```

### Detailed Description (up to 16,000 characters)

```
TrackForcePro is the ultimate productivity toolkit for Salesforce Administrators and Developers. Access powerful audit, query building, data exploration, and monitoring tools directly from your browser.

🔧 KEY FEATURES

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📊 AUDIT TRAIL EXTRACTOR
• Extract and export Salesforce Setup Audit Trail logs
• Search and filter audit entries by category
• Export audit data to CSV for compliance reporting
• Track user management, security, and object changes

🔍 SOQL QUERY BUILDER
• Visual query builder with field selection
• Add filters with multiple operators (=, !=, >, <, LIKE, IN)
• Set ORDER BY and LIMIT clauses
• Real-time query preview
• Execute queries and view results instantly
• Built-in SOQL guidance and suggestions

📡 GRAPHQL QUERY BUILDER
• Browse and select Salesforce objects visually
• Progressive disclosure UI for easy query building
• Select fields, add filters, configure pagination
• View live query preview with Variables and Endpoint tabs
• Execute queries against Salesforce UI API
• Support for cursor-based pagination

🗃️ DATA EXPLORER
• Sandbox & Favicon Manager: Customize browser tab icons to identify different orgs
• User Manager: View current user, search users, update profiles/roles
• Current Record: Auto-detect and display record details from URL
• Record Search: Look up any Salesforce ID to identify object type

⚡ PLATFORM EVENTS MONITOR
• Subscribe to Platform Events in real-time
• View event logs with timestamps and payloads
• Publish custom Platform Events
• Filter events by type (Events/System/Error)
• Auto-scroll and pause/resume controls

📬 LIGHTNING MESSAGE SERVICE (LMS)
• Browse available message channels
• Auto-generate sample payloads
• Monitor and test LMS communications

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

✨ ADDITIONAL FEATURES

• Pop-out Window: Open extension in a standalone window
• API Version Selector: Choose your preferred Salesforce API version
• Customizable Interface: Show/hide tabs based on your needs
• Real-time Connection Status: See when you're connected to Salesforce
• Dark/Light Theme Support: Matches your browser preferences

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

🚀 GETTING STARTED

1. Install the extension
2. Navigate to your Salesforce org and log in
3. Click the TrackForcePro icon in your toolbar
4. The extension auto-detects your Salesforce session
5. Start using any of the powerful tools!

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

🔒 PRIVACY & SECURITY

• No data is stored on external servers
• All operations happen locally in your browser
• Only connects to Salesforce domains you're logged into
• Requires active Salesforce session to function

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

👨‍💻 PERFECT FOR:

• Salesforce Administrators managing org configurations
• Salesforce Developers building and testing integrations
• DevOps teams monitoring Platform Events
• QA Teams testing data and configurations
• Anyone who works with Salesforce daily

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📧 SUPPORT

Questions or feedback? Connect with the developer on LinkedIn.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Boost your Salesforce productivity today with TrackForcePro!
```

---

## 🏷️ CATEGORY

**Primary Category:** `Productivity`

**Additional Category:** `Developer Tools`

---

## 🔑 PERMISSIONS JUSTIFICATION

When submitting, you'll need to justify each permission:

| Permission | Justification |
|------------|---------------|
| `tabs` | Required to detect active Salesforce tabs and retrieve the current URL for context-aware features like Current Record detection and org identification. |
| `cookies` | Required to access Salesforce session cookies for authentication. The extension uses the existing Salesforce session to make API calls. No cookies are stored externally. |
| `storage` | Required to save user preferences (settings, custom favicons, saved queries) locally in the browser. No data is sent to external servers. |
| `declarativeContent` | Required to show the extension action only on Salesforce domains, providing a better user experience. |
| `scripting` | Required to inject content scripts that detect the current Salesforce page context and enable features like audit extraction and favicon customization. |

### Host Permissions Justification

| Host Permission | Justification |
|-----------------|---------------|
| `https://*.salesforce.com/*` | Required to access Salesforce Classic and Setup pages for audit extraction and API calls. |
| `https://*.force.com/*` | Required to access Salesforce Lightning Experience and custom domains for full functionality. |
| `https://*.salesforce-setup.com/*` | Required to access Salesforce Setup domains for configuration and audit features. |

---

## 🖼️ SCREENSHOTS (Required: 1-5 screenshots)

You need to provide screenshots in these dimensions:
- **Size:** 1280x800 or 640x400 pixels
- **Format:** PNG or JPEG

### Recommended Screenshots:

1. **Main Dashboard / Audit Trails Tab**
   - Show the main interface with audit logs loaded
   - Filename: `screenshot_1_audit_trails.png`

2. **SOQL Query Builder**
   - Show the query builder with fields selected and query preview
   - Filename: `screenshot_2_soql_builder.png`

3. **GraphQL Query Builder**
   - Show the object selection or query building interface
   - Filename: `screenshot_3_graphql_builder.png`

4. **Data Explorer - Sandbox Manager**
   - Show the favicon customization and org info
   - Filename: `screenshot_4_data_explorer.png`

5. **Platform Events Monitor**
   - Show the event subscription and log view
   - Filename: `screenshot_5_platform_events.png`

---

## 🎨 PROMOTIONAL IMAGES (Optional but recommended)

### Small Promo Tile (Required if featured)
- **Size:** 440x280 pixels
- **Format:** PNG or JPEG

### Marquee Promo Tile (Optional)
- **Size:** 1400x560 pixels
- **Format:** PNG or JPEG

---

## 🔗 ADDITIONAL STORE LISTING FIELDS

### Website (optional)
```
https://github.com/manaskumarbehera/trackforcepro-docs
```

### Support URL (optional)
```
https://github.com/manaskumarbehera/trackforcepro-docs/issues
```

### Privacy Policy URL (Required for extensions with host permissions)

**Use this URL after enabling GitHub Pages:**
```
https://manaskumarbehera.github.io/trackforcepro-docs/privacy-policy.html
```

**Alternative (works immediately without setup):**
```
https://htmlpreview.github.io/?https://github.com/manaskumarbehera/trackforcepro-docs/blob/main/privacy-policy.html
```

> **To enable GitHub Pages:**
> 1. Go to your repository Settings → Pages
> 2. Set Source to "Deploy from a branch"
> 3. Select "main" branch and "/ (root)" folder
> 4. Click Save and wait 2-3 minutes for deployment

---

## 📝 SINGLE PURPOSE DESCRIPTION

Chrome requires a clear statement of the extension's single purpose:

```
This extension provides Salesforce administrators and developers with tools to extract audit trails, build and execute SOQL/GraphQL queries, monitor Platform Events, and explore Salesforce data directly from the browser.
```

---

## 🏢 DEVELOPER INFORMATION

### Developer Name
```
Manas Kumar Behera
```

### Developer Email
(Your email address for Chrome Web Store communications)

### Verified Publisher (Optional)
Consider verifying your domain if you have a website.

---

## ✅ PRE-SUBMISSION CHECKLIST

- [ ] ZIP file created with `./build.sh`
- [ ] All icons present (16x16, 32x32, 48x48, 128x128 PNG)
- [ ] manifest.json version matches your release (currently 1.0.1)
- [ ] Screenshots taken (1280x800 or 640x400)
- [ ] Privacy policy hosted online
- [ ] Extension tested in Chrome
- [ ] All features working correctly

---

## 💰 PRICING

**Recommended:** Free

---

## 🌍 DISTRIBUTION

**Recommended:** All regions

**Language:** English (add more translations later if needed)

---

## 📊 ANALYTICS

Enable Chrome Web Store analytics to track:
- Impressions
- Installs
- Uninstalls
- Weekly users

---

## Notes for Submission

1. **Review Time:** Initial reviews typically take 1-3 business days
2. **Rejections:** If rejected, you'll receive specific feedback to address
3. **Updates:** Future updates go through the same review process
4. **Version Bumps:** Update `manifest.json` version for each new submission

