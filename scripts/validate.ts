/**
 * The full check of the entries, with a Pi Pocket checkout. For every entry: the JSON Schema, Pi Pocket's own
 * parseEntry (parseThemeEntry for a theme), the file name, and names that two entries share. For the entries to test
 * (all, or those that --only or --changed select): the pinned files are downloaded and their sizes and SHA-256 hashes
 * checked. Then an extension's module is loaded in a test Pi Pocket and what it installs is compared with its
 * `declares`; a theme gets Pi Pocket's theme check (readTheme: theme.json, colors.toml, and the CSS), and runs no code.
 *
 * Usage: node scripts/validate.ts --pocket <Pi Pocket folder> [--entries <folder>] [--local <folder>]
 *        [--only <name>]… [--changed <git ref>]
 *
 *   --local <folder>   Read the files from this folder (laid out as the drop-in folder, or as the themes folder
 *                      for a theme) and download nothing.
 *   --only <name>      Download and load only this entry. Repeat it for more.
 *   --changed <ref>    Download and load only the entries changed since <ref> (git diff). For pull requests.
 *
 * The load test runs the entry's code. Run it only where that is safe: in CI with read-only rights, or on your
 * computer after you read the code.
 */
import { execFile } from "node:child_process";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
import { parseArgs, promisify } from "node:util";
import { fileURLToPath, pathToFileURL } from "node:url";
import { buildIndex, indexText, readEntries } from "./entries.ts";
import { loadSchemas } from "./schema.ts";

const REPO = dirname(dirname(fileURLToPath(import.meta.url)));
const { values: options } = parseArgs({
    options: {
        pocket: { type: "string" },
        entries: { type: "string", default: join(REPO, "entries") },
        local: { type: "string" },
        only: { type: "string", multiple: true },
        changed: { type: "string" },
    },
});

if (options.pocket === undefined) {
    console.error("Give the Pi Pocket folder with --pocket <folder>.");
    process.exit(2);
}

const pocket = resolve(options.pocket);
const entriesDir = resolve(options.entries);

// Types for what this script uses from Pi Pocket: it is imported at run time, from the folder given.
type Access = "owner" | "steer" | "view";
interface Declares {
    extensions: string[];
    tools: string[];
    readOnlyTools: string[];
    hooks: string[];
    sections: string[];
    wraps: string[];
    routes: string[];
    client: Access | null;
    access: Access;
    /** Its slash commands, each with its scope: `conversation clock-zone`. Optional: older entries do not have it. */
    commands?: string[];
}
interface Entry {
    kind?: undefined;
    name: string;
    source: { repo: string; commit: string; path: string };
    files: { name: string; sha256: string; size: number }[];
    declares: Declares;
    revoked: { commit: string; reason: string }[];
}
/** A theme's entry: a theme folder's files, `<name>/…`, and no `declares`. */
interface ThemeEntry {
    kind: "theme";
    name: string;
    source: { repo: string; commit: string; path: string };
    files: { name: string; sha256: string; size: number }[];
    revoked: { commit: string; reason: string }[];
}
interface ModuleInfo {
    file: string;
    error?: string;
    extensions: ({ name: string } & Pick<
        Declares,
        "tools" | "readOnlyTools" | "hooks" | "sections" | "wraps"
    >)[];
    web?: { routes: string[]; client?: Access; access?: Access; commands?: string[] };
}

const LISTS = [
    "extensions",
    "tools",
    "readOnlyTools",
    "hooks",
    "sections",
    "wraps",
    "routes",
    "commands",
] as const;

const schemas = await loadSchemas(join(REPO, "schema"));
const files = await readEntries(entriesDir, schemas);
/** The problems found, by entry file. */
const problems = new Map(files.map((file) => [file.file, [...file.problems]]));
const report = (file: string, problem: string) => problems.get(file)!.push(problem);

// ─── Which entries to download and load ──────────────────────────────────────────────

