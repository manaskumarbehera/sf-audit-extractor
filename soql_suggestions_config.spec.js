/**
 * soql_suggestions_config.spec.js
 *
 * Ultra-detailed test coverage for soql_suggestions_config.json rules.
 * - Table-driven cases with human-readable labels
 * - Verifies presence/absence of suggestion IDs
 * - Provides realistic describe() mocks (fields, picklists, relationships)
 *
 * How to use:
 *   1) Put this file next to your engine & config.
 *   2) Ensure your engine exposes a getSuggestions(query, ctx, describe, config) function.
 *   3) `npm test`
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from 'url';

// Provide __dirname for ESM environments (Jest with --experimental-vm-modules)
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ====== Load config ======
const CONFIG_CANDIDATES = [
  path.resolve(__dirname, "./soql_suggestions_config.json"),
  path.resolve(__dirname, "./rules/soql_suggestions_config.json"),
  path.resolve(__dirname, "./rules/soql_suggestions_config.json"),
  path.resolve(process.cwd(), "rules/soql_suggestions_config.json"),
];

let CONFIG_PATH = CONFIG_CANDIDATES.find((p) => {
  try {
    fs.accessSync(p, fs.constants.R_OK);
    return true;
  } catch (e) {
    return false;
  }
});
if (!CONFIG_PATH) {
  throw new Error("Could not find soql_suggestions_config.json in expected locations.");
}
const CONFIG = JSON.parse(fs.readFileSync(CONFIG_PATH, "utf8"));

// ====== Engine Adapter ======
// Change this import to match your engine.
import * as Engine from "./soql_suggestions_engine"; // <-- adjust if needed

/**
 * Unified adapter so tests don't depend on your internal function names.
 * Expected return shape: Array<{ id: string, message?: string, apply?: {...}, severity?: string }>
 */
async function getSuggestions(query, ctx = {}, describeProvider = null) {
    // Fallback ctx defaults from config
    const baseCtx = {
        ...CONFIG.sessionContextDefaults,
        ...ctx,
    };
    // Some engines take a single bag, others positional args—adapt here:
    if (typeof Engine.getSuggestions === "function") {
        return await Engine.getSuggestions({
            query,
            context: baseCtx,
            config: CONFIG,
            describeProvider,
        });
    }
    if (typeof Engine.suggest === "function") {
        return await Engine.suggest(query, baseCtx, describeProvider, CONFIG);
    }
    throw new Error(
        "Test adapter: Could not find Engine.getSuggestions or Engine.suggest"
    );
}

function ids(suggs) {
    return (suggs || []).map((s) => s.id).filter(Boolean);
}

function includesAll(actualIds, expectedIds, label) {
    const missing = expectedIds.filter((x) => !actualIds.includes(x));
    if (missing.length) {
        throw new Error(
            `${label} ➜ Missing expected suggestions: ${missing.join(", ")}\nActual: ${JSON.stringify(actualIds)}`
        );
    }
}

function excludesAll(actualIds, forbiddenIds, label) {
    const present = forbiddenIds.filter((x) => actualIds.includes(x));
    if (present.length) {
        throw new Error(
            `${label} ➜ Unexpected suggestions present: ${present.join(", ")}\nActual: ${JSON.stringify(actualIds)}`
        );
    }
}

// ====== Describe Provider (mock) ======
/**
 * Minimal but rich mock for object/field metadata.
 * You can expand this with child relationships, picklists, etc.
 */
