import { useId, useLayoutEffect, useRef, useState } from "react";
import { useAgent } from "../../agent";
import { ReplyMarkdown, StatusRing } from "../../ui";
import { exchangesOf, plainText, type Exchange } from "./exchanges";
import { useStickToBottom } from "./useStickToBottom";
import "./conversation.css";

interface ConversationProps {
  open: boolean;
  onHide: () => void;
}

export function Conversation({ open, onHide }: ConversationProps) {
  const { messages, status } = useAgent();
  const exchanges = exchangesOf(messages);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLOListElement>(null);
  const { behind, scrollToBottom, release } = useStickToBottom(scrollerRef, contentRef);
  const [unfolded, setUnfolded] = useState<ReadonlySet<number>>(new Set());
  const [unfoldedFor, setUnfoldedFor] = useState(exchanges.length);
  if (unfoldedFor !== exchanges.length) {
    setUnfoldedFor(exchanges.length);
    setUnfolded(new Set());
  }

  useLayoutEffect(scrollToBottom, [exchanges.length, scrollToBottom]);

  function toggle(number: number) {
    release();
    const numbers = new Set(unfolded);
    if (numbers.has(number)) numbers.delete(number);
    else numbers.add(number);
    setUnfolded(numbers);
  }

  const current = exchanges.at(-1);

  return (
    <>
      <section
        id="conversation"
        className="panel"
        aria-label="Conversation with the librarian"
        data-open={open || undefined}
        inert={!open}
      >
        <div ref={scrollerRef} className="panel-scroll">
          <ol ref={contentRef} className="cues">
            {exchanges.map((exchange) =>
              exchange === current ? (
                <CurrentCue key={exchange.ask.id} exchange={exchange} live={status !== "idle"} />
              ) : (
                <EarlierCue
                  key={exchange.ask.id}
                  exchange={exchange}
                  unfolded={unfolded.has(exchange.number)}
                  onToggle={() => toggle(exchange.number)}
                />
              ),
            )}
          </ol>
        </div>
        <div className="panel-foot">
          <button type="button" className="text-button panel-hide" onClick={onHide}>
            Hide{" "}
            <kbd className="keycap" aria-hidden="true">
              Esc
            </kbd>
          </button>
          <span className="panel-hint">↑ recalls your last message</span>
          <button
            type="button"
            className="text-button panel-latest"
            data-visible={behind || undefined}
            onClick={scrollToBottom}
          >
            Latest ↓
          </button>
        </div>
      </section>
      <p className="visually-hidden" aria-live="polite">
        {status === "thinking" && "The librarian is thinking."}
        {status === "idle" && current?.reply && `Librarian: ${plainText(current.reply.text)}`}
      </p>
    </>
  );
}

function CurrentCue({ exchange, live }: { exchange: Exchange; live: boolean }) {
  return (
    <li className="cue cue-current" data-live={live || undefined}>
      <p className="cue-ask">
        <CueNumber number={exchange.number} />
        <span className="visually-hidden">You: </span>
        {exchange.ask.text}
      </p>
      <div className="cue-reply">
        {exchange.reply ? (
          <Reply text={exchange.reply.text} />
        ) : (
          <p className="thinking">
            <StatusRing status="writing" />
            Thinking…
          </p>
        )}
      </div>
    </li>
  );
}

interface EarlierCueProps {
  exchange: Exchange;
  unfolded: boolean;
  onToggle: () => void;
}

function EarlierCue({ exchange, unfolded, onToggle }: EarlierCueProps) {
  const replyId = useId();

  return (
    <li className="cue cue-earlier" data-unfolded={unfolded || undefined}>
      <button
        type="button"
        className="cue-toggle"
        aria-expanded={unfolded}
        aria-controls={replyId}
        onClick={onToggle}
      >
        <CueNumber number={exchange.number} />
        <span className="visually-hidden">You: </span>
        <span className="cue-toggle-text">{exchange.ask.text}</span>
        <span className="chevron" aria-hidden="true" />
      </button>
      <div id={replyId} className="cue-reply" hidden={!unfolded}>
        {exchange.reply && <Reply text={exchange.reply.text} />}
      </div>
    </li>
  );
}

function CueNumber({ number }: { number: number }) {
  return (
    <span className="cue-number" aria-hidden="true">
      {number}
    </span>
  );
}

function Reply({ text }: { text: string }) {
  return (
    <>
      <span className="visually-hidden">Librarian: </span>
      <ReplyMarkdown className="reply">{text}</ReplyMarkdown>
    </>
  );
}
