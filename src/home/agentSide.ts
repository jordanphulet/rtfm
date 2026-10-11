import type { RefObject } from "react";
import type { UseAgentResult } from "../agent";
import type { ManualSummary } from "../library";

interface ComposerState {
  draft: string;
  onDraftChange: (draft: string) => void;
  /** Sends the draft; returns whether it was sent. */
  onSend: () => boolean;
  canSend: boolean;
  fieldRef: RefObject<HTMLTextAreaElement | null>;
}

/** What the librarian's side of the page needs, whether it is the docked panel or the phone dock. */
export interface AgentSideProps {
  agent: UseAgentResult;
  manuals: ManualSummary[];
  composer: ComposerState;
  onJump: (id: string) => void;
  onHover: (id: string | null) => void;
  onCue: (prompt: string) => void;
}
