import type { ComponentProps, Ref } from "react";
import { Link } from "react-router";
import { Markdown, type MarkdownProps, type SectionLinkProps } from "../../shared";
import { Glyph } from "./Glyph";
import { sectionPath } from "./manualParts";
import { usePreviewTrigger } from "./Preview";
import { WindowMark } from "./WindowMark";
import "./prose.css";

type Components = NonNullable<MarkdownProps["components"]>;

function ProseSectionLink({ section, children }: SectionLinkProps) {
  const previewTrigger = usePreviewTrigger({ kind: "section", sectionId: section.id });
  return (
    <Link to={sectionPath(section.id)} className="c-xref" data-status={section.status} {...previewTrigger}>
      {children}
      {section.status !== "written" && <WindowMark status={section.status} />}
    </Link>
  );
}

function FootnoteReference({ href = "", children, ...props }: ComponentProps<"a">) {
  const previewTrigger = usePreviewTrigger({ kind: "footnote", noteId: href.slice(1) });
  return (
    <a href={href} {...props} className="c-footnote-ref" {...previewTrigger}>
      {children}
    </a>
  );
}

function ProseAnchor(props: ComponentProps<"a">) {
  if ("data-footnote-ref" in props) return <FootnoteReference {...props} />;
  if ("data-footnote-backref" in props) {
    return (
      <a {...props} className="c-backref">
        <Glyph name="return" />
      </a>
    );
  }
  if (props.href?.startsWith("http")) {
    return (
      <a {...props} className="c-external" target="_blank" rel="noopener noreferrer">
        {props.children}
        <span className="c-external-mark">
          <Glyph name="arrowUpRight" />
          <span className="c-sr-only"> (opens in a new tab)</span>
        </span>
      </a>
    );
  }
  return <a {...props} />;
}

const components: Components = {
  a: ProseAnchor,
  table: ({ node: _node, ...props }) => (
    <div className="c-wide" role="region" aria-label="Table" tabIndex={0}>
      <table {...props} />
    </div>
  ),
  pre: ({ node: _node, ...props }) => (
    <div className="c-wide" role="region" aria-label="Code" tabIndex={0}>
      <pre {...props} />
    </div>
  ),
};

interface ProseProps {
  text: string;
  settled: boolean;
  ref: Ref<HTMLDivElement>;
}

export function Prose({ text, settled, ref }: ProseProps) {
  return (
    <div ref={ref} className="c-prose" data-settled={settled || undefined}>
      <Markdown source={text} SectionLink={ProseSectionLink} components={components} />
    </div>
  );
}
