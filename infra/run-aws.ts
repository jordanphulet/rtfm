import { type ChildProcess, spawn, spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, realpathSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ACCOUNT, DEPLOY_ROLE, READ_ROLE } from "./rtfm.ts";

const INFRA_DIR = path.dirname(fileURLToPath(import.meta.url));
const USAGE = "Usage: npm run aws -- <command> [arguments], or npm run cdk -- <command> [arguments]";

/** `cdk` commands that never reach AWS, so they run with no profile. */
const OFFLINE_CDK_COMMANDS = new Set(["synth", "synthesize", "ls", "list"]);
const DEPLOY_CDK_COMMANDS = new Set(["deploy", "destroy"]);
const FORWARDED_SIGNALS = ["SIGINT", "SIGTERM", "SIGHUP"] as const;

type Tool = "aws" | "cdk";

function isTool(value: string | undefined): value is Tool {
  return value === "aws" || value === "cdk";
}

/** The RTFM role a command acts as, or none for a `cdk` command that never reaches AWS. */
export function profileFor(tool: Tool, [command]: string[]): string | undefined {
  if (tool === "aws") return READ_ROLE;
  if (OFFLINE_CDK_COMMANDS.has(command)) return undefined;
  return DEPLOY_CDK_COMMANDS.has(command) ? DEPLOY_ROLE : READ_ROLE;
}

/** Whether an argument is `--profile`, or a prefix of it the AWS CLI would take for it. */
function namesProfile(arg: string): boolean {
  const name = arg.split("=")[0];
  return name.startsWith("--profile") || (name.startsWith("--p") && "--profile".startsWith(name));
}

/**
 * Why a command may not run, if it may not. The command must come first, so an option's value is
 * never taken for it.
 */
export function refusal(tool: Tool, args: string[]): string | undefined {
  if (args.length === 0 || args[0].startsWith("-")) {
    return "Name the command first, before any option.";
  }
  if (args.some(namesProfile)) {
    return "Don't pass --profile: the wrapper chooses rtfm-read, or rtfm-deploy for cdk deploy and destroy.";
  }
  if (tool === "aws" && args.includes("configure")) {
    return "aws configure reads and writes the files under ~/.aws, which agents never touch.";
  }
  return undefined;
}

/** Why `infra/cdk.json` may not be used, if it may not: a profile there would beat the wrapper's. */
export function cdkConfigProblem(config: Record<string, unknown>): string | undefined {
  return "profile" in config ? "infra/cdk.json names a profile; the wrapper chooses it." : undefined;
}

type Setting = { home: string; cliHome: string; profile: string | undefined };

/**
 * The environment a command runs in: none of the caller's AWS settings, RTFM's own config and
 * credentials files, and the profile chosen for it. `HOME` is an empty folder, so the AWS CLI's
 * aliases and credential cache (`~/.aws/cli/`) and the CDK CLI's `~/.cdk.json` don't apply.
 */
export function awsEnvironment(inherited: NodeJS.ProcessEnv, { home, cliHome, profile }: Setting) {
  const env: NodeJS.ProcessEnv = Object.fromEntries(
    Object.entries(inherited).filter(([name]) => !name.startsWith("AWS_")),
  );
  env.HOME = cliHome;
  env.AWS_CONFIG_FILE = path.join(home, ".aws", "rtfm", "config");
  env.AWS_SHARED_CREDENTIALS_FILE = path.join(home, ".aws", "rtfm", "credentials");
  env.AWS_EC2_METADATA_DISABLED = "true";
  env.CDK_DISABLE_VERSION_CHECK = "1";
  env.CDK_DISABLE_CLI_TELEMETRY = "1";
  if (profile) env.AWS_PROFILE = profile;
  return env;
}

/** Why `sts get-caller-identity`'s output isn't the given RTFM role in RTFM's account, if it isn't. */
export function identityProblem(callerIdentity: string, role: string): string | undefined {
  let arn: unknown;
  try {
    arn = JSON.parse(callerIdentity).Arn;
  } catch {
    return "sts get-caller-identity didn't answer with JSON.";
  }
  const expected = `arn:aws:sts::${ACCOUNT}:assumed-role/${role}/`;
  if (typeof arn === "string" && arn.startsWith(expected)) return undefined;
  return `This acts as ${String(arn)}, not as ${role} in account ${ACCOUNT}.`;
}

function checkIdentity(env: NodeJS.ProcessEnv, role: string): string | undefined {
  const result = spawnSync("aws", ["sts", "get-caller-identity", "--output", "json"], { env, encoding: "utf8" });
  if (result.error) return `Couldn't run aws: ${result.error.message}`;
  if (result.status !== 0) return `Couldn't check who this acts as:\n${result.stderr.trim()}`;
  return identityProblem(result.stdout, role);
}

function commandLine(tool: Tool, args: string[]): { file: string; args: string[]; cwd?: string } {
  if (tool === "aws") return { file: "aws", args };
  const cdk = createRequire(import.meta.url).resolve("aws-cdk/bin/cdk");
  return { file: process.execPath, args: [cdk, ...args], cwd: INFRA_DIR };
}

function readCdkConfig(): Record<string, unknown> {
  return JSON.parse(readFileSync(path.join(INFRA_DIR, "cdk.json"), "utf8"));
}

function main([tool, ...args]: string[]): void {
  if (!isTool(tool)) {
    console.error(USAGE);
    process.exitCode = 1;
    return;
  }
  const problem = refusal(tool, args) ?? (tool === "cdk" ? cdkConfigProblem(readCdkConfig()) : undefined);
  if (problem) {
    console.error(`Refused: ${problem}`);
    process.exitCode = 1;
    return;
  }
  const command = commandLine(tool, args);
  const profile = profileFor(tool, args);

  // The empty HOME can hold cached role sessions, so it goes however the wrapper ends.
  const cliHome = mkdtempSync(path.join(os.tmpdir(), "rtfm-aws-home-"));
  process.on("exit", () => rmSync(cliHome, { recursive: true, force: true }));
  let child: ChildProcess | undefined;
  for (const signal of FORWARDED_SIGNALS) {
    process.on(signal, () => (child ? child.kill(signal) : process.exit(1)));
  }

  const env = awsEnvironment(process.env, { home: os.homedir(), cliHome, profile });
  const identity = profile && checkIdentity(env, profile);
  if (identity) {
    console.error(`Refused: ${identity}`);
    process.exitCode = 1;
    return;
  }
  child = spawn(command.file, command.args, { env, stdio: "inherit", cwd: command.cwd });
  child.on("error", (error) => {
    console.error(`Couldn't run ${tool}: ${error.message}`);
    process.exitCode = 1;
  });
  child.on("exit", (code) => {
    process.exitCode = code ?? 1;
  });
}

if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2));
}
