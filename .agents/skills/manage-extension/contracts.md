# Pocket authoring contracts

Target: Pocket **0.28.0**, extension API **2**, Node **≥22.19.0**. Verify against the installed [public declarations](https://github.com/TannerMidd/pi-pocket/blob/main/types/pocket.d.ts), linked as the drop-in's `./_pocket.d.ts`, and [canonical extension guides](https://github.com/TannerMidd/pi-pocket/tree/main/docs/extensions). Pocket imports Pi Durable's tool/hook types; its [package manifest](https://github.com/TannerMidd/pi-pocket/blob/main/package.json) pins Pi packages to 1.5.0. A moving `main` link may describe a later release: the installed release's declarations win.

**Evidence labels:** “Pocket contract” below means a public declaration/guide or current core behavior. “Implementation recommendation” means a design the author must implement, not a platform guarantee. “Verified example” refers to [pi-lsp 1.3.2 at commit `981ba85be0b12d980fc770c4129577524f08501a`](https://github.com/MasFana/pi-lsp/tree/981ba85be0b12d980fc770c4129577524f08501a); provider versions and Linux observations there are not universal requirements. Publication and loaded-revision verification belong in [gallery.md](gallery.md); the minimal complete authoring pattern is in [example.md](example.md).

## Native ownership: add the missing capability

**Pocket contract:** keep model choice, native `read`/`write`/`edit`/`bash`, transcript storage, bounded model output/spill retention, tool discovery, delegation/codemode and native Plan/approval policy on their native paths. Some of these are built-in modules that the owner can disable; the four coding tools do **not** imply grep/glob, subagents, tool search or codemode is enabled. Inspect the selected/callable tools rather than announcing unavailable capabilities. Follow [core-or-extension](https://github.com/TannerMidd/pi-pocket/blob/main/docs/extensions/policies/core-or-extension.md).

**Implementation recommendation:** route by the actual missing capability: LSP for semantic meaning, AST for structure, an existing index for relationships. Do not add a model selector, second executor, native-tool replacement or generic “offload every result” wrapper merely to present provider results. Producer-side limits and new-tool output schemas are the right place for provider budgeting; a late rewrite cannot undo streamed, retained or already stored bytes.

## Runtime, imports, and tools

**Pocket contract:** a `<name>.ts` default export has this signature:

```text
default(host: Host, web: Web): Extension | readonly Extension[] | void | Promise<Extension | readonly Extension[] | void>;
```

- Return named `defineExtension({ name, tools, sections, hooks, … })` objects, not a bare list of `defineTool`, section or hook registrations. `defineExtension`, `defineTool`, `section` and `hook` come from `@earendil-works/pi-durable`.
- Node executes erasable TypeScript: no enums, namespaces, or constructor parameter properties. Local runtime imports end in `.ts`; helpers belong under the module's bundle directory. Files beginning `_` or ending `.test.ts` are not loaded as drop-ins.
- Use `import type { Host, Web } from "./_pocket.d.ts"`; the type-only link disappears at execution and is not a gallery file. Pocket prepares runtime package links. Do not vendor dependencies or import by a machine-specific absolute path.
- `execute(args, api, context)` returns a promise of a tool result. Tool APIs are invocation-bound: operations reject after execution ends. Use `api.env` for the session's execution environment and `(await api.agent(context)).cwd` for its folder, not `process.cwd()`.
- Nested calls use **`api.executeTool(name, args, context, options?)`**, where `options` is `{ key?: string; progress?: boolean }`, returning `Promise<NestedToolExecutionResult>`. `ToolExecutionApi` is imported from Pi Durable; there is no `host.executeTool` or standalone `executeTool` export in the verified package. Explicit stable keys find the same nested task during replay, but do not promise exactly-once external effects. Cancelling the supplied context stops the wait, not necessarily the nested call; the parent owns unfinished calls.
- A nested result's usage is already counted under that tool; forwarding it as the parent's usage counts it again. `progress: false` omits persisted running output/details/diagnostics, not the completed result's channels; interrupted/aborted calls do not give programs partial output. A schema-less nested value may be a string, image block or content list, not necessarily an object: the framework materializes it from bounded output. This is different from an author returning a forbidden schema-less producer `structuredOutput`.
- Throw a sanitized `Error` for a tool failure; its message reaches the model. When returning a structured failure intentionally, preserve `isError` and diagnostics rather than turning unavailable/partial work into an empty success.

### Schemas and per-tool annotations

**Pocket contract:** Pi Durable validates arguments before `execute`. `@earendil-works/pi-schema` builders (`obj`, `str`, `num`, `int`, `bool`, `arr`, `union`, `opt`, `lit`, `oneOf`) are valid. `obj` is closed unless `{ open: true }`. A TypeBox builder is also supported; import `Type` directly from runtime package `typebox`, not the removed public `pi-ai.Type` export. Legacy compatibility is not a new-code contract.

- Exact actions need exact schemas: `lit("rewrite")`, `oneOf(["search", "rewrite"])` or TypeBox literals/unions. `str("rewrite")` is **not** a literal enum; `str` takes an options object. Validate conditional action requirements and untrusted route bodies as well as tool schemas.
- Tool arguments are validated **and may be coerced**: the inspected Pi AI validator compiles schemas with `coerce: true` and parses a clone before execution. A numeric `42` can become a valid string `"42"`; validation is not a promise to reject every non-string wire value. Assert accepted normalized behavior separately from genuinely invalid/missing/extra/over-limit arguments. Do not assume routes inherit tool coercion or that `execute` sees the original model JSON.
- `annotations: { readOnlyHint: true }` is an author promise per **registered tool**, affecting native Plan mode, not an authorization check or sandbox. Current `defineTool` types omit this field; add it afterward with `Object.assign`, as in [example.md](example.md). A tool mixing lookup and apply/install cannot claim read-only. An index-query tool that synchronizes metadata writes state even if it never changes source files, so it must not carry that hint. A wrap cannot bypass native built-in Plan policy.
- `replay: "safe"` promises harmless repetition after restart, not stable answers or automatic idempotency. Without it, an interrupted execution is not replayed. `api.memo(name, context)` reads and `api.memo(name, value, context)` writes call-scoped state; `${api.taskId}:${api.callId}` is stable across replay. Do not memo credentials or private-ask answers.
- Static concise descriptions/schemas support stable routing and request prefixes, but do not guarantee a provider's prompt caching. Do not mutate schemas to track transient provider status; use bounded prompt sections/status data.

### Result channels and bounded truth

**Pocket contract:** API 2 uses `output`, including hook/wrapper results; export `pocketApi = 2`. The channels differ:

| Channel | Consumer and invariant |
|---|---|
| `output` | Model-visible content, commonly `[{ type: "text", text }]`; omitted output falls back to retained `api.output(chunk)` streaming |
| `structuredOutput` | JSON value validated against the tool's **`structuredOutputSchema`**; required on successful schema-declaring tools, allowed on their errors, forbidden as a producer field without a schema |
| `details` | UI data; omitted details fall back to the last `api.details(value, context)` value |
| `diagnostics` / `isError` | Array of `{ severity, message, code? }` remarks and explicit failure state; not the tool's data |
| `control` / `usage` | Native continuation controls/accounting; preserve them when changing a successful result |

Direct Durable callers inspect `structuredOutput`, `isError` and the diagnostics array. Schema-less nested calls receive bounded output through `NestedToolExecutionResult.structuredOutput`; harness-generated errors can have no value. A schema violation drops invalid data and reports the broken contract; nested callers get an error. Do not inject producer `structuredOutput` into schema-less native `write`/`edit`, or replace native Bash's declared output schema/exit-code/spill contract with a custom offload object.

**Current native implementation:** Pocket's own codemode `tools.<name>()` returns **text**, even for a provider tool that declares structured output; it is not Durable's structured-value codemode contract. See [native codemode](https://github.com/TannerMidd/pi-pocket/blob/main/src/server/extensions/codemode.ts). Consume the real surface rather than replacing native tools to change it.

**Implementation recommendation:** bound source scope, subprocess bytes, item counts and immutable proposal storage before returning. Keep full **bounded** structured data when declared, and serialize a valid smaller summary with explicit truncation/count/proposal metadata for display. Never clip JSON bytes or edit payloads and call the result complete. `host.text.defang(text: string): string` only prevents closing-tag escape; pair it with a real data fence and explicit untrusted-data instructions, not a claim of complete prompt-injection protection. Keep native output, details/diff, diagnostics, controls and structured truth intact; diagnostic failure after a successful edit means “edit succeeded, check not verified,” not “edit failed.”

### Hook scope and edit outcomes

**Pocket contract:** `beforeTool(call, api, context)` returns `{ block?: string; arguments?: JsonObject }` or undefined; `afterTool(call, result, api, context)` returns a replacement result or undefined. `HookApi` has committed document reads, IDs, models, memos and entry access, **not** `ToolExecutionApi.env`, `agent` or `executeTool`. Use `host.cwdOf(api.conversationId)` plus fresh requester identity for hook workspace authority. Native codemode calls also run tool hooks, but hook entry/history access rejects there.

`afterTool` sees executed results **and** harness errors: `tool_unavailable`, `invalid_arguments`, `blocked`, `interrupted`, `restart_limit`, `aborted`, `abandoned`. Inspect `isError`, diagnostics and cancellation before reading arguments or treating a call as an effect. A successful native edit/write hook reads actual `call.arguments.path`; do not infer a write from prose, attempted execution, a missing error string or a codemode script's outer arguments. Preserve the successful result by adding bounded verification information, not replacing its native fields. Keep hooks quick and bounded: abort hooks cannot themselves be aborted and can delay conversation cancellation. See [hooks](https://github.com/TannerMidd/pi-pocket/blob/main/docs/extensions/hooks.md).

## Identity and authorization

A drop-in executes **with the Pocket server owner's OS rights**, even when a guest invokes a tool. Its runtime is not an OS sandbox.

| Entry point | Authoritative actor/source | Required check |
|---|---|---|
| Agent tool | `api.conversationId`; current `host.requesterOf(id)` | Re-check requester/`host.roleOf` before host-wide administration; session visibility/tool hiding alone does not authorize it |
| Conversation command | `ctx.user`, `ctx.conversationId`, `ctx.cwd` | Source steering/turn applies; validate args and reject effects outside the allowed session |
| Global command | Owner; still invoked from a visible session with `ctx` | Its card may be visible to everyone in that session; never echo secrets |
| Ordinary route | `request.user`; no automatically bound source | Check any supplied session IDs against fresh `request.sessions()` or use a conversation route |
| Conversation route | `request.user` and core-resolved `request.conversation` | Do not accept browser CWD/model/source as authority; source policy plus route audience applies |
| Public page | Capability link token, not a signed-in user | Limit data/use/lifetime; validate and escape all form input; disclose only what the link author shared |

Global web audiences: `owner` is owner-only; `steer` additionally allows guests who steer every session; `view` additionally allows viewers who see every session. People invited to just one session cannot use extension web routes/clients. Binding a conversation does not enlarge this audience.

An ordinary `POST` route granted `access: "view"` can be called by viewers: method alone is not mutation protection. Use owner/steer for mutation and protect document writes. An owner-only browser module is not protection for a differently scoped route or an agent tool.

**Implementation recommendation:** privileged tools/routes capture the authoritative actor, conversation and canonical root, then recheck fresh requester/role/workspace immediately before effects and after awaited discovery, provider queries or receipt writes. `host.requesterOf(conversationId): string | undefined`, `host.roleOf(personId): Role | undefined` and `host.cwdOf(conversationId): string` are the current public identity APIs. A browser body containing CWD, model, server command or a “confirmation token” is untrusted; provider commands come from validated server-side definitions. Receipts and stale-file checks prove identity/content comparisons, not permission.

Extension consent is an **optional product policy**, not a blanket Pocket requirement. An owner task can authorize prompt-free provider handoff/apply while native Plan/approvals remain authoritative. Do not add compulsory review receipts before LSP rename, or claim removing plugin dialogs removes native policy.

For local-only providers, reject remote URIs explicitly, canonicalize roots and files, enforce symlink containment, exclude secret/environment files, and recheck boundaries around awaits/writes. Do not execute remote addresses locally or borrow an index from an unauthorized parent repository/worktree. Environment-aware integrations use the registered workspace provider without local fallback. Owner-only execution is not trust in the binary: a workspace-local server runs with host rights, receives source and may inherit secrets/read files/use the network; disclose that boundary.

## HTTP and request lifetime

- `web.route(method, path, handler, { access })` mounts relative paths at `/api/x/<module>/`. Methods: GET, POST, PUT, PATCH, DELETE. Fixed path segments outrank parameters; give overlapping routes consistent authority or check the actor explicitly.
- Every extension request needs authentication and **`X-Pocket: 1`**, including GET. Missing header is rejected before route lookup. Prefer browser `pocket.api(path, body?, options?)`; do not hardcode an application base path or swallow non-success responses as empty data.
- `web.conversationRoute(method, path, handler, { conversation: parameterName, access })` requires that parameter in the path. Core binds `{ id, title, cwd, model?, thinkingLevel }`, checks seeing, and checks steering/turn for mutations. Linked starts additionally enforce plan/spend/team/model policy.
- `request.params`, `query` (`URLSearchParams`), and `body` are untrusted. Validate decoded path components before filesystem use. `request.body` is empty for GET/DELETE.
- Use request `snapshot`, `context`, and `commit` for your own module documents, named `x.<module>.<name>`. Await commits; keep external side effects outside transactions. Viewer writes and late-completing writes are refused/rolled back.
- `request.signal` aborts on disconnect; normal handler return does not itself abort it. `request.context.abortSignal` and fresh document/linked-session capabilities end on return too. Never retain request capabilities in background timers.
- `web.error(status, message)` deliberately exposes that exact message to callers. Sanitize it. Unexpected errors are generic to guests; owner/log messages may contain sensitive detail.
- Native settings use **`/api/extension-settings/<module>`**, not `/api/extensions/<module>/settings`. Prefer `pocket.settings()`/documented settings helpers over reconstructing core state or reading configuration/credentials.

## Browser modules and lifecycle

- Register `web.client("<name>.js", { access })`, an `.mjs` file, or a folder `<name>/` whose `index.js` is the entry. Folders can serve JS/MJS/CSS/JSON/images/fonts; never TypeScript, hidden files, `node_modules`, or symlinks. All eligible users can read served files: store no secrets there.
- A browser default export gets the **module-scoped** `pocket`. `pocketApi` describes that browser module's required API; API 1 can be valid for older unchanged surfaces, but current-target examples use 2. Follow each feature's `minPocket` date separately.
- Components use `pocket.html`, `useState`, `useEffect`, and other provided hooks. Pages/sheets get `pocket` and `close`; sheets can also get opening props. Prefer `pocket`'s helpers to importing or cloning internal app state.
- Surfaces: `rail`, `menu`, `launcher`, `page`, `sheet`, `panel`, `status`, `topbar`, `composerButton`, session-list chips/actions/filters, and tool-call presentation. Panels/sheets use **`component`**; menu/launcher use **`label`**; status content uses **`text`/`short`** (`label` there is only its layout name). Tool-call `label`, `subject` and `summary` are callbacks on arguments, not fixed result objects. IDs are module-scoped; keep labels, focus, narrow-layout actions, and keyboard behavior accessible.
- `pocket.conversationId()` may be null. `pocket.onConversation(callback)` immediately reports current identity and returns an unsubscribe function. Abort old reads/actions and ignore stale replies when source identity changes; do not send an old displayed workspace to a new session's action.
- `web.send(event, data, { to? })` / `pocket.on(event, handler)` transport live module events, not a durable log. Fetch current state on opening/reconnecting before relying on updates. Listener return values provide cleanup.
- Use documented theme tokens and `pocket.style()` so the theme layer can override your surface. Do not add global style/link hacks or store secrets in served JSON/assets.
- A new module version initializes **before** old disposal, so exclusive locks/listeners must be acquired lazily. Failed reload keeps the prior version. Same-path transitive TypeScript helper imports remain cached: a changed existing helper needs a server restart, or a release must move changed helper code to a new versioned directory and migrate every importer. Remove obsolete active helper versions; do not add a second loader, import-cache shim or duplicate server implementation. Replacing files alone is not proof that the browser loaded the new URL/revision. See [gallery.md](gallery.md).
- `web.onDispose(dispose: () => unknown): void` releases server resources and can return a promise; all async server shutdown cleanups share **3 seconds total**. `pocket.onDispose(dispose: () => void): void` is synchronous/not awaited: abort requests and clear timers/subscriptions immediately. Never retain completed request/tool capabilities in timers; cache plain identity/status and create fresh operation scope.

### Owned process lifetime

**Implementation recommendation:** use one bounded ownership/lifetime mechanism for CLI providers, installers and language-server children. Limit combined stdout/stderr in **bytes**, time out and abort, clean listeners/pending requests, terminate owned process groups with TERM then KILL on supported POSIX platforms, and dispose children in parallel within the shared 3-second window. Long-running JSON-RPC servers may need a streaming transport, but not an independent shutdown budget. Shutdown/exit messages do not prove a process stopped. Windows child/group/shim semantics differ; Linux verification is not cross-platform proof.

Keep browser status reads cheap: cached snapshots, initial/TTL single-flight discovery and source-driven changes, not heavyweight CLI probing on every polling tick. A timed-out/incomplete subprocess result cannot establish complete query or installation success.

## Provider discovery, installation and outcome truth

**Implementation recommendation:** expose distinct states, not one ambiguous “ready” flag:

| Observation | Does not prove |
|---|---|
| Not checked / missing | A missing package when discovery has not run |
| Selected executable exists | Package identity, runtime compatibility, server initialization or trust |
| Installer exit zero | A usable installed provider |
| Provider available after a failed update | That the update succeeded; the earlier binary may remain |
| Index exists / build complete | Engine compatibility, source freshness, exhaustive relationships or tests passing |
| Empty result / no-op | Provider unavailable, timeout, unsupported feature or malformed output |

Resolve workspace-relative commands, ancestor Node/Python/Ruby/Go bins, PATH/PATHEXT and user toolchain locations with documented precedence. For Go installation use `GOBIN`, else the **first** `GOPATH/bin` (normally `~/go/bin`); cached `go env` configuration can differ from server PATH. Verify package/runtime/executable identity, not filename: system `sg` can be an unrelated group-switching utility rather than ast-grep.

After an authorized install/update/uninstall, refresh detection and verify the **selected** executable. Report installer exit/errors separately from availability, selected path, version when actually checked and initialization when actually exercised. All agent, browser and legacy entrypoints must share ownership and verification. Uninstall only verified owned package roots/toolchain paths, rechecking provenance before removal; never remove `which tool` or guess npm roots. Serialize conflicting global package operations and index builds. Passive reads must not install packages or create missing indexes.

**Verified example:** pi-lsp checked ast-grep **0.44.1** identity/help and used standard bundled grammars, config-disabled search/outline/relational inline YAML/rewrite JSON, including empty-string deletions. Its CodeGraph adapter verified **`@colbymchenry/codegraph` 1.6.2**, SDK/package/launcher identity and a separate SQLite-capable Node **≥22.5 and <25**. Pocket's Node floor alone does not prove provider compatibility. These are adapter-specific observed contracts; reverify before accepting another version. A catalog matching 55 OMP server IDs is not proof of all installers, all platforms or native OMP API parity.

## Semantic freshness and exact edit proposals

### LSP transport and diagnostic proof

**Implementation recommendation:** JSON-RPC `Content-Length` counts UTF-8 **bytes**, not JavaScript string length. Parse partial/multiple frames, bound buffers, distinguish errors from empty responses, share initialization per canonical server/root and cancel/time out pending calls. Negotiate/check originating server capabilities and document position encoding; do not pick the first server for an extension and call it authoritative.

After successful owner source edits, lazily synchronize exact current text/version to installed matching servers. Reject stale or malformed versioned reports. Valid unversioned push data may be useful findings, but is **not** exact-version proof. Only a valid full pull diagnostic response obtained against the still-current synchronized document establishes fresh pull proof; unchanged/malformed/partial/timeout paths do not establish clean. Keep findings from servers that answered when another fails, and say the file was **not fully verified**. Cached/fileless diagnostics are received evidence, not a recursive workspace check; diagnostics are not tests.

**Verified example:** pi-lsp checks successful native edit/write paths, including native codemode, and can start one installed matching server lazily. External editor/shell writes need an explicit LSP file check; CodeGraph's source watcher does not start language servers. Disabled automatic diagnostics do not disable explicit queries or graph dirtiness. Its unversioned pushes are accepted findings, so their empty report must not be promoted into strict exact-version assurance.

### Immutable preview contract

**Implementation recommendation:** persist an exact proposal binding requester, conversation, canonical root, provider/server, before/after bytes and hashes, relevant LSP document versions, expiry and limits. Apply that saved proposal; never rerun a pattern/rename request to regenerate a different edit under the same ID. Normalize UTF-8/UTF-16/UTF-32 positions correctly; AST offsets are UTF-8 bytes, **not** LSP characters. Preserve CRLF; reject overlapping/ambiguous edits, split code-point boundaries, out-of-range positions, secrets, outside/symlink destinations and excessive scope. Sequential AST transforms run on scratch snapshots with original hashes, never project files during preview.

LSP references are semantic impact evidence, not exhaustive text matches or a mandatory consent receipt before `prepareRename`/`rename`. Code actions may require `codeAction/resolve`; retain exact edit-then-command semantics. Never translate returned LSP edits into guessed AST patterns. Reject unsupported resource operations/change annotations explicitly rather than silently dropping them or advertising unsupported capabilities. Paginate large action/symbol sets and distinguish no changes, no matches, unsupported and unavailable.

### Apply, recovery and follow-up effects

**Implementation recommendation:** one apply engine serves agent/browser proposals and authorized server follow-up edits. Serialize conflicting applies; validate every source before writes and again at each boundary. Record durable intent **before** writing, then truthful per-file receipts/outcomes. Atomic per-file replacement is not a cross-file transaction or rollback guarantee; memos are not filesystem transactions.

- Report `applied`, `already_applied`, `stale`, `partial`, `interrupted` and `failed` distinctly. Track a successful write in the in-memory outcome before a later receipt save can fail; never label changed files untouched.
- For edit-plus-command actions, apply edits first, bind the advertised command/server, and enable `workspace/applyEdit` only during that authorized command through the same engine. Record running/completed/uncertain command outcomes. Never blindly rerun an uncertain command.
- Replay a completed command receipt **before** testing the primary edit's after-hash: completed follow-up edits may legitimately differ from that hash. Do not repeat completed external effects.
- Trigger diagnostics/graph dirtiness once from actual changed-file receipts, including reported follow-up edits. Unreported command effects cannot be claimed verified. Mutation outcome, command outcome and verification outcome remain separate.

**Verified example:** see the immutable proposal/apply and command-receipt sources in the evidence table below. Those safeguards are extension implementation, not automatic guarantees supplied by Pocket.

## Indexed graph freshness and cache lifecycle

**Implementation recommendation:** authorize automatic incremental freshness of an **existing canonical index** as an explicit provider behavior; do not require manual refresh as the only route to current answers. No implicit package install, missing-index creation, Git hooks, daemon or global integration registration. A provider CLI's `init --yes` may install hooks, and `install` may register an integration rather than install a package; verify actual semantics and prefer the real SDK for owned index management.

Use one bounded canonical-root single-flight with initial/TTL discovery and debounce, plus a source watcher only for existing indexed current-owner workspaces. Exclude `.git`, `.codegraph`, dependencies, build caches and secret/environment paths to avoid feedback loops. External additions/changes/deletes, successful native edits and actual apply receipts mark dirty. Edits during sync force a follow-up; queries await freshness including missed watcher events. Read workers open `readOnly: true, sync: false` **after** the owned freshness step.

On failure retain dirtiness, surface errors and retry only on a later edit/query/TTL opportunity, not an uncontrolled retry loop. Share in-flight work across callers, defer conflicts once, and do not cancel another caller's owned sync when one waiter aborts. Cancel timers/controllers/watchers on disposal. Bound roots/processes/pending work; pi-lsp's reference implementation uses at most **eight active roots**, 300-ms debounce and five-minute discovery cycles, not Pocket-wide constants.

Keep provider discovery caches, diagnostic source versions and index generations separate. Stable graph generations use logical revision/build/state and DB identity, **not WAL mtime**; validate a returned symbol ID with its generation and reject changed/ambiguous index selections. Report installed/indexed/build complete-or-partial/compatible/source checked-current-or-dirty independently. Static indexed relationships are candidates, never exhaustive coverage or permission to edit.

**Verified example:** CodeGraph 1.6.2 uses SDK `getCallers`/`getCallees`; there is no `getAffectedTests` API in this verified adapter. Bounded `getFileDependents` traversal plus `isTestPath` produces **test candidates**, not coverage or passing tests. Read-only SDK workers close their DB in `finally`; source freshness writes use separate owned operations. Helper import caches follow the release-directory cutover in [Browser modules and lifecycle](#browser-modules-and-lifecycle), not a custom cache loader.

## Bounded reference configuration, not platform limits

The pinned pi-lsp example exposes eight tools (four legacy LSP tools plus semantic query, AST, graph and apply), four read-only hints, twelve routes (eight retained plus four Tooling routes), two prompt sections and one `afterTool` hook. Graph synchronization intentionally has no read-only hint. These counts describe that bundle, not a required skill architecture or Pocket API parity; do not depend on its tool names to author another extension.

| Reference area | Verified pi-lsp 1.3.2 configuration |
|---|---|
| Proposal | Up to 64 files / 5,000 edits; before-source total 4 MiB, after-source total 4 MiB; apply checks stored before+after ≤8 MiB; one-hour expiry |
| Durable retention | Up to 20 proposal records / 16 MiB retained proposal JSON, retiring eligible old records rather than silently dropping pending work |
| AST | Defaults 32 files / 50 results / 200 replacements; maxima 64 / 200 / 5,000; 1 MiB per source and 4 MiB aggregate/final snapshots |
| Graph query | Default depth 2 / 30 results; maximum depth 5 / 150 results; test paths are candidates only |
| Model display | **32,000 decimal UTF-8 bytes**, not 32 KiB; oversized display becomes valid summary JSON while bounded structured data and exact proposal bytes remain retained |
| Automatic work | Five-minute discovery cycle, 300-ms debounce, at most eight active roots; existing-index synchronization only |

Sources are the pinned proposal/tooling/AST/graph/scheduler files in [Source evidence](#source-evidence-for-this-reference). Choose feature-appropriate bounds explicitly; never present these as Pocket's hard limits.

## Capability map: read only what the feature needs

Links target canonical public guides; this table intentionally avoids copying unsupported signatures or incomplete snippets.

| Feature | APIs/invariants | Guide |
|---|---|---|
| Factories/dependencies/API migration | Public types, erasable syntax, declared API/minimum, no internal imports | [Modules](https://github.com/TannerMidd/pi-pocket/blob/main/docs/extensions/modules.md), [API stability](https://github.com/TannerMidd/pi-pocket/blob/main/docs/extensions/policies/api-stability.md) |
| Tools/model calls | Schema checks, replay/memo, provider/spend checks, account model usage | [Tools](https://github.com/TannerMidd/pi-pocket/blob/main/docs/extensions/tools.md) |
| Prompt sections | `section(name, render, { tag })`; string/undefined; deterministic model-visible data, never secrets | [Sections](https://github.com/TannerMidd/pi-pocket/blob/main/docs/extensions/prompt-sections.md) |
| Tool/section wrappers | `wrapTool`/section wraps; honor prior guards and output/diagnostic contracts | [Host](https://github.com/TannerMidd/pi-pocket/blob/main/docs/extensions/host.md), [types](https://github.com/TannerMidd/pi-pocket/blob/main/docs/extensions/reference/types.md) |
| Hooks | `hook(ToolTask, { beforeTool, afterTool })`; `hook(GenerationTask, { beforeRequest, afterResponse, onYield, afterTools })`; explicit blocks, safe replay | [Hooks](https://github.com/TannerMidd/pi-pocket/blob/main/docs/extensions/hooks.md) |
| Slash commands | `web.command`; args string, conversation/global scope, toast/card, `ctx.signal`, no secrets in durable args | [Commands](https://github.com/TannerMidd/pi-pocket/blob/main/docs/extensions/commands.md) |
| App UI/tool presentations/artifacts | Public `pocket` surfaces and shared artifact data; no internal store imports | [Browser](https://github.com/TannerMidd/pi-pocket/blob/main/docs/extensions/browser-modules.md), [tool calls](https://github.com/TannerMidd/pi-pocket/blob/main/docs/extensions/tool-calls.md) |
| App events | `host.on`; after committed changes, cannot veto; dispose subscription | [Events/services](https://github.com/TannerMidd/pi-pocket/blob/main/docs/extensions/services-settings.md) |
| Inter-module services | `web.provide`, `use`, `onService`; check shape and resolve fresh on each use/reload | [Services](https://github.com/TannerMidd/pi-pocket/blob/main/docs/extensions/services-settings.md#services) |
| Owner settings | `web.settings`, `setting`, `onSettings`; typed validation, secret text server-only; browser values omit secrets | [Settings](https://github.com/TannerMidd/pi-pocket/blob/main/docs/extensions/services-settings.md#settings) |
| Ordinary sessions | `host.sessions.start(source, options, key)`; acts for source requester, policy checks, stable deduplication key | [Sessions](https://github.com/TannerMidd/pi-pocket/blob/main/docs/extensions/sessions.md) |
| Linked sessions/teams | Tool-side host API versus human `request.linkedSessions`; no actor override, stable namespaced start keys | [Linked sessions](https://github.com/TannerMidd/pi-pocket/blob/main/docs/extensions/linked-sessions.md) |
| Remote execution | `host.registerWorkspaceProvider`; canonical same-scheme URI; owner binds, shared guests may steer; no local fallback | [Workspaces](https://github.com/TannerMidd/pi-pocket/blob/main/docs/extensions/workspaces.md) |
| Private asks/credentials/browser | `host.ask`, `hide`, `commandEnv`, `browser`; no memo/log/model leakage; redaction is not a malicious-code sandbox | [People/values](https://github.com/TannerMidd/pi-pocket/blob/main/docs/extensions/people-values.md) |
| Public capability pages | `web.links.create/get/list/end`, `web.publicPage(handler)`; opaque origin, no scripts, escaped input, short-lived tokens | [Public pages](https://github.com/TannerMidd/pi-pocket/blob/main/docs/extensions/public-pages.md) |
| Theme surface | `themeApi`, tokens/parts/states, palette pairing, CSS/assets, no code | [Themes](https://github.com/TannerMidd/pi-pocket/blob/main/docs/extensions/themes.md), [surface](https://github.com/TannerMidd/pi-pocket/blob/main/docs/extensions/reference/theme-surface.md) |

Services/settings/public pages/people APIs are experimental since 0.22.0; workspace providers and ordinary-session start are experimental since 0.28.0. Check each newer member's exact reference/version when supporting an older Pocket; otherwise declare the current minimum and fail clearly.

`cwdOf`, `roleOf`, newer browser surfaces and other members also carry their own `@since`/`@experimental`; check the actual declarations, not just the broad categories above. Global web audience does not become session-invite access merely because a route binds a conversation.

## Selected hard limits (Pocket 0.28.0)

| Resource | Limit |
|---|---|
| One module load | 30 seconds; startup modules initially share 30 seconds, then each remaining load has 2 seconds |
| Async disposal on server shutdown | 3 seconds total |
| Served browser file | 8 MiB; independent of stricter gallery bundle limits |
| Gallery extension bundle | 50 files; 512 KiB/file; 2 MiB total |
| Gallery theme bundle | 200 files; 16 MiB total; metadata/palettes 8 KiB/file; CSS 256 KiB total; font/image 4 MiB/file |
| Public page form | 64 KiB; 50 fields; 15-second arrival deadline |
| Concurrent public page handlers | 32 overall, 4/link; 30-second handler deadline |
| Commands | 50/module; args 4,000 characters; 4 active runs/person; handlers must honor cancellation |
| Module settings/services | 30 settings and one provided service/module |

Other counts, presentation/event budgets, link lifetimes, name/field limits, and version-specific additions: [limits](https://github.com/TannerMidd/pi-pocket/blob/main/docs/extensions/reference/limits.md). A limit is not authorization; a temporary test app is not an OS security sandbox.

The 14,000-character prompt guard in Pocket's fresh baseline test excludes native Pi/external drop-ins; it is **not** an installed-extension runtime cap or a billed-token count. Measure descriptions, schemas and sections separately when needed, and do not treat character estimates as billing evidence.

## Source evidence for this reference

| Contract / lesson | Current or immutable source |
|---|---|
| Factory, host identity, web/browser field shapes | [Pocket public declarations](https://github.com/TannerMidd/pi-pocket/blob/main/types/pocket.d.ts), [type reference](https://github.com/TannerMidd/pi-pocket/blob/main/docs/extensions/reference/types.md), [tools](https://github.com/TannerMidd/pi-pocket/blob/main/docs/extensions/tools.md), [hooks](https://github.com/TannerMidd/pi-pocket/blob/main/docs/extensions/hooks.md); inspected installed Pi Durable 1.5.0 `dist/harness/types.d.ts` (`ToolExecutionApi`, `ToolExecutionResult`, `NestedToolExecutionResult`, `HookApi`) and `dist/index.d.ts` exports |
| Tool argument normalization | Inspected Pi AI 1.5.0 `dist/utils/validation.js`: `compile(schema, { formats, coerce: true, unresolvedRefs: "reject" })`, cloned `parse()` result before execution |
| Output/fencing/native codemode | [Native codemode source](https://github.com/TannerMidd/pi-pocket/blob/main/src/server/extensions/codemode.ts), [fence source](https://github.com/TannerMidd/pi-pocket/blob/main/src/server/fence.ts); installed Pi Durable 1.5.0 `dist/harness/tool.js` validates structured output and bounds model output |
| Request authority/settings/lifetime | [Routes](https://github.com/TannerMidd/pi-pocket/blob/main/docs/extensions/routes.md), [HTTP API source](https://github.com/TannerMidd/pi-pocket/blob/main/src/server/http/api.ts), [workspaces](https://github.com/TannerMidd/pi-pocket/blob/main/docs/extensions/workspaces.md) |
| Reload, cache, theme and shutdown limits | [Modules](https://github.com/TannerMidd/pi-pocket/blob/main/docs/extensions/modules.md), [cleanups](https://github.com/TannerMidd/pi-pocket/blob/main/docs/extensions/cleanups.md), [themes](https://github.com/TannerMidd/pi-pocket/blob/main/docs/extensions/themes.md), [limits](https://github.com/TannerMidd/pi-pocket/blob/main/docs/extensions/reference/limits.md) |
| Verified LSP framing/freshness/native edit hook | [pi-lsp source](https://github.com/MasFana/pi-lsp/blob/981ba85be0b12d980fc770c4129577524f08501a/pi-lsp.ts) |
| Provider identity, exact AST bytes and graph SDK/runtime | [AST provider](https://github.com/MasFana/pi-lsp/blob/981ba85be0b12d980fc770c4129577524f08501a/pi-lsp/v1.3.2/ast.ts), [graph adapter](https://github.com/MasFana/pi-lsp/blob/981ba85be0b12d980fc770c4129577524f08501a/pi-lsp/v1.3.2/graph.ts), [graph worker](https://github.com/MasFana/pi-lsp/blob/981ba85be0b12d980fc770c4129577524f08501a/pi-lsp/v1.3.2/graph-worker.cjs) |
| Proposal/apply receipts, command recovery, output budget and installer truth | [Proposals](https://github.com/MasFana/pi-lsp/blob/981ba85be0b12d980fc770c4129577524f08501a/pi-lsp/v1.3.2/proposals.ts), [tooling](https://github.com/MasFana/pi-lsp/blob/981ba85be0b12d980fc770c4129577524f08501a/pi-lsp/v1.3.2/tooling.ts) |
| Bounded disposal, automatic freshness and source events | [Process runner](https://github.com/MasFana/pi-lsp/blob/981ba85be0b12d980fc770c4129577524f08501a/pi-lsp/v1.3.2/process.ts), [single-flight scheduler](https://github.com/MasFana/pi-lsp/blob/981ba85be0b12d980fc770c4129577524f08501a/pi-lsp/v1.3.2/automatic.ts), [source watcher](https://github.com/MasFana/pi-lsp/blob/981ba85be0b12d980fc770c4129577524f08501a/pi-lsp/v1.3.2/watch.ts) |

The linked pi-lsp release records 36 regressions and native/browser/provider smoke observations on **Linux only**. These are historical implementation evidence, not checks run by this documentation edit, and not proof of every catalog installer or platform.
