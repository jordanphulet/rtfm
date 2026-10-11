Every room in the house has a small, dull, utterly reliable brain. I call mine the *stage manager*. It is not clever. It does not improvise. It has never had a creative thought in its life, and I love it more than any language model I have ever met.

## Why a room needs a dull brain

Language models are wonderful at *what to say*. They are poor at *exactly when*, they are occasionally slow, and on rare nights they are wrong with total confidence. A room full of compressed air and moving steel needs a brain that is fast, predictable and boring. So each room runs a [finite-state machine](https://en.wikipedia.org/wiki/Finite-state_machine) on its own controller, and the models only ever *suggest* things to it.

## A room, in states

Here is the Drowned Parlour, as the stage manager sees it:

```yaml
room: drowned-parlour
states:
  waiting:
    on: { group_entered: lure }
  lure:
    cues: [drip_sound, lamp_flicker]
    on: { group_in_centre: hush, timeout_10s: hush }
  hush:
    cues: [soundtrack_duck]
    duration: { min: 3s, max: 12s, set_by: director }
    on: { done: strike }
  strike:
    requires: [reach_zone_clear]
    cues: [widow_rise, scream_hit]
    on: { done: release, blocked: release }
  release:
    performer: widow
    on: { group_at_exit: waiting, timeout_45s: waiting }
always:
  on: { estop: dark_and_safe, smoke_alarm: dark_and_safe, heartbeat_lost: dark_and_safe }
```

Read the `hush` state closely. The Director may choose how long the silence lasts, but only between three and twelve seconds. Ask for thirty, and the stage manager quietly uses twelve. Ask for none, and it uses three.

Read the `strike` state even more closely. The strike *requires* a clear reach zone. If someone is leaning over the rail, the Widow does not rise. The scene skips straight to the release, and the performer improvises around the missing strike — “*Not yet, my dear. I will wait for you.*” Guests never know.

## The rules that outrank everything

Some transitions are not suggestions. They live in the `always` block, they are checked before anything else, and nothing upstream can delay them:

1. **E-stop.** Every cue stops, every actuator goes to its safe position, work lights come on.
2. **Smoke or fire alarm.** The same, and the soundtrack is cut so the alarm can be heard. Fire codes for haunted attractions require this, and so does basic decency.
3. **Lost heartbeat.** If the room loses contact with the show network for more than two seconds, it starts no new cue and settles into a safe state.

These rules live in the controller’s own firmware — *not* in a cloud service, and not in the Director. The hardware behind them is described in [The Show Must Stop](section:the-show-must-stop).

## Talking to the rest of the house

Rooms talk to each other and to the Director over a simple message bus on a wired show network. Every message is small, plain and logged:

- **Up** to the Director: the room summary, several times a second.
- **Down** from the Director: suggestions, such as a hush length or a note for the performer.
- **Out** to the lights, speakers and fog: cue numbers, and nothing else.

How those cue numbers become photons and vapour is the subject of [Light, Sound and Fog](section:light-sound-and-fog).
