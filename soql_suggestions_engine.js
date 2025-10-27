// soql_suggestions_engine.js
// Suggestions engine: generates candidate suggestions based on query, describe, editorState and rules.
// It supports a declarative JSON-driven match pass (rule.matchOn/matchRegex/notMatchRegex)
// and falls back to procedural checks for common suggestion types to preserve compatibility.

import { getSelectSegment } from './soql_helper_utils.js';

// SOQL suggestions engine stub — disable generation while preserving API.
export function indexOfWordInsensitive(){ return -1; }
export function detectPhase(){ return 'IDLE'; }
export function buildSessionContext(editorState, policyDefaults){ return { phase: 'IDLE', emittedSuggestions: [], lastEmittedAt: {} }; }
export function canEmitRule(){ return false; }
export function markEmitted(){ /* no-op */ }
export async function generateSuggestions(query, describe, editorState, rulesArray, policy){ return []; }
export async function suggest(query, baseCtx, describeProvider, CONFIG){ return []; }
export async function getSuggestions({ query, context, config, describeProvider }){ return []; }

export default { suggest };
