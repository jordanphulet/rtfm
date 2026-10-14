import katex from "katex";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { Markdown, type SectionLinkProps } from "./Markdown";
import type { Manual, Section } from "./types";

const { manual } = vi.hoisted(() => {
  const section = (id: string, status: Section["status"]): Section => ({
    id,
    label: id,
    title: id,
    summary: "",
    status,
  });
  const manual: Manual = {
    id: "fixture",
    title: "Fixture",
    subtitle: "",
    chapters: [
      {
        id: "1",
        label: "1",
        title: "One",
        sections: [section("written-one", "written"), section("unwritten-one", "unwritten")],
      },
    ],
    appendices: [],
  };
  return { manual };
});

vi.mock("./store", () => ({
  useManual(manualId: string) {
    if (manualId !== manual.id) throw new Error(`Unexpected manual "${manualId}"`);
    return manual;
  },
}));

function SectionLink({ section, children }: SectionLinkProps) {
  return (
    <a href={`/test/${section.id}`} data-status={section.status}>
      {children}
    </a>
  );
}

function render(source: string) {
  return renderToStaticMarkup(<Markdown manualId={manual.id} source={source} SectionLink={SectionLink} />);
}

describe("Markdown", () => {
  it("hands cross-references to SectionLink with the target section and its status", () => {
    const html = render("See [written](section:written-one) and [unwritten](section:unwritten-one).");
    expect(html).toContain('<a href="/test/written-one" data-status="written">written</a>');
    expect(html).toContain('<a href="/test/unwritten-one" data-status="unwritten">unwritten</a>');
  });

  it("renders a cross-reference to an unknown section as plain text", () => {
    expect(render("See [nowhere](section:no-such-section).")).toBe("<div><p>See nowhere.</p></div>");
  });

  it("keeps external links", () => {
    expect(render("[site](https://example.com)")).toContain('<a href="https://example.com">site</a>');
  });

  it("uses the given components and class name", () => {
    const html = renderToStaticMarkup(
      <Markdown
        manualId={manual.id}
        source="## Title"
        SectionLink={SectionLink}
        className="prose"
        components={{ h2: ({ node: _node, ...props }) => <h2 data-custom {...props} /> }}
      />,
    );
    expect(html).toBe('<div class="prose"><h2 data-custom="true">Title</h2></div>');
  });

  it("renders a formula between double dollars inline, within its sentence", () => {
    const html = render("The pitch is $$f = \\frac{c}{4L}$$ for a closed pipe.");
    expect(html).toMatch(/^<div><p>The pitch is <span class="formula"><span class="katex">.*<\/span><\/span> for a closed pipe\.<\/p><\/div>$/);
    expect(html).toContain('<annotation encoding="application/x-tex">f = \\frac{c}{4L}</annotation>');
    expect(html).not.toContain("katex-display");
  });

  it("renders a $$ block as display math, in a labelled region that scrolls sideways", () => {
    const html = render("The pitch:\n\n$$\nf = \\frac{c}{4(L + 0.61d)}\n$$\n\nThen tune it.");
    expect(html).toMatch(
      /<p>The pitch:<\/p>\n<div class="formula-display"><div class="scroll-x" tabindex="0" role="region" aria-label="Formula"><span class="katex-display">.*<\/span><\/div><\/div>\n<p>Then tune it\.<\/p>/,
    );
  });

  it("renders a formula alone in its paragraph, and a math code fence, as display math", () => {
    const html = render("$$f = \\frac{c}{4(L + 0.61d)}$$\n\n> $$x^2$$\n\n```math\ny^2\n```");
    expect(html.match(/<div class="formula-display">/g)).toHaveLength(3);
    expect(html).toContain("<blockquote>\n<div class=\"formula-display\">");
    expect(html).not.toMatch(/<p>|<pre>/);
  });

  it("hands code that isn't a formula to the given code component", () => {
    const html = renderToStaticMarkup(
      <Markdown
        manualId={manual.id}
        source="Run `npm test` now."
        SectionLink={SectionLink}
        components={{ code: ({ node: _node, ...props }) => <code data-custom {...props} /> }}
      />,
    );
    expect(html).toBe('<div><p>Run <code data-custom="true">npm test</code> now.</p></div>');
  });

  it("typesets each formula once, however often the text around it renders", () => {
    const renderToString = vi.spyOn(katex, "renderToString");
    render("So $$q = 1$$.");
    render("So $$q = 1$$, and more.\n\n$$\nq = 1\n$$");
    expect(renderToString.mock.calls.map(([tex, options]) => [tex, options?.displayMode])).toEqual([
      ["q = 1", false],
      ["q = 1", true],
    ]);
    renderToString.mockRestore();
  });

  it.each([
    ["a smashed box lowered far below the line", "\\smash{\\raisebox{-1000em}{x}}"],
    ["a phantom", "a\\hphantom{\\raisebox{-1000em}{x}}b"],
    ["nested smashes", "\\smash{\\raisebox{-20em}{\\smash{\\raisebox{-20em}{x}}}}"],
    ["a line break with a length outside an environment", "a\\\\[-1000em]b"],
    ["a new line with a length", "a\\newline[-5em]b"],
    ["a moderate negative kern", "a\\kern-5em b"],
    ["a left overlap", "\\mathllap{\\text{x}}"],
    ["fifty rules", "\\rule{20em}{1em}".repeat(50)],
    ["a box lowered in nc", "\\raisebox{-1000nc}{x}"],
    ["a rule inside text", "\\text{\\rule[-1000em]1em1em}"],
    ["a macro definition", "\\def\\x{\\smash}\\x{x}"],
    ["a command built from its name", "\\csname smash\\endcsname{x}"],
    ["a renamed command", "\\let\\s\\smash\\s{x}"],
    ["one of KaTeX's internals", "\\raisebox{-\\@firstoftwo{1000}{}em}{x}"],
    ["a huge negative line break inside an environment", "\\begin{aligned}a\\\\[-1000em]b\\end{aligned}"],
  ])("shows %s as its source, so it can't move the text around it", (_name, tex) => {
    const inline = render(`So $$${tex}$$ here.`);
    expect(inline).toContain(`<span class="formula"><span class="katex-error">${tex}</span></span>`);
    expect(inline).not.toContain('class="katex"');
  });

  it.each([
    ["inches", "12 in = 1 ft"],
    ["centimeters", "30 cm \\approx 1 ft"],
    ["ex", "t = 100 ex"],
    ["a 40-row aligned block", `\\begin{aligned}${Array.from({ length: 40 }, (_, row) => `a_{${row}} &= b`).join("\\\\")}\\end{aligned}`],
    ["a line break with a length inside an environment", "\\begin{aligned}a &= b \\\\[4pt] c &= d\\end{aligned}"],
    ["a matrix", "\\begin{pmatrix} a & b \\\\ c & d \\end{pmatrix}"],
    ["cases", "f(x) = \\begin{cases} 1 & x > 0 \\\\ 0 & \\text{otherwise} \\end{cases}"],
    ["an integral", "\\int_0^1 \\frac{a}{b}\\,dx"],
    ["fixed spaces", "a \\quad b \\qquad c \\, d \\; e \\! f \\: g \\ h"],
    ["a command whose name starts like a blocked one", "\\rho \\ruler"],
  ])("typesets %s", (_name, tex) => {
    const html = render(`$$\n${tex}\n$$`);
    expect(html).toContain('class="katex"');
    expect(html).not.toContain('class="katex-error"');
  });

  it("caps a line break's positive length at 20em", () => {
    const html = render("$$\\begin{aligned}a\\\\[1000em]b\\end{aligned}$$");
    expect(html).toMatch(/class="katex-strut" style="height:2\d\.\d+em;/);
  });

  it("finds KaTeX's struts, whose heights the size check reads", () => {
    expect(render("$$\\frac{a}{b}$$")).toMatch(/class="katex-strut" style="height:[\d.]+em;/);
  });

  it("renders nothing for an empty formula", () => {
    expect(render("Before.\n\n$$\n$$\n\n```math\n```\n\nAfter.")).toBe("<div><p>Before.</p>\n\n\n<p>After.</p></div>");
  });

  it("leaves dollar amounts as text", () => {
    expect(render("Pipes cost $5 and $10, or $15 for both.")).toBe(
      "<div><p>Pipes cost $5 and $10, or $15 for both.</p></div>",
    );
  });

  it("shows a formula KaTeX can't read as its source, in the muted ink rather than red", () => {
    expect(render("See $$\\frac{a$$ here.")).toContain(
      '<span class="katex-error" title="ParseError: KaTeX parse error: Unexpected end of input in a macro argument, expected &#x27;}&#x27; at end of input: \\frac{a" style="color:var(--ink-muted)">\\frac{a</span>',
    );
  });

  it("never turns a formula into a link or raw HTML", () => {
    const html = render("$$\\href{javascript:alert(1)}{x} \\url{https://example.com} \\htmlClass{evil}{y}$$");
    expect(html).not.toMatch(/<a[\s>]|href=|class="evil"/);
  });

  it("renders footnotes", () => {
    const html = render("A claim[^1].\n\n[^1]: The source.");
    expect(html).toContain("data-footnote-ref");
    expect(html).toContain("The source.");
  });
});
