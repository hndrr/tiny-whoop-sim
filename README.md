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
- Left hand: W / S climb / descend; A / D yaw left / right
- Right hand: Up / Down forward / backward pitch; Left / Right left / right roll
- Q / E: alternate yaw left / right (optional aliases)
- C or camera button: FPV / chase
- R: reset
- Desktop: left WASD and right arrow-key labels match the physical keyboard; always-visible dual sticks show the actual combined keyboard / pointer input; faint key labels brighten while held. Drag either stick with the primary mouse button, optionally using keys for the other stick. One mouse controls one stick at a time.
- Touch: proportional Mode 2 dual sticks; left = throttle/yaw, right = pitch/roll

Releasing a drag recenters that stick; blur, tab hiding, reset, pause and setup clear all held inputs.

Release movement keys to level the drone. Stabilized ANGLE mode assists altitude holding but preserves horizontal inertia; use opposite input to brake. Fly through all 18 gates in order. The FPV camera tilts 11.5 degrees upward and banks with the frame.

## Architecture

- `dist/flight.mjs`: deterministic lightweight drone motion and race state
- `dist/world.mjs`: 8 km world terrain, seven distributed regions, landmark solids and safe exploration spawns
- `dist/stage.mjs`: shared building geometry and swept collision volumes
- `dist/main.mjs`: procedural Three.js scenery, ducted quadcopter, camera, post-process and UI integration
- `dist/index.html`, `dist/style.css`: compact English radio-style OSD, keyboard and dual-stick touch UI
- `dist/controls.mjs`: shared normalized inputs and live radio feedback
- `dist/vehicle-catalog.mjs`, `dist/flight-selector.mjs`, `dist/selection-integration.mjs`: actual airframe models and reversible rendered area/aircraft selection
- `test-flight.mjs`, `test-controls.mjs`, `test-selection.mjs`: simulation, input lifecycle and preview regression checks
- `serve.mjs`: dependency-free static development server

## Limitations

Arcade physics, not a flight-training or hardware-control tool. Stabilized flight rather than full acro/rate mode. Video is clearly marked VTX SIM; no fabricated live battery or radio-link readings. Ground, and all major building surfaces/cargo use collision checks. The outer map edge applies a gentle restoring force instead of crashing the drone. Open hangar doors, windows and the service tunnel are traversable; scenery rocks and grass do not have mesh-accurate collision. No multiplayer, gamepad mapping, real radio connection, or persistent leaderboard. WebGL2-capable modern browser required.

## Coastal 02 stage

Two fly-through hangars with open loading bays and windows, interior roof beams and cargo, a service tunnel, expanded apron and cargo alleys. Left touch stick down reduces thrust and descends; release returns to altitude-assisted hover.

## Island Range world

The chart is 8,000 × 8,000 metres (terrain plus coastal water). Seven distributed regions: AIRFIELD, EAST HARBOR, RIDGE VIADUCT, HILL SETTLEMENT, NORTH QUARRY, LIGHTHOUSE POINT and WEST WIND RIDGE. Explore continuously or use SETUP → CHOOSE AREA + AIRCRAFT → APPLY SELECTION to start at a distant region. Race completion preserves the finish time and continues free flight.

Terrain uses 500 m chunks with 24-segment nearby and 6-segment distant meshes; landmarks and airfield details are distance-culled. Trees are instanced. Coarse-pointer devices use a 1.25 pixel-ratio ceiling and 1024 px shadow maps. These are implementation optimizations, not a measured iPhone frame-rate guarantee. Browser/iPhone visual and physical touch validation remains unavailable in the build environment.

## Offshore flight

Island terrain remains 8 × 8 km; the traversable airspace now covers 24 × 24 km, including open ocean. Choose SETUP → CHOOSE AREA + AIRCRAFT → OFFSHORE → APPLY SELECTION, then ARM for a water-side launch between reference buoys. HOME gives airfield distance/bearing. ALT is clearance above terrain or mean sea level. Touching water ends the flight with DITCHED; there is no invisible elevated floor offshore. The outer airspace uses a soft return force, not an instant crash. Sea-level collision uses the mean surface, not each cosmetic wave.

## Visual flight selection

Open SETUP → CHOOSE AREA + AIRCRAFT for rendered previews of all eight real in-engine areas and a rotatable 3D airframe inspector. Five original aircraft (WHOOP 75, MICRO 65, SCOUT 85, RACER 90, CINE 95) have actual chase-view geometry, FPV camera mounts and distinct restrained handling. WHOOP 75 retains the original horizontal baseline. MICRO 65 turns quickly at a lower top speed; SCOUT 85 cruises faster with smoother turns; RACER 90 has the strongest acceleration tuning and highest speed; CINE 95 eases into turns and acceleration. The inspector shows relative horizontal acceleration, turn response and top-speed ratings (WHOOP 75 = 100). These are arcade tuning, not real-world hardware specifications.

