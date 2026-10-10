import { Link } from "react-router";
import { useManual, type Chapter, type Section } from "../../shared";
import { sectionPath, stateWord } from "./book";
import { Asterism, Leaf, Ribbon } from "./drawings";

interface ContentsProps {
  variant: "page" | "sheet";
  markedId?: string;
  markIsCurrentPage?: boolean;
  onChoose?: () => void;
}

export function Contents({ variant, markedId, markIsCurrentPage = false, onChoose }: ContentsProps) {
  const manual = useManual();
  const entryProps = { variant, markedId, markIsCurrentPage, onChoose };

  return (
    <div className="contents" data-variant={variant}>
      {manual.chapters.map((chapter) => (
        <ChapterEntry key={chapter.id} chapter={chapter} isAppendix={false} {...entryProps} />
      ))}
      <Asterism />
      <h2 className="back-matter-head caps">Back matter</h2>
      <div className="back-matter">
        {manual.appendices.map((chapter) => (
          <ChapterEntry key={chapter.id} chapter={chapter} isAppendix {...entryProps} />
        ))}
      </div>
    </div>
  );
}

type ChapterEntryProps = ContentsProps & {
  chapter: Chapter;
  isAppendix: boolean;
};

function ChapterEntry({ chapter, isAppendix, ...entryProps }: ChapterEntryProps) {
  return (
    <section className="chapter-entry" data-matter={isAppendix ? "back" : "body"}>
      <h3 className="chapter-head">
        <span className="chapter-numeral">{chapter.label}</span>
        <span className="sr-only">{isAppendix ? "Appendix" : "Chapter"} {chapter.label}: </span>
        {chapter.title}
      </h3>
      <ol className="entries">
        {chapter.sections.map((section) => (
          <SectionEntry key={section.id} section={section} {...entryProps} />
        ))}
      </ol>
    </section>
  );
}

type SectionEntryProps = ContentsProps & { section: Section };

function SectionEntry({ section, variant, markedId, markIsCurrentPage, onChoose }: SectionEntryProps) {
  const isMarked = section.id === markedId;
  return (
    <li className="entry" data-status={section.status} data-marked={isMarked || undefined}>
      {isMarked && <Ribbon />}
      <Link
        className="entry-link"
        to={sectionPath(section.id)}
        aria-current={isMarked && markIsCurrentPage ? "page" : undefined}
        onClick={onChoose}
      >
        <span className="entry-label">{section.label}</span>
        <span className="entry-title">{section.title}</span>
        <span className="entry-leaders" aria-hidden="true" />
        <Leaf status={section.status} />
        <span className="sr-only">
          , {stateWord(section.status)}
          {isMarked && !markIsCurrentPage && ", last opened"}
        </span>
      </Link>
      {variant === "page" && <p className="entry-summary">{section.summary}</p>}
    </li>
  );
}
