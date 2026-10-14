import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { once } from "node:events";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { ACCOUNT } from "./rtfm.ts";
import { awsEnvironment, cdkConfigProblem, identityProblem, profileFor, refusal } from "./run-aws.ts";

const SCRIPT = fileURLToPath(new URL("./run-aws.ts", import.meta.url));
const REPO_ROOT = fileURLToPath(new URL("..", import.meta.url));
const CDK_CONFIG = fileURLToPath(new URL("./cdk.json", import.meta.url));

/**
 * Stands in for the AWS CLI: answers the identity check, then records itself and waits. It renames
 * the record into place, so the test never reads it half written.
 */
const FAKE_AWS = `#!${process.execPath}
const fs = require("node:fs");
const args = process.argv.slice(2);
if (args[0] === "sts") {
  console.log(JSON.stringify({ Arn: process.env.FAKE_ARN }));
} else {
  const started = { pid: process.pid, home: process.env.HOME, args };
  const partial = process.env.FAKE_STARTED + ".partial";
  fs.writeFileSync(partial, JSON.stringify(started));
  fs.renameSync(partial, process.env.FAKE_STARTED);
  setInterval(() => {}, 1000);
}
`;

describe("awsEnvironment", () => {
  const inherited = {
    PATH: "/usr/bin",
    HOME: "/Users/someone",
    AWS_ACCESS_KEY_ID: "AKIAWORK",
    AWS_SECRET_ACCESS_KEY: "work-secret",
    AWS_SESSION_TOKEN: "work-token",
    AWS_PROFILE: "work-admin",
    AWS_DEFAULT_PROFILE: "work-admin",
    AWS_CONTAINER_CREDENTIALS_FULL_URI: "http://169.254.170.2/creds",
    AWS_REGION: "eu-west-1",
  };

  const setting = { home: "/Users/someone", cliHome: "/tmp/rtfm-aws-home-1", profile: "rtfm-read" };

  it("drops every AWS setting it inherits, points at RTFM's own files, and empties HOME", () => {
    expect(awsEnvironment(inherited, setting)).toEqual({
      PATH: "/usr/bin",
      HOME: "/tmp/rtfm-aws-home-1",
      AWS_CONFIG_FILE: "/Users/someone/.aws/rtfm/config",
      AWS_SHARED_CREDENTIALS_FILE: "/Users/someone/.aws/rtfm/credentials",
      AWS_PROFILE: "rtfm-read",
      AWS_EC2_METADATA_DISABLED: "true",
      CDK_DISABLE_VERSION_CHECK: "1",
      CDK_DISABLE_CLI_TELEMETRY: "1",
    });
  });

  it("sets no profile for a command that needs no credentials", () => {
    const env = awsEnvironment(inherited, { ...setting, profile: undefined });
    expect(Object.keys(env).filter((name) => name.includes("PROFILE"))).toEqual([]);
  });
});

describe("profileFor", () => {
  it("reads with rtfm-read, deploys with rtfm-deploy, and synthesizes with no profile", () => {
    expect(profileFor("aws", ["logs", "tail", "rtfm-server"])).toBe("rtfm-read");
    expect(profileFor("cdk", ["diff", "RtfmApp"])).toBe("rtfm-read");
    expect(profileFor("cdk", ["deploy", "RtfmApp"])).toBe("rtfm-deploy");
    expect(profileFor("cdk", ["destroy", "RtfmApp", "--verbose"])).toBe("rtfm-deploy");
    expect(profileFor("cdk", ["synth"])).toBeUndefined();
    expect(profileFor("cdk", ["ls"])).toBeUndefined();
  });
});

describe("refusal", () => {
  it("refuses an option before the command, whose value could pass for the command", () => {
    expect(refusal("aws", ["--output", "json", "configure", "get", "aws_secret_access_key"])).toMatch(/first/);
    expect(refusal("cdk", ["--app", "x", "deploy"])).toMatch(/first/);
    expect(refusal("cdk", ["-o", "synth", "deploy"])).toMatch(/first/);
    expect(refusal("aws", [])).toMatch(/first/);
  });

  it("refuses a profile of the caller's choosing, by any prefix of --profile", () => {
    expect(refusal("aws", ["s3", "ls", "--profile", "work-admin"])).toMatch(/--profile/);
    expect(refusal("aws", ["s3", "ls", "--prof", "work-admin"])).toMatch(/--profile/);
    expect(refusal("cdk", ["deploy", "--profile=work-admin"])).toMatch(/--profile/);
    for (const prefix of ["--p", "--pr", "--pro", "--pro=work-admin"]) {
      expect(refusal("aws", ["s3", "ls", prefix, "work-admin"]), prefix).toMatch(/--profile/);
    }
    expect(refusal("aws", ["s3api", "list-objects", "--prefix", "manuals/"])).toBeUndefined();
  });

  it("refuses aws configure wherever it appears", () => {
    expect(refusal("aws", ["configure", "list"])).toMatch(/~\/\.aws/);
    expect(refusal("aws", ["s3", "configure"])).toMatch(/~\/\.aws/);
  });

  it("lets a command through that names itself first", () => {
    expect(refusal("aws", ["sts", "get-caller-identity", "--output", "json"])).toBeUndefined();
    expect(refusal("cdk", ["deploy", "RtfmApp"])).toBeUndefined();
  });
});

