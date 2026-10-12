import type { StoredSection } from "../storage/types.ts";
import { withTypographicQuotes } from "./typographic-quotes.ts";

const PREAMBLE_MAX_LENGTH = 160;
const BARE_ASSENT_MAX_LENGTH = 40;
const ASSENT = /^(sure|certainly|of course|okay|absolutely)\b/i;
const NAMES_THE_WRITING = /\b(section|draft)\b/i;
const SAYS_HERE = /\bhere(?:'s|’s| is| are)\b/i;
const THEMATIC_BREAK = /^\s*([-*_])(\s*\1){2,}\s*$/;
const SETEXT_UNDERLINE = /^\s*=+\s*$/;
const H1 = /^#\s/;
const LAST_WHITESPACE = /\s(?=\S*$)/;

export interface SectionText {
  readyAfter(modelText: string): string;
  restAtEnd(): string;
  shownLength(): number;
  body(): string;
}

export function createSectionText(section: Pick<StoredSection, "label" | "title">): SectionText {
  let modelText = "";
  let bodyStart: number | undefined;
  let shownLength = 0;

  function body(): string {
    return bodyStart === undefined ? "" : withTypographicQuotes(modelText.slice(bodyStart));
  }

  return {
    readyAfter(text) {
      modelText += text;
      bodyStart ??= openingLength(modelText, section, false);
      const typeset = body();
      const end = wholeWordsLength(typeset);
      const ready = typeset.slice(shownLength, end);
      shownLength = end;
      return ready;
    },
    restAtEnd() {
      bodyStart ??= openingLength(modelText, section, true);
      const typeset = body();
      const rest = typeset.slice(shownLength);
      shownLength = typeset.length;
      return rest;
    },
    shownLength: () => shownLength,
    body,
  };
}

export function openingLength(
  text: string,
  section: Pick<StoredSection, "label" | "title">,
  ended: boolean,
): number | undefined {
  let lineStart = 0;
  for (;;) {
    const lineEnd = text.indexOf("\n", lineStart);
    if (lineEnd === -1 && !ended) return undefined;
    const line = text.slice(lineStart, lineEnd === -1 ? undefined : lineEnd);
    if (!isOpeningClutter(line, section)) return lineStart;
    if (lineEnd === -1) return text.length;
    lineStart = lineEnd + 1;
  }
}

function isOpeningClutter(line: string, { label, title }: Pick<StoredSection, "label" | "title">): boolean {
  if (line.trim() === "" || H1.test(line) || THEMATIC_BREAK.test(line) || SETEXT_UNDERLINE.test(line)) return true;
  const words = lettersAndDigits(line);
  if ([title, `${label} ${title}`, `Section ${label} ${title}`].some((name) => lettersAndDigits(name) === words)) {
    return true;
  }
  return isPreamble(line.trim());
}

function isPreamble(line: string): boolean {
  if (line.length > PREAMBLE_MAX_LENGTH) return false;
  if (ASSENT.test(line)) {
    return line.length <= BARE_ASSENT_MAX_LENGTH || NAMES_THE_WRITING.test(line) || SAYS_HERE.test(line);
  }
  return line.endsWith(":") && NAMES_THE_WRITING.test(line);
}

function lettersAndDigits(text: string): string {
  return text.toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
}

function wholeWordsLength(text: string): number {
  const lastWhitespace = LAST_WHITESPACE.exec(text);
  return lastWhitespace ? lastWhitespace.index + 1 : 0;
}
