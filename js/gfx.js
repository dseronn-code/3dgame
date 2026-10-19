// Qualidade gráfica, pós-processamento (bloom), materiais PBR, texturas procedurais e junção de geometria estática
import * as THREE from '../lib/three.module.min.js';
import { EffectComposer } from '../lib/addons/EffectComposer.js';
import { RenderPass } from '../lib/addons/RenderPass.js';
import { UnrealBloomPass } from '../lib/addons/UnrealBloomPass.js';
import { OutputPass } from '../lib/addons/OutputPass.js';
import { mergeGeometries } from '../lib/addons/BufferGeometryUtils.js';
import { A } from './assets.js';

export const QUALITY = {
  low: { pixelRatio: 1, shadows: false, shadowSize: 512, bloom: false, grass: 0 },
  medium: { pixelRatio: 1.25, shadows: true, shadowSize: 1024, bloom: true, grass: 1 },
  high: { pixelRatio: 2, shadows: true, shadowSize: 2048, bloom: true, grass: 1 },
};

export const G = { renderer: null, scene: null, camera: null, composer: null, bloom: null, q: QUALITY.medium, env: null };

export function initGfx(renderer, scene, camera, sun) {
  Object.assign(G, { renderer, scene, camera, sun });
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
}

export function setQuality(name) {
  const q = QUALITY[name] || QUALITY.medium;
  G.q = q;
  const { renderer, scene, camera, sun } = G;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, q.pixelRatio));
  renderer.shadowMap.enabled = q.shadows;
  sun.castShadow = q.shadows;
  if (sun.shadow.map) { sun.shadow.map.dispose(); sun.shadow.map = null; }
  sun.shadow.mapSize.set(q.shadowSize, q.shadowSize);
  scene.traverse((o) => { if (o.material) { const ms = Array.isArray(o.material) ? o.material : [o.material]; ms.forEach((m) => { m.needsUpdate = true; }); } });
  if (q.bloom) {
    const size = new THREE.Vector2();
    renderer.getSize(size);
    G.composer = new EffectComposer(renderer);
    G.composer.addPass(new RenderPass(scene, camera));
    G.bloom = new UnrealBloomPass(new THREE.Vector2(size.x / 2, size.y / 2), 0.55, 0.5, 0.82);
    G.composer.addPass(G.bloom);
    G.composer.addPass(new OutputPass());
  } else {
    G.composer = null;
    G.bloom = null;
  }
  resize();
}
export function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  G.renderer.setSize(w, h);
  G.camera.aspect = w / h;
  G.camera.updateProjectionMatrix();
  if (G.composer) { G.composer.setPixelRatio(G.renderer.getPixelRatio()); G.composer.setSize(w, h); }
}
window.addEventListener('resize', () => G.renderer && resize());

export function render() {
  if (G.composer) G.composer.render();
  else G.renderer.render(G.scene, G.camera);
}

export function setupEnvironment() {
  const pmrem = new THREE.PMREMGenerator(G.renderer);
  G.env = pmrem.fromEquirectangular(A.hdr).texture;
  pmrem.dispose();
  G.scene.environment = G.env;
}
export function setBackground(kind) {
  if (kind === 'sky') {
    G.scene.background = A.hdr;
    G.scene.backgroundIntensity = 0.55;
    G.scene.backgroundBlurriness = 0.0;
  } else {
    G.scene.background = new THREE.Color(0x07090f);
  }
}

