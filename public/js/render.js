import * as THREE from 'three';

export function buildVehicle(color, bright = false) {
  const root = new THREE.Group();

  const primary = new THREE.Color(color);
  const dark = primary.clone().multiplyScalar(0.3);
  const bodyMat = new THREE.MeshStandardMaterial({ color: dark, roughness: 0.2, metalness: 0.7, ...(bright ? { emissive: primary, emissiveIntensity: 0.3 } : {}) });
  const darkMat = new THREE.MeshStandardMaterial({ color: 0x0a0a1a, roughness: 0.3, metalness: 0.6, ...(bright ? { emissive: 0x224466, emissiveIntensity: 0.15 } : {}) });
  const glassMat = new THREE.MeshStandardMaterial({ color: bright ? 0x005577 : 0x003355, roughness: 0.05, metalness: 0.95, transparent: true, opacity: bright ? 0.75 : 0.7, ...(bright ? { emissive: 0x0066aa, emissiveIntensity: 0.7 } : {}) });
  const wheelMat = new THREE.MeshStandardMaterial({ color: 0x1a1a2e, roughness: 0.4, metalness: 0.3 });
  const rimMat = new THREE.MeshStandardMaterial({ color: bright ? 0x4488aa : 0x2a3a4a, roughness: 0.2, metalness: 0.8 });

  // Car body
  const carParts = new THREE.Group();

  const body = new THREE.Mesh(new THREE.BoxGeometry(2, 0.6, 4), bodyMat);
  body.position.y = 0.5;
  body.castShadow = true;
  carParts.add(body);

  const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.5, 1.8), glassMat);
  cabin.position.set(0, 0.95, -0.2);
  carParts.add(cabin);

  const nose = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.35, 1.2), bodyMat);
  nose.position.set(0, 0.42, 2.1);
  carParts.add(nose);

  // Wheels
  const wheelGeo = new THREE.CylinderGeometry(0.36, 0.36, 0.25, 16);
  const rimGeo = new THREE.CylinderGeometry(0.2, 0.2, 0.26, 8);

  const wheels = [];
  const positions = [[-0.9, 0.36, 1.3], [0.9, 0.36, 1.3], [-0.9, 0.36, -1.3], [0.9, 0.36, -1.3]];
  for (let i = 0; i < 4; i++) {
    const pivot = new THREE.Group();
    pivot.position.set(...positions[i]);
    const spin = new THREE.Group();
    const wheel = new THREE.Mesh(wheelGeo, wheelMat);
    wheel.rotation.z = Math.PI / 2;
    const rim = new THREE.Mesh(rimGeo, rimMat);
    rim.rotation.z = Math.PI / 2;
    spin.add(wheel);
    spin.add(rim);
    pivot.add(spin);
    carParts.add(pivot);
    wheels.push({ pivot, spin });
    if (i >= 2) pivot.userData.steer = false;
  }

  // Headlights
  const headlightMat = new THREE.MeshBasicMaterial({ color: 0xffffee });
  for (const x of [-0.6, 0.6]) {
    const hl = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 8), headlightMat);
    hl.position.set(x, 0.5, 2.6);
    carParts.add(hl);
  }

  // Taillights
  const taillightMat = new THREE.MeshBasicMaterial({ color: 0xff2222 });
  for (const x of [-0.6, 0.6]) {
    const tl = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 8), taillightMat);
    tl.position.set(x, 0.5, -2);
    carParts.add(tl);
  }

  root.add(carParts);

  // Plane parts
  const planeParts = new THREE.Group();

  const fuselage = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.25, 5, 8), bodyMat);
  fuselage.rotation.z = Math.PI / 2;
  fuselage.castShadow = true;
  planeParts.add(fuselage);

  const wing = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.1, 8), bodyMat);
  wing.position.set(0, 0.1, 0);
  planeParts.add(wing);

  const tail = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.08, 2.5), bodyMat);
  tail.position.set(0, 0.15, -2);
  planeParts.add(tail);

  const finV = new THREE.Mesh(new THREE.BoxGeometry(0.08, 1, 1.5), bodyMat);
  finV.position.set(0, 0.5, -2);
  planeParts.add(finV);

  const finH = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.6, 1.2), darkMat);
  finH.position.set(0, 0.3, -2);
  planeParts.add(finH);

  // Propeller
  const prop = new THREE.Group();
  const propHub = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.2, 8), rimMat);
  propHub.rotation.z = Math.PI / 2;
  prop.add(propHub);
  for (let i = 0; i < 3; i++) {
    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.08, 1.6, 0.3), darkMat);
    blade.rotation.x = (i * Math.PI * 2) / 3;
    prop.add(blade);
  }
  prop.position.set(0, 0, 2.6);
  planeParts.add(prop);

  // Exhaust flames
  const exhaustMat = new THREE.MeshBasicMaterial({ color: 0xff6600, transparent: true, opacity: 0.55 });
  const exhaustL = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.18, 1.2, 8), exhaustMat);
  exhaustL.rotation.x = Math.PI / 2;
  exhaustL.position.set(-0.3, 0.1, -2.8);
  planeParts.add(exhaustL);

  const exhaustR = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.18, 1.2, 8), exhaustMat.clone());
  exhaustR.rotation.x = Math.PI / 2;
  exhaustR.position.set(0.3, 0.1, -2.8);
  planeParts.add(exhaustR);

  const boostLight = new THREE.PointLight(0xff6600, 40, 6);
  boostLight.position.set(0, 0.1, -3.2);
  planeParts.add(boostLight);

  planeParts.visible = false;
  root.add(planeParts);

  root.userData = { carParts, planeParts, wheels, prop, exhaustL, exhaustR, boostLight };
  return root;
}

