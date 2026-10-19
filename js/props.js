// Objetos de cenário detalhados (todos estáticos são juntados depois por material)
import { THREE, box, mesh, addCollider, world, roundedBox, rand } from './engine.js';
import { M, plaster, fabric, solid, glow, glass, litWindow, shopWindow } from './gfx.js';

const metal = () => solid(0x2a2c30, 0.45, 0.8);
const cyl = (rt, rb, h, seg = 12) => new THREE.CylinderGeometry(rt, rb, h, seg);

// halo aditivo (brilho em volta das lâmpadas; barato e bonito com bloom)
let haloTex = null;
function halo(parent, x, y, z, size, color) {
  if (!haloTex) {
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const g = c.getContext('2d');
    const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.25, 'rgba(255,255,255,0.35)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
    haloTex = new THREE.CanvasTexture(c);
  }
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: haloTex, color, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false }));
  s.position.set(x, y, z);
  s.scale.set(size, size, 1);
  s.userData.dynamic = true;
  parent.add(s);
  return s;
}
let poolTex = null;
export function lightPool(parent, x, z, r, color, opacity = 0.22) {
  if (!poolTex) {
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const g = c.getContext('2d');
    const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
    poolTex = new THREE.CanvasTexture(c);
  }
  const m = new THREE.Mesh(new THREE.PlaneGeometry(r * 2, r * 2), new THREE.MeshBasicMaterial({ map: poolTex, color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false }));
  m.rotation.x = -Math.PI / 2;
  m.position.set(x, 0.03, z);
  m.userData.dynamic = true;
  parent.add(m);
  return m;
}

export function lampPost(g, x, z, rot = 0, realLight = false) {
  const grp = new THREE.Group();
  grp.position.set(x, 0, z);
  grp.rotation.y = rot;
  g.add(grp);
  mesh(grp, cyl(0.16, 0.2, 0.5), metal(), 0, 0.25, 0);
  mesh(grp, cyl(0.06, 0.08, 4.4), metal(), 0, 2.45, 0);
  mesh(grp, cyl(0.04, 0.04, 1.1, 8), metal(), 0, 4.55, 0.45).rotation.x = Math.PI / 2.4;
  mesh(grp, roundedBox(0.36, 0.14, 0.5, 0.05), metal(), 0, 4.72, 0.95);
  mesh(grp, roundedBox(0.28, 0.04, 0.4, 0.02), glow(0xffd29a, 3.5), 0, 4.64, 0.95, { cast: false });
  addCollider(x, z, 0.35, 0.35, 10);
  const lp = new THREE.Vector3(0, 4.55, 0.95).applyEuler(new THREE.Euler(0, rot, 0)).add(new THREE.Vector3(x, 0, z));
  halo(g, lp.x, lp.y, lp.z, 2.2, 0xffcf8a);
  lightPool(g, lp.x, lp.z, 3.6, 0xffb060, 0.2);
  if (realLight) {
    const L = new THREE.PointLight(0xffc98a, 40, 18, 2);
    L.position.copy(lp).setY(4.4);
    g.add(L);
  }
  return lp;
}

export function bench(g, x, z, rot = 0) {
  const grp = new THREE.Group();
  grp.position.set(x, 0, z);
  grp.rotation.y = rot;
  g.add(grp);
  for (let i = 0; i < 3; i++) box(grp, 0, 0.42, -0.12 + i * 0.15, 1.9, 0.05, 0.12, M('wood'), { solid: false, round: 0.02 });
  for (let i = 0; i < 2; i++) { const b = box(grp, 0, 0.62 + i * 0.16, 0.24, 1.9, 0.11, 0.04, M('wood'), { solid: false, round: 0.02 }); b.rotation.x = -0.15; }
  for (const sx of [-0.8, 0.8]) {
    box(grp, sx, 0, 0, 0.06, 0.42, 0.5, metal(), { solid: false });
    box(grp, sx, 0.42, 0.24, 0.06, 0.5, 0.06, metal(), { solid: false });
  }
  const w = Math.abs(Math.cos(rot)) > 0.5 ? [2.0, 0.65] : [0.65, 2.0];
  addCollider(x, z, w[0], w[1], 0.5);
}

