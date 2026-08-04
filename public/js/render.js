import * as THREE from 'three';

export function buildVehicle(color) {
  const root = new THREE.Group();

  const primary = new THREE.Color(color);
  const dark = primary.clone().multiplyScalar(0.5);
  const bodyMat = new THREE.MeshStandardMaterial({ color: primary, roughness: 0.3, metalness: 0.55 });
  const darkMat = new THREE.MeshStandardMaterial({ color: dark, roughness: 0.35, metalness: 0.5 });
  const glassMat = new THREE.MeshStandardMaterial({ color: 0x1b2b3a, roughness: 0.1, metalness: 0.9 });
  const tireMat = new THREE.MeshStandardMaterial({ color: 0x151515, roughness: 0.95 });
  const hubMat = new THREE.MeshStandardMaterial({ color: 0xcfcfcf, metalness: 0.9, roughness: 0.25 });
  const glowMat = new THREE.MeshStandardMaterial({
    color: 0xffaa33, emissive: 0xff7722, emissiveIntensity: 0.9
  });

  // ---------- Shared chassis (used in both modes) ----------
  const body = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.7, 4.2), bodyMat);
  body.position.y = 0.62;
  body.castShadow = true;
  root.add(body);

  const nose = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.42, 1.1), darkMat);
  nose.position.set(0, 0.52, -2.35);
  root.add(nose);

  const cockpit = new THREE.Mesh(new THREE.SphereGeometry(0.55, 16, 12), glassMat);
  cockpit.scale.set(0.9, 0.7, 1.5);
  cockpit.position.set(0, 1.05, -0.2);
  root.add(cockpit);

  const headlightL = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.18, 0.08), glowMat);
  headlightL.position.set(-0.55, 0.55, -2.78);
  root.add(headlightL);
  const headlightR = headlightL.clone();
  headlightR.position.x = 0.55;
  root.add(headlightR);

  const taillightMat = new THREE.MeshStandardMaterial({
    color: 0xff2244, emissive: 0xff2244, emissiveIntensity: 1.4
  });
  const tailL = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.2, 0.06), taillightMat);
  tailL.position.set(-0.6, 0.62, 2.12);
  root.add(tailL);
  const tailR = tailL.clone();
  tailR.position.x = 0.6;
  root.add(tailR);

  // ---------- CAR PARTS ----------
  const carParts = new THREE.Group();
  carParts.name = 'carParts';

  const wheelGeo = new THREE.CylinderGeometry(0.36, 0.36, 0.34, 18);
  wheelGeo.rotateX(Math.PI / 2);
  const hubGeo = new THREE.CylinderGeometry(0.16, 0.16, 0.36, 10);
  hubGeo.rotateX(Math.PI / 2);

  const wheelPositions = [
    { x: -1.15, z: -1.45, steer: true },
    { x: 1.15, z: -1.45, steer: true },
    { x: -1.15, z: 1.45, steer: false },
    { x: 1.15, z: 1.45, steer: false }
  ];
  const wheels = [];
  for (const wp of wheelPositions) {
    const pivot = new THREE.Group();
    pivot.position.set(wp.x, 0.36, wp.z);
    pivot.userData.steer = wp.steer;
    const spin = new THREE.Mesh(wheelGeo, tireMat);
    spin.castShadow = true;
    const hub = new THREE.Mesh(hubGeo, hubMat);
    spin.add(hub);
    pivot.add(spin);
    carParts.add(pivot);
    wheels.push({ pivot, spin });
  }

  // spoiler
  const spoilerBar = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.12, 0.35), darkMat);
  spoilerBar.position.set(0, 1.15, 2.05);
  carParts.add(spoilerBar);
  const spoilerP1 = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.35, 0.12), darkMat);
  spoilerP1.position.set(-0.8, 0.95, 2.0);
  carParts.add(spoilerP1);
  const spoilerP2 = spoilerP1.clone();
  spoilerP2.position.x = 0.8;
  carParts.add(spoilerP2);

  root.add(carParts);

  // ---------- PLANE PARTS ----------
  const planeParts = new THREE.Group();
  planeParts.name = 'planeParts';

  // wings
  const wing = new THREE.Mesh(new THREE.BoxGeometry(8.4, 0.14, 1.5), bodyMat);
  wing.position.y = 0.85;
  wing.castShadow = true;
  planeParts.add(wing);

  const wingtipL = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.12, 0.9), glowMat);
  wingtipL.position.set(-4.4, 0.85, 0);
  planeParts.add(wingtipL);
  const wingtipR = wingtipL.clone();
  wingtipR.position.x = 4.4;
  planeParts.add(wingtipR);

  // tail
  const tailVert = new THREE.Mesh(new THREE.BoxGeometry(0.14, 1.1, 1.1), bodyMat);
  tailVert.position.set(0, 1.35, 2.2);
  planeParts.add(tailVert);
  const tailHoriz = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.1, 0.8), bodyMat);
  tailHoriz.position.set(0, 0.95, 2.3);
  planeParts.add(tailHoriz);

  // propeller
  const prop = new THREE.Group();
  const propBlade = new THREE.Mesh(new THREE.BoxGeometry(0.22, 1.5, 0.08), darkMat);
  prop.add(propBlade);
  const propBlade2 = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.08, 1.5), darkMat);
  prop.add(propBlade2);
  prop.position.set(0, 0.62, -2.55);
  planeParts.add(prop);

  // jet exhausts
  const flameMat = new THREE.MeshBasicMaterial({
    color: 0xffa64d, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending
  });
  const flameGeo = new THREE.ConeGeometry(0.28, 1.1, 12);
  flameGeo.translate(0, -0.55, 0);
  const exhaustL = new THREE.Mesh(flameGeo, flameMat);
  exhaustL.position.set(-0.55, 0.62, 2.1);
  exhaustL.rotation.x = Math.PI / 2;
  planeParts.add(exhaustL);
  const exhaustR = exhaustL.clone();
  exhaustR.position.x = 0.55;
  planeParts.add(exhaustR);

  planeParts.visible = false;
  root.add(planeParts);

  // boost glow light
  const boostLight = new THREE.PointLight(0xff9933, 0, 40, 2);
  boostLight.position.set(0, 0.5, 2.2);
  root.add(boostLight);

  root.userData = {
    carParts, planeParts, wheels, prop, exhaustL, exhaustR, boostLight
  };

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

  // wheel spin + steering
  for (const w of d.wheels) {
    if (mode === 'car') {
      w.spin.rotation.z += (speed * dt) / 0.36;
    }
    if (w.pivot.userData.steer !== false) {
      w.pivot.rotation.y = -steer * 0.35;
    }
  }

  // propeller
  if (mode === 'plane') {
    d.prop.rotation.z += dt * (8 + speed * 0.6);
    // subtle banking of wings with roll handled by root transform
    const flameScale = nitroActive ? 1.9 : 0.9;
    d.exhaustL.scale.z = flameScale;
    d.exhaustR.scale.z = flameScale;
    d.exhaustL.scale.y = flameScale;
    d.exhaustR.scale.y = flameScale;
    const glow = nitroActive ? 180 : 40;
    d.boostLight.intensity += (glow - d.boostLight.intensity) * (1 - Math.exp(-dt * 6));
    d.exhaustL.material.opacity = nitroActive ? 1 : 0.55;
    d.exhaustR.material.opacity = d.exhaustL.material.opacity;
  } else {
    d.boostLight.intensity += (0 - d.boostLight.intensity) * (1 - Math.exp(-dt * 6));
    d.exhaustL.material.opacity = 0.55;
    d.exhaustR.material.opacity = 0.55;
  }
}
