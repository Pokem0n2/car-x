// car-x — Car using only physics constraints
// Based on the enable3d example "car-using-physics-constraints"
// https://github.com/enable3d/enable3d.github.io/blob/master/src/examples/car-using-physics-constraints.html
//
// Single-file offline build (tools/build.mjs inlines ammo.js + this bundle).
// v1.2.0 changes:
// - real-world car dimensions (4125×1770×1570 mm, wheelbase 2700 mm, track 1530 mm,
//   tires 195/60 R16, min turning radius 5250 mm → max steer atan(2.7/5.25) ≈ 0.473 rad)
// - default scale 1:200 (1 mm on screen = 200 mm in the world)
// - grass everywhere except a black pad of 10× car length per side
// - front wheel trails are green (rear stay red)
// - wheel / pinch zoom in both views; free view supports drag-orbit (no view reset)
// - touch: 1-finger tap = throttle, 2-finger tap = reverse, device tilt = steering
// - site layout: inverted-T three-way road + two parking slots (5300×2700 mm;
//   slot long edges flush with road line C / line E)
// v1.3.0 changes:
// - slot1 right edge flush with line C, slot2 bottom edge flush with line E (2700 mm wide)
// - markings are filled strips (not 1 px GL lines): every corner closed at any DPI/zoom
// - strip thickness clamped >= 2.5 screen px so deep zoom-out cannot shatter them
// - all strip end caps grow half-thickness past every corner: the outside quadrant
//   of each slot corner is a full overlap square (no notch at any scale / DPR)
// v1.3.1: fix slot corner notches on the outside quadrant (visible at phone DPR)
// v1.6.6 changes (size pass 2, no behavior change):
// - payload compression gzip -> LZMA-alone (ammo 616KB->432KB, app 295KB->244KB)
// - base64 -> HTML-safe base85 custom alphabet (no <>&'"/ chars, so the
//   payload can never terminate a <script> block)
// - decompressor: inlined 7KB pure-JS LZMA decoder (lzma-d-min); fflate
//   dropped. Still zero eval/wasm/DecompressionStream — CSP-safe like v1.5.7
// - 1.22MB -> 854KB total (-77% vs v1.5.7's 3.70MB)
// v1.6.3 changes (tilt steering dead on some browsers):
// - activation retried on EVERY touch until real sensor data flows (was
//   once-only on first touchstart: if that touch raced async boot, or the
//   iOS permission prompt got dismissed, tilt stayed dead forever)
// - deviceorientationabsolute wired (some browsers only fire that variant)
// - devicemotion fallback: when no orientation channel ever fires, the
//   gravity vector is rebuilt from accelerationIncludingGravity and fed
//   into the SAME screen-projection + deadzone + mapping pipeline
// v1.6.2 changes (compatibility fixes over v1.6.0/1.6.1):
// - physics reverted to the SAME asm.js binary as v1.5.7 (the wasm build
//   spawned cars with a leftward drift + non-zero rest angles on some
//   browsers — different Bullet compile, different solver init; verified
//   spawn drift 2mm / 0.05deg with asm.js)
// - boot no longer uses eval()/WebAssembly/DecompressionStream: payloads
//   run via <script> element injection (CSP 'unsafe-inline' webviews like
//   the Feishu previewer allow exactly what v1.5.7 used) and decompress
//   with inlined fflate (pure JS, also fixes old browsers)
// - size: 3.70MB (v1.5.7) -> 1.22MB, still -67%
// v1.6.1 changes:
// - grass texture 512x512 JPEG q? (98KB / 131KB base64) -> 128x128 q30
//   (1.3KB / 1.8KB base64). Tile covers 10 world units (repeat 50x on a
//   500x500 ground) so 512px detail was invisible; visual probe confirmed
//   noisy-textured grass still renders identically at gameplay zoom.
// v1.6.0 changes (SIZE OPTIMIZATION — same behavior, 3.70MB -> 0.93MB):
// - physics: asm.js ammo (2.49MB text) -> wasm ammo (651KB binary), same
//   Bullet classes; glue+wasm embedded gzip+base64, decompressed at boot
//   via DecompressionStream (Chrome 80+/Safari 16.4+/Firefox 113+)
// - app bundle (enable3d+three+entry) embedded gzip+base64 instead of text
// - boot order: decompress glue -> define Ammo -> decompress app -> eval
//   -> window.__boot(Project, MainScene) starts the scene
// - cold start ~0.35s vs 2-4s asm.js parse; no code paths removed
// v1.5.7 changes:
// - SPEED INPUT: Enter / NumpadEnter confirms the value AND blurs (mobile
//   keyboards have no Tab key; canvas-area mousedown/touchstart also blur
//   the field now -- touchstart's preventDefault used to block that).
// - HUD BUTTONS: fixed min-width 66px so M/A label swap never changes
//   button width; both HUD buttons and the speed row are exactly 34px
//   tall (user spec items 2 and 3).

// - speed input width 30px -> 40px total (content 20 -> 30).
// v1.5.5 changes:
// - HUD ONE ROW (left->right): view button | speed slider+input | throttle button.
// - SHORT LABELS: 视角:俯视锁定/自由视角 -> 俯视/自由; 油门:未锁定/已锁定 -> 油门:M/A
//   (M=manual pulses/hold, A=auto cruise).
// - SPEED INPUT: on focus the field CLEARS so the user can type a fresh number
//   (blur re-normalizes; empty/invalid restores last valid speed).

// - SPEED INPUT: editable again. Two stacked bugs had broken deleting:
//   (1) document keydown preventDefault'ed EVERY key (incl. Backspace)
//       while the field had focus -> keydown now skips when an input
//       is focused;
//   (2) setSpeed rewrote the field on every keystroke (toFixed snap-back:
//       delete '5' from '2.5' -> parseFloat('2.')=2 -> field snapped to
//       '2.00') -> field-origin edits no longer rewrite the field;
//       blur normalizes.
// - SPEED INPUT width 54px -> 30px rendered (content-box 20px).
// - FREE-VIEW DEFAULT DEPRESSION 30 -> 15 deg (user spec): camera now at
//   (0, 1.741, 6.497) — dead-aft, r=6.727, phi=75deg. Same orbit radius,
//   same switch logic; only the initial default attitude changed.
// v1.5.2 changes:
// - FREE-VIEW DEFAULT CAMERA: straight behind the car (+z, car nose is -z)
//   at a 30-degree depression angle, same orbit radius as before (6.727 m).
//   The old default (4, 3, 4.5) was a right-rear quarter view at 26.5 deg.
//   Verified in-browser: theta=0.0, depression=30.0, r=6.726 after switch.
// v1.5.1 changes:
// - PINCH-ZOOM RESTORED: the v1.5.0 half-screen gesture rewrite dropped it
//   by accident. Two-finger pinch now zooms both views again (span ratio
//   through zoomBy, same channel as wheel). Pinch never fires throttle:
//   pending hold/tap timers are cancelled the moment a 2nd finger lands,
//   and an in-progress hold releases its key. Verified: pinch-out/in round
//   trip orthoH 34.9->11.6->34.9, keys stay false, 1-finger hold intact.

// v1.5.0 changes (user spec, exactly two changes):
// - SPEED SLIDER always enabled: no disabled state, no dimming — touch can
//   adjust speed in both locked and free mode (default 0.3, hard cap 5).
// - HALF-SCREEN GESTURES replace finger-count gestures:
//     RIGHT half: tap = forward pulse (free) / cruise toggle (locked);
//                 hold 350 ms = sustained W (like holding the key)
//     LEFT half:  tap = reverse pulse (free) / reverse cruise (locked);
//                 hold 350 ms = sustained S (like holding the key)
//                 double-tap = pause/resume (moved here from right side)
//   Two-finger gestures removed. Drag = orbit, pinch-zoom via buttons.

// v1.4.10 changes:
// - (#1) TILT ON ALL BROWSERS: screen angle robustly resolved via
//   screen.orientation events + matchMedia fallback (some Android browsers
//   report angle 0/undefined; window.orientation is removed) — tilt steering
//   no longer goes dead on those.
// - (#2/#3) REVERSE IS THROTTLE TOO: the 0.6 s launch ramp now applies to S
//   as well (reverse used to step in at full target — the hard right-down
//   pull), and the straight-line heading assist works in BOTH directions
//   (mirrored gain in reverse).
// - (#4) PRESS-AND-HOLD: 1-finger hold >350 ms = sustained W; 2-finger hold
// v1.4.9 changes:
// - TWO-FINGER TAP FIX: real fingers lift in SEPARATE frames; the old
//   touchend killed the gesture on the first lift, so the reverse action
//   never ran. The gesture now stays alive across split lifts (<600 ms),
//   and keys.s is cleared BEFORE pressThrottle so the reverse pulse is
//   no longer insta-cancelled (second bug found in the same block).
// - STRAIGHT-LINE ASSIST: pulse throttle + contact jitter used to walk the
//   heading further off course with every pulse. With no steer intent at
//   all (no keys, tilt in deadzone, rolling forward) the car now servos
//   gently back to the heading captured when steering went neutral. Any
//   steer input releases the hold; returning to neutral re-captures, so
//   deliberate turns keep their new heading. Disabled in reverse.

