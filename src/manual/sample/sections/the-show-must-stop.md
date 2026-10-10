Every show I have ever built has had one feature I hoped no guest would ever see. It is a red mushroom-headed button on a yellow box, and it is the most important prop in the house.

## The emergency stop

An [emergency stop](https://en.wikipedia.org/wiki/Kill_switch) is not a software feature. It is a physical circuit that takes the energy out of every moving thing, whether or not any computer agrees.

Wire it like this:

1. **Hardwired, in series.** Every e-stop button in the house sits on one safety loop. Pressing any of them opens the loop; the open loop drops a safety relay; the relay cuts power to the actuators.
   - Logic power — controllers, lights, speakers — stays on, so the house can light the exits and talk to guests.
   - Motor and valve power goes away.
2. **Fail-safe.** A cut wire must look exactly like a pressed button. If the loop breaks, the show stops.
3. **Latching.** Releasing the button restarts nothing. A person must walk to the control booth, look at the room, and press a separate reset.
4. **Within reach of crew.** Every scare-actor position, every control point and every room with a moving figure gets a button within arm’s reach of a crew member.

### What “stopped” means for each muscle

| Muscle | On e-stop | Why |
| --- | --- | --- |
| Pneumatic cylinder | Valves de-energise and the dump valve vents the supply; the figure settles under gravity into a padded rest | Trapped air is stored energy, and the unpressurised position must be safe, as for servos |
| Servo | Power cut; the figure sags under gravity into a padded rest | A raised arm becomes a falling arm |
| Stepper or linear actuator | Power cut; a brake holds the load | Heavy axes need a brake that holds unpowered |
| Fog and effects | Power cut | Visibility comes first |

The servo and pneumatic rows deserve a long stare. When a servo loses power, or a cylinder loses its air, the figure goes limp. Build every figure so that its unpowered rest position is safe, and test it by pulling the plug mid-gesture.[^gravity]

## Fire code

Haunted houses fall under some of the strictest rules in fire safety, and for good reason: dark, maze-like rooms full of fabric, fog and frightened people. In the United States, the [Life Safety Code](https://en.wikipedia.org/wiki/Life_Safety_Code) treats them as *special amusement* occupancies, and your local fire marshal decides exactly what applies to you. Expect them to insist on:

- automatic sprinklers throughout, which in a special amusement building are essentially required, not negotiated;
- smoke detection that stops the show, cuts confusing sounds and effects, and brings up egress lighting;
- lit exit signs that are never hidden by sets, fog or darkness;
- flame-retardant treatment on every curtain, costume and set piece, with the paperwork to prove it.

Invite the marshal early. Walk them through with the lights on. Show them your e-stop loop. A marshal who has seen your wiring is a marshal who believes you.

---

## The language model’s role in an emergency

*None.* Its job is to be told what happened, afterwards. Nothing in this section has a model in its path, and nothing else in this book should change that.

Rehearse every one of these failures with your crew before opening night — [Rehearsal and the Morning After](section:rehearsal-and-the-morning-after) has the drill — and remember the promise from [the very first section](section:why-a-haunt-should-listen). Everyone goes home.

[^gravity]: Gravity is the one actuator you cannot unplug. Design for it first.
