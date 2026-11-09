# Complete Pocket drop-in example

A whitespace word-count tool/command plus an owner-only workspace sheet. No file writes, subprocesses, network services, or private configuration. Copy the **two exact files** below into the isolated Pocket copy's `data/extensions/`, then enable `sample-counter.ts`. Pocket supplies the runtime dependencies and `_pocket.d.ts` type link; do not run these directly from the skill folder.

## `sample-counter.ts`

```typescript
/** Counts whitespace-delimited words and shows the current session workspace. */
import { obj, str } from "@earendil-works/pi-schema";
import { defineExtension, defineTool } from "@earendil-works/pi-durable";
import type { Host, Web } from "./_pocket.d.ts";

function countWords(text: string) {
    return text.split(/\s+/).filter((word) => word !== "").length;
}

const wordCount = Object.assign(defineTool({
    name: "sample_word_count",
    description: "Count whitespace-delimited words in text.",
    parameters: obj({ text: str({ description: "Text to count" }) }),
    replay: "safe",
    execute: async (args, api, context) => ({
        output: [{
            type: "text" as const,
            text: JSON.stringify({
                words: countWords(args.text),
                cwd: api.env?.cwd ?? (await api.agent(context)).cwd,
            }),
        }],
    }),
}), { annotations: { readOnlyHint: true } });

export const pocketApi = 2;

export default function createSample(_host: Host, web: Web) {
    web.command("sample-words", {
        description: "Count whitespace-delimited words",
        args: "<text>",
        scope: "conversation",
        handler: (args) => ({ type: "toast", level: "info", message: `${countWords(args)} words` }),
    });
    web.conversationRoute("GET", "c/:conversation/workspace", (request) => ({
        id: request.conversation.id,
        cwd: request.conversation.cwd,
    }), { conversation: "conversation", access: "owner" });
    web.client("sample-counter.js", { access: "owner" });
    return defineExtension({ name: "sample-counter", tools: [wordCount] });
}
```

## `sample-counter.js`

```javascript
export const pocketApi = 2;

export default function setup(pocket) {
    const { html, useEffect, useState } = pocket;
    function Workspace() {
        const [conversation, setConversation] = useState(pocket.conversationId());
        const [workspace, setWorkspace] = useState(null);
        const [error, setError] = useState("");
        const [revision, setRevision] = useState(0);
        useEffect(() => pocket.onConversation(setConversation), []);
        useEffect(() => {
            setWorkspace(null);
            setError("");
            if (conversation === null) return;
            const stop = new AbortController();
            pocket.api(`c/${conversation}/workspace`, undefined, { signal: stop.signal }).then(
                (data) => {
                    if (!stop.signal.aborted && pocket.conversationId() === conversation) setWorkspace(data);
                },
                (failure) => {
                    if (!stop.signal.aborted && pocket.conversationId() === conversation) setError(failure.message);
                },
            );
            return () => stop.abort();
        }, [conversation, revision]);
        if (conversation === null) return html`<p class="muted">Open a session to inspect its workspace.</p>`;
        if (error) return html`<div>
            <p class="error-box" role="alert">${error}</p>
            <button class="button" onClick=${() => setRevision((value) => value + 1)}>Retry</button>
        </div>`;
        return workspace
            ? html`<p>Session ${workspace.id}: <code>${workspace.cwd}</code></p>`
            : html`<p class="muted">Loading workspace…</p>`;
    }
    pocket.sheet({ id: "workspace", title: "Sample workspace", component: Workspace });
    pocket.menu({ id: "workspace", label: "Sample workspace", sheet: "workspace" });
}
```

## Exercise before publishing

From the Pocket checkout, run `node test/serve.ts` and use the printed **temporary** data folder/sign-in links. Enable this bundle, open **Menu → Sample workspace**, switch sessions, and verify the folder follows the selected source. The browser request must include `X-Pocket: 1`; denied/failed requests must not look like an empty successful workspace.

Run `/sample-words one two three` and expect a private `3 words` toast. Exercise the tool with empty text, whitespace-only text, tabs/newlines, and Unicode; expected counts are 0, 0, 3 for `one\ttwo\ncafé`, and 2 for `café 🦀`. Assert the tool's parsed JSON and session CWD, not a scripted model echo. Close/disable/reload and confirm old subscriptions/requests are gone.

Its manifest declarations are: `extensions: ["sample-counter"]`, `tools/readOnlyTools: ["sample_word_count"]`, `commands: ["conversation sample-words"]`, `routes: ["GET c/:conversation/workspace"]`, `client/access: "owner"`, and empty `hooks`, `sections`, `wraps`. Compute actual byte sizes/hashes from both files; no sample or fabricated commit/hash belongs in a published entry.

Validated with Pocket 0.28.0: real drop-in loading, word-count boundaries/session CWD, bound HTTP responses, browser `X-Pocket: 1`/200 and rendered workspace, slash-command toast, and theme metadata/palette parsing. Theme cross-device visual review is still required before publishing a theme.
