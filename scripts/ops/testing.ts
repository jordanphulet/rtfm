import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { onTestFinished } from "vitest";
import { openAwsSession } from "../../infra/run-aws.ts";
import { ACCOUNT } from "../../infra/rtfm.ts";
import type { DynamoDbTable } from "../../server/storage/dynamodb-manual-store.ts";
import { DYNAMODB_LOCAL_CREDENTIALS } from "../../server/storage/dynamodb-testing.ts";
import type { OpsContext } from "./context.ts";

/** What the stand-in answers to a command whose arguments start with `args`. */
export interface StandInAnswer {
  args: string[];
  stdout?: unknown;
  /** Written as it is, in place of `stdout` as JSON. */
  rawStdout?: string;
  stderr?: string;
  code?: number;
  /** Writes its PID and `HOME` to the file `StandIn.hung` names, then never answers. */
  hang?: boolean;
}

/** One command the stand-in was given, with the settings it ran with. */
export interface StandInCall {
  args: string[];
  profile: string | undefined;
  home: string;
  callerKey: string | undefined;
}

/**
 * Stands in for the AWS CLI. It records each command, then answers with the first answer whose
 * arguments start the command's; otherwise the identity check with the profile's role, and
 * `configure export-credentials` with DynamoDB Local's key, which sees the tests' tables. A hung
 * command renames its record into place, so the test never reads it half written.
 */
const STAND_IN_AWS = `#!${process.execPath}
const fs = require("node:fs");
const args = process.argv.slice(2);
const env = process.env;
const call = { args, profile: env.AWS_PROFILE, home: env.HOME, callerKey: env.AWS_ACCESS_KEY_ID };
fs.appendFileSync(env.STAND_IN_CALLS, JSON.stringify(call) + "\\n");
const answers = JSON.parse(fs.readFileSync(env.STAND_IN_ANSWERS, "utf8"));
const answer = answers.find((answer) => answer.args.every((arg, i) => args[i] === arg));
if (answer && answer.hang) {
  const partial = env.STAND_IN_HUNG + ".partial";
  fs.writeFileSync(partial, JSON.stringify({ pid: process.pid, home: env.HOME }));
  fs.renameSync(partial, env.STAND_IN_HUNG);
  setInterval(() => {}, 1000);
} else if (answer) {
  if (answer.rawStdout !== undefined) process.stdout.write(answer.rawStdout);
  else if (answer.stdout !== undefined) process.stdout.write(JSON.stringify(answer.stdout));
  if (answer.stderr) process.stderr.write(answer.stderr);
  process.exit(answer.code ?? 0);
}
else if (args[0] === "sts" && args[1] === "get-caller-identity") {
  console.log(JSON.stringify({ Arn: "arn:aws:sts::${ACCOUNT}:assumed-role/" + env.AWS_PROFILE + "/session" }));
} else if (args[0] === "configure" && args[1] === "export-credentials") {
  const keys = { AccessKeyId: "${DYNAMODB_LOCAL_CREDENTIALS.accessKeyId}", SecretAccessKey: "secret", SessionToken: "token" };
  console.log(JSON.stringify({ Version: 1, ...keys, Expiration: "2026-10-13T20:00:00Z" }));
} else {
  process.stderr.write("The stand-in has no answer for aws " + args.join(" "));
  process.exit(252);
}
`;

export interface StandIn {
  context: OpsContext;
  /** The commands the stand-in was given, in order. */
  calls(): StandInCall[];
  /** The environment that puts the stand-in first on the `PATH`, for running `npm run ops` itself. */
  env: NodeJS.ProcessEnv;
  /** The file a hung command records itself in. */
  hung: string;
}

/**
 * An ops context whose sessions run the stand-in for the AWS CLI, with a caller's own AWS key set
 * as a decoy, and whose `rtfm-usage` is the given table in DynamoDB Local.
 */
export function standInAws(
  answers: StandInAnswer[] = [],
  { usageTable, now = new Date("2026-10-13T12:00:00.000Z") }: { usageTable?: DynamoDbTable; now?: Date } = {},
): StandIn {
  const folder = mkdtempSync(path.join(os.tmpdir(), "rtfm-ops-test-"));
  onTestFinished(() => rmSync(folder, { recursive: true, force: true }));
  const bin = path.join(folder, "bin");
  mkdirSync(bin);
  writeFileSync(path.join(bin, "aws"), STAND_IN_AWS, { mode: 0o755 });
  const answersFile = path.join(folder, "answers.json");
  const callsFile = path.join(folder, "calls.jsonl");
  writeFileSync(answersFile, JSON.stringify(answers));
  writeFileSync(callsFile, "");
  const hung = path.join(folder, "hung.json");
  const env = {
    ...process.env,
    PATH: `${bin}${path.delimiter}${process.env.PATH}`,
    AWS_ACCESS_KEY_ID: "AKIACALLERDECOY",
    STAND_IN_ANSWERS: answersFile,
    STAND_IN_CALLS: callsFile,
    STAND_IN_HUNG: hung,
  };
  return {
    hung,
    context: {
      openSession: (role) => openAwsSession(role, env),
      usageTable: (credentials) => {
        if (!usageTable) throw new Error("This test gave no rtfm-usage table");
        return { ...usageTable, credentials: { kind: "keys", ...credentials } };
      },
      now: () => now,
    },
    calls: () =>
      readFileSync(callsFile, "utf8")
        .split("\n")
        .filter(Boolean)
        .map((line) => JSON.parse(line) as StandInCall),
    env,
  };
}
