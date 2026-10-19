// Sistemas por zona: interações, ecos, NPCs, camadas (Resonance/normal), a Estática
import { THREE, scene, camera, world, ghostMat, buildHumanoid, animateHumanoid, clamp, lerp, rand, angleDiff } from './engine.js';
import { Sensor } from './sensor.js';
import { makePanner, setPannerPos, voice, sfx } from './audio.js';
import { subtitle, $ } from './ui.js';
import { player } from './player.js';
import { S, addEcho } from './state.js';

export const Z = {
  interactables: [], echoes: [], npcs: [], layered: [], updaters: [], peakHandlers: [],
  threat: null, palette: null, busy: false, current: null,
};

export function resetZone() {
  for (const e of Z.echoes) e.dispose();
  if (Z.threat) Z.threat.dispose();
  Object.assign(Z, { interactables: [], echoes: [], npcs: [], layered: [], updaters: [], peakHandlers: [], threat: null, current: null });
}

// ---------------------------------------------------------------------
//  Camadas: objetos que só existem na Resonance ('res') ou só fora dela ('normal')
export function layered(obj, layer, maxOpacity = 1) {
  const mats = [];
  obj.traverse((o) => {
    if (!o.material) return;
    if (!o.material.transparent) { o.material = o.material.clone(); o.material.transparent = true; }
    else if (!mats.some((m) => m.m === o.material)) o.material = o.material.clone();
    mats.push({ m: o.material, base: (o.material.userData.base ?? o.material.opacity) * maxOpacity });
    o.castShadow = false;
  });
  const L = { obj, layer, mats };
  Z.layered.push(L);
  return L;
}
function updateLayers(R) {
  for (const L of Z.layered) {
    const k = L.layer === 'res' ? R : 1 - R;
    L.obj.visible = k > 0.02;
    for (const { m, base } of L.mats) m.opacity = base * k;
  }
}

// ---------------------------------------------------------------------
//  Interações
// layer: 'any' | 'res' (só na Resonance) | 'normal' (só fora dela)
export function interactable(def) {
  const it = { radius: 1.7, layer: 'any', enabled: () => true, ...def };
  Z.interactables.push(it);
  return it;
}
export function layerVisible(layer, R) {
  return layer === 'any' || (layer === 'res' && R > 0.6) || (layer === 'normal' && R < 0.4);
}
export function findInteractable(R) {
  let best = null, bestScore = Infinity;
  const fx = Math.sin(player.facing), fz = Math.cos(player.facing);
  for (const it of Z.interactables) {
    if (!it.enabled() || !layerVisible(it.layer, R)) continue;
    const dx = it.pos.x - player.pos.x, dz = it.pos.z - player.pos.z;
    const d = Math.hypot(dx, dz);
    if (d > it.radius) continue;
    const facing = d > 0.01 ? (dx * fx + dz * fz) / d : 1;
    const score = d - facing * 0.6;
    if (score < bestScore) { bestScore = score; best = it; }
  }
  return best;
}
const tapRay = new THREE.Raycaster();
export function tapInteractable(tap, R) {
  const ndc = new THREE.Vector2((tap.x / window.innerWidth) * 2 - 1, -(tap.y / window.innerHeight) * 2 + 1);
  tapRay.setFromCamera(ndc, camera);
  let best = null, bestD = Infinity;
  for (const it of Z.interactables) {
    if (!it.mesh || !it.enabled() || !layerVisible(it.layer, R)) continue;
    if (Math.hypot(it.pos.x - player.pos.x, it.pos.z - player.pos.z) > 6) continue;
    const hit = tapRay.intersectObject(it.mesh, true)[0];
    if (hit && hit.distance < bestD) { bestD = hit.distance; best = it; }
  }
  return best;
}

