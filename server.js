const path = require('path');
const http = require('http');
const express = require('express');
const { Server } = require('socket.io');

const PORT = process.env.PORT || 3000;

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, 'public')));
app.use('/lib', express.static(path.join(__dirname, 'node_modules/three/build')));
app.use('/libsio', express.static(path.join(__dirname, 'node_modules/socket.io/client-dist')));

const WORLD_RADIUS = 9000;

const MISSILE_SPEED = 55;
const MISSILE_TURN = 2.6;
const MISSILE_LIFE = 3.0;
const MISSILE_LOCK_RANGE = 900;

const COLORS = [
  '#ff4d4d', '#4dff88', '#4dc3ff', '#ffd84d',
  '#ff7be0', '#a86bff', '#ff9a4d', '#4dffea',
  '#ffffff', '#ff4d88'
];

const players = new Map();
let colorIdx = 0;

const projectiles = [];
let projectileId = 0;

function spawnPoint() {
  const angle = Math.random() * Math.PI * 2;
  const radius = 80 + Math.random() * 160;
  return {
    x: Math.cos(angle) * radius,
    y: 1,
    z: Math.sin(angle) * radius,
    yaw: Math.atan2(-Math.sin(angle), -Math.cos(angle))
  };
}

function sanitizeFloat(v, min, max, fallback) {
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

function createPlayer(socket) {
  const spawn = spawnPoint();
  const color = COLORS[colorIdx % COLORS.length];
  colorIdx++;
  const player = {
    id: socket.id,
    name: 'Player' + Math.floor(1000 + Math.random() * 9000),
    color,
    x: spawn.x,
    y: spawn.y,
    z: spawn.z,
    yaw: spawn.yaw,
    pitch: 0,
    roll: 0,
    mode: 'car',
    speed: 0,
    nitro: 100,
    health: 3,
    lastUpdate: 0,
    lastShot: 0
  };
  return player;
}

function slerpDir(cur, desired, turnRate, dt) {
  const dot = Math.max(-1, Math.min(1, cur.x * desired.x + cur.y * desired.y + cur.z * desired.z));
  const omega = Math.acos(dot);
  if (omega < 1e-4) return desired;
  const t = Math.min(1, (turnRate * dt) / omega);
  const sinO = Math.sin(omega);
  const s0 = Math.sin((1 - t) * omega) / sinO;
  const s1 = Math.sin(t * omega) / sinO;
  return {
    x: cur.x * s0 + desired.x * s1,
    y: cur.y * s0 + desired.y * s1,
    z: cur.z * s0 + desired.z * s1
  };
}

function updateProjectiles(dt) {
  for (let i = projectiles.length - 1; i >= 0; i--) {
    const p = projectiles[i];
    p.life -= dt;
    if (p.life <= 0) {
      io.emit('projectileRemove', { id: p.id });
      projectiles.splice(i, 1);
      continue;
    }

    if (p.targetId) {
      const t = players.get(p.targetId);
      if (t && t.health > 0) {
        const ddx = t.x - p.x;
        const ddy = t.y - p.y;
        const ddz = t.z - p.z;
        const dlen = Math.sqrt(ddx * ddx + ddy * ddy + ddz * ddz) || 1;
        const desired = { x: ddx / dlen, y: ddy / dlen, z: ddz / dlen };
        const vlen = Math.sqrt(p.vx * p.vx + p.vy * p.vy + p.vz * p.vz) || 1;
        const cur = { x: p.vx / vlen, y: p.vy / vlen, z: p.vz / vlen };
        const dir = slerpDir(cur, desired, MISSILE_TURN, dt);
        p.vx = dir.x * MISSILE_SPEED;
        p.vy = dir.y * MISSILE_SPEED;
        p.vz = dir.z * MISSILE_SPEED;
      }
    }

    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.z += p.vz * dt;

    for (const [id, player] of players) {
      if (id === p.owner) continue;
      if (player.health <= 0) continue;
      const dx = p.x - player.x;
      const dy = p.y - player.y;
      const dz = p.z - player.z;
      const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (dist < 4.0) {
        const killed = player.health <= 1;
        player.health = Math.max(0, player.health - 1);

        io.emit('hit', {
          targetId: id,
          targetName: player.name,
          shooterId: p.owner,
          shooterName: players.get(p.owner)?.name || 'Unknown',
          health: player.health
        });

        if (killed) {
          const spawn = spawnPoint();
          player.x = spawn.x;
          player.y = spawn.y;
          player.z = spawn.z;
          player.yaw = spawn.yaw;
          player.pitch = 0;
          player.roll = 0;
          player.health = 3;
          player.mode = 'car';
          io.emit('playerRespawned', {
            id,
            x: player.x,
            y: player.y,
            z: player.z,
            yaw: player.yaw
          });
          io.emit('kill', {
            killerId: p.owner,
            killerName: players.get(p.owner)?.name || 'Unknown',
            victimId: id,
            victimName: player.name
          });
        }

        io.emit('projectileRemove', { id: p.id });
        projectiles.splice(i, 1);
        break;
      }
    }
  }
}

io.on('connection', (socket) => {
  const player = createPlayer(socket);
  players.set(socket.id, player);

  console.log(`[+] ${player.name} joined (${socket.id}) - ${players.size} online`);

  socket.emit('init', {
    id: socket.id,
    players: Array.from(players.values()).map(p => ({ ...p }))
  });

  socket.broadcast.emit('playerJoined', { ...player });

  socket.on('setName', (name) => {
    const clean = String(name || '').slice(0, 16).trim() || 'Pilot';
    player.name = clean;
    io.emit('playerRenamed', { id: socket.id, name: clean });
    console.log(`[*] ${socket.id} renamed to ${clean}`);
  });

  socket.on('transform', (data) => {
    const mode = data && data.mode === 'plane' ? 'plane' : 'car';
    player.mode = mode;
    socket.broadcast.emit('playerTransformed', { id: socket.id, mode });
  });

  socket.on('update', (data) => {
    if (!data || typeof data !== 'object') return;
    const now = Date.now();
    if (now - player.lastUpdate < 30) return;
    player.lastUpdate = now;

    player.x = sanitizeFloat(data.x, -WORLD_RADIUS, WORLD_RADIUS, player.x);
    player.y = sanitizeFloat(data.y, -200, 3000, player.y);
    player.z = sanitizeFloat(data.z, -WORLD_RADIUS, WORLD_RADIUS, player.z);
    player.yaw = sanitizeFloat(data.yaw, -100, 100, player.yaw);
    player.pitch = sanitizeFloat(data.pitch, -Math.PI, Math.PI, player.pitch);
    player.roll = sanitizeFloat(data.roll, -100, 100, player.roll);
    player.mode = data.mode === 'plane' ? 'plane' : 'car';
    player.speed = sanitizeFloat(data.speed, 0, 500, player.speed);
    player.nitro = sanitizeFloat(data.nitro, 0, 100, player.nitro);

    socket.broadcast.emit('playerUpdate', {
      id: socket.id,
      x: player.x, y: player.y, z: player.z,
      yaw: player.yaw, pitch: player.pitch, roll: player.roll,
      mode: player.mode, speed: player.speed, nitro: player.nitro,
      health: player.health
    });
  });

  socket.on('shoot', (data) => {
    if (!data || typeof data !== 'object') return;
    const now = Date.now();
    if (now - player.lastShot < 250) return;
    player.lastShot = now;

    const x = sanitizeFloat(data.x, -WORLD_RADIUS, WORLD_RADIUS, player.x);
    const y = sanitizeFloat(data.y, -200, 3000, player.y);
    const z = sanitizeFloat(data.z, -WORLD_RADIUS, WORLD_RADIUS, player.z);

    let targetId = null;
    let bestDist = Infinity;
    for (const [id, p] of players) {
      if (id === socket.id || p.health <= 0) continue;
      const ddx = p.x - x;
      const ddy = p.y - y;
      const ddz = p.z - z;
      const d = Math.sqrt(ddx * ddx + ddy * ddy + ddz * ddz);
      if (d < bestDist) { bestDist = d; targetId = id; }
    }
    if (bestDist > MISSILE_LOCK_RANGE) targetId = null;

    let vx, vy, vz;
    if (targetId) {
      const t = players.get(targetId);
      const ddx = t.x - x;
      const ddy = t.y - y;
      const ddz = t.z - z;
      const len = Math.sqrt(ddx * ddx + ddy * ddy + ddz * ddz) || 1;
      vx = ddx / len * MISSILE_SPEED;
      vy = ddy / len * MISSILE_SPEED;
      vz = ddz / len * MISSILE_SPEED;
    } else {
      const dx = sanitizeFloat(data.dx, -200, 200, 0);
      const dy = sanitizeFloat(data.dy, -200, 200, 0);
      const dz = sanitizeFloat(data.dz, -200, 200, 0);
      const speed = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (speed < 10 || speed > 300) return;
      const k = MISSILE_SPEED / speed;
      vx = dx * k;
      vy = dy * k;
      vz = dz * k;
    }

    projectiles.push({
      id: projectileId++,
      owner: socket.id,
      targetId,
      x, y, z,
      vx, vy, vz,
      life: MISSILE_LIFE,
      color: player.color
    });

    socket.broadcast.emit('projectile', {
      id: projectileId - 1,
      owner: socket.id,
      targetId,
      x, y, z,
      vx, vy, vz,
      color: player.color
    });
  });

  socket.on('chat', (msg) => {
    const clean = String(msg || '').slice(0, 200).trim();
    if (!clean) return;
    io.emit('chat', { id: socket.id, name: player.name, text: clean });
  });

  socket.on('break', (data) => {
    const idx = Number(data && data.idx);
    if (!Number.isInteger(idx) || idx < 0 || idx > 30000) return;
    socket.broadcast.emit('break', { idx });
  });

  socket.on('disconnect', () => {
    players.delete(socket.id);
    io.emit('playerLeft', { id: socket.id, name: player.name });
    console.log(`[-] ${player.name} left (${socket.id}) - ${players.size} online`);
  });
});

const TICK_RATE = 1 / 20;
let lastTick = Date.now();
setInterval(() => {
  const now = Date.now();
  const dt = (now - lastTick) / 1000;
  lastTick = now;
  updateProjectiles(dt);
}, TICK_RATE * 1000);

server.listen(PORT, () => {
  console.log(`============================================`);
  console.log(`  Transform Racer server running`);
  console.log(`  Open http://localhost:${PORT} in your browser`);
  console.log(`  Share your LAN IP to play with friends`);
  console.log(`============================================`);
});
