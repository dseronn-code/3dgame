import { THREE, renderer, scene, camera, moon, world, clearWorld, applyPalette, isTouch, lerp } from './engine.js';
import { loadAssets } from './assets.js';
import { setQuality, setupEnvironment, setBackground, mergeStatic, render } from './gfx.js';
import { Audio, ensureAudio, setAmbient, mixResonance, setListener, sfx } from './audio.js';
import { Sensor, enableMic, disableMic, calibrate, applyThresholds, updateSensor, virtualClap, onPeak, meterValues, RES_ENTER_DELAY } from './sensor.js';
import { player, cam, input, settings, hooks, updatePlayer, updateCamera, requestLock, releaseLock, resetJoy, enableGyro, initPlayerModel } from './player.js';
import { Z, resetZone, updateSystems, findInteractable, tapInteractable } from './systems.js';
import { S, setState, freshState, autoSave, manualSave, latestSave, loadSettings, saveSettings, temperament, echoCount, flag, MANUAL_SAVES } from './state.js';
import { $, UI, fade, subtitle, setObjective, toast, renderDiary } from './ui.js';
import * as apartment from './zones/apartment.js';
import * as hub from './zones/hub.js';

const ZONES = { apartment, hub };
const game = { state: 'title', transitioning: false, shake: 0, sessionReady: false, diaryTab: 'echoes', firstRes: false };

loadSettings(settings);
applySettings();

// ---------------------------------------------------------------------
//  Contexto que as zonas usam
const ctx = {
  thought(v, dur = 4.5) {
    const text = typeof v === 'string' ? v : v[temperament()] || v.neutro;
    subtitle('Ari', text, dur, 'thought');
  },
  goZone: (name, spawn) => goZone(name, spawn),
  save: () => autoSave(checkpoint()),
  engulf,
  endAct,
  refreshObjective: null,
};

function checkpoint() {
  return { checkpoint: { zone: Z.current, x: player.pos.x, z: player.pos.z, yaw: cam.yaw } }.checkpoint;
}

// ---------------------------------------------------------------------
//  Zonas (streaming: só uma zona carregada por vez)
let zoneInfo = null;
async function goZone(name, spawnKey, useCheckpoint = false) {
  if (game.transitioning) return;
  game.transitioning = true;
  await fade(1, 600);
  loadZone(name, useCheckpoint);
  ZONES[name].onEnter(ctx);
  autoSave(checkpoint());
  await fade(0, 900);
  game.transitioning = false;
}
function loadZone(name, useCheckpoint) {
  const mod = ZONES[name];
  resetZone();
  clearWorld();
  scene.add(player.model.root);
  Z.palette = mod.palette;
  Z.current = name;
  S.zone = name;
  S.act = name === 'apartment' ? 'prologue' : 'act1';
  zoneInfo = mod.build(ctx);
  mergeStatic(world.group);
  setBackground(mod.background);
  const cp = useCheckpoint && S.checkpoint && S.checkpoint.zone === name ? S.checkpoint : zoneInfo.spawn;
  player.pos.set(cp.x, 0, cp.z);
  cam.yaw = cp.yaw;
  cam.pitch = -0.12;
  player.facing = Math.atan2(-Math.sin(cam.yaw), -Math.cos(cam.yaw));
  cam.maxDist = zoneInfo.camMax;
  cam.dist = zoneInfo.camMax;
  setAmbient(mod.ambient);
  applyPalette(mod.palette, 0);
}

// ---------------------------------------------------------------------
//  A Estática te envolveu
async function engulf() {
  if (Z.busy) return;
  Z.busy = true;
  S.stats.engulfed++;
  sfx.engulf();
  game.shake = 0.4;
  $('glitch').style.opacity = 1;
  await fade(1, 500);
  const sp = zoneInfo.spawn;
  const safe = new THREE.Vector3(0, 0, 0);
  // volta para um ponto seguro: a praça, longe da Estática
  player.pos.set(safe.x + 2, 0, safe.z + 6.5);
  if (Z.threat) Z.threat.pushAway(24);
  Sensor.calm = 0.5;
  await fade(0, 900);
  ctx.thought({
    calmo: 'Tudo que ninguém escutou… gritando ao mesmo tempo. Preciso ficar quieto(a) perto dela.',
    inquieto: 'Era muito barulho. Barulho DEMAIS. Ok. Respira.',
    neutro: 'Ela me engoliu. Por um segundo eu ouvi mil conversas ao mesmo tempo.',
  });
  Z.busy = false;
  void sp;
}

