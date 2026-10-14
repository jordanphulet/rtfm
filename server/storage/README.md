# server/storage

Where the server keeps the manuals, their written sections and the usage ledger. Narrow
interfaces in `server/storage/types.ts`, so the gateway only ever sees the ledger:

- **`ManualStore`** lists, gets, creates and deletes manuals, gets and saves section bodies, lists
  a manual's written section ids, and keeps the seeding record. It stores `StoredManual`: the
  `Manual` fields plus `voice`, with no statuses and no bodies. Two implementations keep the same
  rules (Manuals and sections, below): files in the data folder (`file-manual-store.ts`), which
  the server uses on this machine, and the DynamoDB table `rtfm-app`
  (`dynamodb-manual-store.ts`), which the Web Function uses (`server/README.md` › The Web
  Function). `config.manualStorage` chooses one.
- **`SectionLeases`** keeps one writer per section among the servers sharing a store (Section
  leases, below): in the process (`in-process-leases.ts`) beside the files, and on the section's
  item in `rtfm-app` beside the table. `config.manualStorage` chooses them with the store.
- **`UsageLedger`** appends an entry (into the file for its `reservedAt` month) and reads a
  month's entries (`"2026-10"`, UTC). It is files in the data folder, which the gateway's spending
  ledger for the fake models keeps its record in; Bedrock's spending is in the table `rtfm-usage`
  (`server/gateway/README.md` › The spending ledger).

## The data folder

The local files live in `.data/` (gitignored). Tests and the shot script pass a temp `dataDir`.

```
.data/manuals/<manualId>/manual.json         StoredManual
.data/manuals/<manualId>/sections/<id>.md    one file per written section
.data/seeded.json                            the ids of the seed manuals already seeded
.data/ledger/2026-10.jsonl                   the fake models' ledger: one JSON line per entry, append-only
.data/STOP                                   the fake models' kill switch (server/gateway/README.md)
.data/server.lock                            the PID of the server using the folder
.data/logs/2026-10-12.jsonl                  the server's log for one UTC day (server/logging/README.md)
```

## The data folder's lock

One server per data folder, enforced. `startServer` first calls `lockDataFolder`
(`storage/lock.ts`), which creates `server.lock` holding the process's PID with `createExclusively`
(`storage/files.ts`). That writes the PID to a temp file and `link`s it into place; `link` fails if
the lock exists, so of two starts only one wins, and the lock is never seen empty.

- **Held by a running process** (checked with `process.kill(pid, 0)`, where `EPERM` also means
  running): `startServer` throws `DataFolderInUse`, whose message names the folder and the PID.
  This includes a second start in the same process, as in the tests.
- **Left by a process that has ended, or holding no PID:** it is removed and the create is
  tried again, so the lock is taken over. Two starts that find the same stale lock at the same
  moment can both take it over: one removes the lock the other has just created.
- **A PID reused** by an unrelated process makes a stale lock look held; the message names the
  PID, and the lock file can be deleted once no server is using the folder.
- **Released** when `close()` has closed the server and the gateway is idle, and when
  `startServer` fails after taking it (a model not in the price table, a port in use). A process
  killed without a chance to close (SIGKILL, a crash) leaves its lock, which the next start
  takes over.

## Manuals and sections

Every `ManualStore` keeps these rules, and `manual-store-suite.ts` checks them against both
implementations:

- A manual is never replaced: `createManual` answers `"exists"` for an id another manual has
  taken, and of two creates of different manuals with one id only one wins. A create that finds
  the very manual it sends already stored (`isSameManual` in `manual.ts`) answers `"created"` and
  changes nothing, so a retried create, or a seed that another server has just created, still
  counts as its own.
- A body is saved once, and only while its manual exists: a second save answers
  `"already-written"`, of two simultaneous saves only one wins, and saving into a manual that
  doesn't exist throws, so a late write can't leave a deleted manual's section behind, even when
  a save and a delete race.
- Deleting a manual deletes its sections, and a manual made again under its id starts with none
  written. Deleting a manual that isn't there does nothing.
- An id that isn't a slug (`ID_PATTERN` in `manual.ts`) is no manual for `getManual`, and an error
  everywhere else.
- The seeding record remembers each id it is given, once.

## The files

- **Written sections:** a section is written when its `.md` file exists, so there is no status
  to keep in sync.
