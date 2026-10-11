import { readdir, readFile } from "node:fs/promises";
import { expect, it } from "vitest";
import { chunkEnds as serverChunkEnds } from "../server/writer/fake.ts";
import { chunkEnds as browserChunkEnds } from "../src/manual/streamer.ts";

const SEED_SECTIONS = new URL("../server/seed/the-haunt-that-listens/sections/", import.meta.url);

it("chunks every seed body the same way in the browser and the server", async () => {
  const files = await readdir(SEED_SECTIONS);
  expect(files).toHaveLength(18);
  for (const file of files) {
    const body = await readFile(new URL(file, SEED_SECTIONS), "utf8");
    expect(browserChunkEnds(body), file).toEqual(serverChunkEnds(body));
  }
});
