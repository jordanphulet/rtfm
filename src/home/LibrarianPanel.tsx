import { useAgentActions } from "../agent";
import { Composer } from "./Composer";
import { Conversation } from "./Conversation";
import { LibrarianHead } from "./LibrarianHead";
import type { AgentSideProps } from "./agentSide";
import { useStickToBottom } from "./useStickToBottom";
import "./LibrarianPanel.css";

export function LibrarianPanel({ agent, manuals, composer, onJump, onHover, onCue, onAction }: AgentSideProps) {
  const stick = useStickToBottom();
  const busy = agent.status !== "idle";
  useAgentActions(onAction);

  function send() {
    if (composer.onSend()) stick.scrollToBottom();
  }

  return (
    <aside className="panel" aria-labelledby="librarian-title">
      <LibrarianHead
        messageCount={agent.messages.length}
        status={agent.status}
        activity={agent.activity}
        edge={stick.scrolledFromTop}
      />
      <Conversation
        messages={agent.messages}
        status={agent.status}
        activity={agent.activity}
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
