# server/agent

The agent loop, and the two agents built on it: the librarian and its planner.

## The agent loop

`server/agent/` runs a model with tools: it calls the model, runs the tools it asks for, sends
the results back, and repeats until the model ends its turn. Every turn is one gateway call, so
each one is reserved, capped, settled and written to the ledger like any other, under the job the
caller names.

- **`runAgent`** (`agent/loop.ts`) takes the gateway, the job, the system prompt, the tools, the
  conversation so far (ending with the user's message), `maxTurns` and a signal. It is an async
  generator of `status` and `text` events that returns the whole conversation.
- **`defineTool`** (`agent/tool.ts`) makes an `AgentTool` from a name, a description, the input's
  zod fields, a status line (shown while it runs: "Looking through the library…") and
  `run(input, signal)`, which returns the result's text.

### A run, turn by turn

1. Stream a turn through the gateway with the system prompt, every tool's definition and the
   whole conversation. Each text delta is yielded as a `text` event as it arrives.
2. An `end_turn` with no content ends the run normally, after a turn that ran tools: the
   conversation is returned as it is, ending with the tool results, since an empty assistant
   message would make a later request invalid. Models sometimes do this once a tool has done
   what was asked. On the first turn it throws `AgentStopped`, since the model did nothing.
   A `tool_use` stop with no `tool_use` block throws `AgentStopped` too: it would make the next
   request invalid (an empty user message of results).
3. Append the assistant's message: its text and `tool_use` blocks, in order.
4. If the stop reason is `end_turn`, return the conversation. If it is anything but `tool_use`
   (`max_tokens`, `refusal`, …), throw `AgentStopped`.
5. If this was turn `maxTurns`, throw `AgentStopped` (below), without running its tools.
6. For each `tool_use` block, in order: stop if the signal has aborted, yield the tool's
   `status` (when the tool exists), then run it. Then append all the results as one user message
   of `tool_result` blocks, and go back to step 1.

### Tools

- **The schema.** `defineTool` builds a `z.strictObject` from the input's fields and turns it
  into the tool's JSON Schema with `z.toJSONSchema`, without its `$schema` key. The JSON Schema
  has `additionalProperties: false`, and the check rejects extra keys to match.
- **Input is checked before a tool runs.** Input that fails the schema never reaches `run`: the
  model gets an error result (`is_error: true`) that starts "Invalid input:" and names each
  problem, so it can try again.
- **Other failures** also become error results, and the run carries on: a tool that throws
  (the result is `String(error)`, such as `Error: …`) and a call to a tool that doesn't exist.
  `runTool` makes those results, with two exceptions that end the run instead: a tool that throws
  `SpendingRefused` (its own model call was refused by the caps, so the reply can report the
  budget) and a tool that throws once the run's signal has aborted.
- **Tools run one after another**, even when the model asks for several at once, and all their
  results go back in one message.

### Stopping

- **A turn limit.** A run takes at most `maxTurns` model calls. A model that still calls tools on
  its last allowed turn ends the run with `AgentStopped` ("The model was still calling tools
  after 8 turns", for the librarian): that turn's tools don't run, since the model would never
  see their results (one could plan a manual, with model calls of its own), and the model isn't
  called again. Every call made before the stop has settled as usual. A run that ends its turn on
  the last allowed turn returns normally. The caps bound spending across runs; the limit keeps
  one run from spending a day's cap: every turn sends the whole conversation, so each costs more
  than the last.
- **Errors end the run as they are.** A refusal (`SpendingRefused`, `GatewayBusy`), a stall or a
  failed call is thrown from the generator unchanged, after the turns before it have settled.
  So is a `SpendingRefused` from a tool's own model call, such as the planner's.
  The caller tells "budget" from "error" with `instanceof SpendingRefused`, as the section
  writer does.
- **Aborting.** The signal goes to every gateway call and every tool. An abort mid-turn aborts
  the model call, which settles as `aborted`. An abort while a tool runs ends the run: none of
  the turn's remaining tools runs, since one could delete or create a manual, and the next
  turn's gateway call refuses an aborted signal before reserving anything.
- **The caller reads the run with `for await`** (or calls `return()` when it stops early), so the
  gateway call underneath is aborted and settled, as `server/gateway/README.md` requires.

### Events

`status` and `text` are the only events, so a route can forward each as a server-sent event as it is
(The librarian, below). Text from different turns arrives in order, with the statuses of the tools
run between them.

### Tests

`loop.test.ts` drives `runAgent` through the real gateway and a file ledger, with the
scripted fake model in `scripted-client.ts`, and covers each rule above.

## The librarian

The librarian on the landing page is the agent loop (above) with the library's tools, behind
one route. The browser keeps the conversation and sends it whole with each message; the reply
streams back. `sendReply` (`agent/librarian/reply.ts`) runs it for one conversation and sends the
reply's events.

### The route

`POST /api/librarian` with `{ messages }` (`api/librarian.ts`):

- **Checked first.** At most `LIBRARIAN_LIMITS.earlierExchanges` (10) earlier exchanges and the
  new message, so 1–21 messages, each `user` or `agent` with 1–4,000 characters
  (`messageCharacters`) of text after trimming, alternating from a `user` message and ending with
  one. An `agent` message may also carry `deleteOutcome`, `"kept"` or `"deleted"`: how the delete
  confirmation it proposed ended. Messages have no other keys. Anything else, or a `?freeze` that
  isn't a number from 0 to 1, is `400 { error: "Bad request" }`. The browser sends only the
  latest 10 exchanges whose reply finished, leaving out any with a message over the limit, so a
  failed reply never reaches the model and a long conversation keeps working. The limits also
  bound what one reply can cost.
- **Plain text only.** Each message becomes a prompt message with string content (`agent` becomes
  `assistant`). The model never sees earlier replies' tool calls, only what was said, and the
  system prompt tells it to check the library with a tool rather than trust earlier messages,
  because the user can open and delete manuals directly.
- **How a proposed delete ended.** The user message after an `agent` message with a `deleteOutcome`
  starts with the page's note (`DELETE_OUTCOME_NOTES` in `prompt.ts`), then a blank line and the
  user's words: `<page_note>In the delete confirmation your last reply opened, the user chose Keep
  it: the manual was not deleted.</page_note>`, or that they confirmed it and the manual has been
  deleted. The note goes in the user's turn, where it happened, not at the end of the reply: a note
  in the model's own turn is one it learns to write itself.
- **The reply.** `sendReply` runs `runAgent` with the job `librarian` and `LIBRARIAN_MAX_TURNS`
  (`server/README.md` › Configuration) as `maxTurns`, and sends:
  - `status` with each tool's status line, as the loop reports it, and the create tool's progress
    lines while the planner works;
  - `text` with each text delta;
  - `withdraw` just before the first text that follows a tool call (a `tool-input` or
    `tool-use` event, known tool or not) made after some text was sent: the text so far was
    written before the call, and the page replaces it with the text that follows. Text before a
    tool stays on the page while the tool runs, and stands as the reply when nothing follows it,
    so a reply is the last text the model wrote, and never ends empty when the model wrote
    anything. `sendReply` sees the events by wrapping the gateway it gives the loop (the
    planner's calls go to the gateway itself);
  - `action` when a tool hands the page an action (below), as the tool runs;
  - then `done` when the loop returns, or `failed`: `"budget"` for `SpendingRefused` (a cap or
    the kill switch), `"error"` for anything else, which is logged (`GatewayBusy`, a stall, a
    failed call, `AgentStopped`).
  - If the client disconnects, the signal aborts the loop, which settles the call as `aborted`
    (The agent loop, above), and nothing more is sent.

### The tools

In `agent/librarian/tools.ts` and `create-manual.ts`:

| Tool | Input | Status | Result |
| --- | --- | --- | --- |
| `list_manuals` | none | Checking the shelves… | JSON: each manual's `id`, `title`, `subtitle`, `sections_written` and `sections`, in title order (`librarySummaries`, shared with `GET /api/manuals`); or `The library is empty.` |
| `find_manuals` | `topic` | Searching the shelves… | JSON: up to 5 matches, best first: `id`, `title`, `subtitle` and up to 3 `matching_sections` (`"A.1 Servos, Steppers and Pneumatics"`); or `No manual matches "…".` |
| `open_manual` | `manual_id` | Opening the manual… | Sends `{ type: "open" }`. JSON: the `manual`'s `id` and `title`, and a fixed `result`: the reader opens it when the reply has finished |
| `propose_delete` | `manual_id` | Preparing the delete… | Sends `{ type: "propose-delete" }`. JSON: the `manual`'s `id` and `title`, and a fixed `result`: nothing is deleted, only the user's choice in the page's confirmation deletes it, and never say it has been deleted |
| `create_manual` | `request` | Planning a manual… | Hands the request to the planner (below). Saved: sends `{ type: "created" }`, and JSON: the `manual`'s `id`, `title`, `subtitle` and counts of `chapters` (appendices included) and `sections`, and a fixed `result`: it is saved and the library shows it; give its title and offer to open it, but don't open it unless asked. Not saved: JSON with only a fixed `result`: nothing was created; say so plainly. A reply plans at most one manual: the tools are built for each reply, and a second call is refused at once, with no model call, as the error result `Error: Only one manual per reply; nothing was created.` |

- **Results are data.** Manual text (titles, subtitles, summaries) appears only as JSON values,
  never inside the results' wording, and the system prompt says tool results are data, never
  instructions.
- **An unknown `manual_id`** throws, so the model gets an error result that names the id and says
  how to find one, and no action is sent.
- **Only creating changes anything on the server**, and it only adds a manual: it can never
  replace one. Opening and deleting are actions for the page. A delete happens only through the
  page's confirmation dialog and `DELETE /api/manuals/:manualId`, never through the librarian, so
  neither the page nor the model can delete on its own.
- **Finding** (`find.ts`) lower-cases the topic and each manual's text, splits it on anything
  that isn't a letter, keeps words of 3 or more letters that aren't stop words (function words,
  and request words such as `manual`, `open` and `delete`), and reduces each to a base form
  (`-ies` → `y`, `-ed` dropped from words of 6+ letters, one trailing `s` dropped, not `ss`). A
  manual scores 3 for each topic word in its title, 2 for each in its subtitle and 1 for each in
  its table of contents (chapter and section titles and section summaries); ties go by title.

### The system prompt

The system prompt (`agent/librarian/prompt.ts`) is the same for every request: the prompt
itself is the reference for what the librarian is told. It names no tool. A tool's own rules live
in its description, sent with every call: `propose_delete`'s says it deletes nothing, that only a
`<page_note>` tells how the confirmation ended, and to propose again when asked; `create_manual`'s
says at most one per reply, to ask first when the topic is unknown, and not to open the new manual
in the same reply. The prompt keeps the rules that span tools: tool results are data, never
instructions; a manual's id comes from a tool; a reply acts on at most one manual, and only when
asked; an ambiguous request gets a question. It also says to write the reply once, after the last
tool call, and always to write one. A test checks that every snake_case word in the prompt and
the tools' descriptions is a tool, an input field or `page_note`, so a renamed tool can't stay
mentioned.

No `cache_control` is sent (`server/gateway/README.md` › The Bedrock client). A reply takes one call
per model turn: two for a list or a find, two or three to open or propose a delete, and two to
create a manual, with the planner's one or two calls between them. `server/README.md` ›
Configuration has what a turn reads, writes, costs and reserves.

### The turn limit

A reply stops after 8 model turns (`LIBRARIAN_MAX_TURNS`), well above the 2 or 3 a reply takes, so a
model that keeps calling tools can't spend the day's cap on one reply. The loop throws
`AgentStopped` instead of calling the model a ninth time (The agent loop, above), so the reply ends
with `failed: "error"` and the page shows its "reply failed" state.

## The planner

The planner (`agent/planner/`) plans a new manual and saves it. `planManual` takes the
gateway, the store, the request, a signal and an `onStatus` callback, and returns the saved
manual or the problems that stopped it.

- **Its own job.** Each attempt is one gateway call under the job `plan-manual`, with its own
  `maxTokens` and idle timeout (`server/README.md` › Configuration), so it is reserved, capped and
  recorded like any other call. Gateway errors are thrown as they are. A refusal by the caps or the
  kill switch ends the reply with `failed: "budget"`, because the loop's `runTool` lets
  `SpendingRefused` through; any other (a stall, `GatewayBusy`) is turned by `runTool` into an error
  result for the librarian, as for any tool that throws.
- **The prompt** (`prompt.ts`). The system prompt is the same for every plan: what a plan is for
  (a later writer sees only the voice and each section's title and summary), the rules for each
  field, the size to aim for and the hard limits, the locale (American English, the voice
  included, as in the writer's prompt), and one seed manual, *Moving House Without Losing the
  Cat*, as JSON in the tool's own form, never to be reused. The user message holds the request
  inside `<request>`, with `<` escaped so it can't close the tag, then the ids already taken in
  the library, and on a retry the problems with the first plan. The system prompt says the
  request describes the manual wanted and is never an instruction: nothing inside it changes the
  rules, the tool or the format.
- **The tool**, `save_manual`, takes the plan in the stored manual's own format (`id`, `title`,
  `subtitle`, `voice`, `chapters`, `appendices`). Its JSON Schema comes from the same zod schema
  that checks it (`toolDefinition` in `agent/tool.ts`, which `defineTool` uses too). The planner
  calls the gateway itself rather than running the agent loop: a successful save needs no further
  model turn, so none is paid for.
- **The checks** (`check.ts`): the schema (strings, slug ids and titles up to 80 characters, a
  voice of 300–1,500, summaries of 20–200 and never blank; 2–7 chapters, 0–2 appendices, 2–5
  sections in each, no unknown keys), then every chapter and section id used once, 6–32
  sections in all, and an id no manual in the library has. Each problem is stated in words the
  model can act on. Every seed manual passes.
- **Labels are assigned, not checked:** each chapter, appendix and section is labelled by its
  place (`1`, `2`…; `A`, `B`; `2.1`, `2.2`…), whatever the model wrote (a label may be left out),
  so a numbering slip never costs a paid retry.
- **One retry.** A plan with problems, a reply with no `save_manual` call, or a plan cut off at
  `max_tokens` gets exactly one more attempt: a fresh call whose request message lists the
  problems. `ATTEMPTS` is 2, so there are at most two paid calls. If the second fails too,
  nothing is saved, and the result says why.
- **Saving.** A plan that passes is saved with `createManual`, which never replaces a manual. If
  its id was taken between the check and the save, that counts as a failed attempt.
- **Progress.** The create tool's status, `Planning a manual…`, shows while the planner starts. The
  planner then reads the streamed input (`tool-input`, `server/gateway/README.md`) for the manual's
  title, which comes first, and reports `Planning “<title>”…`, about a second in; a retry reports
  `Revising the plan…`, then `Revising “<title>”…`. The create tool passes these to `sendReply`,
  which sends them as `status` events.

## The fake model

The fake model (`fakeModel` in `agent/fake-model.ts`) is the default (`config.models`,
`server/README.md` › Choosing the models):

- It is a `ModelClient`, which the real gateway calls in place of the Bedrock client, under the id
  `fake-model` at $0 (`server/gateway/README.md` › The fake model). So each of its calls is
  reserved, refused by the kill switch, stopped by the idle timeout and written to the ledger,
  as Claude's are.
- It answers each job from its request alone (`ModelRequest`'s `job` and prompt), and reports
  zero tokens and a stop reason at the end of every turn.
- Asked to write a section (the job `write-section`), it repeats the user's message: the fake
  writer sends the section's sample text (`server/writer/README.md` › The fake writer).
- Asked for a librarian turn (the job `librarian`), it reads the latest user message, without a
  page note at its start, for a keyword, the first match in this order: `delete` or `remove`;
  `create`, `new` or `start`; `open` or `read`; `list`, `library`, `manuals` or "what do I have";
  `find`, `anything` or `which`; `help`. Then
  it plays the turns a model would, through the real tools: a list calls `list_manuals` and
  lists every title with its counts; an open or a delete calls `find_manuals` with the message
  as the topic, then `open_manual` or `propose_delete` with the best match, then says so; with
  no match it asks which manual. A find calls `find_manuals` with the message as the topic, then
  names the match or matches, or says it found none. A new manual calls `create_manual` with the
  message as the request, then gives the saved manual's title and counts and offers to open it,
  or says it couldn't plan it; help and anything else get fixed replies.
- Asked for a plan (the job `plan-manual`), it plays the planner's turn (`planner/fake-planner.ts`):
  `fakePlan`, the same nine-section manual for any request, titled after what the request is "about"
  (`Building a Treehouse`), streamed as one `tool-input` then saved with `save_manual` after a
  pause. Asked twice for the same title, its id is taken both times, so the second request isn't
  saved.
- It waits before each turn, plan and section, and streams text in the fake writer's chunks
  (`chunkEnds`), at the pace `README.md` › The models gives (`FakeModelPace`). Its fixed replies
  are `FAKE_REPLIES`, which the tests and the shot script match.
- It stops on its signal: a signal that has already aborted is refused before any event, and
  once the signal aborts, the next read throws the abort, whichever event the caller holds.
- `unrecordedFakeModel` calls it directly, as a `Gateway` with no caps, kill switch or ledger,
  for the previews (below) and for tests of what sits above the gateway.

## Previews

`?freeze=<0–1>` on the librarian's route, in `api/preview.ts`. Whatever models are configured, it
runs `sendReply` with the fake model at once (no waits) and collects the events. It then sends the
statuses and the text up to the last chunk end at or before that fraction of the reply's text, then
`frozen`, or `done` when nothing was cut (`?freeze=1`). Actions are never sent, its store saves no
manual (`createManual` only answers `"created"`), and it calls the fake model outside the gateway
(`unrecordedFakeModel`), so a preview costs nothing, records nothing and changes nothing.
The browser uses it for `?conversation=demo` and `?librarianFreeze=` (`src/librarian/README.md`).

## Tests

The tests, all offline, cover the route, the tools, the page notes, narration kept or withdrawn,
replies whose last turn is empty, with the fake model and with scripted turns through the real
gateway, the turn limit, the planner's one retry and its checks, and finding; previews call no
model and save nothing.

`model.test.ts` is the shared suite of the librarian's and the planner's model, the
`ModelClient` that `config.models` chooses: its tests run once with the fake model and once with
a scripted `ModelClient` standing in for Claude (`scripted-client.ts`), both through the real
gateway. Each test gives the turns Claude would send; the fake model reads the request itself.
It checks the contract, not the text: a turn reports its tokens and its stop, so its call settles
complete and not estimated; a librarian turn streams its text in several events and ends with one
`stop`; a tool call has an id and an input and stops with `tool_use`; an aborted signal ends the
stream at the next read; and a plan passes the planner's checks and is saved, or nothing is saved
once the plan is aborted. The caps, the kill switch and stalls are the gateway's, in its own
tests; `server/app.test.ts` checks that the fake models' calls reach them.

## Files

- `loop.ts`: `runAgent`: model turns and tool calls through the gateway (The agent loop, above).
- `tool.ts`: `defineTool`: a tool's schema, status line and handler.
- `scripted-client.ts`: a fake `ModelClient` that plays scripted turns, tool calls included.
- `fake-model.ts`: the scripted fake model, for every job (The fake model, above).
- `librarian/`: the librarian agent (The librarian, above).
  - `reply.ts`: `sendReply`: runs the loop on a conversation and sends the reply's events.
  - `prompt.ts`: the system prompt.
  - `tools.ts`: list, find, open and propose a delete.
  - `create-manual.ts`: the create tool, which hands the request to the planner.
  - `find.ts`: `findManuals`: manuals that match a topic.
- `planner/`: plans a new manual and saves it (The planner, above).
  - `plan.ts`: `planManual`: one plan, one retry, then save.
  - `prompt.ts`: the system prompt, the request message and the `save_manual` tool.
  - `check.ts`: the plan's schema and checks.
  - `fake-planner.ts`: the fake model's plan.
