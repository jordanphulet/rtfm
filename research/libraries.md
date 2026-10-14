# A library per recipient: the design

Research, written 2026-10-14, from the code and docs on `main` at `8d59dcb`. It made no AWS call.

**Status 2026-10-14: the user's decisions below are decided; the rest is proposed.** The user
decided, in the orchestrator's session on 2026-10-14:

- a secret link per library is enough to open it, with no passcode and no button: the link opens
  the library straight away;
- the library cookie lasts a year, renewed on use, and revoking is done on the server;
- every new library starts with the same two starters, *The Haunt That Listens* and *Negotiating
  With Geese*, as tables of contents only, every section written live when first opened;
- a library lives until the user revokes it;
- the user sees each library's activity, and what its recipient made: its manuals' titles and which
  sections are written;
- a daily cap of $0.50 per library, and no monthly cap per library.

Everything else here is this doc's recommendation: the link's form, the key scheme, the ops
commands and the AWS changes. The build tasks at the end (Build tasks, below) put it into what it
governs once the orchestrator adds them; LB.7 and LB.10 change files under `PROCESS.md` › Authority,
which the user approves.

**Why.** RTFM goes on the user's résumé, and each job application gets its own library: a hiring
manager clicks one link and is in, alone, with two manuals whose sections are written in front of
them as they open each one, and can ask the librarian for a new manual, without seeing anyone
else's.

## What there is

- **One library.** Every manual is in the partition `LIBRARY` of the table `rtfm-app`, each written
  section in `MANUAL#<manualId>`, and the seeding record in `SEEDED`; on this machine, in
  `.data/manuals/` and `.data/seeded.json` (`server/storage/README.md`). The routes, the runs, the
  writer, the librarian and the planner are each built once in `server/app.ts` around that one
  `ManualStore`.
- **One gate.** With a passcode set, the Node adapter refuses every API request whose
  `rtfm_passcode` cookie isn't the passcode's SHA-256 digest (IN.15; `server/api/README.md` › The
  passcode). Without one, on loopback, there is no gate and no `POST /api/passcode`. The deployed
  app reads the digest from `PASSCODE` in `rtfm-app`, at most a minute old, and refuses everything
  while none is stored.
- **One set of caps.** Every model call is reserved against $2 a day and $20 a month, and the kill
  switch, in one transaction on `rtfm-usage` (Bedrock) or in the data folder (the fake models)
  (`server/gateway/README.md` › The spending ledger).
- **The Web Function's role** reads and writes every item of `rtfm-app` but those of `PASSCODE`,
  which a deny keeps for `rtfm-ops` (`LeaveThePasscodeToOps`, IN.25; `infra/README.md` › The Web
  Function's role and the passcode). `rtfm-ops` reaches only `PASSCODE` in `rtfm-app` and
  `KILL_SWITCH` in `rtfm-usage`; `rtfm-read` reads no item of `rtfm-app`.

## Access: a secret link per library

### The link

`https://rtfm.moonfetus.com/l#<secret>`: the page route `/l`, with the secret in the fragment.

| Form | For | Against |
| --- | --- | --- |
| **`/l#<secret>` (recommended)** | The fragment never leaves the browser: no request line, server log, CloudFront log or `Referer` carries it. Vite and the Web Function already answer `/l` with `index.html`, so nothing changes in front of the server. A preview or scanner that only fetches the URL gets the page and opens nothing | Needs the page's script, which every page of RTFM needs anyway. A mail scanner that runs the page's script opens the library like a browser, as it would with any form |
| `/l/<secret>`, answered by the server with the cookie and a redirect | Works with no script | The secret is in the path, so the `request` line logs it unless the logger cuts it out; Vite needs a proxy rule for `/l`; every `GET` of the link opens the library, a scanner's that runs no script included |

The link opens the library straight away, with no button. The page at `/l` reads the fragment as it
loads, posts it to `POST /api/link` with plain `fetch` (as the passcode screen posts the passcode),
and on `204` replaces the address with `/` (`navigate("/", { replace: true })`), so the secret
leaves the address bar and the tab's back history before the landing page loads. The browser's own
history of visited pages may still hold the link, as it holds any link clicked. A `401` shows the
closed screen (A revoked link, below).

**Mail scanners.** Some mail security scanners open each link in a browser that runs its script.
Such a scanner opens the library: its visit seeds the starters and counts as the link's first use
(Lifetime and activity, below), before the recipient has clicked. That is why `firstUsedAt` can
predate the recipient's visit, and why `lastUsedAt` and the counts say more than the first use does.

### The secret and the cookie

- **The secret** is 16 random bytes (`randomBytes(16)`), as base64url: 22 characters, 128 bits.
  Nothing needs to slow guessing, unlike the passcode's few words.
- **Stored as its digest**, SHA-256 in lowercase hex, the passcode's form
  (`PASSCODE_DIGEST_PATTERN`), on the link's item (The key scheme, below). The secret itself is in
  no file, table or log: `npm run ops -- library create` prints the link once and keeps nothing.
- **The cookie** is `rtfm_library=<secret>`, with the passcode cookie's attributes (`HttpOnly`,
  `SameSite=Strict`, `Path=/api`, `Secure` off loopback) and `Max-Age` of a year (31,536,000
  seconds), within the 400 days browsers allow.
- **Renewed on use.** Every response to a request the library cookie opened sends the cookie again
  with a fresh year, so a recipient who comes back within a year of their last visit is still in.
  Revoking ends it on the server, whatever the browser holds, so a long life costs nothing the user
  can't take back. The passcode cookie stays a session cookie.

Which the cookie holds is a real choice:

