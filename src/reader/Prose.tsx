import { createContext, useContext, useMemo, type ComponentProps, type CSSProperties } from "react";
import type { Components, ExtraProps } from "react-markdown";
import { Markdown } from "../manual";
import { ExternalLink } from "../ui";
import { CodeBlock } from "./CodeBlock";
import type { Heading } from "./markdownScan";
import { SectionLink } from "./SectionLink";
import "./prose.css";

type HastElement = NonNullable<ExtraProps["node"]>;
type HastNode = HastElement | HastElement["children"][number];

const FOOTNOTES_LABEL_ID = "footnote-label";
const WEB_URL = /^https?:\/\//;

const HeadingIdsByLine = createContext(new Map<number, string>());

function textOf(node: HastNode | undefined): string {
  if (!node) return "";
  if (node.type === "text") return node.value;
  return "children" in node ? node.children.map(textOf).join("") : "";
}

function languageOf(pre: HastElement | undefined): string {
  const code = pre?.children[0];
  const className = code?.type === "element" ? code.properties.className : undefined;
  const names = Array.isArray(className) ? className.map(String) : [];
  return names.find((name) => name.startsWith("language-"))?.replace("language-", "") ?? "";
}

function useHeadingId(node: HastElement | undefined): string | undefined {
  const idsByLine = useContext(HeadingIdsByLine);
  const line = node?.position?.start.line;
  return line === undefined ? undefined : idsByLine.get(line);
}

function NumberedHeading({ node, children, ...props }: ComponentProps<"h2"> & ExtraProps) {
  const id = useHeadingId(node);
  if (props.id === FOOTNOTES_LABEL_ID) return <h2 {...props}>{children}</h2>;
  return (
    <h2 id={id} {...props}>
      <a href={`#${id}`} className="clause-number" aria-hidden="true" tabIndex={-1} />
      {children}
    </h2>
  );
}

function headingWithId(Tag: "h3" | "h4") {
  return function HeadingWithId({ node, ...props }: ComponentProps<"h3"> & ExtraProps) {
    return <Tag id={useHeadingId(node)} {...props} />;
  };
}

function ProseLink({ href = "", children, ...props }: ComponentProps<"a">) {
  if ("data-footnote-backref" in props) {
    return (
      <a href={href} {...props} className="footnote-backref">
        ↑
      </a>
    );
  }
  if (!WEB_URL.test(href)) {
    return (
      <a href={href} {...props}>
        {children}
      </a>
    );
  }
  return (
    <ExternalLink href={href} {...props}>
      {children}
    </ExternalLink>
  );
}

function ProseTable({ node: _node, ...props }: ComponentProps<"table"> & ExtraProps) {
  return (
    <div className="table-scroll" tabIndex={0} role="region" aria-label="Table">
      <table {...props} />
    </div>
  );
}

function ProsePre({ node }: ComponentProps<"pre"> & ExtraProps) {
  return <CodeBlock language={languageOf(node)} code={textOf(node).replace(/\n$/, "")} />;
}

const components: Components = {
  h2: NumberedHeading,
  h3: headingWithId("h3"),
  h4: headingWithId("h4"),
  a: ProseLink,
  table: ProseTable,
  pre: ProsePre,
};

interface ProseProps {
  source: string;
  headings: Heading[];
  sectionLabel: string;
  wrap: "pretty" | "plain";
}

export function Prose({ source, headings, sectionLabel, wrap }: ProseProps) {
  const idsByLine = useMemo(() => new Map(headings.map((heading) => [heading.line, heading.id])), [headings]);
  const style = { "--section-label": `"${sectionLabel}"` } as CSSProperties;

  return (
    <div className="prose" data-wrap={wrap} style={style}>
      <HeadingIdsByLine.Provider value={idsByLine}>
        <Markdown source={source} SectionLink={SectionLink} components={components} className="markdown prose-root" />
      </HeadingIdsByLine.Provider>
    </div>
  );
}
