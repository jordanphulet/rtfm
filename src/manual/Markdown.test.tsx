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

  it("renders footnotes", () => {
    const html = render("A claim[^1].\n\n[^1]: The source.");
    expect(html).toContain("data-footnote-ref");
    expect(html).toContain("The source.");
  });
});