- **`createManual`** makes the manual's folder with a plain `mkdir`, which fails if the folder
  exists, so a manual is never replaced: an id another manual has taken gets `"exists"`, the very
  manual already stored gets `"created"`, and nothing changes. It then writes `manual.json`
  through a temp file and a `rename`; if that write fails, it removes the folder again, so the id
  isn't left taken by an empty folder. The seed and the planner both create manuals through it.
- **`saveBody`** creates the section's file with `createExclusively`, as the lock is created: a temp
  file, then a `link` into place. `link` fails if the file already exists, so a section can't be
  written twice (it answers `"already-written"`). It throws if the manual doesn't exist, rather
  than creating its folder, so a late write can't leave a deleted manual's sections behind.
- **`listManuals`** reads every folder in `manuals/` whose name is a slug and has a `manual.json`.
- **`deleteManual`** renames the manual's folder to `<manualId>.<uuid>.deleting`, which isn't a
  slug and so is never listed, then removes it; a missing manual is nothing to do. The manual
  disappears in that one step. If the removal fails part-way, the failure is logged and the delete
  still succeeds: the manual is already gone, and the leftover folder is ignored.
- **`markSeeded`** rewrites `seeded.json` through a temp file and a `rename`. Only one server uses
  a data folder (its lock), so two servers never seed it at once.

## The table `rtfm-app`

The Web Function keeps the manuals in the DynamoDB table `rtfm-app` (`RtfmApp`,
`infra/README.md`): on demand, with point-in-time recovery and deletion protection, and kept when
it leaves the stack. Every environment of the Web Function shares it. One table holds every kind
of item, told apart by its keys, two strings:

| Item | `pk` | `sk` | Other attributes |
| --- | --- | --- | --- |
| A manual | `LIBRARY` | `MANUAL#<manualId>` | `manual`: the `StoredManual`, as a map; `written`: the ids of its written sections, a string set, absent while none is |
| A written section | `MANUAL#<manualId>` | `SECTION#<sectionId>` | `body`: the Markdown |
| A section being written | `MANUAL#<manualId>` | `SECTION#<sectionId>` | `leaseOwner`: `<environment>/<run>`, two random UUIDs; `leaseExpiresAt`: epoch milliseconds (Section leases, below) |
| A seed manual already seeded | `SEEDED` | `MANUAL#<manualId>` | none |

Every manual is in the one partition `LIBRARY`, apart from the bodies, so listing the library
reads no body, and each manual's `written` set gives its written sections without reading them.
The table has no index. Every read is strongly consistent, so a write is seen at once, as with the
files. A body is under 10 KB and a manual's item a few KB, far below the 400 KB item limit.

- **`listManuals`** queries the partition `LIBRARY`, page by page, for the `manual` attribute.
- **`getManual`** and **`writtenSectionIds`** get the manual's item.
- **`createManual`** puts the manual's item on the condition `attribute_not_exists(pk)`. When the
  condition fails it reads the stored manual: if it is exactly the one being created, the SDK
  retried a create whose answer was lost, and it answers `"created"` (so a seed still saves its
  bodies); otherwise `"exists"`.
- **`saveBody`** is one `TransactWriteItems`: an `Update` of the manual's item that adds the
  section's id to `written`, on the condition that the item exists, and a `Put` of the section's
  item on the condition `attribute_not_exists(body)`, which replaces a lease the item may hold.
  Either both happen or neither: the first condition failing throws (no manual), the second
  answers `"already-written"`.
