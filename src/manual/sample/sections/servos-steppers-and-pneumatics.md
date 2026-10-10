Here lies the hardware. Everything in this appendix has been bought, burned, cursed and replaced at least once in my shop. The figures are typical, not gospel: always read the datasheet for the exact part in your hand.

## Servos

| Class | Example | Supply | Torque | Use it for |
| --- | --- | --- | ---: | --- |
| Micro hobby servo | SG90 class | 4.8–6 V | ~0.2 N·m | Eyelids, fingers, small props |
| Standard metal-gear servo | MG996R class | 4.8–6.6 V | ~1 N·m | Jaws, wrists, light heads |
| High-torque hobby servo | 25–35 kg·cm class | 6–8.4 V | 2.5–3.5 N·m | Heads, elbows |
| Smart bus servo | Dynamixel XM430 class | 12 V | ~4 N·m stall | Necks, shoulders, anything that talks |

### Notes on servos

- The torque on the box is *stall* torque: the most the servo can manage while straining against something it cannot move. Size for no more than a third of it in continuous use.[^stall]
- Hobby servos take a pulse every 20 ms, and the pulse width sets the position, usually between `1000` and `2000` microseconds. A PWM board built on the PCA9685 chip drives sixteen of them from a single I²C bus.
- Smart bus servos report position, load and temperature. Use all three. A servo whose load climbs a little every night is a servo fighting a snagged costume.
- Give servos their own power supply, sized for every servo stalling at once, with a common ground to the controller.

## Steppers and linear actuators

| Part | Typical spec | Use it for |
| --- | --- | --- |
| NEMA 17 stepper | 0.4–0.5 N·m holding; 12–24 V through a driver | Slow head turns, creeping props |
| NEMA 23 stepper | 1–3 N·m holding; 24–48 V through a driver | Doors, sliding panels |
| Stepper driver | TMC2209 class; up to ~2 A | Quiet, smooth microstepping |
| Linear actuator | 12 V DC; 200–1,500 N; built-in limit switches | Coffin lids, slow rises |

Steppers have no idea where they are when they wake up. Home every axis against a limit switch before the doors open, every night.

## Pneumatics

Air is how a haunt goes *fast*. A cylinder’s force is simply pressure times piston area: a 1½-inch bore at 80 PSI pushes about 140 pounds. That is enough to lift a figure, and more than enough to break a finger.

- Run show air at **60–100 PSI**, with a regulator and gauge for every room.
- Use **24 V DC solenoid valves** with spring return, so every valve falls to a known position when it loses power.
- Fit **meter-out flow controls** on every cylinder to set its speed, and use cushioned cylinders for anything that stops hard.
- Put a **dump valve** on every room’s air supply that vents when the e-stop drops its power, plus a manual one so crew can vent the room by hand.

### Before any air system goes live

1. Pressure-test it with nobody in the room.
2. Confirm that the e-stop de-energises every valve, vents the supply, and lets every figure settle under gravity into a safe, padded rest, as described in [The Show Must Stop](section:the-show-must-stop).
3. Wear eye protection. Always. A blown fitting at 80 PSI turns a hose into a whip.

For the nerves and brains that drive all this muscle, turn the page to [Sensors and Controllers](section:sensors-and-controllers).

[^stall]: Stall ratings are measured at the top of the voltage range, on a good day, by an optimist.
