import type { ComponentProps } from "react";

export function ExternalLink({ className, children, ...props }: ComponentProps<"a">) {
  return (
    <a
      {...props}
      className={className ? `link external-link ${className}` : "link external-link"}
      target="_blank"
      rel="noreferrer"
    >
      {children}
      <span className="visually-hidden"> (opens in a new tab)</span>
    </a>
  );
}
