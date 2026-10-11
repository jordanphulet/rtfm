import type { ManualSummary } from "../library";

export const STARTER_PROMPT = "Let’s start a new manual about ";

interface Cue {
  label: string;
  prompt: string;
}

export function cuesFor(manuals: ManualSummary[]): Cue[] {
  const first = manuals[0];
  const cues: (Cue | null)[] = [
    { label: `${STARTER_PROMPT.trimEnd()}…`, prompt: STARTER_PROMPT },
    { label: "What do I have?", prompt: "What do I have?" },
    first ? { label: `Open ${first.title}`, prompt: `Open ${first.title}` } : null,
    { label: "How do I delete a manual?", prompt: "How do I delete a manual?" },
  ];
  return cues.filter((cue) => cue !== null);
}
