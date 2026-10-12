import { memo, type ComponentProps } from "react";
import ReactMarkdown, { type Components, type ExtraProps } from "react-markdown";
import remarkGfm from "remark-gfm";
import { MarkdownLink } from "./MarkdownLink";

const REMARK_PLUGINS = [remarkGfm];
const ALLOWED_ELEMENTS = ["p", "br", "strong", "em", "ul", "ol", "li", "code", "a"];

function ReplyLink({ node: _node, ...props }: ComponentProps<"a"> & ExtraProps) {
  return <MarkdownLink {...props} inAppClassName="link" />;
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
