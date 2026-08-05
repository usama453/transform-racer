import * as THREE from 'three';
import { WORLD_RADIUS } from './vehicle.js';

export const CITY_GRID = 26;
export const CITY_BLOCK = 150;
export const CITY_STREET = 90;
export const CITY_PITCH = CITY_BLOCK + CITY_STREET;
export const CITY_HALF = (CITY_GRID * CITY_PITCH) / 2;

// deterministic RNG so every client builds the identical city (required for break-by-index sync)
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// static world colliders (2D AABBs, h = obstacle height for plane checks); the car always collides
const colliders = [];
function addCollider(x0, z0, x1, z1, bIdx, h) {
  colliders.push({ x0, z0, x1, z1, bIdx, h, dead: false });
}

// breakable city buildings (instanced) + their render meshes
const cityBuildings = [];
const instMeshes = [];
const broken = new Set();
export const breakState = { building: null };

const BREAK_IMPACT = 32;
const CAR_RADIUS = 1.9;
const PLANE_RADIUS = 3.2;
const _m4 = new THREE.Matrix4();
const _quat = new THREE.Quaternion();
const _pos = new THREE.Vector3();
const _scl = new THREE.Vector3();

function hideInstance(idx) {
  const b = cityBuildings[idx];
  if (!b) return;
  _scl.set(0, 0, 0);
  _pos.set(b.x, b.h / 2, b.z);
  _m4.compose(_pos, _quat, _scl);
  for (const m of instMeshes) {
    m.setMatrixAt(idx, _m4);
    m.instanceMatrix.needsUpdate = true;
  }
}

function breakBuilding(idx) {
  if (broken.has(idx)) return null;
  const b = cityBuildings[idx];
  if (!b) return null;
  broken.add(idx);
  hideInstance(idx);
  return b;
}

// used by the network layer to sync destruction from other players
export function breakBuildingByIdx(idx) {
  if (!breakBuilding(idx)) return;
  for (const c of colliders) {
    if (c.bIdx === idx) c.dead = true;
  }
}

function obstacleTop(c) {
  return c.bIdx !== undefined ? cityBuildings[c.bIdx].h : (c.h ?? 100000);
}

export function collideCar(vehicle) {
  if (vehicle.carFalling) return 0;
  const isPlane = vehicle.mode === 'plane';
  const r = isPlane ? PLANE_RADIUS : CAR_RADIUS;
  const restitution = isPlane ? 1.0 : 1.35;
  const px = vehicle.position.x;
  const pz = vehicle.position.z;
  let impact = 0;
  for (const c of colliders) {
    if (c.dead) continue;
    // planes fly over buildings shorter than their altitude
    if (isPlane && vehicle.position.y >= obstacleTop(c)) continue;

    const cx = Math.max(c.x0, Math.min(px, c.x1));
    const cz = Math.max(c.z0, Math.min(pz, c.z1));
    const dx = px - cx;
    const dz = pz - cz;
    const d2 = dx * dx + dz * dz;
    if (d2 >= r * r) continue;

    let nx, nz, pen;
    if (d2 > 1e-6) {
      const d = Math.sqrt(d2);
      nx = dx / d;
      nz = dz / d;
      pen = r - d;
    } else {
      const left = px - c.x0, right = c.x1 - px, near = pz - c.z0, far = c.z1 - pz;
      const m = Math.min(left, right, near, far);
      if (m === left) { nx = -1; nz = 0; pen = r + left; }
      else if (m === right) { nx = 1; nz = 0; pen = r + right; }
      else if (m === near) { nx = 0; nz = -1; pen = r + near; }
      else { nx = 0; nz = 1; pen = r + far; }
    }

    vehicle.position.x += nx * pen;
    vehicle.position.z += nz * pen;

    // kill the velocity component heading into the wall, slide the rest
    const vn = vehicle.velocity.x * nx + vehicle.velocity.z * nz;
    if (vn < 0) {
      vehicle.velocity.x -= nx * vn * restitution;
      vehicle.velocity.z -= nz * vn * restitution;
      impact = Math.max(impact, -vn);
      // plane speed is rebuilt from `speed` every frame, so bleed it directly
      if (isPlane) vehicle.speed = Math.max(0, vehicle.speed - (-vn) * 0.6);
      if (c.bIdx !== undefined && -vn > BREAK_IMPACT) {
        c.dead = true;
        const b = breakBuilding(c.bIdx);
        if (b) {
          b.idx = c.bIdx;
          breakState.building = b;
        }
      }
    }
  }
  return impact;
}

export function createWorld(scene) {
  scene.background = new THREE.Color(0x000203);
  scene.fog = new THREE.Fog(0x000307, 300, 9000);

  const hemi = new THREE.HemisphereLight(0x3355aa, 0x0a0c18, 0.95);
  scene.add(hemi);

  const sun = new THREE.DirectionalLight(0x6699cc, 0.7);
  sun.position.set(400, 700, 300);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -500;
  sun.shadow.camera.right = 500;
  sun.shadow.camera.top = 500;
  sun.shadow.camera.bottom = -500;
  sun.shadow.camera.far = 1500;
  scene.add(sun);

  const ambient = new THREE.AmbientLight(0x222244, 0.45);
  scene.add(ambient);

  const ground = makeGround();
  scene.add(ground);

  scene.add(makeRunway());
  scene.add(makePlaza());
  buildCity(scene);
  addRoads(scene);
  scatterTrees(scene);
  buildMountains(scene);
  addNeonGridLines(scene);
  buildCanyon(scene);
  const spireBeam = buildLandmarks(scene);
  const searchlights = buildSearchlights(scene);
  const billboards = buildBillboards(scene);
  const ferris = buildFerrisWheel(scene);
  const ramps = buildJumpRamps(scene);
  const megaTower = buildMegaTower(scene);

  const clouds = buildClouds();
  scene.add(clouds);

  const skyGroup = buildSky();
  scene.add(skyGroup);

  return { sun, clouds, skyGroup, spireBeam, searchlights, billboards, ferris, ramps, megaTower };
}