| Cookie | For | Against |
| --- | --- | --- |
| **The secret, hashed by the gate (recommended)** | Reading the table opens nothing: the link items hold digests, and a digest isn't a cookie. So `rtfm-read` can read the link items for `npm run ops -- library list`, and neither the Web Function's role nor any role an app stack makes can open a library | One SHA-256 per request, microseconds |
| The digest, as the passcode's cookie is | The passcode gate's exact shape | Whatever reads the link items opens every library, as whatever reads `PASSCODE` opens the app (`README.md` › A passcode) |

The passcode keeps its cookie as it is: the smoke check builds its cookie from the stored digest
(`npm run ops -- passcode cookie`), and nothing here changes the admin's way in.

### How a request gets its library

IN.15's gate, generalized: it gives every API request a library, or refuses it, before the body is
read or a route is matched. In order:

1. **`POST /api/link`, `DELETE /api/link` and `POST /api/passcode`** pass, as `POST /api/passcode`
   does now.
2. **An `rtfm_library` cookie** of the secret's form (`^[A-Za-z0-9_-]{22}$`) is hashed and its link
   looked up by digest (one strongly consistent `GetItem`, or a file read).
   - An open link gives its library. A revoked link gets `401 { error: "Link closed" }`.
   - A cookie of another form, or one whose lookup finds no link, is no cookie.
   - A lookup that fails (DynamoDB out of reach, a refused key, a file that can't be read) answers
     `500 { error: "Internal error" }`, logged as `request.failed`, and never counts as no link: a
     recipient is never dropped to the passcode screen, or to the admin's library on loopback, by an
     outage.
   - Each environment keeps a link it found, open or revoked, for a minute, as it keeps the stored
     passcode digest; it never keeps a miss, so a new link works at once and a flood of made-up
     cookies can't fill the cache.
3. **An `rtfm_passcode` cookie** that holds the passcode's digest gives the admin's library.
4. **Otherwise**, with a passcode gate, `401 { error: "Passcode required" }`, as now; without one
   (loopback, no `RTFM_PASSCODE`), the admin's library, as now.

So the library comes from a cookie alone, never from the path, the query or the body: no request
can name another library. The library cookie comes first, so a browser holding both is the
recipient's, the lesser reach.

**The routes for the cookies:**

- **`POST /api/link { secret }`** hashes the secret and looks up its link. An open one answers
  `204`, after seeding the library's starters if it has none (Starters › How a new library gets its
  copies, below) and recording the use (Lifetime and activity, below), with two `Set-Cookie`
  headers: the library cookie, and the passcode cookie cleared (`Max-Age=0`). An unknown or revoked
  one answers `401 { error: "Link closed" }` and sets nothing; a lookup that fails answers `500`.
  It is logged as `link.accepted` with the `libraryId`, or `link.refused` with `reason: "unknown"`
  or `"revoked"` (and the `libraryId` of a revoked one), never with the secret, its digest or the
  cookie.
- **`DELETE /api/link`** answers `204` with the library cookie cleared, always, with or without a
  passcode gate. The page route `/admin` calls it and then opens `/`: on loopback with no passcode
  that is the admin's library, and with a passcode gate it is the passcode screen, as for any
  browser without a cookie. That is how the user who has opened a link in their own browser gets
  back to their own library. A private window, which keeps its cookies apart, is the easier way to
  check a link.
- **`POST /api/passcode`** also clears the library cookie when it accepts the passcode, so a browser
  holds one cookie at a time.

`JsonResponse` carries a list of cookies for this, and the adapter writes each as its own
`Set-Cookie` header (`response.setHeader("set-cookie", [...])`), on JSON responses and on an event
stream's headers alike, the renewal included.

A link works whether or not a passcode is set: on the deployed app before the user has set one,
the admin is refused and every open link still opens its library.

### A revoked link

`npm run ops -- library revoke <libraryId>` sets `revokedAt` on the link's item. Within a minute
(the gate's cache), on every environment:

- every request with the library's cookie gets `401 { error: "Link closed" }`, and `POST /api/link`
  with its secret gets the same;
- the page shows the passcode screen with one line above the form, "This link is closed.", so a
  recipient learns why, and the user can still get in with the passcode;
- a section stream or librarian reply already running finishes, as a running call does when the
  kill switch goes on, bounded by its `max_tokens`;
- the library's manuals, sections and activity stay where they are, so `library show` still reads
  them, and its id is never given to another library. Its items are a few hundred KB at most, far
  inside DynamoDB's free storage, so there is no purge.

### The link is a bearer token

Whoever has the link, or the cookie it sets, opens that library, with no passcode, until the user
revokes it: the person it was sent to, anyone they forward it to, and any tool that reads their mail
and runs the page's script. That is the user's decision, and `README.md` should say it as plainly as
it says "The digest opens the app". A link reaches only its library: it can't read or change
another library's manuals, and it can't spend past its library's daily cap or the central caps
(Spend, below). Send each link only to the person it is for, and revoke it once the application
is over.

## Isolation: one key prefix per library

### The key scheme

Each library is a key prefix, `L#<libraryId>#`, in front of the partition keys there are now. The
admin's library keeps the keys there are now, with no prefix:

| Item | `pk`, the admin's library | `pk`, a recipient's library | `sk` |
| --- | --- | --- | --- |
| A manual | `LIBRARY` | `L#<libraryId>#LIBRARY` | `MANUAL#<manualId>` |
| A section, written or holding a lease | `MANUAL#<manualId>` | `L#<libraryId>#MANUAL#<manualId>` | `SECTION#<sectionId>` |
| A seed manual already seeded | `SEEDED` | `L#<libraryId>#SEEDED` | `MANUAL#<manualId>` |

Beside them, three partitions belong to no library:

| Item | `pk` | `sk` | Other attributes |
| --- | --- | --- | --- |
| A link | `LINK` | the secret's digest | `libraryId`; `label`, the user's note; `createdAt`; `revokedAt`, once revoked |
| A library's activity | `ACTIVITY` | `<libraryId>` | the fields in Lifetime and activity, below |
| The passcode | `PASSCODE` | `PASSCODE` | `digest`, as now |

- **No prefix collides.** A recipient's keys all start `L#`; no other partition does (`LIBRARY`,
  `LINK` and the rest have no `#` after the `L`). A library id is a slug (`ID_PATTERN`, lowercase
  letters, digits and hyphens), so it holds no `#`, and `L#acme#MANUAL#x` can't be read as another
  library's. `admin` is reserved: no recipient library may take it.
