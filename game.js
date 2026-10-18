import * as THREE from './lib/three.module.min.js';

// =====================================================================
//  ARENA ROYALE 3D — shooter em terceira pessoa (estilo Free Fire)
// =====================================================================

const isTouch = window.matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
if (isTouch) document.body.classList.add('touch');

const $ = (id) => document.getElementById(id);
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const rand = (a, b) => a + Math.random() * (b - a);
const pick = (arr) => arr[(Math.random() * arr.length) | 0];
function angleDiff(a, b) {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------------------------------------------------------------------
//  Renderer / cena
// ---------------------------------------------------------------------
const renderer = new THREE.WebGLRenderer({ antialias: !isTouch, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, isTouch ? 1.5 : 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
$('game').appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x9fd3ff);
scene.fog = new THREE.Fog(0xbfe3ff, 70, 230);

const camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.1, 600);

const hemi = new THREE.HemisphereLight(0xdff1ff, 0x5b7a3a, 1.4);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xfff0d0, 2.6);
sun.castShadow = true;
sun.shadow.mapSize.set(isTouch ? 1024 : 2048, isTouch ? 1024 : 2048);
const sc = sun.shadow.camera;
sc.left = -55; sc.right = 55; sc.top = 55; sc.bottom = -55; sc.near = 1; sc.far = 220;
sun.shadow.bias = -0.0006;
sun.shadow.normalBias = 0.03;
scene.add(sun, sun.target);
const SUN_OFFSET = new THREE.Vector3(45, 80, 30);

// Céu em gradiente
{
  const skyGeo = new THREE.SphereGeometry(450, 24, 12);
  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { top: { value: new THREE.Color(0x2a7fd4) }, bottom: { value: new THREE.Color(0xcfeaff) } },
    vertexShader: 'varying vec3 vP; void main(){ vP = (modelMatrix*vec4(position,1.0)).xyz; gl_Position = projectionMatrix*viewMatrix*modelMatrix*vec4(position,1.0); }',
    fragmentShader: 'uniform vec3 top; uniform vec3 bottom; varying vec3 vP; void main(){ float h = clamp(normalize(vP).y*1.6+0.1,0.0,1.0); gl_FragColor = vec4(mix(bottom, top, h),1.0); }',
  });
  const sky = new THREE.Mesh(skyGeo, skyMat);
  sky.renderOrder = -1;
  scene.add(sky);
  scene.userData.sky = sky;
}

// ---------------------------------------------------------------------
//  Recursos compartilhados
// ---------------------------------------------------------------------
const unitBox = new THREE.BoxGeometry(1, 1, 1);
const matCache = new Map();
function lambert(color) {
  if (!matCache.has(color)) matCache.set(color, new THREE.MeshLambertMaterial({ color }));
  return matCache.get(color);
}

// ---------------------------------------------------------------------
//  Mundo
// ---------------------------------------------------------------------
const ARENA_R = 92;
const colliders = [];      // {minX,maxX,minZ,maxZ,top}
const solidMeshes = [];    // bloqueiam tiros e câmera
const minimapRects = [];

function addCollider(x, z, w, d, top) {
  const c = { minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2, top };
  colliders.push(c);
  minimapRects.push(c);
  return c;
}
function addBox(x, z, w, d, h, color, opts = {}) {
  const y = opts.y || 0;
  const m = new THREE.Mesh(unitBox, opts.mat || lambert(color));
  m.scale.set(w, h, d);
  m.position.set(x, y + h / 2, z);
  m.castShadow = opts.cast !== false;
  m.receiveShadow = true;
  scene.add(m);
  if (opts.solid !== false) solidMeshes.push(m);
  return m;
}
function areaFree(x, z, w, d, margin = 1.5) {
  if (Math.hypot(x, z) < 9) return false;
  if (Math.hypot(x, z) + Math.max(w, d) / 2 > ARENA_R - 4) return false;
  for (const c of colliders) {
    if (x + w / 2 + margin > c.minX && x - w / 2 - margin < c.maxX && z + d / 2 + margin > c.minZ && z - d / 2 - margin < c.maxZ) return false;
  }
  return true;
}

let groundMesh;
function buildWorld() {
  const R = mulberry32(1337);
  const rr = (a, b) => a + R() * (b - a);

  // --- Chão com textura procedural
  const cv = document.createElement('canvas');
  cv.width = cv.height = 256;
  const g = cv.getContext('2d');
  g.fillStyle = '#5f9e3c'; g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 2600; i++) {
    const s = 60 + R() * 60;
    g.fillStyle = `rgba(${(s * 0.6) | 0},${(110 + R() * 70) | 0},${(30 + R() * 30) | 0},${0.35 + R() * 0.4})`;
    g.fillRect(R() * 256, R() * 256, 1 + R() * 3, 1 + R() * 3);
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(70, 70);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  groundMesh = new THREE.Mesh(new THREE.PlaneGeometry(600, 600), new THREE.MeshLambertMaterial({ map: tex }));
  groundMesh.rotation.x = -Math.PI / 2;
  groundMesh.receiveShadow = true;
  scene.add(groundMesh);

  // Estradas de terra
  const roadMat = new THREE.MeshLambertMaterial({ color: 0xb08d57 });
  for (const [w, d] of [[8, 190], [190, 8]]) {
    const road = new THREE.Mesh(new THREE.PlaneGeometry(w, d), roadMat);
    road.rotation.x = -Math.PI / 2;
    road.position.y = 0.02;
    road.receiveShadow = true;
    scene.add(road);
  }
  const plaza = new THREE.Mesh(new THREE.CircleGeometry(12, 32), new THREE.MeshLambertMaterial({ color: 0xa88a5c }));
  plaza.rotation.x = -Math.PI / 2;
  plaza.position.y = 0.03;
  plaza.receiveShadow = true;
  scene.add(plaza);

  // --- Torres (pontos altos com escada de caixas)
  const towers = [[0, -30], [-34, 26], [36, 30]];
  for (const [x, z] of towers) {
    addBox(x, z, 5, 5, 3.4, 0x8d6e63);
    addCollider(x, z, 5, 5, 3.4);
    // grade
    for (const [ox, oz, w, d] of [[0, 2.45, 5, 0.12], [0, -2.45, 5, 0.12], [2.45, 0, 0.12, 5]]) {
      addBox(x + ox, z + oz, w, d, 0.9, 0x5d4037, { y: 3.4, solid: false });
    }
    // escada de caixas
    addBox(x - 3.3, z + 1.2, 1.2, 1.2, 1.2, 0xc8a165);
    addCollider(x - 3.3, z + 1.2, 1.2, 1.2, 1.2);
    addBox(x - 3.3, z - 0.3, 1.2, 1.2, 2.3, 0xb8914f);
    addCollider(x - 3.3, z - 0.3, 1.2, 1.2, 2.3);
  }

  // --- Casas
  const wallColors = [0xf4e1c1, 0xe9c46a, 0xa8dadc, 0xf1a7a7, 0xd8e2dc, 0xcdb4db];
  const roofColors = [0xb23a48, 0x6d597a, 0x355070, 0x9c6644];
  let houses = 0;
  for (let tries = 0; tries < 300 && houses < 11; tries++) {
    const w = Math.round(rr(7, 12)), d = Math.round(rr(6, 10)), h = rr(3.8, 5);
    const ang = R() * Math.PI * 2, dist = rr(22, 78);
    const x = Math.cos(ang) * dist, z = Math.sin(ang) * dist;
    if (Math.abs(x) < 7 || Math.abs(z) < 7) continue;
    if (!areaFree(x, z, w, d, 4)) continue;
    houses++;
    addBox(x, z, w, d, h, pick(wallColors));
    addCollider(x, z, w, d, h);
    const roof = new THREE.Mesh(new THREE.ConeGeometry(Math.SQRT1_2, 1, 4), lambert(pick(roofColors)));
    roof.rotation.y = Math.PI / 4;
    roof.scale.set(w + 0.8, rr(2, 3), d + 0.8);
    roof.position.set(x, h + roof.scale.y / 2, z);
    roof.castShadow = true;
    scene.add(roof);
    // porta e janelas
    const face = R() < 0.5 ? 1 : -1;
    addBox(x, z + face * (d / 2 + 0.03), 1.3, 0.1, 2.2, 0x5d4037, { solid: false, cast: false });
    for (const ox of [-w / 2 + 1.5, w / 2 - 1.5]) {
      addBox(x + ox, z + face * (d / 2 + 0.03), 1.2, 0.1, 1, 0x9ad1ff, { y: 1.6, solid: false, cast: false });
      addBox(x + ox, z - face * (d / 2 + 0.03), 1.2, 0.1, 1, 0x9ad1ff, { y: 1.6, solid: false, cast: false });
    }
  }

  // --- Containers
  const contColors = [0xd62828, 0x1d4e89, 0x2a9d8f, 0xf77f00, 0x6a994e];
  let conts = 0;
  for (let tries = 0; tries < 300 && conts < 14; tries++) {
    const horiz = R() < 0.5;
    const w = horiz ? 6.5 : 2.6, d = horiz ? 2.6 : 6.5;
    const x = rr(-80, 80), z = rr(-80, 80);
    if (!areaFree(x, z, w, d, 2.5)) continue;
    conts++;
    const stacked = R() < 0.3;
    const col = pick(contColors);
    addBox(x, z, w, d, 2.7, col);
    // frisos
    const ribMat = lambert(new THREE.Color(col).multiplyScalar(0.7).getHex());
    for (let i = -2; i <= 2; i++) {
      addBox(x + (horiz ? i * 1.2 : 0), z + (horiz ? 0 : i * 1.2), horiz ? 0.08 : w + 0.06, horiz ? d + 0.06 : 0.08, 2.5, 0, { y: 0.1, solid: false, cast: false, mat: ribMat });
    }
    let top = 2.7;
    if (stacked) { addBox(x, z, w, d, 2.7, pick(contColors), { y: 2.7 }); top = 5.4; }
    addCollider(x, z, w, d, top);
    // caixa ao lado para subir
    if (!stacked && R() < 0.6) {
      const cx = x + (horiz ? w / 2 + 0.8 : 0), cz = z + (horiz ? 0 : d / 2 + 0.8);
      if (areaFree(cx, cz, 1.2, 1.2, 0.05)) {
        addBox(cx, cz, 1.3, 1.3, 1.3, 0xc8a165);
        addCollider(cx, cz, 1.3, 1.3, 1.3);
      }
    }
  }

  // --- Caixas de madeira (algumas empilhadas)
  for (let tries = 0, n = 0; tries < 400 && n < 34; tries++) {
    const x = rr(-82, 82), z = rr(-82, 82);
    const s = rr(1.1, 1.4);
    if (!areaFree(x, z, s * 2.4, s, 1.2)) continue;
    n++;
    addBox(x, z, s, s, s, 0xc8a165);
    addCollider(x, z, s, s, s);
    if (R() < 0.45) {
      addBox(x + s, z, s, s, s * 2, 0xb8914f);
      addCollider(x + s, z, s, s, s * 2);
    }
  }

  // --- Sacos de areia (cobertura baixa — agache!)
  for (let tries = 0, n = 0; tries < 300 && n < 18; tries++) {
    const horiz = R() < 0.5;
    const w = horiz ? 4 : 0.9, d = horiz ? 0.9 : 4;
    const x = rr(-75, 75), z = rr(-75, 75);
    if (!areaFree(x, z, w, d, 1.5)) continue;
    n++;
    addBox(x, z, w, d, 1.0, 0xc2b280);
    addCollider(x, z, w, d, 1.0);
  }
  // cobertura na praça central
  for (const [x, z, w, d] of [[-6, 0, 0.9, 4], [6, 0, 0.9, 4], [0, 6, 4, 0.9], [0, -6, 4, 0.9]]) {
    addBox(x, z, w, d, 1.0, 0xc2b280);
    addCollider(x, z, w, d, 1.0);
  }

  // --- Árvores
  const trunkMat = lambert(0x6d4c41);
  const leafMats = [lambert(0x2d6a4f), lambert(0x40916c), lambert(0x52b788)];
  const leafGeo = new THREE.IcosahedronGeometry(1, 0);
  const pineGeo = new THREE.ConeGeometry(1, 1, 7);
  for (let tries = 0, n = 0; tries < 600 && n < 70; tries++) {
    const ang = R() * Math.PI * 2, dist = rr(12, 88);
    const x = Math.cos(ang) * dist, z = Math.sin(ang) * dist;
    if (Math.abs(x) < 6 || Math.abs(z) < 6) continue;
    if (!areaFree(x, z, 1, 1, 2.5)) continue;
    n++;
    const h = rr(2.5, 4);
    const trunk = addBox(x, z, 0.5, 0.5, h, 0, { mat: trunkMat });
    addCollider(x, z, 0.6, 0.6, 50);
    if (R() < 0.5) {
      const leaf = new THREE.Mesh(leafGeo, pick(leafMats));
      const s = rr(1.8, 2.8);
      leaf.scale.set(s, s * rr(0.9, 1.2), s);
      leaf.position.set(x, h + s * 0.6, z);
      leaf.rotation.set(R(), R(), R());
      leaf.castShadow = true;
      scene.add(leaf);
    } else {
      for (let i = 0; i < 3; i++) {
        const cone = new THREE.Mesh(pineGeo, pick(leafMats));
        const s = 2.4 - i * 0.6;
        cone.scale.set(s, 2.2, s);
        cone.position.set(x, h - 0.4 + i * 1.3, z);
        cone.castShadow = true;
        scene.add(cone);
      }
    }
    trunk.userData.tree = true;
  }

  // --- Pedras
  const rockGeo = new THREE.DodecahedronGeometry(1, 0);
  const rockMats = [lambert(0x8d99ae), lambert(0x6c757d), lambert(0xadb5bd)];
  for (let tries = 0, n = 0; tries < 300 && n < 22; tries++) {
    const x = rr(-82, 82), z = rr(-82, 82);
    const s = rr(0.8, 2.2);
    if (!areaFree(x, z, s * 1.6, s * 1.6, 1.5)) continue;
    n++;
    const rock = new THREE.Mesh(rockGeo, pick(rockMats));
    rock.scale.set(s, s * rr(0.6, 1), s);
    rock.position.set(x, s * 0.35, z);
    rock.rotation.set(R(), R(), R());
    rock.castShadow = rock.receiveShadow = true;
    scene.add(rock);
    solidMeshes.push(rock);
    addCollider(x, z, s * 1.5, s * 1.5, s * 0.35 + rock.scale.y * 0.8);
  }

  // --- Limite da arena: cerca + rochas
  const postMat = lambert(0x5d4037);
  const segs = 120;
  for (let i = 0; i < segs; i++) {
    const a = (i / segs) * Math.PI * 2;
    const x = Math.cos(a) * (ARENA_R + 1.5), z = Math.sin(a) * (ARENA_R + 1.5);
    const p = new THREE.Mesh(unitBox, postMat);
    p.scale.set(0.25, 1.6, 0.25);
    p.position.set(x, 0.8, z);
    scene.add(p);
    const rail = new THREE.Mesh(unitBox, postMat);
    const len = (2 * Math.PI * (ARENA_R + 1.5)) / segs + 0.05;
    rail.scale.set(0.1, 0.12, len);
    rail.position.set(x, 1.2, z);
    rail.lookAt(Math.cos(a + 0.01) * (ARENA_R + 1.5), 1.2, Math.sin(a + 0.01) * (ARENA_R + 1.5));
    scene.add(rail);
  }
  // montanhas distantes
  const mountMat = new THREE.MeshLambertMaterial({ color: 0x6b8f71, flatShading: true });
  for (let i = 0; i < 28; i++) {
    const a = (i / 28) * Math.PI * 2 + rr(-0.05, 0.05);
    const dist = rr(150, 190);
    const m = new THREE.Mesh(new THREE.ConeGeometry(rr(25, 45), rr(30, 70), 6), mountMat);
    m.position.set(Math.cos(a) * dist, 10, Math.sin(a) * dist);
    m.rotation.y = R() * 3;
    scene.add(m);
  }

  // --- Grama decorativa (instanciada)
  const bladeGeo = new THREE.ConeGeometry(0.06, 0.35, 3);
  bladeGeo.translate(0, 0.17, 0);
  const grassCount = isTouch ? 1800 : 4000;
  const grass = new THREE.InstancedMesh(bladeGeo, new THREE.MeshLambertMaterial({ color: 0x4f8f2f }), grassCount);
  const dummy = new THREE.Object3D();
  for (let i = 0; i < grassCount; i++) {
    const a = R() * Math.PI * 2, dist = Math.sqrt(R()) * ARENA_R;
    dummy.position.set(Math.cos(a) * dist, 0, Math.sin(a) * dist);
    dummy.rotation.set(rr(-0.3, 0.3), R() * 3, rr(-0.3, 0.3));
    const s = rr(0.6, 1.4);
    dummy.scale.set(s, s, s);
    dummy.updateMatrix();
    grass.setMatrixAt(i, dummy.matrix);
  }
  scene.add(grass);

  // --- Nuvens
  const cloudMat = new THREE.MeshLambertMaterial({ color: 0xffffff, emissive: 0x666666 });
  for (let i = 0; i < 18; i++) {
    const cg = new THREE.Group();
    for (let j = 0; j < 4; j++) {
      const b = new THREE.Mesh(unitBox, cloudMat);
      b.scale.set(rr(8, 16), rr(3, 5), rr(6, 10));
      b.position.set(rr(-8, 8), rr(-1, 1.5), rr(-4, 4));
      cg.add(b);
    }
    cg.position.set(rr(-200, 200), rr(60, 90), rr(-200, 200));
    scene.add(cg);
    clouds.push(cg);
  }
}
const clouds = [];
{
  const before = new Set(scene.children);
  buildWorld();
  mergeStatic(scene.children.filter((o) => !before.has(o) && o.isMesh && !o.isInstancedMesh && o !== groundMesh));
}

