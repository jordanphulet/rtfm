Every talking figure in this book runs the same loop, three organs in a ring: it **hears**, it **thinks**, it **speaks**. Simple to draw. Monstrous to tune.

## The loop

1. **Hear.** A directional microphone — or better, a small array — picks up the guests nearest the figure.
   1. A voice activity detector decides whether anyone is actually *talking*, rather than screaming, giggling or stepping on a squeaky board.
   2. Streaming [speech recognition](https://en.wikipedia.org/wiki/Speech_recognition) turns words into text as they are spoken, not afterwards.
2. **Think.** The transcript, plus what the sensors know about the room, goes to the language model along with the figure’s character prompt.
   1. The model replies with one line of dialogue **and** at most one gesture from the figure’s library.
   2. A filter checks both before a guest hears anything. More on that below.
3. **Speak.** A [speech synthesis](https://en.wikipedia.org/wiki/Speech_synthesis) voice performs the line while the controller runs the gesture, with the jaw servo driven from the loudness of the audio so the mouth moves with the sound.

Here is the whole thing, stripped to the bone:

```ts
for await (const utterance of listen(microphone)) {
  const scene = sensors.snapshot();
  const reply = await performer.respond({ utterance, scene });

  if (!filter.allows(reply)) {
    voice.say(performer.fallbackLine());
    continue;
  }

  controller.request(reply.gesture);
  voice.say(reply.line);
}
```

Note `controller.request`, not `controller.run`. The controller may say no, and frequently does. [Bodies That Move](section:bodies-that-move) explains why.

## Hearing in a room full of screaming

The microphone is the weakest organ. Haunts are loud *on purpose*. Three habits keep a figure from answering its own soundtrack:

- Put the mic **close to where guests stand**, not inside the figure, and aim it away from the speakers.
- Duck the room’s soundtrack for a moment when the figure starts listening. Guests read the sudden quiet as the figure *paying attention*, which is wonderfully creepy.
- Ignore transcripts under three words, unless they match a short list of triggers such as “hello”, “who are you” and “let me out”.

One phrase never reaches this loop at all: the safe word. The room’s own recogniser catches it first and stops the show, with no model in the path; see [Knowing When to Stop](section:knowing-when-to-stop).

## The filter

Everything the model says passes a filter before a guest can hear it. Wherever possible, the filter is boring, fast, deterministic code: a list of banned words and topics, a length limit, and a check that the gesture exists in the library. Behind it sits a small, fast moderation classifier for whatever a word list cannot catch. Between them, they reject any line that:

- remarks on a guest’s body, clothing, age or name;
- tells a guest to *do* anything physical — touch, climb, run, go back;
- lies about safety, such as “the exits are fake”.

When the filter rejects a line, the figure speaks one of its pre-written fallback lines instead. Every character carries a pocketful of them; you’ll find examples in [The Cast](section:the-cast).

Keeping a figure in character for six hours a night is its own dark art — see [Staying in Character](section:staying-in-character) — and keeping it *fast* is a war we fight in [The Half-Second Problem](section:the-half-second-problem).
