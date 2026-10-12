import { useId } from "react";
import type { ManualSummary } from "../library";
import { cuesFor } from "./cuePrompts";
import "./cues.css";

interface CuesProps {
  manuals: ManualSummary[];
  onCue: (prompt: string) => void;
}

export function Cues({ manuals, onCue }: CuesProps) {
  const labelId = useId();
  return (
    <div className="cues">
      <h3 className="cues-title">Ask about your manuals</h3>
      <p className="cues-intro">
        It can list, find and open your manuals, start a new one, and delete one once you confirm.
      </p>
      <p className="cues-label" id={labelId}>
        Try asking
      </p>
      <ul className="cue-list" aria-labelledby={labelId}>
        {cuesFor(manuals).map((cue) => (
          <li key={cue.label}>
            <button type="button" className="cue" onClick={() => onCue(cue.prompt)}>
              “{cue.label}”
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
