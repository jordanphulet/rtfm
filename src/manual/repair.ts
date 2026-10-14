import { separateFormulaFences } from "./formula-fences";

const TABLE_ROW = /^\s*\|/;
const TABLE_DELIMITER_ROW = /^\s*\|?[\s:|-]*-[\s:|-]*$/;
const CODE_FENCE = /^([\s>]*)(`{3,}|~{3,})(.*)/;
const CODE_OR_FORMULA_FENCE = /^([\s>]*)(`{3,}|~{3,}|\${2,}(?!.*\$\$))(.*)/;
const MATH_INFO = /^\s*math(\s|$)/;

const HELD_BACK_LINES = {
  noLettersYet: /^[^\p{L}]*$/u,
  codeFence: /^[\s>]*(```|~~~)/,
  tableRow: TABLE_ROW,
  footnoteLabelBeforeColon: /^\s*\[\^[^\]]*\]?$/,
  checklistMarkerBeforeText: /^\s*([-*+]|\d+[.)])\s+\[[ xX]?\]?\s*$/,
};

type OpenSpan =
  | { kind: "code" | "math"; start: number; marker: string }
  | { kind: "emphasis"; start: number; marker: string }
  | { kind: "link"; start: number; textEnd?: number }
  | { kind: "footnote"; start: number };

/** `formulas: false` leaves dollars alone, for text whose renderer has no math, such as the librarian's replies. */
interface RepairOptions {
  formulas: boolean;
}

export function repairPartialMarkdown(partial: string, options: RepairOptions = { formulas: true }): string {
  const text = options.formulas ? separateFormulaFences(partial) : partial;
  return addMissingFootnotes(closeOpenSyntax(holdBackUnfinishedLine(text), options));
}

function holdBackUnfinishedLine(text: string): string {
  const lastLineStart = text.lastIndexOf("\n") + 1;
  const lastLine = text.slice(lastLineStart);
  const heldBack = Object.values(HELD_BACK_LINES).some((pattern) => pattern.test(lastLine));
  return heldBack ? text.slice(0, lastLineStart) : text;
}

function closeOpenSyntax(text: string, options: RepairOptions): string {
  const lines = text.split("\n");
  const { openFence, lastBlockStart } = scanBlocks(lines, options);
  if (openFence?.holdsFormula) {
    return closeOpenSyntax(lines.slice(0, openFence.line).join("\n"), options);
  }
  if (openFence) {
    return `${text}${text.endsWith("\n") ? "" : "\n"}${openFence.prefix}${openFence.marker}`;
  }

  const lastBlock = repairLastBlock(lines.slice(lastBlockStart).join("\n"), options);
  return [...lines.slice(0, lastBlockStart), lastBlock].join("\n");
}

function scanBlocks(lines: string[], { formulas }: RepairOptions) {
  let openFence: { prefix: string; marker: string; line: number; holdsFormula: boolean } | undefined;
  let lastBlockStart = 0;
  lines.forEach((line, index) => {
    const [, prefix = "", fence, info = ""] = line.match(formulas ? CODE_OR_FORMULA_FENCE : CODE_FENCE) ?? [];
    if (openFence) {
      const closesFence =
        fence?.[0] === openFence.marker[0] &&
        fence.length >= openFence.marker.length &&
        line.slice(prefix.length).trim() === fence;
      if (closesFence) {
        openFence = undefined;
        lastBlockStart = index + 1;
      }
    } else if (fence) {
      const holdsFormula = formulas && (fence[0] === "$" || MATH_INFO.test(info));
      openFence = { prefix, marker: fence, line: index, holdsFormula };
    } else if (line.trim() === "" && index < lines.length - 1) {
      lastBlockStart = index + 1;
    }
  });
  return { openFence, lastBlockStart };
}

function repairLastBlock(block: string, options: RepairOptions): string {
  let repaired = holdBackTableWithoutDelimiterRow(block);
  for (let open = findOpenSpan(repaired, options); open; open = findOpenSpan(repaired, options)) {
    repaired = closeSpan(repaired, open);
  }
  return repaired;
}

function holdBackTableWithoutDelimiterRow(block: string): string {
  const rows = block.split("\n");
  const headerIndex = rows.findIndex((row) => TABLE_ROW.test(row));
  if (headerIndex === -1 || TABLE_DELIMITER_ROW.test(rows[headerIndex + 1] ?? "")) return block;
  return rows.slice(0, headerIndex).join("\n");
}

function findOpenSpan(text: string, { formulas }: RepairOptions): OpenSpan | undefined {
  const open: OpenSpan[] = [];
  let index = 0;

  while (index < text.length) {
    const char = text[index];
    const innermost = open.at(-1);

    if (innermost?.kind === "code" || innermost?.kind === "math") {
      const run = runAt(text, index, innermost.marker[0]!);
      if (run === innermost.marker) open.pop();
      index += Math.max(run.length, 1);
    } else if (innermost?.kind === "link" && innermost.textEnd !== undefined) {
      if (char === ")") open.pop();
      index += 1;
    } else if (char === "\\") {
      index += 2;
    } else if (char === "`") {
      const marker = runAt(text, index, "`");
      open.push({ kind: "code", start: index, marker });
      index += marker.length;
    } else if (formulas && char === "$" && text[index + 1] === "$") {
      const marker = runAt(text, index, "$");
      open.push({ kind: "math", start: index, marker });
      index += marker.length;
    } else if (char === "[") {
      open.push({ kind: text[index + 1] === "^" ? "footnote" : "link", start: index });
      index += 1;
    } else if (char === "]") {
      closeBracket(text, index, open);
      index += text[index + 1] === "(" ? 2 : 1;
    } else if (char === "*" || char === "_") {
      const run = runAt(text, index, char);
      openOrCloseEmphasis(text, index, run, open);
      index += run.length;
    } else {
      index += 1;
    }
  }

  return open.at(-1);
}

