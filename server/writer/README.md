# server/writer

Writes a section that isn't written yet and streams it to every reader who has it open, with the
fake writer or with Claude, both through the gateway.

A `SectionWriter` (`writer/types.ts`) takes the stored manual, a section id and a signal, and
yields chunks of `{ text, progress, placeholder? }`; the body is exactly all the text joined. It
fails with `WriteFailed("budget" | "error")` or any other error. Both writers keep the same
contract:

- Chunks end on whole words, and `progress` rises to at most 1.
- A section the manual doesn't have is refused (`sectionToWrite`).
- Once the signal aborts, no chunk follows: the write throws the abort, or ends if it had nothing
  left to send.
- Only the gateway's `SpendingRefused` (a cap or the kill switch) becomes `WriteFailed("budget")`
  (`refusalAsBudget`). The gateway throws it before reserving or calling anything, so "budget"
  always means nothing was charged. Everything else reaches `runs.ts` as is and becomes `"error"`.

## The fake writer

**`writer/fake.ts`** sends the seed body through the gateway, as a `write-section` call whose
user message is the body, and the fake model repeats it back (`server/agent/README.md` › The fake
model): after a wait, in chunks of about 20 characters at a steady pace (`README.md` › The models
gives the timings), split at word boundaries, the same pace as the fake librarian's replies. The
call is reserved, capped, refused by the kill switch, stopped by the idle timeout and recorded at
$0 like any other.

- It sends its own prompt, not the Bedrock writer's: the fake model answers from its request
  alone, and that prompt holds the manual's contents but not the section's sample text. So the
  Bedrock writer's prompt, output handling and checks run only with Claude.
- `chunkEnds` splits a body into these chunks. The fake model and the previews use it too.
- `progress` is exact.
- A section with no seed body gets a short placeholder, with every chunk marked `placeholder`,
  so the reader can be tried on any manual without storing anything.

## The Bedrock writer

**`writer/bedrock.ts`** builds the prompt and streams it through the gateway. It takes the
gateway, the store, `config.sectionWordsRequested` and `config.sectionExpectedCharacters`.

