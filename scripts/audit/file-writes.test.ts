import { describe, expect, it } from "vitest";
import type { Event } from "./events.ts";
import { checkoutPath, shellWrites, writtenFiles } from "./file-writes.ts";

const REPO = "/home/example/app";

const bash = (command: string, cwd = REPO): Event => ({
  id: "e",
  time: "2030-01-01T10:00:00.000Z",
  session: "s1",
  who: "session: Example",
  cwd,
  kind: "tool",
  tool: "Bash",
  input: { command },
});

describe("shellWrites", () => {
  it("reads the files a command writes", () => {
    expect(shellWrites(["echo", "x", ">>", "notes.md"])).toEqual(["notes.md"]);
    expect(shellWrites(["rm", "-rf", "dist", "build"])).toEqual(["dist", "build"]);
    expect(shellWrites(["sed", "-i", "", "s/a/b/", "notes.md"])).toEqual(["notes.md"]);
    expect(shellWrites(["perl", "-pi", "-e", "s/a/b/", "a.md", "b.md"])).toEqual(["a.md", "b.md"]);
    expect(shellWrites(["git", "checkout", "--", "CLAUDE.md"])).toEqual(["CLAUDE.md"]);
  });

  it("takes only the destination of cp and ln", () => {
    expect(shellWrites(["cp", "-r", "CLAUDE.md", "PROCESS.md", "/tmp/backup/"])).toEqual(["/tmp/backup/"]);
    expect(shellWrites(["cp", "-t", "/tmp/backup", "CLAUDE.md"])).toEqual(["/tmp/backup"]);
    expect(shellWrites(["ln", "-s", "/home/example/app/node_modules", "node_modules"])).toEqual(["node_modules"]);
  });

  it("leaves out staging, reading and dry runs", () => {
    expect(shellWrites(["git", "add", "CLAUDE.md"])).toEqual([]);
    expect(shellWrites(["git", "restore", "--staged", "CLAUDE.md"])).toEqual([]);
    expect(shellWrites(["cat", "CLAUDE.md"])).toEqual([]);
  });
});

describe("writtenFiles", () => {
  it("places each file in its checkout, following the script's cd", () => {
    const written = writtenFiles(
      bash("echo x > a.md && cd /tmp/scratch && echo y > b.md && cd /home/example/app/lib && touch c.ts"),
      REPO,
    );
    expect(written).toEqual([
      { file: "a.md", inCheckout: "a.md" },
      { file: "b.md", inCheckout: undefined },
      { file: "c.ts", inCheckout: "lib/c.ts" },
    ]);
  });

  it("can't place a relative file after a cd to an unknown folder", () => {
    expect(writtenFiles(bash("cd $SCRATCH && echo x > a.md"), REPO)).toEqual([{ file: "a.md", inCheckout: undefined }]);
  });
});

describe("checkoutPath", () => {
  it("gives a path within the main checkout or a worktree, and nothing outside the repo", () => {
    expect(checkoutPath("/home/example/app/CLAUDE.md", "/tmp", REPO)).toBe("CLAUDE.md");
    expect(checkoutPath(".claude/worktrees/side-0000/lib/a.ts", REPO, REPO)).toBe("lib/a.ts");
    expect(checkoutPath("../README.md", "/home/example/app/lib", REPO)).toBe("README.md");
    expect(checkoutPath("/tmp/CLAUDE.md", REPO, REPO)).toBeUndefined();
    expect(checkoutPath("~/.claude/settings.json", REPO, REPO)).toBeUndefined();
    expect(checkoutPath("$OUT/CLAUDE.md", REPO, REPO)).toBeUndefined();
  });
});
