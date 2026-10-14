import { useLibrarianActions } from "../librarian";
import { Composer } from "./Composer";
import { Conversation } from "./Conversation";
import { describeActivity } from "./LibrarianHead";
import type { LibrarianSideProps } from "./librarianSide";
import { useStickToBottom } from "./useStickToBottom";
import "./LibrarianPanel.css";

export function LibrarianPanel({ librarian, manuals, composer, onJump, onHover, onCue, onAction }: LibrarianSideProps) {
  const stick = useStickToBottom();
  const busy = librarian.status !== "idle";
  useLibrarianActions(onAction);

  function send() {
    if (composer.onSend()) stick.scrollToBottom();
  }

  return (
    <aside className="panel" aria-labelledby="librarian-title">
      <h2 id="librarian-title" className="visually-hidden">
        Librarian
      </h2>
      <Conversation
        messages={librarian.messages}
        status={librarian.status}
        activity={librarian.activity}
        manuals={manuals}
        stick={stick}
        onJump={onJump}
        onHover={onHover}
        onCue={onCue}
      />
      <Composer
        layout="panel"
        {...composer}
        onSend={send}
        busy={busy}
        activity={librarian.status === "idle" ? null : describeActivity(librarian.status, librarian.activity)}
        newest={stick.scrolledUp ? { replying: busy, onJump: stick.scrollToBottom } : null}
      />
    </aside>
  );
}
