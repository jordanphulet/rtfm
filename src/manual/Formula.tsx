import katex from "katex";
import "katex/dist/katex.min.css";
import { useRef, type ReactNode } from "react";
import { useWiderThanLine } from "./useWiderThanLine";

const KATEX_OPTIONS = {
  throwOnError: false,
  errorColor: "var(--ink-muted)",
  strict: "ignore",
  maxSize: 20,
} as const;

/** Taller than any real formula (a 40-row `aligned` is about 60em), far short of a runaway one. */
const MAX_FORMULA_HEIGHT_EM = 80;
const STRUT_HEIGHT = /class="katex-strut" style="height:([\d.]+)em/g;

/** Commands no manual's formula needs that can move what they draw outside the formula's box. */
const MOVING_COMMANDS = [
  "smash", "phantom", "hphantom", "vphantom", "raisebox", "raise", "lower", "rule",
  "kern", "mkern", "hskip", "mskip", "hspace", "llap", "rlap", "clap",
  "mathllap", "mathrlap", "mathclap", "moveleft", "moveright", "vcenter",
];
/** Commands that define or build other commands, which could rename a moving one. */
const DEFINING_COMMANDS = [
  "def", "gdef", "edef", "xdef", "let", "futurelet", "newcommand", "renewcommand",
  "providecommand", "DeclareMathOperator", "csname", "expandafter", "noexpand", "global",
];
const BLOCKED_COMMANDS = new Set([...MOVING_COMMANDS, ...DEFINING_COMMANDS]);
/**
 * A command's name (letters, `@` among them for KaTeX's internals, or one other character), and
 * a `[` after it.
 */
const COMMAND = /\\([a-zA-Z@]+|[^])\s*(\[?)/g;

const typesetFormulas = new Map<string, string | null>();

function typeset(tex: string, display: boolean): string | null {
  const key = `${display}:${tex}`;
  const cached = typesetFormulas.get(key);
  if (cached !== undefined) return cached;
  const katexOutput = usesBlockedCommand(tex) ? null : katexHtml(tex, display);
  const html = katexOutput !== null && heightStaysInBounds(katexOutput) ? katexOutput : null;
  typesetFormulas.set(key, html);
  return html;
}

/**
 * A blocked command, any `\@…` internal, or a line break given a length outside an environment
 * (`\\[-5em]`, which moves the next line over the text above). Inside `aligned` and the like, the
 * height check covers a line break's length.
 */
function usesBlockedCommand(tex: string): boolean {
  let environments = 0;
  for (const [, name = "", lengthFollows] of tex.matchAll(COMMAND)) {
    if (BLOCKED_COMMANDS.has(name) || name.includes("@")) return true;
    if (name === "begin") environments += 1;
    if (name === "end") environments -= 1;
    if ((name === "\\" || name === "newline") && lengthFollows && environments <= 0) return true;
  }
  return false;
}

/**
 * KaTeX's `maxSize` caps only positive sizes, so a negative line break inside an environment can
 * still make a formula thousands of ems tall. Each of KaTeX's struts is as tall as its base's
 * height and depth together, so a formula whose tallest strut passes the cap is shown as its source.
 */
function heightStaysInBounds(html: string): boolean {
  const heights = [...html.matchAll(STRUT_HEIGHT)].map(([, height]) => Number(height));
  return heights.every((height) => height <= MAX_FORMULA_HEIGHT_EM);
}

/** KaTeX shows a formula it can't parse as its source; null is for any other failure. */
function katexHtml(tex: string, display: boolean): string | null {
  try {
    return katex.renderToString(tex, { ...KATEX_OPTIONS, displayMode: display });
  } catch {
    return null;
  }
}

interface FormulaProps {
  tex: string;
  display: boolean;
}

type FormulaContent =
  | { children: ReactNode }
  | { dangerouslySetInnerHTML: { __html: string } };

export function Formula({ tex, display }: FormulaProps) {
  if (tex.trim() === "") return null;
  const html = typeset(tex, display);
  const content: FormulaContent =
    html === null
      ? { children: <span className="katex-error">{tex}</span> }
      : { dangerouslySetInnerHTML: { __html: html } };
  if (!display) return <InlineFormula html={html} content={content} />;
  return (
    <div className="formula-display">
      <div className="scroll-x" tabIndex={0} role="region" aria-label="Formula" {...content} />
    </div>
  );
}

/** On the line, unless a piece of it is wider than the line: then it scrolls sideways on a line of its own. */
function InlineFormula({ html, content }: { html: string | null; content: FormulaContent }) {
  const ref = useRef<HTMLSpanElement>(null);
  const wider = useWiderThanLine(ref, html);
  const region = wider && ({ tabIndex: 0, role: "region", "aria-label": "Formula" } as const);
  const className = wider ? "formula formula-wide scroll-x" : "formula";
  return <span ref={ref} className={className} {...region} {...content} />;
}