function makeGround() {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#12121e';
  ctx.fillRect(0, 0, 512, 512);

  const step = 64;
  for (let y = 0; y < 512; y += step) {
    for (let x = 0; x < 512; x += step) {
      if ((x / step + y / step) % 2 === 0) {
        ctx.fillStyle = '#141426';
        ctx.fillRect(x, y, step, step);
      }
    }
  }

  ctx.strokeStyle = 'rgba(0, 180, 255, 0.12)';
  ctx.lineWidth = 1.5;
  for (let i = 0; i <= 512; i += step) {
    ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, 512); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(512, i); ctx.stroke();
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(90, 90);
  tex.anisotropy = 8;

  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(WORLD_RADIUS * 2, WORLD_RADIUS * 2),
    new THREE.MeshStandardMaterial({
      map: tex, roughness: 0.95, metalness: 0.05,
      polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 2
    })
  );
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = 0;
  mesh.receiveShadow = true;
  return mesh;
}

function addNeonGridLines(scene) {
  const lineMat = new THREE.LineBasicMaterial({ color: 0x00bbff, transparent: true, opacity: 0.15 });
  const lineGeo = new THREE.BufferGeometry();
  const pts = [];
  const spacing = 80;
  const extent = WORLD_RADIUS;
  for (let v = -extent; v <= extent; v += spacing) {
    pts.push(-extent, 0.3, v, extent, 0.3, v);
    pts.push(v, 0.3, -extent, v, 0.3, extent);
  }
  lineGeo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
  const lines = new THREE.LineSegments(lineGeo, lineMat);
  scene.add(lines);
}

function buildCanyon(scene) {
  const ROCK = new THREE.MeshStandardMaterial({ color: 0x0a0a1c, roughness: 0.95, flatShading: true });
  const ROCK_LITE = new THREE.MeshStandardMaterial({ color: 0x0f0f28, roughness: 0.9, flatShading: true });
  const EDGE = new THREE.MeshBasicMaterial({ color: 0x00ccff, transparent: true, opacity: 0.5 });
  const STRIP = new THREE.MeshBasicMaterial({ color: 0x00ff88, transparent: true, opacity: 0.35 });

  const LEN = 2600;
  const H = 200;
  const TH = 110;
  const GAP = 110;
  const CZ = -5200;

  const box = (l, h, t) => new THREE.BoxGeometry(l, h, t);
  for (const side of [-1, 1]) {
    const z = CZ + side * (GAP / 2 + TH / 2);
    addCollider(-LEN / 2, z - TH / 2, LEN / 2, z + TH / 2, undefined, H);
    const wall = new THREE.Mesh(box(LEN, H, TH), ROCK);
    wall.position.set(0, H / 2, z);
    wall.castShadow = true;
    wall.receiveShadow = true;
    scene.add(wall);

    const face = new THREE.Mesh(box(LEN, H, 2), ROCK_LITE);
    face.position.set(0, H / 2, z - side * (TH / 2 - 1));
    scene.add(face);

    const rim = new THREE.Mesh(box(LEN, 1.2, TH), EDGE);
    rim.position.set(0, H + 0.6, z);
    scene.add(rim);

    const strip = new THREE.Mesh(box(LEN, 0.5, 0.8), STRIP);
    strip.position.set(0, 2.5, z - side * (GAP / 2 - 2));
    scene.add(strip);
  }

  // neon entry arches at both ends
  const ARCH = new THREE.MeshBasicMaterial({ color: 0x00ccff, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending });
  for (const end of [-LEN / 2, LEN / 2]) {
    for (const side of [-1, 1]) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(4, H + 26, 4), ARCH);
      post.position.set(0, (H + 26) / 2, CZ + side * (GAP / 2 + 30));
      scene.add(post);
    }
    const beam = new THREE.Mesh(new THREE.BoxGeometry(GAP + 60, 3, 3), ARCH);
    beam.position.set(0, H + 24, end);
    scene.add(beam);
  }
}

function buildLandmarks(scene) {
  const neonColors = [0x00ccff, 0xff00ff, 0x00ff88, 0xffaa00];
  const towers = [
    { x: -4100, z: 3500, w: 26, d: 26, h: 300 },
    { x: -3950, z: 3350, w: 18, d: 18, h: 220 },
    { x: -3950, z: 3650, w: 18, d: 18, h: 260 },
    { x: -4250, z: 3350, w: 14, d: 14, h: 180 },
    { x: -4250, z: 3650, w: 14, d: 14, h: 200 }
  ];
  for (const t of towers) {
    addCollider(t.x - t.w / 2, t.z - t.d / 2, t.x + t.w / 2, t.z + t.d / 2, undefined, t.h);
    const neon = neonColors[Math.floor(Math.random() * neonColors.length)];
    const body = new THREE.Mesh(
      new THREE.BoxGeometry(t.w, t.h, t.d),
      new THREE.MeshStandardMaterial({ color: 0x080810, roughness: 0.75, metalness: 0.2 })
    );
    body.position.set(t.x, t.h / 2, t.z);
    body.castShadow = true;
    scene.add(body);

    const glass = new THREE.Mesh(
      new THREE.BoxGeometry(t.w * 0.6, t.h * 0.75, t.d * 0.6),
      new THREE.MeshStandardMaterial({ color: 0x0a1628, roughness: 0.2, metalness: 0.7, transparent: true, opacity: 0.5, emissive: 0x000c1c, emissiveIntensity: 0.3 })
    );
    glass.position.set(t.x, t.h * 0.5, t.z);
    scene.add(glass);

    const strokeMat = new THREE.MeshBasicMaterial({
      color: neon,
      side: THREE.BackSide,
      transparent: true,
      opacity: 0.35,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });
    const stroke = new THREE.Mesh(new THREE.BoxGeometry(t.w * 1.015, t.h * 1.015, t.d * 1.015), strokeMat);
    stroke.position.set(t.x, t.h / 2, t.z);
    scene.add(stroke);

    const edge = new THREE.Mesh(
      new THREE.BoxGeometry(t.w + 0.4, 0.4, t.d + 0.4),
      new THREE.MeshBasicMaterial({ color: neon, transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending })
    );
    edge.position.set(t.x, t.h + 0.2, t.z);
    scene.add(edge);
  }

  // central spire + animated light beam
  const spire = new THREE.Mesh(
    new THREE.CylinderGeometry(2, 6, 120, 10),
    new THREE.MeshStandardMaterial({ color: 0x1a1a3a, metalness: 0.7, roughness: 0.3 })
  );
  spire.position.set(-4100, 60, 3500);
  scene.add(spire);

  const tip = new THREE.Mesh(new THREE.SphereGeometry(3, 16, 16), new THREE.MeshBasicMaterial({ color: 0x00ffff }));
  tip.position.set(-4100, 122, 3500);
  scene.add(tip);

  const beamMat = new THREE.MeshBasicMaterial({
    color: 0x00ccff, transparent: true, opacity: 0.12,
    blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide
  });
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(3, 11, 900, 12, 1, true), beamMat);
  beam.position.set(-4100, 500, 3500);
  scene.add(beam);

  const spot = new THREE.PointLight(0x00ccff, 400, 800);
  spot.position.set(-4100, 125, 3500);
  scene.add(spot);

  return beam;
}