function closeBracket(text: string, index: number, open: OpenSpan[]) {
  const innermost = open.at(-1);
  if (innermost?.kind === "footnote") {
    open.pop();
  } else if (innermost?.kind === "link") {
    const linkContinues = text[index + 1] === "(" || index + 1 === text.length;
    if (linkContinues) innermost.textEnd = index;
    else open.pop();
  }
}

function openOrCloseEmphasis(text: string, index: number, run: string, open: OpenSpan[]) {
  const before = text[index - 1] ?? " ";
  const after = text[index + run.length];
  const isUnderscore = run[0] === "_";

  let unmatched = run.length;
  const canClose = !/\s/.test(before) && !(isUnderscore && isWordChar(after));
  while (canClose) {
    const innermost = open.at(-1);
    if (innermost?.kind !== "emphasis" || innermost.marker[0] !== run[0] || unmatched === 0) break;
    if (innermost.marker.length > unmatched) {
      innermost.marker = innermost.marker.slice(unmatched);
      unmatched = 0;
      break;
    }
    open.pop();
    unmatched -= innermost.marker.length;
  }

  const atEnd = after === undefined;
  const canOpen =
    atEnd ||
    (unmatched === run.length && !/\s/.test(after) && !(isUnderscore && isWordChar(before)));
  if (unmatched > 0 && canOpen) {
    const leftover = run.slice(run.length - unmatched);
    open.push({ kind: "emphasis", start: index + run.length - unmatched, marker: leftover });
  }
}

function closeSpan(text: string, open: OpenSpan): string {
  switch (open.kind) {
    case "code":
      return wrapContent(text, open.start, open.marker, (content) => content.replace(/`+$/, ""));
    case "emphasis":
      return wrapContent(text, open.start, open.marker, (content) =>
        content.trimEnd().replace(/\\+$/, ""),
      );
    case "math":
    case "link":
    case "footnote":
      return text.slice(0, open.start);
  }
}

function wrapContent(
  text: string,
  start: number,
  marker: string,
  cleanContent: (content: string) => string,
): string {
  const contentStart = start + marker.length;
  const content = cleanContent(text.slice(contentStart));
  if (content.trim() === "") return text.slice(0, start);
  return text.slice(0, contentStart) + content + marker;
}

function addMissingFootnotes(text: string): string {
  const defined = new Set([...text.matchAll(/^\[\^([^\]\s]+)\]:/gm)].map((match) => match[1]));
  const referenced = new Set([...text.matchAll(/\[\^([^\]\s]+)\](?!:)/g)].map((match) => match[1]));
  const missing = [...referenced].filter((label) => !defined.has(label));
  if (missing.length === 0) return text;

  const placeholders = missing.map((label) => `[^${label}]:`).join("\n");
  return `${text.trimEnd()}\n\n${placeholders}`;
}

function runAt(text: string, index: number, char: string): string {
  let end = index;
  while (text[end] === char) end += 1;
  return text.slice(index, end);
}

function isWordChar(char: string | undefined): boolean {
  return char !== undefined && /[\p{L}\p{N}]/u.test(char);
}
