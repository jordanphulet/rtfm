import { Link } from "react-router";
import { findSection, nextSection, previousSection, useManual, type Section } from "../../shared";
import { Glyph, type GlyphName } from "./Glyph";
import { allSections, sectionPath } from "./manualParts";

interface BottomBarProps {
  currentId?: string;
  onOpenContents: () => void;
}

export function BottomBar({ currentId, onOpenContents }: BottomBarProps) {
  const manual = useManual();
  const current = currentId ? findSection(manual, currentId) : undefined;
  const previous = currentId ? previousSection(manual, currentId) : undefined;
  const next = currentId ? nextSection(manual, currentId) : allSections(manual)[0];

  return (
    <nav className="c-bottom-bar" aria-label="Reading">
      <button type="button" className="c-bar-contents" data-shot="toc-toggle" onClick={onOpenContents}>
        <Glyph name="list" size="ui" />
        <span className="c-bar-label">
          {current ? (
            <>
              <span className="c-bar-number">{current.label}</span> {current.title}
            </>
          ) : (
            "Contents"
          )}
        </span>
      </button>
      <BarStep section={previous} glyph="chevronLeft" word="Previous" />
      <BarStep section={next} glyph="chevronRight" word="Next" />
    </nav>
  );
}

function BarStep({ section, glyph, word }: { section?: Section; glyph: GlyphName; word: string }) {
  if (!section) return <span className="c-bar-step" aria-hidden="true" />;
  return (
    <Link
      to={sectionPath(section.id)}
      className="c-bar-step"
      aria-label={`${word}: ${section.label} ${section.title}`}
    >
      <Glyph name={glyph} size="ui" />
    </Link>
  );
}
