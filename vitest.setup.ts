import { afterAll, afterEach } from "vitest";
import { reportBlockedTo, takeBlockedTargets } from "./loopback-only.ts";

export function throwIfTestReachedOutside(): void {
  const targets = takeBlockedTargets();
  if (targets.length === 0) return;
  throw new Error(
    `This test tried to reach beyond this machine: ${targets.join(", ")}. ` +
      "Tests may reach only loopback (server/README.md › Tests).",
  );
}

reportBlockedTo("tests");

afterEach(throwIfTestReachedOutside);

afterAll(() => {
  reportBlockedTo("process");
  throwIfTestReachedOutside();
});