async function changedFiles(ref: string): Promise<string[]> {
    const { stdout } = await promisify(execFile)(
        "git",
        ["diff", "--name-only", "--diff-filter=d", ref, "HEAD", "--", entriesDir],
        { cwd: REPO },
    );

    return stdout
        .split("\n")
        .filter((line) => line.endsWith(".json"))
        .map((line) => basename(line));
}

let selected: string[];

if (options.only !== undefined) {
    selected = options.only.map((name) => `${name}.json`);

    for (const file of selected) {
        if (!problems.has(file)) {
            console.error(`--only: there is no entries/${file}.`);
            process.exit(2);
        }
    }
} else if (options.changed !== undefined) {
    selected = (await changedFiles(options.changed)).filter((file) => problems.has(file));
} else {
    selected = files.map((file) => file.file);
}

// The test helpers set Pi Pocket's folders before anything else of Pi Pocket loads, so they come first.
const helpers =
    selected.length > 0
        ? await import(pathToFileURL(join(pocket, "test", "helpers.ts")).href)
        : undefined;
const gallery = await import(pathToFileURL(join(pocket, "src/server/gallery/entry.ts")).href);
const { THEME_LIMITS } = await import(
    pathToFileURL(join(pocket, "src/server/themes/format.ts")).href
);
const { POCKET_API } = await import(
    pathToFileURL(join(pocket, "src/server/extension-web.ts")).href
);
const pocketVersion = (
    JSON.parse(await readFile(join(pocket, "package.json"), "utf8")) as { version: string }
).version;
const here = { api: POCKET_API as number, version: pocketVersion };

// ─── Every entry: Pi Pocket's own reader, and names ─────────────────────────────────

const parsed = new Map<string, Entry | ThemeEntry>();

for (const file of files) {
    if (file.value === undefined) {
        continue;
    }

    try {
        const theme = (file.value as { kind?: unknown }).kind === "theme";

        parsed.set(
            file.file,
            theme
                ? (gallery.parseThemeEntry(file.value) as ThemeEntry)
                : (gallery.parseEntry(file.value) as Entry),
        );
    } catch (error) {
        if (!(error instanceof gallery.EntryError)) {
            throw error;
        }

        report(file.file, `Pi Pocket does not accept the entry: ${(error as Error).message}.`);
        continue;
    }

    if (gallery.compatibility(file.value, here) === "newer") {
        report(
            file.file,
            `The entry needs a newer Pi Pocket than the checks use (${pocketVersion}, extension API ${POCKET_API}). A maintainer must update POCKET_REF in the workflow.`,
        );
    }
}

/** Which entry claims each name: a module, an extension, or a tool. */
const claims = new Map<string, string>();

for (const [file, entry] of parsed) {
    for (const claim of gallery.claimedNames(entry) as string[]) {
        const other = claims.get(claim);

        if (other === undefined) {
            claims.set(claim, file);
        } else {
            report(file, `entries/${other} has the ${claim} too. Use a different name.`);
        }
    }
}

// The index made of them must be one Pi Pocket reads whole.
const allValid = [...problems.values()].every((each) => each.length === 0);

if (allValid) {
    const text = indexText(buildIndex(files.map((file) => file.value)));
    const index = gallery.parseIndex(text, here);

    if (Buffer.byteLength(text) > gallery.LIMITS.index) {
        console.error(`index.json would be more than ${gallery.LIMITS.index} bytes.`);
        process.exitCode = 1;
    }

    for (const invalid of index.invalid as { name?: string; problem: string }[]) {
        console.error(`index.json: Pi Pocket does not accept ${invalid.name}: ${invalid.problem}.`);
        process.exitCode = 1;
    }
}

// ─── Selected entries: the files, and a load test ────────────────────────────────────

/**
 * Get a URL over https only, with at most `max` bytes in the body. As Pi Pocket does (src/server/gallery/fetch.ts), a
 * redirect must stay on the same host, three times at most: so the checks never accept a file that Pi Pocket refuses.
 */