// ---------------------------------------------------------------------
//  Ecos: memórias visuais e sonoras. Só aparecem e só tocam na Resonance.
export class Echo {
  constructor(def) {
    Object.assign(this, { radius: 3.2, hold: 8, pose: 'stand', active: () => true, facing: 0 }, def);
    this.hold = Math.max(this.hold, this.lines.length * 2.6);
    this.progress = 0;
    this.lineIdx = -1;
    this.done = !!S.echoes[this.id];
    this.t = Math.random() * 10;
    this.whisperT = rand(2, 4);
    this.warned = false;
    this.group = new THREE.Group();
    this.group.position.copy(this.pos);
    this.fig = buildHumanoid({ ghost: true, opacity: 0.55, ...(this.figure || {}), skin: 0xbff4ff, top: 0x7fe9ff, legs: 0x4fb8e0, hair: 0x9fe6ff, shoe: 0x4fb8e0 });
    this.fig.root.rotation.y = this.facing;
    this.group.add(this.fig.root);
    const ring = new THREE.Mesh(new THREE.RingGeometry(this.radius - 0.12, this.radius, 48), ghostMat(0x7fe9ff, 0.35));
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.03;
    this.group.add(ring);
    const glow = new THREE.Mesh(new THREE.CircleGeometry(0.9, 24), ghostMat(0x7fe9ff, 0.25));
    glow.rotation.x = -Math.PI / 2;
    glow.position.y = 0.02;
    this.group.add(glow);
    this.ring = ring;
    world.group.add(this.group);
    this.layer = layered(this.group, 'res');
    this.panner = makePanner({ x: this.pos.x, y: 1.5, z: this.pos.z }, 'res', 2.5, 50);
    Z.echoes.push(this);
  }
  update(dt, R) {
    this.t += dt;
    const on = this.active() && !this.done;
    this.group.visible = this.group.visible && (on || this.fadeOut > 0);
    if (!on) {
      if (this.fadeOut > 0) {
        this.fadeOut -= dt;
        this.group.scale.setScalar(1 + (1 - this.fadeOut) * 0.4);
        for (const m of this.layer.mats) m.base *= 0.95;
      }
      return;
    }
    this.animatePose();
    // sussurros direcionais (só audíveis na Resonance): o jogador encontra o eco pelo som
    this.whisperT -= dt;
    if (this.whisperT <= 0) {
      this.whisperT = rand(3.5, 6);
      voice('mmm hm ' + 'a'.repeat(10 + (Math.random() * 20) | 0), { panner: this.panner, pitch: 210, vol: 0.12 });
    }
    const d = Math.hypot(player.pos.x - this.pos.x, player.pos.z - this.pos.z);
    const near = d < this.radius;
    this.ring.material.opacity = (near ? 0.7 : 0.35) * R;
    if (near && R > 0.75) {
      this.progress += dt;
      this.warned = false;
      const idx = Math.min(this.lines.length - 1, Math.floor((this.progress / this.hold) * this.lines.length));
      if (idx !== this.lineIdx) {
        this.lineIdx = idx;
        const ln = this.lines[idx];
        const dur = voice(ln.text, { panner: this.panner, pitch: ln.pitch || 215, vol: 0.13 });
        subtitle(ln.who || 'Eco', ln.text, Math.max(dur + 0.8, 3), 'echo');
      }
      if (this.progress >= this.hold) this.complete();
    } else if (near && this.progress > 0 && R < 0.5 && !this.warned) {
      this.warned = true;
      subtitle('', 'O eco se desfaz… fique em silêncio para continuar ouvindo.', 3, 'thought');
    }
    this.near = near && this.progress > 0;
  }
  animatePose() {
    const h = this.fig, t = this.t;
    animateHumanoid(h, { walk: 0, phase: 0, idleT: t });
    if (this.pose === 'record') { h.armR.rotation.set(-1.3, 0, 0.3); h.armL.rotation.set(-0.3, 0, -0.1); h.head.rotation.x = 0.2; }
    else if (this.pose === 'argue') { h.armR.rotation.set(-0.8 + Math.sin(t * 3) * 0.6, 0, 0.2); h.armL.rotation.set(-0.6 + Math.cos(t * 2.5) * 0.4, 0, -0.2); h.root.rotation.y = this.facing + Math.sin(t * 0.7) * 0.6; }
    else if (this.pose === 'reach') { h.armR.rotation.set(-1.6, 0, 0); h.armL.rotation.set(-1.6, 0, 0); h.chest.rotation.x = 0.15; }
    else if (this.pose === 'kneel') { animateHumanoid(h, { walk: 0, phase: 0, crouch: 1, idleT: t }); h.head.rotation.x = 0.4; }
    h.root.position.y = Math.sin(t * 1.3) * 0.04;
  }
  complete() {
    this.done = true;
    this.fadeOut = 1;
    addEcho(this.id, this.title, this.lines.map((l) => l.text));
    if (this.onComplete) this.onComplete();
  }
  dispose() { if (this.panner) this.panner.disconnect(); }
}

