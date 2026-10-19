import * as THREE from '../lib/three.module.min.js';
import { RoundedBoxGeometry } from '../lib/addons/RoundedBoxGeometry.js';
import { initGfx, solid } from './gfx.js';

export { THREE };
export const isTouch = window.matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const rand = (a, b) => a + Math.random() * (b - a);
export function angleDiff(a, b) {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}

// ---------------------------------------------------------------------
export const renderer = new THREE.WebGLRenderer({ antialias: !isTouch, powerPreference: 'high-performance' });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.getElementById('game').appendChild(renderer.domElement);

export const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0x10141f, 10, 70);
scene.background = new THREE.Color(0x07090f);
export const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.05, 400);

export const hemi = new THREE.HemisphereLight(0x8090b0, 0x202430, 0.5);
scene.add(hemi);
export const moon = new THREE.DirectionalLight(0xaabbee, 1.0);
Object.assign(moon.shadow.camera, { left: -26, right: 26, top: 26, bottom: -26, near: 1, far: 120 });
moon.shadow.bias = -0.0005;
moon.shadow.normalBias = 0.04;
scene.add(moon, moon.target);
initGfx(renderer, scene, camera, moon);

// Paleta normal x Resonance (interpolada pelo R do sensor)
const _c1 = new THREE.Color(), _c2 = new THREE.Color();
export function applyPalette(pal, R) {
  const n = pal.normal, r = pal.res;
  scene.fog.color.copy(_c1.set(n.fog).lerp(_c2.set(r.fog), R));
  scene.fog.near = lerp(n.fogNear, r.fogNear, R);
  scene.fog.far = lerp(n.fogFar, r.fogFar, R);
  hemi.color.copy(_c1.set(n.sky).lerp(_c2.set(r.sky), R));
  hemi.groundColor.copy(_c1.set(n.ground).lerp(_c2.set(r.ground), R));
  hemi.intensity = lerp(n.hemi, r.hemi, R);
  moon.color.copy(_c1.set(n.moon).lerp(_c2.set(r.moon), R));
  moon.intensity = lerp(n.moonI, r.moonI, R);
  if (scene.background && scene.background.isTexture) scene.backgroundIntensity = lerp(n.bgI ?? 0.5, r.bgI ?? 0.3, R);
  renderer.toneMappingExposure = lerp(n.exposure ?? 1, r.exposure ?? 1, R);
}

// ---------------------------------------------------------------------
//  Recursos
export const unitBox = new THREE.BoxGeometry(1, 1, 1);
const roundedCache = new Map();
export function roundedBox(w, h, d, r = 0.04) {
  const key = [w, h, d, r].map((v) => v.toFixed(3)).join(',');
  if (!roundedCache.has(key)) roundedCache.set(key, new RoundedBoxGeometry(w, h, d, 2, Math.min(r, w / 2.1, h / 2.1, d / 2.1)));
  return roundedCache.get(key);
}
export function mat(color) { return solid(color); }
export function ghostMat(color = 0x7fe9ff, opacity = 0.6) {
  return new THREE.MeshBasicMaterial({ color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false });
}

// ---------------------------------------------------------------------
//  Zona atual: colisores e sólidos (para câmera e linha de visão)
export const world = { colliders: [], solids: [], group: null, bounds: 60 };

export function addCollider(x, z, w, d, top = 10) {
  const c = { minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2, top, on: true };
  world.colliders.push(c);
  return c;
}
// Caixa: material pode ser cor (número) ou material. round > 0 usa cantos arredondados.
export function box(parent, x, y, z, w, h, d, material, { solid: isSolid = true, collide = false, cast = true, top, round = 0, dynamic = false, receive = true } = {}) {
  const geo = round > 0 ? roundedBox(w, h, d, round) : unitBox;
  const m = new THREE.Mesh(geo, typeof material === 'number' ? mat(material) : material);
  if (round <= 0) m.scale.set(w, h, d);
  m.position.set(x, y + h / 2, z);
  m.castShadow = cast;
  m.receiveShadow = receive;
  if (dynamic) m.userData.dynamic = true;
  parent.add(m);
  if (isSolid) world.solids.push(m);
  if (collide) m.userData.collider = addCollider(x, z, w, d, top ?? y + h);
  return m;
}
export function mesh(parent, geo, material, x, y, z, { cast = true, receive = true, solid: isSolid = false, dynamic = false } = {}) {
  const m = new THREE.Mesh(geo, typeof material === 'number' ? mat(material) : material);
  m.position.set(x, y, z);
  m.castShadow = cast;
  m.receiveShadow = receive;
  if (dynamic) m.userData.dynamic = true;
  parent.add(m);
  if (isSolid) world.solids.push(m);
  return m;
}

export function resolveCollisions(p, r, y = 0) {
  for (const c of world.colliders) {
    if (!c.on || y >= c.top - 0.05) continue;
    if (p.x + r < c.minX || p.x - r > c.maxX || p.z + r < c.minZ || p.z - r > c.maxZ) continue;
    const cx = clamp(p.x, c.minX, c.maxX), cz = clamp(p.z, c.minZ, c.maxZ);
    const dx = p.x - cx, dz = p.z - cz;
    const d2 = dx * dx + dz * dz;
    if (d2 >= r * r) continue;
    if (d2 > 1e-8) {
      const d = Math.sqrt(d2);
      p.x = cx + (dx / d) * r;
      p.z = cz + (dz / d) * r;
    } else {
      const l = p.x - c.minX, rt = c.maxX - p.x, b = p.z - c.minZ, f = c.maxZ - p.z;
      const m = Math.min(l, rt, b, f);
      if (m === l) p.x = c.minX - r; else if (m === rt) p.x = c.maxX + r;
      else if (m === b) p.z = c.minZ - r; else p.z = c.maxZ + r;
    }
  }
  const B = world.bounds;
  p.x = clamp(p.x, -B, B);
  p.z = clamp(p.z, -B, B);
}

export function clearWorld() {
  if (world.group) {
    scene.remove(world.group);
    world.group.traverse((o) => {
      if (o.geometry && o.geometry !== unitBox && !o.isSkinnedMesh && ![...roundedCache.values()].includes(o.geometry)) o.geometry.dispose();
      const ms = o.material ? (Array.isArray(o.material) ? o.material : [o.material]) : [];
      ms.forEach((m) => { if (!m.userData.shared) m.dispose(); });
    });
  }
  world.colliders = [];
  world.solids = [];
  world.group = new THREE.Group();
  scene.add(world.group);
  return world.group;
}
