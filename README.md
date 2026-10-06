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

Release movement keys to level the drone. Stabilized ANGLE mode assists altitude holding but preserves horizontal inertia; use opposite input to brake. Practice through any of the 18 rings in any order, from either direction. Each pass flashes mint and adds one practice count; there is no race timer or finish requirement. The FPV camera tilts 11.5 degrees upward and banks with the frame.

## Architecture

- `dist/flight.mjs`: deterministic lightweight drone motion and ring practice
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

The chart is 8,000 × 8,000 metres (terrain plus coastal water). Seven distributed regions: AIRFIELD, EAST HARBOR, RIDGE VIADUCT, HILL SETTLEMENT, NORTH QUARRY, LIGHTHOUSE POINT and WEST WIND RIDGE. Explore continuously or use SETUP → START FLIGHT to start at a distant region. Free flight is open from the start, with optional untimed ring practice.

Terrain uses 500 m chunks with 24-segment nearby and 6-segment distant meshes; landmarks and airfield details are distance-culled. Trees are instanced. Coarse-pointer devices use a 1.25 pixel-ratio ceiling and 1024 px shadow maps. These are implementation optimizations, not a measured iPhone frame-rate guarantee. Browser/iPhone visual and physical touch validation remains unavailable in the build environment.

## Offshore flight

Island terrain remains 8 × 8 km; the traversable airspace now covers 24 × 24 km, including open ocean. Choose SETUP → OFFSHORE → START FLIGHT for a water-side launch between reference buoys. HOME gives airfield distance/bearing. ALT is clearance above terrain or mean sea level. Touching water ends the flight with DITCHED; there is no invisible elevated floor offshore. The outer airspace uses a soft return force, not an instant crash. Sea-level collision uses the mean surface, not each cosmetic wave.

## Visual flight selection

Open SETUP for rendered previews of all eight real in-engine areas and a rotatable 3D airframe inspector. Five original aircraft (WHOOP 75, MICRO 65, SCOUT 85, RACER 90, CINE 95) have actual chase-view geometry, FPV camera mounts and distinct restrained handling. WHOOP 75 retains the original horizontal baseline. MICRO 65 turns quickly at a lower top speed; SCOUT 85 cruises faster with smoother turns; RACER 90 has the strongest acceleration tuning and highest speed; CINE 95 eases into turns and acceleration. The inspector shows relative horizontal acceleration, turn response and top-speed ratings (WHOOP 75 = 100). These are arcade tuning, not real-world hardware specifications.

Start commits mode, area and aircraft and begins flight; Cancel/Escape discards pending changes. Changing only aircraft preserves position/progress; changing area starts a new flight. Reset preserves the chosen area/aircraft. Selection is remembered on this browser when local storage is available. Previews reuse the flight renderer and release temporary GPU targets; preview failures leave selection usable.

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

## Progressive untimed missions

SETUP → MISSIONS offers seven untimed stages across the actual island. The first three retain their airfield precision routes; Stages 4–5 are broad outdoor errands, and Stages 6–7 introduce bridge traversals and turbine circuits. STAGE 1 retains four forgiving introductory objectives: approach the hangar, inspect its open central bay, leave through the same doorway, then return to the launch pad for a low hover. The target marker and relative direction/distance guide the pilot. Stay inside the broad target volume at a moderate speed until the short stability bar fills; there is no countdown, score or leaderboard. The final objective is explicitly a low hover, not rooftop landing or automatic landing.

R / RETRY OBJECTIVE restores the current objective's safe checkpoint, paused, with completed objectives retained. Crash/ditch never completes an objective. Pause, setup and tab hiding freeze mission progress. Aircraft-only changes preserve it. FREE FLIGHT opens the same selector with a pending mode choice; only START FLIGHT exits dispatch mode. Keeping the same area preserves position and dynamics. Completion pauses in place, clears inputs and shows a large CONGRATULATIONS! dialog with an explicit stage-complete label. NEXT STAGE starts the next checkpoint with the same aircraft; REPLAY restarts the current stage; completion FREE FLIGHT resumes in place. The last stage has no Next button. ALL STAGES COMPLETE appears only after all seven stages have actually been completed in this session; jumping straight to Stage 7 reports STAGE 7 COMPLETE. No automatic teleport or hidden progression occurs. Dispatch and stage progress last only for this session.

