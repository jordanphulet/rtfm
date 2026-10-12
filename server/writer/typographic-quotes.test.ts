import { describe, expect, it } from "vitest";
import { sectionsInReadingOrder } from "../storage/manual.ts";
import { readSeedBody, readSeedManual } from "../storage/seed.ts";
import { SAMPLE_ID } from "../testing.ts";
import { withTypographicQuotes } from "./typographic-quotes.ts";

function expectTypeset(cases: [string, string][]) {
  for (const [straight, typeset] of cases) expect(withTypographicQuotes(straight)).toBe(typeset);
}

function expectLeftAlone(markdown: string[]) {
  for (const text of markdown) expect(withTypographicQuotes(text)).toBe(text);
}

describe("typographic quotes", () => {
  it("opens and closes double and single quotes", () => {
    expectTypeset([
      [`The ghost said "Leave." and left.`, `The ghost said “Leave.” and left.`],
      [`"Leave," it said.`, `“Leave,” it said.`],
      [`Call it 'the hush' for now.`, `Call it ‘the hush’ for now.`],
      [`A figure ("the Gentleman") waits.`, `A figure (“the Gentleman”) waits.`],
      [`It stops—"Wait"—and turns.`, `It stops—“Wait”—and turns.`],
      [`**"Lights on"** ends the show, and *'quiet'* means quiet.`, `**“Lights on”** ends the show, and *‘quiet’* means quiet.`],
      [`> "Group seven is loud."`, `> “Group seven is loud.”`],
      [`- "Exit" is always answered.`, `- “Exit” is always answered.`],
      [`| "Lure" | 2 s |`, `| “Lure” | 2 s |`],
    ]);
  });

  it("nests single quotes inside double ones, and double inside single", () => {
    expectTypeset([
      [`"He keeps saying 'it's all fake'," she said.`, `“He keeps saying ‘it’s all fake’,” she said.`],
      [`"'Tis the hour," it said.`, `“’Tis the hour,” it said.`],
      [`"'Hello,' said the bride."`, `“‘Hello,’ said the bride.”`],
      [`'They call it "the parlour".'`, `‘They call it “the parlour”.’`],
    ]);
  });

  it("makes apostrophes in contractions, possessives and elisions", () => {
    expectTypeset([
      [`Don't touch what you can't see. It's dull, and that's fine.`, `Don’t touch what you can’t see. It’s dull, and that’s fine.`],
      [`The bride's veil and the guests' coats.`, `The bride’s veil and the guests’ coats.`],
      [`**Bob**'s rule and [the Director](section:the-director)'s note.`, `**Bob**’s rule and [the Director](section:the-director)’s note.`],
      [`"The Raven"'s author and 'Lenore''s ghost.`, `“The Raven”’s author and ‘Lenore’’s ghost.`],
      [`Rides of the '90s, scare 'em, 'tis, 'twas, rock 'n' roll, 'cause.`, `Rides of the ’90s, scare ’em, ’tis, ’twas, rock ’n’ roll, ’cause.`],
      [`The 1990's craze, o'clock, rock'n'roll.`, `The 1990’s craze, o’clock, rock’n’roll.`],
    ]);
  });

  it("makes primes of feet and inches after a number, unless the number closes a quote", () => {
    expectTypeset([
      [`A guest 5' 10" tall, or 6'2", on a 12" step.`, `A guest 5′ 10″ tall, or 6′2″, on a 12″ step.`],
      [`Call it "Room 101" and 'Take 2' for now.`, `Call it “Room 101” and ‘Take 2’ for now.`],
    ]);
  });

  it("leaves code blocks alone", () => {
    expectLeftAlone([
      '```json\n{"line": "Don\'t", "gesture": "none"}\n```',
      '~~~text\nGuest said: "{transcript}"\n~~~',
      '````text\n```json\n{"a": "b"}\n```\nStill code: "yes"\n````',
      '> ```ts\n> const said = "boo";\n> ```',
      'A paragraph.\n\n    const said = "boo";\n\n    const ok = \'yes\';',
      '    let it = "be";',
    ]);
    expect(withTypographicQuotes('```ts\nconst a = "b";\n```\nIt\'s "done".')).toBe(
      '```ts\nconst a = "b";\n```\nIt’s “done”.',
    );
  });

  it("treats an indented line in a list as part of the list, not code", () => {
    expectTypeset([
      ['- The first step.\n\n    It\'s "indented".', '- The first step.\n\n    It’s “indented”.'],
      ['1. One\n    - "Nested"', '1. One\n    - “Nested”'],
    ]);
  });

  it("leaves inline code alone, with any number of backticks", () => {
    expectTypeset([
      ['Send `{"line": "..."}` and it\'s done.', 'Send `{"line": "..."}` and it’s done.'],
      ["Name it ``it's `fine` 'here'`` and 'quote' it.", "Name it ``it's `fine` 'here'`` and ‘quote’ it."],
      ["Say `lights on` and the house 'listens'.", "Say `lights on` and the house ‘listens’."],
    ]);
    expectLeftAlone(["An unclosed `code span runs to the line's end, \"as here\"."]);
  });

  it("leaves link and image targets, titles and reference definitions alone", () => {
    expectTypeset([
      [`See [the "Director"](section:the-director "The 'Director'").`, `See [the “Director”](section:the-director "The 'Director'").`],
      [`Read [it](https://example.com/a_(b)/'c' "it's").`, `Read [it](https://example.com/a_(b)/'c' "it's").`],
      [`![The "bride"](bride's.png 'veil') is 'here'.`, `![The “bride”](bride's.png 'veil') is ‘here’.`],
      [`[Bob's guide]: https://example.com/bob's "Bob's"`, `[Bob’s guide]: https://example.com/bob's "Bob's"`],
    ]);
    expect(withTypographicQuotes(`[^bob's]: It's "fine".`)).toBe(`[^bob’s]: It’s “fine”.`);
  });

  it("leaves autolinks, bare URLs and HTML-like tags alone", () => {
    expectTypeset([
      [`Go to <https://example.com/it's> and it's done.`, `Go to <https://example.com/it's> and it’s done.`],
      [`Go to https://example.com/it's or www.example.com/'a' now, it's done.`, `Go to https://example.com/it's or www.example.com/'a' now, it’s done.`],
      [`See "https://example.com/a" now.`, `See “https://example.com/a" now.`],
      [`A <span title="it's">"tag"</span> here.`, `A <span title="it's">“tag”</span> here.`],
      [`<!-- don't "touch" -->`, `<!-- don't "touch" -->`],
      [`Escaped \\"quotes\\" stay \\'straight\\'.`, `Escaped \\"quotes\\" stay \\'straight\\'.`],
    ]);
  });

  it("gives back the seed manual's typography from its text with straight quotes", async () => {
    const manual = await readSeedManual(SAMPLE_ID);
    for (const section of sectionsInReadingOrder(manual)) {
      const body = (await readSeedBody(SAMPLE_ID, section.id))!;
      const straight = body.replace(/[“”]/g, '"').replace(/[‘’]/g, "'");
      expect(withTypographicQuotes(straight)).toBe(body);
    }
  });
});
