import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { credentialReport } from "./credential-report.ts";
import { redact, redactDeep, scanText } from "./credentials.ts";
import type { Event } from "./events.ts";

const hex = (length: number) => randomBytes(length).toString("hex").slice(0, length);
const base64 = (length: number) => randomBytes(length).toString("base64").slice(0, length);
const alphanumeric = (length: number) => base64(length * 2).replace(/[+/=]/g, "").slice(0, length);
// Every character class, so the value has a secret's shape however the random bytes fall.
const mixed = (length: number) => `Aa1${alphanumeric(length - 3)}`;

function secretsInContext(): { value: string; text: string }[] {
  const token = hex(32);
  const accessKeyId = `AKIA${alphanumeric(40).toUpperCase().slice(0, 16)}`;
  const awsSecret = `Aa1/${base64(36)}`;
  const inHeader = (value: string) => ({ value, text: `curl -H "x-api-key: ${value}" https://example.test` });
  return [
    { value: token, text: `SHELL=/bin/zsh\nEXAMPLE_SESSION_TOKEN=${token}\nGIT_EDITOR=true` },
    { value: accessKeyId, text: `AWS_ACCESS_KEY_ID=${accessKeyId}` },
    { value: awsSecret, text: `[default]\naws_secret_access_key = ${awsSecret}\n` },
    { value: awsSecret, text: `AWS_SECRET_ACCESS_KEY="${awsSecret}"` },
    inHeader(mixed(24)),
    inHeader(`sk-ant-api03-${alphanumeric(40)}`),
    inHeader(`ghp_${alphanumeric(36)}`),
    inHeader(`eyJ${alphanumeric(20)}.${alphanumeric(30)}.${alphanumeric(25)}`),
    { value: mixed(48), text: "the response held" },
    { value: hex(64), text: "a digest of" },
  ].map(({ value, text }) => ({ value, text: text.includes(value) ? text : `${text} ${value}`.trim() }));
}

function substrings(value: string, length = 8): string[] {
  return Array.from({ length: Math.max(0, value.length - length + 1) }, (_, start) => value.slice(start, start + length));
}

describe("redaction", () => {
  it("never lets a value through, whole or in part", () => {
    for (let round = 0; round < 50; round++) {
      for (const { value, text } of secretsInContext()) {
        const redacted = redact(text);
        for (const piece of substrings(value)) expect(redacted).not.toContain(piece);
      }
    }
  });

  it("redacts named values in JSON, code and URLs", () => {
    const secret = mixed(20);
    for (const text of [
      `{"apiKey": "${secret}"}`,
      `const client = new Client({ apiKey: "${secret}" });`,
      `api_key = '${secret}'`,
      `fetch("/api?token=${secret}")`,
      `Authorization: Bearer ${secret}`,
    ]) {
      expect(redact(text)).not.toContain(secret);
    }
  });

  it("redacts a private key block", () => {
    const body = base64(64);
    expect(redact(`-----BEGIN RSA PRIVATE KEY-----\n${body}\n-----END RSA PRIVATE KEY-----`)).not.toContain(body);
  });

  it("redacts every string inside a value", () => {
    const token = hex(32);
    const redacted = redactDeep({ input: { command: `X_TOKEN=${token}` }, lines: [`Bearer ${mixed(30)}`] });
    expect(JSON.stringify(redacted)).not.toContain(token);
  });

  it("marks the tests' fake key", () => {
    const { redacted, matches } = scanText('accessKeyId: "AKIAFAKEFORTESTSONLY", secretAccessKey: "fake-secret-for-tests-only"');
    expect(matches.map(({ kind, knownFake }) => ({ kind, knownFake }))).toEqual([
      { kind: "AWS access key id", knownFake: true },
      { kind: "named secret", knownFake: true },
    ]);
    expect(redacted).not.toContain("AKIAFAKEFORTESTSONLY");
  });

  it("knows a fake by what it says it is, not by a list", () => {
    const { matches } = scanText(`AWS_ACCESS_KEY_ID=AKIA${"Z".repeat(12)}FAKE KEY_ID=AKIA${"Z9".repeat(8)} TOKEN=a-decoy-that-must-not-be-used`);
    expect(matches.map(({ knownFake }) => knownFake)).toEqual([true, false, true]);
  });

  it("leaves placeholders, code, commit hashes, ids and paths alone", () => {
    for (const text of [
      "AWS_SECRET_ACCESS_KEY=…",
      "AWS_ACCESS_KEY_ID=$AWS_ACCESS_KEY_ID",
      "OPENAI_API_KEY=<your key>",
      "token = provideToken(region)",
      "secretAccessKey: values.AWS_SECRET_ACCESS_KEY!",
      "EXAMPLE_CREDENTIALS_FILE=/tmp/example",
      "commit 0123456789abcdef0123456789abcdef01234567",
      "session 12345678-aaaa-4bbb-8ccc-0123456789ab",
      "/var/folders/xy/abc123def456gh0000gn/T/rtfm-test-abc123",
      '"integrity": "sha512-Abc123Def456Ghi789Jkl012Mno345Pqr678Stu901Vwx234Yz=="',
    ]) {
      expect(scanText(text).matches).toEqual([]);
    }
  });
});

describe("credentialReport", () => {
  it("counts values by kind and shows them only redacted", () => {
    const token = hex(32);
    const event: Event = {
      id: "1",
      time: "2030-01-01T10:00:00.000Z",
      session: "s",
      who: "session: s",
      kind: "tool",
      tool: "Bash",
      input: { command: "env" },
      result: `HOME=/home/example\nEXAMPLE_SESSION_TOKEN=${token}\nAWS_ACCESS_KEY_ID=AKIAFAKEFORTESTSONLY`,
    };
    const report = credentialReport([event]);
    expect(report).toMatchObject({
      total: 2,
      knownFake: 1,
      byKind: { "named secret": { total: 1, knownFake: 0 }, "AWS access key id": { total: 1, knownFake: 1 } },
    });
    expect(report.findings[0]).toMatchObject({ field: "result", shape: "32 characters: lower, digits" });
    expect(JSON.stringify(report)).not.toContain(token);
    expect(JSON.stringify(report)).not.toContain("AKIAFAKEFORTESTSONLY");
  });
});
