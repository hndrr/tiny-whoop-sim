# SKYWARD / Whoop Circuit

Three.js browser drone-racing prototype inspired by 75 mm ducted Tiny Whoop quadcopters. A coastal airfield, eight low-altitude gates, rigid FPV and close chase cameras, and a lightweight analog-goggle post-process. Built from the original SKYWARD Blender experiment, with new drone dynamics and rebuilt browser scenery.

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
- Touch: on-screen forward/reverse, yaw and altitude buttons

Release movement keys to level the drone. Stabilized ANGLE mode assists altitude holding but preserves horizontal inertia; use opposite input to brake. Fly through all eight gates in order. The FPV camera tilts 11.5 degrees upward and banks with the frame.

## Architecture

- `dist/flight.mjs`: deterministic lightweight drone motion and race state
- `dist/main.mjs`: procedural Three.js scenery, ducted quadcopter, camera, post-process and UI integration
- `dist/index.html`, `dist/style.css`: Japanese OSD, keyboard and touch UI
- `test-flight.mjs`: simulation regression checks
- `serve.mjs`: dependency-free static development server

## Limitations

Arcade physics, not a flight-training or hardware-control tool. Stabilized flight rather than full acro/rate mode. Battery and link numbers are clearly marked SIM and are simulated OSD decoration. Ground, field boundary and hangar-body collisions are checked; the entire scenery does not have mesh-accurate collision. No multiplayer, gamepad mapping, real radio connection, or persistent leaderboard. WebGL2-capable modern browser required.
