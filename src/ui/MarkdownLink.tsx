import type { ComponentProps } from "react";
import { ExternalLink } from "./ExternalLink";

const WEB_URL = /^https?:\/\//;

interface MarkdownLinkProps extends ComponentProps<"a"> {
  inAppClassName?: string;
}

export function MarkdownLink({ href = "", className, inAppClassName, ...props }: MarkdownLinkProps) {
  if (WEB_URL.test(href)) return <ExternalLink href={href} className={className} {...props} />;
  return <a href={href} className={inAppClassName ?? className} {...props} />;
}
