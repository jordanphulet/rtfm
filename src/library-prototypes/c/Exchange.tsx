import { ReplyMarkdown, StatusRing } from "../../ui";
import type { ExchangeData } from "./exchanges";
import "./exchange.css";

interface ExchangeProps {
  exchange: ExchangeData;
  live: boolean;
}

export function Exchange({ exchange, live }: ExchangeProps) {
  const { id, question, reply } = exchange;

  return (
    <article id={id} className="exchange" tabIndex={-1} aria-label={`You asked: ${question.text}`}>
      <div className="line line-user">
        <span className="speaker">You</span>
        <p className="user-text">{question.text}</p>
      </div>
      {(reply || live) && (
        <div className="line line-librarian" data-live={live || undefined}>
          <span className="speaker">Librarian</span>
          <div className="reply-body">
            {reply ? (
              <ReplyMarkdown>{reply.text}</ReplyMarkdown>
            ) : (
              <p className="thinking">
                <StatusRing status="writing" />
                Thinking…
              </p>
            )}
          </div>
        </div>
      )}
    </article>
  );
}