function buildFerrisWheel(scene) {
  const group = new THREE.Group();
  const R = 70;
  const X = 3700, Z = -3400, Y = 84;

  const frameMat = new THREE.MeshBasicMaterial({ color: 0x1a2a3a });
  const neonMat = new THREE.MeshBasicMaterial({ color: 0x00ccff, transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending });

  const rim = new THREE.Mesh(new THREE.TorusGeometry(R, 1.6, 8, 48), neonMat);
  group.add(rim);

  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    const spoke = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 0.8, R * 2, 6), frameMat);
    spoke.rotation.z = a;
    group.add(spoke);
  }

  const hub = new THREE.Mesh(new THREE.CylinderGeometry(5, 5, 4, 12), neonMat);
  group.add(hub);

  const gondolas = [];
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2;
    const g = new THREE.Mesh(
      new THREE.BoxGeometry(5, 6, 5),
      new THREE.MeshStandardMaterial({ color: 0x222244, emissive: 0x003355, emissiveIntensity: 1.2 })
    );
    g.position.set(Math.cos(a) * R, Math.sin(a) * R, 0);
    group.add(g);
    gondolas.push(g);
  }
  group.userData.gondolas = gondolas;

  const supMat = new THREE.MeshStandardMaterial({ color: 0x14142a, roughness: 0.8 });
  for (const side of [-1, 1]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(3, Y - 30, 3), supMat);
    leg.position.set(X + side * R * 0.55, (Y - 30) / 2, Z);
    scene.add(leg);
  }

  group.position.set(X, Y, Z);
  scene.add(group);
  return group;
}

function buildSearchlights(scene) {
  const list = [];
  const coneMat = new THREE.MeshBasicMaterial({
    color: 0x88ccff, transparent: true, opacity: 0.08,
    blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide
  });
  const spots = [
    { x: 120, z: 130, h: 90, speed: 0.5, dir: 1 },
    { x: -130, z: 150, h: 110, speed: 0.35, dir: -1 },
    { x: 0, z: -170, h: 130, speed: 0.45, dir: 1 }
  ];
  for (const s of spots) {
    const g = new THREE.Group();
    g.position.set(s.x, s.h, s.z);
    const cone = new THREE.Mesh(new THREE.CylinderGeometry(4, 90, 600, 12, 1, true), coneMat);
    cone.position.y = 300;
    cone.rotation.x = 0.5;
    g.add(cone);
    scene.add(g);
    list.push({ group: g, speed: s.speed, dir: s.dir });
  }
  return list;
}

function buildBillboards(scene) {
  const list = [];
  const signs = [
    { x: 60, z: 180, h: 26, color: 0xff00ff },
    { x: -170, z: 60, h: 22, color: 0x00ff88 },
    { x: 170, z: -120, h: 28, color: 0xffaa00 },
    { x: -40, z: -160, h: 24, color: 0x00ccff }
  ];
  for (const s of signs) {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.9, s.h, 6), new THREE.MeshStandardMaterial({ color: 0x16162c }));
    pole.position.set(s.x, s.h / 2, s.z);
    scene.add(pole);

    const mat = new THREE.MeshBasicMaterial({ color: s.color, transparent: true, opacity: 0.8 });
    const board = new THREE.Mesh(new THREE.PlaneGeometry(16, 8), mat);
    board.position.set(s.x, s.h + 4, s.z);
    board.rotation.y = Math.random() * Math.PI;
    scene.add(board);
    list.push({ mesh: board, phase: Math.random() * 6.28 });
  }
  return list;
}

function buildJumpRamps(scene) {
  const list = [];
  // intersection indices (k, l) -> world x,z at -HALF + k*PITCH
  const pairs = [
    [12, 12], [14, 12], [12, 14], [14, 14],
    [10, 10], [16, 10], [10, 16], [16, 16],
    [7, 13], [19, 13], [13, 7], [13, 19]
  ];
  const headings = [0.7, -0.5, 2.4, -2.2, 1.1, -1.3, 2.9, -2.6, 0.2, 3.0, -1.8, 0.9];
  const ramps = pairs.map((p, i) => ({
    x: -CITY_HALF + p[0] * CITY_PITCH,
    z: -CITY_HALF + p[1] * CITY_PITCH,
    heading: headings[i % headings.length]
  }));
  const deckMat = new THREE.MeshStandardMaterial({ color: 0x12122a, roughness: 0.8 });
  const chevMat = new THREE.MeshBasicMaterial({ color: 0x00ff88, transparent: true, opacity: 0.9 });
  for (const r of ramps) {
    const g = new THREE.Group();
    const deck = new THREE.Mesh(new THREE.BoxGeometry(16, 2, 30), deckMat);
    deck.position.set(0, 1.5, 0);
    deck.rotation.x = 0.35;
    g.add(deck);

    for (let i = 0; i < 3; i++) {
      const c = new THREE.Mesh(new THREE.PlaneGeometry(8, 2), chevMat);
      c.position.set(0, 3.05, -6 + i * 6);
      c.rotation.x = 0.35;
      g.add(c);
    }

    const sideMat = new THREE.MeshBasicMaterial({ color: 0x00ccff, transparent: true, opacity: 0.6 });
    for (const sd of [-8, 8]) {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(0.5, 1.4, 30), sideMat);
      rail.position.set(sd, 2.2, 0);
      rail.rotation.x = 0.35;
      g.add(rail);
    }

    g.position.set(r.x, 0, r.z);
    g.rotation.y = r.heading;
    scene.add(g);
    list.push({ x: r.x, z: r.z, heading: r.heading, radius: 11 });
  }
  return list;
}