// Junta meshes estáticas por material (menos draw calls — importante no celular).
// As meshes originais continuam em solidMeshes (fora da cena) para raycast.
function mergeStatic(meshes) {
  scene.updateMatrixWorld(true);
  const groups = new Map();
  for (const m of meshes) {
    const key = m.material.uuid + (m.castShadow ? ':s' : '');
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(m);
    scene.remove(m);
  }
  const nm = new THREE.Matrix3();
  const v = new THREE.Vector3();
  for (const list of groups.values()) {
    let vCount = 0, iCount = 0;
    for (const m of list) {
      const g = m.geometry;
      vCount += g.attributes.position.count;
      iCount += g.index ? g.index.count : g.attributes.position.count;
    }
    const pos = new Float32Array(vCount * 3), nor = new Float32Array(vCount * 3), idx = new Uint32Array(iCount);
    let vo = 0, io = 0;
    for (const m of list) {
      const g = m.geometry;
      const P = g.attributes.position, N = g.attributes.normal;
      nm.getNormalMatrix(m.matrixWorld);
      for (let i = 0; i < P.count; i++) {
        v.fromBufferAttribute(P, i).applyMatrix4(m.matrixWorld);
        pos.set([v.x, v.y, v.z], (vo + i) * 3);
        v.fromBufferAttribute(N, i).applyMatrix3(nm).normalize();
        nor.set([v.x, v.y, v.z], (vo + i) * 3);
      }
      if (g.index) for (let i = 0; i < g.index.count; i++) idx[io++] = g.index.getX(i) + vo;
      else for (let i = 0; i < P.count; i++) idx[io++] = i + vo;
      vo += P.count;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    geo.setIndex(new THREE.BufferAttribute(idx, 1));
    geo.computeBoundingSphere();
    const merged = new THREE.Mesh(geo, list[0].material);
    merged.castShadow = list[0].castShadow;
    merged.receiveShadow = true;
    merged.matrixAutoUpdate = false;
    scene.add(merged);
  }
}

// ---------------------------------------------------------------------
//  Colisão
// ---------------------------------------------------------------------
function resolveCollisions(p, r, y) {
  for (let i = 0; i < colliders.length; i++) {
    const c = colliders[i];
    if (y >= c.top - 0.05) continue;
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
      if (m === l) p.x = c.minX - r;
      else if (m === rt) p.x = c.maxX + r;
      else if (m === b) p.z = c.minZ - r;
      else p.z = c.maxZ + r;
    }
  }
  const d = Math.hypot(p.x, p.z);
  if (d > ARENA_R) { p.x *= ARENA_R / d; p.z *= ARENA_R / d; }
}
function groundHeightAt(x, z, r, y) {
  let h = 0;
  const rr = r * 0.6;
  for (let i = 0; i < colliders.length; i++) {
    const c = colliders[i];
    if (c.top > y + 0.3 || c.top <= h) continue;
    if (x + rr > c.minX && x - rr < c.maxX && z + rr > c.minZ && z - rr < c.maxZ) h = c.top;
  }
  return h;
}
function pointInSolid(x, y, z) {
  if (y <= 0) return true;
  for (let i = 0; i < colliders.length; i++) {
    const c = colliders[i];
    if (y < c.top && x > c.minX && x < c.maxX && z > c.minZ && z < c.maxZ) return true;
  }
  return false;
}

// ---------------------------------------------------------------------
//  Áudio sintetizado
// ---------------------------------------------------------------------
let actx = null, master = null, noiseBuf = null;
function initAudio() {
  if (actx) { if (actx.state === 'suspended') actx.resume(); return; }
  try {
    actx = new (window.AudioContext || window.webkitAudioContext)();
    master = actx.createGain();
    master.gain.value = 0.45;
    master.connect(actx.destination);
    noiseBuf = actx.createBuffer(1, actx.sampleRate, actx.sampleRate);
    const ch = noiseBuf.getChannelData(0);
    for (let i = 0; i < ch.length; i++) ch[i] = Math.random() * 2 - 1;
  } catch (e) { actx = null; }
}
function noise({ dur = 0.1, freq = 1200, type = 'lowpass', vol = 0.3, q = 0.8 }) {
  if (!actx) return;
  const t = actx.currentTime;
  const src = actx.createBufferSource();
  src.buffer = noiseBuf;
  const f = actx.createBiquadFilter();
  f.type = type; f.frequency.value = freq; f.Q.value = q;
  const g = actx.createGain();
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  src.connect(f); f.connect(g); g.connect(master);
  src.start(t, Math.random() * 0.5, dur + 0.05);
}
function tone({ f = 440, f2 = null, dur = 0.1, type = 'square', vol = 0.15, delay = 0 }) {
  if (!actx) return;
  const t = actx.currentTime + delay;
  const o = actx.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(f, t);
  if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + dur);
  const g = actx.createGain();
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(g); g.connect(master);
  o.start(t); o.stop(t + dur + 0.02);
}
const sfx = {
  shoot() { noise({ dur: 0.11, freq: 2200, vol: 0.32 }); tone({ f: 180, f2: 50, dur: 0.09, vol: 0.14 }); },
  enemyShoot(dist) { const v = clamp(1 - dist / 70, 0.03, 1) * 0.16; noise({ dur: 0.08, freq: 1400, vol: v }); },
  hit() { tone({ f: 1000, f2: 800, dur: 0.05, type: 'triangle', vol: 0.18 }); },
  head() { tone({ f: 1600, f2: 2100, dur: 0.09, type: 'sine', vol: 0.25 }); tone({ f: 2400, dur: 0.06, type: 'sine', vol: 0.12, delay: 0.04 }); },
  kill() { tone({ f: 500, f2: 1300, dur: 0.18, type: 'square', vol: 0.12 }); },
  hurt() { noise({ dur: 0.2, freq: 500, vol: 0.4 }); tone({ f: 140, f2: 70, dur: 0.2, type: 'sawtooth', vol: 0.12 }); },
  reload() { tone({ f: 300, dur: 0.04, vol: 0.12 }); tone({ f: 500, dur: 0.05, vol: 0.12, delay: 0.25 }); },
  reloadDone() { tone({ f: 700, dur: 0.05, vol: 0.12 }); tone({ f: 900, dur: 0.05, vol: 0.1, delay: 0.06 }); },
  empty() { tone({ f: 1200, dur: 0.03, type: 'square', vol: 0.08 }); },
  pickup() { [520, 660, 880].forEach((f, i) => tone({ f, dur: 0.1, type: 'triangle', vol: 0.15, delay: i * 0.06 })); },
  wave() { [392, 523, 659, 784].forEach((f, i) => tone({ f, dur: 0.18, type: 'square', vol: 0.1, delay: i * 0.1 })); },
  clear() { [523, 659, 784, 1046].forEach((f, i) => tone({ f, dur: 0.22, type: 'triangle', vol: 0.15, delay: i * 0.09 })); },
  explode() { noise({ dur: 0.6, freq: 400, vol: 0.55 }); tone({ f: 90, f2: 30, dur: 0.5, type: 'sine', vol: 0.4 }); },
  jump() { tone({ f: 300, f2: 500, dur: 0.08, type: 'sine', vol: 0.06 }); },
  step() { noise({ dur: 0.05, freq: 600, vol: 0.05 }); },
  charge() { tone({ f: 200, f2: 900, dur: 0.8, type: 'sawtooth', vol: 0.04 }); },
  streak() { [660, 880, 1320].forEach((f, i) => tone({ f, dur: 0.12, type: 'square', vol: 0.1, delay: i * 0.05 })); },
  click() { tone({ f: 800, dur: 0.04, type: 'triangle', vol: 0.1 }); },
};

