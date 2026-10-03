// car-x — Car using only physics constraints
// Based on the enable3d example "car-using-physics-constraints"
// https://github.com/enable3d/enable3d.github.io/blob/master/src/examples/car-using-physics-constraints.html
//
// Adapted for a single-file offline build:
// - ammo.js (asm.js) and the enable3d framework are bundled inline by tools/build.mjs
// - the grass texture is inlined as a data URL
// - PhysicsLoader() is replaced by a direct Ammo() call (ammo is already loaded)

import { Project, Scene3D, THREE } from './enable3d.framework.0.26.0_dev0.module.min.js'
import grassUrl from './grass-small.jpg'

var transparent = true
var debug = true

class MainScene extends Scene3D {
  keys = {
    w: false,
    a: false,
    s: false,
    d: false,
    space: false
  }

  preload() {
    this.load.preload('grass', grassUrl)
  }

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

  async create() {
    this.warpSpeed('-ground')

    const grass = await this.load.texture('grass')
    grass.colorSpace = THREE.SRGBColorSpace
    grass.wrapS = grass.wrapT = 1000 // RepeatWrapping
    grass.offset.set(0, 0)
    grass.repeat.set(50, 50)

    let ground = this.physics.add.ground({ width: 500, height: 500, y: 0 }, { phong: { map: grass } })
    ground.body.setFriction(1)

    if (debug) this.physics.debug?.enable()
    this.physics.debug?.mode(2048 + 4096)

    this.camera.position.set(10, 10, 10)

    const wheelX = 1.5,
      wheelZ = 2,
      axisZ = 0.2

    // blue wheels
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
    this.plate.add(this.camera)
    this.camera.lookAt(this.plate.position.clone())
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

    const press = (e, isDown) => {
      e.preventDefault()
      const { code } = e
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

    // debug handle for console tinkering / automated tests
    window.carx = this
  }

  update() {
    this.camera.lookAt(this.plate.position.clone())

    const speed = 40

    if (this.keys.w) {
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
  }
}

// ammo.js is inlined as a plain <script> before this bundle runs,
// so Ammo() is available as a global — same contract PhysicsLoader provides.
Ammo().then(() => new Project({ scenes: [MainScene], maxSubSteps: 4, fixedTimeStep: 1 / 120 }))
