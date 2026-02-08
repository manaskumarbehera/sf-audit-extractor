import js from "@eslint/js";
import globals from "globals";

export default [
  js.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      globals: {
        ...globals.browser,
        ...globals.node,
        ...globals.jest,
        // Chrome extension APIs
        chrome: "readonly",
        // Project globals
        Utils: "readonly",
        SettingsHelper: "readonly",
        SoqlHelper: "readonly",
        GraphqlHelper: "readonly",
        DataExplorerHelper: "readonly",
        PlatformHelper: "readonly",
        LmsHelper: "readonly",
        AuditHelper: "readonly",
        SoqlGuidanceEngine: "readonly",
        SoqlGuidance: "readonly",
        // Salesforce Aura/Lightning globals (for injected scripts)
        "$A": "readonly",
        "sfdcPage": "readonly",
      },
    },
    rules: {
      // Relaxed rules for this project - many unused vars are DOM references kept for future use
      "no-unused-vars": "off",  // Disabled - too many false positives with DOM element references
      "no-empty": ["error", { "allowEmptyCatch": true }],
      "no-constant-condition": ["error", { "checkLoops": false }],
      "no-prototype-builtins": "off",
      "no-useless-escape": "off",  // Too many false positives with regex
      "no-unsafe-optional-chaining": "off",  // Sometimes intentional
    },
  },
  {
    // Test files configuration
    files: ["tests/**/*.js", "**/*.test.js"],
    languageOptions: {
      globals: {
        ...globals.jest,
        jest: "readonly",
        describe: "readonly",
        test: "readonly",
        it: "readonly",
        expect: "readonly",
        beforeEach: "readonly",
        afterEach: "readonly",
        beforeAll: "readonly",
        afterAll: "readonly",
        fail: "readonly",
      },
    },
  },
  {
    // Ignore patterns
    ignores: [
      "node_modules/**",
      "build/**",
      "dist/**",
      "*.zip",
      "coverage/**",
      "*.min.js",
    ],
  },
];

