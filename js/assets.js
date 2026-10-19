// Carregamento de modelos, animações e texturas + fábrica de personagens animados
import * as THREE from '../lib/three.module.min.js';
import { GLTFLoader } from '../lib/addons/GLTFLoader.js';
import { RGBELoader } from '../lib/addons/RGBELoader.js';
import * as SkeletonUtils from '../lib/addons/SkeletonUtils.js';

export const A = { models: {}, clips: {}, tex: {}, hdr: null, ready: false };

// Elenco: cada pessoa da história e cada figurante tem um modelo próprio (nenhum se repete)
export const CAST = {
  ari: { file: 'chars/ari.glb', sex: 'm', height: 1.78 },
  iara: { file: 'chars/iara.glb', sex: 'f', height: 1.66, shoes: 0x2a2e38 },
  bruno: { file: 'chars/bruno.glb', sex: 'm', height: 1.76 },
  celeste: { file: 'chars/celeste.glb', sex: 'f', height: 1.62, grayHair: ['avaturn_hair_0', 'avaturn_hair_1'] },
  otavio: { file: 'chars/otavio.glb', sex: 'm', height: 1.74, recolor: { Wolf3D_Outfit_Top: 0xa89a6e } },
  extra1: { file: 'chars/extra1.glb', sex: 'm', height: 1.8 },
  extra2: { file: 'chars/extra2.glb', sex: 'f', height: 1.66 },
  extra3: { file: 'chars/extra3.glb', sex: 'f', height: 1.64 },
  extra4: { file: 'chars/extra4.glb', sex: 'f', height: 1.62, retarget: true },
  xbot: { file: 'xbot.glb', ghost: true, height: 1.68 },
};
// Animações da Ready Player Me (mocap), por tipo de esqueleto
const ANIMS = {
  m: { idle: 'masculine_M_Standing_Idle_001', idle2: 'masculine_M_Standing_Idle_002', walk: 'masculine_M_Walk_001', run: 'masculine_M_Run_001', crouchWalk: 'masculine_M_Crouch_Walk_003', talk: 'masculine_M_Talking_Variations_001' },
  f: { idle: 'feminine_F_Standing_Idle_001', walk: 'feminine_F_Walk_002', run: 'feminine_F_Run_001', crouchWalk: 'feminine_F_Crouch_Walk_001', talk: 'feminine_F_Talking_Variations_001' },
};
const GHOST_CLIPS = ['idle', 'sad_pose', 'agree', 'headShake'];
const GHOST_ADDITIVE = ['sad_pose', 'agree', 'headShake'];

export async function loadAssets(onProgress = () => {}) {
  const manager = new THREE.LoadingManager();
  manager.onProgress = (_url, i, n) => onProgress(i / n);
  const gl = new GLTFLoader(manager);
  const tl = new THREE.TextureLoader(manager);
  const rl = new RGBELoader(manager);
  const tex = (name, srgb = false) => tl.loadAsync('assets/textures/' + name).then((t) => {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 4;
    return t;
  });
  const animFiles = [...new Set([...Object.values(ANIMS.m), ...Object.values(ANIMS.f), 'feminine_Feminine_TPose'])];
  const castIds = Object.keys(CAST);
  // personagens em sequência: decodificar dezenas de texturas ao mesmo tempo estoura a memória em celulares fracos
  const loadChars = async () => { const out = []; for (const id of castIds) out.push(await gl.loadAsync('assets/models/' + CAST[id].file)); return out; };
  const [models, anims, hdr, texs] = await Promise.all([
    loadChars(),
    Promise.all(animFiles.map((f) => gl.loadAsync('assets/models/anims/' + f + '.glb'))),
    rl.loadAsync('assets/textures/moonless_golf_1k.hdr'),
    Promise.all([
      tex('brick_diffuse.jpg', true), tex('brick_bump.jpg'), tex('brick_roughness.jpg'),
      tex('wood_diffuse.jpg', true), tex('wood_bump.jpg'), tex('wood_roughness.jpg'),
      tex('FloorsCheckerboard_S_Diffuse.jpg', true), tex('FloorsCheckerboard_S_Normal.jpg'), tex('waternormals.jpg'),
    ]),
  ]);
  const [brick, brickBump, brickRough, wood, woodBump, woodRough, tiles, tilesN, waterN] = texs;
  Object.assign(A.tex, { brick, brickBump, brickRough, wood, woodBump, woodRough, tiles, tilesN, waterN });
  hdr.mapping = THREE.EquirectangularReflectionMapping;
  A.hdr = hdr;
  castIds.forEach((id, i) => { A.models[id] = prepModel(models[i], CAST[id]); });
  animFiles.forEach((f, i) => {
    A.clips[f] = { clip: anims[i].animations[0] || null, scene: anims[i].scene, hipsRest: restOf(anims[i].scene, 'Hips') };
  });
  A.ready = true;
}

