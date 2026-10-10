import { useState } from "react";
import { Link } from "react-router";
import { findSection, useManual } from "../../shared";
import { ContentsList } from "./ContentsList";
import { Glyph } from "./Glyph";
import { House } from "./house/House";
import { allSections, sectionPath, stateWord, writtenCount } from "./manualParts";
import { WindowMark } from "./WindowMark";
import "./start.css";

export function StartPage() {
  const manual = useManual();
  const [hoveredId, setHoveredId] = useState<string>();
  const [houseAvailable, setHouseAvailable] = useState(true);
  const first = allSections(manual)[0];

  return (
    <main className="c-start">
      <div className="c-start-text">
        <h1 className="c-start-title">{manual.title}</h1>
        <p className="c-start-subtitle">{manual.subtitle}</p>
        <p className="c-lamp-count c-start-count">
          <WindowMark status="written" spoken={false} />
          {writtenCount(manual)} of {allSections(manual).length} rooms lit. A dark room is written the first time
          you open it.
        </p>
        <Link to={sectionPath(first.id)} className="c-begin">
          <span className="c-begin-title">
            Begin at {first.label}, {first.title}
            <Glyph name="arrowRight" />
          </span>
        </Link>
        <h2 className="c-eyebrow c-start-contents-label">Contents</h2>
        <ContentsList variant="start" hoveredId={hoveredId} onHover={setHoveredId} />
      </div>
      {houseAvailable && (
        <div className="c-start-stage" aria-hidden="true">
          <House hoveredId={hoveredId} onHover={setHoveredId} onUnavailable={() => setHouseAvailable(false)} />
          <HouseCaption hoveredId={hoveredId} />
        </div>
      )}
    </main>
  );
}

function HouseCaption({ hoveredId }: { hoveredId?: string }) {
  const manual = useManual();
  const section = hoveredId ? findSection(manual, hoveredId) : undefined;
  return (
    <p className="c-house-caption">
      {section ? (
        <>
          <WindowMark status={section.status} spoken={false} />
          <span className="c-house-caption-number">{section.label}</span> {section.title} ·{" "}
          {stateWord[section.status]}
        </>
      ) : (
        "Lit windows are written. Dark ones are written when you open them."
      )}
    </p>
  );
}
