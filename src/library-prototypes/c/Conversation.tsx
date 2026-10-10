import { useEffect, useLayoutEffect, useRef, type ReactNode } from "react";
import type { AgentStatus } from "../../agent";
import "../../ui";
import { Exchange } from "./Exchange";
import type { ExchangeData } from "./exchanges";
import { useStageDirections, type StageDirection } from "./stageDirections";
import "./conversation.css";

interface ConversationProps {
  exchanges: ExchangeData[];
  status: AgentStatus;
  suggestions: ReactNode;
}

export function Conversation({ exchanges, status, suggestions }: ConversationProps) {
  const directions = useStageDirections();
  useNewestInView(exchanges.length);

  const directionsAfter = (count: number) =>
    directions.filter((direction) => direction.afterExchange === count);

  return (
    <section className="conversation" aria-labelledby="conversation-title">
      <h2 id="conversation-title" className="visually-hidden">
        Conversation
      </h2>
      <StageDirections directions={directionsAfter(0)} />
      {exchanges.length === 0 && suggestions}
      {exchanges.map((exchange, index) => (
        <div
          key={exchange.id}
          className="exchange-group"
          data-newest={index === exchanges.length - 1 || undefined}
        >
          <Exchange exchange={exchange} live={status !== "idle" && index === exchanges.length - 1} />
          <StageDirections directions={directionsAfter(index + 1)} />
        </div>
      ))}
    </section>
  );
}

function StageDirections({ directions }: { directions: StageDirection[] }) {
  if (directions.length === 0) return null;
  return (
    <div className="stage-directions">
      {directions.map((direction) => (
        <p key={direction.id} className="stage-direction">
          <i>You deleted</i> {direction.title}
          <i>.</i>
        </p>
      ))}
    </div>
  );
}

function useNewestInView(exchangeCount: number) {
  const placedCount = useRef(0);

  useLayoutEffect(() => {
    if (exchangeCount > placedCount.current) placeNewestInView();
    placedCount.current = exchangeCount;
  }, [exchangeCount]);

  useEffect(() => {
    let cancelled = false;
    const placeAgain = () => {
      if (!cancelled) placeNewestInView();
    };
    const frame = requestAnimationFrame(placeAgain);
    document.fonts.ready.then(placeAgain);
    document.fonts.addEventListener("loadingdone", placeAgain, { once: true });
    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
      document.fonts.removeEventListener("loadingdone", placeAgain);
    };
  }, []);
}

function placeNewestInView() {
  document
    .querySelector(".library-c .exchange-group[data-newest] .exchange")
    ?.scrollIntoView({ block: "start", behavior: "instant" });
}
