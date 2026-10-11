import { useParams } from "react-router";
import { ManualErrorBoundary } from "./ManualErrorBoundary";
import { SectionPage } from "./SectionPage";
import { StartPage } from "./StartPage";

export default function Reader() {
  const { manualId, sectionId } = useParams();
  return (
    <ManualErrorBoundary key={manualId} resetKey={sectionId ?? ""}>
      {sectionId ? <SectionPage id={sectionId} /> : <StartPage />}
    </ManualErrorBoundary>
  );
}
