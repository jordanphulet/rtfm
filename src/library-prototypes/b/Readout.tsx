import { Suggestions } from "./Suggestions";

interface ReadoutProps {
  covered: boolean;
  exchangeCount: number;
  unread: boolean;
  draft: string;
  starterPrompt: string;
  libraryIsEmpty: boolean;
  onSuggest: (text: string) => void;
  onShow: () => void;
}

export function Readout(props: ReadoutProps) {
  const state = readoutState(props);

  return (
    <div className="cue-readout" data-state={state} inert={props.covered}>
      <ReadoutContent state={state} {...props} />
    </div>
  );
}

type ReadoutState = "conversation" | "suggestions" | "starter" | "typing";

function readoutState({ exchangeCount, draft, starterPrompt }: ReadoutProps): ReadoutState {
  if (exchangeCount > 0) return "conversation";
  if (draft === "") return "suggestions";
  if (draft === starterPrompt) return "starter";
  return "typing";
}

function ReadoutContent({ state, ...props }: ReadoutProps & { state: ReadoutState }) {
  switch (state) {
    case "conversation":
      return (
        <>
          {props.unread ? (
            <span className="readout-note readout-new">New reply</span>
          ) : (
            <span className="readout-note">
              {props.exchangeCount} {props.exchangeCount === 1 ? "exchange" : "exchanges"}
            </span>
          )}
          <span className="readout-dot" aria-hidden="true">
            ·
          </span>
          <button
            type="button"
            className="text-button readout-show"
            aria-expanded={props.covered}
            aria-controls="conversation"
            onClick={props.onShow}
          >
            Show ↓
          </button>
        </>
      );
    case "suggestions":
      return (
        <Suggestions libraryIsEmpty={props.libraryIsEmpty} onChoose={props.onSuggest} />
      );
    case "starter":
      return <span className="readout-note">Finish the sentence, then press Enter</span>;
    case "typing":
      return <span className="readout-note">Enter to send</span>;
  }
}
