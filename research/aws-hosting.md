# Claude Platform on AWS and the AgentCore harness

Research only. Every source was read on **2026-10-11**. No AWS calls were made, and nothing was
signed up for or created. "Unconfirmed" marks anything the official docs don't settle.

**Status (2026-10-11):** nothing here is adopted. The app calls Claude Haiku 4.5 on Bedrock, not
through Claude Platform on AWS. The agent loop is our own, built on the gateway
(`server/agent/README.md` › The agent loop), not on the AgentCore harness.

## Summary

| | Claude Platform on AWS | AgentCore harness |
| --- | --- | --- |
| What it is | Anthropic's own Claude API, reached and billed through your AWS account | AWS-hosted agent loop (Strands, Python) that you configure instead of code |
| Newer Claude models | All of them, same day as Anthropic's API | Through Bedrock, so this account's block applies |
| Web search / fetch | Yes, Anthropic's server tools | Only through an AgentCore Gateway connector, in `us-east-1` only |
| Our gateway in the loop | Yes: one client file changes | No: the harness calls the model itself |
| Works offline in tests | Yes, through a fake `ModelClient`, as with Bedrock | No: `agentcore dev` deploys to AWS first |
| Recommendation | **Try it.** It is the likeliest way past the Bedrock block, and it changes one file | **Don't adopt it.** It takes model calls out of our gateway |

## Claude Platform on AWS

### What it is, and how it differs from Bedrock

- **Anthropic runs it, not AWS.** AWS handles sign-in (SigV4 or an API key), IAM, CloudTrail and
  billing through AWS Marketplace. Anthropic runs inference and processes the data.
- **The API is Anthropic's own** (`/v1/messages` and the rest), not Bedrock's.
  - New models and features usually arrive the same day as on Anthropic's API.
  - Beta features are switched on with `anthropic-beta` headers.
  - Model IDs are the plain ones (`claude-haiku-4-5`), with no `anthropic.` or `global.` prefix.
- **Signing up creates a new Anthropic organization**, tied to the AWS account. It accepts
  Anthropic's Commercial Terms and Usage Policy.
- **Workspaces.** Every request names a workspace in the `anthropic-workspace-id` header. Each
  workspace is bound to one AWS region and is the IAM resource that policies grant access to.
- **Endpoint:** `https://aws-external-anthropic.{region}.api.aws`, signed with the SigV4 service
  name `aws-external-anthropic`. Streams are ordinary SSE, not AWS EventStream.
- **Capacity:** its pool is separate from both Anthropic's own API and Bedrock.
- **Where data lives:** workspaces created after 2026-09-18 keep data on AWS infrastructure.
  Retention follows Anthropic's API.
- **Not available:** HIPAA readiness, the computer-use and browser-use toolsets, fast mode, OAuth
  sign-in, and the Admin API's usage and cost reports.

### Web search and web fetch

**Both are available**, with and without dynamic filtering. Bedrock offers neither.

| | Web search | Web fetch |
| --- | --- | --- |
| Price | $10 per 1,000 searches, plus the results as input tokens | No charge beyond tokens |
| Reported in | `usage.server_tool_use.web_search_requests` | `usage.server_tool_use.web_fetch_requests` |
| Bounds | `max_uses`, `allowed_domains` / `blocked_domains` | `max_uses`, `max_content_tokens`, domain lists |

- **Pick the tool version by model.** Dynamic filtering (`_20260209` and later) needs Claude 4.6
  or later and runs code execution behind the scenes.
  - For Haiku, use the basic `web_search_20250305` and `web_fetch_20250910`.
  - Check a model's support with the Models API field
    `capabilities.server_tools.web_search.supported`.
- **On by default.** Web search is enabled for an organization unless an admin turns it off in
  the Console.
- **Fetch only follows URLs already in the conversation.** That rules out URLs that appear only in
  Claude's own output or only in the system prompt.
