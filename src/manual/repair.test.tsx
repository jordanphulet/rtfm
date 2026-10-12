import { renderToStaticMarkup } from "react-dom/server";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { describe, expect, it } from "vitest";
import { repairPartialMarkdown } from "./repair";

const SEED_BODIES = import.meta.glob<string>("../../server/seed/the-haunt-that-listens/sections/*.md", {
  query: "?raw",
  import: "default",
  eager: true,
});

describe("repairPartialMarkdown", () => {
  it.each([
    ["closes bold", "Some **bold te", "Some **bold te**"],
    ["closes italic", "Some *italic", "Some *italic*"],
    ["closes underscore italic", "Some _italic", "Some _italic_"],
    ["closes nested emphasis innermost first", "**bold *both", "**bold *both***"],
    ["closes emphasis before trailing space", "Some **bold ", "Some **bold**"],
    ["drops an opener with nothing after it", "Some **", "Some "],
    ["finishes a half-typed closer", "Some **bold*", "Some **bold**"],
    ["finishes a half-typed nested closer", "**a *b**", "**a *b***"],
    ["leaves a list bullet alone", "* item", "* item"],
    ["leaves snake_case alone", "a snake_case name", "a snake_case name"],
    ["closes inline code", "Run `npm te", "Run `npm te`"],
    ["closes double-backtick code", "Run ``a ` b", "Run ``a ` b``"],
    ["drops an empty code opener", "Run `", "Run "],
    ["drops a half-typed code closer", "Run ``a`", "Run ``a``"],
    ["drops a trailing escape before closing", "Some **bold\\", "Some **bold**"],
    ["ignores emphasis inside code", "Run `a*b", "Run `a*b`"],
    ["shortens an opener that a closer only partly matches", "Start ***a** b* end ", "Start ***a** b* end "],
    ["holds back unfinished link text", "See [the dir", "See "],
    ["holds back a link while its url is unfinished", "See [the director](section:the-dir", "See "],
    ["holds back a link before its url starts", "See [the director]", "See "],
    ["ignores emphasis markers inside an unfinished url", "See [it](https://x.com/a_b*", "See "],
    ["keeps finished links", "See [it](section:x) now", "See [it](section:x) now"],
    ["keeps literal brackets", "array[0] is", "array[0] is"],
    ["closes emphasis around a held-back link", "**See it [the dir", "**See it**"],
    ["holds back an unfinished footnote reference", "A claim[^no", "A claim"],
    ["closes an unfinished code fence", "```ts\nconst a = 1;", "```ts\nconst a = 1;\n```"],
    ["closes a fence after a finished line", "```\nline\n", "```\nline\n```"],
    ["holds back an unfinished fence opener", "Text\n\n```ty", "Text\n\n"],
    ["ignores inline syntax inside a fence", "```\n**not bold", "```\n**not bold\n```"],
    ["closes a fence inside a list item", "1. Step:\n\n   ```ts\n   run(", "1. Step:\n\n   ```ts\n   run(\n   ```"],
    ["closes a fence inside a blockquote", "> Code:\n> ```\n> x = ", "> Code:\n> ```\n> x = \n> ```"],
    ["repairs after a closed fence", "```\nx\n```\n**bo", "```\nx\n```\n**bo**"],
    ["holds back an unfinished table row", "| a | b |\n| - | - |\n| 1 | 2", "| a | b |\n| - | - |\n"],
    ["holds back a table until its delimiter row is done", "Text\n\n| a | b |\n| -", "Text\n\n"],
    ["holds back a table that follows a paragraph line", "Intro line\n| a | b |\n", "Intro line"],
    ["holds back a line of markup with no words yet", "Text\n\n## ", "Text\n\n"],
    ["holds back a half-typed rule", "Text\n\n--", "Text\n\n"],
    ["holds back a checklist marker without its text", "- [ ] one\n- [x", "- [ ] one\n"],
    ["holds back a footnote definition before its colon", "Text\n\n[^1", "Text\n\n"],
  ])("%s", (_name, partial, expected) => {
    expect(repairPartialMarkdown(partial)).toBe(expected);
  });

  it("adds an empty definition for a footnote that is referenced but not yet written", () => {
    expect(repairPartialMarkdown("A claim[^1] and more")).toBe("A claim[^1] and more\n\n[^1]:");
  });

  it("does not duplicate a footnote definition that has started", () => {
    const partial = "A claim[^1].\n\n[^1]: The so";
    expect(repairPartialMarkdown(partial)).toBe(partial);
  });

  it("leaves finished markdown unchanged", () => {
    expect(repairPartialMarkdown(denseDocument)).toBe(denseDocument);
  });

  it("detects raw syntax in unrepaired partial markdown", () => {
    for (const partial of ["Some **bold te", "Run `npm", "See [it](sec", "| a | b |", "- [ ]"]) {
      expect(visibleProse(partial), partial).toMatch(RAW_SYNTAX);
    }
  });

  it("never shows raw syntax, cut at any character", () => {
    for (let length = 0; length <= denseDocument.length; length++) {
      expectNoRawSyntax(denseDocument.slice(0, length));
    }
  });

  it("never shows raw syntax while streaming the sample manual", () => {
    const bodies = Object.entries(SEED_BODIES);
    expect(bodies).toHaveLength(18);
    for (const [file, body] of bodies) {
      expect(repairPartialMarkdown(body), file).toBe(body);
      for (const end of streamedCuts(body)) {
        expectNoRawSyntax(body.slice(0, end), file);
      }
    }
  });
});