function restOf(root, name) {
  let p = null;
  root.traverse((o) => { if (!p && o.name.replace(/^mixamorig:?/, '') === name) p = o.position.clone(); });
  return p || new THREE.Vector3(0, 1, 0);
}

function prepModel(gltf, def) {
  const scene = gltf.scene;
  scene.traverse((o) => {
    if (o.isMesh) {
      o.castShadow = true;
      o.receiveShadow = true;
      o.frustumCulled = false;
      if (o.material && o.material.metalness > 0.2) o.material.metalness = 0.05;
    }
  });
  scene.updateMatrixWorld(true);
  if (def.shoes) addShoes(scene, def.shoes);
  // altura real (com pele aplicada)
  const bb = new THREE.Box3();
  scene.traverse((o) => {
    if (o.isSkinnedMesh) { o.computeBoundingBox(); bb.union(o.boundingBox.clone().applyMatrix4(o.matrixWorld)); }
    else if (o.isMesh) bb.expandByObject(o);
  });
  const h = bb.max.y - bb.min.y;
  return { scene, animations: gltf.animations, scale: def.height / h, minY: bb.min.y, clips: null, hipsRest: restOf(scene, 'Hips') };
}

// Tênis simples presos aos ossos dos pés (para modelos que vêm descalços)
function addShoes(scene, color) {
  const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.6 });
  const sole = new THREE.MeshStandardMaterial({ color: 0xe8e8e8, roughness: 0.8 });
  scene.updateMatrixWorld(true);
  for (const side of ['Left', 'Right']) {
    let foot = null, toe = null;
    scene.traverse((o) => { if (o.name === side + 'Foot') foot = o; if (o.name === side + 'ToeBase') toe = o; });
    if (!foot || !toe) continue;
    const a = foot.getWorldPosition(new THREE.Vector3()), b = toe.getWorldPosition(new THREE.Vector3());
    const len = a.distanceTo(b);
    const dir = b.clone().sub(a).setY(0).normalize();
    const g = new THREE.Group();
    const upper = new THREE.Mesh(new THREE.CapsuleGeometry(len * 0.38, len * 1.3, 4, 10), mat);
    upper.rotation.x = Math.PI / 2;
    upper.scale.set(1, 1, 0.75);
    const bottom = new THREE.Mesh(new THREE.BoxGeometry(len * 0.78, len * 0.14, len * 2.15), sole);
    bottom.position.y = -len * 0.28;
    g.add(upper, bottom);
    for (const m of [upper, bottom]) { m.castShadow = true; m.frustumCulled = false; }
    // posiciona entre o tornozelo e os dedos, apoiado no chão
    g.position.set((a.x + b.x) / 2 + dir.x * len * 0.25, Math.max(0.05, b.y) + len * 0.1, (a.z + b.z) / 2 + dir.z * len * 0.25);
    g.lookAt(g.position.clone().add(dir));
    scene.add(g);
    g.updateMatrixWorld(true);
    foot.attach(g);
  }
}
// Recolore uma peça no shader: mantém o sombreado da textura e troca o tom (serve até para tecido preto)
function recolor(material, color, gain = 2.4, lift = 0.38) {
  const c = new THREE.Color(color);
  const key = 'recolor' + c.getHexString() + gain + lift;
  material.onBeforeCompile = (sh) => {
    sh.fragmentShader = sh.fragmentShader.replace('#include <map_fragment>', `#include <map_fragment>
      float lum = dot(diffuseColor.rgb, vec3(0.299, 0.587, 0.114));
      diffuseColor.rgb = vec3(clamp(lum * ${gain.toFixed(2)} + ${lift.toFixed(2)}, 0.0, 1.0)) * vec3(${c.r.toFixed(3)}, ${c.g.toFixed(3)}, ${c.b.toFixed(3)});`);
  };
  material.customProgramCacheKey = () => key;
}

