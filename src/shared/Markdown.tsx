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
  source: string;
  SectionLink: ComponentType<SectionLinkProps>;
  components?: Components;
  className?: string;
}

export const Markdown = memo(function Markdown({
  source,
  SectionLink,
  components,
  className,
}: MarkdownProps) {
  const ExternalLink = components?.a ?? "a";
  const a = useMemo(() => linkComponent(SectionLink, ExternalLink), [SectionLink, ExternalLink]);

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

function linkComponent(SectionLink: ComponentType<SectionLinkProps>, ExternalLink: ElementType) {
  return function Link({ node: _node, href = "", children, ...props }: ComponentProps<"a"> & ExtraProps) {
    const manual = useManual();
    if (!href.startsWith(SECTION_URL_PREFIX)) {
      return <ExternalLink href={href} {...props}>{children}</ExternalLink>;
    }

    const section = findSection(manual, href.slice(SECTION_URL_PREFIX.length));
    if (!section) return children;
    return <SectionLink section={section}>{children}</SectionLink>;
  };
}

function keepSectionUrls(url: string): string {
  return url.startsWith(SECTION_URL_PREFIX) ? url : defaultUrlTransform(url);
}
