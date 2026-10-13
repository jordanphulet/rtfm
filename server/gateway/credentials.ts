import { execFileSync } from "node:child_process";
import { readFileSync, realpathSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parseEnv } from "node:util";
import { isErrorCode } from "../storage/files.ts";

export interface AwsCredentials {
  accessKeyId: string;
  secretAccessKey: string;
  region: string;
}

const REQUIRED_NAMES = ["AWS_ACCESS_KEY_ID", "AWS_SECRET_ACCESS_KEY", "AWS_REGION"] as const;

const REPO_ROOT = fileURLToPath(new URL("../..", import.meta.url));

/**
 * When `dir` is the top of a normal checkout or of a linked worktree, the main checkout's root,
 * so every worktree shares one `.env.local`. Otherwise, or without git, it is `dir`.
 */
export function mainCheckoutRoot(dir: string): string {
  try {
    const [topLevel, commonDir] = git(dir, [
      "rev-parse",
      "--path-format=absolute",
      "--show-toplevel",
      "--git-common-dir",
    ])
      .trim()
      .split("\n");
    const isCheckoutTop = topLevel === realpathSync(dir) && path.basename(commonDir) === ".git";
    return isCheckoutTop ? path.dirname(commonDir) : dir;
  } catch {
    return dir;
  }
}

function git(dir: string, args: string[]): string {
  return execFileSync("git", args, {
    cwd: dir,
    env: environmentWithoutGitVariables(),
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
    timeout: 5_000,
  });
}

function environmentWithoutGitVariables(): NodeJS.ProcessEnv {
  return Object.fromEntries(
    Object.entries(process.env).filter(([name]) => !name.startsWith("GIT_")),
  );
}

export const ENV_LOCAL_FILE = pathToFileURL(
  path.join(mainCheckoutRoot(REPO_ROOT), ".env.local"),
);

export class CredentialsMissing extends Error {
  constructor(file: URL, missingNames: readonly string[]) {
    super(
      `${file.pathname} must set ${missingNames.join(", ")}; ` +
        "the Bedrock models (the section writer, the librarian and the planner) can't run without them",
    );
  }
}

export function readAwsCredentials(file: URL = ENV_LOCAL_FILE): AwsCredentials {
  const values = parseEnv(readTextIfExists(file));
  const missingNames = REQUIRED_NAMES.filter((name) => !values[name]?.trim());
  if (missingNames.length > 0) throw new CredentialsMissing(file, missingNames);
  return {
    accessKeyId: values.AWS_ACCESS_KEY_ID!,
    secretAccessKey: values.AWS_SECRET_ACCESS_KEY!,
    region: values.AWS_REGION!,
  };
}

function readTextIfExists(file: URL): string {
  try {
    return readFileSync(file, "utf8");
  } catch (error) {
    if (isErrorCode(error, "ENOENT")) return "";
    throw error;
  }
}
