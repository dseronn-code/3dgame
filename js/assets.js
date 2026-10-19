// Carregamento de modelos, animações e texturas + fábrica de personagens animados
import * as THREE from '../lib/three.module.min.js';
import { GLTFLoader } from '../lib/addons/GLTFLoader.js';
import { RGBELoader } from '../lib/addons/RGBELoader.js';
import * as SkeletonUtils from '../lib/addons/SkeletonUtils.js';

export const A = { models: {}, clips: {}, tex: {}, hdr: null, ready: false };

const CLIP_NAMES = ['idle', 'walk', 'run', 'sneak_pose', 'sad_pose', 'agree', 'headShake'];
const ADDITIVE = ['sneak_pose', 'sad_pose', 'agree', 'headShake'];

export async function loadAssets(onProgress = () => {}) {
  const manager = new THREE.LoadingManager();
  manager.onProgress = (_url, i, n) => onProgress(i / n);
  const gl = new GLTFLoader(manager);
  const tl = new THREE.TextureLoader(manager);
  const rl = new RGBELoader(manager);
  const tex = (name, srgb = false, repeat = 1) => tl.loadAsync('assets/textures/' + name).then((t) => {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(repeat, repeat);
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 4;
    return t;
  });
  const [michelle, avatar, xbot, hdr, ...texs] = await Promise.all([
    gl.loadAsync('assets/models/michelle.glb'),
    gl.loadAsync('assets/models/avatar.glb'),
    gl.loadAsync('assets/models/xbot.glb'),
    rl.loadAsync('assets/textures/moonless_golf_1k.hdr'),
    tex('brick_diffuse.jpg', true), tex('brick_bump.jpg'), tex('brick_roughness.jpg'),
    tex('wood_diffuse.jpg', true), tex('wood_bump.jpg'), tex('wood_roughness.jpg'),
    tex('FloorsCheckerboard_S_Diffuse.jpg', true), tex('FloorsCheckerboard_S_Normal.jpg'),
    tex('waternormals.jpg'),
  ]);
  const [brick, brickBump, brickRough, wood, woodBump, woodRough, tiles, tilesN, waterN] = texs;
  Object.assign(A.tex, { brick, brickBump, brickRough, wood, woodBump, woodRough, tiles, tilesN, waterN });
  hdr.mapping = THREE.EquirectangularReflectionMapping;
  A.hdr = hdr;

  A.models.michelle = prepModel(michelle.scene, 1.66);
  A.models.avatar = prepModel(avatar.scene, 1.76);
  A.models.xbot = prepModel(xbot.scene, 1.72);
  // fonte das animações: X Bot (Mixamo)
  for (const name of CLIP_NAMES) {
    const c = xbot.animations.find((a) => a.name === name);
    if (c) A.clips[name] = c;
  }
  A.ready = true;
}

function prepModel(scene, height) {
  scene.traverse((o) => {
    if (o.isMesh) {
      o.castShadow = true;
      o.receiveShadow = true;
      o.frustumCulled = false;
      if (o.material && o.material.metalness > 0.2) o.material.metalness = 0.05;
    }
  });
  scene.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(scene);
  const h = box.max.y - box.min.y;
  return { scene, scale: height / h, minY: box.min.y, retargeted: {} };
}

