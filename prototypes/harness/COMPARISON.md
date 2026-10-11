# Agent loop: our own loop or Strands Agents

Two prototypes of the librarian's loop, each with one tool (`list_manuals`, which reads a seeded
temp data folder through `createFileManualStore`) and each calling the model through the gateway
with a scripted fake `ModelClient`. Nothing calls Bedrock. RL.5 deletes this folder.

Run them with `npx vitest run prototypes/harness` (9 tests) and typecheck them with
`npx tsc -p prototypes/harness/tsconfig.json`. `npm run build` doesn't cover this folder.

| | Our own loop | Strands Agents 1.20.0 |
| --- | --- | --- |
| Loop code | `own-loop/loop.ts`: 69 lines | `strands/gateway-model.ts` (129 lines) + `strands/librarian.ts` (39 lines) = 168 |
| Tests | `own-loop/loop.test.ts`: 95 lines, 5 tests | `strands/librarian.test.ts`: 80 lines, 4 tests |
| New packages | none | `@strands-agents/sdk`, 17 more and a second `@anthropic-ai/sdk`; node_modules 191 MB → 223 MB |
| Gateway errors | arrive as thrown (`SpendingRefused`) | wrapped in Strands' `ModelError`; the original is `.cause` |
| Abort | settles `aborted` with no extra code | **leaks the call** unless the provider returns the gateway's iterator on abort |

Shared by both: `gateway/` (the gateway change, below), `fake-client.ts` (46), `library-tool.ts`
(15) and `setup.ts` (40).

## Readability

- **Our own loop** is one `for` loop over turns: stream a turn, append the assistant message, stop
  on `end_turn`, run the tools on `tool_use`, append the results, go again. A reader sees every
  step. It uses the gateway's types directly, so there is no translation layer.
- **Strands** hides the loop, but the provider is mostly translation: Strands messages to Anthropic
  blocks, gateway events to Strands' seven stream event types, our stop reasons to its camelCase
  ones. To read or debug it you need Strands' model contract, `streamAggregated`, its 16 agent
  event types, and its defaults (below). The package itself is about 36,800 lines of JS.

## How the gateway fits

**The change the gateway needs is the same for both.** It's in `gateway/`, a copy of
`server/gateway/gateway.ts` with 35 changed diff lines (imports, two constants, `inputTokenBound`)
and new types in `gateway/types.ts`:

- `Prompt` gains `tools`, and message content may be blocks: `text`, `tool_use`, `tool_result`.
  These use Anthropic's field names, so `bedrock-client.ts` can pass them straight to the SDK.
- `ModelEvent` gains `{ type: "tool-use", id, name, input }`, emitted once a tool block is whole.
  Haiku 4.5 on Bedrock rejects `eager_input_streaming`, so its tool input arrives buffered anyway.
- `Job` gains `"librarian"`, with its own model and `maxTokens` in config.
- **The worst-case bound** counts the UTF-8 bytes of the system prompt, the tools as JSON and every
  message as JSON. JSON escaping only adds bytes, so this stays an upper bound. On top of that come
  10 tokens of framing per tool and per block, and the tool-use system prompt the API adds whenever
  `tools` is set: 588 tokens for Haiku 4.5 (496 with `tool_choice: auto`; Anthropic's tool-use
  pricing table, checked 2026-10-11). That number is per model, so in RL.5 it belongs with the
  model's price or job config.
- Everything else is unchanged: one reservation per model call, the caps, the concurrency limit,
  the idle timeout, the kill switch, and one `reserve` and one `settle` in the ledger per turn,
  with job `librarian`.

Not built, needed for either loop: `bedrock-client.ts` sends `tools` and block content, and maps
`content_block_start` (a `tool_use`), `input_json_delta` and `content_block_stop` to one `tool-use`
event. That's about 15 lines.

**The whole conversation.** Each call reserves for everything it sends, so the bound grows turn by
turn (a test checks this). A run isn't reserved up front. Every call is checked against the caps,
so a run can be refused between turns. Both prototypes test this: the first call settles and the
second is refused. A turn limit bounds a run: `maxTurns` in our loop, or `limits: { turns }` on a
Strands `invoke`. For example, at `maxTokens` 1,024 and a 3,000-token conversation, one call
reserves about $0.009, so 5 turns reserve at most about $0.05.

**Aborts.** Our loop reads the gateway with `for await`, so stopping always calls `return()` and
the gateway settles the call.

Strands pulls its model stream with bare `next()` calls. When it's cancelled, it throws at a
checkpoint between events and never calls `return()` on the provider's stream. The gateway's
generator then sits at `yield` forever: no `settle` in the ledger, and its concurrency slot is held
until the server restarts. The architecture doc warns about this case.

- **Reproduced:** with the guard removed, the cancel test finds no settle entry at all.
- **The fix:** `GatewayModel` listens for Strands' abort signal and calls `return()` on the
  gateway's iterator, so the call settles as `aborted`.
- **The risk:** this works, but it relies on Strands' internals and could break in any Strands
  release. A test would have to guard it.

**Errors.** Strands rethrows everything from the model as `ModelError`, with our error as its
`cause`. The route would have to unwrap it to tell "budget" from "error". Strands also turns
`max_tokens` into its own `MaxTokensError`.

## What Strands brings into node_modules

- **The new packages:**
  - `@strands-agents/sdk` 1.20.0, published 2026-10-08, so only three days old;
  - its required peers `@modelcontextprotocol/client` and `core`, with `jose`, `eventsource`,
    `cross-spawn` and others, and `@opentelemetry/api`;
  - `uuid`, `yaml` and `@types/json-schema`;
  - `zod`.