function makeRunway() {
  const group = new THREE.Group();
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 512;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#0a0a14';
  ctx.fillRect(0, 0, 128, 512);
  ctx.fillStyle = '#00ccff';
  for (let y = 0; y < 512; y += 64) ctx.fillRect(56, y, 16, 40);
  ctx.strokeStyle = '#005580';
  ctx.lineWidth = 4;
  ctx.beginPath(); ctx.moveTo(20, 0); ctx.lineTo(20, 512); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(108, 0); ctx.lineTo(108, 512); ctx.stroke();

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(1, 4);
  const runway = new THREE.Mesh(
    new THREE.PlaneGeometry(30, 400),
    new THREE.MeshStandardMaterial({
      map: tex, roughness: 0.9,
      polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1
    })
  );
  runway.rotation.x = -Math.PI / 2;
  runway.position.set(0, 0.18, 0);
  runway.receiveShadow = true;
  group.add(runway);

  const edgeMat = new THREE.MeshBasicMaterial({ color: 0x00ccff, transparent: true, opacity: 0.5 });
  for (const side of [-15, 15]) {
    const edge = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.1, 400), edgeMat);
    edge.position.set(side, 0.26, 0);
    group.add(edge);
  }

  return group;
}

function makePlaza() {
  const group = new THREE.Group();
  addCollider(-7, -7, 7, 7, undefined, 40);
  const plaza = new THREE.Mesh(
    new THREE.CircleGeometry(120, 48),
    new THREE.MeshStandardMaterial({
      color: 0x0e0e20, roughness: 0.85,
      polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1
    })
  );
  plaza.rotation.x = -Math.PI / 2;
  plaza.position.set(0, 0.05, 0);
  plaza.receiveShadow = true;
  group.add(plaza);

  const pad = new THREE.Mesh(
    new THREE.CircleGeometry(40, 48),
    new THREE.MeshStandardMaterial({
      color: 0x12122a, roughness: 0.7,
      polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1
    })
  );
  pad.rotation.x = -Math.PI / 2;
  pad.position.set(0, 0.10, 0);
  pad.receiveShadow = true;
  group.add(pad);

  const ring = new THREE.Mesh(
    new THREE.RingGeometry(118, 122, 48),
    new THREE.MeshBasicMaterial({
      color: 0x00aaff, transparent: true, opacity: 0.4, side: THREE.DoubleSide,
      polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1
    })
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.set(0, 0.14, 0);
  group.add(ring);

  const tower = new THREE.Mesh(
    new THREE.CylinderGeometry(4, 6, 40, 12),
    new THREE.MeshStandardMaterial({ color: 0x1a1a3a, metalness: 0.6, roughness: 0.3 })
  );
  tower.position.set(0, 20, 0);
  tower.castShadow = true;
  group.add(tower);

  const beacon = new THREE.Mesh(
    new THREE.SphereGeometry(2.5, 16, 16),
    new THREE.MeshStandardMaterial({ color: 0x00eeff, emissive: 0x00eeff, emissiveIntensity: 2.0 })
  );
  beacon.position.set(0, 42, 0);
  group.add(beacon);

  const light = new THREE.PointLight(0x00eeff, 300, 350);
  light.position.set(0, 42, 0);
  group.add(light);

  return group;
}

function buildMegaTower(scene) {
  const X = 285, Z = 45;
  const SH = 1700;
  const DECK = SH + 14;
  const PR = 120;

  const bodyMat = new THREE.MeshStandardMaterial({ color: 0x14142a, roughness: 0.6, metalness: 0.35 });
  const deckMat = new THREE.MeshStandardMaterial({ color: 0x0a0a1c, roughness: 0.8, metalness: 0.2, flatShading: true });
  const cyanMat = new THREE.MeshBasicMaterial({ color: 0x00e5ff, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false });
  const greenMat = new THREE.MeshBasicMaterial({ color: 0x22ff88, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false });
  const purpleMat = new THREE.MeshBasicMaterial({ color: 0xb44dff, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false });

  addCollider(X - 30, Z - 30, X + 30, Z + 30, undefined, DECK);

  const g = new THREE.Group();
  g.position.set(X, 0, Z);

  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(14, 26, SH, 10, 1, false), bodyMat);
  shaft.position.y = SH / 2;
  shaft.castShadow = true;
  shaft.receiveShadow = true;
  g.add(shaft);

  const stripMat = new THREE.MeshBasicMaterial({ color: 0x00ccff, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false });
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2;
    const strip = new THREE.Mesh(new THREE.BoxGeometry(1.6, SH * 0.92, 1.6), stripMat);
    strip.position.set(Math.cos(a) * 21, SH * 0.46, Math.sin(a) * 21);
    g.add(strip);
  }

  const ringGeo = new THREE.TorusGeometry(1, 1.4, 8, 40);
  const rings = [];
  let ri = 0;
  for (let y = 140; y <= SH - 60; y += 210) {
    ri++;
    const t = y / SH;
    const r = 26 + (14 - 26) * t;
    const ring = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({
      color: ri % 2 === 0 ? 0x00e5ff : 0xb44dff,
      transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false
    }));
    ring.rotation.x = Math.PI / 2;
    ring.scale.set(r, r, 1);
    ring.position.y = y;
    g.add(ring);
    rings.push(ring);
  }

  const deck = new THREE.Mesh(new THREE.CylinderGeometry(PR, PR * 0.86, 14, 48), deckMat);
  deck.position.y = SH + 7;
  deck.castShadow = true;
  g.add(deck);

  const underRing = new THREE.Mesh(new THREE.TorusGeometry(PR * 0.9, 1.6, 8, 60), cyanMat);
  underRing.rotation.x = Math.PI / 2;
  underRing.position.y = SH + 0.9;
  g.add(underRing);

  for (const r of [30, 60, 90, 116]) {
    const circle = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({
      color: r === 90 ? 0x22ff88 : 0x00e5ff,
      transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false
    }));
    circle.rotation.x = Math.PI / 2;
    circle.scale.set(r, r, 1);
    circle.position.y = DECK + 0.2;
    g.add(circle);
  }

  const spin = new THREE.Group();
  spin.position.y = DECK;
  g.add(spin);

  const hex = new THREE.Mesh(new THREE.TorusGeometry(74, 1.3, 8, 6), greenMat);
  hex.rotation.x = Math.PI / 2;
  spin.add(hex);

  const spinRing = new THREE.Mesh(ringGeo, purpleMat);
  spinRing.rotation.x = Math.PI / 2;
  spinRing.scale.set(88, 88, 1);
  spin.add(spinRing);

  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    const spoke = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({
      color: 0x22ff88, transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending, depthWrite: false
    }));
    spoke.rotation.x = Math.PI / 2;
    spoke.rotation.z = a;
    spoke.scale.set(56, 1, 1);
    spin.add(spoke);
  }

  const core = new THREE.Mesh(new THREE.SphereGeometry(10, 20, 16), cyanMat);
  core.position.y = 9;
  spin.add(core);

  const coreRing = new THREE.Mesh(new THREE.TorusGeometry(17, 1, 8, 32), greenMat);
  coreRing.rotation.x = Math.PI / 2.7;
  coreRing.position.y = 9;
  spin.add(coreRing);

  const glow = new THREE.PointLight(0x00ccff, 600, 260);
  glow.position.y = 14;
  spin.add(glow);

  const windowTex = makeWindowTexture();
  const glassMat = new THREE.MeshStandardMaterial({
    color: 0xffffff, map: windowTex, roughness: 0.45, metalness: 0.1,
    emissive: 0x3a6ea8, emissiveMap: windowTex, emissiveIntensity: 0.75
  });
  const neonColors = [0x00ccff, 0xff00ff, 0x00ff88, 0xffaa00];
  const layouts = [];
  for (let i = 0; i < 6; i++) layouts.push({ a: (i / 6) * Math.PI * 2, r: 45 });
  for (let i = 0; i < 12; i++) layouts.push({ a: (i / 12) * Math.PI * 2 + 0.25, r: 96 });
  let si = 0;
  for (const l of layouts) {
    si++;
    const w = 6 + ((si * 37) % 7);
    const d = 6 + ((si * 53) % 7);
    const h = 40 + ((si * 89) % 130);
    const bx = Math.cos(l.a) * l.r;
    const bz = Math.sin(l.a) * l.r;
    const body = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), bodyMat);
    body.position.set(bx, DECK + h / 2, bz);
    body.castShadow = true;
    g.add(body);
    const glass = new THREE.Mesh(new THREE.BoxGeometry(w * 0.72, h * 0.8, d * 0.72), glassMat);
    glass.position.set(bx, DECK + h * 0.55, bz);
    g.add(glass);
    const neon = neonColors[si % neonColors.length];
    const edge = new THREE.Mesh(new THREE.BoxGeometry(w + 0.3, 0.3, d + 0.3), new THREE.MeshBasicMaterial({
      color: neon, transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending
    }));
    edge.position.set(bx, DECK + h, bz);
    g.add(edge);
  }

  const orbs = [];
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2;
    const orb = new THREE.Mesh(new THREE.SphereGeometry(1.6, 12, 12), new THREE.MeshBasicMaterial({
      color: 0x00e5ff, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false
    }));
    orb.position.set(Math.cos(a) * (PR - 4), DECK + 1, Math.sin(a) * (PR - 4));
    g.add(orb);
    orbs.push(orb);
  }

  const floatRing = new THREE.Mesh(new THREE.TorusGeometry(64, 1.2, 8, 48), greenMat);
  floatRing.rotation.x = Math.PI / 2.2;
  floatRing.position.y = DECK + 120;
  g.add(floatRing);

  const tip = new THREE.Mesh(new THREE.SphereGeometry(4, 16, 16), new THREE.MeshBasicMaterial({ color: 0x00ffff }));
  tip.position.y = DECK + 200;
  g.add(tip);

  const beamMat = new THREE.MeshBasicMaterial({
    color: 0x22ff88, transparent: true, opacity: 0.1,
    blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide
  });
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(3, 14, 700, 12, 1, true), beamMat);
  beam.position.y = DECK + 550;
  g.add(beam);

  scene.add(g);
  return { towerGroup: g, rings, spin, orbs, beam, floatRing };
}