const leafMats = [0x2f4a2c, 0x3b5a33, 0x26402a, 0x45663a];
export function tree(g, x, z, s = 1) {
  const trunkMat = solid(0x4a3628, 0.95);
  mesh(g, cyl(0.12 * s, 0.22 * s, 2.8 * s, 8), trunkMat, x, 1.4 * s, z);
  for (let i = 0; i < 3; i++) {
    const br = mesh(g, cyl(0.04 * s, 0.07 * s, 1.2 * s, 6), trunkMat, x, 2.5 * s, z);
    br.rotation.set(rand(0.5, 0.9), (i / 3) * Math.PI * 2, 0, 'YXZ');
    br.translateY(0.4 * s);
  }
  const n = 6;
  for (let i = 0; i < n; i++) {
    const geo = new THREE.IcosahedronGeometry(1, 1);
    const p = geo.attributes.position;
    for (let k = 0; k < p.count; k++) {
      const f = 1 + (Math.sin(p.getX(k) * 4.1 + i) + Math.cos(p.getY(k) * 3.3 + i * 2)) * 0.09;
      p.setXYZ(k, p.getX(k) * f, p.getY(k) * f * 0.85, p.getZ(k) * f);
    }
    geo.computeVertexNormals();
    const a = (i / n) * Math.PI * 2;
    const rr = i === 0 ? 0 : 0.9 * s;
    const leaf = mesh(g, geo, solid(leafMats[i % leafMats.length], 0.9, 0, { flatShading: false }), x + Math.cos(a) * rr, (3.6 + (i === 0 ? 0.7 : rand(-0.2, 0.3))) * s, z + Math.sin(a) * rr);
    leaf.scale.setScalar((i === 0 ? 1.5 : rand(0.95, 1.2)) * s);
  }
  addCollider(x, z, 0.45 * s, 0.45 * s, 10);
}

export function car(g, x, z, rot, color) {
  const grp = new THREE.Group();
  grp.position.set(x, 0, z);
  grp.rotation.y = rot;
  g.add(grp);
  const paint = solid(color, 0.25, 0.6, { envMapIntensity: 1.2 });
  box(grp, 0, 0.32, 0, 1.8, 0.62, 4.2, paint, { round: 0.18 });
  box(grp, 0, 0.9, -0.2, 1.6, 0.6, 2.2, paint, { round: 0.2 });
  box(grp, 0, 0.95, -0.2, 1.64, 0.42, 1.9, glass(0x10161e), { round: 0.12, solid: false });
  box(grp, 0, 0.92, 0.85, 1.5, 0.42, 0.08, glass(0x10161e), { solid: false });
  const wheel = cyl(0.34, 0.34, 0.24, 16);
  for (const [wx, wz] of [[-0.82, 1.35], [0.82, 1.35], [-0.82, -1.35], [0.82, -1.35]]) {
    const w = mesh(grp, wheel, solid(0x151515, 0.9), wx, 0.34, wz);
    w.rotation.z = Math.PI / 2;
  }
  for (const sx of [-0.6, 0.6]) {
    box(grp, sx, 0.55, 2.1, 0.32, 0.12, 0.04, glow(0xfff2d0, 1.2), { solid: false, cast: false });
    box(grp, sx, 0.6, -2.11, 0.32, 0.1, 0.04, glow(0xff2a2a, 1.5), { solid: false, cast: false });
  }
  const horiz = Math.abs(Math.sin(rot)) > 0.5;
  addCollider(x, z, horiz ? 4.3 : 1.9, horiz ? 1.9 : 4.3, 1.4);
  world.solids.push(grp.children[0]);
}

