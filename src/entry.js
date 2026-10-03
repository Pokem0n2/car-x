// car-x — Car using only physics constraints
// Based on the enable3d example "car-using-physics-constraints"
// https://github.com/enable3d/enable3d.github.io/blob/master/src/examples/car-using-physics-constraints.html
//
// Single-file offline build (tools/build.mjs inlines ammo.js + this bundle).
// v1.1.0 changes:
// - no HUD info text; pure black flat ground (no grass texture)
// - view lock: orthographic top-down camera, car heading up, world-fixed (default);
//   unlock restores the original chase camera
// - white parking-slot rectangle framing the car footprint at spawn
// - throttle lock + cruise speed (0~1.00 m/s) with slider & number input
// - wheel trails: front wheels blue, rear wheels red; full clear on direction flip

import { Project, Scene3D, THREE } from './enable3d.framework.0.26.0_dev0.module.min.js'

var transparent = true
var debug = true

const WHEEL_RADIUS = 0.5
const WHEEL_X = 1.5
const WHEEL_Z = 2
// exact car footprint (wheels outermost)
const PARK_W = 2 * WHEEL_X + 0.35 // 3.35
const PARK_L = 2 * (WHEEL_Z + WHEEL_RADIUS) // 5.0

// add.ground() is a 1-unit-thick box centered at y → its walkable surface is at +0.5
const GROUND_TOP = 0.5
const TRAIL_Y = GROUND_TOP + 0.02
const TRAIL_MAX = 6000
const CAM_HEIGHT = 30
const ORTHO_VIEW_H = 18

class MainScene extends Scene3D {
  keys = {
    w: false,
    a: false,
    s: false,
    d: false,
    space: false
  }

  // view: orthographic top-down, world-fixed
  viewLocked = true
  // throttle: one W/S press drives at cruiseSpeed until toggled
  throttleLocked = false
  cruiseDir = 0 // 0 idle, 1 forward, -1 backward
  cruiseSpeed = 0.3 // m/s
  driveDir = 0 // direction of the currently drawn trails

  addToScene(obj) {
    const root = this.scene && this.scene.isScene ? this.scene : this
    THREE.Object3D.prototype.add.call(root, obj)
  }

  preload() {}

  addPlate() {
    const plate = this.add.box(
      { y: 1, width: 1.8, depth: 4.7, mass: 5000, height: 0.25 },
      { lambert: { wireframe: true } }
    )
    this.physics.add.existing(plate)
    return plate
  }

  addAxis(z, radius = 0.06) {
    const axis = this.add.cylinder(
      { z, y: 1, mass: 10, radiusTop: radius, radiusBottom: radius, height: 2.6 },
      { lambert: { color: 'blue', transparent, opacity: 0.5 } }
    )
    axis.rotateZ(Math.PI / 2)
    this.physics.add.existing(axis)
    return axis
  }

  addRotor(x, z) {
    const rotor = this.add.cylinder(
      { mass: 10, radiusBottom: 0.35, radiusTop: 0.35, radiusSegments: 24, height: 0.4, x, y: 1, z },
      { lambert: { color: 'red', transparent, opacity: 0.5 } }
    )

    rotor.rotateZ(Math.PI / 2)
    this.physics.add.existing(rotor)
    return rotor
  }

  addWheel(x, z) {
    const wheel = this.add.cylinder(
      { mass: 20, radiusBottom: 0.5, radiusTop: 0.5, radiusSegments: 24, height: 0.35, x, y: 1, z },
      { lambert: { color: 'blue', transparent, opacity: 0.5 } }
    )

    wheel.rotateZ(Math.PI / 2)
    this.physics.add.existing(wheel)
    wheel.body.setFriction(3)
    return wheel
  }

  addAxisRotor(x, y, z) {
    const axisRotor = this.add.box(
      { x, y, z, mass: 5, width: 0.25, height: 0.2, depth: 1 },
      { lambert: { transparent, opacity: 0.5 } }
    )
    this.physics.add.existing(axisRotor)
    return axisRotor
  }

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
      if (dx * dx + dz * dz < 1e-4) return // < 1 cm since last sample
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