- **The leases come along.** A section's lease is on the section's item (`server/storage/README.md`
  › Section leases), so `L#<libraryId>#MANUAL#<manualId>` holds that library's leases, and
  `heldElsewhere`'s query of the manual's partition sees only them. Two libraries can each write
  a section of the same manual id at the same moment, with separate leases.
- **The library list** of a library is its own `…LIBRARY` partition, which `listManuals` queries.
  The list of libraries is the `LINK` partition, which only the ops tools read.
- **Activity and links aren't per-library partitions**, because no route ever reads them: the API
  can't reach them, so they need no prefix to stay apart, and one `Query` each lists them all for
  `library list`. They have partitions of their own so that IAM can name them (AWS, below).
- **Spend** is in `rtfm-usage` (Spend, below).

On this machine, the data folder keeps the same shape:

```
.data/manuals/<manualId>/…                 the admin's library, as now
.data/seeded.json                          the admin's seeding record, as now
.data/libraries/<libraryId>/manuals/…      a recipient's library: the same layout under its folder
.data/libraries/<libraryId>/seeded.json    its seeding record
.data/links/<digest>.json                  a link: libraryId, label, createdAt, revokedAt
.data/activity/<libraryId>.json            a library's activity
```

### The admin's library is the keys there are now

| Option | For | Against |
| --- | --- | --- |
| **The admin's library keeps the unprefixed keys (recommended)** | Nothing is copied, moved or deleted: every manual in `rtfm-app` and in `.data` is the admin's library from the first deploy, and a deploy that is rolled back finds the table as it was. No migration runs against a table with deletion protection and PITR | The key function has one case for the admin's library: no prefix |
| Move the admin's items under `L#admin#` | Every library has the same form | A migration with no safe place to run: `rtfm-read` and `rtfm-ops` can't touch those items, so it runs inside the Web Function at start, on two environments at once, while sections may be leased and written, copying and then deleting the library; a crash between leaves both. PITR could restore it, which is the point of not needing it |

