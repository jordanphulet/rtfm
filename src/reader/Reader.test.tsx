// @vitest-environment happy-dom
import { act } from "react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from "vitest";
import type { Manual, Section } from "../manual";
import Reader from "./index";
import { click, press, render } from "../testing";

const fake = vi.hoisted(() => {
  const section = (id: string, status: Section["status"] = "written"): Section => ({
    id,
    label: id.toUpperCase(),
    title: `Title ${id}`,
    summary: `Summary ${id}`,
    status,
  });
  const manual: Manual = {
    id: "m",
    title: "The Manual",
    subtitle: "A fixture",
    chapters: [
      { id: "1", label: "1", title: "First", sections: [section("a"), section("b"), section("c")] },
      { id: "2", label: "2", title: "Second", sections: [section("streamed", "writing"), section("away", "writing")] },
    ],
    appendices: [{ id: "A", label: "A", title: "Tables", sections: [section("x")] }],
  };
  const body = [
    "Intro with a note.[^1] See [the tables](section:x).",
    "",
    "## Wiring",
    "",
    "```text",
    "ArrowRight here scrolls the code",
    "```",
    "",
    "[^1]: The note.",
  ].join("\n");
  return { initialManual: manual, manual, body, listeners: new Set<() => void>() };
});

vi.mock("../manual/store", async () => {
  const { useSyncExternalStore } = await import("react");
  const { findSection } = await import("../manual/reading-order");
  const subscribe = (listener: () => void) => {
    fake.listeners.add(listener);
    return () => {
      fake.listeners.delete(listener);
    };
  };
  const useManual = () => useSyncExternalStore(subscribe, () => fake.manual);
  return {
    useManual,
    useSection(_manualId: string, id: string) {
      const section = findSection(useManual(), id)!;
      return { section, status: section.status, text: fake.body, progress: section.status === "written" ? 1 : 0.5 };
    },
    retrySection() {},
  };
});

function setStatus(id: string, status: Section["status"]) {
  const withStatus = (chapter: Manual["chapters"][number]) => ({
    ...chapter,
    sections: chapter.sections.map((section) => (section.id === id ? { ...section, status } : section)),
  });
  fake.manual = { ...fake.manual, chapters: fake.manual.chapters.map(withStatus) };
  act(() => fake.listeners.forEach((listener) => listener()));
}

let router: ReturnType<typeof createMemoryRouter>;
let scrollTo: MockInstance;
let scrollIntoView: MockInstance;

beforeEach(() => {
  fake.manual = fake.initialManual;
  scrollTo = vi.spyOn(window, "scrollTo").mockImplementation(() => {});
  scrollIntoView = vi.spyOn(HTMLElement.prototype, "scrollIntoView").mockImplementation(() => {});
});

afterEach(() => {
  router?.dispose();
  vi.restoreAllMocks();
});

function open(path: string) {
  router = createMemoryRouter(
    [
      { path: "/read/:manualId", element: <Reader /> },
      { path: "/read/:manualId/:sectionId", element: <Reader /> },
    ],
    { initialEntries: [path] },
  );
  render(<RouterProvider router={router} />);
}

async function go(to: string | number) {
  scrollTo.mockClear();
  scrollIntoView.mockClear();
  await act(() => (typeof to === "number" ? router.navigate(to) : router.navigate(to)));
}

function pathname(): string {
  return router.state.location.pathname;
}

function focused(): Element | null {
  return document.activeElement;
}

