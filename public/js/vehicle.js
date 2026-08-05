import * as THREE from 'three';

export const GROUND_Y = 0;
export const CAR_BODY_Y = 1.0;
export const PLANE_GROUND_Y = CAR_BODY_Y + 0.4;
export const WORLD_RADIUS = 9000;

const CAR_ENGINE = 32;
const CAR_REVERSE_FORCE = 13;
const CAR_MAX_SPEED = 85;
const CAR_NITRO_FORCE = 60;
const CAR_MAX_NITRO_SPEED = 130;
const CAR_OVERBOOST_FORCE = 100;
const CAR_MAX_OVERBOOST_SPEED = 165;
const CAR_DRAG = 0.015;
const CAR_ROLLING = 0.04;
const CAR_SOFT_FADE = 0.75;
const CAR_SOFT_TERM = 1.25;
const CAR_SOFT_TAIL = 3.5;
const CAR_TURN = 2.4;
const CAR_DRIFT_TURN = 3.6;
const CAR_GRIP = 5.5;
const CAR_DRIFT_GRIP = 0.5;
const CAR_BANK_MAX = 0.55;
const CAR_BRAKE_DECEL = 34;
const CAR_HANDBRAKE_DECEL = 16;
const CAR_TURN_DRAG = 0.12;
const CAR_DIVE_PITCH = -0.35;
const CAR_BOUNCE_REST = 0.18;

const OVERBOOST_DURATION = 2.5;

const PLANE_BASE_SPEED = 180;
const PLANE_BOOST_SPEED = 230;
const PLANE_OVERBOOST_SPEED = 290;
const PLANE_ACCEL = 30;
const PLANE_BRAKE_DECEL = 60;
const PLANE_VY_RATE = 8;
const PLANE_SPEED_RATE = 1.6;
const PLANE_GRAVITY = 42;
const PLANE_BOUNCE_MIN = 6.5;
const PLANE_BOUNCE_REST = 0.32;
const PLANE_BOUNCE_DAMP = 0.65;
const PLANE_PITCH_RATE = 0.5;
const PLANE_ROLL_MAX = 1.1;
const PLANE_ROLL_RESPONSE = 5.0;
const PLANE_BANK_TURN = 1.2;
const PLANE_YAW_INPUT_RATE = 1.0;
const PLANE_TURN_DRAG = 0.1;
const PLANE_MAX_PITCH = 1.2;
const TAKEOFF_SPEED = 40;

export class Vehicle {
  constructor(x = 0, z = 0) {
    this.mode = 'car';
    this.position = new THREE.Vector3(x, CAR_BODY_Y, z);
    this.velocity = new THREE.Vector3();
    this.yaw = 0;
    this.pitch = 0;
    this.roll = 0;
    this.nitro = 100;
    this.transforming = false;
    this.nextMode = 'car';
    this.transformProgress = 1;
    this.speed = 0;
    this.usingNitro = false;
    this.drifting = false;
    this.overboost = false;
    this.overboostTimer = 0;
    this.carFalling = false;
    this.onBounce = null;
    this.speedPreserveTimer = 0;

    this.health = 3;
    this.maxHealth = 3;
    this.invulnerable = false;
    this.invulnTimer = 0;
    this.shootCooldown = 0;
    this.shootRate = 0.25;

    this._e = new THREE.Euler(0, 0, 0, 'YXZ');
    this._q = new THREE.Quaternion();
    this._fwd = new THREE.Vector3();
    this._right = new THREE.Vector3();
    this._up = new THREE.Vector3();
  }

  get boostFrac() {
    return Math.max(0, Math.min(1, this.overboostTimer / OVERBOOST_DURATION));
  }

  activateOverboost() {
    this.overboost = true;
    this.overboostTimer = OVERBOOST_DURATION;
  }

  get forward() {
    this._e.set(this.pitch, this.yaw, this.roll);
    this._q.setFromEuler(this._e);
    return this._fwd.set(0, 0, -1).applyQuaternion(this._q);
  }

  transform() {
    if (this.transforming) return;
    this.transforming = true;
    this.transformProgress = 0;
    this.nextMode = this.mode === 'car' ? 'plane' : 'car';
  }

  applyCarInertia() {
    // keep the plane's horizontal momentum when converting to a car
    const horiz = Math.hypot(this.velocity.x, this.velocity.z);
    if (horiz > 4) {
      this.yaw = Math.atan2(-this.velocity.x, -this.velocity.z);
    }
    // if high up, the car free-falls to the ground instead of teleporting
    this.carFalling = this.position.y > CAR_BODY_Y + 0.1;
  }

