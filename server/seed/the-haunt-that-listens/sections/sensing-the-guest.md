A room cannot frighten what it cannot find. Before your haunt can listen, it must *feel*: the weight on a floorboard, the warmth of a body in the dark, the moment a hand reaches where a hand should not.

But hear me now, before we bolt a single sensor to a single wall: **you are building a haunted house, not a surveillance state.** The room should know *where* people are, *how many* there are, and *how fast* they are moving. It has no business knowing *who* they are.

## The senses, from cheapest to cleverest

| Sensor | What it tells you | Good for | Watch out for |
| --- | --- | --- | --- |
| Beam-break | Something crossed a line | Exact strike timing | Fog can trip cheap ones |
| Pressure mat | Weight on a spot | Doorways, “stand here” marks | Wears out under heavy traffic |
| PIR | A warm body moved | Waking a room up | Slow, and blind to stillness |
| mmWave radar | Presence, even when still | Knowing someone is *lingering* | Sees through thin walls |
| Time-of-flight | Distance to the nearest thing | Reach zones, approach speed | Narrow field of view |
| Microphone | Sound level and speech | Screams, laughter, talk | Hears your own soundtrack |

A [passive infrared sensor](https://en.wikipedia.org/wiki/Passive_infrared_sensor) is the thing that turns on your porch light. It is cheap and reliable, and it cannot tell a guest frozen in terror from an empty room — which is precisely when you most need to know someone is there. Pair it with radar. Part numbers and wiring are in [Sensors and Controllers](section:sensors-and-controllers).

## Fuse, then decide

No single sensor is trustworthy. Fog fools beams, costumes fool radar, screams fool microphones. So every room publishes a small, boring summary several times a second, built from all of them together:

- **Occupancy:** how many people, roughly, and where.
  - Zones, not coordinates: `entry`, `centre`, `reach`, `exit`.
  - The `reach` zone is special. If anyone is in it, nothing moves.
- **Motion:** is the group moving, stopped, or going *backwards*?
- **Sound:** quiet, talking, laughing or screaming.
- **Lingering:** has anyone stayed in one zone for more than ten seconds?

That summary is the only sensor data the models ever see. Not the camera feed, not the raw audio. It is smaller and faster, and it cannot leak a face.

### Cameras, if you must

Some builders use cameras to estimate posture: the hunched shoulders of a genuinely frightened guest, the arms-crossed slouch of a bored one. It can work. If you do it:

1. Process frames on the controller in the room, and never store them.
2. Publish only the summary, such as `posture: hunched`.
3. Post a clear notice at the entrance saying that the attraction uses sensors and cameras, and what they are used for.[^notice]

#### The straggler

The most useful thing a room can know is that one guest has fallen behind the group. Stragglers are the best audience in the house, and also the most likely to panic. What the haunt does with that knowledge is the business of [The Director](section:the-director).

[^notice]: Check the law where you operate. Many places have rules about recording people and handling biometric data, and “it was dark, so it doesn’t count” is not a legal argument.