One function builds every key from the library and the old key (`L#<libraryId>#` + old, or old
for the admin's), and the data folder's one function the folder (`libraries/<libraryId>/`, or the
data folder itself for the admin's). Every store method goes through it. The stores and leases
take the library as an argument that defaults to the admin's, so every caller that doesn't name one
keeps working as it does now.

### How the server carries the library

- **A `Library`**, built once per library id in each environment and kept in a map: its id, its
  `ManualStore` and `SectionLeases` (bound to its prefix or folder, and wrapped to count its
  activity: What is recorded, and where, below), its gateway, and its section writer (the Bedrock
  writer reads the manual's example section through the library's store). Its gateway is the one
  shared gateway until LB.5 binds it to the library, for the reservation's `libraryId` and cap
  (Spend, below). `server/app.ts` builds the admin's at start, and seeds it there, as now.
- **The API.** The gate puts the library on the request (`ApiRequest.library`), and every handler
  takes its store, its runs scope and its gateway from there rather than from `app.ts`. The routes
  keep their paths: `/api/manuals/:manualId` is the manual of that id in the request's library, and
  `404` in any other.
- **The runs.** One `Runs` for the whole server, so `maxConcurrentRuns` (3) still counts every
  section being written, whatever its library, and the librarian keeps its room in the gateway's
  5 calls. Its map is keyed `<libraryId>/<manualId>/<sectionId>`. Each method takes the library's
  scope (its id, store, leases and writer), which defaults to the admin's, the one `createRuns` is
  given; each run reads, takes its lease, writes and saves through its own library's scope. One
  library can fill the three runs; at RTFM's scale that is a wait of seconds, not worth a share per
  library.
- **The librarian and the planner** get the library's store and gateway, so `list_manuals`,
  `find_manuals`, `open_manual`, a new manual and a proposed delete all act on that library alone.
  The fake librarian and the previews take the same store.
- **The client-error log.** `POST /api/client-errors` is behind the gate like any route, so each
  `client.error` and `client.limited` line carries the reporting page's `libraryId`. The hourly
  limit (60) stays one per environment: it protects the log, and one library's loop can use it up
  for an hour, which the `libraryId` then shows.
- **The log.** Every line about a request in a library carries `libraryId`: `request` (once the
  gate has given one), `request.failed`, `section.*`, `librarian.reply`, `agent.tool-failed`,
  `model.call`, `model.refused`, `client.error`, `manual.cleanup-failed` (the file store's), and
  the new `link.*`, `library.seeded` and `library.activity-failed`. The admin's lines say `admin`.
  Nothing else is added: no conversation, title, prompt or section text, no label, and never the
  secret, its digest or the cookie.

### What proves it

- `manual-store-suite.ts` runs every rule against two libraries on one table and one data folder:
  a manual, body, delete or seeding record in one is never seen or changed in the other, the same
  manual id lives in both apart, and the admin's library reads items stored with no prefix.
- The DynamoDB leases' test takes a lease on the same section id in two libraries at once, and
  `heldElsewhere` in one never names the other's.
- The runs' tests write the same section id in two libraries at once, each saved in its own.
- The API's tests open two libraries by their links on one server and check that neither's
  `GET /api/manuals`, manual, section, stream, delete or librarian reaches the other's manuals, and
  that a revoked link's cookie gets `401` within the cache's minute.

## Starters

### The seven

| Manual | Sections | What it shows off |
| --- | --- | --- |
| *The Haunt That Listens* | 18 (5 chapters, 2 appendices), every body hand-finished | The sample: a carnival barker's gothic voice over real engineering (latency budgets, torque ratings, fire code), with tables, code blocks and cross-links. The only one with bodies |
| *Running Your Own Mail Server Without Losing Your Mind* | 31 (6 chapters, 2 appendices) | The most technical: DNS records and server config as code blocks, and the longest contents, in a weary war correspondent's voice |
| *The Birthday Party Field Manual* | 14 (3 chapters, 1 appendix) | A logistics officer's operational orders, clipped and numbered: checklists, timelines and quantity tables (sausages per child) |
| *Negotiating With Geese* | 6 (2 chapters) | The shortest, read end to end in minutes: a hostage negotiator's deadpan over real field biology |
| *Keeping a Sourdough Starter Alive* | 9 (2 chapters, 1 appendix) | A retired ICU nurse's bedside manner: feeding schedules and a triage table. The warmest voice |
| *Building a Backyard Observatory* | 22 (5 chapters, 1 appendix) | An engineer's exact numbers (concrete, pier tolerances, polar alignment) with an astronomer's wonder |
| *Moving House Without Losing the Cat* | 17 (4 chapters, 1 appendix) | A feline behaviorist's quiet wit: timelines and room-by-room packing lists. The planner's prompt uses it as its example manual |

### The starters: two tables of contents

Decided: **_The Haunt That Listens_ and _Negotiating With Geese_**, the sample and the shortest,
24 sections between them. A new library gets each as its table of contents only, with no section
written, so every section is written live, by Claude, the first time the recipient opens it: the
app's own trick, on the first click. Reading both end to end costs about $0.24 (24 sections at
$0.007–0.010), inside the library's daily cap.

- **The seed list** is `starterManualIds` in `server/config.ts`, the two ids, committed with the
  other settings.
- **The Haunt's hand-finished bodies stay in `server/seed/`** for the admin's library, the tests
  and `npm run shot`, and the fake writer replays them in any library, a recipient's included. All
  seven seed manuals stay, so the admin's seeding, `writtenAtStart` and the planner's example manual
  are as they are.
- **The first section** Claude writes in a recipient's manual has no example section to follow,
  as in any new manual (`server/writer/README.md` › The Bedrock writer); from the second on it has
  the nearest written one.

### How a new library gets its copies

On its link's first use: `POST /api/link` runs `seedStore` on the library's store before it
answers, with the starters only and no bodies. `seedStore` keeps its rules
(`server/storage/README.md` › Seeding): conditional creates, a record per manual, a deleted starter
never seeded again, two environments seeding at once without harm. Within an environment, a
library's seeding runs one at a time: a second `POST /api/link` for the same library waits for the
first one's seeding, kept in a map of seeding promises by library id, rather than seeding beside it.
A library that is already seeded costs one `Query` of its `SEEDED` partition; a new one, two
manual items and two seeding records, a few milliseconds.

| When | For | Against |
| --- | --- | --- |
| **On the link's first use (recommended)** | The server already seeds this way; nothing outside the Web Function writes a library's manuals; a link never used costs nothing | A scanner that runs the page's script seeds it too (The link, above), which costs two items |
| At `npm run ops -- library create` | Nothing on the request path | `rtfm-ops` would need to write every library's partitions, and the ops tools would carry the seed and the store |

## Lifetime and activity

A library lives until the user revokes it: nothing expires, and a library never used stays open.

### What is recorded, and where

Both items and log fields: the items give each library's totals at once, forever, for `library
list` and `show`; the log fields say when and what, for 30 days (CloudWatch's retention), which
`npm run ops -- logs --library <libraryId>` filters.

The activity is counted in two places only:

- **The gate and the Node adapter**, which see every request and its answer: the link's uses, the
  last use, the sections read and the librarian messages.
- **The library's store and leases, wrapped**: the manuals created and the sections written. Only
  the routes, the runs and the librarian get the wrapped store; seeding uses the bare one, so the
  starters never count as created.

| Activity | Counted by | The library's `ACTIVITY` item | The log |
| --- | --- | --- | --- |
| The link's first use | `POST /api/link` | `firstUsedAt`, set if absent | `link.accepted` |
| Links opened | `POST /api/link` | `opens`, `ADD 1` | `link.accepted` |
| The last use | The gate, on any request the library cookie opens | `lastUsedAt`, written at most once a minute per environment, without holding the request up | `request` with `libraryId` |
| Sections read | The adapter | `sectionsRead`, `ADD 1` per `GET /api/manuals/:manualId/sections/:sectionId` in the library that it answers `200`, whatever the section's status | `request` |
| Librarian messages | The adapter | `librarianMessages`, `ADD 1` per `POST /api/librarian` without `?freeze` that it answers with an event stream: one new message from the recipient each | `librarian.reply` |
| Manuals created | The wrapped store | `manualsCreated`, `ADD 1` when `createManual` answers `"created"` | `librarian.reply` with `tools` naming `create_manual` |
| Sections written | The wrapped store and leases | `sectionsWritten`, `ADD 1` when `saveBody`, the store's or a lease's, answers `"saved"` (a placeholder is never saved) | `section.finished` |
| Spend | The gateway | in `rtfm-usage`, not here: each day's committed spend (Spend, below) | `model.call` with `libraryId` |

**Sections read, exactly:** the reader asks the section's JSON route once each time it shows a
section, written or not, before it opens any stream, so `sectionsRead` counts sections shown: one
read twice counts twice, a section's stream adds nothing of its own, and a preview, a `404` or a
refused request counts nothing.

Each counter is one `UpdateItem` beside what it counts; one that fails is logged as
`library.activity-failed` and never fails the request. The admin's library has no `ACTIVITY`
item: its activity is the user's own, in the log. A scanner that runs the page's script counts as a
use (The link, above); opening a link to check it does too, and `firstUsedAt` is then the user's.

### What the user sees of a recipient's manuals

`library show <libraryId>` lists the library's manuals, each with its title and which of its
sections are written, besides the counts. It reads them as `rtfm-read`, with one `Query` of the
library's `L#<libraryId>#LIBRARY` partition: each manual's item holds its `StoredManual` (title,
subtitle, voice and contents) and its `written` set, so no section's body is read. `rtfm-read` gains
`Query` on the partitions `L#*#LIBRARY` for it, an `RtfmAccess` change (AWS, below): no admin item,
no section and no body.

No conversation text is kept anywhere: the librarian's conversations live in the recipient's page
and the request that carries each one, and are never stored or logged. What a recipient leaves
behind is the manuals the planner saved for them, whose titles and contents come from what they
asked for, and the sections written.

### What `npm run ops` gains

`library`, under `README.md` › The ops tools' rules: non-interactive, plain text or `--json`, exit
code 1 with the reason on failure.

**`create` and `revoke` are the user's**, as `passcode set` is: the user runs them in their own
terminal, outside the Claude app, whose Terminal panel a session can read, and agents never run
them (a line for `CLAUDE.md` › Shell, which the user approves). `create` prints a working link,
which an agent's transcript would keep; `revoke` changes who can open the live app.

| Command | Role | What it does |
| --- | --- | --- |
| `library create <libraryId> [--label <text>]` | `rtfm-ops` | Refuses an id that isn't a slug, is `admin`, or any link item names, revoked or not (one `Query` of `LINK`). Makes a secret, puts its link's item on `attribute_not_exists(pk)`, and prints the link, `https://rtfm.moonfetus.com/l#<secret>`, once, on standard output (`--json`: `{ "libraryId": "…", "link": "…" }`). It keeps the secret nowhere: a lost link is revoked, and another library made |
| `library list` | `rtfm-read` | Every library: id, label, created, revoked, first and last use, links opened, manuals created, sections written and read, librarian messages, and spend that day, that month and in all. One `Query` each of `LINK` and `ACTIVITY` in `rtfm-app`, and of `TOTAL` in `rtfm-usage` (`begins_with(sk, "LIBRARY#")`) |
| `library show <libraryId>` | `rtfm-read` | The same for one library, with its spend by day, and its manuals, each with its title and its written sections (above) |
| `library revoke <libraryId>` | `rtfm-ops` | Sets `revokedAt` on its link's item, on the condition that it exists and isn't revoked, then reads it back: `acme is revoked; the app refuses its link within a minute.` |

`logs` gains `--library <libraryId>`, which keeps the entries whose `libraryId` is that one, and
`npm run logs` takes it too (`LOG_OPTIONS`). The link's origin, `https://rtfm.moonfetus.com`, goes in
`scripts/ops/deployed.ts` beside the other deployed names.

On this machine, `npm run serve-temp -- --library <libraryId>` makes one link in its throwaway data
folder and prints it once beside the page's URL, so an agent can open a library on the fake models
for a check. Its link opens only that throwaway folder, on loopback, with the fake models.

## Spend

Every library stays under the central caps ($2 a day, $20 a month) and the kill switch: each call
is still reserved against them in the one transaction (`server/gateway/README.md` › The table
`rtfm-usage`), from whichever library.

**A daily cap per recipient library: $0.50**, `caps.libraryDailyUsd` in `server/config.ts`, the
same for every library, committed like the other caps. There is no monthly cap per library.

- **What $0.50 buys:** both starters read end to end ($0.24), plus a new manual or two with a few
  sections each (about $0.02 to plan, $0.01 a section) and the librarian at $0.002–0.004 a call:
  more than a curious reader spends in a day, with room for three sections' reservations of about
  $0.025 each at once.
- **The monthly exposure.** One library at its cap every day is about $15 a month. Two at their caps
  for most of a month reach the central $20, and from then on the central monthly cap refuses every
  library, the admin's too, for the rest of the month. Four at their caps on one day reach the
  central $2 and refuse everyone for the rest of that day. The user watches this with
  `npm run ops -- library list`, which gives each library's spend that day and that month, and
  revokes a library that spends far past a reader's interest.
- **Where it lives:** beside the central totals. Each reservation of a recipient library's call adds
  a fifth part to its transaction, an `Update` of the item `TOTAL` / `LIBRARY#<libraryId>#<day>`,
  `ADD committedUsd :worstCase` on the condition that it stays within the library's cap, worked out
  as the central caps' are; settling adds `usd − worst case` to it too. The data folder's ledger
  keeps the same total in its map (`<day>#<libraryId>`). Every reserve entry carries `libraryId`
  (the admin's calls say `admin`; an entry without one, from before, is the admin's), and the
  admin's calls have no library cap, only the central ones.
- **Refused** as `SpendingRefused("library-cap")`, checked after the kill switch and the central
  caps: the reader shows "budget reached" and the librarian says its budget is used up, as for any
  cap. `npm run usage` groups the spend by library too.

## AWS

Each change, who makes it, and the order:

1. **`RtfmApp`, the Web Function's role** (`infra/app-stack.ts`; the orchestrator deploys it on
   merge). The deny `LeaveThePasscodeToOps` becomes `LeaveAccessToOps`, denying `PutItem`,
   `UpdateItem`, `DeleteItem` and `BatchWriteItem` on `rtfm-app` when `dynamodb:LeadingKeys`
   includes `PASSCODE` or `LINK` (`ForAnyValue:StringEquals`), so the Web Function can read links
   and never make, change or reopen one. Its allow is unchanged: it already reads `LINK`
   (`GetItem`), writes the `ACTIVITY` and `L#…` partitions, and adds to the new `TOTAL` items in
   `rtfm-usage` (`UpdateItem`).
