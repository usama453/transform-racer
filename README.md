# Transform Racer

A real-time **online multiplayer** driving + flying game. Drive a car, drift around corners and burn nitrous — then hit **F** and transform into a jet plane to rule the skies, complete with its own boost system.

Runs in the browser (Three.js). Multiplayer via Socket.io with position interpolation.

## Run it

```bash
npm install
npm start
```

Then open **http://localhost:3000** in your browser.

To play with friends on the same network, start the server on your machine and have them open `http://<YOUR_LAN_IP>:3000`.

## Controls

| Key | Action |
| --- | --- |
| `W` / `S` | Throttle / Brake (car) — Pitch up / down (plane) |
| `A` / `D` | Steer (car) — Roll (plane) |
| `SHIFT` | Nitrous (car) / Boost (plane) — tap twice quickly for **2x power** |
| `SPACE` | Handbrake / drift (car) |
| `Q` / `E` | Yaw (plane) |
| `F` | Transform between car and plane |
| `C` | Toggle chase cam / first-person cockpit |
| `ENTER` | Chat |

## How it works

- **Server** (`server.js`): Express + Socket.io. Tracks every player, throttles and relays position/rotation/mode updates, assigns names and colors.
- **Client** (`public/js/`):
  - `vehicle.js` — arcade physics for both modes: engine force, drag, speed caps, lateral grip for drifting, banked turns, takeoff/landing.
  - `world.js` — island arena: grid terrain, runway, city, forest, mountains, drifting clouds.
  - `render.js` — low-poly car + plane models, wheels, propeller, jet flames, boost glow.
  - `network.js` — Socket.io wrapper, remote state map.
  - `main.js` — render loop, camera follow, remote interpolation, boost particles, transform flash.
  - `input.js` / `hud.js` — controls and on-screen HUD (speed, nitro/boost, mode, chat).
  - `audio.js` — procedural WebAudio sound: engine rumble, jet whine, drift squeal, boost, transform.
  - `minimap.js` — canvas minimap showing runway, terrain markers and live player positions.
- **Name tags & edge tags** (`main.js`): every player has a floating name tag that fades with distance; off-screen players get an arrow at the screen edge with their name and distance.
- **Infinite nitro**: nitrous never runs out — tap `SHIFT` twice for a 2.5s **2x overboost** burst.

## Tuning

All feel parameters (top speeds, nitro force, overboost duration, drift grip, plane climb rates) are constants at the top of `public/js/vehicle.js`.

## Roadmap

- Weapons / shooting in flight mode
- Speed boosts / pickups on the map
- Laps & time trials
