import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { Vehicle, PLANE_GROUND_Y, WORLD_RADIUS } from './vehicle.js';
import { Input } from './input.js';
import { Network } from './network.js';
import { HUD } from './hud.js';
import { createWorld, updateWorld, collideCar, breakState, breakBuildingByIdx } from './world.js';
import { buildVehicle, setVehicleMode, animateVehicle, buildMissile } from './render.js';
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
const camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 15000);
camera.position.set(3500, 60, 3500);
camera.lookAt(0, 0, 0);

// radial motion blur post-process pass
const drawBuf = new THREE.Vector2();
const blurRT = new THREE.WebGLRenderTarget(1, 1, {
  minFilter: THREE.LinearFilter,
  magFilter: THREE.LinearFilter,
  format: THREE.RGBAFormat
});
blurRT.samples = 4;
const blurScene = new THREE.Scene();
const blurCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
const blurMat = new THREE.ShaderMaterial({
  uniforms: {
    tDiffuse: { value: null },
    resolution: { value: new THREE.Vector2(1, 1) },
    uAmount: { value: 0 }
  },
  vertexShader: `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = vec4(position.xy, 0.0, 1.0);
    }
  `,
  fragmentShader: `
    uniform sampler2D tDiffuse;
    uniform vec2 resolution;
    uniform float uAmount;
    varying vec2 vUv;
    void main() {
      vec2 uv = vUv;
      vec2 center = vec2(0.5);
      vec2 aspect = vec2(resolution.x / max(resolution.y, 1.0), 1.0);
      vec2 d = (uv - center) * aspect;
      float dist = length(d);
      vec2 dirN = dist > 0.0001 ? d / dist : vec2(0.0);
      vec3 color = texture2D(tDiffuse, uv).rgb;
      float total = 1.0;
      for (int i = 1; i <= 6; i++) {
        float s = float(i) / 7.0;
        vec2 off = (dirN * dist * s * uAmount) / aspect;
        color += texture2D(tDiffuse, uv + off).rgb;
        color += texture2D(tDiffuse, uv - off).rgb;
        total += 2.0;
      }
      gl_FragColor = vec4(color / total, 1.0);
    }
  `,
  depthTest: false,
  depthWrite: false
});
const blurQuad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), blurMat);
blurQuad.frustumCulled = false;
blurScene.add(blurQuad);

function resizeBlurRT() {
  renderer.getDrawingBufferSize(drawBuf);
  blurRT.setSize(drawBuf.x, drawBuf.y);
  blurMat.uniforms.resolution.value.set(drawBuf.x, drawBuf.y);
}
resizeBlurRT();

const world = createWorld(scene);
world.camera = camera;

const input = new Input();
const net = new Network();
const hud = new HUD(net);
const vehicle = new Vehicle(0, 0);
let rampJumpCount = 0;


const vehicleMesh = buildVehicle('#33ccff');
scene.add(vehicleMesh);

// Load GLB models for bike (car mode) and jet (plane mode)
let bikeModel = null;
let jetModel = null;
const gltfLoader = new GLTFLoader();

// Load bike for car mode
gltfLoader.load('/bike.glb', (gltf) => {
  bikeModel = gltf.scene;
  const box = new THREE.Box3().setFromObject(bikeModel);
  const center = box.getCenter(new THREE.Vector3());
  bikeModel.traverse((child) => {
    if (child.isMesh) {
      child.geometry.translate(-center.x, -center.y, -center.z);
    }
  });
  bikeModel.position.set(0, 0, 0);
  const newBox = new THREE.Box3().setFromObject(bikeModel);
  const size = newBox.getSize(new THREE.Vector3());
  const maxDim = Math.max(size.x, size.y, size.z);
  bikeModel.scale.setScalar(6 / maxDim);
  bikeModel.position.y = 1.5; // Move up so it sits on ground
  // Use MeshBasicMaterial but preserve original colors
  bikeModel.traverse((child) => {
    if (child.isMesh && child.material) {
      const origMap = child.material.map || null;
      // Preserve original color if it exists and isn't black
      let origColor = 0xffffff;
      if (child.material.color && child.material.color.getHex() > 0) {
        origColor = child.material.color.getHex();
      }
      // Check for vertex colors
      if (child.geometry && child.geometry.attributes.color) {
        child.material = new THREE.MeshBasicMaterial({ 
          vertexColors: true,
          map: origMap
        });
      } else {
        child.material = new THREE.MeshBasicMaterial({ 
          color: origColor,
          map: origMap
        });
      }
    }
  });
  vehicleMesh.add(bikeModel);
  console.log('Bike loaded');
});

