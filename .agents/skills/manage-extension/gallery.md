# Gallery manifests, themes, and release integrity

OMP: [MasFana/OMP](https://github.com/MasFana/OMP). Runtime specification: Pocket's [gallery entry reference](https://github.com/TannerMidd/pi-pocket/blob/main/docs/extensions/reference/gallery-entry.md), [name rules](https://github.com/TannerMidd/pi-pocket/blob/main/docs/extensions/reference/names.md), and [limits](https://github.com/TannerMidd/pi-pocket/blob/main/docs/extensions/reference/limits.md#gallery). Pocket's parser is authoritative when the copied JSON Schema differs.

## Source and manifest contract

One manifest is `entries/<name>.json`; generated `index.json` has format 1 and is deterministically sorted. Do not put source files or arbitrary documentation in `entries/`.

| Field | Meaning / required evidence |
|---|---|
| `name`, `title`, `description`, `tags`, `author` | Valid plain metadata; describe actual effects, dependencies and authority, not a marketing feature claim |
| `version` | Human release label; a different commit is an update even with the same label (or a lower label) |
| `source.repo` | Public GitHub `owner/repository` |
| `source.commit` | Full lowercase 40-character ID of a **pushed** commit containing the exact bundle |
| `source.path` | Optional bundle directory in that commit, otherwise repository root |
| `files` | Complete relative bundle names, lowercase SHA-256, and actual byte sizes; never invented or copied from another version |
| `pocketApi` / `minPocket` | Extension API and oldest Pocket actually supporting used APIs; current-target tools returning `output` require API 2 |
| `declares` | Exact loaded registrations and audience; required lists stay present, even as `[]`; only `commands` is optional |
| `revoked` | Genuine withdrawn commits with reasons; retain earlier revocations; revoking the entry's current source commit withdraws it |

See OMP's [actual Pi LSP manifest](../../../entries/pi-lsp.json) for a real entry. Do not copy its commit/hashes, a demonstration pin, or the hash of empty text into another release. Pocket **Installed → Share…** checks a local drop-in's imports/layout and computes complete files/hashes; an enabled module also supplies loaded declarations. It makes no GitHub calls and does not prove that those bytes are committed or pushed. Use an isolated authoring copy without gallery provenance, with the exact committed runtime bundle; fill source/author/version fields from that release. Share refuses an already gallery-installed drop-in. Its compatibility draft is not evidence that every older Pocket supports your APIs: choose `minPocket` from the APIs used and the oldest release actually supported. See [contracts.md](contracts.md) for API/result contracts.

### Names, layout, and bundle review

- Gallery module names have 2–64 lowercase letters/digits/`_`/`-`, begin with a letter/digit, and cannot start `pocket-` or shadow built-ins. Registered extension/tool names have their own rules in Pocket's [name reference](https://github.com/TannerMidd/pi-pocket/blob/main/docs/extensions/reference/names.md). Commands begin with a letter and contain a hyphen. Use a unique prefix; validate current reserved names through Pocket rather than maintaining a stale hand-written list.
- Required entry file: `<name>.ts`. Browser entry: `<name>.js`, `<name>.mjs`, or `<name>/index.js`; helpers/assets remain inside `<name>/`. Local runtime imports must be explicit and self-contained.
- File paths have no hidden segments, `node_modules`, traversal, Windows device names, trailing dots, case collisions, or file/directory overlaps. File/bundle limits are in [contracts.md](contracts.md); theme IDs have different rules.
- Keep tests, READMEs and lockfiles in the source repository, but only permitted runtime bundle files in the manifest. Never ship linked `_pocket.d.ts`, machine-specific paths, credentials, gallery receipts, or dependency caches.
- Pocket downloads only the allowed HTTPS GitHub raw source, verifies every file, and installs all-or-none. It additionally requires code/text bundle validity and rejects direction-changing characters; a load/hashing check alone is not a security review or an installer-proof substitute.

### Immutable helper releases

Pocket prepares the drop-in folder's runtime package links; do not publish `node_modules` or install another loader. Keep every runtime helper/import/asset in the declared bundle and use only Pocket's available packages, Node built-ins, and explicit bundle-relative imports.

Native reload cache-busts the top-level `<name>.ts`, **not transitive TypeScript imports at unchanged paths**. When helper code changes, put the complete active helper set in a new immutable directory under `<name>/` (for example, move `runtime-v1/` to `runtime-v2/`), migrate **every importer** including helpers/tests/browser entrypoints where applicable, and remove obsolete active helper directories from source and `files`. Advance the directory revision even for a same-label correction. Do not leave one importer on the old helper graph, duplicate a server implementation, or add cache shims. The gallery removes old manifest-listed files that the next bundle no longer lists; unrelated owner files are not yours to delete.

The new factory initializes before the old version is disposed, so replacement must tolerate that overlap and release owned resources through native disposal; see [contracts.md](contracts.md). Versioned imports prevent same-path cache reuse, but do not override Pocket's restart advice: an enabled update with changed nested JS/TS/JSON code files reports `restart: true`. Reload the module through the native control, honor the server restart notice, and verify actual loaded behavior rather than assuming a successful disk replacement is a new runtime.

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

OMP compares loaded lists as sets, normalized command names, and audience values. All declaration fields above except `commands` are required by the current Pocket parser; use empty lists instead of omitting them. `readOnlyTools` must be a subset of `tools`. Do not pad declarations with a feature that was never implemented, omit a real registration, or call read-only hints authorization. Conditional registrations must still match the isolated load environment; a load test is not proof that every optional provider or installer works.

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

`theme.json` is required for CSS; a palette-only folder can use `colors.toml` (or `colors-light.toml`) without it. `colors-light.toml` optionally supplies a light half; include `mode = "light"` for a light palette. Preserve font/image licensing, use documented tokens/parts/states rather than private classes or translated labels, keep focus visible, respect user widths/reduced motion, and inspect light/dark and narrow/wide layouts before publication. Pocket validates theme CSS/imports/assets without executing code; remote/outside-folder URLs and code-like CSS are refused, but CSS can still hide or misrepresent approval UI, and browser-invalid CSS can be silently skipped. Theme installation does not select it for anyone: choose Theme/Colors in Appearance. Full surface: [reference/theme-surface.md](https://github.com/TannerMidd/pi-pocket/blob/main/docs/extensions/reference/theme-surface.md).

## OMP commands: local preflight versus publication

Use Node ≥22.19.0 and a compatible Pocket checkout with dependencies already installed. Pocket's helpers prepare runtime dependencies in the isolated extensions folder. The following commands run with **working directory `OMP/`**, alongside `../pi-pocket` and the example source repository `../pi-lsp`; set the tool's `cwd` accordingly. Replace `pi-lsp` and the source directory for another entry. Relative CLI paths resolve from that working directory, not from the script's directory.

```sh
# Local preflight against a bundle root laid out as the drop-in folder.
# PREFLIGHT_ENTRIES is an author-owned temporary entry directory for a genuine
# local candidate commit containing these exact files; do not invent a source pin.
rtk node scripts/validate.ts --pocket ../pi-pocket --entries "$PREFLIGHT_ENTRIES" --local ../pi-lsp --only pi-lsp

# Publication proof: fetch files from the pushed source.commit, then load/compare.
rtk node scripts/validate.ts --pocket ../pi-pocket --only pi-lsp

# Alternative: all entries, using package.json's Pocket path/default.
rtk npm run validate

# Only after remote validation: generate the registry's index.json.
rtk npm run build
```

Define `PREFLIGHT_ENTRIES` as a real author-owned temporary directory before the first command; include other entries too when checking full-registry conflicts. A manifest still needs a genuine full commit ID: for an unpublished preflight, commit the exact source candidate locally and derive the draft's bytes/hashes from that commit (it may be unpushed until publication). Before any candidate commit exists, run the actual isolated Pocket loader/tool/UI checks directly; do not invent a commit or attach uncommitted bytes to an older pin to satisfy the validator. With matching committed metadata, omit `--entries` to preflight `entries/`. For themes, `--local` names the parent containing `<id>/`, not the theme folder itself. Commands here are release instructions, not checks claimed to have run in this document.

Requiring the candidate commit to contain those bytes is **author release discipline**, not a `--local` validator guarantee: local mode checks commit syntax and the supplied file hashes/load, but never compares them to Git blobs or GitHub. Only the subsequent remote validation proves the published pin's bytes.

| Option | Actual behavior |
|---|---|
| `--pocket DIR` | Required on direct `validate.ts` invocation; `npm run validate` supplies `${POCKET_DIR:-../pi-pocket}` |
| `--entries DIR` | Alternate manifest directory; defaults to OMP's `entries/` |
| `--local DIR` | Reads `DIR/<files.name>` instead of downloading; still checks byte sizes/hashes and runs the selected extension load/theme checks |
| `--only NAME` | Repeatable download/load selection; takes precedence over `--changed`; every entry in the input still receives structural/compatibility/name-conflict checks |
| `--changed REF` | Uses committed entry changes from `git diff REF HEAD`, excluding deletions; does not select unstaged edits |
| Build `--entries DIR --out FILE` | `rtk node scripts/build-index.ts --entries DIR --out FILE`; defaults to OMP's entries and index |

There is **no `--skip-load`**. A withdrawn current commit still gets structural checks but its files are not downloaded/loaded. Full validation parses the proposed complete index but does not write it; `build-index.ts` writes deterministic, name-sorted format-1 JSON using the copied schemas and does not replace Pocket validation. A local pass proves only the local files supplied. A remote pass fetches the pinned GitHub files and compares their exact bytes/declarations (or the theme loader), not runtime feature/security correctness. Native gallery download additionally enforces plain UTF-8 code and rejects direction-changing text: do not treat an OMP hash/load pass as an exhaustive native-install or security proof.

Extension load tests execute third-party code in temporary app data, **not an OS sandbox**. Review first; use an isolated environment without production credentials or write-capable CI privileges. Runtime/provider/browser acceptance belongs in the authoring workflow in [SKILL.md](SKILL.md) and [example.md](example.md), not in a validator bypass.

## Release checklist: source first, registry second

1. **Finish the actual bundle.** Exercise its real tools/routes/browser/theme in isolation, with the used APIs and dependencies; review effects, authority, replay, resource lifetime and imports. Migrate helper versions/callsites as above. Exclude `_pocket.d.ts`, caches, secrets, gallery receipts, tests/docs/lockfiles and other non-runtime files from `files`, while keeping useful tests/docs in source control.
2. **Local preflight without false source identity.** First exercise the uncommitted candidate directly in an isolated Pocket. If using OMP manifest-based `--local`, make a genuine local candidate commit containing the exact runtime bundle, then derive matching sizes/hashes and loaded declarations for that commit; it need not be pushed until the next step. Do not invent a hash-shaped source ID or label uncommitted bytes as a previous release. Pocket Share can generate file metadata but does not establish Git identity; enable only in the reviewed isolated app to obtain real registration lists, never guessed lists.
3. **Commit and push source first.** Record the complete lowercase source commit ID. Generate the final file list, SHA-256 and byte sizes from each permitted runtime file's **Git blob at that exact commit**, or Share from an isolated copy materialized from that exact committed bundle. Do not hash filtered terminal text, normalized line endings, or a dirty working tree and label it as that commit. Include all imported helpers/assets, not just the main `.ts`/`.js`. If any byte changes, commit/push again and regenerate all metadata.
4. **Update the manifest together.** Set source repo/commit/path, human label, complete files, exact declarations, API version and supported minimum. Preserve genuine previous revocations. An update needs a different `source.commit`; changing only `version` or metadata at the installed commit is not an offered update. A same-version correction at a new commit is valid. The approval `pin` binds source/files/declarations (or theme kind/source/files); obtain it from Pocket, never manufacture or copy one.
5. **Validate the real public source.** Run the selected OMP validation **without `--local`** and without any skip-load option; its downloads must reach the pushed commit and its isolated module must load with matching declarations. Resolve discrepancies at source/manifest rather than suppressing checks. A private/unreachable/unpushed commit is not publishable evidence.
6. **Generate and publish the registry.** Build `index.json` after validation. Commit and push OMP's changed manifests and generated index together; do not hand-edit generated entries or fabricate a date. Confirm the index served by the intended gallery actually contains the new source commit. Local source/load success, a registry commit alone, or an old cached index is not end-to-end publication evidence.
7. **Owner reviews and applies through native Gallery**, then verifies loaded server/browser revision using the next section. Do not add automatic updates, replace Pocket's approval/Plan policy, or modify core to make publication appear successful.

## Native owner upgrade and loaded-revision checklist

Menu → **Extensions → Discover / Updates** is the normal owner flow. Select the intended index (`MasFana/OMP` for OMP); refresh it and read the offered source/declaration changes and file diff. Installs arrive **disabled** even if an old drop-in of the name was enabled. **Ask Pi to review** uses the native Plan-mode review session; the button does not send while Plan mode is off. The gallery's review GET only supplies `cwd`/`prompt`; it is not itself a review or authorization receipt.

The current implementation exposes these native routes; names below are the manifest name, while reload uses the module **filename**:

| Method and endpoint | Request / result |
|---|---|
| `GET /api/x/gallery/index?refresh=1` | Refresh/read the configured index; inspect errors/cached state and the intended entry |
| `GET /api/x/gallery/source/<name>` | Read the pinned source before trusting it |
| `POST /api/x/gallery/install/<name>` | `{pin: <pin from the listing/source review>}`; installs off |
| `GET /api/x/gallery/review/<name>` | Installed extension's review `cwd` and `prompt`; native UI starts the Plan session |
| `GET /api/x/gallery/update/<name>` | Preview: `from` has version/commit/repo; `to` has version/commit/repo/**pin**; plus `files`, `diff`, `edited`, `declares.before/after`, and `enabled` (theme declares are null) |
| `POST /api/x/gallery/update/<name>` | `{pin: preview.to.pin, enabled: preview.enabled}`; use `true` only if the reviewed preview says it is on; result includes `restart` |
| `POST /api/extensions/<name>.ts/reload` | Reload an enabled module; returns the current modules/errors; off modules return 409 |
| `GET /api/extension-settings/<module>` | Native loaded-module settings, e.g. `/api/extension-settings/pi-lsp`; **not** `/api/extensions/<module>/settings` |
| `PUT /api/extension-settings/<module>` | Owner changes declared settings as a plain name/value object; omitted secrets stay, `null` resets a field; secret values are not returned |

All gallery routes are owner-only. Send supported owner authentication plus **`X-Pocket: 1` on every extension-route method, including GET**; send JSON content type on JSON writes. Ordinary API writes/reload/settings PUT also require the header. Supported auth is a signed-in cookie or `Authorization: Bearer <in-memory owner token>` when no sign-in cookie is present; do not log, hardcode, inspect production config, or paste credentials into release scripts/docs. Use the native signed-in UI; isolated HTTP tests keep their owner token in memory. For an extension's **own** routes use `pocket.api(path, body?, {method?, signal?})`, which supplies module scope/auth/header, and `pocket.settings()` for its settings; `pocket.api` is not an arbitrary cross-module gallery/core client.

Before POST, **read every `edited` file** and resolve whether to preserve/rebase or intentionally replace local patches, including owner-created files a new bundle would overwrite. `edited` is a warning, not an automatic merge or an apply-blocking confirmation token; POST binds the offered pin and enabled state, not a hash of every local previewed file. Do not automate past it. Freeze concurrent manual edits and re-preview if files, index, switch or review context changed. A 409 means review the current state again, not blindly retry the previous pin. No blanket auto-update loop.

Apply the reviewed pin through native Gallery, call native reload for an enabled extension as needed, and restart through **Menu → Restart server** when Pocket reports changed imported helpers. A new module may already have loaded from the native file watcher; a reload response is not enough to infer which helpers or browser code actually ran. For disabled modules, preserve that choice and let the owner enable only after review; themes have no server extension reload.

Verify all layers separately:

- **Published/installed identity:** intended source commit in served index and installed gallery entry/receipt, expected file bytes, loaded declarations, no module load error. A receipt identifies installed files; it does not attest to active runtime behavior.
- **Server behavior:** exercise the changed capability after replacement/restart. A failed new load can leave the previous version running, so files on disk and an enabled toggle do not prove the new code is active.
- **Actual signed-in browser:** inspect the module request `/x/<module>/<rev>/<entry>` and loaded source in the browser, then open/use the real panel/sheet/menu/tool-call surface and relevant settings. Pocket's browser revision is derived from served-file paths/sizes/mtimes, **not the gallery commit or a content-hash proof**. The server advertises that URL; the browser unloads/reimports when it changes. Check the revision/source actually loaded, absence of browser load errors, fresh state and correct interactions; a login screen, a request attempt, or server files alone is not UI verification. Do not invent a release-reporting API or bypass native browser loading.

## Recovery, local edits, revocations, and rollback

- **Integrity/download failure:** native Gallery verifies every file before writes. A size/hash/text failure installs nothing; fix/push source and matching manifest, remotely validate, republish index, refresh and re-review. Do not copy files over the installed pin or weaken checks.
- **Local patches:** `<name>.gallery.json` records an extension's installed provenance and lets Gallery find missing/changed files. Preserve it; do not fake it, clear it to hide edits, or ship it. An approved published update replaces reviewed local changes; the gallery does not rebase them. Keep owner-authorized patches outside the active bundle or publish their real source correction before applying an older published bundle. Uninstall removes receipt-listed extension files (including local modifications to those files), not unrelated owner files, so preserve needed edits first.
- **Interrupted placement:** extension files are staged with a native undo journal, module after helpers, provenance after bundle files. A failure restores previous disk files; a pending journal is recovered at next start **before extensions load**. On an earlier-change-not-restored error, restart and inspect recovery errors before retrying; do not delete the journal to force an update. This is disk placement/recovery, not rollback of code's network/file/process effects or proof a new factory loaded. After a completed extension update, the temporary old files are discarded: there is no permanent extension backup or native arbitrary-commit rollback endpoint.
- **Bad code after a successful placement:** disable via native Extensions if unsafe, retain the actual receipt, and publish a source-first corrective commit (same human label is allowed) through the full workflow. A known-good implementation can be released again at a new reviewed commit. If an owner elects to restore a previously published, non-revoked commit by changing the index, it must be that real self-contained bundle with matching metadata and go through refresh/diff/edited-file review/pin/apply/reload again; Pocket compares commit equality, not version ordering. Never erase a security revocation to permit a rollback or treat reload as undoing side effects.
- **Revocations:** retain genuinely withdrawn commits/reasons. Revoking the entry's own commit withdraws it; installed revoked versions warn and offer to turn off, not silently uninstall/update. Pocket reads valid revocation commits even from otherwise invalid/incompatible entries and checks periodically while gallery installs exist. Publish a safe replacement and let the owner review it; revocation is not a fake update mechanism.
- **Themes:** updates/removal keep the prior folder in `themes/.removed/`, including owner edits; provenance is the hidden `.gallery.json` inside the theme folder and is never served. Preserve that backup for owner-directed restoration, not extension rollback. Invalid edits retain the last good theme until restart; at startup without a valid theme, browsers fall back to Pocket. If CSS hides recovery controls, open a tab with `?noext=1`, choose another theme in Appearance or repair the owner theme folder. Safe mode disables browser extension/theme surfaces in that tab; do not claim it shuts down server extension code. After repair, inspect the actual rendered theme.

## Implementation evidence and limits

Current source contracts (Pocket checkout 0.28.0/API 2; recheck when targeting another release):

- OMP [validator](../../../scripts/validate.ts): argument parsing/selection, Pocket helper-first imports, all-entry parser/conflict/index checks, exact file hashes, isolated extension declarations and theme validation. OMP [build-index](../../../scripts/build-index.ts) and [package scripts](../../../package.json): build versus validation responsibilities and Node/Pocket path defaults.
- Pocket [entry parser / pin](https://github.com/TannerMidd/pi-pocket/blob/main/src/server/gallery/entry.ts): strict declarations, compatibility, names, commit-driven identity and approval digest; [gallery service](https://github.com/TannerMidd/pi-pocket/blob/main/src/server/gallery.ts) and [native gallery routes](https://github.com/TannerMidd/pi-pocket/blob/main/src/server/extensions/gallery.ts): update previews, enabled/pin guards, edits, helper restart indication and receipts.
- Pocket [gallery file placement/recovery](https://github.com/TannerMidd/pi-pocket/blob/main/src/server/gallery/files.ts), [theme placement/recovery](https://github.com/TannerMidd/pi-pocket/blob/main/src/server/gallery/themes.ts), and [module loader](https://github.com/TannerMidd/pi-pocket/blob/main/src/server/reload.ts): staged disk replacement, startup recovery, top-level-only cache busting, overlapping factory initialization and failed-load retention.
- Pocket [HTTP API](https://github.com/TannerMidd/pi-pocket/blob/main/src/server/http/api.ts), [extension-route header enforcement](https://github.com/TannerMidd/pi-pocket/blob/main/src/server/http/extension-routes.ts), [auth](https://github.com/TannerMidd/pi-pocket/blob/main/src/server/auth.ts), [browser server revisions](https://github.com/TannerMidd/pi-pocket/blob/main/src/server/extension-web.ts), [browser loader](https://github.com/TannerMidd/pi-pocket/blob/main/web/extension-ui.js), and [public declarations](https://github.com/TannerMidd/pi-pocket/blob/main/types/pocket.d.ts): exact settings/reload routes, cookie/Bearer auth, scoped `pocket.api`, settings and served browser revision.

These are implementation-derived release instructions, not claims that this documentation edit ran validation, published anything, verified all providers/installers, or tested another platform. The checked-out public declarations/implementation and linked Pocket references supply the API evidence. `main` source links move: use the actual target checkout/commit for a release audit.