- **`zod` is undeclared.** Strands imports it at runtime but declares it only as an optional peer.
  It is installed only because `@anthropic-ai/sdk` also names it as a peer. If we adopt Strands,
  `zod` has to become our own dependency.
- **Hoisting churn.** Strands has an optional peer on `@anthropic-ai/sdk ^0.109.1`. npm therefore
  put 0.109.1 at the root and moved the Bedrock SDK's 0.133.0 under
  `@anthropic-ai/bedrock-sdk/node_modules`. Root `@smithy/types` moved from 2.x to 4.19, with
  about 17 nested 2.x copies. The lockfile diff is +551/−298 lines. `npm test` still passes, and
  `npm audit` reports 0 vulnerabilities.
- **The AWS SDK.** Strands depends on `@aws-sdk/client-bedrock-runtime` `^3.1132`. That is already
  installed through `@anthropic-ai/bedrock-sdk` (3.1149.0), so the copy is shared. But Strands'
  main entry exports `BedrockModel`, so **importing `@strands-agents/sdk` loads
  `client-bedrock-runtime` and `@aws-sdk/credential-provider-node`**, the default credential
  chain, into the server process. Only `BedrockModel` uses it.
- **When `BedrockModel` gets built:**
  - **`new Agent({})` with no `model`, or with a model given as a string,** constructs
    `new BedrockModel()` silently. Its first call would resolve credentials through the default
    chain: env, `~/.aws` profiles, SSO, IMDS.
  - **Our credentials rule** then rests on every `Agent` being given a `GatewayModel`. The
    prototype tests that (`agent.model` is a `GatewayModel`).
- **The SDK-boundary test doesn't see Strands.** It flags quoted `@anthropic-ai/` and `@aws-sdk/`
  strings, not `@strands-agents/`. If we adopt Strands, the boundary test should treat
  `@strands-agents/` as an SDK allowed only in the agent's provider and agent files, and forbid
  the name `BedrockModel`.
- **Defaults to switch off:**
  - **Console printing.** `printer` is on by default; the prototype sets `printer: false`.
  - **Retries.** A retry strategy is on by default; the prototype sets `retryStrategy: null`. A
    retry would be a second paid call, though it only fires on Strands' throttling error, which
    our provider never throws.
  - **The sandbox** defaults to running on the host; the prototype sets `sandbox: false`.
  - **History is trimmed** by a sliding window of 40 messages, silently.

Our own loop adds no packages and leaves the boundary test and the credentials rule as they are.

## Streaming status to the page

Both prototypes produce the same `status` and `text` events, and both tests assert them in order.

- **Our own loop** yields them itself (`{ type: "status", text: "Looking through the library…" }`).
  The route forwards them as SSE events. A delete proposal (RL.6) becomes one more event type.
- **Strands** is mapped from its event stream by `librarianEvent`: a `beforeToolCallEvent` becomes
  a status, and a text delta becomes text. That's 15 lines, but it depends on Strands' event
  classes.
  - **For a confirmed delete,** Strands offers interrupts. These keep their state on the `Agent`
    instance. Our conversation lives in the browser and is resent with each message, so the server
    would rebuild an `Agent` from the history on every request and mostly not use them.

## Testing with a fake model

Both use the same scripted `ModelClient` behind the real gateway, so every test also exercises
reservations, caps and the ledger. A fake turn is a list of `ModelEvent`s, such as `toolUseTurn`
and `textTurn`.

- **Our loop's tests** drive a generator.
- **Strands' tests** drive `agent.stream` and need to know its event and result types.
- **Effort is about equal.** RL.5 asks for tests of a tool given bad input:
  - **Strands** validates input only for zod tools, so `zod` would be needed;
  - **our loop** needs a validator, either a small one of our own or `zod` as well.

## Moving to the AgentCore harness later

AWS documents the AgentCore harness (GA; checked 2026-10-11) as follows:

- **Configuration:** a harness is configuration (model, tools, instructions), run in AgentCore
  microVMs.
- **Model calls:** **the harness calls the model itself** (Bedrock, OpenAI, Gemini, LiteLLM).
- **Strands:** it is "powered by Strands Agents" and can be exported to Strands code for AgentCore
  Runtime.
- **Tools on our side:** they become `inline_function` tools. The loop pauses with a tool-use event
  and waits for our result.

RL.8 researches the details.

- **On the managed harness, neither loop's model calls pass through our gateway.** Spend limits
  would move to AgentCore's cost controls. The loop we choose now would be dropped. What carries
  over is the tool definitions (JSON schemas plus handlers) and the system prompt. These are the
  same in both prototypes.
- **On AgentCore Runtime with our own code,** either loop runs as is, gateway included. The ledger
  and caps still need the DynamoDB version already planned.
- **Strands' advantage** is that its code is the harness's export format. That only matters if we
  first build in the harness and then need to leave it.

## Recommendation

**Build our own loop.**

- **It is less than half the size** (69 lines against 168), with nothing between the loop and the gateway.
- **It fits the gateway with no workarounds.** It settles every call on abort, keeps the gateway's
  errors as they are, and adds no packages.
- **It keeps the credentials guarantee simple.** No AWS default credential chain is loaded, and
  there is no `BedrockModel` one missing option away.

Strands' extras aren't needed for five tools and a planner: hooks, interrupts, conversation
managers, MCP and multi-agent. And its fit with the gateway depends on its internals: the abort
leak, the wrapped errors and the defaults. If we later move to the managed AgentCore harness, the
gateway is bypassed whichever loop we pick, and our tool definitions and system prompt move over
unchanged.
