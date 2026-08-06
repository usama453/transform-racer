export class Network {
  constructor() {
    this.socket = null;
    this.onTagTransferred = null;
    this.connected = false;
    this.players = new Map();
    this.myId = null;
    this.onState = null;
    this.onConnected = null;
    this.onDisconnected = null;
    this.onHit = null;
    this.onKill = null;
    this.onProjectile = null;
    this.onProjectileRemove = null;
    this.onPlayerRespawned = null;
    this.onBreak = null;
    this.onPlayerPushed = null;
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
      if (d.health !== undefined) p.health = d.health;
    });

    this.socket.on('chat', (msg) => {
      if (this.onChat) this.onChat(msg);
    });

    this.socket.on('hit', (data) => {
      if (this.onHit) this.onHit(data);
    });

    this.socket.on('kill', (data) => {
      if (this.onKill) this.onKill(data);
    });

    this.socket.on('projectile', (data) => {
      if (this.onProjectile) this.onProjectile(data);
    });

    this.socket.on('projectileRemove', (data) => {
      if (this.onProjectileRemove) this.onProjectileRemove(data);
    });

    this.socket.on('playerRespawned', (data) => {
      const p = this.players.get(data.id);
      if (p) {
        p.x = data.x;
        p.y = data.y;
        p.z = data.z;
        p.yaw = data.yaw;
        p.health = 3;
        p.mode = 'car';
      }
      if (this.onPlayerRespawned) this.onPlayerRespawned(data);
    });

    this.socket.on('break', (data) => {
      if (this.onBreak) this.onBreak(data);
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

  sendShoot(x, y, z, dx, dy, dz, targetId) {
    this.socket.emit('shoot', { x, y, z, dx, dy, dz, targetId });
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

  sendBreak(idx) {
    this.socket.emit('break', { idx });
  }

  sendHitPlayer(targetId, pushX, pushZ, speed) {
    this.socket.emit('hitPlayer', { targetId, pushX, pushZ, speed });
  }

  sendTagTransfer(newItId) {
    this.socket.emit('tagTransfer', { newItId });
  }
}
