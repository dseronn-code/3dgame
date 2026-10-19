// Mixer do jogo: barramento do mundo, barramento da Resonance (direcional) e UI.
// O áudio do microfone NUNCA é tocado nem misturado aqui: ele só é analisado em sensor.js.

export const Audio = {
  ctx: null,
  master: null,
  world: null,      // sons do mundo "normal" (some na Resonance)
  res: null,        // sons da camada oculta (aparecem na Resonance)
  ui: null,
  noiseBuf: null,
  reverb: null,
  ambient: null,
  listenerPos: { x: 0, y: 0, z: 0 },
};

export function ensureAudio() {
  if (Audio.ctx) {
    if (Audio.ctx.state === 'suspended') Audio.ctx.resume();
    return Audio.ctx;
  }
  const ctx = new (window.AudioContext || window.webkitAudioContext)();
  Audio.ctx = ctx;
  Audio.master = ctx.createGain();
  Audio.master.gain.value = 0.7;
  Audio.master.connect(ctx.destination);
  for (const k of ['world', 'res', 'ui']) {
    Audio[k] = ctx.createGain();
    Audio[k].connect(Audio.master);
  }
  Audio.res.gain.value = 0;
  // ruído base
  const len = ctx.sampleRate * 2;
  Audio.noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = Audio.noiseBuf.getChannelData(0);
  let last = 0;
  for (let i = 0; i < len; i++) { const w = Math.random() * 2 - 1; last = (last + 0.02 * w) / 1.02; d[i] = last * 3.5; }
  // reverb simples (eco) para vozes da Resonance
  const delay = ctx.createDelay(1.0);
  delay.delayTime.value = 0.23;
  const fb = ctx.createGain();
  fb.gain.value = 0.38;
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 2200;
  delay.connect(lp); lp.connect(fb); fb.connect(delay);
  delay.connect(Audio.res);
  Audio.reverb = delay;
  startDrone();
  return ctx;
}

function startDrone() {
  const ctx = Audio.ctx;
  const g = ctx.createGain();
  g.gain.value = 0.05;
  g.connect(Audio.res);
  for (const f of [110, 110.7, 164.8, 220.4]) {
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.value = f;
    const og = ctx.createGain();
    og.gain.value = f > 200 ? 0.25 : 0.5;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.05 + Math.random() * 0.1;
    const lg = ctx.createGain();
    lg.gain.value = 0.25;
    lfo.connect(lg); lg.connect(og.gain);
    o.connect(og); og.connect(g);
    o.start(); lfo.start();
  }
}

// Ambiente do mundo (zona): ruído filtrado em loop + zumbido opcional
export function setAmbient(kind) {
  const ctx = Audio.ctx;
  if (!ctx) return;
  if (Audio.ambient) {
    const old = Audio.ambient;
    old.gain.gain.setTargetAtTime(0, ctx.currentTime, 0.4);
    setTimeout(() => old.nodes.forEach((n) => { try { n.stop(); } catch (e) { /* já parou */ } }), 2000);
  }
  const gain = ctx.createGain();
  gain.gain.value = 0;
  gain.connect(Audio.world);
  const nodes = [];
  const src = ctx.createBufferSource();
  src.buffer = Audio.noiseBuf;
  src.loop = true;
  const f = ctx.createBiquadFilter();
  f.type = 'lowpass';
  f.frequency.value = kind === 'city' ? 600 : 250;
  const sg = ctx.createGain();
  sg.gain.value = kind === 'city' ? 0.22 : 0.08;
  src.connect(f); f.connect(sg); sg.connect(gain);
  src.start();
  nodes.push(src);
  if (kind === 'apartment') {
    const hum = ctx.createOscillator();
    hum.type = 'sawtooth';
    hum.frequency.value = 60;
    const hf = ctx.createBiquadFilter();
    hf.type = 'lowpass'; hf.frequency.value = 180;
    const hg = ctx.createGain();
    hg.gain.value = 0.012;
    hum.connect(hf); hf.connect(hg); hg.connect(gain);
    hum.start();
    nodes.push(hum);
  }
  gain.gain.setTargetAtTime(1, ctx.currentTime, 1.0);
  Audio.ambient = { gain, nodes };
}