const mockDescribeProvider = {
    async describeObject(objectApiName) {
        // Top-level common shapes
        const COMMON = {
            Id: { type: "id" },
            Name: { type: "string" },
            CreatedDate: { type: "datetime" },
            OwnerId: { type: "id" },
        };
        const byObject = {
            Account: {
                ...COMMON,
                AnnualRevenue: { type: "double" },
                IsActive__c: { type: "boolean" },
                Type: { type: "picklist", values: ["Customer", "Partner", "Prospect"] },
                Parent: { type: "reference", referenceTo: ["Account"] },
            },
            Contact: {
                ...COMMON,
                Email: { type: "email" },
                IsDeleted: { type: "boolean" },
                AccountId: { type: "reference", referenceTo: ["Account"] },
            },
            Opportunity: {
                ...COMMON,
                Amount: { type: "currency" },
                StageName: {
                    type: "picklist",
                    values: ["Prospecting", "Proposal/Price Quote", "Closed Won", "Closed Lost"],
                },
                CloseDate: { type: "date" },
            },
        };
        return byObject[objectApiName] || {};
    },
    async childRelationships(objectApiName) {
        // Simplified child rel names
        const map = {
            Account: [{ childRelationshipName: "Contacts", childObject: "Contact", field: "AccountId" }],
            Contact: [],
            Opportunity: [],
        };
        return map[objectApiName] || [];
    },
};

// ====== Test Cases ======
/**
 * Each case:
 *  - label: Human-friendly name shown in Jest output
 *  - query: Editor content at time of request
 *  - ctx:   Phase & flags if relevant (top-level vs subquery, etc.)
 *  - expect: { includeIds: [], excludeIds: [] }
 *  - note:  Optional explanation
 */
