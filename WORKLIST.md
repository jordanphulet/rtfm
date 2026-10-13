# RTFM — Work List

The work still to do, with each task's status. **This file is the source of truth for status.**
`PROCESS.md` says how the orchestrator works through it; finished work is removed.

## Waiting on AWS

Work that can't start until the user does something in AWS. Each task stays `blocked` until the
user says its step is done.

### AW.1 — Check the ledger against the AWS bill
- **Status:** blocked (the user compares Bedrock charges in Cost Explorer with `npm run usage`)
- **Depends on:** —
- **Files:** `server/gateway/prices.ts`, `server/README.md`, `server/gateway/README.md`
- **Do:** with the user's figures, correct the Haiku 4.5 prices if they differ, and decide from
  the bill whether a call that doesn't complete should still be charged its full `max_tokens`.
- **Done when:** the price table matches AWS's charges and `server/README.md` says what was
  checked.

### AW.2 — Claude Platform on AWS
- **Status:** blocked (the user signs up, following `research/aws-hosting.md` › "Your steps")
- **Depends on:** —
- **Files:** `server/gateway/**`, `server/config.ts`, `package.json`, `package-lock.json`,
  `ARCHITECTURE.md`, `README.md`, `research/aws-hosting.md`
- **Do:** swap the gateway's client to Claude Platform on AWS as the research describes, keeping
  the credential lockdown and its tests; one live Haiku 4.5 call under $0.01; check whether the
  newer models answer.
- **Done when:** `npm run build` and `npm test` pass, a real call through the gateway succeeds,
  and the research doc's status line says what was adopted.

### AW.3 — Model bake-off
- **Status:** blocked (access to the newer Claude models, through AW.2 or an AWS Support case)
- **Depends on:** AW.2 or the Support case
- **Files:** `research/bedrock-models.md`, `server/config.ts`
- **Do:** run the bake-off in `research/bedrock-models.md` on the models now open to the account,
  under $0.50, and pick each job's model.
- **Done when:** the research doc records the results and status, and `server/config.ts` uses
  the chosen models.

---

## Before AWS

Two things the app needs before it's hosted: logs that Claude can read without the user copying
from a terminal, and a passphrase so a public URL can't be used by anyone who finds it. When this
phase is done:

- the server writes structured logs to a file Claude can read, and the same lines would go to
  CloudWatch unchanged;
- errors in the browser reach the same log;
- nothing in the app works without the passphrase, and the sign-in page fits the design.

### Rules for this phase

- **AWS credentials come only from `.env.local`.** There are profiles in `~/.aws/config`, and
  they **must never be used**. Never read, print, copy or edit `.env.local`.
- **No real Bedrock calls.** Tests and live checks use the fake models.
- **`.data/` is the user's data.** Never start a server on it (the user's dev server may be
  running there); use `RTFM_DATA_DIR` on a temporary folder. Never delete or edit the ledger.
- **Logs never hold secrets:** no credentials, no passphrase, no session tokens, no cookies.

### BA.2 — The passphrase: design
- **Status:** todo
- **Depends on:** BA.1, RS.3, RS.4 (so the design is written into the new doc layout)
- **Files:** the docs that own what it designs, in RS.3's and RS.4's layout: `ARCHITECTURE.md`,
  `server/README.md`, `server/*/README.md`, `DESIGN.md`, `src/*/DESIGN.md`
- **Do:** add the design for user approval, short and concrete:
  - where the passphrase is set (a setting loaded at runtime, never committed) and what the
    server does when it isn't set;
  - how the server checks it (a stored hash, a constant-time comparison) and slows guessing
    (for example a few attempts a minute);
  - the session: an `HttpOnly`, `SameSite=Strict` cookie holding a signed token (the reader's
    streams can't send headers), how long it lasts, signing out, and what a changed passphrase
    does to existing sessions;
  - which routes need it (everything except signing in), what a request without it gets, and
    how the page responds (the sign-in page, then back to where the user was);
  - the sign-in page's design, within the design docs' rules;
  - how it carries over to AWS (where the passphrase and signing key would live).
- **Done when:** the design is reviewed, then marked `needs-human`; the user approves it.

### BA.3 — The passphrase: build
- **Status:** todo
- **Depends on:** BA.2 and the user's approval
- **Files:** `server/**`, `src/**`, `scripts/**`, `README.md`, `ARCHITECTURE.md`, `DESIGN.md`
  (`server/**` and `src/**` include the folder READMEs and page design docs)
- **Do:** build what BA.2's approved design says, with the sign-in page and signing out; the
  screenshot script signs in; logs record sign-ins and refusals without the passphrase or token.
- **Done when:** `npm run build`, `npm test` and `npm run shot` pass; tests cover every route
  refusing without a session, signing in and out, a wrong passphrase, the attempt limit, a
  tampered or expired token, and streams working with the cookie; live, the whole app works
  after signing in and nothing works before.


---

## Repo structure

Make the repo quicker to find your way around, for agents and people. When this phase is done:

- each component's stylesheet shares the component's name, so a search for `Foo*` finds the
  component, its test and its styles together;
- names say what things are: the browser's librarian conversation lives in `src/librarian/`;
- `ARCHITECTURE.md` and `DESIGN.md` are short maps, and the detail sits next to the code it
  describes, as the `src/*/README.md` files already do;
- the folder map is written down once.

### Rules for this phase

- **No real Bedrock calls**, and never start a server on `.data/`.
- **No task changes `CLAUDE.md`.** Only the user approves changes to it.

### RS.4 — Split `DESIGN.md` by page
- **Status:** todo
- **Depends on:** RS.1, RS.2, RS.3 (both change `README.md` and the folder READMEs)
- **Files:** `DESIGN.md`, `src/home/DESIGN.md` (new), `src/reader/DESIGN.md` (new), `README.md`;
  for links to moved headings only: `src/*/README.md`, `ARCHITECTURE.md`, `server/**/README.md`,
  `research/*.md`
- **Do:**
  - `DESIGN.md` (now over 1,400 lines) keeps only what both pages share: what RTFM is, the data
    model, the craft bar, the banned list, the concept, the tokens, and any rule that applies to
    both pages. It opens by linking to each page's design doc and saying that its rules bind both
    pages.
  - The `# The reader` part moves to `src/reader/DESIGN.md`, and `# The landing page` to
    `src/home/DESIGN.md`. Each page's behavior section in the shared part ("Reader behavior",
    "Landing page behavior") moves with its page.
  - Update every link to a moved heading.
- **Done when:** every fact in the old `DESIGN.md` is in exactly one new place (the review
  compares the old and new text); `DESIGN.md` holds only what both pages share; links resolve.

### RS.5 — Write the repo map down once
- **Status:** todo
- **Depends on:** RS.2, RS.3, RS.4
- **Files:** `README.md`, `ARCHITECTURE.md`
- **Do:**
  - Keep the folder map in one place, the codemap in `ARCHITECTURE.md`.
  - Cut the README's "Where things live" to what someone running the app needs, and point to
    the codemap for the rest.
  - README's doc index stays one line per doc. It names the pattern (each folder's README, each
    page's `DESIGN.md`) rather than restating what each folder holds.
- **Done when:** no folder's description appears in more than one doc; every doc the index names
  exists.
