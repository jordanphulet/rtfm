import { useParams } from "react-router";
import { SectionPage } from "./SectionPage";
import { Shell } from "./Shell";
import { StartPage } from "./StartPage";
import { tokenStylesheet } from "./tokens";
import "./base.css";

export default function DesignC() {
  const { sectionId } = useParams();
  return (
    <>
      <style>{tokenStylesheet}</style>
      <Shell currentId={sectionId}>
        {sectionId ? <SectionPage key={sectionId} id={sectionId} /> : <StartPage />}
      </Shell>
    </>
  );
}
