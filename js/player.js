// Jogador + câmera third-person livre + entrada (toque, teclado/mouse, giroscópio)
import { THREE, scene, camera, world, renderer, isTouch, clamp, lerp, angleDiff, resolveCollisions } from './engine.js';
import { makeCharacter } from './assets.js';
import { sfx } from './audio.js';

export const settings = {
  micMode: null, sensitivity: 1, camSens: 1, invertY: false, gyro: false, subtitles: true, subSize: 1, swap: false,
};

export const player = {
  pos: new THREE.Vector3(),
  facing: 0,
  speed: 0,
  sprinting: false,
  crouch: false,
  crouchT: 0,
  phase: 0,
  walkAmt: 0,
  stepT: 0,
  frozen: false,
  model: null,
  movedDist: 0,
  sprintTime: 0,
};

// Ari: avatar com casaco escuro (criado depois que os modelos carregam)
export function initPlayerModel() {
  player.model = makeCharacter('avatar', {
    height: 1.76,
    tint: { Wolf3D_Outfit_Top: 0x4a5866, Wolf3D_Outfit_Bottom: 0x2e3440, Wolf3D_Outfit_Footwear: 0x3a3a3a, Wolf3D_Headwear: 0x2a2a30 },
    hide: ['Wolf3D_Beard'],
  });
  scene.add(player.model.root);
}

export const cam = { yaw: 0, pitch: -0.15, maxDist: 3.4, dist: 3.4, lookTotal: 0 };

export const input = {
  f: 0, b: 0, l: 0, r: 0, joyX: 0, joyY: 0,
  sprintKey: false, sprintToggle: false,
  interact: false, noise: false, tap: null,
};

// ---------------------------------------------------------------------
//  Teclado / mouse
const canvas = renderer.domElement;
export let pointerLocked = false;
export const hooks = { onPause: null, onDiary: null, isPlaying: () => false };
export function requestLock() {
  if (isTouch) return;
  try { const p = canvas.requestPointerLock(); if (p && p.catch) p.catch(() => {}); } catch (e) { /* sem suporte */ }
}
export function releaseLock() { if (document.pointerLockElement) document.exitPointerLock(); }
document.addEventListener('pointerlockchange', () => { pointerLocked = document.pointerLockElement === canvas; });
canvas.addEventListener('mousedown', () => { if (!isTouch && hooks.isPlaying() && !pointerLocked) requestLock(); });
let lockedAt = 0;
document.addEventListener('pointerlockchange', () => { lockedAt = performance.now(); });
window.addEventListener('mousemove', (e) => {
  if (!pointerLocked || !hooks.isPlaying()) return;
  // o navegador às vezes manda um salto enorme logo ao travar o mouse
  if (performance.now() - lockedAt < 120 || Math.abs(e.movementX) > 250 || Math.abs(e.movementY) > 250) return;
  look(e.movementX * 0.0022, e.movementY * 0.0022);
});
const keyMap = { KeyW: 'f', ArrowUp: 'f', KeyS: 'b', ArrowDown: 'b', KeyA: 'l', ArrowLeft: 'l', KeyD: 'r', ArrowRight: 'r' };
window.addEventListener('keydown', (e) => {
  if (keyMap[e.code]) input[keyMap[e.code]] = 1;
  if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') input.sprintKey = true;
  if (e.code === 'KeyE' || e.code === 'Enter' || e.code === 'Space') input.interact = true;
  if (e.code === 'KeyC' || e.code === 'ControlLeft') player.crouch = !player.crouch;
  if (e.code === 'KeyF') input.noise = true;
  if (e.code === 'Tab') { e.preventDefault(); hooks.onDiary && hooks.onDiary(); }
  if (e.code === 'Escape' || e.code === 'KeyP') hooks.onPause && hooks.onPause();
});
window.addEventListener('keyup', (e) => {
  if (keyMap[e.code]) input[keyMap[e.code]] = 0;
  if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') input.sprintKey = false;
});
window.addEventListener('blur', () => { input.f = input.b = input.l = input.r = 0; input.sprintKey = false; });

export function look(dx, dy) {
  const s = settings.camSens;
  cam.yaw -= dx * s;
  cam.pitch = clamp(cam.pitch - dy * s * (settings.invertY ? -1 : 1), -1.15, 0.9);
  cam.lookTotal += Math.abs(dx * s) + Math.abs(dy * s);
}

