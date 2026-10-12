# Bedrock models for RTFM

Research only, checked 2026-10-10. Region us-west-2. Prices are USD per million tokens and change
often. Recheck them before you rely on them.

**Status (2026-10-11):** adopted Claude Haiku 4.5 (`global.anthropic.claude-haiku-4-5-20251001-v1:0`)
for every job: writing sections, the librarian and planning manuals. This doc recommends the 5.5
models, but this account's Bedrock access block refuses the newer models, and Haiku 4.5 is open to
all Bedrock customers. No other model here is wired up, and the bake-off below was not run. The
choice lives in `server/config.ts` and `ARCHITECTURE.md`.

## Summary

| Job | Primary | Cheaper alternative | Works without Anthropic access |
| --- | --- | --- | --- |
| Section writing | Claude Sonnet 5.5 | Claude Haiku 5.5 | GPT-6 Luna, then gpt-oss-120b |
| Table of contents | Claude Sonnet 5.5 (Opus 5.5 if the bake-off shows better arcs) | Claude Haiku 5.5 | GPT-6 Luna (has real JSON-schema output) |
| Library agent | Claude Haiku 5.5 | gpt-oss-20b | gpt-oss-120b |
| Small jobs | Claude Haiku 5.5 | gpt-oss-20b | gpt-oss-20b |

- **Price is not the deciding factor.** A whole 30-section manual costs about **$1.02** on Sonnet
  5.5 with caching and about **$0.05** on Haiku 5.5. The sample manual's sections are shorter than
  the brief assumes (about 550 words, roughly 0.8k tokens), so real costs are about a third of
  these. At single-user volume the choice should follow prose quality.
- **Why Sonnet for sections.** Claude models lead both published creative-writing boards. No
  board has scored the 5.5 models, so the bake-off has to settle Sonnet against Haiku.
- **Why Haiku is the cheaper option, not gpt-oss.** Haiku 5.5 costs $0.10 / $0.50, which is less
  than gpt-oss-120b's output price. gpt-oss sits in the lower half of EQ-Bench Creative Writing v3.
- **Check this first: the endpoint.** AWS's model cards list Sonnet 5.5 and Haiku 5.5 on the mantle
  Messages endpoint only in GovCloud. In us-west-2 they are served through `bedrock-runtime` with a
  `global.` or `us.` inference profile. Anthropic's docs say mantle in us-west-2 supports them. The
  sources disagree, so make the base URL and model ID configuration.
- **Check this too: access.** The pending Anthropic "first time use" form applies only to
  `bedrock-runtime`. AWS says it does not apply to Anthropic models called through
  `bedrock-mantle`. If mantle in us-west-2 does serve Claude, Claude may work there without the form.
