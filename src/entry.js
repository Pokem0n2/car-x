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
// - site layout: inverted-T three-way road + two parking slots (5300×2400 mm)

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
const MAX_STEER = Math.atan(CAR.wheelbase / CAR.minTurnR) // ≈ 0.4726 rad

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
// Inverted-T three-way junction, all markings are lines only:
//   A (-7.5,0)-(-1.5,0) 6000   B (-1.5,0)-(-1.5,-6) 6000
//   C ( 1.5,0)-( 1.5,-6) 6000  D ( 1.5,0)-( 7.5,0) 6000
//   E (-7.5,3)-( 7.5,3) 15000  (A/D and E are 3000 apart vertically, B/C 3000 horizontally)
const SPAWN_Z = -3.0                                             // center of the main slot
const SLOT1 = { x0: -1.2, x1: 1.2, z0: -5.65, z1: -0.35 }        // 纵向 2400×5300
const SLOT2 = { x0: -7.5, x1: -2.2, z0: 0.3, z1: 2.7 }           // 横向 5300×2400
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
  throttleLocked = false
  cruiseDir = 0
  cruiseSpeed = 0.3
  driveDir = 0
  tiltSteer = 0
  #tiltRequested = false
  orthoH = 40 // set to the 1:200 default in create()
  sph = { r: 8, theta: 0.785, phi: 0.95 } // free-view orbit (around plate, plate-local)

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
      { x: 0, y: PLATE_Y, z: SPAWN_Z, width: PLATE_W, depth: CAR.length, height: 0.25, mass: 5000 },
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
      { z, y: SPAWN_Y, mass: 10, radiusTop: radius, radiusBottom: radius, height: AXIS_LEN },
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

    // inverted-T three-way road + south edge (lines only, no collision)
    const pts = []
    for (const [x0, z0, x1, z1] of ROAD) {
      pts.push(new THREE.Vector3(x0, LINE_Y, z0), new THREE.Vector3(x1, LINE_Y, z1))
    }
    const roadLines = new THREE.LineSegments(
      new THREE.BufferGeometry().setFromPoints(pts),
      new THREE.LineBasicMaterial({ color: 0xffffff })
    )
    roadLines.frustumCulled = false
    this.addToScene(roadLines)

    const rect = (s, color = 0xffffff) => {
      const c = new THREE.LineLoop(
        new THREE.BufferGeometry().setFromPoints([
          new THREE.Vector3(s.x0, LINE_Y, s.z0),
          new THREE.Vector3(s.x1, LINE_Y, s.z0),
          new THREE.Vector3(s.x1, LINE_Y, s.z1),
          new THREE.Vector3(s.x0, LINE_Y, s.z1)
        ]),
        new THREE.LineBasicMaterial({ color })
      )
      c.frustumCulled = false
      this.addToScene(c)
    }
    rect(SLOT1)
    rect(SLOT2)
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

  applyOrtho() {
    const aspect = window.innerWidth / window.innerHeight
    this.topCam.left = (-this.orthoH * aspect) / 2
    this.topCam.right = (this.orthoH * aspect) / 2
    this.topCam.top = this.orthoH / 2
    this.topCam.bottom = -this.orthoH / 2
    this.topCam.updateProjectionMatrix()
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
    document.getElementById('btn-view').textContent = locked ? '视角:俯视锁定' : '视角:自由视角'
  }

  setThrottleLocked = locked => {
    this.throttleLocked = locked
    this.cruiseDir = 0
    this.keys.w = false
    this.keys.s = false
    document.getElementById('btn-throttle').textContent = locked ? '油门:已锁定' : '油门:未锁定'
    const slider = document.getElementById('speed-slider')
    const input = document.getElementById('speed-input')
    slider.disabled = input.disabled = !locked
    document.getElementById('speed-row').classList.toggle('disabled', !locked)
  }

  // touch tap → throttle (locked: toggle cruise; free: short pulse)
  pressThrottle(dir) {
    if (this.throttleLocked) {
      this.cruiseDir = this.cruiseDir === dir ? 0 : dir
    } else {
      const k = dir === 1 ? 'w' : 's'
      this.keys[k] = true
      setTimeout(() => { this.keys[k] = false }, 150)
    }
  }

  // ---------- input ----------
  bindInput() {
    const press = (e, isDown) => {
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
    const requestTilt = () => {
      if (this.#tiltRequested) return
      this.#tiltRequested = true
      if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
        DeviceOrientationEvent.requestPermission().catch(() => {})
      }
    }
    window.addEventListener('touchstart', e => {
      if (onHud(e)) return
      requestTilt()
      e.preventDefault()
      if (e.touches.length === 1) {
        tg = { type: 'one', x: e.touches[0].clientX, y: e.touches[0].clientY, t0: Date.now(), moved: 0 }
      } else if (e.touches.length === 2) {
        if (!this.viewLocked) this.keys.s = true
        const dx = e.touches[0].clientX - e.touches[1].clientX
        const dy = e.touches[0].clientY - e.touches[1].clientY
        tg = { type: 'two', t0: Date.now(), dist0: Math.hypot(dx, dy), lastDist: Math.hypot(dx, dy), zoomed: false }
      }
    }, { passive: false })
    window.addEventListener('touchmove', e => {
      if (!tg || onHud(e)) return
      e.preventDefault()
      if (tg.type === 'one' && e.touches.length === 1) {
        const t = e.touches[0]
        const dx = t.clientX - tg.x
        const dy = t.clientY - tg.y
        tg.moved += Math.abs(dx) + Math.abs(dy)
        if (!this.viewLocked) {
          this.sph.theta -= dx * 0.005
          this.sph.phi = Math.min(1.5, Math.max(0.08, this.sph.phi - dy * 0.005))
        }
        tg.x = t.clientX
        tg.y = t.clientY
      } else if (tg.type === 'two' && e.touches.length === 2) {
        const d = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY)
        if (!tg.zoomed && Math.abs(d - tg.dist0) > 24) {
          tg.zoomed = true
          if (!this.viewLocked) this.keys.s = false // it became a pinch, not reverse
        }
        if (tg.zoomed && tg.lastDist > 0) this.zoomBy(d / tg.lastDist)
        tg.lastDist = d
      }
    }, { passive: false })
    window.addEventListener('touchend', e => {
      if (!tg) return
      if (e.touches.length === 0) {
        const dt = Date.now() - tg.t0
        if (tg.type === 'one' && dt < 300 && tg.moved < 12) this.pressThrottle(1)
        if (tg.type === 'two' && !tg.zoomed && dt < 500 && this.throttleLocked) this.cruiseDir = this.cruiseDir === -1 ? 0 : -1
        if (tg.type === 'two' && !this.viewLocked) this.keys.s = false
        tg = null
      } else if (tg.type === 'two' && e.touches.length === 1) {
        if (!this.viewLocked) this.keys.s = false
        tg = null
      }
    })

    // device tilt → steering (landscape: gamma, portrait: beta; 3° deadzone, 30° = full lock)
    window.addEventListener('deviceorientation', e => {
      const landscape = Math.abs((screen.orientation && screen.orientation.angle) || 0) === 90
      const raw = landscape ? (e.gamma ?? 0) : (e.beta ?? 0)
      const a = Math.abs(raw) < 3 ? 0 : raw
      this.tiltSteer = Math.max(-1, Math.min(1, a / 30))
    })
  }

  // ---------- lifecycle ----------
  async create() {
    this.warpSpeed('light') // lights only
    this.scene.background = new THREE.Color(0x000000)

    // 1:200 default scale
    this.orthoH = window.innerHeight * PX2M
    this.setupTopCamera()

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

    const wheelX = WHEEL_X, wheelZ = WHEEL_Z
    const z = SPAWN_Z

    // blue wheels — order: back right, back left, front right, front left
    const wheelBackRight = this.addWheel(wheelX, z + wheelZ)
    const wheelBackLeft = this.addWheel(-wheelX, z + wheelZ)
    const wheelFrontRight = this.addWheel(wheelX, z - wheelZ)
    const wheelFrontLeft = this.addWheel(-wheelX, z - wheelZ)

    // red rotors
    const rotorBackRight = this.addRotor(wheelX, z + wheelZ)
    const rotorBackLeft = this.addRotor(-wheelX, z + wheelZ)
    const rotorFrontRight = this.addRotor(wheelX, z - wheelZ)
    const rotorFrontLeft = this.addRotor(-wheelX, z - wheelZ)

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

    const axisToRotor = (rotorRight, rotorLeft, axis, pz) => {
      const right = this.physics.add.constraints.hinge(rotorRight.body, axis.body, {
        pivotA: { y: ROTOR_H / 2, z: pz },
        pivotB: { y: -AXIS_LEN / 2 },
        axisA: { x: 1 },
        axisB: { x: 1 }
      })
      const left = this.physics.add.constraints.hinge(rotorLeft.body, axis.body, {
        pivotA: { y: -ROTOR_H / 2, z: pz },
        pivotB: { y: AXIS_LEN / 2 },
        axisA: { x: 1 },
        axisB: { x: 1 }
      })
      return { right, left }
    }

    // lock/dof derive their anchors from the bodies' current poses — no explicit pivots
    this.physics.add.constraints.lock(rotorBackRight.body, axisBackOne.body)
    this.physics.add.constraints.lock(rotorBackLeft.body, axisBackOne.body)

    this.m0 = axisToRotor(rotorFrontRight, rotorFrontLeft, axisFrontTwo, -AXIS_Z)
    axisToRotor(rotorFrontRight, rotorFrontLeft, axisFrontOne, AXIS_Z)

    this.plate = this.addPlate()

    // cameras: original chase camera for the free view, ortho top-down default
    this.camera.position.set(4, 3, 4.5)
    this.perspCam = this.camera
    this.camera = this.topCam
    this.setViewLocked(true)

    this.physics.add.constraints.lock(this.plate.body, axisBackOne.body)
    this.physics.add.constraints.lock(this.plate.body, axisFrontTwo.body)

    const limit = 0.3
    const dofSettings = {
      angularLowerLimit: { x: 0, y: 0, z: 0 },
      angularUpperLimit: { x: 0, y: 0, z: 0 },
      linearLowerLimit: { x: 0, y: -limit, z: -0.1 },
      linearUpperLimit: { x: 0, y: limit, z: 0.1 }
    }
    this.physics.add.constraints.dof(this.plate.body, axisFrontOne.body, { ...dofSettings, offset: { y: 0.58 } })
    this.physics.add.constraints.dof(this.plate.body, axisFrontOne.body, { ...dofSettings, offset: { y: -0.58 } })

    this.m0.left.enableAngularMotor(true, 0, 1000)
    this.m0.right.enableAngularMotor(true, 0, 1000)

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
    this._parked = false
    this._idleSince = 0
    this._zeroV = new Ammo.btVector3(0, 0, 0)

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
    const setSpeed = v => {
      if (Number.isNaN(v)) v = this.cruiseSpeed
      v = Math.min(1, Math.max(0, v))
      this.cruiseSpeed = v
      slider.value = String(v)
      input.value = v.toFixed(2)
    }
    slider.addEventListener('input', () => setSpeed(parseFloat(slider.value)))
    input.addEventListener('input', () => setSpeed(parseFloat(input.value)))
    input.addEventListener('change', () => setSpeed(parseFloat(input.value)))

    document.getElementById('btn-view').addEventListener('click', () => this.setViewLocked(!this.viewLocked))
    document.getElementById('btn-throttle').addEventListener('click', () => this.setThrottleLocked(!this.throttleLocked))

    window.addEventListener('resize', () => this.applyOrtho())

    this.bindInput()

    // debug handle for console tinkering / automated tests
    window.carx = this
  }

  parkCar() {
    this._parked = true
    for (const b of this.allBodies) {
      b.ammo.setLinearVelocity(this._zeroV)
      b.ammo.setAngularVelocity(this._zeroV)
    }
  }

  unparkCar() {
    this._parked = false
    this._idleSince = 0
  }

  update() {
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

    // effective driving direction
    let dir = 0
    if (this.throttleLocked) dir = this.cruiseDir
    else if (this.keys.w) dir = 1
    else if (this.keys.s) dir = -1

    // switching direction wipes all trails
    if (dir !== 0 && this.driveDir !== 0 && dir !== this.driveDir) this.clearTrails()
    if (dir !== 0) this.driveDir = dir

    const speed = 40
    // strong idle brake: the undamped dof suspension keeps micro-oscillating, and a weak
    // brake (the original 0.05) lets that noise ratchet the wheels into a steady creep
    const idleImpulse = 200

    if (this.throttleLocked) {
      const vel = this.cruiseDir !== 0 ? -this.cruiseDir * (this.cruiseSpeed / WHEEL_R) : 0
      const impulse = this.cruiseDir !== 0 ? 0.25 : idleImpulse
      this.motorBackLeft.enableAngularMotor(true, vel, impulse)
      this.motorBackRight.enableAngularMotor(true, vel, impulse)
      this.motorFrontLeft.enableAngularMotor(true, vel, impulse)
      this.motorFrontRight.enableAngularMotor(true, vel, impulse)
    } else if (this.keys.w) {
      this.motorBackLeft.enableAngularMotor(true, -speed, 0.25)
      this.motorBackRight.enableAngularMotor(true, -speed, 0.25)
      this.motorFrontLeft.enableAngularMotor(true, -speed, 0.25)
      this.motorFrontRight.enableAngularMotor(true, -speed, 0.25)
    } else if (this.keys.s) {
      this.motorBackLeft.enableAngularMotor(true, speed, 0.25)
      this.motorBackRight.enableAngularMotor(true, speed, 0.25)
      this.motorFrontLeft.enableAngularMotor(true, speed, 0.25)
      this.motorFrontRight.enableAngularMotor(true, speed, 0.25)
    } else {
      this.motorBackLeft.enableAngularMotor(true, 0, idleImpulse)
      this.motorBackRight.enableAngularMotor(true, 0, idleImpulse)
      this.motorFrontLeft.enableAngularMotor(true, 0, idleImpulse)
      this.motorFrontRight.enableAngularMotor(true, 0, idleImpulse)
    }

    // steering: keys win, otherwise device tilt; capped by the min turning radius
    const steerIn = this.keys.a ? -1 : this.keys.d ? 1 : this.tiltSteer
    const steerTarget = steerIn * MAX_STEER
    this.m0.left.setMotorTarget(steerTarget, 0.5)
    this.m0.right.setMotorTarget(steerTarget, 0.5)

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
  }
}

// ammo.js is inlined as a plain <script> before this bundle runs,
// so Ammo() is available as a global — same contract PhysicsLoader provides.
Ammo().then(() => new Project({ scenes: [MainScene], maxSubSteps: 4, fixedTimeStep: 1 / 120 }))
