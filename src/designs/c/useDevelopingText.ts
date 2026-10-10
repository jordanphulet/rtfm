import { useLayoutEffect, type RefObject } from "react";
import type { Section } from "../../shared";
import { develop } from "./tokens";
import { useReducedMotion } from "./useReducedMotion";

const SKIPPED = "section[data-footnotes], .c-sr-only, .c-window-mark";
const BLOCKS = "p, li, h1, h2, h3, h4, h5, h6, td, th, pre, blockquote";
const TAIL_LENGTH = develop.levels.reduce((total, level) => total + level.characters, 0);
const WORD_SLACK = 40;

export function useDevelopingText(
  proseRef: RefObject<HTMLElement | null>,
  status: Section["status"],
  text: string,
) {
  const reducedMotion = useReducedMotion();

  useLayoutEffect(() => {
    if (!("highlights" in CSS)) return;
    const prose = proseRef.current;
    if (!prose || status !== "writing" || reducedMotion) clearHighlights();
    else markTail(prose);
  }, [proseRef, status, text, reducedMotion]);

  useLayoutEffect(() => () => clearHighlights(), []);
}

function clearHighlights() {
  if (!("highlights" in CSS)) return;
  for (const { highlight } of develop.levels) CSS.highlights.delete(highlight);
}

function markTail(prose: HTMLElement) {
  const nodes = tailTextNodes(prose);
  const { text, blockStarts } = joinNodes(nodes);
  let end = text.length;
  for (const { highlight, characters } of develop.levels) {
    const start = wordStartAtOrAfter(text, blockStarts, Math.max(0, end - characters));
    CSS.highlights.set(highlight, new Highlight(rangeBetween(nodes, start, end)));
    end = start;
  }
}

function tailTextNodes(prose: HTMLElement): Text[] {
  const walker = document.createTreeWalker(prose, NodeFilter.SHOW_TEXT, { acceptNode });
  let last: Node = prose;
  while (last.lastChild) last = last.lastChild;
  walker.currentNode = last;

  const nodes: Text[] = [];
  let length = 0;
  let node = last instanceof Text && acceptNode(last) === NodeFilter.FILTER_ACCEPT ? last : walker.previousNode();
  while (node instanceof Text && length < TAIL_LENGTH + WORD_SLACK) {
    nodes.unshift(node);
    length += node.length;
    node = walker.previousNode();
  }
  return nodes;
}

function acceptNode(node: Node) {
  return node.textContent?.trim() === "" || node.parentElement?.closest(SKIPPED)
    ? NodeFilter.FILTER_REJECT
    : NodeFilter.FILTER_ACCEPT;
}

function joinNodes(nodes: Text[]) {
  const blockStarts = new Set<number>();
  let text = "";
  nodes.forEach((node, index) => {
    const previous = nodes[index - 1];
    if (previous && blockOf(previous) !== blockOf(node)) blockStarts.add(text.length);
    text += node.data;
  });
  return { text, blockStarts };
}

function blockOf(node: Text) {
  return node.parentElement?.closest(BLOCKS);
}

function wordStartAtOrAfter(text: string, blockStarts: Set<number>, index: number) {
  for (let position = index; position < text.length; position++) {
    if (position === 0 || blockStarts.has(position) || /\s/.test(text[position - 1])) return position;
  }
  return text.length;
}

function rangeBetween(nodes: Text[], start: number, end: number): Range {
  const range = new Range();
  let offset = 0;
  for (const node of nodes) {
    const nodeEnd = offset + node.length;
    if (start >= offset && start <= nodeEnd) range.setStart(node, start - offset);
    if (end >= offset && end <= nodeEnd) {
      range.setEnd(node, end - offset);
      break;
    }
    offset = nodeEnd;
  }
  return range;
}
