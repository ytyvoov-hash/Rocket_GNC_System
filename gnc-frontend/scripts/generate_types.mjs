#!/usr/bin/env node
// gnc-frontend/scripts/generate_types.mjs
//
// Reads every JSON-Schema-2020-12 YAML file in `schemas/` and emits a single
// TypeScript file (`gnc-frontend/src/store/generated.ts`) with one exported
// interface or type per top-level schema definition.
//
// The generated types COEXIST with the hand-rolled interfaces in the FE
// Redux slices: they are namespaced under `Schema*` and `SchemaEnum*` so
// consumers can migrate incrementally. A future step will swap each slice
// to use the generated counterpart and remove the duplicate definitions.
//
// Usage:
//   npm run gen:types
//
// Plan reference: §10 Recommendation 5 — single-source-of-truth schemas.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import YAML from "yaml";

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

const SCHEMAS_DIR = path.resolve(__dirname, "../../schemas");
const OUT_FILE    = path.resolve(__dirname, "../src/store/generated.ts");

const BANNER = `// AUTO-GENERATED FROM schemas/*.schema.yaml. DO NOT EDIT BY HAND.
// Run \`npm run gen:types\` from gnc-frontend/ to regenerate.
//
// Source: schemas/*.schema.yaml  (single source of truth, see plan §10 Rec 5)
// Generator: gnc-frontend/scripts/generate_types.mjs
`;

// --------------------------------------------------------------------------
// Helpers
// --------------------------------------------------------------------------

function pascalCase(s) {
    return s
        .replace(/[._-]+/g, " ")
        .replace(/(^|\s)(\w)/g, (_, _ws, c) => c.toUpperCase())
        .replace(/\s+/g, "");
}

function tsType(node, ctx) {
    if (!node) return "unknown";

    // $ref resolves to a sibling $defs entry inside the same schema.
    if (node.$ref) {
        const ref = String(node.$ref);
        if (ref.startsWith("#/$defs/")) {
            const defName = ref.replace("#/$defs/", "");
            return `Schema_${ctx.schemaId}_${pascalCase(defName)}`;
        }
        return "unknown /* unsupported $ref: " + ref + " */";
    }

    // enum
    if (Array.isArray(node.enum)) {
        return node.enum.map((v) => JSON.stringify(v)).join(" | ");
    }

    // const
    if (node.const !== undefined) return JSON.stringify(node.const);

    // oneOf / anyOf -> union
    if (Array.isArray(node.oneOf)) {
        return node.oneOf.map((sub) => tsType(sub, ctx)).join(" | ");
    }
    if (Array.isArray(node.anyOf)) {
        return node.anyOf.map((sub) => tsType(sub, ctx)).join(" | ");
    }

    // allOf -> intersection. Common pattern: actuator entries extend
    // CommonFields with extra required fields per kinematic model.
    if (Array.isArray(node.allOf)) {
        return node.allOf.map((sub) => tsType(sub, ctx)).join(" & ");
    }

    // type
    const t = node.type;
    if (t === "string")  return "string";
    if (t === "number")  return "number";
    if (t === "integer") return "number";
    if (t === "boolean") return "boolean";
    if (t === "null")    return "null";

    // array
    if (t === "array") {
        if (Array.isArray(node.prefixItems)) {
            // tuple
            return "[" + node.prefixItems.map((p) => tsType(p, ctx)).join(", ") + "]";
        }
        const item = tsType(node.items || {}, ctx);
        return "Array<" + item + ">";
    }

    // object — inline
    if (t === "object" || node.properties) {
        return objectTs(node, ctx);
    }

    // union of types: ["string", "null"] etc.
    if (Array.isArray(t)) {
        return t.map((sub) => tsType({ type: sub }, ctx)).join(" | ");
    }

    return "unknown";
}