2. **`RtfmAccess`** (`infra/access-stack.ts`, and the partition names in `infra/rtfm.ts`, which it
   imports; the user approves and deploys it from CloudShell, `infra/README.md` › Updating a stack
   you deploy):
   - **`rtfm-ops`** gains the partition `LINK` in `rtfm-app`: `GetItem`, `Query`, `PutItem` and
     `UpdateItem`, with the same two `dynamodb:LeadingKeys` conditions as its other partitions. No
     `DeleteItem`: a revoked link's item stays.
   - **`rtfm-read`** gains, in `rtfm-app`, `GetItem` and `Query` on the partitions `LINK` and
     `ACTIVITY` (`ForAllValues:StringEquals` with both, and `Null` false), for `library list` and
     `show`; and `Query` on the partitions `L#*#LIBRARY` (`ForAllValues:StringLike`, and `Null`
     false), for `show`'s manuals. `StringLike` is case-sensitive, a recipient's other partitions
     are `L#<libraryId>#SEEDED` and `L#<libraryId>#MANUAL#<manualId>`, whose manual id is a
     lowercase slug, and the admin's is `LIBRARY`, with no `L#`: so the pattern matches only the
     recipients' manual lists, never a section, a body, a lease or an admin item. The link items
     hold digests, which open nothing (The secret and the cookie, above). It reads the `TOTAL`
     items in `rtfm-usage` already.
   - No new role, so `RtfmToolkit`'s boundary needs no update.