describe("arriving at a page", () => {
  it("scrolls a fresh load to the top and leaves focus alone", () => {
    open("/read/m/b");
    expect(scrollTo).toHaveBeenCalledWith(0, 0);
    expect(focused()).toBe(document.body);
  });

  it("scrolls to the top and focuses the title after a link to a section", async () => {
    open("/read/m/a");
    await go("/read/m/b");
    expect(scrollTo).toHaveBeenCalledWith(0, 0);
    expect(focused()).toBe(document.getElementById("section-title"));
    expect(focused()?.textContent).toContain("Title b");
  });

  it("scrolls to the top but leaves focus alone going back", async () => {
    open("/read/m/a");
    await go("/read/m/b");
    (focused() as HTMLElement).blur();
    await go(-1);
    expect(pathname()).toBe("/read/m/a");
    expect(scrollTo).toHaveBeenCalledWith(0, 0);
    expect(focused()).toBe(document.body);
  });

  it("lands on a heading named in the hash", () => {
    open("/read/m/b#wiring");
    expect(scrollIntoView.mock.contexts).toEqual([document.getElementById("wiring")]);
    expect(scrollTo).not.toHaveBeenCalled();
  });

  it("lands on a footnote named in the hash", () => {
    open("/read/m/b#user-content-fn-1");
    expect(scrollIntoView.mock.contexts).toEqual([document.getElementById("user-content-fn-1")]);
  });

  it("leaves later hash changes on the same page to the browser, and Back from them too", async () => {
    open("/read/m/b");
    const pagerLink = document.querySelector<HTMLElement>(".pager a")!;
    act(() => pagerLink.focus());

    await go("/read/m/b#user-content-fn-1");
    expect(scrollTo).not.toHaveBeenCalled();
    expect(scrollIntoView).not.toHaveBeenCalled();
    expect(focused()).toBe(pagerLink);

    await go(-1);
    expect(pathname()).toBe("/read/m/b");
    expect(scrollTo).not.toHaveBeenCalled();
    expect(scrollIntoView).not.toHaveBeenCalled();
    expect(focused()).toBe(pagerLink);
  });

  it("scrolls to the top when the hash names nothing", () => {
    open("/read/m/b#nowhere");
    expect(scrollIntoView).not.toHaveBeenCalled();
    expect(scrollTo).toHaveBeenCalledWith(0, 0);
  });

  it("focuses the start page's title after a link to it", async () => {
    open("/read/m/a");
    await go("/read/m");
    expect(scrollTo).toHaveBeenCalledWith(0, 0);
    expect(focused()?.tagName).toBe("H1");
    expect(focused()?.textContent).toBe("The Manual");
  });

  it("scrolls to the chapter in the hash and focuses its heading after a link to it", async () => {
    open("/read/m/a");
    await go("/read/m#chapter-2");
    const chapter = document.getElementById("chapter-2")!;
    expect(scrollIntoView.mock.contexts).toEqual([chapter]);
    expect(focused()).toBe(chapter.querySelector("h2"));
  });

  it("leaves focus alone on a fresh load of the start page", () => {
    open("/read/m#chapter-2");
    expect(scrollIntoView.mock.contexts).toEqual([document.getElementById("chapter-2")]);
    expect(focused()).toBe(document.body);
  });
});

describe("the wrapping rule", () => {
  function wrap(): string | null {
    return document.querySelector(".prose")!.getAttribute("data-wrap");
  }

  it("wraps a section written when the page first saw it prettily", () => {
    open("/read/m/a");
    expect(wrap()).toBe("pretty");
  });

  it("keeps plain wrapping for a section that streamed while open", () => {
    open("/read/m/streamed");
    expect(wrap()).toBe("plain");
    setStatus("streamed", "written");
    expect(document.querySelector(".article")!.getAttribute("data-status")).toBe("written");
    expect(wrap()).toBe("plain");
  });

  it("keeps plain wrapping for a section that streamed while the reader was away", async () => {
    open("/read/m/a");
    setStatus("away", "written");
    await go("/read/m/away");
    expect(wrap()).toBe("plain");
  });
});

describe("the contents sheet", () => {
  function toggle(): HTMLElement {
    return document.querySelector<HTMLElement>("[data-shot='toc-toggle']")!;
  }

  function sheet(): HTMLElement {
    return document.getElementById("contents-sheet")!;
  }

  it("focuses the current section's row on open", () => {
    open("/read/m/b");
    click(toggle());
    expect(focused()).toBe(sheet().querySelector(".toc-row[aria-current='page']"));
    expect(focused()?.textContent).toContain("Title b");
  });

  it("focuses the manual title on open from the start page", () => {
    open("/read/m");
    click(toggle());
    expect(focused()).toBe(sheet().querySelector(".toc-manual-title"));
  });

  it("closes on Escape and returns focus to the toggle", () => {
    open("/read/m/b");
    click(toggle());
    press("Escape");
    expect(sheet().hasAttribute("data-open")).toBe(false);
    expect(focused()).toBe(toggle());
  });

  it("says the current section's status in the toggle's words", () => {
    open("/read/m/streamed");
    expect(toggle().textContent).toContain("Title streamed, being written");
  });
});

