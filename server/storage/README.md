# server/storage

Where the server keeps the manuals, their written sections and the usage ledger: files in the data
folder. Two narrow interfaces in `server/storage/types.ts`, so the gateway only ever sees the
ledger:

- **`ManualStore`** lists, gets, creates and deletes manuals, gets and saves section bodies, lists
  a manual's written section ids, and keeps the seeding record. It stores `StoredManual`: the
  `Manual` fields plus `voice`, with no statuses and no bodies.
- **`UsageLedger`** appends an entry (into the file for its `reservedAt` month) and reads a
  month's entries (`"2026-10"`, UTC).

## The data folder

The local files live in `.data/` (gitignored). Tests and the shot script pass a temp `dataDir`.

```
.data/manuals/<manualId>/manual.json         StoredManual
.data/manuals/<manualId>/sections/<id>.md    one file per written section
.data/seeded.json                            the ids of the seed manuals already seeded
.data/ledger/2026-10.jsonl                   one JSON line per ledger entry, append-only
.data/STOP                                   the kill switch (server/gateway/README.md)
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

- **Written sections:** a section is written when its `.md` file exists, so there is no status
  to keep in sync.
- **`createManual`** makes the manual's folder with a plain `mkdir`, which fails if the folder
  exists, so a manual is never replaced: an id that is taken gets `"exists"` and nothing changes.
  It then writes `manual.json` through a temp file and a `rename`; if that write fails, it removes
  the folder again, so the id isn't left taken by an empty folder. The seed and the planner both
  create manuals through it, and seeding throws if a seed manual's id turns out to be taken.
- **`saveBody`** creates the section's file with `createExclusively`, as the lock is created: a temp
  file, then a `link` into place. `link` fails if the file already exists, so a section can't be
  written twice (it answers `"already-written"`). It throws if the manual doesn't exist, rather
  than creating its folder, so a late write can't leave a deleted manual's sections behind.
- **`listManuals`** reads every folder in `manuals/` whose name is a slug and has a `manual.json`.
- **`deleteManual`** renames the manual's folder to `<manualId>.<uuid>.deleting`, which isn't a
  slug and so is never listed, then removes it; a missing manual is nothing to do. The manual
  disappears in that one step. If the removal fails part-way, the failure is logged and the delete
  still succeeds: the manual is already gone, and the leftover folder is ignored.
- **`markSeeded`** rewrites `seeded.json` through a temp file and a `rename`.

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
  sections the seed marks written (the sample's 7 of 18; none for the others);
- if the store already has a manual with that id, it leaves it exactly as it is, written
  sections included;
- either way, it then records the id.

So a seed manual added to `server/seed/` is seeded on the next start, and a deleted seed
manual stays in the record and is never seeded again. A crash after the TOC is put but before
every seed body is saved leaves that manual with fewer sections written; they are written on
demand like any other. Resetting the manuals to the seed is in `README.md`; never delete
`.data/ledger/`, because the caps are computed from it.

## Files

- `types.ts`: `ManualStore`, `UsageLedger`.
- `file-manual-store.ts`: manuals and sections as files.
- `file-ledger.ts`: the usage ledger as JSON lines.
- `files.ts`: reads a file or folder that may not exist; creates a file only if it doesn't exist.
- `lock.ts`: the data folder's lock: one server per folder.
- `manual.ts`: a manual's chapters and sections in reading order; the id pattern.
- `seed.ts`: seeds each manual in `server/seed/` once.
