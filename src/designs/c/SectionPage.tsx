import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { chapterOf, useManual, useSection } from "../../shared";
import { FollowControl } from "./FollowControl";
import { chapterName, isAppendix } from "./manualParts";
import { PrevNext } from "./PrevNext";
import { PreviewProvider } from "./Preview";
import { Prose } from "./Prose";
import { SectionHead } from "./SectionHead";
import { useDevelopingText } from "./useDevelopingText";
import { WindowMark } from "./WindowMark";
import "./section.css";

const streamedThisLoad = new Set<string>();

export function SectionPage({ id }: { id: string }) {
  const manual = useManual();
  const { section, status, text } = useSection(id);
  const chapter = chapterOf(manual, id);
  const proseRef = useRef<HTMLDivElement>(null);
  const [settled] = useState(() => status === "written" && !streamedThisLoad.has(id));

  useEffect(() => {
    if (status === "writing") streamedThisLoad.add(id);
  }, [id, status]);
  useLayoutEffect(() => {
    window.scrollTo(0, 0);
  }, []);
  useDevelopingText(proseRef, status, text);

  if (!chapter) return null;
  return (
    <PreviewProvider>
      <main className="c-reader" data-cellar={isAppendix(manual, chapter) || undefined}>
        <article className="c-article">
          <SectionHead section={section} chapter={chapter} chapterName={chapterName(manual, chapter)} />
          {text === "" ? (
            <p className="c-waiting">
              <WindowMark status="writing" spoken={false} />
              Being written. The first words are on their way.
            </p>
          ) : (
            <Prose ref={proseRef} text={text} settled={settled} />
          )}
          {status === "writing" && <FollowControl proseRef={proseRef} text={text} />}
          <PrevNext id={id} />
        </article>
      </main>
    </PreviewProvider>
  );
}
