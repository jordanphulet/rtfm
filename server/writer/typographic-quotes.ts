import { closesFence, fenceOpenedBy } from "./code-fences.ts";

const INDENTED_CODE = /^( {4}|\t)/;
const LIST_LINE = /^(\s|[-*+]\s|\d+[.)]\s)/;
const REFERENCE_DEFINITION = /^ {0,3}\[(?!\^)[^\]]+\]:/;
const TAG_OR_AUTOLINK = /^<[a-z/!?]/i;
const BARE_URL = /^(https?:\/\/|www\.)[^\s<]*/i;
const ELISION = /^(em|tis|twas|til|cause|n)(?!\p{L})/iu;
const QUOTE_OPENS_AFTER = /[\s([{>“‘—–\-/|]/;
const EMPHASIS = /[*_~]/;
const SPACE = /\s/;
const DIGIT = /\d/;
const CODE_SPAN_RUNS = /`+/g;
const MATH_SPAN_RUNS = /\$+/g;
const LETTER = /\p{L}/u;
const LETTER_OR_DIGIT = /[\p{L}\p{N}]/u;

interface OpenQuotes {
  double: boolean;
  single: boolean;
}

export function withTypographicQuotes(markdown: string): string {
  const lines = markdown.split("\n");
  const isCode = codeLines(lines);
  return lines.map((line, index) => (isCode[index] ? line : lineWithTypographicQuotes(line))).join("\n");
}

function codeLines(lines: string[]): boolean[] {
  let openFence: string | undefined;
  let indentedCode = false;
  let afterBlankLine = true;
  let afterListLine = false;
  return lines.map((line) => {
    if (openFence !== undefined) {
      if (closesFence(line, openFence)) openFence = undefined;
      return true;
    }
    if (line.trim() === "") {
      afterBlankLine = true;
      return indentedCode;
    }
    indentedCode = INDENTED_CODE.test(line) && (indentedCode || (afterBlankLine && !afterListLine));
    openFence = indentedCode ? undefined : fenceOpenedBy(line);
    afterBlankLine = false;
    afterListLine = LIST_LINE.test(line);
    return indentedCode || openFence !== undefined;
  });
}

function lineWithTypographicQuotes(line: string): string {
  const definition = REFERENCE_DEFINITION.exec(line)?.[0];
  if (definition) return textWithTypographicQuotes(definition) + line.slice(definition.length);
  return textWithTypographicQuotes(line);
}

function textWithTypographicQuotes(text: string): string {
  const open: OpenQuotes = { double: false, single: false };
  let result = "";
  let previous = " ";
  let index = 0;
  while (index < text.length) {
    const leftAlone = leftAloneLength(text, index);
    if (leftAlone > 0) {
      result += text.slice(index, index + leftAlone);
      index += leftAlone;
      previous = text[index - 1]!;
      continue;
    }
    const char = text[index]!;
    let typeset = char;
    if (char === '"') typeset = doubleQuote(previous, text[index + 1] ?? " ", open);
    if (char === "'") typeset = singleQuote(previous, text.slice(index + 1), open);
    result += typeset;
    if (!EMPHASIS.test(char)) previous = typeset;
    index += 1;
  }
  return result;
}

function leftAloneLength(text: string, index: number): number {
  const rest = text.slice(index);
  const before = text[index - 1] ?? " ";
  if (rest[0] === "\\") return Math.min(2, rest.length);
  if (rest[0] === "`") return delimitedSpanLength(rest, CODE_SPAN_RUNS);
  if (rest.startsWith("$$")) return delimitedSpanLength(rest, MATH_SPAN_RUNS);
  if (rest[0] === "(" && before === "]") return linkTargetLength(rest);
  if (TAG_OR_AUTOLINK.test(rest)) return tagLength(rest);
  if (!LETTER_OR_DIGIT.test(before)) return BARE_URL.exec(rest)?.[0].length ?? 0;
  return 0;
}

function delimitedSpanLength(text: string, runs: RegExp): number {
  const opening = text.match(runs)![0];
  for (const run of text.slice(opening.length).matchAll(runs)) {
    if (run[0] === opening) return opening.length + run.index + run[0].length;
  }
  return text.length;
}

function linkTargetLength(text: string): number {
  let depth = 0;
  for (let index = 0; index < text.length; index += 1) {
    if (text[index] === "\\") index += 1;
    else if (text[index] === "(") depth += 1;
    else if (text[index] === ")") {
      depth -= 1;
      if (depth === 0) return index + 1;
    }
  }
  return text.length;
}

function tagLength(text: string): number {
  const end = text.indexOf(">");
  return end === -1 ? text.length : end + 1;
}

function doubleQuote(previous: string, next: string, open: OpenQuotes): string {
  if (opensAQuote(previous, next)) {
    open.double = true;
    return "“";
  }
  if (DIGIT.test(previous) && !open.double) return "″";
  open.double = false;
  return "”";
}

function singleQuote(previous: string, after: string, open: OpenQuotes): string {
  const next = after[0] ?? " ";
  if (opensAQuote(previous, next)) {
    if (DIGIT.test(next) || ELISION.test(after)) return "’";
    open.single = true;
    return "‘";
  }
  if (DIGIT.test(previous) && !LETTER.test(next) && !open.single) return "′";
  if (!LETTER_OR_DIGIT.test(next)) open.single = false;
  return "’";
}

function opensAQuote(previous: string, next: string): boolean {
  return QUOTE_OPENS_AFTER.test(previous) && !SPACE.test(next);
}
