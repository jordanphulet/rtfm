import { globSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const REPO_ROOT = fileURLToPath(new URL("..", import.meta.url));
const CDK_IMPORT = /["'`](?:aws-cdk-lib|aws-cdk|constructs)(?:\/[^"'`]*)?["'`]/;

describe("the CDK packages", () => {
  it("are imported only in infra/, so they never reach the browser bundle or the server", () => {
    const files = globSync("{*.ts,{src,server,scripts}/**/*.{ts,tsx}}", { cwd: REPO_ROOT });
    expect(files).toContain("server/main.ts");
    const importers = files.filter((file) => CDK_IMPORT.test(readFileSync(`${REPO_ROOT}/${file}`, "utf8")));
    expect(importers).toEqual([]);
  });
});
