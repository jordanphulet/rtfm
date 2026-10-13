import { describe, expect, it } from "vitest";
import type { Gateway } from "../../gateway/gateway.ts";
import { silentLogger } from "../../logging/logger.ts";
import { createFileManualStore } from "../../storage/file-manual-store.ts";
import { seedStore } from "../../storage/seed.ts";
import type { ManualStore } from "../../storage/types.ts";
import { SAMPLE_ID, tempDataDir } from "../../testing.ts";
import type { AgentTool } from "../tool.ts";
import { fakeLibrarianModel, INSTANT_PACE } from "./fake-model.ts";
import { LIBRARIAN_SYSTEM_PROMPT } from "./prompt.ts";
import { librarianTools } from "./tools.ts";

const NAMES_THAT_ARE_NOT_TOOLS = ["page_note"];

const definitions = librarianTools({
  gateway: {} as Gateway,
  store: {} as ManualStore,
  onStatus: () => {},
  onAction: () => {},
}).map(({ definition }) => definition);

function fieldsOf(schema: Record<string, unknown>): Record<string, { description?: string }> {
  return (schema.properties ?? {}) as Record<string, { description?: string }>;
}

const knownNames = new Set([
  ...NAMES_THAT_ARE_NOT_TOOLS,
  ...definitions.flatMap(({ name, input_schema }) => [name, ...Object.keys(fieldsOf(input_schema))]),
]);

function unknownNamesIn(texts: string[]): string[] {
  return texts.flatMap((text) => text.match(/\w*_\w*/g) ?? []).filter((word) => !knownNames.has(word));
}

/** Every fixed text a tool returns or throws, from running each tool down each of its paths. */
async function fixedResultTexts(): Promise<string[]> {
  const store = createFileManualStore(await tempDataDir(), silentLogger);
  await seedStore(store);
  const signal = new AbortController().signal;
  function toolsForOneReply(): Record<string, AgentTool> {
    const tools = librarianTools({
      gateway: fakeLibrarianModel(INSTANT_PACE),
      store,
      onStatus: () => {},
      onAction: () => {},
    });
    return Object.fromEntries(tools.map((tool) => [tool.definition.name, tool]));
  }
  async function resultOf(tool: AgentTool, input: object): Promise<string> {
    return JSON.parse((await tool.run(input, signal)).content).result;
  }
  async function errorOf(tool: AgentTool, input: object): Promise<string> {
    return tool.run(input, signal).then(
      () => "",
      (error: Error) => error.message,
    );
  }

  const firstReply = toolsForOneReply();
  const request = { request: "A manual about treehouses" };
  return [
    (await firstReply.find_manuals!.run({ topic: "zzzz" }, signal)).content,
    await resultOf(firstReply.open_manual!, { manual_id: SAMPLE_ID }),
    await resultOf(firstReply.propose_delete!, { manual_id: SAMPLE_ID }),
    await errorOf(firstReply.open_manual!, { manual_id: "no-such-manual" }),
    await resultOf(firstReply.create_manual!, request),
    await errorOf(firstReply.create_manual!, request),
    await resultOf(toolsForOneReply().create_manual!, request),
  ];
}

describe("the librarian's prompt and tools", () => {
  it("name no tool in the system prompt", () => {
    for (const { name } of definitions) expect(LIBRARIAN_SYSTEM_PROMPT).not.toContain(name);
  });

  it("mention only tools and input fields that exist in the prompt and the tools' descriptions", () => {
    const texts = [
      LIBRARIAN_SYSTEM_PROMPT,
      ...definitions.flatMap(({ description, input_schema }) => [
        description,
        ...Object.values(fieldsOf(input_schema)).map((field) => field.description ?? ""),
      ]),
    ];

    expect(unknownNamesIn(texts)).toEqual([]);
  });

  it("mention only tools and input fields that exist in the tools' fixed results", async () => {
    const texts = await fixedResultTexts();

    expect(texts).toHaveLength(7);
    for (const text of texts) expect(text).not.toBe("");
    expect(unknownNamesIn(texts)).toEqual([]);
  });
});
