import type { AgentMessage, AgentStatus } from "../agent";
import type { ManualSummary } from "../library";
import { Cues } from "./Cues";
import { Turn } from "./Turn";
import type { StickToBottom } from "./useStickToBottom";
import "./conversation.css";

interface ConversationProps {
  messages: AgentMessage[];
  status: AgentStatus;
  activity: string;
  manuals: ManualSummary[];
  stick: StickToBottom;
  onJump: (id: string) => void;
  onHover: (id: string | null) => void;
  onCue: (prompt: string) => void;
}

export function Conversation({ messages, status, activity, manuals, stick, onJump, onHover, onCue }: ConversationProps) {
  return (
    <div
      ref={stick.scrollRef}
      className="conversation"
      role="log"
      aria-live="off"
      aria-label="Conversation"
      tabIndex={0}
    >
      <div ref={stick.contentRef} className="conversation-content">
        {messages.length === 0 ? (
          <Cues manuals={manuals} onCue={onCue} />
        ) : (
          <ol className="turns">
            {messages.map((message, index) => (
              <Turn
                key={message.id}
                message={message}
                live={status === "streaming" && index === messages.length - 1}
                manuals={manuals}
                onJump={onJump}
                onHover={onHover}
              />
            ))}
            {status === "thinking" && (
              <li className="thinking write-head-line" data-live>
                <span className="visually-hidden">Librarian: </span>
                <span className="thinking-text">{activity}</span>
              </li>
            )}
          </ol>
        )}
      </div>
    </div>
  );
}
