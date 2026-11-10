# Complete Pocket drop-in example

A bounded whitespace word-count tool/command plus an owner-only workspace sheet. Copy the **two complete files** below into an isolated Pocket data folder's `extensions/`, then enable `sample-counter.ts`. Pocket prepares runtime dependencies and the `_pocket.d.ts` type link; do not run the server file directly from this skill folder. These declarations target the local Pocket **0.28.0 / extension API 2** (Node >=22.19), not a claimed compatibility test against every older release.

**Policy:** counting is side-effect-free and available to callers that native Pocket permits; it is not an owner-only tool. The conversation command is available to people who may steer that session. Both the browser client **and its bound route** are owner-only. All surfaces report authoritative session CWD, never `process.cwd()` or a browser-supplied folder. Local paths and remote workspace URIs are displayed as opaque metadata: this sample does not read, canonicalize, execute, or write either. A local filesystem/provider extension must instead reject remote workspaces and enforce canonical containment; see [contracts.md](contracts.md).

## `sample-counter.ts`

```typescript
/** Counts whitespace-delimited words and shows the current session workspace. */
import { Type } from "typebox";
import { defineExtension, defineTool } from "@earendil-works/pi-durable";
import type { Host, Web } from "./_pocket.d.ts";

const MAX_TEXT = 65_536;
const WHITESPACE = /\s/u;

function countWords(text: string) {
    let words = 0;
    let inWord = false;
    for (let index = 0; index < text.length; index++) {
        const isWord = !WHITESPACE.test(text.charAt(index));
        if (isWord && !inWord) words++;
        inWord = isWord;
    }
    return words;
}

export const pocketApi = 2;

export default function createSample(host: Host, web: Web) {
    const wordCount = Object.assign(defineTool({
        name: "sample_word_count",
        description: "Count whitespace-delimited words in text; return the current session workspace.",
        parameters: Type.Object({
            text: Type.String({ maxLength: MAX_TEXT, description: "Text to count (at most 65,536 characters)" }),
        }, { additionalProperties: false }),
        structuredOutputSchema: Type.Object({
            kind: Type.Literal("word-count"),
            words: Type.Integer({ minimum: 0 }),
            cwd: Type.String(),
        }, { additionalProperties: false }),
        replay: "safe",
        execute: async (args, api, context) => {
            context.abortSignal?.throwIfAborted();
            const result = {
                kind: "word-count" as const,
                words: countWords(args.text),
                cwd: host.cwdOf(api.conversationId),
            };
            return {
                output: [{ type: "text" as const, text: JSON.stringify(result) }],
                structuredOutput: result,
            };
        },
    }), { annotations: { readOnlyHint: true } });

    web.command("sample-words", {
        description: "Count whitespace-delimited words",
        args: "<text>",
        scope: "conversation",
        handler: (args, context) => {
            context.signal.throwIfAborted();
            return { type: "toast", level: "info", message: `${countWords(args)} words` };
        },
    });
    web.conversationRoute("GET", "c/:conversation/workspace", (request) => ({
        id: request.conversation.id,
        cwd: request.conversation.cwd,
    }), { conversation: "conversation", access: "owner" });
    web.client("sample-counter.js", { access: "owner" });
    return defineExtension({ name: "sample-counter", tools: [wordCount] });
}
```

`Type` is the **runtime `typebox` export**, not `pi-ai.Type`. The output's `kind` uses a real literal schema; a string description such as `str("word-count")` would not enforce that value. `structuredOutputSchema` is the current registration property. API 2 uses `output`, not `content`; model text and structured data intentionally contain the same small object. Read-only and safe-replay declarations are per tool: counting has no effects, although a later replay may observe a changed CWD. Pocket still owns native Plan/approval checks. The factory returns a named `defineExtension`, not a bare tool.

Tool argument validation can coerce values in the inspected Pi AI runtime: numeric `42` is normalized to string `"42"` and counts as one word. The recipe proves that behavior separately from missing, non-coercible, extra and over-limit inputs; a string schema is not a strict original-wire-type guarantee.

## `sample-counter.js`