// ---------------------------------------------------------------------
//  Fim do Ato 1 (fim da fatia jogável)
function endAct() {
  game.state = 'ended';
  releaseLock();
  autoSave(checkpoint());
  const n = echoCount();
  const s = S.stats.silent + Sensor.history.silent, no = S.stats.noisy + Sensor.history.noisy;
  const pct = s + no > 0 ? Math.round((s / (s + no)) * 100) : 50;
  const choiceText = { contou_tudo: 'Contou tudo à Iara. Ela vai descer com você.', mensagem: 'Mandou uma mensagem à Iara. Ela ainda não respondeu.', sozinho: 'Desceu sozinho(a).', otavio: 'Seu Otávio está na escuta pelo rádio.' }[S.flags.a1_choice] || '';
  $('aeSub').textContent = 'A Cidade que Lembra';
  $('aeStats').innerHTML = [
    ['Ecos da Lia', `${n}/3`],
    ['Ouviu a voz no prólogo', flag('voice_heard') ? 'Sim' : 'Não'],
    ['Segredo de Dona Celeste', flag('celeste_info') ? 'Ouvido' : 'Não ouvido'],
    ['Caixa da Lia', flag('box_open') ? 'Aberta' : 'Fechada'],
    ['Tempo em silêncio', `${pct}%`],
    ['Engolido(a) pela Estática', `${S.stats.engulfed}x`],
  ].map(([a, b]) => `<div><span>${a}</span><b>${b}</b></div>`).join('');
  $('aeText').innerHTML = `${choiceText}<br><br>O portão range e abre. O ar que sobe da escada é frio e tem um tom, uma única nota, sempre a mesma.<br><br><i>Continua no Ato 2 — O Subsolo (em desenvolvimento). Suas escolhas e seu histórico de silêncio ficam salvos.</i>`;
  $('hud').classList.add('hidden');
  $('touchUI').classList.add('hidden');
  $('actEnd').classList.remove('hidden');
}
$('aeBtn').addEventListener('click', () => toTitle());

// ---------------------------------------------------------------------
//  Sessão: permissão do microfone + calibração (obrigatória a cada sessão)
function show(id) { for (const s of document.querySelectorAll('.screen')) s.classList.add('hidden'); if (id) $(id).classList.remove('hidden'); }
function waitClick(...ids) {
  return new Promise((resolve) => {
    const handlers = ids.map((id) => { const h = () => { cleanup(); resolve(id); }; $(id).addEventListener('click', h); return [id, h]; });
    function cleanup() { handlers.forEach(([id, h]) => $(id).removeEventListener('click', h)); }
  });
}

async function runCalibration() {
  show('calib');
  $('calibText').innerHTML = 'Deixe o ambiente como ele normalmente está. Não precisa fazer silêncio agora: o jogo está aprendendo como é o <b>seu</b> “normal”.<br><small>Com fones de ouvido, os sons do jogo não atrapalham o microfone.</small>';
  $('calibCount').textContent = '16';
  $('btnCalibGo').classList.remove('hidden');
  $('btnCalibGo').textContent = 'Começar calibração';
  await waitClick('btnCalibGo');
  $('btnCalibGo').classList.add('hidden');
  const total = 16;
  await calibrate(total, (k, db) => {
    $('calibCount').textContent = Math.max(0, Math.ceil(total * (1 - k)));
    $('calibFill').style.width = Math.max(0, Math.min(100, (db + 80) * 1.6)) + '%';
  });
  Sensor.sensitivity = settings.sensitivity;
  applyThresholds();
  $('calibCount').textContent = '✓';
  $('calibText').innerHTML = `Pronto. Seu limiar pessoal ficou <b>${(Sensor.threshold - Sensor.baseline).toFixed(1)} dB</b> acima do seu ambiente.<br>Fique abaixo dele por ${RES_ENTER_DELAY} segundos para entrar na Resonance.`;
  $('btnCalibGo').textContent = 'Continuar';
  $('btnCalibGo').classList.remove('hidden');
  await waitClick('btnCalibGo');
}

