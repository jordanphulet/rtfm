import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DYNAMODB_LOCAL_DIR, DYNAMODB_LOCAL_RELEASE, type DynamoDbLocalRelease } from "./dynamodb-local.ts";

/**
 * Downloads the release, checks its SHA-256 and unpacks it into `dir`, unless `dir` is already
 * there. It unpacks into a temporary folder beside `dir` and renames it into place, so a failed
 * fetch leaves nothing behind. The one script that reaches the network, run by hand once.
 */
export async function fetchDynamoDbLocal(release: DynamoDbLocalRelease, dir: string): Promise<"fetched" | "already-there"> {
  if (existsSync(dir)) return "already-there";
  const response = await fetch(release.url);
  if (!response.ok) throw new Error(`Fetching ${release.url} failed: ${response.status} ${response.statusText}`);
  const archive = Buffer.from(await response.arrayBuffer());
  const sha256 = createHash("sha256").update(archive).digest("hex");
  if (sha256 !== release.sha256) {
    throw new Error(`${release.url} has the SHA-256 ${sha256}, not the pinned ${release.sha256}; nothing was kept`);
  }

  await mkdir(path.dirname(dir), { recursive: true });
  const temp = await mkdtemp(`${dir}.fetching-`);
  try {
    const archiveFile = path.join(temp, "archive.tar.gz");
    const unpacked = path.join(temp, "unpacked");
    await writeFile(archiveFile, archive);
    await mkdir(unpacked);
    execFileSync("tar", ["-xzf", archiveFile, "-C", unpacked]);
    await rename(unpacked, dir);
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
  return "fetched";
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const result = await fetchDynamoDbLocal(DYNAMODB_LOCAL_RELEASE, DYNAMODB_LOCAL_DIR);
  console.log(result === "fetched" ? `DynamoDB Local is in ${DYNAMODB_LOCAL_DIR}` : `${DYNAMODB_LOCAL_DIR} is already there`);
}