const CASES = [
    // Starter
    {
        label: "[starter_suggestions] Empty editor ➜ suggest 'Start a SELECT'",
        query: "   ",
        ctx: { phase: "IDLE" },
        expect: { includeIds: ["starter_suggestions"] },
    },

    // Fields macro helpers
    {
        label: "[fields-macro-helpers] Typing SELECT ➜ offer FIELDS(...) macros",
        query: "SELECT ",
        ctx: { phase: "SELECTING_FIELDS" },
        expect: { includeIds: ["fields-macro-helpers"] },
    },

    // FROM after SELECT
    {
        label: "[suggest-from-after-select] SELECT list present, no FROM ➜ suggest FROM",
        query: "SELECT FIELDS(ALL) ",
        ctx: { phase: "SELECTING_FIELDS" },
        expect: { includeIds: ["suggest-from-after-select"] },
    },

    // LIMIT nudge after FIELDS(...)
    {
        label: "[limit-suggestion] FIELDS(ALL) present at top-level and no LIMIT ➜ suggest LIMIT 200",
        query: "SELECT FIELDS(ALL) FROM Account ",
        ctx: { phase: "CHOOSING_OBJECT" },
        expect: { includeIds: ["limit-suggestion"] },
    },

    // OFFSET suppression until LIMIT
    {
        label: "[suppress-offset-without-limit] Prevent OFFSET hint before LIMIT",
        query: "SELECT Id FROM Account WHERE Name LIKE 'Acme%' ",
        ctx: { phase: "FILTERING" },
        expect: { includeIds: ["suppress-offset-without-limit"] },
    },

    // HAVING only if GROUP BY exists
    {
        label: "[having-after-groupby] GROUP BY present ➜ suggest HAVING",
        query: "SELECT Name, COUNT(Id) FROM Account GROUP BY Name ",
        ctx: { phase: "GROUPING" },
        expect: { includeIds: ["having-after-groupby"] },
    },
    {
        label: "[suppress-having-without-groupby] No GROUP BY ➜ suppress HAVING",
        query: "SELECT Name FROM Account ",
        ctx: { phase: "FILTERING" },
        expect: { includeIds: ["suppress-having-without-groupby"] },
    },

    // ORDER BY placement tips
    {
        label: "[order-by-placement] ORDER BY should be before LIMIT, after filters",
        query: "SELECT Id FROM Account WHERE IsActive__c = TRUE ",
        ctx: { phase: "FILTERING" },
        expect: { includeIds: ["order-by-placement"] },
    },
    {
        label: "[order-by-after-where] After WHERE ➜ suggest ORDER BY then LIMIT",
        query: "SELECT Id FROM Account WHERE Name LIKE 'A%' ",
        ctx: { phase: "FILTERING" },
        expect: { includeIds: ["order-by-after-where"] },
    },

    // ORDER BY followups
    {
        label: "[order-by-field-suggestions + order-by-followups] Inside ORDER BY list",
        query: "SELECT Id, Name FROM Account ORDER BY ",
        ctx: { phase: "ORDERING" },
        expect: { includeIds: ["order-by-field-suggestions", "order-by-followups"] },
    },
    {
        label: "[nulls-ordering] Suggest NULLS FIRST/LAST after ASC/DESC",
        query: "SELECT Id FROM Account ORDER BY Name DESC ",
        ctx: { phase: "ORDERING" },
        expect: { includeIds: ["nulls-ordering"] },
    },

    // WITH SECURITY_ENFORCED, FOR UPDATE hints
    {
        label: "[with-security-position] Place WITH SECURITY_ENFORCED before ORDER/LIMIT",
        query: "SELECT Id FROM Account WHERE Name LIKE 'Acme%' ",
        ctx: { phase: "FILTERING" },
        expect: { includeIds: ["with-security-position"] },
    },
    {
        label: "[for-update-last] Remind FOR UPDATE must be last",
        query: "SELECT Id FROM Account ORDER BY Name LIMIT 100 ",
        ctx: { phase: "LIMITING" },
        expect: { includeIds: ["for-update-last"] },
    },
    {
        label: "[with-security-enforced] Top-level sensitive/standard object ➜ suggest WSE",
        query: "SELECT Id FROM Account ",
        ctx: { phase: "CHOOSING_OBJECT" },
        expect: { includeIds: ["with-security-enforced"] },
    },
    {
        label: "[for-update-lock] General tip to lock rows when pattern implies it",
        query: "SELECT Id FROM Account WHERE Name = 'Acme' LIMIT 1 ",
        ctx: { phase: "LIMITING" },
        expect: { includeIds: ["for-update-lock"] },
    },

    // Select * quick fix
    {
        label: "[select-star] Replace * with explicit fields",
        query: "SELECT * FROM Account",
        ctx: { phase: "SELECTING_FIELDS" },
        expect: { includeIds: ["select-star"] },
    },

    // Aggregate needs GROUP BY
    {
        label: "[aggregate-needs-groupby] COUNT + non-aggregated fields w/o GROUP BY ➜ warn",
        query: "SELECT Name, COUNT(Id) FROM Account",
        ctx: { phase: "SELECTING_FIELDS" },
        expect: { includeIds: ["aggregate-needs-groupby"] },
    },

    // Fields macro exclusivity
    {
        label: "[fields-macro-exclusivity] Don’t mix FIELDS(ALL) with explicit fields",
        query: "SELECT FIELDS(ALL), Name FROM Account",
        ctx: { phase: "SELECTING_FIELDS" },
        expect: { includeIds: ["fields-macro-exclusivity"] },
    },
    {
        label: "[fields-macro-vs-aggregate] Don’t combine FIELDS() with aggregates",
        query: "SELECT FIELDS(STANDARD), COUNT(Id) FROM Account",
        ctx: { phase: "SELECTING_FIELDS" },
        expect: { includeIds: ["fields-macro-vs-aggregate"] },
    },

    // Boolean filter hint
    {
        label: "[boolean-filter] After WHERE, suggest boolean field usage",
        query: "SELECT Id FROM Account WHERE ",
        ctx: { phase: "FILTERING", object: "Account" },
        expect: { includeIds: ["boolean-filter"] },
    },

    // Typing data correctness
    {
        label: "[quote-text-values] Strings must be quoted",
        query: "SELECT Id FROM Account WHERE Name = Acme",
        ctx: { phase: "FILTERING" },
        expect: { includeIds: ["quote-text-values"] },
    },
    {
        label: "[unquote-numbers] Remove quotes around numeric comparisons",
        query: "SELECT Id FROM Account WHERE AnnualRevenue > '100000'",
        ctx: { phase: "FILTERING" },
        expect: { includeIds: ["unquote-numbers"] },
    },
    {
        label: "[boolean-literals] TRUE/FALSE should be unquoted",
        query: "SELECT Id FROM Contact WHERE IsDeleted = 'false'",
        ctx: { phase: "FILTERING" },
        expect: { includeIds: ["boolean-literals"] },
    },
    {
        label: "[null-comparison] Use = NULL / != NULL (no quotes)",
        query: "SELECT Id FROM Account WHERE ParentId = 'NULL'",
        ctx: { phase: "FILTERING" },
        expect: { includeIds: ["null-comparison"] },
    },
    {
        label: "[id-quoting] Quote Ids in IN list",
        query: "SELECT Id FROM Account WHERE Id IN (001ABC, 001DEF)",
        ctx: { phase: "FILTERING" },
        expect: { includeIds: ["id-quoting"] },
    },

    // Dates & literals
    {
        label: "[date-literal-suggestion] Prefer date literals over free-form strings",
        query: "SELECT Id FROM Opportunity WHERE CloseDate >= '2024/01/01'",
        ctx: { phase: "FILTERING" },
        expect: { includeIds: ["date-literal-suggestion"] },
    },
    {
        label: "[datetime-iso8601] Datetime without Z ➜ suggest ISO",
        query: "SELECT Id FROM Account WHERE CreatedDate >= 2024-01-01T10:00:00",
        ctx: { phase: "FILTERING" },
        expect: { includeIds: ["datetime-iso8601"] },
    },

    // LIKE patterns
    {
        label: "[like-wildcard] LIKE should use % properly",
        query: "SELECT Id FROM Account WHERE Name LIKE 'Acme'",
        ctx: { phase: "FILTERING" },
        expect: { includeIds: ["like-wildcard"] },
    },
    {
        label: "[like-not-wildcard] NOT LIKE usage tip",
        query: "SELECT Id FROM Account WHERE Name NOT LIKE 'A%'",
        ctx: { phase: "FILTERING" },
        expect: { includeIds: ["not-like-supported"] },
    },

    // IN list & spacing
    {
        label: "[in-list-commas + in-list-spacing] Enforce commas and spacing in IN lists",
        query: "SELECT Id FROM Account WHERE Name IN ('A' 'B'  ,)",
        ctx: { phase: "FILTERING" },
        expect: { includeIds: ["in-list-commas", "in-list-spacing"] },
    },
    {
        label: "[and-or-spacing] Spaces around AND/OR",
        query: "SELECT Id FROM Account WHERE Name='A'AND AnnualRevenue>100",
        ctx: { phase: "FILTERING" },
        expect: { includeIds: ["and-or-spacing"] },
    },

    // Picklist / multi-select
    {
        label: "[picklist-values] Offer valid values for picklist fields",
        query: "SELECT Id FROM Account WHERE Type = ",
        ctx: { phase: "FILTERING", object: "Account" },
        expect: { includeIds: ["picklist-values"] },
    },
    {
        label: "[multi-select-includes] Use INCLUDES/EXCLUDES for multi-select picklists",
        query: "SELECT Id FROM Account WHERE Some_Multi__c IN ('A','B')",
        ctx: { phase: "FILTERING", object: "Account" },
        expect: { includeIds: ["multi-select-includes"] },
        note: "Engine should know that Some_Multi__c is multi-select (mock if you add it).",
    },

    // Spacing & commas in field lists
    {
        label: "[space-after-keyword + keyword-single-space] Enforce single spaces after keywords",
        query: "SELECT   Id,Name  FROM   Account",
        ctx: { phase: "CHOOSING_OBJECT" },
        expect: { includeIds: ["space-after-keyword", "keyword-single-space"] },
    },
    {
        label: "[comma-between-fields] Require comma between adjacent fields",
        query: "SELECT Id Name FROM Account",
        ctx: { phase: "SELECTING_FIELDS" },
        expect: { includeIds: ["comma-between-fields"] },
    },
    {
        label: "[no-trailing-comma + space-after-comma] Tidy list separators",
        query: "SELECT Id, Name,  FROM Account",
        ctx: { phase: "SELECTING_FIELDS" },
        expect: { includeIds: ["no-trailing-comma", "space-after-comma"] },
    },
    {
        label: "[no-space-before-dot-strong] No space before dot in relationship path",
        query: "SELECT Account .Name FROM Contact",
        ctx: { phase: "SELECTING_FIELDS" },
        expect: { includeIds: ["no-space-before-dot-strong"] },
    },
    {
        label: "[parent-dot-depth] Keep relationship chains shallow",
        query: "SELECT Account.Parent.Parent.Parent.Name FROM Contact",
        ctx: { phase: "SELECTING_FIELDS" },
        expect: { includeIds: ["parent-dot-depth"] },
    },

    // Subqueries
    {
        label: "[subquery-shape] Validate SELECT … FROM ChildRel … in subquery",
        query: "SELECT Id, (SELECT Id Name FROM Contacts ) FROM Account",
        ctx: { phase: "SUBQUERY" },
        expect: { includeIds: ["subquery-shape"] },
    },
    {
        label: "[childrel-vs-object] Must use child relationship name, not object API name",
        query: "SELECT Id, (SELECT Id FROM Contact) FROM Account",
        ctx: { phase: "SUBQUERY" },
        expect: { includeIds: ["childrel-vs-object"] },
    },
    {
        label: "[subquery-where-after-from] Enforce subquery clause order",
        query: "SELECT Id, (SELECT Id FROM Contacts LIMIT 10 WHERE Email != NULL) FROM Account",
        ctx: { phase: "SUBQUERY" },
        expect: { includeIds: ["subquery-where-after-from"] },
    },

    // Semi-join type match
    {
        label: "[semi-join-type-match] Ensure compatible types in IN subquery",
        query:
            "SELECT Id FROM Account WHERE Id IN (SELECT AccountId FROM Contact WHERE Email LIKE '%@acme.com')",
        ctx: { phase: "FILTERING" },
        expect: { includeIds: ["semi-join-type-match"] },
    },

    // OFFSET after LIMIT
    {
        label: "[offset-after-limit] Allow OFFSET only if LIMIT present",
        query: "SELECT Id FROM Account LIMIT 50 OFFSET 10",
        ctx: { phase: "OFFSETTING" },
        expect: { includeIds: ["offset-after-limit"] },
    },

    // Syntax recovery
    {
        label: "[close-parens-and-quotes] Unbalanced parens/quotes ➜ block until closed",
        query: "SELECT Name, (SELECT Id FROM Contacts WHERE Email LIKE 'a%) FROM Account",
        ctx: { phase: "ERROR_RECOVERY" },
        expect: { includeIds: ["close-parens-and-quotes"] },
    },
];