English is the default interface language. The same settings panel offers English / 日本語 with locally remembered selection when storage is available. Switching language updates interface text without resetting the aircraft, flight position, or mission. FPV and familiar radio labels stay recognizable; Japanese start/pause actions use plain language.

Verification includes clear mission target volumes/routes against actual collision geometry, speed/height/stability tolerances, pause/crash gating, per-objective retry and aircraft preservation. WebGL flight visual validation is still blocked by the available cloud graphics policy; deterministic geometry checks do not substitute for a visual flight test.

### Stage progression

- STAGE 1 / FIRST FLIGHT: broad hangar entry, inspection, exit and low return hover (4 objectives)
- STAGE 2 / SERVICE TUNNEL: align at the south entrance, fly low between real walls, climb under the roof, then exit and descend (4 objectives)
- STAGE 3 / WINDOW INSPECTION: pass the small south window, inspect at 5.4–6.2 m below the beams, descend before the north window, exit, and hold a controlled low hover (5 objectives)
- STAGE 4 / HARBOR SUPPLY RUN: pick up beside the containers, travel south over the water, and deliver at the outer pier; about 460 m (3 objectives)
- STAGE 5 / LIGHTHOUSE PATROL: travel out over the southwest coast, inspect the lamp from a safe stand-off, and return south of the tower to the service base; about 550 m (3 objectives)
- STAGE 6 / BRIDGE ROUTE: weave through all six actual viaduct bays, following entry/exit arrows across the bridge rather than hovering; about 430 m (6 directional crossings)
- STAGE 7 / WINDFARM CIRCUIT: circle each of the three real turbine towers below the blades, in either direction; about 800 m (3 full circuits plus safe tower-to-tower transfers)

Outdoor targets use 18–20 m arrival radii and broad altitude bands. Coast waypoints permit continuous travel; pickup, delivery and inspection require slowing briefly. The HUD tracks parcel pickup/carry/delivery or inspection recording/report submission. This is logical mission inventory, not a physical cargo model. Retry retains completed pickup/inspection actions; replay clears them. Markers are positioned above the real terrain or mean sea level and have enlarged outdoor beacons. No fuel, battery, countdown or scoring system is added.

The first three stages increase precision through obstacle clearance, changing height bands and slower stable inspections. The two outdoor errands instead emphasize travel, landmarks and carrying a parcel or report. The bridge route requires continuous directional passes; the windfarm circuit requires continuous circular flight. Turbine routes remain below the blade sweep, and bridge routes stay between the actual piers and below the deck. No countdown, racing order or leaderboard is introduced. All five aircraft can complete all seven routes with the shared flight model. Objective retries start from the previous safe center; stage changes start from that stage's launch checkpoint only after an explicit action.

### Mission guidance

Stages 1–5 use destination and altitude objectives: no hoops need to be crossed. Follow the mint ground diamond, enter its zone, set the displayed altitude and brake with opposite input if drifting. The four corner posts show the allowed height band; the filled diamond is inscribed in the accepted circular area. The HUD always shows a relative target direction even behind the aircraft, horizontal distance, current/required altitude, and the current unmet condition. Hold progress grows only while all conditions qualify. Race hoops are hidden during MISSIONS and restored on leaving it; flight physics are unchanged. Each stage has its own displayed height/speed tolerances. Stage 6 replaces the hover zone with an entry/exit portal and directional chevrons; pilots traverse the bay in the shown direction. Stage 7 shows a broad circular route and fills its arc as the pilot flies around a tower. Either direction counts, but backtracking reverses progress. Leaving the band retains progress and guides the pilot back to the departure point before more progress counts. Pause preserves progress; retry restarts only the current crossing or tower. Neither new stage can be completed by hovering at its marker. Japanese guidance is available; CRASHED remains in English.

Regional verification: `test-regional-missions.mjs` checks path-based completion, either-direction circuits, reversal, out-of-band rejoin, teleport rejection, pause/crash/retry/replay and retained completed objectives. `test-regional-flight.mjs` samples accepted bridge volumes and turbine annuli, checks real geometry and blade clearance, and flies actual normalized controls across all five aircraft at 30/60/144 Hz. Skilled 7 m/s circuits in both directions include safe departures around the previous tower before each transfer; no automatic pilot or speed target is imposed on the player. Synthetic UI lifecycle helpers are separate from physical-flight tests.

