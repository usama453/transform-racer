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

const WORLD_RADIUS = 2000;

const COLORS = [
  '#ff4d4d', '#4dff88', '#4dc3ff', '#ffd84d',
  '#ff7be0', '#a86bff', '#ff9a4d', '#4dffea',
  '#ffffff', '#ff4d88'
];

const players = new Map();
let colorIdx = 0;

function spawnPoint() {
  const angle = Math.random() * Math.PI * 2;
  const radius = 60 + Math.random() * 220;
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
    lastUpdate: 0
  };
  return player;
}

io.on('connection', (socket) => {
  const player = createPlayer(socket);
  players.set(socket.id, player);

  console.log(`[+] ${player.name} joined (${socket.id}) - ${players.size} online`);

  // Send full world snapshot to the new player
  socket.emit('init', {
    id: socket.id,
    players: Array.from(players.values()).map(p => ({ ...p }))
  });

  // Tell everyone else about this player
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
    if (now - player.lastUpdate < 30) return; // ~33 updates/sec max
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
      mode: player.mode, speed: player.speed, nitro: player.nitro
    });
  });

  socket.on('chat', (msg) => {
    const clean = String(msg || '').slice(0, 200).trim();
    if (!clean) return;
    io.emit('chat', { id: socket.id, name: player.name, text: clean });
  });

  socket.on('disconnect', () => {
    players.delete(socket.id);
    io.emit('playerLeft', { id: socket.id, name: player.name });
    console.log(`[-] ${player.name} left (${socket.id}) - ${players.size} online`);
  });
});

server.listen(PORT, () => {
  console.log(`============================================`);
  console.log(`  Transform Racer server running`);
  console.log(`  Open http://localhost:${PORT} in your browser`);
  console.log(`  Share your LAN IP to play with friends`);
  console.log(`============================================`);
});
