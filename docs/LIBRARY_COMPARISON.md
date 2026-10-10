# Library prototypes: comparison

Three interaction models for the library page, all built on the reader's design system, so they
differ only in where the conversation lives and how it relates to your manuals. Screenshots are
from fresh `npm run shot:library` runs taken after the fix round (all three runs 16 of 16, no
errors). Notes marked *live* come from driving each variant in a browser at 1440×900 and 375×812:
sending, scrolling up mid-reply, deleting with and without a conversation, and "Start a new
manual".

## 1. At a glance

| | Concept | Where the conversation lives | Library and agent | What you do first | Phone | Biggest trade-off |
| --- | --- | --- | --- | --- | --- | --- |
| **A: The prompt corner** | Familiar "app plus side chat" | A docked right-hand panel with its own scroll, always beside the library | Side by side and equal; the panel marks and links to manuals it hears named | Type: the panel's field has focus on load | A dock with the field at the bottom; the conversation opens as a full-screen sheet over the library | The most familiar and least distinctive; on phone the sheet hides the library |
| **B: The cue line** | A command bar (Raycast or Linear style) | A panel that drops from the top bar over the library, one exchange open at a time | The library is the page; the agent is summoned, then folded away | Type: the big bar at the top has focus | The same bar, sticky at the top, with the panel dropping from it | The calmest page, but the weakest conversation: earlier turns fold away and the open panel covers the library |
| **C: The prompt book** | The conversation is the page, set like a play script | One long scrolling document: the library first, then every exchange | The library is the script's opening entry and scrolls away as you talk | Read the library; the input is docked at the bottom as the next line | One column; after a send the library scrolls off, with `Library ↑` to return | The best record of what happened, but once you've asked anything you can't see the library and the conversation at once |

## 2. Side by side

### Desktop (1440×900)

| Scenario | A: The prompt corner | B: The cue line | C: The prompt book |
| --- | --- | --- | --- |
| **First visit** | ![A first visit](library-comparison/a/first-visit-desktop.png) The ledger fills the left; the panel's top half is empty, with suggestions at its foot. | ![B first visit](library-comparison/b/first-visit-desktop.png) The calmest page: one green bar, a `Try` line, then the list. | ![C first visit](library-comparison/c/first-visit-desktop.png) The whole library and the docked input fit one screen, with an empty "In this conversation" margin. |
| **Mid-stream** | ![A streaming](library-comparison/a/streaming-desktop.png) The reply grows in the panel; the library doesn't move. | ![B streaming](library-comparison/b/streaming-desktop.png) The panel hangs over the list, and a cut-off subtitle fragment still shows under it. | ![C streaming](library-comparison/c/streaming-desktop.png) The page has scrolled so only three rows remain; the reply has room below. |
| **Conversation** | ![A conversation](library-comparison/a/conversation-desktop.png) Every turn stays readable beside the full ledger; "In your library:" links tie turns to rows. | ![B conversation](library-comparison/b/conversation-desktop.png) Older turns fold to one-line excerpts; the panel's edge slices the Birthday Party title. | ![C conversation](library-comparison/c/conversation-desktop.png) Full page: a play script under the library, indexed in the right margin. |
| **Delete confirm** | ![A delete](library-comparison/a/delete-confirm-desktop.png) A popover anchored under the lifted row. | ![B delete](library-comparison/b/delete-confirm-desktop.png) The cue line itself becomes the question; the row is lit below. | ![C delete](library-comparison/c/delete-confirm-desktop.png) A band rises over the dock, and the row is lit with the reader's "you are here" bar. |
| **Empty library** | ![A empty](library-comparison/a/empty-desktop.png) One sentence with two links; "Start a new manual" appears twice. | ![B empty](library-comparison/b/empty-desktop.png) A heading, a line and a green "Begin"-style link; the bar's placeholder switches to the first manual. | ![C empty](library-comparison/c/empty-desktop.png) "Nothing on the shelf.", with the suggestions in the dock. |

### Phone (375×812)

| Scenario | A: The prompt corner | B: The cue line | C: The prompt book |
| --- | --- | --- | --- |
| **First visit** | ![A phone first visit](library-comparison/a/first-visit-phone.png) The library with a bottom dock; suggestions are hidden inside the sheet. | ![B phone first visit](library-comparison/b/first-visit-phone.png) The bar is at the top, where your thumb isn't; one `Try` suggestion. | ![C phone first visit](library-comparison/c/first-visit-phone.png) The input is docked at the bottom, with one `Try` suggestion under it. |
| **Conversation** | ![A phone conversation](library-comparison/a/conversation-phone.png) A full-screen sheet; the dock now names the library (`Library · 7 manuals`, `Hide ↓`). | ![B phone conversation](library-comparison/b/conversation-phone.png) Full page: the panel drops over the list and cuts a row in half. | ![C phone conversation](library-comparison/c/conversation-phone.png) Full page: one long column, library then script. |

The other states (typing, thinking, fallback, and the phone versions of each) are in
`library-comparison/<a|b|c>/` under the same names.

## 3. Each variant

Review scores were given by an independent reviewer **before the fix round**, out of 5:

| Before fixes | Hierarchy | Agent prominence | Direct controls | Conversation feel | Library scan | Phone | Reader consistency | Would ship | Total |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| A | 4 | 3 | 4 | 4 | 4 | 4 | 5 | 4 | **32** |
| B | 4 | **5** | 4 | **3** | 4 | **3** | 4 | **3** | 30 |
| C | 4 | 3 | 4 | 4 | 4 | **3** | 5 | 4 | 31 |

