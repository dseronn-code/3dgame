import * as THREE from '../lib/three.module.min.js';

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
renderer.setPixelRatio(Math.min(window.devicePixelRatio, isTouch ? 1.5 : 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.getElementById('game').appendChild(renderer.domElement);

export const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0x10141f, 8, 60);
scene.background = new THREE.Color(0x10141f);
export const camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 300);

export const hemi = new THREE.HemisphereLight(0x8090b0, 0x202430, 0.9);
scene.add(hemi);
export const moon = new THREE.DirectionalLight(0xaabbee, 0.8);
moon.castShadow = true;
moon.shadow.mapSize.set(1024, 1024);
Object.assign(moon.shadow.camera, { left: -30, right: 30, top: 30, bottom: -30, near: 1, far: 120 });
moon.shadow.bias = -0.0008;
moon.shadow.normalBias = 0.03;
scene.add(moon, moon.target);

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// Paleta normal x Resonance (interpolada pelo R do sensor)
const _c1 = new THREE.Color(), _c2 = new THREE.Color();
export function applyPalette(pal, R) {
  const n = pal.normal, r = pal.res;
  scene.background.copy(_c1.set(n.bg).lerp(_c2.set(r.bg), R));
  scene.fog.color.copy(scene.background);
  scene.fog.near = lerp(n.fogNear, r.fogNear, R);
  scene.fog.far = lerp(n.fogFar, r.fogFar, R);
  hemi.color.copy(_c1.set(n.sky).lerp(_c2.set(r.sky), R));
  hemi.groundColor.copy(_c1.set(n.ground).lerp(_c2.set(r.ground), R));
  hemi.intensity = lerp(n.hemi, r.hemi, R);
  moon.color.copy(_c1.set(n.moon).lerp(_c2.set(r.moon), R));
  moon.intensity = lerp(n.moonI, r.moonI, R);
}

// ---------------------------------------------------------------------
//  Recursos
export const unitBox = new THREE.BoxGeometry(1, 1, 1);
const matCache = new Map();
export function mat(color, opts) {
  const key = color + (opts ? JSON.stringify(opts) : '');
  if (!matCache.has(key)) matCache.set(key, new THREE.MeshLambertMaterial({ color, ...opts }));
  return matCache.get(key);
}
export function ghostMat(color = 0x7fe9ff, opacity = 0.6) {
  return new THREE.MeshBasicMaterial({ color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false });
}

// ---------------------------------------------------------------------
//  Zona atual: colisores e sólidos (para câmera)
export const world = { colliders: [], solids: [], group: null, bounds: 60 };

export function addCollider(x, z, w, d, top = 10) {
  const c = { minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2, top, on: true };
  world.colliders.push(c);
  return c;
}
export function box(parent, x, y, z, w, h, d, material, { solid = true, collide = false, cast = true, top } = {}) {
  const m = new THREE.Mesh(unitBox, typeof material === 'number' ? mat(material) : material);
  m.scale.set(w, h, d);
  m.position.set(x, y + h / 2, z);
  m.castShadow = cast;
  m.receiveShadow = true;
  parent.add(m);
  if (solid) world.solids.push(m);
  if (collide) m.userData.collider = addCollider(x, z, w, d, top ?? y + h);
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
      if (o.geometry && o.geometry !== unitBox) o.geometry.dispose();
      if (o.material && !o.material.userData.shared) {
        const ms = Array.isArray(o.material) ? o.material : [o.material];
        ms.forEach((m) => { if (![...matCache.values()].includes(m)) m.dispose(); });
      }
    });
  }
  world.colliders = [];
  world.solids = [];
  world.group = new THREE.Group();
  scene.add(world.group);
  return world.group;
}

