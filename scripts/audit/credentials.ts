export type CredentialKind =
  | "private key"
  | "AWS access key id"
  | "Anthropic API key"
  | "API key"
  | "GitHub token"
  | "JWT"
  | "bearer token"
  | "named secret"
  | "AWS secret access key"
  | "base64 token"
  | "long hex string";

/** `shape` describes the value without giving it away: its length and the kinds of characters in it. */
export type CredentialMatch = { kind: CredentialKind; knownFake: boolean; shape: string; index: number };

export type ScannedText = { redacted: string; matches: CredentialMatch[] };

type Pattern = { kind: CredentialKind; regex: RegExp };

// The gateway's tests name their fake keys and decoys for what they are (`…FAKEFORTESTSONLY`,
// `…-that-must-not-be-used`), as do documentation examples, so a finding of one can be told apart
// from a real credential.
const KNOWN_FAKE = /EXAMPLE|FAKE|TESTS?[-_]?ONLY|MUST[-_]?NOT[-_]?BE[-_]?USED/i;

const SECRET_NAME = String.raw`[A-Za-z0-9_]*?(?:TOKEN|SECRET|PASSWORD|PASSWD|API_?KEY|ACCESS_?KEY(?:_?ID)?|PRIVATE_?KEY)`;

// Each regex's capture group, or the whole match when it has none, is the value to redact.
// - A named secret is a value given to a secret-sounding name: `NAME=value` as in a shell or an
//   env file, or a quoted value, as in `name = "value"`, `name: "value"` or `"name": "value"`.
//   Code such as `token = provideToken()` is left alone. A header with a secret-sounding name,
//   such as `x-api-key: value`, is a named secret too.
// - A base64 token has no slash, so a path doesn't look like one, and isn't a `sha512-` integrity
//   hash. A run with slashes counts only at an AWS secret access key's 40 characters.
const PATTERNS: Pattern[] = [
  { kind: "private key", regex: /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?(?:-----END [A-Z ]*PRIVATE KEY-----|$)/g },
  { kind: "AWS access key id", regex: /\b(?:AKIA|ASIA)[A-Z0-9]{16,}\b/g },
  { kind: "Anthropic API key", regex: /\bsk-ant-[\w-]{16,}/g },
  { kind: "API key", regex: /\bsk-[A-Za-z0-9]{20,}/g },
  { kind: "GitHub token", regex: /\bgh[pousr]_[A-Za-z0-9]{30,}/g },
  { kind: "JWT", regex: /\beyJ[\w-]{10,}\.[\w-]{10,}\.[\w-]{10,}/g },
  { kind: "bearer token", regex: /\bBearer\s+([\w.~+/-]{20,}=*)/g },
  {
    kind: "named secret",
    regex: new RegExp(String.raw`\b${SECRET_NAME}\b["']?(?:=["']?|\s*[=:]\s*["'])([^\s"'\x60]{8,})`, "gi"),
  },
  {
    kind: "named secret",
    regex: /\b(?:[A-Za-z0-9]+-)+(?:token|secret|password|key)\s*:\s*["']?([^\s"'\x60]{8,})/gi,
  },
  {
    kind: "AWS secret access key",
    regex: /(?<![\w+/=-])(?=[A-Za-z0-9+/]{0,39}[A-Z])(?=[A-Za-z0-9+/]{0,39}[a-z])(?=[A-Za-z0-9+/]{0,39}\d)[A-Za-z0-9+/]{40}(?![\w+/=-])/g,
  },
  {
    kind: "base64 token",
    regex: /(?<![\w+/=-])(?=[A-Za-z0-9+]*[A-Z])(?=[A-Za-z0-9+]*[a-z])(?=[A-Za-z0-9+]*\d)[A-Za-z0-9+]{32,}={0,2}(?![\w+/=-])/g,
  },
  { kind: "long hex string", regex: /(?<![0-9a-fA-F])(?:[0-9a-f]{32,39}|[0-9a-f]{41,})(?![0-9a-fA-F])/g },
];

type Span = { start: number; end: number; kind: CredentialKind };

/**
 * Replaces every key- or secret-shaped value in `text` with a marker naming its kind, and says
 * where each marker is in the redacted text.
 */
export function scanText(text: string): ScannedText {
  const matches: CredentialMatch[] = [];
  let redacted = "";
  let last = 0;
  for (const { start, end, kind } of findSpans(text)) {
    const value = text.slice(start, end);
    redacted += text.slice(last, start);
    const knownFake = KNOWN_FAKE.test(value);
    matches.push({ kind, knownFake, shape: shapeOf(value), index: redacted.length });
    redacted += marker(kind, knownFake);
    last = end;
  }
  return { redacted: redacted + text.slice(last), matches };
}

export function redact(text: string): string {
  return scanText(text).redacted;
}

/** `redact` applied to every string inside a JSON-shaped value. */
export function redactDeep<T>(value: T): T {
  if (typeof value === "string") return redact(value) as T;
  if (Array.isArray(value)) return value.map(redactDeep) as T;
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, inner]) => [key, redactDeep(inner)])) as T;
  }
  return value;
}

// Every pattern's matches, earliest first. Overlapping matches merge into one span, named after
// the one that starts first (or, at the same start, the pattern listed first).
function findSpans(text: string): Span[] {
  const spans = PATTERNS.flatMap(({ kind, regex }) =>
    [...text.matchAll(regex)].flatMap((match): Span[] => {
      const value = match[1] ?? match[0];
      if (isPlaceholder(value)) return [];
      const start = match.index + match[0].lastIndexOf(value);
      return [{ start, end: start + value.length, kind }];
    }),
  );
  spans.sort((a, b) => a.start - b.start);
  const merged: Span[] = [];
  for (const span of spans) {
    const previous = merged.at(-1);
    if (previous && span.start < previous.end) {
      previous.end = Math.max(previous.end, span.end);
    } else {
      merged.push({ ...span });
    }
  }
  return merged;
}

function marker(kind: CredentialKind, knownFake: boolean): string {
  return knownFake ? `[redacted ${kind}: a known fake]` : `[redacted ${kind}]`;
}

// Values standing in for a secret, such as `$AWS_SECRET_ACCESS_KEY`, `<your key>`, `…` or
// `your-api-key`.
function isPlaceholder(value: string): boolean {
  return /^(?:[$<…[«{(%]|\.\.\.|your|x{3,})/i.test(value);
}

function shapeOf(value: string): string {
  const classes = [
    [/[A-Z]/, "upper"],
    [/[a-z]/, "lower"],
    [/\d/, "digits"],
    [/[^A-Za-z0-9]/, "symbols"],
  ] as const;
  const present = classes.filter(([pattern]) => pattern.test(value)).map(([, name]) => name);
  return `${value.length} characters: ${present.join(", ")}`;
}