// ---------------------------------------------------------------------
//  Personagens (low-poly)
// ---------------------------------------------------------------------
function buildHumanoid(c, ownerTag) {
  const M = (col) => new THREE.MeshLambertMaterial({ color: col });
  const mats = [];
  const mk = (col) => { const m = M(col); mats.push(m); return m; };
  const skin = mk(c.skin), shirt = mk(c.shirt), pants = mk(c.pants), hair = mk(c.hair), vest = mk(c.vest), shoe = mk(0x222222), gunM = mk(0x2b2d42), dark = mk(0x111111);
  const parts = [];
  const part = (w, h, d, mat, x, y, z, parent, head = false) => {
    const m = new THREE.Mesh(unitBox, mat);
    m.scale.set(w, h, d);
    m.position.set(x, y, z);
    m.castShadow = true;
    m.userData.owner = ownerTag;
    m.userData.head = head;
    parent.add(m);
    parts.push(m);
    return m;
  };
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  const hips = new THREE.Group();
  hips.position.y = 0.9;
  body.add(hips);
  part(0.62, 0.72, 0.34, shirt, 0, 0.4, 0, hips);
  part(0.66, 0.42, 0.4, vest, 0, 0.47, 0, hips);
  part(0.42, 0.42, 0.42, skin, 0, 0.98, 0, hips, true);
  part(0.46, 0.13, 0.46, hair, 0, 1.22, 0, hips, true);
  part(0.46, 0.2, 0.1, hair, 0, 1.08, -0.2, hips, true);
  part(0.07, 0.07, 0.03, dark, 0.1, 1.0, 0.215, hips, true);
  part(0.07, 0.07, 0.03, dark, -0.1, 1.0, 0.215, hips, true);
  if (c.mask) part(0.44, 0.14, 0.05, mk(c.mask), 0, 0.88, 0.215, hips, true);
  const legL = new THREE.Group(); legL.position.set(0.16, 0, 0); hips.add(legL);
  const legR = new THREE.Group(); legR.position.set(-0.16, 0, 0); hips.add(legR);
  for (const leg of [legL, legR]) {
    part(0.25, 0.86, 0.28, pants, 0, -0.43, 0, leg);
    part(0.27, 0.14, 0.36, shoe, 0, -0.84, 0.04, leg);
  }
  const armL = new THREE.Group(); armL.position.set(0.42, 0.68, 0); hips.add(armL);
  const armR = new THREE.Group(); armR.position.set(-0.42, 0.68, 0); hips.add(armR);
  for (const arm of [armL, armR]) {
    part(0.18, 0.64, 0.2, shirt, 0, -0.3, 0, arm);
    part(0.16, 0.14, 0.16, skin, 0, -0.66, 0, arm);
  }
  // arma no braço direito (eixo -Y local = frente quando o braço aponta pra frente)
  const gun = new THREE.Group();
  gun.position.set(0.0, -0.66, 0.0);
  armR.add(gun);
  part(0.1, 0.55, 0.17, gunM, 0, -0.18, 0.08, gun);
  part(0.06, 0.38, 0.06, dark, 0, -0.6, 0.11, gun);
  part(0.08, 0.14, 0.24, dark, 0, -0.2, -0.1, gun);
  part(0.09, 0.28, 0.14, gunM, 0, 0.18, 0.06, gun);
  part(0.04, 0.08, 0.06, dark, 0, -0.1, 0.2, gun);
  const muzzle = new THREE.Object3D();
  muzzle.position.set(0, -0.82, 0.11);
  gun.add(muzzle);

  root.scale.setScalar(c.scale || 1);
  return { root, body, hips, legL, legR, armL, armR, gun, muzzle, parts, mats };
}

function animateHumanoid(h, o) {
  // o: {walk, phase, crouch, air, pitch, dead}
  const swing = Math.sin(o.phase) * 0.75 * o.walk;
  if (o.crouch > 0) {
    h.body.position.y = lerp(0, -0.38, o.crouch);
    h.legL.rotation.x = lerp(swing, -1.0, o.crouch);
    h.legR.rotation.x = lerp(-swing, 1.0, o.crouch);
  } else {
    h.body.position.y = Math.abs(Math.cos(o.phase)) * 0.06 * o.walk;
    h.legL.rotation.x = o.air ? -0.6 : swing;
    h.legR.rotation.x = o.air ? 0.3 : -swing;
  }
  const aim = -Math.PI / 2 - (o.pitch || 0);
  h.armR.rotation.set(aim, 0, 0.12);
  h.armL.rotation.set(aim + 0.12, 0, -0.62);
  h.hips.rotation.y = 0;
}

// ---------------------------------------------------------------------
//  Efeitos: partículas, traçantes, flash, popups
// ---------------------------------------------------------------------
const PMAX = 600;
const pMesh = new THREE.InstancedMesh(unitBox, new THREE.MeshBasicMaterial({ color: 0xffffff }), PMAX);
pMesh.frustumCulled = false;
const particles = [];
const tmpObj = new THREE.Object3D();
const tmpCol = new THREE.Color();
for (let i = 0; i < PMAX; i++) {
  tmpObj.scale.setScalar(0);
  tmpObj.updateMatrix();
  pMesh.setMatrixAt(i, tmpObj.matrix);
  pMesh.setColorAt(i, tmpCol.set(0xffffff));
}
scene.add(pMesh);
function spawnParticles(pos, count, color, speed = 6, size = 0.12, life = 0.5, grav = 18, up = 2) {
  for (let i = 0; i < count; i++) {
    if (particles.length >= PMAX) particles.shift();
    particles.push({
      x: pos.x, y: pos.y, z: pos.z,
      vx: rand(-1, 1) * speed, vy: rand(-0.3, 1) * speed + up, vz: rand(-1, 1) * speed,
      life: life * rand(0.6, 1.2), max: life, size: size * rand(0.6, 1.3), grav, color,
    });
  }
}
function updateParticles(dt) {
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.life -= dt;
    if (p.life <= 0) { particles.splice(i, 1); continue; }
    p.vy -= p.grav * dt;
    p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
    if (p.y < 0.03) { p.y = 0.03; p.vy *= -0.3; p.vx *= 0.7; p.vz *= 0.7; }
  }
  for (let i = 0; i < PMAX; i++) {
    const p = particles[i];
    if (p) {
      tmpObj.position.set(p.x, p.y, p.z);
      tmpObj.rotation.set(p.x * 3, p.z * 3, 0);
      tmpObj.scale.setScalar(p.size * clamp(p.life / p.max, 0, 1));
      tmpObj.updateMatrix();
      pMesh.setMatrixAt(i, tmpObj.matrix);
      pMesh.setColorAt(i, tmpCol.set(p.color));
    } else {
      tmpObj.scale.setScalar(0);
      tmpObj.updateMatrix();
      pMesh.setMatrixAt(i, tmpObj.matrix);
    }
  }
  pMesh.instanceMatrix.needsUpdate = true;
  if (pMesh.instanceColor) pMesh.instanceColor.needsUpdate = true;
}

