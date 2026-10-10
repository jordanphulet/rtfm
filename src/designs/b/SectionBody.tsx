import { useRef } from "react";
import { Markdown } from "../../shared";
import { Nib, Tailpiece } from "./drawings";
import { FollowButton } from "./FollowButton";
import { markdownComponents } from "./markdownComponents";
import { SectionLink } from "./SectionLink";
import { useLiveEdge } from "./useLiveEdge";
import { useMarginNotes } from "./useMarginNotes";

interface SectionBodyProps {
  text: string;
  isWriting: boolean;
  justFinished: boolean;
  wrap: "plain" | "pretty";
}

export function SectionBody({ text, isWriting, justFinished, wrap }: SectionBodyProps) {
  const bodyRef = useRef<HTMLDivElement>(null);
  const edgeRef = useLiveEdge(bodyRef, text);
  useMarginNotes(bodyRef, text, isWriting);

  return (
    <div
      id="text"
      tabIndex={-1}
      className="section-body"
      ref={bodyRef}
      data-wrap={wrap}
      data-writing={isWriting || undefined}
      data-just-finished={justFinished || undefined}
    >
      {text === "" ? (
        <p className="first-words">The first words are on their way…</p>
      ) : (
        <Markdown source={text} SectionLink={SectionLink} components={markdownComponents} className="prose" />
      )}
      {(isWriting || justFinished) && (
        <>
          <span className="wet-ink" aria-hidden="true" />
          <Nib />
        </>
      )}
      <div className="tailpiece-row" data-hidden={isWriting || undefined}>
        <Tailpiece />
      </div>
      {isWriting && <FollowButton bodyRef={bodyRef} edgeRef={edgeRef} text={text} />}
    </div>
  );
}
