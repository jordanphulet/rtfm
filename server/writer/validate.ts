import { closesFence, fenceOpenedBy } from "./code-fences.ts";

const INLINE_CODE = /`[^`\n]*`/g;
const H1 = /^#\s/m;
const FOOTNOTE_REFERENCE = /\[\^([^\]\s]+)\](?!:)/g;
const FOOTNOTE_DEFINITION = /^ {0,3}\[\^([^\]\s]+)\]:/gm;
const SECTION_LINK = /(?:\]\(\s*|^ {0,3}\[[^\]]+\]:\s*)<?section:([^\s)>"']*)/gm;

export interface SectionContext {
  sectionId: string;
  sectionIds: ReadonlySet<string>;
}

export function sectionProblems(body: string, { sectionId, sectionIds }: SectionContext): string[] {
  if (body.trim() === "") return ["the section is empty"];
  const text = withoutCode(body);
  const problems: string[] = [];
  if (H1.test(text)) problems.push("it has an H1");

  const defined = new Set(matchesOf(FOOTNOTE_DEFINITION, text).map((label) => label.toLowerCase()));
  for (const label of new Set(matchesOf(FOOTNOTE_REFERENCE, text))) {
    if (!defined.has(label.toLowerCase())) problems.push(`footnote [^${label}] has no definition`);
  }
  for (const id of new Set(matchesOf(SECTION_LINK, text))) {
    if (id === sectionId) problems.push("it links to itself");
    else if (!sectionIds.has(id)) problems.push(`it links to section:${id}, which doesn't exist`);
  }
  return problems;
}

function withoutCode(markdown: string): string {
  let openFence: string | undefined;
  const lines = markdown.split("\n").filter((line) => {
    if (openFence === undefined) {
      openFence = fenceOpenedBy(line);
      return openFence === undefined;
    }
    if (closesFence(line, openFence)) openFence = undefined;
    return false;
  });
  return lines.join("\n").replace(INLINE_CODE, "");
}

function matchesOf(pattern: RegExp, text: string): string[] {
  return [...text.matchAll(pattern)].map((match) => match[1]!);
}
