import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ReplyMarkdown } from "./ReplyMarkdown";

function render(source: string, className?: string) {
  return renderToStaticMarkup(<ReplyMarkdown className={className}>{source}</ReplyMarkdown>);
}

describe("ReplyMarkdown", () => {
  it("renders paragraphs, emphasis and inline code", () => {
    expect(render("One **bold** and *italic* `code`.\n\nTwo.")).toBe(
      '<div class="markdown reply-markdown"><p>One <strong>bold</strong> and <em>italic</em> <code>code</code>.</p>\n<p>Two.</p></div>',
    );
  });

  it("renders bulleted and numbered lists", () => {
    const html = render("- a\n- b\n\n1. one\n2. two");
    expect(html).toContain("<ul>\n<li>a</li>\n<li>b</li>\n</ul>");
    expect(html).toContain("<ol>\n<li>one</li>\n<li>two</li>\n</ol>");
  });

  it("opens web links in a new tab, saying so to screen readers", () => {
    expect(render("[site](https://example.com)")).toContain(
      '<a href="https://example.com" class="link external-link" target="_blank" rel="noreferrer">site<span class="visually-hidden"> (opens in a new tab)</span></a>',
    );
  });

  it("keeps other links in the same tab", () => {
    expect(render("[library](/library/a)")).toContain('<a href="/library/a" class="link">library</a>');
  });

  it("renders anything else as its plain text", () => {
    expect(render("## Heading")).toBe('<div class="markdown reply-markdown">Heading</div>');
    expect(render("| a |\n| - |\n| b |")).not.toContain("<table");
  });

  it("adds the given class name", () => {
    expect(render("Hi.", "reply")).toBe('<div class="markdown reply-markdown reply"><p>Hi.</p></div>');
  });
});