// v1.4.9 changes:
// - TWO-FINGER TAP FIX: real fingers lift in SEPARATE frames; the old
//   touchend killed the gesture on the first lift, so the reverse action
//   never ran. The gesture now stays alive across split lifts (<600 ms),
//   and keys.s is cleared BEFORE pressThrottle so the reverse pulse is
//   no longer insta-cancelled (second bug found in the same block).
// - STRAIGHT-LINE ASSIST: pulse throttle + contact jitter used to walk the
//   heading further off course with every pulse. With no steer intent at
//   all (no keys, tilt in deadzone, rolling forward) the car now servos
//   gently back to the heading captured when steering went neutral. Any
//   steer input releases the hold; returning to neutral re-captures, so
//   deliberate turns keep their new heading. Disabled in reverse.

// v1.4.8 changes:
// - TILT MATH FIX (deg->rad): deviceorientation delivers alpha/beta/gamma in
//   DEGREES but rotm() fed them to Math.cos/sin as radians. The scrambled
//   gravity vector put physical 3-6 deg tilts inside the deadzone or flipped
//   the sign every few degrees - steering went dead on the phone. Angles are
//   converted to radians before the rotation now (12-case numeric suite on
//   the exact shipped listener: deadzone edge, linear midpoint, saturation,
//   all four grips, pitch immunity - ALL PASS).

// v1.4.7 changes:
// - STANDSTILL STEERING PIN: with no throttle and the car nearly stopped,
//   the chassis is pinned (linear velocity zeroed; only the steering bodies
//   keep angular freedom). Turning the wheels at a standstill no longer
//   shuffles the car; any throttle releases the pin.
// - TILT MAPPING (user spec): gyroscope steering uses ONLY the screen-x
//   gravity angle. Deadzone 3°, then 3°→8° of tilt maps linearly onto
//   0→full lock (the Ackermann outer-wheel max angle); beyond 8° clamps.
// v1.4.6 changes:
// - SPAWN-GEOMETRY REGRESSION FIX: the v1.4.5 source rebuild accidentally
//   dropped the v1.4.1 left-side spawn fix — left wheels/rotors spawned at
//   -(SPAWN_X+WHEEL_X) instead of SPAWN_X-WHEEL_X (30 cm outboard): chassis
//   tilted at spawn and the rear-left wheel sat outside the body. Restored.
//   Verified: roll/pitch 0.00 deg at rest, wheels symmetric about the chassis
//   (x = +0.92 / -0.61), turn circle back at the v1.4.4 baseline (R = 6.69 m
//   @ 2 m/s vs 6.71), 55 m straight drift 0.39 deg.
// v1.4.5 changes:
// - ROTATION FIX: the enable3d framework sizes the renderer ONCE at boot with
//   the then-current innerWidth/innerHeight and never listens for resize or
//   orientationchange (0 resize listeners in the bundle). Rotating the phone
//   left the canvas at portrait size — scene off-center, car out of view.
//   Now: resize + orientationchange listeners resize the renderer, both
//   cameras, and the marking-width clamp; the car stays centered.
// - TILT STEERING REWRITE (gravity projection): the old axis pick
//   (landscape ? gamma : beta) read the WRONG axis in portrait and swapped
//   signs between 90°/270° landscape. Steering is now computed from the
//   gravity direction projected into screen axes (ZXY Euler → device-frame
//   gravity → rotate by screen-orientation angle) — exact in all 4 rotations.
//   Portrait steers by tilting the top of the phone toward/away from you
//   (tray tilt); landscape by tilting left/right edge (steering-wheel tilt).
// - TOUCH GESTURES (v1.4.5): single-finger double-tap toggles pause/resume
//   (single tap still pulses throttle / toggles cruise); two-finger SINGLE tap
//   = reverse (two-finger tap while locked cycles D→stop→R as before, now a
//   true single tap instead of hold). Pinch zoom unchanged.
// v1.4.4 changes:
// - TURNING RADIUS FIXED TO SPEC: minTurnR 5.25 m is the OUTERMOST front-wheel
//   CENTER arc radius. The old MAX_STEER = atan(L/R) = 27.2° treated 5.25 as the
//   rear-axle-center radius, giving a real outer-wheel arc of ~6.6 m (user
//   measured the violation). Correct solve: R_rear = sqrt(5.25²−L²) − T/2 =
//   3.7375 m, bicycle angle 35.85°.
// - TRUE ACKERMANN STEERING: equal L/R wheel angles made both front wheels share
//   one turn center fitting NEITHER — tires scrubbed (circle-fit residual 9 cm).
//   Now inner = atan(L/(R_rear−T/2)) = 42.25°, outer = atan(L/(R_rear+T/2)) =
//   30.95° at full lock, interpolated for partial steer. Probed: knuckles settle
//   at −42.3°/−31.0° exactly.
// - measured outer-front-wheel circle: R = 5.01 m @ 0.5 m/s (kinematic regime,
//   spec convention), 6.7 m @ 2 m/s (lateral tire slip widens it dynamically).
// - grass texture RESTORED: flatness is physics (collision plane), not looks —
//   the v1.4.2 flat-color change over-fixed; texture is back on a flat plane
// - idle brake no longer flips the car: the constant 200 impulse, applied when
//   W was released at speed, locked four spinning wheels instantly and pitched
//   the car over. Now speed-scaled (20 + 30·v, capped 200): engine braking.
// - W speed cap raised to 5 m/s (was uncapped 40 rad/s ≈ 12.8 m/s)
// - W left-pull fixed: two stacked causes. (1) enable3d dof() builds limit frames
//   from the body's WORLD rotation — our rotateZ(90°) beams made the suspension
//   limits lock VERTICAL and free LATERAL ±30 cm (opposite of intent); swapped
//   the limit axes. (2) steering hinge #2 anchored 0.30 m inboard of the kingpin
//   line (two parallel hinges = direction lock, dead steering) — re-anchored
//   collinear with the kingpins via pivotB z-offset. (3) launch-transient toe:
//   0.5 s steering servo recovery let a knuckle kick steer the car 1.7° before
//   correcting — servo dt 0.5→0.1 s + 0.6 s motor ramp. Straight-line drift over
//   230 m: 1.7° → 0.58°.
// - steering now actually reaches lock: collision filtering (wheel↔ground only,
//   chassis parts collide with nothing) removed the wheel-vs-beam/plate blocks
//   that stalled the left knuckle at −3.1° and right at −16.6°. Both knuckles
//   now sweep symmetric ±27.2° = atan(wheelbase/minTurnR), i.e. the 5.25 m
//   minimum turning radius is geometrically enforced.
// v1.4.1 changes:
// - W-launch explosion fixed: the physics solver ran with default 10 iterations;
//   a launch from parked folded the rear suspension chain (plate thrown 60 cm up,
//   rear wheels snapped 42 cm together on desktop, welds broke outright on a
//   slower PC). Now 50 iterations + split impulse — assembly stays rigid through
//   launch transients at any frame rate (verified at 60 fps and 1.4 fps).
//
// v1.4.0 changes:
// - spawn geometry: left wheels/rotors used -(SPAWN_X+WHEEL_X) instead of
//   SPAWN_X-WHEEL_X — the whole left side was 30 cm outboard (rear-left wheel
//   18 cm outside the body envelope at spawn)
// - rigid assembly: enable3d lock() (soft zero-limit 6Dof) → custom weld() on
//   btFixedConstraint (lock() ratchets apart under the 5-tonne plate + motor
//   torque: rear-left wheel drifted 31 cm in 30 s on desktop, explodes in
//   seconds on a phone; enable3d's fixed() wrapper is ALSO broken — it
//   overwrites both constraint frames' rotations with world rotations,
//   launching rotated-body assemblies into the air)
// - out-of-world self-heal: teleport all bodies back to the captured spawn
//   assembly if the plate falls below y=-0.5 or leaves the ±240 m bounds
//   (driving past the 500 m physics-ground edge used to free-fall forever —
//   the "axle tumbling through space" seen on device)

import { Project, Scene3D, THREE } from './enable3d.framework.0.26.0_dev0.module.min.js'
import grassUrl from './grass-small.jpg'

var transparent = true
var debug = true

