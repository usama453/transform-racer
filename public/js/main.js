import * as THREE from 'three';
import { Vehicle, PLANE_GROUND_Y, WORLD_RADIUS } from './vehicle.js';
import { Input } from './input.js';
import { Network } from './network.js';
import { HUD } from './hud.js';
import { createWorld, updateWorld } from './world.js';
import { buildVehicle, setVehicleMode, animateVehicle, buildLaser } from './render.js';
import { SoundManager } from './audio.js';
import { Minimap } from './minimap.js';

const OVERLAY = document.getElementById('start-overlay');
const JOIN_BTN = document.getElementById('join-btn');
const NAME_INPUT = document.getElementById('name-input');

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.2;
renderer.domElement.tabIndex = 0;
renderer.domElement.style.outline = 'none';
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 4000);
camera.position.set(10, 6, 12);

const world = createWorld(scene);

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

const input = new Input();
const net = new Network();
const hud = new HUD(net);
const vehicle = new Vehicle(0, 0);
const vehicleMesh = buildVehicle('#33ccff');
scene.add(vehicleMesh);
const audio = new SoundManager();
const minimap = new Minimap(document.getElementById('minimap'));
const soundBtn = document.getElementById('sound-toggle');

setVehicleMode(vehicleMesh, 'car');

let joined = false;
let spawnSet = false;
let displayedMode = 'car';
let cameraView = 'chase';

const particles = createParticles(scene);
const transformFlash = createTransformFlash(scene);

vehicle.onBounce = (vy) => {
  audio.land();
  const pos = vehicle.position;
  for (let i = 0; i < 6; i++) {
    particles.spawn(
      new THREE.Vector3(pos.x, pos.y, pos.z),
      new THREE.Vector3((Math.random() - 0.5) * 8, Math.random() * 4, (Math.random() - 0.5) * 8),
      0.8, 0.4
    );
  }
};

let myName = 'Pilot';
let myLabel = null;

function labelOpacity(dist) {
  if (dist < 140) return 1;
  if (dist >= 950) return 0.42;
  return 1 - ((dist - 140) / 810) * 0.58;
}

function ensureOwnLabel() {
  if (myLabel) return;
  myLabel = makeLabel(myName, '#33ccff');
  scene.add(myLabel);
}

const remotes = new Map();

function makeLabel(name, color) {
  const measure = document.createElement('canvas').getContext('2d');
  measure.font = 'bold 34px Segoe UI, sans-serif';
  const textW = Math.ceil(measure.measureText(name).width);
  const W = Math.max(120, textW + 36);
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');
  ctx.font = 'bold 34px Segoe UI, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineWidth = 6;
  ctx.strokeStyle = 'rgba(0,0,0,0.85)';
  ctx.strokeText(name, W / 2, 32);
  ctx.fillStyle = color;
  ctx.fillText(name, W / 2, 32);
  const tex = new THREE.CanvasTexture(canvas);
  const mat = new THREE.SpriteMaterial({
    map: tex, transparent: true, depthWrite: false,
    depthTest: false, sizeAttenuation: false
  });
  const sprite = new THREE.Sprite(mat);
  sprite.renderOrder = 999;
  sprite.userData.labelW = W;
  sprite.userData.labelH = 64;
  sizeLabel(sprite);
  return sprite;
}

function sizeLabel(sprite) {
  const tanHalf = Math.tan(camera.fov / 2 * Math.PI / 180);
  const pxPerScale = (0.3845 * window.innerHeight) / tanHalf;
  const sy = 56 / pxPerScale;
  sprite.scale.set(sy * (sprite.userData.labelW / sprite.userData.labelH), sy, 1);
}