// Load jet for plane mode
gltfLoader.load('/jet.glb', (gltf) => {
  jetModel = gltf.scene;
  const box = new THREE.Box3().setFromObject(jetModel);
  const center = box.getCenter(new THREE.Vector3());
  jetModel.traverse((child) => {
    if (child.isMesh) {
      child.geometry.translate(-center.x, -center.y, -center.z);
    }
  });
  jetModel.position.set(0, 0, 0);
  const newBox = new THREE.Box3().setFromObject(jetModel);
  const size = newBox.getSize(new THREE.Vector3());
  const maxDim = Math.max(size.x, size.y, size.z);
  jetModel.scale.setScalar(16 / maxDim);
  jetModel.rotation.x = Math.PI; // Flip upside down
  jetModel.rotation.z = Math.PI; // Rotate 180 degrees on Z axis
  jetModel.position.y = 3; // Move up for plane height
  // Use MeshBasicMaterial but preserve original colors
  jetModel.traverse((child) => {
    if (child.isMesh && child.material) {
      const origMap = child.material.map || null;
      // Preserve original color if it exists and isn't black
      let origColor = 0xffffff;
      if (child.material.color && child.material.color.getHex() > 0) {
        origColor = child.material.color.getHex();
      }
      // Check for vertex colors
      if (child.geometry && child.geometry.attributes.color) {
        child.material = new THREE.MeshBasicMaterial({ 
          vertexColors: true,
          map: origMap
        });
      } else {
        child.material = new THREE.MeshBasicMaterial({ 
          color: origColor,
          map: origMap
        });
      }
    }
  });
  jetModel.visible = false; // Hidden by default (start in car mode)
  vehicleMesh.add(jetModel);
  console.log('Jet loaded');
});

// Custom visibility handler for GLB models
window.__updateVehicleVisibility = function(mode) {
  if (vehicleMesh.userData.carParts) vehicleMesh.userData.carParts.visible = false;
  if (vehicleMesh.userData.planeParts) vehicleMesh.userData.planeParts.visible = false;
  if (bikeModel) bikeModel.visible = (mode === 'car');
  if (jetModel) jetModel.visible = (mode === 'plane');
};

// ============================================================
// NPC Fighter Jets - Patrol central tower, chase players
// ============================================================
const TOWER_POS = new THREE.Vector3(285, 1750, 45);
const TERRITORY_RADIUS = 800;
const JET_COUNT = 8;
const JET_SPEED = 150;
const JET_HEALTH = 2;
const RESPAWN_TIME = 15;

let npcJets = [];
let jetModelTemplate = null;

function createJetNPC(index) {
  const jet = {
    mesh: null,
    health: JET_HEALTH,
    alive: true,
    target: null,
    patrolAngle: (index / JET_COUNT) * Math.PI * 2,
    respawnTimer: 0,
    speed: JET_SPEED,
    trail: null
  };

  if (jetModelTemplate) {
    jet.mesh = jetModelTemplate.clone();
    jet.mesh.scale.setScalar(0.6);
    jet.mesh.traverse((child) => {
      if (child.isMesh && child.material) {
        const origMap = child.material.map || null;
        child.material = new THREE.MeshBasicMaterial({ color: 0xff4444, map: origMap });
      }
    });
    
    // Set initial position to patrol position at tower height
    const radius = 900;
    const startX = TOWER_POS.x + Math.cos(jet.patrolAngle) * radius;
    const startZ = TOWER_POS.z + Math.sin(jet.patrolAngle) * radius;
    jet.mesh.position.set(startX, TOWER_POS.y, startZ);
    
    scene.add(jet.mesh);
    
    // Add trail
    jet.trail = createTrail(scene, 0xff4444, 160);
  }

  return jet;
}

function createJetModelTemplate() {
  // Use a simple jet shape (will be replaced by GLB when loaded)
  const jetGroup = new THREE.Group();
  const fuselage = new THREE.Mesh(
    new THREE.CylinderGeometry(0.3, 0.5, 4, 8),
    new THREE.MeshBasicMaterial({ color: 0xff4444 })
  );
  fuselage.rotation.z = Math.PI / 2;
  jetGroup.add(fuselage);
  const wing = new THREE.Mesh(
    new THREE.BoxGeometry(1, 0.1, 3),
    new THREE.MeshBasicMaterial({ color: 0xcc0000 })
  );
  jetGroup.add(wing);
  const tail = new THREE.Mesh(
    new THREE.BoxGeometry(0.5, 0.8, 0.1),
    new THREE.MeshBasicMaterial({ color: 0xcc0000 })
  );
  tail.position.x = -1.5;
  jetGroup.add(tail);
  return jetGroup;
}