function objectTs(node, ctx) {
    const props = node.properties || {};
    const required = new Set(node.required || []);
    const propEntries = Object.entries(props);
    const patternProps = node.patternProperties || {};
    const patternEntries = Object.entries(patternProps);

    // Pure-map case (patternProperties only, no fixed properties): emit
    // Record<string, ValueT>. Schemas like actuator_library.actuators and
    // controller_library.controllers use this pattern.
    if (propEntries.length === 0 && patternEntries.length > 0) {
        const valueTypes = patternEntries.map(([_, sub]) => tsType(sub, ctx));
        const valueT = valueTypes.length === 1
            ? valueTypes[0]
            : "(" + valueTypes.join(") | (") + ")";
        return `Record<string, ${valueT}>`;
    }

    // Empty object with no pattern: open record.
    if (propEntries.length === 0 && patternEntries.length === 0) {
        if (node.additionalProperties && typeof node.additionalProperties === "object") {
            return `Record<string, ${tsType(node.additionalProperties, ctx)}>`;
        }
        return "Record<string, unknown>";
    }

    const lines = ["{"];
    for (const [k, v] of propEntries) {
        const opt = required.has(k) ? "" : "?";
        const safeKey = /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(k) ? k : JSON.stringify(k);
        lines.push(`        ${safeKey}${opt}: ${indentMembers(tsType(v, ctx))};`);
    }
    // Mixed case (fixed + pattern): pattern values get an index signature.
    if (patternEntries.length > 0) {
        const valueTypes = patternEntries.map(([_, sub]) => tsType(sub, ctx));
        const valueT = valueTypes.length === 1
            ? valueTypes[0]
            : "(" + valueTypes.join(") | (") + ")";
        lines.push(`        [key: string]: ${valueT};`);
    } else if (node.additionalProperties && typeof node.additionalProperties === "object") {
        lines.push(`        [key: string]: ${tsType(node.additionalProperties, ctx)};`);
    }
    lines.push("    }");
    return lines.join("\n");
}

// Re-indent nested object/tuple bodies so they sit one level deeper than the
// containing property name. Without this, nested objects emit at column 0 and
// the generated TS looks (and reads) ragged though it still compiles.
function indentMembers(s) {
    if (!s.includes("\n")) return s;
    return s
        .split("\n")
        .map((line, i) => (i === 0 ? line : "    " + line))
        .join("\n");
}

// Top-level schema -> {root interface} + {one interface per $def}.
function emitSchema(schemaPath, schema) {
    const schemaId = pascalCase(path.basename(schemaPath, ".schema.yaml"));
    const ctx = { schemaId };
    const out = [];

    out.push(`// ----------------- ${path.basename(schemaPath)} -----------------`);
    if (schema.title) out.push(`// ${schema.title}`);
    if (schema.description) {
        for (const line of String(schema.description).split(/\r?\n/)) {
            out.push(`// ${line}`);
        }
    }

    // $defs (emit first, since root may reference them)
    const defs = schema.$defs || {};
    for (const [defName, def] of Object.entries(defs)) {
        const tsName = `Schema_${schemaId}_${pascalCase(defName)}`;
        out.push(`export type ${tsName} = ${tsType(def, ctx)};`);
        out.push("");
    }

    // root
    const rootName = `Schema_${schemaId}`;
    out.push(`export type ${rootName} = ${tsType(schema, ctx)};`);
    out.push("");
    return out.join("\n");
}

// --------------------------------------------------------------------------
// Main
// --------------------------------------------------------------------------

function main() {
    if (!fs.existsSync(SCHEMAS_DIR)) {
        console.error(`schemas/ not found at ${SCHEMAS_DIR}`);
        process.exit(1);
    }

    const files = fs.readdirSync(SCHEMAS_DIR)
        .filter((f) => f.endsWith(".schema.yaml"))
        .sort();

    console.log(`[gen-types] reading ${files.length} schema files from ${SCHEMAS_DIR}`);

    const sections = [BANNER, ""];
    for (const f of files) {
        const fullPath = path.join(SCHEMAS_DIR, f);
        const text = fs.readFileSync(fullPath, "utf8");
        const schema = YAML.parse(text);
        sections.push(emitSchema(fullPath, schema));
    }

    const outDir = path.dirname(OUT_FILE);
    if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(OUT_FILE, sections.join("\n"), "utf8");

    console.log(`[gen-types] wrote ${OUT_FILE}`);
}

main();
