import { useLayoutEffect, useMemo, useState, type CSSProperties } from "react";
import { useNavigationType } from "react-router";
import {
  chapterOf,
  findSection,
  nextSection,
  previousSection,
  useManual,
  useSection,
  type Chapter,
  type Section,
  type UseSectionResult,
} from "../manual";
import { ArticleHead, TITLE_ID } from "./ArticleHead";
import { chapterName } from "./manualParts";
import { headingsOf, sectionIdsLinkedFrom, wordCount, type Heading } from "./markdownScan";
import { isOutlineLevel, OutlineList, ReferencedSections } from "./Outline";
import { Pager } from "./Pager";
import { Prose } from "./Prose";
import { Shell } from "./Shell";
import { STATUS_WORDS } from "./statusWords";
import { loadedAlreadyWritten } from "./streamedThisLoad";
import { TailLine } from "./TailLine";
import { useActiveHeading } from "./useActiveHeading";
import { usePrevNextKeys } from "./usePrevNextKeys";

export function SectionPage({ id }: { id: string }) {
  const manual = useManual();
  const sectionState = useSection(id);
  const { section, status, text } = sectionState;
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
  usePrevNextKeys(previous?.id, next?.id);

  const outline = (
    <OutlineList
      sectionLabel={section.label}
      title={section.title}
      headings={outlineHeadings}
      activeId={activeId}
      isWriting={status !== "written"}
    />
  );

  return (
    <Shell
      current={section}
      previous={previous}
      next={next}
      currentOutline={<div className="toc-outline">{outline}</div>}
      asideLabel="On this page"
      aside={
        <>
          <h2 className="outline-label">On this page</h2>
          {outline}
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
  const { section, status, text, progress } = sectionState;
  const [wrap] = useState<"pretty" | "plain">(() => (loadedAlreadyWritten(section) ? "pretty" : "plain"));
  const isWriting = status !== "written";
  const isWaiting = text === "";

  const navigationType = useNavigationType();
  useLayoutEffect(() => {
    window.scrollTo(0, 0);
    if (navigationType === "PUSH") document.getElementById(TITLE_ID)?.focus({ preventScroll: true });
  }, [navigationType]);

  return (
    <article
      className="column article"
      data-status={isWriting ? "writing" : "written"}
      style={{ "--progress": progress } as CSSProperties}
    >
      <ArticleHead
        section={section}
        chapter={chapter}
        chapterName={chapterName}
        previous={previous}
        next={next}
        statusText={statusText(isWriting, isWaiting, progress, text)}
      />
      {!isWaiting && (
        <Prose source={text} headings={headings} sectionLabel={section.label} wrap={wrap} live={isWriting} />
      )}
      {isWriting && <TailLine progress={progress} isWaiting={isWaiting} />}
      <p className="visually-hidden" aria-live="polite">
        {STATUS_WORDS[isWriting ? "writing" : "written"]}
      </p>
      <Pager chapter={chapter} previous={previous} next={next} />
    </article>
  );
}

function statusText(isWriting: boolean, isWaiting: boolean, progress: number, text: string): string {
  if (!isWriting) return `Written · ${wordCount(text).toLocaleString("en-US")} words`;
  if (isWaiting) return "Waiting for the first words…";
  return `Being written · ${Math.round(progress * 100)}%`;
}
