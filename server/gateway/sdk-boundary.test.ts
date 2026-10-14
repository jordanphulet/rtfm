import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const REPO_ROOT = fileURLToPath(new URL("../..", import.meta.url));
const SCANNED_FOLDERS = ["src", "server", "scripts"];
const SOURCE_FILE = /\.[cm]?[jt]sx?$/;
const SDK_IMPORT = /["'`]@(?:anthropic-ai|aws-sdk)\//;
const SDK_ADAPTERS = [
  "server/gateway/bedrock-client.ts",
  "server/gateway/dynamodb-spending-ledger.ts",
  "server/storage/dynamodb-link-store.ts",
  "server/storage/dynamodb-manual-store.ts",
];
const CLIENT_IMPORT = /["'`][^"'`\n]*\bbedrock-client(?:\.[cm]?[jt]s)?["'`]/;

function mayImportClient(file: string): boolean {
  return file.startsWith("server/gateway/") || file === "server/app.ts";
}

async function sourceFilesIn(folder: string, recursive: boolean): Promise<string[]> {
  const entries = await readdir(path.join(REPO_ROOT, folder), { withFileTypes: true, recursive });
  return entries
    .filter((entry) => entry.isFile() && SOURCE_FILE.test(entry.name))
    .map((entry) => path.relative(REPO_ROOT, path.join(entry.parentPath, entry.name)));
}

async function allSourceFiles(): Promise<string[]> {
  const nested = await Promise.all(SCANNED_FOLDERS.map((folder) => sourceFilesIn(folder, true)));
  return [...(await sourceFilesIn(".", false)), ...nested.flat()];
}

async function filesMatching(pattern: RegExp): Promise<string[]> {
  const files = await allSourceFiles();
  expect(files).toContain("vite.config.ts");
  const matching: string[] = [];
  for (const file of files) {
    if (pattern.test(await readFile(path.join(REPO_ROOT, file), "utf8"))) matching.push(file);
  }
  return matching;
}

describe("SDK boundary", () => {
  it(`lets only the SDK adapters (${SDK_ADAPTERS.join(", ")}) name the Anthropic or AWS SDKs`, async () => {
    expect((await filesMatching(SDK_IMPORT)).sort()).toEqual([...SDK_ADAPTERS].sort());
  });

  it("lets only the gateway and app.ts import the Bedrock client, so every call goes through the caps", async () => {
    const importers = await filesMatching(CLIENT_IMPORT);
    expect(importers).toContain("server/gateway/bedrock-client.test.ts");
    expect(importers.filter((file) => !mayImportClient(file))).toEqual([]);
  });

  it("recognizes every form of import", () => {
    // Built from parts so that this file doesn't count as an importer itself.
    const anthropic = "@anthropic-ai";
    const aws = "@aws-sdk";
    const imports = [
      `import AnthropicBedrock from "${anthropic}/bedrock-sdk";`,
      `import type { Message } from '${anthropic}/sdk/resources';`,
      `export { x } from "${anthropic}/sdk";`,
      `import "${aws}/credential-providers";`,
      `const sdk = await import("${aws}/client-bedrock-runtime");`,
      `const sdk = require("${anthropic}/sdk");`,
      `const sdk = await import(\`${anthropic}/bedrock-sdk\`);`,
    ];
    for (const line of imports) expect(line).toMatch(SDK_IMPORT);
  });
});
