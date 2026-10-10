import { useParams } from "react-router";
import { SectionPage } from "./SectionPage";
import { StartPage } from "./StartPage";

export default function Reader() {
  const { sectionId } = useParams();
  return sectionId ? <SectionPage id={sectionId} /> : <StartPage />;
}
