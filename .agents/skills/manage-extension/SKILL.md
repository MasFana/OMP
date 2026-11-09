---
name: manage-extension
description: Create, review, verify, publish, and index Pi Pocket extensions and themes using actual public APIs, authorization boundaries, and immutable gallery manifests
---

# Manage Pi Pocket extensions and themes

Use for creating/updating a Pocket drop-in, reviewing its binding/security, or publishing an extension/theme through OMP. Current authoring target: **Pocket 0.28.0, Node ≥22.19.0, extension API 2**. Older compatibility requires checking each API's version; never invent a fallback or copy Pi CLI APIs into Pocket.

- [OMP registry](https://github.com/MasFana/OMP) · [Pocket source](https://github.com/TannerMidd/pi-pocket) · [Pocket guides](https://github.com/TannerMidd/pi-pocket/tree/main/docs/extensions)
- Read [contracts.md](contracts.md) for APIs/identity/security; [gallery.md](gallery.md) for manifests/themes/releases.
- The complete, executable [example.md](example.md) provides a tool, slash command, owner-only conversation route, and browser sheet. It is not a placeholder scaffold.

## 1. Scope before implementation

1. Write the observable behavior, inputs, persisted state, UI/CLI surface, affected sessions, external effects, cleanup, and acceptance checks.
2. Choose **extension** for executable behavior; **theme** for palette/layout with no code. Prefer an extension over changing core when public capabilities suffice; consult Pocket's [core-or-extension policy](https://github.com/TannerMidd/pi-pocket/blob/main/docs/extensions/policies/core-or-extension.md).
3. Establish caller rights: host-wide administration requires owner identity; session work must use the current session/requester and its policies. An owner-only browser module does not protect agent tools.
4. Choose local-only versus workspace-provider execution explicitly. Never resolve a remote URI through the local filesystem or silently fall back to local execution.
5. Read the exact public signatures in Pocket's linked `_pocket.d.ts`, guides, and API references before adding calls. Prefer existing examples/patterns; do not infer SDK methods from names.

## 2. Build a self-contained drop-in

- Default-export a factory `(host, web)` returning an extension, an array, or no extension for web-only modules; async factories are supported. Export `pocketApi = 2` for tools returning `output`.
- Use erasable TypeScript, explicit local `.ts` import extensions, Node built-ins and Pocket-provided runtime packages. Use top-level `import type` for `_pocket.d.ts`; never ship this link or `node_modules`.
- Give module/tool/section/command IDs a unique prefix. Command names start with a letter and contain a hyphen. Do not shadow core or `pocket-` names; let the real parser catch the current reserved set.
- Keep top-level evaluation declarative. Start slow work after load; acquire exclusive resources lazily because the next version loads before the old version disposes.
- Resolve tool CWD from `api.env?.cwd ?? (await api.agent(context)).cwd`. Check the current requester before effects outside that session. Use `execute(args, api, context)`, not a Pi CLI tool signature.
- Expose only supported surfaces and declare exactly what loads. Prompt `sections` are model instructions, **not** pages/sheets/panels. Implement meaningful behavior; no stubs, empty tools, fake successes, or fabricated configuration APIs.

## 3. Bind HTTP and browser behavior correctly

- Use module-relative `web.route` paths and `pocket.api()` for browser requests. Pocket requires `X-Pocket: 1` on **all** extension methods, including GET, plus authentication and the route's audience.
- Use `web.conversationRoute` for session-dependent operations. Trust `request.conversation` rather than client-supplied CWD/model/source identity; mutations also check steering/turn rights.
- Default app-wide routes/clients to owner. `view` is not automatic read-only enforcement: do not expose mutations to viewers. Global audiences exclude people invited to only one session.
- Treat HTTP errors as errors, not empty successful results. Cancel outstanding work on navigation/disposal, prevent stale results crossing session boundaries, and refresh affected UI after success.
- Follow `pocket` component/hook/status signatures, documented theme tokens, and `pocket.style()`; do not add global CSS that bypasses the theme layer.
- Register cleanup for timers, subscriptions, requests, providers, services, sockets, and processes. Server shutdown waits **3 seconds total** for async disposers; browser cleanup must perform required cancellation synchronously.

## 4. Verification gate

Run code, not merely a schema/type check. Use a **separate test data folder**, never the Pocket data that people use.

- Pocket's `test/helpers.ts` must load before app/runtime imports so its isolation takes effect. `openApp`, `owner`, and `newSession` support an actual temporary Pocket; close the app and call `cleanUp`.
- For interactive smoke, run `node test/serve.ts` **from the Pocket checkout**, copy the bundle into the printed copy's `data/extensions/`, follow its owner sign-in link, enable the module, and use its actual UI/routes/commands. Stop it using its printed kill command.
- Prove meaningful outputs/state transitions: parsing boundaries, Unicode/empty inputs, workspace identity, actor changes, denied global effects, mutation/viewer separation, stale replies, aborts, reload/disposal, and failed dependencies.
- Test tool behavior directly through the real prepared drop-in/execution API, or use a scripted model to initiate a real call. Do not assert a mock model's echoed text, wiring, copied configuration, source text, or only “does not throw.”
- Browser additions need actual visual/interaction proof. An auth-aware HTTP request is useful but does not prove that the browser sends the header or uses the right API.
- For themes, run Pocket's theme checker and inspect dark/light, narrow/wide, touch/keyboard, focus, contrast, readable disabled/error states, and existing extension surfaces.
- Keep deterministic consumer-visible regressions; remove throwaway scaffolds and temporary data. Document behavior, dependencies, authority, configuration, installation/reload, limits, and release steps.

Canonical test examples: Pocket's `test/extension-{commands,web,ui}.test.ts` and `test/docs-examples.test.ts`; adapt assertions to real consumer behavior, not incidental wording.

## 5. Publish in immutable order

1. Finish runtime/behavior/security proof and docs. Review secrets, private paths, dynamic imports, shell commands, network destinations, and dependency/bundle completeness.
2. Commit and **push the source repository first**. Use its published full commit; do not label uncommitted bytes as an older or future commit.
3. Generate a manifest via Pocket **Installed → Share…** or real committed-file bytes. Fill author/source/version/tags, required API/minimum Pocket version, exact `declares`, file sizes/hashes, and genuine revocations. See [gallery.md](gallery.md).
4. A `--local` check verifies local bytes only. Before publication, run OMP's full validator **without `--local`** so it downloads the pushed commit and checks what loads. This executes extension code; it is not an OS sandbox.
5. Build `index.json` from manifests; never edit it independently. Commit and push OMP's entry, generated index, and related documentation together.
6. Refresh the owner's gallery, review the update diff, and apply it explicitly. Confirm the loaded revision; helper changes can need a restart, and reinstalling an old pin can undo a local patch.

## Completion checklist

- All named behavior implemented and exercised; no unsupported APIs, fake hashes, placeholders, silent errors, or hidden privilege expansion.
- Source/bundle imports valid in Pocket's prepared runtime; tests/docs/lockfiles kept in the source repo, generated links/secrets ignored.
- Session authority, caller identity, replay/idempotency, error/abort handling, and lifecycle reviewed.
- Loaded registrations equal `declares`; file bytes equal hashes/sizes; public pushed commit and compatible API minimum verified.
- Source and registry commits pushed; final delivery links them and states only observed verification and real limitations.
