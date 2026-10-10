import { useEffect } from "react";
import { Link } from "react-router";
import { useManual } from "../../shared";
import { allSections, sectionPath } from "./book";
import { Contents } from "./Contents";
import { Arrow, HeadRule, Leaf } from "./drawings";
import { lastOpenedSection } from "./readingMemory";

const NUMBER_WORDS = ["no", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten"];

export function TitlePage() {
  const manual = useManual();
  const sections = allSections(manual);
  const writtenCount = sections.filter((section) => section.status === "written").length;
  const lastOpened = sections.find((section) => section.id === lastOpenedSection());
  const resumeAt = lastOpened ?? sections[0];

  useEffect(() => {
    document.title = manual.title;
  }, [manual.title]);

  return (
    <main className="page title-page" id="text">
      <p className="title-kicker">
        A manual in {countInWords(manual.chapters.length, "chapter", "chapters")} and{" "}
        {countInWords(manual.appendices.length, "appendix", "appendices")}
      </p>
      <h1 className="book-title-display">{manual.title}</h1>
      <p className="book-subtitle">{manual.subtitle}</p>
      <p className="title-meta">
        {writtenCount} of {sections.length} sections written ·{" "}
        <Link to={sectionPath(resumeAt.id)}>
          {lastOpened ? "Continue" : "Begin"} at {resumeAt.label} <Arrow direction="right" />
        </Link>
      </p>
      <HeadRule />
      <div className="contents-head">
        <h2 className="caps">Contents</h2>
        <aside className="contents-key" aria-label="Key">
          <span>
            <Leaf status="written" /> written
          </span>
          <span>
            <Leaf status="writing" /> being written
          </span>
          <span>
            <Leaf status="unwritten" /> not yet written
          </span>
          <span className="key-note">Opening a section that isn’t written yet starts the writing.</span>
        </aside>
      </div>
      <Contents variant="page" markedId={lastOpened?.id} />
    </main>
  );
}

function countInWords(count: number, singular: string, plural: string): string {
  return `${NUMBER_WORDS[count] ?? count} ${count === 1 ? singular : plural}`;
}
