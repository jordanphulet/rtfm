import { useLayoutEffect } from "react";
import { Link, useLocation } from "react-router";
import { useManual, type Chapter } from "../manual";
import { StatusRing } from "../ui";
import { allSections, chapterAnchor, sectionPath } from "./manualParts";
import { ManualOutline } from "./Outline";
import { Shell } from "./Shell";
import { STATUS_WORDS } from "./statusWords";
import { useManualId } from "./useManualId";
import "./start-page.css";

export function StartPage() {
  const manual = useManual(useManualId());
  const sections = allSections(manual);
  const writtenCount = sections.filter((section) => section.status === "written").length;
  const first = manual.chapters[0].sections[0];
  useScrollToHash();

  return (
    <Shell next={first} asideLabel="In this manual" aside={<ManualOutline chapters={[...manual.chapters, ...manual.appendices]} />}>
      <div className="start">
        <header className="start-head">
          <h1>{manual.title}</h1>
          <p className="start-subtitle">{manual.subtitle}</p>
          <p className="start-meta">
            <span>{manual.chapters.length} chapters</span> · <span>{manual.appendices.length} appendices</span> ·{" "}
            <span>{sections.length} sections</span> · <span>{writtenCount} written</span>
          </p>
          <Link to={sectionPath(manual.id, first.id)} className="start-begin">
            Begin at {first.label} {first.title} ›
          </Link>
        </header>
        <ChapterBlocks chapters={manual.chapters} />
        <section className="start-appendices" aria-labelledby="appendices-heading">
          <h2 id="appendices-heading">Appendices</h2>
          <ChapterBlocks chapters={manual.appendices} />
        </section>
      </div>
    </Shell>
  );
}

function ChapterBlocks({ chapters }: { chapters: Chapter[] }) {
  const manualId = useManualId();
  return chapters.map((chapter) => (
    <section key={chapter.id} id={chapterAnchor(chapter)} className="start-chapter">
      <h2 className="start-chapter-title">
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

function useScrollToHash() {
  const { hash } = useLocation();
  useLayoutEffect(() => {
    if (hash) document.getElementById(hash.slice(1))?.scrollIntoView();
    else window.scrollTo(0, 0);
  }, [hash]);
}
