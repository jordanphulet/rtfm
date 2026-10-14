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
- **`LinkStore`** keeps the recipient libraries' links, each under its secret's digest, and each
  library's activity (Library links and activity, below): files in the data folder
  (`file-link-store.ts`) and the table `rtfm-app` (`dynamodb-link-store.ts`), held to one suite.
- **`UsageLedger`** appends an entry (into the file for its `reservedAt` month) and reads a
  month's entries (`"2026-10"`, UTC). It is files in the data folder, which the gateway's spending
  ledger for the fake models keeps its record in; Bedrock's spending is in the table `rtfm-usage`
  (`server/gateway/README.md` › The spending ledger).

Each `ManualStore` and `SectionLeases` is bound to one library (Libraries, below), the admin's
unless its maker names another.

## Libraries

Each library's manuals, sections, leases and seeding record are kept apart from every other's, in
the same table or data folder. `library.ts` holds the scheme, and every key and path the stores
and leases use goes through it:

- **A library id** is `admin` (`ADMIN_LIBRARY_ID`), the admin's library, or a recipient's: a slug
  (`ID_PATTERN`) of at most 63 characters, so it holds no `#` or `/`, and never `admin`
  (`checkedRecipientLibraryId`). Any other id throws `Not a recipient library's id`, without the id
  in the message, so a secret passed in its place never reaches a log.
- **In `rtfm-app`**, `libraryPartition` puts `L#<libraryId>#` before each partition key (The
  table `rtfm-app`, below): a recipient's manuals are in `L#<libraryId>#LIBRARY`, a manual's
  sections in `L#<libraryId>#MANUAL#<manualId>`, its seeding record in `L#<libraryId>#SEEDED`. The
  sort keys don't change. The admin's library has no prefix, so it reads the items already stored
  at the unprefixed keys as they are, with nothing moved or migrated. No other partition starts `L#`, and a slug can't hold the `#` that ends the prefix, so no library's
  key is ever another's.
- **In the data folder**, `libraryFolder` gives the folder a library's files are in:
  `libraries/<libraryId>/`, with the layout the data folder itself has for the admin's
  (The data folder, below).
- **The makers** take the library as their last argument, which defaults to the admin's:
  `createFileManualStore(dataDir, logger, libraryId)`, `createDynamoDbManualStore(table,
  libraryId)` and `createDynamoDbSectionLeases(table, timing, libraryId)`. `createInProcessLeases`
  is bound to the library of the store it is given, through which it saves and reads.
- **Leases come along.** A section's lease is on its item, in its library's partition, so two
  libraries can each write a section of one manual id at once, and a lease in one library never
  holds up a take, a delete or the statuses in another.
- `manual-store-suite.ts` runs every rule in the admin's library and in a recipient's, on one
  table or data folder beside another library holding manuals of the same ids, which each test
  checks it left unchanged; then that the same manual id lives apart in two libraries, with its
  own sections, deletes and seeding record. The DynamoDB store's tests check the keys every call
  sends: the admin's with no prefix, a recipient's under `L#<libraryId>#`. The DynamoDB leases'
  tests take one section id's lease in two libraries at once.

## The data folder

The local files live in `.data/` (gitignored). Tests and the shot script pass a temp `dataDir`.

```
.data/manuals/<manualId>/manual.json         the admin's library: StoredManual
.data/manuals/<manualId>/sections/<id>.md    one file per written section
.data/seeded.json                            the ids of the seed manuals already seeded
.data/libraries/<libraryId>/manuals/…        a recipient's library: the same layout under its folder
.data/libraries/<libraryId>/seeded.json      its seeding record
.data/links/<digest>.json                    a recipient library's link: libraryId, label, createdAt, revokedAt
.data/activity/<libraryId>.json              a recipient library's activity
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
- Deleting a manual deletes its sections and answers `"deleted"`, and a manual made again under
  its id starts with none written. Deleting a manual that isn't there does nothing and answers
  `"deleted"` too. Only the table, which keeps leases on the section items, can answer
  `"writing"` (The table `rtfm-app`, below).
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
| The passcode | `PASSCODE` | `PASSCODE` | `digest`: the passcode's SHA-256 digest, 64 lowercase hex characters (`server/api/README.md` › The passcode) |
| A recipient library's link | `LINK` | the link's secret's digest | `libraryId`; `label`, if any; `createdAt`; `revokedAt`, once revoked (Library links and activity, below) |
| A recipient library's activity | `ACTIVITY` | `<libraryId>` | `firstUsedAt`, `lastUsedAt`; the counts, numbers; each absent until first set |

These are the admin's library's keys. A recipient's library has the same items with
`L#<libraryId>#` before each `pk` (Libraries, above); the passcode, the links and the activity
belong to no library.

