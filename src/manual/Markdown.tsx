import { memo, useMemo, type ComponentProps, type ComponentType, type ElementType, type ReactNode } from "react";
import ReactMarkdown, { defaultUrlTransform, type Components, type ExtraProps } from "react-markdown";
import remarkGfm from "remark-gfm";
import { findSection } from "./reading-order";
import { useManual } from "./store";
import type { Section } from "./types";

const SECTION_URL_PREFIX = "section:";

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
  const a = useMemo(() => linkComponent(manualId, SectionLink, OtherLink), [manualId, SectionLink, OtherLink]);

  return (
    <div className={className}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{ ...components, a }}
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

function keepSectionUrls(url: string): string {
  return url.startsWith(SECTION_URL_PREFIX) ? url : defaultUrlTransform(url);
}