// ---------------------------------------------------------------------
//  Texturas procedurais (canvas) com mapa normal derivado da altura
function canvasTex(size, draw, { srgb = true, repeat = 1 } = {}) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  draw(g, size);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat, repeat);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  t.userData.canvas = c;
  return t;
}
function normalFromHeight(srcTex, strength = 2) {
  const src = srcTex.userData.canvas;
  const s = src.width;
  const d = src.getContext('2d').getImageData(0, 0, s, s).data;
  const out = document.createElement('canvas');
  out.width = out.height = s;
  const og = out.getContext('2d');
  const img = og.createImageData(s, s);
  const h = (x, y) => d[(((y + s) % s) * s + ((x + s) % s)) * 4] / 255;
  for (let y = 0; y < s; y++) for (let x = 0; x < s; x++) {
    const dx = (h(x + 1, y) - h(x - 1, y)) * strength, dy = (h(x, y + 1) - h(x, y - 1)) * strength;
    const l = Math.hypot(dx, dy, 1);
    const i = (y * s + x) * 4;
    img.data[i] = ((-dx / l) * 0.5 + 0.5) * 255;
    img.data[i + 1] = ((dy / l) * 0.5 + 0.5) * 255;
    img.data[i + 2] = (1 / l) * 255;
    img.data[i + 3] = 255;
  }
  og.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(out);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  return t;
}
function speckle(g, s, n, colorFn, size = [1, 3]) {
  for (let i = 0; i < n; i++) {
    g.fillStyle = colorFn();
    const w = size[0] + Math.random() * (size[1] - size[0]);
    g.fillRect(Math.random() * s, Math.random() * s, w, w);
  }
}
const rnd = (a, b) => a + Math.random() * (b - a);

const TEX = {};
export function proceduralTextures() {
  if (TEX.asphalt) return TEX;
  // asfalto molhado
  TEX.asphalt = canvasTex(512, (g, s) => {
    g.fillStyle = '#3a3c40'; g.fillRect(0, 0, s, s);
    speckle(g, s, 9000, () => { const v = rnd(30, 90) | 0; return `rgb(${v},${v},${v + 4})`; }, [1, 2.5]);
    g.strokeStyle = 'rgba(15,15,18,0.7)'; g.lineWidth = 1.5;
    for (let i = 0; i < 7; i++) { g.beginPath(); let x = Math.random() * s, y = Math.random() * s; g.moveTo(x, y); for (let k = 0; k < 8; k++) { x += rnd(-30, 30); y += rnd(-30, 30); g.lineTo(x, y); } g.stroke(); }
  });
  TEX.asphaltRough = canvasTex(256, (g, s) => {
    g.fillStyle = '#9a9a9a'; g.fillRect(0, 0, s, s);
    // poças (rugosidade baixa = reflexo)
    for (let i = 0; i < 5; i++) { const gr = g.createRadialGradient(0, 0, 0, 0, 0, 1); gr.addColorStop(0, '#202020'); gr.addColorStop(1, 'rgba(154,154,154,0)'); g.save(); g.translate(Math.random() * s, Math.random() * s); g.scale(rnd(20, 60), rnd(12, 40)); g.fillStyle = gr; g.beginPath(); g.arc(0, 0, 1, 0, 7); g.fill(); g.restore(); }
  }, { srgb: false });
  TEX.asphaltN = normalFromHeight(TEX.asphalt, 3);
  // calçada de concreto em placas
  TEX.concrete = canvasTex(512, (g, s) => {
    g.fillStyle = '#8d8a84'; g.fillRect(0, 0, s, s);
    speckle(g, s, 6000, () => { const v = rnd(110, 160) | 0; return `rgba(${v},${v - 2},${v - 6},0.5)`; }, [1, 3]);
    g.fillStyle = '#4a4844';
    for (let i = 0; i <= 4; i++) { g.fillRect(0, i * s / 4 - 1, s, 3); g.fillRect(i * s / 4 - 1, 0, 3, s); }
  });
  TEX.concreteN = normalFromHeight(TEX.concrete, 2.5);
  // pedras da praça
  TEX.pavers = canvasTex(512, (g, s) => {
    g.fillStyle = '#3e3a36'; g.fillRect(0, 0, s, s);
    const n = 8, w = s / n;
    for (let y = 0; y < n * 2; y++) for (let x = -1; x < n; x++) {
      const v = rnd(105, 145) | 0;
      g.fillStyle = `rgb(${v},${v - 6},${v - 14})`;
      g.fillRect(x * w + (y % 2) * w / 2 + 2, y * w / 2 + 2, w - 4, w / 2 - 4);
    }
    speckle(g, s, 3000, () => `rgba(0,0,0,${rnd(0.05, 0.2)})`, [1, 2]);
  });
  TEX.paversN = normalFromHeight(TEX.pavers, 3);
  // reboco da fachada
  TEX.plaster = canvasTex(256, (g, s) => {
    g.fillStyle = '#b8b0a4'; g.fillRect(0, 0, s, s);
    speckle(g, s, 5000, () => { const v = rnd(150, 210) | 0; return `rgba(${v},${v - 4},${v - 10},0.35)`; }, [1, 4]);
  });
  TEX.plasterN = normalFromHeight(TEX.plaster, 1.5);
  // parede interna
  TEX.wall = canvasTex(256, (g, s) => {
    g.fillStyle = '#d8d0c4'; g.fillRect(0, 0, s, s);
    speckle(g, s, 3000, () => `rgba(255,255,255,${rnd(0.03, 0.1)})`, [2, 6]);
    speckle(g, s, 2000, () => `rgba(0,0,0,${rnd(0.02, 0.05)})`, [1, 3]);
  });
  TEX.wallN = normalFromHeight(TEX.wall, 1);
  // tecido (sofá, cama)
  TEX.fabric = canvasTex(128, (g, s) => {
    g.fillStyle = '#888'; g.fillRect(0, 0, s, s);
    for (let i = 0; i < s; i += 2) { g.fillStyle = `rgba(0,0,0,${i % 4 ? 0.08 : 0.15})`; g.fillRect(i, 0, 1, s); g.fillRect(0, i, s, 1); }
  }, { srgb: false });
  TEX.fabricN = normalFromHeight(TEX.fabric, 2);
  return TEX;
}