Apply commits the selection; Cancel/Escape discards pending changes. Changing only aircraft preserves position/progress; changing area starts a new paused flight. Reset preserves the chosen area/aircraft. Selection is remembered on this browser when local storage is available. Previews reuse the flight renderer and release temporary GPU targets; preview failures leave selection usable.

Verification: Node physics, normalized controls, pointer lifecycle, airframe geometry, saved-selection recovery, reversible stage rendering and render-target cleanup checks pass. Real browser flight visual/input validation is still pending: the cloud browser graphics policy disables GL_VENDOR/GL_RENDERER. No physical-device frame-rate claims are included.

## Video brightness

The always-visible BRIGHTNESS slider adjusts the 3D flight video in both FPV and chase views from 60% to 180%, without changing HTML telemetry or control brightness. 100% preserves the original look; the adjacent reset button restores it. The value is validated and remembered locally when browser storage is available. Setup thumbnails keep their original scene exposure.

## Handling and controlled descent

All five aircraft share the same normalized keyboard, mouse and touch path and stabilized vertical controls. W / stick up climbs; S / stick down descends. Full descent reaches approximately 8 m/s high above surfaces, easing continuously near the nearest terrain, sea or solid surface below. Overhead roofs do not count as ground when flying indoors. Releasing throttle brakes toward hover; held descent still moves downward and can hit structures or ditch in water. This is assistance, not automatic landing or collision avoidance.

Relative tuning (WHOOP 75 = 100):
- WHOOP 75: acceleration 100, turn 100, top speed 100
- MICRO 65: acceleration 108, turn 118, top speed 90
- SCOUT 85: acceleration 94, turn 88, top speed 110
- RACER 90: acceleration 114, turn 104, top speed 118
- CINE 95: acceleration 90, turn 78, top speed 94

All-aircraft deterministic tests cover measured launch/turn/cruise differences, input-source parity, frame-time tolerance, retained profile across reset/relocation, selection apply/cancel/reopen, and descent reversal/release/surface behavior. Browser flight visual validation remains blocked by the available cloud graphics policy (GL_VENDOR/GL_RENDERER disabled); geometry and selector tests are not a substitute for flight visual QA.

## Untimed precision dispatches

SETUP → PRECISION starts four forgiving airfield objectives: approach the hangar, inspect its open central bay, leave through the same doorway, then return to the launch pad for a low hover. The target marker and relative direction/distance guide the pilot. Stay inside the broad target volume at a moderate speed until the short stability bar fills; there is no countdown, score or leaderboard. The final objective is explicitly a low hover, not rooftop landing or automatic landing.

R / RETRY OBJECTIVE restores the current objective's safe checkpoint, paused, with completed objectives retained. Crash/ditch never completes an objective. Pause, setup and tab hiding freeze mission progress. Aircraft-only changes preserve it; changing area exits dispatch mode. FREE FLIGHT exits without teleporting or changing dynamics. REPLAY restarts the sequence. Dispatch progress lasts only for this session.

English is the default interface language. SETUP offers English / 日本語 with locally remembered selection when storage is available. Switching language updates interface text without resetting the aircraft, flight position, or mission. FPV, ARM and familiar radio labels stay recognizable.

Verification includes clear mission target volumes/routes against actual collision geometry, speed/height/stability tolerances, pause/crash gating, per-objective retry and aircraft preservation. WebGL flight visual validation is still blocked by the available cloud graphics policy; deterministic geometry checks do not substitute for a visual flight test.

### Mission guidance

PRECISION is hover practice: no hoops need to be crossed. Follow the mint ground diamond, enter its zone, set the displayed altitude and brake with opposite input if drifting. The four corner posts show the allowed height band; the filled diamond is inscribed in the accepted circular area. The HUD always shows a relative target direction even behind the aircraft, horizontal distance, current/required altitude, and the current unmet condition. Hold progress grows only while all conditions qualify. Race hoops are hidden during PRECISION and restored on leaving it; physics and objective tolerances are unchanged. Japanese guidance is available; CRASHED remains in English.

Guidance verification: shared evaluator tests cover every failed condition and inclusive boundary, all five airframes complete with released neutral controls from a valid hover, and continuous four-objective flights pass at 30/60/120 Hz. HUD/marker lifecycle and mission input-clear wiring are tested. Responsive layout is code-reviewed only; cloud WebGL restrictions still prevent visual flight QA.
