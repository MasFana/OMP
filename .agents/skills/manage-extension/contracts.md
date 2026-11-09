# Pocket authoring contracts

Target: Pocket **0.28.0**, Node **≥22.19.0**. Public types: Pocket's `types/pocket.d.ts`, linked as the drop-in's `./_pocket.d.ts`. Guides and references live in [TannerMidd/pi-pocket/docs/extensions](https://github.com/TannerMidd/pi-pocket/tree/main/docs/extensions); use the exact signature/version there, not assumptions about the Pi CLI.

## Runtime, imports, and tools

- A `<name>.ts` module default-exports a factory receiving `(host, web)`. It may return an extension, multiple extensions, nothing for a web-only module, or an async result. `defineExtension`/`defineTool` come from `@earendil-works/pi-durable`.
- Node executes erasable TypeScript: no enums, namespaces, or constructor parameter properties. Local runtime imports end in `.ts`; helpers belong under the module's bundle directory. Files beginning `_` or ending `.test.ts` are not loaded as drop-ins.
- Use `import type { Host, Web } from "./_pocket.d.ts"`; the type-only link disappears at execution and is not a gallery file. Pocket prepares runtime package links. Do not vendor dependencies or import by a machine-specific absolute path.
- Use `@earendil-works/pi-schema` builders (`obj`, `str`, `num`, `int`, `bool`, `arr`, `union`, `opt`) for new schemas. `obj` is closed unless explicitly opened. A TypeBox builder supplied by the runtime may also produce JSON Schema; do not depend on the removed public `pi-ai.Type` type export. Legacy drop-in compatibility is not a new-code API contract.
- `execute(args, api, context)` returns `{ output: [{ type: "text", text }] }`; export `pocketApi = 2`. Hooks/wrappers also read/write `output`. `api.output(text)` streams; when the return omits `output`, streamed output becomes the result. Throw a safe `Error` for a tool failure.
- `replay: "safe"` means repetition after restart is harmless; it is not automatic idempotency. Otherwise an interrupted call is not replayed. `api.memo(name, context)` reads and `api.memo(name, value, context)` writes call-scoped state. `${api.taskId}:${api.callId}` remains stable across replay. Never memo credentials or answers to private asks.
- Add `annotations: { readOnlyHint: true }` after `defineTool` when needed, as `Object.assign` in the [complete example](example.md). This is an author promise that affects Plan mode, not a security boundary.
- Use `api.env` for the session's execution environment and `(await api.agent(context)).cwd` for its folder. Never assume `process.cwd()` means the caller's workspace. Local-only modules must explicitly refuse remote URI schemes; environment-aware modules must use the registered provider rather than local `fs`/subprocess fallback.

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

## HTTP and request lifetime

- `web.route(method, path, handler, { access })` mounts relative paths at `/api/x/<module>/`. Methods: GET, POST, PUT, PATCH, DELETE. Fixed path segments outrank parameters; give overlapping routes consistent authority or check the actor explicitly.
- Every extension request needs authentication and **`X-Pocket: 1`**, including GET. Missing header is rejected before route lookup. Prefer browser `pocket.api(path, body?, options?)`; do not hardcode an application base path or swallow non-success responses as empty data.
- `web.conversationRoute(method, path, handler, { conversation: parameterName, access })` requires that parameter in the path. Core binds `{ id, title, cwd, model?, thinkingLevel }`, checks seeing, and checks steering/turn for mutations. Linked starts additionally enforce plan/spend/team/model policy.
- `request.params`, `query` (`URLSearchParams`), and `body` are untrusted. Validate decoded path components before filesystem use. `request.body` is empty for GET/DELETE.
- Use request `snapshot`, `context`, and `commit` for your own module documents, named `x.<module>.<name>`. Await commits; keep external side effects outside transactions. Viewer writes and late-completing writes are refused/rolled back.
- `request.signal` aborts on disconnect; normal handler return does not itself abort it. `request.context.abortSignal` and fresh document/linked-session capabilities end on return too. Never retain request capabilities in background timers.
- `web.error(status, message)` deliberately exposes that exact message to callers. Sanitize it. Unexpected errors are generic to guests; owner/log messages may contain sensitive detail.

## Browser modules and lifecycle

- Register `web.client("<name>.js", { access })`, an `.mjs` file, or a folder `<name>/` whose `index.js` is the entry. Folders can serve JS/MJS/CSS/JSON/images/fonts; never TypeScript, hidden files, `node_modules`, or symlinks. All eligible users can read served files: store no secrets there.
- A browser default export gets the **module-scoped** `pocket`. `pocketApi` describes that browser module's required API; API 1 can be valid for older unchanged surfaces, but current-target examples use 2. Follow each feature's `minPocket` date separately.
- Components use `pocket.html`, `useState`, `useEffect`, and other provided hooks. Pages/sheets get `pocket` and `close`; sheets can also get opening props. Prefer `pocket`'s helpers to importing or cloning internal app state.
- Surfaces: `rail`, `menu`, `launcher`, `page`, `sheet`, `panel`, `status`, `topbar`, `composerButton`, session-list chips/actions/filters, and tool-call presentation. Status uses **`text`/`short`**, not a menu's `label`. IDs are module-scoped; keep labels, focus, narrow-layout actions, and keyboard behavior accessible.
- `pocket.conversationId()` may be null. `pocket.onConversation(callback)` immediately reports current identity and returns an unsubscribe function. Abort old reads/actions and ignore stale replies when source identity changes; do not send an old displayed workspace to a new session's action.
- `web.send(event, data, { to? })` / `pocket.on(event, handler)` transport live module events, not a durable log. Fetch current state on opening/reconnecting before relying on updates. Listener return values provide cleanup.
- Use documented theme tokens and `pocket.style()` so the theme layer can override your surface. Do not add global style/link hacks or store secrets in served JSON/assets.
- A new module version initializes **before** old disposal, so exclusive locks/listeners must be acquired lazily. Failed reload keeps the prior version. Imported helper-code changes require restart; replacing the server/client entry requires confirming the newly loaded browser URL/revision.
- `web.onDispose` releases server resources; `pocket.onDispose` or a returned browser cleanup releases browser resources. Cancel requests, clear timers, remove subscriptions/providers, and terminate owned work. Server async shutdown cleanup has a total deadline; browser cleanup is not awaited.

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