// ---------- vehicle spec (meters) ----------
const CAR = {
  length: 4.125,   // 4125 mm
  width: 1.77,     // 1770 mm
  height: 1.57,    // 1570 mm
  wheelbase: 2.7,  // 2700 mm
  track: 1.53,     // 1530 mm
  tireD: (16 * 25.4 + 2 * 0.6 * 195) / 1000, // 195/60 R16 → 0.6404 m
  tireW: 0.195,
  minTurnR: 5.25   // 5250 mm
}
const WHEEL_R = CAR.tireD / 2
const WHEEL_W = CAR.tireW
const WHEEL_X = CAR.track / 2 // 0.765
const WHEEL_Z = CAR.wheelbase / 2 // 1.35
// minTurnR is the OUTERMOST front-wheel CENTER arc radius (manufacturer spec,
// BYD Dolphin 5.25 m). Solve back to the equivalent bicycle steer angle:
//   R_rearAxleCenter = sqrt(R² − L²) − T/2 = sqrt(5.25²−2.7²) − 0.765 = 3.7375 m
//   δ_max = atan(L / R_rearAxleCenter) = atan(2.7/3.7375) = 35.85°
// (the earlier atan(L/R)=27.2° treated 5.25 m as the REAR-AXLE radius, which
//  yields an outer-front-wheel radius of ~6.6 m — matches the user's report)
const MAX_STEER = Math.atan(CAR.wheelbase / (Math.sqrt(CAR.minTurnR ** 2 - CAR.wheelbase ** 2) - CAR.track / 2)) // ≈ 0.6258 rad = 35.85°

// scaled running gear
const ROTOR_R = 0.22, ROTOR_H = 0.22
const AXIS_LEN = 1.3, AXIS_R_REAR = 0.04, AXIS_R_FRONT = 0.025
const AXIS_Z = 0.15                       // front steering sub-axles offset
// physics chassis is narrower than the visual body: at real proportions the track (1.53)
// sits inside the body width (1.77), and wheels/axles must not collide with the chassis
// (they are not directly constrained pairs, so ammo would push them apart)
const PLATE_W = 1.28
// spawn at the measured rest pose (no drop transient): tires just touching the ground,
// chassis at its settled sag height
const SPAWN_Y = GROUND_TOP() + WHEEL_R
const PLATE_Y = SPAWN_Y - 0.015

function GROUND_TOP() { return 0.5 }      // add.ground() box: 1 thick, centered at y → surface +0.5

// ---------- site layout (meters; +z = down-screen) ----------
// Inverted-T three-way junction; markings are 120 mm filled white strips:
//   A (-7.5,0)-(-1.5,0) 6000   B (-1.5,0)-(-1.5,-6) 6000
//   C ( 1.5,0)-( 1.5,-6) 6000  D ( 1.5,0)-( 7.5,0) 6000
//   E (-7.5,3)-( 7.5,3) 15000  (A/D and E are 3000 apart vertically, B/C 3000 horizontally)
const SPAWN_Z = -3.0                                             // center of the main slot
const SPAWN_X = 0.15                                             // center of the main slot (follows SLOT1)
const SLOT1 = { x0: -1.2, x1: 1.5, z0: -5.65, z1: -0.35 }        // 纵向 2700×5300, 右长边与 C 重合
const SLOT2 = { x0: -7.5, x1: -2.2, z0: 0.3, z1: 3.0 }           // 横向 5300×2700, 底部长边与 E 重合
const ROAD = [
  [-1.5, -6, -1.5, 0],    // B
  [1.5, -6, 1.5, 0],      // C
  [-7.5, 0, -1.5, 0],     // A
  [1.5, 0, 7.5, 0],       // D
  [-7.5, 3, 7.5, 3]       // E
]

// ---------- world / camera ----------
const PAD = CAR.length * 10         // black pad side: 10 × car length = 41.25 m
const LINE_Y = GROUND_TOP() + 0.02
const TRAIL_Y = GROUND_TOP() + 0.03
const TRAIL_MAX = 6000
const CAM_HEIGHT = 40
const PX2M = (200 * 25.4) / 96 / 1000  // scale 1:200 → 0.0529 m per CSS px
const ORTHO_MIN = 2, ORTHO_MAX = 120
const FREE_R_MIN = 2.5, FREE_R_MAX = 60

class MainScene extends Scene3D {
  keys = { w: false, a: false, s: false, d: false, space: false }

  viewLocked = true
  paused = false
  throttleLocked = false
  cruiseDir = 0
  cruiseSpeed = 0.3
  driveDir = 0
  tiltSteer = 0
  #tiltRequested = false
  orthoH = 40 // set to the 1:200 default in create()
  sph = { r: 6.727, theta: 0, phi: Math.PI / 3 } // free-view orbit: behind car, 30° depression

  addToScene(obj) {
    const root = this.scene && this.scene.isScene ? this.scene : this
    THREE.Object3D.prototype.add.call(root, obj)
  }

  preload() {
    this.load.preload('grass', grassUrl)
  }

  // ---------- builders ----------
  addPlate() {
    const plate = this.add.box(
      { x: SPAWN_X, y: PLATE_Y, z: SPAWN_Z, width: PLATE_W, depth: CAR.length, height: 0.25, mass: 5000 },
      { lambert: { wireframe: true } }
    )
    this.physics.add.existing(plate)
    // full-envelope wireframe (no physics) so 长×宽×高 is visible
    const envelope = this.add.box(
      { width: CAR.width, height: CAR.height, depth: CAR.length },
      { lambert: { wireframe: true, transparent, opacity: 0.4 } }
    )
    envelope.position.set(0, GROUND_TOP() + CAR.height / 2 - PLATE_Y, 0)
    plate.add(envelope)
    return plate
  }

  addAxis(z, radius = AXIS_R_REAR) {
    const axis = this.add.cylinder(
      { x: SPAWN_X, z, y: SPAWN_Y, mass: 10, radiusTop: radius, radiusBottom: radius, height: AXIS_LEN },
      { lambert: { color: 'blue', transparent, opacity: 0.5 } }
    )
    axis.rotateZ(Math.PI / 2)
    this.physics.add.existing(axis)
    return axis
  }

  addRotor(x, z) {
    const rotor = this.add.cylinder(
      { mass: 10, radiusBottom: ROTOR_R, radiusTop: ROTOR_R, radiusSegments: 24, height: ROTOR_H, x, y: SPAWN_Y, z },
      { lambert: { color: 'red', transparent, opacity: 0.5 } }
    )
    rotor.rotateZ(Math.PI / 2)
    this.physics.add.existing(rotor)
    return rotor
  }

  addWheel(x, z) {
    const wheel = this.add.cylinder(
      { mass: 20, radiusBottom: WHEEL_R, radiusTop: WHEEL_R, radiusSegments: 24, height: WHEEL_W, x, y: SPAWN_Y, z },
      { lambert: { color: 'blue', transparent, opacity: 0.5 } }
    )
    wheel.rotateZ(Math.PI / 2)
    this.physics.add.existing(wheel)
    wheel.body.setFriction(3)
    return wheel
  }