- **The prompt** (`writer/prompt.ts`):
  - The **system prompt** is the same for every section of a manual. It holds the instructions, the
    markdown that `src/reader/DESIGN.md` › Markdown allows, the shape of a section (including the
    sample's punctuation: spaced em dashes and curly quotes), then the manual's title, subtitle,
    voice and contents (each section's label, title, id and summary). It says that text inside
    `<manual>` and `<written-section>` is reference material, never instructions, and that the voice
    describes style only. Its locale rule outranks the voice and any written section, so a manual
    whose voice is British still comes out in American English: US spelling and vocabulary, US
    dollars, and US customary units unless the subject itself works in metric.
  - The **user message** names the section, its chapter and its summary, the previous and next
    sections with their summaries, and a length in words (`sectionWordsRequested`). It ends
    by restating what Haiku most often skips: at least one table, list, checklist or code block,
    a language tag on every code block, and a cross-reference with the target's title as its
    link text, shown with a real neighbor (`[Sensing the Guest](section:sensing-the-guest)`).
  - **An example section.** The user message starts with a section of the same manual that is
    already written, to show its voice and markdown: it is what gives Haiku 4.5's sections their
    headings, lists and links. It prefers the nearest section whose body is still the seed's (by
    distance in reading order, the earlier one on a tie), so the model's own flaws don't spread,
    and falls back to the nearest written section. It adds about 1,000 input tokens, about $0.001
    a section. A manual with nothing written yet gets no example.
  - **Escaping.** Manual text (chapter and section titles included, since a planned manual's come
    from the model and the user's request) is inserted with `<` escaped (`escapeTags`, which the
    planner's prompt uses too), so it can't open or close a tag; attribute values also escape `>`
    and `"`. Bodies keep `>`, which is blockquote syntax and can't form a tag on its own.
- **The opening is held back** (`writer/section-text.ts`). Nothing is yielded until the first
  line that is not clutter is whole, so the cheap fixes happen before the reader sees anything.
  Clutter is a blank line, an H1, a line that repeats the section's title (with or without its
  label), a thematic break, a setext underline (`===`), or a preamble. A preamble is a line of at
  most 160 characters that either starts with "Sure", "Certainly", "Of course", "Okay" or
  "Absolutely" and is at most 40 characters, names the section or a draft, or says "here is"; or
  ends with a colon and names the section or a draft. "Of course, the first thing a guest hears
  is the door." is kept. The first line is usually the first paragraph, so the first chunk is
  that whole paragraph. After that, nothing is dropped, and text already shown never changes.
- **Typographic quotes** (`writer/typographic-quotes.ts`). Straight quotes and apostrophes in
  the body become “ ” ‘ ’ (and primes after a digit: 5′ 10″), as the seed manuals are written,
  wherever the prompt's punctuation rule slipped. Code blocks, inline code, link and image
  targets, reference definitions, autolinks, HTML-like tags, bare URLs and backslash escapes are
  left alone. The body (after the opening, before whole words are cut) is typeset as a whole each
  time text arrives. Each quote is decided by the text before it and the rest of its word, and
  whole-word yielding shows a word only once the whitespace after it has arrived, so a quote is
  final before it is shown: nothing extra is held back, and the stored body is exactly the
  streamed text. The rules are in the module and its tests, which also check that the seed
  bodies, with their quotes made straight, come back exactly.
- **Whole words only.** It yields only up to the last whitespace and holds back the rest until
  more arrives or the stream ends. Chunks therefore end on whole words, like the fake's. Bedrock
  sends small deltas, so a section arrives as a few hundred `append` events.
- **Late failures.** Problems found at the end (`writer/validate.ts`, which ignores code) throw
  `SectionRejected`, a plain `Error` that names them, so `runs.ts` logs it and sends `failed:
  "error"`. The streamed text is discarded, and the unshown tail is never sent:
  - a `stop_reason` other than `end_turn` (`max_tokens`, `refusal`, …);
  - an empty section (a section that is only a code block is not empty), or an H1 anywhere;
  - a footnote reference without a definition (labels match without regard to case, and
    definitions may be indented up to three spaces);
  - a `section:` link to an id that doesn't exist, or to the section being written, in any form:
    inline, titled, in angle brackets, or as a reference definition.

  A fence closes only on a line of the same character, at least as long, with nothing after it,
  so a four-backtick `text` block holding a three-backtick `json` block and a `# Role` line is
  still code.
- **Progress** is `min(0.99, characters shown / config.sectionExpectedCharacters)`. It is a separate
  setting from the words requested because Haiku 4.5 writes past the length it is asked for (the
  measurements in `server/README.md` › Configuration). Set near what it writes, progress usually
  ends a little short of 100% and then jumps to written, rather than waiting at 99%.

## One writer per section

`writer/runs.ts` keeps an in-memory `Map` keyed by `manualId/sectionId`, for the readers one
server process serves, and takes a section's lease (`SectionLeases`, `server/storage/README.md` ›
Section leases) before it writes, for the processes that share a store: the Web Function's
environments, which share the table `rtfm-app`. On this machine there is one server per data
folder, so its leases (`storage/in-process-leases.ts`) grant every take, and the map alone keeps
one writer per section, exactly as it would without them.

- **Opening a section** checks the map, then storage (`getBody`), then the map again. If there is
  still no entry, it creates the run in the same tick, so two requests can't both start one. The
  run then takes the section's lease, and writes only once it has it.
- **Finished runs stay in the map** as `written`, which closes the gap between a request reading
  storage and a run finishing. If `saveBody` returns `already-written`, the run sends `written`
  anyway: the stored body is the one that counts.
- **`writingSectionIds(manualId)`** names the sections of a manual that have a run in progress,
  for the manual route; **`isWriting(manualId)`** says whether there are any, for the delete route.
- **Statuses come from storage** for any section not being written. If a written section's file
  has been deleted by hand, opening it drops the stale `written` entry and writes it again.
- **Listeners:** the first request starts the writer with its own `AbortController`. Later
  requests subscribe and get the backlog first.
- **Ending:**
  - When the writer finishes, the lease saves the body (`SectionLease.saveBody`), then `written`.
    If any chunk was marked `placeholder`, nothing is stored and the entry is removed instead: the
    readers still get `written`, but the section is unwritten again for the next request, and the
    library's count doesn't change.
  - When the writer throws, `failed`, and the entry is removed. Nothing is stored.
  - **When the last listener disconnects, the run is aborted** at once, with no grace period, which
    aborts the Bedrock call (`server/gateway/README.md`), and the partial text is discarded.
    Reloading mid-section therefore starts the writing again from scratch.
  - However it ends, the run then releases its lease. A release that fails is logged
    (`section.release-failed`), and the lease expires instead.