function buildCity(scene) {
  const neonColors = [0x00ccff, 0xff00ff, 0x00ff88, 0xffaa00];
  const prng = mulberry32(20260805);

  for (let bx = 0; bx < CITY_GRID; bx++) {
    for (let bz = 0; bz < CITY_GRID; bz++) {
      const cx = -CITY_HALF + bx * CITY_PITCH + CITY_STREET / 2;
      const cz = -CITY_HALF + bz * CITY_PITCH + CITY_STREET / 2;
      // leave a clear central zone for the plaza + runway corridor
      if (Math.hypot(cx, cz) < 250) continue;
      if (Math.abs(cx) < 80 && Math.abs(cz) < 260) continue;
      if (bx === 14 && bz === 13) continue;

      const cols = 3 + Math.floor(prng() * 3);
      const rowsN = 3 + Math.floor(prng() * 3);
      const slotW = CITY_BLOCK / cols;
      const slotD = CITY_BLOCK / rowsN;
      for (let i = 0; i < cols; i++) {
        for (let j = 0; j < rowsN; j++) {
          if (prng() < 0.08) continue;
          const w = slotW * (0.58 + prng() * 0.32);
          const d = slotD * (0.58 + prng() * 0.32);
          // height variety: mostly low-rise, some mid, a few towering
          const r = prng();
          let h;
          if (r < 0.5) h = 30 + prng() * 80;
          else if (r < 0.85) h = 110 + prng() * 120;
          else h = 240 + prng() * 220;
          const x = cx - CITY_BLOCK / 2 + (i + 0.5) * slotW + (prng() - 0.5) * 4;
          const z = cz - CITY_BLOCK / 2 + (j + 0.5) * slotD + (prng() - 0.5) * 4;
          const idx = cityBuildings.length;
          cityBuildings.push({
            x, z, w, d, h,
            neon: neonColors[Math.floor(prng() * neonColors.length)]
          });
          addCollider(x - w / 2, z - d / 2, x + w / 2, z + d / 2, idx);
        }
      }
    }
  }

  // instanced rendering: the whole mega city is only 4 draw calls
  const N = cityBuildings.length;
  const m4 = new THREE.Matrix4();
  const quat = new THREE.Quaternion();
  const pos = new THREE.Vector3();
  const scl = new THREE.Vector3();
  const col = new THREE.Color();

  const unit = new THREE.BoxGeometry(1, 1, 1);
  const bodyMat = new THREE.MeshStandardMaterial({ color: 0x14142a, roughness: 0.75, metalness: 0.2 });
  const windowTex = makeWindowTexture();
  const glassMat = new THREE.MeshStandardMaterial({ color: 0xffffff, map: windowTex, roughness: 0.45, metalness: 0.1, emissive: 0x3a6ea8, emissiveMap: windowTex, emissiveIntensity: 0.75 });
  const strokeMat = new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.BackSide, transparent: true, opacity: 0.45, blending: THREE.AdditiveBlending, depthWrite: false });
  const edgeMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending });

  const bodies = new THREE.InstancedMesh(unit, bodyMat, N);
  const glasses = new THREE.InstancedMesh(unit, glassMat, N);
  const strokes = new THREE.InstancedMesh(unit, strokeMat, N);
  const edges = new THREE.InstancedMesh(unit, edgeMat, N);
  instMeshes.push(bodies, glasses, strokes, edges);

  for (let idx = 0; idx < N; idx++) {
    const b = cityBuildings[idx];

    scl.set(b.w, b.h, b.d);
    pos.set(b.x, b.h / 2, b.z);
    m4.compose(pos, quat, scl);
    bodies.setMatrixAt(idx, m4);

    scl.set(b.w * 0.7, b.h * 0.8, b.d * 0.7);
    pos.set(b.x, b.h * 0.55, b.z);
    m4.compose(pos, quat, scl);
    glasses.setMatrixAt(idx, m4);

    scl.set(b.w * 1.015, b.h * 1.015, b.d * 1.015);
    pos.set(b.x, b.h / 2, b.z);
    m4.compose(pos, quat, scl);
    strokes.setMatrixAt(idx, m4);
    strokes.setColorAt(idx, col.setHex(b.neon));

    scl.set(b.w + 0.4, 0.35, b.d + 0.4);
    pos.set(b.x, b.h + 0.17, b.z);
    m4.compose(pos, quat, scl);
    edges.setMatrixAt(idx, m4);
    edges.setColorAt(idx, col.setHex(b.neon));
  }

  bodies.instanceMatrix.needsUpdate = true;
  glasses.instanceMatrix.needsUpdate = true;
  strokes.instanceMatrix.needsUpdate = true;
  strokes.instanceColor.needsUpdate = true;
  edges.instanceMatrix.needsUpdate = true;
  edges.instanceColor.needsUpdate = true;

  for (const m of [bodies, glasses, strokes, edges]) m.frustumCulled = false;
  bodies.castShadow = true;
  bodies.receiveShadow = true;
  scene.add(bodies, glasses, strokes, edges);
}

