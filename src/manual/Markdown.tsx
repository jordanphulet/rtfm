import { memo, useMemo, type ComponentProps, type ComponentType, type ElementType, type ReactNode } from "react";
import ReactMarkdown, { defaultUrlTransform, type Components, type ExtraProps, type Options } from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import { Formula } from "./Formula";
import { findSection } from "./reading-order";
import { useManual } from "./store";
import type { Section } from "./types";

const SECTION_URL_PREFIX = "section:";
const INLINE_FORMULA = "math-inline";
const DISPLAY_FORMULA = "math-display";

const REMARK_PLUGINS: Options["remarkPlugins"] = [remarkGfm, [remarkMath, { singleDollarTextMath: false }]];
const REHYPE_PLUGINS: Options["rehypePlugins"] = [markDisplayFormulas];

type HastElement = NonNullable<ExtraProps["node"]>;
type HastParent = Pick<HastElement, "children">;

export interface SectionLinkProps {
  section: Section;
  children: ReactNode;
}

export interface MarkdownProps {
  manualId: string;
  source: string;
  SectionLink: ComponentType<SectionLinkProps>;
  components?: Components;
  className?: string;
}

export const Markdown = memo(function Markdown({
  manualId,
  source,
  SectionLink,
  components,
  className,
}: MarkdownProps) {
  const OtherLink = components?.a ?? "a";
  const OtherCode = components?.code ?? "code";
  const a = useMemo(() => linkComponent(manualId, SectionLink, OtherLink), [manualId, SectionLink, OtherLink]);
  const code = useMemo(() => codeComponent(OtherCode), [OtherCode]);

  return (
    <div className={className}>
      <ReactMarkdown
        remarkPlugins={REMARK_PLUGINS}
        rehypePlugins={REHYPE_PLUGINS}
        components={{ ...components, a, code }}
        urlTransform={keepSectionUrls}
      >
        {source}
      </ReactMarkdown>
    </div>
  );
});

function linkComponent(manualId: string, SectionLink: ComponentType<SectionLinkProps>, OtherLink: ElementType) {
  return function Link({ node: _node, href = "", children, ...props }: ComponentProps<"a"> & ExtraProps) {
    const manual = useManual(manualId);
    if (!href.startsWith(SECTION_URL_PREFIX)) {
      return <OtherLink href={href} {...props}>{children}</OtherLink>;
    }

    const section = findSection(manual, href.slice(SECTION_URL_PREFIX.length));
    if (!section) return children;
    return <SectionLink section={section}>{children}</SectionLink>;
  };
}

function codeComponent(OtherCode: ElementType) {
  return function Code({ node, children, ...props }: ComponentProps<"code"> & ExtraProps) {
    const classes = node ? classesOf(node) : [];
    if (classes.includes(DISPLAY_FORMULA)) return <Formula tex={String(children ?? "")} display />;
    if (classes.includes(INLINE_FORMULA)) return <Formula tex={String(children ?? "")} display={false} />;
    return <OtherCode {...props}>{children}</OtherCode>;
  };
}

function keepSectionUrls(url: string): string {
  return url.startsWith(SECTION_URL_PREFIX) ? url : defaultUrlTransform(url);
}

/**
 * Leaves every display formula as a bare `code.math-display`: a `$$` block or a ```` ```math ````
 * fence (each a `pre`), and a paragraph that holds only `$$…$$`, a formula standing alone.
 */
function markDisplayFormulas() {
  return (tree: HastParent) => markDisplayFormulasIn(tree);
}

function markDisplayFormulasIn(parent: HastParent) {
  parent.children.forEach((child, index) => {
    if (child.type !== "element") return;
    const formula = displayFormulaIn(child);
    if (formula) parent.children[index] = { ...formula, properties: { className: [DISPLAY_FORMULA] } };
    else markDisplayFormulasIn(child);
  });
}

function displayFormulaIn(element: HastElement): HastElement | undefined {
  const only = element.children.length === 1 ? element.children[0] : undefined;
  if (only?.type !== "element" || only.tagName !== "code") return undefined;
  const classes = classesOf(only);
  if (element.tagName === "pre" && classes.includes("language-math")) return only;
  if (element.tagName === "p" && classes.includes(INLINE_FORMULA)) return only;
  return undefined;
}

function classesOf(element: HastElement): string[] {
  const { className } = element.properties;
  return Array.isArray(className) ? className.map(String) : [];
}
