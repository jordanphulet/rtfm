const SUGGESTIONS = ["What do I have?", "Delete the manual about geese", "What can you help with?"];
const FIRST_MANUAL_SUGGESTIONS = ["Create my first manual", "What can you help with?"];

interface SuggestionsProps {
  className?: string;
  libraryIsEmpty: boolean;
  onChoose: (text: string) => void;
}

export function Suggestions({ className, libraryIsEmpty, onChoose }: SuggestionsProps) {
  const suggestions = libraryIsEmpty ? FIRST_MANUAL_SUGGESTIONS : SUGGESTIONS;

  return (
    <div className={className ? `suggestions ${className}` : "suggestions"}>
      <span className="suggestions-label">Try</span>
      <ul className="suggestions-list">
        {suggestions.map((suggestion) => (
          <li key={suggestion}>
            <button
              type="button"
              className="text-button suggestion"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => onChoose(suggestion)}
            >
              {suggestion}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
