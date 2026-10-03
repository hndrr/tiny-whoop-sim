# SKYWARD / Whoop Circuit

Three.js browser drone-racing prototype inspired by 75 mm ducted Tiny Whoop quadcopters. A coastal airfield, 18 indoor/outdoor gates, rigid FPV and close chase cameras, and a lightweight analog-goggle post-process. Built from the original SKYWARD Blender experiment, with new drone dynamics and rebuilt browser scenery.

## Run

Node.js 20+ is sufficient. No dependency download is needed at runtime or for development.

```sh
npm start
# open http://localhost:4173
npm test
npm run check
```

Deploy `dist/` as static assets. Three.js 0.180.0 is vendored in `dist/vendor/`, including its MIT license. The two library files are unmodified package build artifacts; no external CDN requests are made. The root package has no external dependencies.

## Controls

- P or Space: arm / pause / resume
- W / S: forward / backward pitch
- A / D: left / right roll
- Up / Down: climb / descend
- Left / Right or Q / E: yaw
- C or camera button: FPV / chase
- R: reset
- Touch: proportional Mode 2 dual sticks; left = throttle/yaw, right = pitch/roll

Release movement keys to level the drone. Stabilized ANGLE mode assists altitude holding but preserves horizontal inertia; use opposite input to brake. Fly through all 18 gates in order. The FPV camera tilts 11.5 degrees upward and banks with the frame.

## Architecture

- `dist/flight.mjs`: deterministic lightweight drone motion and race state
- `dist/stage.mjs`: shared building geometry and swept collision volumes
- `dist/main.mjs`: procedural Three.js scenery, ducted quadcopter, camera, post-process and UI integration
- `dist/index.html`, `dist/style.css`: compact English radio-style OSD, keyboard and dual-stick touch UI
- `test-flight.mjs`: simulation regression checks
- `serve.mjs`: dependency-free static development server

## Limitations

Arcade physics, not a flight-training or hardware-control tool. Stabilized flight rather than full acro/rate mode. Video is clearly marked VTX SIM; no fabricated live battery or radio-link readings. Ground, the 750 m radius field boundary, and all major building surfaces/cargo use collision checks. Open hangar doors, windows and the service tunnel are traversable; scenery rocks and grass do not have mesh-accurate collision. No multiplayer, gamepad mapping, real radio connection, or persistent leaderboard. WebGL2-capable modern browser required.

## Coastal 02 stage

Two fly-through hangars with open loading bays and windows, interior roof beams and cargo, a service tunnel, expanded apron and cargo alleys. Left touch stick down reduces thrust and descends; release returns to altitude-assisted hover.
