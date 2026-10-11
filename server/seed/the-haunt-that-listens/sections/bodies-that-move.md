Before we teach a corpse to talk, we must teach it to move — and, far more important, teach it where it may never go.

## Pick the muscle for the motion

There are three families of muscle in a haunt, and each one has a temperament.

- **Pneumatics** are fast, loud and violent. A cylinder at 80 PSI will snap a figure upright in a quarter of a second. Perfect for the strike.
  - Use them for big, sudden, *binary* moves: up or down, open or shut.
  - Never use them for anything that should hesitate. Air does not hesitate.
- **Servos** are the actors. They hold a position, ease between positions, and can be told *how* to move.
  - Hobby servos for eyelids, jaws and fingers.
  - Smart bus servos for necks and shoulders, where you want position feedback and a torque limit you can set in software.
- **Steppers and linear actuators** are the slow horror. A head turning towards you over eight long seconds. A coffin lid that creeps open a centimetre at a time.

Exact parts, voltages and torque figures live in [Servos, Steppers and Pneumatics](section:servos-steppers-and-pneumatics). Read it before you buy anything, unless you enjoy owning boxes of the wrong motor. I do. I have a cellar full of them.

## The gesture library

Here is the rule that keeps this book from becoming a lawsuit: **the language model never moves a motor.** It names a gesture, and the motion controller decides whether that gesture is allowed right now.

Each gesture is a short, pre-built, pre-tested motion with a name like `lean_in`, `slow_head_turn_left` or `jaw_chatter`. For every gesture, the controller knows:

1. Which joints it moves, and through what range.
2. Its speed and torque limits.
3. Which sensor zones must be **clear** before it may run. `lean_in` refuses to start if the beam across the reach zone is broken.

When the model asks for something that is not in the library — and it will, with great enthusiasm, asking to `grab_the_guest` or `climb_down_from_the_wall` — the controller logs the request and does nothing at all. We will see how the model learns its own repertoire in [Giving the Dead a Voice](section:giving-the-dead-a-voice).

## Draw the reach envelope first

Before you draw anything else, draw the envelope on the floor plan: the whole volume every moving part can sweep at full extension, costume included. Then leave at least 600 mm of air between that envelope and the nearest point a guest can stand or reach. Fill the gap with a railing, a set piece, or a pit of very convincing (and very soft) bones.

### Pinch points

Every joint is a mouth. Muzzle it.

- Keep hinge gaps under 8 mm or over 25 mm, so fingers either cannot enter or cannot be trapped. Where a whole hand can reach in, make the gap at least 100 mm.
- Shroud every linkage, even the ones *inside* the costume. Costumes tear.
- Fit mechanical end stops on every axis, so that a software fault still cannot over-travel.

Then put the costume on, run every gesture a thousand times, and watch what the fabric does. Fabric is the cruellest saboteur in this trade. It snags, it bunches, and at two in the morning it wraps itself around a shaft and pulls the whole head off. Plan for it, and you will sleep. Mostly.
