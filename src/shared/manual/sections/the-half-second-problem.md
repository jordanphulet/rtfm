Here is the cruellest number in this book: **about two hundred milliseconds.** That is roughly the gap people leave between turns in ordinary conversation.[^turns] Leave a gap much longer and the listener notices. Leave it a full second and they notice *you noticing*. Leave it two seconds and your terrifying revenant becomes a customer-service line with a rubber face.

> A ghost that pauses to think is not a ghost. It is a kiosk.

We will not hit two hundred milliseconds. Not with today’s parts, and not for every line. But we can get under a second, and we can *hide* the rest.

## The budget

Every reply is a relay race. Time each runner separately, on show hardware, with the fog on and the soundtrack up — never at your desk.

| Stage | Target | Ceiling | Where the time goes |
| --- | ---: | ---: | --- |
| End-of-speech detection | 150 ms | 300 ms | Making sure the guest has stopped talking |
| Speech recognition, final words | 100 ms | 250 ms | Finishing the transcript |
| Model, first token | 300 ms | 700 ms | The network, then the model starting its answer |
| Speech synthesis, first audio | 150 ms | 300 ms | Turning the first phrase into sound |
| **Total** | **700 ms** | **1,550 ms** | |

Anything over the ceiling triggers a fallback, which we’ll come to.

## Five ways to win back time

1. **Stream everything.** Never wait for a whole sentence anywhere in the chain.
   - Recognition streams words while the guest is still talking.
   - The model streams its reply token by token.
   - Synthesis starts speaking the first phrase while the model is still writing the second.
2. **Keep the prompt stable.** Put the long character description first and the changing parts last, so the provider can cache the front of it.
3. **Give the performer a small, fast model.** [The Director](section:the-director) can afford a big one; it has seconds. The performer has none.
4. **Recognise speech locally,** on the controller in the room, so audio never crosses the building.
5. **Fill the gap with the body.** This is the trick that matters most.

### Covering the gap

The moment the guest stops talking, the controller fires a *tell*: a small, pre-built gesture that says *I heard you*. A slow head tilt. A wet inhale through the speaker. The jaw dropping open a few millimetres. After a good tell, guests will wait — gladly — for nearly two seconds.

#### The latency guard

If the model misses its ceiling, the performer speaks a stock line and the late reply is thrown away:

```ts
const reply = await Promise.race([
  performer.respond({ utterance, scene }),
  timeout(LATENCY_CEILING_MS).then(() => ({ line: performer.fallbackLine(), gesture: "none" })),
]);
```

Keep `LATENCY_CEILING_MS` in one place, and log every time the guard fires. If it fires more than a few times an hour, something upstream is sick.[^logs]

---

## Before you open the doors

- [x] Time each stage on show hardware, not on a laptop
- [x] Give every talking figure a tell gesture
- [ ] Pull the network cable mid-scene and confirm the guard fires
- [ ] Confirm the fallback lines are in character (see [The Cast](section:the-cast))
- [ ] Time everything again with a full house of noise and fog

The guard is not only about drama. A performer that freezes mid-scene leaves guests standing in a dark room, wondering whether something has gone wrong — the *wrong* kind of fear. The stage manager in [The Room Controller](section:the-room-controller) keeps the group moving, whatever the model is doing.

[^turns]: Researchers who study [turn-taking](https://en.wikipedia.org/wiki/Turn-taking) find that the figure varies by language, but the typical gap sits near a fifth of a second.

[^logs]: What to log, and how to read it the next morning, is covered in [Rehearsal and the Morning After](section:rehearsal-and-the-morning-after).
