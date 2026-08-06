// Minimal main.js test
import * as THREE from 'three';
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

const world = createWorld(scene);
world.camera = camera;

const input = new Input();
const net = new Network();
const hud = new HUD(net);
const vehicle = new Vehicle(0, 0);

const vehicleMesh = buildVehicle('#33ccff');
scene.add(vehicleMesh);
const audio = new SoundManager();
const minimap = new Minimap(document.getElementById('minimap'));
const soundBtn = document.getElementById('sound-toggle');

net.onConnected = () => {
  document.getElementById('server-status').textContent = 'Connected - click JOIN to play';
  document.getElementById('server-status').className = 'connected';
};
net.onDisconnected = () => {
  document.getElementById('server-status').textContent = 'Connection lost';
};
net.connect();
setTimeout(() => {
  if (!net.connected) {
    document.getElementById('server-status').textContent = 'Cannot reach server';
  }
}, 6000);

window.__log2 = ['Minimal main.js loaded successfully!'];