// Mistura entre camadas: R = intensidade da Resonance (0..1)
export function mixResonance(R) {
  if (!Audio.ctx) return;
  const t = Audio.ctx.currentTime;
  Audio.world.gain.setTargetAtTime(1 - 0.75 * R, t, 0.15);
  Audio.res.gain.setTargetAtTime(R, t, 0.15);
}

export function setListener(pos, fwd) {
  const ctx = Audio.ctx;
  if (!ctx) return;
  const L = ctx.listener;
  Audio.listenerPos = pos;
  if (L.positionX) {
    const t = ctx.currentTime;
    L.positionX.setTargetAtTime(pos.x, t, 0.03); L.positionY.setTargetAtTime(pos.y, t, 0.03); L.positionZ.setTargetAtTime(pos.z, t, 0.03);
    L.forwardX.setTargetAtTime(fwd.x, t, 0.03); L.forwardY.setTargetAtTime(fwd.y, t, 0.03); L.forwardZ.setTargetAtTime(fwd.z, t, 0.03);
    L.upX.value = 0; L.upY.value = 1; L.upZ.value = 0;
  } else if (L.setPosition) {
    L.setPosition(pos.x, pos.y, pos.z);
    L.setOrientation(fwd.x, fwd.y, fwd.z, 0, 1, 0);
  }
}

// Fonte posicional (HRTF) ligada a um barramento
export function makePanner(pos, bus = 'res', refDist = 2, maxDist = 40) {
  const ctx = Audio.ctx;
  if (!ctx) return null;
  const p = ctx.createPanner();
  p.panningModel = 'HRTF';
  p.distanceModel = 'inverse';
  p.refDistance = refDist;
  p.maxDistance = maxDist;
  p.rolloffFactor = 1.3;
  setPannerPos(p, pos);
  p.connect(Audio[bus]);
  if (bus === 'res') p.connect(Audio.reverb);
  return p;
}
export function setPannerPos(p, pos) {
  if (!p) return;
  if (p.positionX) { p.positionX.value = pos.x; p.positionY.value = pos.y; p.positionZ.value = pos.z; }
  else p.setPosition(pos.x, pos.y, pos.z);
}

// Voz sintetizada (murmúrio com formantes) — dá corpo às falas legendadas
export function voice(text, opts = {}) {
  const ctx = Audio.ctx;
  if (!ctx) return 1.5;
  const dur = Math.max(1.4, Math.min(6, text.length * 0.055));
  const out = opts.panner || (opts.bus ? Audio[opts.bus] : Audio.ui);
  const base = opts.pitch || 190;
  const vol = opts.vol ?? 0.09;
  const syl = Math.max(3, Math.round(text.length / 4.5));
  let t = ctx.currentTime + 0.05;
  const step = dur / syl;
  for (let i = 0; i < syl; i++) {
    if (Math.random() < 0.12) { t += step; continue; }
    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    const f0 = base * (0.85 + Math.random() * 0.35) * (1 - (i / syl) * 0.12);
    o.frequency.setValueAtTime(f0, t);
    o.frequency.linearRampToValueAtTime(f0 * (0.9 + Math.random() * 0.2), t + step);
    const f1 = ctx.createBiquadFilter();
    f1.type = 'bandpass'; f1.frequency.value = 500 + Math.random() * 400; f1.Q.value = 4;
    const f2 = ctx.createBiquadFilter();
    f2.type = 'bandpass'; f2.frequency.value = 1300 + Math.random() * 900; f2.Q.value = 5;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + step * 0.25);
    g.gain.exponentialRampToValueAtTime(0.0001, t + step * 0.95);
    o.connect(f1); o.connect(f2); f1.connect(g); f2.connect(g); g.connect(out);
    o.start(t); o.stop(t + step);
    t += step;
  }
  return dur;
}