function syncRemotes(dt) {
  const qCur = new THREE.Quaternion();
  const qTarget = new THREE.Quaternion();
  const eTarget = new THREE.Euler();

  for (const [id, rp] of remotes) {
    if (!net.players.has(id)) {
      scene.remove(rp.mesh);
      scene.remove(rp.label);
      remotes.delete(id);
      continue;
    }
    const s = net.players.get(id);

    rp.targetPos.set(s.x, s.y, s.z);
    eTarget.set(s.pitch, s.yaw, s.roll, 'YXZ');
    qTarget.setFromEuler(eTarget);

    const lerp = 1 - Math.exp(-dt * 10);
    rp.curPos.lerp(rp.targetPos, lerp);
    rp.curQuat.slerp(qTarget, lerp);

    if (s.mode !== rp.mode) {
      rp.mode = s.mode;
      setVehicleMode(rp.mesh, s.mode);
    }

    rp.mesh.position.copy(rp.curPos);
    rp.mesh.quaternion.copy(rp.curQuat);

    rp.label.position.copy(rp.curPos);
    rp.label.position.y = rp.mode === 'plane' ? 2.6 : 2.1;
    rp.label.material.opacity = labelOpacity(rp.curPos.distanceTo(camera.position));
    sizeLabel(rp.label);

    animateVehicle(rp.mesh, dt, {
      mode: rp.mode, speed: s.speed || 0, nitroActive: false, steer: 0
    });
  }
}

function ensureRemotes() {
  for (const [id, s] of net.players) {
    if (id === net.myId) continue;
    if (!remotes.has(id)) {
      const mesh = buildVehicle(s.color || '#ffffff');
      scene.add(mesh);
      const label = makeLabel(s.name || 'Pilot', s.color || '#ffffff');
      scene.add(label);
      const start = new THREE.Vector3(s.x, s.y, s.z);
      const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(s.pitch, s.yaw, s.roll, 'YXZ'));
      remotes.set(id, {
        mesh, label,
        curPos: start.clone(), targetPos: start.clone(),
        curQuat: q.clone(),
        mode: s.mode || 'car'
      });
      setVehicleMode(mesh, s.mode || 'car');
    }
  }
}

function createParticles(scene) {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');
  const g = ctx.createRadialGradient(32, 32, 2, 32, 32, 30);
  g.addColorStop(0, 'rgba(0,200,255,1)');
  g.addColorStop(0.4, 'rgba(100,0,255,0.9)');
  g.addColorStop(1, 'rgba(0,100,200,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  const tex = new THREE.CanvasTexture(canvas);

  const pool = [];
  for (let i = 0; i < 140; i++) {
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
      map: tex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false
    }));
    sprite.visible = false;
    scene.add(sprite);
    pool.push({ sprite, vel: new THREE.Vector3(), life: 0, maxLife: 1, size: 1 });
  }
  let idx = 0;

  return {
    spawn(pos, vel, size, life) {
      const p = pool[idx];
      idx = (idx + 1) % pool.length;
      p.sprite.position.copy(pos);
      p.vel.copy(vel);
      p.sprite.scale.setScalar(size);
      p.maxLife = life;
      p.life = life;
      p.sprite.visible = true;
    },
    update(dt) {
      for (const p of pool) {
        if (p.life <= 0) continue;
        p.life -= dt;
        if (p.life <= 0) {
          p.sprite.visible = false;
          continue;
        }
        p.sprite.position.addScaledVector(p.vel, dt);
        p.vel.multiplyScalar(1 - dt * 1.6);
        const t = p.life / p.maxLife;
        p.sprite.material.opacity = t;
        p.sprite.scale.setScalar(p.size * (0.4 + 0.6 * t));
      }
    }
  };
}