/** Cuts at word ends at least 20 characters apart, about the size of a streamed chunk. */
function streamedCuts(body: string): number[] {
  const cuts: number[] = [];
  for (const word of body.matchAll(/\S+\s*/g)) {
    const end = word.index + word[0].length;
    if (end - (cuts.at(-1) ?? 0) >= 20) cuts.push(end);
  }
  return [...cuts, body.length];
}

function expectNoRawSyntax(partial: string, label = "") {
  const visible = visibleProse(repairPartialMarkdown(partial));
  expect(visible, `${label} after ${JSON.stringify(partial.slice(-40))}`).not.toMatch(RAW_SYNTAX);
}

const RAW_SYNTAX_PATTERNS = {
  emphasisMarkers: /\*\*|(^|\s)[*_]\S|\S[*_](\s|$)/,
  codeMarkers: /`|~~~/,
  footnoteLinkAndChecklistBrackets: /\[\^|\]\(|\[[ xX]?\]/,
  tablePipes: /^\s*\||\|\s*$/,
  headingQuoteAndRuleMarkers: /^(#{1,6}|>|-{3,})(\s|$)/,
};

const RAW_SYNTAX = new RegExp(
  Object.values(RAW_SYNTAX_PATTERNS)
    .map((pattern) => pattern.source)
    .join("|"),
  "m",
);

function visibleProse(markdown: string): string {
  const html = renderToStaticMarkup(
    <ReactMarkdown remarkPlugins={[remarkGfm]}>{markdown}</ReactMarkdown>,
  );
  return html
    .replace(/<pre>[\s\S]*?<\/pre>/g, "")
    .replace(/<code>[\s\S]*?<\/code>/g, "")
    .replace(/<[^>]+>/g, "")
    .replace(/↩/g, "")
    .replace(/&gt;/g, ">");
}

const denseDocument = `## The control loop

Every room runs a **tight loop**: sense, decide, *act*. The director calls
\`tick()\` thirty times a second, and nothing in it may **block for *long***.

> **Rule one.** If a guest says stop, the show stops. See [the kill switch](section:the-show-must-stop).

1. Read the sensors.
2. Ask the director.
   - Never wait on the model.
   - Fall back to the **script**.
3. Move the actors[^latency].

- [x] Wire the e-stop
- [ ] Rehearse with fog

| Part | Budget | Notes |
| --- | ---: | --- |
| Sensor read | 5 ms | Polled, *never* blocking |
| Model call | 400 ms | See [latency](section:the-half-second-problem) |

\`\`\`ts
const actor = rig.actor("ghost");
await actor.say("**Boo**");
\`\`\`

---

Read more on [the vendor site](https://example.com/servos).[^parts]

[^latency]: Measured on the show floor, not the bench.
[^parts]: Prices change every season.
`;
