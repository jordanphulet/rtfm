import { readFileSync, realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";

export type HookInput = { session_id?: string; agent_id?: string; cwd?: string };

/**
 * Runs a Claude Code hook: reads its JSON input from stdin and prints what `respond` returns as
 * context for the session. On any failure it prints nothing, and it always exits 0, so it never
 * blocks or interrupts the session.
 */
export function runHook(event: string, respond: (input: HookInput, projectDir: string) => string | undefined) {
  try {
    const projectDir = process.env.CLAUDE_PROJECT_DIR;
    if (!projectDir) return;
    const context = respond(JSON.parse(readFileSync(0, "utf8")), projectDir);
    if (context) {
      process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: event, additionalContext: context } }));
    }
  } catch {
    // A hook that fails says nothing.
  } finally {
    process.exitCode = 0;
  }
}

export function isRunDirectly(moduleUrl: string): boolean {
  return Boolean(process.argv[1]) && realpathSync(process.argv[1]) === fileURLToPath(moduleUrl);
}