- **`getBody`** gets the section's item; one holding only a lease has no body.
- **`deleteManual`** reads the manual's `written` set and queries the manual's section items (its
  written sections, and any unwritten section's item holding only a lease), then deletes the
  manual's item and every section item in one transaction, on the condition that `written` is
  still exactly the set it read (`written = :written`, or `attribute_not_exists(written)` for
  none). A section saved in between, or a manual deleted and made again under the id with other
  sections, changes `written`; the condition fails, and it reads and tries again, up to 8 times.
  So it deletes exactly the sections the manual it deletes has, no section is ever left without
  its manual, and no lease is left behind to hold up a manual made again under the id. A lease
  taken after the query is released by its run, or expires. One transaction holds 100 items, so a
  manual with more than 99 section items can't be deleted; a planned manual has at most 32
  sections.
- **`seededManualIds`** queries the partition `SEEDED`; **`markSeeded`** puts its item.
- **Transactions that collide.** Two transactions on one item at once can cancel one of them with
  `TransactionConflict`, as two saves into one manual do, since both update its item. The SDK
  doesn't retry a cancelled transaction, so the store does, up to 8 attempts in all, after a
  random pause of up to 20ms times the attempt's number; then it throws the cancellation.
  DynamoDB Local never answers `TransactionConflict`, so these retries are tested against a
  stand-in on loopback.
- **What the Web Function's role may do** on the table is exactly what the store and the leases
  do: `GetItem`, `Query`, `PutItem`, `UpdateItem` and `DeleteItem`, which also cover the
  transactions' parts (`infra/app-stack.ts`).

The client (`createDynamoDbManualStore(table)`) takes everything from the `DynamoDbTable` it is
given: the table's name, region, endpoint and credentials. The credentials are fixed keys
(DynamoDB Local's, in the tests; a role's temporary keys with their session token, for the ops
tools in `scripts/ops/`), or the Web Function's execution role: a provider on Lambda's
container credentials endpoint (`fromHttp`, given its URI and token, with the environment's
relative URI and token file set aside) or on the environment's key variables (`fromEnv`, which
reads them at call time and honours `AWS_CREDENTIAL_EXPIRATION`). The client holds what a provider
gives and asks again once it is within five minutes of expiring. The endpoint then hands out new
credentials; the environment can't change under a running process, so its keys are never
renewed.

Every setting the AWS SDK would otherwise look up in the environment or in `~/.aws` (credentials,
region, endpoint, retries, defaults mode, user agent app id, dual-stack and FIPS endpoints,
endpoint discovery, account-id endpoints) is set, and its default credential chain throws, so the
environment and profiles never apply; only the execution role's provider, which `web-function.ts`
alone asks for, reads the environment. `dynamodb-manual-store.test.ts` checks this against decoys
in the environment and in config and credentials files, and each source of the role's
credentials against a stand-in. It refuses fixed keys that are empty. Who gives it which
credentials is `server/README.md` › The Web Function.

**Room for what comes next.** Each kind of item has its own partition key, so later items fit
beside these: the passcode's digest as one item of the partition `PASSCODE` (`PASSCODE_PARTITION`
in `infra/rtfm.ts`), the one partition of `rtfm-app` that `rtfm-ops` may read and write, limited
to it with `dynamodb:LeadingKeys` (`infra/README.md` › The identities).

**Changing the stored form.** The table is deployed data: a change to these items carries its
migration, or reads the old form too (`ARCHITECTURE.md` › Everything runs on one machine).

## Section leases

A section is written by one run at a time, wherever it runs (`server/writer/README.md` › One
writer per section). Within a process the runs' map sees to that; across the processes sharing a
store, the run takes the section's lease first. `SectionLeases.take` gives a `SectionLease`, or
nothing while another writer holds the section or its body is stored. A lease is renewed until it
is released or its body saved; it has a `lost` signal, which aborts once the holder may no longer
write (the lease is gone from storage, or it couldn't be renewed and is about to expire, before
another writer can take it: The holder fences itself, below); and only it may save the body (`SectionLease.saveBody`, which answers as
`ManualStore.saveBody` does, and throws once the lease is lost). `SectionLeases.heldElsewhere`
names a manual's sections whose lease another environment holds, so the manual's statuses and its
delete see sections being written elsewhere (`server/api/README.md` › Handlers).

- **In the process** (`in-process-leases.ts`), with the files: every take is granted, the lease
  saves through the store, and no section is held elsewhere. One server uses a data folder (its
  lock), and the runs' map already keeps one writer per section in it, so the server works exactly
  as it would without leases.