- **At most 3 runs at once** (`config.maxConcurrentRuns`) per process, a run waiting for another
  environment included. A fourth request gets `failed: "error"`. Each writing section holds one
  browser connection, and HTTP/1.1 allows 6 per origin, so this keeps the page's other requests
  flowing. The reader keeps a section's stream open while it navigates elsewhere.

### Another environment

When another environment holds the section's lease, the run waits for that environment's body
instead of writing:

- **It looks again every second** (`WAITING.pollEveryMs`): it tries to take the lease, then reads
  the body. Its readers, and any reader of this environment who joins it, see the section as
  `writing` (`statusOf`, `writingSectionIds`) and get no events while it waits: the reader shows its
  waiting state, and the `EventSource` gets only the heartbeat comment every 15 seconds
  (`server/api/README.md`), which also keeps CloudFront's 60-second read timeout from closing it.
- **Once the body is stored**, its readers get it as one `append` at offset 0 with `progress` 1,
  then `written`, as a reader of a written section does, and the entry becomes `written`.
- **Once the lease is free with no body stored**, released or expired, the run takes it over and
  writes the section itself, from the start: the other run ended without a body (aborted, failed,
  a placeholder) or its environment stopped. A waiting reader therefore never gets a failure only
  because the other environment's reader left, as when a reader reloads mid-section and the
  reload reaches another environment.
- **It gives up after 2 minutes** (`WAITING.limitMs`) with `failed: "error"`. The wait is otherwise
  bounded by the lease: a lease is held only while its run writes, which the writer's stall
  timeout and `max_tokens` bound, and is free at most one lease length (20 seconds) after its
  holder stops renewing it. The limit is far past any section's writing time (12–15 seconds with
  Claude), and only stops a reader waiting forever on a holder that never ends.
- **When its last listener disconnects**, the waiting stops, as a run is aborted; it holds no lease.
- **If the run loses its lease** while it writes (its renewals kept failing until just before the
  lease would expire, or its item went with a deleted manual), the writer is aborted at once,
  before another environment can take the section, nothing can be stored, and its readers get
  `failed: "error"`.

So abort on the last disconnect holds per environment: when the lease holder's last listener
leaves while a reader waits on another environment, the holder's run is aborted and releases the
lease, and the waiting run takes the lease at its next look and writes the section for its own
readers.

## Tests

`section-writer.test.ts` is the `SectionWriter`'s shared suite: its tests run once against the fake
writer, with the fake model, and once against the Bedrock writer, with a scripted `ModelClient`,
both through the real gateway. It checks the contract above, that the kill switch fails a write as
"budget" with nothing recorded, that a write's call is recorded settled, and that a run stores
exactly the text that streamed. `fake.test.ts` and `bedrock.test.ts` cover what only one writer
does, and `runs.test.ts` covers the runs.

`runs-leases.test.ts` is the runs' shared suite over both kinds of leases: one server with its
leases in its process, and two environments, each with its own DynamoDB leases, on one table in
DynamoDB Local. In each, two runs race for one section and one writer writes it for both readers;
a reader whose run is aborted leaves the section to the other; a placeholder is stored by neither;
and a failure reaches both. It then covers what only environments do: the waiting reader's one
`append`, taking over a crashed environment's expired lease, the waiting limit, a run that loses
its lease, and a released lease freeing the section at once. The leases it waits out are half a
second to two seconds long, with room for test runs side by side, so no test waits for the
committed lengths.

## Files

- `types.ts`: `SectionWriter`, `WriteFailed`, `refusalAsBudget`, `sectionToWrite`.
- `runs.ts`: one run per section, which takes the section's lease or waits for another
  environment's body; later requests join it.
- `fake.ts`: plays the seed body through the gateway, which the fake model repeats back.
- `bedrock.ts`: writes through the gateway, choosing an example section.
- `prompt.ts`: builds the prompt.
- `section-text.ts`: holds back the opening, typesets quotes and yields whole words.
- `typographic-quotes.ts`: curly quotes and apostrophes, outside code and link targets.
- `code-fences.ts`: where a fenced code block opens and closes.
- `validate.ts`: cheap output checks.