// ---------------------------------------------------------------------
//  NPCs
export class NPC {
  constructor(def) {
    Object.assign(this, { facing: 0, sit: false, hasHiddenLayer: false, frozenInRes: false, radius: 2.2 }, def);
    this.h = buildHumanoid(this.colors);
    this.h.root.position.copy(this.pos);
    this.h.root.rotation.y = this.facing;
    world.group.add(this.h.root);
    this.t = Math.random() * 5;
    this.talking = false;
    if (this.hasHiddenLayer) {
      const aura = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 2.1, 16, 1, true), ghostMat(0x7fe9ff, 0.22));
      aura.material.side = THREE.DoubleSide;
      aura.position.copy(this.pos);
      aura.position.y = 1.05 + (this.sit ? -0.3 : 0);
      world.group.add(aura);
      layered(aura, 'res');
    }
    this.it = interactable({
      pos: this.pos, radius: this.radius, label: def.label || `Falar com ${this.name}`, mesh: this.h.root,
      onUse: async () => { this.talking = true; await this.talk(); this.talking = false; },
    });
    Z.npcs.push(this);
  }
  update(dt, R) {
    const frozen = this.frozenInRes && R > 0.6;
    if (!frozen) this.t += dt;
    animateHumanoid(this.h, { walk: 0, phase: 0, idleT: this.t, sit: this.sit, talk: this.talking });
    const dx = player.pos.x - this.pos.x, dz = player.pos.z - this.pos.z;
    const near = Math.hypot(dx, dz) < 5 && !frozen;
    const want = near ? clamp(angleDiff(this.h.root.rotation.y, Math.atan2(dx, dz)), -1.1, 1.1) : 0;
    this.h.head.rotation.y = lerp(this.h.head.rotation.y, want, Math.min(1, dt * 4));
    if (this.frozenInRes) for (const m of this.h.mats) m.emissive.setScalar(frozen ? 0.12 : 0);
  }
}

