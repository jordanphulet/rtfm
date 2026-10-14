import { useState, type FormEvent, type KeyboardEvent, type RefObject } from "react";
import { LIBRARIAN_LIMITS } from "../librarian";
import { StatusRing } from "../ui";
import { NewestButton } from "./NewestButton";
import "./Composer.css";

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
  activity?: string | null;
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
  activity,
  newest,
}: ComposerProps) {
  const [focused, setFocused] = useState(false);

  function submit(event: FormEvent) {
    event.preventDefault();
    onSend();
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.nativeEvent.isComposing) return;
    if (event.key === "Escape") event.currentTarget.blur();
    if (event.key !== "Enter" || event.shiftKey) return;
    event.preventDefault();
    onSend();
  }

  return (
    <form className="composer" data-layout={layout} onSubmit={submit}>
      <textarea
        ref={fieldRef}
        id="librarian-field"
        className="field"
        data-shot="librarian-input"
        aria-label="Ask the librarian"
        placeholder="Ask the librarian…"
        rows={layout === "panel" ? 2 : 1}
        maxLength={LIBRARIAN_LIMITS.messageCharacters}
        value={draft}
        onChange={(event) => onDraftChange(event.target.value)}
        onKeyDown={handleKeyDown}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
      />
      <div className="composer-row">
        {layout === "panel" && <Readout focused={focused} activity={activity ?? null} newest={newest ?? null} />}
        <button type="submit" className="send" aria-disabled={!canSend || undefined}>
          Send
          {busy && <span className="visually-hidden"> (waiting for the reply)</span>}
        </button>
      </div>
    </form>
  );
}

interface ReadoutProps {
  focused: boolean;
  activity: string | null;
  newest: NewestJump | null;
}

function Readout({ focused, activity, newest }: ReadoutProps) {
  if (newest) return <NewestButton replying={newest.replying} onJump={newest.onJump} />;
  if (activity) {
    return (
      <p className="readout readout-live">
        <StatusRing status="writing" />
        <span className="status-text">{activity}</span>
      </p>
    );
  }
  if (focused) return <p className="readout">Enter sends · Shift+Enter, new line</p>;
  return (
    <p className="readout readout-shortcut">
      Press <kbd>/</kbd> to ask
    </p>
  );
}
