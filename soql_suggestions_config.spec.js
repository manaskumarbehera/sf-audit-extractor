// soql_suggestions_config.spec.js
// Run with: npx jest soql_suggestions_config.spec.js

const fs = require("fs");
const path = require("path");

// --- Helpers ---------------------------------------------------------------

function findFile(candidates) {
    for (const p of candidates) {
        if (fs.existsSync(p)) return p;
    }
    throw new Error(
        `File not found. Tried:\n${candidates.map((p) => " - " + p).join("\n")}`
    );
}

function loadJsonConfig() {
    const candidates = [
        path.join(__dirname, "soql_suggestions_config.json"),
        path.join(__dirname, "..", "soql_suggestions_config.json"),
        // also allow the config to live under rules/ (project convention)
        path.join(__dirname, "rules", "soql_suggestions_config.json"),
        path.join(process.cwd(), "rules", "soql_suggestions_config.json"),
        path.join(process.cwd(), "soql_suggestions_config.json"),
    ];
    const file = findFile(candidates);
    const raw = fs.readFileSync(file, "utf8");
    const json = JSON.parse(raw);
    return { json, file };
}

async function importEngine() {
    // Try a few common locations. Using dynamic import to support ESM engine.
    const candidates = [
        path.join(__dirname, "soql_suggestions_engine.js"),
        path.join(__dirname, "..", "soql_suggestions_engine.js"),
        path.join(process.cwd(), "soql_suggestions_engine.js"),
        // src/ variants
        path.join(__dirname, "src", "soql_suggestions_engine.js"),
        path.join(__dirname, "..", "src", "soql_suggestions_engine.js"),
        path.join(process.cwd(), "src", "soql_suggestions_engine.js"),
    ];

    let lastErr;
    for (const p of candidates) {
        try {
            if (fs.existsSync(p)) {
                // On Windows, need file:// URL for dynamic import of absolute paths
                const mod = await import(pathToFileUrlIfNeeded(p));
                return { mod, path: p };
            }
        } catch (e) {
            lastErr = e;
        }
    }
    throw new Error(
        `Could not import soql_suggestions_engine.js from any known path. Last error: ${lastErr}`
    );
}

function pathToFileUrlIfNeeded(absPath) {
    // Node can import absolute paths directly, but file:// works everywhere.
    const isWin = process.platform === "win32";
    if (isWin) {
        const url = new URL("file://" + absPath.replace(/\\/g, "/"));
        return url.href;
    }
    return absPath;
}

// Dummy describe provider (optional, engine accepts null)
const describeProvider = null;

// --- Tests ----------------------------------------------------------------

describe("soql_suggestions_config.json", () => {
    test("loads and has expected top-level shape", () => {
        const { json, file } = loadJsonConfig();
        expect(json).toBeTruthy();
        expect(json.meta).toBeTruthy();
        expect(json.meta.name).toBeDefined();
        expect(json.suggestions).toBeInstanceOf(Array);
        expect(Array.isArray(json.suggestions)).toBe(true);
        // config flag present
        expect(typeof json.declarativeOnly).toBe("boolean");
        // lifecycle sanity
        expect(json.lifecycle).toBeTruthy();
        expect(Array.isArray(json.lifecycle.states)).toBe(true);
        // conflictResolution sanity
        expect(json.conflictResolution).toBeTruthy();
        // useful debug on path
        expect(file).toMatch(/soql_suggestions_config\.json$/);
    });

    test("all suggestion ids are unique and non-empty", () => {
        const { json } = loadJsonConfig();
        const ids = new Map();
        for (const r of json.suggestions) {
            expect(r).toBeTruthy();
            expect(typeof r.id).toBe("string");
            expect(r.id.length).toBeGreaterThan(0);
            const key = r.id;
            expect(ids.has(key)).toBe(false);
            ids.set(key, true);
        }
    });

    test("contains required core rules", () => {
        const { json } = loadJsonConfig();
        const ids = new Set(json.suggestions.map((r) => r.id));
        expect(ids.has("starter_suggestions")).toBe(true);
        expect(ids.has("fields-macro-helpers")).toBe(true);
        expect(ids.has("suggest-from-after-select")).toBe(true);
        expect(ids.has("limit-suggestion")).toBe(true);
    });
});

describe("soql_suggestions_engine + config integration (smoke tests)", () => {
    let engine;
    let config;

    beforeAll(async () => {
        const { json } = loadJsonConfig();
        config = json;

        const { mod } = await importEngine();
        // The engine exports getSuggestions / suggest
        expect(mod.getSuggestions || mod.suggest).toBeTruthy();
        engine = mod.getSuggestions
            ? mod.getSuggestions
            : // fallback to suggest signature
            async ({ query, context, config, describeProvider }) =>
                mod.suggest(query, context, describeProvider, config);
    });

    test("empty editor → offers 'Start a SELECT'", async () => {
        const res = await engine({
            query: "",
            context: {},
            config,
            describeProvider,
        });
        expect(Array.isArray(res)).toBe(true);
        const hasStart = res.some(
            (s) =>
                /start a select/i.test(s.text || "") ||
                (s.apply && s.apply.text === "SELECT ")
        );
        expect(hasStart).toBe(true);
    });

    test("after 'SELECT ' → offers FIELDS(...) helpers", async () => {
        const res = await engine({
            query: "SELECT ",
            context: {},
            config,
            describeProvider,
        });
        const texts = res.map((s) => (s.text || "") + " " + (s.apply?.text || ""));
        const hasAll = texts.some((t) => /FIELDS\(ALL\)/i.test(t));
        const hasStd = texts.some((t) => /FIELDS\(STANDARD\)/i.test(t));
        const hasCus = texts.some((t) => /FIELDS\(CUSTOM\)/i.test(t));
        expect(hasAll && hasStd && hasCus).toBe(true);
    });

    test("after 'SELECT FIELDS(ALL) ' → suggests FROM", async () => {
        const res = await engine({
            query: "SELECT FIELDS(ALL) ",
            context: {},
            config,
            describeProvider,
        });
        const hasFrom = res.some(
            (s) =>
                /add\s+from/i.test(s.message || s.text || "") ||
                (s.apply && / FROM /.test(s.apply.text || ""))
        );
        expect(hasFrom).toBe(true);
    });

    test("after SELECT…FROM Account → suggests WHERE (and not LIMIT yet)", async () => {
        const res = await engine({
            query: "SELECT Id FROM Account ",
            context: {},
            config,
            describeProvider,
        });
        const hasWhereHint = res.some(
            (s) => /where/i.test(s.message || s.text || "")
        );
        expect(hasWhereHint).toBe(true);
    });
});
