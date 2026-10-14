import { describe, expect, it } from "vitest";
import { separateFormulaFences } from "./formula-fences";

describe("separateFormulaFences", () => {
  it.each([
    ["moves LaTeX off an opening line", "$$ f = ma\n$$\nNext.", "$$\nf = ma\n$$\nNext."],
    ["moves LaTeX holding a single dollar off an opening line", "$$ c = \\$5\n$$", "$$\nc = \\$5\n$$"],
    ["moves LaTeX off a closing line", "$$\nf = ma $$\nNext.", "$$\nf = ma\n$$\nNext."],
    [
      "separates both ends of a block written on its first and last lines",
      "$$\\begin{aligned}\na &= b\n\\end{aligned}$$\n\n## Next",
      "$$\n\\begin{aligned}\na &= b\n\\end{aligned}\n$$\n\n## Next",
    ],
    ["keeps a blockquote's prefix", "> $$ x^2\n> + 1 $$", "> $$\n> x^2\n> + 1\n> $$"],
    ["keeps a list item's indent", "1. Step:\n\n   $$ x\n   $$", "1. Step:\n\n   $$\n   x\n   $$"],
    ["closes only on as many dollars", "$$$ x\n$$ y\n$$$", "$$$\nx\n$$ y\n$$$"],
  ])("%s", (_name, markdown, expected) => {
    expect(separateFormulaFences(markdown)).toBe(expected);
  });

  it.each([
    ["a block already on its own lines", "$$\nf = ma\n$$\n\nNext."],
    ["a formula alone on its line", "$$f = \\frac{c}{4L}$$\n\nNext."],
    ["inline formulas", "So $$a$$ and $$b$$ hold.\n$$c$$ and $$d$$ too."],
    ["dollar amounts", "$5 and $10.\n$20 more."],
    ["a code fence", "```tex\n$$ f = ma\nf = ma $$\n```\nAfter."],
    ["a code fence inside a blockquote", "> ~~~\n> $$ x\n> ~~~"],
  ])("leaves %s alone", (_name, markdown) => {
    expect(separateFormulaFences(markdown)).toBe(markdown);
  });
});
