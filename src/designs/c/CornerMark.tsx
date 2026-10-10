import { Link } from "react-router";
import { useManual } from "../../shared";
import { Glyph } from "./Glyph";
import { startPath } from "./manualParts";

export function CornerMark({ onOpenContents }: { onOpenContents: () => void }) {
  const manual = useManual();
  return (
    <div className="c-corner">
      <Link to={startPath} className="c-corner-title">
        {manual.title}
      </Link>
      <button type="button" className="c-corner-contents" data-shot="toc-toggle" onClick={onOpenContents}>
        <Glyph name="list" />
        <span className="c-eyebrow">Contents</span>
      </button>
    </div>
  );
}