// ---------------------------------------------------------------------
//  Toque: analógico (esquerda), arrastar para olhar (direita), botões
const joy = { id: null, cx: 0, cy: 0, r: 56 };
const lookTouches = new Map();
const joyBase = document.getElementById('joyBase');
const joyKnob = document.getElementById('joyKnob');
function joyHome() {
  return settings.swap ? { x: window.innerWidth - 130, y: window.innerHeight - 110 } : { x: 130, y: window.innerHeight - 110 };
}
export function resetJoy() {
  const h = joyHome();
  joyBase.style.left = h.x + 'px';
  joyBase.style.top = h.y + 'px';
  joyKnob.style.transform = '';
  input.joyX = input.joyY = 0;
  joy.id = null;
}
resetJoy();
window.addEventListener('resize', () => { if (joy.id === null) resetJoy(); });

function onStart(e) {
  if (!hooks.isPlaying()) return;
  for (const t of e.changedTouches) {
    const btn = t.target.closest ? t.target.closest('.tbtn') : null;
    if (btn) {
      const a = btn.dataset.act;
      if (a === 'interact') input.interact = true;
      else if (a === 'crouch') player.crouch = !player.crouch;
      else if (a === 'sprint') input.sprintToggle = !input.sprintToggle;
      else if (a === 'noise') input.noise = true;
      btn.classList.toggle('active', a === 'sprint' ? input.sprintToggle : a === 'crouch' ? player.crouch : false);
      continue;
    }
    const leftSide = settings.swap ? t.clientX > window.innerWidth * 0.58 : t.clientX < window.innerWidth * 0.42;
    if (leftSide && joy.id === null) {
      joy.id = t.identifier;
      joy.cx = t.clientX; joy.cy = t.clientY;
      joyBase.style.left = joy.cx + 'px';
      joyBase.style.top = joy.cy + 'px';
    } else {
      lookTouches.set(t.identifier, { x: t.clientX, y: t.clientY, sx: t.clientX, sy: t.clientY, t0: performance.now() });
    }
  }
  e.preventDefault();
}
function onMove(e) {
  if (!hooks.isPlaying()) return;
  let handled = false;
  for (const t of e.changedTouches) {
    if (t.identifier === joy.id || lookTouches.has(t.identifier)) handled = true;
    if (t.identifier === joy.id) {
      let dx = t.clientX - joy.cx, dy = t.clientY - joy.cy;
      const d = Math.hypot(dx, dy);
      if (d > joy.r) { dx *= joy.r / d; dy *= joy.r / d; }
      joyKnob.style.transform = `translate(${dx}px, ${dy}px)`;
      input.joyX = dx / joy.r;
      input.joyY = -dy / joy.r;
    } else if (lookTouches.has(t.identifier)) {
      const l = lookTouches.get(t.identifier);
      look((t.clientX - l.x) * 0.0055, (t.clientY - l.y) * 0.0055);
      l.x = t.clientX; l.y = t.clientY;
    }
  }
  if (handled) e.preventDefault();
}
function onEnd(e) {
  for (const t of e.changedTouches) {
    if (t.identifier === joy.id) resetJoy();
    const l = lookTouches.get(t.identifier);
    if (l) {
      // toque curto sem arrastar = tocar em objeto destacado
      if (performance.now() - l.t0 < 260 && Math.hypot(t.clientX - l.sx, t.clientY - l.sy) < 12) input.tap = { x: t.clientX, y: t.clientY };
      lookTouches.delete(t.identifier);
    }
  }
}
if (isTouch) {
  document.body.classList.add('touch');
  canvas.addEventListener('touchstart', onStart, { passive: false });
  document.getElementById('touchUI').addEventListener('touchstart', onStart, { passive: false });
  window.addEventListener('touchmove', onMove, { passive: false });
  window.addEventListener('touchend', onEnd);
  window.addEventListener('touchcancel', onEnd);
}