function createTransformFlash(scene) {
  const geo = new THREE.SphereGeometry(1, 16, 16);
  const mat = new THREE.MeshBasicMaterial({
    color: 0x00ccff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.visible = false;
  scene.add(mesh);
  return { mesh, life: 0 };
}

const activeProjectiles = [];
const enemyProjectiles = [];

function spawnProjectile(x, y, z, dx, dy, dz, color, isMine) {
  const mesh = buildLaser(color);
  mesh.position.set(x, y, z);
  const dir = new THREE.Vector3(dx, dy, dz).normalize();
  const lookTarget = new THREE.Vector3(x + dir.x, y + dir.y, z + dir.z);
  mesh.lookAt(lookTarget);
  scene.add(mesh);
  const entry = {
    mesh,
    pos: new THREE.Vector3(x, y, z),
    vel: new THREE.Vector3(dx * 2.5, dy * 2.5, dz * 2.5),
    life: 2.5,
    isMine
  };
  if (isMine) activeProjectiles.push(entry);
  else enemyProjectiles.push(entry);
}

function updateProjectiles(dt) {
  for (let i = activeProjectiles.length - 1; i >= 0; i--) {
    const p = activeProjectiles[i];
    p.life -= dt;
    if (p.life <= 0) {
      scene.remove(p.mesh);
      activeProjectiles.splice(i, 1);
      continue;
    }
    p.pos.addScaledVector(p.vel, dt);
    p.mesh.position.copy(p.pos);
  }
  for (let i = enemyProjectiles.length - 1; i >= 0; i--) {
    const p = enemyProjectiles[i];
    p.life -= dt;
    if (p.life <= 0) {
      scene.remove(p.mesh);
      enemyProjectiles.splice(i, 1);
      continue;
    }
    p.pos.addScaledVector(p.vel, dt);
    p.mesh.position.copy(p.pos);
  }
}

net.onProjectile = (data) => {
  spawnProjectile(data.x, data.y, data.z, data.dx, data.dy, data.dz, data.color, false);
};

net.onHit = (data) => {
  if (data.targetId === net.myId) {
    vehicle.health = data.health;
    if (vehicle.health <= 0) {
      vehicle.respawn();
      spawnSet = true;
      const me = net.players.get(net.myId);
      if (me) {
        vehicle.position.set(me.x, me.y, me.z);
        vehicle.yaw = me.yaw;
      }
    }
    hud.showHitFlash();
  }
  const rp = remotes.get(data.targetId);
  if (rp) {
    for (let i = 0; i < 8; i++) {
      particles.spawn(
        rp.curPos.clone().add(new THREE.Vector3((Math.random() - 0.5) * 2, Math.random() * 2, (Math.random() - 0.5) * 2)),
        new THREE.Vector3((Math.random() - 0.5) * 12, Math.random() * 8, (Math.random() - 0.5) * 12),
        0.7, 0.6
      );
    }
  }
};

net.onKill = (data) => {
  const killerName = data.killerName || 'Unknown';
  const victimName = data.victimName || 'Unknown';
  hud.showKillFeed(killerName, victimName);
};

net.onPlayerRespawned = (data) => {
  if (data.id === net.myId) {
    spawnSet = true;
    const me = net.players.get(net.myId);
    if (me) {
      vehicle.position.set(me.x, me.y, me.z);
      vehicle.yaw = me.yaw;
    }
  }
};

const lookTarget = new THREE.Vector3();
const fwdTmp = new THREE.Vector3();

function updateCamera(dt) {
  const fwd = vehicle.forward;
  const mode = vehicle.mode;

  if (cameraView === 'cockpit') {
    const quat = new THREE.Quaternion().setFromEuler(new THREE.Euler(vehicle.pitch, vehicle.yaw, vehicle.roll, 'YXZ'));
    camera.quaternion.copy(quat);
    const upOff = mode === 'plane' ? 0.95 : 1.05;
    camera.position.copy(vehicle.position);
    camera.position.y += upOff;
    camera.position.addScaledVector(fwd, 0.55);
    const fov = 62 + Math.min(18, vehicle.speed * 0.18);
    if (Math.abs(camera.fov - fov) > 0.1) {
      camera.fov += (fov - camera.fov) * (1 - Math.exp(-dt * 3));
      camera.updateProjectionMatrix();
    }
    return;
  }

  const backDist = mode === 'plane' ? 17 : 10;
  const height = mode === 'plane' ? 7.5 : 5.2;
  fwdTmp.set(fwd.x, 0, fwd.z).normalize();

  const desired = new THREE.Vector3();
  desired.copy(vehicle.position).addScaledVector(fwdTmp, -backDist);
  desired.y = vehicle.position.y + height;
  if (desired.y < 1.2) desired.y = 1.2;

  camera.position.lerp(desired, 1 - Math.exp(-dt * 5));

  const look = vehicle.position.clone().addScaledVector(fwd, mode === 'plane' ? 14 : 9);
  look.y += mode === 'plane' ? 1.5 : 1.3;
  lookTarget.lerp(look, 1 - Math.exp(-dt * 8));
  camera.lookAt(lookTarget);

  const fov = 62 + Math.min(18, vehicle.speed * 0.16);
  if (Math.abs(camera.fov - fov) > 0.1) {
    camera.fov += (fov - camera.fov) * (1 - Math.exp(-dt * 3));
    camera.updateProjectionMatrix();
  }
}

const neutralInput = { throttle: 0, steer: 0, yaw: 0, nitro: false, handbrake: false };

function readInput() {
  if (document.getElementById('chat-input').classList.contains('active')) {
    return neutralInput;
  }
  return {
    throttle: input.throttle,
    steer: input.steer,
    yaw: input.yaw,
    nitro: input.nitro,
    handbrake: input.handbrake
  };
}

input.onTransform = () => {
  if (!joined) return;
  vehicle.transform();
  audio.transform(vehicle.nextMode);
  net.sendTransform(vehicle.nextMode);
};

input.onCameraToggle = () => {
  cameraView = cameraView === 'chase' ? 'cockpit' : 'chase';
  vehicleMesh.visible = cameraView === 'chase';
};

input.onMute = () => {
  const muted = audio.toggleMute();
  soundBtn.textContent = muted ? '\u{1F507}' : '\u{1F50A}';
};

input.onDoubleShift = () => {
  if (joined) vehicle.activateOverboost();
};

input.onShoot = () => {
  if (!joined) return;
  if (!vehicle.canShoot()) return;
  vehicle.shoot();

  const fwd = vehicle.forward;
  const shootDir = fwd.clone();
  spawnProjectile(
    vehicle.position.x + fwd.x * 2,
    vehicle.position.y + fwd.y * 2,
    vehicle.position.z + fwd.z * 2,
    shootDir.x, shootDir.y, shootDir.z,
    '#33ccff', true
  );

  net.sendShoot(
    vehicle.position.x + fwd.x * 2,
    vehicle.position.y + fwd.y * 2,
    vehicle.position.z + fwd.z * 2,
    shootDir.x, shootDir.y, shootDir.z
  );

  for (let i = 0; i < 4; i++) {
    particles.spawn(
      vehicle.position.clone().addScaledVector(fwd, 2).add(new THREE.Vector3(
        (Math.random() - 0.5) * 0.5,
        (Math.random() - 0.5) * 0.5,
        (Math.random() - 0.5) * 0.5
      )),
      fwd.clone().multiplyScalar(20).add(new THREE.Vector3(
        (Math.random() - 0.5) * 6,
        (Math.random() - 0.5) * 6,
        (Math.random() - 0.5) * 6
      )),
      0.4, 0.3
    );
  }
};

soundBtn.addEventListener('click', () => input.onMute());

function updateOwnVisual(dt) {
  vehicleMesh.position.copy(vehicle.position);
  vehicleMesh.rotation.set(vehicle.pitch, vehicle.yaw, vehicle.roll, 'YXZ');

  if (vehicle.invulnerable) {
    vehicleMesh.visible = Math.floor(performance.now() / 80) % 2 === 0;
  } else {
    vehicleMesh.visible = cameraView === 'chase';
  }

  if (vehicle.transforming) {
    const p = vehicle.transformProgress;
    const scale = 1 - 0.38 * Math.sin(p * Math.PI);
    vehicleMesh.scale.setScalar(Math.max(0.1, scale));
    if (p >= 0.5 && displayedMode !== vehicle.nextMode) {
      displayedMode = vehicle.nextMode;
      setVehicleMode(vehicleMesh, displayedMode);
      transformFlash.life = 0.5;
    }
  } else if (displayedMode !== vehicle.mode) {
    displayedMode = vehicle.mode;
    setVehicleMode(vehicleMesh, displayedMode);
    transformFlash.life = 0.5;
    vehicleMesh.scale.setScalar(1);
  } else {
    vehicleMesh.scale.lerp(new THREE.Vector3(1, 1, 1), 1 - Math.exp(-dt * 8));
  }

  if (transformFlash.life > 0) {
    transformFlash.life -= dt;
    const t = Math.max(0, transformFlash.life) / 0.5;
    transformFlash.mesh.position.copy(vehicle.position);
    transformFlash.mesh.scale.setScalar(2 + (1 - t) * 8);
    transformFlash.mesh.material.opacity = t * 0.7;
    transformFlash.mesh.visible = t > 0.01;
  } else {
    transformFlash.mesh.visible = false;
  }

  animateVehicle(vehicleMesh, dt, {
    mode: displayedMode,
    speed: vehicle.speed,
    nitroActive: vehicle.usingNitro,
    steer: readInput().steer
  });

  if (vehicle.usingNitro) {
    const fwd = vehicle.forward;
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(vehicleMesh.quaternion);
    for (const side of [-0.6, 0.6]) {
      const pos = vehicle.position.clone()
        .addScaledVector(fwd, -2.3)
        .addScaledVector(right, side);
      pos.y = displayedMode === 'plane' ? 0.62 : 0.55;
      const vel = fwd.clone().multiplyScalar(-14).add(new THREE.Vector3(
        (Math.random() - 0.5) * 3, Math.random() * 2, (Math.random() - 0.5) * 3
      ));
      particles.spawn(pos, vel, 0.9, 0.5);
    }
  }

  if (myLabel) {
    myLabel.position.copy(vehicle.position);
    myLabel.position.y = vehicle.position.y + (displayedMode === 'plane' ? 2.6 : 2.1);
    myLabel.material.opacity = cameraView === 'cockpit' ? 0 : 0.9;
    sizeLabel(myLabel);
  }
}

const edgeTags = new Map();
const EDGE_MARGIN = 30;
const tagProject = new THREE.Vector3();

function updateEdgeTags() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  const active = new Set();

  for (const [id, rp] of remotes) {
    if (!net.players.has(id)) continue;
    const s = net.players.get(id);
    active.add(id);

    tagProject.copy(rp.curPos).project(camera);
    const behind = tagProject.z > 1;
    if (behind) {
      tagProject.x *= -1;
      tagProject.y *= -1;
    }
    const sx = ((tagProject.x + 1) / 2) * w;
    const sy = ((1 - tagProject.y) / 2) * h;
    const onScreen = !behind && tagProject.x >= -1.05 && tagProject.x <= 1.05 &&
      tagProject.y >= -1.05 && tagProject.y <= 1.05;

    let el = edgeTags.get(id);
    if (onScreen) {
      if (el) el.style.display = 'none';
      continue;
    }

    let cx = sx;
    let cy = sy;
    if (cx < EDGE_MARGIN) cx = EDGE_MARGIN;
    if (cx > w - EDGE_MARGIN) cx = w - EDGE_MARGIN;
    if (cy < EDGE_MARGIN + 20) cy = EDGE_MARGIN + 20;
    if (cy > h - EDGE_MARGIN) cy = h - EDGE_MARGIN;

    const dx = sx - cx;
    const dy = sy - cy;
    const angle = (Math.atan2(dy, dx) * 180) / Math.PI + 90;
    const dist = Math.round(rp.curPos.distanceTo(vehicle.position));

    if (!el) {
      el = document.createElement('div');
      el.className = 'edge-tag';
      el.innerHTML = '<div class="arrow"></div><div class="tag-name"></div><div class="tag-dist"></div>';
      document.getElementById('edge-tags').appendChild(el);
      edgeTags.set(id, el);
    }
    el.style.left = cx + 'px';
    el.style.top = cy + 'px';
    el.style.display = 'flex';
    el.querySelector('.arrow').style.transform = `rotate(${angle}deg)`;
    el.querySelector('.arrow').style.borderBottomColor = s.color || '#ffffff';
    el.querySelector('.tag-name').textContent = s.name || 'Pilot';
    el.querySelector('.tag-dist').textContent = dist + 'm';
  }

  for (const [id, el] of edgeTags) {
    if (!active.has(id)) el.style.display = 'none';
  }
}

let joinPressed = false;

function joinGame() {
  if (joinPressed) return;
  joinPressed = true;
  myName = NAME_INPUT.value.trim() || 'Pilot';
  net.sendName(myName);
  audio.init();
  ensureOwnLabel();
  OVERLAY.classList.add('hidden');
  hud.closeChat();
  if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
  joined = true;
  input.joined = true;
  renderer.domElement.focus();
  window.focus();
  spawnSet = false;
  vehicle.health = vehicle.maxHealth;
}

JOIN_BTN.addEventListener('click', joinGame);
NAME_INPUT.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.stopPropagation();
    joinGame();
  }
});

