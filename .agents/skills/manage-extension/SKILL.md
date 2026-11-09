---
name: manage-extension
description: Guide and contract to build, update, declare, and index Pi Pocket extensions and themes into the registry
---

# Manage Pi Pocket Extension Registry

Contract and workflow to create, publish, and index extensions for Pi Pocket.

## 1. Extension Rules & Contract

A Pi Pocket drop-in extension:
- Stored as `<name>.ts` (entry module) in public GitHub repo.
- Can have helper files in `<name>/` subdirectory, or `<name>.js`, `<name>.mjs`.
- Root export must default export an extension factory:
  ```typescript
  import type { Host, Extension } from "./types.js"; // or from Pi Pocket runtime

  export default function (host: Host): Extension[] | Extension | void {
    return [
      {
        name: "my-ext",
        tools: [
          // custom tools defined via host
        ]
      }
    ];
  }
  ```
- No built-in names (`prompt`, `artifacts`, `browser`, `subagents`, `agent-teams`, `schedules`, `goals`, `plan`, `guard`, `codemode`, `memory`, `pip`, `triggers`, `gallery`).
- Name pattern: `^[a-z0-9][a-z0-9_-]{1,63}$` (cannot start with `pocket-`).
- Total file bundle size: $\le 2$ MiB.

## 2. Declares Compatibility Block

Every entry JSON must declare what runtime capabilities it registers:
- `extensions`: List of extension names returned by factory.
- `tools`: List of registered tool names (cannot shadow core tools like `read`, `write`, `bash`, etc.).
- `readOnlyTools`: Subset of tools that perform no side-effects.
- `hooks`: Hook points like `beforeRequest`, `beforeTool`, etc.
- `sections`: Web UI section IDs injected.
- `routes`: Custom HTTP API routes matching `(GET|POST|PUT|PATCH|DELETE) [path]`.
- `commands`: Slash commands matching `(conversation|global) [a-z0-9_-]+`.
- `wraps`: Wrappers around existing tools/sections.
- `client` / `access`: `"owner"`, `"steer"`, or `"view"`.
- `pocketApi`: Current API version number (usually `2`).
- `minPocket`: Minimum Pi Pocket semver (e.g. `"0.20.0"`).

## 3. Creating New Registry Entry

1. Publish extension code in public GitHub repo. Commit changes.
2. Get full 40-character commit hash: `git rev-parse HEAD`.
3. Compute sha256 and size for each file:
   ```bash
   sha256sum <file>
   wc -c <file>
   ```
4. Create `entries/<name>.json`:
   ```json
   {
     "name": "sample-tool",
     "title": "Sample Tool",
     "description": "Short plain description without filler.",
     "tags": ["tools", "utility"],
     "author": { "name": "Author", "github": "AuthorGithub" },
     "version": "1.0.0",
     "pocketApi": 2,
     "minPocket": "0.20.0",
     "source": {
       "repo": "owner/repo",
       "commit": "0123456789abcdef0123456789abcdef01234567"
     },
     "declares": {
       "extensions": ["sample-tool"],
       "tools": ["sample_action"],
       "readOnlyTools": [],
       "hooks": [],
       "sections": [],
       "commands": [],
       "wraps": []
     },
     "files": [
       {
         "name": "sample-tool.ts",
         "sha256": "<64-hex-char-hash>",
         "size": 1234
       }
     ]
   }
   ```
5. Run build and validation:
   ```bash
   node scripts/build-index.ts
   node scripts/validate.ts --pocket /path/to/pi-pocket --only sample-tool
   ```

## 4. Updating an Extension

1. Push new commit to extension repo.
2. Update `entries/<name>.json`:
   - Bump `"version"`.
   - Update `source.commit`.
   - Recalculate `"files"` array (sha256 + size).
   - If previous commit had security flaws, add to `"revoked"` list:
     ```json
     "revoked": [
       { "commit": "oldcommit...", "reason": "Reason for revocation" }
     ]
     ```
3. Re-run `node scripts/build-index.ts`.
4. Commit and push registry.

## 5. Themes (Alternative Kind)

Theme entries use `"kind": "theme"`, `"themeApi": 1`, and must include `<name>/theme.css` or `<name>/colors.toml` within a folder named after the theme ID.
