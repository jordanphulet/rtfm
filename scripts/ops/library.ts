import { OPS_ROLE, READ_ROLE } from "../../infra/rtfm.ts";
import { readLibraryDayTotals, type LibraryDayTotal } from "../../server/gateway/dynamodb-spending-ledger.ts";
import { dayOf } from "../../server/gateway/ledger-calls.ts";
import { formatUsd } from "../../server/gateway/usage-report.ts";
import { printable } from "../../server/logging/log-reader.ts";
import { createDynamoDbLinkStore } from "../../server/storage/dynamodb-link-store.ts";
import { listManualsWithWritten } from "../../server/storage/dynamodb-manual-store.ts";
import { monthOf } from "../../server/storage/file-ledger.ts";
import {
  librarySecretDigest,
  makeLibrarySecret,
  noActivity,
  type LibraryActivity,
  type LibraryLink,
  type LinkStore,
} from "../../server/storage/library-links.ts";
import { checkedRecipientLibraryId } from "../../server/storage/library.ts";
import { sectionsInReadingOrder } from "../../server/storage/manual.ts";
import type { StoredManual } from "../../server/storage/types.ts";
import { appTableAs, asRole, type CommandResult, type OpsContext } from "./context.ts";
import { APP_ORIGIN } from "./deployed.ts";

export const LIBRARY_ACTIONS = ["create", "list", "show", "revoke"] as const;
export type LibraryAction = (typeof LIBRARY_ACTIONS)[number];

/** A library as `list` and `show` give it: its link, its activity and its spend. */
interface LibrarySummary extends LibraryActivity {
  label?: string;
  createdAt: string;
  revokedAt?: string;
  spend: { todayUsd: number; monthUsd: number; totalUsd: number };
}

interface ManualSummary {
  manualId: string;
  title: string;
  sectionCount: number;
  writtenSections: { id: string; label: string; title: string }[];
}

export function library(action: LibraryAction, libraryId: string | undefined, label: string | undefined, context: OpsContext) {
  switch (action) {
    case "create":
      return createLibrary(libraryId!, label, context);
    case "list":
      return listLibraries(context);
    case "show":
      return showLibrary(libraryId!, context);
    case "revoke":
      return revokeLibrary(libraryId!, context);
  }
}

/**
 * A new library's link, as `rtfm-ops`: only the secret's digest is stored, and the link is in the
 * result alone, which is printed once on standard output. It refuses an id any link names, revoked
 * or not, so a library's id is never given to another.
 */
async function createLibrary(libraryId: string, label: string | undefined, context: OpsContext): Promise<CommandResult> {
  checkedRecipientLibraryId(libraryId);
  return asRole(context, OPS_ROLE, async (session) => {
    const links = createDynamoDbLinkStore(await appTableAs(context, session));
    const taken = await linkOf(links, libraryId);
    if (taken) {
      const state = taken.revokedAt ? "revoked" : "open";
      throw new Error(`The library ${libraryId} already exists (${state}), and its id is never given to another.`);
    }
    const secret = makeLibrarySecret();
    const createdAt = context.now().toISOString();
    if ((await links.createLink({ digest: librarySecretDigest(secret), libraryId, label, createdAt })) === "exists") {
      throw new Error("The new link's digest is taken, which should never happen: run it again.");
    }
    const link = `${APP_ORIGIN}/l#${secret}`;
    const text = `The library ${libraryId} is made. Its link, which nothing keeps, so copy it now:\n${link}`;
    return { text, json: { libraryId, link }, ok: true };
  });
}

/** Every library, with its link's state, its activity and its spend, read as `rtfm-read`. */
function listLibraries(context: OpsContext): Promise<CommandResult> {
  return asRole(context, READ_ROLE, async (session) => {
    const credentials = await session.credentials();
    const links = createDynamoDbLinkStore(context.appTable(credentials));
    const [allLinks, allActivity, totals] = await Promise.all([
      links.listLinks(),
      links.listActivity(),
      readLibraryDayTotals(context.usageTable(credentials)),
    ]);
    const libraries = allLinks
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
      .map((link) => {
        const activity = allActivity.find((one) => one.libraryId === link.libraryId) ?? noActivity(link.libraryId);
        const days = totals.filter((total) => total.libraryId === link.libraryId);
        return librarySummary(link, activity, days, context.now());
      });
    const text = libraries.length > 0 ? libraries.map(summaryLines).join("\n\n") : "No library has been made.";
    return { text, json: libraries, ok: true };
  });
}