// ---------------------------------------------------------------------
//  Preparação dos clipes para cada personagem
function boneMap(root) {
  const m = {};
  root.traverse((o) => { if (o.isBone || o.type === 'Bone' || /Hips|Spine|Leg|Arm|Head|Neck|Foot|Hand|Shoulder|Toe/.test(o.name)) m[o.name.replace(/^mixamorig:?/, '')] = o; });
  return m;
}

// Clipe direto (mesmo padrão de esqueleto): ajusta a altura do quadril e remove o deslocamento (fica no lugar)
function directClip(entry, M) {
  const src = entry.clip;
  const ratio = M.hipsRest.y / Math.max(1e-6, entry.hipsRest.y);
  const has = M.scene ? (n) => !!M.scene.getObjectByName(n) : () => true;
  const tracks = src.tracks.filter((t) => has(t.name.split('.')[0])).map((t) => {
    const [node, prop] = t.name.split('.');
    if (node.replace(/^mixamorig:?/, '') !== 'Hips' || prop !== 'position') return t.clone();
    const v = t.values.slice();
    const n = v.length / 3;
    const dx = v[(n - 1) * 3] - v[0], dz = v[(n - 1) * 3 + 2] - v[2];
    for (let i = 0; i < n; i++) {
      const k = n > 1 ? i / (n - 1) : 0;
      v[i * 3] = (v[i * 3] - dx * k) * ratio;
      v[i * 3 + 1] *= ratio;
      v[i * 3 + 2] = (v[i * 3 + 2] - dz * k) * ratio;
    }
    return new THREE.VectorKeyframeTrack(t.name, t.times, v);
  });
  return new THREE.AnimationClip(src.name, src.duration, tracks);
}

// Retarget no espaço do mundo (para rigs com eixos de repouso diferentes, ex.: Mixamo)
function worldRest(root) {
  root.updateMatrixWorld(true);
  const r = new Map();
  root.traverse((o) => {
    const q = new THREE.Quaternion(), p = new THREE.Vector3(), s = new THREE.Vector3();
    o.matrixWorld.decompose(p, q, s);
    r.set(o, { q, p, s, lq: o.quaternion.clone(), lp: o.position.clone() });
  });
  return r;
}
function worldRetarget(entry, M, srcRoot) {
  const clip = directClip(entry, { hipsRest: entry.hipsRest });
  const srcBones = boneMap(srcRoot), srcRest = worldRest(srcRoot);
  const targetRoot = M.scene;
  const tBones = boneMap(targetRoot), tRest = worldRest(targetRoot);
  const order = [];
  targetRoot.traverse((o) => { if (o.isBone) order.push(o); });
  const mixer = new THREE.AnimationMixer(srcRoot);
  const action = mixer.clipAction(clip);
  action.play();
  const fps = 30, frames = Math.max(2, Math.round(clip.duration * fps) + 1);
  const times = new Float32Array(frames);
  const qVals = new Map(order.map((b) => [b, new Float32Array(frames * 4)]));
  const hips = tBones.Hips, sHips = srcBones.Hips;
  const pVals = new Float32Array(frames * 3);
  const ratio = tRest.get(hips).p.y / Math.max(1e-6, srcRest.get(sHips).p.y);
  const animW = new Map();
  const qw = new THREE.Quaternion(), qp = new THREE.Quaternion(), tp = new THREE.Vector3(), ts = new THREE.Vector3(), d = new THREE.Vector3();
  for (let f = 0; f < frames; f++) {
    const t = Math.min(clip.duration, f / fps);
    times[f] = t;
    mixer.setTime(t);
    srcRoot.updateMatrixWorld(true);
    animW.clear();
    for (const b of order) {
      const sb = srcBones[b.name.replace(/^mixamorig:?/, '')];
      const parentW = animW.get(b.parent) || tRest.get(b.parent).q;
      let world;
      if (sb && srcRest.get(sb)) {
        sb.matrixWorld.decompose(tp, qw, ts);
        world = qw.clone().multiply(srcRest.get(sb).q.clone().invert()).multiply(tRest.get(b).q);
      } else world = parentW.clone().multiply(tRest.get(b).lq);
      animW.set(b, world);
      qp.copy(parentW).invert().multiply(world);
      qp.toArray(qVals.get(b), f * 4);
    }
    sHips.matrixWorld.decompose(tp, qw, ts);
    d.copy(tp).sub(srcRest.get(sHips).p).multiplyScalar(ratio);
    const pr = tRest.get(hips.parent);
    d.applyQuaternion(pr.q.clone().invert()).divide(pr.s).add(tRest.get(hips).lp);
    d.toArray(pVals, f * 3);
  }
  action.stop();
  mixer.uncacheRoot(srcRoot);
  srcRoot.traverse((o) => { const r = srcRest.get(o); if (r) { o.quaternion.copy(r.lq); o.position.copy(r.lp); } });
  srcRoot.updateMatrixWorld(true);
  const tracks = order.map((b) => new THREE.QuaternionKeyframeTrack(b.name + '.quaternion', times, qVals.get(b)));
  tracks.push(new THREE.VectorKeyframeTrack(hips.name + '.position', times, pVals));
  return new THREE.AnimationClip(clip.name, clip.duration, tracks);
}