```javascript
export const pocketApi = 2;

/** @param {import("./_pocket.d.ts").Pocket} pocket */
export default function setup(pocket) {
    const { html, useEffect, useRef, useState } = pocket;
    const cleanups = new Set();
    let disposed = false;

    // One idempotent release function works for unmount and synchronous module disposal.
    function own(cleanup) {
        const release = () => {
            if (cleanups.delete(release)) cleanup();
        };
        cleanups.add(release);
        return release;
    }

    function Workspace() {
        const [conversation, setConversation] = useState(pocket.conversationId());
        const [workspace, setWorkspace] = useState(null);
        const [error, setError] = useState("");
        const [revision, setRevision] = useState(0);
        const active = useRef(null);

        useEffect(() => own(pocket.onConversation((id) => {
            // Abort immediately on navigation, including A -> B -> A before effects run.
            active.current?.abort();
            setWorkspace(null);
            setError("");
            setConversation(id);
            setRevision((value) => value + 1);
        })), []);

        useEffect(() => {
            setWorkspace(null);
            setError("");
            if (conversation === null || disposed) return;
            const stop = new AbortController();
            active.current = stop;
            const cancel = own(() => stop.abort());
            const current = () => !disposed && !stop.signal.aborted &&
                active.current === stop && pocket.conversationId() === conversation;

            void (async () => {
                try {
                    // Adds module scope, normal authentication and X-Pocket: 1, including GET.
                    const data = await pocket.api(`c/${conversation}/workspace`, undefined, { signal: stop.signal });
                    if (!current()) return;
                    if (data === null || typeof data !== "object" ||
                        data.id !== conversation || typeof data.cwd !== "string") {
                        throw new Error("Invalid workspace response.");
                    }
                    setWorkspace(data);
                } catch (failure) {
                    if (current()) setError(failure instanceof Error ? failure.message : String(failure));
                } finally {
                    cancel();
                    if (active.current === stop) active.current = null;
                }
            })();
            return cancel;
        }, [conversation, revision]);

        if (conversation === null) return html`<p class="muted">Open a session to inspect its workspace.</p>`;
        const refresh = () => setRevision((value) => value + 1);
        if (error) return html`<div>
            <p class="error-box" role="alert">${error}</p>
            <button class="button" onClick=${refresh}>Retry</button>
        </div>`;
        return html`<div>
            ${workspace && workspace.id === conversation
                ? html`<p>Session ${workspace.id}: <code>${workspace.cwd}</code></p>`
                : html`<p class="muted">Loading workspace…</p>`}
            <button class="button" onClick=${refresh}>Refresh</button>
        </div>`;
    }

    const sheet = pocket.sheet({ id: "workspace", title: "Sample workspace", component: Workspace });
    const menu = pocket.menu({ id: "workspace", label: "Sample workspace", sheet: "workspace" });
    pocket.onDispose(() => {
        disposed = true;
        for (const release of [...cleanups]) release();
        menu.remove();
        sheet.remove();
    });
}
```

The sheet uses `component`, the menu uses `label`, and both return removable handles. Closing the sheet releases its subscription/request; switching sources aborts synchronously and rejects stale replies by controller identity and selected session. Settled requests leave the cleanup set and active ref, so completed capabilities are not retained in timers. Module disposal synchronously releases everything even if a component effect's cleanup has not run yet. Denial, network failure and malformed/wrong-source JSON become errors, not empty success. Refresh also covers a CWD change within the same session. There is no polling or server-owned background work; web registrations themselves go with the server module.

## Exact declarations

The gallery `declares` object for these two files is:

```json
{
    "extensions": ["sample-counter"],
    "tools": ["sample_word_count"],
    "readOnlyTools": ["sample_word_count"],
    "hooks": [],
    "sections": [],
    "wraps": [],
    "routes": ["GET c/:conversation/workspace"],
    "commands": ["conversation sample-words"],
    "client": "owner",
    "access": "owner"
}
```

Compute actual UTF-8 byte sizes and SHA-256 values from the extracted files; never publish fabricated hashes or a commit pointing to uncommitted bytes. Runtime/type checks below do not prove publication identity. Follow [gallery.md](gallery.md) for source-first pinning, remote validation and native gallery review/reload.

## Isolated verification recipe (run before publishing)

**Required, not a claim these changed snippets passed:** use the prepared Pocket 0.28.0 checkout and its existing runtime/development dependencies. Do not install into the skill directory. The smoke harness below imports `test/helpers.ts` **before app imports**, extracts both complete files, enables them in temporary data, invokes the tool through real scripted-model calls, captures the actual API 2 result through a temporary native hook, and serves real HTTP. The observer exists only under the helper-owned temporary root and is never part of `declares` or a published bundle.

