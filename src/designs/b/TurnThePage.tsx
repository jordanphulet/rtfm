import { Link } from "react-router";
import { chapterOf, nextSection, previousSection, useManual, type Section } from "../../shared";
import { chapterLine, contentsPath, isBackMatter, sectionPath, stateWord } from "./book";
import { Arrow, Leaf } from "./drawings";

export function TurnThePage({ section }: { section: Section }) {
  const manual = useManual();
  const previous = previousSection(manual, section.id);
  const next = nextSection(manual, section.id);
  const currentChapter = chapterOf(manual, section.id);

  function crossingLine(target: Section) {
    const targetChapter = chapterOf(manual, target.id);
    if (!targetChapter || targetChapter === currentChapter) return undefined;
    const line = chapterLine(manual, targetChapter);
    const entersBackMatter =
      isBackMatter(manual, targetChapter) && currentChapter !== undefined && !isBackMatter(manual, currentChapter);
    return entersBackMatter ? `Back matter · ${line}` : line;
  }

  return (
    <nav className="turn-the-page" aria-label="Previous and next sections">
      {previous ? (
        <PageCell direction="previous" target={previous} chapter={crossingLine(previous)} />
      ) : (
        <ContentsCell direction="previous" heading="Previous" title="Contents" />
      )}
      {next ? (
        <PageCell direction="next" target={next} chapter={crossingLine(next)} />
      ) : (
        <ContentsCell direction="next" heading="End of the manual" title="Return to contents" />
      )}
    </nav>
  );
}

interface PageCellProps {
  direction: "previous" | "next";
  target: Section;
  chapter?: string;
}

function PageCell({ direction, target, chapter }: PageCellProps) {
  return (
    <Link className="page-cell" data-direction={direction} data-status={target.status} to={sectionPath(target.id)}>
      <CellHeading direction={direction} text={direction === "previous" ? "Previous" : "Next"} />
      {chapter && <span className="cell-chapter">{chapter}</span>}
      <span className="cell-title">
        <span className="cell-label">{target.label}</span> {target.title} <Leaf status={target.status} />
        <span className="sr-only">, {stateWord(target.status)}</span>
      </span>
      <span className="cell-summary">{target.summary}</span>
    </Link>
  );
}

function ContentsCell({ direction, heading, title }: { direction: "previous" | "next"; heading: string; title: string }) {
  return (
    <Link className="page-cell" data-direction={direction} to={contentsPath}>
      <CellHeading direction={direction} text={heading} />
      <span className="cell-title">{title}</span>
    </Link>
  );
}

function CellHeading({ direction, text }: { direction: "previous" | "next"; text: string }) {
  return (
    <span className="cell-heading caps">
      {direction === "previous" && <Arrow direction="left" />}
      {text}
      {direction === "next" && <Arrow direction="right" />}
    </span>
  );
}
