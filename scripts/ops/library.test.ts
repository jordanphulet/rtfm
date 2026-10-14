import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { describe, expect, it, onTestFinished, vi } from "vitest";
import { createDynamoDbSpendingLedger } from "../../server/gateway/dynamodb-spending-ledger.ts";
import { testUsageTable } from "../../server/gateway/dynamodb-testing.ts";
import { createDynamoDbLinkStore } from "../../server/storage/dynamodb-link-store.ts";
import { createDynamoDbManualStore, type DynamoDbTable } from "../../server/storage/dynamodb-manual-store.ts";
import { testAppTable } from "../../server/storage/dynamodb-testing.ts";
import { librarySecretDigest } from "../../server/storage/library-links.ts";
import { readSeedManual } from "../../server/storage/seed.ts";
import { library } from "./library.ts";
import { runOps } from "./ops.ts";
import { standInAws } from "./testing.ts";

const TEST_TIMEOUT_MS = 30_000;
const NOW = new Date("2026-10-13T12:00:00.000Z");
const LINK = /^https:\/\/rtfm\.moonfetus\.com\/l#([A-Za-z0-9_-]{22})$/;
const REFUSED_IDS = ["admin", "Acme", "acme#x", "acme/x", "", "a".repeat(64)];

async function tables() {
  return { appTable: await testAppTable(), usageTable: await testUsageTable() };
}

/**
 * A stand-in for DynamoDB on loopback that passes each request on to DynamoDB Local, and records
 * each request's body, and its action, its table and the partition it names.
 */
