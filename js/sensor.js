// Sensor de Resonance.
// Modo "mic": mede o ambiente REAL do jogador (volume RMS, picos), sempre relativo ao baseline calibrado.
// Modo "standard": um medidor interno de calma, controlado por ações no jogo.
// Os dois modos alimentam a mesma máquina de estados (com buffer anti-oscilação).

import { Audio, ensureAudio } from './audio.js';

const ENTER_DELAY = 2.0;   // segundos de silêncio relativo para entrar na Resonance
const EXIT_DELAY = 1.6;    // segundos de ruído relativo para sair dela
const NOISE_STATE_DELAY = 0.5;

export const Sensor = {
  mode: 'standard',
  available: false,
  stream: null,
  analyser: null,
  buf: null,
  // medições (dB)
  levelDb: -90,
  slowDb: -90,
  peakDb: -90,
  baseline: -60,
  spread: 3,
  threshold: -52,
  peakThreshold: -40,
  absThreshold: -58,
  sensitivity: 1,
  calibrated: false,
  // modo standard
  calm: 0.4,
  // estado
  state: 'neutral',   // 'neutral' | 'silence' | 'noise'
  quietT: 0,
  noisyT: 0,
  noisy: false,        // ruído relativo agora (sem buffer)
  silentNow: false,    // silêncio relativo agora (sem buffer)
  R: 0,                // intensidade visual/sonora da Resonance (0..1)
  agitation: 0,        // quanto acima do limiar (0..1+) — usado por ameaças
  peakCd: 0,
  listeners: new Set(),
  history: { silent: 0, noisy: 0 },
};

export function onPeak(fn) { Sensor.listeners.add(fn); return () => Sensor.listeners.delete(fn); }
function emitPeak(strength) { for (const fn of [...Sensor.listeners]) fn(strength); }

export async function enableMic() {
  const ctx = ensureAudio();
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) throw new Error('sem suporte a microfone');
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: { echoCancellation: true, noiseSuppression: false, autoGainControl: false },
  });
  Sensor.stream = stream;
  const src = ctx.createMediaStreamSource(stream);
  const an = ctx.createAnalyser();
  an.fftSize = 1024;
  an.smoothingTimeConstant = 0;
  src.connect(an); // não conectado à saída: o som real nunca é reproduzido
  Sensor.analyser = an;
  Sensor.buf = new Float32Array(an.fftSize);
  Sensor.available = true;
  Sensor.mode = 'mic';
}

export function disableMic() {
  if (Sensor.stream) Sensor.stream.getTracks().forEach((t) => t.stop());
  Sensor.stream = null;
  Sensor.analyser = null;
  Sensor.available = false;
  Sensor.calibrated = false;
  Sensor.mode = 'standard';
}

function sampleMic() {
  const an = Sensor.analyser;
  if (!an) return;
  an.getFloatTimeDomainData(Sensor.buf);
  let sum = 0, pk = 0;
  for (let i = 0; i < Sensor.buf.length; i++) {
    const v = Sensor.buf[i];
    sum += v * v;
    const a = v < 0 ? -v : v;
    if (a > pk) pk = a;
  }
  const rms = Math.sqrt(sum / Sensor.buf.length);
  const db = 20 * Math.log10(rms + 1e-7);
  Sensor.peakDb = 20 * Math.log10(pk + 1e-7);
  // ataque rápido, soltura lenta
  const k = db > Sensor.levelDb ? 0.5 : 0.08;
  Sensor.levelDb += (db - Sensor.levelDb) * k;
  Sensor.slowDb += (db - Sensor.slowDb) * 0.02;
  return db;
}

// Calibração: mede o ambiente por `seconds` e define limiares pessoais.
export function calibrate(seconds, onTick) {
  return new Promise((resolve) => {
    const samples = [];
    const t0 = performance.now();
    function step() {
      const db = sampleMic();
      if (db !== undefined && isFinite(db)) samples.push(db);
      const el = (performance.now() - t0) / 1000;
      if (onTick) onTick(el / seconds, Sensor.levelDb);
      if (el < seconds) { requestAnimationFrame(step); return; }
      samples.sort((a, b) => a - b);
      const q = (p) => samples[Math.min(samples.length - 1, Math.floor(p * samples.length))] ?? -60;
      Sensor.baseline = q(0.5);
      Sensor.spread = Math.max(1, q(0.9) - q(0.5));
      Sensor.slowDb = Sensor.baseline;
      Sensor.levelDb = Sensor.baseline;
      Sensor.calibrated = true;
      applyThresholds();
      resolve({ baseline: Sensor.baseline, spread: Sensor.spread });
    }
    step();
  });
}