- **The loop has more to handle.** A turn can end with `pause_turn`, which needs a follow-up call.
  Search results carry `encrypted_content`, which must be sent back unchanged.

### Newer models and this account's Bedrock block

**What's known**

- Every current model is listed, with the same IDs as Anthropic's API: Haiku 4.5 and 5.5, Sonnet
  5 and 5.5, Opus 5.5, and Fable 5.1, among others.
- **Bedrock's model access gate doesn't apply.** Bedrock's first-time-use form and per-model
  entitlements belong to Bedrock. Access here follows the new Anthropic organization's own tier
  and policies.

**What's uncertain**

- **The block's cause is unknown.** AWS documents two common reasons a Bedrock Marketplace
  agreement fails: an invalid payment instrument, and a restricted location.
- **The same cause could stop this sign-up.** Sign-up is also an AWS Marketplace subscription, so
  if the block comes from billing or Marketplace eligibility, it may fail the same way.
- **Two community threads match this account's symptoms** (everything shows AVAILABLE and
  AUTHORIZED, but calls are denied). Their answers point to a backend flag, or to Activate credits
  not covering Marketplace models, and to a Support case. These are not official.
- **Starting limits.** New organizations start on the Start tier and "may start in the Evaluation
  tier" with lower limits. That shouldn't matter at RTFM's volume.

### Pricing against Bedrock

- **The rates are Anthropic's list prices.** The bill shows Claude Consumption Units (100 CCU =
  $1), metered hourly and invoiced monthly on the AWS bill.

| Model | Claude Platform on AWS (global) | Bedrock `global.` | Bedrock `us.` / regional |
| --- | --- | --- | --- |
| Haiku 4.5 | $1 / $5 | $1 / $5 | +10% |
| Haiku 5.5 | $0.10 / $0.50 | $0.10 / $0.50 | +10% |
| Sonnet 5.5 | $2 / $10 | $2 / $10 | +10% |

- **Cache multipliers** are the standard 1.25× to write and 0.1× to read. Sonnet 5.5 and Opus 5.5
  read at 0.05×.
- **`inference_geo: "us"`** costs 1.1×. It returns 400 on Haiku 4.5. The default, global routing,
  is standard price.
- **So at global routing, token prices match Bedrock.** The only extra charge is web search, which
  Bedrock doesn't offer.

### Setup, credentials and our rules

- **Sign-up** happens in the AWS Console, on the "Claude Platform on AWS" service page:
  1. Sign up and accept Anthropic's EULA and the AWS Customer Agreement.
  2. Set up the Anthropic organization from an email link.
  3. Create a workspace and note its ID (`wrkspc_…`).
- **One-time account setting:** outbound web identity federation must be on
  (`aws iam enable-outbound-web-identity-federation`). Without it, every call fails with
  "Outbound web identity federation is disabled".
- **Authentication** is SigV4 with IAM, or API keys generated in the AWS Console. Keys from the
  ordinary Claude Console don't work here.
- **IAM:** inference needs `aws-external-anthropic:CreateInference` on the workspace ARN,
  `arn:aws:aws-external-anthropic:{region}:{account}:workspace/{wrkspc_id}`. API-key callers also
  need `CallWithBearerToken`.
- **Regions:** all AWS commercial regions, us-west-2 included.
- **Our credential rules can be kept.** This was checked in the source of `@anthropic-ai/aws-sdk`
  0.7.9:
  - The constructor takes `awsAccessKey`, `awsSecretAccessKey` (not `awsSecretKey`, as in the
    Bedrock SDK), `awsSessionToken`, `awsRegion`, `workspaceId`, `baseURL`,
    `providerChainResolver`, `apiKey` and `awsProfile`.
  - With both static keys set, it signs with them and never calls the provider chain.
    `providerChainResolver` runs only when either key is missing, so ours can throw as it does
    with the Bedrock SDK.
  - It reads the `ANTHROPIC_AWS_API_KEY` environment variable only when no static keys or profile
    are given.
  - It reads `AWS_REGION`, `ANTHROPIC_AWS_BASE_URL` and `ANTHROPIC_AWS_WORKSPACE_ID` only as
    fallbacks. Passing `awsRegion`, `baseURL` and `workspaceId` explicitly avoids all three.
  - Unlike the Bedrock SDK, `apiKey: null` does *not* switch off the environment lookup; the
    static keys do.

