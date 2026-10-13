// @vitest-environment happy-dom
import { act, Suspense } from "react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ConversationMessage, LibrarianAction } from "../librarian";
import type { LibrarianEvent } from "../librarian/types";
import type { DeleteResult, ManualSummary } from "../library";
import { click, press, render } from "../testing";
import { fakeWidth } from "./fakeWidth";

const fake = vi.hoisted(() => ({
  library: [] as ManualSummary[],
  fetches: 0,
  deleting: undefined as Promise<DeleteResult> | undefined,
  messages: [] as ConversationMessage[],
  outcomes: [] as string[],
  onAction: undefined as ((action: LibrarianAction) => Promise<void> | void) | undefined,
  realLibrarian: false,
  replyEvents: [] as LibrarianEvent[],
}));

vi.mock("../library/api", () => ({
  fetchLibrary: async () => {
    fake.fetches += 1;
    return fake.library;
  },
  deleteManual: () => fake.deleting ?? Promise.resolve("deleted"),
}));

vi.mock("../librarian/api", () => ({
  streamReply: async function* () {
    yield* fake.replyEvents;
  },
}));

/** A stand-in conversation, or with `fake.realLibrarian` the real store replying with `fake.replyEvents`. */
vi.mock("../librarian", async (importActual) => {
  const actual = await importActual<typeof import("../librarian")>();
  return {
    ...actual,
    useLibrarian: () =>
      fake.realLibrarian
        ? actual.useLibrarian()
        : {
            messages: fake.messages,
            status: "idle",
            activity: "",
            send: () => {},
            reportDeleteOutcome: (outcome: string) => fake.outcomes.push(outcome),
          },
    useLibrarianActions: (handler: (action: LibrarianAction) => Promise<void> | void) => {
      if (fake.realLibrarian) actual.useLibrarianActions(handler);
      else fake.onAction = handler;
    },
  };
});

function summary(id: string, title: string): ManualSummary {
  return { id, title, subtitle: "", chapterCount: 1, sectionCount: 4, writtenCount: 0 };
}

const ALPHA = summary("alpha", "Alpha");
const BETA = summary("beta", "Beta");
const GAMMA = summary("gamma", "Gamma");

const CONVERSATION: ConversationMessage[] = [
  { id: "message-1", role: "user", text: "What do I have?" },
  { id: "message-2", role: "agent", text: "Two manuals." },
];

let router: ReturnType<typeof createMemoryRouter>;
let setWidth: (width: number) => void;

beforeEach(() => {
  vi.resetModules();
  setWidth = fakeWidth(1440);
  fake.library = [ALPHA, GAMMA];
  fake.fetches = 0;
  fake.deleting = undefined;
  fake.messages = [];
  fake.outcomes = [];
  fake.realLibrarian = false;
  fake.replyEvents = [];
  vi.spyOn(window, "scrollTo").mockImplementation(() => {});
  vi.spyOn(window, "scrollBy").mockImplementation(() => {});
  vi.spyOn(HTMLElement.prototype, "scrollIntoView").mockImplementation(() => {});
});

afterEach(() => {
  router?.dispose();
  vi.restoreAllMocks();
});

/** Loads the page fresh, as a new page load does, at `entries`' last path. */
async function openPage(entries = ["/"]) {
  const { default: Home } = await import("./index");
  router = createMemoryRouter(
    [
      {
        path: "/",
        element: (
          <Suspense>
            <Home />
          </Suspense>
        ),
      },
      { path: "/read/:manualId", element: <p>Reader</p> },
    ],
    { initialEntries: entries, initialIndex: entries.length - 1 },
  );
  await act(async () => render(<RouterProvider router={router} />));
  await settle();
}

async function settle() {
  for (let tick = 0; tick < 5; tick++) {
    await act(() => new Promise((resolve) => requestAnimationFrame(() => setTimeout(resolve))));
  }
}

async function go(to: string | number) {
  await act(() => (typeof to === "number" ? router.navigate(to) : router.navigate(to)));
  await settle();
}

async function librarian(action: LibrarianAction) {
  await act(async () => {
    await fake.onAction!(action);
  });
  await settle();
}