async function sessionStart() {
  if (settings.micMode == null) {
    show('micIntro');
    const c = await waitClick('btnUseMic', 'btnUseStandard');
    settings.micMode = c === 'btnUseMic' ? 'mic' : 'standard';
    saveSettings(settings);
  }
  if (settings.micMode === 'mic' && !Sensor.available) {
    try { await enableMic(); } catch (e) {
      toast('Não foi possível usar o microfone. Jogando no modo Standard.');
      settings.micMode = 'standard';
      saveSettings(settings);
    }
  }
  if (settings.micMode === 'mic') {
    if (!game.sessionReady || !Sensor.calibrated) await runCalibration();
  } else {
    Sensor.mode = 'standard';
    if (!game.sessionReady) { show('standardIntro'); await waitClick('btnStandardGo'); }
  }
  game.sessionReady = true;
  $('btnNoise').classList.toggle('hidden', Sensor.mode !== 'standard');
}

async function startPlaying(fromSave) {
  ensureAudio();
  setAmbient('apartment');
  await sessionStart();
  show(null);
  $('hud').classList.remove('hidden');
  if (isTouch) $('touchUI').classList.remove('hidden');
  game.state = 'playing';
  requestLock();
  if (settings.gyro) enableGyro();
  await goZone(fromSave ? S.zone : 'apartment', null, fromSave);
}

// ---------------------------------------------------------------------
//  Menus
$('btnNew').addEventListener('click', () => {
  ensureAudio();
  if (latestSave() && !window.confirm('Começar um novo jogo? O progresso salvo será substituído.')) return;
  setState(freshState());
  startPlaying(false);
});
$('btnContinue').addEventListener('click', () => {
  const s = latestSave();
  if (!s) return;
  ensureAudio();
  setState(Object.assign(freshState(), s));
  startPlaying(true);
});
function toTitle() {
  game.state = 'title';
  releaseLock();
  $('hud').classList.add('hidden');
  $('touchUI').classList.add('hidden');
  $('puzzle').classList.add('hidden');
  show('title');
  $('btnContinue').classList.toggle('hidden', !latestSave());
  buildTitleBackdrop();
}
function pause() {
  if (game.state !== 'playing' || UI.dialogOpen) return;
  game.state = 'paused';
  releaseLock();
  $('saveInfo').textContent = `Saves manuais restantes: ${S.manualLeft}/${MANUAL_SAVES}. O jogo também salva sozinho ao entrar em cada zona.`;
  $('btnRecalib').classList.toggle('hidden', Sensor.mode !== 'mic');
  show('pause');
}
function resume() { show(null); game.state = 'playing'; requestLock(); }
hooks.onPause = () => (game.state === 'playing' ? pause() : game.state === 'paused' ? resume() : null);
hooks.onDiary = () => (game.state === 'playing' ? openDiary() : game.state === 'diary' ? closeDiary() : null);
hooks.isPlaying = () => game.state === 'playing';
$('btnPause').addEventListener('click', pause);
$('btnResume').addEventListener('click', resume);
$('btnToTitle').addEventListener('click', () => { autoSave(checkpoint()); toTitle(); });
$('btnSave').addEventListener('click', () => {
  if (manualSave(checkpoint())) { $('saveInfo').textContent = `Jogo salvo. Saves manuais restantes: ${S.manualLeft}/${MANUAL_SAVES}.`; sfx.diary(); }
  else $('saveInfo').textContent = 'Você não tem mais saves manuais. O save automático continua funcionando.';
});
$('btnRecalib').addEventListener('click', async () => { await runCalibration(); show('pause'); });
document.addEventListener('visibilitychange', () => { if (document.hidden) pause(); });

function openDiary() {
  if (game.state !== 'playing' || UI.dialogOpen) return;
  game.state = 'diary';
  releaseLock();
  renderDiary(S, game.diaryTab);
  show('diary');
}
function closeDiary() { show(null); game.state = 'playing'; requestLock(); }
$('btnDiary').addEventListener('click', openDiary);
$('btnDiaryClose').addEventListener('click', closeDiary);
document.querySelectorAll('#diaryTabs button').forEach((b) => b.addEventListener('click', () => { game.diaryTab = b.dataset.tab; renderDiary(S, game.diaryTab); }));

