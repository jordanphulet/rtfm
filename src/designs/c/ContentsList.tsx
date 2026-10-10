import { Link } from "react-router";
import { useManual, type Chapter, type Section } from "../../shared";
import { sectionPath } from "./manualParts";
import { WindowMark } from "./WindowMark";
import "./contents.css";

interface ContentsListProps {
  variant: "drawer" | "start";
  currentId?: string;
  hoveredId?: string;
  onHover?: (id: string | undefined) => void;
  onNavigate?: () => void;
}

export function ContentsList(props: ContentsListProps) {
  const manual = useManual();
  return (
    <div className="c-contents" data-variant={props.variant}>
      {manual.chapters.map((chapter) => (
        <ChapterGroup key={chapter.id} chapter={chapter} {...props} />
      ))}
      <div className="c-ground-line" />
      <p className="c-eyebrow c-appendices-label">Appendices · below stairs</p>
      {manual.appendices.map((chapter) => (
        <ChapterGroup key={chapter.id} chapter={chapter} appendix {...props} />
      ))}
    </div>
  );
}

function ChapterGroup({ chapter, appendix = false, ...props }: ContentsListProps & { chapter: Chapter; appendix?: boolean }) {
  return (
    <section className="c-group" data-appendix={appendix || undefined}>
      <h3 className="c-group-title">
        <span className="c-group-label">{chapter.label}</span>
        {chapter.title}
      </h3>
      <ol className="c-rows">
        {chapter.sections.map((section) => (
          <li key={section.id}>
            <Row section={section} {...props} />
          </li>
        ))}
      </ol>
    </section>
  );
}

function Row({ section, variant, currentId, hoveredId, onHover, onNavigate }: ContentsListProps & { section: Section }) {
  const current = section.id === currentId;
  const showSummary = variant === "start" || current;
  return (
    <Link
      to={sectionPath(section.id)}
      className="c-row"
      data-status={section.status}
      data-hovered={section.id === hoveredId || undefined}
      aria-current={current ? "page" : undefined}
      onClick={onNavigate}
      onPointerEnter={() => onHover?.(section.id)}
      onPointerLeave={() => onHover?.(undefined)}
      onFocus={() => onHover?.(section.id)}
      onBlur={() => onHover?.(undefined)}
    >
      <WindowMark status={section.status} />
      <span className="c-row-label">{section.label}</span>
      <span className="c-row-text">
        <span className="c-row-title">
          {section.title}
          {section.status === "writing" && (
            <span className="c-row-writing" aria-hidden="true">
              Writing
            </span>
          )}
        </span>
        {showSummary && <span className="c-row-summary">{section.summary}</span>}
      </span>
    </Link>
  );
}
