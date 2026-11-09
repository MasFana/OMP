# OMP · Pi Pocket extension registry

Reviewed drop-in extensions and themes for [Pi Pocket](https://github.com/TannerMidd/pi-pocket). OMP publishes an immutable-file gallery index; it is **not** the Pocket runtime, an npm package, or a language-server distribution.

- **Repository:** [MasFana/OMP](https://github.com/MasFana/OMP)
- **Gallery identifier:** `MasFana/OMP`
- **Index:** [`index.json`](index.json) · [raw HTTPS endpoint](https://raw.githubusercontent.com/MasFana/OMP/main/index.json)
- **Authoring skill:** [`manage-extension`](.agents/skills/manage-extension/SKILL.md)

## Install an entry

As the Pocket owner, open **Menu → Extensions → Discover**, set the index at the bottom to `MasFana/OMP` or the raw endpoint above, and refresh. Inspect the source, declarations, processes/network access, and permissions before installing. Installation starts disabled; enable the module in **Installed** after review.

**Updates** are explicit owner actions, never automatically applied. Review the declaration/file diff, apply the update, and reload when prompted. Imported helper-code changes may require a Pocket restart. Gallery receipts (`<name>.gallery.json`) identify installed files and local modifications; reinstalling a published entry can replace a manual correction.

| Entry | Purpose | Requirements | Source |
|---|---|---|---|
| [`pi-lsp`](entries/pi-lsp.json) | Workspace-aware LSP tools, server management, and owner dashboard | Pocket ≥0.28.0; extension API 2 | [MasFana/pi-lsp](https://github.com/MasFana/pi-lsp) |

The entry JSON, not this table or its human version label, is authoritative for the pinned commit, files, API requirements, capabilities, and revocations.

## Repository contract

| Path | Role |
|---|---|
| `entries/<name>.json` | One source manifest per extension/theme; only JSON and `.gitkeep` belong here |
| `index.json` | Generated format-1 gallery index, deterministically sorted by entry name |
| `schema/{entry,theme,index}.schema.json` | Editor/build validation; Pocket's parser remains authoritative |
| `scripts/build-index.ts` | Validate manifests against schemas and regenerate the index; no runtime checkout needed |
| `scripts/validate.ts` | Pocket parser/compatibility/conflict checks, exact file hashes/sizes, real module-load declarations or theme validation |
| `scripts/{entries,schema}.ts` | Shared manifest/index and JSON Schema implementation |
| `.agents/skills/manage-extension/` | Extension design, implementation, security, verification, and publishing guidance |

An extension manifest specifies `name`, `title`, `description`, `tags`, `author`, `version`, `source`, `files`, `pocketApi`, `minPocket`, and `declares`; `revoked` is optional. `source.repo` is `owner/repository`, `source.commit` is a **published full 40-character commit**, and `source.path` optionally locates its bundle directory.

Every file declares its relative `name`, byte `size`, and lowercase SHA-256. Bundles include `<name>.ts`; browser files may be `<name>.js`, `<name>.mjs`, or files under `<name>/`. Helpers must be inside that same bundle directory. Do not ship `node_modules`, linked `_pocket.d.ts`, hidden files, machine-specific imports, private credentials, or arbitrary root assets. Names cannot shadow built-ins or start with `pocket-`.

`declares` must equal the loaded module: extension/tool names, read-only tools, hooks, **prompt sections** (not browser sheets), wrapped tools, HTTP routes, slash commands, browser-client audience, and web-access audience. Lists are compared as sets; stale or missing registrations fail validation. Tool visibility, `readOnlyTools`, and an owner-only client are **not** server authorization substitutes.

Themes use `kind: "theme"`, `themeApi`, and `<name>/…` assets rather than an extension factory/`declares`. They receive Pocket's theme parser/CSS checks and execute no extension code. Consult [entry fields](https://github.com/TannerMidd/pi-pocket/blob/main/docs/extensions/reference/gallery-entry.md), [name rules](https://github.com/TannerMidd/pi-pocket/blob/main/docs/extensions/reference/names.md), and [current limits](https://github.com/TannerMidd/pi-pocket/blob/main/docs/extensions/reference/limits.md#gallery). Extension files are ≤512 KiB each, ≤50 files and ≤2 MiB together; the index is ≤4 MiB and ≤2,000 entries. Theme bounds differ.

## Development and validation

Use **Node.js ≥22.19.0**. These scripts run native TypeScript and require no dependencies in OMP. Full validation also needs a compatible [Pocket checkout](https://github.com/TannerMidd/pi-pocket) with its npm dependencies installed; the current LSP entry requires Pocket ≥0.28.0. A sibling `../pi-pocket` is the npm-script default; override it with `POCKET_DIR` or use explicit `--pocket`.

From this repository:

```sh
npm run build
npm run validate
# Equivalent explicit full check: downloads pinned files and executes the load test.
node scripts/validate.ts --pocket ../pi-pocket
# Select particular entries; all manifests still undergo structural/conflict checks.
node scripts/validate.ts --pocket ../pi-pocket --only pi-lsp
# Local bundle proof; hashes and sizes must already describe those exact bytes.
node scripts/validate.ts --pocket ../pi-pocket --local ../pi-lsp --only pi-lsp
# Entries changed between a base ref and HEAD; not uncommitted working-tree changes.
node scripts/validate.ts --pocket ../pi-pocket --changed origin/main
```

| Option | Meaning |
|---|---|
| `build-index.ts --entries DIR --out FILE` | Alternative manifest directory/output; defaults to this repository's `entries/` and `index.json` |
| `validate.ts --pocket DIR` | Required runtime checkout for parser, dependencies, isolated test app, and theme loader |
| `--entries DIR` | Alternative manifest directory |
| `--local DIR` | Read bundle/theme files locally instead of GitHub; still check exact hashes and execute selected module load tests |
| `--only NAME` | Repeatable selection; an unknown name is an error; takes precedence over `--changed` |
| `--changed REF` | Select changed entry files between `REF` and `HEAD` |

There is no `--skip-load` mode. A successful local check does not prove that a source commit is public or downloadable. The validator builds and parses a proposed index but **does not write** `index.json`; run the build separately. A withdrawn entry (its current commit is in `revoked`) still gets manifest checks but its code/files are not loaded.

## Author and publish

Start with the [authoring skill](.agents/skills/manage-extension/SKILL.md), [Pocket's first-extension guide](https://github.com/TannerMidd/pi-pocket/blob/main/docs/extensions/first-extension.md), and [public type/API references](https://github.com/TannerMidd/pi-pocket/tree/main/docs/extensions/reference). The skill covers tools, prompt sections/wrappers/hooks, commands/events, session/workspace identity, authenticated routes, browser modules, cleanup, storage/security, public pages, services/settings, sessions/links, and themes.

1. Build a self-contained drop-in using supported public dependencies and the current factory/API contract. Resolve session workspaces from Durable's execution API, not `process.cwd()`; authorize global effects through the current requester. Browser requests should use module-relative `pocket.api()`; Pocket requires `X-Pocket: 1` on **all** extension methods, including GET.
2. Read the code for privilege boundaries and resource lifetime. Run meaningful behavioral regressions and exercise the actual UI/CLI/API path. Schema/load checks alone do not prove runtime behavior or safety.
3. Commit and **push the extension/theme source first**. Do not pin working-tree bytes to an older commit or fabricate a future commit.
4. Use Pocket **Installed → Share…** to draft exact files/hashes and loaded declarations, or generate them from the committed bundle. Fill repository, full commit, optional source directory, tags, author, version, minimum Pocket version, and required API. Copy the manifest to `entries/<name>.json`.
5. Run full validation **without `--local`** so the published files are fetched over HTTPS and checked. Rebuild `index.json`; review source-manifest and generated-index changes together.
6. Commit and push OMP's manifest/index/docs. Owners refresh the gallery, inspect the update, and explicitly apply it. Keep tests/docs in the source repository even when they are not gallery bundle files.

For updates, refresh the pinned commit, hashes, sizes, capability declarations, and compatibility minimum together. Preserve prior revocations; add a commit/reason only for a genuine withdrawal, such as a security flaw. Human version strings do not select upgrades: Pocket compares commits. For the LSP-specific release procedure, see [Pi LSP](https://github.com/MasFana/pi-lsp#development-and-publication).

## Safety and troubleshooting

**The validator executes selected extension code.** Its temporary test app is isolation of app data, not an OS sandbox. Read untrusted code first; run checks without production credentials, privileged tokens, or write-capable CI credentials. This repository currently has no automated CI workflow; maintainers run the commands above before publication.

| Symptom | Check |
|---|---|
| Entry missing from Discover | Index refresh, strict schema/parser errors, API/minimum Pocket version, withdrawal status |
| Hash/size mismatch or download failure | Public pushed commit, `source.path`, exact committed bytes, reachable GitHub raw files |
| Module loads but validation fails | Actual registrations versus `declares`, built-in/duplicate names, client/access scopes |
| Browser 403 or apparently empty status | Current loaded revision, owner/session access, `pocket.api()` and `X-Pocket: 1`; expose HTTP errors instead of showing an empty result |
| Local correction disappears | Gallery reinstall/update replaced modified receipt-owned files; publish a new source pin rather than relying on manual patches |
| Theme rejected | Theme parser/version, required folder files, allowed CSS surface, asset/path limits |

Review policy: [gallery review](https://github.com/TannerMidd/pi-pocket/blob/main/docs/extensions/policies/gallery-review.md) · [security model](https://github.com/TannerMidd/pi-pocket/blob/main/docs/extensions/policies/security-model.md) · [API stability](https://github.com/TannerMidd/pi-pocket/blob/main/docs/extensions/policies/api-stability.md).
