import { Link } from "react-router";
import { chapterOf, nextSection, previousSection, useManual, type Manual, type Section } from "../../shared";
import { chapterName, isAppendix, sectionPath, startPath } from "./manualParts";
import { WindowMark } from "./WindowMark";
import "./prev-next.css";

export function PrevNext({ id }: { id: string }) {
  const manual = useManual();
  const previous = previousSection(manual, id);
  const next = nextSection(manual, id);

  return (
    <nav className="c-prev-next" aria-label="Previous and next">
      {previous ? (
        <StepLink manual={manual} from={id} to={previous} direction="previous" />
      ) : (
        <StartLink eyebrow="Start" title={manual.title} />
      )}
      {next ? (
        <StepLink manual={manual} from={id} to={next} direction="next" />
      ) : (
        <StartLink eyebrow="Back to the start" title={manual.title} />
      )}
    </nav>
  );
}

interface StepLinkProps {
  manual: Manual;
  from: string;
  to: Section;
  direction: "previous" | "next";
}

function StepLink({ manual, from, to, direction }: StepLinkProps) {
  return (
    <Link to={sectionPath(to.id)} className="c-step" data-direction={direction}>
      <span className="c-eyebrow">{stepEyebrow(manual, from, to, direction)}</span>
      <span className="c-step-title">
        <WindowMark status={to.status} />
        <span className="c-step-number">{to.label}</span> <span className="c-step-name">{to.title}</span>
      </span>
      {direction === "next" && <span className="c-step-summary">{to.summary}</span>}
    </Link>
  );
}

function StartLink({ eyebrow, title }: { eyebrow: string; title: string }) {
  return (
    <Link to={startPath} className="c-step" data-direction="start">
      <span className="c-eyebrow">{eyebrow}</span>
      <span className="c-step-title">
        <span className="c-step-name">{title}</span>
      </span>
    </Link>
  );
}

function stepEyebrow(manual: Manual, from: string, to: Section, direction: StepLinkProps["direction"]) {
  const word = direction === "next" ? "Next" : "Previous";
  const fromChapter = chapterOf(manual, from);
  const toChapter = chapterOf(manual, to.id);
  if (!toChapter || fromChapter === toChapter) return word;
  if (isAppendix(manual, toChapter) && fromChapter && !isAppendix(manual, fromChapter)) {
    return chapterName(manual, toChapter);
  }
  return `${word} ${isAppendix(manual, toChapter) ? "appendix" : "chapter"} · ${toChapter.label}`;
}