function makeRoadTexture() {
  const w = 256, h = 64;
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d');
  g.fillStyle = '#0b0b16';
  g.fillRect(0, 0, w, h);
  g.fillStyle = 'rgba(0,180,255,0.25)';
  g.fillRect(0, 2, w, 3);
  g.fillRect(0, h - 5, w, 3);
  g.fillStyle = 'rgba(0,200,255,0.5)';
  for (let x = 12; x < w; x += 48) g.fillRect(x, h / 2 - 1, 24, 2);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

function makeWindowTexture() {
  const w = 128, h = 256;
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d');
  g.fillStyle = '#05050c';
  g.fillRect(0, 0, w, h);
  const cols = 6, rows = 12;
  const cw = w / cols, ch = h / rows;
  for (let x = 0; x < cols; x++) {
    for (let y = 0; y < rows; y++) {
      const r = Math.random();
      if (r < 0.3) continue;
      const lit = r > 0.55;
      if (lit) {
        g.fillStyle = Math.random() < 0.4
          ? 'rgba(255,190,105,0.95)'
          : 'rgba(130,225,255,0.9)';
      } else {
        g.fillStyle = 'rgba(35,55,85,0.55)';
      }
      g.fillRect(x * cw + 2, y * ch + 2, cw - 4, ch - 4);
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  return tex;
}

function addRoads(scene) {
  const baseTex = makeRoadTexture();
  const GRID = CITY_GRID, PITCH = CITY_PITCH, STREET = CITY_STREET, HALF = CITY_HALF;
  const LEN = HALF * 2;
  for (let i = 0; i <= GRID; i++) {
    const pos = -HALF + i * PITCH + STREET / 2;
    for (const vertical of [false, true]) {
      const tex = baseTex.clone();
      tex.needsUpdate = true;
      tex.repeat.set(LEN / 48, 1);
      const mat = new THREE.MeshStandardMaterial({
        color: 0x0b0b16, map: tex, roughness: 1,
        polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1
      });
      const road = new THREE.Mesh(new THREE.PlaneGeometry(LEN, STREET), mat);
      road.rotation.x = -Math.PI / 2;
      if (vertical) {
        road.rotation.y = Math.PI / 2;
        road.position.set(pos, 0.16, 0);
      } else {
        road.position.set(0, 0.12, pos);
      }
      road.receiveShadow = true;
      scene.add(road);
    }
  }
}

function scatterTrees(scene) {
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x2a2a4a, roughness: 1 });
  const leafMat = new THREE.MeshStandardMaterial({ color: 0x0a5a3a, roughness: 1, emissive: 0x063d28, emissiveIntensity: 0.9 });
  const neonRing = new THREE.MeshBasicMaterial({ color: 0x00ff88, transparent: true, opacity: 0.5 });

  const makeTree = (x, z, h) => {
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 1.1, h, 6), trunkMat);
    trunk.position.set(x, h / 2, z);
    trunk.castShadow = true;
    scene.add(trunk);

    const crown = new THREE.Mesh(new THREE.ConeGeometry(4 + Math.random() * 3, 9, 7), leafMat);
    crown.position.set(x, h + 3.5, z);
    crown.castShadow = true;
    scene.add(crown);

    if (Math.random() < 0.5) {
      const ring = new THREE.Mesh(new THREE.RingGeometry(3.5, 4.0, 16), neonRing);
      ring.rotation.x = -Math.PI / 2;
      ring.position.set(x, h + 2.0, z);
      scene.add(ring);
    }
  };

  const patches = [
    { x: 4100, z: -1750, r: 750, n: 140 },
    { x: -4200, z: 1200, r: 850, n: 160 },
    { x: 2200, z: 4100, r: 650, n: 120 },
    { x: -1000, z: -4300, r: 700, n: 100 },
    { x: 4400, z: 3200, r: 650, n: 90 },
    { x: -4400, z: -3200, r: 750, n: 110 }
  ];
  for (const p of patches) {
    for (let i = 0; i < p.n; i++) {
      const a = Math.random() * Math.PI * 2;
      const d = Math.sqrt(Math.random()) * p.r;
      makeTree(p.x + Math.cos(a) * d, p.z + Math.sin(a) * d, 6 + Math.random() * 12);
    }
  }

  for (let i = 0; i < 100; i++) {
    const angle = Math.random() * Math.PI * 2;
    const radius = 460 + Math.random() * (WORLD_RADIUS - 500);
    const x = Math.cos(angle) * radius;
    const z = Math.sin(angle) * radius;
    // keep the canyon corridor clear
    if (Math.abs(z + 5200) < 200 && Math.abs(x) < 1400) continue;
    // keep the city footprint clear
    if (Math.abs(x) < CITY_HALF && Math.abs(z) < CITY_HALF) continue;
    makeTree(x, z, 6 + Math.random() * 10);
  }
}

