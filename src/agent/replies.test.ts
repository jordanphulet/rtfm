import { describe, expect, it } from "vitest";
import { intentOf, replyTo } from "./replies";

describe("intentOf", () => {
  it.each([
    ["Delete the birthday party manual", "delete"],
    ["remove the geese one", "delete"],
    ["Create a manual about kites", "create"],
    ["Let's start a NEW one", "create"],
    ["Open the haunted house manual", "open"],
    ["I want to read something", "open"],
    ["list", "list"],
    ["What do I have?", "list"],
    ["What's in my library?", "list"],
    ["Which manuals are half finished?", "list"],
    ["help", "help"],
    ["Help!", "help"],
  ])("reads %j as %s", (message, intent) => {
    expect(intentOf(message)).toBe(intent);
  });

  it.each([
    ["Delete the new manual", "delete"],
    ["Help me create a manual", "create"],
    ["Open my newest manual", "open"],
    ["Read me the list", "open"],
    ["Help me find my manuals", "list"],
  ])("lets the first intent in order win for %j", (message, intent) => {
    expect(intentOf(message)).toBe(intent);
  });

  it.each([
    "Renew my librarian card",
    "Who is the reader?",
    "What are your opening hours?",
    "Can you translate the sourdough manual into Klingon?",
    "",
  ])("matches whole words only, falling back for %j", (message) => {
    expect(intentOf(message)).toBe("fallback");
  });
});

describe("replyTo", () => {
  it("falls back politely", () => {
    expect(replyTo("Sing me a song")).toMatch(/^I can't do that yet/);
  });

  it("says deleting would ask for confirmation and isn't wired up", () => {
    const reply = replyTo("delete it");
    expect(reply).toMatch(/\*\*yes\*\*/);
    expect(reply).toMatch(/isn't wired up yet/);
  });

  it("sketches the create questions and says creating isn't wired up", () => {
    const reply = replyTo("new manual");
    expect(reply).toMatch(/Topic/);
    expect(reply).toMatch(/Audience/);
    expect(reply).toMatch(/Tone/);
    expect(reply).toMatch(/isn't wired up yet/);
  });
});
