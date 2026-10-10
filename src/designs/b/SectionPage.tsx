import { useEffect, useState } from "react";
import { Link } from "react-router";
import { chapterOf, useManual, useSection } from "../../shared";
import { chapterLine, contentsPath, isBackMatter } from "./book";
import { Opener } from "./Opener";
import { hasStreamedThisLoad, rememberOpening } from "./readingMemory";
import { SectionBody } from "./SectionBody";
import { TurnThePage } from "./TurnThePage";

export function SectionPage({ id }: { id: string }) {
  const manual = useManual();
  const { section, status, text, progress } = useSection(id);
  const [arrivedUnwritten] = useState(status !== "written");
  const [wrap] = useState<"plain" | "pretty">(() => (arrivedUnwritten || hasStreamedThisLoad(id) ? "plain" : "pretty"));
  const chapter = chapterOf(manual, id);
  const isWriting = status !== "written";

  useEffect(() => rememberOpening(id, arrivedUnwritten), [id, arrivedUnwritten]);

  useEffect(() => {
    document.title = `${section.label} ${section.title} · ${manual.title}`;
  }, [section, manual.title]);

  return (
    <main
      className="page section-page"
      data-status={status}
      data-matter={chapter && isBackMatter(manual, chapter) ? "back" : "body"}
    >
      <p className="running-head">
        <span>{chapter && chapterLine(manual, chapter)}</span>
        <Link className="book-title" to={contentsPath}>
          {manual.title}
        </Link>
      </p>
      <Opener section={section} wordCount={countWords(text)} progress={progress} />
      <SectionBody text={text} isWriting={isWriting} justFinished={arrivedUnwritten && !isWriting} wrap={wrap} />
      <TurnThePage section={section} />
    </main>
  );
}

function countWords(markdown: string): number {
  return markdown.split(/\s+/).filter((word) => /\p{L}/u.test(word)).length;
}