3. **Nothing else:** no change to the boundary, the edge stacks or the distribution. `/l` and
   `/admin` are page paths, never cached (`infra/README.md` › The stacks › its three behaviors),
   and the link's fragment never reaches CloudFront; `/api/link` is under `/api/*`, which passes
   cookies. `rtfm-local` already writes any item of `rtfm-usage`.

The order: LB.7 merges, so the orchestrator's deploy puts the deny in place; then the user deploys
`RtfmAccess`; and the ops commands (LB.10), the only way to make a link, merge after LB.7, the gate
(LB.8) and the link page (LB.9), so no link exists before the deny is in place and the app can open
it, count its use and cap its spend.

## This machine and the fake models

- **Loopback with no passcode** stays as it is: a request with no library cookie is the admin's
  library, with no gate, and `npm run dev` on `.data` shows the same library it shows now. A browser
  that opens a library link there leaves it through `/admin` (`DELETE /api/link`), since there is
  no passcode to enter.
- **The fake models** run every library the same way, at $0, so the library cap never refuses
  them; the data folder's `STOP` stops every library. The fake writer replays the Haunt's seed
  bodies in a recipient's Haunt, as in the admin's.
- **`npm run serve-temp`** is unchanged without `--library`; with it, it prints one link (above).
- **`npm test`** stays offline: the link registry has a files implementation and a DynamoDB one,
  held to one suite against DynamoDB Local, as `ManualStore` is (`ARCHITECTURE.md` › Everything
  runs on one machine).
- **No task here starts a Bedrock server**: every check runs on the fake models.

## Build tasks