// ---------------------------------------------------------------------
//  Materiais (com escala de UV em metros para mapeamento por projeção)
const matCache = new Map();
export function std(key, make) {
  if (!matCache.has(key)) { const m = make(); m.userData.shared = true; matCache.set(key, m); }
  return matCache.get(key);
}
export function M(name) {
  const T = proceduralTextures();
  const P = (o) => new THREE.MeshStandardMaterial(o);
  switch (name) {
    case 'asphalt': return std(name, () => Object.assign(P({ color: 0xffffff, map: T.asphalt, normalMap: T.asphaltN, roughnessMap: T.asphaltRough, roughness: 0.75, metalness: 0, envMapIntensity: 0.9 }), { userData: { uv: 0.18 } }));
    case 'concrete': return std(name, () => Object.assign(P({ map: T.concrete, normalMap: T.concreteN, roughness: 0.85, envMapIntensity: 0.4 }), { userData: { uv: 0.33 } }));
    case 'pavers': return std(name, () => Object.assign(P({ map: T.pavers, normalMap: T.paversN, roughness: 0.6, envMapIntensity: 0.6 }), { userData: { uv: 0.25 } }));
    case 'brick': return std(name, () => Object.assign(P({ map: A.tex.brick, bumpMap: A.tex.brickBump, bumpScale: 3, roughnessMap: A.tex.brickRough, roughness: 1, envMapIntensity: 0.35 }), { userData: { uv: 0.45 } }));
    case 'wood': return std(name, () => Object.assign(P({ map: A.tex.wood, bumpMap: A.tex.woodBump, roughnessMap: A.tex.woodRough, roughness: 0.8, envMapIntensity: 0.5 }), { userData: { uv: 0.4 } }));
    case 'tiles': return std(name, () => Object.assign(P({ map: A.tex.tiles, normalMap: A.tex.tilesN, roughness: 0.35, envMapIntensity: 0.7 }), { userData: { uv: 0.5 } }));
    case 'wall': return std(name, () => Object.assign(P({ map: T.wall, normalMap: T.wallN, roughness: 0.9, envMapIntensity: 0.3 }), { userData: { uv: 0.5 } }));
    default: throw new Error('material ' + name);
  }
}
// material de reboco colorido
export function plaster(color) {
  return std('plaster' + color, () => {
    const T = proceduralTextures();
    return Object.assign(new THREE.MeshStandardMaterial({ color, map: T.plaster, normalMap: T.plasterN, roughness: 0.92, envMapIntensity: 0.35 }), { userData: { uv: 0.35 } });
  });
}
export function fabric(color) {
  return std('fabric' + color, () => {
    const T = proceduralTextures();
    return Object.assign(new THREE.MeshStandardMaterial({ color, normalMap: T.fabricN, roughness: 0.95, envMapIntensity: 0.3 }), { userData: { uv: 2 } });
  });
}
export function solid(color, rough = 0.7, metal = 0, extra = {}) {
  return std(`s${color}_${rough}_${metal}_${JSON.stringify(extra)}`, () => new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal, envMapIntensity: 0.6, ...extra }));
}
export function glow(color, intensity = 2) {
  return std(`g${color}_${intensity}`, () => new THREE.MeshStandardMaterial({ color: 0x000000, emissive: color, emissiveIntensity: intensity, roughness: 1 }));
}
export function glass(color = 0x223040) {
  return std('glass' + color, () => new THREE.MeshStandardMaterial({ color, roughness: 0.08, metalness: 0.6, envMapIntensity: 1.4 }));
}