// ---------------------------------------------------------------------
//  Configurações
let settingsReturn = 'title';
function openSettings(from) {
  settingsReturn = from;
  $('setMode').value = settings.micMode || 'mic';
  $('setSens').value = settings.sensitivity;
  $('setCam').value = settings.camSens;
  $('setInvert').checked = settings.invertY;
  $('setGyro').checked = settings.gyro;
  $('setSubs').checked = settings.subtitles;
  $('setSubSize').value = settings.subSize;
  $('setSwap').checked = settings.swap;
  $('setQuality').value = settings.quality || (isTouch ? 'medium' : 'high');
  show('settings');
}
function applySettings() {
  Sensor.sensitivity = settings.sensitivity;
  if (Sensor.calibrated) applyThresholds();
  document.documentElement.style.setProperty('--sub', settings.subSize);
  document.body.classList.toggle('swap', !!settings.swap);
  resetJoy();
}
$('btnSettingsT').addEventListener('click', () => openSettings('title'));
$('btnSettingsP').addEventListener('click', () => openSettings('pause'));
for (const [id, key, kind] of [['setSens', 'sensitivity', 'num'], ['setCam', 'camSens', 'num'], ['setInvert', 'invertY', 'bool'], ['setGyro', 'gyro', 'bool'], ['setSubs', 'subtitles', 'bool'], ['setSubSize', 'subSize', 'num'], ['setSwap', 'swap', 'bool']]) {
  $(id).addEventListener('input', () => {
    settings[key] = kind === 'bool' ? $(id).checked : parseFloat($(id).value);
    if (key === 'gyro' && settings.gyro) enableGyro();
    applySettings();
    saveSettings(settings);
  });
}
$('setMode').addEventListener('change', () => { settings.micMode = $('setMode').value; saveSettings(settings); });
$('setQuality').addEventListener('change', () => { settings.quality = $('setQuality').value; saveSettings(settings); setQuality(settings.quality); });
$('btnSettingsClose').addEventListener('click', async () => {
  // troca de modo: desligar o microfone é imediato; ligar exige permissão + calibração
  if (settings.micMode === 'standard' && Sensor.mode === 'mic') { disableMic(); toast('Microfone desligado. Modo Standard ativo.'); }
  if (settings.micMode === 'mic' && Sensor.mode !== 'mic' && game.sessionReady) {
    try { await enableMic(); await runCalibration(); } catch (e) { toast('Permissão de microfone negada. Continuando no modo Standard.'); settings.micMode = 'standard'; saveSettings(settings); }
  }
  $('btnNoise').classList.toggle('hidden', Sensor.mode !== 'standard');
  show(settingsReturn);
  if (settingsReturn === 'pause') $('btnRecalib').classList.toggle('hidden', Sensor.mode !== 'mic');
});

// Picos de ruído (reais ou do botão) → zona atual
onPeak((s) => { for (const h of Z.peakHandlers) h(s); });

// ---------------------------------------------------------------------
//  Fundo da tela de título: o bairro à noite
function buildTitleBackdrop() {
  resetZone();
  clearWorld();
  const save = S;
  setState(freshState());
  Z.palette = hub.palette;
  zoneInfo = hub.build({ ...ctx, thought() {}, save() {} });
  mergeStatic(world.group);
  setBackground('sky');
  setState(save);
  if (player.model) player.model.root.visible = false;
  setObjective('');
}

// ---------------------------------------------------------------------
//  Loop
const clock = new THREE.Clock();
let elapsed = 0;
let lastState = null;
let wasRes = false;
const fwd = new THREE.Vector3();
function tick() {
  requestAnimationFrame(tick);
  const dt = Math.min(clock.getDelta(), 0.05);
  elapsed += dt;
  if (game.state === 'playing' && !game.transitioning) frame(dt);
  else if (game.state === 'title') {
    const a = elapsed * 0.05;
    camera.position.set(Math.cos(a) * 17, 4.5, Math.sin(a) * 17);
    camera.lookAt(0, 2.2, 0);
    const R = (Math.sin(elapsed * 0.4) * 0.5 + 0.5) ** 3;
    applyPalette(hub.palette, R);
    mixResonance(R * 0.6);
    updateSystems(dt, R);
    $('resOverlay').style.opacity = (R * 0.8).toFixed(2);
    moon.position.set(30, 50, 20);
    moon.target.position.set(0, 0, 0);
  }
  render();
}