const chatInputEl = document.getElementById('chat-input');
chatInputEl.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    const text = chatInputEl.value.trim();
    if (text) net.sendChat(text);
    chatInputEl.value = '';
    hud.closeChat();
  } else if (e.key === 'Escape') {
    chatInputEl.value = '';
    hud.closeChat();
  }
});

input.onChatOpen = () => hud.openChat();

net.onConnected = () => hud.setConnected();
net.onDisconnected = () => hud.setError('Connection lost - refresh to reconnect');
net.connect();
setTimeout(() => {
  if (!net.connected) hud.setError('Cannot reach server. Run "npm start" first.');
}, 6000);

const clock = new THREE.Clock();

function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(0.05, clock.getDelta());

  if (joined && !spawnSet) {
    const me = net.players.get(net.myId);
    if (me) {
      vehicle.position.set(me.x, me.y, me.z);
      vehicle.yaw = me.yaw;
      spawnSet = true;
    }
  }

  const ctrl = readInput();
  vehicle.update(ctrl, dt);

  ensureRemotes();
  syncRemotes(dt);
  updateEdgeTags();

  updateOwnVisual(dt);
  updateCamera(dt);
  particles.update(dt);
  updateProjectiles(dt);
  updateWorld(world, dt);

  const others = Array.from(net.players.values()).filter((p) => p.id !== net.myId);
  minimap.update(vehicle, others);

  audio.resume();
  audio.updateEngine({
    mode: vehicle.mode,
    speed: vehicle.speed,
    nitroActive: vehicle.usingNitro,
    overboost: vehicle.overboost,
    throttle: ctrl.throttle
  });
  audio.setDrift(vehicle.drifting, vehicle.speed);

  hud.update({
    mode: vehicle.mode,
    speed: vehicle.speed,
    nitro: vehicle.nitro,
    overboost: vehicle.overboost,
    boostFrac: vehicle.boostFrac,
    players: net.players.size,
    health: vehicle.health,
    maxHealth: vehicle.maxHealth,
    cooldown: vehicle.shootCooldown,
    shootRate: vehicle.shootRate
  });

  net.sendUpdate(vehicle);

  renderer.render(scene, camera);
}

setInterval(() => {
  if (!joined) return;
  const dist = Math.sqrt(vehicle.position.x ** 2 + vehicle.position.z ** 2);
  if (dist > WORLD_RADIUS - 200) hud.showWarning('RETURN TO THE GRID');
}, 1500);

animate();
