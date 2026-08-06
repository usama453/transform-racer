import * as THREE from 'three';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { createWorld } from './public/js/world.js';

// Create a scene and populate it with the world
const scene = new THREE.Scene();
const world = createWorld(scene);

// Export to GLB
const exporter = new GLTFExporter();
exporter.parse(
  scene,
  (result) => {
    // Save as GLB binary
    const blob = new Blob([result], { type: 'application/octet-stream' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'world_export.glb';
    a.click();
    console.log('Exported world_export.glb');
  },
  (error) => {
    console.error('Export error:', error);
  },
  { binary: true }
);