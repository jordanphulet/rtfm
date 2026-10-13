import { scanText, type CredentialKind } from "./credentials.ts";
import type { Event } from "./events.ts";

export type CredentialFinding = {
  time: string;
  session: string;
  who: string;
  field: "text" | "input" | "result";
  kind: CredentialKind;
  knownFake: boolean;
  /** The value's length and the kinds of characters in it. */
  shape: string;
  /** The text around the value, redacted. */
  context: string;
};

export type CredentialReport = {
  total: number;
  knownFake: number;
  byKind: Partial<Record<CredentialKind, { total: number; knownFake: number }>>;
  findings: CredentialFinding[];
};

const CONTEXT = 60;

/** Every key- or secret-shaped value in the events, counted and shown only redacted. */
export function credentialReport(events: Event[]): CredentialReport {
  const findings = events.flatMap(eventFindings);
  const byKind: CredentialReport["byKind"] = {};
  for (const { kind, knownFake } of findings) {
    const counts = (byKind[kind] ??= { total: 0, knownFake: 0 });
    counts.total++;
    if (knownFake) counts.knownFake++;
  }
  return {
    total: findings.length,
    knownFake: findings.filter((finding) => finding.knownFake).length,
    byKind,
    findings,
  };
}

function eventFindings(event: Event): CredentialFinding[] {
  const fields: [CredentialFinding["field"], string[]][] = [
    ["text", event.text === undefined ? [] : [event.text]],
    ["input", stringsIn(event.input)],
    ["result", event.result === undefined ? [] : [event.result]],
  ];
  return fields.flatMap(([field, texts]) =>
    texts.flatMap((text) => {
      const { redacted, matches } = scanText(text);
      return matches.map(({ kind, knownFake, shape, index }) => ({
        time: event.time,
        session: event.session,
        who: event.who,
        field,
        kind,
        knownFake,
        shape,
        context: redacted.slice(Math.max(0, index - CONTEXT), index + CONTEXT).replace(/\s+/g, " "),
      }));
    }),
  );
}

function stringsIn(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.flatMap(stringsIn);
  if (value && typeof value === "object") return Object.values(value).flatMap(stringsIn);
  return [];
}
