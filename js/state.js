// Estado da campanha, diário, inventário, relações e saves
import { toast } from './ui.js';
import { sfx } from './audio.js';
import { Sensor } from './sensor.js';

const AUTO_KEY = 'echoes_save_auto';
const MANUAL_KEY = 'echoes_save_manual';
const SETTINGS_KEY = 'echoes_settings';
export const MANUAL_SAVES = 3;

export function freshState() {
  return {
    version: 1,
    zone: 'apartment',
    act: 'prologue',
    flags: {},
    echoes: {},           // id -> true
    items: [],            // { id, name, desc }
    diary: [],            // { type:'echo'|'note', title, lines|text }
    people: {},           // id -> { id, name, notes[] }
    rel: {},              // id -> número
    stats: { silent: 0, noisy: 0, engulfed: 0, playTime: 0 },
    manualLeft: MANUAL_SAVES,
    checkpoint: null,     // { zone, x, z, yaw }
    savedAt: 0,
  };
}

export let S = freshState();
export function setState(s) { S = s; }

export const flag = (k) => !!S.flags[k];
export function setFlag(k, v = true) { S.flags[k] = v; }

export function addEcho(id, title, lines) {
  if (S.echoes[id]) return;
  S.echoes[id] = true;
  S.diary.push({ type: 'echo', title, lines });
  sfx.echoFound();
  toast('Eco registrado no diário: ' + title);
}
export function addNote(id, title, text) {
  if (S.diary.some((e) => e.id === id)) return;
  S.diary.push({ type: 'note', id, title, text });
  sfx.diary();
  toast('Diário: ' + title);
}
export function meet(id, name, note) {
  if (!S.people[id]) { S.people[id] = { id, name, notes: [] }; S.rel[id] = S.rel[id] || 0; }
  if (note && !S.people[id].notes.includes(note)) { S.people[id].notes.push(note); toast(`Diário · ${name}: nova anotação`); }
}
export function rel(id, delta) { S.rel[id] = (S.rel[id] || 0) + delta; }
export function addItem(id, name, desc) {
  if (S.items.some((i) => i.id === id)) return;
  S.items.push({ id, name, desc });
  sfx.diary();
  toast('Item: ' + name);
}
export const hasItem = (id) => S.items.some((i) => i.id === id);
export const echoCount = () => Object.keys(S.echoes).filter((k) => k.startsWith('a1_')).length;

// Proporção de silêncio x ruído ao longo da campanha (personalidade reativa)
export function silenceRatio() {
  const s = S.stats.silent + Sensor.history.silent, n = S.stats.noisy + Sensor.history.noisy;
  return s + n < 20 ? 0.5 : s / (s + n);
}
export function temperament() {
  const r = silenceRatio();
  return r > 0.6 ? 'calmo' : r < 0.35 ? 'inquieto' : 'neutro';
}

function snapshot(extra) {
  S.stats.silent += Sensor.history.silent;
  S.stats.noisy += Sensor.history.noisy;
  Sensor.history.silent = 0;
  Sensor.history.noisy = 0;
  Object.assign(S, extra || {});
  S.savedAt = Date.now();
  return JSON.stringify(S);
}

export function autoSave(checkpoint) {
  try { localStorage.setItem(AUTO_KEY, snapshot(checkpoint ? { checkpoint } : null)); } catch (e) { /* sem storage */ }
}
export function manualSave(checkpoint) {
  if (S.manualLeft <= 0) return false;
  S.manualLeft--;
  try {
    const data = snapshot({ checkpoint });
    localStorage.setItem(MANUAL_KEY, data);
    localStorage.setItem(AUTO_KEY, data);
  } catch (e) { return false; }
  return true;
}
export function latestSave() {
  let best = null;
  for (const k of [AUTO_KEY, MANUAL_KEY]) {
    try {
      const raw = localStorage.getItem(k);
      if (!raw) continue;
      const s = JSON.parse(raw);
      if (!best || s.savedAt > best.savedAt) best = s;
    } catch (e) { /* save corrompido */ }
  }
  return best;
}
export function clearSaves() {
  try { localStorage.removeItem(AUTO_KEY); localStorage.removeItem(MANUAL_KEY); } catch (e) { /* ignore */ }
}

export function loadSettings(settings) {
  try { Object.assign(settings, JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}')); } catch (e) { /* ignore */ }
}
export function saveSettings(settings) {
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); } catch (e) { /* ignore */ }
}
