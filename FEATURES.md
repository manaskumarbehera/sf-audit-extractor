# Features Overview

## Main Features

### 1. **Simple Installation**
- No complex setup or configuration
- Load directly from Chrome extensions page
- Works immediately after installation

### 2. **Automatic Session Detection**
- Detects when you're on a Salesforce page
- Automatically extracts session information
- No manual token entry required

### 3. **6-Month Historical Data**
- Automatically fetches last 6 months of audit trail
- Includes all setup changes and modifications
- Uses official Salesforce Tooling API

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
- Combined with search for precise results
- Quick category dropdown
- Shows filtered count

### 7. **Statistics Dashboard**
- Total log count
- Count by category
- Real-time updates
- Visual summary

### 8. **CSV Export**
- Export filtered results to CSV
- Includes all log details
- Properly formatted for Excel/Sheets
- One-click download

### 9. **Clean UI**
- Modern, intuitive interface
- Salesforce-inspired blue theme
- Responsive design
- Clear visual hierarchy
- Easy-to-read logs

### 10. **Privacy & Security**
- All processing happens locally
- No external servers
- No data collection
- Session-based authentication
- Read-only operations

## User Interface

### Header
- Extension title
- Connection status indicator
- Visual status dot (red=disconnected, green=connected)

### Control Panel
- **Fetch Data Button**: Retrieve audit trail logs
- **Export CSV Button**: Download filtered data

### Search & Filter Section
- **Search Input**: Real-time text search
- **Category Dropdown**: Filter by category

### Statistics Panel
- Total count
- User Management count
- Security count
- Object Changes count

### Logs Display
Each log entry shows:
- **Action**: What was changed
- **Category Badge**: Color-coded category
- **Section**: Where the change was made
- **User**: Who made the change
- **Details**: Additional information
- **Delegate User**: If applicable
- **Timestamp**: When the change occurred

## Technical Capabilities

### API Integration
- Uses Salesforce Tooling API v58.0
- Queries SetupAuditTrail object
- Supports both Lightning and Classic
- Works with My Domain

### Supported Fields
- Id
- Action
- Section
- CreatedDate
- CreatedBy.Name
- Display
- DelegateUser

### Performance
- Efficient client-side filtering
- Minimal API calls
- Fast search and categorization
- Smooth UI updates

### Compatibility
- Chrome 88+
- Microsoft Edge
- Brave
- Other Chromium-based browsers
- All Salesforce editions

## Use Cases

### Compliance & Audit
- Track who made what changes
- Export for compliance reports
- Monitor security-related changes
- Review user management activities

### Troubleshooting
- Find recent changes that might have caused issues
- Search for specific modifications
- Track workflow and trigger updates
- Review permission changes

### Documentation
- Document configuration changes
- Create change logs
- Track deployment history
- Record administrative activities

### Security Monitoring
- Monitor password policy changes
- Track login setting modifications
- Review authentication changes
- Audit certificate updates

### Development
- Track custom object changes
- Review field additions/modifications
- Monitor Apex class deployments
- Document validation rule changes

## Planned Enhancements

Future versions may include:
- Date range selection
- Advanced filtering options
- Export to JSON/Excel
- Saved search preferences
- Trend charts and visualizations
- Change comparison
- Email notifications
- Integration with CI/CD tools
- Bulk change analysis

## Limitations

### Current Limitations
- Requires "View Setup and Configuration" permission
- Depends on API access
- Limited to 6 months of history (Salesforce limitation)
- No real-time updates (manual refresh required)
- Chrome extension only (no Firefox version yet)

### Known Issues
- Session extraction may not work on all Salesforce domains
- Some custom My Domain configurations might need adjustment
- API rate limits apply (per Salesforce policies)

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