- **Bake-off:** Sonnet 5.5, Haiku 5.5, Opus 5.5 (as the quality ceiling) and GPT-6 Luna (as the
  non-Anthropic fallback). Plan in [Bake-off](#bake-off).

## Comparison of serious candidates

Prices are the global cross-region rate. Regional and `us.` profiles cost 10% more.

| Model | ID from us-west-2 | API | In / out | Cache write (5 min) / read | Context / max out |
| --- | --- | --- | ---: | ---: | --- |
| Claude Sonnet 5.5 | `global.anthropic.claude-sonnet-5-5` (runtime), `anthropic.claude-sonnet-5-5` (mantle) | Messages | $2 / $10 | $2.50 / $0.10 | 1M / 128K |
| Claude Haiku 5.5 | `global.anthropic.claude-haiku-5-5`, `anthropic.claude-haiku-5-5` | Messages | $0.10 / $0.50 | $0.125 / $0.01 | 1M / 128K |
| Claude Opus 5.5 | `global.anthropic.claude-opus-5-5`, `anthropic.claude-opus-5-5` | Messages | $4 / $20 | $5 / $0.20 | 1M / 128K |
| Claude Fable 5.1 | `anthropic.claude-fable-5-1` | Messages | $10 / $50 | $12.50 / $0.25 | 1M / 128K |
| GPT-6 Luna | `global.openai.gpt-6-luna` (runtime only from us-west-2) | Chat Completions, Responses | $0.10 / $0.50 | $0.125 / $0.01 | 1.05M / 128K |
| GPT-6.1 Sol | `global.openai.gpt-6.1-sol` (runtime only from us-west-2) | Chat Completions, Responses | $2 / $10 | $2.50 / $0.10 | 1M / 131K |
| gpt-oss-120b | `openai.gpt-oss-120b` (mantle `/v1`), in-region | Chat Completions, Responses | $0.15 / $0.60 | none listed | 128K / 16K |
| gpt-oss-20b | `openai.gpt-oss-20b` (mantle `/v1`), in-region | Chat Completions, Responses | $0.07 / $0.30 | none listed | 128K / 16K |
| Amazon Nova 2 Lite | `global.amazon.nova-2-lite-v1:0` (runtime only) | Converse, InvokeModel only | ~$0.30 / ~$2.50 | 5 min only, 20K cap | 1M / 64K |

All of them stream and support client-side tool calls.

| Model | Evidence for long-form writing | Speed (Artificial Analysis, Anthropic API) | Notes |
| --- | --- | --- | --- |
| Sonnet 5.5 | Not on EQ-Bench or Arena. Its predecessor Sonnet 5 scored 1787.6 on EQ-Bench v3, below Sonnet 4.6. Vendor GDPval-AA Elo 1840. | 109 tok/s, 1.9 s to first token at medium effort | Thinking on by default (effort high). Turn it off with `thinking: {type: "between_tools"}`. Forced `tool_choice` returns 400. Launched 2026-09-28. Cache read cut to $0.10 on 2026-10-07. |
| Haiku 5.5 | No writing benchmark. Vendor GDPval-AA Elo 1620, against 1437 for GPT-6 Luna. | 137–184 tok/s; first answer token 6.3 s at low, 12.6 s at medium, 22.8 s at high effort | Thinking on by default (effort medium). Can be disabled at effort high or below. Prompts over 100K tokens cost 5×. Launched 2026-10-07. |
| Opus 5.5 | The Opus line leads EQ-Bench v3 (Opus 5 is #1, 2116). Opus 5.5 itself is not scored. | Not measured here | Thinking can't be disabled. Use effort `low` to limit time to first token and cost. |
| Fable 5.1 | Fable 5 is #1 on Arena creative writing and #6 on EQ-Bench v3. | Not measured here | Five times Sonnet's price. Open access on Bedrock. |
| GPT-6 Luna | No writing benchmark. AWS positions it for "summarize, extract, answer focused questions". | Not measured here | Has real JSON-schema structured output. On mantle only in us-east-1. Reasoning effort can be `none`. Output burns 10× quota on runtime. |
| GPT-6.1 Sol | GPT-5.6 Sol is #4 on EQ-Bench v3. 6.1 Sol is not scored. | Not measured here | Same price as Sonnet 5.5. Only worth testing if Claude access stays blocked. |
| gpt-oss-120b | About 1056 Elo on EQ-Bench v3 (snapshot 2026-05-28): lower half. | Not measured here | Needs no access form. AWS's "EOL no sooner than" date (2025-08-05 + 1 year) has passed. |
| gpt-oss-20b | Weaker than 120b. | Not measured here | Needs no access form. Fine for classification and titles. |
| Nova 2 Lite | Hemingway-bench says Nova "lacked a deeper spark". | Not measured here | A third API shape (Converse), and it costs more than Haiku 5.5. Not recommended. |

### Dropped quickly

- **Opus 5, Opus 4.8, Opus 4.7, Sonnet 4.6:** Opus 5.5 and Sonnet 5.5 replace them at the same price
  or less.
- **Sonnet 5:** same price as Sonnet 5.5, with half the cache discount and a lower EQ-Bench score
  than Sonnet 4.6. It is "open" access on Bedrock, so it is only worth trying if the 5.5 models
  stay gated.
- **Haiku 4.5:** ten times Haiku 5.5's price and weaker.
- **Nova Micro, Lite, Pro, Premier:** older generation with flat prose. Nova Pro costs about $0.80 /
  $3.20.
- **Llama 4 Maverick and Scout, Llama 3.x:** Hemingway-bench calls Maverick "verbose and generic,
  with placeholders and clichés". They have no price advantage over Haiku 5.5.
- **Mistral Large 3 ($0.50 / $1.50) and the smaller Mistral models:** no writing evidence, and more
  expensive than Haiku 5.5.
- **DeepSeek V3.2 ($0.62 / $1.85) and R1:** more expensive than Haiku 5.5, and built for reasoning
  first.
- **Qwen3 family (Next 80B costs $0.15 / $1.20):** Hemingway-bench notes factual errors and forced
  humour.
- **Kimi K3 ($3 / $15 global):** #2 on EQ-Bench v3 but #23 on Arena, and it costs more than Sonnet
  5.5. **Kimi K2.5 ($0.60 / $3.00):** K2's creative writing "felt strained".
- **GLM 5.3:** #3 on EQ-Bench v3, but AWS limits access to eligible customers. **GLM 5
  ($1 / $3.20):** no edge.
- **MiniMax M2.x, Devstral, Qwen3 Coder, Nemotron:** coding models.
- **Gemma 4 ($0.14 / $0.40), Palmyra X5 ($0.60 / $6), Command R, Jamba 1.5:** small, old, or
  expensive output, with no evidence of better prose.
- **GPT-5.6 Sol, Terra and Luna:** GPT-6 replaces them.
- **Grok 4.x:** Hemingway-bench reports tropes and informality. Not priced here.

## Cost per job

Assumptions from the brief: a TOC is 3k input and 3k output tokens; a section is 5k input and 3k
output; a manual is one TOC plus 30 sections. In the cached column, 4k of each section's input is a
shared prefix (system prompt, voice, TOC). The first section writes it at the 5-minute rate and the
other 29 read it. The rest is uncached. Global prices, standard tier, no thinking tokens.

| Model | One TOC | One section | Manual, no cache | Manual, cached | Saving |
| --- | ---: | ---: | ---: | ---: | ---: |
| Fable 5.1 | $0.180 | $0.200 | $6.18 | $5.06 | 18% |
| Opus 5.5 | $0.072 | $0.080 | $2.47 | $2.04 | 18% |
| Sonnet 5.5 | $0.036 | $0.040 | $1.24 | $1.02 | 18% |
| GPT-6.1 Sol | $0.036 | $0.040 | $1.24 | $1.02 | 18% |
| Nova 2 Lite | $0.0084 | $0.0090 | $0.28 | — | — |
| DeepSeek V3.2 | $0.0074 | $0.0086 | $0.27 | — | — |
| Mistral Large 3 | $0.0060 | $0.0070 | $0.22 | — | — |
| gpt-oss-120b | $0.0022 | $0.0026 | $0.079 | — | — |
| Haiku 5.5 | $0.0018 | $0.0020 | $0.062 | $0.051 | 17% |
| GPT-6 Luna | $0.0018 | $0.0020 | $0.062 | $0.051 | 17% |
| gpt-oss-20b | $0.0011 | $0.0013 | $0.039 | — | — |

What changes these numbers:

- **Output is about 75% of the cost**, so caching saves less than a fifth. It is still worth doing:
  it also cuts time to first token and doesn't count against the mantle input quota.
- **Cache TTL.** A reader may open sections more than 5 minutes apart. A 1-hour write costs 2×
  base input instead of 1.25×. On Sonnet that is $0.016 instead of $0.010 per write, so a few cents
  per manual at most. Every cache read resets the timer.
- **Minimum cache size.** The cached prefix must be at least 512 tokens for the Claude 5.5 models
  and 1,024 for GPT-6.
- **Thinking tokens are billed as output.** 1,000 thinking tokens per section adds $0.01 per
  section on Sonnet 5.5, or $0.30 per manual. They also delay the first visible word.
- **Real section length.** The sample sections are 460–660 words. At 1k output tokens a Sonnet
  section costs about $0.02, and a cached manual about $0.42.
- **Mixed plan.** A Sonnet TOC with Haiku sections costs about $0.09 per manual.
- **Regional premium.** The `us.` profile and US geo routing add 10%.

## Recommendations by job

### Section writing

**Primary: Claude Sonnet 5.5**, with thinking off (`between_tools`) or effort `low`, streamed.

- The Claude line leads both creative-writing leaderboards: Opus 5 is #1 on EQ-Bench v3 and Fable 5
  is #1 on Arena.
- Claude judges score EQ-Bench, which may favour Claude. Arena uses human votes and also favours
  Claude.
- Long-form coherence and strict instruction following matter here. The sections must keep the
  "my dear builder" voice, use `section:` cross-reference ids that exist, and write GFM footnotes,
  tables and task lists the reader renders.
- Sonnet's measured time to first token at medium effort is 1.9 s, which suits text that streams
  into the reader.
- About $0.03–0.04 per section.
- **Gap:** no published evaluation covers Sonnet 5.5's prose. Sonnet 5 scored *below* Sonnet
  4.6 on EQ-Bench, so don't assume each new Sonnet writes better. The bake-off decides.

**Cheaper: Claude Haiku 5.5**, with thinking disabled.

- 20× cheaper than Sonnet: about $0.002 per section.
- Its vendor knowledge-work scores are close to Sonnet's (GDPval-AA 1620 against 1840).
- Watch for flat or thin prose, and for drift in voice and terminology across separately written
  sections. A cheap model that writes flat prose is not acceptable here, so adopt Haiku only if it
  holds the voice in the bake-off.
- With thinking on, its first answer token takes 6–23 s depending on effort. Disable thinking for
  streaming sections.

**Without Anthropic access: GPT-6 Luna**, with reasoning effort `none` or `low`.

- Same price as Haiku, through `bedrock-runtime` Chat Completions with no Anthropic form.
- Last resort: gpt-oss-120b, which needs no access form but scores in the lower half on creative
  writing.

### Table of contents

**Primary: Claude Sonnet 5.5.**

- The TOC is one call per manual, about $0.04, and it fixes the manual's arc and every section's
  summary. Spend here.
- If the bake-off shows Opus 5.5 builds clearly better arcs, use it. One Opus TOC costs about $0.07.

**Cheaper: Claude Haiku 5.5.**

**Getting structured output without Bedrock's structured outputs:**

- Claude 5.5 on Bedrock has no structured outputs: mantle rejects `output_config.format` with a 400,
  and the runtime model cards list the feature as unsupported.
- Forced `tool_choice` returns 400 on Sonnet and Opus 5.5.
- Assistant prefill is removed.
- So, either:
  - define one `save_table_of_contents` tool with a JSON schema and `tool_choice: auto`, tell the
    model to call it, then validate the input and retry once on failure; or
  - ask for a strict line format (for example `## 1 | Title | summary`) that the server parses and
    can stream.
- The bake-off should measure valid-first-try rates for both. GPT-6 Luna does have strict
  JSON-schema output on Bedrock, which makes it a sound TOC fallback.

### Library agent

**Primary: Claude Haiku 5.5**, thinking disabled or effort `low`.

- Replies are short, so cost per turn is a fraction of a cent.
- With thinking off it is Anthropic's fastest model.
- Use `tool_choice: auto`.
- **Gap:** Anthropic published no tau-bench or MCP-Atlas score for it, so tool-call reliability
  needs testing.

**Cheaper: gpt-oss-20b**, which needs no access form on mantle. Use gpt-oss-120b if 20b misfires on
tools. gpt-oss-120b is not cheaper than Haiku on output ($0.60 against $0.50).

### Small jobs (titles, summaries, classification)

**Haiku 5.5**, thinking disabled. **Cheaper: gpt-oss-20b.** Quality differences matter little here.

## Bake-off

### Models

| Model | Setting | Role in the comparison |
| --- | --- | --- |
| Claude Sonnet 5.5 | `between_tools`, then effort `low` | Expected primary |
| Claude Haiku 5.5 | thinking disabled | Cheap challenger |
| Claude Opus 5.5 | effort `low` | Quality ceiling; is 2× Sonnet's price worth it? |
| GPT-6 Luna | reasoning `none` and `low` | Fallback without Anthropic access; the only non-Claude model at Haiku's price |

Add gpt-oss-120b as a floor only if it costs nothing extra to wire in.

### Sections

1. Regenerate 4 sample sections from the TOC, voice brief and neighbouring summaries:
   - `the-half-second-problem` (aligned table, code block, task list, footnotes,
     cross-references);
   - one chapter opener;
   - one appendix with a figures table;
   - one late chapter, to test continuity.
2. Generate 3 samples per model.
3. Run automatic checks:
   - it parses with the reader's renderer;
   - every footnote reference has a definition;
   - every `section:` id exists in the TOC;
   - no H1 heading and no preamble;
   - word count is within the target;
   - code fences are closed;
   - tables keep their alignment row.
4. Judge blind and pairwise:
   - voice: gothic long sentences then blunt short ones, gallows humour, concrete figures;
   - the same terms used across sections;
   - agreement with the section's TOC summary and with its neighbours;
   - inventiveness within the technical frame.
5. Measure from the local server in us-west-2:
   - time to first visible token and tokens per second;
   - cost, from the `usage` fields.

### TOC

Run 5 manual prompts 10 times each. Record valid-first-try JSON or parse rate, schema conformance,
and a judged score for the arc (parts, appendices, a sensible progression).

### Library agent

Script about 20 conversations: create, open, delete with confirmation, list, ambiguous requests,
and an id that doesn't exist. Score the right tool, correct arguments, no invented ids, and reply
length.

## Pitfalls

1. **The endpoint and region disagree between sources.**
   - AWS model cards: Sonnet 5.5 and Haiku 5.5 are on mantle only in us-gov-west-1. Opus 5.5 is on
     mantle in us-east-1, ap-southeast-4 and GovCloud. Sonnet 5 adds eu-north-1 and eu-west-1.
   - From us-west-2, AWS lists them on `bedrock-runtime` through `us.` or `global.` profiles only.
     That includes the Messages API at `https://bedrock-runtime.us-west-2.amazonaws.com/anthropic`.
   - Anthropic's docs list us-west-2 on mantle as "Global, US, In-region only".
   - mantle doesn't support cross-region profiles.
   - AWS now recommends `bedrock-runtime` for new applications. Pricing is identical on both.
   - Keep base URL and model ID in config so either route works with the same Messages request
     body.
2. **Access.**
   - Anthropic models on `bedrock-runtime` need the first-time-use form. A submitted form can sit
     in `PENDING`, and calls return `AccessDeniedException` until it clears. Check its state with
     `GetFoundationModelAvailability`.
   - AWS says the form does not apply on `bedrock-mantle`.
   - Anthropic lists Fable 5.1, Fable 5, Opus 4.8, Opus 4.7, Sonnet 5 and Haiku 4.5 as open to all
     Bedrock customers. Sonnet 5.5, Haiku 5.5 and Opus 5.5 have their own criteria in the console.
   - Models sold through Marketplace, including Claude and GPT-6, need `aws-marketplace:Subscribe`
     on the first call. gpt-oss needs nothing.
3. **Two or three API shapes.**
   - Claude: Anthropic Messages. Use `@anthropic-ai/bedrock-sdk` (`AnthropicBedrockMantle` for
     SigV4), or the standard client with a bearer token and a base URL.
   - gpt-oss: Chat Completions at mantle `/v1`.
   - GPT-6: `/openai/v1` on mantle in us-east-1, or on runtime.
   - Nova: Converse only.
   - Streaming events differ (`content_block_delta` against `chat.completion.chunk`), and so does
     cache markup: `cache_control` against `prompt_cache_breakpoint` with a 30-minute TTL.
   - Write one small adapter that yields text deltas.
4. **Claude 5.5 request rules.**
   - Non-default `temperature` returns 400 on Sonnet and Haiku 5.5, and is removed on Opus 5.5.
   - No prefill.
   - Forced `tool_choice` returns 400 on Sonnet and Opus 5.5.
   - `between_tools` takes no other fields and only works at effort `high` or below.
   - Thinking display defaults to `omitted`, so a thinking model shows a silent pause before text.
   - Handle `stop_reason: "refusal"`: Bedrock has no server-side fallback.
5. **Quotas.**
   - `bedrock-runtime` counts input and output together. Output burns 10× on Opus 5.5, Sonnet 5,
     Fable 5.1 and GPT-6, and 15× on Opus 4.8.
   - There is also an account-wide "Cross-Model Max Tokens Per Day" cap.
   - `max_tokens` is reserved up front on both endpoints. Set it near the real need (about 6k for a
     section), not 64k.
   - mantle has separate input and output TPM and no RPM. Anthropic's docs give 2M input TPM as
     the Claude default.
   - Raise mantle limits through a support case, not the Service Quotas console. New-account
     values only show in Service Quotas.
6. **Prices could not be read from the AWS pricing page.** Its Claude, Nova and Llama tables render
   client-side.
   - Claude prices here are Anthropic's list prices.
   - Anthropic's docs say Bedrock regional endpoints cost 10% more than global ones, and a
     third-party tracker shows Opus 5.5 global at list ($4 / $20) and US at $4.40 / $22.
   - GPT-6 prices come from the AWS model cards.
   - gpt-oss US prices are inferred from the Sydney rates on the AWS page, which run about 3%
     higher.
   - Nova 2 Lite prices come from aggregators.
   - Confirm all of these in the console or Cost Explorer after the first calls.
7. **gpt-oss limits:** 16K maximum output, no prompt caching listed, and past its "EOL no sooner
   than" date. Don't build the long-term path on it.

## Sources

All checked 2026-10-10.

- AWS, Amazon Bedrock pricing: https://aws.amazon.com/bedrock/pricing/ (Mistral, DeepSeek, Qwen,
  Kimi, GLM, MiniMax, Gemma and Writer prices; note that "Starting October 7, Sonnet 5.5 cache read
  pricing is reduced by 50%"; Claude, Nova and Llama tables didn't render)
- AWS, Amazon Nova pricing: https://aws.amazon.com/nova/pricing/ (no per-token figures rendered)
- AWS model cards:
  - Claude Haiku 5.5: https://docs.aws.amazon.com/bedrock/latest/userguide/model-card-anthropic-claude-haiku-5-5.html
  - Claude Sonnet 5.5: https://docs.aws.amazon.com/bedrock/latest/userguide/model-card-anthropic-claude-sonnet-5-5.html
  - Claude Opus 5.5: https://docs.aws.amazon.com/bedrock/latest/userguide/model-card-anthropic-claude-opus-5-5.html
  - Claude Sonnet 5: https://docs.aws.amazon.com/bedrock/latest/userguide/model-card-anthropic-claude-sonnet-5.html
  - GPT-6 Luna: https://docs.aws.amazon.com/bedrock/latest/userguide/model-card-openai-gpt-6-luna.html
  - GPT-6.1 Sol: https://docs.aws.amazon.com/bedrock/latest/userguide/model-card-openai-gpt-6-1-sol.html
  - gpt-oss-120b: https://docs.aws.amazon.com/bedrock/latest/userguide/model-card-openai-gpt-oss-120b.html
  - gpt-oss-20b: https://docs.aws.amazon.com/bedrock/latest/userguide/model-card-openai-gpt-oss-20b.html
  - Nova 2 Lite: https://docs.aws.amazon.com/bedrock/latest/userguide/model-card-amazon-nova-2-lite.html
  - GLM 5.3: https://docs.aws.amazon.com/bedrock/latest/userguide/model-card-zai-glm-5-3.html
  - Model list: https://docs.aws.amazon.com/bedrock/latest/userguide/model-cards.html
- AWS Bedrock user guide:
  - Endpoints: https://docs.aws.amazon.com/bedrock/latest/userguide/endpoints.html
  - Model access and the FTU form: https://docs.aws.amazon.com/bedrock/latest/userguide/model-access.html
  - Runtime quotas: https://docs.aws.amazon.com/bedrock/latest/userguide/quotas-runtime.html
  - mantle quotas: https://docs.aws.amazon.com/bedrock/latest/userguide/quotas-mantle.html
  - Token burndown: https://docs.aws.amazon.com/bedrock/latest/userguide/quotas-token-burndown.html
- Anthropic:
  - Pricing: https://platform.claude.com/docs/en/about-claude/pricing
  - Claude in Amazon Bedrock (mantle model IDs, access, regions, quotas, unsupported features):
    https://platform.claude.com/docs/en/build-with-claude/claude-in-amazon-bedrock
  - Legacy Bedrock integration (global and regional premium):
    https://platform.claude.com/docs/en/build-with-claude/claude-on-amazon-bedrock-legacy
  - Haiku 5.5 launch page and vendor benchmarks: https://www.anthropic.com/claude-haiku-5-5
- Artificial Analysis, Haiku 5.5 and Sonnet 5.5 speed (Anthropic API, not Bedrock):
  https://artificialanalysis.ai/models/comparisons/claude-haiku-5-5-high-vs-claude-sonnet-5-5-medium
  and https://artificialanalysis.ai/models/claude-haiku-5-5-medium/providers
- Digital Applied, "Which AI model writes best?" (published 2026-08-31, EQ-Bench v3 and Arena
  figures from 2026-08-27 to 09-01):
  https://www.digitalapplied.com/blog/which-ai-model-writes-best-leaderboards-disagree
- EQ-Bench longform and creative writing (tables load by script; longform judge changed to Sonnet
  4.6 on 2026-02-19): https://eqbench.com/creative_writing_longform.html and
  https://eqbench.com/creative_writing.html
- gpt-oss-120b on EQ-Bench v3 (snapshot dated 2026-05-28, unverified mapping):
  https://benchmarklist.com/benchmarks/creative_writing_v3/
- Surge AI, Hemingway-bench (expert human pairwise writing evaluation; qualitative notes on Nova,
  Llama 4, Kimi K2, Qwen3 and Grok): https://surgehq.ai/blog/hemingway-bench-ai-writing-leaderboard
- Third-party price check for Bedrock Opus 5.5 global and US:
  https://custom.typingmind.com/tools/estimate-llm-usage-costs/amazon-bedrock/us-anthropic-claude-opus-5-5
- Nova 2 Lite price (aggregator, unconfirmed):
  https://anotherwrapper.com/tools/llm-pricing/nova-2-lite/nova-2-pro
- RTFM sources read: `DESIGN.md` (Markdown section, data model), `src/manual/sample/index.ts`
  (voice brief), `src/manual/sample/sections/*.md` (18 sections, 461–660 words each)