- **In `rtfm-app`** (`createDynamoDbSectionLeases` in `dynamodb-manual-store.ts`), with the table,
  on the section's own item (The table `rtfm-app`, above). Each environment has its own random id,
  and each take its own, so an owner names both the environment and the run.
  - **Taking** is an `UpdateItem` that sets `leaseOwner` and `leaseExpiresAt`, creating the item if
    there is none, on the condition that the item has no body and holds no lease, or an expired
    one (or one of this owner's, for a take the SDK retried). It doesn't check that the manual
    exists: the run's save does that, and a lease item left by a manual deleted in between is
    released by its run, or expires, and is deleted with any manual made again under the id.
  - **Renewing** sets `leaseExpiresAt` again every `renewEveryMs`, to the lease's length past when
    the renewal was sent, on the condition that the item still holds this owner's lease and no
    body, and that the new expiry is later than the stored one. The SDK resends a renewal's expiry
    as it was first sent, so without that last part a retry of an old renewal arriving after a
    newer one would move the expiry back.
    When the condition fails, the renewal asks for the item as it was
    (`ReturnValuesOnConditionCheckFailure: "ALL_OLD"`). If it still holds this owner's lease and no
    body, the renewal was a stale retry, and nothing changes. Otherwise the lease is gone (another
    writer took it, its manual was deleted, or the seed saved its body), so it stops renewing and
    aborts `lost`. Any other failure (the network, throttling, a timeout) is tried again at the
    next renewal.
  - **The holder fences itself.** It counts the lease lost, stops renewing and aborts `lost`, once
    nine tenths of the lease's length have passed since it sent the latest take or renewal that
    succeeded, with no later one succeeding (`FENCE_AT`). The stored expiry is the lease's length
    after the send of the renewal that set it, and never moves back, so the holder has stopped
    before any other writer can take the lease, and two runs never write, nor pay for, one section
    at once. Once `lost` has aborted, the lease's `saveBody` throws without trying.
  - **Saving** is `saveBody`'s transaction with the `Put` conditioned on `leaseOwner = :owner` as
    well, so a writer that has lost its lease can never store a body, and two environments never
    both write a section. The body replaces the lease. If the condition fails with a body stored,
    one saved without a lease (the seed's), it answers `"already-written"`; otherwise it throws.
  - **Releasing** deletes the item on the condition that it holds this owner's lease and no body,
    so a body, or another writer's lease, is never deleted.
  - **Held elsewhere** is one `Query` of the manual's partition (`pk = MANUAL#<manualId>`), page by
    page, for the items whose `leaseExpiresAt` is not yet past by this environment's clock (live,
    as a take would read it) and whose `leaseOwner` doesn't start with this environment's id. Its
    own runs are in its runs' map already. A written section's item holds no lease, so it is
    never named. DynamoDB filters after reading, so the query costs a read unit per 4 KB of the
    partition, bodies included: the sample manual, all 18 sections written, about 18 units, a
    fraction of a cent a month at RTFM's scale.
- **How long, and why.** A lease lasts 20 seconds and its holder renews it every 5
  (`SECTION_LEASE_TIMING`):
  - Renewal runs on a timer, not on the writer's chunks, so a silence in the model's stream, as
    long as the 30-second stall timeout allows (planning a manual has gone quiet for 26 seconds),
    never costs the lease. A section with Claude streams for 12–15 seconds, so it is renewed two
    or three times.
  - The holder fences itself 18 seconds after sending its latest successful renewal, so only
    after the next three renewals in a row fail (5, 10 and 15 seconds after it), each with the
    client's own retries. A renewal that hangs (the client's 10-second request timeout)
    doesn't hold up the next one.
  - A crashed environment's lease, or one that couldn't release it (Lambda gives `SIGTERM` 1
    second), frees the section at most 20 seconds after its last renewal, and a waiting reader
    takes it over within a second of that.
  - Expiry compares the taker's clock with the holder's. Lambda's clocks agree to well within a
    second, so the 2 seconds between the holder's fence and the expiry cover that difference and a
    fence timer that fires a little late.
  - Each renewal is one write, a few per section, and each look a waiting reader takes is a
    conditional write and a read, once a second: fractions of a cent a month at RTFM's scale.

The lease attributes are new, and items stored before them all hold a body, which the conditions
read as written, so the stored data needs no migration.

`dynamodb-section-leases.test.ts` checks the DynamoDB leases against DynamoDB Local, waiting out
leases of one and a half to two seconds, for headroom when test runs go side by side: one of two
simultaneous takes wins, a written section gives none, renewal keeps a lease past twice its
length, an unrenewed lease fences its holder and expires, and only its new holder can save, a
holder whose item is deleted hears its lease is lost, a release frees it at once and leaves a body
alone, a body saved without a lease wins, another environment's leases are named as held
elsewhere until they expire while a written section and an environment's own lease never are, and
deleting a manual deletes its lease-only items.
`dynamodb-manual-store.test.ts` checks the renewals against a stand-in: with every renewal
throttled the lease is lost no sooner than nine tenths of its length after the take; a renewal
that succeeds after failures keeps it; a renewal only moves the expiry later; a refused renewal
that finds this owner's lease with a later expiry (a stale retry) changes nothing; and one that
finds another owner's lease loses it, after which `saveBody` throws. The runs' shared suite runs
both kinds of leases (`server/writer/README.md` › Tests).

## DynamoDB Local, for the tests

