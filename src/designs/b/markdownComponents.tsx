import type { ComponentProps } from "react";
import type { Components, ExtraProps } from "react-markdown";
import { Asterism, OutboundArrow, ReturnHook } from "./drawings";

type AnchorProps = ComponentProps<"a"> & { "data-footnote-backref"?: unknown };

function Anchor({ href = "", children, ...props }: AnchorProps) {
  if (props["data-footnote-backref"] !== undefined) {
    return (
      <a href={href} {...props}>
        <ReturnHook />
      </a>
    );
  }
  if (/^https?:/.test(href)) {
    return (
      <a className="outbound-link" href={href} target="_blank" rel="noreferrer" {...props}>
        {children}
        <OutboundArrow />
        <span className="sr-only"> (opens in a new tab)</span>
      </a>
    );
  }
  return (
    <a href={href} {...props}>
      {children}
    </a>
  );
}

function HungHeading({ node: _node, children, className, ...props }: ComponentProps<"h2"> & ExtraProps) {
  if (className === "sr-only") {
    return (
      <h2 className={className} {...props}>
        {children}
      </h2>
    );
  }
  return (
    <h2 {...props}>
      <span className="hung-text">{children}</span>
    </h2>
  );
}

function ScrollingTable({ node: _node, ...props }: ComponentProps<"table"> & ExtraProps) {
  return (
    <div className="table-scroll" role="region" aria-label="Table" tabIndex={0}>
      <table {...props} />
    </div>
  );
}

function CodeBlock({ node: _node, ...props }: ComponentProps<"pre"> & ExtraProps) {
  return <pre tabIndex={0} {...props} />;
}

export const markdownComponents: Components = {
  a: Anchor,
  h2: HungHeading,
  table: ScrollingTable,
  pre: CodeBlock,
  hr: () => <Asterism />,
};
