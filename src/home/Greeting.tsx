import { useId } from "react";
import type { ManualSummary } from "../library";
import { Icon } from "../ui";
import { cuesFor } from "./cuePrompts";
import "./Greeting.css";

interface GreetingProps {
  manuals: ManualSummary[];
  onCue: (prompt: string) => void;
}

export function Greeting({ manuals, onCue }: GreetingProps) {
  const introId = useId();
  return (
    <li className="greeting">
      <span className="visually-hidden">Librarian: </span>
      <p className="greeting-text" id={introId}>
        Hello, I’m the librarian. I can:
      </p>
      <ul className="cue-list" aria-labelledby={introId}>
        {cuesFor(manuals).map((cue) => (
          <li key={cue.label}>
            <button type="button" className="cue" onClick={() => onCue(cue.prompt)}>
              <Icon of={cue.icon} />
              {cue.label}
            </button>
          </li>
        ))}
      </ul>
    </li>
  );
}