  addParkingSlot() {
    const hw = PARK_W / 2
    const hl = PARK_L / 2
    const rect = new THREE.LineLoop(
      new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(-hw, TRAIL_Y, -hl),
        new THREE.Vector3(hw, TRAIL_Y, -hl),
        new THREE.Vector3(hw, TRAIL_Y, hl),
        new THREE.Vector3(-hw, TRAIL_Y, hl)
      ]),
      new THREE.LineBasicMaterial({ color: 0xffffff })
    )
    rect.frustumCulled = false
    this.addToScene(rect)
  }

  setupTopCamera() {
    const aspect = window.innerWidth / window.innerHeight
    this.topCam = new THREE.OrthographicCamera(
      (-ORTHO_VIEW_H * aspect) / 2,
      (ORTHO_VIEW_H * aspect) / 2,
      ORTHO_VIEW_H / 2,
      -ORTHO_VIEW_H / 2,
      0.1,
      200
    )
    // looking straight down with world -Z as screen-up: car front (-Z) points up
    this.topCam.position.set(0, CAM_HEIGHT, 0)
    this.topCam.up.set(0, 0, -1)
    this.topCam.lookAt(0, 0, 0)

    window.addEventListener('resize', () => {
      const a = window.innerWidth / window.innerHeight
      this.topCam.left = (-ORTHO_VIEW_H * a) / 2
      this.topCam.right = (ORTHO_VIEW_H * a) / 2
      this.topCam.updateProjectionMatrix()
    })
  }

  setViewLocked = locked => {
    this.viewLocked = locked
    if (locked) {
      this.plate.remove(this.perspCam)
      this.camera = this.topCam
    } else {
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

  async create() {
    this.warpSpeed('light') // lights only: no sky/fog/grid/orbitControls/default camera
    this.scene.background = new THREE.Color(0x000000)

    let ground = this.physics.add.ground(
      { width: 500, height: 500, y: 0 },
      { lambert: { color: 0x000000 } }
    )
    ground.body.setFriction(1)

    if (debug) this.physics.debug?.enable()
    this.physics.debug?.mode(2048 + 4096)

    this.addParkingSlot()

    const wheelX = 1.5,
      wheelZ = 2,
      axisZ = 0.2

    // blue wheels — order: back right, back left, front right, front left
    const wheelBackRight = this.addWheel(wheelX, wheelZ)
    const wheelBackLeft = this.addWheel(-wheelX, wheelZ)
    const wheelFrontRight = this.addWheel(wheelX, -wheelZ) // right front
    const wheelFrontLeft = this.addWheel(-wheelX, -wheelZ)

    // red rotors
    const rotorBackRight = this.addRotor(wheelX, wheelZ)
    const rotorBackLeft = this.addRotor(-wheelX, wheelZ)
    const rotorFrontRight = this.addRotor(wheelX, -wheelZ)
    const rotorFrontLeft = this.addRotor(-wheelX, -wheelZ)

    // blue axis
    const axisBackOne = this.addAxis(wheelZ) // the one at the back
    const axisFrontOne = this.addAxis(-wheelZ + axisZ, 0.04)
    const axisFrontTwo = this.addAxis(-wheelZ - axisZ)

    /**
     * CONSTRAINTS
     */

    // constraint wheel to rotor
    const wheelToRotorConstraint = { axisA: { y: 1 }, axisB: { y: 1 } }
    this.motorBackLeft = this.physics.add.constraints.hinge(
      wheelBackLeft.body,
      rotorBackLeft.body,
      wheelToRotorConstraint
    )
    this.motorBackRight = this.physics.add.constraints.hinge(
      wheelBackRight.body,
      rotorBackRight.body,
      wheelToRotorConstraint
    )
    this.motorFrontLeft = this.physics.add.constraints.hinge(
      wheelFrontLeft.body,
      rotorFrontLeft.body,
      wheelToRotorConstraint
    )
    this.motorFrontRight = this.physics.add.constraints.hinge(
      wheelFrontRight.body,
      rotorFrontRight.body,
      wheelToRotorConstraint
    )

    // constraint axis to rotor
    const axisToRotor = (rotorRight, rotorLeft, axis, z) => {
      const right = this.physics.add.constraints.hinge(rotorRight.body, axis.body, {
        pivotA: { y: 0.2, z: z },
        pivotB: { y: -1.3 },
        axisA: { x: 1 },
        axisB: { x: 1 }
      })
      const left = this.physics.add.constraints.hinge(rotorLeft.body, axis.body, {
        pivotA: { y: -0.2, z: z },
        pivotB: { y: 1.3 },
        axisA: { x: 1 },
        axisB: { x: 1 }
      })
      return { right, left }
    }

    this.physics.add.constraints.lock(rotorBackRight.body, axisBackOne.body)
    this.physics.add.constraints.lock(rotorBackLeft.body, axisBackOne.body)

    this.m0 = axisToRotor(rotorFrontRight, rotorFrontLeft, axisFrontTwo, -0)
    axisToRotor(rotorFrontRight, rotorFrontLeft, axisFrontOne, 0.4)

    this.plate = this.addPlate()

    // cameras: keep the original chase camera for the unlocked view,
    // default to the locked orthographic top-down view
    this.camera.position.set(10, 10, 10)
    this.perspCam = this.camera
    this.setupTopCamera()
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
    this.physics.add.constraints.dof(this.plate.body, axisFrontOne.body, { ...dofSettings, offset: { y: 0.9 } })
    this.physics.add.constraints.dof(this.plate.body, axisFrontOne.body, { ...dofSettings, offset: { y: -0.9 } })

    this.m0.left.enableAngularMotor(true, 0, 1000)
    this.m0.right.enableAngularMotor(true, 0, 1000)

    // wheel trails: rear = red, front = blue
    this.trails = [
      this.makeTrail(wheelBackRight, 0xff3232),
      this.makeTrail(wheelBackLeft, 0xff3232),
      this.makeTrail(wheelFrontRight, 0x3aa0ff),
      this.makeTrail(wheelFrontLeft, 0x3aa0ff)
    ]

    const press = (e, isDown) => {
      e.preventDefault()
      const { code } = e
      // throttle lock: a single W/S press toggles cruise direction
      if (this.throttleLocked && (code === 'KeyW' || code === 'KeyS')) {
        if (!isDown) return
        if (code === 'KeyW') this.cruiseDir = this.cruiseDir === 1 ? 0 : 1
        else this.cruiseDir = this.cruiseDir === -1 ? 0 : -1
        return
      }
      switch (code) {
        case 'KeyW':
          this.keys.w = isDown
          break
        case 'KeyA':
          this.keys.a = isDown
          break
        case 'KeyS':
          this.keys.s = isDown
          break
        case 'KeyD':
          this.keys.d = isDown
          break
        case 'Space':
          this.keys.space = isDown
          break
      }
    }

    document.addEventListener('keydown', e => press(e, true))
    document.addEventListener('keyup', e => press(e, false))

    // UI wiring
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

    // debug handle for console tinkering / automated tests
    window.carx = this
  }

  update() {
    // effective driving direction
    let dir = 0
    if (this.throttleLocked) dir = this.cruiseDir
    else if (this.keys.w) dir = 1
    else if (this.keys.s) dir = -1

    // switching direction wipes all trails
    if (dir !== 0 && this.driveDir !== 0 && dir !== this.driveDir) this.clearTrails()
    if (dir !== 0) this.driveDir = dir

    const speed = 40

    if (this.throttleLocked) {
      // cruise at the configured speed (m/s) → hinge motor rad/s
      const vel = this.cruiseDir !== 0 ? -this.cruiseDir * (this.cruiseSpeed / WHEEL_RADIUS) : 0
      const impulse = this.cruiseDir !== 0 ? 0.25 : 0.05
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
      this.motorBackLeft.enableAngularMotor(true, 0, 0.05)
      this.motorBackRight.enableAngularMotor(true, 0, 0.05)
      this.motorFrontLeft.enableAngularMotor(true, 0, 0.05)
      this.motorFrontRight.enableAngularMotor(true, 0, 0.05)
    }

    const maxAngle = 0.4

    if (this.keys.a) {
      this.m0.left.setMotorTarget(-maxAngle, 0.5)
      this.m0.right.setMotorTarget(-maxAngle, 0.5)
    } else if (this.keys.d) {
      this.m0.left.setMotorTarget(maxAngle, 0.5)
      this.m0.right.setMotorTarget(maxAngle, 0.5)
    } else {
      this.m0.left.setMotorTarget(0, 0.5)
      this.m0.right.setMotorTarget(0, 0.5)
    }

    // trails (world-space wheel contact path)
    for (const t of this.trails) this.appendTrail(t, t.wheel.position.x, t.wheel.position.z)

    // camera
    if (this.viewLocked) {
      const p = this.plate.position
      this.topCam.position.set(p.x, CAM_HEIGHT, p.z)
      this.topCam.lookAt(p.x, 0, p.z)
    } else {
      this.camera.lookAt(this.plate.position.clone())
    }
  }
}

// ammo.js is inlined as a plain <script> before this bundle runs,
// so Ammo() is available as a global — same contract PhysicsLoader provides.
Ammo().then(() => new Project({ scenes: [MainScene], maxSubSteps: 4, fixedTimeStep: 1 / 120 }))
