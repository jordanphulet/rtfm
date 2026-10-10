In the old days, a haunt had a show caller: a person in a booth with a headset and too much coffee, watching a wall of grainy monitors and whispering into the radio. “*Hold the Butcher. Group four is a birthday party of nine-year-olds. Give them the gentle version.*”

The Director is that person, rebuilt as software. It is a language model that sits above the rooms, watches every group pass through the house, and decides how hard to push each one.

## What the Director sees

Each room publishes a short, plain summary several times a second — never audio, never video — and the Director reads the latest one whenever it makes a decision:

- which group is in the room, and how long it has been there;
- the group’s current fear level, from [Reading the Group](section:reading-the-group);
- what the performer said and what the guests said back, as text;
- the intensity level the group chose at the ticket desk.

That last item matters most. Every group picks a level when it enters, and the Director may *lower* it at any moment, but it can never raise it above what the guests chose.

## What the Director decides

The Director answers with a small, strict piece of JSON. Nothing else is accepted:

```json
{
  "group": "g-0412",
  "next_room": "drowned-parlour",
  "intensity": 2,
  "hush_seconds": 8,
  "focus": "straggler",
  "note_for_performer": "They laughed at the Butcher. The Widow should be sad, not loud."
}
```

Here `intensity` is how hard the next room should push, on the same 0–3 scale the guests chose from; it is never the fear level the rooms measure. Each field is checked before use. Unknown fields are dropped. Out-of-range numbers are clamped. An intensity above the group’s chosen level is lowered to that level. A reply that fails to parse is ignored, and the room plays its default scene.

## Why a separate model?

1. **Time.** A group takes thirty seconds or more to walk between rooms, so the Director can afford a large, slow model and a few seconds of thought. The performers, as [The Half-Second Problem](section:the-half-second-problem) explains, cannot.
2. **Perspective.** A performer sees one room. The Director sees the whole night, and can notice that the Parlour has run too hot for the last six groups.
3. **Containment.** The Director never talks to guests and never touches hardware. Its only power is to adjust a handful of numbers that the [stage managers](section:the-room-controller) are free to clamp, delay or ignore.

## A director’s notes

The best use I have found for the Director is not intensity at all. It is the `note_for_performer` field: a single line of stage direction handed to the next room’s character before the group arrives.

> “Group seven has a guest who keeps saying ‘it’s all fake’. The Gentleman should agree with him, warmly, all the way to the exit.”

That note turned a heckler into the happiest guest of the night. He came back the next evening with four friends, and he made every one of them go first.

---

Keep the Director’s prompt short and its job narrow. The moment you also ask it to run the lights, pick the music and write the performers’ lines, you have built a single point of failure *with opinions*.
