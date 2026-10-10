import { useEffect, useState } from "react";
import "./code-block.css";

const COPY_RESULT_SHOWN_MS = 1500;

const COPY_LABELS = {
  ready: "Copy",
  copied: "Copied",
  failed: "Couldn’t copy",
};

interface CodeBlockProps {
  language: string;
  code: string;
}

export function CodeBlock({ language, code }: CodeBlockProps) {
  const [copyState, setCopyState] = useState<keyof typeof COPY_LABELS>("ready");

  useEffect(() => {
    if (copyState === "ready") return;
    const timer = setTimeout(() => setCopyState("ready"), COPY_RESULT_SHOWN_MS);
    return () => clearTimeout(timer);
  }, [copyState]);

  const copy = () => {
    navigator.clipboard.writeText(code).then(
      () => setCopyState("copied"),
      () => setCopyState("failed"),
    );
  };

  return (
    <div className="code-block" data-language={language || undefined}>
      <div className="code-strip">
        <span className="code-language">{language}</span>
        <button type="button" className="code-copy" onClick={copy}>
          <span aria-live="polite">{COPY_LABELS[copyState]}</span>
        </button>
      </div>
      <pre tabIndex={0} aria-label={language ? `${language} code` : "Code"}>
        <code>{code}</code>
      </pre>
    </div>
  );
}