// Load jet GLB for NPC jets
let npcJetGLB = null;
const npcLoader = new GLTFLoader();
npcLoader.load('/jet.glb', (gltf) => {
  npcJetGLB = gltf.scene;
  const box = new THREE.Box3().setFromObject(npcJetGLB);
  const center = box.getCenter(new THREE.Vector3());
  npcJetGLB.traverse((child) => {
    if (child.isMesh) {
      child.geometry.translate(-center.x, -center.y, -center.z);
    }
  });
  npcJetGLB.position.set(0, 0, 0);
  const newBox = new THREE.Box3().setFromObject(npcJetGLB);
  const size = newBox.getSize(new THREE.Vector3());
  const maxDim = Math.max(size.x, size.y, size.z);
  npcJetGLB.scale.setScalar(60 / maxDim);
  npcJetGLB.rotation.x = Math.PI;
  npcJetGLB.rotation.z = Math.PI;
  
  // Update existing jets with GLB model
  const radius = 900;
  for (const jet of npcJets) {
    if (jet.mesh) scene.remove(jet.mesh);
    jet.mesh = npcJetGLB.clone();
    jet.mesh.traverse((child) => {
      if (child.isMesh && child.material) {
        const origMap = child.material.map || null;
        child.material = new THREE.MeshBasicMaterial({ color: 0xff4444, map: origMap });
      }
    });
    // Set position to patrol position
    const startX = TOWER_POS.x + Math.cos(jet.patrolAngle) * radius;
    const startZ = TOWER_POS.z + Math.sin(jet.patrolAngle) * radius;
    jet.mesh.position.set(startX, TOWER_POS.y, startZ);
    scene.add(jet.mesh);
  }
  console.log('NPC Jet GLB loaded');
});

function initNPCJets() {
  jetModelTemplate = createJetModelTemplate();
  for (let i = 0; i < JET_COUNT; i++) {
    npcJets.push(createJetNPC(i));
  }
  console.log('NPC Jets initialized:', npcJets.length);
}

function updateNPCJets(dt) {
  const playerPos = vehicle.position;
  const playerInTerritory = playerPos.distanceTo(TOWER_POS) < TERRITORY_RADIUS;
  
  let aliveCount = 0;
  for (const jet of npcJets) {
    if (!jet.alive) {
      jet.respawnTimer -= dt;
      if (jet.respawnTimer <= 0) {
        jet.alive = true;
        jet.health = JET_HEALTH;
        if (jet.mesh) jet.mesh.visible = true;
      }
      continue;
    }

    if (!jet.mesh) continue;
    
    // Update trail
    if (jet.trail) jet.trail.push(jet.mesh.position.clone());

    let closestPlayer = null;
    let closestDist = Infinity;
    
    if (playerInTerritory) {
      const dist = playerPos.distanceTo(jet.mesh.position);
      if (dist < closestDist) {
        closestDist = dist;
        closestPlayer = playerPos;
      }
    }

    for (const [id, rp] of remotes) {
      const remotePos = rp.curPos;
      if (remotePos.distanceTo(TOWER_POS) < TERRITORY_RADIUS) {
        const dist = remotePos.distanceTo(jet.mesh.position);
        if (dist < closestDist) {
          closestDist = dist;
          closestPlayer = remotePos;
        }
      }
    }

    if (closestPlayer && closestDist < 300) {
      const dir = closestPlayer.clone().sub(jet.mesh.position).normalize();
      jet.mesh.position.addScaledVector(dir, jet.speed * dt);
      jet.mesh.lookAt(closestPlayer);
      
      if (closestDist < 5) {
        if (vehicle.health > 0) {
          vehicle.health -= 1;
          hud.showHitFlash();
          if (vehicle.health <= 0) {
            vehicle.respawn();
          }
        }
        jet.health -= 1;
        if (jet.health <= 0) {
          jet.alive = false;
          jet.respawnTimer = RESPAWN_TIME;
          if (jet.mesh) jet.mesh.visible = false;
        }
      }
    } else {
      // Patrol around tower in BIG circle formation
      jet.patrolAngle += dt * 0.5; // Faster rotation
      const radius = 900; // Circle radius
      const patrolX = TOWER_POS.x + Math.cos(jet.patrolAngle) * radius;
      const patrolZ = TOWER_POS.z + Math.sin(jet.patrolAngle) * radius;
      const patrolY = TOWER_POS.y + Math.sin(jet.patrolAngle * 2) * 40;
      
      // Directly set position to maintain circle (no shrinking)
      jet.mesh.position.set(patrolX, patrolY, patrolZ);
      jet.mesh.lookAt(TOWER_POS.x, patrolY, TOWER_POS.z + radius);
    }
    
    // Hide trail when dead
    if (!jet.alive && jet.trail) jet.trail.line.visible = false;
  }
}

const audio = new SoundManager();
initNPCJets();
const minimap = new Minimap(document.getElementById('minimap'));
const soundBtn = document.getElementById('sound-toggle');
const shakeBtn = document.getElementById('screenshake-toggle');
let screenShakeOn = true;
let shake = 0;


setVehicleMode(vehicleMesh, 'car');
window.__updateVehicleVisibility('car');


let joined = false;
let spawnSet = false;
let displayedMode = 'car';
let cameraView = 'chase';

const particles = createParticles(scene);
const debris = createDebris(scene);
const transformFlash = createTransformFlash(scene);

