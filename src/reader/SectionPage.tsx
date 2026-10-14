import { useMemo, useState, type CSSProperties } from "react";
import {
  chapterOf,
  findSection,
  nextSection,
  previousSection,
  retrySection,
  useManual,
  useSection,
  type Chapter,
  type Section,
  type UseSectionResult,
} from "../manual";
import type { RingStatus } from "../ui";
import { ArticleHead, TITLE_ID } from "./ArticleHead";
import { FailureNotice } from "./FailureNotice";
import { chapterName, sectionPath } from "./manualParts";
import { headingsOf, sectionIdsLinkedFrom, wordCount, type Heading } from "./markdownScan";
import { isOutlineLevel, OutlineList, ReferencedSections } from "./Outline";
import { Pager } from "./Pager";
import { Prose } from "./Prose";
import { Shell } from "./Shell";
import { FAILURE_NOTICES, FAILURE_WORDS, STATUS_WORDS } from "./statusWords";
import { loadedAlreadyWritten } from "./streamedThisLoad";
import { TailLine } from "./TailLine";
import { useActiveHeading } from "./useActiveHeading";
import { useArrival } from "./useArrival";
import { useManualId } from "./useManualId";
import { usePrevNextKeys } from "./usePrevNextKeys";

export function SectionPage({ id }: { id: string }) {
  const manualId = useManualId();
  const manual = useManual(manualId);
  const sectionState = useSection(manualId, id);
  const { section, text } = sectionState;
  const chapter = chapterOf(manual, id)!;
  const previous = previousSection(manual, id);
  const next = nextSection(manual, id);

  const headings = useMemo(() => headingsOf(text), [text]);
  const linkedIds = useMemo(() => sectionIdsLinkedFrom(text), [text]);
  const linkedSections = linkedIds
    .map((linkedId) => findSection(manual, linkedId))
    .filter((linked): linked is Section => linked !== undefined);
  const outlineHeadings = headings.filter(isOutlineLevel);
  const activeId = useActiveHeading(outlineHeadings.map((heading) => heading.id));
  usePrevNextKeys(previous && sectionPath(manualId, previous.id), next && sectionPath(manualId, next.id));

  const isWriting = phaseOf(sectionState) === "writing";
  const outlineProps = { sectionLabel: section.label, headings: outlineHeadings, activeId, isWriting };
  const tocOutline = (outlineHeadings.length > 0 || isWriting) && (
    <div className="toc-outline">
      <OutlineList {...outlineProps} />
    </div>
  );

  return (
    <Shell
      current={section}
      previous={previous}
      next={next}
      currentOutline={tocOutline}
      asideLabel="On this page"
      aside={
        <>
          <h2 className="outline-label">On this page</h2>
          <OutlineList {...outlineProps} title={section.title} />
          <ReferencedSections sections={linkedSections} />
        </>
      }
    >
      <Article
        key={id}
        sectionState={sectionState}
        headings={headings}
        chapter={chapter}
        chapterName={chapterName(manual, chapter)}
        previous={previous}
        next={next}
      />
    </Shell>
  );
}

interface ArticleProps {
  sectionState: UseSectionResult;
  headings: Heading[];
  chapter: Chapter;
  chapterName: string;
  previous?: Section;
  next?: Section;
}

function Article({ sectionState, headings, chapter, chapterName, previous, next }: ArticleProps) {
  const { section, text, progress, failure } = sectionState;
  const manualId = useManualId();
  const [wrap] = useState<"pretty" | "plain">(() => (loadedAlreadyWritten(manualId, section) ? "pretty" : "plain"));
  const phase = phaseOf(sectionState);
  const hasText = text !== "";

  useArrival(() => document.getElementById(TITLE_ID));

  return (
    <article className="column article" data-status={phase} style={{ "--progress": progress } as CSSProperties}>
      <ArticleHead
        section={section}
        chapter={chapter}
        chapterName={chapterName}
        previous={previous}
        next={next}
        ringStatus={RING_STATUS[phase]}
        statusText={statusText(sectionState, phase)}
      />
      {hasText && (
        <Prose source={text} headings={headings} sectionLabel={section.label} wrap={wrap} live={phase === "writing"} />
      )}
      {phase === "writing" && <TailLine progress={progress} textLength={text.length} />}
      {failure && <FailureNotice {...FAILURE_NOTICES[failure]} onRetry={() => retryInPlace(manualId, section.id)} />}
      <p className="visually-hidden" aria-live="polite">
        {announcement(sectionState, phase)}
      </p>
      <Pager chapter={chapter} previous={previous} next={next} />
    </article>
  );
}

type Phase = "writing" | "written" | "failed";

const RING_STATUS: Record<Phase, RingStatus> = {
  writing: "writing",
  written: "written",
  failed: "unwritten",
};

function phaseOf({ status, failure }: UseSectionResult): Phase {
  if (failure) return "failed";
  return status === "written" ? "written" : "writing";
}

function retryInPlace(manualId: string, id: string) {
  retrySection(manualId, id);
  document.getElementById(TITLE_ID)?.focus();
}

function announcement({ failure }: UseSectionResult, phase: Phase): string {
  if (failure) return `Not written: ${FAILURE_WORDS[failure]}`;
  return STATUS_WORDS[phase === "written" ? "written" : "writing"];
}

function statusText({ text, progress, failure }: UseSectionResult, phase: Phase): string {
  if (failure) return `Not written · ${FAILURE_WORDS[failure]}`;
  if (phase === "written") return `Written · ${wordCount(text).toLocaleString("en-US")} words`;
  if (text === "") return "Waiting for the first words…";
  return `Being written · ${Math.round(progress * 100)}%`;
}
