import { memo, type ComponentProps } from "react";
import ReactMarkdown, { type Components, type ExtraProps } from "react-markdown";
import remarkGfm from "remark-gfm";
import { ExternalLink } from "./ExternalLink";

const REMARK_PLUGINS = [remarkGfm];
const ALLOWED_ELEMENTS = ["p", "br", "strong", "em", "ul", "ol", "li", "code", "a"];
const WEB_URL = /^https?:\/\//;

function ReplyLink({ node: _node, href = "", children, ...props }: ComponentProps<"a"> & ExtraProps) {
  if (WEB_URL.test(href)) {
    return (
      <ExternalLink href={href} {...props}>
        {children}
      </ExternalLink>
    );
  }
  return (
    <a href={href} {...props} className="link">
      {children}
    </a>
  );
}

const components: Components = { a: ReplyLink };

export interface ReplyMarkdownProps {
  children: string;
  className?: string;
}

export const ReplyMarkdown = memo(function ReplyMarkdown({ children, className }: ReplyMarkdownProps) {
  return (
    <div className={className ? `markdown reply-markdown ${className}` : "markdown reply-markdown"}>
      <ReactMarkdown
        remarkPlugins={REMARK_PLUGINS}
        components={components}
        allowedElements={ALLOWED_ELEMENTS}
        unwrapDisallowed
      >
        {children}
      </ReactMarkdown>
    </div>
  );
});
