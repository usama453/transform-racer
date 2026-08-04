export class Input {
  constructor() {
    this.keys = new Set();
    this.cameraView = 'chase';
    this.onTransform = null;
    this.onChatOpen = null;
    this.onCameraToggle = null;
    this.onDoubleShift = null;
    this.lastShiftDown = 0;
    this._shiftArmed = false;

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
  }

  chatActive() {
    const ci = document.getElementById('chat-input');
    return ci && ci.classList.contains('active');
  }

  get throttle() {
    // car: forward/back, plane: pitch
    const w = this.keys.has('w') ? 1 : 0;
    const s = this.keys.has('s') ? 1 : 0;
    return w - s;
  }

  get steer() {
    const a = this.keys.has('a') ? 1 : 0;
    const d = this.keys.has('d') ? 1 : 0;
    return d - a;
  }

  get yaw() {
    const q = this.keys.has('q') ? 1 : 0;
    const e = this.keys.has('e') ? 1 : 0;
    return e - q;
  }

  get nitro() {
    return this.keys.has('shift');
  }

  get handbrake() {
    return this.keys.has(' ');
  }
}