// ---------------------------------------------------------------------
//  Junta meshes estáticas por material (menos draw calls) e projeta UVs em metros
export function mergeStatic(group) {
  group.updateMatrixWorld(true);
  const byMat = new Map();
  const remove = [];
  const isDynamic = (o) => { for (let p = o; p && p !== group; p = p.parent) if (p.userData.dynamic) return true; return false; };
  group.traverse((o) => {
    if (!o.isMesh || o.isSkinnedMesh || o.isInstancedMesh || isDynamic(o)) return;
    const key = o.material.uuid + (o.castShadow ? 's' : '') + (o.receiveShadow ? 'r' : '');
    if (!byMat.has(key)) byMat.set(key, { mat: o.material, cast: o.castShadow, recv: o.receiveShadow, geos: [] });
    let g = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
    for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k);
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
    g.applyMatrix4(o.matrixWorld);
    byMat.get(key).geos.push(g);
    remove.push(o);
  });
  for (const o of remove) o.parent.remove(o);
  for (const { mat, cast, recv, geos } of byMat.values()) {
    const merged = mergeGeometries(geos, false);
    if (!merged) continue;
    if (mat.userData.uv) projectUV(merged, mat.userData.uv);
    const m = new THREE.Mesh(merged, mat);
    m.castShadow = cast;
    m.receiveShadow = recv;
    m.matrixAutoUpdate = false;
    group.add(m);
  }
}
function projectUV(geo, scale) {
  const p = geo.attributes.position, n = geo.attributes.normal, uv = geo.attributes.uv;
  for (let i = 0; i < p.count; i++) {
    const nx = Math.abs(n.getX(i)), ny = Math.abs(n.getY(i)), nz = Math.abs(n.getZ(i));
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    if (ny >= nx && ny >= nz) uv.setXY(i, x * scale, z * scale);
    else if (nx >= nz) uv.setXY(i, z * scale, y * scale);
    else uv.setXY(i, x * scale, y * scale);
  }
  uv.needsUpdate = true;
}

