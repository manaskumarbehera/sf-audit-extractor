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