vehicle.onBounce = (vy) => {
  audio.land();
  shake = Math.min(shake + 0.5, 1);
  const pos = vehicle.position;
  for (let i = 0; i < 6; i++) {
    particles.spawn(
      new THREE.Vector3(pos.x, pos.y, pos.z),
      new THREE.Vector3((Math.random() - 0.5) * 8, Math.random() * 4, (Math.random() - 0.5) * 8),
      0.8, 0.4
    );
  }
};

vehicle.onTransformToPlane = () => sonicBoom();

let myName = 'Pilot';
let isIt = false; // tag game: are you "it"?
let itPlayerId = null; // who is currently "it"
let planeTransformTime = 0; // time spent in plane mode
const PLANE_TIME_LIMIT = 30; // seconds

function labelOpacity(dist) {
  if (dist < 140) return 1;
  if (dist >= 950) return 0.42;
  return 1 - ((dist - 140) / 810) * 0.58;
}

const remotes = new Map();

function makeLabel(name, color) {
  const measure = document.createElement('canvas').getContext('2d');
  measure.font = 'bold 18px Segoe UI, sans-serif';
  const textW = Math.ceil(measure.measureText(name).width);
  const W = Math.max(120, textW + 36);
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = 36;
  const ctx = canvas.getContext('2d');
  ctx.font = 'bold 18px Segoe UI, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineWidth = 6;
  ctx.strokeStyle = 'rgba(0,0,0,0.85)';
  ctx.strokeText(name, W / 2, 18);
  ctx.fillStyle = color;
  ctx.fillText(name, W / 2, 18);
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
      scene.remove(rp.trail.line);
      if (audio.removeSpatialSound) audio.removeSpatialSound(id);
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
    rp.trail.push(rp.curPos);

    rp.label.position.copy(rp.curPos);
    rp.label.position.y += rp.mode === 'plane' ? 11.0 : 9.0;
    rp.label.material.opacity = labelOpacity(rp.curPos.distanceTo(camera.position));
    sizeLabel(rp.label);

    animateVehicle(rp.mesh, dt, {
      mode: rp.mode, speed: s.speed || 0, nitroActive: false, steer: 0
    });

    // Update spatial sound for this remote player
    if (audio.updateSpatialSound) {
      audio.updateSpatialSound(id, rp.curPos, rp.mode, s.speed || 0);
    }
  }
  // Cleanup spatial sounds for disconnected players
  if (audio.cleanupSpatialSounds) {
    audio.cleanupSpatialSounds(new Set(remotes.keys()));
  }
}

function collidePlayers() {
  const ownIsPlane = vehicle.mode === 'plane';
  const ownR = ownIsPlane ? 3.2 : 1.9;
  let impact = 0;
  for (const [id, rp] of remotes) {
    const s = net.players.get(id);
    if (!s || s.health <= 0) continue;
    if (Math.abs(vehicle.position.y - rp.curPos.y) > 8) continue;
    const otherR = rp.mode === 'plane' ? 3.2 : 1.9;
    const dx = vehicle.position.x - rp.curPos.x;
    const dz = vehicle.position.z - rp.curPos.z;
    const rr = ownR + otherR;
    const d2 = dx * dx + dz * dz;
    if (d2 >= rr * rr || d2 < 1e-6) continue;

    const d = Math.sqrt(d2);
    const nx = dx / d;
    const nz = dz / d;
    const pen = rr - d;
    vehicle.position.x += nx * pen;
    vehicle.position.z += nz * pen;

    const vn = vehicle.velocity.x * nx + vehicle.velocity.z * nz;
    if (vn < 0) {
      vehicle.velocity.x -= nx * vn * 0.9;
      vehicle.velocity.z -= nz * vn * 0.9;
      if (ownIsPlane) vehicle.speed = Math.max(0, vehicle.speed - (-vn) * 0.5);
      impact = Math.max(impact, -vn);
    }

    // nudge the other player's visual out of the way (their server state re-asserts)
    rp.curPos.x -= nx * pen;
    rp.curPos.z -= nz * pen;
    rp.targetPos.x -= nx * pen * 0.5;
    rp.targetPos.z -= nz * pen * 0.5;

    // push the other player away with a percentage of our speed (after nudge so it isn't undone)
    const pushStrength = Math.min(Math.abs(vn) * 0.03, 10);
    const pushX = nx * pushStrength;
    const pushZ = nz * pushStrength;
    rp.curPos.x += pushX;
    rp.curPos.z += pushZ;
    rp.targetPos.x += pushX;
    rp.targetPos.z += pushZ;
    net.sendHitPlayer(id, nx, nz, Math.abs(vn));

    // Tag game: if I'm "it" and I hit someone, they become "it"
    if (isIt && s.health > 0) {
      isIt = false;
      net.sendTagTransfer(id);
      hud.showWarning('TAG! They are now IT!');
    }
  }
  return impact;
}