Guidance verification: the original precision routes retain their shared evaluator, neutral-hold, 45 continuous stage/aircraft/frame-rate flights at 30/60/120 Hz, 18,207 boundary-to-boundary segment checks and 15,456 target-volume samples. The two outdoor routes add 20 continuous normal-control flights across all five aircraft at 30/60 Hz, sampled arrival-volume and low-altitude edge-to-edge terrain/solid checks, and parcel/report retry/replay state tests. These checks establish reachability, not that every arbitrary player route is collision-free. HUD/marker lifecycle and mission input-clear wiring are tested. Responsive layout is code-reviewed only; cloud WebGL restrictions still prevent visual flight QA.

## Mission preparation

SETUP opens one large, centered settings panel, up to 1180px wide and 90% of the viewport height. The area cards use a responsive grid, and the real aircraft preview sits beside readable model choices on desktop. Narrow screens stack the sections with viewport margins; the body scrolls while the header and Start/Cancel footer stay available. Mode, area and aircraft can be changed in any order without changing pages or resizing the panel. FREE FLIGHT and MISSIONS (ミッション) are pending choices in that same panel. Mission mode shows only the selected mission’s actual starting-area card and rendered thumbnail (airfield, harbor, lighthouse, viaduct or windfarm), disabled with no click handler or keyboard tab stop. Seven distinct mission stage cards appear in the same panel. Other geographical areas are selectable only in FREE FLIGHT; switching back restores the pending free-flight area. A short notice explains the stage-specific mission area, and all five aircraft retain their real rotatable model preview in both modes. Cancel/Escape preserves mode, mission stage, aircraft, position and progress and restores the prior pause state; held inputs are cleared. START FLIGHT (飛行開始) commits mode, mission stage, area and aircraft together and begins flying with no second ARM step. Aircraft-only changes within an active mission preserve progress; retry restores its safe paused checkpoint. Japanese actions say 飛行開始 / 一時停止 / 再開; CRASHED stays English. Modal controls own keyboard/touch/mouse input while choosing. Language changes preserve pending choices.

Verification uses real setup/HUD callbacks in a dependency-free Node DOM contract harness plus the full simulation tests. Browser/WebGL visual QA remains unavailable in this cloud environment.

## Animated aircraft inspector

All five actual aircraft previews spin their four propellers and turn horizontally once every 20 seconds. Dragging pauses the turntable; it resumes from the chosen view after a 1.2-second grace period. Buttons and arrow keys also give inspection time; manual elevation is preserved. A subdued rendered gradient and soft floor/contact shading replace the flat background. Reduced-motion preferences disable automatic movement while preserving manual controls.

The inspector reuses the flight renderer, one render target, readback buffer and 2D image while open, with at most 30 preview copies per second. It cancels animation when the tab is hidden or the panel closes, discards elapsed hidden time, clamps long frame gaps, and releases the target/model/backdrop on close. Preview models are separate from flight models. Deterministic tests cover all five models, exact turn duration/local prop axes, drag/resume, model switches, reduced motion, repeated reopen and target cleanup. Full tests and build pass; cloud WebGL restrictions still prevent visual validation.

## Lightweight surface pass

Airfield asphalt and concrete use original 256px periodic albedo/detail maps generated locally at startup, metre-scaled UVs, and shared geometry. Roof/steel/glass share one small static analytic-sky reflection with a safe unsupported-device fallback. No stock/AI image assets or new dependencies are required. Flight mechanics and default feed brightness/output remain unchanged. See [surface authorship, memory budget and validation plan](docs/visual-surfaces.md). The opt-in `?profile=1` diagnostic has no on-screen UI; `?colorPipeline=1` is a separately gated, unverified color-output experiment. Real-device WebGL/touch/FPS verification remains pending.

## Authored forest silhouettes

The existing 700 tree positions and seeded placement are preserved. Three muted, original low-poly crown families replace the repeated single cones: overlapping broadleaf masses and layered conifers, with per-instance tint and rotation. Vertex shading is authored geometry color, not a photographic foliage texture. Trunks meet the ground and extend into the crown; trees remain non-colliding decoration.

Near/far opaque instanced geometry shares the same vertical crown profile, with a 650 m threshold and 65 m hysteresis. Updates occur after at least 12 m of camera movement; no billboard rotation, alpha foliage, texture downloads or extra shadow-casting passes. Maximum 12 draw batches (versus 2 before), 146 triangles per tree (versus 32 before), and about 255 KB of geometry/instance buffers. These are structural upper bounds, not measured phone GPU timings. CPU geometry, random-stream parity and LOD tests pass; actual WebGL appearance and phone performance still need device validation.
