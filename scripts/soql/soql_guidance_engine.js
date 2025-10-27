(function(){
    'use strict';

    const DEFAULT_ORDER = { error: 0, warning: 1, suggestion: 2, info: 3 };

    function normalize(text) {
        return typeof text === 'string' ? text : '';
    }

    function toLower(text) {
        return normalize(text).toLowerCase();
    }

    function ensureArray(val) {
        if (Array.isArray(val)) return val;
        if (typeof val === 'string') return [val];
        return [];
    }

    class SoqlGuidanceEngine {
        constructor(config) {
            this.meta = config?.meta || {};
            this.defaults = config?.defaults || {};
            this.rules = Array.isArray(config?.rules) ? config.rules : [];
        }

        static async create(configUrl) {
            const url = configUrl || 'rules/soql_guidance_rules.json';
            try {
                const resp = await fetch(url);
                if (!resp.ok) throw new Error(`Unable to load guidance config: ${resp.status}`);
                const json = await resp.json();
                return new SoqlGuidanceEngine(json);
            } catch (e) {
                console.warn('[SOQL Guidance] Failed to load config', e);
                return new SoqlGuidanceEngine({});
            }
        }

        evaluate(queryText) {
            const query = normalize(queryText);
            const lower = toLower(query);
            const context = { raw: query, lower };

            const grouped = { suggestion: [], warning: [], error: [], info: [] };

            this.rules.forEach((rule) => {
                const category = rule?.category || 'info';
                if (!grouped.hasOwnProperty(category)) return;
                if (!this.#matches(rule?.conditions, context)) return;
                grouped[category].push(this.#createResult(rule));
            });

            return {
                query,
                suggestion: this.#selectSuggestion(grouped.suggestion),
                warnings: grouped.warning,
                errors: grouped.error,
                info: grouped.info,
                defaults: this.defaults
            };
        }

        #selectSuggestion(entries) {
            if (!Array.isArray(entries) || entries.length === 0) return null;
            return entries[0];
        }

        #createResult(rule) {
            return {
                id: rule?.id || 'unknown',
                category: rule?.category || 'info',
                title: rule?.title || rule?.message || 'SOQL guidance',
                message: rule?.message || '',
                suggestion: rule?.suggestion || rule?.message || '',
                meta: {
                    order: typeof rule?.order === 'number' ? rule.order : DEFAULT_ORDER[rule?.category || 'info']
                }
            };
        }

        #matches(conditions, context) {
            if (!conditions) return true;
            const all = ensureArray(conditions.all);
            const any = ensureArray(conditions.any);
            const none = ensureArray(conditions.none);

            if (all.length && !all.every(cond => this.#matchSingle(cond, context))) return false;
            if (any.length && !any.some(cond => this.#matchSingle(cond, context))) return false;
            if (none.length && none.some(cond => this.#matchSingle(cond, context))) return false;
            return true;
        }

        #matchSingle(condition, context) {
            if (!condition) return true;
            const lower = context.lower;
            const raw = context.raw;

            if (condition.regex) {
                try {
                    const re = new RegExp(condition.regex, condition.flags || '');
                    return re.test(raw);
                } catch (e) {
                    console.warn('[SOQL Guidance] Invalid regex condition', condition, e);
                    return false;
                }
            }

            if (condition.contains) {
                const needles = ensureArray(condition.contains).map(toLower).filter(Boolean);
                return needles.every(n => lower.includes(n));
            }

            if (condition.notContains) {
                const needles = ensureArray(condition.notContains).map(toLower).filter(Boolean);
                return needles.every(n => !lower.includes(n));
            }

            if (typeof condition.minLength === 'number') {
                if (raw.length < condition.minLength) return false;
            }

            if (typeof condition.maxLength === 'number') {
                if (raw.length > condition.maxLength) return false;
            }

            return true;
        }
    }

    window.SoqlGuidanceEngine = SoqlGuidanceEngine;
})();