Every manual of a library is in one partition, its `LIBRARY`, apart from the bodies, so listing
the library reads no body, and each manual's `written` set gives its written sections without
reading them.
The table has no index. Every read is strongly consistent, so a write is seen at once, as with the
files. A body is under 10 KB and a manual's item a few KB, far below the 400 KB item limit.

- **`listManuals`** queries the library's partition `LIBRARY`, page by page, for the `manual` attribute.
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
  none), and that no section item holds a live lease: each section item's `Delete` is
  conditioned on `attribute_not_exists(sk) OR attribute_exists(body) OR leaseExpiresAt < :now`,
  by this environment's clock, as a take reads expiry (the item may be gone already, its lease
  released, or saved over by a body).
  - A section item's condition failing means a section is being written: it answers `"writing"`,
    with nothing changed, and doesn't try again (the delete route answers `409`).
  - Otherwise `written` changed: a section saved in between, or a manual deleted and made again
    under the id with other sections. It reads and tries again, up to 8 times.
  - So it deletes exactly the sections the manual it deletes has, no section is ever left without
    its manual, no writer's live lease is deleted from under it, and no expired lease is left
    behind to hold up a manual made again under the id. A lease taken after the query isn't in
    the transaction: its run's save fails, since the manual is gone, and the lease is released
    by its run, or expires.
  - One transaction holds 100 items, so a manual with more than 99 section items can't be
    deleted; a planned manual has at most 32 sections.
- **`seededManualIds`** queries the library's partition `SEEDED`; **`markSeeded`** puts its item.
- **`listManualsWithWritten(table, libraryId)`** queries the library's partition `LIBRARY` for each
  manual and its `written` set, and nothing else: `npm run ops -- library show` reads a recipient's
  manuals with it, as `rtfm-read`, whose reach in `rtfm-app` is that `Query` on
  `L#<libraryId>#LIBRARY` (`infra/README.md` › The identities). It isn't part of `ManualStore`.
- **`readPasscodeDigest(table)`** gets the passcode's item (`PASSCODE_KEY`), strongly consistent,
  and gives its digest, or undefined when there is no item; **`writePasscodeDigest(table,
  digest)`** puts it, replacing the one before. Both hold the digest to its form,
  `PASSCODE_DIGEST_PATTERN` (64 lowercase hex characters): a write refuses anything else, and a
  read of an item holding anything else throws, naming the form. They aren't part of
  `ManualStore`: the Web Function's passcode gate reads the digest (`server/app.ts`), and
  `npm run ops -- passcode` reads and writes it as `rtfm-ops` (`README.md` › The ops tools). Its
  partition, `PASSCODE` (`PASSCODE_PARTITION` in `infra/rtfm.ts`), is one of the two partitions
  of `rtfm-app` that `rtfm-ops` may read and write, with `LINK`, the libraries' links, limited to
  them with `dynamodb:LeadingKeys` (`infra/README.md` › The identities). The item never holds the
  passcode itself.
- **Transactions that collide.** Two transactions on one item at once can cancel one of them with
  `TransactionConflict`, as two saves into one manual do, since both update its item. The SDK
  doesn't retry a cancelled transaction, so the store does, up to 8 attempts in all, after a
  random pause of up to 20ms times the attempt's number; then it throws the cancellation.
  DynamoDB Local never answers `TransactionConflict`, so these retries are tested against a
  stand-in on loopback.
- **What the Web Function's role may do** on the table is exactly what the store and the leases
  do: `GetItem`, `Query`, `PutItem`, `UpdateItem` and `DeleteItem`, which also cover the
  transactions' parts and the read of the passcode's digest (`infra/app-stack.ts`). They cover
  every item of the table, but a deny keeps the role from writing any item of the passcode's
  partition, `PASSCODE`, or of the libraries' links, `LINK`: it reads them and never writes them
  (`infra/README.md` › The Web Function's role, the passcode and the links). It writes every other
  partition, a recipient library's `L#<libraryId>#…` and the libraries' activity, `ACTIVITY`,
  among them.
- **What `rtfm-ops` and `rtfm-read` may reach** of the table is limited by partition: `rtfm-ops`
  reads and writes the passcode's and the links', and `rtfm-read` reads the links', the
  activity's, and the recipients' manual lists, `L#<libraryId>#LIBRARY`, with `Query` alone
  (`infra/README.md` › The identities). Neither reads a section, the admin's library or a seeding
  record.

The client (`createDynamoDbManualStore(table)`) takes everything from the `DynamoDbTable` it is
given: the table's name, region, endpoint and credentials. The credentials are fixed keys
(DynamoDB Local's, in the tests; a role's temporary keys with their session token, for the ops
tools in `scripts/ops/`), or the Web Function's execution role: a provider on Lambda's
container credentials endpoint (`fromHttp`, given its URI and token, with the environment's
relative URI and token file set aside) or on the environment's key variables (`fromEnv`, which
reads them at call time and honours `AWS_CREDENTIAL_EXPIRATION`), which `executionRoleProvider`
builds, for the Bedrock client too (`server/gateway/README.md` › The Bedrock client). The types
are `AwsCredentials` and, for the role alone, `ExecutionRoleCredentials`. The client holds what a
provider gives and asks again once it is within five minutes of expiring. The endpoint then hands
out new credentials; the environment can't change under a running process, so its keys are never
renewed. When the table names an `onKeysRefused`, the client calls it with the error of each call
DynamoDB refuses for its keys (`ExpiredTokenException` or `UnrecognizedClientException`), once
the SDK's retries are done, even where the caller goes on quietly, as a lease renewal does; only
`web-function.ts` gives one, to have Lambda replace its environment.

