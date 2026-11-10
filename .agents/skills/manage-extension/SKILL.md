---
name: manage-extension
description: Build, review, troubleshoot, verify and publish Pi Pocket extensions and themes with correct tool/result/hook contracts, browser authority, provider lifecycles, exact mutations and source-first gallery updates
---

# Manage Pi Pocket extensions and themes

Use for creating/updating a Pocket drop-in, reviewing its binding/security, investigating provider or lifecycle failures, or publishing an extension/theme through OMP. This skill is verified against **Pocket 0.28.0, extension API 2, Node ≥22.19.0**; these are a compatibility baseline, not a promise that every newer platform/provider is identical. Read the current checkout's public declarations and the minimum version of every API used. Never invent a fallback or copy Pi CLI APIs into Pocket.

- [OMP registry](https://github.com/MasFana/OMP) · [Pocket source](https://github.com/TannerMidd/pi-pocket) · [Pocket guides](https://github.com/TannerMidd/pi-pocket/tree/main/docs/extensions)
- [contracts.md](contracts.md): runtime/result/schema contracts, authority, native ownership, hooks, providers/processes, exact mutations/recovery, freshness, lifecycle and limits.
- [gallery.md](gallery.md): extension/theme manifests, bundle/cache boundaries, immutable publication, native update plans, local edits and recovery.
- [example.md](example.md): complete copyable API-2 tool/command/owner route/browser sheet plus an isolated verification recipe. Execute the example; do not treat a plausible snippet as proof.

## Evidence and routing

Use the smallest relevant reference, then follow its links to current public source. A code index, if the owner enabled one, can locate symbols; never create an index merely to read a repository. Keep **platform guarantees**, **extension design recommendations**, and **version/platform-specific observations** distinct.

| Task | Start here | Required outcome |
|---|---|---|
| Tools, schemas, nested callers, hooks | contracts: runtime/results and native ownership | Validated arguments, correct result envelope, native controls preserved |
| Browser/HTTP/settings | contracts: authority, HTTP, browser | Bound actor/workspace, authenticated requests, actual visible UI |
| External executable/install failure | contracts: providers and process lifetime | Observed executable/provenance/runtime and honest operation outcome |
| Rename/AST/code-action mutation | contracts: immutable proposals and recovery | Exact scoped preview, stale checks, durable per-file/command receipts |
| Diagnostics/index freshness | contracts: LSP/AST/graph and automatic refresh | Freshness evidence separate from provider availability; bounded work |
| Release/reload/local patch | gallery | Committed bytes, exact declarations, correct loaded server/browser revision |
| New small drop-in | example, then contracts | Complete runnable files and consumer-visible smoke proof |

## 1. Scope before implementation

1. Write observable behavior, inputs, state, UI/CLI surface, affected sessions, external effects, limits, cleanup and named acceptance checks. A user-reported failure is evidence; do not rerun an installer or destructive action merely to reproduce it.
2. Choose **extension** for executable behavior; **theme** for palette/layout without code. Prefer public extension capabilities over a core patch; consult Pocket's [core-or-extension policy](https://github.com/TannerMidd/pi-pocket/blob/main/docs/extensions/policies/core-or-extension.md).
3. Map ownership before adding machinery. Pocket already owns model selection, native `read`/`write`/`edit`/`bash`, output retention/spill, conversation storage, delegation/codemode/tool discovery and Plan/approval policy. Extend a missing capability; do not create a second model selector, coding-tool wrapper, generic offload hook, scheduler, provider lifecycle or graph engine. Optional tools are not guaranteed enabled.
4. Establish fresh caller rights: host-wide administration requires owner identity; session work uses the authoritative current session/requester and its policies. An owner-only browser module does not secure tools/routes. Extension-specific consent is optional product policy: an authorized owner task may run without extra plugin dialogs, but never bypass native Pocket Plan/approval rules.
5. Choose local-only versus workspace-provider execution. Reject unsupported remote URI schemes explicitly; never send a remote path to local `fs`/shell or silently substitute the server's CWD.
6. Read exact public signatures in Pocket's `_pocket.d.ts`, guides and runtime package declarations before adding calls. Nested execution is `ToolExecutionApi.executeTool(name, args, context, options?)`, not `host.executeTool` or an assumed package-level export; `HookApi` is not `ToolExecutionApi`. Check existing patterns before introducing a second convention.
7. Preserve installed identity, supported settings/tools/routes and user configuration when requested. Migrate affected callers/tests/docs to a coherent implementation; remove obsolete loaders/consent tokens/aliases rather than keeping dead shims. Do not delete unrelated owner changes.

## 2. Build a self-contained drop-in

- Default-export a `(host, web)` factory returning named `defineExtension` objects, an array of extensions, or nothing for web-only modules; async factories are supported. A bare array of tools/sections/hooks is not an extension. Export `pocketApi = 2` for API-2 output contracts.
- Use erasable TypeScript, explicit local `.ts` runtime imports, Node built-ins and Pocket-provided packages. `Type` comes from runtime `typebox`, not removed `pi-ai.Type`; valid `pi-schema` builders remain supported. Use top-level `import type` for `_pocket.d.ts`; never ship that generated link or `node_modules`.
- Define closed validated inputs and genuine literals/enums. A string-builder argument is not automatically a literal. Keep IDs/schemas/descriptions stable and concise; tool discovery must not be required unless it is enabled. Static schemas can help prompt stability, not guarantee provider prefix caching.
- Give module/tool/section/command IDs a unique prefix. Commands start with a letter and contain a hyphen. Do not shadow core/`pocket-` names; let the current parser catch reserved names.
- Keep top-level evaluation declarative. Start slow work after load; acquire exclusive resources lazily because the next version initializes before old disposal. Bundle every transitive runtime helper. Version helper directories when their code changes to avoid native same-path import-cache reuse; migrate imports and remove old active helper versions.
- Use `execute(args, api, context)` and authoritative tool CWD (`api.env?.cwd ?? (await api.agent(context)).cwd`). Hooks/routes have different capabilities: resolve their workspace through current bound session/host APIs instead of retaining a finished tool/request context.
- Separate model-facing `output`, declared `structuredOutput`, diagnostics, UI details and control. Never overwrite native results with a generic summary/offload object or add structured output to a schema-less native tool. Nested callers must consume their actual API contract; native codemode text is not direct Durable structured output.
- Replay and `readOnlyHint` apply to the whole registered tool, not one action. A mixed read/apply tool cannot promise read-only; index synchronization changes metadata even when source files are untouched. Harmless repetition is not identical results or automatic mutation idempotency.
- Expose only supported surfaces and declare exactly what loads. Prompt sections are model instructions, not browser pages/sheets/panels. Route instructions to available tools without claiming disabled capabilities. No stubs, fake successes, fabricated settings APIs or blanket “all providers supported” claims.

## 3. Bind HTTP and browser behavior correctly

- Use module-relative `web.route` and browser `pocket.api()`. Pocket requires authentication and **`X-Pocket: 1` on every extension method, including GET**. Native settings use `/api/extension-settings/<module>`, not `/api/extensions/<module>/settings`.
- Prefer `web.conversationRoute` for session operations. Trust the bound `request.conversation`, not browser-supplied CWD/model/source identity. Mutation also needs source steering/turn rights. Validate allowed operations/server IDs rather than accepting arbitrary browser commands as authority.
- Default app-wide administration/client access to owner. `view` is not enforced read-only and HTTP method alone does not protect mutations. Global audiences exclude people invited to only one session; a conversation parameter does not enlarge that audience.
- Reject failed/partial/uncertain work as such; do not turn non-success HTTP or provider results into empty success. Display concise observed outcome/path/version/exit/error/count fields rather than opaque provider-object dumps. “Installed”, “running”, “compatible”, “indexed” and “fresh” are different claims.
- Cancel old reads/actions and discard stale replies on navigation, conversation changes, reconnect and disposal. Fetch current snapshots because events are not durable. A background job retains only bounded root/actor/dirty state and fresh authority checks, never completed request/tool capabilities.
- Use exact component/hook signatures: sheet/panel `component`, menu/launcher `label`, status `text`/`short`, tool-call summary callback. Preserve keyboard/focus/narrow-layout behavior; prefer theme tokens and `pocket.style()` over global CSS hacks.
- Register cleanup for requests, timers, subscriptions, registration handles, providers, watchers, services, sockets and owned child processes. Server shutdown allows **3 seconds total** for async disposal; abort/terminate independent work in parallel with a shorter escalation budget. Browser cleanup must cancel required work synchronously.

## Provider and mutation design gate

Read the detailed contracts before implementing these features; do not copy a provider-specific engine into a generic drop-in.

- **Discovery/install:** respect workspace bins, PATH/PATHEXT and configured toolchain directories. Check executable identity, package provenance and provider runtime; a filename or installer exit zero is insufficient. Verify the selected binary after every installer entry point. Report failed updates separately from a still-available older binary. Uninstall only verified owned roots/paths; never guess from `which` or silently install on a read.
- **Owned subprocesses:** one bounded executor/lifecycle per extension, byte-limited stdout/stderr, timeout/abort, platform-aware process-group TERM/KILL and explicit errors. Cached UI/TTL/single-flight detection replaces repeated heavyweight status commands. Serialize conflicting package/index effects without a second unbounded queue.
- **Exact source changes:** LSP/AST produce immutable scoped proposals, not fresh patterns to rerun at apply time. Bind actor/session/canonical root/provider/server, normalize encodings, preserve exact bytes/CRLF, reject overlaps/stale/outside/secret paths and enforce limits. References are semantic evidence, not an exhaustive textual review receipt.
- **Recovery:** one apply engine records durable intent and real per-file/command outcomes. Per-file atomic replacement is not a cross-file transaction. Written files remain reported changed if later receipt persistence fails. Completed commands must not repeat; uncertain effects require reconciliation/new action rather than blind retry. Diagnose/mark graph dirty from actual changed-file receipts once.
- **Freshness:** never label a timeout, stale/unversioned diagnostic report or incomplete graph extraction as clean/current. LSP checks are lazy and scoped; AST byte offsets are not LSP character positions. Graph installation, engine compatibility, index generation and source freshness stay separate.
- **Automation:** when authorized, debounce successful native/apply/external source changes into sync of existing indexes, and await freshness before graph queries. Single-flight, dirty follow-up, conflict deferral, failure visibility, current owner checks, ignored metadata/dependency/secret paths and disposal are required. No passive package install, missing-index creation, Git hooks or unmanaged daemon. Avoid retries that polling/events can turn into a loop.

## 4. Verification gate

Use a **separate temporary Pocket data folder**, never the production owner data/credentials. Review executable code before load tests: isolation is not an OS sandbox. Run the narrowest meaningful checks after integration; do not repeatedly run broad suites or installers to gain confidence.

- Import Pocket `test/helpers.ts` before app/runtime modules so environment isolation takes effect. `openApp`, `owner`, `newSession`, real prepared extension loading and actual tool calls support deterministic smoke; production nested calls use `api.executeTool`. Always close app/services/browser and call `cleanUp`.
- For interactive smoke run `rtk node test/serve.ts` **from the Pocket checkout**, copy the complete bundle into the printed copy's `data/extensions/`, use its supported owner sign-in link/input and real routes/UI/commands. Stop only the owned test service using its printed kill command. A login screen or attempted/missed animation click is not surface proof.
- Prove values/state transitions, not wiring or “does not throw”: parsing/literal boundaries, Unicode/empty input, authoritative CWD/actor changes, guest/remote/symlink/secret denial, stale replies, abort, reload/disposal, unavailable dependency and meaningful empty/no-op/failure outcomes.
- Exercise provider work through actual installed CLI/SDK/runtime where available. Version/catalog/platform claims require separate evidence: a matching 55-server catalog does not prove 55 installations, native API parity, static-analysis completeness or cross-platform process behavior.
- For mutations test before/after bytes, stale hashes/versions, UTF-8/16/32 and CRLF boundaries, partial writes/receipt failures, replay and uncertain commands. For automation test external additions/changes/removals, debounce bursts, edits during sync, cancellation sharing, failure without loops, owner revocation, conflicts and bounded disposal.
- Direct tool tests inspect parsed outputs/declared structured data, diagnostics and filesystem state, not mock-model echoes. Keep permanent regressions only for plausible consumer-visible bugs/boundaries/transitions; remove source-text/incidental-wording/default/wiring assertions rather than re-pinning them.
- Browser changes require actual interaction and visual proof. HTTP alone does not prove header/auth/module routing or loaded browser revision. Themes additionally need theme-checker proof plus dark/light, narrow/wide, touch/keyboard, focus/contrast and existing extension surfaces.
- The **14,000-character prompt guard** is Pocket's fresh-baseline test, excluding native Pi tools/owner context; it is not an installed-extension runtime cap or billed token count. Measure actual tools/sections separately when relevant and keep routing concise.
- After behavior proof, update docs/changelog with authority, dependencies, limits, configuration, install/reload, errors, freshness and verification limits. Remove only owned throwaway scripts/data/generated links and leave real owner services/workspaces untouched.

Canonical test examples: Pocket's `test/extension-{commands,web,ui}.test.ts` and `test/docs-examples.test.ts`; adapt assertions to real consumer behavior, not incidental wording.

## 5. Publish only when requested, in immutable order

1. Finish behavior/security proof and docs. Review secrets/private paths, dynamic imports, shell/network effects, provenance, runtime compatibility and the entire transitive bundle.
2. Exercise uncommitted code directly in an isolated Pocket. An optional OMP `--local` preflight needs a genuine local candidate commit containing the exact bundle and matching metadata; it does **not** verify public source. Commit and **push source before publication**, then obtain the full published commit. Never invent a source ID or attach uncommitted bytes to an older/future pin.
3. Generate a manifest via Pocket **Installed → Share…** or exact committed-file bytes. Set source/version/author/tags, API/minimum, exact loaded `declares`, complete file byte sizes/hashes and genuine retained revocations. `readOnlyTools` must match actual whole-tool promises. Follow [gallery.md](gallery.md).
4. Validate publication **without `--local`** so OMP downloads the pushed commit and compares actual registrations. There is no `--skip-load`; validation executes extension code, not an OS sandbox. Use working-directory-correct commands from the gallery guide.
5. Build deterministic `index.json` from source manifests; never hand-edit it independently. Commit/push OMP entry, generated index and related docs together, without changing unrelated owner work.
6. Refresh the native owner gallery, obtain/review the actual update plan and local-edit conflicts, then apply its returned pin. Human version is a label; a changed source commit can update the same version. Never substitute a fabricated/stale plan or silently overwrite edited files.
7. Reload/restart according to root/helper cache changes, confirm installed commit and actual loaded server/browser behavior, and report source/registry links plus observed proof. Downloaded files, local validation, a reload HTTP 200 or `restart: true` alone are not full live acceptance.

## Diagnose before repeating effects

| Symptom | First evidence/check | Do not do |
|---|---|---|
| Empty dashboard or rejected GET | Actual HTTP status, auth and `X-Pocket: 1`; module-relative route and browser errors | Hide the error behind an empty provider list |
| Installer says OK but tool is missing | Installer exit/stderr, selected binary, toolchain bin configuration and server PATH | Rerun installation blindly or equate exit zero with detection |
| Provider exists but cannot run | CLI identity/help, executable/package provenance and compatible child runtime | Trust `sg`/`codegraph` names or import a native SDK into an unsupported Node |
| Old helper/browser behavior after reload | Installed source pin, loaded module/browser URL and helper import paths | Treat reload 200 as code-cache proof or add another loader |
| Diagnostics look clean too soon | Current source/hash/version, valid full pull response or fresh publish evidence, timeout/partial status | Convert stale/unversioned/incomplete reports into exact clean proof |
| Graph constantly needs Refresh | Canonical owner root, existing index, dirty events, debounce/single-flight and query freshness | Poll expensive CLI status, loop on metadata writes, or silently create indexes/hooks |
| Applied files reported stale on replay | Durable completed/per-file/command receipts and actual follow-up effects | Compare only the primary after-hash and repeat an already completed command |
| Native output/control broken by a hook | Actual result/schema and hook capabilities before/after the call | Inject generic structured summaries, clip JSON, or suppress native controls/errors |
| Owner task stopped by a tool policy | Real native Plan/approval state and whole-tool read-only/replay declarations | Mislabel a mutator read-only or bypass another guard with plugin consent tokens |

Keep the observation, root cause, applied change and exercised check in delivery. Catalog matches, file presence, type checks and local hashes each prove only their own layer.

## Completion checklist

- Every requested behavior/acceptance item is implemented or its genuinely unavailable prerequisite is stated after reachable work; no silent scope reduction, stubs, fake hashes, unsupported APIs or hidden privilege expansion.
- Stable installed identity and caller contracts preserved where requested; obsolete implementations/shims removed; source imports/complete bundle work in Pocket's prepared runtime.
- Fresh authority/workspace checks, native policy, per-tool hints, result/control preservation, exact effects/replay/receipt recovery, error/freshness honesty and bounded cleanup verified.
- Real isolated tool/provider/UI checks passed for the changed surface; evidence is distinguished from recommendations, catalog coverage and unexercised platforms. Docs/examples are executable, current and cross-linked.
- Source repo retains tests/docs/lockfiles; generated `_pocket.d.ts`, caches, secrets, dependency links and gallery receipts are not shipped. Temporary scripts/data/browser/processes are removed only if owned.
- If publication was requested: actual registrations equal `declares`, committed bytes equal hashes/sizes, compatibility minimum matches APIs, both repositories are pushed and the intended live revision is verified. Otherwise stop after the requested code/docs work—do not publish or change production settings merely because this skill has a release workflow.