Run from the Pocket checkout; `SAMPLE_DOC` may point to another copy of this document. `SAMPLE_TYPECHECK=1` also type-checks only the extracted server file against Pocket's prepared `_pocket.d.ts`, using the checkout's existing TypeScript binary:

```bash
SAMPLE_TYPECHECK=1 rtk node --input-type=module <<'JS'
const h = await import("./test/helpers.ts");
const assert = (await import("node:assert/strict")).default;
const { readFile, writeFile, mkdir } = await import("node:fs/promises");
const { join } = await import("node:path");
const { createHash } = await import("node:crypto");
const { execFileSync } = await import("node:child_process");
const { createServer } = await import("node:http");
const { createHandler } = await import("./src/server/http.ts");
const { fauxAssistantMessage, fauxText, fauxToolCall } = await import("@earendil-works/pi-ai/providers/faux");
const data = join(h.root, "counter-data");
const dropIns = join(data, "extensions");
let app, server;
globalThis.sampleCounterResults = [];
try {
    await mkdir(dropIns, { recursive: true });
    const doc = await readFile(process.env.SAMPLE_DOC ?? "../OMP/.agents/skills/manage-extension/example.md", "utf8");
    for (const file of ["sample-counter.ts", "sample-counter.js"]) {
        const expression = new RegExp("## `" + file.replaceAll(".", "\\.") + "`\\n\\n```(?:typescript|javascript)\\n([\\s\\S]*?)\\n```");
        const match = expression.exec(doc);
        assert.ok(match, `complete file block: ${file}`);
        const bytes = Buffer.from(match[1] + "\n");
        await writeFile(join(dropIns, file), bytes);
        console.log(file, bytes.length, createHash("sha256").update(bytes).digest("hex"));
    }
    await writeFile(join(dropIns, "sample-observer.ts"), `