/** One library, with its spend by day and its manuals' titles and written sections, read as `rtfm-read`. */
async function showLibrary(libraryId: string, context: OpsContext): Promise<CommandResult> {
  checkedRecipientLibraryId(libraryId);
  return asRole(context, READ_ROLE, async (session) => {
    const credentials = await session.credentials();
    const appTable = context.appTable(credentials);
    const links = createDynamoDbLinkStore(appTable);
    const link = await linkOf(links, libraryId);
    if (!link) throw new Error(noLibrary(libraryId));
    const [activity, days, manuals] = await Promise.all([
      links.getActivity(libraryId),
      readLibraryDayTotals(context.usageTable(credentials), libraryId),
      listManualsWithWritten(appTable, libraryId),
    ]);
    const summary = librarySummary(link, activity, days, context.now());
    const spendByDay = days.map(({ day, committedUsd }) => ({ day, usd: committedUsd }));
    const manualSummaries = manuals.map(({ manual, written }) => manualSummary(manual, written));
    const text = [
      ...summaryLines(summary).split("\n"),
      `  spend by day: ${spendByDay.length > 0 ? spendByDay.map(({ day, usd }) => `${day} ${formatUsd(usd)}`).join(", ") : "none"}`,
      manualSummaries.length > 0 ? "Manuals (their titles are the recipient's text, quoted):" : "Manuals: none.",
      ...manualSummaries.flatMap(manualLines),
    ].join("\n");
    return { text, json: { ...summary, spendByDay, manuals: manualSummaries }, ok: true };
  });
}

/**
 * Sets `revokedAt` on the library's link, as `rtfm-ops`, then reads it back. Its manuals, sections
 * and activity stay.
 */
async function revokeLibrary(libraryId: string, context: OpsContext): Promise<CommandResult> {
  checkedRecipientLibraryId(libraryId);
  return asRole(context, OPS_ROLE, async (session) => {
    const links = createDynamoDbLinkStore(await appTableAs(context, session));
    const outcome = await links.revokeLink(libraryId, context.now().toISOString());
    if (outcome === "no-link") throw new Error(noLibrary(libraryId));
    const revokedAt = (await linkOf(links, libraryId))?.revokedAt;
    if (revokedAt === undefined) throw new Error(`The link of ${libraryId} reads back as open.`);
    if (outcome === "already-revoked") throw new Error(`${libraryId} was already revoked, at ${revokedAt}.`);
    const text = `${libraryId} is revoked; the app refuses its link within a minute.`;
    return { text, json: { libraryId, revokedAt }, ok: true };
  });
}

/** The library's link, without its digest: one library has one link. */
async function linkOf(links: LinkStore, libraryId: string): Promise<LibraryLink | undefined> {
  return (await links.listLinks()).find((link) => link.libraryId === libraryId);
}

function noLibrary(libraryId: string): string {
  return `There is no library ${libraryId}: no link names it.`;
}

function librarySummary(
  { libraryId, label, createdAt, revokedAt }: LibraryLink,
  { libraryId: _, ...activity }: LibraryActivity,
  days: LibraryDayTotal[],
  now: Date,
): LibrarySummary {
  const sum = (totals: LibraryDayTotal[]) => totals.reduce((usd, total) => usd + total.committedUsd, 0);
  const today = dayOf(now.toISOString());
  const month = monthOf(now.toISOString());
  const spend = {
    todayUsd: sum(days.filter((total) => total.day === today)),
    monthUsd: sum(days.filter((total) => total.day.startsWith(month))),
    totalUsd: sum(days),
  };
  return { libraryId, label, createdAt, revokedAt, ...activity, spend };
}

/** Text from a person, quoted and with every control character escaped, so it can't forge a line or reach the terminal. */
function quoted(text: string): string {
  return printable(JSON.stringify(text));
}

function summaryLines(summary: LibrarySummary): string {
  const { libraryId, label, createdAt, revokedAt, firstUsedAt, lastUsedAt, spend } = summary;
  const heading = label === undefined ? libraryId : `${libraryId}, ${quoted(label)}`;
  const used = firstUsedAt === undefined ? "never used" : `first used ${firstUsedAt}, last used ${lastUsedAt ?? "never"}`;
  return [
    `${heading}: ${revokedAt === undefined ? "open" : `revoked ${revokedAt}`}`,
    `  created ${createdAt}, ${used}`,
    `  links opened ${summary.opens}, manuals created ${summary.manualsCreated}, sections written ${summary.sectionsWritten}, sections read ${summary.sectionsRead}, librarian messages ${summary.librarianMessages}`,
    `  spend: ${formatUsd(spend.todayUsd)} today, ${formatUsd(spend.monthUsd)} this month, ${formatUsd(spend.totalUsd)} in all`,
  ].join("\n");
}

function manualSummary(manual: StoredManual, written: string[]): ManualSummary {
  const sections = sectionsInReadingOrder(manual);
  const writtenSections = sections
    .filter((section) => written.includes(section.id))
    .map(({ id, label, title }) => ({ id, label, title }));
  return { manualId: manual.id, title: manual.title, sectionCount: sections.length, writtenSections };
}

function manualLines({ manualId, title, sectionCount, writtenSections }: ManualSummary): string[] {
  return [
    `  ${quoted(title)} (${manualId}): ${writtenSections.length} of ${sectionCount} sections written`,
    ...writtenSections.map((section) => `    ${quoted(section.label)} ${quoted(section.title)}`),
  ];
}