The DynamoDB store's tests, and the Web Function's, run against DynamoDB Local on loopback, so
`npm test` needs no network or AWS account:

- **Fetching it once.** `npm run fetch-dynamodb-local` (`scripts/fetch-dynamodb-local.ts`) downloads
  one pinned release, AWS's archive of 2026-07-31 (DynamoDB Local 3.3.1), checks its SHA-256, and
  unpacks it into `.dynamodb-local/2026-07-31/` at the main checkout's root (gitignored), so every
  worktree shares one copy. It is the one script that reaches the network, and it does nothing
  when the folder is there. DynamoDB Local needs Java 17 or newer on the `PATH`.
- **Running it.** Vitest's global setup (`scripts/test-global-setup.ts`) starts it once for the
  whole run, in memory, on a free port, and stops it after. `scripts/DynamoDbLocalOnLoopback.java`
  starts it listening on `127.0.0.1` only, since its own launcher listens on every interface, and
  exits when its standard input closes, so it never outlives the run. Its telemetry is off
  (`-disableTelemetry` and `DDB_LOCAL_TELEMETRY=0`), so it sends nothing and writes no
  `dynamodb-local-metadata.json`.
- **Each test its own table.** `testAppTable()` (`dynamodb-testing.ts`) creates a new table shaped
  as `rtfm-app` (`createAppTable`) with fixed dummy keys.
- **Without it,** every test that needs it fails with the reason, which says to run
  `npm run fetch-dynamodb-local` when it isn't there; nothing is skipped.

## A ledger line cut off by a crash

A crash mid-append can leave a last line with no newline.

- Reading skips any line that doesn't parse, wherever it is, and logs a `ledger.line-skipped`
  warning naming the file and line (on standard error for `npm run usage`), so neither the
  gateway's replay nor `npm run usage` throws on it.
- Skipping is safe for the caps. A `reserve` is awaited before the model is called, so a cut-off
  `reserve` means no call was made. A cut-off `settle` leaves its `reserve` unsettled, counted at
  its worst case.
- `append` writes a newline first when the file doesn't end in one, so the next entry starts its
  own line.

## Seeding

On start, `seedStore` seeds each manual in `server/seed/` once. The store keeps a record of the seed
manuals it has seeded (`seededManualIds`), and for each seed manual not in it:

- if the store has no manual with that id, it puts the TOC, then saves the bodies of the
  sections the seed marks written (the sample's 7 of 18; none for the others). If another server
  seeding the same table at the same moment created it first, `createManual` finds that very
  manual and answers `"created"`, and each body it saves again answers `"already-written"`; if it
  answers `"exists"`, a different manual has the id, and this one leaves it;
- if the store already has a manual with that id, it leaves it exactly as it is, written
  sections included;
- either way, it then records the id.

So a seed manual added to `server/seed/` is seeded on the next start, and a deleted seed
manual stays in the record and is never seeded again. Two environments of the Web Function that
start together each seed through the conditional create, so each manual is seeded once and
neither fails (`seed.test.ts`). One that read the record just before the other recorded a
manual, and then found it deleted in the moment before its own create, would seed it again;
only a delete in the fraction of a second while both start could do that. A crash after the TOC
is put but before every seed body is saved leaves that manual with fewer sections written; they
are written on demand like any other. Resetting the manuals to the seed is in `README.md`; never
delete `.data/ledger/`, because the caps are computed from it.

## Files

- `types.ts`: `ManualStore`, `SectionLeases`, `UsageLedger`.
- `file-manual-store.ts`: manuals and sections as files.
- `in-process-leases.ts`: section leases for a server alone on its store.
- `dynamodb-manual-store.ts`: manuals, sections and section leases in a table shaped as
  `rtfm-app`, and `createAppTable` for DynamoDB Local. The one file here that imports the AWS SDK.
  Its client builder (`documentClient`) and transaction pause (`pause`) also serve the gateway's
  table `rtfm-usage`.
- `manual-store-suite.ts`: the tests every `ManualStore` passes.
- `dynamodb-testing.ts`: the tests' tables in DynamoDB Local.
- `file-ledger.ts`: the usage ledger as JSON lines.
- `files.ts`: reads a file or folder that may not exist; creates a file only if it doesn't exist.
- `lock.ts`: the data folder's lock: one server per folder.
- `manual.ts`: a manual's chapters and sections in reading order; the id pattern.
- `seed.ts`: seeds each manual in `server/seed/` once.