import { defineExtension, hook, ToolTask } from "@earendil-works/pi-durable";
export const pocketApi = 2;
export default () => defineExtension({ name: "sample-observer", hooks: [hook(ToolTask, {
    afterTool: async (call, result) => {
        if (call.name === "sample_word_count") globalThis.sampleCounterResults.push(result);
        return result;
    },
})] });
`);
    app = await h.openApp(h.scriptedModel((context) => {
        const last = h.lastText(context);
        return last.role === "user"
            ? fauxAssistantMessage([fauxToolCall("sample_word_count", JSON.parse(last.text))], { stopReason: "toolUse" })
            : fauxAssistantMessage([fauxText("Count complete.")]);
    }), data);
    const owner = h.owner(app);
    await app.setExtensionEnabled(owner, "sample-counter.ts", true);
    await app.setExtensionEnabled(owner, "sample-observer.ts", true);
    const module = (await app.extensions(owner)).modules.find((item) => item.file === "sample-counter.ts");
    assert.ok(module && module.error === undefined && module.enabled);
    assert.deepEqual(module.extensions, [{ name: "sample-counter", tools: ["sample_word_count"],
        readOnlyTools: ["sample_word_count"], hooks: [], sections: [], wraps: [] }]);
    assert.deepEqual(module.web.routes, ["GET c/:conversation/workspace"]);
    assert.deepEqual(module.web.commands, ["conversation /sample-words"]);
    assert.equal(module.web.client, "owner");
    assert.equal(module.web.access, "owner");
    if (process.env.SAMPLE_TYPECHECK === "1") execFileSync(process.execPath, [
        join(process.cwd(), "node_modules/typescript/bin/tsc"), "--noEmit", "--strict", "--skipLibCheck", "--erasableSyntaxOnly",
        "--module", "NodeNext", "--moduleResolution", "NodeNext", "--target", "ES2023",
        join(dropIns, "sample-counter.ts"),
    ], { cwd: dropIns, stdio: "inherit" });
    const elsewhere = join(h.root, "elsewhere");
    await mkdir(elsewhere);
    const ids = [await h.newSession(app), await h.newSession(app, elsewhere)];
    for (const id of ids) {
        await h.loadTools(app, id, "sample_word_count");
        for (const [text, words] of [["", 0], [" \t\n", 0], ["one\ttwo\ncafé", 3],
            ["café 🦀", 2], [" one\u00a0two ", 2], [42, 1], ["x".repeat(65_536), 1]]) {
            await h.say(app, id, JSON.stringify({ text }));
            const result = globalThis.sampleCounterResults.at(-1);
            assert.ok(result && result.isError !== true);
            const expected = { kind: "word-count", words, cwd: app.cwdOf(id) };
            assert.deepEqual(result.structuredOutput, expected);
            assert.deepEqual(result.output, [{ type: "text", text: JSON.stringify(expected) }]);
            const view = await (await app.harness.conversation(id, h.context)).context(h.context);
            const actual = view.messages.findLast((message) => message.role === "toolResult" && message.toolName === "sample_word_count");
            assert.ok(actual && !actual.isError);
            assert.deepEqual(actual.content, result.output);
        }
    }
    for (const args of [{}, { text: { invalid: true } }, { text: "ok", extra: true }, { text: "x".repeat(65_537) }]) {
        await h.say(app, ids[0], JSON.stringify(args));
        const view = await (await app.harness.conversation(ids[0], h.context)).context(h.context);
        assert.equal(view.messages.findLast((message) => message.role === "toolResult").isError, true);
    }
    server = createServer(createHandler({ app, listen: { host: "127.0.0.1", port: 0 }, restart: () => {} }));
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    const base = `http://127.0.0.1:${server.address().port}`;
    const guest = app.config.addUser("Counter guest", "guest");
    const route = `/api/x/sample-counter/c/${ids[1]}/workspace`;
    const get = (path, token, header = true) => fetch(base + path, { headers: {
        ...(token ? { authorization: `Bearer ${token}` } : {}), ...(header ? { "X-Pocket": "1" } : {}),
    } });
    const response = await get(route, app.config.ownerToken);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { id: Number(ids[1]), cwd: elsewhere });
    assert.equal((await get(route)).status, 401);
    assert.equal((await get(route, app.config.ownerToken, false)).status, 403);
    assert.equal((await get(route, guest.token)).status, 404);
    assert.equal((await get("/api/x/sample-counter/c/999999999/workspace", app.config.ownerToken)).status, 404);
    await app.setExtensionEnabled(owner, "sample-counter.ts", false);
    assert.equal((await get(route, app.config.ownerToken)).status, 404);
    console.log(`Counter load/results/session/boundary/HTTP smoke passed${process.env.SAMPLE_TYPECHECK === "1" ? "; server type-check passed" : "; type-check not run"}; browser checks still required.`);
} finally {
    server?.closeAllConnections();
    if (server?.listening) await new Promise((resolve) => server.close(resolve));
    await app?.close();
    delete globalThis.sampleCounterResults;
    h.cleanUp();
}
JS
```

Tool result `diagnostics` are arrays; the execution context's `abortSignal` may be absent. The observer returns the entire original result, preserving native output/details/control and avoiding injected structured data in schema-less tools. Real nested callers consume `isError`, `diagnostics` and `structuredOutput` through the exact installed execution API in [contracts.md](contracts.md), not a guessed `host.executeTool`. This counter needs no nested tool or native-edit hook of its own.

### Browser acceptance (separate from the smoke harness)

From the Pocket checkout run `rtk node test/serve.ts`, use only its **temporary** data folder and supported owner sign-in link/input, and copy the extracted two files into that copy's `data/extensions/`. Enable the bundle, then exercise the actual browser module (an echo-only test model does not exercise the tool):

1. Confirm the loaded client URL/revision and that **Menu → Sample workspace** actually opens the sheet. A login screen or an attempted animation-time click is not UI proof. With no selected session, expect the instruction to open one.
2. Make two sessions with different local CWDs. Open the sheet in A, navigate to B, wait until native Pocket has selected B, and reopen the sheet if navigation closed it. Assert the displayed session id and folder are B's; inspect an actual `GET /api/x/sample-counter/c/<B>/workspace` with **`X-Pocket: 1`** and 200. Change B's CWD, Refresh, and assert the new folder, not a cached default. Remote CWD metadata, if your copy already has a real workspace provider, remains an opaque URI; no provider installation or local execution is part of this test.
3. Using request interception/delay, hold A's response, navigate A → B → A and reopen after native navigation settles, then release the old A reply with a distinguishable old folder. It must not render; cancellation may prevent it reaching JavaScript at all. Repeat with a current reply arriving before an old failure. Closing the sheet during a delayed request must abort it; reopening must issue a fresh request. Scope timing assertions to the sheet, not matching folder text elsewhere in the app. Interception controls race timing; it does not replace the real 200/route proof.
4. Force a route denial/network failure and then a malformed or wrong-session success response. Each must show an alert and Retry, never an empty successful folder. Restore the real route, Retry, and assert it recovers. Authenticate the copy's guest separately: neither the menu/client nor the owner route should be available (the HTTP smoke expects 404 for the latter).
5. Run `/sample-words one two three` and observe a private **`3 words`** toast. Tool empty/whitespace/Unicode/schema bounds are asserted above, not inferred from a scripted-model echo. Native Pocket caps command arguments at **4,000 characters** before this handler runs; the tool's separate 65,536-character schema bound does not enlarge that command limit.
6. Disable while a request is delayed; confirm cancellation and removal of the old menu/sheet, then re-enable and reopen. Change a served JS file in the **isolated copy** to trigger a new browser address; assert disposal of old requests/subscriptions, one current menu/sheet and the actual loaded revision. Separately reload the server module and verify its registrations. Server reload alone does not prove an unchanged browser file was reimported. Stop the copy with Ctrl+C to clean its owned temporary data/processes. Native helper-cache and publication details belong in [gallery.md](gallery.md).

## Source evidence and limits

These are implementation/declaration references, not assertions that the revised files have been exercised:

- [Pocket public declarations](https://github.com/TannerMidd/pi-pocket/blob/main/types/pocket.d.ts): `Host.cwdOf`, `ConversationWebRequest.conversation`, `Web.conversationRoute`, `CommandContext.signal`, `Pocket.api/onConversation/onDispose`, `SheetSpec`, `MenuSpec`, and `Added.remove`. Check the declarations of the exact installed release; the links' `main` can move.
- [Pocket browser HTTP implementation](https://github.com/TannerMidd/pi-pocket/blob/main/web/store.js) and [module UI lifecycle](https://github.com/TannerMidd/pi-pocket/blob/main/web/extension-ui.js): module-scoped API calls, `X-Pocket` and error propagation; browser registrations/disposal.
- [Pocket drop-in loader](https://github.com/TannerMidd/pi-pocket/blob/main/src/server/reload.ts), [example tests](https://github.com/TannerMidd/pi-pocket/blob/main/test/docs-examples.test.ts), [HTTP tests](https://github.com/TannerMidd/pi-pocket/blob/main/test/extension-web.test.ts), [isolated helpers](https://github.com/TannerMidd/pi-pocket/blob/main/test/helpers.ts) and [manual test server](https://github.com/TannerMidd/pi-pocket/blob/main/test/serve.ts): dependency/type preparation, loaded declares, real calls, owner/header/denial checks and helper-owned cleanup.
- Local Pocket `node_modules/@earendil-works/pi-durable/dist/harness/types.d.ts` (installed **1.5.0**) defines `ToolRegistration.structuredOutputSchema`, `ToolExecutionResult.output/structuredOutput/diagnostics`, tool `execute(args, api, context)` and `replay`. Local Pocket `package.json` pins `typebox` **1.3.27**; [TypeBox literal/union documentation](https://github.com/sinclairzx81/typebox/blob/main/design/website/docs/type/literal.md) explains real literals. Dependency versions describe this inspected installation, not universal provider minimums.

No theme is included. The existing theme metadata/palette and cross-device visual guidance remains in [gallery.md](gallery.md); successful counter smoke would not validate a theme.

### Exercised verification in this checkout

The exact recipe above passed on Pocket 0.28.0 / Pi Durable 1.5.0 with Node 26.1.0 and the checkout's TypeScript 6 compiler on Linux: prepared drop-in/declaration loading, strict erasable server types, whitespace/Unicode/coercion/size/schema boundaries, text/structured agreement, two session CWDs, HTTP owner/header/guest/missing/disabled-route checks. Actual browser proof covered owner sign-in, no-session guidance, a bound workspace and refreshed CWD, `X-Pocket: 1`/200, wrong-session/malformed/network alert-and-Retry recovery, delayed-request cancellation on sheet close and fresh reopen without the stale reply. The conversation command returned `3 words` and native rejection above 4,000 characters was exercised. These observations do not verify publication, every native navigation/reload race, older runtimes or theme/platform compatibility.