function frame(dt) {
  S.stats.playTime += dt;
  player.frozen = UI.dialogOpen || !!player.puzzleLock;
  document.body.classList.toggle('talking', UI.dialogOpen);
  const changed = updateSensor(dt, { speed: player.speed, sprinting: player.sprinting, crouch: player.crouch, frozen: player.frozen });
  const R = Sensor.R;
  if (changed === 'silence') {
    sfx.enterRes();
    if (!game.firstRes) { game.firstRes = true; toast('Resonance: o mundo revela a camada oculta enquanto houver silêncio.'); }
  }
  mixResonance(R);
  applyPalette(Z.palette, R);
  $('resOverlay').style.opacity = (R * 0.9).toFixed(2);

  updatePlayer(dt);
  updateSystems(dt, R);
  game.shake = Math.max(0, game.shake - dt);
  updateCamera(dt, game.shake * 0.5);
  camera.getWorldDirection(fwd);
  setListener(camera.position, fwd);
  moon.position.set(player.pos.x + 18, 40, player.pos.z + 12);
  moon.target.position.copy(player.pos);

  // interação
  const it = !UI.dialogOpen && !Z.busy && !player.puzzleLock ? findInteractable(R) : null;
  const btn = $('btnInteract');
  btn.classList.toggle('ready', !!it);
  btn.classList.toggle('res', !!it && it.layer === 'res');
  $('interactLabel').textContent = it ? it.label : 'Interagir';
  const hint = $('interactHint');
  hint.classList.toggle('hidden', !it || isTouch);
  if (it) { hint.textContent = `[E] ${it.label}`; hint.classList.toggle('res', it.layer === 'res'); }
  // a mesma tecla que fecha um diálogo não deve reabrir outro
  let use = input.interact && performance.now() - UI.lastClose > 350 ? it : null;
  if (!use && input.tap && !UI.dialogOpen && !Z.busy) use = tapInteractable(input.tap, R);
  if (use) {
    Z.busy = true;
    Promise.resolve(use.onUse()).finally(() => { Z.busy = false; });
  }
  if (input.noise) {
    if (Sensor.mode === 'standard') { virtualClap(); sfx.clap(); }
    else toast('No modo microfone, faça barulho de verdade: palma ou voz.');
  }
  input.interact = false; input.noise = false; input.tap = null;

  // HUD da Resonance
  const mv = meterValues();
  $('resFill').style.width = (mv.v * 100).toFixed(1) + '%';
  $('resFill').classList.toggle('over', mv.over);
  $('resThresh').style.left = (mv.th * 100).toFixed(1) + '%';
  $('resBufFill').style.width = (Sensor.state === 'silence' ? 100 : Math.min(1, Sensor.quietT / RES_ENTER_DELAY) * 100).toFixed(0) + '%';
  const label = Sensor.state === 'silence' ? 'Resonance' : Sensor.state === 'noise' ? 'Ruído' : Sensor.quietT > 0.2 ? 'Silenciando…' : (Sensor.mode === 'mic' ? 'Microfone' : 'Standard');
  if (label !== lastState) {
    lastState = label;
    $('resLabel').textContent = label;
    $('resLabel').className = Sensor.state === 'silence' ? 'res' : Sensor.state === 'noise' ? 'noise' : '';
  }
  // progresso do eco
  const listening = Z.echoes.find((e) => e.near && !e.done);
  $('echoProgress').classList.toggle('hidden', !listening);
  if (listening) $('echoRing').style.strokeDashoffset = (106.8 * (1 - listening.progress / listening.hold)).toFixed(1);
  wasRes = R > 0.5;
}

// ---------------------------------------------------------------------
//  Boot: carrega modelos e texturas, depois mostra o título
(async function boot() {
  show('loading');
  tick();
  try {
    await loadAssets((k) => { $('loadFill').style.width = Math.round(k * 100) + '%'; });
  } catch (e) {
    $('loadText').textContent = 'Erro ao carregar: ' + e.message;
    throw e;
  }
  setupEnvironment();
  setQuality(settings.quality || (isTouch ? 'medium' : 'high'));
  initPlayerModel();
  toTitle();
  fade(0, 1200);
})();

window.__echoes = { S: () => S, Sensor, player, cam, Z, game, input, sim: (sec) => { for (let t = 0; t < sec; t += 1 / 30) { scene.updateMatrixWorld(); frame(1 / 30); } } };