async function recordingDynamoDb(endpoint: string) {
  const sent: string[] = [];
  const bodies: string[] = [];
  const server = createServer(async (request, response) => {
    let body = "";
    for await (const chunk of request.setEncoding("utf8")) body += chunk;
    bodies.push(body);
    const { TableName, Key, Item, ExpressionAttributeValues } = JSON.parse(body);
    const partition = (Key ?? Item)?.pk?.S ?? ExpressionAttributeValues?.[":pk"]?.S;
    sent.push(`${String(request.headers["x-amz-target"]).split(".")[1]} ${TableName} ${partition}`);
    const headers = ["authorization", "content-type", "x-amz-date", "x-amz-security-token", "x-amz-target"]
      .filter((name) => request.headers[name])
      .map((name) => [name, String(request.headers[name])]);
    const passed = await fetch(endpoint, { method: "POST", headers: Object.fromEntries(headers), body });
    response.writeHead(passed.status, { "content-type": "application/x-amz-json-1.0" }).end(await passed.text());
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  onTestFinished(() => new Promise<void>((resolve) => server.close(() => resolve())));
  return { endpoint: `http://127.0.0.1:${(server.address() as AddressInfo).port}`, sent, bodies };
}

/** The secret in `create`'s result, from its JSON. */
function secretIn(json: unknown): string {
  return (json as { link: string }).link.match(LINK)![1];
}

/**
 * Acme, made on the 12th with a label, used, with Negotiating With Geese and two of its sections
 * written, and spend last month, yesterday and today; and Globex, made on the 13th, never used,
 * revoked.
 */
async function twoLibraries({ appTable, usageTable }: { appTable: DynamoDbTable; usageTable: DynamoDbTable }) {
  const links = createDynamoDbLinkStore(appTable);
  const digest = (character: string) => character.repeat(64);
  await links.createLink({ digest: digest("a"), libraryId: "acme", label: "Acme, staff engineer", createdAt: "2026-10-12T09:00:00.000Z" });
  await links.createLink({ digest: digest("b"), libraryId: "globex", createdAt: "2026-10-13T08:00:00.000Z" });
  await links.revokeLink("globex", "2026-10-13T09:00:00.000Z");
  await links.recordOpen("acme", "2026-10-12T10:00:00.000Z");
  await links.recordOpen("acme", "2026-10-13T10:00:00.000Z");
  await links.recordLastUse("acme", "2026-10-13T11:00:00.000Z");
  for (const counter of ["sectionsRead", "sectionsRead", "sectionsRead", "librarianMessages", "manualsCreated", "sectionsWritten"] as const) {
    await links.count("acme", counter);
  }

  const acme = createDynamoDbManualStore(appTable, "acme");
  await acme.createManual(await readSeedManual("negotiating-with-geese"));
  await acme.saveBody("negotiating-with-geese", "reading-the-signals", "Body.");
  await acme.saveBody("negotiating-with-geese", "who-you-are-dealing-with", "Body.");
  await createDynamoDbManualStore(appTable).createManual(await readSeedManual("the-haunt-that-listens"));

  const ledger = createDynamoDbSpendingLedger(usageTable);
  const call = (callId: string, reservedAt: string, libraryId: string, worstCaseUsd: number) =>
    ledger.importCall({ callId, reservedAt, libraryId, job: "section", model: "m", worstCaseUsd });
  await call("one", "2026-09-30T10:00:00.000Z", "acme", 0.5);
  await call("two", "2026-10-12T10:00:00.000Z", "acme", 0.25);
  await call("three", "2026-10-13T10:00:00.000Z", "acme", 0.125);
  await call("four", "2026-10-13T10:00:00.000Z", "admin", 1);
}

const ACME = {
  libraryId: "acme",
  label: "Acme, staff engineer",
  createdAt: "2026-10-12T09:00:00.000Z",
  opens: 2,
  sectionsRead: 3,
  librarianMessages: 1,
  manualsCreated: 1,
  sectionsWritten: 1,
  firstUsedAt: "2026-10-12T10:00:00.000Z",
  lastUsedAt: "2026-10-13T11:00:00.000Z",
  spend: { todayUsd: 0.125, monthUsd: 0.375, totalUsd: 0.875 },
};
const GLOBEX = {
  libraryId: "globex",
  createdAt: "2026-10-13T08:00:00.000Z",
  revokedAt: "2026-10-13T09:00:00.000Z",
  opens: 0,
  sectionsRead: 0,
  librarianMessages: 0,
  manualsCreated: 0,
  sectionsWritten: 0,
  spend: { todayUsd: 0, monthUsd: 0, totalUsd: 0 },
};
const ACME_TEXT = [
  'acme, "Acme, staff engineer": open',
  "  created 2026-10-12T09:00:00.000Z, first used 2026-10-12T10:00:00.000Z, last used 2026-10-13T11:00:00.000Z",
  "  links opened 2, manuals created 1, sections written 1, sections read 3, librarian messages 1",
  "  spend: $0.1250 today, $0.3750 this month, $0.8750 in all",
].join("\n");
const GLOBEX_TEXT = [
  "globex: revoked 2026-10-13T09:00:00.000Z",
  "  created 2026-10-13T08:00:00.000Z, never used",
  "  links opened 0, manuals created 0, sections written 0, sections read 0, librarian messages 0",
  "  spend: $0.0000 today, $0.0000 this month, $0.0000 in all",
].join("\n");
const GEESE = {
  manualId: "negotiating-with-geese",
  title: "Negotiating With Geese",
  sectionCount: 6,
  writtenSections: [
    { id: "who-you-are-dealing-with", label: "1.1", title: "Who You Are Dealing With" },
    { id: "reading-the-signals", label: "1.2", title: "Reading the Signals" },
  ],
};

describe("npm run ops -- library create", { timeout: TEST_TIMEOUT_MS }, () => {
  it("stores a new link's digest, as rtfm-ops, and gives the link in its text and JSON alone", async () => {
    const { appTable } = await tables();
    const { context, calls } = standInAws([], { appTable, now: NOW });

    const result = await library("create", "acme", "Acme, staff engineer", context);

    const secret = secretIn(result.json);
    const link = `https://rtfm.moonfetus.com/l#${secret}`;
    expect(result).toEqual({
      text: `The library acme is made. Its link, which nothing keeps, so copy it now:\n${link}`,
      json: { libraryId: "acme", link },
      ok: true,
    });
    expect(await createDynamoDbLinkStore(appTable).listLinks()).toEqual([
      {
        digest: librarySecretDigest(secret),
        libraryId: "acme",
        label: "Acme, staff engineer",
        createdAt: NOW.toISOString(),
      },
    ]);
    expect(calls().map((call) => call.profile)).toEqual(["rtfm-ops", "rtfm-ops"]);
  });

  it("prints the link once, on standard output, and keeps it nowhere", async () => {
    const { appTable } = await tables();
    const recorder = await recordingDynamoDb(appTable.endpoint);
    const { context, calls } = standInAws([], { appTable: { ...appTable, endpoint: recorder.endpoint }, now: NOW });
    const written = [
      vi.spyOn(process.stdout, "write"),
      vi.spyOn(process.stderr, "write"),
      ...(["log", "info", "warn", "error", "debug"] as const).map((method) => vi.spyOn(console, method)),
    ];

    const text = await runOps(["library", "create", "acme"], context);
    const json = await runOps(["library", "create", "globex", "--json"], context);
    for (const spy of written) spy.mockRestore();

    const textSecret = text.stdout.match(/l#([A-Za-z0-9_-]{22})$/)![1];
    const jsonSecret = secretIn(JSON.parse(json.stdout));
    expect(textSecret).not.toBe(jsonSecret);
    for (const [stdout, secret] of [
      [text.stdout, textSecret],
      [json.stdout, jsonSecret],
    ]) {
      expect(stdout.split(secret)).toHaveLength(2);
    }
    const elsewhere = [
      ...written.flatMap((spy) => spy.mock.calls.map((args) => JSON.stringify(args))),
      JSON.stringify(calls()),
      ...recorder.bodies,
    ].join("\n");
    for (const secret of [textSecret, jsonSecret]) {
      expect(elsewhere).not.toContain(secret);
      expect(recorder.bodies.join("\n")).toContain(librarySecretDigest(secret));
    }
  });

  it("refuses an id that isn't a recipient library's, before reaching AWS", async () => {
    const { appTable } = await tables();
    const { context, calls } = standInAws([], { appTable, now: NOW });
    for (const libraryId of REFUSED_IDS) {
      await expect(library("create", libraryId, undefined, context), libraryId).rejects.toThrow(
        /^Not a recipient library's id/,
      );
    }
    expect(calls()).toEqual([]);
    expect(await createDynamoDbLinkStore(appTable).listLinks()).toEqual([]);
  });

  it("refuses an id any link names, open or revoked", async () => {
    const { appTable } = await tables();
    const { context } = standInAws([], { appTable, now: NOW });
    await library("create", "acme", undefined, context);
    await library("create", "globex", undefined, context);
    await library("revoke", "globex", undefined, context);
    const before = await createDynamoDbLinkStore(appTable).listLinks();

    await expect(library("create", "acme", undefined, context)).rejects.toThrow(
      "The library acme already exists (open), and its id is never given to another.",
    );
    await expect(library("create", "globex", "again", context)).rejects.toThrow(
      "The library globex already exists (revoked), and its id is never given to another.",
    );
    expect(await createDynamoDbLinkStore(appTable).listLinks()).toEqual(before);
  });
});

describe("npm run ops -- library list", { timeout: TEST_TIMEOUT_MS }, () => {
  it("lists every library with its link's state, activity and spend, as rtfm-read", async () => {
    const both = await tables();
    await twoLibraries(both);
    const { context, calls } = standInAws([], { ...both, now: NOW });

    expect(await library("list", undefined, undefined, context)).toEqual({
      text: `${ACME_TEXT}\n\n${GLOBEX_TEXT}`,
      json: [ACME, GLOBEX],
      ok: true,
    });
    expect(calls().map((call) => call.profile)).toEqual(["rtfm-read", "rtfm-read"]);
  });

  it("says so when no library has been made", async () => {
    const { context } = standInAws([], { ...(await tables()), now: NOW });
    expect(await library("list", undefined, undefined, context)).toEqual({
      text: "No library has been made.",
      json: [],
      ok: true,
    });
  });
});

describe("npm run ops -- library show", { timeout: TEST_TIMEOUT_MS }, () => {
  it("gives one library, with its spend by day and its manuals' written sections, as rtfm-read", async () => {
    const both = await tables();
    await twoLibraries(both);
    const { context, calls } = standInAws([], { ...both, now: NOW });

    expect(await library("show", "acme", undefined, context)).toEqual({
      text: [
        ACME_TEXT,
        "  spend by day: 2026-09-30 $0.5000, 2026-10-12 $0.2500, 2026-10-13 $0.1250",
        "Manuals (their titles are the recipient's text, quoted):",
        '  "Negotiating With Geese" (negotiating-with-geese): 2 of 6 sections written',
        '    "1.1" "Who You Are Dealing With"',
        '    "1.2" "Reading the Signals"',
      ].join("\n"),
      json: {
        ...ACME,
        spendByDay: [
          { day: "2026-09-30", usd: 0.5 },
          { day: "2026-10-12", usd: 0.25 },
          { day: "2026-10-13", usd: 0.125 },
        ],
        manuals: [GEESE],
      },
      ok: true,
    });
    expect(calls().map((call) => call.profile)).toEqual(["rtfm-read", "rtfm-read"]);
  });

  it("gives a revoked library's activity and manuals as they were", async () => {
    const both = await tables();
    await twoLibraries(both);
    const { context } = standInAws([], { ...both, now: NOW });
    await createDynamoDbLinkStore(both.appTable).revokeLink("acme", "2026-10-13T11:30:00.000Z");

    const { text, json } = await library("show", "acme", undefined, context);

    expect(text.split("\n")[0]).toBe('acme, "Acme, staff engineer": revoked 2026-10-13T11:30:00.000Z');
    expect(json).toMatchObject({ ...ACME, revokedAt: "2026-10-13T11:30:00.000Z", manuals: [GEESE] });
  });

  it("quotes the recipient's titles and the label, escaping every control character", async () => {
    const both = await tables();
    const forged = "Geese\nacme: revoked 2026-10-13T00:00:00.000Z\x1b[2J\x9b0m";
    const links = createDynamoDbLinkStore(both.appTable);
    await links.createLink({ digest: "c".repeat(64), libraryId: "acme", label: forged, createdAt: NOW.toISOString() });
    const geese = await readSeedManual("negotiating-with-geese");
    const [chapter] = geese.chapters;
    const [section] = chapter.sections;
    const hostile = {
      ...geese,
      title: forged,
      chapters: [{ ...chapter, sections: [{ ...section, label: forged, title: forged }] }],
      appendices: [],
    };
    const store = createDynamoDbManualStore(both.appTable, "acme");
    await store.createManual(hostile);
    await store.saveBody(geese.id, section.id, "Body.");
    const { context } = standInAws([], { ...both, now: NOW });

    const shown = String.raw`"Geese\nacme: revoked 2026-10-13T00:00:00.000Z\u001b[2J\u009b0m"`;
    const { text, json } = await library("show", "acme", undefined, context);
    expect(text.split("\n").slice(-3)).toEqual([
      "Manuals (their titles are the recipient's text, quoted):",
      `  ${shown} (negotiating-with-geese): 1 of 1 sections written`,
      `    ${shown} ${shown}`,
    ]);
    expect(text.split("\n")[0]).toBe(`acme, ${shown}: open`);
    expect(text).not.toMatch(/[\u0000-\u0009\u000b-\u001f\u007f-\u009f]/);
    expect(json).toMatchObject({ label: forged, manuals: [{ title: forged }] });
    expect((await library("list", undefined, undefined, context)).text.split("\n")[0]).toBe(`acme, ${shown}: open`);
  });

  it("shows a library never used, with no manual and no spend", async () => {
    const both = await tables();
    await twoLibraries(both);
    const { context } = standInAws([], { ...both, now: NOW });

    const { text, json } = await library("show", "globex", undefined, context);

    expect(text).toBe(`${GLOBEX_TEXT}\n  spend by day: none\nManuals: none.`);
    expect(json).toEqual({ ...GLOBEX, spendByDay: [], manuals: [] });
  });

  it("refuses an id no link names, and one that isn't a recipient library's before reaching AWS", async () => {
    const { context, calls } = standInAws([], { ...(await tables()), now: NOW });
    for (const libraryId of REFUSED_IDS) {
      await expect(library("show", libraryId, undefined, context), libraryId).rejects.toThrow(/^Not a recipient library's id/);
    }
    expect(calls()).toEqual([]);
    await expect(library("show", "initech", undefined, context)).rejects.toThrow(
      "There is no library initech: no link names it.",
    );
  });
});

describe("npm run ops -- library revoke", { timeout: TEST_TIMEOUT_MS }, () => {
  it("sets revokedAt on the library's link, as rtfm-ops, and reads it back", async () => {
    const both = await tables();
    await twoLibraries(both);
    const { context, calls } = standInAws([], { ...both, now: NOW });

    expect(await library("revoke", "acme", undefined, context)).toEqual({
      text: "acme is revoked; the app refuses its link within a minute.",
      json: { libraryId: "acme", revokedAt: NOW.toISOString() },
      ok: true,
    });
    const links = createDynamoDbLinkStore(both.appTable);
    expect((await links.findLink("a".repeat(64)))?.revokedAt).toBe(NOW.toISOString());
    expect((await links.getActivity("acme")).opens).toBe(2);
    expect(await createDynamoDbManualStore(both.appTable, "acme").writtenSectionIds("negotiating-with-geese")).toHaveLength(2);
    expect(calls().map((call) => call.profile)).toEqual(["rtfm-ops", "rtfm-ops"]);
  });

  it("refuses a library already revoked, keeping when it was, and one no link names", async () => {
    const both = await tables();
    await twoLibraries(both);
    const { context } = standInAws([], { ...both, now: NOW });

    await expect(library("revoke", "globex", undefined, context)).rejects.toThrow(
      "globex was already revoked, at 2026-10-13T09:00:00.000Z.",
    );
    await expect(library("revoke", "initech", undefined, context)).rejects.toThrow(
      "There is no library initech: no link names it.",
    );
    expect((await createDynamoDbLinkStore(both.appTable).findLink("b".repeat(64)))?.revokedAt).toBe(
      "2026-10-13T09:00:00.000Z",
    );
  });

  it("refuses an id that isn't a recipient library's, before reaching AWS", async () => {
    const { context, calls } = standInAws([], { ...(await tables()), now: NOW });
    for (const libraryId of REFUSED_IDS) {
      await expect(library("revoke", libraryId, undefined, context), libraryId).rejects.toThrow(/^Not a recipient library's id/);
    }
    expect(calls()).toEqual([]);
  });
});

describe("the library commands' reach", { timeout: TEST_TIMEOUT_MS }, () => {
  it("is the partitions LB.7 gives their roles: LINK for rtfm-ops; LINK, ACTIVITY, TOTAL and L#<libraryId>#LIBRARY for rtfm-read", async () => {
    const both = await tables();
    await twoLibraries(both);
    const recorder = await recordingDynamoDb(both.appTable.endpoint);
    const { context } = standInAws([], {
      appTable: { ...both.appTable, endpoint: recorder.endpoint },
      usageTable: { ...both.usageTable, endpoint: recorder.endpoint },
      now: NOW,
    });
    const sentBy = async (args: string[]) => {
      recorder.sent.length = 0;
      await runOps(args, context);
      return recorder.sent
        .map((line) => line.replace(both.appTable.name, "rtfm-app").replace(both.usageTable.name, "rtfm-usage"))
        .sort();
    };

    expect(await sentBy(["library", "create", "initech"])).toEqual(["PutItem rtfm-app LINK", "Query rtfm-app LINK"]);
    expect(await sentBy(["library", "list"])).toEqual([
      "Query rtfm-app ACTIVITY",
      "Query rtfm-app LINK",
      "Query rtfm-usage TOTAL",
    ]);
    expect(await sentBy(["library", "show", "acme"])).toEqual([
      "GetItem rtfm-app ACTIVITY",
      "Query rtfm-app L#acme#LIBRARY",
      "Query rtfm-app LINK",
      "Query rtfm-usage TOTAL",
    ]);
    expect(await sentBy(["library", "revoke", "acme"])).toEqual([
      "Query rtfm-app LINK",
      "Query rtfm-app LINK",
      "UpdateItem rtfm-app LINK",
    ]);
  });
});

describe("the library commands' output", { timeout: TEST_TIMEOUT_MS }, () => {
  it("holds the link, its secret or its digest only in create's", async () => {
    const { appTable, usageTable } = await tables();
    const { context } = standInAws([], { appTable, usageTable, now: NOW });
    const created = await runOps(["library", "create", "acme", "--label", "Acme"], context);
    const secret = created.stdout.match(/l#([A-Za-z0-9_-]{22})$/)![1];
    await createDynamoDbLinkStore(appTable).recordOpen("acme", NOW.toISOString());

    const outputs = [];
    for (const json of [[], ["--json"]]) {
      outputs.push(await runOps(["library", "list", ...json], context));
      outputs.push(await runOps(["library", "show", "acme", ...json], context));
    }
    outputs.push(await runOps(["library", "revoke", "acme"], context));
    outputs.push(await runOps(["library", "show", "acme", "--json"], context));
    const refusals = await Promise.all(
      [["library", "revoke", "acme", "--json"], ["library", "create", "acme"]].map((args) =>
        runOps(args, context).catch((error: Error) => error.message),
      ),
    );

    expect(outputs.every(({ stdout }) => stdout.includes("acme"))).toBe(true);
    expect(refusals).toEqual([expect.stringMatching(/already revoked/), expect.stringMatching(/already exists/)]);
    const everything = JSON.stringify([outputs, refusals]);
    expect(everything).not.toContain(secret);
    expect(everything).not.toContain(librarySecretDigest(secret));
  });
});
