import { z } from "zod";
import type { ToolDefinition } from "../gateway/types.ts";

export interface AgentTool {
  definition: ToolDefinition;
  status: string;
  run(input: unknown, signal: AbortSignal): Promise<ToolOutcome>;
}

export interface ToolOutcome {
  content: string;
  isError?: boolean;
}

export function defineTool<Shape extends z.core.$ZodShape>({ name, description, input, status, run }: {
  name: string;
  description: string;
  input: Shape;
  status: string;
  run(input: z.infer<z.ZodObject<Shape, z.core.$strict>>, signal: AbortSignal): Promise<string>;
}): AgentTool {
  const schema = z.strictObject(input);
  const { $schema, ...inputSchema } = z.toJSONSchema(schema);
  return {
    definition: { name, description, input_schema: { ...inputSchema, type: "object" } },
    status,
    async run(rawInput, signal) {
      const parsed = schema.safeParse(rawInput);
      if (!parsed.success) return { content: `Invalid input:\n${z.prettifyError(parsed.error)}`, isError: true };
      return { content: await run(parsed.data, signal) };
    },
  };
}
