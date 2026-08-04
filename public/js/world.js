import * as THREE from 'three';
import { WORLD_RADIUS } from './vehicle.js';

export function createWorld(scene) {
  scene.background = new THREE.Color(0x8ecbff);
  scene.fog = new THREE.Fog(0x9fd4ff, 600, 2600);

  // Lighting
  const hemi = new THREE.HemisphereLight(0xbfe3ff, 0x5a7048, 1.1);
  scene.add(hemi);

  const sun = new THREE.DirectionalLight(0xfff3d6, 2.0);
  sun.position.set(400, 700, 300);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -500;
  sun.shadow.camera.right = 500;
  sun.shadow.camera.top = 500;
  sun.shadow.camera.bottom = -500;
  sun.shadow.camera.far = 1500;
  scene.add(sun);

  // Ground
  const ground = makeGround();
  scene.add(ground);

  // Runway
  scene.add(makeRunway());

  // Central plaza
  scene.add(makePlaza());

  // City
  buildCity(scene);

  // Scattered props
  scatterTrees(scene);

  // Mountains around the edge
  buildMountains(scene);

  // Clouds
  const clouds = buildClouds();
  scene.add(clouds);

  return { sun, clouds };
}

function makeGround() {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#63a84a';
  ctx.fillRect(0, 0, 512, 512);
  ctx.fillStyle = '#6bb351';
  const step = 64;
  for (let y = 0; y < 512; y += step) {
    for (let x = 0; x < 512; x += step) {
      if ((x / step + y / step) % 2 === 0) ctx.fillRect(x, y, step, step);
    }
  }
  ctx.strokeStyle = 'rgba(40, 70, 30, 0.18)';
  ctx.lineWidth = 3;
  for (let i = 0; i <= 512; i += step) {
    ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, 512); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(512, i); ctx.stroke();
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(24, 24);
  tex.anisotropy = 8;

  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(WORLD_RADIUS * 2, WORLD_RADIUS * 2),
    new THREE.MeshStandardMaterial({ map: tex, roughness: 1 })
  );
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = 0;
  mesh.receiveShadow = true;
  return mesh;
}

function makeRunway() {
  const group = new THREE.Group();
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 512;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#3a4148';
  ctx.fillRect(0, 0, 128, 512);
  ctx.fillStyle = '#ffffff';
  for (let y = 0; y < 512; y += 64) ctx.fillRect(56, y, 16, 40);
  ctx.strokeStyle = '#d8d8d8';
  ctx.lineWidth = 8;
  ctx.beginPath(); ctx.moveTo(20, 0); ctx.lineTo(20, 512); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(108, 0); ctx.lineTo(108, 512); ctx.stroke();

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(1, 4);
  const runway = new THREE.Mesh(
    new THREE.PlaneGeometry(30, 400),
    new THREE.MeshStandardMaterial({ map: tex, roughness: 0.9 })
  );
  runway.rotation.x = -Math.PI / 2;
  runway.position.set(0, 0.02, 0);
  runway.receiveShadow = true;
  group.add(runway);
  return group;
}

function makePlaza() {
  const group = new THREE.Group();
  const plaza = new THREE.Mesh(
    new THREE.CircleGeometry(120, 48),
    new THREE.MeshStandardMaterial({ color: 0x9aa4ad, roughness: 0.85 })
  );
  plaza.rotation.x = -Math.PI / 2;
  plaza.position.set(0, 0.02, 0);
  plaza.receiveShadow = true;
  group.add(plaza);

  const pad = new THREE.Mesh(
    new THREE.CircleGeometry(40, 48),
    new THREE.MeshStandardMaterial({ color: 0xd8dee3, roughness: 0.7 })
  );
  pad.rotation.x = -Math.PI / 2;
  pad.position.set(0, 0.04, 0);
  pad.receiveShadow = true;
  group.add(pad);

  // central tower
  const tower = new THREE.Mesh(
    new THREE.CylinderGeometry(4, 6, 40, 12),
    new THREE.MeshStandardMaterial({ color: 0x3b6ea5, metalness: 0.4, roughness: 0.4 })
  );
  tower.position.set(0, 20, 0);
  tower.castShadow = true;
  group.add(tower);
  const beacon = new THREE.Mesh(
    new THREE.SphereGeometry(2.5, 16, 16),
    new THREE.MeshStandardMaterial({ color: 0xff5533, emissive: 0xff5533, emissiveIntensity: 1.5 })
  );
  beacon.position.set(0, 42, 0);
  group.add(beacon);

  const light = new THREE.PointLight(0xff5533, 200, 250);
  light.position.set(0, 42, 0);
  group.add(light);

  return group;
}

