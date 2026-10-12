import { Fragment } from "react";
import type { AgentMessage, FailureReason } from "../agent";
import type { ManualSummary } from "../library";
import { ReplyMarkdown } from "../ui";
import { namedWhenSent } from "./references";
import { replyFailureWords } from "./replyFailure";

interface TurnProps {
  message: AgentMessage;
  live: boolean;
  manuals: ManualSummary[];
  onJump: (id: string) => void;
  onHover: (id: string | null) => void;
}

export function Turn({ message, live, manuals, onJump, onHover }: TurnProps) {
  if (message.role === "agent") {
    return (
      <li className="turn-reply write-head" data-live={live || undefined}>
        <span className="visually-hidden">Librarian: </span>
        {message.text !== "" && <ReplyMarkdown className="reply">{message.text}</ReplyMarkdown>}
        {message.failure && <ReplyFailure reason={message.failure} />}
      </li>
    );
  }

  const named = namedWhenSent(message, manuals);
  const currentIds = new Set(manuals.map((manual) => manual.id));
  const inLibrary = named.filter((manual) => currentIds.has(manual.id));
  const gone = named.filter((manual) => !currentIds.has(manual.id));
  return (
    <li className="turn-user">
      <p className="said">
        <span className="visually-hidden">You: </span>
        {message.text}
      </p>
      {inLibrary.length > 0 && (
        <p className="named">
          In your library:{" "}
          {inLibrary.map((manual, index) => (
            <Fragment key={manual.id}>
              {index > 0 && ", "}
              <button
                type="button"
                className="link named-link"
                onClick={() => onJump(manual.id)}
                onMouseEnter={() => onHover(manual.id)}
                onMouseLeave={() => onHover(null)}
                onFocus={() => onHover(manual.id)}
                onBlur={() => onHover(null)}
              >
                {manual.title}
              </button>
            </Fragment>
          ))}
        </p>
      )}
      {gone.map((manual) => (
        <p key={manual.id} className="named">
          {manual.title} — no longer in your library
        </p>
      ))}
    </li>
  );
}

function ReplyFailure({ reason }: { reason: FailureReason }) {
  const { title, text } = replyFailureWords(reason);
  return (
    <p className="reply-failure">
      <strong>{title}</strong> {text}
    </p>
  );
}
