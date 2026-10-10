import "../../ui";
import "./suggestions.css";

const QUESTIONS = ["What can you help with?", "Which manuals haven’t I finished?"];

interface SuggestionsProps {
  placement: "dock" | "script";
  onSend: (text: string) => void;
  onStartNew: () => void;
}

export function Suggestions({ placement, onSend, onStartNew }: SuggestionsProps) {
  return (
    <div className="suggestions" data-placement={placement}>
      <p className="suggestions-label">{placement === "dock" ? "Try" : "Try asking"}</p>
      <ul className="suggestions-list">
        {QUESTIONS.map((question) => (
          <li key={question}>
            <button type="button" className="text-button suggestion" onClick={() => onSend(question)}>
              “{question}”
            </button>
          </li>
        ))}
        <li>
          <button type="button" className="text-button suggestion" onClick={onStartNew}>
            “Let’s start a new manual about…”
          </button>
        </li>
      </ul>
    </div>
  );
}