describe("cdkConfigProblem", () => {
  it("refuses a cdk.json that names a profile, which would beat the wrapper's", () => {
    expect(cdkConfigProblem({ app: "node app.ts", profile: "work-admin" })).toMatch(/profile/);
    expect(cdkConfigProblem(JSON.parse(readFileSync(CDK_CONFIG, "utf8")))).toBeUndefined();
  });
});

describe("identityProblem", () => {
  const identity = (arn: string) => JSON.stringify({ Account: ACCOUNT, Arn: arn });

  it("accepts only the chosen RTFM role in RTFM's account", () => {
    expect(identityProblem(identity(`arn:aws:sts::${ACCOUNT}:assumed-role/rtfm-read/botocore-session-1`), "rtfm-read"))
      .toBeUndefined();
    expect(identityProblem(identity(`arn:aws:sts::${ACCOUNT}:assumed-role/rtfm-read/s`), "rtfm-deploy")).toMatch(
      /not as rtfm-deploy/,
    );
    expect(identityProblem(identity(`arn:aws:sts::111122223333:assumed-role/rtfm-read/s`), "rtfm-read")).toMatch(
      new RegExp(`account ${ACCOUNT}`),
    );
    expect(identityProblem(identity(`arn:aws:iam::${ACCOUNT}:user/rtfm-agent`), "rtfm-read")).toBeDefined();
    expect(identityProblem("not json", "rtfm-read")).toMatch(/JSON/);
  });
});

describe("npm run aws and npm run cdk", () => {
  it("refuse before running anything", () => {
    const result = spawnSync(process.execPath, [SCRIPT, "aws", "s3", "ls", "--profile", "work-admin"], {
      encoding: "utf8",
    });
    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/^Refused: Don't pass --profile/);
  });

  it("need aws or cdk", () => {
    const result = spawnSync(process.execPath, [SCRIPT, "terraform"], { encoding: "utf8" });
    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/^Usage/);
  });

  describe("with a stand-in for the AWS CLI", { timeout: 30_000 }, () => {
    let folder = "";
    let fakePid: number | undefined;
    afterEach(() => {
      if (fakePid !== undefined && isRunning(fakePid)) process.kill(fakePid);
      fakePid = undefined;
      rmSync(folder, { recursive: true, force: true });
    });

    function startWrapper(arn: string, command: string[] = [process.execPath, SCRIPT, "aws", "s3", "ls"]) {
      folder = mkdtempSync(path.join(os.tmpdir(), "rtfm-run-aws-test-"));
      const bin = path.join(folder, "bin");
      const tmp = path.join(folder, "tmp");
      mkdirSync(bin);
      mkdirSync(tmp);
      writeFileSync(path.join(bin, "aws"), FAKE_AWS, { mode: 0o755 });
      const started = path.join(folder, "started.json");
      const env = { ...process.env, PATH: `${bin}:${process.env.PATH}`, TMPDIR: tmp, FAKE_ARN: arn, FAKE_STARTED: started };
      const [file, ...args] = command;
      const wrapper = spawn(file, args, { env, stdio: "ignore", cwd: REPO_ROOT });
      return { wrapper, tmp, started };
    }

    async function until(condition: () => boolean): Promise<void> {
      for (let waited = 0; !condition(); waited += 25) {
        if (waited > 10_000) throw new Error("Timed out");
        await new Promise((resolve) => setTimeout(resolve, 25));
      }
    }

    function isRunning(pid: number): boolean {
      try {
        process.kill(pid, 0);
        return true;
      } catch {
        return false;
      }
    }

    it("stops the command and removes its HOME when the wrapper is signalled", async () => {
      const { wrapper, started } = startWrapper(`arn:aws:sts::${ACCOUNT}:assumed-role/rtfm-read/session`);
      await until(() => existsSync(started));
      const { pid, home } = JSON.parse(readFileSync(started, "utf8"));
      fakePid = pid;
      expect(existsSync(home)).toBe(true);

      const exited = once(wrapper, "exit");
      wrapper.kill("SIGTERM");
      await exited;
      await until(() => !isRunning(pid));
      expect(existsSync(home)).toBe(false);
    });

    it("passes every argument after npm run's -- to the command exactly as given, and a signal too", async () => {
      const given = [
        "cloudformation",
        "describe-stacks",
        "--query",
        "Stacks[0].{Status:StackStatus,Protected:EnableTerminationProtection}",
        "x{1..3}",
        "a b",
        `"double" 'single' it's`,
        "$HOME ${PATH} $(id)",
        "*",
        "package.jso[n]",
        "!",
        "=x",
        "a=b",
        "",
      ];
      const { wrapper, started } = startWrapper(`arn:aws:sts::${ACCOUNT}:assumed-role/rtfm-read/session`, [
        "npm",
        "run",
        "--silent",
        "aws",
        "--",
        ...given,
      ]);
      await until(() => existsSync(started));
      const { pid, args } = JSON.parse(readFileSync(started, "utf8"));
      fakePid = pid;
      expect(args).toEqual(given);

      const exited = once(wrapper, "exit");
      wrapper.kill("SIGTERM");
      await exited;
      await until(() => !isRunning(pid));
    });

    it("removes its HOME when it refuses the identity", async () => {
      const { wrapper, tmp } = startWrapper(`arn:aws:sts::${ACCOUNT}:assumed-role/work-admin/session`);
      const [code] = await once(wrapper, "exit");
      expect(code).toBe(1);
      expect(readdirSync(tmp)).toEqual([]);
    });
  });
});