  update(input, dt) {
    if (dt > 0.05) dt = 0.05;

    if (this.transforming) {
      this.transformProgress = Math.min(1, this.transformProgress + dt * 2.4);
      if (this.transformProgress >= 1) {
        const prevMode = this.mode;
        this.transforming = false;
        this.mode = this.nextMode;
        if (this.mode === 'car') {
          this.applyCarInertia();
        } else {
          // car→plane: carry the car's speed over, but the plane is faster,
          // so it never drops below a fast floor and immediately accelerates
          // up to its (higher) top speed
          if (prevMode === 'car') {
            this.speed = Math.hypot(this.velocity.x, this.velocity.z) + 80;
            this.speedPreserveTimer = 0.3;
          }
          if (this.onTransformToPlane) this.onTransformToPlane();
        }
      }
    }

    if (this.mode === 'car') {
      this.updateCar(input, dt);
      this.speed = this.velocity.length();
    } else {
      this.updatePlane(input, dt);
    }

    if (this.overboost) {
      this.overboostTimer -= dt;
      if (this.overboostTimer <= 0) this.overboost = false;
    }

    this.nitro = 100;

    if (this.invulnerable) {
      this.invulnTimer -= dt;
      if (this.invulnTimer <= 0) this.invulnerable = false;
    }
    if (this.shootCooldown > 0) this.shootCooldown -= dt;

    this.enforceBounds(dt);
  }

  updateCar(input, dt) {
    const fwd = this.forward;

    const throttle = input.throttle;
    let force = 0;
    if (throttle > 0) force += CAR_ENGINE * throttle;
    else if (throttle < 0) force += CAR_REVERSE_FORCE * throttle;

    this.usingNitro = false;
    if (input.nitro && throttle >= 0) {
      force += this.overboost ? CAR_OVERBOOST_FORCE : CAR_NITRO_FORCE;
      this.usingNitro = true;
    }

    const fwdSpeed = this.velocity.dot(fwd);

    const drifting = input.handbrake && Math.abs(fwdSpeed) > 3;
    this.drifting = drifting;
    const braking = throttle < 0 && fwdSpeed > 0.5;

    // steering
    const steerInput = input.steer;
    const steerFactor = Math.min(1, Math.abs(fwdSpeed) / 22);
    const dir = fwdSpeed >= 0 ? 1 : -1;
    const turnRate = (drifting ? CAR_DRIFT_TURN : CAR_TURN) * steerFactor * steerInput * dir;
    this.yaw -= turnRate * dt;

    if (this.carFalling) {
      // airborne: no grip/rolling damp, just light air drag on the horizontal
      this.velocity.x *= 1 - CAR_DRAG * dt;
      this.velocity.z *= 1 - CAR_DRAG * dt;
    } else {
      // steer by rotating the velocity toward the car's facing direction.
      // rotation preserves magnitude, so turning never slows the car down.
      const gripK = drifting ? CAR_DRIFT_GRIP : CAR_GRIP;
      const speed = Math.hypot(this.velocity.x, this.velocity.z);
      if (speed > 0.05) {
        let diff = Math.atan2(fwd.x, fwd.z) - Math.atan2(this.velocity.x, this.velocity.z);
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        const newAngle = Math.atan2(this.velocity.x, this.velocity.z) + diff * (1 - Math.exp(-gripK * dt));
        this.velocity.x = Math.sin(newAngle) * speed;
        this.velocity.z = Math.cos(newAngle) * speed;
      }
    }

    // longitudinal force along the (now aligned) facing direction:
    // engine / brake / drag, so acceleration is unaffected by steering
    const curSpeed = Math.hypot(this.velocity.x, this.velocity.z);
    const maxSpeed = this.overboost
      ? CAR_MAX_OVERBOOST_SPEED
      : (this.usingNitro ? CAR_MAX_NITRO_SPEED : CAR_MAX_SPEED);
    if (force > 0 && curSpeed > maxSpeed * CAR_SOFT_FADE) {
      force = this._softTop(force, curSpeed, maxSpeed);
    }

    let fwdForce = force;
    if (braking) {
      fwdForce -= Math.abs(throttle) * CAR_BRAKE_DECEL * Math.sign(fwdSpeed);
    } else if (input.handbrake) {
      // handbrake: scrub speed along the facing but leave enough to keep sliding
      fwdForce -= Math.min(curSpeed, CAR_HANDBRAKE_DECEL) * Math.sign(fwdSpeed);
    }
    if (!this.usingNitro) {
      fwdForce -= curSpeed * (CAR_DRAG + CAR_ROLLING);
    }
    fwdForce -= curSpeed * Math.abs(steerInput) * CAR_TURN_DRAG;
    this.velocity.x += fwd.x * fwdForce * dt;
    this.velocity.z += fwd.z * fwdForce * dt;

    if (this.carFalling) {
      // accelerating free-fall from a transform (gravity builds downward speed)
      this.velocity.y -= PLANE_GRAVITY * dt;
      this.position.y += this.velocity.y * dt;
      if (this.position.y <= CAR_BODY_Y) {
        this.position.y = CAR_BODY_Y;
        if (this.velocity.y < -PLANE_BOUNCE_MIN) {
          this.velocity.y = -this.velocity.y * CAR_BOUNCE_REST;
          this.velocity.x *= PLANE_BOUNCE_DAMP;
          this.velocity.z *= PLANE_BOUNCE_DAMP;
        } else {
          this.velocity.y = 0;
        }
        if (this.onBounce) this.onBounce(this.velocity.y);
        this.carFalling = false;
      }
    } else {
      // car stays glued to the ground
      this.velocity.y = 0;
      this.position.y = CAR_BODY_Y;
    }

    this.position.x += this.velocity.x * dt;
    this.position.z += this.velocity.z * dt;

    // visual banking
    if (this.carFalling) {
      // dive nose-down while falling
      this.roll = this._lerpAngle(this.roll, 0, 1 - Math.exp(-dt * 3));
      this.pitch = this._lerpAngle(this.pitch, CAR_DIVE_PITCH, 1 - Math.exp(-dt * 2.5));
    } else {
      const targetRoll = -steerInput * steerFactor * CAR_BANK_MAX * (drifting ? 1.6 : 1);
      this.roll = this._lerpAngle(this.roll, targetRoll, 1 - Math.exp(-dt * 6));
      this.pitch = this._lerpAngle(this.pitch, 0, 1 - Math.exp(-dt * 4));
    }
  }

