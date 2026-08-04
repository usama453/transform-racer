import * as THREE from 'three';

export function buildVehicle(color) {
  const root = new THREE.Group();

  const primary = new THREE.Color(color);
  const dark = primary.clone().multiplyScalar(0.3);
  const bodyMat = new THREE.MeshStandardMaterial({ color: dark, roughness: 0.2, metalness: 0.7 });
  const darkMat = new THREE.MeshStandardMaterial({ color: 0x0a0a1a, roughness: 0.3, metalness: 0.6 });
  const glassMat = new THREE.MeshStandardMaterial({ color: 0x003355, roughness: 0.05, metalness: 0.95, transparent: true, opacity: 0.7 });
  const tireMat = new THREE.MeshStandardMaterial({ color: 0x0a0a14, roughness: 0.95 });
  const hubMat = new THREE.MeshStandardMaterial({ color: primary, metalness: 0.9, roughness: 0.15, emissive: primary, emissiveIntensity: 0.3 });

  const glowMat = new THREE.MeshStandardMaterial({
    color: primary, emissive: primary, emissiveIntensity: 1.5
  });
  const glowBrightMat = new THREE.MeshBasicMaterial({
    color: primary, transparent: true, opacity: 0.8
  });

  const body = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.7, 4.2), bodyMat);
  body.position.y = 0.62;
  body.castShadow = true;
  root.add(body);

  const neonStrip = new THREE.Mesh(
    new THREE.BoxGeometry(2.05, 0.06, 4.25),
    glowBrightMat
  );
  neonStrip.position.y = 0.28;
  root.add(neonStrip);

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

  const headLight = new THREE.SpotLight(primary, 80, 60, 0.4, 0.5, 2);
  headLight.position.set(0, 0.6, -2.8);
  headLight.target.position.set(0, 0, -30);
  root.add(headLight);
  root.add(headLight.target);

  const taillightMat = new THREE.MeshStandardMaterial({
    color: 0xff2244, emissive: 0xff2244, emissiveIntensity: 2.0
  });
  const tailL = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.2, 0.06), taillightMat);
  tailL.position.set(-0.6, 0.62, 2.12);
  root.add(tailL);
  const tailR = tailL.clone();
  tailR.position.x = 0.6;
  root.add(tailR);

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

  const planeParts = new THREE.Group();
  planeParts.name = 'planeParts';

  const wing = new THREE.Mesh(new THREE.BoxGeometry(8.4, 0.14, 1.5), bodyMat);
  wing.position.y = 0.85;
  wing.castShadow = true;
  planeParts.add(wing);

  const wingNeon = new THREE.Mesh(
    new THREE.BoxGeometry(8.5, 0.04, 0.08),
    glowBrightMat
  );
  wingNeon.position.y = 0.93;
  planeParts.add(wingNeon);

  const wingtipL = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.12, 0.9), glowMat);
  wingtipL.position.set(-4.4, 0.85, 0);
  planeParts.add(wingtipL);
  const wingtipR = wingtipL.clone();
  wingtipR.position.x = 4.4;
  planeParts.add(wingtipR);

  const tailVert = new THREE.Mesh(new THREE.BoxGeometry(0.14, 1.1, 1.1), bodyMat);
  tailVert.position.set(0, 1.35, 2.2);
  planeParts.add(tailVert);
  const tailHoriz = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.1, 0.8), bodyMat);
  tailHoriz.position.set(0, 0.95, 2.3);
  planeParts.add(tailHoriz);

  const prop = new THREE.Group();
  const propBlade = new THREE.Mesh(new THREE.BoxGeometry(0.22, 1.5, 0.08), darkMat);
  prop.add(propBlade);
  const propBlade2 = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.08, 1.5), darkMat);
  prop.add(propBlade2);
  prop.position.set(0, 0.62, -2.55);
  planeParts.add(prop);

  const flameMat = new THREE.MeshBasicMaterial({
    color: 0x00ccff, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending
  });
  const flameMat2 = new THREE.MeshBasicMaterial({
    color: 0xff00ff, transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending
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

  const boostLight = new THREE.PointLight(0x00ccff, 0, 40, 2);
  boostLight.position.set(0, 0.5, 2.2);
  root.add(boostLight);

  const underGlow = new THREE.PointLight(primary, 0, 12, 2);
  underGlow.position.set(0, 0.1, 0);
  root.add(underGlow);

  root.userData = {
    carParts, planeParts, wheels, prop, exhaustL, exhaustR, boostLight, underGlow, primary
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

  for (const w of d.wheels) {
    if (mode === 'car') {
      w.spin.rotation.z += (speed * dt) / 0.36;
    }
    if (w.pivot.userData.steer !== false) {
      w.pivot.rotation.y = -steer * 0.35;
    }
  }

  if (mode === 'plane') {
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
  } else {
    d.boostLight.intensity += (0 - d.boostLight.intensity) * (1 - Math.exp(-dt * 6));
    d.exhaustL.material.opacity = 0.55;
    d.exhaustR.material.opacity = 0.55;
  }

  const underGlowIntensity = speed > 5 ? Math.min(3, speed * 0.04) : 0;
  d.underGlow.intensity += (underGlowIntensity - d.underGlow.intensity) * (1 - Math.exp(-dt * 4));
}

export function buildMissile(color) {
  const group = new THREE.Group();
  const c = new THREE.Color(color);

  const bodyMat = new THREE.MeshStandardMaterial({ color: 0xdddddd, roughness: 0.35, metalness: 0.5 });
  const accentMat = new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: 1.4 });

  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.22, 1.1, 10), bodyMat);
  body.rotation.x = Math.PI / 2;
  body.position.z = 0.25;
  group.add(body);

  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.55, 10), accentMat);
  nose.rotation.x = Math.PI / 2;
  nose.position.z = 1.05;
  group.add(nose);

  const finMat = new THREE.MeshStandardMaterial({ color: c, metalness: 0.8, roughness: 0.2 });
  const finV = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.05, 0.4), finMat);
  finV.position.z = -0.4;
  group.add(finV);
  const finH = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.42, 0.4), finMat);
  finH.position.z = -0.4;
  group.add(finH);

  const flame = new THREE.Mesh(
    new THREE.ConeGeometry(0.15, 0.7, 8),
    new THREE.MeshBasicMaterial({ color: 0xffaa44, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending })
  );
  flame.rotation.x = -Math.PI / 2;
  flame.position.z = -0.8;
  group.add(flame);

  const light = new THREE.PointLight(c, 8, 15);
  group.add(light);

  return group;
}