async function download(url: string, max: number): Promise<Uint8Array> {
    const host = new URL(url).host;
    let address = url;

    for (let hops = 0; hops <= 3; hops++) {
        if (new URL(address).protocol !== "https:") {
            throw new Error(`a redirect goes to an address that is not https: ${address}`);
        }

        if (new URL(address).host !== host) {
            throw new Error(`a redirect goes to another host: ${address}`);
        }

        const response = await fetch(address, {
            redirect: "manual",
            signal: AbortSignal.timeout(60_000),
        });

        if (response.status >= 300 && response.status < 400) {
            address = new URL(response.headers.get("location") ?? "", address).href;
            await response.body?.cancel();
            continue;
        }

        if (!response.ok || response.body === null) {
            await response.body?.cancel();
            throw new Error(`GitHub gave the status ${response.status} for ${url}`);
        }

        const chunks: Uint8Array[] = [];
        let size = 0;

        for await (const chunk of response.body) {
            size += chunk.length;

            if (size > max) {
                throw new Error(`the file at ${url} is more than ${max} bytes`);
            }

            chunks.push(chunk);
        }

        return Buffer.concat(chunks);
    }

    throw new Error(`there are too many redirects for ${url}`);
}

/** The entry's files, by name, from GitHub at the pinned commit or from --local. */
async function getFiles(entry: Entry | ThemeEntry, report: (problem: string) => void) {
    const max = entry.kind === "theme" ? (THEME_LIMITS.asset as number) : gallery.LIMITS.file;

    const got = new Map<string, Uint8Array>();

    for (const file of entry.files) {
        let bytes: Uint8Array;

        try {
            if (options.local !== undefined) {
                const path = join(resolve(options.local), file.name);

                if ((await stat(path)).size > max) {
                    throw new Error(`the file is more than ${max} bytes`);
                }

                bytes = await readFile(path);
            } else {
                // One byte more than the entry says, so a larger file shows as one.
                bytes = await download(gallery.fileUrl(entry, file.name), file.size + 1);
            }
        } catch (error) {
            report(`Cannot get ${file.name}: ${(error as Error).message}.`);
            continue;
        }

        if (bytes.length !== file.size) {
            report(`${file.name} has ${bytes.length} bytes, but the entry says ${file.size}.`);
        } else if (gallery.sha256(bytes) !== file.sha256) {
            report(
                `The SHA-256 of ${file.name} is ${gallery.sha256(bytes)}, but the entry says ${file.sha256}.`,
            );
        }

        got.set(file.name, bytes);
    }

    return got;
}

/** What the module installs, in the form of `declares`. */
function actual(module: ModuleInfo): Declares {
    const union = (key: "tools" | "readOnlyTools" | "hooks" | "sections" | "wraps") => [
        ...new Set(module.extensions.flatMap((extension) => extension[key])),
    ];

    return {
        extensions: module.extensions.map((extension) => extension.name),
        tools: union("tools"),
        readOnlyTools: union("readOnlyTools"),
        hooks: union("hooks"),
        sections: union("sections"),
        wraps: union("wraps"),
        routes: module.web?.routes ?? [],
        client: module.web?.client ?? null,
        access: module.web?.access ?? "owner",
        // Pi Pocket lists them as "conversation /clock-zone"; an entry writes "conversation clock-zone".
        commands: (module.web?.commands ?? []).map((command) => command.replace(" /", " ")),
    };
}

/** How `declares` differs from what the module installs, one line for each difference. Order does not count. */
function differences(declared: Declares, has: Declares): string[] {
    const lines: string[] = [];

    for (const key of LISTS) {
        const wanted = declared[key] ?? [];
        const found = has[key] ?? [];

        for (const item of found.filter((each) => !wanted.includes(each))) {
            lines.push(`declares.${key} does not have "${item}", but the module installs it.`);
        }

        for (const item of wanted.filter((each) => !found.includes(each))) {
            lines.push(`declares.${key} has "${item}", but the module does not install it.`);
        }
    }

    for (const key of ["client", "access"] as const) {
        if (declared[key] !== has[key]) {
            lines.push(
                `declares.${key} is ${JSON.stringify(declared[key])}, but the module has ${JSON.stringify(has[key])}.`,
            );
        }
    }

    return lines;
}

