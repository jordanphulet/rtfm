A haunt is not finished when it is built. It is finished when it has frightened two hundred strangers, nobody has been hurt, and you have read every line of the logs the next morning with a strong coffee and a weak heart.

## Rehearsal: three nights before the first night

### Night one: the crew walk

Walk the house with the work lights on. Every crew member presses every e-stop in turn and says the safe word in every room. You are not testing the scares tonight. You are testing the *stopping*.

### Night two: the friendly walk

Bring in volunteers who know what they have signed up for: friends, family, the neighbours who keep asking about the noises.

1. Send them through in groups of different sizes and moods.
2. Ask at least one group to heckle the performers without mercy.
3. Ask one guest to use the safe word partway through, without warning the crew.
4. Debrief every group at the exit, on the spot, before they forget.

### Night three: the dress rehearsal

Full show, full fog, full noise, and strangers if you can find them. Change nothing during the night. Write everything down.

## The logs

Every room, every performer and the Director write one line per event. A line looks something like this:

```json
{"t":"21:47:03.412","room":"drowned-parlour","group":"g-0412","event":"performer_reply","latency_ms":840,"guard_fired":false,"line":"You laughed earlier. You are not laughing now."}
```

Store the *text*, never the audio. Guests’ words are kept for a few days for debugging and then deleted, and the sign at the entrance says so.

The fields I read first, every morning:

| What I read | What I’m looking for |
| --- | --- |
| `latency_ms` | Creep. If the average rose fifty milliseconds overnight, something changed. |
| `guard_fired` | Any room where the latency guard fired more than a handful of times |
| `filter_rejected` | Lines the filter blocked, and *why* the model tried to say them |
| `gesture_refused` | Gestures the controller declined, especially for a blocked reach zone |
| `safe_word` | Every single one. Read the minute before and the minute after. |

The latency numbers come from [The Half-Second Problem](section:the-half-second-problem); the safe-word procedure from [Knowing When to Stop](section:knowing-when-to-stop).

## The morning checklist

- [ ] Read every safe-word event, and talk to the crew who responded
- [ ] Inspect every pinch-point guard and costume seam for wear
- [ ] Drain the water traps on the air compressor
- [ ] Wipe fog residue off beam-break lenses and floor markers
- [ ] Replace any fallback line that guests heard more than twice in one night
- [ ] Delete transcripts older than your stated retention period

Then sleep. You have earned it, and the dead are patient.
