// ESM-converted copy of the original spec (moved into __tests__ to be run directly)
import fs from 'fs';
import path from 'path';
import * as EngineModule from '../soql_suggestions_engine.js';

function findFile(candidates) {
    for (const p of candidates) {
        if (fs.existsSync(p)) return p;
    }
    throw new Error(`File not found. Tried:\n${candidates.map((p) => ' - ' + p).join('\n')}`);
}

function loadJsonConfig() {
    const candidates = [
        path.join(process.cwd(), 'soql_suggestions_config.json'),
        path.join(process.cwd(), 'rules', 'soql_suggestions_config.json'),
        path.join(process.cwd(), 'soql_suggestions_config.json')
    ];
    const file = findFile(candidates);
    const raw = fs.readFileSync(file, 'utf8');
    const json = JSON.parse(raw);
    return { json, file };
}

const describeProvider = null;

describe('soql_suggestions_config.json', () => {
    test('loads and has expected top-level shape', () => {
        const { json, file } = loadJsonConfig();
        expect(json).toBeTruthy();
        expect(json.meta).toBeTruthy();
        expect(json.meta.name).toBeDefined();
        expect(json.suggestions).toBeInstanceOf(Array);
        expect(Array.isArray(json.suggestions)).toBe(true);
        expect(typeof json.declarativeOnly).toBe('boolean');
        expect(json.lifecycle).toBeTruthy();
        expect(Array.isArray(json.lifecycle.states)).toBe(true);
        expect(json.conflictResolution).toBeTruthy();
        expect(file).toMatch(/soql_suggestions_config\.json$/);
    });

    test('all suggestion ids are unique and non-empty', () => {
        const { json } = loadJsonConfig();
        const ids = new Map();
        for (const r of json.suggestions) {
            expect(r).toBeTruthy();
            expect(typeof r.id).toBe('string');
            expect(r.id.length).toBeGreaterThan(0);
            const key = r.id;
            expect(ids.has(key)).toBe(false);
            ids.set(key, true);
        }
    });

    test('contains required core rules', () => {
        const { json } = loadJsonConfig();
        const ids = new Set(json.suggestions.map((r) => r.id));
        expect(ids.has('starter_suggestions')).toBe(true);
        expect(ids.has('fields-macro-helpers')).toBe(true);
        expect(ids.has('suggest-from-after-select')).toBe(true);
        expect(ids.has('limit-suggestion')).toBe(true);
    });
});

describe('soql_suggestions_engine + config integration (smoke tests)', () => {
    let engine;
    let config;

    beforeAll(async () => {
        const { json } = loadJsonConfig();
        config = json;
        // Use static import resolved by Jest/Babel
        const mod = EngineModule;
        expect(mod.getSuggestions || mod.suggest).toBeTruthy();
        engine = mod.getSuggestions ? mod.getSuggestions : async ({ query, context, config, describeProvider }) => mod.suggest(query, context, describeProvider, config);
    });

    test("empty editor → offers 'Start a SELECT'", async () => {
        const res = await engine({ query: '', context: {}, config, describeProvider });
        expect(Array.isArray(res)).toBe(true);
        const hasStart = res.some((s) => /start a select/i.test(s.text || '') || (s.apply && s.apply.text === 'SELECT '));
        expect(hasStart).toBe(true);
    });

    test("after 'SELECT ' → offers FIELDS(...) helpers", async () => {
        const res = await engine({ query: 'SELECT ', context: {}, config, describeProvider });
        const texts = res.map((s) => (s.text || '') + ' ' + (s.apply?.text || ''));
        const hasAll = texts.some((t) => /FIELDS\(ALL\)/i.test(t));
        const hasStd = texts.some((t) => /FIELDS\(STANDARD\)/i.test(t));
        const hasCus = texts.some((t) => /FIELDS\(CUSTOM\)/i.test(t));
        expect(hasAll && hasStd && hasCus).toBe(true);
    });

    test("after 'SELECT FIELDS(ALL) ' → suggests FROM", async () => {
        const res = await engine({ query: 'SELECT FIELDS(ALL) ', context: {}, config, describeProvider });
        const hasFrom = res.some((s) => /add\s+from/i.test(s.message || s.text || '') || (s.apply && / FROM /.test(s.apply.text || '')));
        expect(hasFrom).toBe(true);
    });

    test('after SELECT…FROM Account → suggests WHERE (and not LIMIT yet)', async () => {
        const res = await engine({ query: 'SELECT Id FROM Account ', context: {}, config, describeProvider });
        const hasWhereHint = res.some((s) => /where/i.test(s.message || s.text || ''));
        expect(hasWhereHint).toBe(true);
    });

    test('derives object describe from query when context omits object', async () => {
        const calls = [];
        const mockProvider = { async describeObject(name) { calls.push(name); return [ { name: 'Id', type: 'id' }, { name: 'Name', type: 'string' } ]; } };
        const res = await engine({ query: 'SELECT Name FROM Account ', context: {}, config, describeProvider: mockProvider });
        expect(Array.isArray(res)).toBe(true);
        expect(calls).toEqual(['Account']);
    });

    test('derives object describe from query when context omits object', async () => {
        const calls = [];
        const mockProvider = { async describeObject(name) { calls.push(name); return [ { name: 'Id', type: 'id' }, { name: 'Name', type: 'string' } ]; } };
        const res = await engine({ query: 'SELECT Name FROM Account ', context: {}, config, describeProvider: mockProvider });
        expect(Array.isArray(res)).toBe(true);
        expect(calls).toEqual(['Account']);
    });
});

describe('soql_suggestions_engine compatibility shims', () => {
    test('accepts raw describe arrays when context omits object', async () => {
        const mod = EngineModule;
        const customConfig = { suggestions: [ { id: 'suggest_boolean_filter', enabled: true, message: 'Filter boolean field' } ] };
        const describeFields = [ { name: 'Id', type: 'id' }, { name: 'IsActive__c', type: 'boolean' } ];
        const res = await mod.suggest('SELECT Name FROM Account ', {}, describeFields, customConfig);
        expect(Array.isArray(res)).toBe(true);
        const hasBooleanSuggestion = res.some((s) => /Filter by IsActive__c/i.test(s.text || ''));
        expect(hasBooleanSuggestion).toBe(true);
    });
});