/** Load the module in a new test Pi Pocket, turn it on, and compare what it installs with `declares`. */
async function loadTest(entry: Entry, got: Map<string, Uint8Array>): Promise<string[]> {
    const dataDir = join(helpers.root, `data-${entry.name}`);

    for (const [name, bytes] of got) {
        const path = join(dataDir, "extensions", name);

        await mkdir(dirname(path), { recursive: true });
        await writeFile(path, bytes);
    }

    const app = await helpers.openApp(helpers.scriptedModel(), dataDir);

    try {
        const owner = helpers.owner(app);
        const file = `${entry.name}.ts`;

        try {
            await app.setExtensionEnabled(owner, file, true);
        } catch (error) {
            return [`The module did not load: ${(error as Error).message}`];
        }

        const modules = (await app.extensions(owner)).modules as ModuleInfo[];
        const module = modules.find((each) => each.file === file);

        if (module === undefined) {
            return [`Pi Pocket did not find the module ${file}.`];
        }

        if (module.error !== undefined) {
            return [`The module did not load: ${module.error}`];
        }

        return differences(entry.declares, actual(module));
    } finally {
        await app.close();
    }
}

/**
 * Pi Pocket's theme check on a theme's files, in a folder of the test Pi Pocket: the same check that Pi Pocket does
 * before it installs the theme. No code runs.
 */
async function themeCheck(entry: ThemeEntry, got: Map<string, Uint8Array>): Promise<string[]> {
    const { readTheme } = await import(pathToFileURL(join(pocket, "src/server/themes.ts")).href);
    const dir = join(helpers.root, `theme-${entry.name}`);

    for (const [name, bytes] of got) {
        const path = join(dir, name);

        await mkdir(dirname(path), { recursive: true });
        await writeFile(path, bytes);
    }

    try {
        readTheme(join(dir, entry.name), entry.name, false, pocketVersion);
    } catch (error) {
        return [`Pi Pocket's theme check refuses it: ${(error as Error).message}.`];
    }

    return [];
}

/**
 * Whether the entry is withdrawn: its pinned commit is revoked. Pi Pocket does not install it, so its files are not
 * tested: a withdrawn entry that no longer loads must not stop the checks of every other entry.
 */
function withdrawn(entry: Entry | ThemeEntry): boolean {
    return entry.revoked.some((each) => each.commit === entry.source.commit);
}

try {
    for (const file of selected) {
        const entry = parsed.get(file);

        if (entry === undefined || problems.get(file)!.length > 0 || withdrawn(entry)) {
            continue;
        }

        const before = problems.get(file)!.length;
        const got = await getFiles(entry, (problem) => report(file, problem));

        if (problems.get(file)!.length === before) {
            const found =
                entry.kind === "theme" ? await themeCheck(entry, got) : await loadTest(entry, got);

            for (const problem of found) {
                report(file, problem);
            }
        }
    }
} finally {
    helpers?.cleanUp();
}

// ─── Report ──────────────────────────────────────────────────────────────────────────

let failed = 0;

for (const [file, list] of problems) {
    if (list.length === 0) {
        const entry = parsed.get(file);
        const tested =
            entry !== undefined && withdrawn(entry)
                ? "the format; withdrawn, so its files are not tested"
                : selected.includes(file)
                  ? entry?.kind === "theme"
                      ? "the files and the theme check"
                      : "the files and the load test"
                  : "the format";

        console.log(`OK    entries/${file} (${tested})`);
        continue;
    }

    failed++;
    console.log(`FAIL  entries/${file}`);

    for (const problem of list) {
        console.log(`      - ${problem}`);
    }
}

if (failed > 0 || process.exitCode === 1) {
    console.log(
        `\nEntries with problems: ${failed} of ${files.length}. Correct them and do the check again.`,
    );
    process.exit(1);
}

console.log(`\nThe checks passed. Entries: ${files.length}.`);
// The test app can leave timers that keep Node running.
process.exit(0);
