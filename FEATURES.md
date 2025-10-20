# Features Overview

## Main Features

### 1. **Simple Installation**
- No complex setup or configuration
- Load directly from Chrome extensions page
- Works immediately after installation

### 2. **Automatic Session Detection**
- Detects when you're on a Salesforce page
- Automatically reads session via secure cookie access (no OAuth)
- No manual token entry required

### 3. **6-Month Historical Data**
- Automatically fetches last 6 months of audit trail
- Includes setup changes and modifications
- Uses official Salesforce REST API

### 4. **Smart Categorization**
Automatically groups audit logs into three main categories:

#### User Management
- User creation, modification, deletion
- Profile changes
- Permission set updates
- Role hierarchy changes
- Public group modifications

#### Security
- Password policy changes
- Login settings modifications
- Certificate management
- Session settings
- Authentication provider changes

#### Object Changes
- Custom object creation/modification
- Custom field changes
- Page layouts updates
- Validation rules
- Workflow rules and triggers
- Apex class/trigger changes

### 5. **Powerful Search**
- Real-time search across all fields
- Search by:
  - Action name
  - Section
  - User name
  - Details/Display text
- Case-insensitive matching
- Instant results

### 6. **Category Filtering**
- Filter logs by specific category
- Combine with search for precise results
- Quick category dropdown

### 7. **Statistics Dashboard**
- Total log count
- Count by category
- Real-time updates
- Visual summary

### 8. **Data Export**
- Export filtered audit results to CSV
- Properly formatted for Excel/Sheets
- One-click download

### 9. **Multi-Tool UI (New)**
- Platform Events viewer with subscribe/unsubscribe, structured event log, pause/clear/filter/auto-scroll, and optional pin window
- Lightning Message Service (LMS) channel browser with sample payload generator and copy
- SOQL Builder with Tooling toggle, LIMIT control, basic schema sidebar and suggestions, export to CSV/JSON/Excel
- GraphQL runner (e.g., UI API) with variables input
- Current Record utility to detect/fetch by record Id

### 10. **Privacy & Security**
- All processing happens locally
- No external servers
- Session-based authentication
- Read-only operations

## User Interface

### Header
- Tabs for tools: Audit Trails, Platform Events, LMS, SOQL Builder, GraphQL, Current Record
- Connection status indicator with visual dot
- Pin button for Platform Events window

### Control Panels
- Audit Trails: Refresh, Export CSV, Search, Category filter, Stats
- Platform Events: Refresh list, per-event Subscribe/Unsubscribe, log toolbar (pause/clear/filter/auto-scroll)
- LMS: Refresh channels, channel selection, sample payload area with copy button
- SOQL: Run, LIMIT, Tooling toggle, export (CSV/JSON/Excel), schema sidebar, suggestions
- GraphQL: Query and Variables editors, Run button
- Record: Detect from URL, Fetch by Id

### Logs and Views
- Audit items with action, category badge, section, user, details, timestamp
- Platform Events structured log entries with copyable JSON
- SOQL results table with sortable headers and filters

## Technical Capabilities

### API Integration
- Salesforce REST API v65.0 (queries, audit trail)
- Salesforce Tooling API v65.0 (LMS metadata, Tooling queries)
- Streaming via Bayeux/CometD for Platform Events

### Supported Audit Fields
- Id, Action, Section, CreatedDate, CreatedBy.Name
- Display (details), DelegateUser (if applicable)

### Performance
- Efficient client-side filtering
- Minimal API calls with pagination handling
- Smooth UI updates

### Compatibility
- Chrome 88+ (and Chromium-based: Edge, Brave)
- Works in Lightning and Classic
- Supports My Domain

## Use Cases

### Compliance & Audit
- Track who made what changes
- Export for compliance reports
- Monitor security-related changes

### Troubleshooting
- Find recent changes that might have caused issues
- Search for specific modifications

### Development
- Track object/field changes
- Explore Platform Events
- Test LMS channels and payload shapes
- Inspect data with SOQL/GraphQL

## Planned Enhancements

Future versions may include:
- Date range selection for Audit Trails
- Advanced filtering options
- Saved search preferences
- Trend charts and visualizations
- Change comparison
- Email notifications
- Integration with CI/CD tools

## Limitations

### Current Limitations
- Requires "View Setup and Configuration" permission for Audit Trails
- Depends on API access
- Audit Trails limited to 6 months (Salesforce limitation)
- Platform Events require appropriate permissions and subscriptions

### Known Issues
- Session extraction may vary with custom domain setups
- API rate limits apply per Salesforce policies

## Support Matrix

| Feature | Status |
|---------|--------|
| Salesforce Classic | ✅ Supported |
| Salesforce Lightning | ✅ Supported |
| My Domain | ✅ Supported |
| Standard Domain | ✅ Supported |
| Production Orgs | ✅ Supported |
| Sandbox Orgs | ✅ Supported |
| Developer Orgs | ✅ Supported |
| Scratch Orgs | ✅ Supported |
| Offline Mode | ❌ Not Supported |
| Mobile | ❌ Not Supported |

## Getting Help

For issues, questions, or feature requests:
1. Check the [README.md](README.md)
2. Review [INSTALLATION.md](INSTALLATION.md)
3. Read [DEVELOPMENT.md](DEVELOPMENT.md) for technical details
4. Open an issue on GitHub
