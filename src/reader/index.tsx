import { useParams } from "react-router";
import { preloadProse } from "./proseChunk";
import { ManualErrorBoundary } from "./ManualErrorBoundary";
import { SectionPage } from "./SectionPage";
import { StartPage } from "./StartPage";

export default function Reader() {
  const { manualId, sectionId } = useParams();
  preloadProse();
  return (
    <ManualErrorBoundary key={manualId} resetKey={sectionId ?? ""}>
      {sectionId ? <SectionPage id={sectionId} /> : <StartPage />}
    </ManualErrorBoundary>
  );
}
