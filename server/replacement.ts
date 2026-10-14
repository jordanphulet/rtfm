import type { RunningServer } from "./app.ts";
import { exitOnceWritten } from "./exit.ts";
import type { LogFields, Logger } from "./logging/logger.ts";

/**
 * How long the open requests get to end once the environment stops taking new ones: the
 * revision's `timeoutSeconds` (`infra/app-stack.ts`), the longest Lambda lets one run.
 */
export const OPEN_REQUESTS_GRACE_MS = 300_000;
/** So the last open request ends a minute before the keys expire. */
export const EXIT_BEFORE_EXPIRY_MS = OPEN_REQUESTS_GRACE_MS + 60_000;
/** The longest delay `setTimeout` keeps (about 24.8 days); a longer one fires at once. */
const MAX_TIMER_MS = 2 ** 31 - 1;

/**
 * Has Lambda replace this Web Function's environment, and its keys with it, before they run out
 * (`server/README.md` › The Web Function): once a service refuses the keys, or
 * `EXIT_BEFORE_EXPIRY_MS` before their known expiry, the server stops taking requests, lets the
 * open ones end for up to `graceMs`, and the process exits with 1.
 */
export function environmentReplacement(logger: Logger, exit = exitOnceWritten, graceMs = OPEN_REQUESTS_GRACE_MS) {
  let server: RunningServer | undefined;
  let replacing = false;

  async function replace(event: string, message: string, fields: LogFields, error?: Error) {
    if (server === undefined || replacing) return;
    replacing = true;
    logger.warn(event, message, { ...fields, graceMs }, error);
    await server.close(graceMs);
    exit(1);
  }

  return {
    /**
     * Ignored until `serving`: a refusal while the server starts fails its start, which exits with
     * 1 too.
     */
    keysRefused(service: string, error: Error) {
      const message = `${service} refused this environment's keys: exiting for a new one`;
      void replace("server.keys-refused", message, { service }, error);
    },

    /** Over `MAX_TIMER_MS` away, the expiry sets no timer, which would otherwise fire at once. */
    serving(started: RunningServer, keysExpireAt: Date | undefined) {
      server = started;
      if (keysExpireAt === undefined) return;
      const exitAt = new Date(keysExpireAt.getTime() - EXIT_BEFORE_EXPIRY_MS);
      const delay = exitAt.getTime() - Date.now();
      if (delay > MAX_TIMER_MS) return;
      const message = "This environment's keys expire soon: exiting for a new one";
      setTimeout(() => {
        const fields = {
          credentialsExpireAt: keysExpireAt.toISOString(),
          plannedExitAt: exitAt.toISOString(),
          msUntilExpiry: keysExpireAt.getTime() - Date.now(),
        };
        void replace("server.keys-expiring", message, fields);
      }, delay);
    },
  };
}