function ensureRemotes() {
  for (const [id, s] of net.players) {
    if (id === net.myId) continue;
    if (!remotes.has(id)) {
      const mesh = buildVehicle(s.color || '#ffffff', true);
      scene.add(mesh);
      const label = makeLabel(s.name || 'Pilot', s.color || '#ffffff');
      scene.add(label);
      const trail = createTrail(scene, s.color || '#ffffff');
      const start = new THREE.Vector3(s.x, s.y, s.z);
      const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(s.pitch, s.yaw, s.roll, 'YXZ'));
      remotes.set(id, {
        mesh, label, trail,
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

function createDebris(scene) {
  const geo = new THREE.BoxGeometry(1, 1, 1);
  const mat = new THREE.MeshStandardMaterial({ color: 0x1a1a30, roughness: 0.8, metalness: 0.1 });
  const pool = [];
  for (let i = 0; i < 70; i++) {
    const mesh = new THREE.Mesh(geo, mat);
    mesh.visible = false;
    scene.add(mesh);
    pool.push({
      mesh,
      vel: new THREE.Vector3(),
      spin: new THREE.Vector3(),
      life: 0,
      maxLife: 1
    });
  }
  let idx = 0;

  return {
    spawn(pos, w, d, h, count) {
      for (let n = 0; n < count; n++) {
        const p = pool[idx];
        idx = (idx + 1) % pool.length;
        const s = 0.6 + Math.random() * 2.2;
        p.mesh.position.set(
          pos.x + (Math.random() - 0.5) * w,
          pos.y + Math.random() * h,
          pos.z + (Math.random() - 0.5) * d
        );
        p.mesh.scale.setScalar(s);
        p.mesh.rotation.set(Math.random() * 3, Math.random() * 3, Math.random() * 3);
        p.vel.set((Math.random() - 0.5) * 30, 6 + Math.random() * 18, (Math.random() - 0.5) * 30);
        p.spin.set((Math.random() - 0.5) * 12, (Math.random() - 0.5) * 12, (Math.random() - 0.5) * 12);
        p.maxLife = 1.4 + Math.random() * 0.8;
        p.life = p.maxLife;
        p.mesh.visible = true;
      }
    },
    update(dt) {
      for (const p of pool) {
        if (p.life <= 0) continue;
        p.life -= dt;
        if (p.life <= 0) {
          p.mesh.visible = false;
          continue;
        }
        p.vel.y -= 30 * dt;
        p.mesh.position.addScaledVector(p.vel, dt);
        if (p.mesh.position.y < 1 && p.vel.y < 0) {
          p.mesh.position.y = 1;
          p.vel.y *= -0.3;
          p.vel.x *= 0.6;
          p.vel.z *= 0.6;
        }
        p.mesh.rotation.x += p.spin.x * dt;
        p.mesh.rotation.y += p.spin.y * dt;
        p.mesh.rotation.z += p.spin.z * dt;
        p.mesh.scale.setScalar(Math.max(0.01, p.maxLife > 0 ? p.life / p.maxLife : 0.01));
      }
    }
  };
}

function spawnBuildingDebris(b) {
  const count = Math.min(42, Math.max(14, Math.round((b.w * b.d * b.h) / 400)));
  debris.spawn(
    { x: b.x, y: b.h / 2, z: b.z },
    b.w, b.d, b.h, count
  );
}

function createTrail(scene, colorHex, trailLength = 40) {
  const N = trailLength;
  const posArr = new Float32Array(N * 3);
  const colArr = new Float32Array(N * 3);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(posArr, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(colArr, 3));
  geo.setDrawRange(0, 0);
  const line = new THREE.Line(geo, new THREE.LineBasicMaterial({
    vertexColors: true, transparent: true, opacity: 1.0,
    blending: THREE.AdditiveBlending, depthWrite: false
  }));
  line.frustumCulled = false;
  scene.add(line);
  const c = new THREE.Color(colorHex);
  const buf = [];
  let last = null;
  return {
    line,
    push(p) {
      if (last && p.distanceTo(last) < 0.3) return;
      last = p.clone();
      buf.push(last);
      if (buf.length > N) buf.shift();
      const n = buf.length;
      for (let i = 0; i < n; i++) {
        posArr[i * 3] = buf[i].x;
        posArr[i * 3 + 1] = buf[i].y;
        posArr[i * 3 + 2] = buf[i].z;
        const t = (i + 1) / n;
        const fade = t * t;
        colArr[i * 3] = c.r * fade;
        colArr[i * 3 + 1] = c.g * fade;
        colArr[i * 3 + 2] = c.b * fade;
      }
      geo.attributes.position.needsUpdate = true;
      geo.attributes.color.needsUpdate = true;
      geo.setDrawRange(0, n);
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

function sonicBoom() {
  audio.boomSfx();
  shake = Math.min(shake + 1.2, 2.4);
  transformFlash.life = 0.5;
}

const MISSILE_SPEED = 55;
const MISSILE_TURN = 2.6;
const MISSILE_LIFE = 3.0;
const MISSILE_LOCK_RANGE = 900;

const projectiles = [];
let localMissileId = 0;
const missileLook = new THREE.Vector3();
const missileCur = new THREE.Vector3();
const missileDesired = new THREE.Vector3();

function spawnProjectile(x, y, z, vx, vy, vz, color, isMine, targetId, id) {
  const mesh = buildMissile(color);
  mesh.position.set(x, y, z);
  missileLook.set(x + vx, y + vy, z + vz);
  mesh.lookAt(missileLook);
  scene.add(mesh);
  projectiles.push({
    id: id || 'mine' + (++localMissileId),
    mesh,
    pos: new THREE.Vector3(x, y, z),
    vel: new THREE.Vector3(vx, vy, vz),
    targetId: targetId || null,
    life: MISSILE_LIFE,
    isMine
  });
}

function removeProjectile(id) {
  for (let i = projectiles.length - 1; i >= 0; i--) {
    if (projectiles[i].id === id) {
      scene.remove(projectiles[i].mesh);
      projectiles.splice(i, 1);
      return;
    }
  }
}

function homeMissile(p, dt) {
  if (!p.targetId) return;
  let tx, ty, tz;
  if (p.targetId === net.myId) {
    tx = vehicle.position.x;
    ty = vehicle.position.y;
    tz = vehicle.position.z;
  } else {
    const s = net.players.get(p.targetId);
    if (!s || s.health <= 0) return;
    tx = s.x; ty = s.y; tz = s.z;
  }
  missileDesired.set(tx - p.pos.x, ty - p.pos.y, tz - p.pos.z);
  const dlen = missileDesired.length();
  if (dlen < 0.001) return;
  missileDesired.divideScalar(dlen);
  missileCur.copy(p.vel).normalize();
  const dot = Math.max(-1, Math.min(1, missileCur.dot(missileDesired)));
  const omega = Math.acos(dot);
  if (omega < 1e-4) return;
  const t = Math.min(1, (MISSILE_TURN * dt) / omega);
  const sinO = Math.sin(omega);
  const s0 = Math.sin((1 - t) * omega) / sinO;
  const s1 = Math.sin(t * omega) / sinO;
  p.vel.set(
    missileCur.x * s0 + missileDesired.x * s1,
    missileCur.y * s0 + missileDesired.y * s1,
    missileCur.z * s0 + missileDesired.z * s1
  ).multiplyScalar(MISSILE_SPEED);
}

function updateProjectiles(dt) {
  for (let i = projectiles.length - 1; i >= 0; i--) {
    const p = projectiles[i];
    p.life -= dt;
    if (p.life <= 0) {
      scene.remove(p.mesh);
      projectiles.splice(i, 1);
      continue;
    }
    homeMissile(p, dt);
    p.pos.addScaledVector(p.vel, dt);
    p.mesh.position.copy(p.pos);
    missileLook.copy(p.pos).add(p.vel);
    p.mesh.lookAt(missileLook);
  }
}

net.onProjectile = (data) => {
  spawnProjectile(data.x, data.y, data.z, data.vx, data.vy, data.vz, data.color, false, data.targetId, data.id);
};

net.onProjectileRemove = (data) => {
  removeProjectile(data.id);
};

net.onHit = (data) => {
  if (data.targetId === net.myId) {
    vehicle.health = data.health;
    shake = Math.min(shake + 0.7, 1.2);
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

net.onBreak = (data) => {
  breakBuildingByIdx(data.idx);
};

net.onPlayerPushed = (data) => {
  const rp = remotes.get(data.id);
  if (!rp) return;
  rp.curPos.x += data.pushX;
  rp.curPos.z += data.pushZ;
  rp.targetPos.x += data.pushX;
  rp.targetPos.z += data.pushZ;
};

net.onTagTransferred = (data) => {
  if (data.newItId === net.myId) {
    isIt = true;
    hud.showWarning('YOU ARE IT! Tag someone else!');
  } else {
    isIt = false;
  }
  itPlayerId = data.newItId;
};

const lookTarget = new THREE.Vector3();
const fwdTmp = new THREE.Vector3();

function updateCamera(dt) {
  shake = Math.max(0, shake - dt * 1.6);
  const speedShake = Math.min(0.06, vehicle.speed * 0.0003);
  const amp = (screenShakeOn ? shake : 0) + (screenShakeOn ? speedShake : 0);
  const fwd = vehicle.forward;
  const mode = vehicle.mode;

  if (cameraView === 'cockpit') {
    const quat = new THREE.Quaternion().setFromEuler(new THREE.Euler(vehicle.pitch, vehicle.yaw, vehicle.roll, 'YXZ'));
    camera.quaternion.copy(quat);
    const upOff = mode === 'plane' ? 0.95 : 1.05;
    camera.position.copy(vehicle.position);
    camera.position.y += upOff;
    camera.position.addScaledVector(fwd, 0.55);
    if (amp > 0.01) {
      camera.position.x += (Math.random() - 0.5) * amp * 0.9;
      camera.position.y += (Math.random() - 0.5) * amp * 0.8;
      camera.position.z += (Math.random() - 0.5) * amp * 0.9;
    }
    const fov = 62 + Math.min(18, vehicle.speed * 0.18);
    if (Math.abs(camera.fov - fov) > 0.1) {
      camera.fov += (fov - camera.fov) * (1 - Math.exp(-dt * 3));
      camera.updateProjectionMatrix();
    }
    return;
  }

  const backDist = mode === 'plane' ? 20 : 10;
  const height = mode === 'plane' ? 8 : 5.2;
  fwdTmp.set(fwd.x, 0, fwd.z).normalize();

  const desired = new THREE.Vector3();
  desired.copy(vehicle.position).addScaledVector(fwdTmp, -backDist);
  desired.y = vehicle.position.y + height;
  if (desired.y < 1.2) desired.y = 1.2;

  camera.position.lerp(desired, 1 - Math.exp(-dt * 5));
  if (amp > 0.01) {
    camera.position.x += (Math.random() - 0.5) * amp * 0.9;
    camera.position.y += (Math.random() - 0.5) * amp * 0.8;
    camera.position.z += (Math.random() - 0.5) * amp * 0.9;
  }

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
  shake = Math.min(shake + (vehicle.nextMode === 'plane' ? 0.8 : 0.3), 1);
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

input.onCaptureSpawn = () => {
  if (!joined) return;
  const yawDeg = Math.round(vehicle.yaw * 180 / Math.PI);
  const info = `SPAWN_X=${Math.round(vehicle.position.x)} SPAWN_Z=${Math.round(vehicle.position.z)} SPAWN_YAW=${yawDeg}`;
  navigator.clipboard.writeText(info).then(() => {
    console.log('Spawn captured:', info);
    const el = document.getElementById('spawn-capture');
    if (el) { el.textContent = info; el.classList.remove('hidden'); setTimeout(() => el.classList.add('hidden'), 4000); }
  }).catch(() => {
    console.log('Spawn position:', info);
  });
};

input.onShoot = () => {
  if (!joined) return;
  if (!vehicle.canShoot()) return;
  vehicle.shoot();

  const fwd = vehicle.forward;
  const muzzle = vehicle.position.clone().addScaledVector(fwd, 2);

  let targetId = null;
  let bestDist = Infinity;
  for (const [id, s] of net.players) {
    if (id === net.myId || s.health <= 0) continue;
    const ddx = s.x - muzzle.x;
    const ddy = s.y - muzzle.y;
    const ddz = s.z - muzzle.z;
    const d = Math.sqrt(ddx * ddx + ddy * ddy + ddz * ddz);
    if (d < bestDist) { bestDist = d; targetId = id; }
  }
  if (bestDist > MISSILE_LOCK_RANGE) targetId = null;

  let vx, vy, vz;
  if (targetId) {
    const s = net.players.get(targetId);
    const ddx = s.x - muzzle.x;
    const ddy = s.y - muzzle.y;
    const ddz = s.z - muzzle.z;
    const len = Math.sqrt(ddx * ddx + ddy * ddy + ddz * ddz) || 1;
    vx = ddx / len * MISSILE_SPEED;
    vy = ddy / len * MISSILE_SPEED;
    vz = ddz / len * MISSILE_SPEED;
  } else {
    vx = fwd.x * MISSILE_SPEED;
    vy = fwd.y * MISSILE_SPEED;
    vz = fwd.z * MISSILE_SPEED;
  }

  spawnProjectile(muzzle.x, muzzle.y, muzzle.z, vx, vy, vz, '#33ccff', true, targetId);

  net.sendShoot(muzzle.x, muzzle.y, muzzle.z, vx, vy, vz, targetId);

  for (let i = 0; i < 4; i++) {
    particles.spawn(
      muzzle.clone().add(new THREE.Vector3(
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

soundBtn.addEventListener('click', () => {
  input.onMute();
  soundBtn.blur();
});

function setMotionBlur(on) { }

function setScreenShake(on) {
  if (!on) shake = 0;
}

shakeBtn.addEventListener('click', () => {
  setScreenShake(!screenShakeOn);
  shakeBtn.blur();
});

function updateOwnVisual(dt) {
  vehicleMesh.position.copy(vehicle.position);
  vehicleMesh.rotation.set(vehicle.pitch, vehicle.yaw, vehicle.roll, 'YXZ');

  if (vehicle.invulnerable) {
    vehicleMesh.visible = Math.floor(performance.now() / 80) % 2 === 0;
  } else {
    vehicleMesh.visible = cameraView === 'chase';
  }

  // Plane time limit countdown
  if (displayedMode === 'plane' && !vehicle.transforming) {
    planeTransformTime += dt;
    if (planeTransformTime >= PLANE_TIME_LIMIT) {
      // Force transform back to car
      vehicle.transform();
      audio.transform('car');
      net.sendTransform('car');
      planeTransformTime = 0;
      hud.showWarning('Plane time expired!');
    }
  } else if (displayedMode === 'car') {
    planeTransformTime = 0;
  }

  if (vehicle.transforming) {
    const p = vehicle.transformProgress;
    const scale = 1 - 0.38 * Math.sin(p * Math.PI);
    vehicleMesh.scale.setScalar(Math.max(0.1, scale));
    if (p >= 0.5 && displayedMode !== vehicle.nextMode) {
      displayedMode = vehicle.nextMode;
      setVehicleMode(vehicleMesh, displayedMode);
      window.__updateVehicleVisibility(displayedMode);
      transformFlash.life = 0.5;
    }
  } else if (displayedMode !== vehicle.mode) {
    displayedMode = vehicle.mode;
    setVehicleMode(vehicleMesh, displayedMode);
    window.__updateVehicleVisibility(displayedMode);
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
      if (displayedMode === 'car') pos.y = 0.55;
      if (displayedMode === 'plane') pos.y += 1.5;
      const vel = fwd.clone().multiplyScalar(-28).add(new THREE.Vector3(
        (Math.random() - 0.5) * 4, Math.random() * 3, (Math.random() - 0.5) * 4
      ));
      particles.spawn(pos, vel, 1.8, 0.5);
    }
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
  hud.setPlayerName(myName);
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


net.onConnected = () => {
  
  hud.setConnected();
};
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
      camera.position.set(vehicle.position.x, vehicle.position.y + 20, vehicle.position.z);
      lookTarget.copy(vehicle.position);
    }
  }

  const ctrl = readInput();

  // jump ramps: launch the car when it drives fast up a ramp
  if (vehicle.mode === 'car' && !vehicle.transforming && !vehicle.carFalling && world.ramps) {
    for (const ramp of world.ramps) {
      const dx = vehicle.position.x - ramp.x;
      const dz = vehicle.position.z - ramp.z;
      if (dx * dx + dz * dz < ramp.radius * ramp.radius) {
        const speed = Math.hypot(vehicle.velocity.x, vehicle.velocity.z);
        if (speed > 18) {
          rampJumpCount++;
          vehicle.carFalling = true;
          // every 3rd ramp jump gets the full boost launch
          if (rampJumpCount % 3 === 0) {
            const fwd = vehicle.forward;
            vehicle.velocity.addScaledVector(fwd, 50);
            vehicle.velocity.y = 26;
            if (audio.launchSfx) audio.launchSfx();
          } else {
            vehicle.velocity.y = 13;
          }
          break;
        }
      }
    }
  }

  vehicle.update(ctrl, dt);

  const impact = collideCar(vehicle);
  if (impact > 20) {
    shake = Math.min(shake + Math.min(0.5, impact / 120), 2.4);
    audio.crashSfx(impact);
  }
  if (breakState.building) {
    const b = breakState.building;
    spawnBuildingDebris(b);
    audio.breakSfx();
    shake = Math.min(shake + 0.8, 2.4);
    net.sendBreak(b.idx);
    breakState.building = null;
  }

  const vImpact = collidePlayers();
  if (vImpact > 15) {
    shake = Math.min(shake + Math.min(0.4, vImpact / 150), 2.4);
    audio.crashSfx(vImpact);
  }

  ensureRemotes();
  syncRemotes(dt);
  updateEdgeTags();

  updateOwnVisual(dt);
  updateCamera(dt);
  particles.update(dt);
  debris.update(dt);
  updateProjectiles(dt);
  updateWorld(world, dt);
  updateNPCJets(dt);

  const others = Array.from(net.players.values()).filter((p) => p.id !== net.myId);
  minimap.update(vehicle, others);

  audio.resume();
  audio.updateListener(vehicle.position, vehicle.yaw, vehicle.pitch);
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

  const blurBase = Math.max(0, (vehicle.speed - 1000) / 1500);
  const blurScale = vehicle.mode === 'plane' ? 1.3 : 0.7;
  const blurAmt = Math.min(0.03, Math.max(0, blurBase * blurScale));

  if (blurAmt > 0.01) {
    renderer.setRenderTarget(blurRT);
    renderer.render(scene, camera);
    renderer.setRenderTarget(null);
    blurMat.uniforms.tDiffuse.value = blurRT.texture;
    blurMat.uniforms.uAmount.value = blurAmt;
    renderer.render(blurScene, blurCamera);
  } else {
    renderer.render(scene, camera);
  }
}

setInterval(() => {
  if (!joined) return;
  const dist = Math.sqrt(vehicle.position.x ** 2 + vehicle.position.z ** 2);
  if (dist > WORLD_RADIUS - 200) hud.showWarning('RETURN TO THE GRID');
}, 1500);

animate();
