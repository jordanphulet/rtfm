import { useState, type FormEvent, type KeyboardEvent, type RefObject } from "react";
import { NewestButton } from "./NewestButton";
import "./composer.css";

interface NewestJump {
  replying: boolean;
  onJump: () => void;
}

interface ComposerProps {
  layout: "panel" | "dock";
  draft: string;
  onDraftChange: (draft: string) => void;
  onSend: () => void;
  canSend: boolean;
  busy: boolean;
  fieldRef: RefObject<HTMLTextAreaElement | null>;
  newest?: NewestJump | null;
}

export function Composer({
  layout,
  draft,
  onDraftChange,
  onSend,
  canSend,
  busy,
  fieldRef,
  newest,
}: ComposerProps) {
  const [focused, setFocused] = useState(false);

  function submit(event: FormEvent) {
    event.preventDefault();
    onSend();
  }

  function sendOnEnter(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing) return;
    event.preventDefault();
    onSend();
  }

  return (
    <form className="composer" data-layout={layout} onSubmit={submit}>
      <textarea
        ref={fieldRef}
        id="librarian-field"
        className="field"
        data-shot="agent-input"
        aria-label="Ask the librarian"
        placeholder="Ask the librarian…"
        rows={layout === "panel" ? 2 : 1}
        value={draft}
        onChange={(event) => onDraftChange(event.target.value)}
        onKeyDown={sendOnEnter}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
      />
      <div className="composer-row">
        {layout === "panel" && <Readout focused={focused} newest={newest ?? null} />}
        <button type="submit" className="send" aria-disabled={!canSend || undefined}>
          Send
          {busy && <span className="visually-hidden"> (waiting for the reply)</span>}
        </button>
      </div>
    </form>
  );
}

function Readout({ focused, newest }: { focused: boolean; newest: NewestJump | null }) {
  if (newest) return <NewestButton replying={newest.replying} onJump={newest.onJump} />;
  if (focused) return <p className="readout">Enter sends · Shift+Enter, new line</p>;
  return (
    <p className="readout readout-shortcut">
      Press <kbd>/</kbd> to ask
    </p>
  );
}
