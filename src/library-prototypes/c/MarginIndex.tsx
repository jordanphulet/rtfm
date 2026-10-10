import type { MouseEvent } from "react";
import type { AgentStatus } from "../../agent";
import { StatusRing } from "../../ui";
import type { ExchangeData } from "./exchanges";
import { jumpTo, jumpToLibrary } from "./jump";
import "./margin-index.css";

interface MarginIndexProps {
  exchanges: ExchangeData[];
  status: AgentStatus;
  manualCount: number;
}

export function MarginIndex({ exchanges, status, manualCount }: MarginIndexProps) {
  function onJump(event: MouseEvent, jump: () => void) {
    event.preventDefault();
    jump();
  }

  return (
    <nav className="margin-index" aria-labelledby="margin-index-title">
      <p id="margin-index-title" className="margin-label">
        In this conversation
      </p>
      <ol className="margin-list">
        <li>
          <a href="#library" className="margin-row" onClick={(event) => onJump(event, jumpToLibrary)}>
            <span className="margin-text">Library</span>
            <span className="margin-count">
              {manualCount}
              <span className="visually-hidden"> manuals</span>
            </span>
          </a>
        </li>
        {exchanges.map((exchange, index) => {
          const live = status !== "idle" && index === exchanges.length - 1;
          return (
            <li key={exchange.id}>
              <a
                href={`#${exchange.id}`}
                className="margin-row"
                onClick={(event) => onJump(event, () => jumpTo(exchange.id))}
              >
                <span className="margin-text margin-question">{exchange.question.text}</span>
                {live && <StatusRing status="writing" />}
              </a>
            </li>
          );
        })}
      </ol>
      {exchanges.length === 0 && (
        <p className="margin-hint">Your questions are listed here as you ask them.</p>
      )}
    </nav>
  );
}
