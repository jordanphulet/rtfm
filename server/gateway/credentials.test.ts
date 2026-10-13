import { execFileSync } from "node:child_process";
import { mkdirSync, realpathSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { tempDataDir } from "../testing.ts";
import { CredentialsMissing, mainCheckoutRoot, readAwsCredentials } from "./credentials.ts";

const FAKE_KEY_ID = "AKIAFAKEFORTESTSONLY";
const FAKE_SECRET = "fake-secret-for-tests-only";

describe("AWS credentials", () => {
  let envFile: URL;

  beforeEach(async () => {
    envFile = pathToFileURL(path.join(await tempDataDir(), ".env.local"));
    vi.stubEnv("AWS_ACCESS_KEY_ID", undefined);
    vi.stubEnv("AWS_SECRET_ACCESS_KEY", undefined);
    vi.stubEnv("AWS_REGION", undefined);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  async function writeEnv(text: string) {
    await writeFile(envFile, text);
  }

  it("reads exactly the three keys from the file, without touching process.env", async () => {
    await writeEnv(
      [
        `AWS_ACCESS_KEY_ID=${FAKE_KEY_ID}`,
        `AWS_SECRET_ACCESS_KEY="${FAKE_SECRET}"`,
        "AWS_REGION=us-west-2",
        "AWS_PROFILE=some-profile",
        "BEDROCK_MODEL_ID=ignored",
      ].join("\n"),
    );

    expect(readAwsCredentials(envFile)).toEqual({
      accessKeyId: FAKE_KEY_ID,
      secretAccessKey: FAKE_SECRET,
      region: "us-west-2",
    });
    expect(process.env.AWS_ACCESS_KEY_ID).toBeUndefined();
    expect(process.env.AWS_SECRET_ACCESS_KEY).toBeUndefined();
  });

  it("refuses when a key is missing or empty, naming the variables and every model that needs them, but never the values", async () => {
    await writeEnv(`AWS_ACCESS_KEY_ID=${FAKE_KEY_ID}\nAWS_SECRET_ACCESS_KEY=\nAWS_REGION="  "\n`);

    let error: unknown;
    try {
      readAwsCredentials(envFile);
    } catch (caught) {
      error = caught;
    }
    expect(error).toBeInstanceOf(CredentialsMissing);
    const message = (error as Error).message;
    expect(message).toContain("AWS_SECRET_ACCESS_KEY, AWS_REGION");
    expect(message).toContain("the section writer, the librarian and the planner");
    expect(message).not.toContain("AWS_ACCESS_KEY_ID");
    expect(message).not.toContain(FAKE_KEY_ID);
  });

  it("refuses when the file doesn't exist, even if the keys are in process.env", () => {
    vi.stubEnv("AWS_ACCESS_KEY_ID", FAKE_KEY_ID);
    vi.stubEnv("AWS_SECRET_ACCESS_KEY", FAKE_SECRET);
    vi.stubEnv("AWS_REGION", "us-west-2");

    expect(() => readAwsCredentials(envFile)).toThrow(
      /AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_REGION/,
    );
  });
});

describe("the folder that holds .env.local", () => {
  let folder: string;
  let main: string;
  let worktree: string;

  beforeEach(async () => {
    folder = realpathSync(await tempDataDir());
    main = path.join(folder, "main");
    worktree = path.join(folder, "worktree");
    git(folder, "init", "--quiet", "--initial-branch=main", main);
    git(main, "config", "user.name", "Test User");
    git(main, "config", "user.email", "test@example.com");
    git(main, "config", "commit.gpgsign", "false");
    git(main, "commit", "--quiet", "--no-verify", "--allow-empty", "-m", "Start");
    git(main, "worktree", "add", "--quiet", "-b", "task", worktree);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  function git(dir: string, ...args: string[]) {
    const env = Object.fromEntries(
      Object.entries(process.env).filter(([name]) => !name.startsWith("GIT_")),
    );
    execFileSync("git", args, {
      cwd: dir,
      env,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
  }

  it("is the main checkout, from a linked worktree", () => {
    expect(mainCheckoutRoot(worktree)).toBe(main);
  });

  it("is the main checkout, from the main checkout", () => {
    expect(mainCheckoutRoot(main)).toBe(main);
  });

  it("is the given folder, outside a git repo", async () => {
    const notARepo = await tempDataDir();
    expect(mainCheckoutRoot(notARepo)).toBe(notARepo);
  });

  it("is the given folder, when git can't be run", () => {
    vi.stubEnv("PATH", "");
    expect(mainCheckoutRoot(worktree)).toBe(worktree);
  });

  it("ignores a GIT_DIR that points to another repo", () => {
    const other = path.join(folder, "other");
    git(folder, "init", "--quiet", other);
    vi.stubEnv("GIT_DIR", path.join(other, ".git"));
    expect(mainCheckoutRoot(main)).toBe(main);
  });

  it("is the given folder, when it is a plain folder inside a repo", () => {
    const plain = path.join(main, "plain");
    mkdirSync(plain);
    expect(mainCheckoutRoot(plain)).toBe(plain);
  });

  it("is the given folder, when its repo keeps its git folder elsewhere", () => {
    const separate = path.join(folder, "separate");
    const separateGitDir = path.join(folder, "separate-git");
    git(folder, "init", "--quiet", "--separate-git-dir", separateGitDir, separate);
    expect(mainCheckoutRoot(separate)).toBe(separate);
  });
});