Every setting the AWS SDK would otherwise look up in the environment or in `~/.aws` (credentials,
region, endpoint, retries, defaults mode, user agent app id, dual-stack and FIPS endpoints,
endpoint discovery, account-id endpoints) is set, and its default credential chain throws, so the
environment and profiles never apply; only the execution role's provider, which `web-function.ts`
alone asks for, reads the environment. `dynamodb-manual-store.test.ts` checks this against decoys
in the environment and in config and credentials files, and each source of the role's
credentials against a stand-in. It refuses fixed keys that are empty. Who gives it which
credentials is `server/README.md` › The Web Function.

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
delete see sections being written elsewhere, and `SectionLeases.readSection` gives one section's
body and whether another environment holds its lease, for the section's status
(`server/api/README.md` › Handlers).

- **In the process** (`in-process-leases.ts`), with the files: every take is granted, the lease
  saves through the store, no section is held elsewhere, and `readSection` is the store's
  `getBody`. One server uses a data folder (its lock), and the runs' map already keeps one writer
  per section in it, so the server works exactly as it would without leases.
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
    writer took it, its manual was deleted once the lease had expired by the deleting
    environment's clock, or the seed saved its body), so it stops renewing and
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
  - **Held elsewhere** is one `Query` of the manual's partition (`pk = MANUAL#<manualId>`, in the
    leases' library), page by page, for the items whose `leaseExpiresAt` is not yet past by this environment's clock (live,
    as a take would read it) and whose `leaseOwner` doesn't start with this environment's id. Its
    own runs are in its runs' map already. A written section's item holds no lease, so it is
    never named. DynamoDB filters after reading, so the query costs a read unit per 4 KB of the
    partition, bodies included: the sample manual, all 18 sections written, about 18 units, a
    fraction of a cent a month at RTFM's scale.
  - **Reading a section** (`readSection`) is one strongly consistent `GetItem` of the section's
    item: its body, if any, and whether it holds a lease that is live by this environment's clock
    and whose `leaseOwner` doesn't start with this environment's id, by the same rules as held
    elsewhere.
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
holder whose item no longer holds its lease hears it is lost, a release frees it at once and
leaves a body alone, a body saved without a lease wins, another environment's leases are named as
held elsewhere until they expire while a written section and an environment's own lease never
are, reading a section gives its body and whether another environment's live lease is on it,
deleting a manual deletes its items that hold an expired lease, and a live lease refuses the
delete, changing nothing.
`dynamodb-manual-store.test.ts` checks the renewals against a stand-in: with every renewal
throttled the lease is lost no sooner than nine tenths of its length after the take; a renewal
that succeeds after failures keeps it; a renewal only moves the expiry later; a refused renewal
that finds this owner's lease with a later expiry (a stale retry) changes nothing; one that finds
another owner's lease loses it, after which `saveBody` throws; and one that finds its item gone
loses it too. It also checks that a delete cancelled by a section's condition answers `"writing"`
without trying again, even when `written` changed too. The runs' shared suite runs both kinds of
leases (`server/writer/README.md` › Tests).

## Library links and activity

A recipient's library is opened by a secret link, and its activity is counted
(`research/libraries.md`). `LinkStore` (`library-links.ts`) keeps both; `link-store-suite.ts`
checks these rules against the files and the table, the table's on DynamoDB Local:

- **The secret** is 16 bytes from `randomBytes`, as base64url: 22 characters, 128 bits
  (`makeLibrarySecret`, `LIBRARY_SECRET_PATTERN`). `librarySecretDigest` gives its SHA-256 in
  lowercase hex, and refuses anything not of the secret's form, without repeating it.
- **Only the digest is kept.** Every link is created and found by its digest
  (`LINK_DIGEST_PATTERN`), and anything else, a secret included, throws, so no item or file holds a
  secret.
