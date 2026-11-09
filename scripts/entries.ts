/** Reading `entries/` and making the index of it: what build-index.ts and validate.ts share. */
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { check, type Schema } from "./schema.ts";

export const INDEX_NAME = "OMP Pi Pocket Extensions";
export const INDEX_REPO = "https://github.com/MasFana/OMP";

/** One file of `entries/`: its JSON, when it is JSON, and what is wrong with it. */
export interface EntryFile {
    /** The file's name in `entries/`. */
    file: string;
    value: unknown;
    problems: string[];
}

/**
 * Read every file in `directory` and check each against the entry schema. A file must be `<name>.json`, with the
 * entry's own name. `.gitkeep` is ignored.
 */
export async function readEntries(
    directory: string,
    schemas: Record<string, Schema>,
): Promise<EntryFile[]> {
    const files = (await readdir(directory)).filter((file) => file !== ".gitkeep").sort();
    const entries: EntryFile[] = [];

    for (const file of files) {
        const entry: EntryFile = { file, value: undefined, problems: [] };

        entries.push(entry);

        if (!file.endsWith(".json")) {
            entry.problems.push("Only <name>.json files can be in entries/. Remove this file.");
            continue;
        }

        try {
            entry.value = JSON.parse(await readFile(join(directory, file), "utf8"));
        } catch (error) {
            entry.problems.push(`The file is not valid JSON: ${(error as Error).message}`);
            continue;
        }

        // Pi Pocket's Share… leaves these for the author: say what to do, before the schema's words.
        const source = (entry.value as { source?: { repo?: unknown; commit?: unknown } } | null)
            ?.source;

        if (source?.repo === "your-github-name/your-repository" || source?.commit === "") {
            entry.problems.push(
                "source.repo or source.commit is not filled in. Put the files of the extension or theme in a public GitHub repository, and commit them. Then write that repository (owner/name) in source.repo, and the full 40-character ID of that commit in source.commit.",
            );
        }

        // A theme's entry has kind "theme"; an extension's has no kind.
        const kind = (entry.value as { kind?: unknown } | null)?.kind;

        entry.problems.push(
            ...check(
                entry.value,
                schemas[kind === "theme" ? "theme.schema.json" : "entry.schema.json"]!,
                schemas,
            ),
        );
        const name = (entry.value as { name?: unknown } | null)?.name;

        if (typeof name === "string" && file !== `${name}.json`) {
            entry.problems.push(`The name is ${name}. So the file name must be ${name}.json.`);
        }
    }

    return entries;
}

/** The index of these entries, sorted by name. It has no date, so the same entries always give the same file. */
export function buildIndex(values: unknown[]): {
    format: 1;
    name: string;
    repo: string;
    extensions: unknown[];
} {
    const name = (value: unknown) => String((value as { name: unknown }).name);
    const extensions = [...values].sort((a, b) =>
        name(a) < name(b) ? -1 : name(a) > name(b) ? 1 : 0,
    );

    return { format: 1, name: INDEX_NAME, repo: INDEX_REPO, extensions };
}

/** The index as its file has it. */
export function indexText(index: ReturnType<typeof buildIndex>): string {
    return `${JSON.stringify(index, null, 4)}\n`;
}
