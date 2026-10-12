import { chaptersInReadingOrder } from "../../storage/manual.ts";
import type { StoredManual } from "../../storage/types.ts";

export interface ManualMatch {
  id: string;
  title: string;
  subtitle: string;
  matchingSections: string[];
}

const MAX_MATCHES = 5;
const MAX_SECTIONS_SHOWN = 3;
const TITLE_WEIGHT = 3;
const SUBTITLE_WEIGHT = 2;
const CONTENTS_WEIGHT = 1;

const STOP_WORDS = new Set([
  "the", "and", "for", "you", "your", "one", "ones", "its", "are", "was", "has", "had", "how",
  "who", "why", "can", "all", "any", "but", "not", "our", "get", "let", "now", "out", "may",
  "about", "from", "have", "into", "that", "this", "what", "which", "with", "without", "through",
  "should", "could", "would", "will", "there", "their", "them", "some", "anything", "something",
  "manual", "manuals", "book", "books", "guide", "open", "read", "delete", "remove", "find",
  "search", "show", "list", "library", "please", "want", "like", "got",
]);

/**
 * The manuals that share words with a topic, best first. A word counts once per place it
 * appears: the title counts most, then the subtitle, then the table of contents (chapter and
 * section titles and section summaries).
 */
export function findManuals(manuals: StoredManual[], topic: string): ManualMatch[] {
  const topicWords = wordsOf(topic);
  if (topicWords.size === 0) return [];
  return manuals
    .map((manual) => ({ manual, score: scoreOf(manual, topicWords) }))
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score || a.manual.title.localeCompare(b.manual.title, "en"))
    .slice(0, MAX_MATCHES)
    .map(({ manual }) => ({
      id: manual.id,
      title: manual.title,
      subtitle: manual.subtitle,
      matchingSections: matchingSections(manual, topicWords),
    }));
}

function scoreOf(manual: StoredManual, topicWords: Set<string>): number {
  return (
    TITLE_WEIGHT * sharedCount(topicWords, wordsOf(manual.title)) +
    SUBTITLE_WEIGHT * sharedCount(topicWords, wordsOf(manual.subtitle)) +
    CONTENTS_WEIGHT * sharedCount(topicWords, wordsOf(contentsText(manual)))
  );
}

function contentsText(manual: StoredManual): string {
  return chaptersInReadingOrder(manual)
    .flatMap((chapter) => [chapter.title, ...chapter.sections.flatMap((section) => [section.title, section.summary])])
    .join(" ");
}

function matchingSections(manual: StoredManual, topicWords: Set<string>): string[] {
  return chaptersInReadingOrder(manual)
    .flatMap((chapter) => chapter.sections)
    .filter((section) => sharedCount(topicWords, wordsOf(`${section.title} ${section.summary}`)) > 0)
    .slice(0, MAX_SECTIONS_SHOWN)
    .map((section) => `${section.label} ${section.title}`);
}

function wordsOf(text: string): Set<string> {
  const words = text.toLowerCase().match(/\p{L}+/gu) ?? [];
  return new Set(words.filter((word) => word.length >= 3 && !STOP_WORDS.has(word)).map(baseForm));
}

function baseForm(word: string): string {
  if (word.endsWith("ies")) return `${word.slice(0, -3)}y`;
  if (word.endsWith("ed") && word.length >= 6) return word.slice(0, -2);
  if (word.endsWith("s") && !word.endsWith("ss")) return word.slice(0, -1);
  return word;
}

function sharedCount(a: Set<string>, b: Set<string>): number {
  return [...a].filter((word) => b.has(word)).length;
}
