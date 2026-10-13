import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import path from "node:path";
import { describe, expect, it, onTestFinished } from "vitest";
import { tempDataDir } from "../server/testing.ts";
import { fetchDynamoDbLocal } from "./fetch-dynamodb-local.ts";

/** A small archive shaped as AWS's, served from loopback. */
async function servedArchive(): Promise<{ url: string; sha256: string; requests: () => number }> {
  const folder = await tempDataDir();
  const contents = path.join(folder, "contents");
  await mkdir(path.join(contents, "DynamoDBLocal_lib"), { recursive: true });
  await writeFile(path.join(contents, "DynamoDBLocal.jar"), "a jar");
  const archiveFile = path.join(folder, "archive.tar.gz");
  execFileSync("tar", ["-czf", archiveFile, "-C", contents, "."]);
  const archive = await readFile(archiveFile);

  let requests = 0;
  const server = createServer((_, response) => {
    requests++;
    response.end(archive);
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  onTestFinished(() => new Promise<void>((resolve) => server.close(() => resolve())));
  const { port } = server.address() as AddressInfo;
  const sha256 = createHash("sha256").update(archive).digest("hex");
  return { url: `http://127.0.0.1:${port}/dynamodb_local.tar.gz`, sha256, requests: () => requests };
}

describe("fetchDynamoDbLocal", () => {
  it("unpacks the release into its folder once its checksum matches, and only once", async () => {
    const release = await servedArchive();
    const dir = path.join(await tempDataDir(), ".dynamodb-local", "2026-07-31");

    expect(await fetchDynamoDbLocal(release, dir)).toBe("fetched");
    expect((await readdir(dir)).sort()).toEqual(["DynamoDBLocal.jar", "DynamoDBLocal_lib"]);
    expect(await readdir(path.dirname(dir))).toEqual(["2026-07-31"]);

    expect(await fetchDynamoDbLocal(release, dir)).toBe("already-there");
    expect(release.requests()).toBe(1);
  });

  it("keeps nothing when the checksum doesn't match", async () => {
    const release = await servedArchive();
    const dir = path.join(await tempDataDir(), ".dynamodb-local", "2026-07-31");

    await expect(fetchDynamoDbLocal({ ...release, sha256: "0".repeat(64) }, dir)).rejects.toThrow("not the pinned");
    await expect(readdir(path.dirname(dir))).rejects.toThrow("ENOENT");
  });
});
