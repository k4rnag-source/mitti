import * as THREE from './vendor/three.module.js';
import { GLTFLoader } from './vendor/jsm/loaders/GLTFLoader.js';

const fallback = document.getElementById('fallback');

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(23, innerWidth / innerHeight, 0.01, 100);
camera.position.set(0.0, 0.85, 3.9);
camera.lookAt(0, 0.72, 0);

const renderer = new THREE.WebGLRenderer({
  alpha: true,
  antialias: true,
  premultipliedAlpha: true,
  powerPreference: 'high-performance'
});
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight, false);
renderer.setClearColor(0x000000, 0);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.body.appendChild(renderer.domElement);

scene.add(new THREE.HemisphereLight(0xffffff, 0x2a3038, 2.4));

const key = new THREE.DirectionalLight(0xffffff, 3.4);
key.position.set(3, 5, 4);
key.castShadow = true;
key.shadow.mapSize.set(1024, 1024);
scene.add(key);

const fill = new THREE.DirectionalLight(0x98b8df, 1.2);
fill.position.set(-3, 2, 2);
scene.add(fill);

const back = new THREE.DirectionalLight(0xffffff, 1.0);
back.position.set(0, 2, -4);
scene.add(back);

const shadow = new THREE.Mesh(
  new THREE.CircleGeometry(0.72, 64),
  new THREE.MeshBasicMaterial({
    color: 0x000000,
    transparent: true,
    opacity: 0.20,
    depthWrite: false
  })
);
shadow.rotation.x = -Math.PI / 2;
shadow.position.y = 0.012;
scene.add(shadow);

const loader = new GLTFLoader();
const models = { standing: null, sitting: null, lying: null };
let current = null;
let currentKey = 'standing';
let modelCenter = new THREE.Vector3();
let modelHeight = 1.2;
let state = 'roam';
let moving = false;
let yaw = 0;
let called = false;
let t = 0;
let lastTime = performance.now();

function styleModel(root) {
  root.traverse(node => {
    if (!node.isMesh) return;
    node.castShadow = true;
    node.receiveShadow = true;

    const materials = Array.isArray(node.material) ? node.material : [node.material];
    node.material = materials.map(material => {
      const m = material.clone?.() || new THREE.MeshStandardMaterial();
      const name = String(m.name || '').toLowerCase();

      // Preserve eyes/nose highlights while turning the brown body into a black Lab.
      if (!name.includes('cream') && !name.includes('charcoal')) {
        m.color = new THREE.Color(0.035, 0.045, 0.055);
      }
      m.roughness = Math.max(0.52, m.roughness ?? 0.85);
      m.metalness = 0;
      return m;
    });
  });

  const box = new THREE.Box3().setFromObject(root);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const maxDim = Math.max(size.x, size.y, size.z);
  const scale = 2.65 / Math.max(maxDim, 0.0001);

  root.scale.setScalar(scale);

  const scaledBox = new THREE.Box3().setFromObject(root);
  const scaledCenter = scaledBox.getCenter(new THREE.Vector3());
  root.position.x -= scaledCenter.x;
  root.position.z -= scaledCenter.z;
  root.position.y -= scaledBox.min.y;

  const finalBox = new THREE.Box3().setFromObject(root);
  const finalSize = finalBox.getSize(new THREE.Vector3());
  modelHeight = finalSize.y;
  modelCenter.set(0, finalSize.y * 0.50, 0);
}

function load(key, url) {
  return new Promise((resolve, reject) => {
    loader.load(url, gltf => {
      styleModel(gltf.scene);
      resolve({ root: gltf.scene, animations: gltf.animations || [] });
    }, undefined, reject);
  });
}

function addModel(key) {
  const item = models[key];
  if (!item) return;
  if (current?.root) scene.remove(current.root);
  current = item;
  currentKey = key;
  current.root.rotation.set(0, yaw, 0);
  current.root.position.y = current.root.userData.baseY || current.root.position.y;
  scene.add(current.root);
}

function showFallback(message) {
  console.error(message);
  fallback.style.display = 'flex';
  try { window.mitti?.reportRendererError(message); } catch {}
}

async function init() {
  try {
    if (!renderer.getContext()) throw new Error('WebGL is unavailable');

    models.standing = await load('standing', '../assets/3D/standing.glb');
    models.sitting = await load('sitting', '../assets/3D/sitting.glb');
    models.lying = await load('lying', '../assets/3D/lying.glb');

    addModel('standing');
    window.mitti?.reportRendererReady('3d');
  } catch (error) {
    showFallback('3D model load failed: ' + (error?.stack || error?.message || error));
    window.mitti?.reportRendererReady('fallback');
  }
}

function stateModel(nextState) {
  if (nextState === 'sit' || nextState === 'perch') addModel('sitting');
  else if (nextState === 'sleep') addModel('lying');
  else if (nextState === 'roam' || nextState === 'perch-approach' || nextState === 'look' || nextState === 'drag') addModel('standing');
}

window.mitti?.onState(data => {
  if (!data) return;
  const oldState = state;
  state = data.state || state;
  moving = !!data.moving;
  if (typeof data.yaw === 'number') yaw = data.yaw;
  called = !!data.called;
  if (state !== oldState) stateModel(state);
});

renderer.domElement.addEventListener('pointerdown', e => {
  if (e.button !== 0) return;
  window.mitti?.dragStart(e.clientX, e.clientY);
  e.preventDefault();
});

window.addEventListener('pointerup', e => {
  if (e.button === 0) window.mitti?.dragEnd();
});

function animate(nowMs) {
  requestAnimationFrame(animate);
  const dt = Math.min(0.05, Math.max(0.001, (nowMs - lastTime) / 1000));
  lastTime = nowMs;
  t += dt;

  if (current?.root) {
    const root = current.root;

    let breathing = Math.sin(t * 1.75) * 0.010;
    let sway = Math.sin(t * 2.05) * 0.008;

    if (state === 'sleep') {
      breathing *= 0.42;
      sway *= 0.55;
      root.rotation.x = 0.02 + Math.sin(t * 1.1) * 0.008;
    } else if (state === 'sit' || state === 'perch') {
      root.rotation.x = Math.sin(t * 1.4) * 0.010;
    } else if (state === 'look') {
      root.rotation.x = Math.sin(t * 1.8) * 0.012;
      root.rotation.z = Math.sin(t * 2.2) * 0.018;
    } else if (moving) {
      root.rotation.x = Math.sin(t * 9) * 0.018;
      root.rotation.z = Math.sin(t * 7) * 0.010;
    } else {
      root.rotation.x = 0;
      root.rotation.z = sway;
    }

    root.rotation.y = yaw + (moving ? Math.sin(t * 8) * 0.02 : 0);
    const bob = moving ? Math.abs(Math.sin(t * 8)) * 0.020 : breathing;
    root.position.y = bob;

    // Subtle shadow breathing keeps the pet visually grounded.
    shadow.scale.setScalar(1.0 + (moving ? 0.04 : 0.02) * Math.sin(t * 2.0));
    shadow.material.opacity = state === 'sleep' ? 0.12 : 0.19;
  }

  renderer.render(scene, camera);
}

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight, false);
});

init();
requestAnimationFrame(animate);