// ---------------------------------------------------------------------
//  A Estática: tudo o que a cidade falou e ninguém escutou.
//  Só se aproxima com ruído; o silêncio a afasta. Na Resonance ela vira memória (fragmentos de frases).
const FRAGMENTS = [
  '“…eu disse que tava tudo bem…”', '“…ninguém atende…”', '“…depois a gente conversa…”', '“…você não tá me ouvindo…”',
  '“…liga pra mãe, ela pediu…”', '“…fala mais alto…”', '“…tá, tá, já entendi…”', '“…era só um minuto…”',
];
export class Estatica {
  constructor(home, onEngulf) {
    this.home = home.clone();
    this.pos = home.clone();
    this.onEngulf = onEngulf;
    this.active = false;
    this.lunge = 0;
    this.t = 0;
    this.burstT = 1;
    this.fragT = 4;
    this.cool = 0;
    const N = 70;
    this.N = N;
    this.shards = new THREE.InstancedMesh(new THREE.BoxGeometry(0.12, 0.12, 0.02), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85 }), N);
    this.shards.frustumCulled = false;
    this.seeds = Array.from({ length: N }, () => ({ r: rand(0.3, 1.2), a: rand(0, 6.28), b: rand(-1, 1), s: rand(0.6, 2.2), y: rand(0.4, 2.2) }));
    const col = new THREE.Color();
    for (let i = 0; i < N; i++) this.shards.setColorAt(i, col.setHSL(0, 0, rand(0.5, 1)));
    world.group.add(this.shards);
    this.core = new THREE.Mesh(new THREE.SphereGeometry(0.35, 10, 8), new THREE.MeshBasicMaterial({ color: 0x111111 }));
    world.group.add(this.core);
    this.panner = makePanner({ x: this.pos.x, y: 1.2, z: this.pos.z }, 'world', 2, 35);
    this.dummy = new THREE.Object3D();
    this.unsub = null;
    this.setVisible(false);
  }
  setVisible(v) { this.shards.visible = v; this.core.visible = v; }
  activate() { this.active = true; this.setVisible(true); }
  peak(strength) {
    if (!this.active) return;
    this.lunge = 0.9 * Math.min(1.5, strength);
  }
  update(dt, R) {
    if (!this.active) return;
    this.t += dt;
    this.cool -= dt;
    const toP = new THREE.Vector3(player.pos.x - this.pos.x, 0, player.pos.z - this.pos.z);
    const dist = toP.length();
    toP.normalize();
    const noisy = Sensor.noisy || Sensor.state === 'noise';
    let v = 0;
    if (this.lunge > 0) { this.lunge -= dt; v = 6.5; }
    else if (noisy) v = 1.5 + 1.8 * Math.min(1, Sensor.agitation);
    else if (R > 0.5) v = dist < 16 ? -1.6 : 0;
    else v = dist < 7 ? 0.35 : -0.4; // curiosa, mas recua sem ruído
    this.pos.addScaledVector(toP, v * dt);
    const B = world.bounds - 2;
    this.pos.x = clamp(this.pos.x, -B, B);
    this.pos.z = clamp(this.pos.z, -B, B);
    // fragmentos
    const calm = R > 0.5 ? 0.25 : 1;
    for (let i = 0; i < this.N; i++) {
      const s = this.seeds[i];
      const a = s.a + this.t * s.s * calm * (noisy ? 2.2 : 1);
      const jitter = noisy ? (Math.random() - 0.5) * 0.25 : 0;
      this.dummy.position.set(this.pos.x + Math.cos(a) * s.r * (1 + jitter), s.y + Math.sin(this.t * s.s + s.b) * 0.2, this.pos.z + Math.sin(a) * s.r);
      this.dummy.rotation.set(a, a * 0.7, 0);
      this.dummy.scale.setScalar(noisy && Math.random() < 0.1 ? 2.2 : 1);
      this.dummy.updateMatrix();
      this.shards.setMatrixAt(i, this.dummy.matrix);
    }
    this.shards.instanceMatrix.needsUpdate = true;
    this.shards.material.color.setRGB(lerp(1, 0.55, R), lerp(1, 0.85, R), 1);
    this.core.position.set(this.pos.x, 1.3, this.pos.z);
    setPannerPos(this.panner, { x: this.pos.x, y: 1.3, z: this.pos.z });
    // som: rajadas de estática mais frequentes com ruído
    this.burstT -= dt;
    if (this.burstT <= 0) {
      this.burstT = noisy ? rand(0.3, 0.8) : rand(1.5, 3);
      sfx.staticBurst(this.panner);
    }
    // na Resonance, perto: vira memória
    this.fragT -= dt;
    if (R > 0.6 && dist < 9 && this.fragT <= 0) {
      this.fragT = rand(5, 8);
      subtitle('', FRAGMENTS[(Math.random() * FRAGMENTS.length) | 0], 3.5, 'static');
    }
    // proximidade: distorção na tela
    const g = clamp(1 - dist / 6, 0, 1);
    $('glitch').style.opacity = (g * (noisy ? 0.9 : 0.4)).toFixed(2);
    if (dist < 1.2 && this.cool <= 0) {
      this.cool = 4;
      this.onEngulf();
    }
  }
  pushAway(minDist) {
    const d = new THREE.Vector3(this.pos.x - player.pos.x, 0, this.pos.z - player.pos.z);
    if (d.length() < minDist) {
      if (d.lengthSq() < 0.01) d.set(1, 0, 0);
      this.pos.copy(player.pos).addScaledVector(d.normalize(), minDist);
      this.pos.y = 0;
    }
  }
  dispose() {
    if (this.panner) this.panner.disconnect();
    $('glitch').style.opacity = 0;
  }
}

export function updateSystems(dt, R) {
  updateLayers(R);
  for (const e of Z.echoes) e.update(dt, R);
  for (const n of Z.npcs) n.update(dt, R);
  if (Z.threat) Z.threat.update(dt, R);
  for (const u of Z.updaters) u(dt, R);
}