  updatePlane(input, dt) {
    const grounded = this.position.y <= PLANE_GROUND_Y;
    this.drifting = false;

    const rawThrottle = input.throttle;
    const braking = input.handbrake;
    let pitchInput = rawThrottle;
    const rollInput = input.steer;
    const yawInput = input.yaw;

    this.usingNitro = false;
    let targetSpeed = PLANE_BOOST_SPEED;
    if (input.nitro) {
      targetSpeed = this.overboost ? PLANE_OVERBOOST_SPEED : PLANE_BOOST_SPEED;
      this.usingNitro = true;
    }

    // can't pull up until fast enough to take off
    if (grounded && this.speed < TAKEOFF_SPEED && pitchInput > 0) {
      pitchInput = 0;
    }

    // on the ground: the plane auto-accelerates down the runway (brake to hold)
    if (grounded) {
      const spoolTarget = braking ? 15 : PLANE_BOOST_SPEED;
      targetSpeed = Math.min(targetSpeed, spoolTarget);
      if (this.speed < 20) {
        this.pitch = this._lerpAngle(this.pitch, 0, 1 - Math.exp(-dt * 2.5));
        this.roll = this._lerpAngle(this.roll, 0, 1 - Math.exp(-dt * 1.5));
      }
    }

    const pitchRate = PLANE_PITCH_RATE * pitchInput;
    const targetRoll = -rollInput * PLANE_ROLL_MAX;
    this.roll += (targetRoll - this.roll) * (1 - Math.exp(-dt * PLANE_ROLL_RESPONSE));
    const bankedYaw = (this.roll / PLANE_ROLL_MAX) * PLANE_BANK_TURN;
    const yawRate = yawInput * PLANE_YAW_INPUT_RATE + bankedYaw;
    this.yaw += yawRate * dt;
    this.pitch = this._clamp(this.pitch + pitchRate * dt, -PLANE_MAX_PITCH, PLANE_MAX_PITCH);

    if (this.speedPreserveTimer > 0) {
      this.speedPreserveTimer -= dt;
    } else if (grounded) {
      // runway spool: accelerate up to takeoff speed, brake below
      this.speed = this._lerp(this.speed, targetSpeed, 1 - Math.exp(-dt * PLANE_SPEED_RATE));
    } else if (braking) {
      // airborne brake: decelerate, but never below zero
      this.speed = Math.max(0, this.speed - PLANE_BRAKE_DECEL * dt);
    } else {
      // airborne: no speed cap — keeps accelerating every frame
      this.speed += PLANE_ACCEL * dt;
      // slight speed bleed from turning
      this.speed = Math.max(0, this.speed - this.speed * (Math.abs(rollInput) + Math.abs(yawInput)) * PLANE_TURN_DRAG * dt);
    }

    const fwd = this.forward;
    this.velocity.x = fwd.x * this.speed;
    this.velocity.z = fwd.z * this.speed;

    if (grounded) {
      // pitch-up lifts the plane off; nose-down stays clamped to the floor
      const thrustY = fwd.y * this.speed;
      this.velocity.y = Math.max(0, this._lerp(this.velocity.y, thrustY, 1 - Math.exp(-dt * PLANE_VY_RATE)));
    } else {
      // airborne: no gravity — plane follows nose direction
      this.velocity.y = this._lerp(this.velocity.y, fwd.y * this.speed, 1 - Math.exp(-dt * PLANE_VY_RATE));
    }

    this.position.addScaledVector(this.velocity, dt);

    if (this.position.y < PLANE_GROUND_Y) {
      this.position.y = PLANE_GROUND_Y;
      if (this.velocity.y < -PLANE_BOUNCE_MIN) {
        this.velocity.y = -this.velocity.y * PLANE_BOUNCE_REST;
        this.velocity.x *= PLANE_BOUNCE_DAMP;
        this.velocity.z *= PLANE_BOUNCE_DAMP;
        this.pitch = Math.max(this.pitch, 0.18);
        if (this.onBounce) this.onBounce(this.velocity.y);
      } else {
        this.velocity.y = 0;
      }
    }
  }