function row(title: string): HTMLElement {
  const link = [...document.querySelectorAll(".row-title")].find((each) => each.textContent?.startsWith(title));
  if (!link?.parentElement) throw new Error(`No row for ${title}`);
  return link.parentElement;
}

function rowTitles(): string[] {
  return [...document.querySelectorAll(".row-title")].map((link) => link.textContent ?? "");
}

function confirmationTitle(): string | null {
  return document.querySelector(".confirm[data-open] #delete-title")?.textContent ?? null;
}

function button(name: string): HTMLElement {
  const found = [...document.querySelectorAll<HTMLElement>("button")].find((each) => each.textContent === name);
  if (!found) throw new Error(`No button reads ${name}`);
  return found;
}

function field(): HTMLElement {
  return document.querySelector("#librarian-field")!;
}

describe("the librarian's actions", () => {
  it("loads the library again when a manual is created", async () => {
    await openPage();
    fake.library = [ALPHA, BETA, GAMMA];

    await librarian({ type: "created", manualId: "beta" });

    expect(fake.fetches).toBe(2);
    expect(rowTitles()).toEqual(["Alpha", "Beta", "Gamma"]);
  });

  it("ignores an open or a proposed delete while the confirmation is open", async () => {
    await openPage();
    click(row("Alpha").querySelector(".row-delete")!);
    expect(confirmationTitle()).toBe("Delete “Alpha”?");

    await librarian({ type: "open", manualId: "gamma" });
    await librarian({ type: "propose-delete", manualId: "gamma" });

    expect(router.state.location.pathname).toBe("/");
    expect(confirmationTitle()).toBe("Delete “Alpha”?");
  });

  it("loads the library once for a manual it doesn't list, and opens the confirmation if it's there now", async () => {
    await openPage();
    fake.library = [ALPHA, BETA, GAMMA];

    await librarian({ type: "propose-delete", manualId: "beta" });

    expect(fake.fetches).toBe(2);
    expect(confirmationTitle()).toBe("Delete “Beta”?");
  });

  it("opens nothing for a manual that still isn't there after one more load", async () => {
    await openPage();

    await librarian({ type: "propose-delete", manualId: "missing" });

    expect(fake.fetches).toBe(2);
    expect(confirmationTitle()).toBeNull();
  });

  it("returns focus to the field after Keep it on a delete the librarian proposed, and tells it", async () => {
    await openPage();
    await librarian({ type: "propose-delete", manualId: "alpha" });
    expect(document.activeElement?.textContent).toBe("Keep it");

    click(button("Keep it"));
    await settle();

    expect(confirmationTitle()).toBeNull();
    expect(document.activeElement).toBe(field());
    expect(fake.outcomes).toEqual(["kept"]);
  });

  it("returns focus to the field after deleting a manual the librarian proposed", async () => {
    await openPage();
    await librarian({ type: "propose-delete", manualId: "alpha" });

    click(button("Delete manual"));
    await settle();

    expect(rowTitles()).toEqual(["Gamma"]);
    expect(document.activeElement).toBe(field());
    expect(fake.outcomes).toEqual(["deleted"]);
  });
});

describe("a reply that proposes a delete", () => {
  const PROPOSE_ALPHA: LibrarianEvent = { event: "action", data: { type: "propose-delete", manualId: "alpha" } };

  async function ask(text: string) {
    const setValue = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!;
    act(() => {
      setValue.call(field(), text);
      field().dispatchEvent(new Event("input", { bubbles: true }));
    });
    press("Enter", { on: field() });
    await settle();
  }

  function replies(): string[] {
    return [...document.querySelectorAll(".turn-reply")].map((reply) => reply.textContent ?? "");
  }

  beforeEach(() => {
    fake.realLibrarian = true;
  });

  it("opens the confirmation and shows no empty reply when the reply has no text", async () => {
    fake.replyEvents = [{ event: "status", data: { text: "Preparing the delete…" } }, PROPOSE_ALPHA, { event: "done", data: {} }];
    await openPage();

    await ask("Delete Alpha");

    expect(document.querySelector(".said")?.textContent).toBe("You: Delete Alpha");
    expect(confirmationTitle()).toBe("Delete “Alpha”?");
    expect(replies()).toEqual([]);
    expect(document.querySelector(".thinking")).toBeNull();
  });

  it("keeps the words written before the tool as the reply when nothing follows them", async () => {
    fake.replyEvents = [
      { event: "text", data: { text: "I’ll ask you to confirm." } },
      { event: "status", data: { text: "Preparing the delete…" } },
      PROPOSE_ALPHA,
      { event: "done", data: {} },
    ];
    await openPage();

    await ask("Delete Alpha");

    expect(confirmationTitle()).toBe("Delete “Alpha”?");
    expect(replies()).toEqual(["Librarian: I’ll ask you to confirm."]);
  });
});