// --- Retarget no espaço do mundo: a rotação de cada osso da fonte, relativa ao repouso,
//     é aplicada ao osso equivalente do alvo (funciona mesmo com eixos de repouso diferentes)
function boneMap(root) {
  const m = {};
  root.traverse((o) => { if (o.isBone) m[o.name.replace(/^mixamorig:?/, '')] = o; });
  return m;
}
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
let SRC = null;
function retargetClip(clip, targetRoot) {
  const src = A.models.xbot.scene;
  if (!SRC) SRC = { bones: boneMap(src), rest: worldRest(src) };
  const tBones = boneMap(targetRoot);
  const tRest = worldRest(targetRoot);
  // ordem hierárquica dos ossos do alvo
  const order = [];
  targetRoot.traverse((o) => { if (o.isBone) order.push(o); });
  const mixer = new THREE.AnimationMixer(src);
  const action = mixer.clipAction(clip);
  action.play();
  const fps = 30;
  const frames = Math.max(2, Math.round(clip.duration * fps) + 1);
  const times = new Float32Array(frames);
  const qVals = new Map(order.map((b) => [b, new Float32Array(frames * 4)]));
  const hips = tBones.Hips, sHips = SRC.bones.Hips;
  const pVals = new Float32Array(frames * 3);
  const ratio = tRest.get(hips).p.y / Math.max(1e-6, SRC.rest.get(sHips).p.y);
  const animW = new Map();
  const qd = new THREE.Quaternion(), qw = new THREE.Quaternion(), qp = new THREE.Quaternion(), tmpP = new THREE.Vector3(), tmpS = new THREE.Vector3(), d = new THREE.Vector3();
  for (let f = 0; f < frames; f++) {
    const t = Math.min(clip.duration, f / fps);
    times[f] = t;
    mixer.setTime(t);
    src.updateMatrixWorld(true);
    animW.clear();
    for (const b of order) {
      const key = b.name.replace(/^mixamorig:?/, '');
      const sb = SRC.bones[key];
      const parentW = animW.get(b.parent) || tRest.get(b.parent).q;
      let world;
      if (sb) {
        sb.matrixWorld.decompose(tmpP, qw, tmpS);
        qd.copy(qw).multiply(SRC.rest.get(sb).q.clone().invert()); // delta no mundo
        world = qd.clone().multiply(tRest.get(b).q);
      } else {
        world = parentW.clone().multiply(tRest.get(b).lq);
      }
      animW.set(b, world);
      qp.copy(parentW).invert().multiply(world);
      qp.toArray(qVals.get(b), f * 4);
    }
    // deslocamento do quadril (sobe/desce ao andar, agacha)
    sHips.matrixWorld.decompose(tmpP, qw, tmpS);
    d.copy(tmpP).sub(SRC.rest.get(sHips).p).multiplyScalar(ratio);
    const pr = tRest.get(hips.parent);
    d.applyQuaternion(pr.q.clone().invert()).divide(pr.s);
    d.add(tRest.get(hips).lp);
    d.toArray(pVals, f * 3);
  }
  action.stop();
  mixer.uncacheRoot(src);
  // devolve a fonte ao repouso
  src.traverse((o) => { const r = SRC.rest.get(o); if (r) { o.quaternion.copy(r.lq); o.position.copy(r.lp); } });
  src.updateMatrixWorld(true);
  const tracks = order.map((b) => new THREE.QuaternionKeyframeTrack(b.name + '.quaternion', times, qVals.get(b)));
  tracks.push(new THREE.VectorKeyframeTrack(hips.name + '.position', times, pVals));
  return new THREE.AnimationClip(clip.name, clip.duration, tracks);
}
// Retarget local: mesmo eixo de ossos (Ready Player Me é compatível com Mixamo)
function retargetLocal(clip, targetRoot) {
  if (!SRC) SRC = { bones: boneMap(A.models.xbot.scene), rest: worldRest(A.models.xbot.scene) };
  const tb = boneMap(targetRoot);
  const tracks = [];
  const corr = new THREE.Quaternion(), q = new THREE.Quaternion(), v = new THREE.Vector3();
  for (const tr of clip.tracks) {
    const [node, prop] = tr.name.split('.');
    const key = node.replace(/^mixamorig:?/, '');
    const sb = SRC.bones[key], t = tb[key];
    if (!sb || !t) continue;
    corr.copy(t.quaternion).multiply(sb.quaternion.clone().invert());
    const vals = tr.values.slice();
    if (prop === 'quaternion') {
      for (let i = 0; i < vals.length; i += 4) { q.fromArray(vals, i).premultiply(corr); q.toArray(vals, i); }
      tracks.push(new THREE.QuaternionKeyframeTrack(t.name + '.quaternion', tr.times, vals));
    } else if (prop === 'position' && key === 'Hips') {
      const ratio = t.position.length() / Math.max(1e-6, sb.position.length());
      for (let i = 0; i < vals.length; i += 3) { v.fromArray(vals, i).applyQuaternion(corr).multiplyScalar(ratio); v.toArray(vals, i); }
      tracks.push(new THREE.VectorKeyframeTrack(t.name + '.position', tr.times, vals));
    }
  }
  return new THREE.AnimationClip(clip.name, clip.duration, tracks);
}
const RETARGET = { avatar: retargetLocal, michelle: retargetClip };

