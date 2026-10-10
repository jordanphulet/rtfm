import { Composer } from "./Composer";
import { Conversation } from "./Conversation";
import type { AgentSideProps } from "./agentSide";
import { useStickToBottom } from "./useStickToBottom";
import "./librarian-panel.css";

export function LibrarianPanel({ agent, manuals, composer, onJump, onHover, onCue }: AgentSideProps) {
  const stick = useStickToBottom();
  const busy = agent.status !== "idle";

  function send() {
    if (composer.onSend()) stick.scrollToBottom();
  }

  return (
    <aside className="panel" aria-labelledby="librarian-title">
      <h2 id="librarian-title" className="panel-title" data-edge={stick.scrolledFromTop || undefined}>
        Librarian
      </h2>
      <Conversation
        messages={agent.messages}
        status={agent.status}
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
