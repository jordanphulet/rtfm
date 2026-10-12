import { Link } from "react-router";
import { chaptersInReadingOrder, sectionsInReadingOrder, useManual, type Chapter } from "../manual";
import { StatusRing } from "../ui";
import { chapterAnchor, sectionPath } from "./manualParts";
import { ManualOutline } from "./Outline";
import { Shell } from "./Shell";
import { STATUS_WORDS } from "./statusWords";
import { useArrival } from "./useArrival";
import { useManualId } from "./useManualId";
import "./start-page.css";

const START_TITLE_ID = "start-title";

export function StartPage() {
  const manual = useManual(useManualId());
  const sections = sectionsInReadingOrder(manual);
  const writtenCount = sections.filter((section) => section.status === "written").length;
  const first = manual.chapters[0].sections[0];
  useArrival(
    (hashTarget) => hashTarget?.querySelector<HTMLElement>(".start-chapter-title") ?? document.getElementById(START_TITLE_ID),
  );

  return (
    <Shell next={first} asideLabel="In this manual" aside={<ManualOutline chapters={chaptersInReadingOrder(manual)} />}>
      <div className="start">
        <header className="start-head">
          <h1 id={START_TITLE_ID} tabIndex={-1}>
            {manual.title}
          </h1>
          <p className="start-subtitle">{manual.subtitle}</p>
          <p className="start-meta">
            <span>{counted(manual.chapters.length, "chapter", "chapters")}</span> ·{" "}
            <span>{counted(manual.appendices.length, "appendix", "appendices")}</span> ·{" "}
            <span>{counted(sections.length, "section", "sections")}</span> · <span>{writtenCount} written</span>
          </p>
          <Link to={sectionPath(manual.id, first.id)} className="start-begin">
            Begin at {first.label} {first.title} ›
          </Link>
        </header>
        <ChapterBlocks chapters={manual.chapters} />
        {manual.appendices.length > 0 && (
          <section className="start-appendices" aria-labelledby="appendices-heading">
            <h2 id="appendices-heading">Appendices</h2>
            <ChapterBlocks chapters={manual.appendices} />
          </section>
        )}
      </div>
    </Shell>
  );
}

function counted(count: number, singular: string, plural: string): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

function ChapterBlocks({ chapters }: { chapters: Chapter[] }) {
  const manualId = useManualId();
  return chapters.map((chapter) => (
    <section key={chapter.id} id={chapterAnchor(chapter)} className="start-chapter">
      <h2 className="start-chapter-title" tabIndex={-1}>
        <span className="start-label">{chapter.label}</span> {chapter.title}
      </h2>
      <ol className="start-sections">
        {chapter.sections.map((section) => (
          <li key={section.id}>
            <Link to={sectionPath(manualId, section.id)} className="start-row" data-status={section.status}>
              <span className="start-label">{section.label}</span>
              <span className="start-row-text">
                <span className="start-row-title">{section.title}</span>
                <span className="start-row-summary">{section.summary}</span>
              </span>
              <span className="start-row-status">
                <StatusRing status={section.status} />
                {STATUS_WORDS[section.status]}
              </span>
            </Link>
          </li>
        ))}
      </ol>
    </section>
  ));
}