export function trashBin(g, x, z) {
  mesh(g, cyl(0.28, 0.24, 0.85, 14), solid(0x2c4a3a, 0.6, 0.3), x, 0.425, z);
  mesh(g, cyl(0.3, 0.3, 0.06, 14), solid(0x1c2a24, 0.6, 0.3), x, 0.88, z);
  addCollider(x, z, 0.55, 0.55, 1);
}
export function hydrant(g, x, z) {
  const red = solid(0xa8241f, 0.5, 0.2);
  mesh(g, cyl(0.12, 0.14, 0.6, 12), red, x, 0.3, z);
  mesh(g, new THREE.SphereGeometry(0.13, 12, 8), red, x, 0.62, z);
  const side = mesh(g, cyl(0.05, 0.05, 0.36, 8), red, x, 0.42, z);
  side.rotation.z = Math.PI / 2;
  addCollider(x, z, 0.3, 0.3, 1);
}
export function planter(g, x, z, w = 1.2) {
  box(g, x, 0, z, w, 0.5, w, M('concrete'), { collide: true, round: 0.05 });
  for (let i = 0; i < 3; i++) {
    const b = mesh(g, new THREE.IcosahedronGeometry(0.35, 1), solid(leafMats[i], 0.9), x + rand(-0.25, 0.25), 0.7, z + rand(-0.25, 0.25));
    b.scale.y = 0.8;
  }
}
export function stringLights(g, a, b, sag = 1.2, n = 16) {
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const p = new THREE.Vector3().lerpVectors(a, b, t);
    p.y -= Math.sin(t * Math.PI) * sag;
    pts.push(p);
  }
  const curve = new THREE.CatmullRomCurve3(pts);
  mesh(g, new THREE.TubeGeometry(curve, 32, 0.012, 4, false), solid(0x111111, 0.8), 0, 0, 0, { cast: false });
  const bulb = new THREE.SphereGeometry(0.06, 8, 6);
  for (let i = 1; i < n; i++) mesh(g, bulb, glow(i % 3 ? 0xffd28a : 0xff9a6a, 4), pts[i].x, pts[i].y - 0.06, pts[i].z, { cast: false });
}