In `WORKLIST.md`'s form, for the orchestrator to add under "A library per recipient". Each step
deploys safely: LB.2–LB.6 change nothing anyone sees (every request is still the admin's, and
every store and run defaults to the admin's library), LB.7 puts the deny in place, LB.8 can open a
library only once a link exists, and LB.10, which makes links, merges last.

### LB.2 — Keep each library's manuals apart
- **Status:** todo
- **Depends on:** —
- **Files:** `server/storage/**`, `server/logging/README.md`, `ARCHITECTURE.md`
- **Do:** bind `ManualStore` and `SectionLeases` to a library, as `research/libraries.md` ›
  Isolation describes: one function builds each key in `rtfm-app` (`L#<libraryId>#` before the
  partition key there is now, and no prefix for the admin's library, `admin`), and one each folder
  in the data folder (`libraries/<libraryId>/`, or the data folder itself for the admin's). The
  library is an argument of `createFileManualStore`, `createDynamoDbManualStore`,
  `createInProcessLeases` and `createDynamoDbSectionLeases` that defaults to the admin's, so their
  callers outside this task keep working unchanged; `seedStore` seeds whichever store it is given.
  No recipient library may take the id `admin`. The file store's `manual.cleanup-failed` line
  carries `libraryId`. Run `manual-store-suite.ts` against two libraries on one table and one
  folder, check the admin's library reads items stored with no prefix, and take one section id's
  lease in two libraries at once. Document the key scheme and the data folder in
  `server/storage/README.md`.
- **Done when:** the suite and the leases' tests show no library sees or changes another's items,
  the admin's library reads the existing items as they are, and `npm run build` and `npm test`
  pass.

### LB.3 — Key the runs by library
- **Status:** todo
- **Depends on:** LB.2
- **Files:** `server/writer/**`, `server/logging/README.md`
- **Do:** as `research/libraries.md` › How the server carries the library describes: one `Runs`
  for the server, its map keyed `<libraryId>/<manualId>/<sectionId>`, with `maxConcurrentRuns`
  counted across libraries. Each method takes a library scope (id, store, leases and writer) that
  defaults to the admin's, the one `createRuns` is given, so the routes keep working unchanged; a
  run reads, takes its lease, writes and saves through its own scope. The `section.*` lines carry
  `libraryId`. Extend the runs' shared suite (both kinds of leases) to two libraries.
- **Done when:** the runs' tests write the same section id in two libraries at once, each saved in
  its own library and counted toward the one limit, and `npm run build` and `npm test` pass.

### LB.4 — Carry the library through each request
- **Status:** todo
- **Depends on:** LB.3
- **Files:** `server/api/**`, `server/agent/**`, `server/app.ts` and its test, `server/testing.ts`,
  `server/replacement.test.ts`, `server/web-function.test.ts`, `scripts/shot.ts`,
  `scripts/serve-temp.ts`, `server/logging/README.md`, `server/README.md`, `ARCHITECTURE.md`
- **Do:** a `Library` per library id, built once per environment (its store, leases, writer, and
  the one shared gateway), as `research/libraries.md` › How the server carries the library
  describes. The Node adapter's gate puts the library on `ApiRequest.library`, and every route, the
  librarian, the planner and the previews take their store, runs scope and gateway from it. Add
  `libraryId` to `request`, `request.failed`, `librarian.reply`, `agent.tool-failed`,
  `client.error` and `client.limited`, `admin` for the admin's library. The gate gives every request
  the admin's library, so nothing anyone sees changes.
- **Done when:** the API's tests, run with two libraries put on requests directly, show neither
  reaches the other's manuals, sections, runs or librarian, the log lines carry `libraryId`, and
  `npm run build` and `npm test` pass.

### LB.5 — Cap each library's daily spend
- **Status:** todo
- **Depends on:** LB.4
- **Files:** `server/gateway/**`, `server/config.ts` and its test, `server/storage/types.ts`,
  `server/storage/file-ledger.ts` and its test, `server/app.ts` and its test, `server/usage.ts`,
  `README.md`, `server/README.md`, `server/logging/README.md`
- **Do:** as `research/libraries.md` › Spend describes: the gateway is bound to each `Library`
  (`server/gateway/gateway.ts`), and every reserve entry carries `libraryId` (an entry without one
  is the admin's); a recipient library's reservation also adds its worst case to its day's total
  (`TOTAL` / `LIBRARY#<libraryId>#<day>` in `rtfm-usage`, `<day>#<libraryId>` in the data folder's
  totals) within `caps.libraryDailyUsd`, $0.50, in the same atomic step, and its settle adds
  `usd − worst case` there; past it, `SpendingRefused("library-cap")`, after the kill switch and
  the central caps. The admin's calls have no library cap. `model.call` and `model.refused` carry
  `libraryId`, and `npm run usage` groups spend by library. Extend `spending-ledger-suite.ts` to the
  library cap on both ledgers, racing reservations included. Say the monthly exposure in
  `README.md` as that section does.
- **Done when:** the suite shows a library refused at its cap while another library and the admin
  still reserve, the central caps and kill switch refuse every library, and `npm run build` and
  `npm test` pass.

### LB.6 — Keep library links and activity
- **Status:** todo
- **Depends on:** —
- **Files:** `server/storage/**`, `server/gateway/sdk-boundary.test.ts`, `ARCHITECTURE.md`
- **Do:** the store of links and activity, as `research/libraries.md` › The key scheme and What is
  recorded, and where describe: a link by its secret's digest (create on `attribute_not_exists`,
  find, list, revoke, keeping the item), and a library's activity (first and last use, opens and
  the counters, each an `ADD` or an `if_not_exists`, and reading one or all), in `rtfm-app`'s
  `LINK` and `ACTIVITY` partitions and in `.data/links/` and `.data/activity/`, both held to one
  suite, the DynamoDB one against DynamoDB Local. A find that fails throws, never answering "no
  link". The secret's form, its making and its digest live here too. The server doesn't use it in
  this task. Document it in `server/storage/README.md`.
- **Done when:** the suite passes against both, no item or file holds a secret, and `npm run build`
  and `npm test` pass.

### LB.7 — Give library links their AWS reach
- **Status:** todo (its diff is the user's to approve: `infra/access-stack.ts` and `infra/rtfm.ts`
  are under `PROCESS.md` › Authority)
- **Depends on:** —
- **Files:** `infra/rtfm.ts`, `infra/app-stack.ts` and its test,
  `infra/access-stack.ts` and its test, `infra/README.md`, `server/storage/README.md`
- **Do:** as `research/libraries.md` › AWS describes: `LINK_PARTITION`, `ACTIVITY_PARTITION` and the
  recipients' manual-list pattern `L#*#LIBRARY` in `infra/rtfm.ts`; the Web Function's deny
  `LeaveThePasscodeToOps` becomes `LeaveAccessToOps`, on `PASSCODE` and `LINK`; `rtfm-ops` gains
  `GetItem`, `Query`, `PutItem` and `UpdateItem` on `LINK`; `rtfm-read` gains `GetItem` and `Query`
  on `LINK` and `ACTIVITY`, and `Query` on `L#*#LIBRARY` (`ForAllValues:StringLike`), each with
  `Null` false. The tests check, with the policy evaluator, that the Web Function can read `LINK`
  and write `ACTIVITY` and an `L#…` partition but never write `LINK` (a transaction's part
  included), that `rtfm-ops` reaches `LINK` and `rtfm-read` those partitions, and that neither
  reaches `LIBRARY`, `MANUAL#…`, `L#<libraryId>#MANUAL#…`, `L#<libraryId>#SEEDED` or any other item
  of `rtfm-app`. Give the full diff of `infra/rtfm.ts` and `infra/access-stack.ts` in the report.
  After the merge the user deploys `RtfmAccess` (`infra/README.md` › Updating a stack you deploy).
- **Done when:** the tests show each role's reach as above, `npm run cdk -- synth --quiet` writes
  the templates, `npm test` passes, and the user has approved the diff.

### LB.8 — Open a library by its link
- **Status:** todo
- **Depends on:** LB.4, LB.6
- **Merges after:** LB.5
- **Files:** `server/api/**`, `server/storage/**`, `server/config.ts` and its test,
  `server/app.ts` and its test, `server/web-function.test.ts`, `server/testing.ts`,
  `server/logging/**`, `scripts/serve-temp.ts`, `README.md`, `ARCHITECTURE.md`
- **Do:** as `research/libraries.md` › Access describes:
  - the gate, generalized, gives each request its library from an `rtfm_library` cookie (the
    secret, hashed, its link looked up; found links kept a minute, misses never; a failed lookup
    `500`), then the passcode's, then the admin's library without a gate; a revoked link gets
    `401 { error: "Link closed" }`;
  - `POST /api/link { secret }` seeds the library's starters (`starterManualIds` in
    `server/config.ts`: *The Haunt That Listens* and *Negotiating With Geese*, tables of contents
    only), one seeding at a time per library in the environment, records the use, and sets the
    cookie (a year) while clearing the passcode cookie, as two `Set-Cookie` headers;
    `DELETE /api/link` clears the library cookie, with or without a gate; `POST /api/passcode`
    clears it too;
  - every response to a request the library cookie opened renews the cookie;
  - count the activity in the gate and adapter (opens, `firstUsedAt`, `lastUsedAt`, `sectionsRead`,
    `librarianMessages`) and in a wrapper of the library's store and leases (`manualsCreated`,
    `sectionsWritten`), with seeding on the bare store; log `link.accepted`, `link.refused`,
    `library.seeded` and `library.activity-failed`;
  - give `npm run serve-temp` `--library <libraryId>`, which prints one link once;
  - say in `README.md`, as plainly as for the passcode, that the link is a bearer token, that a
    scanner that runs scripts opens it, and that `create` and `revoke` are the user's.