function clipsFor(id) {
  const M = A.models[id], def = CAST[id];
  if (M.clips) return M.clips;
  M.clips = {};
  if (def.ghost) {
    for (const name of GHOST_CLIPS) {
      let c = M.animations.find((a) => a.name === name);
      if (!c) continue;
      c = c.clone();
      if (GHOST_ADDITIVE.includes(name)) {
        THREE.AnimationUtils.makeClipAdditive(c);
        if (name.endsWith('_pose')) c = THREE.AnimationUtils.subclip(c, name, 2, 3, 30);
      }
      M.clips[name] = c;
    }
    return M.clips;
  }
  for (const [key, file] of Object.entries(ANIMS[def.sex])) {
    const entry = A.clips[file];
    if (!entry || !entry.clip) continue;
    M.clips[key] = def.retarget ? worldRetarget(entry, M, A.clips.feminine_Feminine_TPose.scene) : directClip(entry, M);
  }
  return M.clips;
}

// ---------------------------------------------------------------------
//  Personagem animado
// opts: { tint: { meshOuMaterial: cor }, ghost: material, idleVariant }
export function makeCharacter(id, opts = {}) {
  const M = A.models[id], def = CAST[id];
  const model = SkeletonUtils.clone(M.scene);
  const scale = M.scale * ((opts.height || def.height) / def.height);
  model.scale.setScalar(scale);
  model.position.y = -M.minY * scale;
  const root = new THREE.Group();
  root.userData.dynamic = true;
  root.add(model);
  const mats = [];
  const mouth = [];
  model.traverse((o) => {
    if (!o.isMesh) return;
    if (opts.ghost) { o.material = opts.ghost; o.castShadow = false; }
    else {
      o.material = o.material.clone();
      const tint = opts.tint && (opts.tint[o.name] ?? opts.tint[o.material.name]);
      if (tint != null) o.material.color.set(tint);
      if (def.grayHair && def.grayHair.includes(o.name)) recolor(o.material, 0xe6e6ec);
      const rc = (def.recolor && def.recolor[o.name]) || (opts.recolor && opts.recolor[o.name]);
      if (rc) recolor(o.material, rc, 3.2, 0.3);
      mats.push(o.material);
    }
    const dict = o.morphTargetDictionary;
    if (dict) {
      const k = ['mouthOpen', 'jawOpen', 'viseme_aa'].find((n) => dict[n] !== undefined);
      if (k) mouth.push([o, dict[k]]);
    }
  });
  const mixer = new THREE.AnimationMixer(model);
  const clips = clipsFor(id);
  const act = {};
  for (const [name, clip] of Object.entries(clips)) {
    const a = mixer.clipAction(clip);
    if (def.ghost && GHOST_ADDITIVE.includes(name)) a.blendMode = THREE.AdditiveAnimationBlendMode;
    a.setEffectiveWeight(name === 'idle' ? 1 : 0);
    a.play();
    act[name] = a;
  }
  const idleKey = opts.idleVariant && act.idle2 ? 'idle2' : 'idle';
  if (idleKey === 'idle2') { act.idle.setEffectiveWeight(0); act.idle2.setEffectiveWeight(1); }
  // desincroniza as animações entre personagens
  for (const a of Object.values(act)) a.time = Math.random() * a.getClip().duration;
  const bones = {};
  model.traverse((o) => { if (o.isBone) bones[o.name.replace(/^mixamorig:?/, '')] = o; });
  const ch = {
    root, model, mixer, act, bones, mats, baseY: model.position.y,
    talkT: 0, talking: false, crouch: 0, height: opts.height || def.height,
    // velocidade (m/s), agachado (0..1)
    locomote(speed, crouch = 0, dt = 0.016) {
      const C = THREE.MathUtils.clamp;
      const moving = C(speed / 0.6, 0, 1);
      const runW = C((speed - 2.8) / 1.6, 0, 1);
      const crouchMove = act.crouchWalk ? moving * crouch : 0;
      const walkW = moving * (1 - runW) * (1 - crouch);
      const talkW = this.talking && act.talk ? 1 : 0;
      const idleW = C(1 - moving, 0, 1) * (1 - talkW);
      const target = { [idleKey]: idleW, walk: walkW, run: moving * runW * (1 - crouch), crouchWalk: crouchMove, talk: talkW * (1 - moving) };
      const k = Math.min(1, dt * 8);
      if (!def.ghost) {
        for (const [n, a] of Object.entries(act)) {
          const t = target[n] || 0;
          a.setEffectiveWeight(a.getEffectiveWeight() + (t - a.getEffectiveWeight()) * k);
        }
      }
      if (act.walk) act.walk.timeScale = C(speed / 1.4, 0.7, 1.6);
      if (act.run) act.run.timeScale = C(speed / 4.6, 0.8, 1.3);
      if (act.crouchWalk) act.crouchWalk.timeScale = C(speed / 1.1, 0.6, 1.5);
      // agachado parado: postura procedural (não há clipe de "agachado parado")
      this.crouch = crouch * (1 - moving);
    },
    gesture(name, weight) { if (act[name]) act[name].setEffectiveWeight(weight); },
    applyCrouch(c) {
      root.updateMatrixWorld(true);
      const right = new THREE.Vector3(1, 0, 0).applyQuaternion(root.quaternion);
      model.position.y = this.baseY - 0.33 * c * (this.height / 1.76);
      for (const side of ['Left', 'Right']) {
        rotateBoneWorld(bones[side + 'UpLeg'], right, -1.0 * c);
        rotateBoneWorld(bones[side + 'Leg'], right, 1.75 * c);
        rotateBoneWorld(bones[side + 'Foot'], right, -0.75 * c);
      }
      rotateBoneWorld(bones.Spine, right, 0.3 * c);
      rotateBoneWorld(bones.Head || bones.Neck, right, -0.25 * c);
    },
    update(dt) {
      mixer.update(dt);
      if (this.crouch > 0.01) this.applyCrouch(this.crouch);
      else model.position.y = this.baseY;
      if (mouth.length) {
        this.talkT = Math.max(0, this.talkT - dt);
        const open = this.talkT > 0 ? (Math.sin(performance.now() / 70) * 0.5 + 0.5) * 0.45 : 0;
        for (const [m, i] of mouth) m.morphTargetInfluences[i] += (open - m.morphTargetInfluences[i]) * Math.min(1, dt * 18);
      }
    },
  };
  return ch;
}

// Gira um osso no espaço do mundo (independe dos eixos locais do rig)
const _qw = new THREE.Quaternion(), _qa = new THREE.Quaternion(), _qp = new THREE.Quaternion();
export function rotateBoneWorld(bone, axis, angle) {
  if (!bone) return;
  bone.getWorldQuaternion(_qw);
  _qa.setFromAxisAngle(axis, angle);
  _qw.premultiply(_qa);
  bone.parent.getWorldQuaternion(_qp);
  bone.quaternion.copy(_qp.invert().multiply(_qw));
  bone.updateMatrixWorld(true);
}

// Material de eco: brilho de borda (fresnel) ciano, aditivo
export function ghostMaterial(color = 0x7fe9ff) {
  const m = new THREE.MeshStandardMaterial({ color: 0x000000, emissive: color, emissiveIntensity: 1.2, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false, roughness: 1, metalness: 0 });
  m.onBeforeCompile = (sh) => {
    sh.fragmentShader = sh.fragmentShader.replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
      float fres = pow(1.0 - abs(dot(normalize(normal), normalize(vViewPosition))), 2.2);
      totalEmissiveRadiance *= (0.18 + 1.8 * fres);`);
  };
  return m;
}
