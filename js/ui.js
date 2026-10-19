// Interface: diálogo, escolhas, legendas, avisos, objetivo, diário, fade
import { voice, sfx } from './audio.js';
import { settings, releaseLock, requestLock } from './player.js';

export const $ = (id) => document.getElementById(id);

export const UI = { dialogOpen: false, advance: null, lastClose: 0 };

// ---------- Fade ----------
export function fade(to, ms = 800) {
  const f = $('fade');
  f.style.transition = `opacity ${ms}ms`;
  f.style.opacity = to;
  return new Promise((r) => setTimeout(r, ms));
}

// ---------- Objetivo e avisos ----------
export function setObjective(text) { $('objective').textContent = text || ''; }
export function toast(text) {
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = text;
  $('toasts').appendChild(el);
  setTimeout(() => el.remove(), 4100);
}

// ---------- Legendas (não bloqueiam) ----------
// kind: '' | 'echo' | 'thought' | 'static'
export function subtitle(who, text, dur = 3.5, kind = '') {
  if (!settings.subtitles && kind !== 'thought') return;
  const el = document.createElement('div');
  el.className = 'sub ' + kind;
  el.innerHTML = (who ? `<b>${who}</b>` : '') + escapeHtml(text);
  const box = $('subtitles');
  box.appendChild(el);
  while (box.children.length > 3) box.firstChild.remove();
  setTimeout(() => el.remove(), dur * 1000);
}
function escapeHtml(s) { return s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c])); }

// ---------- Diálogo (bloqueia o jogador) ----------
// lines: [{ who, text, res, pitch, panner }]
export async function say(lines) {
  UI.dialogOpen = true;
  const d = $('dialog');
  d.classList.remove('hidden');
  $('dlgChoices').innerHTML = '';
  $('dlgNext').classList.remove('hidden');
  for (const ln of lines) {
    d.classList.toggle('res', !!ln.res);
    $('dlgWho').textContent = ln.who || '';
    $('dlgText').textContent = ln.text;
    if (ln.who && ln.voice !== false) voice(ln.text, { pitch: ln.pitch || 180, bus: ln.res ? 'res' : 'ui', panner: ln.panner, vol: ln.res ? 0.07 : 0.06 });
    await waitAdvance(Math.min(900, 250 + ln.text.length * 8));
  }
  d.classList.add('hidden');
  UI.dialogOpen = false;
  UI.lastClose = performance.now();
}

export async function choose(who, text, options, res = false) {
  UI.dialogOpen = true;
  const d = $('dialog');
  d.classList.remove('hidden');
  d.classList.toggle('res', res);
  $('dlgWho').textContent = who || '';
  $('dlgText').textContent = text;
  $('dlgNext').classList.add('hidden');
  releaseLock(); // escolhas precisam do cursor livre
  const box = $('dlgChoices');
  box.innerHTML = '';
  const idx = await new Promise((resolve) => {
    options.forEach((o, i) => {
      if (o.hidden) return;
      const b = document.createElement('button');
      b.innerHTML = escapeHtml(o.text) + (o.note ? `<span class="req">${escapeHtml(o.note)}</span>` : '');
      b.addEventListener('click', (e) => { e.stopPropagation(); sfx.diary(); resolve(i); });
      box.appendChild(b);
    });
  });
  box.innerHTML = '';
  d.classList.add('hidden');
  UI.dialogOpen = false;
  UI.lastClose = performance.now();
  requestLock();
  return idx;
}

function waitAdvance(minMs) {
  return new Promise((resolve) => {
    const t0 = performance.now();
    UI.advance = () => {
      if (performance.now() - t0 < minMs) return;
      UI.advance = null;
      resolve();
    };
  });
}
$('dialog').addEventListener('click', () => UI.advance && UI.advance());
// com o mouse travado (pointer lock), o clique vai para o canvas
document.getElementById('game').addEventListener('mousedown', () => UI.advance && UI.advance());
window.addEventListener('keydown', (e) => {
  if ((e.code === 'Space' || e.code === 'Enter' || e.code === 'KeyE') && UI.advance) UI.advance();
});

// ---------- Diário ----------
export function renderDiary(S, tab) {
  document.querySelectorAll('#diaryTabs button').forEach((b) => b.classList.toggle('on', b.dataset.tab === tab));
  const body = $('diaryBody');
  const list = (arr, fn) => (arr.length ? arr.map(fn).join('') : '<div class="empty">Nada registrado ainda.</div>');
  if (tab === 'echoes') {
    body.innerHTML = list(S.diary.filter((e) => e.type === 'echo'), (e) =>
      `<div class="entry echo"><h4>${e.title}</h4>${e.lines.map((l) => `<span class="q">“${l}”</span>`).join('')}</div>`);
  } else if (tab === 'people') {
    const people = Object.values(S.people);
    body.innerHTML = list(people, (p) =>
      `<div class="entry"><h4>${p.name} · ${relLabel(S.rel[p.id] || 0)}</h4>${p.notes.map((n) => `<div>• ${n}</div>`).join('')}</div>`);
  } else if (tab === 'notes') {
    body.innerHTML = list(S.diary.filter((e) => e.type === 'note').slice().reverse(), (e) => `<div class="entry"><h4>${e.title}</h4><div>${e.text}</div></div>`);
  } else {
    body.innerHTML = list(S.items, (it) => `<div class="entry"><h4>${it.name}</h4><div>${it.desc}</div></div>`);
  }
}
function relLabel(v) {
  if (v >= 3) return 'confia em você';
  if (v >= 1) return 'próximo(a)';
  if (v <= -2) return 'desconfiado(a)';
  if (v < 0) return 'distante';
  return 'neutro';
}