### How the gateway and `bedrock-client.ts` would change

Everything above the `ModelClient` interface stays as it is: the caps, reservations, the ledger,
the idle timeout and the kill switch.

1. **The client.** Replace `@anthropic-ai/bedrock-sdk` with `@anthropic-ai/aws-sdk` (0.7.9,
   marked beta). It depends on `@anthropic-ai/sdk` and lazy-loads `@aws-sdk/credential-providers`
   only for the default chain we never use.

   ```ts
   new AnthropicAws({
     awsAccessKey, awsSecretAccessKey, awsRegion,       // from .env.local
     workspaceId,                                        // from .env.local
     baseURL: `https://aws-external-anthropic.${awsRegion}.api.aws`,
     providerChainResolver: async () => { throw new Error(CREDENTIAL_CHAIN_REFUSED); },
     maxRetries: 0,
     timeout: timeoutMs,
   });
   ```

   `client.messages.stream(...)` and the event mapping stay as they are.
2. **The file and its boundary.** Rename `bedrock-client.ts` to say what it now talks to, and move
   `sdk-boundary.test.ts`'s single allowed importer to the new file.
3. **Credentials.** `credentials.ts` reads one more name, `ANTHROPIC_AWS_WORKSPACE_ID`. It is an
   identifier, not a secret, but it belongs to the account like the region. In Lambda, the role's
   temporary keys also need `awsSessionToken`.
4. **Model IDs and prices.** `config.ts` uses `claude-haiku-4-5`, and `prices.ts` gets rows keyed
   by the plain IDs.
5. **Tests.** The fake server answers with SSE instead of AWS EventStream frames, so the
   `@smithy/eventstream-codec` dev dependency goes. The checks stay the same: SigV4 with the fake
   key, service `aws-external-anthropic`, region us-west-2, the workspace header, no decoy
   environment value used, and one attempt on a 503.
6. **Anthropic's own spend-limit errors.** These return 400 `invalid_request_error`, or 429 with
   `error.details.error_code: "enforced_spend_limit_reached"`. Nothing is charged, so the writer
   could report them as `"budget"` rather than `"error"`.
7. **For web tools:**
   - `inputTokenBound` must count the tool definitions.
   - The worst case needs a web allowance: `max_uses` × $0.01 for search, plus room for the
     results. A fetch is bounded by `max_content_tokens` × the input price, but search results
     have no token cap, so search can only be estimated.
   - The settle step must record `server_tool_use` counts, and the price table needs a price per
     search.
   - Each `pause_turn` continuation is its own call with its own reservation.

### Quotas and limits

- **Rate limits** are Anthropic's, per organization. On the Start tier, Haiku 4.5, Haiku 5.5 and
  Sonnet 5.5 each allow 1,000 requests, 2M input tokens and 400K output tokens a minute. Cache
  reads don't count toward the input limit, and `max_tokens` doesn't count toward the output
  limit.
- **The Start tier caps spending at $500 a month.** At the cap, calls fail with a 429 until the
  next UTC month.
- **Raising limits** goes through an Anthropic account representative or support. The Console's
  self-service flow isn't available here.
- **Bedrock's quotas don't apply:** no token burndown, and no daily token cap.

### Effect on our caps and the ledger

- **Our caps stay the only exact limit.** Anthropic's spend limits can back them up but can't
  replace them:
  - you can set a monthly limit for the organization and for each workspace;
  - they are monthly only, with no daily limit;
  - spend "can take about 2 hours to reflect recent usage", and any overshoot is billed.
- **Usage arrives as it does from Bedrock.** `message_start` and `message_delta` carry input, output and
  cache tokens, so settling doesn't change. Web tools add `server_tool_use` counts.
- **Reconciliation is by hand.** The Admin API's usage and cost reports aren't available here.
  - The Claude Console's Usage and Cost pages break spend down by model and workspace.
  - AWS Cost Explorer shows one combined CCU line.
  - So Cost Explorer can't break Claude spend down by model.
- **Audit logs:** CloudTrail logs inference as data events, which are off by default and cost
  extra.

## The AgentCore harness

### What it is

- **Generally available since 2026-06-17/18.** It is a managed agent loop "powered by Strands
  Agents".
- **You declare the agent; AWS runs it.** The model, system prompt, tools, skills, memory and
  limits are configuration. AgentCore runs the loop in a Firecracker microVM per session, on
  AgentCore Runtime.
- **The microVM comes with a lot by default:** a shell, a filesystem, and managed memory.
- **Two APIs:** `CreateHarness` once, then `InvokeHarness` per turn, keyed by a `runtimeSessionId`
  of at least 33 characters.
- **Export is one-way and Python-only.** It turns a harness into Python Strands code to run
  elsewhere.

### Can tool calls come back to our own code?

**Yes, through `inline_function` tools.**

1. The model calls an inline function.
2. The harness ends the stream with a final `messageStop` whose `stopReason` is `tool_use`.
3. Our code runs the tool and calls `InvokeHarness` again on the same session, with only the
   matching `toolResult`.

- **Results must match the pending call.** A missing, duplicate, stale or replayed result can't
  resume the handoff.
- **Adjacent inline calls** can be answered in one follow-up request.
- **Each handoff is a new invocation**, so invocation hooks run again.

Other tool types run inside AWS:

- remote MCP servers by URL;
- an AgentCore Gateway (which fronts Lambda, APIs and MCP);
- AgentCore Browser;
- AgentCore Code Interpreter;
- the built-in `shell` and `file_operations`, which are on unless `allowedTools` excludes them and
  add about 900 input tokens to every model request.

So the librarian's tools (list, find, open, delete, create) could stay in our server as inline
functions. Nothing has to be hosted in AWS.

### Cost and turn limits, and whether our gateway could stay in the loop

**Limits**, set on the harness or for one call:

| Limit | Default | When it's reached |
| --- | --- | --- |
| `maxIterations` | 75 | stop reason `max_iterations_exceeded` |
| `timeoutSeconds` | 3600 | stop reason `timeout_exceeded` |
| `maxTokens` | none | stop reason `max_output_tokens_exceeded` |
| `idleRuntimeSessionTimeout` | 900 | the microVM stays billable for memory until then |
| `maxLifetime` | 28800 | the session ends |

`maxTokens` is "token budget per invocation". The docs don't say whether input tokens count.
There is no limit in dollars.

**Our gateway can't stay in the loop**, because the harness calls the model directly from its
microVM. That breaks the gateway in three ways:

- there is no worst-case reservation per model call;
- there is no ledger entry per call;
- the kill switch can't stop a call in progress.

The closest substitutes are all partial:

- **A `before_invocation` Lambda hook** can deny a whole invocation (`hook_stopped`) by checking
  the caps. It can't reserve each model call, and an invocation can make up to `maxIterations`
  calls on a growing context.
- **An `after_invocation` hook, or the stream's `metadata` events,** report input and output
  tokens after the fact. A ledger could record them, but only after the money is spent.
- **Routing model calls through a proxy.** A LiteLLM model config with `apiBase` could point at
  an OpenAI-compatible endpoint that we host, so every model call would pass through our gateway.
  That means exposing the gateway publicly with its own auth, and translating formats. It is more
  work than writing the loop.

### Pricing

- **The harness itself is free.** You pay for what it uses:
  - **AgentCore Runtime:** $0.1276 per vCPU-hour and $0.0169 per GB-hour (v2), per second. CPU
    isn't billed while waiting on the model, but memory is, until the idle timeout. AWS's example
    is about $0.0067 a session.
  - **Model tokens**, at the provider's price.
  - **Managed memory**, which is on by default. For example, long-term retrieval is $0.50 per
    1,000.
  - **CloudWatch** observability.
  - **Gateway calls:** $0.005 per 1,000.
  - **AgentCore Web Search:** $7 per 1,000 queries.
- **None of these pass through our gateway**, so none would reach our ledger.

### IAM

- **To invoke:** `bedrock-agentcore:InvokeHarness` and `bedrock-agentcore:InvokeAgentRuntime` on
  the harness ARN.
- **To deploy:**
  - `CreateHarness` with `CreateAgentRuntime` and `CreateMemory`, plus the matching update and
    delete actions;
  - `iam:PassRole` for the execution role.
- **The execution role** trusts `bedrock-agentcore.amazonaws.com`. Its baseline policy covers:
  - `bedrock:InvokeModel*`;
  - public ECR pull (`ecr-public:GetAuthorizationToken`, `sts:GetServiceBearerToken`);
  - X-Ray and CloudWatch Logs and metrics;
  - workload identity tokens;
  - the default Browser, Code Interpreter and Memory actions.
- **Each optional feature adds its own statements** (Gateway, API key credential providers, hook
  Lambdas). The `agentcore` CLI creates this role through CloudFormation.

### Local development

- **There is no offline mode.** `agentcore dev` deploys the harness, its IAM role and its memory
  to AWS first, then serves a local inspector. Every turn runs in AWS and calls a real model.
- **The tests could only fake our side of the API** (`@aws-sdk/client-bedrock-agentcore` has an
  `InvokeHarnessCommand`, which can be faked). The loop itself can't run against a fake model the
  way our own agent loop does.

### Models, and the Bedrock block

- **Supported providers:** Bedrock (Converse by default, or the Responses or Chat Completions
  format through Bedrock Mantle), OpenAI, Gemini, and anything LiteLLM supports.
  `anthropic/claude-…` with an API key reaches Anthropic's API.
- **The default model** is `global.anthropic.claude-sonnet-4-6` on Bedrock.
- **The Bedrock block applies.** Bedrock calls are signed with the execution role in this same
  account, so the block on the newer Claude models applies exactly as it does to our server.
- **LiteLLM can get around it, but not cheaply:**
  - `anthropic/` with a key from a separate first-party Anthropic account would work, but that
    account is billed separately.
  - Whether LiteLLM can reach Claude Platform on AWS (custom `apiBase`, plus the workspace header
    through `additionalParams`) is unconfirmed. No source shows it.

### How it would fit a Lambda deployment

- **Lambda would act as a client** (`research/lambda-and-dynamodb.md` weighs running RTFM on
  Lambda). A Lambda would call `InvokeHarness`, relay the stream, run
  inline tools against DynamoDB, and call again on each handoff.
- **It works, but it doubles the hosting.**
  - It adds a second compute bill (a microVM per conversation, idle for up to 15 minutes).
  - It adds a second store of conversation state: the harness session and managed memory, while
    the app keeps the conversation in the browser.
- **The limits are not the obstacle.** The Runtime quotas (60-minute streams, 25 new sessions a
  second, 2 vCPU / 8 GB) are far above RTFM's needs.

## Recommendations

### Claude Platform on AWS: try it, as the path to the newer models

- **It is the most direct way past the Bedrock block** that is still billed to this AWS account.
- **It is a one-file change under the gateway.** The caps, ledger and credential rules hold.
- **Token prices match Bedrock**, and it adds web search and web fetch, which Bedrock lacks.
- **Keep Bedrock working** until a real call succeeds. If the Marketplace sign-up fails the same
  way, the cause is account-level billing or eligibility, and the AWS Support case is needed
  either way.
- **Leave out web tools**, which keeps web access out of scope. Adding them needs the
  reservation changes listed above.

### AgentCore harness: don't adopt it

- **Every spending rule rests on the gateway.** The harness takes model calls out of it, so
  the per-call reservations, the ledger and the kill switch would no longer cover agent runs.
- **It can't be tested against a fake model locally.**
- **It adds costs outside the ledger:** the microVM, managed memory and CloudWatch.
- **It doesn't help with the Bedrock block.**
- **Its one useful mechanism needs no harness.** Inline functions, with tools staying in our code,
  are what our own loop does already.
- **Revisit it** if the app needs a sandbox (shell, code execution, browser) per
  conversation.

## Your steps

### A. Claude Platform on AWS (for the newer models)

1. **Check for the likely shared cause first.**
   - In the AWS Console, look under AWS Marketplace › Manage subscriptions for a failed or pending
     Anthropic agreement.
   - Under Billing › Payment preferences, check there is a valid card or invoice method, not
     credits only.
   - If either looks wrong, fix it, or put it in the Bedrock Support case. A Marketplace
     sign-up may fail for the same reason.
2. **Sign up** while signed in as an admin, not as the app's IAM user:
   1. Open the AWS Console › **Claude Platform on AWS** › **Sign up**.
   2. Accept Anthropic's EULA, the AWS Privacy Notice and the AWS Customer Agreement, then wait
      for the redirect.
   3. Enter the owner email, follow the setup link, and complete the organization form. This
      accepts Anthropic's Commercial Terms and Usage Policy.
3. **Create a workspace in us-west-2** when the Console prompts for one, and note its ID
   (`wrkspc_…`).
4. **Turn on outbound web identity federation**, once for the account. Do it in AWS CloudShell,
   as an identity with `iam:EnableOutboundWebIdentityFederation`:

   ```sh
   aws iam enable-outbound-web-identity-federation   # "already enabled" is fine
   ```

5. **Grant the app's IAM user** (the one whose keys are in `.env.local`) this inline policy,
   with your workspace ID filled in:

   ```json
   {
     "Version": "2012-10-17",
     "Statement": [{
       "Effect": "Allow",
       "Action": ["aws-external-anthropic:CreateInference", "aws-external-anthropic:CountTokens"],
       "Resource": "arn:aws:aws-external-anthropic:us-west-2:438180219169:workspace/wrkspc_…"
     }]
   }
   ```

   - Leave out `CallWithBearerToken`: the app signs with SigV4, so API keys stay unusable.
   - The docs don't list `sts:GetWebIdentityToken` for callers. If the first call returns a 403
     that names it, add it.
6. **Set a backstop spend limit.**
   1. Grant your admin identity `aws-external-anthropic:AssumeConsole`.
   2. Open the Claude Console from the service page.
   3. Under Settings › Billing, add an email recipient, then set the organization's monthly limit
      to $20.
   4. Optionally, set a workspace limit too.

   Unconfirmed: the docs say Console roles are assigned by an Anthropic representative. If the
   Billing page is read-only for you, ask Anthropic support.
7. **Add one line to `.env.local`** yourself:

   ```sh
   ANTHROPIC_AWS_WORKSPACE_ID=wrkspc_…
   ```

8. **Tell the orchestrator it's done.** A task can then add the client swap (above) to
   `WORKLIST.md`, with one live Haiku 4.5 call under $0.01.

### B. AgentCore harness

Nothing to enable. Trying it anyway would need:

- the execution role and policy in [IAM](#iam);
- `InvokeHarness` and `InvokeAgentRuntime` for the caller;
- `iam:PassRole` and the create, update and delete actions for whoever deploys;
- CloudWatch Transaction Search turned on, once per account, to see traces;
- `allowedTools` limited to the inline functions, and managed memory turned off, to avoid unused
  cost.

## Sources

All read 2026-10-11.

- Anthropic, Claude Platform on AWS (setup, auth, SDK clients, models, features, limits, billing,
  spend limits, CloudTrail, migrating from Bedrock):
  https://platform.claude.com/docs/en/build-with-claude/claude-platform-on-aws
- Anthropic, IAM actions for Claude Platform on AWS (actions, managed policies, example
  policies): https://platform.claude.com/docs/en/api/claude-platform-on-aws-iam-actions
- Anthropic, Pricing (model prices, Claude Platform on AWS pricing and CCUs, data residency
  multiplier, web search and fetch prices): https://platform.claude.com/docs/en/about-claude/pricing
- Anthropic, Rate limits (tiers, spend caps, spend-cap and spend-limit errors):
  https://platform.claude.com/docs/en/api/rate-limits
- Anthropic, Web search tool: https://platform.claude.com/docs/en/agents-and-tools/tool-use/web-search-tool
- Anthropic, Web fetch tool: https://platform.claude.com/docs/en/agents-and-tools/tool-use/web-fetch-tool
- `@anthropic-ai/aws-sdk` 0.7.9 source (constructor options, environment variables, credential
  precedence): https://unpkg.com/@anthropic-ai/aws-sdk@0.7.9/client.js and
  https://unpkg.com/@anthropic-ai/aws-sdk@0.7.9/core/auth.js; npm metadata via `npm view`
- The `claude-api` skill's `shared/claude-platform-on-aws.md` and `shared/platform-availability.md`
  (cached 2026-10-06), used as a starting point and checked against the pages above
- AWS, AgentCore harness overview: https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/harness.html
- AWS, harness Tools (inline functions, web search through Gateway):
  https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/harness-tools.html
- AWS, harness Models and instructions:
  https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/harness-models.html
- AWS, harness Observability and cost controls (costs, limits):
  https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/harness-operations.html
- AWS, harness Lifecycle hooks: https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/harness-lifecycle-hooks.html
- AWS, harness Security and access controls (IAM, execution role):
  https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/harness-security.html
- AWS, harness Get started (CLI, `agentcore dev`, stream events and stop reasons):
  https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/harness-get-started.html
- AWS, harness vs. Runtime: https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/harness-vs-runtime.html
- AWS, Export harness to code: https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/harness-export.html
- AWS, AgentCore quotas: https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/bedrock-agentcore-limits.html
- AWS, AgentCore pricing: https://aws.amazon.com/bedrock/agentcore/pricing/
- AWS ML Blog, "Amazon Bedrock AgentCore harness is now generally available" (2026-06-18):
  https://aws.amazon.com/blogs/machine-learning/amazon-bedrock-agentcore-harness-is-now-generally-available-go-from-idea-to-production-grade-agent-in-minutes/
- `@aws-sdk/client-bedrock-agentcore` 3.1149.0 command list (has `InvokeHarnessCommand`):
  https://unpkg.com/@aws-sdk/client-bedrock-agentcore@3.1149.0/dist-types/commands/index.d.ts
- AWS, Bedrock API error codes (Marketplace agreement failures, FTU form):
  https://docs.aws.amazon.com/bedrock/latest/userguide/troubleshooting-api-error-codes.html
- AWS, IAM `EnableOutboundWebIdentityFederation`:
  https://docs.aws.amazon.com/IAM/latest/APIReference/API_EnableOutboundWebIdentityFederation.html
- Community, not official: two threads matching the Bedrock symptom,
  https://yomotherboard.com/question/why-cant-my-account-access-newer-anthropic-and-openai-models-through-bedrock/
  and https://yomotherboard.com/?p=487231
- RTFM: `CLAUDE.md`, `README.md`, `server/gateway/README.md` (`bedrock-client.ts`, credentials),
  `research/bedrock-models.md`