export function applyThresholds() {
  const s = Sensor.sensitivity;
  const margin = Math.min(18, Math.max(4.5, Sensor.spread * 1.4 + 3.5)) / s;
  Sensor.threshold = Sensor.baseline + margin;
  Sensor.peakThreshold = Sensor.baseline + Math.max(margin + 9, 15 / s);
  Sensor.absThreshold = Sensor.baseline + Math.max(0.8, margin * 0.35);
}

// Ação "Barulho" do modo Standard (substitui palma/voz)
export function virtualClap() {
  Sensor.calm = Math.min(Sensor.calm, 0.1);
  Sensor.noisyT = EXIT_DELAY;
  emitPeak(1);
}

// ctx: { speed, sprinting, crouch, frozen }
export function updateSensor(dt, ctx) {
  Sensor.peakCd -= dt;
  if (Sensor.mode === 'mic' && Sensor.analyser) {
    sampleMic();
    Sensor.noisy = Sensor.levelDb > Sensor.threshold;
    Sensor.silentNow = !Sensor.noisy;
    Sensor.agitation = Math.max(0, (Sensor.levelDb - Sensor.threshold) / 12);
    if (Sensor.peakDb > Sensor.peakThreshold + 6 && Sensor.levelDb > Sensor.threshold && Sensor.peakCd <= 0) {
      Sensor.peakCd = 0.35;
      emitPeak(Math.min(2, (Sensor.levelDb - Sensor.threshold) / 10 + 0.5));
    }
  } else {
    // medidor de calma
    const still = ctx.speed < 0.15 && !ctx.frozen;
    if (ctx.frozen) Sensor.calm += dt * 0.05; // em diálogo a calma sobe devagar
    else if (still) Sensor.calm += dt * (ctx.crouch ? 0.32 : 0.2);
    else if (ctx.sprinting) Sensor.calm -= dt * 0.7;
    else if (ctx.speed > 3) Sensor.calm -= dt * 0.12;
    else Sensor.calm -= dt * 0.03;
    Sensor.calm = Math.max(0, Math.min(1, Sensor.calm));
    Sensor.silentNow = Sensor.calm > 0.8;
    Sensor.noisy = Sensor.calm < 0.3 || ctx.sprinting;
    Sensor.agitation = ctx.sprinting ? 1 : Math.max(0, (0.3 - Sensor.calm) * 2);
  }

  // máquina de estados com buffer
  if (Sensor.silentNow) { Sensor.quietT += dt; Sensor.noisyT = Math.max(0, Sensor.noisyT - dt * 2); }
  else if (Sensor.noisy) { Sensor.noisyT += dt; Sensor.quietT = Math.max(0, Sensor.quietT - dt * 3); }
  else { Sensor.quietT = Math.max(0, Sensor.quietT - dt); Sensor.noisyT = Math.max(0, Sensor.noisyT - dt); }

  const prev = Sensor.state;
  if (Sensor.state !== 'silence' && Sensor.quietT >= ENTER_DELAY) Sensor.state = 'silence';
  else if (Sensor.state === 'silence' && Sensor.noisyT >= EXIT_DELAY) Sensor.state = 'noise';
  else if (Sensor.state === 'neutral' && Sensor.noisyT >= NOISE_STATE_DELAY) Sensor.state = 'noise';
  else if (Sensor.state === 'noise' && Sensor.noisyT === 0 && !Sensor.noisy) Sensor.state = 'neutral';

  const target = Sensor.state === 'silence' ? 1 : 0;
  const rate = target > Sensor.R ? 0.7 : 1.4;
  Sensor.R += Math.sign(target - Sensor.R) * Math.min(Math.abs(target - Sensor.R), rate * dt);

  if (Sensor.state === 'silence') Sensor.history.silent += dt;
  if (Sensor.noisy) Sensor.history.noisy += dt;
  return prev !== Sensor.state ? Sensor.state : null;
}

// Silêncio absoluto (mais estrito que o limiar normal) — usado por puzzles
export function isAbsoluteSilence(ctx) {
  if (Sensor.mode === 'mic') return Sensor.levelDb < Sensor.absThreshold;
  return Sensor.calm > 0.97 && ctx.crouch && ctx.speed < 0.1;
}

// Valor 0..1 para a barra do HUD e posição do marcador de limiar
export function meterValues() {
  if (Sensor.mode === 'mic') {
    const lo = Sensor.baseline - 6, hi = Sensor.threshold + 14;
    const v = (Sensor.levelDb - lo) / (hi - lo);
    const th = (Sensor.threshold - lo) / (hi - lo);
    return { v: Math.max(0, Math.min(1, v)), th, over: Sensor.noisy };
  }
  return { v: 1 - Sensor.calm, th: 0.2, over: Sensor.noisy };
}

export const RES_ENTER_DELAY = ENTER_DELAY;
export { Audio };