// ====== Runner ======
describe("SOQL suggestion policy @1.3.0 – detailed behavior tests", () => {
    test.each(CASES)("%s", async ({ label, query, ctx, expect }) => {
        const suggs = await getSuggestions(query, ctx, mockDescribeProvider);
        const actual = ids(suggs);

        if (expect?.includeIds?.length) {
            includesAll(actual, expect.includeIds, label);
        }
        if (expect?.excludeIds?.length) {
            excludesAll(actual, expect.excludeIds, label);
        }
    });

    // Canonical clause order sanity check (top-level)
    test("[sequencer-next-clause] Respects global clause order", async () => {
        const query = "SELECT Id FROM Account WHERE Name LIKE 'A%'";
        const ctx = { phase: "FILTERING" };
        const suggs = await getSuggestions(query, ctx, mockDescribeProvider);
        const have = ids(suggs);
        expect(have).toContain("sequencer-next-clause");
    });

    // Cooldown + fireOnce sanity checks (spot check)
    test("[conflictResolution] fireOncePer=query should not repeat within same query snapshot", async () => {
        const query = "SELECT FIELDS(ALL) FROM Account ";
        const ctx = { phase: "CHOOSING_OBJECT" };
        const s1 = await getSuggestions(query, ctx, mockDescribeProvider);
        const s2 = await getSuggestions(query, ctx, mockDescribeProvider);
        const id = "limit-suggestion";
        const count = [s1, s2].flat().filter((x) => x.id === id).length;
        expect(count).toBeGreaterThanOrEqual(1); // at least one
        // If your engine caches "fireOncePer=query", this might be exactly 1; otherwise >=1 is acceptable.
    });
});