  // ---------- trails ----------
  makeTrail(wheel, color) {
    const geo = new THREE.BufferGeometry()
    const pos = new THREE.BufferAttribute(new Float32Array(TRAIL_MAX * 3), 3)
    geo.setAttribute('position', pos)
    geo.setDrawRange(0, 0)
    const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color }))
    line.frustumCulled = false
    this.addToScene(line)
    return { wheel, geo, pos, count: 0, lastX: NaN, lastZ: NaN }
  }

  appendTrail(t, x, z) {
    if (t.count >= TRAIL_MAX) return
    if (!Number.isNaN(t.lastX)) {
      const dx = x - t.lastX
      const dz = z - t.lastZ
      if (dx * dx + dz * dz < 1e-4) return
    }
    t.pos.setXYZ(t.count, x, TRAIL_Y, z)
    t.count++
    t.pos.needsUpdate = true
    t.geo.setDrawRange(0, t.count)
    t.lastX = x
    t.lastZ = z
  }

  clearTrails() {
    for (const t of this.trails || []) {
      t.count = 0
      t.geo.setDrawRange(0, 0)
      t.lastX = NaN
      t.lastZ = NaN
    }
  }

  // ---------- site markings ----------
  drawSite() {
    // black pad: 10 × car length per side, everything else is grass
    // top surface exactly at GROUND_TOP (the physics plane wheels rest on)
    const pad = this.add.box(
      { width: PAD, height: 0.05, depth: PAD },
      { lambert: { color: 0x000000 } }
    )
    pad.position.set(0, GROUND_TOP() - 0.025, 0)
    this.addToScene(pad)

    // inverted-T three-way road + south edge (no collision)
    // Markings are filled strips (real road-marking width), not 1 px GL lines:
    // a zero-width line leaves the corner cell unlit at every L/T junction
    // (diamond-exit rule), which reads as a broken corner; filled rectangles close
    // every corner by construction at any DPI / zoom. Road segments grow half the
    // strip width past each endpoint so junctions overlap in a full-width square.
    // Thickness is clamped from below in SCREEN space (updateMarkingWidth): at deep
    // zoom-out a 120 mm strip drops under 1 px and would shatter into dashes — the
    // clamp keeps every strip >= MARK_MIN_PX device-independent pixels thick.
    const MARK_W = 0.12
    this.markings = [] // { mesh, axis, lenAxis, nominal } — thickness grows on `axis`,
                       // and the length grows with it so the end caps always overlap
                       // the crossing strip by a full half-thickness (closed corners)
    const markMat = new THREE.MeshBasicMaterial({ color: 0xffffff })
    const strip = (x0, z0, x1, z1, grow = 0) => {
      const horiz = Math.abs(z1 - z0) < 1e-9
      const nominal = horiz ? Math.abs(x1 - x0) : Math.abs(z1 - z0)
      const len = nominal + 2 * grow
      const mesh = new THREE.Mesh(
        new THREE.PlaneGeometry(horiz ? len : MARK_W, horiz ? MARK_W : len),
        markMat
      )
      mesh.rotation.x = -Math.PI / 2
      mesh.position.set((x0 + x1) / 2, LINE_Y, (z0 + z1) / 2)
      this.markings.push({ mesh, axis: horiz ? 'y' : 'x', lenAxis: horiz ? 'x' : 'y', nominal })
      this.addToScene(mesh)
    }
    for (const [x0, z0, x1, z1] of ROAD) strip(x0, z0, x1, z1, MARK_W / 2)
    // slot outlines: edges also grow half-width past each corner, so every corner
    // is a full overlap square on the OUTSIDE quadrant too (no notch at any zoom)
    const rect = s => {
      strip(s.x0, s.z0, s.x1, s.z0, MARK_W / 2)
      strip(s.x0, s.z1, s.x1, s.z1, MARK_W / 2)
      strip(s.x0, s.z0, s.x0, s.z1, MARK_W / 2)
      strip(s.x1, s.z0, s.x1, s.z1, MARK_W / 2)
    }
    rect(SLOT1)
    rect(SLOT2)
    this.updateMarkingWidth()
  }

  // ---------- cameras ----------
  setupTopCamera() {
    const aspect = window.innerWidth / window.innerHeight
    this.topCam = new THREE.OrthographicCamera(
      (-this.orthoH * aspect) / 2,
      (this.orthoH * aspect) / 2,
      this.orthoH / 2,
      -this.orthoH / 2,
      0.1,
      300
    )
    // straight down, world -Z as screen-up → car front (-Z) points up
    this.topCam.position.set(0, CAM_HEIGHT, 0)
    this.topCam.up.set(0, 0, -1)
    this.topCam.lookAt(0, 0, 0)
  }

  // keep every marking strip at least MARK_MIN_PX screen pixels thick, whatever
  // the zoom level (top view) or orbit distance (free view); 120 mm real width
  // stays the floor when the view is close enough to resolve it
  updateMarkingWidth() {
    if (!this.markings || !this.markings.length) return
    let worldPerPx
    if (this.viewLocked && this.topCam) {
      worldPerPx = (this.topCam.top - this.topCam.bottom) / Math.max(1, window.innerHeight)
    } else if (this.perspCam) {
      const fov = ((this.perspCam.fov || 55) * Math.PI) / 180
      const d = this.perspCam.getWorldPosition(new THREE.Vector3()).distanceTo(this.plate.position)
      worldPerPx = (2 * Math.max(d, 0.001) * Math.tan(fov / 2)) / Math.max(1, window.innerHeight)
    } else return
    const t = Math.max(0.12, 2.5 * worldPerPx)
    for (const m of this.markings) {
      m.mesh.scale[m.axis] = t / 0.12
      m.mesh.scale[m.lenAxis] = (m.nominal + t) / (m.nominal + 0.12)
    }
  }

  applyOrtho() {
    const aspect = window.innerWidth / window.innerHeight
    this.topCam.left = (-this.orthoH * aspect) / 2
    this.topCam.right = (this.orthoH * aspect) / 2
    this.topCam.top = this.orthoH / 2
    this.topCam.bottom = -this.orthoH / 2
    this.topCam.updateProjectionMatrix()
    this.updateMarkingWidth()
  }

  zoomBy(factor) {
    if (this.viewLocked) {
      this.orthoH = Math.min(ORTHO_MAX, Math.max(ORTHO_MIN, this.orthoH / factor))
      this.applyOrtho()
    } else {
      this.sph.r = Math.min(FREE_R_MAX, Math.max(FREE_R_MIN, this.sph.r / factor))
    }
  }

  setViewLocked = locked => {
    this.viewLocked = locked
    if (locked) {
      this.plate.remove(this.perspCam)
      this.camera = this.topCam
    } else {
      // continue orbiting from wherever the camera currently is (no reset to defaults)
      const v = this.perspCam.position
      this.sph.r = Math.min(FREE_R_MAX, Math.max(FREE_R_MIN, v.length()))
      this.sph.theta = Math.atan2(v.x, v.z)
      this.sph.phi = Math.acos(Math.min(1, Math.max(-1, v.y / this.sph.r)))
      this.camera = this.perspCam
      this.plate.add(this.perspCam)
    }
    document.getElementById('btn-view').textContent = locked ? '俯视' : '自由' // v1.5.5: short labels
  }

  setThrottleLocked = locked => {
    this.throttleLocked = locked
    this.cruiseDir = 0
    this.keys.w = false
    this.keys.s = false
    document.getElementById('btn-throttle').textContent = locked ? '油门:A' : '油门:M' // v1.5.5: A=auto(cruise) M=manual
    const slider = document.getElementById('speed-slider')
    const input = document.getElementById('speed-input')
    slider.disabled = input.disabled = false // v1.5.0: slider usable in both modes (touch can set speed anytime)
    // v1.5.0: no dimming — slider is always active
  }

  // touch tap → throttle (locked: toggle cruise; free: short pulse)
  // v1.4.10: pulses now cap at cruiseSpeed (slider) — same limit both modes.
  pressThrottle(dir) {
    if (this.throttleLocked) {
      this.cruiseDir = this.cruiseDir === dir ? 0 : dir
    } else {
      const k = dir === 1 ? 'w' : 's'
      this.keys[k] = true
      this._pulseDir = dir
      this._pulseUntil = performance.now() + 150
      this._launchAt = 0 // single pulse: no ramp inheritance
    }
  }

  // v1.4.10 (#1): screen-angle source that survives broken orientation APIs.
  // Priority: screen.orientation events → resize-based matchMedia probe → 0.
  static getScreenAngle() {
    const so = (typeof screen !== 'undefined') && screen.orientation
    if (so && typeof so.angle === 'number' && !Number.isNaN(so.angle)) return so.angle
    for (const a of [0, 90, 180, 270]) {
      const q = a === 0 ? '(orientation: portrait)' : a === 90 ? '(orientation: landscape) and (min-aspect-ratio: 1/1)'
        : a === 180 ? '(orientation: portrait)' : '(orientation: landscape)'
      if (window.matchMedia && window.matchMedia(q).matches) {
        if (a === 180) return 180
        if (a === 90) return window.innerWidth >= window.innerHeight ? 90 : 270
        if (a === 0) return window.innerWidth >= window.innerHeight ? 90 : 0
      }
    }
    return 0
  }

  // ---------- input ----------
  bindInput() {
    const press = (e, isDown) => {
      // v1.5.4: an input being edited must receive its keys natively
      // (Backspace/arrows/paste were swallowed by preventDefault).
      const ae = document.activeElement
      if (ae && (ae.tagName === 'INPUT' || ae.tagName === 'TEXTAREA' || ae.isContentEditable)) return
      e.preventDefault()
      const { code } = e
      if (this.throttleLocked && (code === 'KeyW' || code === 'KeyS')) {
        if (!isDown) return
        if (code === 'KeyW') this.cruiseDir = this.cruiseDir === 1 ? 0 : 1
        else this.cruiseDir = this.cruiseDir === -1 ? 0 : -1
        return
      }
      switch (code) {
        case 'KeyW': this.keys.w = isDown; break
        case 'KeyA': this.keys.a = isDown; break
        case 'KeyS': this.keys.s = isDown; break
        case 'KeyD': this.keys.d = isDown; break
        case 'Space': this.keys.space = isDown; break
      }
    }
    document.addEventListener('keydown', e => press(e, true))
    document.addEventListener('keyup', e => press(e, false))

    const onHud = e => e.target && e.target.closest && e.target.closest('#hud')

    // mouse wheel zoom (both views)
    window.addEventListener('wheel', e => {
      if (onHud(e)) return
      if (e.ctrlKey) e.preventDefault()
      this.zoomBy(e.deltaY > 0 ? 1 / 1.1 : 1.1)
    }, { passive: false })

    // mouse drag orbit (free view only)
    let dragging = null
    window.addEventListener('mousedown', e => {
      if (e.button !== 0 || onHud(e)) return
      const ae2 = document.activeElement   // v1.5.7: click-away blurs input
      if (ae2 && ae2.id === 'speed-input') ae2.blur()
      dragging = { x: e.clientX, y: e.clientY }
    })
    window.addEventListener('mousemove', e => {
      if (!dragging || this.viewLocked) return
      this.sph.theta -= (e.clientX - dragging.x) * 0.005
      this.sph.phi = Math.min(1.5, Math.max(0.08, this.sph.phi - (e.clientY - dragging.y) * 0.005))
      dragging = { x: e.clientX, y: e.clientY }
    })
    window.addEventListener('mouseup', () => { dragging = null })

    // touch: 1-finger tap = throttle, 2-finger tap = reverse, pinch = zoom,
    // 1-finger drag = orbit (free view)
    let tg = null
    // v1.6.3: activation used to fire ONCE on first touch — if that first
    // touch landed before the (async) game boot finished, or the iOS
    // permission prompt was dismissed, tilt stayed dead forever. Now we
    // re-request on EVERY touch until real sensor data has arrived.
    let tiltDataSeen = false
    const requestTilt = () => {
      if (tiltDataSeen) return
      if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
        DeviceOrientationEvent.requestPermission().catch(() => {})
      }
    }
        // v1.5.0: single-finger gestures split by SCREEN HALF (user spec):
    //   tap LEFT half / hold LEFT half  = S (reverse)   — replaces two-finger
    //   tap RIGHT half / hold RIGHT half = W (forward)  — replaces one-finger
    // Tap = 150 ms pulse (free) / cruise toggle (locked); hold 350 ms =
    // sustained key until lift; drag = orbit (unchanged); double-tap = pause
    // (v1.5.0: double-tap only recognized on the LEFT half, where no
    // forward-throttle action lives, so pausing never costs you a pulse).
    window.addEventListener('touchstart', e => {
      if (onHud(e)) return
      requestTilt()
      const ae1 = document.activeElement
      if (ae1 && ae1.id === 'speed-input') ae1.blur()  // v1.5.7
      e.preventDefault()
      if (e.touches.length === 2) {
        // v1.5.1: pinch-zoom restored (collateral damage of the v1.5.0
        // gesture rewrite). Two fingers = ZOOM, never throttle: cancel any
        // pending hold/tap timers from the first finger going down.
        if (tg) {
          if (tg.holdTimer) { clearTimeout(tg.holdTimer); tg.holdTimer = null }
          if (tg.hold) { this.keys.w = false; this.keys.s = false; this._launchAt = 0 }
          tg = null
        }
        this._lastTapAt = 0
        if (this._tapTimer) { clearTimeout(this._tapTimer); this._tapTimer = null }
        const d0 = Math.hypot(e.touches[0].clientX - e.touches[1].clientX,
                              e.touches[0].clientY - e.touches[1].clientY)
        tg = { type: 'pinch', d0, moved: 0 }
        return
      }
      if (e.touches.length !== 1) return
      const t = e.touches[0]
      const side = t.clientX < innerWidth / 2 ? 'L' : 'R'
      tg = { type: 'one', side, x: t.clientX, y: t.clientY, t0: Date.now(), moved: 0, hold: false, holdTimer: null }
      // v1.4.10 (#4) → v1.5.0: press-and-hold = sustained throttle. After
      // 350 ms unmoved, flip into hold mode (like holding the key down).
      tg.holdTimer = setTimeout(() => {
        if (tg && tg.type === 'one' && !tg.hold && tg.moved < 12) {
          tg.hold = true
          if (this._tapTimer) { clearTimeout(this._tapTimer); this._tapTimer = null }
          if (tg.side === 'L') this.keys.s = true
          else this.keys.w = true
        }
      }, 350)
    }, { passive: false })
    window.addEventListener('touchmove', e => {
      if (!tg || onHud(e)) return
      e.preventDefault()
      if (tg.type === 'pinch' && e.touches.length === 2) {
        const d = Math.hypot(e.touches[0].clientX - e.touches[1].clientX,
                             e.touches[0].clientY - e.touches[1].clientY)
        if (tg.d0 > 0 && d > 0) this.zoomBy(d / tg.d0)
        tg.d0 = d
        return
      }
      if (tg.type === 'one' && e.touches.length === 1) {
        const t = e.touches[0]
        const dx = t.clientX - tg.x
        const dy = t.clientY - tg.y
        tg.moved += Math.abs(dx) + Math.abs(dy)
        if (tg.holdTimer && tg.moved >= 12) { clearTimeout(tg.holdTimer); tg.holdTimer = null }
        if (!this.viewLocked) {
          this.sph.theta -= dx * 0.005
          this.sph.phi = Math.min(1.5, Math.max(0.08, this.sph.phi - dy * 0.005))
        }
        tg.x = t.clientX
        tg.y = t.clientY
      }
    }, { passive: false })
    window.addEventListener('touchend', e => {
      if (!tg) return
      if (e.touches.length !== 0) return
      if (tg.holdTimer) { clearTimeout(tg.holdTimer); tg.holdTimer = null }
      const dt = Date.now() - tg.t0
      if (tg.hold) {
        // sustained hold released — drop the key, no tap action
        this.keys.w = false
        this.keys.s = false
        this._launchAt = 0
        tg = null
        return
      }
      if (dt < 300 && tg.moved < 12) {
        // v1.5.0: double-tap pause now LEFT-half only (a double-tap on the
        // right half would swallow two forward pulses for one pause — bad
        // trade; left is the reverse side, rarely double-tapped by accident).
        if (tg.side === 'L') {
          if (this._lastTapAt && Date.now() - this._lastTapAt < 350) {
            if (this._tapTimer) { clearTimeout(this._tapTimer); this._tapTimer = null }
            this.setPaused(!this.paused)
            this._lastTapAt = 0
          } else {
            this._lastTapAt = Date.now()
            this._tapTimer = setTimeout(() => {
              this._tapTimer = null
              this.pressThrottle(-1)
            }, 350)
          }
        } else {
          // right half: every tap counts — no deferral needed (no double-tap
          // action lives here anymore), fire the forward pulse immediately
          this.pressThrottle(1)
        }
      }
      tg = null
    })

    // device tilt → steering via GRAVITY PROJECTION in SCREEN coordinates
    // (v1.4.5). The old axis pick (landscape ? gamma : beta) was backwards
    // (portrait tilt read the pitch axis; landscape 90°/270° swapped signs)
    // and broke every way a phone can be held. The robust solve: reconstruct
    // the gravity direction in the DEVICE frame from Euler angles, rotate it
    // into SCREEN axes by the screen orientation angle, and take the screen-X
    // (landscape) / screen-Y (portrait) component — steering tilt as the user
    // physically experiences it, exact for all 4 orientations.
    const rotm = (a, b, g) => {
      // R (world ← device) from ZXY intrinsic Euler (W3C deviceorientation)
      const ca = Math.cos(a), sa = Math.sin(a), cb = Math.cos(b), sb = Math.sin(b)
      const cg = Math.cos(g), sg = Math.sin(g)
      return [
        [ca * cg - sa * sb * sg, -sa * cb, ca * sg + sa * sb * cg],
        [sa * cg + ca * sb * sg, ca * cb, sa * sg - ca * sb * cg],
        [-cb * sg, sb, cb * cg]
      ]
    }
    const applyGravity = (gx, gy, gz) => {
      // gravity in DEVICE coords → screen by orientation angle θ (OS angle
      // is CCW, so the screen basis rotates by −θ; verified numerically for
      // 0/90/270: portrait gamma±10 → ±0.333, land90 beta±10 → ±0.333,
      // land270 mirrored, long-axis roll → 0)
      const ang = MainScene.getScreenAngle() * Math.PI / 180
      const cs = Math.cos(ang), sn = Math.sin(ang)
      // STEERING DIP (same metaphor in every orientation): dip the screen's
      // RIGHT edge = steer right, dip LEFT = steer left — like a steering
      // wheel, regardless of portrait/landscape.
      const raw = gx * cs - gy * sn          // gravity along screen-right
      // raw is a unit-vector component (sin of tilt); convert to DEGREES before
      // applying the 3° deadzone / 30° full-lock scaling
      const deg = Math.asin(Math.max(-1, Math.min(1, raw))) * 180 / Math.PI
      // deadzone 3°, then 3°→8° maps onto 0→FULL LOCK (v1.4.7 user spec)
      const a = Math.abs(deg) < 3 ? 0 : (Math.abs(deg) - 3) / 5
      this.tiltSteer = Math.max(0, Math.min(1, a)) * Math.sign(deg)
    }
    // v1.6.3 FIX: some browsers never fire deviceorientation (sensor locked
    // by policy/older webview) but DO fire devicemotion — reconstruct the
    // gravity vector from accelerationIncludingGravity (same math pipeline).
    // deviceorientationabsolute is wired too (same angle convention).
    let motionSeen = false
    window.addEventListener('devicemotion', e => {
      const g = e.accelerationIncludingGravity
      if (!g || g.x === null || g.y === null || g.z === null) return
      motionSeen = true; tiltDataSeen = true
      if (orientationSeen) return          // orientation channel wins when alive
      const n = Math.hypot(g.x, g.y, g.z)
      if (n < 0.1) return
      // devicemotion gravity: phone flat → z≈-9.8 (W3C: z up in screen plane).
      // The orientation math expects down-vector ≈ (0,0,-1) at flat — same
      // sign convention, just normalize.
      applyGravity(-g.x / n, -g.y / n, -g.z / n)
    })
    let orientationSeen = false
    window.addEventListener('deviceorientationabsolute', e => {
      if (e.beta === null && e.gamma === null) return
      orientationSeen = true; tiltDataSeen = true
      const D2R = Math.PI / 180
      const R = rotm((e.alpha ?? 0) * D2R, (e.beta ?? 0) * D2R, (e.gamma ?? 0) * D2R)
      applyGravity(-R[2][0], -R[2][1], -R[2][2])
    })
    window.addEventListener('deviceorientation', e => {
      if (e.beta === null && e.gamma === null) return
      orientationSeen = true; tiltDataSeen = true
      // v1.4.8 FIX: angles are DEGREES; rotm expects (alpha,beta,gamma) RADIANS
      const D2R = Math.PI / 180
      const R = rotm((e.alpha ?? 0) * D2R, (e.beta ?? 0) * D2R, (e.gamma ?? 0) * D2R)
      applyGravity(-R[2][0], -R[2][1], -R[2][2])
    })
  }
  // ---------- lifecycle ----------
  async create() {
    this.warpSpeed('light') // lights only
    this.scene.background = new THREE.Color(0x000000)

    // 1:200 default scale
    this.orthoH = window.innerHeight * PX2M
    // solver hardening (v1.4.1): default 10 iterations let a W launch from
    // parked fold the suspension chain apart. 50 iterations + split impulse
    // keeps the welded assembly intact under launch transients.
    this.physics.physicsWorld.getSolverInfo().set_m_numIterations(50)
    this.physics.physicsWorld.getSolverInfo().set_m_splitImpulse(true)
    this.setupTopCamera()

    // FLAT ground with the grass TEXTURE (v1.4.3): flatness is a PHYSICS
    // property — the collision ground is a perfect plane; this visual plane
    // carries the texture. Never swap the texture for a flat color.
    const grass = await this.load.texture('grass')
    grass.colorSpace = THREE.SRGBColorSpace
    grass.wrapS = grass.wrapT = 1000 // RepeatWrapping
    grass.offset.set(0, 0)
    grass.repeat.set(50, 50)

    let ground = this.physics.add.ground({ width: 500, height: 500, y: 0 }, { phong: { map: grass } })
    ground.body.setFriction(1)
    ground.visible = false // hidden: the grass plane + black pad below replace its look (avoids z-fighting with the pad top)

    // grass plane everywhere (2 cm below the pad top, so no coplanar faces)
    const grassPlane = new THREE.Mesh(
      new THREE.PlaneGeometry(500, 500),
      new THREE.MeshLambertMaterial({ map: grass })
    )
    grassPlane.rotation.x = -Math.PI / 2
    grassPlane.position.set(0, GROUND_TOP() - 0.02, 0)
    this.addToScene(grassPlane)

    this.drawSite()

    if (debug) this.physics.debug?.enable()
    this.physics.debug?.mode(2048 + 4096)

    const wheelX = SPAWN_X + WHEEL_X, wheelZ = WHEEL_Z
    const z = SPAWN_Z

    // blue wheels — order: back right, back left, front right, front left
    const wheelBackRight = this.addWheel(wheelX, z + wheelZ)
    const wheelBackLeft = this.addWheel(SPAWN_X - WHEEL_X, z + wheelZ)
    const wheelFrontRight = this.addWheel(wheelX, z - wheelZ)
    const wheelFrontLeft = this.addWheel(SPAWN_X - WHEEL_X, z - wheelZ)

    // red rotors
    const rotorBackRight = this.addRotor(wheelX, z + wheelZ)
    const rotorBackLeft = this.addRotor(SPAWN_X - WHEEL_X, z + wheelZ)
    const rotorFrontRight = this.addRotor(wheelX, z - wheelZ)
    const rotorFrontLeft = this.addRotor(SPAWN_X - WHEEL_X, z - wheelZ)

    // blue axles
    const axisBackOne = this.addAxis(z + wheelZ, AXIS_R_REAR)
    const axisFrontOne = this.addAxis(z - wheelZ + AXIS_Z, AXIS_R_FRONT)
    const axisFrontTwo = this.addAxis(z - wheelZ - AXIS_Z, AXIS_R_FRONT)

    /**
     * CONSTRAINTS (pivots are scaled from the original example)
     */

    const wheelToRotorConstraint = { axisA: { y: 1 }, axisB: { y: 1 } }
    this.motorBackLeft = this.physics.add.constraints.hinge(wheelBackLeft.body, rotorBackLeft.body, wheelToRotorConstraint)
    this.motorBackRight = this.physics.add.constraints.hinge(wheelBackRight.body, rotorBackRight.body, wheelToRotorConstraint)
    this.motorFrontLeft = this.physics.add.constraints.hinge(wheelFrontLeft.body, rotorFrontLeft.body, wheelToRotorConstraint)
    this.motorFrontRight = this.physics.add.constraints.hinge(wheelFrontRight.body, rotorFrontRight.body, wheelToRotorConstraint)

    // axisToRotor(rotorRight, rotorLeft, axis, pz, pbz): hinge anchors must
    // COINCIDE in world space. The kingpin is at the WHEEL CENTER (v1.4.3 zero
    // trail) — pz = anchor z on the rotor side; pbz compensates the axis beam's
    // own z offset so both beams anchor the same kingpin line (collinear = one
    // effective steering hinge; the second beam is a visual track rod).
    const axisToRotor = (rotorRight, rotorLeft, axis, pz, pbz = 0) => {
      const right = this.physics.add.constraints.hinge(rotorRight.body, axis.body, {
        pivotA: { y: ROTOR_H / 2, z: pz },
        pivotB: { y: -AXIS_LEN / 2, z: pbz },
        axisA: { x: 1 },
        axisB: { x: 1 }
      })
      const left = this.physics.add.constraints.hinge(rotorLeft.body, axis.body, {
        pivotA: { y: -ROTOR_H / 2, z: pz },
        pivotB: { y: AXIS_LEN / 2, z: pbz },
        axisA: { x: 1 },
        axisB: { x: 1 }
      })
      return { right, left }
    }

    // fixed (btFixedConstraint), NOT lock: enable3d's lock() is a zero-limit 6Dof —
    // under the 5-tonne plate + motor torque its iterative solver ratchets apart
    // (rear-left wheel drifted 31 cm out of the body in 30 s on desktop; a phone's
    // slower physics steps ratchet it in seconds, which is exactly the exploded
    // rear-axle / detached rear-left wheel seen on device). btFixedConstraint is rigid.
    // weld(): btFixedConstraint built from the current relative COM transform
    // with collisions between the pair disabled (enable3d's fixed() leaves
    // collisions on, which ratchets under load; lock() is a soft 6Dof).
    const weld = (a, b) => {
      const trA = a.ammo.getCenterOfMassTransform().inverse().op_mul(b.ammo.getWorldTransform())
      const trB = new Ammo.btTransform()
      trB.setIdentity()
      const c = new Ammo.btFixedConstraint(a.ammo, b.ammo, trA, trB)
      this.physics.physicsWorld.addConstraint(c, true)
      return c
    }
    weld(rotorBackRight.body, axisBackOne.body)
    weld(rotorBackLeft.body, axisBackOne.body)

    // kingpin at wheel center (v1.4.3, zero mechanical trail): axisFrontTwo
    // center z = wheelZ + AXIS_Z behind the kingpin line → pbz = +AXIS_Z pulls
    // its anchor back to the kingpin; axisFrontOne sits wheelZ − AXIS_Z ahead →
    // pbz = −AXIS_Z. Both beams co-linear on the kingpin line.
    this.m0 = axisToRotor(rotorFrontRight, rotorFrontLeft, axisFrontTwo, 0, AXIS_Z)
    axisToRotor(rotorFrontRight, rotorFrontLeft, axisFrontOne, 0, -AXIS_Z)

    this.plate = this.addPlate()

    // cameras: free-view default = chase from DEAD BEHIND at 30° depression
    // (v1.5.2 user spec; car nose points -z, so behind = +z). r kept from the
    // old initial (4,3,4.5): sqrt(45.25)=6.727; phi=60° -> 30° below horizon.
    this.camera.position.set(0, 1.741, 6.497) // v1.5.3: free-view default = dead-aft, 15° depression (r=6.727)
    this.perspCam = this.camera
    this.camera = this.topCam
    this.setViewLocked(true)

    weld(this.plate.body, axisBackOne.body)
    weld(this.plate.body, axisFrontTwo.body)

    const limit = 0.3
    // BEAM-LOCAL axes: axisFrontOne is rotateZ(90°)'d so its local x = WORLD
    // vertical and local y = WORLD lateral. enable3d's dof() builds frameA from
    // B's WORLD rotation, so the ORIGINAL limits ({x:0, y:±0.3}) welded the
    // suspension VERTICAL and freed it LATERALLY ±30 cm (launch transients
    // shoved the front beam 3.7 cm left → constant left pull). Swap: free
    // vertical ±0.3 (real suspension travel), lock lateral.
    const dofSettings = {
      angularLowerLimit: { x: 0, y: 0, z: 0 },
      angularUpperLimit: { x: 0, y: 0, z: 0 },
      linearLowerLimit: { x: -limit, y: 0, z: -0.1 },
      linearUpperLimit: { x: limit, y: 0, z: 0.1 }
    }
    this.physics.add.constraints.dof(this.plate.body, axisFrontOne.body, { ...dofSettings, offset: { y: 0.58 } })
    this.physics.add.constraints.dof(this.plate.body, axisFrontOne.body, { ...dofSettings, offset: { y: -0.58 } })

    this.m0.left.enableAngularMotor(true, 0, 1000)
    this.m0.right.enableAngularMotor(true, 0, 1000)

    // collision groups (v1.4.2): wheels hit ONLY the ground and each other;
    // beams/rotors/plate collide with NOTHING. At full lock the wheel disc
    // sweep used to reach x = ±0.500 — exactly the beam end (±0.50) — and the
    // knuckles dead-stopped at 3.1°/16.6° asymmetric. Filtered, they reach
    // the true Ackermann angles (42.25°/30.95°).
    const GROUND = 1, CHASSIS = 2, WHEEL = 4
    const setFilter = (body, group, mask) => {
      const h = body.ammo.getBroadphaseHandle()
      h.set_m_collisionFilterGroup(group)
      h.set_m_collisionFilterMask(mask)
    }
    setFilter(this.plate.body, CHASSIS, 0)
    for (const b of [axisBackOne, axisFrontOne, axisFrontTwo,
                     rotorBackRight, rotorBackLeft, rotorFrontRight, rotorFrontLeft])
      setFilter(b.body, CHASSIS, 0)
    for (const w of [wheelBackRight, wheelBackLeft, wheelFrontRight, wheelFrontLeft])
      setFilter(w.body, WHEEL, GROUND | WHEEL)

    // wheel trails: rear = red, front = green
    this.trails = [
      this.makeTrail(wheelBackRight, 0xff3232),
      this.makeTrail(wheelBackLeft, 0xff3232),
      this.makeTrail(wheelFrontRight, 0x22cc44),
      this.makeTrail(wheelFrontLeft, 0x22cc44)
    ]

    // bodies parked after 2s idle: sideways ammo cylinders jitter-walk on their contact
    // edges forever (the motors keep the island awake), so while parked we zero every
    // body's velocities each frame — the only way the car stays exactly where it was left
    this.allBodies = [
      this.plate.body,
      wheelBackRight.body, wheelBackLeft.body, wheelFrontRight.body, wheelFrontLeft.body,
      rotorBackRight.body, rotorBackLeft.body, rotorFrontRight.body, rotorFrontLeft.body,
      axisBackOne.body, axisFrontOne.body, axisFrontTwo.body
    ]
    this.allMeshes = [
      this.plate,
      wheelBackRight, wheelBackLeft, wheelFrontRight, wheelFrontLeft,
      rotorBackRight, rotorBackLeft, rotorFrontRight, rotorFrontLeft,
      axisBackOne, axisFrontOne, axisFrontTwo
    ]
    this._parked = false
    this._idleSince = 0
    this._zeroV = new Ammo.btVector3(0, 0, 0)

    // spawn poses captured once, after the world has settled: respawnIfLost()
    // teleports every body back to exactly this assembly
    this._spawnPoses = this.allBodies.map((b, i) => {
      const t = b.ammo.getWorldTransform()
      const q = t.getRotation()
      const o = t.getOrigin()
      const tr = new Ammo.btTransform()
      tr.setOrigin(new Ammo.btVector3(o.x(), o.y(), o.z()))
      tr.setRotation(new Ammo.btQuaternion(q.x(), q.y(), q.z(), q.w()))
      return {
        transform: tr,
        position: this.allMeshes[i].position.clone(),
        quaternion: this.allMeshes[i].quaternion.clone()
      }
    })

    // while parked, stop stepping the physics world entirely: sideways ammo cylinders
    // jitter-walk on their contact edges forever (velocity zeroing cannot stop the
    // contact solver's positional correction), and the car is the only dynamic body here
    const physicsAny = this.physics
    if (physicsAny && typeof physicsAny.update === 'function') {
      const origUpdate = physicsAny.update.bind(physicsAny)
      physicsAny.update = t => {
        if (!this._parked) origUpdate(t)
      }
    }

    const slider = document.getElementById('speed-slider')
    const input = document.getElementById('speed-input')
    // v1.5.5: focus clears the field so the user can type a fresh number
    input.addEventListener('focus', () => { input.value = '' })
    // v1.5.7: Enter confirms and blurs (mobile keyboards have no Tab, and the
    // canvas touchstart preventDefault'ed focus-away on touch devices)
    input.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === 'NumpadEnter') {
        e.preventDefault()
        const v = parseFloat(input.value)
        setSpeed(Number.isNaN(v) ? this.cruiseSpeed : v)
        input.blur()
      }
    })
    const setSpeed = (v, fromField) => {
      if (Number.isNaN(v)) v = this.cruiseSpeed
      v = Math.min(5, Math.max(0, v))
      this.cruiseSpeed = v
      slider.value = String(v)
      // v1.5.4: while editing the field, never rewrite it (deleting digits
      // used to snap the value back). Normalize on blur only.
      if (!fromField) input.value = v.toFixed(2)
    }
    slider.addEventListener('input', () => setSpeed(parseFloat(slider.value)))
    input.addEventListener('input', () => setSpeed(parseFloat(input.value), true))
    input.addEventListener('blur', () => setSpeed(this.cruiseSpeed))
    input.addEventListener('change', () => {})

    document.getElementById('btn-view').addEventListener('click', () => this.setViewLocked(!this.viewLocked))
    document.getElementById('btn-throttle').addEventListener('click', () => this.setThrottleLocked(!this.throttleLocked))

    window.addEventListener('resize', () => this.onResize())
    window.addEventListener('orientationchange', () => setTimeout(() => this.onResize(), 60))

    this.bindInput()

    // debug handle for console tinkering / automated tests
    window.carx = this
  }

  // full-view resize (v1.4.5): the enable3d framework calls renderer.setSize
  // exactly ONCE at boot and installs no resize listener — after rotating a
  // phone the canvas kept its portrait dimensions (scene off-center, car out
  // of view). Resize the renderer, its canvas CSS size, and both cameras.
  onResize() {
    const w = window.innerWidth, h = window.innerHeight
    if (this.renderer && this.renderer.setSize) {
      this.renderer.setSize(w, h)
      if (this.renderer.domElement) {
        this.renderer.domElement.style.width = w + 'px'
        this.renderer.domElement.style.height = h + 'px'
      }
    }
    this.applyOrtho()
    if (this.perspCam) {
      this.perspCam.aspect = w / h
      this.perspCam.updateProjectionMatrix()
    }
  }

  parkCar() {
    this._parked = true
    for (const b of this.allBodies) {
      b.ammo.setLinearVelocity(this._zeroV)
      b.ammo.setAngularVelocity(this._zeroV)
    }
  }

  // The physics ground plane is 500×500 m; beyond its edge there is nothing to
  // collide with and the car free-falls forever (seen on device: driving off the
  // pad, the constraint chain gets flung around in free fall). When the chassis
  // falls below the ground or leaves the ground plane, teleport the whole car
  // back to its spawn pose — self-heals within one frame.
  respawnIfLost() {
    const p = this.plate.position
    if (p.y > -0.5 && Math.abs(p.x) < 240 && Math.abs(p.z) < 240) return
    const zero = new THREE.Vector3(0, 0, 0)
    const poses = this._spawnPoses
    this.allBodies.forEach((b, i) => {
      const s = poses[i]
      b.ammo.setWorldTransform(s.transform)
      this.allMeshes[i].position.copy(s.position)
      this.allMeshes[i].quaternion.copy(s.quaternion)
      b.ammo.setLinearVelocity(this._zeroV)
      b.ammo.setAngularVelocity(this._zeroV)
    })
    this.clearTrails()
  }

  // pause (v1.4.5, phone double-tap): freeze physics + motors; trails kept.
  // Resume restores driving. Implemented via the existing parked gate: while
  // paused the physics world is not stepped and update() short-circuits.
  setPaused(p) {
    this.paused = p
    if (p) {
      this._savedKeys = { ...this.keys }
      this.keys.w = this.keys.a = this.keys.s = this.keys.d = this.keys.space = false
      this._savedCruise = this.cruiseDir
      this.cruiseDir = 0
      this.parkCar()
    } else {
      if (this._savedKeys) Object.assign(this.keys, this._savedKeys)
      this.cruiseDir = this._savedCruise ?? 0
      this.unparkCar()
    }
  }

  unparkCar() {
    this._parked = false
    this._idleSince = 0
  }

  update() {
    // paused (v1.4.5): hold the freeze; only the camera keeps tracking.
    if (this.paused) {
      this.updateCamera()
      return
    }
    // out-of-world self-heal before anything else (fell through / left the ground plane)
    this.respawnIfLost()

    // park: after 2s without input, pin every body in place each frame (positions freeze)
    const inputActive =
      this.keys.w || this.keys.a || this.keys.s || this.keys.d || this.keys.space ||
      this.cruiseDir !== 0 || Math.abs(this.tiltSteer) > 0.005
    if (this._parked) {
      if (!inputActive) {
        this.parkCar() // re-zero: gravity re-adds velocity every physics step
        this.updateCamera()
        return
      }
      this.unparkCar()
    } else if (inputActive) {
      this._idleSince = 0
    } else if (!this._idleSince) {
      this._idleSince = Date.now()
    } else if (Date.now() - this._idleSince > 2000) {
      this.parkCar()
    }

    // ---------- chassis pin (v1.4.3 space-hold, v1.4.7 generalized) ----------
    // While throttle is LOCKED, HOLDING Space pins the car. Additionally, with
    // NO throttle active and the car nearly stopped, the chassis is pinned the
    // same way: only the steering bodies (front rotors idx 7/8 + both front
    // beams 10/11) keep angular freedom, so adjusting the wheel direction at a
    // standstill (A/D or tilt) swings the knuckles without shuffling the car.
    // Any drive input (W/S/cruise) releases the pin instantly.
    let dir = 0
    if (this.throttleLocked) dir = this.cruiseDir
    else if (this.keys.w) dir = 1
    else if (this.keys.s) dir = -1
    if (this._pulseUntil && performance.now() > this._pulseUntil) {
      // free-mode tap pulse expired: release the key (v1.4.10 — was a
      // setTimeout before, which leaked through pause/resume)
      if (this._pulseDir === 1) this.keys.w = false
      else if (this._pulseDir === -1) this.keys.s = false
      this._pulseUntil = 0
      this._pulseDir = 0
      dir = 0
    }
    const plateVel0 = this.plate.body.ammo.getLinearVelocity()
    const carSpeed0 = Math.hypot(plateVel0.x(), plateVel0.z())
    this._spaceLock = !!(this.keys.space && this.throttleLocked)
    this._staticPin = dir === 0 && carSpeed0 < 0.05
    if (this._spaceLock || this._staticPin) {
      this.allBodies.forEach((b, i) => {
        b.ammo.setLinearVelocity(this._zeroV)
        if (i !== 7 && i !== 8 && i !== 10 && i !== 11) b.ammo.setAngularVelocity(this._zeroV)
      })
    }

    // switching direction wipes all trails
    if (dir !== 0 && this.driveDir !== 0 && dir !== this.driveDir) this.clearTrails()
    if (dir !== 0) this.driveDir = dir

    // W/S target: cruiseSpeed (slider, user spec v1.4.10) — pulses and holds
    // alike are capped by it; hard ceiling stays 5 m/s. RAMP applies to BOTH
    // W and S now (v1.4.10): reverse used to step in at full target with no
    // ramp, biasing launch (the "reverse pulls hard right-down" report).
    const speed = Math.min(5, this.cruiseSpeed) / WHEEL_R
    const ramp = this._launchAt ? Math.min(1, (performance.now() - this._launchAt) / 600) : 1
    const driveTarget = speed * ramp
    // graded brake (v1.4.3): speed-scaled idle braking (cap 200). The old flat
    // 200 at speed = instant wheel lock → nose-dive rollover on W release.
    const plateVel = this.plate.body.ammo.getLinearVelocity()
    const carSpeed = Math.hypot(plateVel.x(), plateVel.z())
    const idleImpulse = Math.min(200, 20 + carSpeed * 30)

    if (this.throttleLocked) {
      // space-locked: hold wheels stopped; steering stays live on the free bodies
      const vel = this._spaceLock ? 0 : (this.cruiseDir !== 0 ? -this.cruiseDir * (this.cruiseSpeed / WHEEL_R) : 0)
      const impulse = this._spaceLock ? 50 : (this.cruiseDir !== 0 ? 0.25 : idleImpulse)
      this.motorBackLeft.enableAngularMotor(true, vel, impulse)
      this.motorBackRight.enableAngularMotor(true, vel, impulse)
      this.motorFrontLeft.enableAngularMotor(true, vel, impulse)
      this.motorFrontRight.enableAngularMotor(true, vel, impulse)
    } else if (this.keys.w) {
      if (!this._launchAt) this._launchAt = performance.now()
      this.motorBackLeft.enableAngularMotor(true, -driveTarget, 0.25)
      this.motorBackRight.enableAngularMotor(true, -driveTarget, 0.25)
      this.motorFrontLeft.enableAngularMotor(true, -driveTarget, 0.25)
      this.motorFrontRight.enableAngularMotor(true, -driveTarget, 0.25)
    } else if (this.keys.s) {
      if (!this._launchAt) this._launchAt = performance.now()
      this.motorBackLeft.enableAngularMotor(true, driveTarget, 0.25)
      this.motorBackRight.enableAngularMotor(true, driveTarget, 0.25)
      this.motorFrontLeft.enableAngularMotor(true, driveTarget, 0.25)
      this.motorFrontRight.enableAngularMotor(true, driveTarget, 0.25)
    } else {
      this._launchAt = 0
      this.motorBackLeft.enableAngularMotor(true, 0, idleImpulse)
      this.motorBackRight.enableAngularMotor(true, 0, idleImpulse)
      this.motorFrontLeft.enableAngularMotor(true, 0, idleImpulse)
      this.motorFrontRight.enableAngularMotor(true, 0, idleImpulse)
    }

    // steering: keys win, then tilt, then STRAIGHT-LINE ASSIST (v1.4.9).
    // Pulse throttle + contact jitter walk the heading off course a little
    // with every pulse; with no steer intent at all (no keys, tilt inside
    // deadzone) we servo gently back to the heading captured when steering
    // went neutral. Any steer input releases the hold and re-captures on
    // return to neutral, so deliberate turns still end up holding their new
    // heading. Reverse disables it (steer geometry flips; pulses there are
    // momentary anyway).
    const getYaw = () => {
      const q = this.plate.quaternion
      return Math.atan2(2 * (q.w * q.y + q.x * q.z), 1 - 2 * (q.y * q.y + q.x * q.x))
    }
    const wrapPI = a => { a = (a + Math.PI) % (2 * Math.PI); if (a < 0) a += 2 * Math.PI; return a - Math.PI }
    const rolling = carSpeed > 0.05
    const keySteer = this.keys.a ? -1 : this.keys.d ? 1 : 0
    const tiltActive = Math.abs(this.tiltSteer) > 0.005
    let steerIn
    if (keySteer !== 0) { steerIn = keySteer; this._holdYaw = null }
    else if (tiltActive) { steerIn = this.tiltSteer; this._holdYaw = null }
    else if (!rolling || this.driveDir === 0) { steerIn = 0; this._holdYaw = null }
    else {
      if (this._holdYaw === null) this._holdYaw = getYaw()
      const err = wrapPI(this._holdYaw - getYaw())
      // v1.4.10 (#3 user): reverse IS throttle too — same hold, mirrored
      // gain (positive steerIn walks heading the other way in reverse, so
      // flip the sign to converge instead of diverge).
      const gain = this.driveDir === -1 ? 1.8 : -1.8
      steerIn = Math.max(-0.35, Math.min(0.35, gain * err))
    }
    // ACKERMANN (v1.4.4): equal
    const Rrear = Math.sqrt(CAR.minTurnR ** 2 - CAR.wheelbase ** 2) - CAR.track / 2
    const inner = Math.atan(CAR.wheelbase / (Rrear - CAR.track / 2))
    const outer = Math.atan(CAR.wheelbase / (Rrear + CAR.track / 2))
    const targetL = steerIn < 0 ? steerIn * inner : steerIn * outer
    const targetR = steerIn < 0 ? steerIn * outer : steerIn * inner
    this.m0.left.setMotorTarget(targetL, 0.1)
    this.m0.right.setMotorTarget(targetR, 0.1)

    // trails (world-space wheel contact path)
    for (const t of this.trails) this.appendTrail(t, t.wheel.position.x, t.wheel.position.z)

    // camera
    this.updateCamera()
  }

  updateCamera() {
    const p = this.plate.position
    if (this.viewLocked) {
      this.topCam.position.set(p.x, CAM_HEIGHT, p.z)
      this.topCam.lookAt(p.x, 0, p.z)
    } else {
      const c = this.perspCam
      c.position.set(
        this.sph.r * Math.sin(this.sph.phi) * Math.sin(this.sph.theta),
        this.sph.r * Math.cos(this.sph.phi),
        this.sph.r * Math.sin(this.sph.phi) * Math.cos(this.sph.theta)
      )
      c.lookAt(p.x, p.y, p.z)
    }
    this.updateMarkingWidth()
  }
}

// Boot: the single-file build decompresses payloads then calls window.__boot()
// with the ready Ammo factory. Plain builds keep the old Ammo() contract.
if (typeof window.__boot === 'function') {
  window.__boot(Project, MainScene)
} else if (typeof Ammo === 'function') {
  Ammo().then(() => new Project({ scenes: [MainScene], maxSubSteps: 4, fixedTimeStep: 1 / 120 }))
}
