import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it, onTestFinished } from "vitest";
import { noticesFor, packageDirOf } from "./third-party-notices.ts";

async function fixturePackage(dir: string, packageJson: object, files: Record<string, string> = {}): Promise<void> {
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, "package.json"), JSON.stringify(packageJson));
  for (const [name, text] of Object.entries(files)) await writeFile(path.join(dir, name), text);
}

describe("packageDirOf", () => {
  it("gives the folder of the package a module is in", () => {
    const modules = path.join("/repo", "node_modules");
    expect(packageDirOf(path.join(modules, "react", "cjs", "react.js"))).toBe(path.join(modules, "react"));
    expect(packageDirOf(path.join(modules, "@scope", "pkg", "lib", "index.js"))).toBe(path.join(modules, "@scope", "pkg"));
    const nested = path.join(modules, "outer", "node_modules", "inner");
    expect(packageDirOf(`\0${path.join(nested, "index.css")}?inline`)).toBe(nested);
  });

  it("gives nothing for a module outside node_modules", () => {
    expect(packageDirOf(path.join("/repo", "src", "main.tsx"))).toBeUndefined();
    expect(packageDirOf("\0vite/preload-helper.js")).toBeUndefined();
  });
});

describe("noticesFor", () => {
  it("lists each package once, sorted, with its license and its license and notice files", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "rtfm-notices-test-"));
    onTestFinished(() => rm(root, { recursive: true, force: true }));
    const modules = path.join(root, "node_modules");
    await fixturePackage(path.join(modules, "zebra"), { name: "zebra", version: "1.0.0", license: "MIT" }, {
      LICENSE: "MIT License, Copyright Zebra\n",
    });
    await fixturePackage(path.join(modules, "@scope", "apache"), { name: "@scope/apache", version: "2.0.0", license: "Apache-2.0" }, {
      "LICENSE.txt": "Apache License 2.0",
      NOTICE: "Apache notice",
      "README.md": "not a license",
    });
    await fixturePackage(path.join(modules, "bare"), { name: "bare", version: "3.0.0", license: "ISC", author: { name: "A. Author" } });
    await fixturePackage(path.join(modules, "zebra", "node_modules", "bare"), { name: "bare", version: "3.0.0", license: "ISC" });

    const notices = noticesFor([
      path.join(modules, "zebra", "index.js"),
      path.join(modules, "zebra", "lib", "more.js"),
      path.join(modules, "@scope", "apache", "index.js"),
      path.join(modules, "bare", "index.js"),
      path.join(modules, "zebra", "node_modules", "bare", "index.js"),
      path.join(root, "src", "main.tsx"),
    ]);

    const rule = "-".repeat(80);
    expect(notices).toBe(
      [
        "The packages below are bundled into this build, each under its own license.",
        `${rule}\n@scope/apache@2.0.0 (Apache-2.0)\n\nApache License 2.0\n\nApache notice`,
        `${rule}\nbare@3.0.0 (ISC)\n\nThe package has no license or notice file. Its package.json gives the license as ISC, by A. Author.`,
        `${rule}\nzebra@1.0.0 (MIT)\n\nMIT License, Copyright Zebra`,
      ].join("\n\n") + "\n",
    );
  });
});
