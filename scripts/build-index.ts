/**
 * Make index.json from entries/*.json: each entry is checked against schema/entry.schema.json, and the index has them
 * sorted by name. This needs no Pi Pocket. validate.ts does the full check.
 *
 * Usage: node scripts/build-index.ts [--entries <folder>] [--out <file>]
 */
import { writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { parseArgs } from "node:util";
import { fileURLToPath } from "node:url";
import { buildIndex, indexText, readEntries } from "./entries.ts";
import { check, loadSchemas } from "./schema.ts";

const REPO = dirname(dirname(fileURLToPath(import.meta.url)));
const { values: options } = parseArgs({
    options: {
        entries: { type: "string", default: join(REPO, "entries") },
        out: { type: "string", default: join(REPO, "index.json") },
    },
});

const schemas = await loadSchemas(join(REPO, "schema"));
const entries = await readEntries(options.entries, schemas);
const failed = entries.filter((entry) => entry.problems.length > 0);

for (const entry of failed) {
    for (const problem of entry.problems) {
        console.error(`entries/${entry.file}: ${problem}`);
    }
}

const index = buildIndex(entries.map((entry) => entry.value));
const indexProblems = failed.length > 0 ? [] : check(index, schemas["index.schema.json"]!, schemas);

for (const problem of indexProblems) {
    console.error(`index.json: ${problem}`);
}

if (failed.length > 0 || indexProblems.length > 0) {
    console.error("The index was not written. Correct the problems above.");
    process.exit(1);
}

await writeFile(options.out, indexText(index));
console.log(`Wrote ${options.out} with ${index.extensions.length} extensions.`);
