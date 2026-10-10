export interface Heading {
  id: string;
  level: 2 | 3 | 4;
  text: string;
  line: number;
  clause?: number;
}

const HEADING_LINE = /^(#{2,4})\s+(.+?)\s*#*$/;
const FENCE_LINE = /^\s*(```|~~~)/;
const SECTION_LINK = /\]\(section:([\w-]+)\)/g;
const WORD = /[\p{L}\p{N}][\p{L}\p{N}’'-]*/gu;

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[’']/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-|-$/g, "");
}

function plainText(markdown: string): string {
  return markdown.replace(/\[([^\]]*)\]\([^)]*\)/g, "$1").replace(/[*_`]/g, "");
}

export function headingsOf(markdown: string): Heading[] {
  const headings: Heading[] = [];
  const usedIds = new Set<string>();
  let insideFence = false;
  let clause = 0;
  markdown.split("\n").forEach((line, index) => {
    if (FENCE_LINE.test(line)) insideFence = !insideFence;
    const match = insideFence ? null : line.match(HEADING_LINE);
    if (!match) return;
    const text = plainText(match[2]);
    const level = match[1].length as Heading["level"];
    const id = uniqueId(slugify(text), usedIds);
    headings.push({ id, level, text, line: index + 1, clause: level === 2 ? ++clause : undefined });
  });
  return headings;
}

function uniqueId(slug: string, usedIds: Set<string>): string {
  let id = slug;
  for (let copy = 2; usedIds.has(id); copy++) id = `${slug}-${copy}`;
  usedIds.add(id);
  return id;
}

export function sectionIdsLinkedFrom(markdown: string): string[] {
  const ids = [...markdown.matchAll(SECTION_LINK)].map((match) => match[1]);
  return [...new Set(ids)];
}

export function wordCount(markdown: string): number {
  return plainText(markdown).match(WORD)?.length ?? 0;
}
