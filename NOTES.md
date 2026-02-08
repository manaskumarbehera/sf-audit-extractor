# Developer Notes

## NPM Commands Reference

| Command | Description |
|---------|-------------|
| `npm test` | Run all tests with Jest (`jest --runInBand --detectOpenHandles`) |
| `npm run lint` | Run ESLint on JavaScript files (`eslint . --ext .js`) |
| `npm start` | Show message about loading as Chrome extension |
| `npm run build` | Bundle popup.js with esbuild |
| `npm run package` | Run build.sh script to package extension |
| `npm run zip` | Same as package - run build.sh script |

## Quick Reference

```bash
# Run all tests
npm test

# Check code quality
npm run lint

# Build for production
npm run build

# Package extension as zip
npm run package
```

## Settings Configuration

### Platform Events Settings
| Setting | Storage Key | Default | Description |
|---------|-------------|---------|-------------|
| Show Publish Button | `platformShowPublishButton` | `true` | Show/hide the publish button for Platform Events |
| Auto-subscribe on Select | `platformAutoSubscribe` | `false` | Automatically subscribe when an event is selected |

### LMS Settings
| Setting | Storage Key | Default | Description |
|---------|-------------|---------|-------------|
| Show Publish Button | `lmsShowPublishButton` | `true` | Show/hide publish buttons for LMS channels |
| Auto-load Channels | `lmsAutoLoadChannels` | `false` | Automatically load channels when LMS tab opens |

### SOQL Builder Settings
| Setting | Storage Key | Default | Description |
|---------|-------------|---------|-------------|
| Show Object Selector | `soqlShowObjectSelector` | `true` | Show/hide the SObject selector |
| Enable Query Builder | `soqlEnableBuilder` | `true` | Enable/disable the guided query builder |

### GraphQL Builder Settings
| Setting | Storage Key | Default | Description |
|---------|-------------|---------|-------------|
| Show Object Selector | `graphqlShowObjectSelector` | `true` | Show/hide the object selector |
| Auto-format Queries | `graphqlAutoFormat` | `true` | Auto-format queries on load |