- **Every library here is a recipient's:** its id is a slug of at most 63 characters and never
  `admin`, the admin's library, which has no link and no activity (`checkedRecipientLibraryId` in
  `library.ts`). Any other id throws, without the id in the message, so a secret passed in its
  place never reaches a log.
- **A link** holds its `libraryId`, the user's `label` if any, `createdAt` and, once revoked,
  `revokedAt`, as ISO strings the caller gives. `createLink` never replaces one: a digest another
  link has taken answers `"exists"`, and the very link already stored, unrevoked, answers
  `"created"`, changing nothing, so a retried create still counts as its own. `findLink` answers
  undefined only when there is no link; a read that fails throws, never counting as no link.
  `revokeLink` sets `revokedAt` on every open link naming the library, keeping the items, and
  answers `"revoked"`, `"already-revoked"` (keeping the first time) or `"no-link"`; of two at once,
  one revokes.
- **A library's activity** is `firstUsedAt`, `lastUsedAt`, `opens`, `sectionsRead`,
  `librarianMessages`, `manualsCreated` and `sectionsWritten`. `recordOpen` adds an open and keeps
  the first one's time; `recordLastUse` moves `lastUsedAt` forward, never back; `count` adds one to
  a counter. Counts made at once are never lost. `getActivity` gives a library never used all
  zeros, and `listActivity` every library used.

In `rtfm-app`, links are in the partition `LINK` and activity in `ACTIVITY`, which belong to no
library (The table `rtfm-app`, above):

- **`createLink`** puts the link's item on `attribute_not_exists(pk)`, and when that fails reads
  the stored link back, as `createManual` does.
- **`findLink`** is one strongly consistent `GetItem`; **`listLinks`** queries `LINK`.
- **`revokeLink`** queries `LINK` for the library's links, then sets `revokedAt` on each on the
  condition `attribute_exists(pk) AND attribute_not_exists(revokedAt)`.
- **The activity** is one `UpdateItem` each, which creates the item if there is none:
  `SET firstUsedAt = if_not_exists(firstUsedAt, :at) ADD opens :one`, `ADD <counter> :one`, or
  `SET lastUsedAt = :at` on the condition `attribute_not_exists(lastUsedAt) OR lastUsedAt < :at`,
  whose failure means a later use is kept already. So environments counting at once never lose a
  count; the SDK retrying a write whose answer was lost can count it twice.
- **`getActivity`** is one strongly consistent `GetItem`; **`listActivity`** queries `ACTIVITY`.

In the data folder, links are in `links/<digest>.json` and activity in `activity/<libraryId>.json`
(The data folder, above):

- **`createLink`** creates the link's file with `createExclusively`, so of two creates only one
  wins.
- **`revokeLink`** and each change to a library's activity read the file and write it again
  through a temp file and a `rename` (`writeAtomically`), one at a time in the process. One server
  uses a data folder (its lock), so no count is lost.
- **Listing** reads the `<digest>.json` or `<libraryId>.json` files, leaving temp files out.

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

On start, `seedStore` seeds each manual in `server/seed/` once into the store it is given, in that
store's library. The store keeps a record of the seed manuals it has seeded (`seededManualIds`),
and for each seed manual not in it:

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
- `library.ts`: the admin's library id, the check of a recipient's, and a library's partition keys
  and folder.
- `dynamodb-manual-store.ts`: manuals, sections, section leases and the passcode's digest in a
  table shaped as `rtfm-app`, and `createAppTable` for DynamoDB Local. One of the two files here
  that import the AWS SDK, with `dynamodb-link-store.ts`, which uses its client builder
  (`documentClient`) and partition query (`queryPartition`). The builder and its transaction retry
  loop (`transactWrite`) also serve the gateway's table `rtfm-usage`.
- `manual-store-suite.ts`: the tests every `ManualStore` passes.
- `library-links.ts`: `LinkStore`, a link and a library's activity, and the secret's form, its
  making and its digest.
- `file-link-store.ts`: links and activity as files.
- `dynamodb-link-store.ts`: links and activity in a table shaped as `rtfm-app`.
- `link-store-suite.ts`: the tests every `LinkStore` passes.
- `dynamodb-testing.ts`: the tests' tables in DynamoDB Local, and a stand-in in front of one that
  refuses the keys when told to (`keyRefusingDynamoDb`).
- `file-ledger.ts`: the usage ledger as JSON lines.
- `files.ts`: reads a file or folder that may not exist; creates a file only if it doesn't exist;
  replaces a file's content through a temp file and a `rename`.
- `lock.ts`: the data folder's lock: one server per folder.
- `manual.ts`: a manual's chapters and sections in reading order; the id pattern.
- `seed.ts`: seeds each manual in `server/seed/` once.
