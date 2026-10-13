import { useLibrarianActions } from "../librarian";
import { Composer } from "./Composer";
import { Conversation } from "./Conversation";
import { LibrarianHead } from "./LibrarianHead";
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
      <LibrarianHead
        messageCount={librarian.messages.length}
        status={librarian.status}
        activity={librarian.activity}
        edge={stick.scrolledFromTop}
      />
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
        newest={stick.scrolledUp ? { replying: busy, onJump: stick.scrollToBottom } : null}
      />
    </aside>
  );
}