// ---------------------------------------------------------------------
//  Giroscópio (opcional, ajuste fino)
let gyroOn = false;
function onMotion(e) {
  if (!settings.gyro || !hooks.isPlaying() || !e.rotationRate) return;
  const ang = (screen.orientation && screen.orientation.angle) || window.orientation || 0;
  const s = ang === 270 || ang === -90 ? -1 : 1;
  const dt = (e.interval || 16) / 1000;
  const toRad = Math.PI / 180;
  const yawRate = (e.rotationRate.beta || 0) * s;
  const pitchRate = (e.rotationRate.gamma || 0) * -s;
  look(-yawRate * toRad * dt * 0.9, -pitchRate * toRad * dt * 0.9);
}
export function enableGyro() {
  if (gyroOn) return;
  gyroOn = true;
  const req = window.DeviceMotionEvent && DeviceMotionEvent.requestPermission;
  if (req) req().catch(() => {});
  window.addEventListener('devicemotion', onMotion);
}

// ---------------------------------------------------------------------
export function moveInput() {
  return {
    x: clamp(input.r - input.l + input.joyX, -1, 1),
    y: clamp(input.f - input.b + input.joyY, -1, 1),
  };
}

const camRay = new THREE.Raycaster();
const tmpA = new THREE.Vector3(), tmpB = new THREE.Vector3(), tmpC = new THREE.Vector3();

export function updatePlayer(dt) {
  const mv = player.frozen ? { x: 0, y: 0 } : moveInput();
  const mlen = Math.min(1, Math.hypot(mv.x, mv.y));
  const fx = -Math.sin(cam.yaw), fz = -Math.cos(cam.yaw);
  const rx = Math.cos(cam.yaw), rz = -Math.sin(cam.yaw);
  let wx = fx * mv.y + rx * mv.x, wz = fz * mv.y + rz * mv.x;
  const wl = Math.hypot(wx, wz);
  if (wl > 0.001) { wx /= wl; wz /= wl; }
  const wantSprint = (input.sprintKey || input.sprintToggle) && mlen > 0.3;
  if (wantSprint && player.crouch) player.crouch = false;
  player.sprinting = wantSprint && !player.frozen;
  const speed = mlen * (player.sprinting ? 5.2 : player.crouch ? 1.3 : 2.4);
  player.speed = speed;
  const before = tmpA.copy(player.pos);
  player.pos.x += wx * speed * dt;
  player.pos.z += wz * speed * dt;
  resolveCollisions(player.pos, 0.32, 0);
  player.movedDist += before.distanceTo(player.pos);
  if (player.sprinting) player.sprintTime += dt;

  if (speed > 0.1) player.facing += angleDiff(player.facing, Math.atan2(wx, wz)) * Math.min(1, dt * 10);
  player.walkAmt = lerp(player.walkAmt, Math.min(1, speed / 3), Math.min(1, dt * 8));
  player.phase += speed * dt * 2.4;
  player.stepT -= speed * dt;
  if (player.stepT <= 0 && speed > 0.4) { player.stepT = player.sprinting ? 1.6 : 1.3; sfx.step(player.crouch); }
  player.crouchT = lerp(player.crouchT, player.crouch ? 1 : 0, Math.min(1, dt * 10));
  const m = player.model;
  m.root.position.copy(player.pos);
  m.root.rotation.y = player.facing;
  m.locomote(speed, player.crouchT, dt);
  m.update(dt);
}

export function updateCamera(dt, shake = 0) {
  const h = lerp(1.6, 1.15, player.crouchT);
  const pivot = tmpA.set(player.pos.x, player.pos.y + h, player.pos.z);
  const cp = Math.cos(cam.pitch);
  const dir = tmpB.set(-Math.sin(cam.yaw) * cp, Math.sin(cam.pitch), -Math.cos(cam.yaw) * cp);
  const right = tmpC.set(Math.cos(cam.yaw), 0, -Math.sin(cam.yaw));
  const shoulder = pivot.clone().addScaledVector(right, 0.45);
  const back = dir.clone().negate();
  camRay.set(shoulder, back);
  camRay.far = cam.maxDist + 0.3;
  const hits = camRay.intersectObjects(world.solids, false);
  let d = cam.maxDist;
  if (hits.length) d = Math.max(0.35, hits[0].distance - 0.25);
  cam.dist = d < cam.dist ? d : lerp(cam.dist, d, Math.min(1, dt * 4));
  const pos = shoulder.addScaledVector(back, cam.dist);
  if (pos.y < 0.2) pos.y = 0.2;
  if (shake > 0) { pos.x += (Math.random() - 0.5) * shake; pos.y += (Math.random() - 0.5) * shake; }
  camera.position.copy(pos);
  camera.lookAt(pos.clone().add(dir));
  camera.updateMatrixWorld();
  player.model.root.visible = cam.dist > 0.6;
}
