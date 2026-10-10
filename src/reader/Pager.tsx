import { Link } from "react-router";
import { chapterOf, useManual, type Chapter, type Section } from "../manual";
import { CONTENTS_PATH, chapterName, sectionPath } from "./manualParts";
import { StatusRing } from "./StatusRing";
import "./pager.css";

interface PagerProps {
  chapter: Chapter;
  previous?: Section;
  next?: Section;
}

export function Pager({ chapter, previous, next }: PagerProps) {
  return (
    <nav className="pager" aria-label="Previous and next section">
      {previous ? (
        <PagerLink direction="previous" section={previous} from={chapter} />
      ) : (
        <ContentsLink caption="Start of the manual" />
      )}
      {next ? (
        <PagerLink direction="next" section={next} from={chapter} />
      ) : (
        <ContentsLink caption="End of the manual" isNext />
      )}
    </nav>
  );
}

interface PagerLinkProps {
  direction: "previous" | "next";
  section: Section;
  from: Chapter;
}

function PagerLink({ direction, section, from }: PagerLinkProps) {
  const manual = useManual();
  const target = chapterOf(manual, section.id);
  const crossing = target && target.id !== from.id ? ` · ${chapterName(manual, target)}` : "";
  const caption =
    direction === "previous"
      ? `‹ Previous${crossing} · ${section.label}`
      : `Next${crossing} · ${section.label} ›`;

  return (
    <Link to={sectionPath(section.id)} className="pager-link" data-direction={direction}>
      <span className="pager-caption">{caption}</span>
      <span className="pager-title">
        {section.title}
        <StatusRing status={section.status} />
      </span>
    </Link>
  );
}

function ContentsLink({ caption, isNext = false }: { caption: string; isNext?: boolean }) {
  return (
    <Link to={CONTENTS_PATH} className="pager-link" data-direction={isNext ? "next" : "previous"}>
      <span className="pager-caption">{caption}</span>
      <span className="pager-title">Back to contents</span>
    </Link>
  );
}
