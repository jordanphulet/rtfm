import { useState } from "react";
import { useParams } from "react-router";
import { findSection, useManual } from "../../shared";
import "../../shared/fonts/ibm-plex-mono";
import "../../shared/fonts/newsreader";
import { ContentsSheet } from "./ContentsSheet";
import { FolioBar } from "./FolioBar";
import { ForeEdge } from "./ForeEdge";
import { SectionPage } from "./SectionPage";
import { TitlePage } from "./TitlePage";
import "./styles/tokens.css";
import "./styles/base.css";
import "./styles/drawings.css";
import "./styles/navigation.css";
import "./styles/title-page.css";
import "./styles/contents.css";
import "./styles/section.css";
import "./styles/prose.css";
import "./styles/preview.css";

export default function DesignB() {
  const { sectionId } = useParams();
  const manual = useManual();
  const [isContentsOpen, setIsContentsOpen] = useState(false);
  const section = sectionId ? findSection(manual, sectionId) : undefined;
  const openContents = () => setIsContentsOpen(true);

  return (
    <div className="design-b" lang="en">
      <a className="skip-link" href="#text">
        Skip to text
      </a>
      <ForeEdge currentId={section?.id} onOpenContents={openContents} />
      {section ? <SectionPage key={section.id} id={section.id} /> : <TitlePage />}
      {section && <FolioBar section={section} onOpenContents={openContents} />}
      <ContentsSheet isOpen={isContentsOpen} currentId={section?.id} onClose={() => setIsContentsOpen(false)} />
    </div>
  );
}