- **Done when:** tests open two libraries by their links on one server and in `web-function.test.ts`
  (DynamoDB Local), and show each sees only its own manuals, a new library starts with the two
  starters and no section written, a revoked link is refused within the minute, a failed lookup
  answers `500`, each counter counts as defined, the loopback path with no passcode is unchanged
  and `DELETE /api/link` leaves a library there, no log line or file holds the secret or its digest,
  and `npm run build` and `npm test` pass.

### LB.9 — Open a link in the browser
- **Status:** todo
- **Depends on:** LB.8
- **Files:** `src/App.tsx`, `src/link/**`, `src/passcode/**`, `src/reportErrors.ts` and its test,
  `DESIGN.md`, `README.md`, `scripts/shot.ts`, `scripts/screenshots.ts`, `ARCHITECTURE.md`
- **Do:** the page route `/l` reads the secret from the fragment as it loads, with no button, posts
  it to `/api/link`, and on `204` replaces the address with `/`; on `401` it shows the passcode
  screen with "This link is closed." above the form, as does any API request answered
  `401 { error: "Link closed" }`. The page route `/admin` calls `DELETE /api/link` and opens `/`.
  Design the link page and the closed line in `DESIGN.md`, add their shots to `npm run shot`, and
  name both routes in `README.md` › Where things live.
- **Done when:** component tests cover opening, a closed link, a closed library mid-visit and
  `/admin` from a library, the address keeps no secret after opening, `npm run shot` takes the new
  states, and `npm run build` and `npm test` pass.

### LB.10 — Make, list and revoke libraries with the ops tools
- **Status:** todo (its `CLAUDE.md` line is the user's to approve)
- **Depends on:** LB.2, LB.5, LB.6
- **Merges after:** LB.7, LB.8, LB.9
- **Files:** `scripts/ops/**`, `server/logging/log-reader.ts` and its test, `server/logs.ts`,
  `README.md`, `CLAUDE.md`
- **Do:** `npm run ops -- library create <libraryId> [--label <text>]`, `list`, `show <libraryId>`
  and `revoke <libraryId>`, as `research/libraries.md` › What `npm run ops` gains describes, under
  `README.md` › The ops tools' rules, with `--json`; `create` prints the link once on standard
  output and nowhere else, and keeps no secret; `show` lists the library's manuals with their titles
  and written sections, read as `rtfm-read`. `logs` and `npm run logs` gain `--library <libraryId>`.
  Add to `CLAUDE.md` › Shell that `library create` and `library revoke` are the user's, run in
  their own terminal outside the Claude app, and agents never run them, as for `passcode set`, and
  give its diff in the report. The tests run offline; no agent runs `create` or `revoke` against
  the deployed app.
- **Done when:** the ops tests (DynamoDB Local and the stand-in for the AWS CLI) cover each
  command's text and JSON, a refused id, a revoked library's activity and manuals, and that no
  output but `create`'s holds the link; `npm test` passes; and the user has approved the
  `CLAUDE.md` line.

## Sources

- RTFM at `main` `8d59dcb`: `README.md` (A passcode, The ops tools, The data folder and spending),
  `ARCHITECTURE.md`, `server/api/README.md`, `server/storage/README.md`,
  `server/gateway/README.md`, `server/writer/README.md`, `server/logging/README.md`,
  `infra/README.md`, `research/aws-design.md`; the code in `server/app.ts`, `server/config.ts`,
  `server/api/node-adapter.ts`, `server/api/passcode.ts`, `server/writer/runs.ts`,
  `server/storage/seed.ts`, `server/storage/types.ts`, `infra/access-stack.ts`,
  `infra/app-stack.ts` and `scripts/ops/ops.ts`; the seven manuals in `server/seed/`, counted from
  their `manual.json` files.
- The prices per section, plan and librarian call are `README.md` › The models' measurements.
- The 400-day limit on a cookie's life is from memory of RFC 6265bis (draft), which Chrome follows;
  it was not read again for this doc, and only sets how long a year-long cookie may be.