export function setVehicleMode(root, mode) {
  const d = root.userData;
  d.carParts.visible = mode === 'car';
  d.planeParts.visible = mode === 'plane';
  root.userData.mode = mode;
}

export function animateVehicle(root, dt, opts) {
  const d = root.userData;
  const { mode, speed, nitroActive, steer } = opts;

  if (!d.wheels) d.wheels = [];
  for (const w of d.wheels) {
    if (mode === 'car') {
      w.spin.rotation.z += (speed * dt) / 0.36;
    }
    if (w.pivot.userData.steer !== false) {
      w.pivot.rotation.y = -steer * 0.35;
    }
  }

  if (mode === 'plane' && d.prop) {
    d.prop.rotation.z += dt * (8 + speed * 0.6);
    const flameScale = nitroActive ? 1.9 : 0.9;
    d.exhaustL.scale.z = flameScale;
    d.exhaustR.scale.z = flameScale;
    d.exhaustL.scale.y = flameScale;
    d.exhaustR.scale.y = flameScale;
    const glow = nitroActive ? 200 : 40;
    d.boostLight.intensity += (glow - d.boostLight.intensity) * (1 - Math.exp(-dt * 6));
    d.exhaustL.material.opacity = nitroActive ? 1 : 0.55;
    d.exhaustR.material.opacity = d.exhaustL.material.opacity;
  }
}

export function buildMissile(color) {
  const group = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.5, roughness: 0.3, metalness: 0.6 });

  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 1.2, 8), mat);
  body.rotation.x = Math.PI / 2;
  group.add(body);

  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.15, 0.4, 8), mat);
  nose.rotation.x = -Math.PI / 2;
  nose.position.z = 0.8;
  group.add(nose);

  const finMat = new THREE.MeshStandardMaterial({ color: 0x333344, roughness: 0.4, metalness: 0.5 });
  for (let i = 0; i < 4; i++) {
    const fin = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.3, 0.3), finMat);
    fin.position.z = -0.5;
    fin.rotation.y = (i * Math.PI) / 2;
    fin.position.x = Math.cos((i * Math.PI) / 2) * 0.15;
    fin.position.y = Math.sin((i * Math.PI) / 2) * 0.15;
    group.add(fin);
  }

  return group;
}