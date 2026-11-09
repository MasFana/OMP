# Gallery manifests, themes, and release integrity

OMP: [MasFana/OMP](https://github.com/MasFana/OMP). Runtime specification: Pocket's [gallery entry reference](https://github.com/TannerMidd/pi-pocket/blob/main/docs/extensions/reference/gallery-entry.md), [name rules](https://github.com/TannerMidd/pi-pocket/blob/main/docs/extensions/reference/names.md), and [limits](https://github.com/TannerMidd/pi-pocket/blob/main/docs/extensions/reference/limits.md#gallery). Pocket's parser is authoritative when the copied JSON Schema differs.

## Source and manifest contract

One manifest is `entries/<name>.json`; generated `index.json` has format 1 and is deterministically sorted. Do not put source files or arbitrary documentation in `entries/`.

| Field | Meaning / required evidence |
|---|---|
| `name`, `title`, `description`, `tags`, `author` | Valid plain metadata; describe actual effects, dependencies and authority, not a marketing feature claim |
| `version` | Human release label; Pocket detects updates by commit, not semantic version ordering |
| `source.repo` | Public GitHub `owner/repository` |
| `source.commit` | Full lowercase 40-character ID of a **pushed** commit containing the exact bundle |
| `source.path` | Optional bundle directory in that commit, otherwise repository root |
| `files` | Complete relative bundle names, lowercase SHA-256, and actual byte sizes; never invented or copied from another version |
| `pocketApi` / `minPocket` | Extension API and oldest Pocket actually supporting used APIs; current-target tools returning `output` require API 2 |
| `declares` | Exact loaded registrations and audience; optional omitted empty lists normalize according to parser rules |
| `revoked` | Genuine withdrawn commits with reasons; retain earlier revocations; revoking the current pin withdraws the entry |

See OMP's [actual Pi LSP manifest](../../../entries/pi-lsp.json) for a real entry. Do not copy a demonstration commit or the hash of empty text and claim it belongs to a source file. Pocket **Installed → Share…** computes files/hashes and, for an enabled module, loaded declarations; fill the remaining source/author/version fields from the real release.

### Names, layout, and bundle review

- Extension names have 2–64 lowercase letters/digits/`_`/`-`, begin with a letter/digit, and cannot start `pocket-` or shadow built-ins. Commands begin with a letter and contain a hyphen. Use a unique prefix; validate current reserved names through Pocket rather than maintaining a stale hand-written list.
- Required entry file: `<name>.ts`. Browser entry: `<name>.js`, `<name>.mjs`, or `<name>/index.js`; helpers/assets remain inside `<name>/`. Local runtime imports must be explicit and self-contained.
- File paths have no hidden segments, `node_modules`, traversal, Windows device names, trailing dots, case collisions, or file/directory overlaps. File/bundle limits are in [contracts.md](contracts.md); theme IDs have different rules.
- Keep tests, READMEs and lockfiles in the source repository, but only permitted runtime bundle files in the manifest. Never ship linked `_pocket.d.ts`, machine-specific paths, credentials, gallery receipts, or dependency caches.
- Pocket downloads only the allowed HTTPS GitHub raw source, verifies every file, and installs all-or-none. It additionally requires code/text bundle validity and rejects direction-changing characters; a load/hashing check alone is not a security review or an installer-proof substitute.

### What `declares` means

| Declaration | Actual registrations |
|---|---|
| `extensions` | Names returned by the factory |
| `tools` / `readOnlyTools` | Loaded tools and the subset declaring `readOnlyHint` |
| `hooks` | Registered handler names, e.g. `beforeTool`, `afterTool`, `beforeRequest`, `afterResponse`, `onYield`, `afterTools` |
| `sections` | Model prompt sections, not browser UI IDs |
| `wraps` | Wrapped target with kind, e.g. `tool bash` or `section memory` |
| `routes` | Method plus module-relative path, e.g. `GET c/:conversation/workspace` |
| `commands` | Scope plus name, without slash, e.g. `conversation sample-words` |
| `client` | Browser audience (`owner`, `steer`, `view`) or null |
| `access` | Loaded web-access envelope; must not be narrower than the client; individual routes may be narrower |

OMP compares loaded lists as sets, normalized command names, and audience values. Do not pad declarations with a feature that was never implemented, omit a real registration, or call read-only hints authorization.

## Themes: complete local example

A theme is **not** an executable extension. Entries have `kind: "theme"`, `themeApi`, `minPocket`, source/files/metadata, and no extension `pocketApi`/`declares`. Theme IDs use 2–48 lowercase letters/digits/hyphens and cannot shadow built-in themes/palettes or `desktop`. Assets install under `themes/<id>/`.

The following three files make a small current-target theme; these are real local theme contents, **not a fake gallery manifest**. Copy them into an isolated copy's `data/themes/omp-paper/`, then choose the theme/colors in Appearance.

### `omp-paper/theme.json`
```json
{
  "themeApi": 1,
  "name": "OMP Paper",
  "description": "Compact cards with a high-contrast dark palette.",
  "version": "1.0.0",
  "minPocket": "0.28.0"
}
```

### `omp-paper/theme.css`
```css
:root {
    --r-card: 4px;
}
```

### `omp-paper/colors.toml`
```toml
background = "#16161d"
foreground = "#e6e6e8"
accent = "#9cc4ff"
```

`theme.json` is required for CSS; a palette-only folder can use `colors.toml` without it. `colors-light.toml` optionally supplies a light palette. Preserve font/image licensing, use documented tokens/parts/states, and inspect light/dark and narrow/wide layouts before publication. Pocket's theme loader validates CSS/imports/assets without executing code. Full theme surface: [reference/theme-surface.md](https://github.com/TannerMidd/pi-pocket/blob/main/docs/extensions/reference/theme-surface.md).

## OMP commands and release order

Use Node ≥22.19.0 and a compatible Pocket checkout with dependencies installed. From OMP:

```sh
npm run build
npm run validate
node scripts/validate.ts --pocket ../pi-pocket --only pi-lsp
node scripts/validate.ts --pocket ../pi-pocket --local ../pi-lsp --only pi-lsp
```

| Option | Actual behavior |
|---|---|
| `--pocket DIR` | Required runtime checkout; the npm script defaults to `../pi-pocket` or `POCKET_DIR` |
| `--entries DIR` | Alternate manifest directory |
| `--local DIR` | Read files locally instead of downloading; still hash/check and execute selected load tests |
| `--only NAME` | Repeatable download/load selection; takes precedence over `--changed`; all entries still receive structural/conflict checks |
| `--changed REF` | Select committed entry changes between REF and HEAD, not unstaged working-tree changes |
| Build `--entries DIR --out FILE` | Alternate input/output for `scripts/build-index.ts` |

There is **no `--skip-load`**. A withdrawn current pin gets structural checks but is not downloaded/loaded. Full validation parses the proposed index but does not write it; `build-index.ts` writes it. Module load tests execute third-party code in temporary app data, not an OS sandbox: review first and avoid production credentials/write-capable CI privileges.

1. Implement and exercise the real tool/UI/API/theme behavior; review identity, imports, shell/network/file effects, secrets, replay, and cleanup.
2. Commit and **push source first**; get its full commit identity. Compute file bytes/hashes from that exact committed bundle or Pocket Share; local bytes must not be labelled as an older commit.
3. Update the manifest's source pin, human version, complete files, declarations and compatibility minimum together. Preserve actual revocations.
4. For local preflight use `--local` with matching temporary metadata. For publication run the validator **without `--local`** to fetch the real pushed commit and compare loaded declarations or validate the theme.
5. Build the index; commit and push OMP's source manifest and generated index together. Do not invent a date or hand-edit generated entries independently.
6. Owner refreshes **Menu → Extensions → Discover**, reviews **Updates**, and explicitly applies it. Installs start disabled; updates never self-apply. Imported helper changes may require restart.
7. Verify the new loaded revision and real surface. Gallery receipts track local edits; an old published pin can overwrite a manual patch. A public pushed commit, passing remote-file validation, and the correct served index are publication evidence—not a local test alone.