**A, the prompt corner.** The only variant where the conversation and the whole library are both
on screen at every moment on desktop. That is its main strength, and you feel it in use: you ask,
you read, you glance left. *Live:* scrolling up mid-reply held its place while the reply grew
(distance from the bottom went from 272 to 416px), with a `Replying ↓` readout to jump back.
"Start a new manual" fills the field with `Let's start a new manual about ` and the caret at the
end. The "In your library:" links and the bar marking a named row are the best bridge between
talking and the shelf. They are also fragile: *live*, after I deleted *The Haunt That Listens*, the
earlier "Open the one about haunted houses" link silently pointed at *Moving House Without
Losing the Cat*, and "Sing me a sea shanty about geese" links *Negotiating With Geese*. Its
weaknesses are the empty top half of the panel on a first visit, and a phone sheet that hides the
library (with a conversation open you have to press Hide before you can delete or start a manual).
**After review:** the field got a visible border, and Send lights up once there's text. The panel
header now says what the librarian is doing. The row mark became the reader's bar on the row's
own edge, the empty state became an invitation, and the phone sheet got a header.

**B, the cue line.** At rest it is the cleanest page of the three, and the bar is unmistakably the
main control (the only 5 for agent prominence). It's also the fastest with a keyboard: `/`, ↑ to
recall your last message, Esc to fold. The cost shows as soon as you talk. Only one exchange is
open at a time, so a follow-up hides the answer it refers to (the fix added one-line excerpts,
which help). The open panel is an overlay whose bottom edge still cuts rows in the post-fix
screenshots (the Birthday Party title in `conversation-desktop`, the Haunt subtitle in
`streaming-desktop`). *Live:* with the panel open, the first click on the library only folds the
panel, deliberately, so reaching a manual takes two clicks. After a direct delete nothing visible
records it (only a screen-reader announcement). Its phone layout puts the input at the top, out of
thumb reach. **After review:** the panel got a flat ground mat, and the library dims to 0.85 while
the panel is open. The confirmation now sits exactly on the cue line. A click-away no longer opens
a manual. Asks got a `›` prompt mark, "Start a new manual" was added to the panel foot, and the
write head was restored at tablet widths.

**C, the prompt book.** The most typographically accomplished and the most original. Hanging
speaker names, the write head and lamp, and the settle give it the clearest "this is live" signal
of the three. It's the only one that **records what happened**: *live*, a direct delete wrote
*You deleted …* into the script and `Deleted The Haunt That Listens` into the dock's status slot.
Holding still while you scroll up is guaranteed by construction (*live:* the page stayed at 743px
through the whole reply). The price is that the library and the conversation compete for the same
column. After one send the library has mostly scrolled away (three rows left in
`streaming-desktop`; on phone, none), and `Library ↑` takes you back. Small slips remain: during
the thinking state the dock says `Replying…` while the script says `Thinking…`. **After review:**
the dock got a real border and a top hairline. Deletes now show in the dock. `Library ↑` appears
at every width. Suggestions show on the first screen at every size. A new exchange now lands at
350px instead of the top, which removed the near-empty "page turn". Phone tap targets are 44px.

## 4. Recommendation

**Build on A, the prompt corner.** When the agent starts *doing* things, you need to see the
conversation that asked for an action and the library that changed, at the same moment. A is the
only model that shows both on desktop without scrolling or summoning. Creating a manual is a
multi-turn dialogue (the canned reply already asks about topic, audience and tone), and A's
persistent log handles that well; B's one-exchange panel doesn't. A confirmation raised by the
agent can sit in the panel and light the row it refers to, the way A already marks named rows.
What you'd lose: A is the least distinctive of the three (it looks like Claude Projects or Cursor),
you lose B's calm, library-first resting page and C's single readable record, and on phone A is as
much a "two screens" design as the others.

**Who'd prefer the others.** **B** suits keyboard-first users who mostly open manuals and treat the
agent as a command palette for one-shot requests. **C** suits people who see RTFM as a
conversation with a librarian first, such as a new user with an empty library, and anyone who wants
a findable, scrollable record of everything said and done.

## 5. Ideas worth combining in round 2

1. **C's stage directions in A's log:** every change, whether you made it or the agent did, is
   written into the conversation as a line (*You deleted …*).
2. **B's "the input becomes the question":** an action the agent proposes turns A's composer into
   the confirmation (`Delete "…"? Delete manual / Keep it`), the same as a direct delete.
3. **C's dock status slot** in A's panel header: `Deleted Negotiating With Geese`, visible where
   your eyes are.
4. **Pin "In your library:" links to a manual's id when the message is sent,** so they never
   re-point after a delete (the retargeting I saw live).
5. **B's keyboard model in A's composer:** ↑ recalls your last message, Esc returns to the
   ledger, and a visible `/` keycap.
6. **B's folded one-line excerpts** for older turns once A's log gets long.
7. **C's phone dock suggestion** (`Try "What can you help with?"`) in A's phone dock, where
   suggestions are currently hidden inside the sheet.
8. **On phone, a lit copy of the affected row** (C's lit-row treatment) inside A's sheet when a
   reply acts on a manual, so you see the effect without closing the conversation.

## 6. How to see it live

- Run `npm run dev`, then open http://localhost:5173/library/a (or `/library/b`, `/library/c`).
- The thin `A B C` tab on the left edge switches variants (it reloads the page).
- URL options:
  - `?conversation=demo` preloads a several-turn conversation;
  - `?library=empty` starts with no manuals.
  - `?agentFreeze=thinking` and `?agentFreeze=0.5` freeze the next reply.
- Everything is in memory: deletes and the conversation reset on reload.