// ---------------------------------------------------------------------
//  Prédio com fachada detalhada nas faces que dão para a rua
// faces: lista de 'n' | 's' | 'e' | 'w' (direção para onde a fachada olha)
export function building(g, x0, x1, z0, z1, h, opts) {
  const { wall, faces, shop } = opts;
  const w = x1 - x0, d = z1 - z0, cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
  box(g, cx, 0, cz, w, h, d, wall, { collide: true });
  box(g, cx, 0, cz, w + 0.08, 3.4, d + 0.08, opts.base || plaster(0x57534d), { solid: false });
  box(g, cx, 3.4, cz, w + 0.2, 0.18, d + 0.2, solid(0x8a857c, 0.8), { solid: false });
  box(g, cx, h - 0.1, cz, w + 0.3, 0.35, d + 0.3, solid(0x77736b, 0.8), { solid: false });
  // parapeito e caixas no telhado
  box(g, cx, h + 0.25, cz, w, 0.5, d, opts.wall, { solid: false, cast: false });
  if (w * d > 60) box(g, cx + rand(-w / 4, w / 4), h, cz + rand(-d / 4, d / 4), 1.6, 1.0, 1.2, solid(0x8a8a8a, 0.5, 0.5), { solid: false });
  const dark = glass(0x1a222c);
  const frame = solid(0xd8d2c6, 0.7);
  const sill = solid(0xbab4a8, 0.8);
  for (const f of faces) {
    const alongX = f === 'n' || f === 's';
    const len = alongX ? w : d;
    const out = f === 's' ? 1 : f === 'n' ? -1 : f === 'e' ? 1 : -1;
    const at = alongX ? (f === 's' ? z1 : z0) : (f === 'e' ? x1 : x0);
    const place = (u, y, ww, hh, dd, m, depth) => {
      const px = alongX ? x0 + u : at + out * depth;
      const pz = alongX ? at + out * depth : z0 + u;
      return box(g, px, y, pz, alongX ? ww : dd, hh, alongX ? dd : ww, m, { solid: false, cast: false });
    };
    const floors = Math.floor((h - 4) / 3);
    for (let u = 1.6; u < len - 1.2; u += 2.7) {
      for (let k = 0; k < floors; k++) {
        const y = 4.2 + k * 3;
        place(u, y - 0.08, 1.3, 1.7, 0.12, frame, 0.04);
        const r = Math.random();
        place(u, y, 1.1, 1.5, 0.05, r < 0.38 ? litWindow() : dark, 0.06);
        place(u, y - 0.18, 1.45, 0.1, 0.25, sill, 0.12);
        if (Math.random() < 0.12) { // varanda
          place(u, y - 0.3, 1.8, 0.12, 0.8, solid(0x9a958c, 0.8), 0.4);
          place(u, y - 0.18, 1.8, 0.8, 0.04, solid(0x222222, 0.4, 0.8), 0.78);
        } else if (Math.random() < 0.08) {
          place(u + 0.6, y - 0.9, 0.7, 0.5, 0.45, solid(0x9a9a9a, 0.5, 0.4), 0.25); // ar-condicionado
        }
      }
    }
    // térreo: vitrines e portas
    if (shop) {
      for (let u = 2.5; u < len - 2; u += 5.5) {
        place(u, 0.3, 3.4, 2.4, 0.06, Math.random() < 0.6 ? shopWindow() : dark, 0.06);
        place(u, 0.25, 3.6, 0.1, 0.1, frame, 0.1);
        if (Math.random() < 0.6) {
          const aw = place(u, 2.95, 3.8, 0.12, 1.3, solid([0x8a2a2a, 0x2a5a4a, 0x3a3a6a, 0x8a6a2a][(Math.random() * 4) | 0], 0.9), 0.65);
          aw.rotation[alongX ? 'x' : 'z'] = 0.25 * out * (alongX ? 1 : -1);
        }
      }
    } else {
      for (let u = 1.8; u < len - 1.2; u += 3.2) {
        place(u, 1.0, 1.2, 1.4, 0.05, Math.random() < 0.3 ? litWindow() : dark, 0.06);
      }
      place(len / 2, 0, 1.3, 2.3, 0.08, solid(0x3a2a20, 0.6), 0.05);
    }
  }
}

export function fountain(g, x, z) {
  const stone = M('concrete');
  const ring = new THREE.LatheGeometry([new THREE.Vector2(2.0, 0), new THREE.Vector2(2.25, 0), new THREE.Vector2(2.25, 0.62), new THREE.Vector2(2.0, 0.62), new THREE.Vector2(2.0, 0.1)], 40);
  mesh(g, ring, stone, x, 0, z);
  const water = new THREE.Mesh(new THREE.CircleGeometry(2.0, 40), new THREE.MeshStandardMaterial({ color: 0x0c1a24, roughness: 0.05, metalness: 0.1, normalMap: null, envMapIntensity: 1.6 }));
  water.rotation.x = -Math.PI / 2;
  water.position.set(x, 0.5, z);
  water.userData.dynamic = true;
  g.add(water);
  mesh(g, cyl(0.35, 0.5, 1.4, 16), stone, x, 0.7, z);
  mesh(g, cyl(0.9, 0.7, 0.18, 24), stone, x, 1.45, z);
  mesh(g, cyl(0.15, 0.25, 0.7, 12), stone, x, 1.85, z);
  mesh(g, new THREE.SphereGeometry(0.3, 16, 12), stone, x, 2.35, z);
  addCollider(x, z, 4.4, 4.4, 0.62);
  world.solids.push(g.children[g.children.length - 1]);
  return water;
}

export { halo, fabric };