// ---------------------------------------------------------------------
//  Personagens low-poly
export function buildHumanoid(c) {
  const mats = [];
  const M = (col) => {
    const m = c.ghost ? ghostMat(col, c.opacity ?? 0.5) : new THREE.MeshLambertMaterial({ color: col });
    mats.push(m);
    return m;
  };
  const skin = M(c.skin ?? 0xd9a77a), top = M(c.top ?? 0x4a5a70), legsM = M(c.legs ?? 0x2a2f3a), hair = M(c.hair ?? 0x2a1d14), shoe = M(c.shoe ?? 0x1a1a1a);
  const accent = c.accent != null ? M(c.accent) : null;
  const part = (w, h, d, m, x, y, z, parent) => {
    const p = new THREE.Mesh(unitBox, m);
    p.scale.set(w, h, d);
    p.position.set(x, y, z);
    p.castShadow = !c.ghost;
    parent.add(p);
    return p;
  };
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  const hips = new THREE.Group();
  hips.position.y = 0.88;
  body.add(hips);
  const chest = new THREE.Group();
  hips.add(chest);
  part(0.5, 0.66, 0.28, top, 0, 0.36, 0, chest);
  if (c.coat) part(0.54, 0.5, 0.32, top, 0, 0.0, 0, chest);
  if (accent) part(0.44, 0.12, 0.32, accent, 0, 0.66, 0.02, chest); // cachecol/gola
  const head = new THREE.Group();
  head.position.y = 0.82;
  chest.add(head);
  part(0.34, 0.38, 0.34, skin, 0, 0.12, 0, head);
  part(0.37, 0.12, 0.37, hair, 0, 0.33, -0.01, head);
  part(0.37, 0.26, 0.1, hair, 0, 0.18, -0.17, head);
  if (c.longHair) part(0.37, 0.4, 0.12, hair, 0, 0.0, -0.17, head);
  if (c.hat) part(0.44, 0.08, 0.44, M(c.hat), 0, 0.38, 0, head);
  const legL = new THREE.Group(); legL.position.set(0.12, 0, 0); hips.add(legL);
  const legR = new THREE.Group(); legR.position.set(-0.12, 0, 0); hips.add(legR);
  for (const leg of [legL, legR]) {
    part(0.19, 0.84, 0.22, legsM, 0, -0.42, 0, leg);
    part(0.2, 0.1, 0.3, shoe, 0, -0.83, 0.04, leg);
  }
  const armL = new THREE.Group(); armL.position.set(0.34, 0.64, 0); chest.add(armL);
  const armR = new THREE.Group(); armR.position.set(-0.34, 0.64, 0); chest.add(armR);
  for (const arm of [armL, armR]) {
    part(0.14, 0.6, 0.16, top, 0, -0.28, 0, arm);
    part(0.12, 0.12, 0.12, skin, 0, -0.62, 0, arm);
  }
  root.scale.setScalar(c.scale ?? 1);
  return { root, body, hips, chest, head, legL, legR, armL, armR, mats };
}

// o: { walk(0..1), phase, crouch(0..1), sit, idleT, talk }
export function animateHumanoid(h, o) {
  const sw = Math.sin(o.phase) * 0.7 * o.walk;
  const breathe = Math.sin((o.idleT || 0) * 1.6) * 0.015;
  if (o.sit) {
    h.body.position.y = -0.42;
    h.legL.rotation.x = h.legR.rotation.x = -1.45;
    h.armL.rotation.set(-0.5, 0, -0.1); h.armR.rotation.set(-0.5, 0, 0.1);
    h.chest.rotation.x = 0.05 + breathe;
    return;
  }
  const cr = o.crouch || 0;
  h.body.position.y = lerp(Math.abs(Math.cos(o.phase)) * 0.05 * o.walk, -0.36, cr);
  h.legL.rotation.x = lerp(sw, -1.1, cr);
  h.legR.rotation.x = lerp(-sw, 0.9, cr);
  h.armL.rotation.set(-sw * 0.8 * (1 - cr) + cr * -0.5, 0, -0.08);
  h.armR.rotation.set(sw * 0.8 * (1 - cr) + cr * -0.5, 0, 0.08);
  h.chest.rotation.x = cr * 0.35 + breathe + (o.lean || 0);
  h.head.rotation.y = o.look || 0;
  if (o.talk) { h.armR.rotation.x = -0.4 + Math.sin(o.idleT * 3) * 0.25; }
}