// ---------------------------------------------------------------------
//  Janelas acesas e vitrines com "interior" pintado (emissivo)
const winMats = [];
export function litWindow() {
  if (!winMats.length) {
    for (let v = 0; v < 4; v++) {
      const t = canvasTex(128, (g, s) => {
        const warm = v < 3;
        const gr = g.createLinearGradient(0, 0, 0, s);
        gr.addColorStop(0, warm ? '#6a3a18' : '#1a2a4a'); gr.addColorStop(0.6, warm ? '#d8904a' : '#5a7ab0'); gr.addColorStop(1, warm ? '#8a5a30' : '#2a3a5a');
        g.fillStyle = gr; g.fillRect(0, 0, s, s);
        // abajur / luminária
        const lx = 30 + Math.random() * 68, ly = 40 + Math.random() * 30;
        const lg = g.createRadialGradient(lx, ly, 0, lx, ly, 50);
        lg.addColorStop(0, warm ? 'rgba(255,230,180,0.95)' : 'rgba(200,220,255,0.8)'); lg.addColorStop(1, 'rgba(0,0,0,0)');
        g.fillStyle = lg; g.fillRect(0, 0, s, s);
        // móveis em silhueta
        g.fillStyle = 'rgba(20,12,8,0.75)';
        if (v === 0) { g.fillRect(10, 90, 60, 38); g.fillRect(14, 70, 52, 22); }
        if (v === 1) { g.fillRect(70, 60, 40, 68); for (let i = 0; i < 4; i++) g.fillRect(72, 62 + i * 16, 36, 2); }
        if (v === 2) { g.beginPath(); g.arc(80, 70, 12, 0, 7); g.fill(); g.fillRect(66, 82, 28, 46); }
        // cortinas
        g.fillStyle = v % 2 ? 'rgba(120,40,40,0.85)' : 'rgba(200,190,160,0.75)';
        g.fillRect(0, 0, 22, s); g.fillRect(s - 22, 0, 22, s);
        // caixilho
        g.fillStyle = '#d8d2c6'; g.fillRect(s / 2 - 3, 0, 6, s); g.fillRect(0, s * 0.45, s, 5);
      });
      winMats.push(new THREE.MeshStandardMaterial({ map: t, emissive: 0xffffff, emissiveMap: t, emissiveIntensity: 0.9, roughness: 0.3, metalness: 0 }));
    }
    winMats.forEach((m) => { m.userData.shared = true; });
  }
  return winMats[(Math.random() * winMats.length) | 0];
}
const shopMats = [];
export function shopWindow() {
  if (!shopMats.length) {
    const palettes = [['#3a2414', '#e8a860'], ['#14283a', '#8ac0e8'], ['#2a1a2a', '#e888b8'], ['#1a2a18', '#a8e090']];
    for (const [dark, light] of palettes) {
      const t = canvasTex(256, (g, s) => {
        const gr = g.createLinearGradient(0, 0, 0, s);
        gr.addColorStop(0, dark); gr.addColorStop(0.5, light); gr.addColorStop(1, dark);
        g.fillStyle = gr; g.fillRect(0, 0, s, s);
        // prateleiras com produtos
        for (let row = 0; row < 3; row++) {
          const y = 50 + row * 55;
          g.fillStyle = 'rgba(30,20,10,0.8)'; g.fillRect(10, y + 30, s - 20, 5);
          for (let x = 16; x < s - 20; x += 10 + Math.random() * 10) {
            g.fillStyle = `hsla(${Math.random() * 360},45%,${40 + Math.random() * 30}%,0.95)`;
            const h = 12 + Math.random() * 18; g.fillRect(x, y + 30 - h, 7 + Math.random() * 5, h);
          }
        }
        // balcão e reflexo no vidro
        g.fillStyle = 'rgba(20,12,6,0.85)'; g.fillRect(0, s - 50, s, 50);
        g.fillStyle = 'rgba(255,255,255,0.08)'; g.beginPath(); g.moveTo(40, 0); g.lineTo(90, 0); g.lineTo(20, s); g.lineTo(-30, s); g.fill();
      });
      shopMats.push(new THREE.MeshStandardMaterial({ map: t, emissive: 0xffffff, emissiveMap: t, emissiveIntensity: 0.7, roughness: 0.15, metalness: 0.1 }));
    }
    shopMats.forEach((m) => { m.userData.shared = true; });
  }
  return shopMats[(Math.random() * shopMats.length) | 0];
}
