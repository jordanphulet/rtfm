# Interface references: how comparable apps use icons and actions

Research, written 2026-10-14, from the public pages of five products, viewed at 1440 × 900.

**Status 2026-10-14: adopted.** One icon set, Lucide, with the rules in `DESIGN.md` › Icons; an
icon beside the reader's way back to the library, the landing page's start action, each greeting
cue and each ledger row's delete; and "Start a new manual" as a button. The choices are in
`DESIGN.md`, `src/home/DESIGN.md` and `src/reader/DESIGN.md`.

## Why

RTFM's pages were type only: no icon anywhere but the status rings. A first look read as bare,
and it wasn't clear what was a control. Each fix made by eye risked a one-off that didn't match
the rest, so this looks at how settled products solve the same problems and borrows the
patterns they share.

## What was looked at

| Product | Page | Why it's comparable |
| --- | --- | --- |
| Stripe Docs | `docs.stripe.com/payments/checkout` | A reader: sidebar of contents, long text, page actions |
| Tailwind CSS docs | `tailwindcss.com/docs/installation/using-vite` | A dark docs reader with dense navigation |
| Linear | `linear.app` (the app shown on its home page) | A dark, dense app with an agent panel beside the work |
| Readwise Reader | `readwise.io/read` (the app shown on its page) | A library of things to read, beside a reader |
| Perplexity | `perplexity.ai` | An assistant whose composer is the page's main control |

## What they share

1. **One icon set, small and quiet.** Every product uses a single set of line icons, about 14–16px
   beside 13–14px text, with one stroke weight. Icons are dimmer than their labels (Linear's
   sidebar, Stripe's page actions), so the words still lead.
2. **Icons sit beside words.** Navigation and actions are icon plus label: Linear's "Inbox", "My
   issues"; Stripe's "Copy for LLM", "View as Markdown"; Perplexity's "New", "Automations".
   Icons stand alone only for universal actions in tight, repeated places: Readwise's row actions,
   Stripe's sidebar collapse, a copy button on code.
3. **The library is named with an icon and a word.** Readwise Reader's header reads as a books
   icon then "Library", the same pairing as RTFM's way back from the reader.
4. **The brand is a wordmark, top left,** on every product, with the page's own title below it.
5. **The main action is a button, not a link.** Perplexity's composer and its suggestion cards,
   Readwise's "Get started", Linear's new-issue control: the thing you came to do has a filled
   shape. Links are for going somewhere.
6. **Suggestions carry an icon each.** Perplexity's starting suggestions are an icon, a short
   title and a line under it, so they read as choices rather than as text.
7. **Destructive row actions are quiet.** Readwise shows row actions as small icon buttons; none of
   the products puts a red or full-strength delete on every row.

## What RTFM keeps of its own

The banned list in `DESIGN.md` still holds: no gradients, glows, cards with shadows, emoji or
decorative icons. The references' gradients (Readwise, Perplexity's suggestion cards) and the
uppercase tracked eyebrows (Tailwind) are left out. The Send button stays a word, since it already
shows readiness by its fill.

## Further reading

- *Refactoring UI*, Adam Wathan and Steve Schoger: hierarchy by size, weight and color before
  adding elements; a fixed spacing scale; one accent; buttons styled by importance.
- Jakob Nielsen's 10 usability heuristics, especially "visibility of system status" and
  "recognition rather than recall".
- Lucide, `lucide.dev`: the icon set adopted, with its search for finding an icon by meaning.