describe("the arrow keys", () => {
  it("go to the previous and next section", () => {
    open("/read/m/b");
    press("ArrowRight");
    expect(pathname()).toBe("/read/m/c");
    press("ArrowLeft");
    press("ArrowLeft");
    expect(pathname()).toBe("/read/m/a");
  });

  it("cross into the appendices", () => {
    open("/read/m/away");
    press("ArrowRight");
    expect(pathname()).toBe("/read/m/x");
  });

  it("do nothing past either end", () => {
    open("/read/m/a");
    press("ArrowLeft");
    expect(pathname()).toBe("/read/m/a");
  });

  it.each([
    ["auto-repeat", { repeat: true }],
    ["Shift", { shiftKey: true }],
    ["Alt", { altKey: true }],
    ["Control", { ctrlKey: true }],
    ["Meta", { metaKey: true }],
  ])("ignore %s", (_name, init) => {
    open("/read/m/b");
    press("ArrowRight", init);
    expect(pathname()).toBe("/read/m/b");
  });

  it("ignore keys pressed in a code block, where arrows scroll", () => {
    open("/read/m/b");
    press("ArrowRight", { on: document.querySelector("pre")! });
    expect(pathname()).toBe("/read/m/b");
  });

  it("ignore keys already handled", () => {
    open("/read/m/b");
    document.addEventListener("keydown", (event) => event.preventDefault(), { once: true });
    press("ArrowRight");
    expect(pathname()).toBe("/read/m/b");
  });

  it("ignore keys while the contents sheet is open, and work again once it closes", () => {
    open("/read/m/b");
    click(document.querySelector("[data-shot='toc-toggle']")!);
    press("ArrowRight");
    expect(pathname()).toBe("/read/m/b");
    press("ArrowLeft");
    expect(pathname()).toBe("/read/m/b");

    press("Escape");
    press("ArrowRight");
    expect(pathname()).toBe("/read/m/c");
  });
});

describe("the cross-reference preview", () => {
  function xref(): HTMLElement {
    return document.querySelector<HTMLElement>(".xref")!;
  }

  it("is dismissed by Escape until the link loses focus", () => {
    open("/read/m/b");
    act(() => xref().querySelector("a")!.focus());
    press("Escape");
    expect(xref().hasAttribute("data-dismissed")).toBe(true);

    act(() => (focused() as HTMLElement).blur());
    expect(xref().hasAttribute("data-dismissed")).toBe(false);
  });

  it("is dismissed until the pointer leaves", () => {
    open("/read/m/b");
    act(() => xref().querySelector("a")!.focus());
    press("Escape");
    act(() => {
      xref().dispatchEvent(new MouseEvent("mouseout", { bubbles: true, relatedTarget: document.body }));
    });
    expect(xref().hasAttribute("data-dismissed")).toBe(false);
  });

  it("ignores Escape while neither hovered nor focused", () => {
    open("/read/m/b");
    press("Escape", { on: document.body });
    expect(xref().hasAttribute("data-dismissed")).toBe(false);
  });

  it("names the target's status", () => {
    open("/read/m/b");
    expect(document.querySelector(".xref-preview")!.textContent).toContain("Written");
  });
});

describe("status in words", () => {
  it("names the status of each pager link", () => {
    open("/read/m/c");
    const pager = document.querySelector("nav[aria-label='Continue reading']")!;
    expect(pager.textContent).toContain("Title b, written");
    expect(pager.textContent).toContain("Title streamed, being written");
  });

  it("names the status of each section referenced here", () => {
    open("/read/m/b");
    const referenced = document.querySelector(".outline-refs")!;
    expect(referenced.textContent).toContain("Title x, written");
  });
});