function buildMountains(scene) {
  const rockMat = new THREE.MeshStandardMaterial({ color: 0x0a0a1a, roughness: 0.95, flatShading: true });
  const snowMat = new THREE.MeshStandardMaterial({ color: 0x111133, roughness: 0.9, flatShading: true, emissive: 0x000033, emissiveIntensity: 0.2 });
  const edgeMat = new THREE.MeshBasicMaterial({ color: 0x0055aa, transparent: true, opacity: 0.25 });

  const makeMountain = (x, z, w, h) => {
    const m = new THREE.Mesh(new THREE.ConeGeometry(w, h, 5), rockMat);
    m.position.set(x, h / 2 - 20, z);
    m.castShadow = true;
    scene.add(m);
    const cap = new THREE.Mesh(new THREE.ConeGeometry(w * 0.45, h * 0.3, 5), snowMat);
    cap.position.set(x, h * 0.75, z);
    cap.castShadow = true;
    scene.add(cap);

    if (Math.random() < 0.2) {
      const glow = new THREE.PointLight(0x0044aa, 30, 120);
      glow.position.set(x, h * 0.5, z);
      scene.add(glow);
    }
  };

  for (let i = 0; i < 8; i++) {
    const x = -3000 + i * 870 + (Math.random() - 0.5) * 400;
    const z = -4500 + (Math.random() - 0.5) * 500;
    makeMountain(x, z, 260 + Math.random() * 220, 200 + Math.random() * 200);
  }

  for (let i = 0; i < 7; i++) {
    const z = -2100 + i * 840 + (Math.random() - 0.5) * 400;
    const x = 4500 + (Math.random() - 0.5) * 500;
    makeMountain(x, z, 240 + Math.random() * 200, 180 + Math.random() * 180);
  }

  for (let i = 0; i < 6; i++) {
    let x, z, r;
    // ring mountains must stay outside the city square
    do {
      const a = Math.random() * Math.PI * 2;
      r = 3500 + Math.random() * 2200;
      x = Math.cos(a) * r;
      z = Math.sin(a) * r;
    } while (Math.abs(x) < CITY_HALF && Math.abs(z) < CITY_HALF);
    makeMountain(x, z, 180 + Math.random() * 120, 80 + Math.random() * 90);
  }

  for (let i = 0; i < 12; i++) {
    const angle = (i / 12) * Math.PI * 2 + Math.random() * 0.4;
    const radius = WORLD_RADIUS + 140;
    makeMountain(Math.cos(angle) * radius, Math.sin(angle) * radius, 300 + Math.random() * 300, 240 + Math.random() * 240);
  }
}

function buildClouds() {
  const group = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color: 0x22224a, roughness: 1, transparent: true, opacity: 0.35 });
  const n = 8;
  for (let i = 0; i < n; i++) {
    const cloud = new THREE.Group();
    const count = 3 + Math.floor(Math.random() * 3);
    for (let j = 0; j < count; j++) {
      const s = 24 + Math.random() * 30;
      const puff = new THREE.Mesh(new THREE.SphereGeometry(s, 8, 6), mat);
      puff.position.set((Math.random() - 0.5) * 70, (Math.random() - 0.5) * 10, (Math.random() - 0.5) * 40);
      puff.scale.y = 0.45;
      cloud.add(puff);
    }
    const angle = (i / n) * Math.PI * 2;
    const radius = 1500 + Math.random() * 3800;
    cloud.position.set(Math.cos(angle) * radius, 500 + Math.random() * 400, Math.sin(angle) * radius);
    cloud.userData.speed = 2 + Math.random() * 4;
    cloud.userData.dir = Math.random() < 0.5 ? 1 : -1;
    group.add(cloud);
  }
  return group;
}