function env(node, t, a, peak, d) {
  node.gain.setValueAtTime(0.0001, t);
  node.gain.exponentialRampToValueAtTime(peak, t + a);
  node.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
}
export function tone(f, dur = 0.3, { type = 'sine', vol = 0.1, bus = 'ui', delay = 0, f2 = null, out = null } = {}) {
  const ctx = Audio.ctx;
  if (!ctx) return;
  const t = ctx.currentTime + delay;
  const o = ctx.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(f, t);
  if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + dur);
  const g = ctx.createGain();
  env(g, t, 0.01, vol, dur);
  o.connect(g); g.connect(out || Audio[bus]);
  o.start(t); o.stop(t + dur + 0.05);
}
export function noise(dur = 0.2, { freq = 1000, type = 'bandpass', q = 1, vol = 0.15, bus = 'ui', out = null, delay = 0 } = {}) {
  const ctx = Audio.ctx;
  if (!ctx) return;
  const t = ctx.currentTime + delay;
  const s = ctx.createBufferSource();
  s.buffer = Audio.noiseBuf;
  const f = ctx.createBiquadFilter();
  f.type = type; f.frequency.value = freq; f.Q.value = q;
  const g = ctx.createGain();
  env(g, t, 0.005, vol, dur);
  s.connect(f); f.connect(g); g.connect(out || Audio[bus]);
  s.start(t, Math.random(), dur + 0.1);
}

export const sfx = {
  step(soft) { noise(0.06, { freq: soft ? 500 : 900, vol: soft ? 0.025 : 0.05, bus: 'world' }); },
  door() { noise(0.9, { freq: 300, q: 3, vol: 0.12, bus: 'world' }); tone(90, 0.6, { type: 'triangle', vol: 0.06, bus: 'world' }); },
  locked() { noise(0.12, { freq: 1500, vol: 0.12, bus: 'world' }); noise(0.12, { freq: 1500, vol: 0.12, bus: 'world', delay: 0.15 }); },
  echoFound() { [523, 659, 784, 1046].forEach((f, i) => tone(f, 1.2, { vol: 0.06, delay: i * 0.12, bus: 'ui' })); },
  reveal() { tone(220, 2.5, { vol: 0.06, f2: 440, bus: 'res' }); tone(330, 2.5, { vol: 0.04, f2: 660, bus: 'res', delay: 0.3 }); },
  enterRes() { tone(880, 1.4, { vol: 0.03, f2: 660, bus: 'res' }); },
  clap() { noise(0.08, { freq: 2500, q: 0.7, vol: 0.4, bus: 'ui' }); },
  diary() { tone(660, 0.15, { type: 'triangle', vol: 0.05 }); tone(990, 0.2, { type: 'triangle', vol: 0.04, delay: 0.08 }); },
  musicNote(i) { const f = [523, 587, 659, 784, 880, 1046][i % 6]; tone(f, 0.6, { type: 'triangle', vol: 0.09, bus: 'world' }); tone(f * 2, 0.4, { vol: 0.03, bus: 'world' }); },
  musicRest() { tone(196, 0.25, { vol: 0.02, bus: 'world' }); },
  fail() { tone(220, 0.4, { type: 'square', vol: 0.05, f2: 110 }); },
  success() { [392, 523, 659, 784].forEach((f, i) => tone(f, 0.5, { type: 'triangle', vol: 0.07, delay: i * 0.1 })); },
  staticBurst(out) { noise(0.35, { freq: 1800 + Math.random() * 1500, q: 2, vol: 0.12, out }); },
  engulf() { noise(1.4, { freq: 900, q: 0.5, vol: 0.35 }); tone(80, 1.2, { type: 'sawtooth', vol: 0.08, f2: 40 }); },
  gate() { noise(2.0, { freq: 200, q: 2, vol: 0.25, bus: 'world' }); tone(55, 2, { type: 'sawtooth', vol: 0.07, bus: 'world' }); },
  flicker() { noise(0.05, { freq: 4000, vol: 0.05, bus: 'world' }); },
  radio(out) { noise(0.6, { freq: 1200 + Math.random() * 2000, q: 6, vol: 0.05, out }); },
};
