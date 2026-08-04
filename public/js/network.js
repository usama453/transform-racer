export class Network {
  constructor() {
    this.socket = null;
    this.connected = false;
    this.players = new Map(); // id -> latest state
    this.myId = null;
    this.onState = null; // ({state, players}) called when a remote update arrives
    this.onConnected = null;
    this.onDisconnected = null;
    this.lastSent = 0;
    this.sendInterval = 50;
  }

  connect() {
    this.socket = io();

    this.socket.on('connect', () => {
      this.connected = true;
      if (this.onConnected) this.onConnected();
    });

    this.socket.on('disconnect', () => {
      this.connected = false;
      if (this.onDisconnected) this.onDisconnected();
    });

    this.socket.on('init', (data) => {
      this.myId = data.id;
      this.players.clear();
      for (const p of data.players) {
        this.players.set(p.id, { ...p });
      }
    });

    this.socket.on('playerJoined', (p) => {
      this.players.set(p.id, { ...p });
    });

    this.socket.on('playerLeft', ({ id }) => {
      this.players.delete(id);
    });

    this.socket.on('playerRenamed', ({ id, name }) => {
      const p = this.players.get(id);
      if (p) p.name = name;
    });

    this.socket.on('playerTransformed', ({ id, mode }) => {
      const p = this.players.get(id);
      if (p) p.mode = mode;
    });

    this.socket.on('playerUpdate', (d) => {
      const p = this.players.get(d.id);
      if (!p) {
        this.players.set(d.id, { id: d.id, ...d });
        return;
      }
      p.x = d.x; p.y = d.y; p.z = d.z;
      p.yaw = d.yaw; p.pitch = d.pitch; p.roll = d.roll;
      p.mode = d.mode; p.speed = d.speed; p.nitro = d.nitro;
    });

    this.socket.on('chat', (msg) => {
      if (this.onChat) this.onChat(msg);
    });
  }

  sendUpdate(state) {
    const now = performance.now();
    if (now - this.lastSent < this.sendInterval) return;
    this.lastSent = now;
    this.socket.emit('update', {
      x: state.position.x, y: state.position.y, z: state.position.z,
      yaw: state.yaw, pitch: state.pitch, roll: state.roll,
      mode: state.mode, speed: state.speed, nitro: state.nitro
    });
  }

  sendName(name) {
    this.socket.emit('setName', name);
  }

  sendTransform(mode) {
    this.socket.emit('transform', { mode });
  }

  sendChat(text) {
    this.socket.emit('chat', text);
  }
}