describe("the row's delete", () => {
  it("returns focus to the row's Delete after Keep it, and tells the librarian nothing", async () => {
    await openPage();
    const rowDelete = row("Gamma").querySelector<HTMLElement>(".row-delete")!;
    click(rowDelete);

    click(button("Keep it"));
    await settle();

    expect(document.activeElement).toBe(rowDelete);
    expect(fake.outcomes).toEqual([]);
  });

  it("focuses the next row in the library as it is once the delete is done", async () => {
    let finishDelete!: (result: DeleteResult) => void;
    fake.deleting = new Promise((resolve) => (finishDelete = resolve));
    await openPage();
    click(row("Alpha").querySelector(".row-delete")!);
    click(button("Delete manual"));

    fake.library = [ALPHA, BETA, GAMMA];
    await librarian({ type: "created", manualId: "beta" });
    await act(async () => finishDelete("deleted"));
    await settle();

    expect(rowTitles()).toEqual(["Beta", "Gamma"]);
    expect(document.activeElement).toBe(row("Beta").querySelector(".row-title"));
  });

  it("focuses the manual now at the deleted one's place when a refresh has already left it out", async () => {
    fake.library = [ALPHA, BETA, GAMMA];
    let finishDelete!: (result: DeleteResult) => void;
    fake.deleting = new Promise((resolve) => (finishDelete = resolve));
    await openPage();
    click(row("Beta").querySelector(".row-delete")!);
    click(button("Delete manual"));

    fake.library = [ALPHA, GAMMA];
    await librarian({ type: "created", manualId: "other" });
    await act(async () => finishDelete("deleted"));
    await settle();

    expect(rowTitles()).toEqual(["Alpha", "Gamma"]);
    expect(document.activeElement).toBe(row("Gamma").querySelector(".row-title"));
  });
});

describe("arriving at the library", () => {
  it("starts at the top after a link to it", async () => {
    await openPage(["/read/alpha"]);
    vi.mocked(window.scrollTo).mockClear();

    await go("/");

    expect(window.scrollTo).toHaveBeenCalledWith(0, 0);
  });

  it("leaves the scroll to the browser on Back", async () => {
    await openPage(["/", "/read/alpha"]);
    vi.mocked(window.scrollTo).mockClear();

    await go(-1);

    expect(window.scrollTo).not.toHaveBeenCalled();
  });
});

describe("the conversation sheet on phone", () => {
  function sheetOpen(): boolean {
    return document.querySelector(".dock-toggle")?.getAttribute("aria-expanded") === "true";
  }

  it("opens on load with a conversation, and only on that first load", async () => {
    setWidth(375);
    fake.messages = CONVERSATION;
    await openPage();
    expect(sheetOpen()).toBe(true);

    await go("/read/alpha");
    await go("/");

    expect(sheetOpen()).toBe(false);
  });

  it("stays closed on load without a conversation", async () => {
    setWidth(375);
    await openPage();
    expect(sheetOpen()).toBe(false);
  });

  it("stays closed when a page that loaded wide narrows", async () => {
    fake.messages = CONVERSATION;
    await openPage();
    expect(document.querySelector(".dock-toggle")).toBeNull();

    setWidth(375);

    expect(document.querySelector(".dock-toggle")).not.toBeNull();
    expect(sheetOpen()).toBe(false);
  });
});