function buildCity(scene) {
  const cityMat = () => new THREE.MeshStandardMaterial({ color: 0x8897a8, roughness: 0.7 });
  const glassMat = new THREE.MeshStandardMaterial({ color: 0x4a7fb5, roughness: 0.3, metalness: 0.5 });
  const R = 320;
  for (let i = 0; i < 34; i++) {
    const angle = Math.random() * Math.PI * 2;
    const radius = 130 + Math.random() * R;
    const w = 16 + Math.random() * 14;
    const d = 16 + Math.random() * 14;
    const h = 24 + Math.random() * 70;
    const x = Math.cos(angle) * radius;
    const z = Math.sin(angle) * radius;
    const body = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), cityMat());
    body.position.set(x, h / 2, z);
    body.rotation.y = Math.random() * Math.PI;
    body.castShadow = true;
    body.receiveShadow = true;
    scene.add(body);
    const glass = new THREE.Mesh(new THREE.BoxGeometry(w * 0.6, h * 0.55, d * 0.6), glassMat);
    glass.position.set(x, h * 0.6, z);
    glass.rotation.copy(body.rotation);
    scene.add(glass);
  }
}

function scatterTrees(scene) {
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x5a4632, roughness: 1 });
  const leafMat = new THREE.MeshStandardMaterial({ color: 0x2f7d3b, roughness: 1 });

  const makeTree = (x, z, h) => {
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 1.1, h, 6), trunkMat);
    trunk.position.set(x, h / 2, z);
    trunk.castShadow = true;
    scene.add(trunk);
    const crown = new THREE.Mesh(new THREE.ConeGeometry(4 + Math.random() * 3, 9, 7), leafMat);
    crown.position.set(x, h + 3.5, z);
    crown.castShadow = true;
    scene.add(crown);
  };

  // dense forest patches (avoid the central plaza/city radius)
  const patches = [
    { x: 520, z: -700, r: 300, n: 100 },
    { x: -720, z: 480, r: 340, n: 120 },
    { x: 880, z: 820, r: 260, n: 80 }
  ];
  for (const p of patches) {
    for (let i = 0; i < p.n; i++) {
      const a = Math.random() * Math.PI * 2;
      const d = Math.sqrt(Math.random()) * p.r;
      makeTree(p.x + Math.cos(a) * d, p.z + Math.sin(a) * d, 6 + Math.random() * 12);
    }
  }

  // sparse scattered trees in the open
  for (let i = 0; i < 60; i++) {
    const angle = Math.random() * Math.PI * 2;
    const radius = 320 + Math.random() * (WORLD_RADIUS - 360);
    const x = Math.cos(angle) * radius;
    const z = Math.sin(angle) * radius;
    makeTree(x, z, 6 + Math.random() * 10);
  }
}

function buildMountains(scene) {
  const rockMat = new THREE.MeshStandardMaterial({ color: 0x6d7f9c, roughness: 0.95, flatShading: true });
  const snowMat = new THREE.MeshStandardMaterial({ color: 0xeef4fb, roughness: 0.9, flatShading: true });

  const makeMountain = (x, z, w, h) => {
    const m = new THREE.Mesh(new THREE.ConeGeometry(w, h, 5), rockMat);
    m.position.set(x, h / 2 - 20, z);
    m.castShadow = true;
    scene.add(m);
    const cap = new THREE.Mesh(new THREE.ConeGeometry(w * 0.45, h * 0.3, 5), snowMat);
    cap.position.set(x, h * 0.75, z);
    cap.castShadow = true;
    scene.add(cap);
  };

  // north mountain range
  for (let i = 0; i < 8; i++) {
    const x = -1000 + i * 290 + (Math.random() - 0.5) * 150;
    const z = -1500 + (Math.random() - 0.5) * 200;
    makeMountain(x, z, 260 + Math.random() * 220, 200 + Math.random() * 200);
  }

  // east mountain range
  for (let i = 0; i < 7; i++) {
    const z = -700 + i * 280 + (Math.random() - 0.5) * 140;
    const x = 1500 + (Math.random() - 0.5) * 160;
    makeMountain(x, z, 240 + Math.random() * 200, 180 + Math.random() * 180);
  }

  // low hills between forest patches
  for (let i = 0; i < 6; i++) {
    const a = Math.random() * Math.PI * 2;
    const r = 700 + Math.random() * 600;
    makeMountain(Math.cos(a) * r, Math.sin(a) * r, 180 + Math.random() * 120, 80 + Math.random() * 90);
  }

  // far boundary ring
  for (let i = 0; i < 12; i++) {
    const angle = (i / 12) * Math.PI * 2 + Math.random() * 0.4;
    const radius = WORLD_RADIUS + 140;
    makeMountain(Math.cos(angle) * radius, Math.sin(angle) * radius, 300 + Math.random() * 300, 240 + Math.random() * 240);
  }
}

function buildClouds() {
  const group = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, transparent: true, opacity: 0.85 });
  const n = 14;
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
    const radius = 500 + Math.random() * 1200;
    cloud.position.set(Math.cos(angle) * radius, 380 + Math.random() * 260, Math.sin(angle) * radius);
    cloud.userData.speed = 2 + Math.random() * 4;
    cloud.userData.dir = Math.random() < 0.5 ? 1 : -1;
    group.add(cloud);
  }
  return group;
}

export function updateWorld(world, dt) {
  const { clouds } = world;
  for (const cloud of clouds.children) {
    cloud.position.x += cloud.userData.dir * cloud.userData.speed * dt;
    cloud.position.z += cloud.userData.dir * cloud.userData.speed * 0.4 * dt;
    if (cloud.position.x > 2200) cloud.position.x = -2200;
    if (cloud.position.x < -2200) cloud.position.x = 2200;
  }
}
