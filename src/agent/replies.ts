type Intent = "delete" | "create" | "open" | "list" | "help" | "fallback";

const KEYWORDS: [Intent, string[]][] = [
  ["delete", ["delete", "remove"]],
  ["create", ["create", "new"]],
  ["open", ["open", "read"]],
  ["list", ["list", "library", "manuals", "what do i have"]],
  ["help", ["help"]],
];

const REPLIES: Record<Intent, string> = {
  delete: `I can tidy the shelves, but I’d never pull a manual without asking first. I’d tell you which one I found and wait for a clear **yes** before it goes.

Deleting from this conversation isn’t wired up yet. For now, use the delete control on the manual itself; it will ask you to confirm.`,

  create: `A new manual! Before I draft a single table of contents, I’d ask you three things:

1. **Topic:** what should it teach, and how far should it go?
2. **Audience:** who’s reading it: a curious beginner, or someone who already owns the tools?
3. **Tone:** dry and exact, warm and chatty, or something stranger?

Then I’d sketch the chapters for your approval, and write each section the first time you open it. Creating manuals isn’t wired up yet, so for now this is a promise rather than a plan.`,

  open: `Choose any manual in your library and it opens in the reader. Sections that haven’t been written yet are written the moment you open them, so a half-finished manual is never a dead end.

Opening a manual from this conversation isn’t wired up yet, so select it in the library instead.`,

  list: `Everything you own is in your library. Each manual shows:

- its **title** and what it promises to teach;
- how many of its sections are written so far;
- when you last opened it.

The ones you opened most recently come first. I can’t read the library aloud yet, but I’m told it’s very well kept.`,

  help: `I’m the librarian for your hypothetical manuals. Here’s what I understand so far:

- **create** a new manual (I’ll ask about topic, audience and tone);
- **open** a manual to read it;
- **delete** a manual you’re done with;
- **list** what’s in your library.

None of these are wired up yet, so I’ll explain rather than act. Everything also works directly in the library.`,

  fallback: `I can’t do that yet, I’m afraid. My duties are modest for now: I can talk you through **creating**, **opening**, **listing** and **deleting** manuals. Ask me for help any time.`,
};

export function intentOf(message: string): Intent {
  const typed = message.toLowerCase().replaceAll("’", "'");
  const words = ` ${typed.match(/[\p{L}\p{N}']+/gu)?.join(" ") ?? ""} `;
  const match = KEYWORDS.find(([, keywords]) =>
    keywords.some((keyword) => words.includes(` ${keyword} `)),
  );
  return match?.[0] ?? "fallback";
}

export function replyTo(message: string): string {
  return REPLIES[intentOf(message)];
}
