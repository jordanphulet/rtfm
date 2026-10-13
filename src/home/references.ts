import type { ConversationMessage } from "../librarian";
import type { ManualSummary } from "../library";

const STOP_WORDS = new Set([
  // Function words
  "the", "and", "for", "you", "your", "one", "own", "its", "are", "was", "has", "had", "how",
  "who", "why", "can", "all", "any", "but", "not", "our", "get", "let", "now", "out", "may",
  "about", "from", "have", "into", "that", "this", "what", "which", "with", "without", "through",
  "should", "could", "would", "will",
  // Request words
  "new", "manual", "manuals", "open", "read", "delete", "remove", "create", "start", "list",
  "library", "help", "please", "want", "like", "make", "tell", "show",
]);

const CREATE_REQUEST =
  /\b(?:create|start|make|write|draft|generate|build|plan|like|want)\s+(?:me\s+)?(?:(?:a|an|another)\s+)?(?:new\s+)?(?:manual|one|guide)\b|\bnew\s+(?:manual|one|guide)\b/i;
const EXISTING_MANUAL_WORDS = new Set(["open", "read", "delete", "remove"]);

/**
 * The manuals a message names. A manual counts when the message shares at least one word with
 * its title, or at least two with its subtitle; the best match (most title words, then most
 * subtitle words) wins, ties included. Title words ending in "-ing" are ignored: they name an
 * activity ("Building a…", "Moving House…"), not the manual's topic. A message that asks for a
 * new manual names none, since its words describe a manual that doesn't exist yet: it has a
 * phrase such as "start a new manual" or "build me one", and no word that acts on an existing
 * manual, such as "open".
 */
export function namedManuals(message: string, manuals: ManualSummary[]): ManualSummary[] {
  if (asksForNewManual(message)) return [];
  const messageWords = wordsOf(message, 3);
  if (messageWords.size === 0) return [];

  const matches = manuals
    .map((manual) => ({
      manual,
      title: sharedCount(messageWords, topicWords(manual.title)),
      subtitle: sharedCount(messageWords, wordsOf(manual.subtitle, 4)),
    }))
    .filter((match) => match.title >= 1 || match.subtitle >= 2);
  if (matches.length === 0) return [];

  const best = matches.reduce((a, b) =>
    b.title > a.title || (b.title === a.title && b.subtitle > a.subtitle) ? b : a,
  );
  return matches
    .filter((match) => match.title === best.title && match.subtitle === best.subtitle)
    .map((match) => match.manual);
}

const namedAtSend = new WeakMap<ConversationMessage, ManualSummary[]>();

/** The manuals a message named when it was sent, kept after any of them is deleted. */
export function namedWhenSent(message: ConversationMessage, manuals: ManualSummary[]): ManualSummary[] {
  let named = namedAtSend.get(message);
  if (!named) {
    named = namedManuals(message.text, manuals);
    namedAtSend.set(message, named);
  }
  return named;
}

function asksForNewManual(message: string): boolean {
  const words = message.toLowerCase().match(/\p{L}+/gu) ?? [];
  return CREATE_REQUEST.test(message) && !words.some((word) => EXISTING_MANUAL_WORDS.has(word));
}

function topicWords(title: string): Set<string> {
  return new Set([...wordsOf(title, 3)].filter((word) => !word.endsWith("ing")));
}

function wordsOf(text: string, minLength: number): Set<string> {
  const words = text.toLowerCase().match(/\p{L}+/gu) ?? [];
  return new Set(
    words.filter((word) => word.length >= minLength && !STOP_WORDS.has(word)).map(baseForm),
  );
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