  takeDamage() {
    if (this.invulnerable) return false;
    this.health--;
    this.invulnerable = true;
    this.invulnTimer = 2.0;
    if (this.health <= 0) {
      this.respawn();
      return true;
    }
    return false;
  }

  respawn() {
    const angle = Math.random() * Math.PI * 2;
    const radius = 80 + Math.random() * 160;
    this.position.set(Math.cos(angle) * radius, CAR_BODY_Y, Math.sin(angle) * radius);
    this.velocity.set(0, 0, 0);
    this.yaw = Math.atan2(-Math.sin(angle), -Math.cos(angle));
    this.pitch = 0;
    this.roll = 0;
    this.health = this.maxHealth;
    this.invulnerable = true;
    this.invulnTimer = 3.0;
    if (this.mode !== 'car') {
      this.mode = 'car';
      this.transforming = false;
    }
    this.carFalling = false;
    this.nitro = 100;
  }

  canShoot() {
    return this.shootCooldown <= 0;
  }

  shoot() {
    if (!this.canShoot()) return false;
    this.shootCooldown = this.shootRate;
    return true;
  }

  enforceBounds(dt) {
    const dx = this.position.x;
    const dz = this.position.z;
    const dist = Math.sqrt(dx * dx + dz * dz);
    if (dist > WORLD_RADIUS) {
      const scale = WORLD_RADIUS / dist;
      this.position.x = dx * scale;
      this.position.z = dz * scale;
      this.velocity.multiplyScalar(0.4);
    }
  }

  _lerp(a, b, t) {
    return a + (b - a) * t;
  }

  _softTop(force, v, maxSpeed) {
    const D = CAR_DRAG + CAR_ROLLING;
    const low = maxSpeed * CAR_SOFT_FADE;
    if (v <= maxSpeed) {
      // fade from full power down to a small tail that keeps creeping
      const k = Math.min(1, (v - low) / (maxSpeed - low));
      const s = k * k * (3 - 2 * k);
      const tail = Math.min(force, D * maxSpeed + CAR_SOFT_TAIL);
      return force + (tail - force) * s;
    }
    const top = maxSpeed * CAR_SOFT_TERM;
    const frac = Math.min(1, (v - maxSpeed) / (top - maxSpeed));
    return Math.min(force, D * v + CAR_SOFT_TAIL * (1 - frac));
  }

  _clamp(v, lo, hi) {
    return Math.max(lo, Math.min(hi, v));
  }

  _lerpAngle(a, b, t) {
    let diff = b - a;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    return a + diff * t;
  }
}