function clipsFor(base) {
  const M = A.models[base];
  if (!M.retargeted.idle) {
    for (const name of CLIP_NAMES) {
      if (!A.clips[name]) continue;
      let c = base === 'xbot' ? A.clips[name].clone() : RETARGET[base](A.clips[name], M.scene);
      if (ADDITIVE.includes(name)) {
        THREE.AnimationUtils.makeClipAdditive(c);
        if (name.endsWith('_pose')) c = THREE.AnimationUtils.subclip(c, name, 2, 3, 30);
      }
      M.retargeted[name] = c;
    }
  }
  return M.retargeted;
}

// ---------------------------------------------------------------------
//  Personagem animado
// opts: { tint: { meshName: color }, hide: [meshNames], height, ghost: material }
export function makeCharacter(base, opts = {}) {
  const M = A.models[base];
  const model = SkeletonUtils.clone(M.scene);
  const scale = opts.height ? M.scale * (opts.height / heightOf(base)) : M.scale;
  model.scale.setScalar(scale);
  model.position.y = -M.minY * scale;
  const root = new THREE.Group();
  root.userData.dynamic = true;
  root.add(model);
  const mats = [];
  const morphMeshes = [];
  model.traverse((o) => {
    if (!o.isMesh) return;
    if (opts.hide && opts.hide.includes(o.name)) { o.visible = false; return; }
    if (opts.ghost) {
      o.material = opts.ghost;
      o.castShadow = false;
    } else {
      o.material = o.material.clone();
      const tint = opts.tint && (opts.tint[o.name] ?? opts.tint[o.material.name]);
      if (tint != null) o.material.color.set(tint);
      if (opts.tintAll != null) o.material.color.multiply(new THREE.Color(opts.tintAll));
      mats.push(o.material);
    }
    if (o.morphTargetDictionary && o.morphTargetDictionary.mouthOpen !== undefined) morphMeshes.push(o);
  });
  const mixer = new THREE.AnimationMixer(model);
  const clips = clipsFor(base);
  const act = {};
  for (const name of CLIP_NAMES) {
    if (!clips[name]) continue;
    const a = mixer.clipAction(clips[name]);
    if (ADDITIVE.includes(name)) a.blendMode = THREE.AdditiveAnimationBlendMode;
    a.enabled = true;
    a.setEffectiveWeight(name === 'idle' ? 1 : 0);
    a.play();
    act[name] = a;
  }
  const bones = boneMap(model);
  const ch = {
    root, model, mixer, act, bones, mats, morphMeshes, baseY: model.position.y,
    talkT: 0, blinkT: 2,
    // velocidade em m/s; crouch 0..1
    locomote(speed, crouch = 0, dt = 0.016) {
      const w = THREE.MathUtils.clamp;
      const walkW = speed < 0.05 ? 0 : speed < 2.6 ? w(speed / 1.2, 0, 1) : w(1 - (speed - 2.6) / 1.4, 0, 1);
      const runW = w((speed - 2.6) / 1.4, 0, 1);
      const idleW = w(1 - walkW - runW, 0, 1);
      const k = Math.min(1, dt * 10);
      for (const [n, target] of [['idle', idleW], ['walk', walkW], ['run', runW]]) {
        const a = act[n];
        a.setEffectiveWeight(a.getEffectiveWeight() + (target - a.getEffectiveWeight()) * k);
      }
      act.walk.timeScale = w(speed / 1.45, 0.6, 1.8);
      act.run.timeScale = w(speed / 4.2, 0.8, 1.4);
      this.crouch = crouch;
    },
    gesture(name, weight) { if (act[name]) act[name].setEffectiveWeight(weight); },
    // agachamento procedural (vale para qualquer rig): dobra joelhos, baixa o quadril, inclina o tronco
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
    crouch: 0,
    height: opts.height || heightOf(base),
    update(dt) {
      mixer.update(dt);
      if (this.crouch > 0.01) this.applyCrouch(this.crouch);
      else model.position.y = this.baseY;
      // boca durante a fala e piscadas (só o avatar tem morphs)
      if (morphMeshes.length) {
        this.talkT = Math.max(0, this.talkT - dt);
        const open = this.talkT > 0 ? (Math.sin(performance.now() / 70) * 0.5 + 0.5) * 0.5 : 0;
        for (const m of morphMeshes) {
          const i = m.morphTargetDictionary.mouthOpen;
          m.morphTargetInfluences[i] += (open - m.morphTargetInfluences[i]) * Math.min(1, dt * 18);
        }
      }
    },
  };
  return ch;
}
function heightOf(base) { return { michelle: 1.66, avatar: 1.76, xbot: 1.72 }[base]; }

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