const tracerMat = new THREE.MeshBasicMaterial({ color: 0xffe08a, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false });
const tracers = [];
function spawnTracer(from, to, color = 0xffe08a, width = 0.035) {
  const len = from.distanceTo(to);
  if (len < 0.1) return;
  const m = new THREE.Mesh(unitBox, color === 0xffe08a ? tracerMat.clone() : new THREE.MeshBasicMaterial({ color, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
  m.material.color.set(color);
  m.position.copy(from).lerp(to, 0.5);
  m.lookAt(to);
  m.scale.set(width, width, len);
  scene.add(m);
  tracers.push({ m, life: 0.07 });
}
function updateTracers(dt) {
  for (let i = tracers.length - 1; i >= 0; i--) {
    const t = tracers[i];
    t.life -= dt;
    t.m.material.opacity = clamp(t.life / 0.07, 0, 1);
    if (t.life <= 0) { scene.remove(t.m); t.m.material.dispose(); tracers.splice(i, 1); }
  }
}

const flashMesh = new THREE.Mesh(new THREE.OctahedronGeometry(0.22, 0), new THREE.MeshBasicMaterial({ color: 0xfff1a8, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
flashMesh.visible = false;
scene.add(flashMesh);
const flashLight = new THREE.PointLight(0xffc860, 0, 9, 2);
scene.add(flashLight);
let flashTime = 0;

const booms = [];
const boomGeo = new THREE.SphereGeometry(1, 16, 10);
function explosion(pos, radius, dmg) {
  const doDamage = dmg > 0;
  const m = new THREE.Mesh(boomGeo, new THREE.MeshBasicMaterial({ color: 0xffa630, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false }));
  m.position.copy(pos);
  m.scale.setScalar(0.3);
  scene.add(m);
  booms.push({ m, life: 0.35, r: radius });
  spawnParticles(pos, 26, 0xff7b00, 9, 0.22, 0.7, 12, 4);
  spawnParticles(pos, 14, 0x444444, 5, 0.35, 1.0, 2, 3);
  sfx.explode();
  shake(0.35);
  for (const e of enemies) {
    if (e.dead) continue;
    const d = e.pos.distanceTo(pos);
    if (doDamage && d < radius + e.def.radius) damageEnemy(e, dmg * (1 - (d / (radius + 1)) * 0.5), false, pos);
  }
}
function updateBooms(dt) {
  for (let i = booms.length - 1; i >= 0; i--) {
    const b = booms[i];
    b.life -= dt;
    const k = 1 - b.life / 0.35;
    b.m.scale.setScalar(0.3 + k * b.r);
    b.m.material.opacity = 0.85 * (1 - k);
    if (b.life <= 0) { scene.remove(b.m); b.m.material.dispose(); booms.splice(i, 1); }
  }
}

const popLayer = $('popups');
const projV = new THREE.Vector3();
function popup(worldPos, text, cls = '') {
  projV.copy(worldPos).project(camera);
  if (projV.z > 1) return;
  const el = document.createElement('div');
  el.className = 'pop ' + cls;
  el.textContent = text;
  el.style.left = ((projV.x * 0.5 + 0.5) * window.innerWidth + rand(-14, 14)) + 'px';
  el.style.top = ((-projV.y * 0.5 + 0.5) * window.innerHeight) + 'px';
  popLayer.appendChild(el);
  setTimeout(() => el.remove(), 820);
}
function feed(html) {
  const el = document.createElement('div');
  el.className = 'feed';
  el.innerHTML = html;
  const kf = $('killFeed');
  kf.prepend(el);
  while (kf.children.length > 5) kf.lastChild.remove();
  setTimeout(() => el.remove(), 3600);
}
function announce(text, sub = '') {
  const a = $('announce');
  a.innerHTML = text + (sub ? `<small>${sub}</small>` : '');
  a.classList.remove('show');
  void a.offsetWidth;
  a.classList.add('show');
}
function streakText(text) {
  const a = $('streak');
  a.textContent = text;
  a.classList.remove('show');
  void a.offsetWidth;
  a.classList.add('show');
}
let hitTimer = 0;
function hitmarker(kind) {
  const h = $('hitmarker');
  h.className = 'show ' + (kind || '');
  hitTimer = kind === 'kill' ? 0.22 : 0.1;
}
let shakeAmt = 0;
function shake(a) { shakeAmt = Math.max(shakeAmt, a); }

// ---------------------------------------------------------------------
//  Jogador
// ---------------------------------------------------------------------
const BASE_STATS = {
  maxHp: 100, damage: 22, fireRate: 8.5, magSize: 30, reloadTime: 1.5, speed: 6.2,
  multishot: 1, spreadMul: 1, headMul: 2, regen: 0, lifesteal: 0, explodeChance: 0, pierce: 0, maxJumps: 1,
};
const player = {
  pos: new THREE.Vector3(0, 0, 4),
  vy: 0, onGround: true, jumps: 0,
  facing: Math.PI, crouch: false, crouchT: 0,
  hp: 100, stats: { ...BASE_STATS },
  ammo: 30, reloading: false, reloadT: 0,
  fireCd: 0, bloom: 0, lastShot: -10, phase: 0, walkAmt: 0, stepT: 0,
  model: buildHumanoid({ skin: 0xf1c27d, shirt: 0x2b9348, pants: 0x283618, hair: 0x3d2b1f, vest: 0x1b4332, mask: null }, 'player'),
  sprinting: false, invuln: 0,
};
scene.add(player.model.root);

const cam = { yaw: Math.PI, pitch: -0.08, aimT: 0, dist: 3.6 };
const input = { f: 0, b: 0, l: 0, r: 0, joyX: 0, joyY: 0, sprint: false, fire: false, aim: false, jump: false };

// ---------------------------------------------------------------------
//  Inimigos
// ---------------------------------------------------------------------
const TYPES = {
  grunt: { name: 'Soldado', hp: 70, speed: 3.4, scale: 1, radius: 0.45, range: 30, fireCd: [1.1, 1.9], burst: 1, burstGap: 0.12, dmg: 7, projSpeed: 30, err: 1.1, score: 100, drop: 0.12,
    colors: { skin: 0xe0ac69, shirt: 0xb5323a, pants: 0x2f2f2f, hair: 0x1a1a1a, vest: 0x641220, mask: 0x111111 } },
  runner: { name: 'Corredor', hp: 42, speed: 7.4, scale: 0.9, radius: 0.4, melee: true, dmg: 11, score: 120, drop: 0.1,
    colors: { skin: 0xc68642, shirt: 0xff8c00, pants: 0x3a2e1f, hair: 0xffd000, vest: 0xd35400, mask: 0xffffff } },
  sniper: { name: 'Atirador', hp: 55, speed: 2.8, scale: 1, radius: 0.45, range: 70, fireCd: [3.0, 4.2], burst: 1, dmg: 22, projSpeed: 75, err: 0.15, charge: 1.0, score: 160, drop: 0.15,
    colors: { skin: 0x8d5524, shirt: 0x4361ee, pants: 0x1b1b3a, hair: 0x101010, vest: 0x3a0ca3, mask: 0x4cc9f0 } },
  brute: { name: 'Brutamonte', hp: 340, speed: 2.6, scale: 1.45, radius: 0.7, range: 24, fireCd: [2.4, 3.0], burst: 6, burstGap: 0.11, dmg: 6, projSpeed: 26, err: 1.6, score: 350, drop: 0.55,
    colors: { skin: 0x9c6644, shirt: 0x7209b7, pants: 0x240046, hair: 0x10002b, vest: 0x3c096c, mask: 0xe0aaff } },
  boss: { name: 'CHEFÃO', hp: 2000, speed: 2.4, scale: 2.4, radius: 1.1, range: 45, fireCd: [1.6, 2.2], burst: 10, burstGap: 0.09, dmg: 8, projSpeed: 30, err: 1.4, score: 2500, drop: 1, boss: true,
    colors: { skin: 0x6b4423, shirt: 0x111111, pants: 0x222222, hair: 0xffb703, vest: 0xffb703, mask: 0xd00000 } },
};

const enemies = [];
let enemyHitMeshes = [];
function rebuildHitList() {
  enemyHitMeshes = [];
  for (const e of enemies) if (!e.dead) for (const p of e.h.parts) enemyHitMeshes.push(p);
}

const barGeo = new THREE.PlaneGeometry(1, 0.12);
class Enemy {
  constructor(type, x, z, wave) {
    const def = TYPES[type];
    this.type = type;
    this.def = def;
    this.h = buildHumanoid({ ...def.colors, scale: def.scale }, this);
    this.pos = new THREE.Vector3(x, 0, z);
    this.vel = new THREE.Vector3();
    const hpMul = 1 + (wave - 1) * 0.16;
    this.maxHp = def.hp * hpMul;
    this.hp = this.maxHp;
    this.dmg = def.dmg * (1 + (wave - 1) * 0.07);
    this.speed = def.speed * (1 + Math.min(0.35, (wave - 1) * 0.025)) * rand(0.92, 1.08);
    this.err = (def.err || 1) * Math.max(0.45, 1 - (wave - 1) * 0.04);
    this.fireT = rand(1.2, 2.5);
    this.burstLeft = 0;
    this.burstT = 0;
    this.attackCd = 0;
    this.losT = 0;
    this.los = false;
    this.strafe = Math.random() < 0.5 ? 1 : -1;
    this.strafeT = rand(1, 3);
    this.stuckT = 0;
    this.detour = 0;
    this.detourT = 0;
    this.lastPos = this.pos.clone();
    this.facing = 0;
    this.phase = Math.random() * 6;
    this.flash = 0;
    this.dead = false;
    this.deadT = 0;
    this.spawnT = 0.6;
    this.charging = 0;
    this.ringToggle = false;
    this.h.root.position.copy(this.pos);
    this.h.root.scale.setScalar(0.01);
    scene.add(this.h.root);
    // barra de vida
    this.bar = new THREE.Group();
    const bg = new THREE.Mesh(barGeo, new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.6, depthTest: false }));
    this.barFill = new THREE.Mesh(barGeo, new THREE.MeshBasicMaterial({ color: 0xff3b3b, depthTest: false }));
    this.barFill.position.z = 0.001;
    bg.renderOrder = 10; this.barFill.renderOrder = 11;
    this.bar.add(bg, this.barFill);
    this.bar.visible = false;
    scene.add(this.bar);
    // linha de mira do atirador
    if (def.charge) {
      this.laser = new THREE.Mesh(unitBox, new THREE.MeshBasicMaterial({ color: 0xff2020, transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false }));
      this.laser.visible = false;
      scene.add(this.laser);
    }
    // feixe de spawn
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.8 * def.scale, 0.8 * def.scale, 30, 12, 1, true),
      new THREE.MeshBasicMaterial({ color: def.boss ? 0xffb703 : 0xff4d6d, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
    beam.position.set(x, 15, z);
    scene.add(beam);
    this.beam = beam;
  }
  chestPos(out) { return out.set(this.pos.x, this.pos.y + 1.3 * this.def.scale, this.pos.z); }
  remove() {
    scene.remove(this.h.root, this.bar);
    if (this.laser) scene.remove(this.laser);
    if (this.beam) scene.remove(this.beam);
    for (const m of this.h.mats) m.dispose();
  }
}

const _v1 = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3();
const losRay = new THREE.Raycaster();
function hasLineOfSight(from, to) {
  _v3.subVectors(to, from);
  const dist = _v3.length();
  _v3.divideScalar(dist);
  losRay.set(from, _v3);
  losRay.far = dist;
  return losRay.intersectObjects(solidMeshes, false).length === 0;
}
function playerTarget(out) {
  return out.set(player.pos.x, player.pos.y + (player.crouch ? 0.8 : 1.25), player.pos.z);
}

// Projéteis inimigos
const projectiles = [];
const projGeo = new THREE.SphereGeometry(0.13, 8, 6);
const projMats = {
  normal: new THREE.MeshBasicMaterial({ color: 0xff5a36 }),
  sniper: new THREE.MeshBasicMaterial({ color: 0x4cc9f0 }),
  boss: new THREE.MeshBasicMaterial({ color: 0xffd60a }),
};
function fireProjectile(from, dir, speed, dmg, kind = 'normal', owner = null) {
  const m = new THREE.Mesh(projGeo, projMats[kind]);
  m.position.copy(from);
  if (kind === 'sniper') m.scale.set(0.8, 0.8, 4);
  if (kind === 'boss') m.scale.setScalar(1.6);
  m.lookAt(_v1.copy(from).add(dir));
  scene.add(m);
  projectiles.push({ m, vel: dir.clone().multiplyScalar(speed), dmg, life: 4, owner });
}
function updateProjectiles(dt) {
  const steps = 3;
  for (let i = projectiles.length - 1; i >= 0; i--) {
    const p = projectiles[i];
    p.life -= dt;
    let dead = p.life <= 0;
    for (let s = 0; s < steps && !dead; s++) {
      p.m.position.addScaledVector(p.vel, dt / steps);
      const pp = p.m.position;
      if (pointInSolid(pp.x, pp.y, pp.z)) {
        spawnParticles(pp, 5, 0xffb347, 3, 0.07, 0.25, 10, 1);
        dead = true;
        break;
      }
      // colisão com o jogador (cápsula)
      const top = player.pos.y + (player.crouch ? 1.15 : 1.85);
      if (pp.y > player.pos.y && pp.y < top) {
        const dx = pp.x - player.pos.x, dz = pp.z - player.pos.z;
        if (dx * dx + dz * dz < 0.42 * 0.42) {
          damagePlayer(p.dmg, p.owner ? p.owner.pos : pp);
          dead = true;
        }
      }
    }
    if (dead) { scene.remove(p.m); projectiles.splice(i, 1); }
  }
}

// Itens (kits médicos)
const pickups = [];
function spawnMedkit(pos) {
  const g = new THREE.Group();
  const box = new THREE.Mesh(unitBox, new THREE.MeshLambertMaterial({ color: 0xffffff, emissive: 0x333333 }));
  box.scale.set(0.6, 0.45, 0.45);
  g.add(box);
  const crossMat = new THREE.MeshBasicMaterial({ color: 0xe63946 });
  for (const [w, h] of [[0.36, 0.1], [0.1, 0.32]]) {
    for (const z of [0.23, -0.23]) {
      const c = new THREE.Mesh(unitBox, crossMat);
      c.scale.set(w, h, 0.02);
      c.position.z = z;
      g.add(c);
    }
  }
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.6, 0.75, 24), new THREE.MeshBasicMaterial({ color: 0x7dff7a, transparent: true, opacity: 0.5, side: THREE.DoubleSide }));
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = -0.55;
  g.add(ring);
  g.position.set(pos.x, 0.7, pos.z);
  scene.add(g);
  pickups.push({ g, t: 0, life: 30 });
}
function updatePickups(dt) {
  for (let i = pickups.length - 1; i >= 0; i--) {
    const p = pickups[i];
    p.t += dt; p.life -= dt;
    p.g.rotation.y += dt * 2;
    p.g.position.y = 0.7 + Math.sin(p.t * 3) * 0.12;
    p.g.visible = p.life > 5 || Math.sin(p.t * 20) > 0;
    const dx = p.g.position.x - player.pos.x, dz = p.g.position.z - player.pos.z;
    if (dx * dx + dz * dz < 1.6 && player.pos.y < 2.5 && player.hp < player.stats.maxHp) {
      const heal = Math.min(35, player.stats.maxHp - player.hp);
      player.hp += heal;
      popup(_v1.set(player.pos.x, player.pos.y + 2, player.pos.z), '+' + Math.round(heal), 'heal');
      sfx.pickup();
      scene.remove(p.g);
      pickups.splice(i, 1);
    } else if (p.life <= 0) {
      scene.remove(p.g);
      pickups.splice(i, 1);
    }
  }
}

// ---------------------------------------------------------------------
//  Estado do jogo
// ---------------------------------------------------------------------
const game = {
  state: 'menu', wave: 0, score: 0, kills: 0, heads: 0,
  combo: 1, comboT: 0, streak: 0, streakT: 0,
  toSpawn: [], spawnT: 0, waveStartT: 0, cleared: false, clearT: 0,
  upgradeLevels: {}, best: 0,
};
try { game.best = parseInt(localStorage.getItem('arenaRoyaleBest') || '0', 10) || 0; } catch (e) { /* sem storage */ }
$('bestVal').textContent = game.best;

function waveComposition(n) {
  const list = [];
  const total = 4 + Math.floor(n * 2.3);
  for (let i = 0; i < total; i++) {
    const r = Math.random();
    if (n >= 4 && r < 0.12) list.push('brute');
    else if (n >= 3 && r < 0.27) list.push('sniper');
    else if (n >= 2 && r < 0.52) list.push('runner');
    else list.push('grunt');
  }
  if (n % 5 === 0) list.splice(2, 0, 'boss');
  return list;
}

function startWave(n) {
  game.wave = n;
  game.toSpawn = waveComposition(n);
  game.spawnT = 1.6;
  game.cleared = false;
  announce('ONDA ' + n, n % 5 === 0 ? '⚠ CHEFÃO A CAMINHO ⚠' : (n === 1 ? 'Elimine todos os inimigos!' : ''));
  sfx.wave();
}

function spawnEnemy(type) {
  for (let t = 0; t < 40; t++) {
    const a = Math.random() * Math.PI * 2;
    const d = rand(30, ARENA_R - 4);
    const x = Math.cos(a) * d, z = Math.sin(a) * d;
    if (Math.hypot(x - player.pos.x, z - player.pos.z) < 28) continue;
    const r = TYPES[type].radius + 0.6;
    let ok = true;
    for (const c of colliders) {
      if (x + r > c.minX && x - r < c.maxX && z + r > c.minZ && z - r < c.maxZ) { ok = false; break; }
    }
    if (!ok) continue;
    const e = new Enemy(type, x, z, game.wave);
    enemies.push(e);
    rebuildHitList();
    if (type === 'boss') { $('bossBar').classList.remove('hidden'); feed('⚠ <b style="color:#ffd166">O CHEFÃO</b> chegou!'); }
    return true;
  }
  return false;
}

function damageEnemy(e, dmg, head, fromPos) {
  if (e.dead) return;
  dmg = Math.round(dmg);
  e.hp -= dmg;
  e.flash = 0.08;
  e.bar.visible = true;
  e.chestPos(_v1);
  if (head) _v1.y += 0.55 * e.def.scale;
  popup(_v1, (head ? '💀 ' : '') + dmg, head ? 'head' : '');
  // reação: inimigo percebe o jogador
  e.los = true;
  if (e.hp <= 0) killEnemy(e, head);
}

function killEnemy(e, head) {
  e.dead = true;
  e.deadT = 0;
  e.bar.visible = false;
  if (e.laser) e.laser.visible = false;
  rebuildHitList();
  game.kills++;
  if (head) game.heads++;
  // combo
  game.comboT = 3.2;
  game.combo = Math.min(10, game.combo + (game.kills > 1 ? 1 : 0));
  game.streak++;
  game.streakT = 2.2;
  const pts = Math.round(e.def.score * game.combo * (head ? 1.5 : 1));
  game.score += pts;
  e.chestPos(_v1);
  _v1.y += 0.9 * e.def.scale;
  popup(_v1, '+' + pts, 'score');
  hitmarker('kill');
  sfx.kill();
  spawnParticles(e.chestPos(_v2), 18, e.def.colors.shirt, 6, 0.16, 0.8, 16, 3);
  feed(`Você eliminou <b>${e.def.name}</b>${head ? ' <span class="hs">💀 HEADSHOT</span>' : ''}`);
  if (player.stats.lifesteal > 0 && player.hp > 0) {
    const heal = Math.min(player.stats.lifesteal, player.stats.maxHp - player.hp);
    if (heal > 0) { player.hp += heal; popup(_v1.set(player.pos.x, player.pos.y + 2.1, player.pos.z), '+' + heal, 'heal'); }
  }
  const streakNames = { 2: 'ABATE DUPLO!', 3: 'ABATE TRIPLO!', 4: 'QUÁDRUPLO!', 5: 'MASSACRE!', 7: 'IMPARÁVEL!', 10: 'LENDÁRIO!' };
  if (streakNames[game.streak]) { streakText(streakNames[game.streak]); sfx.streak(); }
  // drops
  if (Math.random() < e.def.drop) spawnMedkit(e.pos);
  if (e.def.boss) {
    for (let i = 0; i < 3; i++) spawnMedkit(_v2.set(e.pos.x + rand(-3, 3), 0, e.pos.z + rand(-3, 3)));
    $('bossBar').classList.add('hidden');
    explosion(e.chestPos(_v2), 5, 0);
    streakText('CHEFÃO DERROTADO!');
  }
}

function damagePlayer(dmg, fromPos) {
  if (game.state !== 'playing' || player.hp <= 0 || player.invuln > 0) return;
  player.hp -= dmg;
  sfx.hurt();
  shake(0.25);
  const v = $('vignette');
  v.classList.add('hit');
  setTimeout(() => v.classList.remove('hit'), 60);
  // indicador de direção
  if (fromPos) {
    const fx = -Math.sin(cam.yaw), fz = -Math.cos(cam.yaw);
    const rx = Math.cos(cam.yaw), rz = -Math.sin(cam.yaw);
    const dx = fromPos.x - player.pos.x, dz = fromPos.z - player.pos.z;
    const ang = Math.atan2(dx * rx + dz * rz, dx * fx + dz * fz);
    const el = document.createElement('div');
    el.className = 'dmgDir';
    el.style.transform = `rotate(${ang}rad)`;
    $('dmgDirs').appendChild(el);
    setTimeout(() => el.remove(), 900);
  }
  if (player.hp <= 0) { player.hp = 0; gameOver(); }
}

function updateEnemies(dt) {
  const target = playerTarget(_v2).clone();
  let bossAlive = null;
  for (let i = enemies.length - 1; i >= 0; i--) {
    const e = enemies[i];
    const def = e.def;
    const s = def.scale;
    // feixe de spawn
    if (e.beam) {
      e.beam.material.opacity -= dt * 0.8;
      if (e.beam.material.opacity <= 0) { scene.remove(e.beam); e.beam = null; }
    }
    if (e.dead) {
      e.deadT += dt;
      const k = Math.min(1, e.deadT / 0.45);
      e.h.body.rotation.x = -k * Math.PI / 2;
      if (e.deadT > 1.6) e.h.root.position.y = -(e.deadT - 1.6) * 1.2;
      if (e.deadT > 2.6) { e.remove(); enemies.splice(i, 1); }
      continue;
    }
    if (def.boss) bossAlive = e;
    if (e.spawnT > 0) {
      e.spawnT -= dt;
      e.h.root.scale.setScalar(s * clamp(1 - e.spawnT / 0.6, 0.01, 1));
    }

    const dx = player.pos.x - e.pos.x, dz = player.pos.z - e.pos.z;
    const dist = Math.hypot(dx, dz) || 0.001;
    const nx = dx / dist, nz = dz / dist;

    // linha de visão (com cache)
    e.losT -= dt;
    if (e.losT <= 0) {
      e.losT = rand(0.2, 0.35);
      const eye = _v1.set(e.pos.x, e.pos.y + 1.6 * s, e.pos.z);
      e.los = hasLineOfSight(eye, target);
    }

    // decide direção
    let mx = 0, mz = 0, speed = e.speed;
    let wantFace = Math.atan2(nx, nz);
    if (def.melee || def.boss) {
      mx = nx; mz = nz;
      if (def.boss && dist < 8) { mx = 0; mz = 0; }
    } else {
      e.strafeT -= dt;
      if (e.strafeT <= 0) { e.strafe *= -1; e.strafeT = rand(1.2, 3); }
      if (!e.los || dist > def.range * 0.85) { mx = nx; mz = nz; }
      else if (dist < def.range * 0.35) { mx = -nx * 0.8 + -nz * e.strafe * 0.5; mz = -nz * 0.8 + nx * e.strafe * 0.5; speed *= 0.8; }
      else { mx = -nz * e.strafe; mz = nx * e.strafe; speed *= 0.55; }
      if (e.charging > 0) speed *= 0.15;
    }
    // desvio quando travado
    if (e.detourT > 0) {
      e.detourT -= dt;
      const ca = Math.cos(e.detour), sa = Math.sin(e.detour);
      const tx = mx * ca - mz * sa, tz = mx * sa + mz * ca;
      mx = tx; mz = tz;
    }
    // separação
    for (const o of enemies) {
      if (o === e || o.dead) continue;
      const ox = e.pos.x - o.pos.x, oz = e.pos.z - o.pos.z;
      const d2 = ox * ox + oz * oz;
      const minD = def.radius + o.def.radius + 0.4;
      if (d2 < minD * minD && d2 > 0.0001) {
        const d = Math.sqrt(d2);
        mx += (ox / d) * (minD - d) * 1.5;
        mz += (oz / d) * (minD - d) * 1.5;
      }
    }
    const ml = Math.hypot(mx, mz);
    if (ml > 1) { mx /= ml; mz /= ml; }
    if (e.spawnT > 0) { mx = 0; mz = 0; }
    e.vel.x = lerp(e.vel.x, mx * speed, Math.min(1, dt * 6));
    e.vel.z = lerp(e.vel.z, mz * speed, Math.min(1, dt * 6));
    e.pos.x += e.vel.x * dt;
    e.pos.z += e.vel.z * dt;
    resolveCollisions(e.pos, def.radius, 0);
    // detecção de travamento
    e.stuckT += dt;
    if (e.stuckT > 0.5) {
      const moved = e.pos.distanceTo(e.lastPos);
      if (moved < speed * 0.5 * 0.25 && ml > 0.3 && e.detourT <= 0) {
        e.detour = (Math.random() < 0.5 ? 1 : -1) * rand(1.2, 1.8);
        e.detourT = rand(0.7, 1.4);
      }
      e.lastPos.copy(e.pos);
      e.stuckT = 0;
    }

    const actualSpeed = Math.hypot(e.vel.x, e.vel.z);
    if (!(e.los && dist < (def.range || 3)) && actualSpeed > 0.5) wantFace = Math.atan2(e.vel.x, e.vel.z);
    e.facing += angleDiff(e.facing, wantFace) * Math.min(1, dt * 10);
    e.phase += actualSpeed * dt * 2.2 / s;
    e.h.root.position.copy(e.pos);
    e.h.root.rotation.y = e.facing;

    // ângulo vertical dos braços
    const pitch = Math.atan2(target.y - (e.pos.y + 1.4 * s), dist);
    animateHumanoid(e.h, { walk: clamp(actualSpeed / 3, 0, 1), phase: e.phase, crouch: 0, air: false, pitch: def.melee ? -0.3 + Math.sin(e.phase * 2) * 0.3 : pitch });
    if (def.melee) { e.h.armR.rotation.x = -Math.PI / 2 + Math.sin(e.phase) * 0.5; e.h.gun.visible = false; }

    // flash ao tomar dano
    if (e.flash > 0) {
      e.flash -= dt;
      const on = e.flash > 0;
      for (const m of e.h.mats) m.emissive.setHex(on ? 0xffffff : 0x000000);
    }

    // barra de vida
    if (e.bar.visible) {
      e.bar.position.set(e.pos.x, e.pos.y + 2.35 * s, e.pos.z);
      e.bar.quaternion.copy(camera.quaternion);
      const k = clamp(e.hp / e.maxHp, 0, 1);
      e.barFill.scale.x = k;
      e.barFill.position.x = -(1 - k) / 2;
      e.bar.scale.setScalar(def.boss ? 2.2 : 1);
    }

    if (e.spawnT > 0 || player.hp <= 0) continue;

    // ataques
    if (def.melee) {
      e.attackCd -= dt;
      const dy = Math.abs(player.pos.y - e.pos.y);
      if (dist < def.radius + 0.9 && dy < 1.4 && e.attackCd <= 0) {
        e.attackCd = 0.8;
        damagePlayer(e.dmg, e.pos);
        e.h.armL.rotation.x = -2.5;
      }
      continue;
    }

    // atirador: mira com laser antes de disparar
    if (def.charge) {
      if (e.charging > 0) {
        e.charging -= dt;
        const from = e.h.muzzle.getWorldPosition(_v1);
        const len = from.distanceTo(target);
        e.laser.visible = e.los;
        e.laser.position.copy(from).lerp(target, 0.5);
        e.laser.lookAt(target);
        e.laser.scale.set(0.025, 0.025, len);
        e.laser.material.opacity = 0.3 + (1 - e.charging / def.charge) * 0.6;
        if (e.charging <= 0) {
          e.laser.visible = false;
          if (e.los) shootAtPlayer(e, target, 'sniper', dist);
          e.fireT = rand(def.fireCd[0], def.fireCd[1]);
        }
        continue;
      }
      e.fireT -= dt;
      if (e.fireT <= 0 && e.los && dist < def.range) {
        e.charging = def.charge;
        if (dist < 50) sfx.charge();
      }
      continue;
    }

    e.fireT -= dt;
    if (e.burstLeft > 0) {
      e.burstT -= dt;
      if (e.burstT <= 0) {
        e.burstLeft--;
        e.burstT = def.burstGap;
        shootAtPlayer(e, target, def.boss ? 'boss' : 'normal', dist);
      }
    } else if (e.fireT <= 0 && e.los && dist < def.range) {
      e.fireT = rand(def.fireCd[0], def.fireCd[1]);
      if (def.boss) {
        e.ringToggle = !e.ringToggle;
        if (e.ringToggle) bossRing(e);
        else { e.burstLeft = def.burst; e.burstT = 0; }
      } else {
        e.burstLeft = def.burst;
        e.burstT = 0;
      }
    }
  }
  if (bossAlive) $('bossFill').style.width = (clamp(bossAlive.hp / bossAlive.maxHp, 0, 1) * 100) + '%';
}

function shootAtPlayer(e, target, kind, dist) {
  const from = e.h.muzzle.getWorldPosition(_v1).clone();
  const err = e.err * (dist / 25) * (player.sprinting ? 1.4 : 1);
  const aim = _v3.set(target.x + rand(-err, err), target.y + rand(-err, err) * 0.6, target.z + rand(-err, err));
  const dir = aim.sub(from).normalize();
  fireProjectile(from, dir, e.def.projSpeed, e.dmg, kind, e);
  sfx.enemyShoot(dist);
  spawnParticles(from, 3, 0xffd166, 2, 0.08, 0.12, 0, 0);
}
function bossRing(e) {
  const n = 22;
  const from = _v1.set(e.pos.x, 0.95, e.pos.z);
  const off = Math.random();
  for (let i = 0; i < n; i++) {
    const a = ((i + off) / n) * Math.PI * 2;
    fireProjectile(from, _v3.set(Math.sin(a), 0, Math.cos(a)), 15, e.dmg * 1.4, 'boss', e);
  }
  sfx.explode();
  shake(0.15);
  feed('🦘 Pule o anel de balas do chefão!');
}

// ---------------------------------------------------------------------
//  Tiro do jogador
// ---------------------------------------------------------------------
const shotRay = new THREE.Raycaster();
const camDir = new THREE.Vector3(), camRight = new THREE.Vector3(), camUp = new THREE.Vector3();
let camActualDist = 3.6;

function playerShoot() {
  const st = player.stats;
  if (player.reloading) return;
  if (player.ammo <= 0) { sfx.empty(); startReload(); return; }
  player.ammo--;
  player.lastShot = performance.now() / 1000;
  sfx.shoot();
  const moving = Math.hypot(inputMoveX(), inputMoveY()) > 0.1;
  let spread = 0.012 * (moving ? 1.9 : 1) * (cam.aimT > 0.5 ? 0.35 : 1) * (player.crouch ? 0.65 : 1) * (player.onGround ? 1 : 2.5) * st.spreadMul + player.bloom;
  player.bloom = Math.min(0.05, player.bloom + 0.0045 * st.spreadMul);
  const muzzle = player.model.muzzle.getWorldPosition(new THREE.Vector3());
  camera.getWorldDirection(camDir);
  camRight.setFromMatrixColumn(camera.matrixWorld, 0);
  camUp.setFromMatrixColumn(camera.matrixWorld, 1);
  const pellets = st.multishot;
  const pelletDmg = st.damage * (pellets > 1 ? 0.75 : 1);
  let hitAny = null;
  for (let p = 0; p < pellets; p++) {
    const sp = spread + (p > 0 ? 0.025 : 0);
    const dir = camDir.clone()
      .addScaledVector(camRight, rand(-1, 1) * sp)
      .addScaledVector(camUp, rand(-1, 1) * sp)
      .normalize();
    shotRay.set(camera.position, dir);
    shotRay.near = Math.max(0.1, camActualDist - 0.3);
    shotRay.far = 250;
    const hits = shotRay.intersectObjects(enemyHitMeshes.concat(solidMeshes, [groundMesh]), false);
    let end = null;
    let pierceLeft = st.pierce;
    const hitEnemies = new Set();
    for (const h of hits) {
      const owner = h.object.userData.owner;
      if (owner && owner instanceof Enemy) {
        if (owner.dead || hitEnemies.has(owner)) continue;
        hitEnemies.add(owner);
        const head = h.object.userData.head;
        const dmg = pelletDmg * (head ? st.headMul : 1);
        damageEnemy(owner, dmg, head, h.point);
        spawnParticles(h.point, head ? 10 : 6, head ? 0xffd166 : 0xd00000, 4, 0.09, 0.35, 14, 1);
        hitAny = hitAny === 'head' ? 'head' : (head ? 'head' : 'body');
        if (Math.random() < st.explodeChance) explosion(h.point, 3.6, st.damage * 1.6);
        if (pierceLeft-- > 0) continue;
        end = h.point;
        break;
      } else {
        end = h.point;
        spawnParticles(h.point, 5, h.object === groundMesh ? 0x8b6b3e : 0xdddddd, 3, 0.07, 0.35, 14, 1.5);
        if (Math.random() < st.explodeChance) explosion(h.point, 3.6, st.damage * 1.6);
        break;
      }
    }
    if (!end) end = camera.position.clone().addScaledVector(dir, 150);
    spawnTracer(muzzle, end);
  }
  if (hitAny) {
    if (hitAny === 'head') sfx.head(); else sfx.hit();
    if (!$('hitmarker').classList.contains('kill') || hitTimer <= 0) hitmarker(hitAny === 'head' ? 'head' : '');
  }
  // flash e recuo
  flashMesh.position.copy(muzzle);
  flashMesh.rotation.set(Math.random() * 3, Math.random() * 3, Math.random() * 3);
  flashMesh.visible = true;
  flashLight.position.copy(muzzle);
  flashLight.intensity = 6;
  flashTime = 0.045;
  cam.pitch += 0.006 * (cam.aimT > 0.5 ? 0.5 : 1);
  cam.yaw += rand(-0.003, 0.003);
  shake(0.04);
  if (player.ammo === 0) startReload();
}
function startReload() {
  if (player.reloading || player.ammo >= player.stats.magSize) return;
  player.reloading = true;
  player.reloadT = 0;
  sfx.reload();
}

// ---------------------------------------------------------------------
//  Melhorias (roguelite)
// ---------------------------------------------------------------------
const UPGRADES = [
  { id: 'dmg', icon: '💥', name: 'Munição Pesada', desc: '+20% de dano por tiro', apply: (s) => { s.damage *= 1.2; } },
  { id: 'rate', icon: '⚡', name: 'Gatilho Leve', desc: '+15% de cadência de tiro', apply: (s) => { s.fireRate *= 1.15; } },
  { id: 'mag', icon: '📦', name: 'Pente Estendido', desc: '+12 balas no pente', apply: (s) => { s.magSize += 12; } },
  { id: 'hp', icon: '❤️', name: 'Colete Reforçado', desc: '+25 de vida máxima e cura total', apply: (s) => { s.maxHp += 25; player.hp = s.maxHp; } },
  { id: 'speed', icon: '👟', name: 'Tênis Turbo', desc: '+10% de velocidade de movimento', max: 5, apply: (s) => { s.speed *= 1.1; } },
  { id: 'reload', icon: '🔄', name: 'Mãos Rápidas', desc: 'Recarga 25% mais rápida', max: 4, apply: (s) => { s.reloadTime *= 0.75; } },
  { id: 'vamp', icon: '🩸', name: 'Vampirismo', desc: '+4 de vida a cada abate', apply: (s) => { s.lifesteal += 4; } },
  { id: 'multi', icon: '🔱', name: 'Tiro Múltiplo', desc: '+1 bala por disparo (dano por bala -25%)', max: 3, rare: true, apply: (s) => { s.multishot += 1; } },
  { id: 'acc', icon: '🎯', name: 'Mira Laser', desc: '+35% de precisão', max: 4, apply: (s) => { s.spreadMul *= 0.65; } },
  { id: 'head', icon: '💀', name: 'Caçador de Cabeças', desc: '+75% de dano de headshot', apply: (s) => { s.headMul += 0.75; } },
  { id: 'regen', icon: '🌿', name: 'Regeneração', desc: '+1.5 de vida por segundo', max: 5, apply: (s) => { s.regen += 1.5; } },
  { id: 'boom', icon: '🧨', name: 'Balas Explosivas', desc: '+10% de chance da bala explodir', max: 5, rare: true, apply: (s) => { s.explodeChance += 0.1; } },
  { id: 'pierce', icon: '🗡️', name: 'Perfurante', desc: 'Balas atravessam +1 inimigo', max: 3, apply: (s) => { s.pierce += 1; } },
  { id: 'jump', icon: '🦘', name: 'Pulo Duplo', desc: 'Pule de novo no ar', max: 1, rare: true, apply: (s) => { s.maxJumps = 2; } },
];

function showUpgrades() {
  game.state = 'upgrade';
  exitPointerLock();
  input.fire = false;
  const pool = UPGRADES.filter((u) => !u.max || (game.upgradeLevels[u.id] || 0) < u.max);
  const choices = [];
  while (choices.length < 3 && pool.length) {
    const weights = pool.map((u) => (u.rare ? 0.5 : 1));
    let r = Math.random() * weights.reduce((a, b) => a + b, 0);
    let idx = 0;
    for (; idx < pool.length; idx++) { r -= weights[idx]; if (r <= 0) break; }
    choices.push(pool.splice(Math.min(idx, pool.length - 1), 1)[0]);
  }
  const cards = $('cards');
  cards.innerHTML = '';
  $('upTitle').textContent = `ONDA ${game.wave} CONCLUÍDA!`;
  for (const u of choices) {
    const lvl = game.upgradeLevels[u.id] || 0;
    const el = document.createElement('div');
    el.className = 'card' + (u.rare ? ' rare' : '');
    el.innerHTML = `<div class="icon">${u.icon}</div><div class="name">${u.name}</div><div class="desc">${u.desc}</div><div class="lvl">${u.rare ? 'RARA • ' : ''}Nível ${lvl} → ${lvl + 1}${u.max ? ' / ' + u.max : ''}</div>`;
    el.addEventListener('click', () => chooseUpgrade(u));
    cards.appendChild(el);
  }
  $('upgrade').classList.remove('hidden');
}
function chooseUpgrade(u) {
  sfx.click();
  u.apply(player.stats);
  game.upgradeLevels[u.id] = (game.upgradeLevels[u.id] || 0) + 1;
  if (u.id === 'mag') player.ammo = player.stats.magSize;
  $('upgrade').classList.add('hidden');
  game.state = 'playing';
  requestLock();
  startWave(game.wave + 1);
}

// ---------------------------------------------------------------------
//  Fluxo de jogo
// ---------------------------------------------------------------------
function resetGame() {
  for (const e of enemies) e.remove();
  enemies.length = 0;
  rebuildHitList();
  for (const p of projectiles) scene.remove(p.m);
  projectiles.length = 0;
  for (const p of pickups) scene.remove(p.g);
  pickups.length = 0;
  particles.length = 0;
  Object.assign(game, { wave: 0, score: 0, kills: 0, heads: 0, combo: 1, comboT: 0, streak: 0, streakT: 0, toSpawn: [], upgradeLevels: {}, cleared: false });
  player.stats = { ...BASE_STATS };
  player.hp = player.stats.maxHp;
  player.ammo = player.stats.magSize;
  player.reloading = false;
  player.pos.set(0, 0, 3);
  player.vy = 0;
  player.crouch = false;
  player.bloom = 0;
  player.invuln = 0;
  cam.yaw = Math.PI * 0; cam.pitch = -0.1;
  player.facing = Math.PI;
  $('bossBar').classList.add('hidden');
  $('killFeed').innerHTML = '';
}
function startGame() {
  initAudio();
  resetGame();
  ['menu', 'over', 'pause', 'upgrade'].forEach((id) => $(id).classList.add('hidden'));
  $('hud').classList.remove('hidden');
  if (isTouch) $('touchUI').classList.remove('hidden');
  document.body.classList.add('playing');
  game.state = 'playing';
  requestLock();
  startWave(1);
  tryFullscreen();
}
function gameOver() {
  game.state = 'over';
  exitPointerLock();
  input.fire = false;
  const newRec = game.score > game.best;
  if (newRec) {
    game.best = game.score;
    try { localStorage.setItem('arenaRoyaleBest', String(game.best)); } catch (e) { /* ignore */ }
  }
  $('newRecord').classList.toggle('hidden', !newRec);
  $('ovScore').textContent = game.score;
  $('ovWave').textContent = game.wave;
  $('ovKills').textContent = game.kills;
  $('ovHeads').textContent = game.heads;
  $('ovBest').textContent = game.best;
  $('bestVal').textContent = game.best;
  // jogador cai
  player.model.body.rotation.x = 0;
  setTimeout(() => {
    $('over').classList.remove('hidden');
    $('touchUI').classList.add('hidden');
  }, 1300);
}
function pauseGame() {
  if (game.state !== 'playing') return;
  game.state = 'paused';
  input.fire = false; input.aim = false;
  $('pause').classList.remove('hidden');
}
function resumeGame() {
  $('pause').classList.add('hidden');
  game.state = 'playing';
  requestLock();
}
function toMenu() {
  resetGame();
  ['over', 'pause', 'upgrade', 'hud', 'touchUI'].forEach((id) => $(id).classList.add('hidden'));
  $('menu').classList.remove('hidden');
  document.body.classList.remove('playing');
  game.state = 'menu';
}

$('btnPlay').addEventListener('click', startGame);
$('btnAgain').addEventListener('click', startGame);
$('btnMenu').addEventListener('click', toMenu);
$('btnQuit').addEventListener('click', toMenu);
$('btnResume').addEventListener('click', resumeGame);
$('btnPause').addEventListener('click', pauseGame);
$('btnPause').addEventListener('touchstart', (e) => { e.stopPropagation(); }, { passive: true });

// ---------------------------------------------------------------------
//  Controles — teclado/mouse
// ---------------------------------------------------------------------
const canvas = renderer.domElement;
let pointerLocked = false;
let suppressPause = false;
function requestLock() {
  if (isTouch) return;
  try { const p = canvas.requestPointerLock(); if (p && p.catch) p.catch(() => {}); } catch (e) { /* ignore */ }
}
function exitPointerLock() {
  if (document.pointerLockElement) { suppressPause = true; document.exitPointerLock(); }
}
function tryFullscreen() {
  if (!isTouch) return;
  const el = document.documentElement;
  try {
    const p = (el.requestFullscreen || el.webkitRequestFullscreen || (() => null)).call(el);
    if (p && p.then) p.then(() => { try { screen.orientation.lock('landscape').catch(() => {}); } catch (e) { /* ignore */ } }).catch(() => {});
  } catch (e) { /* ignore */ }
}
document.addEventListener('pointerlockchange', () => {
  pointerLocked = document.pointerLockElement === canvas;
  if (!pointerLocked && game.state === 'playing' && !suppressPause) pauseGame();
  suppressPause = false;
});
canvas.addEventListener('mousedown', (e) => {
  if (isTouch) return;
  if (game.state === 'playing' && !pointerLocked) { requestLock(); return; }
  if (e.button === 0) input.fire = true;
  if (e.button === 2) input.aim = true;
});
window.addEventListener('mouseup', (e) => {
  if (e.button === 0) input.fire = false;
  if (e.button === 2) input.aim = false;
});
window.addEventListener('contextmenu', (e) => e.preventDefault());
window.addEventListener('mousemove', (e) => {
  if (!pointerLocked || game.state !== 'playing') return;
  const sens = 0.0022 * (cam.aimT > 0.5 ? 0.55 : 1);
  cam.yaw -= e.movementX * sens;
  cam.pitch = clamp(cam.pitch - e.movementY * sens, -1.2, 1.05);
});
const keyMap = { KeyW: 'f', ArrowUp: 'f', KeyS: 'b', ArrowDown: 'b', KeyA: 'l', ArrowLeft: 'l', KeyD: 'r', ArrowRight: 'r' };
window.addEventListener('keydown', (e) => {
  if (keyMap[e.code]) input[keyMap[e.code]] = 1;
  if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') input.sprint = true;
  if (game.state !== 'playing') {
    if (e.code === 'Enter' && game.state === 'menu') startGame();
    return;
  }
  if (e.code === 'Space') { input.jump = true; e.preventDefault(); }
  if (e.code === 'KeyC' || e.code === 'ControlLeft') player.crouch = !player.crouch;
  if (e.code === 'KeyR') startReload();
  if (e.code === 'KeyP') pauseGame();
});
window.addEventListener('keyup', (e) => {
  if (keyMap[e.code]) input[keyMap[e.code]] = 0;
  if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') input.sprint = false;
});
window.addEventListener('blur', () => {
  input.f = input.b = input.l = input.r = 0; input.fire = false; input.sprint = false;
  if (game.state === 'playing' && isTouch) pauseGame();
});
document.addEventListener('visibilitychange', () => { if (document.hidden) pauseGame(); });

function inputMoveX() { return clamp(input.r - input.l + input.joyX, -1, 1); }
function inputMoveY() { return clamp(input.f - input.b + input.joyY, -1, 1); }

// ---------------------------------------------------------------------
//  Controles — touch (estilo Free Fire)
// ---------------------------------------------------------------------
const joy = { id: null, cx: 0, cy: 0, r: 58 };
const lookTouches = new Map();   // id -> {x,y}
const fireTouches = new Set();
const joyBase = $('joyBase'), joyKnob = $('joyKnob');
const JOY_HOME = () => ({ x: 130, y: window.innerHeight - 110 });
function placeJoy(x, y) { joyBase.style.left = x + 'px'; joyBase.style.top = y + 'px'; }
function resetJoy() {
  const h = JOY_HOME();
  placeJoy(h.x, h.y);
  joyKnob.style.transform = '';
  joyBase.classList.remove('sprint');
  input.joyX = input.joyY = 0;
  input.sprint = false;
  joy.id = null;
}
resetJoy();

function onTouchStart(e) {
  if (game.state !== 'playing') return;
  for (const t of e.changedTouches) {
    const btn = t.target.closest ? t.target.closest('.tbtn') : null;
    if (btn) {
      const act = btn.dataset.act;
      btn.classList.add('active');
      if (act === 'fire') { fireTouches.add(t.identifier); input.fire = true; lookTouches.set(t.identifier, { x: t.clientX, y: t.clientY, btn }); }
      else if (act === 'aim') { input.aim = !input.aim; btn.classList.toggle('active', input.aim); }
      else if (act === 'jump') { input.jump = true; lookTouches.set(t.identifier, { x: t.clientX, y: t.clientY, btn }); }
      else if (act === 'crouch') { player.crouch = !player.crouch; lookTouches.set(t.identifier, { x: t.clientX, y: t.clientY, btn }); }
      else if (act === 'reload') { startReload(); }
      continue;
    }
    if (t.clientX < window.innerWidth * 0.42 && joy.id === null) {
      joy.id = t.identifier;
      joy.cx = t.clientX; joy.cy = t.clientY;
      placeJoy(joy.cx, joy.cy);
    } else {
      lookTouches.set(t.identifier, { x: t.clientX, y: t.clientY });
    }
  }
  e.preventDefault();
}
function onTouchMove(e) {
  if (game.state !== 'playing') return;
  for (const t of e.changedTouches) {
    if (t.identifier === joy.id) {
      let dx = t.clientX - joy.cx, dy = t.clientY - joy.cy;
      const d = Math.hypot(dx, dy);
      if (d > joy.r) { dx *= joy.r / d; dy *= joy.r / d; }
      joyKnob.style.transform = `translate(${dx}px, ${dy}px)`;
      input.joyX = dx / joy.r;
      input.joyY = -dy / joy.r;
      // empurrar até o fim para frente = correr
      input.sprint = d > joy.r * 1.05 && -dy > joy.r * 0.6;
      joyBase.classList.toggle('sprint', input.sprint);
    } else if (lookTouches.has(t.identifier)) {
      const l = lookTouches.get(t.identifier);
      const sens = 0.0058 * (cam.aimT > 0.5 ? 0.5 : 1);
      cam.yaw -= (t.clientX - l.x) * sens;
      cam.pitch = clamp(cam.pitch - (t.clientY - l.y) * sens, -1.2, 1.05);
      l.x = t.clientX; l.y = t.clientY;
    }
  }
  e.preventDefault();
}
function onTouchEnd(e) {
  for (const t of e.changedTouches) {
    if (t.identifier === joy.id) resetJoy();
    const l = lookTouches.get(t.identifier);
    if (l && l.btn && l.btn.dataset.act !== 'aim') l.btn.classList.remove('active');
    lookTouches.delete(t.identifier);
    if (fireTouches.delete(t.identifier) && fireTouches.size === 0) input.fire = false;
  }
  for (const b of document.querySelectorAll('.tbtn.active')) {
    if (b.dataset.act !== 'aim' && b.dataset.act !== 'fire') b.classList.remove('active');
  }
  if (fireTouches.size === 0) { $('btnFire').classList.remove('active'); $('btnFireL').classList.remove('active'); }
}
if (isTouch) {
  const tui = $('touchUI');
  for (const el of [canvas, tui, $('hud')]) {
    el.addEventListener('touchstart', onTouchStart, { passive: false });
  }
  window.addEventListener('touchmove', onTouchMove, { passive: false });
  window.addEventListener('touchend', onTouchEnd);
  window.addEventListener('touchcancel', onTouchEnd);
}

// ---------------------------------------------------------------------
//  Atualização do jogador + câmera
// ---------------------------------------------------------------------
const camRay = new THREE.Raycaster();
function updatePlayer(dt) {
  const st = player.stats;
  const alive = player.hp > 0;
  const mxIn = alive ? inputMoveX() : 0, myIn = alive ? inputMoveY() : 0;
  const mlen = Math.min(1, Math.hypot(mxIn, myIn));
  // direção relativa à câmera
  const fx = -Math.sin(cam.yaw), fz = -Math.cos(cam.yaw);
  const rx = Math.cos(cam.yaw), rz = -Math.sin(cam.yaw);
  let wx = fx * myIn + rx * mxIn, wz = fz * myIn + rz * mxIn;
  const wl = Math.hypot(wx, wz);
  if (wl > 0.001) { wx /= wl; wz /= wl; }

  const firingRecently = performance.now() / 1000 - player.lastShot < 0.5;
  player.sprinting = input.sprint && myIn > 0.3 && !input.fire && !input.aim && !player.crouch && alive;
  if (player.sprinting && player.crouch) player.crouch = false;
  let speed = st.speed * (player.sprinting ? 1.55 : 1) * (player.crouch ? 0.5 : 1) * (input.aim || cam.aimT > 0.5 ? 0.6 : 1);
  speed *= mlen;

  player.pos.x += wx * speed * dt;
  player.pos.z += wz * speed * dt;
  resolveCollisions(player.pos, 0.4, player.pos.y);

  // pulo e gravidade
  const ground = groundHeightAt(player.pos.x, player.pos.z, 0.4, player.pos.y);
  if (input.jump && alive) {
    if (player.onGround || player.jumps < st.maxJumps) {
      player.vy = player.onGround ? 8.2 : 7.4;
      player.jumps = player.onGround ? 1 : player.jumps + 1;
      player.onGround = false;
      player.crouch = false;
      sfx.jump();
    }
  }
  input.jump = false;
  player.vy -= 23 * dt;
  player.pos.y += player.vy * dt;
  if (player.pos.y <= ground) {
    if (!player.onGround && player.vy < -6) { spawnParticles(player.pos, 5, 0xa88a5c, 2, 0.08, 0.3, 10, 1); sfx.step(); }
    player.pos.y = ground;
    player.vy = 0;
    player.onGround = true;
    player.jumps = 0;
  } else if (player.pos.y > ground + 0.05) {
    player.onGround = false;
  }

  // virar o personagem: mirando/atirando => olha pra câmera; senão => direção do movimento
  let targetFacing = player.facing;
  if (input.fire || input.aim || firingRecently) targetFacing = Math.atan2(fx, fz);
  else if (speed > 0.1) targetFacing = Math.atan2(wx, wz);
  player.facing += angleDiff(player.facing, targetFacing) * Math.min(1, dt * 14);

  // animação
  player.walkAmt = lerp(player.walkAmt, speed > 0.1 ? Math.min(1, speed / 6) : 0, Math.min(1, dt * 10));
  player.phase += speed * dt * 2.1;
  player.stepT -= speed * dt;
  if (player.stepT <= 0 && player.onGround && speed > 0.5) { player.stepT = 2.2; sfx.step(); }
  player.crouchT = lerp(player.crouchT, player.crouch ? 1 : 0, Math.min(1, dt * 12));
  const m = player.model;
  m.root.position.copy(player.pos);
  m.root.rotation.y = player.facing;
  const aimingPose = input.fire || input.aim || firingRecently;
  animateHumanoid(m, { walk: player.walkAmt, phase: player.phase, crouch: player.crouchT, air: !player.onGround, pitch: aimingPose ? cam.pitch : -0.25 });
  if (!alive) {
    m.body.rotation.x = lerp(m.body.rotation.x, -Math.PI / 2, Math.min(1, dt * 6));
  } else m.body.rotation.x = 0;
  // inclinação ao correr
  m.hips.rotation.x = player.sprinting ? 0.25 : 0;

  // tiro
  player.fireCd -= dt;
  player.bloom = Math.max(0, player.bloom - dt * 0.06);
  if (input.fire && alive && player.fireCd <= 0) {
    playerShoot();
    player.fireCd = 1 / st.fireRate;
  }
  // recarga
  if (player.reloading) {
    player.reloadT += dt;
    if (player.reloadT >= st.reloadTime) {
      player.reloading = false;
      player.ammo = st.magSize;
      sfx.reloadDone();
    }
  }
  // regeneração
  if (st.regen > 0 && alive) player.hp = Math.min(st.maxHp, player.hp + st.regen * dt);
}

function aimAssist(dt) {
  if (!isTouch || !input.fire) return;
  let best = null, bestAng = 0.1;
  camera.getWorldDirection(camDir);
  for (const e of enemies) {
    if (e.dead || e.spawnT > 0) continue;
    e.chestPos(_v1).sub(camera.position);
    const d = _v1.length();
    if (d > 70) continue;
    const ang = camDir.angleTo(_v1);
    if (ang < bestAng) { bestAng = ang; best = e; }
  }
  if (!best) return;
  best.chestPos(_v1).sub(camera.position);
  const tYaw = Math.atan2(-_v1.x, -_v1.z);
  const tPitch = Math.atan2(_v1.y, Math.hypot(_v1.x, _v1.z));
  const k = Math.min(1, dt * 5);
  cam.yaw += angleDiff(cam.yaw, tYaw) * k;
  cam.pitch += (tPitch - cam.pitch) * k * 0.6;
}

function updateCamera(dt) {
  cam.aimT = lerp(cam.aimT, input.aim && player.hp > 0 ? 1 : 0, Math.min(1, dt * 12));
  const crouchH = lerp(1.62, 1.15, player.crouchT);
  const pivot = _v1.set(player.pos.x, player.pos.y + crouchH, player.pos.z);
  const cp = Math.cos(cam.pitch);
  const dir = _v2.set(-Math.sin(cam.yaw) * cp, Math.sin(cam.pitch), -Math.cos(cam.yaw) * cp);
  const right = _v3.set(Math.cos(cam.yaw), 0, -Math.sin(cam.yaw));
  const dist = lerp(3.7, 1.6, cam.aimT);
  const shoulder = lerp(0.75, 0.55, cam.aimT);
  const shoulderPt = pivot.clone().addScaledVector(right, shoulder);
  // colisão da câmera
  let d = dist;
  const back = dir.clone().negate();
  camRay.set(shoulderPt, back);
  camRay.far = dist + 0.3;
  const hits = camRay.intersectObjects(solidMeshes, false);
  if (hits.length) d = Math.max(0.4, hits[0].distance - 0.3);
  const camPos = shoulderPt.clone().addScaledVector(back, d);
  if (camPos.y < 0.25) camPos.y = 0.25;
  camActualDist = camPos.distanceTo(shoulderPt);
  // tremor
  if (shakeAmt > 0) {
    camPos.x += rand(-1, 1) * shakeAmt * 0.3;
    camPos.y += rand(-1, 1) * shakeAmt * 0.3;
    shakeAmt = Math.max(0, shakeAmt - dt * 1.6);
  }
  camera.position.copy(camPos);
  camera.lookAt(camPos.clone().add(dir));
  camera.updateMatrixWorld();
  camera.fov = lerp(70, 48, cam.aimT) + (player.sprinting ? 6 : 0);
  camera.updateProjectionMatrix();
  // esconder o jogador se a câmera estiver muito perto
  player.model.root.visible = camActualDist > 0.7;
  // sol segue o jogador
  sun.position.copy(player.pos).add(SUN_OFFSET);
  sun.target.position.copy(player.pos);
  scene.userData.sky.position.copy(camera.position);
}

// ---------------------------------------------------------------------
//  HUD
// ---------------------------------------------------------------------
const hudCache = {};
function setText(id, v) { if (hudCache[id] !== v) { hudCache[id] = v; $(id).textContent = v; } }
const mm = $('minimap').getContext('2d');
function updateHUD(dt) {
  const st = player.stats;
  setText('waveVal', game.wave);
  setText('scoreVal', game.score);
  setText('killsVal', game.kills);
  const alive = enemies.filter((e) => !e.dead).length;
  setText('enemiesVal', alive + game.toSpawn.length);
  setText('ammoCur', player.ammo);
  setText('ammoMax', '/' + st.magSize);
  $('ammoCur').classList.toggle('empty', player.ammo === 0);
  $('reloadTrack').classList.toggle('on', player.reloading);
  $('reloadFill').style.width = player.reloading ? (player.reloadT / st.reloadTime) * 100 + '%' : '0%';
  $('reloadHint').classList.toggle('hidden', player.reloading || player.ammo > st.magSize * 0.2);
  const hpPct = (player.hp / st.maxHp) * 100;
  $('hpFill').style.width = hpPct + '%';
  $('hpLag').style.width = hpPct + '%';
  $('hpFill').classList.toggle('low', hpPct < 30);
  $('lowHp').classList.toggle('on', hpPct < 30 && player.hp > 0);
  setText('hpText', Math.ceil(player.hp));
  const cb = $('comboBox');
  cb.classList.toggle('hidden', game.combo <= 1);
  setText('comboVal', game.combo);

  // mira dinâmica
  const moving = Math.hypot(inputMoveX(), inputMoveY()) > 0.1;
  const spreadPx = 6 + (moving ? 8 : 0) + (player.onGround ? 0 : 12) + player.bloom * 300 - cam.aimT * 4 - (player.crouch ? 2 : 0);
  const g = Math.max(3, spreadPx);
  const chs = document.querySelectorAll('#crosshair .ch');
  chs[0].style.top = -(g + 9) + 'px';
  chs[1].style.top = g + 'px';
  chs[2].style.left = -(g + 9) + 'px';
  chs[3].style.left = g + 'px';

  if (hitTimer > 0) { hitTimer -= dt; if (hitTimer <= 0) $('hitmarker').className = ''; }

  // minimapa
  const W = mm.canvas.width, C = W / 2, scale = C / 55;
  mm.clearRect(0, 0, W, W);
  mm.save();
  mm.beginPath(); mm.arc(C, C, C, 0, Math.PI * 2); mm.clip();
  mm.fillStyle = 'rgba(30,70,30,0.55)';
  mm.fillRect(0, 0, W, W);
  mm.translate(C, C);
  mm.scale(scale, scale);
  mm.rotate(cam.yaw);
  mm.translate(-player.pos.x, -player.pos.z);
  mm.fillStyle = 'rgba(220,220,200,0.55)';
  for (const c of minimapRects) {
    if (c.top > 40) continue;
    if (Math.abs(c.minX - player.pos.x) > 80 || Math.abs(c.minZ - player.pos.z) > 80) continue;
    mm.fillRect(c.minX, c.minZ, c.maxX - c.minX, c.maxZ - c.minZ);
  }
  mm.strokeStyle = 'rgba(255,80,80,0.8)';
  mm.lineWidth = 1.5;
  mm.beginPath(); mm.arc(0, 0, ARENA_R, 0, Math.PI * 2); mm.stroke();
  for (const p of pickups) { mm.fillStyle = '#7dff7a'; mm.fillRect(p.g.position.x - 1.2, p.g.position.z - 1.2, 2.4, 2.4); }
  for (const e of enemies) {
    if (e.dead) continue;
    mm.fillStyle = e.def.boss ? '#ffd60a' : '#ff3b3b';
    mm.beginPath(); mm.arc(e.pos.x, e.pos.z, e.def.boss ? 3 : 1.8, 0, Math.PI * 2); mm.fill();
  }
  mm.restore();
  // seta do jogador
  mm.save();
  mm.translate(C, C);
  mm.rotate(-(player.facing - cam.yaw) + Math.PI);
  mm.fillStyle = '#ffd166';
  mm.beginPath(); mm.moveTo(0, -7); mm.lineTo(5, 6); mm.lineTo(0, 3); mm.lineTo(-5, 6); mm.closePath(); mm.fill();
  mm.restore();
  // cone de visão
  mm.fillStyle = 'rgba(255,255,255,0.12)';
  mm.beginPath(); mm.moveTo(C, C); mm.arc(C, C, C, -Math.PI / 2 - 0.6, -Math.PI / 2 + 0.6); mm.closePath(); mm.fill();
}

// ---------------------------------------------------------------------
//  Loop principal
// ---------------------------------------------------------------------
const clock = new THREE.Clock();
let elapsed = 0;
function tick() {
  requestAnimationFrame(tick);
  update(Math.min(clock.getDelta(), 0.05));
  renderer.render(scene, camera);
}
function update(dt) {
  elapsed += dt;
  for (const c of clouds) { c.position.x += dt * 1.5; if (c.position.x > 220) c.position.x = -220; }

  if (game.state === 'playing' || game.state === 'over') {
    updatePlayer(dt);
    if (game.state === 'playing') aimAssist(dt);
    updateEnemies(dt);
    updateProjectiles(dt);
    updatePickups(dt);
    updateBooms(dt);

    if (game.state === 'playing') {
      // combos
      if (game.comboT > 0) { game.comboT -= dt; if (game.comboT <= 0) game.combo = 1; }
      if (game.streakT > 0) { game.streakT -= dt; if (game.streakT <= 0) game.streak = 0; }
      // spawn
      game.spawnT -= dt;
      const aliveCount = enemies.filter((e) => !e.dead).length;
      const maxAlive = 5 + Math.min(10, game.wave);
      if (game.toSpawn.length && game.spawnT <= 0 && aliveCount < maxAlive) {
        if (spawnEnemy(game.toSpawn[0])) game.toSpawn.shift();
        game.spawnT = rand(0.5, 1.1);
      }
      // onda concluída
      if (!game.cleared && game.toSpawn.length === 0 && aliveCount === 0 && game.wave > 0) {
        game.cleared = true;
        game.clearT = 2.2;
        const heal = Math.round(player.stats.maxHp * 0.25);
        player.hp = Math.min(player.stats.maxHp, player.hp + heal);
        announce('ONDA CONCLUÍDA!', `+${heal} de vida`);
        sfx.clear();
      }
      if (game.cleared) {
        game.clearT -= dt;
        if (game.clearT <= 0) showUpgrades();
      }
    }
    updateCamera(dt);
    updateHUD(dt);
  } else if (game.state === 'menu') {
    // câmera orbitando no menu
    const a = elapsed * 0.08;
    camera.position.set(Math.cos(a) * 38, 16, Math.sin(a) * 38);
    camera.lookAt(0, 2, 0);
    camera.fov = 60;
    camera.updateProjectionMatrix();
    player.model.root.position.copy(player.pos);
    player.model.root.rotation.y = elapsed * 0.5;
    animateHumanoid(player.model, { walk: 0, phase: 0, crouch: 0, air: false, pitch: -0.3 });
    sun.position.set(0, 0, 0).add(SUN_OFFSET);
    sun.target.position.set(0, 0, 0);
    scene.userData.sky.position.copy(camera.position);
  }

  updateParticles(dt);
  updateTracers(dt);
  if (flashTime > 0) {
    flashTime -= dt;
    if (flashTime <= 0) { flashMesh.visible = false; flashLight.intensity = 0; }
  }
}
tick();

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  if (joy.id === null) resetJoy();
});

// para testes automatizados
window.__game = { game, player, enemies, cam, input, startGame, simulate: (sec) => { for (let t = 0; t < sec; t += 1 / 60) { scene.updateMatrixWorld(); update(1 / 60); } } };
window.__cam = camera;
