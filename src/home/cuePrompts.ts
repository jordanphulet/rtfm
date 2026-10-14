import { BookOpen, LibraryBig, Plus, type LucideIcon } from "lucide-react";
import type { ManualSummary } from "../library";

export const STARTER_PROMPT = "Let’s start a new manual about ";

interface Cue {
  icon: LucideIcon;
  label: string;
  prompt: string;
}

export function cuesFor(manuals: ManualSummary[]): Cue[] {
  const first = manuals[0];
  const cues: (Cue | null)[] = [
    { icon: Plus, label: "Start a new manual on any subject", prompt: STARTER_PROMPT },
    { icon: LibraryBig, label: "Tell you what’s in your library", prompt: "What do I have?" },
    first ? { icon: BookOpen, label: "Find and open a manual", prompt: `Open ${first.title}` } : null,
  ];
  return cues.filter((cue) => cue !== null);
}
