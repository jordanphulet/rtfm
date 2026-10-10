Here are the nerves and the little brains. If the previous appendix was the muscle, this one is everything that tells the muscle when to twitch.

## Sensors

| Sensor | Example part | Supply | Range | Output |
| --- | --- | --- | --- | --- |
| PIR motion | HC-SR501 class | 5–20 V | ~7 m | Digital; slow to reset |
| mmWave presence | 24 GHz radar, LD2410 class | 5 V | ~6 m | Serial, plus a presence pin |
| Time-of-flight distance | VL53L1X class | 3.3 V | up to ~4 m | I²C |
| Single-point lidar | TFmini-S class | 5 V | up to ~12 m | Serial |
| Photoelectric beam-break | Industrial through-beam | 12–24 V | several metres | Switched output |
| Pressure mat | Contact mat | any | one spot | Closes when stepped on |
| Thermal array | MLX90640 class, 32×24 pixels | 3.3 V | a small room | I²C; a coarse heat image |
| Microphone array | 4- or 6-mic USB array | USB | ~3 m for speech | Audio, plus direction |

### Choosing between them

- For **strike timing**, use an industrial photoelectric beam-break. It has a high excess gain — far more light than it needs to see its receiver — so it punches through fog that blinds a hobby break-beam.
- For **“is anyone still here?”**, use mmWave. A PIR forgets a guest the moment they stand still.
- For **reach zones**, aim a time-of-flight sensor or lidar *along* the edge of the zone, not across the whole room.
- For **whether people are frightened**, start with microphones and spacing before you reach for cameras. See [Sensing the Guest](section:sensing-the-guest).

## Controllers

| Job | Good choice | Why |
| --- | --- | --- |
| Reading sensors, driving servos | Microcontroller (ESP32 or Teensy class) | Boots in a second; never needs an update mid-show |
| Stage manager and local speech recognition | Single-board computer (Raspberry Pi 5 class) | Enough power for a small speech model |
| Safety loop | Safety relay, or a safety-rated PLC | Certified to fail safe; configured and signed off by someone qualified |
| Lighting | DMX controller | The lighting world solved this long ago |

The rule: **the safety loop never runs on code you wrote yourself.** Use a safety relay, or a safety PLC set up by someone qualified to do it. The stage manager from [The Room Controller](section:the-room-controller) sits *beside* it, never in front of it.

## Network

- **Wired Ethernet** to every room. Wi-Fi is for guests’ phones and the ticket desk, never for cues.
- A separate network for the show, with no route to the public internet except one gateway for the language models.
- Power over Ethernet for cameras and network audio devices, so each needs only one cable.

## Power

1. Use DIN-rail 24 V supplies for valves and logic, each on its own fused circuit.
2. Put servos on separate supplies, sized for all of them stalling at once.
3. Protect every outlet within reach of fog fluid, water effects or a mop with a GFCI (or RCD, depending on your side of the ocean).
4. Label every breaker with its room. On the night a breaker trips, in the dark, with a fog machine wheezing in your ear, you will not remember which is which.
