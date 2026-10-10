import {
  createContext,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react";
import { createPortal } from "react-dom";
import { chapterOf, findSection, useManual } from "../../shared";
import { chapterName } from "./manualParts";
import { layout, media, space, timing } from "./tokens";
import { WindowMark } from "./WindowMark";
import "./preview.css";

type PreviewSubject = { kind: "section"; sectionId: string } | { kind: "footnote"; noteId: string };
type OpenPreview = { subject: PreviewSubject; anchor: HTMLElement };

const PreviewContext = createContext<(preview: OpenPreview | null) => void>(() => {});

export function PreviewProvider({ children }: { children: ReactNode }) {
  const [preview, setPreview] = useState<OpenPreview | null>(null);

  useEffect(() => {
    if (!preview) return;
    const close = () => setPreview(null);
    const closeOnEscape = (event: KeyboardEvent) => event.key === "Escape" && close();
    window.addEventListener("scroll", close, { passive: true });
    window.addEventListener("resize", close);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      window.removeEventListener("scroll", close);
      window.removeEventListener("resize", close);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [preview]);

  return (
    <PreviewContext value={setPreview}>
      {children}
      {preview && createPortal(<PreviewPanel {...preview} />, document.body)}
    </PreviewContext>
  );
}

export function usePreviewTrigger(subject: PreviewSubject) {
  const setPreview = useContext(PreviewContext);
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  function show(anchor: HTMLElement, delay: number) {
    if (!window.matchMedia(media.previews).matches) return;
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setPreview({ subject, anchor }), delay);
  }

  function hide() {
    window.clearTimeout(timer.current);
    setPreview(null);
  }

  return {
    onPointerEnter: (event: { currentTarget: HTMLElement }) => show(event.currentTarget, timing.previewDelay),
    onPointerLeave: hide,
    onFocus: (event: { currentTarget: HTMLElement }) => show(event.currentTarget, 0),
    onBlur: hide,
  };
}

const PREVIEW_ID = "c-preview";

function PreviewPanel({ subject, anchor }: OpenPreview) {
  const panel = useRef<HTMLDivElement>(null);
  usePlacement(panel, anchor);
  useDescribedBy(anchor);
  return (
    <div ref={panel} id={PREVIEW_ID} className="c-preview" role="tooltip">
      {subject.kind === "section" ? (
        <SectionPreview sectionId={subject.sectionId} />
      ) : (
        <FootnotePreview noteId={subject.noteId} />
      )}
    </div>
  );
}

function useDescribedBy(anchor: HTMLElement) {
  useEffect(() => {
    const original = anchor.getAttribute("aria-describedby");
    anchor.setAttribute("aria-describedby", [original, PREVIEW_ID].filter(Boolean).join(" "));
    return () => {
      if (original === null) anchor.removeAttribute("aria-describedby");
      else anchor.setAttribute("aria-describedby", original);
    };
  }, [anchor]);
}

function usePlacement(panel: RefObject<HTMLDivElement | null>, anchor: HTMLElement) {
  useLayoutEffect(() => {
    const element = panel.current;
    if (!element) return;
    const link = anchor.getBoundingClientRect();
    const height = element.offsetHeight;
    const margin = space(4);
    const article = anchor.closest(".c-article")?.getBoundingClientRect();

    if (article && window.matchMedia(media.wide).matches) {
      element.style.left = `${article.left + layout.measure + layout.laneGap}px`;
      element.style.top = `${clamp(link.top - space(1), margin, window.innerHeight - height - margin)}px`;
      return;
    }
    const below = link.bottom + space(2);
    const top = below + height + margin > window.innerHeight ? link.top - space(2) - height : below;
    element.style.left = `${clamp(link.left, margin, window.innerWidth - layout.lane - margin)}px`;
    element.style.top = `${Math.max(margin, top)}px`;
  }, [panel, anchor]);
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

const previewState = {
  written: "Written",
  unwritten: "Not yet written. Opening it writes it.",
  writing: "Being written now.",
};

function SectionPreview({ sectionId }: { sectionId: string }) {
  const manual = useManual();
  const section = findSection(manual, sectionId);
  const chapter = chapterOf(manual, sectionId);
  if (!section || !chapter) return null;
  return (
    <>
      <p className="c-eyebrow">See also · {chapterName(manual, chapter)}</p>
      <p className="c-preview-title">
        <span className="c-preview-number">{section.label}</span> {section.title}
      </p>
      <p className="c-preview-summary">{section.summary}</p>
      <p className="c-preview-state">
        <WindowMark status={section.status} spoken={false} />
        {previewState[section.status]}
      </p>
    </>
  );
}

function FootnotePreview({ noteId }: { noteId: string }) {
  const body = useRef<HTMLDivElement>(null);
  const [empty, setEmpty] = useState(false);

  useLayoutEffect(() => {
    const note = document.getElementById(noteId);
    const target = body.current;
    if (!target) return;
    if (!note || note.textContent?.trim() === "") {
      setEmpty(true);
      return;
    }
    const copy = note.cloneNode(true) as HTMLElement;
    copy.querySelectorAll("[data-footnote-backref]").forEach((backref) => backref.remove());
    copy.querySelectorAll("[id]").forEach((element) => element.removeAttribute("id"));
    target.replaceChildren(...copy.childNodes);
  }, [noteId]);

  return (
    <>
      <p className="c-eyebrow">Footnote</p>
      <div ref={body} className="c-preview-note" />
      {empty && <p className="c-preview-note c-preview-pending">Still being written…</p>}
    </>
  );
}
