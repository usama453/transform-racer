export class Input {
  constructor() {
    this.keys = new Set();
    this.cameraView = 'chase';
    this.onTransform = null;
    this.onChatOpen = null;
    this.onCameraToggle = null;
    this.onDoubleShift = null;
    this.onShoot = null;
    this.joined = false;
    this.lastShiftDown = 0;
    this._shiftArmed = false;

    // Mobile detection
    this.isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)
      || ('ontouchstart' in window && navigator.maxTouchPoints > 0);
    this.isTablet = /iPad|Android(?!.*Mobile)/i.test(navigator.userAgent);

    // Touch input state
    this._touchThrottle = 0;
    this._touchSteer = 0;
    this._touchYaw = 0;
    this._touchNitro = false;
    this._touchHandbrake = false;
    this._touchShoot = false;

    // Gyroscope state
    this._gyroEnabled = false;
    this._gyroYaw = 0;
    this._gyroPitch = 0;
    this._gyroAlpha = null;
    this._gyroBeta = null;
    this._gyroGamma = null;

    // Keyboard listeners
    window.addEventListener('keydown', (e) => {
      if (e.repeat) return;
      const k = e.key.toLowerCase();
      const chat = this.chatActive();
      if (chat) return;

      if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' '].includes(k)) {
        e.preventDefault();
      }
      this.keys.add(k);
      if (k === 'f') {
        if (this.onTransform) this.onTransform();
      }
      if (k === 'c') {
        if (this.onCameraToggle) this.onCameraToggle();
      }
      if (k === 'm') {
        if (this.onMute) this.onMute();
      }
      if (k === 'enter' && this.onChatOpen) {
        this.onChatOpen();
      }
      if (k === 'shift') {
        const now = performance.now();
        if (this._shiftArmed && now - this.lastShiftDown < 400) {
          if (this.onDoubleShift) this.onDoubleShift();
        }
        this.lastShiftDown = now;
        this._shiftArmed = true;
      }
    });

    window.addEventListener('keyup', (e) => {
      this.keys.delete(e.key.toLowerCase());
    });

    window.addEventListener('blur', () => this.keys.clear());

    if (!this.isMobile) {
      window.addEventListener('mousedown', (e) => {
        if (e.button === 0 && this.joined && this.onShoot) this.onShoot();
      });
    }

    // Mobile setup
    if (this.isMobile) {
      this._setupTouchControls();
      this._setupGyroscope();
    }
  }

  chatActive() {
    const ci = document.getElementById('chat-input');
    return ci && ci.classList.contains('active');
  }

  // ---- Touch controls ----
  _setupTouchControls() {
    const hud = document.getElementById('hud');
    if (!hud) return;

    // Create mobile controls container
    const mobileUI = document.createElement('div');
    mobileUI.id = 'mobile-controls';
    mobileUI.innerHTML = `
      <div id="touch-left" class="touch-zone">
        <div id="joystick-base">
          <div id="joystick-knob"></div>
        </div>
      </div>
      <div id="touch-right" class="touch-zone">
        <button id="btn-shoot" class="touch-btn btn-action btn-shoot">FIRE</button>
        <button id="btn-nitro" class="touch-btn btn-action">NOS</button>
        <button id="btn-drift" class="touch-btn btn-action">DRIFT</button>
        <button id="btn-transform" class="touch-btn btn-transform">F</button>
        <button id="btn-camera" class="touch-btn btn-small">C</button>
      </div>
      <div id="touch-top">
        <button id="btn-yaw-left" class="touch-btn btn-yaw">Q</button>
        <button id="btn-yaw-right" class="touch-btn btn-yaw">E</button>
      </div>
    `;
    hud.appendChild(mobileUI);

    // Joystick setup
    const base = document.getElementById('joystick-base');
    const knob = document.getElementById('joystick-knob');
    let joystickTouch = null;
    const baseRect = () => base.getBoundingClientRect();
    const maxDist = 40;

    base.addEventListener('touchstart', (e) => {
      e.preventDefault();
      joystickTouch = e.changedTouches[0];
    }, { passive: false });

    base.addEventListener('touchmove', (e) => {
      e.preventDefault();
      if (!joystickTouch) return;
      for (const t of e.changedTouches) {
        if (t.identifier === joystickTouch.identifier) {
          const rect = baseRect();
          const cx = rect.left + rect.width / 2;
          const cy = rect.top + rect.height / 2;
          let dx = t.clientX - cx;
          let dy = t.clientY - cy;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist > maxDist) {
            dx = dx / dist * maxDist;
            dy = dy / dist * maxDist;
          }
          knob.style.transform = `translate(${dx}px, ${dy}px)`;
          this._touchSteer = dx / maxDist;
          this._touchThrottle = -dy / maxDist;
        }
      }
    }, { passive: false });

    const joystickEnd = (e) => {
      for (const t of e.changedTouches) {
        if (joystickTouch && t.identifier === joystickTouch.identifier) {
          joystickTouch = null;
          knob.style.transform = 'translate(0, 0)';
          this._touchSteer = 0;
          this._touchThrottle = 0;
        }
      }
    };
    base.addEventListener('touchend', joystickEnd, { passive: false });
    base.addEventListener('touchcancel', joystickEnd, { passive: false });

    // Button setup
    const btnNitro = document.getElementById('btn-nitro');
    const btnDrift = document.getElementById('btn-drift');
    const btnTransform = document.getElementById('btn-transform');
    const btnCamera = document.getElementById('btn-camera');
    const btnShoot = document.getElementById('btn-shoot');
    const btnYawL = document.getElementById('btn-yaw-left');
    const btnYawR = document.getElementById('btn-yaw-right');

    const hold = (el, onDown, onUp) => {
      el.addEventListener('touchstart', (e) => { e.preventDefault(); onDown(); }, { passive: false });
      el.addEventListener('touchend', (e) => { e.preventDefault(); onUp(); }, { passive: false });
      el.addEventListener('touchcancel', (e) => { e.preventDefault(); onUp(); }, { passive: false });
    };

    hold(btnNitro, () => { this._touchNitro = true; }, () => { this._touchNitro = false; });
    hold(btnDrift, () => { this._touchHandbrake = true; }, () => { this._touchHandbrake = false; });
    hold(btnYawL, () => { this._touchYaw = -1; }, () => { if (this._touchYaw === -1) this._touchYaw = 0; });
    hold(btnYawR, () => { this._touchYaw = 1; }, () => { if (this._touchYaw === 1) this._touchYaw = 0; });

    btnTransform.addEventListener('touchstart', (e) => {
      e.preventDefault();
      if (this.onTransform) this.onTransform();
    }, { passive: false });

    btnCamera.addEventListener('touchstart', (e) => {
      e.preventDefault();
      if (this.onCameraToggle) this.onCameraToggle();
    }, { passive: false });

    btnShoot.addEventListener('touchstart', (e) => {
      e.preventDefault();
      if (this.onShoot) this.onShoot();
    }, { passive: false });
  }

  // ---- Gyroscope ----
  _setupGyroscope() {
    if (typeof DeviceOrientationEvent !== 'undefined' &&
        typeof DeviceOrientationEvent.requestPermission === 'function') {
      // iOS 13+ requires permission
      document.addEventListener('click', () => {
        DeviceOrientationEvent.requestPermission().then(state => {
          if (state === 'granted') this._enableGyro();
        }).catch(() => {});
      }, { once: true });
    } else if ('DeviceOrientationEvent' in window) {
      this._enableGyro();
    }
  }

  _enableGyro() {
    this._gyroEnabled = true;
    window.addEventListener('deviceorientation', (e) => {
      // beta = front/back tilt (-180..180), gamma = left/right tilt (-90..90)
      const beta = e.beta || 0;   // pitch: phone flat = 0, tilted up = 90
      const gamma = e.gamma || 0; // roll: flat = 0, tilted right = 90

      // Map gamma (-45..45) to steer (-1..1)
      this._gyroYaw = Math.max(-1, Math.min(1, gamma / 45));

      // Map beta (20..70) to throttle (0..1), below 20 = brake
      if (beta < 15) {
        this._gyroPitch = -1;
      } else if (beta > 70) {
        this._gyroPitch = 1;
      } else {
        this._gyroPitch = (beta - 15) / 55;
      }
    });
  }

  // ---- Input getters ----
  get throttle() {
    const w = this.keys.has('w') ? 1 : 0;
    const s = this.keys.has('s') ? 1 : 0;
    const kb = w - s;
    if (this.isMobile) {
      const joy = this._touchThrottle;
      const gyro = this._gyroPitch;
      // joystick wins when engaged; gyro only kicks in when the joystick is
      // centered, so a flat phone can't fight the joystick or block W/S
      const v = Math.abs(joy) > 0.1 ? joy : (Math.abs(gyro) > 0.1 ? gyro : kb);
      return Math.max(-1, Math.min(1, v));
    }
    return kb;
  }

  get steer() {
    const a = this.keys.has('a') ? 1 : 0;
    const d = this.keys.has('d') ? 1 : 0;
    const kb = d - a;
    if (this.isMobile) {
      const joy = this._touchSteer;
      const gyro = this._gyroYaw;
      const v = Math.abs(joy) > 0.1 ? joy : (Math.abs(gyro) > 0.1 ? gyro : kb);
      return Math.max(-1, Math.min(1, v));
    }
    return kb;
  }

  get yaw() {
    const q = this.keys.has('q') ? 1 : 0;
    const e = this.keys.has('e') ? 1 : 0;
    const kb = e - q;
    if (this.isMobile) {
      return this._touchYaw || kb;
    }
    return kb;
  }

  get nitro() {
    if (this.isMobile) return this._touchNitro;
    return this.keys.has('shift');
  }

  get handbrake() {
    if (this.isMobile) return this._touchHandbrake;
    return this.keys.has(' ');
  }
}