function buildSky() {
  const group = new THREE.Group();

  const skyGeo = new THREE.SphereGeometry(12000, 32, 16);
  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    fog: false,
    depthWrite: false,
    uniforms: {
      topColor: { value: new THREE.Color(0x000000) },
      midColor: { value: new THREE.Color(0x000104) },
      horizonColor: { value: new THREE.Color(0x000308) },
      glowColor: { value: new THREE.Color(0x00d9ff) },
      uTime: { value: 0 }
    },
    vertexShader: `
      varying vec3 vWorldPos;
      void main() {
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWorldPos = wp.xyz;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform vec3 topColor;
      uniform vec3 midColor;
      uniform vec3 horizonColor;
      uniform vec3 glowColor;
      uniform float uTime;
      varying vec3 vWorldPos;
      void main() {
        vec3 dir = normalize(vWorldPos);
        float h = clamp(dir.y, -1.0, 1.0);
        // tallest, darkest gradient: horizon hue held low, fading gradually
        // up through mid and all the way to a pitch-black zenith
        vec3 col = mix(horizonColor, midColor, smoothstep(0.01, 0.7, h));
        col = mix(col, topColor, smoothstep(0.35, 1.0, h));
        // soft neon band hugging the horizon line
        float band = smoothstep(0.0, 0.014, h) * smoothstep(0.15, 0.03, h);
        col += glowColor * band * 0.08;
        // faint aurora shimmer high in the sky
        float shimmer = 0.5 + 0.5 * sin(uTime * 0.8 + h * 45.0);
        col += glowColor * 0.012 * shimmer * smoothstep(0.25, 0.7, h);
        gl_FragColor = vec4(col, 1.0);
      }
    `
  });
  const sky = new THREE.Mesh(skyGeo, skyMat);
  sky.frustumCulled = false;
  group.add(sky);

  const stars = buildStars();
  group.add(stars);

  const moon = buildMoon();
  group.add(moon);

  group.userData.stars = stars;
  group.userData.skyMat = skyMat;
  return group;
}

function starTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.25, 'rgba(255,255,255,0.6)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

function buildStars() {
  const count = 1500;
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const cWhite = new THREE.Color(0xffffff);
  const cCyan = new THREE.Color(0x99ddff);
  const cBlue = new THREE.Color(0x8899ff);
  for (let i = 0; i < count; i++) {
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(Math.random() * 0.9 + 0.08);
    const r = 12000;
    positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
    positions[i * 3 + 1] = r * Math.cos(phi);
    positions[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);
    const pick = Math.random();
    const c = pick < 0.6 ? cWhite : (pick < 0.85 ? cCyan : cBlue);
    colors[i * 3] = c.r;
    colors[i * 3 + 1] = c.g;
    colors[i * 3 + 2] = c.b;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  const mat = new THREE.PointsMaterial({
    size: 3.2,
    map: starTexture(),
    vertexColors: true,
    transparent: true,
    opacity: 1,
    sizeAttenuation: false,
    depthWrite: false,
    blending: THREE.AdditiveBlending
  });
  const stars = new THREE.Points(geo, mat);
  stars.frustumCulled = false;
  return stars;
}

function buildMoon() {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(128, 128, 0, 128, 128, 128);
  grad.addColorStop(0, 'rgba(235,250,255,1)');
  grad.addColorStop(0.12, 'rgba(190,232,255,0.9)');
  grad.addColorStop(0.35, 'rgba(120,200,255,0.25)');
  grad.addColorStop(1, 'rgba(80,180,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 256, 256);
  const mat = new THREE.SpriteMaterial({
    map: new THREE.CanvasTexture(c),
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending
  });
  const sprite = new THREE.Sprite(mat);
  sprite.scale.set(260, 260, 1);
  sprite.position.set(950, 1500, -1250);
  return sprite;
}

export function updateWorld(world, dt) {
  const { clouds, skyGroup, camera } = world;
  world.time = (world.time || 0) + dt;

  if (skyGroup) {
    if (camera) {
      skyGroup.position.set(camera.position.x, 0, camera.position.z);
    }
    if (skyGroup.userData.stars) {
      skyGroup.userData.stars.material.opacity = 0.85 + 0.15 * Math.sin(world.time * 2.2);
    }
    if (skyGroup.userData.skyMat) {
      skyGroup.userData.skyMat.uniforms.uTime.value = world.time;
    }
  }

  for (const cloud of clouds.children) {
    cloud.position.x += cloud.userData.dir * cloud.userData.speed * dt;
    cloud.position.z += cloud.userData.dir * cloud.userData.speed * 0.4 * dt;
    if (cloud.position.x > 6500) cloud.position.x = -6500;
    if (cloud.position.x < -6500) cloud.position.x = 6500;
  }

  if (world.searchlights) {
    for (const sl of world.searchlights) {
      sl.group.rotation.y += dt * sl.speed * sl.dir;
    }
  }

  if (world.billboards) {
    for (const b of world.billboards) {
      b.mesh.material.opacity = 0.5 + 0.4 * Math.sin(world.time * 2.4 + b.phase);
    }
  }

  if (world.ferris) {
    const a = world.time * 0.35;
    world.ferris.rotation.z = a;
    if (world.ferris.userData.gondolas) {
      for (const g of world.ferris.userData.gondolas) g.rotation.z = -a;
    }
  }

  if (world.spireBeam) {
    world.spireBeam.material.opacity = 0.08 + 0.05 * Math.sin(world.time * 1.8);
  }

  if (world.megaTower) {
    const mt = world.megaTower;
    mt.spin.rotation.y += dt * 0.6;
    mt.floatRing.rotation.z += dt * 0.3;
    mt.beam.material.opacity = 0.08 + 0.06 * Math.sin(world.time * 1.5);
    for (let i = 0; i < mt.rings.length; i++) {
      mt.rings[i].material.opacity = 0.6 + 0.25 * Math.sin(world.time * 2 + i * 0.8);
    }
    for (let i = 0; i < mt.orbs.length; i++) {
      mt.orbs[i].material.opacity = 0.6 + 0.4 * Math.sin(world.time * 3 + i * 0.6);
    }
  }
}
