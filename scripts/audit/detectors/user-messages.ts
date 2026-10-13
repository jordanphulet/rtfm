import type { Event } from "../events.ts";
import type { Candidate } from "./candidate.ts";

/** Every message the user typed: where corrections live. */
export function userMessages(events: Event[]): Candidate[] {
  return events
    .filter((event) => event.kind === "human")
    .map((event) => ({ time: event.time, session: event.session, who: event.who, what: event.text ?? "" }));
}
